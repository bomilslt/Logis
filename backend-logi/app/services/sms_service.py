"""
Service SMS - Envoi de SMS via différents providers
Providers supportés: Twilio, Vonage (Nexmo), Africa's Talking
"""

import logging
from abc import ABC, abstractmethod

logger = logging.getLogger(__name__)


class SMSProvider(ABC):
    """Interface abstraite pour les providers SMS"""
    
    @abstractmethod
    def send(self, to: str, message: str) -> dict:
        """Envoie un SMS"""
        pass
    
    @abstractmethod
    def get_balance(self) -> dict:
        """Récupère le solde du compte"""
        pass


class TwilioSMSProvider(SMSProvider):
    """
    Provider SMS Twilio
    
    Configuration requise:
        - account_sid: SID du compte Twilio
        - auth_token: Token d'authentification
        - from_number: Numéro d'envoi (format E.164: +1234567890)
    """
    
    def __init__(self, config: dict):
        self.account_sid = config.get('account_sid')
        self.auth_token = config.get('auth_token')
        self.from_number = config.get('from_number')
        
        if not all([self.account_sid, self.auth_token, self.from_number]):
            raise ValueError("Twilio config requires: account_sid, auth_token, from_number")
        
        # Import Twilio
        try:
            from twilio.rest import Client
            self.client = Client(self.account_sid, self.auth_token)
        except ImportError:
            raise ImportError("Package 'twilio' not installed. Run: pip install twilio")
    
    def send(self, to: str, message: str) -> dict:
        """
        Envoie un SMS via Twilio
        
        Args:
            to: Numéro destinataire (format E.164)
            message: Contenu du message
        
        Returns:
            dict avec status, message_sid, etc.
        """
        try:
            msg = self.client.messages.create(
                body=message,
                from_=self.from_number,
                to=to
            )
            
            logger.info(f"SMS Twilio sent to {to}: {msg.sid}")
            
            return {
                'success': True,
                'provider': 'twilio',
                'message_sid': msg.sid,
                'status': msg.status,
                'to': to
            }
        except Exception as e:
            logger.error(f"Twilio SMS error: {str(e)}")
            return {
                'success': False,
                'provider': 'twilio',
                'error': str(e),
                'to': to
            }
    
    def get_balance(self) -> dict:
        """Récupère le solde Twilio"""
        try:
            balance = self.client.api.v2010.balance.fetch()
            return {
                'success': True,
                'balance': balance.balance,
                'currency': balance.currency
            }
        except Exception as e:
            return {'success': False, 'error': str(e)}


class VonageSMSProvider(SMSProvider):
    """
    Provider SMS Vonage (anciennement Nexmo)
    
    Configuration requise:
        - api_key: Clé API Vonage
        - api_secret: Secret API
        - from_name: Nom ou numéro d'expéditeur
    """
    
    def __init__(self, config: dict):
        self.api_key = config.get('api_key')
        self.api_secret = config.get('api_secret')
        self.from_name = config.get('from_name', 'ExpressCargo')
        
        if not all([self.api_key, self.api_secret]):
            raise ValueError("Vonage config requires: api_key, api_secret")
        
        try:
            import vonage
            self.client = vonage.Client(key=self.api_key, secret=self.api_secret)
            self.sms = vonage.Sms(self.client)
        except ImportError:
            raise ImportError("Package 'vonage' not installed. Run: pip install vonage")
    
    def send(self, to: str, message: str) -> dict:
        """Envoie un SMS via Vonage"""
        try:
            # Supprimer le + du numéro pour Vonage
            to_clean = to.lstrip('+')
            
            response = self.sms.send_message({
                'from': self.from_name,
                'to': to_clean,
                'text': message,
                'type': 'unicode'  # Support des caractères spéciaux
            })
            
            if response['messages'][0]['status'] == '0':
                logger.info(f"SMS Vonage sent to {to}")
                return {
                    'success': True,
                    'provider': 'vonage',
                    'message_id': response['messages'][0]['message-id'],
                    'status': 'sent',
                    'to': to,
                    'remaining_balance': response['messages'][0].get('remaining-balance')
                }
            else:
                error = response['messages'][0].get('error-text', 'Unknown error')
                logger.error(f"Vonage SMS error: {error}")
                return {
                    'success': False,
                    'provider': 'vonage',
                    'error': error,
                    'to': to
                }
        except Exception as e:
            logger.error(f"Vonage SMS error: {str(e)}")
            return {
                'success': False,
                'provider': 'vonage',
                'error': str(e),
                'to': to
            }
    
    def get_balance(self) -> dict:
        """Récupère le solde Vonage"""
        try:
            response = self.client.account.get_balance()
            return {
                'success': True,
                'balance': response['value'],
                'auto_reload': response.get('autoReload', False)
            }
        except Exception as e:
            return {'success': False, 'error': str(e)}


