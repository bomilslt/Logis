"""
Modèle Notification - Notifications utilisateur
Gère les notifications in-app et le suivi des envois multi-canaux
"""

from app import db
from datetime import datetime
import uuid


class Notification(db.Model):
    """
    Notification utilisateur
    Stocke les notifications in-app et trace les envois sur différents canaux
    """
    __tablename__ = 'notifications'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    
    title = db.Column(db.String(200), nullable=False)
    message = db.Column(db.Text, nullable=False)
    
    # Type: status_update, delivery, payment, promo, system, departure
    type = db.Column(db.String(30), default='system')
    
    # Référence optionnelle à un colis
    package_id = db.Column(db.String(36), db.ForeignKey('packages.id'))
    
    # Données additionnelles (JSON)
    data = db.Column(db.JSON, default=dict)
    
    # Statut de lecture
    is_read = db.Column(db.Boolean, default=False)
    read_at = db.Column(db.DateTime)
    
    # Canaux utilisés pour envoyer
    sent_push = db.Column(db.Boolean, default=False)
    sent_email = db.Column(db.Boolean, default=False)
    sent_sms = db.Column(db.Boolean, default=False)
    sent_whatsapp = db.Column(db.Boolean, default=False)
    
    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        """Sérialisation en dictionnaire"""
        return {
            'id': self.id,
            'title': self.title,
            'message': self.message,
            'type': self.type,
            'package_id': self.package_id,
            'data': self.data,
            'is_read': self.is_read,
            'read_at': (self.read_at.isoformat() + 'Z') if self.read_at else None,
            'channels': {
                'push': self.sent_push,
                'email': self.sent_email,
                'sms': self.sent_sms,
                'whatsapp': self.sent_whatsapp
            },
            'created_at': (self.created_at.isoformat() + 'Z') if self.created_at else None
        }
    
    def mark_as_read(self):
        """Marquer comme lue"""
        self.is_read = True
        self.read_at = datetime.utcnow()
