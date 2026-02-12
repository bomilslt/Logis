"""
Modèles Comptabilité - Gestion des dépenses, salaires et revenus
Pour le module comptable de l'application
"""

from app import db
from datetime import datetime
import uuid


class DepartureExpense(db.Model):
    """
    Dépense liée à un départ (fret, douane, transport, etc.)
    """
    __tablename__ = 'departure_expenses'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = db.Column(db.String(36), db.ForeignKey('tenants.id'), nullable=False)
    departure_id = db.Column(db.String(36), db.ForeignKey('departures.id'), nullable=False)
    
    # Catégorie: freight, customs, transport, handling, storage, insurance, other
    category = db.Column(db.String(30), nullable=False)
    description = db.Column(db.String(255), nullable=False)
    amount = db.Column(db.Numeric(18, 2, asdecimal=False), nullable=False)
    currency = db.Column(db.String(3), default='XAF')
    
    # Date de la dépense
    date = db.Column(db.Date, nullable=False, default=datetime.utcnow)
    
    # Référence (facture, reçu, etc.)
    reference = db.Column(db.String(100))
    notes = db.Column(db.Text)
    
    # Métadonnées
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    created_by = db.Column(db.String(36), db.ForeignKey('users.id'))
    
    # Relations
    departure = db.relationship('Departure', backref=db.backref('expenses', lazy='dynamic'))
    
    def to_dict(self):
        return {
            'id': self.id,
            'departure_id': self.departure_id,
            'departure_title': self.departure.notes if self.departure else None,
            'category': self.category,
            'description': self.description,
            'amount': self.amount,
            'currency': self.currency,
            'date': self.date.isoformat() if self.date else None,
            'reference': self.reference,
            'notes': self.notes,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class Salary(db.Model):
    """
    Paiement de salaire à un employé
    """
    __tablename__ = 'salaries'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = db.Column(db.String(36), db.ForeignKey('tenants.id'), nullable=False)
    employee_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    
    # Période concernée (mois/année)
    period_month = db.Column(db.Integer, nullable=False)  # 1-12
    period_year = db.Column(db.Integer, nullable=False)
    
    # Montants
    base_salary = db.Column(db.Numeric(18, 2, asdecimal=False), nullable=False)  # Salaire de base
    bonus = db.Column(db.Numeric(18, 2, asdecimal=False), default=0)  # Prime/bonus
    deductions = db.Column(db.Numeric(18, 2, asdecimal=False), default=0)  # Retenues
    net_amount = db.Column(db.Numeric(18, 2, asdecimal=False), nullable=False)  # Montant net payé
    currency = db.Column(db.String(3), default='XAF')
    
    # Date de paiement
    paid_date = db.Column(db.Date, nullable=False)
    
    # Méthode de paiement
    payment_method = db.Column(db.String(30), default='cash')  # cash, bank_transfer, mobile_money
    reference = db.Column(db.String(100))  # Référence transaction
    
    notes = db.Column(db.Text)
    
    # Métadonnées
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    created_by = db.Column(db.String(36), db.ForeignKey('users.id'))
    
    # Relations
    employee = db.relationship('User', foreign_keys=[employee_id], backref='salaries_received')
    
    def to_dict(self):
        return {
            'id': self.id,
            'employee_id': self.employee_id,
            'employee_name': self.employee.full_name if self.employee else None,
            'period_month': self.period_month,
            'period_year': self.period_year,
            'period': f"{self.period_year}-{str(self.period_month).zfill(2)}",
            'base_salary': self.base_salary,
            'bonus': self.bonus,
            'deductions': self.deductions,
            'net_amount': self.net_amount,
            'currency': self.currency,
            'paid_date': self.paid_date.isoformat() if self.paid_date else None,
            'payment_method': self.payment_method,
            'reference': self.reference,
            'notes': self.notes,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class Expense(db.Model):
    """
    Charge diverse (loyer, utilities, fournitures, etc.)
    """
    __tablename__ = 'expenses'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = db.Column(db.String(36), db.ForeignKey('tenants.id'), nullable=False)
    
    # Catégorie: loyer, utilities, fournitures, transport, communication, maintenance, taxes, other
    category = db.Column(db.String(30), nullable=False)
    description = db.Column(db.String(255), nullable=False)
    amount = db.Column(db.Numeric(18, 2, asdecimal=False), nullable=False)
    currency = db.Column(db.String(3), default='XAF')
    
    # Date de la dépense
    date = db.Column(db.Date, nullable=False)
    
    # Récurrence (pour les charges fixes)
    is_recurring = db.Column(db.Boolean, default=False)
    recurrence_type = db.Column(db.String(20))  # monthly, quarterly, yearly
    
    # Référence (facture, reçu, etc.)
    reference = db.Column(db.String(100))
    notes = db.Column(db.Text)
    
    # Métadonnées
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    created_by = db.Column(db.String(36), db.ForeignKey('users.id'))
    
    def to_dict(self):
        return {
            'id': self.id,
            'category': self.category,
            'description': self.description,
            'amount': self.amount,
            'currency': self.currency,
            'date': self.date.isoformat() if self.date else None,
            'is_recurring': self.is_recurring,
            'recurrence_type': self.recurrence_type,
            'reference': self.reference,
            'notes': self.notes,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class OtherIncome(db.Model):
    """
    Autres revenus (remboursements, ventes diverses, etc.)
    """
    __tablename__ = 'other_incomes'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = db.Column(db.String(36), db.ForeignKey('tenants.id'), nullable=False)
    
    # Type: refund, sale, commission, other
    income_type = db.Column(db.String(30), nullable=False)
    description = db.Column(db.String(255), nullable=False)
    amount = db.Column(db.Numeric(18, 2, asdecimal=False), nullable=False)
    currency = db.Column(db.String(3), default='XAF')
    
    # Date du revenu
    date = db.Column(db.Date, nullable=False)
    
    # Référence
    reference = db.Column(db.String(100))
    notes = db.Column(db.Text)
    
    # Métadonnées
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    created_by = db.Column(db.String(36), db.ForeignKey('users.id'))
    
    def to_dict(self):
        return {
            'id': self.id,
            'income_type': self.income_type,
            'description': self.description,
            'amount': self.amount,
            'currency': self.currency,
            'date': self.date.isoformat() if self.date else None,
            'reference': self.reference,
            'notes': self.notes,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
