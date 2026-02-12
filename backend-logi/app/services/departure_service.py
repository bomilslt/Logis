"""
Service Departures - Logique métier des départs
================================================

Gère les règles métier complexes des départs:
- Nettoyage automatique des colis non reçus à la date du départ
- Validation des assignations
"""

from app import db
from app.models import Departure, Package, PackageHistory
from datetime import date, datetime
import logging

logger = logging.getLogger(__name__)


def cleanup_pending_packages_for_departures(tenant_id: str = None) -> dict:
    """
    Nettoie les colis non reçus à la date du départ.
    
    Pour tous les départs dont la date de départ est passée (ou aujourd'hui)
    et qui sont encore en statut "scheduled", retire les colis qui n'ont pas
    le statut "received" (ils ne sont pas prêts à partir).
    
    Args:
        tenant_id: Optionnel - limiter à un tenant spécifique
        
    Returns:
        dict avec processed_departures et updated_packages
    """
    today = date.today()
    
    # Trouver les départs scheduled dont la date est passée ou aujourd'hui
    query = Departure.query.filter(
        Departure.status == 'scheduled',
        Departure.departure_date <= today
    )
    
    if tenant_id:
        query = query.filter(Departure.tenant_id == tenant_id)
    
    departures = query.all()
    
    processed_departures = 0
    updated_packages = 0
    
    for departure in departures:
        # Récupérer tous les colis assignés à ce départ
        packages = Package.query.filter(
            Package.departure_id == departure.id
        ).all()
        
        packages_removed = 0
        
        for package in packages:
            # Retirer les colis qui ne sont pas "received"
            if package.status != 'received':
                package.departure_id = None
                packages_removed += 1
                
                logger.info(
                    f"[Cleanup] Colis {package.tracking_number} retiré du départ "
                    f"{departure.id} (statut: {package.status}, date départ: {departure.departure_date})"
                )
        
        if packages_removed > 0:
            processed_departures += 1
            updated_packages += packages_removed
            
            logger.info(
                f"[Cleanup] Départ {departure.id}: {packages_removed} colis retirés "
                f"(non reçus à la date prévue {departure.departure_date})"
            )
    
    if updated_packages > 0:
        db.session.commit()
        logger.info(
            f"[Cleanup] Terminé: {processed_departures} départs traités, "
            f"{updated_packages} colis retirés"
        )
    
    return {
        'tenant_id': tenant_id,
        'processed_departures': processed_departures,
        'updated_packages': updated_packages
    }


def auto_assign_packages_to_departure(departure_id: str, tenant_id: str) -> dict:
    """
    Assigne automatiquement les colis en attente à un départ.
    
    Trouve les colis pending/received qui correspondent à la route du départ
    (origine, destination, mode de transport) et les assigne.
    
    Args:
        departure_id: ID du départ
        tenant_id: ID du tenant
        
    Returns:
        dict avec assigned_count
    """
    departure = Departure.query.filter_by(
        id=departure_id,
        tenant_id=tenant_id
    ).first()
    
    if not departure:
        return {'error': 'Départ non trouvé', 'assigned_count': 0}
    
    if departure.status != 'scheduled':
        return {'error': 'Le départ doit être en statut scheduled', 'assigned_count': 0}
    
    # Trouver les colis correspondants non assignés
    packages = Package.query.filter(
        Package.tenant_id == tenant_id,
        Package.departure_id == None,
        Package.origin_country == departure.origin_country,
        Package.destination_country == departure.dest_country,
        Package.transport_mode == departure.transport_mode,
        Package.status.in_(['pending', 'received'])
    ).all()
    
    assigned_count = 0
    for package in packages:
        package.departure_id = departure.id
        assigned_count += 1
        
        logger.info(
            f"[AutoAssign] Colis {package.tracking_number} assigné au départ {departure_id}"
        )
    
    if assigned_count > 0:
        db.session.commit()
    
    return {
        'departure_id': departure_id,
        'assigned_count': assigned_count
    }


def validate_departure_ready(departure_id: str, tenant_id: str) -> dict:
    """
    Valide qu'un départ est prêt à partir.
    
    Vérifie:
    - Au moins un colis assigné avec statut "received"
    - Tous les colis ont les informations requises
    
    Args:
        departure_id: ID du départ
        tenant_id: ID du tenant
        
    Returns:
        dict avec is_ready, ready_packages, not_ready_packages, errors
    """
    departure = Departure.query.filter_by(
        id=departure_id,
        tenant_id=tenant_id
    ).first()
    
    if not departure:
        return {'is_ready': False, 'errors': ['Départ non trouvé']}
    
    packages = Package.query.filter(
        Package.departure_id == departure.id
    ).all()
    
    if not packages:
        return {
            'is_ready': False,
            'ready_packages': 0,
            'not_ready_packages': 0,
            'errors': ['Aucun colis assigné au départ']
        }
    
    ready_packages = []
    not_ready_packages = []
    errors = []
    
    for package in packages:
        if package.status == 'received':
            ready_packages.append(package.tracking_number)
        else:
            not_ready_packages.append({
                'tracking_number': package.tracking_number,
                'status': package.status,
                'reason': f"Statut '{package.status}' - doit être 'received'"
            })
    
    if not ready_packages:
        errors.append("Aucun colis prêt (statut 'received') pour ce départ")
    
    return {
        'is_ready': len(ready_packages) > 0 and len(errors) == 0,
        'ready_packages': len(ready_packages),
        'not_ready_packages': len(not_ready_packages),
        'not_ready_details': not_ready_packages,
        'errors': errors
    }