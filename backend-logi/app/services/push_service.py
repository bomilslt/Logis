"""
Service Push Notifications - Envoi de notifications push
Providers supportés: Firebase Cloud Messaging (FCM), OneSignal, Web Push (VAPID)
"""

import logging
import json
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)


class PushProvider(ABC):
    """Interface abstraite pour les providers Push"""
    
    @abstractmethod
    def send_to_token(self, token: str, title: str, body: str, data: dict = None) -> dict:
        """Envoie une notification à un token spécifique"""
        pass
    
    @abstractmethod
    def send_to_tokens(self, tokens: List[str], title: str, body: str, data: dict = None) -> dict:
        """Envoie une notification à plusieurs tokens"""
        pass
    
    @abstractmethod
    def send_to_topic(self, topic: str, title: str, body: str, data: dict = None) -> dict:
        """Envoie une notification à un topic"""
        pass


class FirebasePushProvider(PushProvider):
    """
    Provider Firebase Cloud Messaging (FCM)
    Supporte Android, iOS et Web
    
    Configuration requise:
        - credentials_path: Chemin vers le fichier JSON des credentials
        OU
        - credentials_json: Contenu JSON des credentials (pour stockage en DB)
        - project_id: ID du projet Firebase (optionnel si dans credentials)
    """
    
    def __init__(self, config: dict):
        self.credentials_path = config.get('credentials_path')
        self.credentials_json = config.get('credentials_json')
        self.project_id = config.get('project_id')
        
        if not self.credentials_path and not self.credentials_json:
            raise ValueError("Firebase config requires: credentials_path or credentials_json")
        
        try:
            import firebase_admin
            from firebase_admin import credentials, messaging
            self.messaging = messaging
            
            # Vérifier si déjà initialisé
            try:
                self.app = firebase_admin.get_app()
            except ValueError:
                # Initialiser Firebase
                if self.credentials_path:
                    cred = credentials.Certificate(self.credentials_path)
                else:
                    cred_dict = json.loads(self.credentials_json) if isinstance(self.credentials_json, str) else self.credentials_json
                    cred = credentials.Certificate(cred_dict)
                
                self.app = firebase_admin.initialize_app(cred)
                
        except ImportError:
            raise ImportError("Package 'firebase-admin' not installed. Run: pip install firebase-admin")
    
    def send_to_token(self, token: str, title: str, body: str, data: dict = None) -> dict:
        """Envoie une notification à un token FCM"""
        try:
            message = self.messaging.Message(
                notification=self.messaging.Notification(
                    title=title,
                    body=body
                ),
                data=data or {},
                token=token
            )
            
            response = self.messaging.send(message)
            
            logger.info(f"FCM sent to token: {response}")
            return {
                'success': True,
                'provider': 'firebase',
                'message_id': response,
                'token': token[:20] + '...'
            }
        except self.messaging.UnregisteredError:
            logger.warning(f"FCM token unregistered: {token[:20]}...")
            return {
                'success': False,
                'provider': 'firebase',
                'error': 'Token unregistered',
                'should_remove': True
            }
        except Exception as e:
            logger.error(f"FCM error: {str(e)}")
            return {
                'success': False,
                'provider': 'firebase',
                'error': str(e)
            }
    
    def send_to_tokens(self, tokens: List[str], title: str, body: str, data: dict = None) -> dict:
        """Envoie une notification à plusieurs tokens FCM"""
        try:
            message = self.messaging.MulticastMessage(
                notification=self.messaging.Notification(
                    title=title,
                    body=body
                ),
                data=data or {},
                tokens=tokens
            )
            
            response = self.messaging.send_multicast(message)
            
            logger.info(f"FCM multicast: {response.success_count} success, {response.failure_count} failed")
            
            # Identifier les tokens invalides
            failed_tokens = []
            if response.failure_count > 0:
                for idx, resp in enumerate(response.responses):
                    if not resp.success:
                        failed_tokens.append({
                            'token': tokens[idx][:20] + '...',
                            'error': str(resp.exception)
                        })
            
            return {
                'success': response.success_count > 0,
                'provider': 'firebase',
                'success_count': response.success_count,
                'failure_count': response.failure_count,
                'failed_tokens': failed_tokens
            }
        except Exception as e:
            logger.error(f"FCM multicast error: {str(e)}")
            return {
                'success': False,
                'provider': 'firebase',
                'error': str(e)
            }
    
    def send_to_topic(self, topic: str, title: str, body: str, data: dict = None) -> dict:
        """Envoie une notification à un topic FCM"""
        try:
            message = self.messaging.Message(
                notification=self.messaging.Notification(
                    title=title,
                    body=body
                ),
                data=data or {},
                topic=topic
            )
            
            response = self.messaging.send(message)
            
            logger.info(f"FCM topic '{topic}' sent: {response}")
            return {
                'success': True,
                'provider': 'firebase',
                'message_id': response,
                'topic': topic
            }
        except Exception as e:
            logger.error(f"FCM topic error: {str(e)}")
            return {
                'success': False,
                'provider': 'firebase',
                'error': str(e)
            }
    
    def subscribe_to_topic(self, tokens: List[str], topic: str) -> dict:
        """Abonne des tokens à un topic"""
        try:
            response = self.messaging.subscribe_to_topic(tokens, topic)
            return {
                'success': response.success_count > 0,
                'success_count': response.success_count,
                'failure_count': response.failure_count
            }
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def unsubscribe_from_topic(self, tokens: List[str], topic: str) -> dict:
        """Désabonne des tokens d'un topic"""
        try:
            response = self.messaging.unsubscribe_from_topic(tokens, topic)
            return {
                'success': response.success_count > 0,
                'success_count': response.success_count,
                'failure_count': response.failure_count
            }
        except Exception as e:
            return {'success': False, 'error': str(e)}


