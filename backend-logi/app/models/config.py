"""
Modèle TenantConfig - Configuration du tenant
Stocke les origines, destinations, tarifs et paramètres
"""

from app import db
from datetime import datetime
import uuid


class TenantConfig(db.Model):
    """
    Configuration du tenant
    Stocke les paramètres métier: origines, destinations, tarifs, etc.
    """
    __tablename__ = 'tenant_configs'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = db.Column(db.String(36), db.ForeignKey('tenants.id'), nullable=False, unique=True)
    
    # Configuration JSON
    # Structure:
    # {
    #   "origins": { "China": { "label": "Chine", "cities": [...] } },
    #   "destinations": { "Cameroon": { "label": "Cameroun", "warehouses": [...] } },
    #   "shipping_rates": { "China_Cameroon": { "sea": {...}, "air_normal": {...} } },
    #   "currencies": ["XAF", "USD", "EUR"],
    #   "default_currency": "XAF"
    # }
    config_data = db.Column(db.JSON, default=dict)
    
    # Métadonnées
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relations
    tenant = db.relationship('Tenant', backref=db.backref('config', uselist=False))
    
    @property
    def origins(self):
        """Retourne les origines configurées"""
        return self.config_data.get('origins', {})
    
    @origins.setter
    def origins(self, value):
        if not self.config_data:
            self.config_data = {}
        self.config_data['origins'] = value
    
    @property
    def destinations(self):
        """Retourne les destinations configurées"""
        return self.config_data.get('destinations', {})
    
    @destinations.setter
    def destinations(self, value):
        if not self.config_data:
            self.config_data = {}
        self.config_data['destinations'] = value
    
    @property
    def shipping_rates(self):
        """Retourne les tarifs configurés"""
        return self.config_data.get('shipping_rates', {})
    
    @shipping_rates.setter
    def shipping_rates(self, value):
        if not self.config_data:
            self.config_data = {}
        self.config_data['shipping_rates'] = value
    
    def get_rate(self, origin, destination, transport_mode):
        """
        Récupère le tarif pour une route et un mode de transport
        
        Args:
            origin: Code pays d'origine (ex: 'China')
            destination: Code pays de destination (ex: 'Cameroon')
            transport_mode: Mode de transport (sea, air_normal, air_express)
        
        Returns:
            dict: Tarifs pour ce mode ou None
        """
        route_key = f"{origin}_{destination}"
        route_rates = self.shipping_rates.get(route_key, {})
        return route_rates.get(transport_mode)
    
    def to_dict(self, public_only=False):
        """
        Sérialisation en dictionnaire
        
        Args:
            public_only: Si True, retourne uniquement les données publiques
                        (pour l'API client)
        """
        if public_only:
            return {
                'origins': self.origins,
                'destinations': self.destinations,
                'shipping_rates': self.shipping_rates,
                'currencies': self.config_data.get('currencies', ['XAF', 'XOF', 'USD']),
                'default_currency': self.config_data.get('default_currency', 'XAF')
            }
        
        return {
            'id': self.id,
            'tenant_id': self.tenant_id,
            'config_data': self.config_data,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class Warehouse(db.Model):
    """
    Entrepôt / Point de retrait
    Lié à une destination pour le tenant
    """
    __tablename__ = 'warehouses'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = db.Column(db.String(36), db.ForeignKey('tenants.id'), nullable=False)
    
    # Localisation
    country = db.Column(db.String(50), nullable=False)
    city = db.Column(db.String(100))
    code = db.Column(db.String(100))
    name = db.Column(db.String(100), nullable=False)
    address = db.Column(db.Text)
    
    # Contact
    phone = db.Column(db.String(20))
    email = db.Column(db.String(120))
    
    # Coordonnées GPS (optionnel)
    latitude = db.Column(db.Float)
    longitude = db.Column(db.Float)
    
    # Statut
    is_active = db.Column(db.Boolean, default=True)
    
    # Métadonnées
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def to_dict(self):
        """Sérialisation en dictionnaire"""
        return {
            'id': self.id,
            'code': self.code,
            'country': self.country,
            'city': self.city,
            'name': self.name,
            'address': self.address,
            'phone': self.phone,
            'email': self.email,
            'latitude': self.latitude,
            'longitude': self.longitude,
            'is_active': self.is_active
        }
