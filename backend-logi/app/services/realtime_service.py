"""
Service Temps Réel - WebSocket avec Flask-SocketIO
==================================================

Gère les connexions WebSocket pour les mises à jour en temps réel.
Permet de notifier les clients des changements de statut, nouveaux messages, etc.
"""

import logging
from typing import Optional
from flask import request
from flask_jwt_extended import decode_token
from functools import wraps

logger = logging.getLogger(__name__)

# Import conditionnel de SocketIO
try:
    from flask_socketio import SocketIO, emit, join_room, leave_room, disconnect
    SOCKETIO_AVAILABLE = True
except ImportError:
    SOCKETIO_AVAILABLE = False
    logger.warning("flask-socketio non installé - pip install flask-socketio")

# Instance globale SocketIO (initialisée dans create_app)
socketio = None


def init_socketio(app, **kwargs):
    """
    Initialise Flask-SocketIO avec l'application
    
    Args:
        app: Application Flask
        **kwargs: Options SocketIO (cors_allowed_origins, async_mode, etc.)
    
    Returns:
        Instance SocketIO
    """
    global socketio
    
    if not SOCKETIO_AVAILABLE:
        logger.error("Flask-SocketIO non disponible")
        return None
    
    # Configuration par défaut
    default_kwargs = {
        'cors_allowed_origins': app.config.get('CORS_ORIGINS', '*'),
        'async_mode': 'eventlet',  # ou 'gevent', 'threading'
        'logger': True,
        'engineio_logger': False,
    }
    default_kwargs.update(kwargs)
    
    socketio = SocketIO(app, **default_kwargs)
    
    # Enregistrer les handlers
    register_handlers(socketio)
    
    logger.info("Flask-SocketIO initialisé")
    
    return socketio


def get_socketio():
    """Récupère l'instance SocketIO"""
    return socketio


def authenticated_only(f):
    """Décorateur pour vérifier l'authentification WebSocket"""
    @wraps(f)
    def wrapped(*args, **kwargs):
        token = request.args.get('token')
        if not token:
            disconnect()
            return
        
        try:
            # Décoder le JWT
            decoded = decode_token(token)
            request.user_id = decoded.get('sub')
            request.tenant_id = decoded.get('tenant_id')
            request.user_role = decoded.get('role')
        except Exception as e:
            logger.warning(f"WebSocket auth failed: {e}")
            disconnect()
            return
        
        return f(*args, **kwargs)
    return wrapped


def register_handlers(sio):
    """Enregistre les handlers d'événements WebSocket"""
    
    @sio.on('connect')
    def handle_connect():
        """Connexion d'un client"""
        token = request.args.get('token')
        
        if not token:
            logger.warning("WebSocket connexion sans token")
            return False  # Refuse la connexion
        
        try:
            decoded = decode_token(token)
            user_id = decoded.get('sub')
            tenant_id = decoded.get('tenant_id')
            
            if not user_id or not tenant_id:
                return False
            
            # Rejoindre les rooms
            join_room(f"user_{user_id}")
            join_room(f"tenant_{tenant_id}")
            
            logger.info(f"WebSocket connecté: user {user_id}, tenant {tenant_id}")
            
            emit('connected', {
                'message': 'Connecté au serveur temps réel',
                'user_id': user_id
            })
            
            return True
            
        except Exception as e:
            logger.error(f"Erreur connexion WebSocket: {e}")
            return False
    
    @sio.on('disconnect')
    def handle_disconnect():
        """Déconnexion d'un client"""
        logger.info("WebSocket déconnecté")
    
    @sio.on('join_package')
    @authenticated_only
    def handle_join_package(data):
        """Rejoindre la room d'un colis pour suivre ses updates"""
        package_id = data.get('package_id')
        if package_id:
            join_room(f"package_{package_id}")
            emit('joined', {'room': f"package_{package_id}"})
    
    @sio.on('leave_package')
    @authenticated_only
    def handle_leave_package(data):
        """Quitter la room d'un colis"""
        package_id = data.get('package_id')
        if package_id:
            leave_room(f"package_{package_id}")
    
    @sio.on('ping')
    def handle_ping():
        """Ping pour garder la connexion active"""
        emit('pong')


# ==================== FONCTIONS D'ÉMISSION ====================

def emit_to_user(user_id: str, event: str, data: dict):
    """
    Envoie un événement à un utilisateur spécifique
    
    Args:
        user_id: ID de l'utilisateur
        event: Nom de l'événement
        data: Données à envoyer
    """
    if socketio:
        socketio.emit(event, data, room=f"user_{user_id}")
        logger.debug(f"Emit {event} to user {user_id}")


def emit_to_tenant(tenant_id: str, event: str, data: dict):
    """
    Envoie un événement à tous les utilisateurs d'un tenant
    
    Args:
        tenant_id: ID du tenant
        event: Nom de l'événement
        data: Données à envoyer
    """
    if socketio:
        socketio.emit(event, data, room=f"tenant_{tenant_id}")
        logger.debug(f"Emit {event} to tenant {tenant_id}")


def emit_to_package(package_id: str, event: str, data: dict):
    """
    Envoie un événement aux abonnés d'un colis
    
    Args:
        package_id: ID du colis
        event: Nom de l'événement
        data: Données à envoyer
    """
    if socketio:
        socketio.emit(event, data, room=f"package_{package_id}")


def emit_package_update(package: dict, old_status: str = None):
    """
    Notifie d'une mise à jour de colis
    
    Args:
        package: Données du colis (dict)
        old_status: Ancien statut (optionnel)
    """
    data = {
        'type': 'package_update',
        'package': package,
        'old_status': old_status,
        'timestamp': package.get('updated_at')
    }
    
    # Notifier le client propriétaire
    if package.get('client_id'):
        emit_to_user(package['client_id'], 'package_update', data)
    
    # Notifier les abonnés du colis
    if package.get('id'):
        emit_to_package(package['id'], 'package_update', data)


def emit_new_notification(user_id: str, notification: dict):
    """
    Notifie d'une nouvelle notification
    
    Args:
        user_id: ID de l'utilisateur
        notification: Données de la notification
    """
    emit_to_user(user_id, 'new_notification', {
        'type': 'notification',
        'notification': notification
    })


def emit_departure_update(tenant_id: str, departure: dict, event_type: str = 'update'):
    """
    Notifie d'une mise à jour de départ (pour l'admin)
    
    Args:
        tenant_id: ID du tenant
        departure: Données du départ
        event_type: Type d'événement (create, update, depart, arrive)
    """
    emit_to_tenant(tenant_id, 'departure_update', {
        'type': f'departure_{event_type}',
        'departure': departure
    })


def emit_invoice_update(tenant_id: str, invoice: dict, event_type: str = 'update'):
    """
    Notifie d'une mise à jour de facture
    
    Args:
        tenant_id: ID du tenant
        invoice: Données de la facture
        event_type: Type d'événement
    """
    # Notifier l'admin
    emit_to_tenant(tenant_id, 'invoice_update', {
        'type': f'invoice_{event_type}',
        'invoice': invoice
    })
    
    # Notifier le client concerné
    if invoice.get('client_id'):
        emit_to_user(invoice['client_id'], 'invoice_update', {
            'type': f'invoice_{event_type}',
            'invoice': invoice
        })
