"""
Configuration Plateforme - Modèles Super-Admin
==============================================

Configuration globale de la plateforme SaaS,
incluant les providers de paiement et paramètres système.
"""

from app import db
from datetime import datetime
import uuid
import json
from cryptography.fernet import Fernet
import os
import base64


def get_encryption_key():
    """Récupère la clé de chiffrement depuis les variables d'environnement.
    
    Utilise ENCRYPTION_KEY (standard) avec fallback sur PLATFORM_ENCRYPTION_KEY
    pour la compatibilité ascendante.
    """
    key = os.environ.get('ENCRYPTION_KEY') or os.environ.get('PLATFORM_ENCRYPTION_KEY')
    if not key:
        env = (os.environ.get('FLASK_ENV') or os.environ.get('ENV') or 'development').lower()
        if env in ['production', 'prod']:
            raise RuntimeError('ENCRYPTION_KEY is required in production')

        # Fallback dev/test uniquement (à remplacer en prod)
        key = base64.urlsafe_b64encode(b'default-key-32-bytes-long!!!!!')
    return key.encode() if isinstance(key, str) else key


class PlatformConfig(db.Model):
    """
    Configuration globale de la plateforme
    Singleton - une seule entrée dans la table
    """
    __tablename__ = 'platform_config'
    
    id = db.Column(db.String(36), primary_key=True, default='platform-config-singleton')
    
    # Informations plateforme
    platform_name = db.Column(db.String(100), default='Express Cargo SaaS')
    platform_logo = db.Column(db.String(500))
    platform_favicon = db.Column(db.String(500))
    support_email = db.Column(db.String(120))
    support_phone = db.Column(db.String(20))
    
    # URLs
    website_url = db.Column(db.String(500))
    terms_url = db.Column(db.String(500))
    privacy_url = db.Column(db.String(500))
    
    # Configuration emails système
    system_email_from = db.Column(db.String(120))
    system_email_name = db.Column(db.String(100))
    
    # Limites globales
    default_trial_days = db.Column(db.Integer, default=14)
    max_tenants = db.Column(db.Integer, default=-1)  # -1 = illimité
    registration_enabled = db.Column(db.Boolean, default=True)
    
    # Maintenance
    maintenance_mode = db.Column(db.Boolean, default=False)
    maintenance_message = db.Column(db.Text)
    
    # Webhooks globaux
    webhook_secret = db.Column(db.String(100))
    
    # Métadonnées
    settings = db.Column(db.JSON, default=dict)
    
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    updated_by = db.Column(db.String(36))
    
    @classmethod
    def get_config(cls):
        """Récupère ou crée la configuration singleton"""
        config = cls.query.first()
        if not config:
            config = cls(id='platform-config-singleton')
            db.session.add(config)
            db.session.commit()
        return config
    
    def to_dict(self, include_sensitive=False):
        result = {
            'platform_name': self.platform_name,
            'platform_logo': self.platform_logo,
            'platform_favicon': self.platform_favicon,
            'support_email': self.support_email,
            'support_phone': self.support_phone,
            'website_url': self.website_url,
            'terms_url': self.terms_url,
            'privacy_url': self.privacy_url,
            'system_email_from': self.system_email_from,
            'system_email_name': self.system_email_name,
            'default_trial_days': self.default_trial_days,
            'max_tenants': self.max_tenants,
            'registration_enabled': self.registration_enabled,
            'maintenance_mode': self.maintenance_mode,
            'maintenance_message': self.maintenance_message,
            'settings': self.settings or {},
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
        
        if include_sensitive:
            result['webhook_secret'] = self.webhook_secret
        
        return result


class CurrencyRate(db.Model):
    __tablename__ = 'currency_rates'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))

    currency = db.Column(db.String(3), nullable=False, unique=True)
    rate_to_xaf = db.Column(db.Numeric(18, 6, asdecimal=False), nullable=False)

    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    updated_by = db.Column(db.String(36))

    def to_dict(self):
        return {
            'currency': self.currency,
            'rate_to_xaf': float(self.rate_to_xaf),
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'updated_by': self.updated_by
        }


