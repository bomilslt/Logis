"""
Service de Passerelle de Paiement - Multi-Provider
==================================================

Service unifié pour gérer les paiements d'abonnements via différents providers:
- Stripe (International)
- Flutterwave (Afrique)
- CinetPay (Afrique francophone)
- Monetbil (Paiement mobile Afrique)

Usage:
    service = PaymentGatewayService()
    
    # Initialiser un paiement
    result = service.initialize_payment(
        provider='stripe',
        amount=10000,
        currency='XAF',
        customer_email='client@example.com',
        metadata={'tenant_id': '...', 'plan_id': '...'}
    )
    
    # Vérifier un paiement
    status = service.verify_payment('stripe', 'payment_id_xxx')
"""

import logging
import requests
import hashlib
import hmac
import json
from urllib.parse import parse_qs
from typing import Optional, Dict, Any
from datetime import datetime
from abc import ABC, abstractmethod

logger = logging.getLogger(__name__)


class PaymentProviderBase(ABC):
    """Classe de base pour tous les providers de paiement"""
    
    def __init__(self, credentials: dict, config: dict = None, is_test_mode: bool = True):
        self.credentials = credentials
        self.config = config or {}
        self.is_test_mode = is_test_mode
    
    @abstractmethod
    def initialize_payment(
        self,
        amount: float,
        currency: str,
        customer_email: str,
        customer_name: str = None,
        description: str = None,
        metadata: dict = None,
        callback_url: str = None,
        return_url: str = None
    ) -> dict:
        """Initialise un paiement et retourne les infos pour redirection"""
        pass
    
    @abstractmethod
    def verify_payment(self, payment_id: str) -> dict:
        """Vérifie le statut d'un paiement"""
        pass
    
    @abstractmethod
    def verify_webhook(self, payload: bytes, signature: str) -> bool:
        """Vérifie la signature d'un webhook"""
        pass
    
    def refund_payment(self, payment_id: str, amount: float = None) -> dict:
        """Rembourse un paiement (optionnel, non implémenté par tous)"""
        return {'success': False, 'error': 'Refund not supported by this provider'}


