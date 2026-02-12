"""
Modèle OTPCode - Codes de vérification
"""

from app import db
from datetime import datetime
import uuid


class OTPCode(db.Model):
    """
    Code OTP pour vérification 2FA
    """
    __tablename__ = 'otp_codes'
    
    __table_args__ = (
        db.Index('idx_otp_user_purpose', 'tenant_id', 'user_id', 'purpose'),
        db.Index('idx_otp_expires', 'expires_at'),
    )
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = db.Column(db.String(36), db.ForeignKey('tenants.id'), nullable=False)
    
    # user_id peut être un vrai ID ou un ID temporaire (temp_xxx) pour l'inscription
    user_id = db.Column(db.String(50), nullable=False)
    
    # But de l'OTP: login, register, password_reset, password_change
    purpose = db.Column(db.String(30), nullable=False)
    
    # Hash du code (jamais stocker en clair)
    code_hash = db.Column(db.String(64), nullable=False)
    
    # Canal utilisé: email, sms, whatsapp
    channel = db.Column(db.String(20), nullable=False)
    
    # Destination (email ou téléphone)
    destination = db.Column(db.String(100), nullable=False)
    
    # Expiration
    expires_at = db.Column(db.DateTime, nullable=False)
    
    # Tentatives de vérification
    attempts = db.Column(db.Integer, default=0)
    
    # Statut
    is_used = db.Column(db.Boolean, default=False)
    verified_at = db.Column(db.DateTime)
    
    # Token de vérification (pour l'action suivante après vérification)
    verification_token = db.Column(db.String(64))
    
    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'purpose': self.purpose,
            'channel': self.channel,
            'expires_at': self.expires_at.isoformat() if self.expires_at else None,
            'is_used': self.is_used,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
