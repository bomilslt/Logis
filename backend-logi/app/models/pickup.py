"""
Modèle Pickup - Retraits de colis
Gère les retraits physiques des colis par les clients ou mandataires
"""

from app import db
from datetime import datetime
import uuid


class Pickup(db.Model):
    """
    Retrait de colis
    Enregistre qui a retiré le colis, quand, et le paiement associé
    """
    __tablename__ = 'pickups'
    
    __table_args__ = (
        db.Index('idx_pickup_tenant_date', 'tenant_id', 'picked_up_at'),
        db.Index('idx_pickup_package', 'package_id'),
    )
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = db.Column(db.String(36), db.ForeignKey('tenants.id'), nullable=False)
    package_id = db.Column(db.String(36), db.ForeignKey('packages.id'), nullable=False)
    client_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    
    # Qui retire le colis
    pickup_by = db.Column(db.String(20), default='client')  # client, proxy
    proxy_name = db.Column(db.String(100))
    proxy_phone = db.Column(db.String(30))
    proxy_id_type = db.Column(db.String(30))  # cni, passport, permis, autre
    proxy_id_number = db.Column(db.String(50))
    
    # Paiement au retrait
    payment_id = db.Column(db.String(36), db.ForeignKey('payments.id'))
    payment_required = db.Column(db.Boolean, default=False)
    payment_collected = db.Column(db.Numeric(18, 2, asdecimal=False), default=0)
    payment_method = db.Column(db.String(30))
    payment_reference = db.Column(db.String(100))
    
    # Confirmation
    signature = db.Column(db.Text)  # Base64 de la signature
    photo_proof = db.Column(db.String(500))  # URL de la photo
    
    # Lieu et staff
    warehouse_id = db.Column(db.String(100))
    staff_id = db.Column(db.String(36), db.ForeignKey('users.id'))
    
    # Métadonnées
    picked_up_at = db.Column(db.DateTime, default=datetime.utcnow)
    notes = db.Column(db.Text)
    
    # Relations
    package = db.relationship('Package', backref=db.backref('pickup', uselist=False))
    client = db.relationship('User', foreign_keys=[client_id])
    staff = db.relationship('User', foreign_keys=[staff_id])
    payment = db.relationship('Payment', backref='pickup')
    
    def to_dict(self, include_package=False, include_client=False):
        """Sérialisation en dictionnaire"""
        data = {
            'id': self.id,
            'package_id': self.package_id,
            'client_id': self.client_id,
            'pickup_by': self.pickup_by,
            'proxy_name': self.proxy_name,
            'proxy_phone': self.proxy_phone,
            'proxy_id_type': self.proxy_id_type,
            'proxy_id_number': self.proxy_id_number,
            'payment_id': self.payment_id,
            'payment_required': self.payment_required,
            'payment_collected': self.payment_collected,
            # Alias pour compatibilité frontend
            'amount_collected': self.payment_collected,
            'payment_method': self.payment_method,
            'payment_reference': self.payment_reference,
            'has_signature': bool(self.signature),
            'has_photo': bool(self.photo_proof),
            # Alias pour compatibilité frontend
            'photo_url': self.photo_proof,
            'warehouse_id': self.warehouse_id,
            'picked_up_at': self.picked_up_at.isoformat() if self.picked_up_at else None,
            # Alias pour compatibilité frontend
            'pickup_date': self.picked_up_at.isoformat() if self.picked_up_at else None,
            'notes': self.notes
        }
        
        if include_package and self.package:
            data['package'] = {
                'tracking_number': self.package.tracking_number,
                'description': self.package.description,
                'amount': self.package.amount,
                'paid_amount': self.package.paid_amount
            }
        
        if include_client and self.client:
            data['client'] = {
                'id': self.client.id,
                'name': self.client.full_name,
                'phone': self.client.phone
            }
        
        if self.staff:
            data['staff_name'] = self.staff.full_name
        
        return data
