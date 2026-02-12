"""
Modèle Device - Gestion des appareils enregistrés
==================================================

Permet de:
- Enregistrer les appareils mobiles/desktop des utilisateurs
- Vérifier l'intégrité des appareils (Play Integrity, DeviceCheck)
- Limiter le nombre d'appareils par utilisateur
- Révoquer l'accès à des appareils spécifiques
"""

from app import db
from datetime import datetime, timedelta
import uuid
import hashlib


class UserDevice(db.Model):
    """
    Appareil enregistré pour un utilisateur.
    Permet de tracker et contrôler les connexions par appareil.
    """
    __tablename__ = 'user_devices'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    
    # Propriétaire
    user_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False, index=True)
    tenant_id = db.Column(db.String(36), db.ForeignKey('tenants.id'), nullable=False, index=True)
    
    # Identification de l'appareil
    device_id = db.Column(db.String(255), nullable=False)  # ID unique de l'appareil (hashé)
    device_name = db.Column(db.String(100))  # "iPhone 15 Pro", "Samsung Galaxy S24"
    device_model = db.Column(db.String(100))  # Modèle technique
    
    # Plateforme
    platform = db.Column(db.String(20), nullable=False)  # android, ios, windows, macos
    os_version = db.Column(db.String(50))  # Version OS
    app_version = db.Column(db.String(20))  # Version de l'app installée
    
    # Canal d'accès
    channel = db.Column(db.String(30))  # app_android_client, app_ios_client, pc_admin, mac_admin, etc.
    
    # Intégrité (vérification Play Integrity / DeviceCheck)
    integrity_token = db.Column(db.Text)  # Token d'intégrité (Play Integrity ou DeviceCheck)
    integrity_verified = db.Column(db.Boolean, default=False)
    integrity_verified_at = db.Column(db.DateTime)
    integrity_verdict = db.Column(db.JSON)  # Résultat de la vérification
    
    # Push notifications
    push_token = db.Column(db.Text)  # FCM token (Android) ou APNs token (iOS)
    push_token_updated_at = db.Column(db.DateTime)
    
    # Statut
    is_active = db.Column(db.Boolean, default=True)
    is_trusted = db.Column(db.Boolean, default=False)  # Marqué comme appareil de confiance
    
    # Activité
    last_used_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_ip = db.Column(db.String(45))  # IPv4 ou IPv6
    login_count = db.Column(db.Integer, default=0)
    
    # Timestamps
    registered_at = db.Column(db.DateTime, default=datetime.utcnow)
    revoked_at = db.Column(db.DateTime)
    revoked_reason = db.Column(db.String(200))
    
    # Contrainte d'unicité par utilisateur + device_id
    __table_args__ = (
        db.UniqueConstraint('user_id', 'device_id', name='uq_user_device'),
        db.Index('idx_device_user_active', 'user_id', 'is_active'),
    )
    
    @staticmethod
    def hash_device_id(raw_device_id: str) -> str:
        """Hash le device ID pour le stockage sécurisé"""
        return hashlib.sha256(raw_device_id.encode()).hexdigest()
    
    @property
    def is_recently_verified(self) -> bool:
        """Vérifie si l'intégrité a été vérifiée récemment (< 24h)"""
        if not self.integrity_verified or not self.integrity_verified_at:
            return False
        return (datetime.utcnow() - self.integrity_verified_at) < timedelta(hours=24)
    
    @property
    def needs_reverification(self) -> bool:
        """Indique si l'appareil doit être re-vérifié"""
        if not self.integrity_verified:
            return True
        if not self.integrity_verified_at:
            return True
        # Re-vérification tous les 7 jours
        return (datetime.utcnow() - self.integrity_verified_at) > timedelta(days=7)
    
    def record_usage(self, ip_address: str = None):
        """Enregistre une utilisation de l'appareil"""
        self.last_used_at = datetime.utcnow()
        self.login_count = (self.login_count or 0) + 1
        if ip_address:
            self.last_ip = ip_address
    
    def revoke(self, reason: str = None):
        """Révoque l'accès de cet appareil"""
        self.is_active = False
        self.revoked_at = datetime.utcnow()
        self.revoked_reason = reason
    
    def to_dict(self, include_tokens=False):
        result = {
            'id': self.id,
            'user_id': self.user_id,
            'device_name': self.device_name,
            'device_model': self.device_model,
            'platform': self.platform,
            'os_version': self.os_version,
            'app_version': self.app_version,
            'channel': self.channel,
            'integrity_verified': self.integrity_verified,
            'integrity_verified_at': self.integrity_verified_at.isoformat() if self.integrity_verified_at else None,
            'is_active': self.is_active,
            'is_trusted': self.is_trusted,
            'last_used_at': self.last_used_at.isoformat() if self.last_used_at else None,
            'login_count': self.login_count,
            'registered_at': self.registered_at.isoformat() if self.registered_at else None
        }
        
        if include_tokens:
            result['push_token'] = self.push_token
        
        return result


class DeviceVerificationLog(db.Model):
    """
    Log des vérifications d'intégrité des appareils.
    Utile pour l'audit et le debugging.
    """
    __tablename__ = 'device_verification_logs'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    device_id = db.Column(db.String(36), db.ForeignKey('user_devices.id'), nullable=False, index=True)
    
    # Type de vérification
    verification_type = db.Column(db.String(30), nullable=False)  # play_integrity, device_check, attestation
    
    # Résultat
    success = db.Column(db.Boolean, default=False)
    verdict = db.Column(db.JSON)  # Détails du verdict
    error_message = db.Column(db.Text)
    
    # Contexte
    ip_address = db.Column(db.String(45))
    user_agent = db.Column(db.String(500))
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'device_id': self.device_id,
            'verification_type': self.verification_type,
            'success': self.success,
            'verdict': self.verdict,
            'error_message': self.error_message,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
