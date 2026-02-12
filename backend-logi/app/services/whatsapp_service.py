"""
Service WhatsApp - Envoi de messages WhatsApp via différents providers
Providers supportés: Twilio, Meta (WhatsApp Business API), WATI
"""

import logging
import requests
from abc import ABC, abstractmethod

logger = logging.getLogger(__name__)


class WhatsAppProvider(ABC):
    """Interface abstraite pour les providers WhatsApp"""
    
    @abstractmethod
    def send_message(self, to: str, message: str) -> dict:
        """Envoie un message texte"""
        pass
    
    @abstractmethod
    def send_template(self, to: str, template_name: str, parameters: list = None, language: str = 'fr') -> dict:
        """Envoie un message template"""
        pass


class TwilioWhatsAppProvider(WhatsAppProvider):
    """
    Provider WhatsApp via Twilio
    
    Configuration requise:
        - account_sid: SID du compte Twilio
        - auth_token: Token d'authentification
        - from_number: Numéro WhatsApp Twilio (format: whatsapp:+14155238886)
    """
    
    def __init__(self, config: dict):
        self.account_sid = config.get('account_sid')
        self.auth_token = config.get('auth_token')
        self.from_number = config.get('from_number')
        
        if not all([self.account_sid, self.auth_token, self.from_number]):
            raise ValueError("Twilio WhatsApp config requires: account_sid, auth_token, from_number")
        
        # Ajouter le préfixe whatsapp: si absent
        if not self.from_number.startswith('whatsapp:'):
            self.from_number = f'whatsapp:{self.from_number}'
        
        try:
            from twilio.rest import Client
            self.client = Client(self.account_sid, self.auth_token)
        except ImportError:
            raise ImportError("Package 'twilio' not installed. Run: pip install twilio")
    
    def send_message(self, to: str, message: str) -> dict:
        """Envoie un message WhatsApp via Twilio"""
        try:
            # Formater le numéro
            to_formatted = self._format_number(to)
            
            msg = self.client.messages.create(
                body=message,
                from_=self.from_number,
                to=to_formatted
            )
            
            logger.info(f"WhatsApp Twilio sent to {to}: {msg.sid}")
            
            return {
                'success': True,
                'provider': 'twilio',
                'message_sid': msg.sid,
                'status': msg.status,
                'to': to
            }
        except Exception as e:
            logger.error(f"Twilio WhatsApp error: {str(e)}")
            return {
                'success': False,
                'provider': 'twilio',
                'error': str(e),
                'to': to
            }
    
    def send_template(self, to: str, template_name: str, parameters: list = None, language: str = 'fr') -> dict:
        """
        Envoie un template WhatsApp via Twilio
        Note: Twilio utilise les Content Templates
        """
        try:
            to_formatted = self._format_number(to)
            
            # Pour Twilio, les templates sont gérés via Content API
            # Ici on envoie un message simple avec le contenu du template
            # Pour une vraie implémentation, utiliser content_sid
            
            msg = self.client.messages.create(
                from_=self.from_number,
                to=to_formatted,
                body=f"[Template: {template_name}]"  # Placeholder
            )
            
            return {
                'success': True,
                'provider': 'twilio',
                'message_sid': msg.sid,
                'template': template_name,
                'to': to
            }
        except Exception as e:
            logger.error(f"Twilio WhatsApp template error: {str(e)}")
            return {
                'success': False,
                'provider': 'twilio',
                'error': str(e),
                'to': to
            }
    
    def _format_number(self, phone: str) -> str:
        """Formate le numéro pour Twilio WhatsApp"""
        phone = ''.join(c for c in phone if c.isdigit() or c == '+')
        if not phone.startswith('+'):
            if phone.startswith('237'):
                phone = '+' + phone
            elif phone.startswith('6') and len(phone) == 9:
                phone = '+237' + phone
            else:
                phone = '+' + phone
        return f'whatsapp:{phone}'


