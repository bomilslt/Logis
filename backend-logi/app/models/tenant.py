from app import db
from datetime import datetime
import uuid


# Canaux d'accès supportés
CHANNEL_WEB_ADMIN = 'web_admin'              # Interface admin web
CHANNEL_WEB_CLIENT = 'web_client'            # Interface client web
CHANNEL_APP_ANDROID_CLIENT = 'app_android_client'  # App mobile Android client
CHANNEL_APP_IOS_CLIENT = 'app_ios_client'    # App mobile iOS client
CHANNEL_PC_ADMIN = 'pc_admin'                # Application desktop Windows admin
CHANNEL_MAC_ADMIN = 'mac_admin'              # Application desktop macOS admin

# Tous les canaux valides
ALL_CHANNELS = [
    CHANNEL_WEB_ADMIN, CHANNEL_WEB_CLIENT,
    CHANNEL_APP_ANDROID_CLIENT, CHANNEL_APP_IOS_CLIENT,
    CHANNEL_PC_ADMIN, CHANNEL_MAC_ADMIN,
]

# Canaux par défaut pour les nouveaux tenants
DEFAULT_CHANNELS = [CHANNEL_WEB_ADMIN, CHANNEL_WEB_CLIENT]


def channel_matches(request_channel: str, allowed: list) -> bool:
    """
    Vérifie si un canal de requête est autorisé.
    Tous les canaux sont désormais spécifiques (pas de mapping générique).
    """
    if not allowed:
        return False
    return request_channel in allowed


class Tenant(db.Model):
    """Entreprise cliente de la plateforme SaaS"""
    __tablename__ = 'tenants'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = db.Column(db.String(100), nullable=False)
    slug = db.Column(db.String(50), unique=True, nullable=False)
    email = db.Column(db.String(120), nullable=False)
    phone = db.Column(db.String(20))
    address = db.Column(db.Text)
    is_active = db.Column(db.Boolean, default=True)
    settings = db.Column(db.JSON, default=dict)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Contrôle d'accès par canal
    allowed_channels = db.Column(db.JSON, default=lambda: DEFAULT_CHANNELS.copy())
    # Structure: ["web_admin", "web_client", "app_android_client", ...]
    
    # Entitlements avancés (fonctionnalités activées)
    entitlements = db.Column(db.JSON, default=dict)
    # Structure: {
    #   "max_devices_per_user": 3,
    #   "offline_mode": false,
    #   "api_rate_limit": 1000,
    #   "custom_branding": false
    # }
    
    # Relations
    users = db.relationship('User', backref='tenant', lazy='dynamic')
    packages = db.relationship('Package', backref='tenant', lazy='dynamic')
    
    def is_channel_allowed(self, channel: str) -> bool:
        """Vérifie si un canal d'accès est autorisé pour ce tenant"""
        channels = self.allowed_channels or DEFAULT_CHANNELS
        return channel_matches(channel, channels)
    
    def get_entitlement(self, key: str, default=None):
        """Récupère une valeur d'entitlement"""
        if not self.entitlements:
            return default
        return self.entitlements.get(key, default)
    
    def to_dict(self, include_entitlements=False):
        result = {
            'id': self.id,
            'name': self.name,
            'slug': self.slug,
            'email': self.email,
            'phone': self.phone,
            'address': self.address,
            'is_active': self.is_active,
            'allowed_channels': self.allowed_channels or DEFAULT_CHANNELS,
            'created_at': self.created_at.isoformat()
        }
        if include_entitlements:
            result['entitlements'] = self.entitlements or {}
        return result
