"""
Modèle Package - Colis/Marchandise
Gère les colis des clients avec suivi complet
"""

from app import db
from datetime import datetime
import uuid
from app.models.enums import PackageStatus, TransportMode, PackageType


class Package(db.Model):
    """
    Colis/Marchandise
    Représente un envoi d'un client avec toutes ses informations
    """
    __tablename__ = 'packages'
    
    # ==================== INDEXES ====================
    # Indexes composites pour les requêtes fréquentes
    __table_args__ = (
        db.Index('idx_package_tenant_status', 'tenant_id', 'status'),
        db.Index('idx_package_tenant_client', 'tenant_id', 'client_id'),
        db.Index('idx_package_tenant_created', 'tenant_id', 'created_at'),
        db.Index('idx_package_departure', 'departure_id'),
        db.Index('idx_package_carrier_tracking', 'carrier_tracking'),
    )
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = db.Column(db.String(36), db.ForeignKey('tenants.id'), nullable=False, index=True)
    client_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False, index=True)

    origin_warehouse_id = db.Column(db.String(36), db.ForeignKey('warehouses.id'), index=True)
    destination_warehouse_id = db.Column(db.String(36), db.ForeignKey('warehouses.id'), index=True)
    
    # Identifiant unique lisible (ex: EC-2024-00001)
    tracking_number = db.Column(db.String(50), unique=True, nullable=False, index=True)
    
    # Tracking fournisseur (1688, Taobao, etc.) - tracking du vendeur chinois
    supplier_tracking = db.Column(db.String(100), index=True)
    
    # Transporteur international (DHL, FedEx, UPS, etc.)
    carrier = db.Column(db.String(50))  # dhl, fedex, ups, ems, etc.
    carrier_tracking = db.Column(db.String(100))  # Numéro de tracking du transporteur
    
    # Description
    description = db.Column(db.Text, nullable=False)
    category = db.Column(db.String(50))  # electronics, clothing, etc.
    
    # Mode de transport: sea, air_normal, air_express (validé par enum)
    transport_mode = db.Column(db.String(20), default='air_normal')
    
    # Type de colis selon le transport (validé par enum)
    package_type = db.Column(db.String(30), default='normal')
    
    # Dimensions et poids - Valeurs estimées par le client
    weight = db.Column(db.Float)  # kg - estimation client
    length = db.Column(db.Float)  # cm
    width = db.Column(db.Float)   # cm
    height = db.Column(db.Float)  # cm
    cbm = db.Column(db.Float)     # Volume en m³ (pour maritime) - estimation client
    
    # Quantité (nombre de cartons/pièces) - estimation client
    quantity = db.Column(db.Integer, default=1)
    
    # Valeurs finales mesurées par l'agence (après réception)
    final_weight = db.Column(db.Float)  # kg - mesuré à l'agence
    final_cbm = db.Column(db.Float)     # m³ - mesuré à l'agence
    final_quantity = db.Column(db.Integer)  # pièces - compté à l'agence
    
    # Tarif unitaire appliqué (pour le calcul du montant final)
    unit_price = db.Column(db.Numeric(18, 2, asdecimal=False))  # Prix par kg, m³ ou pièce
    
    # Valeur déclarée
    declared_value = db.Column(db.Numeric(18, 2, asdecimal=False))
    currency = db.Column(db.String(3), default='USD')
    
    # Adresses
    origin_address = db.Column(db.Text)
    origin_city = db.Column(db.String(100))
    origin_country = db.Column(db.String(100), default='China')
    
    destination_address = db.Column(db.Text)
    destination_city = db.Column(db.String(100))
    destination_country = db.Column(db.String(100))
    destination_warehouse = db.Column(db.String(100))  # Point de retrait
    
    # Destinataire (peut être différent du client)
    recipient_name = db.Column(db.String(100))
    recipient_phone = db.Column(db.String(20))
    
    # Départ associé
    departure_id = db.Column(db.String(36), db.ForeignKey('departures.id'))
    
    # Statut (validé par enum PackageStatus)
    status = db.Column(db.String(30), default='pending', index=True)
    # pending, received, in_transit, arrived_port, customs, out_for_delivery, delivered
    
    # Localisation actuelle
    current_location = db.Column(db.String(200))
    
    def set_status(self, new_status: str, allow_downgrade: bool = False) -> bool:
        """
        Change le statut avec validation
        
        Args:
            new_status: Nouveau statut
            allow_downgrade: Autoriser le retour en arrière
            
        Returns:
            True si le changement a été effectué
        """
        if not PackageStatus.is_valid(new_status):
            raise ValueError(f"Statut invalide: {new_status}")
        
        if not allow_downgrade:
            status_order = PackageStatus.get_order()
            if self.status in status_order and new_status in status_order:
                if status_order.index(new_status) < status_order.index(self.status):
                    return False  # Rétrogradation non autorisée
        
        self.status = new_status
        return True
    
    def validate_transport_mode(self) -> bool:
        """Valide le mode de transport"""
        return TransportMode.is_valid(self.transport_mode)
    
    def validate_package_type(self) -> bool:
        """Valide le type de colis selon le mode de transport"""
        if not PackageType.is_valid(self.package_type):
            return False
        
        # Vérifier cohérence type/mode
        if self.transport_mode == 'sea':
            return self.package_type in PackageType.get_sea_types()
        else:
            return self.package_type in PackageType.get_air_types()
    
    # Montant et paiement
    amount = db.Column(db.Numeric(18, 2, asdecimal=False), default=0)  # Montant total à payer
    amount_currency = db.Column(db.String(3), default='XAF')
    paid_amount = db.Column(db.Numeric(18, 2, asdecimal=False), default=0)  # Montant déjà payé
    
    # Photos (JSON array d'URLs)
    photos = db.Column(db.JSON, default=list)
    
    # Dates
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    received_at = db.Column(db.DateTime)
    shipped_at = db.Column(db.DateTime)
    estimated_delivery = db.Column(db.DateTime)
    delivered_at = db.Column(db.DateTime)
    
    # Peut être modifié par le client (avant réception)
    is_editable = db.Column(db.Boolean, default=True)
    
    # Notes internes (staff only)
    internal_notes = db.Column(db.Text)
    
    # ==================== RETRAIT / PICKUP ====================
    # Conditions de retrait
    pickup_requires_payment = db.Column(db.Boolean, default=True)
    pickup_payment_id = db.Column(db.String(36), db.ForeignKey('payments.id'))
    
    # Qui a retiré le colis
    picked_up_by = db.Column(db.String(100))  # Nom du retireur
    picked_up_by_phone = db.Column(db.String(20))  # Téléphone du retireur
    picked_up_by_id_type = db.Column(db.String(30))  # Type pièce (cni, passport, etc.)
    picked_up_by_id_number = db.Column(db.String(50))  # Numéro pièce
    
    # Dates et preuves
    picked_up_at = db.Column(db.DateTime)
    pickup_signature = db.Column(db.Text)  # Signature base64
    pickup_photo = db.Column(db.String(255))  # URL photo preuve
    pickup_notes = db.Column(db.Text)  # Notes du retrait
    
    @property
    def is_paid(self):
        """Vérifie si le colis est entièrement payé"""
        return self.paid_amount >= self.amount if self.amount else True
    
    @property
    def payment_status(self):
        """Retourne le statut de paiement"""
        if not self.amount or self.amount == 0:
            return 'no_charge'
        if self.paid_amount >= self.amount:
            return 'paid'
        if self.paid_amount > 0:
            return 'partial'
        return 'unpaid'
    
    @property
    def remaining_amount(self):
        """Montant restant à payer"""
        return max(0, (self.amount or 0) - (self.paid_amount or 0))
    
    @property
    def can_be_picked_up(self):
        """Vérifie si le colis peut être retiré"""
        # Statut doit être arrivé ou en cours de livraison
        if self.status not in ['arrived_port', 'customs', 'out_for_delivery']:
            return False
        
        # Si paiement requis, vérifier qu'il est payé
        if self.pickup_requires_payment and self.remaining_amount > 0:
            return False
            
        return True
    
    @property
    def pickup_status(self):
        """Statut de retrait"""
        if self.status == 'delivered':
            return 'picked_up'
        elif self.can_be_picked_up:
            return 'ready'
        elif self.remaining_amount > 0:
            return 'payment_required'
        else:
            return 'not_ready'
    
    # Relations
    history = db.relationship('PackageHistory', backref='package', lazy='dynamic', 
                              order_by='PackageHistory.created_at.desc()')
    # Note: La relation 'client' est définie via backref dans User.packages
    
    def to_dict(self, include_history=False, include_client=False):
        """
        Sérialisation en dictionnaire
        
        Args:
            include_history: Inclure l'historique des statuts
            include_client: Inclure les infos du client
        """
        data = {
            'id': self.id,
            'origin_warehouse_id': self.origin_warehouse_id,
            'destination_warehouse_id': self.destination_warehouse_id,
            'tracking_number': self.tracking_number,
            'supplier_tracking': self.supplier_tracking,
            'carrier': self.carrier,
            'carrier_tracking': self.carrier_tracking,
            'description': self.description,
            'category': self.category,
            'transport_mode': self.transport_mode,
            'package_type': self.package_type,
            # Valeurs estimées par le client
            'weight': self.weight,
            'cbm': self.cbm,
            'quantity': self.quantity,
            # Valeurs finales mesurées par l'agence
            'final_weight': self.final_weight,
            'final_cbm': self.final_cbm,
            'final_quantity': self.final_quantity,
            'unit_price': self.unit_price,
            # Valeurs effectives (final si disponible, sinon estimation)
            'effective_weight': self.final_weight if self.final_weight is not None else self.weight,
            'effective_cbm': self.final_cbm if self.final_cbm is not None else self.cbm,
            'effective_quantity': self.final_quantity if self.final_quantity is not None else self.quantity,
            'has_final_values': self.final_weight is not None or self.final_cbm is not None or self.final_quantity is not None,
            'dimensions': {
                'length': self.length,
                'width': self.width,
                'height': self.height
            },
            'declared_value': self.declared_value,
            'currency': self.currency,
            'origin': {
                'address': self.origin_address,
                'city': self.origin_city,
                'country': self.origin_country,
                'warehouse_id': self.origin_warehouse_id
            },
            'destination': {
                'address': self.destination_address,
                'city': self.destination_city,
                'country': self.destination_country,
                'warehouse': self.destination_warehouse,
                'warehouse_id': self.destination_warehouse_id
            },
            'recipient': {
                'name': self.recipient_name,
                'phone': self.recipient_phone
            },
            'departure_id': self.departure_id,
            'status': self.status,
            'current_location': self.current_location,
            'amount': self.amount,
            'amount_currency': self.amount_currency,
            'paid_amount': self.paid_amount,
            'payment_status': self.payment_status,
            'remaining_amount': self.remaining_amount,
            'photos': self.photos or [],
            'is_editable': self.is_editable,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'received_at': self.received_at.isoformat() if self.received_at else None,
            'shipped_at': self.shipped_at.isoformat() if self.shipped_at else None,
            'estimated_delivery': self.estimated_delivery.isoformat() if self.estimated_delivery else None,
            'delivered_at': self.delivered_at.isoformat() if self.delivered_at else None
        }
        
        if include_history:
            data['history'] = [h.to_dict() for h in self.history.all()]
        
        if include_client and self.client:
            data['client'] = {
                'id': self.client.id,
                'name': self.client.full_name,
                'phone': self.client.phone,
                'email': self.client.email
            }
        
        return data


class PackageHistory(db.Model):
    """Historique des changements de statut"""
    __tablename__ = 'package_history'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    package_id = db.Column(db.String(36), db.ForeignKey('packages.id'), nullable=False)
    
    status = db.Column(db.String(30), nullable=False)
    location = db.Column(db.String(200))
    notes = db.Column(db.Text)
    
    # Qui a fait la mise à jour
    updated_by = db.Column(db.String(36), db.ForeignKey('users.id'))
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'status': self.status,
            'location': self.location,
            'notes': self.notes,
            'created_at': self.created_at.isoformat()
        }
