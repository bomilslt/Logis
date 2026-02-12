"""
Routes Webhooks Paiement Abonnement
====================================

Endpoints pour recevoir les notifications de paiement des providers:
- Stripe
- Flutterwave  
- CinetPay
- Monetbil

Ces webhooks sont publics (pas d'auth JWT) mais protégés par signature.
"""

from flask import Blueprint, request, jsonify
from app import db
from app.models import SubscriptionPayment, Subscription, Tenant
from app.models.platform_config import CurrencyRate
from app.services.payment_gateway_service import payment_gateway
from datetime import datetime, timedelta
import logging
import json
from decimal import Decimal, ROUND_HALF_UP

subscription_webhooks_bp = Blueprint('subscription_webhooks', __name__)
logger = logging.getLogger(__name__)


# ==================== HELPERS ====================

def get_fx_rate(currency: str) -> float:
    """
    Récupère le taux de change vers XAF pour une devise.
    
    Args:
        currency: Code devise (XAF, XOF, USD, EUR)
        
    Returns:
        Taux de conversion vers XAF (1 unite = X XAF)
    """
    if currency == 'XAF':
        return 1.0
    
    rate = CurrencyRate.query.filter_by(currency=currency).first()
    
    if rate:
        return float(rate.rate_to_xaf)
    
    # Taux par défaut si non configuré
    default_rates = {
        'XOF': 1.0,      # XOF = XAF (parité CEMAC/UEMOA)
        'USD': 600.0,    # 1 USD ≈ 600 XAF
        'EUR': 656.0,    # 1 EUR = 655.957 XAF (parité fixe)
    }

    if currency in default_rates:
        return float(default_rates[currency])

    raise ValueError(f'FX rate missing for currency {currency}')


def calculate_amount_xaf(amount: float, currency: str) -> tuple:
    """
    Calcule le montant en XAF avec le taux de change actuel.
    
    Args:
        amount: Montant dans la devise d'origine
        currency: Code devise
        
    Returns:
        tuple (fx_rate, amount_xaf)
    """
    fx_rate = Decimal(str(get_fx_rate(currency)))
    amount_dec = Decimal(str(amount))
    amount_xaf = (amount_dec * fx_rate).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    return float(fx_rate), float(amount_xaf)


def complete_subscription_payment(payment: SubscriptionPayment, provider_data: dict = None):
    """
    Finalise un paiement d'abonnement.
    
    - Fige le taux FX et calcule amount_xaf
    - Met à jour le statut
    - Étend la période d'abonnement
    
    Args:
        payment: Instance SubscriptionPayment
        provider_data: Données additionnelles du provider
    """
    if payment.status == 'completed':
        logger.warning(f"Payment {payment.id} already completed")
        return
    
    # Figer le taux FX et calculer amount_xaf
    try:
        fx_rate, amount_xaf = calculate_amount_xaf(payment.amount, payment.currency)
        payment.fx_rate_to_xaf = fx_rate
        payment.amount_xaf = amount_xaf
    except Exception as e:
        fail_subscription_payment(payment, f"FX calculation failed: {e}")
        return

    # Cohérence discount / montants (même si le paiement a été créé sans ces champs)
    subscription = payment.subscription
    discount_percent = float(payment.discount_percent or (subscription.discount_percent if subscription else 0) or 0)
    payment.discount_percent = discount_percent
    payment.gross_amount = float(payment.gross_amount or payment.amount)
    payment.discount_amount = float(
        (Decimal(str(payment.gross_amount)) * Decimal(str(discount_percent)) / Decimal('100'))
        .quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    )
    if not payment.duration_months:
        payment.duration_months = 1
    if not payment.unit_price and payment.duration_months:
        payment.unit_price = float(Decimal(str(payment.gross_amount)) / Decimal(str(payment.duration_months)))
    
    # Mettre à jour le statut
    payment.status = 'completed'
    payment.completed_at = datetime.utcnow()
    
    if provider_data:
        payment.extra_data = payment.extra_data or {}
        payment.extra_data['provider_response'] = provider_data
    
    # Mettre à jour l'abonnement
    if subscription:
        subscription.status = 'active'
        subscription.last_payment_at = datetime.utcnow()
        
        # Calculer les nouvelles dates de période sans perdre le temps restant
        now = datetime.utcnow()
        base_start = subscription.current_period_end if subscription.current_period_end and subscription.current_period_end > now else now
        duration = payment.duration_months or subscription.duration_months or 1
        period_end = base_start + timedelta(days=30 * duration)

        subscription.current_period_start = base_start
        subscription.current_period_end = period_end
        subscription.next_payment_at = period_end
        
    # Stats provider (au moment du paiement confirmé)
    try:
        payment_gateway.record_payment_completed(payment.provider, payment.amount_xaf)
    except Exception as e:
        logger.warning(f"Provider stats update failed: {e}")
    
    db.session.commit()
    
    logger.info(
        f"Payment {payment.id} completed: {payment.amount} {payment.currency} "
        f"(FX: {fx_rate}, XAF: {amount_xaf})"
    )