class StripeProvider(PaymentProviderBase):
    """
    Provider Stripe
    
    Credentials requis:
        - secret_key: Clé secrète (sk_live_xxx ou sk_test_xxx)
        - publishable_key: Clé publique (pk_live_xxx ou pk_test_xxx)
        - webhook_secret: Secret du webhook (whsec_xxx)
    """
    
    BASE_URL = 'https://api.stripe.com/v1'
    
    def _get_headers(self):
        return {
            'Authorization': f"Bearer {self.credentials.get('secret_key')}",
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    
    def initialize_payment(
        self,
        amount: float,
        currency: str,
        customer_email: str,
        customer_name: str = None,
        description: str = None,
        metadata: dict = None,
        callback_url: str = None,
        return_url: str = None
    ) -> dict:
        """Crée une session Stripe Checkout"""
        try:
            # Stripe attend les montants en centimes
            amount_cents = int(amount * 100) if currency.upper() not in ['XAF', 'XOF', 'JPY'] else int(amount)
            
            data = {
                'payment_method_types[]': 'card',
                'mode': 'payment',
                'customer_email': customer_email,
                'line_items[0][price_data][currency]': currency.lower(),
                'line_items[0][price_data][unit_amount]': amount_cents,
                'line_items[0][price_data][product_data][name]': description or 'Abonnement',
                'line_items[0][quantity]': 1,
                'success_url': return_url or callback_url,
                'cancel_url': return_url or callback_url,
            }
            
            if metadata:
                for key, value in metadata.items():
                    data[f'metadata[{key}]'] = str(value)
            
            response = requests.post(
                f'{self.BASE_URL}/checkout/sessions',
                headers=self._get_headers(),
                data=data,
                timeout=30
            )
            
            if response.status_code == 200:
                session = response.json()
                return {
                    'success': True,
                    'payment_id': session['id'],
                    'payment_url': session['url'],
                    'provider_reference': session.get('payment_intent'),
                    'raw_response': session
                }
            else:
                error = response.json()
                logger.error(f"Stripe error: {error}")
                return {
                    'success': False,
                    'error': error.get('error', {}).get('message', 'Stripe error')
                }
                
        except Exception as e:
            logger.exception(f"Stripe initialize_payment error: {e}")
            return {'success': False, 'error': str(e)}
    
    def verify_payment(self, payment_id: str) -> dict:
        """Vérifie le statut d'une session Checkout"""
        try:
            response = requests.get(
                f'{self.BASE_URL}/checkout/sessions/{payment_id}',
                headers=self._get_headers(),
                timeout=30
            )
            
            if response.status_code == 200:
                session = response.json()
                status_map = {
                    'complete': 'completed',
                    'open': 'pending',
                    'expired': 'failed'
                }
                currency = (session.get('currency', '') or '').upper()
                amount_total = session.get('amount_total', 0) or 0
                # Stripe: certaines devises sont sans décimales (XAF/XOF/JPY)
                if currency in ['XAF', 'XOF', 'JPY']:
                    amount = float(amount_total)
                else:
                    amount = float(amount_total) / 100
                return {
                    'success': True,
                    'status': status_map.get(session['status'], session['status']),
                    'amount': amount,
                    'currency': currency,
                    'payment_method': 'card',
                    'raw_response': session
                }
            else:
                return {'success': False, 'error': 'Payment not found'}
                
        except Exception as e:
            logger.exception(f"Stripe verify_payment error: {e}")
            return {'success': False, 'error': str(e)}
    
    def verify_webhook(self, payload: bytes, signature: str) -> bool:
        """Vérifie la signature webhook Stripe"""
        try:
            import stripe
            stripe.api_key = self.credentials.get('secret_key')
            webhook_secret = self.credentials.get('webhook_secret')
            
            stripe.Webhook.construct_event(payload, signature, webhook_secret)
            return True
        except Exception as e:
            logger.warning(f"Stripe webhook verification failed: {e}")
            return False
    
    def refund_payment(self, payment_id: str, amount: float = None) -> dict:
        """Rembourse un paiement Stripe"""
        try:
            data = {'payment_intent': payment_id}
            if amount:
                data['amount'] = int(amount * 100)
            
            response = requests.post(
                f'{self.BASE_URL}/refunds',
                headers=self._get_headers(),
                data=data,
                timeout=30
            )
            
            if response.status_code == 200:
                return {'success': True, 'refund': response.json()}
            else:
                return {'success': False, 'error': response.json()}
                
        except Exception as e:
            return {'success': False, 'error': str(e)}


class FlutterwaveProvider(PaymentProviderBase):
    """
    Provider Flutterwave (Rave)
    
    Credentials requis:
        - secret_key: Clé secrète
        - public_key: Clé publique
        - encryption_key: Clé de chiffrement
        - webhook_secret: Secret du webhook (optionnel, utilise secret_key par défaut)
    """
    
    BASE_URL = 'https://api.flutterwave.com/v3'
    
    def _get_headers(self):
        return {
            'Authorization': f"Bearer {self.credentials.get('secret_key')}",
            'Content-Type': 'application/json'
        }
    
    def initialize_payment(
        self,
        amount: float,
        currency: str,
        customer_email: str,
        customer_name: str = None,
        description: str = None,
        metadata: dict = None,
        callback_url: str = None,
        return_url: str = None
    ) -> dict:
        """Initialise un paiement Flutterwave"""
        try:
            import uuid
            tx_ref = f"TX-{uuid.uuid4().hex[:16].upper()}"
            
            payload = {
                'tx_ref': tx_ref,
                'amount': amount,
                'currency': currency.upper(),
                'redirect_url': return_url or callback_url,
                'customer': {
                    'email': customer_email,
                    'name': customer_name or customer_email.split('@')[0]
                },
                'customizations': {
                    'title': description or 'Paiement Abonnement',
                    'logo': self.config.get('logo_url')
                },
                'meta': metadata or {}
            }
            
            response = requests.post(
                f'{self.BASE_URL}/payments',
                headers=self._get_headers(),
                json=payload,
                timeout=30
            )
            
            result = response.json()
            
            if result.get('status') == 'success':
                return {
                    'success': True,
                    'payment_id': tx_ref,
                    'payment_url': result['data']['link'],
                    'provider_reference': tx_ref,
                    'raw_response': result
                }
            else:
                logger.error(f"Flutterwave error: {result}")
                return {
                    'success': False,
                    'error': result.get('message', 'Flutterwave error')
                }
                
        except Exception as e:
            logger.exception(f"Flutterwave initialize_payment error: {e}")
            return {'success': False, 'error': str(e)}
    
    def verify_payment(self, payment_id: str) -> dict:
        """Vérifie le statut d'un paiement par tx_ref"""
        try:
            # D'abord chercher par tx_ref
            response = requests.get(
                f'{self.BASE_URL}/transactions/verify_by_reference',
                headers=self._get_headers(),
                params={'tx_ref': payment_id},
                timeout=30
            )
            
            result = response.json()
            
            if result.get('status') == 'success':
                data = result['data']
                status_map = {
                    'successful': 'completed',
                    'pending': 'pending',
                    'failed': 'failed'
                }
                return {
                    'success': True,
                    'status': status_map.get(data['status'], data['status']),
                    'amount': data.get('amount', 0),
                    'currency': data.get('currency', ''),
                    'payment_method': data.get('payment_type', 'card'),
                    'transaction_id': data.get('id'),
                    'raw_response': result
                }
            else:
                return {'success': False, 'error': result.get('message', 'Verification failed')}
                
        except Exception as e:
            logger.exception(f"Flutterwave verify_payment error: {e}")
            return {'success': False, 'error': str(e)}
    
    def verify_webhook(self, payload: bytes, signature: str) -> bool:
        """Vérifie la signature webhook Flutterwave"""
        try:
            secret = self.credentials.get('webhook_secret') or self.credentials.get('secret_key')
            expected = hmac.new(
                secret.encode(),
                payload,
                hashlib.sha256
            ).hexdigest()
            return hmac.compare_digest(signature, expected)
        except Exception as e:
            logger.warning(f"Flutterwave webhook verification failed: {e}")
            return False


class CinetPayProvider(PaymentProviderBase):
    """
    Provider CinetPay
    
    Credentials requis:
        - api_key: Clé API
        - site_id: ID du site
        - secret_key: Clé secrète (pour webhooks)
    """
    
    BASE_URL = 'https://api-checkout.cinetpay.com/v2'
    
    def _get_headers(self):
        return {
            'Content-Type': 'application/json'
        }
    
    def initialize_payment(
        self,
        amount: float,
        currency: str,
        customer_email: str,
        customer_name: str = None,
        description: str = None,
        metadata: dict = None,
        callback_url: str = None,
        return_url: str = None
    ) -> dict:
        """Initialise un paiement CinetPay"""
        try:
            import uuid
            transaction_id = f"CP-{uuid.uuid4().hex[:16].upper()}"
            
            # CinetPay attend des montants entiers pour XAF/XOF
            amount_int = int(amount)
            
            payload = {
                'apikey': self.credentials.get('api_key'),
                'site_id': self.credentials.get('site_id'),
                'transaction_id': transaction_id,
                'amount': amount_int,
                'currency': currency.upper(),
                'description': description or 'Paiement Abonnement',
                'customer_email': customer_email,
                'customer_name': customer_name or '',
                'customer_surname': '',
                'notify_url': callback_url,
                'return_url': return_url,
                'channels': 'ALL',
                'metadata': json.dumps(metadata) if metadata else None
            }
            
            response = requests.post(
                f'{self.BASE_URL}/payment',
                headers=self._get_headers(),
                json=payload,
                timeout=30
            )
            
            result = response.json()
            
            if result.get('code') == '201':
                data = result.get('data', {})
                return {
                    'success': True,
                    'payment_id': transaction_id,
                    'payment_url': data.get('payment_url'),
                    'provider_reference': data.get('payment_token'),
                    'raw_response': result
                }
            else:
                logger.error(f"CinetPay error: {result}")
                return {
                    'success': False,
                    'error': result.get('message', 'CinetPay error')
                }
                
        except Exception as e:
            logger.exception(f"CinetPay initialize_payment error: {e}")
            return {'success': False, 'error': str(e)}
    
    def verify_payment(self, payment_id: str) -> dict:
        """Vérifie le statut d'un paiement CinetPay"""
        try:
            payload = {
                'apikey': self.credentials.get('api_key'),
                'site_id': self.credentials.get('site_id'),
                'transaction_id': payment_id
            }
            
            response = requests.post(
                f'{self.BASE_URL}/payment/check',
                headers=self._get_headers(),
                json=payload,
                timeout=30
            )
            
            result = response.json()
            
            if result.get('code') == '00':
                data = result.get('data', {})
                status_map = {
                    'ACCEPTED': 'completed',
                    'PENDING': 'pending',
                    'REFUSED': 'failed',
                    'CANCELLED': 'cancelled'
                }
                return {
                    'success': True,
                    'status': status_map.get(data.get('status'), data.get('status', 'unknown')),
                    'amount': float(data.get('amount', 0)),
                    'currency': data.get('currency', ''),
                    'payment_method': data.get('payment_method', 'mobile_money'),
                    'raw_response': result
                }
            else:
                return {'success': False, 'error': result.get('message', 'Verification failed')}
                
        except Exception as e:
            logger.exception(f"CinetPay verify_payment error: {e}")
            return {'success': False, 'error': str(e)}
    
    def verify_webhook(self, payload: bytes, signature: str) -> bool:
        """Vérifie la signature webhook CinetPay (IPN)"""
        # CinetPay utilise une vérification par callback plutôt que signature
        # On vérifie simplement que le site_id correspond
        try:
            raw = payload.decode(errors='ignore') if isinstance(payload, (bytes, bytearray)) else str(payload)

            # JSON
            try:
                data = json.loads(raw)
                return str(data.get('cpm_site_id')) == str(self.credentials.get('site_id'))
            except Exception:
                pass

            # form-urlencoded
            parsed = parse_qs(raw)
            site_id = (parsed.get('cpm_site_id') or parsed.get('site_id') or [''])[0]
            return str(site_id) == str(self.credentials.get('site_id'))
        except Exception:
            return False


class MonetbilProvider(PaymentProviderBase):
    """
    Provider Monetbil (Paiement mobile Afrique)
    
    Credentials requis:
        - service_key: Clé de service Monetbil
        - service_secret: Secret de service Monetbil
    """
    
    BASE_URL = 'https://api.monetbil.com/payment/v1'
    
    def initialize_payment(
        self,
        amount: float,
        currency: str,
        customer_email: str,
        customer_name: str = None,
        description: str = None,
        metadata: dict = None,
        callback_url: str = None,
        return_url: str = None
    ) -> dict:
        """Initialise un paiement Monetbil"""
        try:
            import uuid
            payment_ref = f"MB-{uuid.uuid4().hex[:16].upper()}"
            
            # Monetbil attend des montants entiers pour XAF/XOF
            amount_int = int(amount)
            
            payload = {
                'service': self.credentials.get('service_key'),
                'phonenumber': '',
                'amount': amount_int,
                'currency': currency.upper(),
                'ref': payment_ref,
                'email': customer_email,
                'first_name': customer_name or customer_email.split('@')[0],
                'last_name': '',
                'item_ref': payment_ref,
                'payment_ref': payment_ref,
                'notify_url': callback_url,
                'return_url': return_url,
            }
            
            response = requests.post(
                f'{self.BASE_URL}/placePayment',
                data=payload,
                timeout=30
            )
            
            result = response.json()
            
            if result.get('payment_url'):
                return {
                    'success': True,
                    'payment_id': payment_ref,
                    'payment_url': result['payment_url'],
                    'provider_reference': payment_ref,
                    'raw_response': result
                }
            else:
                logger.error(f"Monetbil error: {result}")
                return {
                    'success': False,
                    'error': result.get('message', 'Monetbil error')
                }
                
        except Exception as e:
            logger.exception(f"Monetbil initialize_payment error: {e}")
            return {'success': False, 'error': str(e)}
    
    def verify_payment(self, payment_id: str) -> dict:
        """Vérifie le statut d'un paiement Monetbil"""
        try:
            payload = {
                'paymentId': payment_id,
                'service': self.credentials.get('service_key'),
            }
            
            response = requests.post(
                f'{self.BASE_URL}/checkPayment',
                data=payload,
                timeout=30
            )
            
            result = response.json()
            
            # Monetbil status: success, failed, cancelled, pending
            status_map = {
                'success': 'completed',
                'failed': 'failed',
                'cancelled': 'cancelled',
                'pending': 'pending'
            }
            
            monetbil_status = (result.get('transaction', {}).get('status') or result.get('status', '')).lower()
            mapped_status = status_map.get(monetbil_status, monetbil_status)
            
            transaction = result.get('transaction', {})
            
            return {
                'success': mapped_status == 'completed',
                'status': mapped_status,
                'amount': float(transaction.get('amount', 0)),
                'currency': transaction.get('currency', ''),
                'payment_method': 'mobile_money',
                'raw_response': result
            }
                
        except Exception as e:
            logger.exception(f"Monetbil verify_payment error: {e}")
            return {'success': False, 'error': str(e)}
    
    def verify_webhook(self, payload: bytes, signature: str) -> bool:
        """
        Vérifie un webhook Monetbil.
        Monetbil envoie un POST avec les données de la transaction.
        La vérification se fait en rappelant checkPayment côté serveur.
        On vérifie ici que le service_key correspond.
        """
        try:
            raw = payload.decode(errors='ignore') if isinstance(payload, (bytes, bytearray)) else str(payload)
            
            # JSON
            try:
                data = json.loads(raw)
                return str(data.get('service')) == str(self.credentials.get('service_key'))
            except Exception:
                pass
            
            # form-urlencoded
            parsed = parse_qs(raw)
            service = (parsed.get('service') or [''])[0]
            return str(service) == str(self.credentials.get('service_key'))
        except Exception:
            return False


class OrangeMoneyProvider(PaymentProviderBase):
    """
    Provider Orange Money (API Orange Money Payment)
    
    Credentials requis:
        - merchant_key: Clé marchand Orange Money
        - api_user: Utilisateur API
        - api_key: Clé API
        - pin: Code PIN (optionnel, pour certaines opérations)
    
    Config:
        - environment: sandbox | production
        - default_currency: XAF | XOF
    """
    
    SANDBOX_URL = 'https://api.orange.com/orange-money-webpay/dev/v1'
    PRODUCTION_URL = 'https://api.orange.com/orange-money-webpay/v1'
    AUTH_URL = 'https://api.orange.com/oauth/v3/token'
    
    def _get_base_url(self):
        if self.is_test_mode or self.config.get('environment') == 'sandbox':
            return self.SANDBOX_URL
        return self.PRODUCTION_URL
    
    def _get_access_token(self):
        """Obtient un token OAuth2 depuis l'API Orange"""
        try:
            response = requests.post(
                self.AUTH_URL,
                headers={
                    'Authorization': f"Basic {self.credentials.get('merchant_key', '')}",
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json'
                },
                data={'grant_type': 'client_credentials'},
                timeout=15
            )
            
            if response.status_code == 200:
                return response.json().get('access_token')
            
            logger.error(f"Orange Money auth error: {response.status_code} {response.text}")
            return None
        except Exception as e:
            logger.exception(f"Orange Money auth error: {e}")
            return None
    
    def initialize_payment(
        self,
        amount: float,
        currency: str,
        customer_email: str,
        customer_name: str = None,
        description: str = None,
        metadata: dict = None,
        callback_url: str = None,
        return_url: str = None
    ) -> dict:
        """Initialise un paiement Orange Money Web Payment"""
        try:
            import uuid
            order_id = f"OM-{uuid.uuid4().hex[:16].upper()}"
            
            access_token = self._get_access_token()
            if not access_token:
                return {'success': False, 'error': 'Failed to authenticate with Orange Money API'}
            
            amount_int = int(amount)
            
            payload = {
                'merchant_key': self.credentials.get('merchant_key'),
                'currency': currency.upper(),
                'order_id': order_id,
                'amount': amount_int,
                'return_url': return_url or callback_url or '',
                'cancel_url': return_url or callback_url or '',
                'notif_url': callback_url or '',
                'lang': 'fr',
                'reference': description or 'Paiement colis'
            }
            
            response = requests.post(
                f'{self._get_base_url()}/webpayment',
                headers={
                    'Authorization': f'Bearer {access_token}',
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                json=payload,
                timeout=30
            )
            
            result = response.json()
            
            if result.get('payment_url') or result.get('pay_token'):
                return {
                    'success': True,
                    'payment_id': order_id,
                    'payment_url': result.get('payment_url', ''),
                    'provider_reference': result.get('pay_token', order_id),
                    'raw_response': result
                }
            else:
                logger.error(f"Orange Money error: {result}")
                return {
                    'success': False,
                    'error': result.get('message', result.get('description', 'Orange Money error'))
                }
                
        except Exception as e:
            logger.exception(f"Orange Money initialize_payment error: {e}")
            return {'success': False, 'error': str(e)}
    
    def verify_payment(self, payment_id: str) -> dict:
        """Vérifie le statut d'un paiement Orange Money"""
        try:
            access_token = self._get_access_token()
            if not access_token:
                return {'success': False, 'error': 'Failed to authenticate'}
            
            response = requests.post(
                f'{self._get_base_url()}/transactionstatus',
                headers={
                    'Authorization': f'Bearer {access_token}',
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                json={
                    'order_id': payment_id,
                    'amount': None,
                    'pay_token': None
                },
                timeout=30
            )
            
            result = response.json()
            
            status_map = {
                'SUCCESS': 'completed',
                'PENDING': 'pending',
                'FAILED': 'failed',
                'EXPIRED': 'failed',
                'CANCELLED': 'cancelled',
                'INITIATED': 'pending'
            }
            
            om_status = (result.get('status') or '').upper()
            mapped_status = status_map.get(om_status, om_status.lower())
            
            return {
                'success': mapped_status == 'completed',
                'status': mapped_status,
                'amount': float(result.get('amount', 0)),
                'currency': result.get('currency', ''),
                'payment_method': 'mobile_money',
                'raw_response': result
            }
                
        except Exception as e:
            logger.exception(f"Orange Money verify_payment error: {e}")
            return {'success': False, 'error': str(e)}
    
    def verify_webhook(self, payload: bytes, signature: str) -> bool:
        """
        Vérifie un webhook Orange Money.
        Orange Money utilise une notification URL (notif_url).
        La vérification se fait en rappelant transactionstatus côté serveur.
        """
        try:
            raw = payload.decode(errors='ignore') if isinstance(payload, (bytes, bytearray)) else str(payload)
            try:
                data = json.loads(raw)
                return bool(data.get('order_id') or data.get('pay_token'))
            except Exception:
                pass
            return True
        except Exception:
            return False


class MTNMoMoProvider(PaymentProviderBase):
    """
    Provider MTN Mobile Money (MTN MoMo API - Collections)
    
    Credentials requis:
        - subscription_key: Clé d'abonnement (Ocp-Apim-Subscription-Key)
        - api_user: Utilisateur API (X-Reference-Id)
        - api_key: Clé API
        - callback_url: URL de callback (optionnel)
    
    Config:
        - environment: sandbox | production
        - target_environment: Environnement cible MTN (ex: 'mtncameroon', 'mtnivorycoast')
        - default_currency: XAF | XOF
    """
    
    SANDBOX_URL = 'https://sandbox.momodeveloper.mtn.com/collection/v1_0'
    PRODUCTION_URL = 'https://proxy.momoapi.mtn.com/collection/v1_0'
    SANDBOX_AUTH_URL = 'https://sandbox.momodeveloper.mtn.com/collection/token/'
    PRODUCTION_AUTH_URL = 'https://proxy.momoapi.mtn.com/collection/token/'
    
    def _get_base_url(self):
        if self.is_test_mode or self.config.get('environment') == 'sandbox':
            return self.SANDBOX_URL
        return self.PRODUCTION_URL
    
    def _get_auth_url(self):
        if self.is_test_mode or self.config.get('environment') == 'sandbox':
            return self.SANDBOX_AUTH_URL
        return self.PRODUCTION_AUTH_URL
    
    def _get_target_environment(self):
        if self.is_test_mode or self.config.get('environment') == 'sandbox':
            return 'sandbox'
        return self.config.get('target_environment', 'mtncameroon')
    
    def _get_access_token(self):
        """Obtient un token OAuth2 depuis l'API MTN MoMo"""
        try:
            import base64
            api_user = self.credentials.get('api_user', '')
            api_key = self.credentials.get('api_key', '')
            auth_string = base64.b64encode(f"{api_user}:{api_key}".encode()).decode()
            
            response = requests.post(
                self._get_auth_url(),
                headers={
                    'Authorization': f'Basic {auth_string}',
                    'Ocp-Apim-Subscription-Key': self.credentials.get('subscription_key', ''),
                    'Content-Type': 'application/json'
                },
                timeout=15
            )
            
            if response.status_code == 200:
                return response.json().get('access_token')
            
            logger.error(f"MTN MoMo auth error: {response.status_code} {response.text}")
            return None
        except Exception as e:
            logger.exception(f"MTN MoMo auth error: {e}")
            return None
    
    def initialize_payment(
        self,
        amount: float,
        currency: str,
        customer_email: str,
        customer_name: str = None,
        description: str = None,
        metadata: dict = None,
        callback_url: str = None,
        return_url: str = None
    ) -> dict:
        """
        Initialise un paiement MTN MoMo (Request to Pay).
        
        Note: MTN MoMo est un flux USSD push — pas de redirect URL.
        Le client reçoit une notification USSD sur son téléphone pour confirmer.
        Le frontend doit poller le statut via verify_payment.
        """
        try:
            import uuid
            reference_id = str(uuid.uuid4())
            
            access_token = self._get_access_token()
            if not access_token:
                return {'success': False, 'error': 'Failed to authenticate with MTN MoMo API'}
            
            amount_str = str(int(amount))
            
            # Extraire le numéro de téléphone depuis metadata
            phone = (metadata or {}).get('phone', '')
            if not phone:
                return {'success': False, 'error': 'Phone number required for MTN MoMo payment (pass in metadata.phone)'}
            
            payload = {
                'amount': amount_str,
                'currency': currency.upper(),
                'externalId': reference_id,
                'payer': {
                    'partyIdType': 'MSISDN',
                    'partyId': phone.replace('+', '').replace(' ', '')
                },
                'payerMessage': description or 'Paiement colis',
                'payeeNote': description or 'Paiement colis'
            }
            
            headers = {
                'Authorization': f'Bearer {access_token}',
                'X-Reference-Id': reference_id,
                'X-Target-Environment': self._get_target_environment(),
                'Ocp-Apim-Subscription-Key': self.credentials.get('subscription_key', ''),
                'Content-Type': 'application/json'
            }
            
            cb_url = callback_url or self.credentials.get('callback_url')
            if cb_url:
                headers['X-Callback-Url'] = cb_url
            
            response = requests.post(
                f'{self._get_base_url()}/requesttopay',
                headers=headers,
                json=payload,
                timeout=30
            )
            
            # MTN MoMo retourne 202 Accepted si la requête est acceptée
            if response.status_code in [200, 202]:
                return {
                    'success': True,
                    'payment_id': reference_id,
                    'payment_url': None,  # Pas de redirect — flux USSD push
                    'provider_reference': reference_id,
                    'payment_type': 'ussd_push',
                    'message': 'Veuillez confirmer le paiement sur votre téléphone MTN',
                    'raw_response': {'status_code': response.status_code, 'reference_id': reference_id}
                }
            else:
                error_body = {}
                try:
                    error_body = response.json()
                except Exception:
                    pass
                logger.error(f"MTN MoMo error: {response.status_code} {error_body}")
                return {
                    'success': False,
                    'error': error_body.get('message', f'MTN MoMo error (HTTP {response.status_code})')
                }
                
        except Exception as e:
            logger.exception(f"MTN MoMo initialize_payment error: {e}")
            return {'success': False, 'error': str(e)}
    
    def verify_payment(self, payment_id: str) -> dict:
        """Vérifie le statut d'un paiement MTN MoMo (Request to Pay)"""
        try:
            access_token = self._get_access_token()
            if not access_token:
                return {'success': False, 'error': 'Failed to authenticate'}
            
            response = requests.get(
                f'{self._get_base_url()}/requesttopay/{payment_id}',
                headers={
                    'Authorization': f'Bearer {access_token}',
                    'X-Target-Environment': self._get_target_environment(),
                    'Ocp-Apim-Subscription-Key': self.credentials.get('subscription_key', ''),
                    'Content-Type': 'application/json'
                },
                timeout=30
            )
            
            if response.status_code != 200:
                return {'success': False, 'error': f'MTN MoMo error (HTTP {response.status_code})'}
            
            result = response.json()
            
            status_map = {
                'SUCCESSFUL': 'completed',
                'PENDING': 'pending',
                'FAILED': 'failed',
                'REJECTED': 'failed',
                'TIMEOUT': 'failed',
                'EXPIRED': 'failed'
            }
            
            momo_status = (result.get('status') or '').upper()
            mapped_status = status_map.get(momo_status, momo_status.lower())
            
            return {
                'success': mapped_status == 'completed',
                'status': mapped_status,
                'amount': float(result.get('amount', 0)),
                'currency': result.get('currency', ''),
                'payment_method': 'mobile_money',
                'raw_response': result
            }
                
        except Exception as e:
            logger.exception(f"MTN MoMo verify_payment error: {e}")
            return {'success': False, 'error': str(e)}
    
    def verify_webhook(self, payload: bytes, signature: str) -> bool:
        """
        Vérifie un webhook MTN MoMo.
        MTN MoMo envoie un callback avec le statut de la transaction.
        La vérification se fait en rappelant requesttopay/{referenceId} côté serveur.
        """
        try:
            raw = payload.decode(errors='ignore') if isinstance(payload, (bytes, bytearray)) else str(payload)
            try:
                data = json.loads(raw)
                return bool(data.get('externalId') or data.get('referenceId'))
            except Exception:
                pass
            return True
        except Exception:
            return False


class PaymentGatewayService:
    """
    Service unifié de passerelle de paiement
    
    Charge dynamiquement la configuration depuis la base de données
    et route les paiements vers le bon provider.
    
    Supporte deux modes:
    - Global (superadmin): credentials depuis PlatformPaymentProvider
    - Tenant: credentials depuis TenantPaymentProvider
    """
    
    PROVIDERS = {
        'stripe': StripeProvider,
        'flutterwave': FlutterwaveProvider,
        'cinetpay': CinetPayProvider,
        'monetbil': MonetbilProvider,
        'orange_money': OrangeMoneyProvider,
        'mtn_momo': MTNMoMoProvider
    }
    
    def __init__(self):
        self._providers_cache = {}
    
    def _get_provider_config(self, provider_code: str):
        """Récupère la config d'un provider depuis la DB"""
        from app.models import PlatformPaymentProvider
        return PlatformPaymentProvider.query.filter_by(
            provider_code=provider_code,
            is_enabled=True
        ).first()
    
    def _get_provider(self, provider_code: str) -> Optional[PaymentProviderBase]:
        """Instancie un provider"""
        if provider_code not in self.PROVIDERS:
            logger.error(f"Unknown payment provider: {provider_code}")
            return None
        
        config = self._get_provider_config(provider_code)
        if not config:
            logger.error(f"Provider not configured or disabled: {provider_code}")
            return None
        
        provider_class = self.PROVIDERS[provider_code]
        return provider_class(
            credentials=config.credentials,
            config=config.config or {},
            is_test_mode=config.is_test_mode
        )
    
    def get_enabled_providers(self) -> list:
        """Retourne la liste des providers activés"""
        from app.models import PlatformPaymentProvider
        providers = PlatformPaymentProvider.query.filter_by(is_enabled=True).order_by(
            PlatformPaymentProvider.display_order
        ).all()
        return [p.to_dict() for p in providers]
    
    def initialize_payment(
        self,
        provider: str,
        amount: float,
        currency: str,
        customer_email: str,
        customer_name: str = None,
        description: str = None,
        metadata: dict = None,
        callback_url: str = None,
        return_url: str = None
    ) -> dict:
        """
        Initialise un paiement avec le provider spécifié
        
        Returns:
            {
                'success': bool,
                'payment_id': str,
                'payment_url': str,
                'provider': str,
                'error': str (si échec)
            }
        """
        provider_instance = self._get_provider(provider)
        if not provider_instance:
            return {
                'success': False,
                'error': f'Provider {provider} not available'
            }
        
        result = provider_instance.initialize_payment(
            amount=amount,
            currency=currency,
            customer_email=customer_email,
            customer_name=customer_name,
            description=description,
            metadata=metadata,
            callback_url=callback_url,
            return_url=return_url
        )
        
        if result.get('success'):
            result['provider'] = provider
        
        return result
    
    def verify_payment(self, provider: str, payment_id: str) -> dict:
        """Vérifie le statut d'un paiement"""
        provider_instance = self._get_provider(provider)
        if not provider_instance:
            return {
                'success': False,
                'error': f'Provider {provider} not available'
            }
        
        return provider_instance.verify_payment(payment_id)
    
    def verify_webhook(self, provider: str, payload: bytes, signature: str) -> bool:
        """Vérifie la signature d'un webhook"""
        provider_instance = self._get_provider(provider)
        if not provider_instance:
            return False
        
        return provider_instance.verify_webhook(payload, signature)
    
    def refund_payment(self, provider: str, payment_id: str, amount: float = None) -> dict:
        """Rembourse un paiement"""
        provider_instance = self._get_provider(provider)
        if not provider_instance:
            return {
                'success': False,
                'error': f'Provider {provider} not available'
            }
        
        return provider_instance.refund_payment(payment_id, amount)
    
    # ==================== TENANT-LEVEL METHODS ====================
    
    def _get_tenant_provider(self, tenant_id: str, provider_code: str) -> Optional[PaymentProviderBase]:
        """Instancie un provider avec les credentials d'un tenant"""
        if provider_code not in self.PROVIDERS:
            logger.error(f"Unknown payment provider: {provider_code}")
            return None
        
        from app.models import TenantPaymentProvider
        config = TenantPaymentProvider.query.filter_by(
            tenant_id=tenant_id,
            provider_code=provider_code,
            is_enabled=True
        ).first()
        
        if not config:
            logger.error(f"Tenant provider not configured or disabled: {provider_code} for tenant {tenant_id}")
            return None
        
        provider_class = self.PROVIDERS[provider_code]
        return provider_class(
            credentials=config.credentials,
            config=config.config or {},
            is_test_mode=config.is_test_mode
        )
    
    def get_tenant_enabled_providers(self, tenant_id: str) -> list:
        """Retourne la liste des providers activés pour un tenant"""
        from app.models import TenantPaymentProvider
        providers = TenantPaymentProvider.query.filter_by(
            tenant_id=tenant_id,
            is_enabled=True
        ).order_by(TenantPaymentProvider.display_order).all()
        return [p.to_dict() for p in providers]
    
    def initialize_tenant_payment(
        self,
        tenant_id: str,
        provider: str,
        amount: float,
        currency: str,
        customer_email: str,
        customer_name: str = None,
        description: str = None,
        metadata: dict = None,
        callback_url: str = None,
        return_url: str = None
    ) -> dict:
        """
        Initialise un paiement avec les credentials d'un tenant.
        Utilisé pour les paiements de colis par les clients.
        """
        provider_instance = self._get_tenant_provider(tenant_id, provider)
        if not provider_instance:
            return {
                'success': False,
                'error': f'Provider {provider} not available for this tenant'
            }
        
        result = provider_instance.initialize_payment(
            amount=amount,
            currency=currency,
            customer_email=customer_email,
            customer_name=customer_name,
            description=description,
            metadata=metadata,
            callback_url=callback_url,
            return_url=return_url
        )
        
        if result.get('success'):
            result['provider'] = provider
        
        return result
    
    def verify_tenant_payment(self, tenant_id: str, provider: str, payment_id: str) -> dict:
        """Vérifie le statut d'un paiement avec les credentials d'un tenant"""
        provider_instance = self._get_tenant_provider(tenant_id, provider)
        if not provider_instance:
            return {
                'success': False,
                'error': f'Provider {provider} not available for this tenant'
            }
        
        return provider_instance.verify_payment(payment_id)
    
    def verify_tenant_webhook(self, tenant_id: str, provider: str, payload: bytes, signature: str) -> bool:
        """Vérifie la signature d'un webhook avec les credentials d'un tenant"""
        provider_instance = self._get_tenant_provider(tenant_id, provider)
        if not provider_instance:
            return False
        
        return provider_instance.verify_webhook(payload, signature)
    
    def record_tenant_payment_completed(self, tenant_id: str, provider_code: str, amount: float = None):
        """Enregistre un paiement confirmé pour les stats du provider tenant."""
        try:
            from app.models import TenantPaymentProvider
            from app import db

            provider = TenantPaymentProvider.query.filter_by(
                tenant_id=tenant_id,
                provider_code=provider_code
            ).first()
            if not provider:
                return

            provider.total_transactions = (provider.total_transactions or 0) + 1
            if amount is not None:
                provider.total_amount = float(provider.total_amount or 0) + float(amount)
            provider.last_transaction_at = datetime.utcnow()
            db.session.commit()
        except Exception as e:
            logger.error(f"Error recording tenant provider completed payment: {e}")
    
    # ==================== GLOBAL (SUPERADMIN) METHODS ====================
    
    def record_payment_completed(self, provider_code: str, amount_xaf: float = None):
        """Enregistre un paiement confirmé (webhook/verification) pour les stats provider."""
        try:
            from app.models import PlatformPaymentProvider
            from app import db

            provider = PlatformPaymentProvider.query.filter_by(provider_code=provider_code).first()
            if not provider:
                return

            provider.total_transactions = (provider.total_transactions or 0) + 1
            if amount_xaf is not None:
                provider.total_amount = float(provider.total_amount or 0) + float(amount_xaf)
            provider.last_transaction_at = datetime.utcnow()
            db.session.commit()
        except Exception as e:
            logger.error(f"Error recording provider completed payment: {e}")


# Singleton instance
payment_gateway = PaymentGatewayService()
