"""
Enums - Types énumérés pour les modèles
=======================================

Centralise tous les types énumérés pour éviter les "magic strings"
et garantir la cohérence des données.
"""

import enum


class PackageStatus(enum.Enum):
    """Statuts possibles d'un colis"""
    PENDING = 'pending'              # En attente de réception
    RECEIVED = 'received'            # Reçu en entrepôt origine
    IN_TRANSIT = 'in_transit'        # En transit
    ARRIVED_PORT = 'arrived_port'    # Arrivé au port/aéroport destination
    CUSTOMS = 'customs'              # En douane
    OUT_FOR_DELIVERY = 'out_for_delivery'  # En cours de livraison
    DELIVERED = 'delivered'          # Livré
    EXCEPTION = 'exception'          # Problème/Exception
    RETURNED = 'returned'            # Retourné
    CANCELLED = 'cancelled'          # Annulé
    
    @classmethod
    def get_label(cls, status: str, lang: str = 'fr') -> str:
        """Retourne le label traduit d'un statut"""
        labels = {
            'fr': {
                'pending': 'En attente',
                'received': 'Reçu en entrepôt',
                'in_transit': 'En transit',
                'arrived_port': 'Arrivé à destination',
                'customs': 'En douane',
                'out_for_delivery': 'En cours de livraison',
                'delivered': 'Livré',
                'exception': 'Problème',
                'returned': 'Retourné',
                'cancelled': 'Annulé'
            },
            'en': {
                'pending': 'Pending',
                'received': 'Received',
                'in_transit': 'In Transit',
                'arrived_port': 'Arrived',
                'customs': 'Customs',
                'out_for_delivery': 'Out for Delivery',
                'delivered': 'Delivered',
                'exception': 'Exception',
                'returned': 'Returned',
                'cancelled': 'Cancelled'
            }
        }
        return labels.get(lang, labels['fr']).get(status, status)
    
    @classmethod
    def get_order(cls) -> list:
        """Retourne l'ordre logique des statuts (pour éviter les rétrogradations)"""
        return [
            'pending', 'received', 'in_transit', 'arrived_port',
            'customs', 'out_for_delivery', 'delivered'
        ]
    
    @classmethod
    def is_valid(cls, status: str) -> bool:
        """Vérifie si un statut est valide"""
        return status in [s.value for s in cls]


class TransportMode(enum.Enum):
    """Modes de transport"""
    AIR_NORMAL = 'air_normal'    # Aérien normal
    AIR_EXPRESS = 'air_express'  # Aérien express
    SEA = 'sea'                  # Maritime
    ROAD = 'road'                # Routier
    
    @classmethod
    def is_valid(cls, mode: str) -> bool:
        return mode in [m.value for m in cls]


class PackageType(enum.Enum):
    """Types de colis"""
    # Types aériens
    NORMAL = 'normal'
    RISKY = 'risky'              # Produits sensibles (batteries, liquides)
    PHONE_BOXED = 'phone_boxed'  # Téléphones avec boîte
    PHONE_UNBOXED = 'phone_unboxed'  # Téléphones sans boîte
    LAPTOP = 'laptop'
    TABLET = 'tablet'
    
    # Types maritimes
    CONTAINER = 'container'
    BACO = 'baco'                # Balle de coton/textile
    CARTON = 'carton'
    VEHICLE = 'vehicle'          # Véhicule
    OTHER_SEA = 'other_sea'      # Autre maritime
    
    # Types routiers
    ROAD_PARCEL = 'road_parcel'  # Colis routier
    ROAD_BULK = 'road_bulk'      # Vrac routier
    
    @classmethod
    def is_valid(cls, pkg_type: str) -> bool:
        return pkg_type in [t.value for t in cls]
    
    @classmethod
    def get_air_types(cls) -> list:
        return ['normal', 'risky', 'phone_boxed', 'phone_unboxed', 'laptop', 'tablet']
    
    @classmethod
    def get_sea_types(cls) -> list:
        return ['container', 'baco', 'carton', 'vehicle', 'other_sea']
    
    @classmethod
    def get_road_types(cls) -> list:
        return ['road_parcel', 'road_bulk', 'carton']


class UserRole(enum.Enum):
    """Rôles utilisateur"""
    CLIENT = 'client'        # Client final
    STAFF = 'staff'          # Employé
    ADMIN = 'admin'          # Administrateur
    SUPER_ADMIN = 'super_admin'  # Super administrateur
    
    @classmethod
    def is_valid(cls, role: str) -> bool:
        return role in [r.value for r in cls]
    
    @classmethod
    def is_admin_role(cls, role: str) -> bool:
        return role in ['admin', 'super_admin']
    
    @classmethod
    def is_staff_role(cls, role: str) -> bool:
        return role in ['staff', 'admin', 'super_admin']


class DepartureStatus(enum.Enum):
    """Statuts de départ"""
    SCHEDULED = 'scheduled'  # Programmé
    DEPARTED = 'departed'    # Parti
    ARRIVED = 'arrived'      # Arrivé
    CANCELLED = 'cancelled'  # Annulé
    
    @classmethod
    def is_valid(cls, status: str) -> bool:
        return status in [s.value for s in cls]


class PaymentStatus(enum.Enum):
    """Statuts de paiement"""
    PENDING = 'pending'      # En attente
    COMPLETED = 'completed'  # Complété
    PARTIAL = 'partial'      # Partiel
    CANCELLED = 'cancelled'  # Annulé
    REFUNDED = 'refunded'    # Remboursé
    
    @classmethod
    def is_valid(cls, status: str) -> bool:
        return status in [s.value for s in cls]


class PaymentMethod(enum.Enum):
    """Méthodes de paiement"""
    CASH = 'cash'
    MOBILE_MONEY = 'mobile_money'
    BANK_TRANSFER = 'bank_transfer'
    CARD = 'card'
    OTHER = 'other'
    
    @classmethod
    def is_valid(cls, method: str) -> bool:
        return method in [m.value for m in cls]


class NotificationType(enum.Enum):
    """Types de notification"""
    STATUS_UPDATE = 'status_update'
    PAYMENT = 'payment'
    ANNOUNCEMENT = 'announcement'
    REMINDER = 'reminder'
    SYSTEM = 'system'
    
    @classmethod
    def is_valid(cls, ntype: str) -> bool:
        return ntype in [t.value for t in cls]


class NotificationChannel(enum.Enum):
    """Canaux de notification"""
    SMS = 'sms'
    EMAIL = 'email'
    WHATSAPP = 'whatsapp'
    PUSH = 'push'
    IN_APP = 'in_app'


class AnnouncementType(enum.Enum):
    """Types d'annonce"""
    INFO = 'info'
    WARNING = 'warning'
    PROMO = 'promo'
    URGENT = 'urgent'
    
    @classmethod
    def is_valid(cls, atype: str) -> bool:
        return atype in [t.value for t in cls]


# Carriers supportés
SUPPORTED_CARRIERS = {
    'dhl': 'DHL Express',
    'fedex': 'FedEx',
    'ups': 'UPS',
    'ems': 'EMS',
    'china_post': 'China Post',
    'sf_express': 'SF Express',
    'aramex': 'Aramex',
    'dpd': 'DPD',
    'tnt': 'TNT',
    'ethiopian': 'Ethiopian Airlines Cargo',
    'kenya_airways': 'Kenya Airways Cargo',
    'other': 'Autre'
}


def get_carrier_name(code: str) -> str:
    """Retourne le nom complet d'un transporteur"""
    return SUPPORTED_CARRIERS.get(code, code.upper())
