"""
Modèle Announcement - Annonces et communications
Gère les annonces publiées par le tenant vers ses clients
"""

from app import db
from datetime import datetime
import uuid


class Announcement(db.Model):
    """
    Annonce publiée par le tenant
    Affichée dans l'app client (dashboard, notifications)
    """
    __tablename__ = 'announcements'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = db.Column(db.String(36), db.ForeignKey('tenants.id'), nullable=False)
    
    # Contenu
    title = db.Column(db.String(200), nullable=False)
    content = db.Column(db.Text, nullable=False)
    
    # Type: info, warning, promo, urgent
    type = db.Column(db.String(20), default='info')
    
    # Visibilité
    is_active = db.Column(db.Boolean, default=True)
    
    # Période de validité (optionnel)
    start_date = db.Column(db.DateTime)
    end_date = db.Column(db.DateTime)
    
    # Priorité d'affichage (plus élevé = plus visible)
    priority = db.Column(db.Integer, default=0)
    
    # Métadonnées
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = db.Column(db.String(36), db.ForeignKey('users.id'))
    
    @property
    def is_visible(self):
        """Vérifie si l'annonce est actuellement visible"""
        if not self.is_active:
            return False
        
        now = datetime.utcnow()
        
        if self.start_date and now < self.start_date:
            return False
        
        if self.end_date and now > self.end_date:
            return False
        
        return True
    
    def toggle_active(self):
        """Basculer l'état actif"""
        self.is_active = not self.is_active
    
    def to_dict(self):
        """Sérialisation en dictionnaire"""
        return {
            'id': self.id,
            'title': self.title,
            'content': self.content,
            'type': self.type,
            'is_active': self.is_active,
            'is_visible': self.is_visible,
            'start_date': self.start_date.isoformat() if self.start_date else None,
            'end_date': self.end_date.isoformat() if self.end_date else None,
            'priority': self.priority,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