class MetaWhatsAppProvider(WhatsAppProvider):
    """
    Provider WhatsApp Business API (Meta/Facebook)
    
    Configuration requise:
        - access_token: Token d'accès permanent
        - phone_number_id: ID du numéro de téléphone WhatsApp Business
        - business_account_id: ID du compte Business (optionnel)
    """
    
    BASE_URL = "https://graph.facebook.com/v18.0"
    
    def __init__(self, config: dict):
        self.access_token = config.get('access_token')
        self.phone_number_id = config.get('phone_number_id')
        self.business_account_id = config.get('business_account_id')
        
        if not all([self.access_token, self.phone_number_id]):
            raise ValueError("Meta WhatsApp config requires: access_token, phone_number_id")
    
    def send_message(self, to: str, message: str) -> dict:
        """Envoie un message texte via Meta WhatsApp API"""
        try:
            phone = self._normalize_phone(to)
            
            url = f"{self.BASE_URL}/{self.phone_number_id}/messages"
            
            headers = {
                'Authorization': f'Bearer {self.access_token}',
                'Content-Type': 'application/json'
            }
            
            payload = {
                'messaging_product': 'whatsapp',
                'recipient_type': 'individual',
                'to': phone,
                'type': 'text',
                'text': {
                    'preview_url': False,
                    'body': message
                }
            }
            
            response = requests.post(url, headers=headers, json=payload)
            data = response.json()
            
            if response.status_code == 200 and 'messages' in data:
                message_id = data['messages'][0]['id']
                logger.info(f"WhatsApp Meta sent to {to}: {message_id}")
                return {
                    'success': True,
                    'provider': 'meta',
                    'message_id': message_id,
                    'to': to
                }
            else:
                error = data.get('error', {}).get('message', 'Unknown error')
                logger.error(f"Meta WhatsApp error: {error}")
                return {
                    'success': False,
                    'provider': 'meta',
                    'error': error,
                    'to': to
                }
        except Exception as e:
            logger.error(f"Meta WhatsApp error: {str(e)}")
            return {
                'success': False,
                'provider': 'meta',
                'error': str(e),
                'to': to
            }
    
    def send_template(self, to: str, template_name: str, parameters: list = None, language: str = 'fr') -> dict:
        """
        Envoie un message template via Meta WhatsApp API
        
        Args:
            to: Numéro destinataire
            template_name: Nom du template approuvé par Meta
            parameters: Liste des paramètres du template
            language: Code langue (fr, en, etc.)
        """
        try:
            phone = self._normalize_phone(to)
            
            url = f"{self.BASE_URL}/{self.phone_number_id}/messages"
            
            headers = {
                'Authorization': f'Bearer {self.access_token}',
                'Content-Type': 'application/json'
            }
            
            # Construire les composants du template
            components = []
            if parameters:
                body_params = [{'type': 'text', 'text': str(p)} for p in parameters]
                components.append({
                    'type': 'body',
                    'parameters': body_params
                })
            
            payload = {
                'messaging_product': 'whatsapp',
                'recipient_type': 'individual',
                'to': phone,
                'type': 'template',
                'template': {
                    'name': template_name,
                    'language': {
                        'code': language
                    }
                }
            }
            
            if components:
                payload['template']['components'] = components
            
            response = requests.post(url, headers=headers, json=payload)
            data = response.json()
            
            if response.status_code == 200 and 'messages' in data:
                message_id = data['messages'][0]['id']
                logger.info(f"WhatsApp Meta template sent to {to}: {message_id}")
                return {
                    'success': True,
                    'provider': 'meta',
                    'message_id': message_id,
                    'template': template_name,
                    'to': to
                }
            else:
                error = data.get('error', {}).get('message', 'Unknown error')
                logger.error(f"Meta WhatsApp template error: {error}")
                return {
                    'success': False,
                    'provider': 'meta',
                    'error': error,
                    'to': to
                }
        except Exception as e:
            logger.error(f"Meta WhatsApp template error: {str(e)}")
            return {
                'success': False,
                'provider': 'meta',
                'error': str(e),
                'to': to
            }
    
    def _normalize_phone(self, phone: str) -> str:
        """Normalise le numéro (sans le +)"""
        phone = ''.join(c for c in phone if c.isdigit())
        if phone.startswith('00'):
            phone = phone[2:]
        elif not phone.startswith('237') and len(phone) == 9:
            phone = '237' + phone
        return phone


