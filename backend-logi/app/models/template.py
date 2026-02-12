"""
Modèle RecipientTemplate - Templates de destinataires
Permet aux clients de sauvegarder des destinataires fréquents
"""

from app import db
from datetime import datetime
import uuid


class RecipientTemplate(db.Model):
    """
    Template de destinataire
    Sauvegarde les informations d'un destinataire pour réutilisation
    """
    __tablename__ = 'recipient_templates'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = db.Column(db.String(36), db.ForeignKey('tenants.id'), nullable=False)
    user_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    
    # Nom du template (ex: "Maison", "Bureau", "Maman")
    name = db.Column(db.String(100), nullable=False)
    
    # Informations destinataire
    recipient_name = db.Column(db.String(100))
    recipient_phone = db.Column(db.String(20))
    
    # Destination
    country = db.Column(db.String(50))
    warehouse = db.Column(db.String(100))
    
    # Métadonnées
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'recipient_name': self.recipient_name,
            'recipient_phone': self.recipient_phone,
            'country': self.country,
            'warehouse': self.warehouse,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
