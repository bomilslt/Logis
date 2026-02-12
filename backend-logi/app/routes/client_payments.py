"""
Routes Client - Paiement en ligne des colis
=============================================

Permet aux clients de payer leurs colis en ligne via les providers
configurés par leur tenant (Orange Money, MTN MoMo, Stripe, etc.).

Flux:
1. Client GET /api/payments/providers → liste des providers activés
2. Client POST /api/payments/initiate → initialise le paiement
3. Client redirigé vers le provider (ou USSD push pour MTN MoMo)
4. Provider callback/webhook → confirme le paiement
5. Client GET /api/payments/<id>/status → vérifie le statut
"""

from flask import Blueprint, request, jsonify, g
from flask_jwt_extended import get_jwt_identity
from app import db
from app.models import (
    Package, Payment, PackagePayment, TenantPaymentProvider,
    TENANT_PROVIDER_TEMPLATES, Tenant, User
)
from app.services.payment_gateway_service import payment_gateway
from app.services.enforcement_service import EnforcementService
from app.utils.decorators import tenant_required
from datetime import datetime
import uuid
import logging

client_payments_bp = Blueprint('client_payments', __name__)
logger = logging.getLogger(__name__)


# ==================== HELPERS ====================

def _check_tenant_online_payments(tenant_id):
    """Vérifie que le tenant a la feature online_payments"""
    result = EnforcementService.check_feature(tenant_id, 'online_payments')
    return result.get('allowed', False)


def _get_or_create_online_payment(
    tenant_id, client_id, provider_code, amount, currency,
    package_ids, provider_payment_id, description=None
):
    """
    Crée un Payment + PackagePayment pour un paiement en ligne.
    Le Payment est créé avec status='pending' et method='online_{provider}'.
    """
    payment = Payment(
        tenant_id=tenant_id,
        client_id=client_id,
        amount=amount,
        currency=currency,
        method=f'online_{provider_code}',
        reference=provider_payment_id,
        notes=description or f'Paiement en ligne via {provider_code}',
        status='pending'
    )
    db.session.add(payment)
    db.session.flush()
    
    # Lier aux colis — distribuer le montant total sur chaque colis
    amount_left = float(amount)
    for pkg_id in package_ids:
        if amount_left <= 0:
            break
        pkg = Package.query.filter_by(id=pkg_id, tenant_id=tenant_id).first()
        if pkg:
            remaining = float(pkg.remaining_amount or pkg.amount or 0)
            pkg_share = min(amount_left, remaining)
            pp = PackagePayment(
                payment_id=payment.id,
                package_id=pkg_id,
                amount=pkg_share
            )
            db.session.add(pp)
            amount_left -= pkg_share
    
    db.session.commit()
    return payment


# ==================== ROUTES ====================

@client_payments_bp.route('/providers', methods=['GET'])
@tenant_required
def get_available_providers():
    """
    Liste les providers de paiement activés pour ce tenant.
    Le client utilise cette liste pour choisir comment payer.
    """
    tenant_id = g.tenant_id
    
    if not _check_tenant_online_payments(tenant_id):
        return jsonify([])
    
    providers = TenantPaymentProvider.query.filter_by(
        tenant_id=tenant_id,
        is_enabled=True
    ).order_by(TenantPaymentProvider.display_order).all()
    
    return jsonify([{
        'code': p.provider_code,
        'name': TENANT_PROVIDER_TEMPLATES.get(p.provider_code, {}).get('name', p.provider_code),
        'methods': TENANT_PROVIDER_TEMPLATES.get(p.provider_code, {}).get('supported_methods', []),
        'currencies': TENANT_PROVIDER_TEMPLATES.get(p.provider_code, {}).get('supported_currencies', []),
        'icon': TENANT_PROVIDER_TEMPLATES.get(p.provider_code, {}).get('icon', ''),
        'payment_type': 'ussd_push' if p.provider_code == 'mtn_momo' else 'redirect'
    } for p in providers])