def fail_subscription_payment(payment: SubscriptionPayment, reason: str = None):
    """Marque un paiement comme échoué"""
    payment.status = 'failed'
    payment.failure_reason = reason
    db.session.commit()
    
    logger.warning(f"Payment {payment.id} failed: {reason}")


def find_payment_by_provider_id(provider: str, provider_payment_id: str) -> SubscriptionPayment:
    """Trouve un paiement par son ID provider"""
    return SubscriptionPayment.query.filter_by(
        provider=provider,
        provider_payment_id=provider_payment_id
    ).first()


# ==================== STRIPE WEBHOOK ====================

@subscription_webhooks_bp.route('/stripe', methods=['POST'])
def stripe_webhook():
    """
    Webhook Stripe pour les paiements d'abonnement.
    
    Événements gérés:
    - checkout.session.completed
    - payment_intent.succeeded
    - payment_intent.payment_failed
    """
    payload = request.data
    signature = request.headers.get('Stripe-Signature', '')
    
    # Vérifier la signature
    if not payment_gateway.verify_webhook('stripe', payload, signature):
        logger.warning("Stripe webhook: invalid signature")
        return jsonify({'error': 'Invalid signature'}), 401
    
    try:
        event = json.loads(payload)
        event_type = event.get('type', '')
        data = event.get('data', {}).get('object', {})
        
        logger.info(f"Stripe webhook received: {event_type}")
        
        if event_type == 'checkout.session.completed':
            session_id = data.get('id')
            payment_status = data.get('payment_status')
            
            # Trouver le paiement
            payment = find_payment_by_provider_id('stripe', session_id)
            
            if payment and payment_status == 'paid':
                complete_subscription_payment(payment, data)
                return jsonify({'message': 'Payment completed'})
            
        elif event_type == 'payment_intent.succeeded':
            payment_intent_id = data.get('id')
            
            # Chercher par payment_intent
            payment = SubscriptionPayment.query.filter(
                SubscriptionPayment.provider == 'stripe',
                SubscriptionPayment.extra_data.contains({'payment_intent': payment_intent_id})
            ).first()
            
            if payment:
                complete_subscription_payment(payment, data)
                return jsonify({'message': 'Payment completed'})
                
        elif event_type == 'payment_intent.payment_failed':
            payment_intent_id = data.get('id')
            error_message = data.get('last_payment_error', {}).get('message', 'Payment failed')
            
            payment = SubscriptionPayment.query.filter(
                SubscriptionPayment.provider == 'stripe',
                SubscriptionPayment.extra_data.contains({'payment_intent': payment_intent_id})
            ).first()
            
            if payment:
                fail_subscription_payment(payment, error_message)
                return jsonify({'message': 'Payment failed recorded'})
        
        return jsonify({'message': 'Event received'})
        
    except Exception as e:
        logger.exception(f"Stripe webhook error: {e}")
        return jsonify({'error': str(e)}), 500


# ==================== FLUTTERWAVE WEBHOOK ====================

