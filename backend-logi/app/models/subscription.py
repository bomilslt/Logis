"""
Modèles Abonnement - Gestion des plans et souscriptions
========================================================

Gère les plans d'abonnement, les souscriptions des tenants,
et l'historique des paiements d'abonnement.
"""

from app import db
from datetime import datetime, timedelta
import uuid
import json


class SubscriptionPlanPrice(db.Model):
    __tablename__ = 'subscription_plan_prices'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    plan_id = db.Column(db.String(36), db.ForeignKey('subscription_plans.id'), nullable=False, index=True)

    currency = db.Column(db.String(3), nullable=False)  # XAF, XOF, USD
    duration_months = db.Column(db.Integer, nullable=False, default=1)  # 1, 2, 3, 6, 12
    amount = db.Column(db.Numeric(18, 2, asdecimal=False), nullable=False, default=0)

    is_active = db.Column(db.Boolean, default=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('plan_id', 'currency', 'duration_months', name='uq_plan_currency_duration'),
    )

    @property
    def monthly_equivalent(self):
        """Prix mensuel équivalent pour comparaison"""
        if self.duration_months and self.duration_months > 0:
            return float(self.amount) / self.duration_months
        return float(self.amount)

    def to_dict(self):
        return {
            'id': self.id,
            'plan_id': self.plan_id,
            'currency': self.currency,
            'duration_months': self.duration_months,
            'amount': self.amount,
            'monthly_equivalent': self.monthly_equivalent,
            'is_active': self.is_active
        }


