"""
Modèle TenantPaymentProvider - Configuration paiement par tenant
================================================================

Chaque tenant peut configurer ses propres providers de paiement
(Orange Money, MTN MoMo, Stripe, Flutterwave, CinetPay, Monetbil)
avec ses propres clés API chiffrées.

Activé uniquement si le plan du tenant inclut la feature 'online_payments'.
"""

from app import db
from datetime import datetime
import uuid
import json
from cryptography.fernet import Fernet
from app.models.platform_config import get_encryption_key


# Tous les providers supportés pour les tenants
TENANT_PROVIDER_TEMPLATES = {
    'orange_money': {
        'name': 'Orange Money',
        'description': 'Paiements via Orange Money. Disponible au Cameroun, Côte d\'Ivoire, Sénégal, Mali, etc.',
        'supported_methods': ['mobile_money'],
        'supported_countries': ['CM', 'CI', 'SN', 'ML', 'BF', 'MG', 'GN', 'NE'],
        'supported_currencies': ['XAF', 'XOF'],
        'credentials_schema': {
            'merchant_key': {'label': 'Clé marchand', 'type': 'text', 'required': True},
            'api_user': {'label': 'Utilisateur API', 'type': 'text', 'required': True},
            'api_key': {'label': 'Clé API', 'type': 'password', 'required': True},
            'pin': {'label': 'Code PIN', 'type': 'password', 'required': False}
        },
        'config_schema': {
            'default_currency': {'label': 'Devise par défaut', 'type': 'select', 'options': ['XAF', 'XOF']},
            'environment': {'label': 'Environnement', 'type': 'select', 'options': ['sandbox', 'production']}
        },
        'icon': 'orange-money'
    },
    'mtn_momo': {
        'name': 'MTN Mobile Money',
        'description': 'Paiements via MTN MoMo. Disponible au Cameroun, Côte d\'Ivoire, Ghana, Uganda, etc.',
        'supported_methods': ['mobile_money'],
        'supported_countries': ['CM', 'CI', 'GH', 'UG', 'RW', 'BJ', 'CG', 'SZ'],
        'supported_currencies': ['XAF', 'XOF', 'GHS', 'UGX', 'RWF'],
        'credentials_schema': {
            'subscription_key': {'label': 'Clé d\'abonnement (Ocp-Apim-Subscription-Key)', 'type': 'password', 'required': True},
            'api_user': {'label': 'Utilisateur API (X-Reference-Id)', 'type': 'text', 'required': True},
            'api_key': {'label': 'Clé API', 'type': 'password', 'required': True},
            'callback_url': {'label': 'URL de callback', 'type': 'text', 'required': False}
        },
        'config_schema': {
            'default_currency': {'label': 'Devise par défaut', 'type': 'select', 'options': ['XAF', 'XOF']},
            'environment': {'label': 'Environnement', 'type': 'select', 'options': ['sandbox', 'production']},
            'target_environment': {'label': 'Environnement cible MTN', 'type': 'text'}
        },
        'icon': 'mtn-momo'
    },
    'stripe': {
        'name': 'Stripe',
        'description': 'Paiements par carte internationaux. Visa, Mastercard, etc.',
        'supported_methods': ['card'],
        'supported_countries': ['*'],
        'supported_currencies': ['EUR', 'USD', 'GBP', 'XAF', 'XOF'],
        'credentials_schema': {
            'secret_key': {'label': 'Clé secrète (sk_...)', 'type': 'password', 'required': True},
            'publishable_key': {'label': 'Clé publique (pk_...)', 'type': 'text', 'required': True},
            'webhook_secret': {'label': 'Secret webhook (whsec_...)', 'type': 'password', 'required': False}
        },
        'config_schema': {
            'default_currency': {'label': 'Devise par défaut', 'type': 'select', 'options': ['EUR', 'USD', 'XAF']}
        },
        'icon': 'stripe'
    },
    'flutterwave': {
        'name': 'Flutterwave',
        'description': 'Paiements Mobile Money et cartes en Afrique. MTN, Orange Money, etc.',
        'supported_methods': ['card', 'mobile_money', 'bank_transfer'],
        'supported_countries': ['CM', 'CI', 'SN', 'GH', 'NG', 'KE', 'TZ', 'UG', 'RW', 'ZA'],
        'supported_currencies': ['XAF', 'XOF', 'NGN', 'GHS', 'KES', 'TZS', 'UGX', 'RWF', 'ZAR', 'USD'],
        'credentials_schema': {
            'secret_key': {'label': 'Clé secrète', 'type': 'password', 'required': True},
            'public_key': {'label': 'Clé publique', 'type': 'text', 'required': True},
            'encryption_key': {'label': 'Clé de chiffrement', 'type': 'password', 'required': False},
            'webhook_secret': {'label': 'Secret webhook', 'type': 'password', 'required': False}
        },
        'config_schema': {
            'default_currency': {'label': 'Devise par défaut', 'type': 'select', 'options': ['XAF', 'XOF', 'NGN']}
        },
        'icon': 'flutterwave'
    },
    'cinetpay': {
        'name': 'CinetPay',
        'description': 'Paiements Mobile Money en Afrique francophone. MTN, Orange, Moov.',
        'supported_methods': ['mobile_money', 'card'],
        'supported_countries': ['CM', 'CI', 'SN', 'BF', 'ML', 'BJ', 'TG', 'NE', 'CD', 'CG'],
        'supported_currencies': ['XAF', 'XOF', 'CDF'],
        'credentials_schema': {
            'api_key': {'label': 'Clé API', 'type': 'password', 'required': True},
            'site_id': {'label': 'ID du site', 'type': 'text', 'required': True},
            'secret_key': {'label': 'Clé secrète (IPN)', 'type': 'password', 'required': False}
        },
        'config_schema': {
            'default_currency': {'label': 'Devise par défaut', 'type': 'select', 'options': ['XAF', 'XOF']}
        },
        'icon': 'cinetpay'
    },
    'monetbil': {
        'name': 'Monetbil',
        'description': 'Paiements Mobile Money en Afrique. MTN, Orange, Nexttel, Express Union.',
        'supported_methods': ['mobile_money'],
        'supported_countries': ['CM', 'CI', 'SN', 'BF', 'ML', 'BJ', 'TG', 'NE', 'CD', 'CG', 'GA'],
        'supported_currencies': ['XAF', 'XOF'],
        'credentials_schema': {
            'service_key': {'label': 'Clé de service', 'type': 'text', 'required': True},
            'service_secret': {'label': 'Secret de service', 'type': 'password', 'required': True}
        },
        'config_schema': {
            'default_currency': {'label': 'Devise par défaut', 'type': 'select', 'options': ['XAF', 'XOF']}
        },
        'icon': 'monetbil'
    }
}


