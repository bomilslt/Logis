"""
Modèle Payment - Paiements des clients
Gère les transactions financières liées aux colis
"""

from app import db
from datetime import datetime
import uuid


class Payment(db.Model):
    """
    Paiement effectué par un client ou un tiers
    Peut être lié à un ou plusieurs colis
    """
    __tablename__ = 'payments'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = db.Column(db.String(36), db.ForeignKey('tenants.id'), nullable=False)
    client_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=True)  # Nullable pour payeurs externes
    
    # Payeur externe (si pas client)
    payer_name = db.Column(db.String(100))
    payer_phone = db.Column(db.String(30))
    
    # Montant
    amount = db.Column(db.Numeric(18, 2, asdecimal=False), nullable=False)
    currency = db.Column(db.String(3), default='XAF')  # XAF, USD, EUR
    
    # Méthode de paiement
    method = db.Column(db.String(30), nullable=False)  # cash, mobile_money, bank_transfer, card
    
    # Référence externe (numéro de transaction mobile money, etc.)
    reference = db.Column(db.String(100))
    
    # Notes
    notes = db.Column(db.Text)
    
    # Statut: pending, confirmed, cancelled
    status = db.Column(db.String(20), default='confirmed')
    
    # Métadonnées
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    created_by = db.Column(db.String(36), db.ForeignKey('users.id'))  # Staff qui a enregistré
    
    # Relations
    client = db.relationship('User', foreign_keys=[client_id], backref='payments')
    package_payments = db.relationship('PackagePayment', backref='payment', lazy='dynamic')
    
    def to_dict(self, include_packages=False):
        """Sérialisation en dictionnaire"""
        # Nom du payeur: client ou payeur externe
        if self.client:
            client_name = self.client.full_name
            client_phone = self.client.phone
        else:
            client_name = self.payer_name
            client_phone = self.payer_phone
        
        data = {
            'id': self.id,
            'client_id': self.client_id,
            'client_name': client_name,
            'client_phone': client_phone,
            'payer_name': self.payer_name,
            'payer_phone': self.payer_phone,
            'is_external_payer': self.client_id is None,
            'amount': self.amount,
            'currency': self.currency,
            'method': self.method,
            'reference': self.reference,
            'notes': self.notes,
            'status': self.status,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
        
        if include_packages:
            # Retourner les tracking numbers pour l'affichage
            data['packages'] = [pp.package.tracking_number for pp in self.package_payments.all() if pp.package]
            data['package_details'] = [pp.package.to_dict() for pp in self.package_payments.all() if pp.package]
        
        return data


class PackagePayment(db.Model):
    """
    Table de liaison entre paiements et colis
    Un paiement peut couvrir plusieurs colis
    """
    __tablename__ = 'package_payments'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    payment_id = db.Column(db.String(36), db.ForeignKey('payments.id'), nullable=False)
    package_id = db.Column(db.String(36), db.ForeignKey('packages.id'), nullable=False)
    
    # Montant alloué à ce colis (si paiement partiel)
    amount = db.Column(db.Numeric(18, 2, asdecimal=False))
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relations
    package = db.relationship('Package', backref='payment_records')