class SubscriptionPlan(db.Model):
    """
    Plan d'abonnement disponible sur la plateforme.
    Les plans dépendent du volume de colis, du nombre d'utilisateurs et des canaux d'accès.
    Entièrement configurable depuis l'interface super-admin.
    """
    __tablename__ = 'subscription_plans'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    
    # Identifiant unique du plan
    code = db.Column(db.String(50), unique=True, nullable=False)  # starter, pro, business, enterprise
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text)
    
    # --- Limites typées (critères principaux du plan) ---
    max_packages_monthly = db.Column(db.Integer, default=500)     # -1 = illimité
    max_staff = db.Column(db.Integer, default=3)                  # -1 = illimité
    max_clients = db.Column(db.Integer, default=200)              # -1 = illimité
    
    # Canaux d'accès autorisés par le plan
    allowed_channels = db.Column(db.JSON, default=lambda: ['web_admin', 'web_client'])
    # Valeurs possibles: web_admin, web_client, app_android_client, app_ios_client, pc_admin, mac_admin
    
    # Tarification de référence (prix mensuel en devise par défaut, pour affichage rapide)
    price_monthly = db.Column(db.Numeric(18, 2, asdecimal=False), default=0)
    price_yearly = db.Column(db.Numeric(18, 2, asdecimal=False), default=0)
    currency = db.Column(db.String(3), default='XAF')
    
    # Limites supplémentaires (configurable, extensible)
    limits = db.Column(db.JSON, default=dict)
    # {
    #   "max_warehouses": 2,
    #   "max_storage_gb": 5,
    #   "api_access": false,
    #   "custom_domain": false,
    #   "priority_support": false,
    #   "white_label": false
    # }
    
    # Fonctionnalités incluses (liste pour affichage marketing)
    features = db.Column(db.JSON, default=list)
    
    # Ordre d'affichage
    display_order = db.Column(db.Integer, default=0)
    
    # Mise en avant
    is_popular = db.Column(db.Boolean, default=False)
    is_active = db.Column(db.Boolean, default=True)
    
    # Période d'essai (jours)
    trial_days = db.Column(db.Integer, default=0)
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relations
    subscriptions = db.relationship('Subscription', backref='plan', lazy='dynamic')
    prices = db.relationship('SubscriptionPlanPrice', backref='plan', lazy='dynamic', cascade='all, delete-orphan')
    
    def get_limit(self, key: str, default=None):
        """Récupère une limite supplémentaire depuis le JSON limits"""
        if self.limits:
            return self.limits.get(key, default)
        return default

    def get_price(self, currency: str, duration_months: int = 1):
        """Récupère le prix pour une devise et une durée données"""
        price = self.prices.filter_by(
            currency=currency, duration_months=duration_months, is_active=True
        ).first()
        if price:
            return float(price.amount)

        # Fallback legacy
        if currency == (self.currency or 'XAF'):
            if duration_months == 12:
                return float(self.price_yearly or 0)
            if duration_months == 1:
                return float(self.price_monthly or 0)

        return None
    
    def check_channel_allowed(self, channel: str) -> bool:
        """Vérifie si un canal d'accès est autorisé par le plan"""
        from app.models.tenant import channel_matches
        channels = self.allowed_channels or []
        return channel_matches(channel, channels)
    
    def to_dict(self, include_stats=False, include_prices=False):
        result = {
            'id': self.id,
            'code': self.code,
            'name': self.name,
            'description': self.description,
            'max_packages_monthly': self.max_packages_monthly,
            'max_staff': self.max_staff,
            'max_clients': self.max_clients,
            'allowed_channels': self.allowed_channels or [],
            'price_monthly': self.price_monthly,
            'price_yearly': self.price_yearly,
            'currency': self.currency,
            'limits': self.limits or {},
            'features': self.features or [],
            'display_order': self.display_order,
            'is_popular': self.is_popular,
            'is_active': self.is_active,
            'trial_days': self.trial_days,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
        
        if include_stats:
            result['subscribers_count'] = self.subscriptions.filter_by(status='active').count()
        
        if include_prices:
            result['prices'] = [p.to_dict() for p in self.prices.filter_by(is_active=True).all()]
        
        return result


class Subscription(db.Model):
    """
    Abonnement d'un tenant à un plan
    """
    __tablename__ = 'subscriptions'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = db.Column(db.String(36), db.ForeignKey('tenants.id'), nullable=False, unique=True)
    plan_id = db.Column(db.String(36), db.ForeignKey('subscription_plans.id'), nullable=False)
    
    # Statut: active, cancelled, expired, suspended, trial
    status = db.Column(db.String(20), default='trial')
    
    # Durée de facturation en mois (1, 2, 3, 6, 12)
    duration_months = db.Column(db.Integer, default=1)
    
    # Dates
    started_at = db.Column(db.DateTime, default=datetime.utcnow)
    trial_ends_at = db.Column(db.DateTime)  # Fin de période d'essai
    current_period_start = db.Column(db.DateTime)
    current_period_end = db.Column(db.DateTime)
    cancelled_at = db.Column(db.DateTime)
    
    # Paiement
    last_payment_at = db.Column(db.DateTime)
    next_payment_at = db.Column(db.DateTime)
    payment_method = db.Column(db.String(50))  # stripe, flutterwave, cinetpay
    payment_reference = db.Column(db.String(100))  # ID externe (Stripe subscription ID, etc.)
    
    # Réductions
    discount_percent = db.Column(db.Float, default=0)  # Réduction en %
    discount_reason = db.Column(db.String(200))  # Raison de la réduction
    
    # Métadonnées
    extra_data = db.Column(db.JSON, default=dict)
    notes = db.Column(db.Text)  # Notes admin
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relations
    payments = db.relationship('SubscriptionPayment', backref='subscription', lazy='dynamic')
    tenant = db.relationship('Tenant', backref=db.backref('subscription', uselist=False))
    
    @property
    def is_active(self):
        """Vérifie si l'abonnement est actif"""
        if self.status == 'active':
            return True
        if self.status == 'trial' and self.trial_ends_at:
            return datetime.utcnow() < self.trial_ends_at
        return False
    
    @property
    def days_remaining(self):
        """Jours restants avant expiration"""
        if self.current_period_end:
            delta = self.current_period_end - datetime.utcnow()
            return max(0, delta.days)
        if self.status == 'trial' and self.trial_ends_at:
            delta = self.trial_ends_at - datetime.utcnow()
            return max(0, delta.days)
        return 0
    
    def calculate_amount(self, currency: str = None):
        """Calcule le montant à payer (avec réduction)"""
        if not self.plan:
            return 0
        
        cur = currency or self.plan.currency or 'XAF'
        base_price = self.plan.get_price(cur, self.duration_months or 1)
        if base_price is None:
            base_price = self.plan.price_monthly or 0
        
        if self.discount_percent:
            return base_price * (1 - self.discount_percent / 100)
        return base_price
    
    def to_dict(self, include_plan=True):
        result = {
            'id': self.id,
            'tenant_id': self.tenant_id,
            'plan_id': self.plan_id,
            'status': self.status,
            'duration_months': self.duration_months,
            'is_active': self.is_active,
            'days_remaining': self.days_remaining,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'trial_ends_at': self.trial_ends_at.isoformat() if self.trial_ends_at else None,
            'current_period_start': self.current_period_start.isoformat() if self.current_period_start else None,
            'current_period_end': self.current_period_end.isoformat() if self.current_period_end else None,
            'cancelled_at': self.cancelled_at.isoformat() if self.cancelled_at else None,
            'last_payment_at': self.last_payment_at.isoformat() if self.last_payment_at else None,
            'next_payment_at': self.next_payment_at.isoformat() if self.next_payment_at else None,
            'payment_method': self.payment_method,
            'discount_percent': self.discount_percent,
            'discount_reason': self.discount_reason,
            'amount_due': self.calculate_amount(),
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
        
        if include_plan and self.plan:
            result['plan'] = self.plan.to_dict()
        
        return result


class SubscriptionPayment(db.Model):
    """
    Historique des paiements d'abonnement
    """
    __tablename__ = 'subscription_payments'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    subscription_id = db.Column(db.String(36), db.ForeignKey('subscriptions.id'), nullable=False)
    tenant_id = db.Column(db.String(36), db.ForeignKey('tenants.id'), nullable=False)
    
    # Montant
    amount = db.Column(db.Numeric(18, 2, asdecimal=False), nullable=False)
    currency = db.Column(db.String(3), default='XAF')

    fx_rate_to_xaf = db.Column(db.Numeric(18, 6, asdecimal=False))  # taux utilisé au moment du paiement
    amount_xaf = db.Column(db.Numeric(18, 2, asdecimal=False))      # amount converti en XAF avec le taux figé

    billing_interval = db.Column(db.String(10))  # monthly, yearly
    duration_months = db.Column(db.Integer)
    unit_price = db.Column(db.Numeric(18, 2, asdecimal=False))
    gross_amount = db.Column(db.Numeric(18, 2, asdecimal=False))
    discount_percent = db.Column(db.Float)
    discount_amount = db.Column(db.Numeric(18, 2, asdecimal=False))
    
    # Provider et références
    provider = db.Column(db.String(50), nullable=False)  # stripe, flutterwave, cinetpay, manual
    provider_payment_id = db.Column(db.String(100))  # ID du paiement chez le provider
    provider_reference = db.Column(db.String(100))   # Référence additionnelle
    
    # Statut: pending, completed, failed, refunded
    status = db.Column(db.String(20), default='pending')
    
    # Période couverte
    period_start = db.Column(db.DateTime)
    period_end = db.Column(db.DateTime)
    
    # Détails
    description = db.Column(db.String(200))
    failure_reason = db.Column(db.Text)
    extra_data = db.Column(db.JSON, default=dict)
    
    # Facture
    invoice_number = db.Column(db.String(50))
    invoice_url = db.Column(db.String(500))
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    completed_at = db.Column(db.DateTime)
    
    def to_dict(self):
        return {
            'id': self.id,
            'subscription_id': self.subscription_id,
            'tenant_id': self.tenant_id,
            'amount': self.amount,
            'currency': self.currency,
            'fx_rate_to_xaf': self.fx_rate_to_xaf,
            'amount_xaf': self.amount_xaf,
            'duration_months': self.duration_months,
            'unit_price': self.unit_price,
            'gross_amount': self.gross_amount,
            'discount_percent': self.discount_percent,
            'discount_amount': self.discount_amount,
            'provider': self.provider,
            'provider_payment_id': self.provider_payment_id,
            'status': self.status,
            'period_start': self.period_start.isoformat() if self.period_start else None,
            'period_end': self.period_end.isoformat() if self.period_end else None,
            'description': self.description,
            'failure_reason': self.failure_reason,
            'invoice_number': self.invoice_number,
            'invoice_url': self.invoice_url,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None
        }


class SubscriptionLog(db.Model):
    """Audit log des actions sur les abonnements (renewal, upgrade, etc.)."""
    __tablename__ = 'subscription_logs'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))

    subscription_id = db.Column(db.String(36), db.ForeignKey('subscriptions.id'), nullable=False, index=True)
    tenant_id = db.Column(db.String(36), db.ForeignKey('tenants.id'), nullable=False, index=True)

    action = db.Column(db.String(50), nullable=False)  # renewal, created, upgraded, etc.
    details = db.Column(db.JSON, default=dict)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    subscription = db.relationship('Subscription', backref=db.backref('logs', lazy='dynamic'))
