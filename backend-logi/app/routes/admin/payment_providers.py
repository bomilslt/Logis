"""
Routes Admin - Configuration des Providers de Paiement du Tenant
================================================================

Permet à l'admin du tenant de configurer ses propres providers de paiement
(Orange Money, MTN MoMo, Stripe, Flutterwave, CinetPay, Monetbil).

Nécessite la feature 'online_payments' dans le plan d'abonnement.
"""

from flask import request, jsonify, g
from app.routes.admin import admin_bp
from app.utils.decorators import admin_required
from app.models import TenantPaymentProvider, TENANT_PROVIDER_TEMPLATES
from app.services.enforcement_service import EnforcementService
from app import db
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


def _check_online_payments_feature(tenant_id):
    """Vérifie que le tenant a la feature online_payments dans son plan"""
    result = EnforcementService.check_feature(tenant_id, 'online_payments')
    return result.get('allowed', False)


@admin_bp.route('/payment-providers', methods=['GET'])
@admin_required
def list_tenant_payment_providers():
    """Liste les providers de paiement configurés pour ce tenant"""
    tenant_id = g.tenant_id
    
    if not _check_online_payments_feature(tenant_id):
        return jsonify({
            'error': 'Paiement en ligne non disponible',
            'message': 'Votre plan ne permet pas les paiements en ligne. Contactez le support pour upgrader.'
        }), 403
    
    providers = TenantPaymentProvider.query.filter_by(
        tenant_id=tenant_id
    ).order_by(TenantPaymentProvider.display_order).all()
    
    result = []
    for p in providers:
        data = p.to_dict(include_credentials=True)
        if p.provider_code in TENANT_PROVIDER_TEMPLATES:
            data['template'] = TENANT_PROVIDER_TEMPLATES[p.provider_code]
        result.append(data)
    
    return jsonify(result)


@admin_bp.route('/payment-providers/templates', methods=['GET'])
@admin_required
def get_tenant_provider_templates():
    """Retourne les templates des providers disponibles pour les tenants"""
    tenant_id = g.tenant_id
    
    if not _check_online_payments_feature(tenant_id):
        return jsonify({
            'error': 'Paiement en ligne non disponible',
            'message': 'Votre plan ne permet pas les paiements en ligne.'
        }), 403
    
    return jsonify(TENANT_PROVIDER_TEMPLATES)


@admin_bp.route('/payment-providers/<provider_code>', methods=['PUT'])
@admin_required
def configure_tenant_payment_provider(provider_code):
    """
    Configure ou met à jour un provider de paiement pour ce tenant
    
    Body:
        - credentials: Object avec les clés API
        - config: Configuration spécifique
        - is_enabled: Activer/désactiver
        - is_test_mode: Mode test/production
    """
    tenant_id = g.tenant_id
    
    if not _check_online_payments_feature(tenant_id):
        return jsonify({
            'error': 'Paiement en ligne non disponible',
            'message': 'Votre plan ne permet pas les paiements en ligne.'
        }), 403
    
    if provider_code not in TENANT_PROVIDER_TEMPLATES:
        return jsonify({'error': 'Provider non supporté'}), 400
    
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Données JSON requises'}), 400
    
    template = TENANT_PROVIDER_TEMPLATES[provider_code]
    
    # Récupérer ou créer le provider
    provider = TenantPaymentProvider.query.filter_by(
        tenant_id=tenant_id,
        provider_code=provider_code
    ).first()
    
    if not provider:
        provider = TenantPaymentProvider(
            tenant_id=tenant_id,
            provider_code=provider_code
        )
        db.session.add(provider)
    
    # Mettre à jour les credentials
    if 'credentials' in data:
        for key, schema in template['credentials_schema'].items():
            if schema.get('required') and not data['credentials'].get(key):
                return jsonify({'error': f'Credential requis: {schema.get("label", key)}'}), 400
        
        provider.credentials = data['credentials']
    
    # Mettre à jour la config
    if 'config' in data:
        provider.config = data['config']
    
    # Statut
    if 'is_enabled' in data:
        # Vérifier que les credentials sont configurés avant d'activer
        if data['is_enabled'] and not provider.credentials:
            return jsonify({'error': 'Configurez les credentials avant d\'activer'}), 400
        provider.is_enabled = data['is_enabled']
    if 'is_test_mode' in data:
        provider.is_test_mode = data['is_test_mode']
    if 'display_order' in data:
        provider.display_order = data['display_order']
    
    db.session.commit()
    
    logger.info(f"Tenant payment provider configured: {provider_code} for tenant {tenant_id}")
    
    result = provider.to_dict(include_credentials=True)
    if provider_code in TENANT_PROVIDER_TEMPLATES:
        result['template'] = TENANT_PROVIDER_TEMPLATES[provider_code]
    
    return jsonify(result)


@admin_bp.route('/payment-providers/<provider_code>/toggle', methods=['POST'])
@admin_required
def toggle_tenant_payment_provider(provider_code):
    """Active ou désactive un provider pour ce tenant"""
    tenant_id = g.tenant_id
    
    if not _check_online_payments_feature(tenant_id):
        return jsonify({'error': 'Paiement en ligne non disponible'}), 403
    
    provider = TenantPaymentProvider.query.filter_by(
        tenant_id=tenant_id,
        provider_code=provider_code
    ).first()
    
    if not provider:
        return jsonify({'error': 'Provider non configuré'}), 404
    
    if not provider.is_enabled and not provider.credentials:
        return jsonify({'error': 'Configurez les credentials avant d\'activer'}), 400
    
    provider.is_enabled = not provider.is_enabled
    db.session.commit()
    
    status = 'activé' if provider.is_enabled else 'désactivé'
    logger.info(f"Tenant payment provider {status}: {provider_code} for tenant {tenant_id}")
    
    return jsonify({
        'message': f'Provider {status}',
        'is_enabled': provider.is_enabled
    })


@admin_bp.route('/payment-providers/<provider_code>', methods=['DELETE'])
@admin_required
def delete_tenant_payment_provider(provider_code):
    """Supprime la configuration d'un provider pour ce tenant"""
    tenant_id = g.tenant_id
    
    provider = TenantPaymentProvider.query.filter_by(
        tenant_id=tenant_id,
        provider_code=provider_code
    ).first()
    
    if not provider:
        return jsonify({'error': 'Provider non configuré'}), 404
    
    db.session.delete(provider)
    db.session.commit()
    
    logger.info(f"Tenant payment provider deleted: {provider_code} for tenant {tenant_id}")
    
    return jsonify({'message': 'Provider supprimé'})


@admin_bp.route('/payment-providers/enabled', methods=['GET'])
@admin_required
def get_tenant_enabled_providers():
    """
    Liste publique des providers activés pour ce tenant.
    Utilisé par le frontend client pour afficher les options de paiement.
    """
    tenant_id = g.tenant_id
    
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
