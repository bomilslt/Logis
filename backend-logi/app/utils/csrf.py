"""
Protection CSRF pour l'API
==========================

Implémente une protection CSRF basée sur des tokens.
Le token est généré côté serveur et doit être envoyé dans le header X-CSRF-Token.
"""

import secrets
import hmac
import hashlib
from functools import wraps
from flask import request, jsonify, g, current_app
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)

# Durée de validité du token CSRF (en heures)
CSRF_TOKEN_EXPIRY_HOURS = 24


def generate_csrf_token(user_id: str, secret_key: str) -> str:
    """
    Génère un token CSRF lié à l'utilisateur
    
    Format: timestamp.signature
    La signature est un HMAC de (timestamp + user_id) avec la clé secrète
    """
    timestamp = int(datetime.utcnow().timestamp())
    message = f"{timestamp}.{user_id}"
    signature = hmac.new(
        secret_key.encode(),
        message.encode(),
        hashlib.sha256
    ).hexdigest()
    
    return f"{timestamp}.{signature}"


def verify_csrf_token(token: str, user_id: str, secret_key: str) -> bool:
    """
    Vérifie la validité d'un token CSRF
    
    Returns:
        True si le token est valide et non expiré
    """
    if not token or '.' not in token:
        return False
    
    try:
        parts = token.split('.')
        if len(parts) != 2:
            return False
            
        timestamp_str, signature = parts
        timestamp = int(timestamp_str)
        
        # Vérifier l'expiration
        token_time = datetime.fromtimestamp(timestamp)
        if datetime.utcnow() - token_time > timedelta(hours=CSRF_TOKEN_EXPIRY_HOURS):
            logger.warning(f"CSRF token expired for user {user_id}")
            return False
        
        # Vérifier la signature
        message = f"{timestamp}.{user_id}"
        expected_signature = hmac.new(
            secret_key.encode(),
            message.encode(),
            hashlib.sha256
        ).hexdigest()
        
        if not hmac.compare_digest(signature, expected_signature):
            logger.warning(f"CSRF token signature mismatch for user {user_id}")
            return False
        
        return True
        
    except (ValueError, TypeError) as e:
        logger.warning(f"CSRF token validation error: {e}")
        return False


def csrf_protect(fn):
    """
    Décorateur pour protéger une route contre les attaques CSRF
    
    Vérifie que le header X-CSRF-Token contient un token valide.
    À utiliser sur les routes qui modifient des données (POST, PUT, DELETE).
    
    Note: Les requêtes GET et OPTIONS sont exemptées.
    """
    @wraps(fn)
    def wrapper(*args, **kwargs):
        # Exempter GET et OPTIONS
        if request.method in ['GET', 'OPTIONS', 'HEAD']:
            return fn(*args, **kwargs)
        
        # Vérifier si la protection CSRF est activée
        if not current_app.config.get('CSRF_ENABLED', True):
            return fn(*args, **kwargs)
        
        # Récupérer le token du header
        csrf_token = request.headers.get('X-CSRF-Token')
        
        if not csrf_token:
            logger.warning(f"Missing CSRF token on {request.method} {request.path}")
            return jsonify({'error': 'CSRF token missing'}), 403
        
        # Récupérer l'user_id depuis g (défini par tenant_required ou admin_required)
        user_id = getattr(g, 'user', None)
        if user_id and hasattr(user_id, 'id'):
            user_id = user_id.id
        elif hasattr(g, 'user_id'):
            user_id = g.user_id
        else:
            # Essayer de récupérer depuis le JWT
            try:
                from flask_jwt_extended import get_jwt_identity
                user_id = get_jwt_identity()
            except:
                user_id = 'anonymous'
        
        # Vérifier le token
        secret_key = current_app.config.get('SECRET_KEY', '')
        if not verify_csrf_token(csrf_token, str(user_id), secret_key):
            logger.warning(f"Invalid CSRF token for user {user_id} on {request.path}")
            return jsonify({'error': 'Invalid CSRF token'}), 403
        
        return fn(*args, **kwargs)
    
    return wrapper


def get_csrf_token_for_user(user_id: str) -> str:
    """
    Génère un token CSRF pour un utilisateur donné
    À appeler après l'authentification pour fournir le token au client
    """
    from flask import current_app
    secret_key = current_app.config.get('SECRET_KEY', '')
    return generate_csrf_token(str(user_id), secret_key)
