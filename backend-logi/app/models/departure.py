"""
Modèle Departure - Départs programmés
Gère les expéditions groupées de colis vers une destination
"""

from app import db
from datetime import datetime
import uuid
import json


class Departure(db.Model):
    """
    Départ programmé - Regroupe plusieurs colis pour une expédition
    Cycle de vie: scheduled → departed → arrived → (cancelled)
    """
    __tablename__ = 'departures'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = db.Column(db.String(36), db.ForeignKey('tenants.id'), nullable=False)
    
    # Route
    origin_country = db.Column(db.String(50), nullable=False)  # Ex: 'China'
    origin_city = db.Column(db.String(50))  # Ex: 'gz' (Guangzhou)
    dest_country = db.Column(db.String(50), nullable=False)  # Ex: 'Cameroon'
    
    # Transport
    transport_mode = db.Column(db.String(20), nullable=False)  # sea, air_normal, air_express
    
    # Transporteur international (DHL, FedEx, etc.) - pour tout le départ
    carrier = db.Column(db.String(50))  # dhl, fedex, ups, ems, etc.
    carrier_tracking = db.Column(db.String(100))  # Numéro de tracking du transporteur
    carrier_status = db.Column(db.String(50))  # Dernier statut reçu du transporteur
    carrier_location = db.Column(db.String(200))  # Dernière localisation
    is_final_leg = db.Column(db.Boolean, default=True)  # Est-ce l'étape finale du voyage?
    
    # Historique des transporteurs (JSON array)
    # Format: [{"carrier": "dhl", "tracking": "123", "from": "2024-01-10T...", "to": "2024-01-15T...", "final_status": "delivered", "is_final_leg": false}, ...]
    carrier_history = db.Column(db.Text, default='[]')
    
    # Dates
    departure_date = db.Column(db.Date, nullable=False)
    estimated_duration = db.Column(db.Integer, default=7)  # Jours
    departed_at = db.Column(db.DateTime)  # Date réelle de départ
    arrived_at = db.Column(db.DateTime)  # Date réelle d'arrivée
    
    # Statut: scheduled, departed, arrived, cancelled
    status = db.Column(db.String(20), default='scheduled')
    
    # Infos complémentaires
    notes = db.Column(db.Text)  # Numéro de vol, conteneur, etc.
    reference = db.Column(db.String(100))  # Référence externe (vol, conteneur)
    
    # Notifications
    notified = db.Column(db.Boolean, default=False)  # Clients notifiés du départ
    notified_at = db.Column(db.DateTime)
    
    # Métadonnées
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = db.Column(db.String(36), db.ForeignKey('users.id'))
    
    # Relations
    packages = db.relationship('Package', backref='departure', lazy='dynamic')
    
    @property
    def estimated_arrival(self):
        """Calcule la date d'arrivée estimée"""
        if self.departure_date and self.estimated_duration:
            from datetime import timedelta
            return self.departure_date + timedelta(days=self.estimated_duration)
        return None
    
    @property
    def packages_count(self):
        """Nombre de colis assignés"""
        return self.packages.count()
    
    @property
    def total_revenue(self):
        """Revenu total du départ (somme des montants des colis)"""
        from sqlalchemy import func
        from app import db
        from app.models.package import Package
        result = db.session.query(func.sum(Package.amount)).filter(
            Package.departure_id == self.id
        ).scalar()
        return result or 0
    
    def get_carrier_history(self) -> list:
        """Retourne l'historique des transporteurs"""
        try:
            return json.loads(self.carrier_history or '[]')
        except (json.JSONDecodeError, TypeError):
            return []
    
    def add_carrier_to_history(self, carrier: str, tracking: str, final_status: str = None, is_final_leg: bool = False):
        """
        Ajoute le transporteur actuel à l'historique avant de le changer
        
        Args:
            carrier: Code du transporteur
            tracking: Numéro de tracking
            final_status: Dernier statut connu (optionnel)
            is_final_leg: Si c'était l'étape finale
        """
        if not carrier or not tracking:
            return
        
        history = self.get_carrier_history()
        
        # Fermer l'entrée précédente si elle existe
        if history and history[-1].get('to') is None:
            history[-1]['to'] = datetime.utcnow().isoformat()
            history[-1]['final_status'] = final_status or self.carrier_status
        
        # Ajouter la nouvelle entrée
        history.append({
            'carrier': carrier,
            'tracking': tracking,
            'from': datetime.utcnow().isoformat(),
            'to': None,
            'final_status': None,
            'final_location': self.carrier_location,
            'is_final_leg': is_final_leg
        })
        
        self.carrier_history = json.dumps(history)
    
    def close_current_carrier(self, final_status: str = None):
        """Ferme l'entrée du transporteur actuel dans l'historique"""
        if not self.carrier:
            return
        
        history = self.get_carrier_history()
        
        if history and history[-1].get('to') is None:
            history[-1]['to'] = datetime.utcnow().isoformat()
            history[-1]['final_status'] = final_status or self.carrier_status
            history[-1]['final_location'] = self.carrier_location
            self.carrier_history = json.dumps(history)
    
    def mark_departed(self):
        """Marquer comme parti - met à jour la date de départ à aujourd'hui"""
        from datetime import date as date_type
        
        self.status = 'departed'
        self.departed_at = datetime.utcnow()
        
        # Toujours mettre à jour departure_date à la date réelle de départ
        today = date_type.today()
        if self.departure_date != today:
            self.departure_date = today
    
    def mark_arrived(self):
        """Marquer comme arrivé"""
        self.status = 'arrived'
        self.arrived_at = datetime.utcnow()
    
    def cancel(self):
        """Annuler le départ"""
        self.status = 'cancelled'
    
    def to_dict(self, include_packages=False, include_carrier_history=False):
        """Sérialisation en dictionnaire"""
        data = {
            'id': self.id,
            'origin_country': self.origin_country,
            'origin_city': self.origin_city,
            'dest_country': self.dest_country,
            # Alias pour compatibilité frontend
            'destination_country': self.dest_country,
            'transport_mode': self.transport_mode,
            'carrier': self.carrier,
            'carrier_tracking': self.carrier_tracking,
            'carrier_status': self.carrier_status,
            'carrier_location': self.carrier_location,
            'is_final_leg': self.is_final_leg,
            'departure_date': self.departure_date.isoformat() if self.departure_date else None,
            'estimated_duration': self.estimated_duration,
            # Alias pour compatibilité frontend
            'duration': self.estimated_duration,
            'estimated_arrival': self.estimated_arrival.isoformat() if self.estimated_arrival else None,
            'departed_at': self.departed_at.isoformat() if self.departed_at else None,
            'arrived_at': self.arrived_at.isoformat() if self.arrived_at else None,
            'status': self.status,
            'notes': self.notes,
            'reference': self.reference,
            'notified': self.notified,
            'packages_count': self.packages_count,
            'total_revenue': self.total_revenue,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
        
        if include_packages:
            data['packages'] = [p.to_dict(include_client=True) for p in self.packages.all()]
        
        if include_carrier_history:
            data['carrier_history'] = self.get_carrier_history()
        
        return data