class PlatformPaymentProvider(db.Model):
    """
    Configuration des providers de paiement pour les abonnements
    Supporte: Stripe, Flutterwave, CinetPay
    """
    __tablename__ = 'platform_payment_providers'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    
    # Identifiant du provider: stripe, flutterwave, cinetpay
    provider_code = db.Column(db.String(50), unique=True, nullable=False)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text)
    
    # Statut
    is_enabled = db.Column(db.Boolean, default=False)
    is_test_mode = db.Column(db.Boolean, default=True)  # Mode sandbox/test
    
    # Credentials (chiffrés)
    _credentials_encrypted = db.Column('credentials_encrypted', db.Text)
    
    # Configuration spécifique au provider
    config = db.Column(db.JSON, default=dict)
    # Structure config:
    # Stripe: { "webhook_endpoint_secret": "...", "default_currency": "eur" }
    # Flutterwave: { "encryption_key": "...", "default_currency": "XAF" }
    # CinetPay: { "site_id": "...", "default_currency": "XOF" }
    
    # Méthodes de paiement supportées par ce provider
    supported_methods = db.Column(db.JSON, default=list)
    # ["card", "mobile_money", "bank_transfer"]
    
    # Pays supportés
    supported_countries = db.Column(db.JSON, default=list)
    # ["CM", "CI", "SN", "FR", "US"]
    
    # Devises supportées
    supported_currencies = db.Column(db.JSON, default=list)
    # ["XAF", "XOF", "EUR", "USD"]
    
    # Ordre d'affichage/priorité
    display_order = db.Column(db.Integer, default=0)
    
    # Webhooks
    webhook_url = db.Column(db.String(500))
    webhook_secret = db.Column(db.String(200))
    
    # Statistiques
    total_transactions = db.Column(db.Integer, default=0)
    total_amount = db.Column(db.Numeric(18, 2, asdecimal=False), default=0)
    last_transaction_at = db.Column(db.DateTime)
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    @property
    def credentials(self):
        """Déchiffre et retourne les credentials"""
        if not self._credentials_encrypted:
            return {}
        try:
            f = Fernet(get_encryption_key())
            decrypted = f.decrypt(self._credentials_encrypted.encode())
            return json.loads(decrypted.decode())
        except Exception:
            return {}
    
    @credentials.setter
    def credentials(self, value):
        """Chiffre et stocke les credentials"""
        if value:
            f = Fernet(get_encryption_key())
            encrypted = f.encrypt(json.dumps(value).encode())
            self._credentials_encrypted = encrypted.decode()
        else:
            self._credentials_encrypted = None
    
    def get_credential(self, key: str, default=None):
        """Récupère un credential spécifique"""
        return self.credentials.get(key, default)
    
    def to_dict(self, include_credentials=False):
        result = {
            'id': self.id,
            'provider_code': self.provider_code,
            'name': self.name,
            'description': self.description,
            'is_enabled': self.is_enabled,
            'is_test_mode': self.is_test_mode,
            'config': self.config or {},
            'supported_methods': self.supported_methods or [],
            'supported_countries': self.supported_countries or [],
            'supported_currencies': self.supported_currencies or [],
            'display_order': self.display_order,
            'webhook_url': self.webhook_url,
            'total_transactions': self.total_transactions,
            'total_amount': self.total_amount,
            'last_transaction_at': self.last_transaction_at.isoformat() if self.last_transaction_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
        
        if include_credentials:
            # Masquer partiellement les clés sensibles
            creds = self.credentials
            masked_creds = {}
            for key, value in creds.items():
                if value and len(str(value)) > 8:
                    masked_creds[key] = str(value)[:4] + '****' + str(value)[-4:]
                else:
                    masked_creds[key] = '****'
            result['credentials_masked'] = masked_creds
            result['has_credentials'] = bool(creds)
        
        return result


class SuperAdmin(db.Model):
    """
    Utilisateurs super-admin (niveau plateforme, pas tenant)
    Séparé des users tenants pour plus de sécurité
    """
    __tablename__ = 'super_admins'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    
    first_name = db.Column(db.String(50), nullable=False)
    last_name = db.Column(db.String(50), nullable=False)
    
    # Permissions super-admin
    permissions = db.Column(db.JSON, default=list)
    # ["tenants.manage", "plans.manage", "payments.manage", "config.manage"]
    
    is_active = db.Column(db.Boolean, default=True)
    is_primary = db.Column(db.Boolean, default=False)  # Admin principal (ne peut pas être supprimé)
    
    # 2FA
    two_factor_enabled = db.Column(db.Boolean, default=False)
    two_factor_secret = db.Column(db.String(100))
    
    # Tracking
    last_login = db.Column(db.DateTime)
    last_ip = db.Column(db.String(45))
    login_count = db.Column(db.Integer, default=0)
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def set_password(self, password):
        from werkzeug.security import generate_password_hash
        self.password_hash = generate_password_hash(password)
    
    def check_password(self, password):
        from werkzeug.security import check_password_hash
        return check_password_hash(self.password_hash, password)
    
    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}"
    
    def has_permission(self, permission: str) -> bool:
        """Vérifie si l'admin a une permission"""
        if not self.permissions:
            return False
        # L'admin primaire a toutes les permissions
        if self.is_primary:
            return True
        return permission in self.permissions or '*' in self.permissions
    
    def to_dict(self, include_sensitive=False):
        result = {
            'id': self.id,
            'email': self.email,
            'first_name': self.first_name,
            'last_name': self.last_name,
            'full_name': self.full_name,
            'permissions': self.permissions or [],
            'is_active': self.is_active,
            'is_primary': self.is_primary,
            'two_factor_enabled': self.two_factor_enabled,
            'last_login': self.last_login.isoformat() if self.last_login else None,
            'login_count': self.login_count,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
        
        if include_sensitive:
            result['last_ip'] = self.last_ip
        
        return result