class WATIWhatsAppProvider(WhatsAppProvider):
    """
    Provider WATI (WhatsApp Team Inbox)
    Solution populaire pour les PME
    
    Configuration requise:
        - api_url: URL de l'API WATI (ex: https://live-server-xxxxx.wati.io)
        - api_key: Clé API WATI
    """
    
    def __init__(self, config: dict):
        self.api_url = config.get('api_url', '').rstrip('/')
        self.api_key = config.get('api_key')
        
        if not all([self.api_url, self.api_key]):
            raise ValueError("WATI config requires: api_url, api_key")
    
    def send_message(self, to: str, message: str) -> dict:
        """Envoie un message via WATI"""
        try:
            phone = self._normalize_phone(to)
            
            url = f"{self.api_url}/api/v1/sendSessionMessage/{phone}"
            
            headers = {
                'Authorization': f'Bearer {self.api_key}',
                'Content-Type': 'application/json'
            }
            
            payload = {
                'messageText': message
            }
            
            response = requests.post(url, headers=headers, json=payload)
            data = response.json()
            
            if response.status_code == 200 and data.get('result'):
                logger.info(f"WhatsApp WATI sent to {to}")
                return {
                    'success': True,
                    'provider': 'wati',
                    'message_id': data.get('info'),
                    'to': to
                }
            else:
                error = data.get('message', 'Unknown error')
                logger.error(f"WATI WhatsApp error: {error}")
                return {
                    'success': False,
                    'provider': 'wati',
                    'error': error,
                    'to': to
                }
        except Exception as e:
            logger.error(f"WATI WhatsApp error: {str(e)}")
            return {
                'success': False,
                'provider': 'wati',
                'error': str(e),
                'to': to
            }
    
    def send_template(self, to: str, template_name: str, parameters: list = None, language: str = 'fr') -> dict:
        """Envoie un template via WATI"""
        try:
            phone = self._normalize_phone(to)
            
            url = f"{self.api_url}/api/v1/sendTemplateMessage/{phone}"
            
            headers = {
                'Authorization': f'Bearer {self.api_key}',
                'Content-Type': 'application/json'
            }
            
            payload = {
                'template_name': template_name,
                'broadcast_name': f'broadcast_{template_name}'
            }
            
            # Ajouter les paramètres
            if parameters:
                payload['parameters'] = [{'name': f'param{i+1}', 'value': str(p)} for i, p in enumerate(parameters)]
            
            response = requests.post(url, headers=headers, json=payload)
            data = response.json()
            
            if response.status_code == 200 and data.get('result'):
                logger.info(f"WhatsApp WATI template sent to {to}")
                return {
                    'success': True,
                    'provider': 'wati',
                    'template': template_name,
                    'to': to
                }
            else:
                error = data.get('message', 'Unknown error')
                logger.error(f"WATI WhatsApp template error: {error}")
                return {
                    'success': False,
                    'provider': 'wati',
                    'error': error,
                    'to': to
                }
        except Exception as e:
            logger.error(f"WATI WhatsApp template error: {str(e)}")
            return {
                'success': False,
                'provider': 'wati',
                'error': str(e),
                'to': to
            }
    
    def _normalize_phone(self, phone: str) -> str:
        """Normalise le numéro pour WATI"""
        phone = ''.join(c for c in phone if c.isdigit())
        if phone.startswith('00'):
            phone = phone[2:]
        elif not phone.startswith('237') and len(phone) == 9:
            phone = '237' + phone
        return phone


class WhatsAppService:
    """
    Service WhatsApp principal
    Gère la sélection du provider et l'envoi des messages
    """
    
    PROVIDERS = {
        'twilio': TwilioWhatsAppProvider,
        'meta': MetaWhatsAppProvider,
        'facebook': MetaWhatsAppProvider,  # Alias
        'wati': WATIWhatsAppProvider
    }
    
    def __init__(self, provider_name: str, config: dict):
        """
        Initialise le service WhatsApp
        
        Args:
            provider_name: Nom du provider (twilio, meta, wati)
            config: Configuration du provider
        """
        provider_class = self.PROVIDERS.get(provider_name.lower())
        
        if not provider_class:
            raise ValueError(f"Unknown WhatsApp provider: {provider_name}. Available: {list(self.PROVIDERS.keys())}")
        
        self.provider = provider_class(config)
        self.provider_name = provider_name
    
    def send_message(self, to: str, message: str) -> dict:
        """Envoie un message texte"""
        return self.provider.send_message(to, message)
    
    def send_template(self, to: str, template_name: str, parameters: list = None, language: str = 'fr') -> dict:
        """Envoie un message template"""
        return self.provider.send_template(to, template_name, parameters, language)