@subscription_webhooks_bp.route('/flutterwave', methods=['POST'])
def flutterwave_webhook():
    """
    Webhook Flutterwave pour les paiements d'abonnement.
    
    Événements gérés:
    - charge.completed
    - transfer.completed
    """
    payload = request.data
    signature = request.headers.get('verif-hash', '')
    
    # Vérifier la signature
    if not payment_gateway.verify_webhook('flutterwave', payload, signature):
        logger.warning("Flutterwave webhook: invalid signature")
        return jsonify({'error': 'Invalid signature'}), 401
    
    try:
        data = request.get_json()
        event_type = data.get('event', '')
        tx_data = data.get('data', {})
        
        logger.info(f"Flutterwave webhook received: {event_type}")
        
        if event_type == 'charge.completed':
            tx_ref = tx_data.get('tx_ref')
            status = tx_data.get('status', '').lower()
            
            # Trouver le paiement par tx_ref
            payment = find_payment_by_provider_id('flutterwave', tx_ref)
            
            if payment:
                if status == 'successful':
                    complete_subscription_payment(payment, tx_data)
                    return jsonify({'message': 'Payment completed'})
                else:
                    fail_subscription_payment(payment, f"Status: {status}")
                    return jsonify({'message': 'Payment failed recorded'})
        
        return jsonify({'message': 'Event received'})
        
    except Exception as e:
        logger.exception(f"Flutterwave webhook error: {e}")
        return jsonify({'error': str(e)}), 500


# ==================== CINETPAY WEBHOOK ====================

@subscription_webhooks_bp.route('/cinetpay', methods=['POST'])
def cinetpay_webhook():
    """
    Webhook CinetPay (IPN) pour les paiements d'abonnement.
    
    CinetPay envoie une notification IPN avec les détails de la transaction.
    """
    try:
        # CinetPay peut envoyer en form-urlencoded ou JSON
        if request.is_json:
            data = request.get_json()
        else:
            data = request.form.to_dict()
        
        logger.info(f"CinetPay webhook received: {data}")
        
        transaction_id = data.get('cpm_trans_id') or data.get('transaction_id')
        status = data.get('cpm_result', '').upper()
        
        if not transaction_id:
            return jsonify({'error': 'Missing transaction_id'}), 400
        
        # Trouver le paiement
        payment = find_payment_by_provider_id('cinetpay', transaction_id)
        if not payment:
            return jsonify({'message': 'Transaction not found'}), 404

        # Sécurité: ne jamais se baser uniquement sur le payload IPN.
        # Vérifier côté CinetPay via /payment/check, puis valider montant/devise.
        verify = payment_gateway.verify_payment('cinetpay', transaction_id)
        if not verify.get('success'):
            fail_subscription_payment(payment, verify.get('error') or 'CinetPay verification failed')
            return jsonify({'error': 'Verification failed'}), 400

        if verify.get('status') == 'completed':
            verified_amount = verify.get('amount')
            verified_currency = (verify.get('currency') or '').upper()

            if verified_currency and payment.currency and verified_currency != (payment.currency or '').upper():
                fail_subscription_payment(payment, f"Currency mismatch: {verified_currency} != {payment.currency}")
                return jsonify({'error': 'Currency mismatch'}), 400

            if verified_amount is not None:
                try:
                    a = Decimal(str(verified_amount))
                    b = Decimal(str(payment.amount))
                    if abs(a - b) > Decimal('0.01'):
                        fail_subscription_payment(payment, f"Amount mismatch: {verified_amount} != {payment.amount}")
                        return jsonify({'error': 'Amount mismatch'}), 400
                except Exception:
                    pass

            complete_subscription_payment(payment, verify.get('raw_response') or data)
            return jsonify({'message': 'Payment completed'})

        if verify.get('status') in ['failed', 'cancelled']:
            fail_subscription_payment(payment, f"Status: {verify.get('status')}")
            return jsonify({'message': 'Payment failed recorded'})

        # pending
        return jsonify({'message': 'Payment still pending'}), 200
        
    except Exception as e:
        logger.exception(f"CinetPay webhook error: {e}")
        return jsonify({'error': str(e)}), 500


# ==================== MONETBIL WEBHOOK ====================

