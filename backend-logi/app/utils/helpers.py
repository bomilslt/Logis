"""
Fonctions utilitaires
Helpers réutilisables dans toute l'application
"""

from flask import request, abort, g
from datetime import datetime


def generate_tracking_number(tenant_slug, sequence):
    """
    Génère un numéro de suivi unique
    Format: SLUG-YYYY-NNNNN (ex: EC-2024-00001)
    
    Args:
        tenant_slug: Slug du tenant
        sequence: Numéro séquentiel
    
    Returns:
        str: Numéro de tracking formaté
    """
    year = datetime.utcnow().year
    prefix = tenant_slug.upper()[:2] if tenant_slug else 'PK'
    return f"{prefix}-{year}-{sequence:05d}"


def generate_invoice_number(tenant_slug, sequence):
    """
    Génère un numéro de facture unique
    Format: INV-SLUG-YYYY-NNNNN (ex: INV-EC-2024-00001)
    
    Args:
        tenant_slug: Slug du tenant
        sequence: Numéro séquentiel
    
    Returns:
        str: Numéro de facture formaté
    """
    year = datetime.utcnow().year
    prefix = tenant_slug.upper()[:2] if tenant_slug else 'IN'
    return f"INV-{prefix}-{year}-{sequence:05d}"


def get_tenant_id():
    """Récupère le tenant_id depuis le header de la requête"""
    tenant_id = getattr(g, 'tenant_id', None) or request.headers.get('X-Tenant-ID')
    if not tenant_id:
        abort(400, description="X-Tenant-ID header is required")
    return tenant_id


def validate_tenant_access(user, tenant_id):
    """Vérifie que l'utilisateur appartient au tenant"""
    if user.tenant_id != tenant_id:
        abort(403, description="Access denied to this tenant")
    return True


def format_phone(phone, country_code='+237'):
    """
    Formate un numéro de téléphone au format international
    
    Args:
        phone: Numéro de téléphone
        country_code: Code pays par défaut (Cameroun)
    
    Returns:
        str: Numéro formaté
    """
    if not phone:
        return None
    
    # Supprimer les espaces et caractères spéciaux
    phone = ''.join(c for c in phone if c.isdigit() or c == '+')
    
    # Ajouter le code pays si absent
    if not phone.startswith('+'):
        if phone.startswith('00'):
            phone = '+' + phone[2:]
        elif phone.startswith('0'):
            phone = country_code + phone[1:]
        elif phone.startswith('6') or phone.startswith('2'):
            # Numéro camerounais sans indicatif
            phone = country_code + phone
        else:
            phone = '+' + phone
    
    return phone


def format_currency(amount, currency='XAF'):
    """
    Formate un montant avec sa devise
    
    Args:
        amount: Montant
        currency: Code devise
    
    Returns:
        str: Montant formaté
    """
    if amount is None:
        return f"0 {currency}"
    
    # Formater selon la devise
    if currency == 'XAF':
        # Pas de décimales pour le FCFA
        return f"{int(amount):,} {currency}".replace(',', ' ')
    else:
        return f"{amount:,.2f} {currency}"


def calculate_cbm(length, width, height):
    """
    Calcule le volume en mètres cubes
    
    Args:
        length: Longueur en cm
        width: Largeur en cm
        height: Hauteur en cm
    
    Returns:
        float: Volume en m³
    """
    if not all([length, width, height]):
        return None
    
    # Convertir cm en m et calculer
    return round((length / 100) * (width / 100) * (height / 100), 4)


def get_status_label(status, lang='fr'):
    """
    Retourne le label d'un statut de colis
    
    Args:
        status: Code du statut
        lang: Langue (fr, en)
    
    Returns:
        str: Label du statut
    """
    labels = {
        'fr': {
            'pending': 'En attente',
            'received': 'Reçu en entrepôt',
            'in_transit': 'En transit',
            'arrived_port': 'Arrivé au port',
            'customs': 'En douane',
            'out_for_delivery': 'En cours de livraison',
            'delivered': 'Livré',
            'cancelled': 'Annulé'
        },
        'en': {
            'pending': 'Pending',
            'received': 'Received',
            'in_transit': 'In Transit',
            'arrived_port': 'Arrived at Port',
            'customs': 'Customs',
            'out_for_delivery': 'Out for Delivery',
            'delivered': 'Delivered',
            'cancelled': 'Cancelled'
        }
    }
    
    return labels.get(lang, labels['fr']).get(status, status)


def get_transport_label(transport_mode, lang='fr'):
    """
    Retourne le label d'un mode de transport
    
    Args:
        transport_mode: Code du mode
        lang: Langue
    
    Returns:
        str: Label du mode
    """
    labels = {
        'fr': {
            'sea': 'Maritime (Bateau)',
            'air_normal': 'Avion Normal',
            'air_express': 'Avion Express'
        },
        'en': {
            'sea': 'Sea Freight',
            'air_normal': 'Air Normal',
            'air_express': 'Air Express'
        }
    }
    
    return labels.get(lang, labels['fr']).get(transport_mode, transport_mode)


def can_read_package(user, package) -> bool:
    if not user or not package:
        return False
    if getattr(g, 'user_role', None) == 'admin':
        return True
    if getattr(g, 'user_role', None) != 'staff':
        return False
    staff_wh_ids = getattr(g, 'staff_warehouse_ids', None) or ([] if not getattr(g, 'staff_warehouse_id', None) else [getattr(g, 'staff_warehouse_id')])
    if not staff_wh_ids:
        return False
    return package.origin_warehouse_id in staff_wh_ids or package.destination_warehouse_id in staff_wh_ids


def can_edit_package_origin(user, package) -> bool:
    if not user or not package:
        return False
    if getattr(g, 'user_role', None) == 'admin':
        return True
    if getattr(g, 'user_role', None) != 'staff':
        return False
    staff_wh_ids = getattr(g, 'staff_warehouse_ids', None) or ([] if not getattr(g, 'staff_warehouse_id', None) else [getattr(g, 'staff_warehouse_id')])
    if not staff_wh_ids:
        return False
    return package.origin_warehouse_id in staff_wh_ids


def can_edit_package_destination(user, package) -> bool:
    if not user or not package:
        return False
    if getattr(g, 'user_role', None) == 'admin':
        return True
    if getattr(g, 'user_role', None) != 'staff':
        return False
    staff_wh_ids = getattr(g, 'staff_warehouse_ids', None) or ([] if not getattr(g, 'staff_warehouse_id', None) else [getattr(g, 'staff_warehouse_id')])
    if not staff_wh_ids:
        return False
    return package.destination_warehouse_id in staff_wh_ids


def can_process_pickup(user, package) -> bool:
    return can_edit_package_destination(user, package)


def can_manage_payments(user, package) -> bool:
    return can_edit_package_destination(user, package)