class TenantPaymentProvider(db.Model):
    """
    Configuration d'un provider de paiement pour un tenant spécifique.
    
    Chaque tenant peut configurer un ou plusieurs providers avec ses propres
    clés API. Les credentials sont chiffrés en base.
    """
    __tablename__ = 'tenant_payment_providers'
    __table_args__ = (
        db.UniqueConstraint('tenant_id', 'provider_code', name='uq_tenant_provider'),
    )
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = db.Column(db.String(36), db.ForeignKey('tenants.id'), nullable=False)
    
    # Identifiant du provider: orange_money, mtn_momo, stripe, flutterwave, cinetpay, monetbil
    provider_code = db.Column(db.String(50), nullable=False)
    
    # Statut
    is_enabled = db.Column(db.Boolean, default=False)
    is_test_mode = db.Column(db.Boolean, default=True)
    
    # Credentials (chiffrés)
    _credentials_encrypted = db.Column('credentials_encrypted', db.Text)
    
    # Configuration spécifique au provider
    config = db.Column(db.JSON, default=dict)
    
    # Ordre d'affichage/priorité (le plus petit = le plus prioritaire)
    display_order = db.Column(db.Integer, default=0)
    
    # Statistiques
    total_transactions = db.Column(db.Integer, default=0)
    total_amount = db.Column(db.Numeric(18, 2, asdecimal=False), default=0)
    last_transaction_at = db.Column(db.DateTime)
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relations
    tenant = db.relationship('Tenant', backref=db.backref('payment_providers', lazy='dynamic'))
    
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
            'tenant_id': self.tenant_id,
            'provider_code': self.provider_code,
            'name': TENANT_PROVIDER_TEMPLATES.get(self.provider_code, {}).get('name', self.provider_code),
            'is_enabled': self.is_enabled,
            'is_test_mode': self.is_test_mode,
            'config': self.config or {},
            'display_order': self.display_order,
            'total_transactions': self.total_transactions,
            'total_amount': self.total_amount,
            'last_transaction_at': self.last_transaction_at.isoformat() if self.last_transaction_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
        
        # Ajouter le template
        if self.provider_code in TENANT_PROVIDER_TEMPLATES:
            template = TENANT_PROVIDER_TEMPLATES[self.provider_code]
            result['supported_methods'] = template.get('supported_methods', [])
            result['supported_currencies'] = template.get('supported_currencies', [])
            result['icon'] = template.get('icon', '')
        
        if include_credentials:
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