class OneSignalPushProvider(PushProvider):
    """
    Provider OneSignal
    Solution populaire multi-plateforme
    
    Configuration requise:
        - app_id: ID de l'application OneSignal
        - api_key: REST API Key
    """
    
    BASE_URL = "https://onesignal.com/api/v1"
    
    def __init__(self, config: dict):
        self.app_id = config.get('app_id')
        self.api_key = config.get('api_key')
        
        if not all([self.app_id, self.api_key]):
            raise ValueError("OneSignal config requires: app_id, api_key")
        
        try:
            import requests
            self.requests = requests
        except ImportError:
            raise ImportError("Package 'requests' not installed. Run: pip install requests")
    
    def _send_notification(self, payload: dict) -> dict:
        """Méthode interne pour envoyer une notification"""
        headers = {
            'Authorization': f'Basic {self.api_key}',
            'Content-Type': 'application/json'
        }
        
        payload['app_id'] = self.app_id
        
        response = self.requests.post(
            f"{self.BASE_URL}/notifications",
            headers=headers,
            json=payload
        )
        
        return response.json()
    
    def send_to_token(self, token: str, title: str, body: str, data: dict = None) -> dict:
        """Envoie une notification à un player_id OneSignal"""
        try:
            payload = {
                'include_player_ids': [token],
                'headings': {'en': title},
                'contents': {'en': body}
            }
            
            if data:
                payload['data'] = data
            
            result = self._send_notification(payload)
            
            if 'id' in result:
                logger.info(f"OneSignal sent: {result['id']}")
                return {
                    'success': True,
                    'provider': 'onesignal',
                    'notification_id': result['id']
                }
            else:
                error = result.get('errors', ['Unknown error'])
                logger.error(f"OneSignal error: {error}")
                return {
                    'success': False,
                    'provider': 'onesignal',
                    'error': error
                }
        except Exception as e:
            logger.error(f"OneSignal error: {str(e)}")
            return {
                'success': False,
                'provider': 'onesignal',
                'error': str(e)
            }
    
    def send_to_tokens(self, tokens: List[str], title: str, body: str, data: dict = None) -> dict:
        """Envoie une notification à plusieurs player_ids"""
        try:
            payload = {
                'include_player_ids': tokens,
                'headings': {'en': title},
                'contents': {'en': body}
            }
            
            if data:
                payload['data'] = data
            
            result = self._send_notification(payload)
            
            if 'id' in result:
                return {
                    'success': True,
                    'provider': 'onesignal',
                    'notification_id': result['id'],
                    'recipients': result.get('recipients', 0)
                }
            else:
                return {
                    'success': False,
                    'provider': 'onesignal',
                    'error': result.get('errors', ['Unknown error'])
                }
        except Exception as e:
            return {
                'success': False,
                'provider': 'onesignal',
                'error': str(e)
            }
    
    def send_to_topic(self, topic: str, title: str, body: str, data: dict = None) -> dict:
        """Envoie une notification à un segment/tag OneSignal"""
        try:
            payload = {
                'included_segments': [topic],
                'headings': {'en': title},
                'contents': {'en': body}
            }
            
            if data:
                payload['data'] = data
            
            result = self._send_notification(payload)
            
            if 'id' in result:
                return {
                    'success': True,
                    'provider': 'onesignal',
                    'notification_id': result['id'],
                    'recipients': result.get('recipients', 0)
                }
            else:
                return {
                    'success': False,
                    'provider': 'onesignal',
                    'error': result.get('errors', ['Unknown error'])
                }
        except Exception as e:
            return {
                'success': False,
                'provider': 'onesignal',
                'error': str(e)
            }
    
    def send_to_all(self, title: str, body: str, data: dict = None) -> dict:
        """Envoie une notification à tous les utilisateurs"""
        return self.send_to_topic('All', title, body, data)


