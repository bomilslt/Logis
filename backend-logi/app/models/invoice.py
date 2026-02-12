"""
Modèle Invoice - Factures clients
Gère la facturation des services de transport
"""

from app import db
from datetime import datetime
import uuid


class Invoice(db.Model):
    """
    Facture émise pour un client
    Peut être liée à un colis spécifique ou être une facture générale
    """
    __tablename__ = 'invoices'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = db.Column(db.String(36), db.ForeignKey('tenants.id'), nullable=False)
    client_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    
    # Numéro de facture unique (ex: INV-2024-00001)
    invoice_number = db.Column(db.String(50), unique=True, nullable=False)
    
    # Colis associé (optionnel)
    package_id = db.Column(db.String(36), db.ForeignKey('packages.id'))
    
    # Description
    description = db.Column(db.Text, nullable=False)
    
    # Montants
    amount = db.Column(db.Numeric(18, 2, asdecimal=False), nullable=False)
    currency = db.Column(db.String(3), default='XAF')
    
    # Statut: draft, sent, paid, cancelled
    status = db.Column(db.String(20), default='draft')
    
    # Dates
    issue_date = db.Column(db.Date, default=datetime.utcnow)
    due_date = db.Column(db.Date)
    paid_at = db.Column(db.DateTime)
    
    # Notes
    notes = db.Column(db.Text)
    
    # Métadonnées
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = db.Column(db.String(36), db.ForeignKey('users.id'))
    
    # Relations
    client = db.relationship('User', foreign_keys=[client_id], backref='invoices')
    package = db.relationship('Package', backref='invoices')
    
    def mark_paid(self):
        """Marquer comme payée"""
        self.status = 'paid'
        self.paid_at = datetime.utcnow()
    
    def cancel(self):
        """Annuler la facture"""
        self.status = 'cancelled'
    
    def to_dict(self):
        """Sérialisation en dictionnaire"""
        return {
            'id': self.id,
            'invoice_number': self.invoice_number,
            'client_id': self.client_id,
            'client_name': self.client.full_name if self.client else None,
            'package_id': self.package_id,
            'package_tracking': self.package.tracking_number if self.package else None,
            'description': self.description,
            'amount': self.amount,
            'currency': self.currency,
            'status': self.status,
            'issue_date': self.issue_date.isoformat() if self.issue_date else None,
            'due_date': self.due_date.isoformat() if self.due_date else None,
            'paid_at': self.paid_at.isoformat() if self.paid_at else None,
            'notes': self.notes,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
