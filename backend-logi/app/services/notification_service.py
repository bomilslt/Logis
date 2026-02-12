"""
Service de notifications unifié
Gère l'envoi de SMS, WhatsApp, Email et Push notifications
Utilise la configuration du tenant pour sélectionner les providers
"""

import logging
from typing import Optional, List, Dict, Any
from app.models import TenantConfig, Notification, User
from app import db

logger = logging.getLogger(__name__)


class NotificationService:
    """
    Service centralisé pour l'envoi de notifications
    
    Charge automatiquement la configuration du tenant et initialise
    les services appropriés (SMS, WhatsApp, Email)
    
    Usage:
        service = NotificationService(tenant_id)
        service.send_sms('+237699000000', 'Votre colis est arrivé')
        service.send_whatsapp('+237699000000', 'Votre colis est arrivé')
        service.send_email('client@email.com', 'Sujet', 'Message')
    """
    
    def __init__(self, tenant_id: str):
        """
        Initialise le service avec la configuration du tenant
        
        Args:
            tenant_id: ID du tenant
        """
        self.tenant_id = tenant_id
        self.config = self._load_config()
        
        # Services initialisés à la demande (lazy loading)
        self._sms_service = None
        self._whatsapp_service = None
        self._email_service = None
        self._push_service = None
    
    def _load_config(self) -> dict:
        """Charge la configuration des notifications du tenant"""
        tenant_config = TenantConfig.query.filter_by(tenant_id=self.tenant_id).first()
        if tenant_config and tenant_config.config_data:
            return tenant_config.config_data.get('notifications', {})
        return {}
    
    def reload_config(self):
        """Recharge la configuration (après modification)"""
        self.config = self._load_config()
        self._sms_service = None
        self._whatsapp_service = None
        self._email_service = None
        self._push_service = None
    
    # ==================== SMS ====================
    
    @property
    def sms_service(self):
        """Lazy loading du service SMS"""
        if self._sms_service is None:
            sms_config = self.config.get('sms', {})
            provider = sms_config.get('provider')
            
            if provider:
                try:
                    from app.services.sms_service import SMSService
                    self._sms_service = SMSService(provider, sms_config.get('config', {}))
                except Exception as e:
                    logger.error(f"Failed to init SMS service: {e}")
                    self._sms_service = None
        
        return self._sms_service
    
    def send_sms(self, phone: str, message: str) -> dict:
        """
        Envoie un SMS
        
        Args:
            phone: Numéro de téléphone (format international)
            message: Message à envoyer
        
        Returns:
            dict: Résultat de l'envoi
        """
        if not self.sms_service:
            logger.warning(f"SMS not configured for tenant {self.tenant_id}")
            return {
                'success': False,
                'error': 'SMS provider not configured',
                'to': phone
            }
        
        # Normaliser le numéro
        phone = self._normalize_phone(phone)
        
        try:
            result = self.sms_service.send(phone, message)
            
            # Log l'envoi
            logger.info(f"SMS to {phone}: {'success' if result.get('success') else 'failed'}")
            
            return result
        except Exception as e:
            logger.error(f"SMS send error: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'to': phone
            }
    
    # ==================== WHATSAPP ====================
    
    @property
    def whatsapp_service(self):
        """Lazy loading du service WhatsApp"""
        if self._whatsapp_service is None:
            wa_config = self.config.get('whatsapp', {})
            provider = wa_config.get('provider')
            
            if provider:
                try:
                    from app.services.whatsapp_service import WhatsAppService
                    self._whatsapp_service = WhatsAppService(provider, wa_config.get('config', {}))
                except Exception as e:
                    logger.error(f"Failed to init WhatsApp service: {e}")
                    self._whatsapp_service = None
        
        return self._whatsapp_service
    
    def send_whatsapp(self, phone: str, message: str, template: str = None, parameters: list = None) -> dict:
        """
        Envoie un message WhatsApp
        
        Args:
            phone: Numéro de téléphone
            message: Message à envoyer (ignoré si template fourni)
            template: Nom du template (optionnel)
            parameters: Paramètres du template (optionnel)
        
        Returns:
            dict: Résultat de l'envoi
        """
        if not self.whatsapp_service:
            logger.warning(f"WhatsApp not configured for tenant {self.tenant_id}")
            return {
                'success': False,
                'error': 'WhatsApp provider not configured',
                'to': phone
            }
        
        phone = self._normalize_phone(phone)
        
        try:
            if template:
                result = self.whatsapp_service.send_template(phone, template, parameters)
            else:
                result = self.whatsapp_service.send_message(phone, message)
            
            logger.info(f"WhatsApp to {phone}: {'success' if result.get('success') else 'failed'}")
            
            return result
        except Exception as e:
            logger.error(f"WhatsApp send error: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'to': phone
            }
    
    # ==================== EMAIL ====================
    
    @property
    def email_service(self):
        """Lazy loading du service Email"""
        if self._email_service is None:
            email_config = self.config.get('email', {})
            provider = email_config.get('provider')
            
            if provider:
                try:
                    from app.services.email_service import EmailService
                    self._email_service = EmailService(provider, email_config.get('config', {}))
                except Exception as e:
                    logger.error(f"Failed to init Email service: {e}")
                    self._email_service = None
        
        return self._email_service
    
    def send_email(self, email: str, subject: str, body: str, html: str = None) -> dict:
        """
        Envoie un email
        
        Args:
            email: Adresse email
            subject: Sujet
            body: Corps du message (texte)
            html: Corps du message (HTML, optionnel)
        
        Returns:
            dict: Résultat de l'envoi
        """
        if not self.email_service:
            logger.warning(f"Email not configured for tenant {self.tenant_id}")
            return {
                'success': False,
                'error': 'Email provider not configured',
                'to': email
            }
        
        try:
            result = self.email_service.send(email, subject, body, html)
            
            logger.info(f"Email to {email}: {'success' if result.get('success') else 'failed'}")
            
            return result
        except Exception as e:
            logger.error(f"Email send error: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'to': email
            }
    
    # ==================== PUSH NOTIFICATIONS ====================
    
    @property
    def push_service(self):
        """Lazy loading du service Push"""
        if self._push_service is None:
            push_config = self.config.get('push', {})
            provider = push_config.get('provider')
            
            if provider:
                try:
                    from app.services.push_service import PushService
                    self._push_service = PushService(provider, push_config.get('config', {}))
                except Exception as e:
                    logger.error(f"Failed to init Push service: {e}")
                    self._push_service = None
        
        return self._push_service
    
    def send_push(self, user_id: str, title: str, message: str, data: dict = None) -> dict:
        """
        Crée une notification in-app et envoie via push si configuré
        
        Args:
            user_id: ID de l'utilisateur
            title: Titre de la notification
            message: Message
            data: Données additionnelles (optionnel)
        
        Returns:
            dict: Résultat
        """
        result = {
            'success': False,
            'notification_id': None,
            'push_sent': False
        }
        
        try:
            # 1. Créer la notification in-app
            notification = Notification(
                user_id=user_id,
                title=title,
                message=message,
                type='push',
                data=data
            )
            db.session.add(notification)
            db.session.commit()
            
            result['notification_id'] = notification.id
            result['success'] = True
            
            logger.info(f"Push notification created for user {user_id}")
            
            # 2. Envoyer via le provider push si configuré
            if self.push_service:
                # Récupérer les tokens push de l'utilisateur
                from app.models import PushSubscription
                subscriptions = PushSubscription.query.filter_by(
                    user_id=user_id,
                    is_active=True
                ).all()
                
                if subscriptions:
                    tokens = [sub.token for sub in subscriptions]
                    push_result = self.push_service.send_to_tokens(
                        tokens, title, message, data
                    )
                    result['push_sent'] = push_result.get('success', False)
                    result['push_result'] = push_result
                    
                    # Marquer les tokens invalides
                    if push_result.get('failed_tokens'):
                        for failed in push_result['failed_tokens']:
                            if isinstance(failed, dict) and failed.get('should_remove'):
                                # Désactiver le token invalide
                                PushSubscription.query.filter_by(
                                    token=failed.get('token')
                                ).update({'is_active': False})
                        db.session.commit()
            
            return result
            
        except Exception as e:
            logger.error(f"Push notification error: {str(e)}")
            db.session.rollback()
            return {
                'success': False,
                'error': str(e)
            }
    
    def send_push_to_token(self, token: str, title: str, message: str, data: dict = None) -> dict:
        """
        Envoie une notification push directement à un token
        
        Args:
            token: Token push (FCM, OneSignal, ou subscription WebPush)
            title: Titre
            message: Message
            data: Données additionnelles
        
        Returns:
            dict: Résultat de l'envoi
        """
        if not self.push_service:
            logger.warning(f"Push not configured for tenant {self.tenant_id}")
            return {
                'success': False,
                'error': 'Push provider not configured'
            }
        
        try:
            return self.push_service.send_to_token(token, title, message, data)
        except Exception as e:
            logger.error(f"Push send error: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def send_push_to_topic(self, topic: str, title: str, message: str, data: dict = None) -> dict:
        """
        Envoie une notification push à un topic/segment
        
        Args:
            topic: Nom du topic (FCM) ou segment (OneSignal)
            title: Titre
            message: Message
            data: Données additionnelles
        
        Returns:
            dict: Résultat de l'envoi
        """
        if not self.push_service:
            logger.warning(f"Push not configured for tenant {self.tenant_id}")
            return {
                'success': False,
                'error': 'Push provider not configured'
            }
        
        try:
            return self.push_service.send_to_topic(topic, title, message, data)
        except Exception as e:
            logger.error(f"Push topic send error: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    # ==================== MULTI-CHANNEL ====================
    
    def send_notification(
        self,
        user: User,
        title: str,
        message: str,
        channels: List[str] = None,
        html_email: str = None,
        whatsapp_template: str = None,
        whatsapp_params: list = None
    ) -> Dict[str, Any]:
        """
        Envoie une notification sur plusieurs canaux
        
        Args:
            user: Objet User
            title: Titre
            message: Message
            channels: Liste des canaux ['push', 'sms', 'whatsapp', 'email']
            html_email: Version HTML pour l'email
            whatsapp_template: Template WhatsApp (optionnel)
            whatsapp_params: Paramètres du template
        
        Returns:
            dict: Résultats par canal
        """
        if channels is None:
            channels = ['push']
        
        results = {}
        
        # Push (in-app)
        if 'push' in channels:
            results['push'] = self.send_push(user.id, title, message)
        
        # SMS
        if 'sms' in channels and user.phone and getattr(user, 'notify_sms', True):
            results['sms'] = self.send_sms(user.phone, message)
        
        # WhatsApp
        if 'whatsapp' in channels and user.phone and getattr(user, 'notify_whatsapp', True):
            results['whatsapp'] = self.send_whatsapp(
                user.phone, 
                message, 
                template=whatsapp_template,
                parameters=whatsapp_params
            )
        
        # Email
        if 'email' in channels and user.email and getattr(user, 'notify_email', True):
            results['email'] = self.send_email(user.email, title, message, html_email)
        
        return results
    
    def send_bulk_notification(
        self,
        users: List[User],
        title: str,
        message: str,
        channels: List[str] = None
    ) -> Dict[str, Any]:
        """
        Envoie une notification à plusieurs utilisateurs
        
        Args:
            users: Liste d'utilisateurs
            title: Titre
            message: Message
            channels: Canaux
        
        Returns:
            dict: Statistiques d'envoi
        """
        stats = {
            'total': len(users),
            'success': 0,
            'failed': 0,
            'by_channel': {}
        }
        
        for user in users:
            try:
                results = self.send_notification(user, title, message, channels)
                
                # Compter les succès
                for channel, result in results.items():
                    if channel not in stats['by_channel']:
                        stats['by_channel'][channel] = {'success': 0, 'failed': 0}
                    
                    if result.get('success'):
                        stats['by_channel'][channel]['success'] += 1
                    else:
                        stats['by_channel'][channel]['failed'] += 1
                
                # Au moins un canal a réussi
                if any(r.get('success') for r in results.values()):
                    stats['success'] += 1
                else:
                    stats['failed'] += 1
                    
            except Exception as e:
                logger.error(f"Bulk notification error for user {user.id}: {e}")
                stats['failed'] += 1
        
        return stats
    
    # ==================== TEMPLATES ====================
    
    def get_templates(self) -> dict:
        """Récupère les templates de messages configurés"""
        return self.config.get('templates', {})
    
    def render_template(self, template_key: str, variables: dict) -> Dict[str, str]:
        """
        Rend un template avec les variables
        
        Args:
            template_key: Clé du template (ex: 'package_received')
            variables: Variables à substituer
        
        Returns:
            dict: Messages rendus par canal
        """
        templates = self.get_templates()
        template = templates.get(template_key, {})
        
        result = {}
        
        for channel in ['sms', 'whatsapp', 'email', 'push']:
            if channel in template:
                try:
                    result[channel] = template[channel].format(**variables)
                except KeyError as e:
                    logger.warning(f"Missing variable in template {template_key}: {e}")
                    result[channel] = template[channel]
        
        return result
    
    def send_templated_notification(
        self,
        user: User,
        template_key: str,
        variables: dict,
        channels: List[str] = None
    ) -> Dict[str, Any]:
        """
        Envoie une notification basée sur un template
        
        Args:
            user: Utilisateur
            template_key: Clé du template
            variables: Variables pour le template
            channels: Canaux (défaut: tous)
        
        Returns:
            dict: Résultats par canal
        """
        messages = self.render_template(template_key, variables)
        
        if not messages:
            return {'error': f'Template {template_key} not found'}
        
        if channels is None:
            channels = list(messages.keys())
        
        results = {}
        
        # Push
        if 'push' in channels and 'push' in messages:
            title = variables.get('title', 'Notification')
            results['push'] = self.send_push(user.id, title, messages['push'])
        
        # SMS
        if 'sms' in channels and 'sms' in messages and user.phone and user.notify_sms:
            results['sms'] = self.send_sms(user.phone, messages['sms'])
        
        # WhatsApp
        if 'whatsapp' in channels and 'whatsapp' in messages and user.phone:
            results['whatsapp'] = self.send_whatsapp(user.phone, messages['whatsapp'])
        
        # Email
        if 'email' in channels and 'email' in messages and user.email and user.notify_email:
            subject = variables.get('subject', variables.get('title', 'Notification'))
            results['email'] = self.send_email(user.email, subject, messages['email'])
        
        return results
    
    # ==================== HELPERS ====================
    
    def _normalize_phone(self, phone: str) -> str:
        """
        Normalise un numéro de téléphone au format international E.164
        
        IMPORTANT: Ne force PAS de code pays par défaut.
        Le numéro doit être fourni avec son indicatif international complet.
        
        Args:
            phone: Numéro de téléphone (format international recommandé)
        
        Returns:
            str: Numéro normalisé (format E.164: +XXXXXXXXXXXX)
        """
        if not phone:
            return phone
        
        # Supprimer les espaces, tirets, parenthèses et autres caractères spéciaux
        phone = ''.join(c for c in phone if c.isdigit() or c == '+')
        
        # Gérer les différents formats d'entrée
        if phone.startswith('+'):
            # Déjà au format international, on garde tel quel
            return phone
        elif phone.startswith('00'):
            # Format international avec 00 (ex: 00237699000000)
            return '+' + phone[2:]
        else:
            # Numéro sans indicatif - on ajoute juste le +
            # Le tenant/utilisateur doit fournir le numéro complet avec indicatif
            return '+' + phone
    
    # ==================== EVENT-BASED NOTIFICATIONS ====================
    
    def get_event_channels(self, event_type: str) -> List[str]:
        """
        Récupère les canaux activés pour un type d'événement
        
        Args:
            event_type: Type d'événement (package_received, package_arrived, etc.)
        
        Returns:
            list: Liste des canaux activés ['sms', 'whatsapp', 'push', 'email']
        """
        types_config = self.config.get('types', {})
        
        # Valeurs par défaut si non configuré
        defaults = {
            'package_received': ['push'],
            'package_shipped': ['sms', 'push'],
            'package_arrived': ['sms', 'whatsapp', 'push'],
            'ready_pickup': ['sms', 'whatsapp', 'push'],
            'package_picked_up': ['sms', 'whatsapp', 'push', 'email'],
            'payment_received': ['sms', 'push'],
            'payment_reminder': ['sms'],
            'departure_reminder': ['sms', 'whatsapp']
        }
        
        return types_config.get(event_type, defaults.get(event_type, ['push']))
    
    def is_channel_configured(self, channel: str) -> bool:
        """Vérifie si un canal est configuré et activé"""
        channel_config = self.config.get(channel, {})
        
        # Push est toujours disponible
        if channel == 'push':
            return channel_config.get('enabled', True)
        
        # Autres canaux nécessitent un provider
        return bool(channel_config.get('provider')) and channel_config.get('enabled', False)
    
    def send_event_notification(
        self,
        event_type: str,
        user: User,
        variables: dict,
        title: str = None
    ) -> Dict[str, Any]:
        """
        Envoie une notification basée sur un événement
        Utilise la configuration des canaux par événement
        
        Args:
            event_type: Type d'événement (package_received, package_arrived, etc.)
            user: Utilisateur destinataire
            variables: Variables pour les templates ({tracking}, {client_name}, etc.)
            title: Titre optionnel (pour push/email)
        
        Returns:
            dict: Résultats par canal
        """
        # Récupérer les canaux activés pour cet événement
        enabled_channels = self.get_event_channels(event_type)
        
        if not enabled_channels:
            logger.info(f"No channels enabled for event {event_type}")
            return {'skipped': True, 'reason': 'No channels enabled'}
        
        # Filtrer les canaux configurés
        channels_to_use = [ch for ch in enabled_channels if self.is_channel_configured(ch)]
        
        if not channels_to_use:
            logger.warning(f"Channels {enabled_channels} enabled but not configured for event {event_type}")
            return {'skipped': True, 'reason': 'Channels not configured'}
        
        # Récupérer les templates
        templates = self.get_templates()
        event_template = templates.get(event_type, {})
        
        # Préparer les messages
        results = {}
        
        # Titre par défaut
        if not title:
            title_map = {
                'package_received': 'Colis reçu',
                'package_shipped': 'Colis expédié',
                'package_arrived': 'Colis arrivé',
                'ready_pickup': 'Prêt pour retrait',
                'package_picked_up': 'Colis retiré',
                'payment_received': 'Paiement reçu',
                'payment_reminder': 'Rappel de paiement',
                'departure_reminder': 'Rappel de départ'
            }
            title = title_map.get(event_type, 'Notification')
        
        # Envoyer sur chaque canal
        for channel in channels_to_use:
            try:
                # Récupérer le template du canal
                template_text = event_template.get(channel, '')
                
                if isinstance(template_text, dict):
                    # Pour email: {subject, body}
                    message = template_text.get('body', '')
                    subject = template_text.get('subject', title)
                else:
                    message = template_text
                    subject = title
                
                # Substituer les variables
                if message:
                    try:
                        message = message.format(**variables)
                        subject = subject.format(**variables) if subject else title
                    except KeyError as e:
                        logger.warning(f"Missing variable in template: {e}")
                else:
                    # Message par défaut si pas de template
                    message = f"{title}: {variables.get('tracking', '')}"
                
                # Envoyer selon le canal
                if channel == 'push':
                    results['push'] = self.send_push(user.id, title, message, variables)
                    
                elif channel == 'sms' and user.phone:
                    if getattr(user, 'notify_sms', True):
                        results['sms'] = self.send_sms(user.phone, message)
                    else:
                        results['sms'] = {'skipped': True, 'reason': 'User disabled SMS'}
                        
                elif channel == 'whatsapp' and user.phone:
                    if getattr(user, 'notify_whatsapp', True):
                        results['whatsapp'] = self.send_whatsapp(user.phone, message)
                    else:
                        results['whatsapp'] = {'skipped': True, 'reason': 'User disabled WhatsApp'}
                        
                elif channel == 'email' and user.email:
                    if getattr(user, 'notify_email', True):
                        results['email'] = self.send_email(user.email, subject, message)
                    else:
                        results['email'] = {'skipped': True, 'reason': 'User disabled Email'}
                        
            except Exception as e:
                logger.error(f"Error sending {channel} notification: {e}")
                results[channel] = {'success': False, 'error': str(e)}
        
        return results
    
    # ==================== STATUS CHECK ====================
    
    def get_status(self) -> dict:
        """
        Vérifie le statut des services configurés
        
        Returns:
            dict: Statut de chaque service
        """
        status = {
            'sms': {
                'configured': bool(self.config.get('sms', {}).get('provider')),
                'provider': self.config.get('sms', {}).get('provider'),
                'ready': self.sms_service is not None
            },
            'whatsapp': {
                'configured': bool(self.config.get('whatsapp', {}).get('provider')),
                'provider': self.config.get('whatsapp', {}).get('provider'),
                'ready': self.whatsapp_service is not None
            },
            'email': {
                'configured': bool(self.config.get('email', {}).get('provider')),
                'provider': self.config.get('email', {}).get('provider'),
                'ready': self.email_service is not None
            },
            'push': {
                'configured': bool(self.config.get('push', {}).get('provider')),
                'provider': self.config.get('push', {}).get('provider'),
                'ready': self.push_service is not None
            }
        }
        
        return status
    
    def test_sms(self, phone: str) -> dict:
        """Envoie un SMS de test"""
        return self.send_sms(phone, "Ceci est un message de test. Express Cargo.")
    
    def test_whatsapp(self, phone: str) -> dict:
        """Envoie un WhatsApp de test"""
        return self.send_whatsapp(phone, "Ceci est un message de test. Express Cargo.")
    
    def test_email(self, email: str) -> dict:
        """Envoie un email de test"""
        return self.send_email(
            email,
            "Test Express Cargo",
            "Ceci est un email de test.\n\nExpress Cargo",
            "<h1>Test Express Cargo</h1><p>Ceci est un email de test.</p>"
        )