@subscription_webhooks_bp.route('/monetbil', methods=['POST'])
def monetbil_webhook():
    """
    Webhook Monetbil pour les paiements d'abonnement.
    
    Monetbil envoie une notification avec les détails de la transaction.
    La vérification se fait en rappelant checkPayment côté serveur.
    """
    try:
        # Monetbil peut envoyer en form-urlencoded ou JSON
        if request.is_json:
            data = request.get_json()
        else:
            data = request.form.to_dict()
        
        logger.info(f"Monetbil webhook received: {data}")
        
        payment_ref = data.get('payment_ref') or data.get('item_ref')
        monetbil_status = (data.get('status') or '').lower()
        
        if not payment_ref:
            return jsonify({'error': 'Missing payment_ref'}), 400
        
        # Trouver le paiement
        payment = find_payment_by_provider_id('monetbil', payment_ref)
        if not payment:
            return jsonify({'message': 'Transaction not found'}), 404
        
        # Sécurité: vérifier côté Monetbil via checkPayment
        verify = payment_gateway.verify_payment('monetbil', payment_ref)
        if not verify.get('success') and verify.get('status') != 'completed':
            if verify.get('status') in ['failed', 'cancelled']:
                fail_subscription_payment(payment, f"Status: {verify.get('status')}")
                return jsonify({'message': 'Payment failed recorded'})
            # pending — ne rien faire
            return jsonify({'message': 'Payment still pending'}), 200
        
        if verify.get('status') == 'completed':
            verified_amount = verify.get('amount')
            verified_currency = (verify.get('currency') or '').upper()
            
            if verified_currency and payment.currency and verified_currency != (payment.currency or '').upper():
                fail_subscription_payment(payment, f"Currency mismatch: {verified_currency} != {payment.currency}")
                return jsonify({'error': 'Currency mismatch'}), 400
            
            if verified_amount is not None:
                try:
                    a = Decimal(str(verified_amount))
                    b = Decimal(str(payment.amount))
                    if abs(a - b) > Decimal('0.01'):
                        fail_subscription_payment(payment, f"Amount mismatch: {verified_amount} != {payment.amount}")
                        return jsonify({'error': 'Amount mismatch'}), 400
                except Exception:
                    pass
            
            complete_subscription_payment(payment, verify.get('raw_response') or data)
            return jsonify({'message': 'Payment completed'})
        
        return jsonify({'message': 'Payment still pending'}), 200
        
    except Exception as e:
        logger.exception(f"Monetbil webhook error: {e}")
        return jsonify({'error': str(e)}), 500


# ==================== VERIFICATION MANUELLE ====================

@subscription_webhooks_bp.route('/verify/<provider>/<payment_id>', methods=['POST'])
def verify_payment(provider, payment_id):
    """
    Vérifie manuellement le statut d'un paiement auprès du provider.
    
    Utile si le webhook n'a pas été reçu.
    Nécessite une authentification super-admin.
    """
    from flask_jwt_extended import verify_jwt_in_request, get_jwt
    
    try:
        verify_jwt_in_request()
        claims = get_jwt()
        
        if claims.get('type') != 'superadmin':
            return jsonify({'error': 'Super admin required'}), 403
            
    except Exception:
        return jsonify({'error': 'Authentication required'}), 401
    
    payment = SubscriptionPayment.query.get(payment_id)
    if not payment:
        return jsonify({'error': 'Payment not found'}), 404
    
    if payment.provider != provider:
        return jsonify({'error': 'Provider mismatch'}), 400
    
    if payment.status == 'completed':
        return jsonify({
            'message': 'Payment already completed',
            'payment': payment.to_dict()
        })
    
    # Vérifier auprès du provider
    result = payment_gateway.verify_payment(provider, payment.provider_payment_id)
    
    if result.get('success') and result.get('status') == 'completed':
        complete_subscription_payment(payment, result.get('raw_response'))
        return jsonify({
            'message': 'Payment verified and completed',
            'payment': payment.to_dict()
        })
    elif result.get('status') == 'failed':
        fail_subscription_payment(payment, result.get('error', 'Verification failed'))
        return jsonify({
            'message': 'Payment verified as failed',
            'payment': payment.to_dict()
        })
    else:
        return jsonify({
            'message': 'Payment still pending',
            'status': result.get('status'),
            'payment': payment.to_dict()
        })