class AfricasTalkingSMSProvider(SMSProvider):
    """
    Provider SMS Africa's Talking
    Idéal pour l'Afrique (Cameroun, Kenya, Nigeria, etc.)
    
    Configuration requise:
        - username: Nom d'utilisateur AT
        - api_key: Clé API
        - sender_id: ID expéditeur (optionnel, selon pays)
    """
    
    def __init__(self, config: dict):
        self.username = config.get('username')
        self.api_key = config.get('api_key')
        self.sender_id = config.get('sender_id')  # Optionnel
        
        if not all([self.username, self.api_key]):
            raise ValueError("Africa's Talking config requires: username, api_key")
        
        try:
            import africastalking
            africastalking.initialize(self.username, self.api_key)
            self.sms = africastalking.SMS
        except ImportError:
            raise ImportError("Package 'africastalking' not installed. Run: pip install africastalking")
    
    def send(self, to: str, message: str) -> dict:
        """Envoie un SMS via Africa's Talking"""
        try:
            # Africa's Talking accepte le format +XXX
            kwargs = {
                'message': message,
                'recipients': [to]
            }
            
            if self.sender_id:
                kwargs['sender_id'] = self.sender_id
            
            response = self.sms.send(**kwargs)
            
            recipients = response.get('SMSMessageData', {}).get('Recipients', [])
            
            if recipients and recipients[0].get('status') == 'Success':
                logger.info(f"SMS AT sent to {to}")
                return {
                    'success': True,
                    'provider': 'africastalking',
                    'message_id': recipients[0].get('messageId'),
                    'status': recipients[0].get('status'),
                    'cost': recipients[0].get('cost'),
                    'to': to
                }
            else:
                error = recipients[0].get('status', 'Unknown error') if recipients else 'No recipients'
                logger.error(f"AT SMS error: {error}")
                return {
                    'success': False,
                    'provider': 'africastalking',
                    'error': error,
                    'to': to
                }
        except Exception as e:
            logger.error(f"AT SMS error: {str(e)}")
            return {
                'success': False,
                'provider': 'africastalking',
                'error': str(e),
                'to': to
            }
    
    def get_balance(self) -> dict:
        """Récupère le solde Africa's Talking"""
        try:
            import africastalking
            application = africastalking.Application
            response = application.fetch_application_data()
            return {
                'success': True,
                'balance': response.get('UserData', {}).get('balance')
            }
        except Exception as e:
            return {'success': False, 'error': str(e)}


class SMSService:
    """
    Service SMS principal
    Gère la sélection du provider et l'envoi des messages
    """
    
    PROVIDERS = {
        'twilio': TwilioSMSProvider,
        'vonage': VonageSMSProvider,
        'nexmo': VonageSMSProvider,  # Alias
        'africastalking': AfricasTalkingSMSProvider,
        'africas_talking': AfricasTalkingSMSProvider  # Alias
    }
    
    def __init__(self, provider_name: str, config: dict):
        """
        Initialise le service SMS
        
        Args:
            provider_name: Nom du provider (twilio, vonage, africastalking)
            config: Configuration du provider
        """
        provider_class = self.PROVIDERS.get(provider_name.lower())
        
        if not provider_class:
            raise ValueError(f"Unknown SMS provider: {provider_name}. Available: {list(self.PROVIDERS.keys())}")
        
        self.provider = provider_class(config)
        self.provider_name = provider_name
    
    def send(self, to: str, message: str) -> dict:
        """
        Envoie un SMS
        
        Args:
            to: Numéro destinataire
            message: Message à envoyer
        
        Returns:
            Résultat de l'envoi
        """
        # Normaliser le numéro
        to = self._normalize_phone(to)
        
        # Vérifier la longueur du message
        if len(message) > 1600:
            logger.warning(f"SMS message truncated from {len(message)} to 1600 chars")
            message = message[:1597] + '...'
        
        return self.provider.send(to, message)
    
    def get_balance(self) -> dict:
        """Récupère le solde du compte"""
        return self.provider.get_balance()
    
    def _normalize_phone(self, phone: str) -> str:
        """
        Normalise un numéro au format E.164
        
        IMPORTANT: Ne force PAS de code pays par défaut.
        Le numéro doit être fourni avec son indicatif international complet.
        Supporte tous les pays (Afrique, Europe, Asie, etc.)
        
        Args:
            phone: Numéro de téléphone (format international recommandé)
        
        Returns:
            str: Numéro normalisé (format E.164: +XXXXXXXXXXXX)
        """
        if not phone:
            return phone
        
        # Supprimer espaces, tirets, parenthèses et caractères spéciaux
        phone = ''.join(c for c in phone if c.isdigit() or c == '+')
        
        # Gérer les différents formats d'entrée
        if phone.startswith('+'):
            # Déjà au format international
            return phone
        elif phone.startswith('00'):
            # Format international avec 00 (ex: 00237699000000, 0033612345678)
            return '+' + phone[2:]
        else:
            # Numéro sans indicatif - on ajoute juste le +
            # Le tenant/utilisateur doit fournir le numéro complet avec indicatif pays
            return '+' + phone
