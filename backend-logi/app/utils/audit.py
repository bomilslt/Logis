"""
Audit Logging - Traçabilité des actions sensibles
=================================================

Enregistre les actions importantes pour la sécurité et la conformité.
"""

import logging
from datetime import datetime
from flask import request, g
from app import db
import json

logger = logging.getLogger('audit')

# Configurer un handler séparé pour les logs d'audit
if not any(
    isinstance(h, logging.FileHandler) and getattr(h, 'baseFilename', '').endswith('audit.log')
    for h in logger.handlers
):
    audit_handler = logging.FileHandler('audit.log')
    audit_handler.setLevel(logging.INFO)
    audit_handler.setFormatter(logging.Formatter(
        '%(asctime)s - AUDIT - %(message)s'
    ))
    logger.addHandler(audit_handler)

logger.setLevel(logging.INFO)
logger.propagate = False


class AuditLog(db.Model):
    """Modèle pour stocker les logs d'audit en base"""
    __tablename__ = 'audit_logs'
    
    id = db.Column(db.Integer, primary_key=True)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    tenant_id = db.Column(db.String(36), index=True)
    user_id = db.Column(db.String(36), index=True)
    user_email = db.Column(db.String(120))
    action = db.Column(db.String(50), nullable=False, index=True)
    resource_type = db.Column(db.String(50))
    resource_id = db.Column(db.String(36))
    details = db.Column(db.Text)  # JSON
    ip_address = db.Column(db.String(45))
    user_agent = db.Column(db.String(500))
    status = db.Column(db.String(20), default='success')  # success, failure, warning
    
    def to_dict(self):
        return {
            'id': self.id,
            'timestamp': self.timestamp.isoformat(),
            'tenant_id': self.tenant_id,
            'user_id': self.user_id,
            'user_email': self.user_email,
            'action': self.action,
            'resource_type': self.resource_type,
            'resource_id': self.resource_id,
            'details': json.loads(self.details) if self.details else None,
            'ip_address': self.ip_address,
            'status': self.status
        }


# Actions auditées
class AuditAction:
    # Auth
    LOGIN_SUCCESS = 'login_success'
    LOGIN_FAILED = 'login_failed'
    LOGOUT = 'logout'
    PASSWORD_CHANGE = 'password_change'
    PASSWORD_RESET = 'password_reset'
    
    # Users/Staff
    USER_CREATE = 'user_create'
    USER_UPDATE = 'user_update'
    USER_DELETE = 'user_delete'
    USER_DEACTIVATE = 'user_deactivate'
    USER_ACTIVATE = 'user_activate'
    PERMISSIONS_UPDATE = 'permissions_update'
    
    # Packages
    PACKAGE_CREATE = 'package_create'
    PACKAGE_DELETE = 'package_delete'
    PACKAGE_STATUS_CHANGE = 'package_status_change'
    PACKAGE_BULK_UPDATE = 'package_bulk_update'
    
    # Payments
    PAYMENT_CREATE = 'payment_create'
    PAYMENT_CANCEL = 'payment_cancel'
    
    # Settings
    SETTINGS_UPDATE = 'settings_update'
    NOTIFICATION_CONFIG_UPDATE = 'notification_config_update'
    
    # Security
    SUSPICIOUS_ACTIVITY = 'suspicious_activity'
    RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded'
    INVALID_TOKEN = 'invalid_token'
    
    # OTP / 2FA
    OTP_SENT = 'otp_sent'
    OTP_VERIFIED = 'otp_verified'
    OTP_FAILED = 'otp_failed'


def audit_log(
    action: str,
    resource_type: str = None,
    resource_id: str = None,
    details: dict = None,
    status: str = 'success',
    user_id: str = None,
    user_email: str = None,
    tenant_id: str = None
):
    """
    Enregistre une action dans le log d'audit
    
    Args:
        action: Type d'action (voir AuditAction)
        resource_type: Type de ressource affectée (user, package, payment, etc.)
        resource_id: ID de la ressource
        details: Détails supplémentaires (dict)
        status: success, failure, warning
        user_id: ID de l'utilisateur (auto-détecté si non fourni)
        user_email: Email de l'utilisateur
        tenant_id: ID du tenant (auto-détecté si non fourni)
    """
    try:
        # Auto-détection depuis le contexte Flask
        if user_id is None and hasattr(g, 'user') and g.user:
            user_id = g.user.id
            user_email = user_email or g.user.email
        
        if tenant_id is None and hasattr(g, 'tenant_id'):
            tenant_id = g.tenant_id
        
        # Récupérer l'IP et le User-Agent
        ip_address = request.remote_addr if request else None
        user_agent = request.headers.get('User-Agent', '')[:500] if request else None
        
        # Créer l'entrée en base
        log_entry = AuditLog(
            tenant_id=tenant_id,
            user_id=user_id,
            user_email=user_email,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            details=json.dumps(details) if details else None,
            ip_address=ip_address,
            user_agent=user_agent,
            status=status
        )
        
        db.session.add(log_entry)
        db.session.commit()
        
        # Logger aussi dans le fichier
        log_message = f"[{status.upper()}] {action}"
        if resource_type:
            log_message += f" | {resource_type}"
        if resource_id:
            log_message += f":{resource_id}"
        log_message += f" | user:{user_id} | tenant:{tenant_id} | ip:{ip_address}"
        if details:
            log_message += f" | {json.dumps(details)}"
        
        if status == 'failure':
            logger.warning(log_message)
        elif status == 'warning':
            logger.warning(log_message)
        else:
            logger.info(log_message)
            
    except Exception as e:
        # Ne pas faire échouer l'opération principale si l'audit échoue
        logging.error(f"Audit log error: {e}")


def audit_decorator(action: str, resource_type: str = None):
    """
    Décorateur pour auditer automatiquement une route
    
    Usage:
        @audit_decorator(AuditAction.USER_CREATE, 'user')
        def create_user():
            ...
    """
    from functools import wraps
    
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            try:
                result = fn(*args, **kwargs)
                
                # Extraire l'ID de la ressource si possible
                resource_id = kwargs.get('id') or kwargs.get('user_id') or kwargs.get('package_id')
                
                # Déterminer le statut basé sur le code de réponse
                status = 'success'
                if hasattr(result, '__iter__') and len(result) > 1:
                    status_code = result[1] if isinstance(result[1], int) else 200
                    if status_code >= 400:
                        status = 'failure'
                
                audit_log(
                    action=action,
                    resource_type=resource_type,
                    resource_id=str(resource_id) if resource_id else None,
                    status=status
                )
                
                return result
                
            except Exception as e:
                audit_log(
                    action=action,
                    resource_type=resource_type,
                    status='failure',
                    details={'error': str(e)}
                )
                raise
        
        return wrapper
    return decorator