class WebPushProvider(PushProvider):
    """
    Provider Web Push (VAPID)
    Pour les notifications navigateur sans Firebase
    
    Configuration requise:
        - vapid_private_key: Clé privée VAPID
        - vapid_public_key: Clé publique VAPID (à partager avec le frontend)
        - vapid_claims_email: Email de contact
    """
    
    def __init__(self, config: dict):
        self.private_key = config.get('vapid_private_key')
        self.public_key = config.get('vapid_public_key')
        self.claims_email = config.get('vapid_claims_email')
        
        if not all([self.private_key, self.public_key, self.claims_email]):
            raise ValueError("WebPush config requires: vapid_private_key, vapid_public_key, vapid_claims_email")
        
        try:
            from pywebpush import webpush, WebPushException
            self.webpush = webpush
            self.WebPushException = WebPushException
        except ImportError:
            raise ImportError("Package 'pywebpush' not installed. Run: pip install pywebpush")
    
    def send_to_token(self, token: str, title: str, body: str, data: dict = None) -> dict:
        """
        Envoie une notification Web Push
        
        Args:
            token: Subscription info JSON (endpoint, keys)
            title: Titre
            body: Message
            data: Données additionnelles
        """
        try:
            # Parser le token (subscription info)
            if isinstance(token, str):
                subscription_info = json.loads(token)
            else:
                subscription_info = token
            
            # Payload de la notification
            payload = json.dumps({
                'title': title,
                'body': body,
                'data': data or {},
                'icon': data.get('icon') if data else None,
                'badge': data.get('badge') if data else None
            })
            
            self.webpush(
                subscription_info=subscription_info,
                data=payload,
                vapid_private_key=self.private_key,
                vapid_claims={'sub': f'mailto:{self.claims_email}'}
            )
            
            logger.info(f"WebPush sent to {subscription_info.get('endpoint', '')[:50]}...")
            return {
                'success': True,
                'provider': 'webpush'
            }
        except self.WebPushException as e:
            logger.error(f"WebPush error: {str(e)}")
            # Vérifier si le token est expiré
            if e.response and e.response.status_code in [404, 410]:
                return {
                    'success': False,
                    'provider': 'webpush',
                    'error': 'Subscription expired',
                    'should_remove': True
                }
            return {
                'success': False,
                'provider': 'webpush',
                'error': str(e)
            }
        except Exception as e:
            logger.error(f"WebPush error: {str(e)}")
            return {
                'success': False,
                'provider': 'webpush',
                'error': str(e)
            }
    
    def send_to_tokens(self, tokens: List[str], title: str, body: str, data: dict = None) -> dict:
        """Envoie une notification à plusieurs subscriptions"""
        results = {
            'success': False,
            'provider': 'webpush',
            'success_count': 0,
            'failure_count': 0,
            'failed_tokens': []
        }
        
        for token in tokens:
            result = self.send_to_token(token, title, body, data)
            if result.get('success'):
                results['success_count'] += 1
            else:
                results['failure_count'] += 1
                if result.get('should_remove'):
                    results['failed_tokens'].append(token)
        
        results['success'] = results['success_count'] > 0
        return results
    
    def send_to_topic(self, topic: str, title: str, body: str, data: dict = None) -> dict:
        """Web Push ne supporte pas les topics nativement"""
        return {
            'success': False,
            'provider': 'webpush',
            'error': 'Topics not supported for Web Push. Use send_to_tokens instead.'
        }


class PushService:
    """
    Service Push principal
    Gère la sélection du provider et l'envoi des notifications
    """
    
    PROVIDERS = {
        'firebase': FirebasePushProvider,
        'fcm': FirebasePushProvider,  # Alias
        'onesignal': OneSignalPushProvider,
        'webpush': WebPushProvider,
        'vapid': WebPushProvider  # Alias
    }
    
    def __init__(self, provider_name: str, config: dict):
        """
        Initialise le service Push
        
        Args:
            provider_name: Nom du provider (firebase, onesignal, webpush)
            config: Configuration du provider
        """
        provider_class = self.PROVIDERS.get(provider_name.lower())
        
        if not provider_class:
            raise ValueError(f"Unknown Push provider: {provider_name}. Available: {list(self.PROVIDERS.keys())}")
        
        self.provider = provider_class(config)
        self.provider_name = provider_name
    
    def send_to_token(self, token: str, title: str, body: str, data: dict = None) -> dict:
        """Envoie une notification à un token"""
        return self.provider.send_to_token(token, title, body, data)
    
    def send_to_tokens(self, tokens: List[str], title: str, body: str, data: dict = None) -> dict:
        """Envoie une notification à plusieurs tokens"""
        return self.provider.send_to_tokens(tokens, title, body, data)
    
    def send_to_topic(self, topic: str, title: str, body: str, data: dict = None) -> dict:
        """Envoie une notification à un topic"""
        return self.provider.send_to_topic(topic, title, body, data)