@client_payments_bp.route('/initiate', methods=['POST'])
@tenant_required
def initiate_payment():
    """
    Initialise un paiement en ligne pour un ou plusieurs colis.
    
    Body:
        - provider: Code du provider (orange_money, mtn_momo, stripe, etc.)
        - package_ids: Liste des IDs de colis à payer
        - currency: Devise (XAF, XOF, USD)
        - return_url: URL de retour après paiement (optionnel)
        - phone: Numéro de téléphone (requis pour MTN MoMo)
    
    Returns:
        - payment_id: ID du paiement local
        - payment_url: URL de redirection (null pour USSD push)
        - payment_type: 'redirect' ou 'ussd_push'
        - provider_payment_id: ID du paiement chez le provider
    """
    user_id = get_jwt_identity()
    tenant_id = g.tenant_id
    
    if not _check_tenant_online_payments(tenant_id):
        return jsonify({
            'error': 'Paiement en ligne non disponible',
            'message': 'Ce service ne propose pas le paiement en ligne.'
        }), 403
    
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Données JSON requises'}), 400
    
    provider_code = data.get('provider')
    package_ids = data.get('package_ids', [])
    currency = data.get('currency', 'XAF')
    return_url = data.get('return_url')
    phone = data.get('phone')
    
    # Validations
    if not provider_code:
        return jsonify({'error': 'Provider requis'}), 400
    
    if not package_ids:
        return jsonify({'error': 'Au moins un colis requis'}), 400
    
    if len(package_ids) > 50:
        return jsonify({'error': 'Maximum 50 colis par paiement'}), 400
    
    # Vérifier que le provider est activé pour ce tenant
    tenant_provider = TenantPaymentProvider.query.filter_by(
        tenant_id=tenant_id,
        provider_code=provider_code,
        is_enabled=True
    ).first()
    
    if not tenant_provider:
        return jsonify({'error': f'Provider {provider_code} non disponible'}), 400
    
    # Vérifier la devise
    template = TENANT_PROVIDER_TEMPLATES.get(provider_code, {})
    supported_currencies = template.get('supported_currencies', [])
    if supported_currencies and currency not in supported_currencies:
        return jsonify({
            'error': f'Devise {currency} non supportée par {provider_code}',
            'supported_currencies': supported_currencies
        }), 400
    
    # MTN MoMo nécessite un numéro de téléphone
    if provider_code == 'mtn_momo' and not phone:
        return jsonify({'error': 'Numéro de téléphone requis pour MTN MoMo'}), 400
    
    # Récupérer les colis et calculer le montant total
    user = User.query.get(user_id)
    packages = []
    total_amount = 0
    
    for pkg_id in package_ids:
        pkg = Package.query.filter_by(
            id=pkg_id,
            tenant_id=tenant_id,
            client_id=user_id
        ).first()
        
        if not pkg:
            return jsonify({'error': f'Colis {pkg_id} non trouvé'}), 404
        
        remaining = float(pkg.remaining_amount or pkg.amount or 0)
        if remaining <= 0:
            return jsonify({'error': f'Colis {pkg.tracking_number} déjà payé'}), 400
        
        packages.append(pkg)
        total_amount += remaining
    
    if total_amount <= 0:
        return jsonify({'error': 'Montant total invalide'}), 400
    
    # Construire la description
    if len(packages) == 1:
        description = f'Paiement colis {packages[0].tracking_number}'
    else:
        trackings = ', '.join([p.tracking_number for p in packages[:3]])
        if len(packages) > 3:
            trackings += f' +{len(packages) - 3}'
        description = f'Paiement {len(packages)} colis: {trackings}'
    
    # Construire le callback URL pour les webhooks
    tenant = Tenant.query.get(tenant_id)
    base_url = request.host_url.rstrip('/')
    callback_url = f'{base_url}/api/payments/webhook/{tenant.slug}/{provider_code}'
    
    # Metadata pour le provider
    metadata = {
        'tenant_id': tenant_id,
        'client_id': user_id,
        'package_ids': ','.join(package_ids),
        'type': 'package_payment'
    }
    if phone:
        metadata['phone'] = phone
    
    try:
        # Initialiser le paiement via le provider
        result = payment_gateway.initialize_tenant_payment(
            tenant_id=tenant_id,
            provider=provider_code,
            amount=total_amount,
            currency=currency,
            customer_email=user.email if user else 'client@example.com',
            customer_name=user.full_name if user else None,
            description=description,
            metadata=metadata,
            callback_url=callback_url,
            return_url=return_url
        )
        
        if not result.get('success'):
            return jsonify({
                'error': 'Erreur lors de l\'initialisation du paiement',
                'details': result.get('error')
            }), 500
        
        # Créer le Payment local en status pending
        provider_payment_id = result.get('payment_id', '')
        payment = _get_or_create_online_payment(
            tenant_id=tenant_id,
            client_id=user_id,
            provider_code=provider_code,
            amount=total_amount,
            currency=currency,
            package_ids=package_ids,
            provider_payment_id=provider_payment_id,
            description=description
        )
        
        logger.info(
            f"Payment initiated: {payment.id} via {provider_code} "
            f"for {total_amount} {currency} ({len(packages)} packages)"
        )
        
        return jsonify({
            'payment_id': payment.id,
            'provider_payment_id': provider_payment_id,
            'payment_url': result.get('payment_url'),
            'payment_type': result.get('payment_type', 'redirect'),
            'message': result.get('message'),
            'amount': total_amount,
            'currency': currency,
            'provider': provider_code
        }), 201
        
    except Exception as e:
        db.session.rollback()
        logger.exception(f"Payment initiation error: {e}")
        return jsonify({'error': 'Erreur lors de l\'initialisation du paiement'}), 500


@client_payments_bp.route('/<payment_id>/status', methods=['GET'])
@tenant_required
def check_payment_status(payment_id):
    """
    Vérifie le statut d'un paiement.
    
    Utile pour:
    - Les flux USSD push (MTN MoMo) où le client doit poller
    - Vérifier après retour de la page de paiement
    """
    user_id = get_jwt_identity()
    tenant_id = g.tenant_id
    
    payment = Payment.query.filter_by(
        id=payment_id,
        tenant_id=tenant_id,
        client_id=user_id
    ).first()
    
    if not payment:
        return jsonify({'error': 'Paiement non trouvé'}), 404
    
    # Si déjà confirmé ou annulé, retourner directement
    if payment.status in ['confirmed', 'cancelled']:
        return jsonify({
            'payment_id': payment.id,
            'status': payment.status,
            'amount': payment.amount,
            'currency': payment.currency,
            'method': payment.method
        })
    
    # Si pending, vérifier auprès du provider
    if payment.status == 'pending' and payment.reference:
        provider_code = payment.method.replace('online_', '') if payment.method.startswith('online_') else None
        
        if provider_code:
            try:
                verify_result = payment_gateway.verify_tenant_payment(
                    tenant_id=tenant_id,
                    provider=provider_code,
                    payment_id=payment.reference
                )
                
                if verify_result.get('success') and verify_result.get('status') == 'completed':
                    _complete_package_payment(payment, verify_result)
                elif verify_result.get('status') in ['failed', 'cancelled']:
                    payment.status = 'cancelled'
                    payment.notes = (payment.notes or '') + f'\nÉchec: {verify_result.get("error", "")}'
                    db.session.commit()
                    
            except Exception as e:
                logger.error(f"Payment verification error: {e}")
    
    return jsonify({
        'payment_id': payment.id,
        'status': payment.status,
        'amount': payment.amount,
        'currency': payment.currency,
        'method': payment.method
    })


@client_payments_bp.route('/history', methods=['GET'])
@tenant_required
def get_payment_history():
    """Liste l'historique des paiements en ligne du client"""
    user_id = get_jwt_identity()
    tenant_id = g.tenant_id
    
    page = request.args.get('page', 1, type=int)
    per_page = min(request.args.get('per_page', 20, type=int), 100)
    
    query = Payment.query.filter_by(
        tenant_id=tenant_id,
        client_id=user_id
    ).filter(
        Payment.method.like('online_%')
    ).order_by(Payment.created_at.desc())
    
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)
    
    return jsonify({
        'payments': [p.to_dict(include_packages=True) for p in pagination.items],
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': page
    })


# ==================== WEBHOOK HANDLER ====================

@client_payments_bp.route('/webhook/<tenant_slug>/<provider_code>', methods=['POST'])
def package_payment_webhook(tenant_slug, provider_code):
    """
    Webhook pour les paiements de colis.
    
    Appelé par les providers de paiement après confirmation.
    Public (pas d'auth JWT) mais vérifié par signature provider.
    """
    tenant = Tenant.query.filter_by(slug=tenant_slug, is_active=True).first()
    if not tenant:
        return jsonify({'error': 'Tenant not found'}), 404
    
    tenant_id = tenant.id
    
    # Vérifier la signature du webhook
    payload = request.data
    signature = (
        request.headers.get('Stripe-Signature') or
        request.headers.get('verif-hash') or
        request.headers.get('X-Webhook-Signature') or
        request.headers.get('X-Signature') or
        ''
    )
    
    if not payment_gateway.verify_tenant_webhook(tenant_id, provider_code, payload, signature):
        logger.warning(f"Package payment webhook: invalid signature for {provider_code}/{tenant_slug}")
        return jsonify({'error': 'Invalid signature'}), 401
    
    try:
        # Parser les données du webhook
        if request.is_json:
            data = request.get_json()
        else:
            data = request.form.to_dict()
        
        logger.info(f"Package payment webhook received: {provider_code} for {tenant_slug}")
        
        # Extraire l'ID de paiement selon le provider
        provider_payment_id = _extract_payment_id(provider_code, data)
        
        if not provider_payment_id:
            return jsonify({'error': 'Missing payment reference'}), 400
        
        # Trouver le Payment local
        payment = Payment.query.filter_by(
            tenant_id=tenant_id,
            reference=provider_payment_id,
            status='pending'
        ).first()
        
        if not payment:
            logger.warning(f"Package payment not found: {provider_payment_id}")
            return jsonify({'message': 'Payment not found'}), 404
        
        # Vérifier auprès du provider (ne pas se fier uniquement au webhook)
        verify_result = payment_gateway.verify_tenant_payment(
            tenant_id=tenant_id,
            provider=provider_code,
            payment_id=provider_payment_id
        )
        
        if verify_result.get('success') and verify_result.get('status') == 'completed':
            _complete_package_payment(payment, verify_result)
            
            # Stats provider
            payment_gateway.record_tenant_payment_completed(
                tenant_id=tenant_id,
                provider_code=provider_code,
                amount=payment.amount
            )
            
            return jsonify({'message': 'Payment completed'})
        
        elif verify_result.get('status') in ['failed', 'cancelled']:
            payment.status = 'cancelled'
            payment.notes = (payment.notes or '') + f'\nÉchec: {verify_result.get("error", "")}'
            db.session.commit()
            return jsonify({'message': 'Payment failed recorded'})
        
        return jsonify({'message': 'Payment still pending'})
        
    except Exception as e:
        logger.exception(f"Package payment webhook error: {e}")
        return jsonify({'error': str(e)}), 500


# ==================== INTERNAL HELPERS ====================

def _extract_payment_id(provider_code, data):
    """Extrait l'ID de paiement depuis les données du webhook selon le provider"""
    if provider_code == 'stripe':
        obj = data.get('data', {}).get('object', {})
        return obj.get('id') or obj.get('payment_intent')
    
    elif provider_code == 'flutterwave':
        return data.get('data', {}).get('tx_ref') or data.get('txRef')
    
    elif provider_code == 'cinetpay':
        return data.get('cpm_trans_id') or data.get('transaction_id')
    
    elif provider_code == 'monetbil':
        return data.get('payment_ref') or data.get('item_ref')
    
    elif provider_code == 'orange_money':
        return data.get('order_id') or data.get('pay_token')
    
    elif provider_code == 'mtn_momo':
        return data.get('externalId') or data.get('referenceId')
    
    return data.get('payment_id') or data.get('reference')


def _complete_package_payment(payment, verify_result=None):
    """
    Confirme un paiement de colis et met à jour les montants payés.
    
    Note: Package.payment_status est une propriété calculée à partir de
    paid_amount et amount — pas besoin de la setter manuellement.
    """
    if payment.status == 'confirmed':
        return
    
    payment.status = 'confirmed'
    
    # Mettre à jour les montants payés sur chaque colis
    for pp in payment.package_payments.all():
        pkg = pp.package
        if pkg and pp.amount:
            current_paid = float(pkg.paid_amount or 0)
            pp_amount = float(pp.amount)
            max_payable = float(pkg.amount or 0) - current_paid
            pkg.paid_amount = current_paid + min(pp_amount, max(0, max_payable))
    
    db.session.commit()
    
    logger.info(f"Package payment completed: {payment.id} ({payment.amount} {payment.currency})")
