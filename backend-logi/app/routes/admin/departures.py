"""
Routes Admin - Gestion des Départs
===================================

CRUD complet pour les départs programmés.
Permet de grouper les colis et gérer les expéditions.
"""

from flask import request, jsonify, g
from flask_jwt_extended import get_jwt_identity
from app import db
from app.models import Departure, Package, PackageHistory, User, TenantConfig
from app.routes.admin import admin_bp
from app.utils.decorators import admin_required, permission_required, module_required
from app.services.notification_service import NotificationService
from app.routes.webhooks import update_package_status
from datetime import datetime, date
import logging
from sqlalchemy import or_

logger = logging.getLogger(__name__)


def _get_staff_wh_ids():
    return getattr(g, 'staff_warehouse_ids', None) or ([] if not getattr(g, 'staff_warehouse_id', None) else [getattr(g, 'staff_warehouse_id')])


def _staff_departure_packages_query(departure):
    staff_wh_ids = _get_staff_wh_ids()
    return departure.packages.filter(
        or_(
            Package.origin_warehouse_id.in_(staff_wh_ids),
            Package.destination_warehouse_id.in_(staff_wh_ids),
        )
    )


def _staff_has_full_origin_access_on_departure(departure) -> bool:
    staff_wh_ids = _get_staff_wh_ids()
    total = departure.packages.count()
    if total == 0:
        return True
    scoped = departure.packages.filter(Package.origin_warehouse_id.in_(staff_wh_ids)).count()
    return scoped == total


def _staff_has_full_destination_access_on_departure(departure) -> bool:
    staff_wh_ids = _get_staff_wh_ids()
    total = departure.packages.count()
    if total == 0:
        return True
    scoped = departure.packages.filter(Package.destination_warehouse_id.in_(staff_wh_ids)).count()
    return scoped == total

# ==================== VALIDATION ====================

def validate_departure_data(data: dict, is_update: bool = False) -> tuple[bool, str]:
    """Valide les données d'un départ"""
    from datetime import date as date_type
    
    if not is_update:
        if not data.get('origin_country'):
            return False, 'Pays d\'origine requis'
        if not data.get('dest_country'):
            return False, 'Pays de destination requis'
        if not data.get('transport_mode'):
            return False, 'Mode de transport requis'
        if not data.get('departure_date'):
            return False, 'Date de départ requise'
    
    # Validation mode transport
    valid_modes = ['sea', 'air_normal', 'air_express']
    if data.get('transport_mode') and data['transport_mode'] not in valid_modes:
        return False, f'Mode de transport invalide. Valeurs: {", ".join(valid_modes)}'
    
    # Validation durée estimée
    if data.get('estimated_duration'):
        try:
            duration = int(data['estimated_duration'])
            if duration < 1 or duration > 365:
                return False, 'Durée estimée doit être entre 1 et 365 jours'
        except ValueError:
            return False, 'Durée estimée invalide'
    
    # Validation date de départ (ne peut pas être dans le passé pour création)
    if data.get('departure_date') and not is_update:
        try:
            dep_date = datetime.strptime(data['departure_date'], '%Y-%m-%d').date()
            today = date_type.today()
            if dep_date < today:
                return False, 'La date de départ ne peut pas être dans le passé'
        except ValueError:
            return False, 'Format de date invalide (attendu: YYYY-MM-DD)'
    
    return True, ''


# ==================== ROUTES ====================

@admin_bp.route('/departures', methods=['GET'])
@module_required('departures')
def get_departures():
    """
    Liste des départs avec filtres
    
    Query params:
        - status: scheduled, departed, arrived, cancelled
        - transport_mode: sea, air_normal, air_express
        - from_date: Date de début (YYYY-MM-DD)
        - to_date: Date de fin (YYYY-MM-DD)
        - page, per_page: Pagination
    """
    tenant_id = g.tenant_id
    
    # Filtres
    status = request.args.get('status')
    transport_mode = request.args.get('transport_mode')
    from_date = request.args.get('from_date')
    to_date = request.args.get('to_date')
    page = request.args.get('page', 1, type=int)
    per_page = min(request.args.get('per_page', 20, type=int), 100)
    
    query = Departure.query.filter_by(tenant_id=tenant_id)

    if g.user_role == 'staff':
        staff_wh_ids = _get_staff_wh_ids()
        if not staff_wh_ids:
            return jsonify({'departures': [], 'total': 0, 'pages': 0, 'current_page': page})
        query = query.join(Package, Package.departure_id == Departure.id).filter(
            Package.tenant_id == tenant_id,
            or_(
                Package.origin_warehouse_id.in_(staff_wh_ids),
                Package.destination_warehouse_id.in_(staff_wh_ids),
            )
        ).distinct()
    
    if status:
        query = query.filter_by(status=status)
    
    if transport_mode:
        query = query.filter_by(transport_mode=transport_mode)
    
    if from_date:
        try:
            from_dt = datetime.strptime(from_date, '%Y-%m-%d').date()
            query = query.filter(Departure.departure_date >= from_dt)
        except ValueError:
            pass
    
    if to_date:
        try:
            to_dt = datetime.strptime(to_date, '%Y-%m-%d').date()
            query = query.filter(Departure.departure_date <= to_dt)
        except ValueError:
            pass
    
    query = query.order_by(Departure.departure_date.desc())
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)
    
    return jsonify({
        'departures': [d.to_dict() for d in pagination.items],
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': page
    })


@admin_bp.route('/departures/<departure_id>', methods=['GET'])
@module_required('departures')
def get_departure(departure_id):
    """Détails d'un départ avec ses colis et historique transporteurs"""
    tenant_id = g.tenant_id
    
    departure = Departure.query.filter_by(
        id=departure_id,
        tenant_id=tenant_id
    ).first()
    
    if not departure:
        return jsonify({'error': 'Départ non trouvé'}), 404
    
    include_packages = request.args.get('include_packages', 'true').lower() == 'true'
    include_carrier_history = request.args.get('include_carrier_history', 'true').lower() == 'true'
    
    if g.user_role != 'staff':
        return jsonify({
            'departure': departure.to_dict(
                include_packages=include_packages,
                include_carrier_history=include_carrier_history
            )
        })

    staff_wh_ids = _get_staff_wh_ids()
    if not staff_wh_ids:
        return jsonify({'error': 'Accès refusé'}), 403

    data = departure.to_dict(include_packages=False, include_carrier_history=include_carrier_history)
    if include_packages:
        data['packages'] = [p.to_dict(include_client=True) for p in _staff_departure_packages_query(departure).all()]
        data['packages_count'] = len(data['packages'])
    return jsonify({'departure': data})


@admin_bp.route('/departures', methods=['POST'])
@module_required('departures')
def create_departure():
    """Créer un nouveau départ"""
    tenant_id = g.tenant_id
    user_id = get_jwt_identity()
    
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Données JSON requises'}), 400
    
    # Validation
    is_valid, error_msg = validate_departure_data(data)
    if not is_valid:
        return jsonify({'error': error_msg}), 400
    
    try:
        # Parser la date
        departure_date = datetime.strptime(data['departure_date'], '%Y-%m-%d').date()
        
        departure = Departure(
            tenant_id=tenant_id,
            origin_country=data['origin_country'].strip(),
            origin_city=data.get('origin_city', '').strip() or None,
            dest_country=data['dest_country'].strip(),
            transport_mode=data['transport_mode'],
            departure_date=departure_date,
            estimated_duration=int(data.get('estimated_duration', 7)),
            notes=data.get('notes', '').strip()[:1000] or None,
            reference=data.get('reference', '').strip()[:100] or None,
            status='scheduled',
            created_by=user_id
        )
        
        db.session.add(departure)
        db.session.flush()  # Pour obtenir l'ID
        
        # Vérifier si l'auto-assignation est activée dans les paramètres
        assigned_count = 0
        tenant_config = TenantConfig.query.filter_by(tenant_id=tenant_id).first()
        auto_assign_enabled = True  # Par défaut activé
        if tenant_config and tenant_config.config_data:
            auto_assign_settings = tenant_config.config_data.get('auto_assign', {})
            auto_assign_enabled = auto_assign_settings.get('on_departure_create', True)
        
        # Auto-assign des colis en attente si demandé ET si activé dans les paramètres
        if data.get('auto_assign') and auto_assign_enabled:
            # Trouver les colis en attente pour cette route
            pending_packages = Package.query.filter(
                Package.tenant_id == tenant_id,
                Package.departure_id == None,
                Package.origin_country == departure.origin_country,
                Package.destination_country == departure.dest_country,
                Package.transport_mode == departure.transport_mode,
                Package.status.in_(['pending', 'received'])
            ).all()
            
            for pkg in pending_packages:
                pkg.departure_id = departure.id
                assigned_count += 1
            
            if assigned_count > 0:
                logger.info(f"Auto-assigné {assigned_count} colis au départ {departure.id}")
        
        db.session.commit()
        
        logger.info(f"Départ créé: {departure.id} par {user_id}")
        
        return jsonify({
            'message': 'Départ créé',
            'departure': departure.to_dict(),
            'assigned_packages': assigned_count
        }), 201
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Erreur création départ: {str(e)}")
        return jsonify({'error': 'Erreur lors de la création'}), 500


@admin_bp.route('/departures/<departure_id>', methods=['PUT'])
@module_required('departures')
def update_departure(departure_id):
    """Modifier un départ"""
    tenant_id = g.tenant_id
    
    departure = Departure.query.filter_by(
        id=departure_id,
        tenant_id=tenant_id
    ).first()
    
    if not departure:
        return jsonify({'error': 'Départ non trouvé'}), 404
    
    if departure.status in ['departed', 'arrived']:
        return jsonify({'error': 'Impossible de modifier un départ déjà parti ou arrivé'}), 403
    
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Données JSON requises'}), 400
    
    # Validation
    is_valid, error_msg = validate_departure_data(data, is_update=True)
    if not is_valid:
        return jsonify({'error': error_msg}), 400
    
    try:
        if 'origin_country' in data:
            departure.origin_country = data['origin_country'].strip()
        if 'origin_city' in data:
            departure.origin_city = data['origin_city'].strip() or None
        if 'dest_country' in data:
            departure.dest_country = data['dest_country'].strip()
        if 'transport_mode' in data:
            departure.transport_mode = data['transport_mode']
        if 'departure_date' in data:
            departure.departure_date = datetime.strptime(data['departure_date'], '%Y-%m-%d').date()
        if 'estimated_duration' in data:
            departure.estimated_duration = int(data['estimated_duration'])
        if 'notes' in data:
            departure.notes = data['notes'].strip()[:1000] or None
        if 'reference' in data:
            departure.reference = data['reference'].strip()[:100] or None
        
        db.session.commit()
        
        return jsonify({
            'message': 'Départ mis à jour',
            'departure': departure.to_dict()
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Erreur mise à jour départ: {str(e)}")
        return jsonify({'error': 'Erreur lors de la mise à jour'}), 500


@admin_bp.route('/departures/<departure_id>', methods=['DELETE'])
@module_required('departures')
def delete_departure(departure_id):
    """Supprimer un départ (seulement si scheduled et sans colis)"""
    tenant_id = g.tenant_id
    
    departure = Departure.query.filter_by(
        id=departure_id,
        tenant_id=tenant_id
    ).first()
    
    if not departure:
        return jsonify({'error': 'Départ non trouvé'}), 404
    
    if departure.status != 'scheduled':
        return jsonify({'error': 'Seuls les départs programmés peuvent être supprimés'}), 403
    
    if departure.packages_count > 0:
        return jsonify({'error': 'Impossible de supprimer un départ avec des colis assignés'}), 403
    
    try:
        db.session.delete(departure)
        db.session.commit()
        
        logger.info(f"Départ supprimé: {departure_id}")
        
        return jsonify({'message': 'Départ supprimé'})
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Erreur suppression départ: {str(e)}")
        return jsonify({'error': 'Erreur lors de la suppression'}), 500


@admin_bp.route('/departures/<departure_id>/packages', methods=['POST'])
@module_required('departures')
def assign_packages_to_departure(departure_id):
    """
    Assigner des colis à un départ
    
    Body JSON:
        - package_ids: Liste des IDs de colis à assigner
    
    RÈGLE: On ne peut ajouter des colis que si le départ est "scheduled"
    """
    tenant_id = g.tenant_id
    user_id = get_jwt_identity()
    
    departure = Departure.query.filter_by(
        id=departure_id,
        tenant_id=tenant_id
    ).first()
    
    if not departure:
        return jsonify({'error': 'Départ non trouvé'}), 404
    
    if departure.status != 'scheduled':
        return jsonify({'error': 'Impossible d\'ajouter des colis à un départ déjà parti'}), 403
    
    data = request.get_json()
    package_ids = data.get('package_ids', [])
    
    if not package_ids:
        return jsonify({'error': 'Liste de colis requise'}), 400
    
    try:
        assigned = 0
        errors = []
        
        for pkg_id in package_ids:
            package = Package.query.filter_by(
                id=pkg_id,
                tenant_id=tenant_id
            ).first()
            
            if not package:
                errors.append(f"Colis {pkg_id} non trouvé")
                continue
            
            if package.departure_id and package.departure_id != departure_id:
                errors.append(f"Colis {package.tracking_number} déjà assigné à un autre départ")
                continue
            
            # Vérifier compatibilité mode transport
            if package.transport_mode != departure.transport_mode:
                errors.append(f"Colis {package.tracking_number}: mode transport incompatible")
                continue

            if g.user_role == 'staff':
                staff_wh_ids = _get_staff_wh_ids()
                if not staff_wh_ids or package.origin_warehouse_id not in staff_wh_ids:
                    errors.append(f"Colis {package.tracking_number}: accès refusé")
                    continue
            
            package.departure_id = departure_id
            assigned += 1
        
        db.session.commit()
        
        return jsonify({
            'message': f'{assigned} colis assignés',
            'assigned': assigned,
            'errors': errors if errors else None
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Erreur assignation colis: {str(e)}")
        return jsonify({'error': 'Erreur lors de l\'assignation'}), 500


@admin_bp.route('/departures/<departure_id>/packages/<package_id>', methods=['DELETE'])
@module_required('departures')
def remove_package_from_departure(departure_id, package_id):
    """
    Retirer un colis d'un départ
    
    RÈGLE: On ne peut retirer des colis que si le départ est "scheduled"
    """
    tenant_id = g.tenant_id
    
    departure = Departure.query.filter_by(
        id=departure_id,
        tenant_id=tenant_id
    ).first()
    
    if not departure:
        return jsonify({'error': 'Départ non trouvé'}), 404
    
    if departure.status != 'scheduled':
        return jsonify({'error': 'Impossible de retirer des colis d\'un départ déjà parti'}), 403
    
    package = Package.query.filter_by(
        id=package_id,
        tenant_id=tenant_id,
        departure_id=departure_id
    ).first()
    
    if not package:
        return jsonify({'error': 'Colis non trouvé dans ce départ'}), 404

    if g.user_role == 'staff':
        staff_wh_ids = _get_staff_wh_ids()
        if not staff_wh_ids or package.origin_warehouse_id not in staff_wh_ids:
            return jsonify({'error': 'Accès refusé'}), 403
    
    try:
        package.departure_id = None
        db.session.commit()
        
        return jsonify({'message': 'Colis retiré du départ'})
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Erreur lors du retrait'}), 500


@admin_bp.route('/departures/<departure_id>/depart', methods=['POST'])
@module_required('departures')
def mark_departure_departed(departure_id):
    """
    Marquer un départ comme parti
    Met à jour le statut de tous les colis assignés
    
    RÈGLES:
    - Le départ doit avoir au moins un colis
    - Les colis non "received" sont automatiquement retirés avant le départ
    - Seuls les colis "received" partent avec le départ
    """
    tenant_id = g.tenant_id
    user_id = get_jwt_identity()
    
    departure = Departure.query.filter_by(
        id=departure_id,
        tenant_id=tenant_id
    ).first()
    
    if not departure:
        return jsonify({'error': 'Départ non trouvé'}), 404
    
    if departure.status != 'scheduled':
        return jsonify({'error': 'Ce départ ne peut pas être marqué comme parti'}), 403
    
    # Récupérer tous les colis assignés
    all_packages = departure.packages.all()
    
    if not all_packages:
        return jsonify({'error': 'Impossible de partir sans colis assignés'}), 400

    if g.user_role == 'staff' and not _staff_has_full_origin_access_on_departure(departure):
        return jsonify({'error': 'Accès refusé'}), 403
    
    try:
        # Séparer les colis "received" des autres
        packages_to_ship = []
        packages_to_remove = []
        
        for package in all_packages:
            if package.status == 'received':
                packages_to_ship.append(package)
            else:
                # Colis pas encore reçu en entrepôt → retirer du départ
                packages_to_remove.append(package)
        
        # Retirer les colis non reçus
        for package in packages_to_remove:
            package.departure_id = None
            logger.info(f"Colis {package.tracking_number} retiré du départ {departure_id} (statut: {package.status})")
        
        # Vérifier qu'il reste des colis à expédier
        if not packages_to_ship:
            db.session.rollback()
            return jsonify({
                'error': 'Aucun colis prêt à partir (tous les colis doivent être "reçus en entrepôt")',
                'removed_packages': len(packages_to_remove)
            }), 400
        
        # Marquer le départ comme parti
        departure.mark_departed()
        
        # Mettre à jour les colis qui partent
        for package in packages_to_ship:
            old_status = package.status
            package.status = 'in_transit'
            package.shipped_at = datetime.utcnow()
            package.is_editable = False
            
            # Calculer date d'arrivée estimée
            if departure.estimated_arrival:
                package.estimated_delivery = datetime.combine(
                    departure.estimated_arrival,
                    datetime.min.time()
                )
            
            # Historique
            history = PackageHistory(
                package_id=package.id,
                status='in_transit',
                location=f"Départ {departure.origin_city or departure.origin_country}",
                notes=f"Départ {departure.transport_mode} - Ref: {departure.reference or 'N/A'}",
                updated_by=user_id
            )
            db.session.add(history)
        
        db.session.commit()
        
        # Notifier les clients (async serait mieux)
        try:
            notif_service = NotificationService(tenant_id)
            for package in packages_to_ship:
                notif_service.send_status_update(package, 'received', 'in_transit')
        except Exception as e:
            logger.error(f"Erreur notification départ: {e}")
        
        logger.info(f"Départ {departure_id} marqué comme parti avec {len(packages_to_ship)} colis ({len(packages_to_remove)} retirés)")
        
        return jsonify({
            'message': 'Départ marqué comme parti',
            'departure': departure.to_dict(),
            'packages_shipped': len(packages_to_ship),
            'packages_removed': len(packages_to_remove)
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Erreur marquage départ: {str(e)}")
        return jsonify({'error': 'Erreur lors du marquage'}), 500


@admin_bp.route('/departures/<departure_id>/arrive', methods=['POST'])
@module_required('departures')
def mark_departure_arrived(departure_id):
    """
    Marquer un départ comme arrivé
    Met à jour le statut de tous les colis
    """
    tenant_id = g.tenant_id
    user_id = get_jwt_identity()
    
    departure = Departure.query.filter_by(
        id=departure_id,
        tenant_id=tenant_id
    ).first()
    
    if not departure:
        return jsonify({'error': 'Départ non trouvé'}), 404
    
    if departure.status != 'departed':
        return jsonify({'error': 'Ce départ doit d\'abord être marqué comme parti'}), 403

    if g.user_role == 'staff' and not _staff_has_full_destination_access_on_departure(departure):
        return jsonify({'error': 'Accès refusé'}), 403
    
    try:
        departure.mark_arrived()
        
        # Mettre à jour tous les colis
        packages = departure.packages.all()
        for package in packages:
            package.status = 'arrived_port'
            
            history = PackageHistory(
                package_id=package.id,
                status='arrived_port',
                location=departure.dest_country,
                notes=f"Arrivé à destination",
                updated_by=user_id
            )
            db.session.add(history)
        
        db.session.commit()
        
        # Notifier les clients
        try:
            notif_service = NotificationService(tenant_id)
            for package in packages:
                notif_service.send_status_update(package, 'in_transit', 'arrived_port')
        except Exception as e:
            logger.error(f"Erreur notification arrivée: {e}")
        
        logger.info(f"Départ {departure_id} marqué comme arrivé")
        
        return jsonify({
            'message': 'Départ marqué comme arrivé',
            'departure': departure.to_dict(),
            'packages_updated': len(packages)
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Erreur marquage arrivée: {str(e)}")
        return jsonify({'error': 'Erreur lors du marquage'}), 500


@admin_bp.route('/departures/<departure_id>/cancel', methods=['POST'])
@module_required('departures')
def cancel_departure(departure_id):
    """Annuler un départ (retire tous les colis)"""
    tenant_id = g.tenant_id
    
    departure = Departure.query.filter_by(
        id=departure_id,
        tenant_id=tenant_id
    ).first()
    
    if not departure:
        return jsonify({'error': 'Départ non trouvé'}), 404
    
    if departure.status not in ['scheduled']:
        return jsonify({'error': 'Seuls les départs programmés peuvent être annulés'}), 403

    if g.user_role == 'staff' and not _staff_has_full_origin_access_on_departure(departure):
        return jsonify({'error': 'Accès refusé'}), 403
    
    try:
        # Retirer tous les colis
        for package in departure.packages.all():
            package.departure_id = None
        
        departure.cancel()
        db.session.commit()
        
        logger.info(f"Départ {departure_id} annulé")
        
        return jsonify({
            'message': 'Départ annulé',
            'departure': departure.to_dict()
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Erreur lors de l\'annulation'}), 500


# ==================== TRANSPORTEUR / CARRIER ====================

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
    'other': 'Autre'
}


@admin_bp.route('/departures/<departure_id>/carrier', methods=['PUT'])
@module_required('departures')
def assign_carrier_to_departure(departure_id):
    """
    Assigner ou changer le transporteur d'un départ
    
    Body JSON:
        - carrier: Code du transporteur (dhl, fedex, ups, etc.)
        - carrier_tracking: Numéro de tracking du transporteur
        - is_final_leg: Est-ce l'étape finale du voyage? (défaut: true)
        - notify_clients: Notifier tous les clients du départ (optionnel, défaut: false)
    
    FLUX MULTI-TRANSPORTEURS:
    1. Admin assigne DHL avec tracking 123, is_final_leg=false → Départ part
    2. DHL livre à Dubaï (webhook "delivered") → Archivé, départ reste "departed"
    3. Admin assigne Ethiopian avec tracking 456, is_final_leg=true
    4. Ethiopian livre (webhook "delivered") → Départ marqué "arrived"
    
    L'historique des transporteurs est conservé pour traçabilité admin.
    """
    tenant_id = g.tenant_id
    user_id = get_jwt_identity()
    
    departure = Departure.query.filter_by(
        id=departure_id,
        tenant_id=tenant_id
    ).first()
    
    if not departure:
        return jsonify({'error': 'Départ non trouvé'}), 404
    
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Données JSON requises'}), 400
    
    carrier = data.get('carrier', '').lower().strip()
    carrier_tracking = data.get('carrier_tracking', '').strip()
    is_final_leg = data.get('is_final_leg', True)  # Par défaut, c'est l'étape finale
    
    if not carrier or not carrier_tracking:
        return jsonify({'error': 'Transporteur et numéro de tracking requis'}), 400
    
    if carrier not in SUPPORTED_CARRIERS and carrier != 'other':
        return jsonify({
            'error': f'Transporteur non supporté. Valeurs: {", ".join(SUPPORTED_CARRIERS.keys())}'
        }), 400
    
    # Vérifier que le tracking n'est pas déjà utilisé par un autre départ
    existing = Departure.query.filter(
        Departure.tenant_id == tenant_id,
        Departure.carrier_tracking == carrier_tracking,
        Departure.id != departure_id
    ).first()
    
    if existing:
        return jsonify({
            'error': f'Ce numéro de tracking est déjà assigné à un autre départ'
        }), 409

    if g.user_role == 'staff' and not _staff_has_full_origin_access_on_departure(departure):
        return jsonify({'error': 'Accès refusé'}), 403
    
    try:
        old_carrier = departure.carrier
        old_tracking = departure.carrier_tracking
        is_carrier_change = old_carrier and old_tracking and (old_carrier != carrier or old_tracking != carrier_tracking)
        
        # Si on change de transporteur, archiver l'ancien dans l'historique
        if is_carrier_change:
            departure.close_current_carrier(departure.carrier_status)
            logger.info(f"Départ {departure_id}: changement transporteur {old_carrier} → {carrier}")
        
        # Ajouter le nouveau transporteur à l'historique
        departure.add_carrier_to_history(carrier, carrier_tracking, is_final_leg=is_final_leg)
        
        # Mettre à jour les infos transporteur actuelles
        departure.carrier = carrier
        departure.carrier_tracking = carrier_tracking
        departure.carrier_status = None  # Reset, sera mis à jour par webhook
        departure.carrier_location = None
        departure.is_final_leg = is_final_leg
        
        # NE PAS changer automatiquement le statut - l'admin décide quand marquer comme parti
        
        # Mettre à jour tous les colis du départ
        packages = departure.packages.all()
        carrier_name = SUPPORTED_CARRIERS.get(carrier, carrier.upper())
        old_carrier_name = SUPPORTED_CARRIERS.get(old_carrier, old_carrier.upper()) if old_carrier else None
        
        for package in packages:
            if package.status == 'received':
                package.status = 'in_transit'
                package.shipped_at = datetime.utcnow()
            
            # Message d'historique adapté
            if is_carrier_change:
                notes = f"Transfert de {old_carrier_name} vers {carrier_name} - Nouveau tracking: {carrier_tracking}"
            else:
                notes = f"Départ confié à {carrier_name} - Tracking: {carrier_tracking}"
            
            # Ajouter à l'historique
            history = PackageHistory(
                package_id=package.id,
                status=package.status,
                notes=notes,
                updated_by=user_id
            )
            db.session.add(history)
        
        db.session.commit()
        
        logger.info(f"Départ {departure_id} assigné à {carrier_name} ({carrier_tracking})")
        
        # Notifier les clients si demandé
        notified_count = 0
        if data.get('notify_clients') and packages:
            try:
                notif_service = NotificationService(tenant_id)
                
                # Grouper les colis par client
                clients_packages = {}
                for package in packages:
                    if package.client_id not in clients_packages:
                        clients_packages[package.client_id] = []
                    clients_packages[package.client_id].append(package)
                
                for client_id, client_packages in clients_packages.items():
                    client = User.query.get(client_id)
                    if not client:
                        continue
                    
                    if is_carrier_change:
                        title = "Mise à jour de votre expédition"
                        message = f"Votre colis continue son voyage avec {carrier_name}."
                    elif len(client_packages) == 1:
                        pkg = client_packages[0]
                        title = f"Colis {pkg.tracking_number} expédié"
                        message = f"Votre colis a été confié à {carrier_name} et est en route."
                    else:
                        title = f"{len(client_packages)} colis expédiés"
                        message = f"Vos colis ont été confiés à {carrier_name} et sont en route."
                    
                    notif_service.send_notification(
                        user=client,
                        title=title,
                        message=message,
                        channels=['push']
                    )
                    notified_count += 1
                    
            except Exception as e:
                logger.error(f"Erreur notification carrier départ: {e}")
        
        return jsonify({
            'message': 'Transporteur assigné' if not is_carrier_change else 'Transporteur changé',
            'departure': departure.to_dict(include_carrier_history=True),
            'carrier_name': carrier_name,
            'previous_carrier': old_carrier_name if is_carrier_change else None,
            'packages_updated': len(packages),
            'clients_notified': notified_count
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Erreur assignation transporteur départ: {e}")
        return jsonify({'error': 'Erreur lors de l\'assignation'}), 500


@admin_bp.route('/departures/<departure_id>/carrier', methods=['DELETE'])
@module_required('departures')
def remove_carrier_from_departure(departure_id):
    """Retirer le transporteur d'un départ (archive dans l'historique)"""
    tenant_id = g.tenant_id
    
    departure = Departure.query.filter_by(
        id=departure_id,
        tenant_id=tenant_id
    ).first()
    
    if not departure:
        return jsonify({'error': 'Départ non trouvé'}), 404
    
    if not departure.carrier:
        return jsonify({'error': 'Aucun transporteur assigné'}), 400
    
    try:
        # Archiver le transporteur actuel dans l'historique
        departure.close_current_carrier(departure.carrier_status)
        
        old_carrier = departure.carrier
        
        departure.carrier = None
        departure.carrier_tracking = None
        departure.carrier_status = None
        departure.carrier_location = None
        
        db.session.commit()
        
        logger.info(f"Départ {departure_id}: transporteur {old_carrier} retiré")
        
        return jsonify({
            'message': 'Transporteur retiré',
            'departure': departure.to_dict(include_carrier_history=True)
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Erreur lors du retrait'}), 500


@admin_bp.route('/departures/<departure_id>/refresh-tracking', methods=['POST'])
@module_required('departures')
def refresh_departure_tracking(departure_id):
    """
    Rafraîchir le tracking d'un départ depuis l'API du transporteur
    
    Interroge 17Track ou AfterShip pour récupérer le dernier statut
    et met à jour tous les colis du départ.
    """
    from app.services.tracking_service import TrackingService
    
    tenant_id = g.tenant_id
    
    departure = Departure.query.filter_by(
        id=departure_id,
        tenant_id=tenant_id
    ).first()
    
    if not departure:
        return jsonify({'error': 'Départ non trouvé'}), 404
    
    if not departure.carrier_tracking:
        return jsonify({'error': 'Aucun numéro de tracking transporteur'}), 400
    
    try:
        tracking_service = TrackingService(tenant_id)
        result = tracking_service.track(departure.carrier_tracking, departure.carrier)
        
        if not result.success:
            return jsonify({
                'error': result.error or 'Impossible de récupérer le tracking',
                'tracking_number': departure.carrier_tracking
            }), 400
        
        # Mettre à jour le départ
        departure.carrier_status = result.current_status
        if result.current_location:
            departure.carrier_location = result.current_location
        
        # Utiliser la fonction webhook pour mettre à jour les colis
        update_result = update_package_status(
            tenant_id=tenant_id,
            tracking_number=departure.carrier_tracking,
            new_status=result.current_status,
            location=result.current_location,
            notes=f"Rafraîchi manuellement"
        )
        
        # Formater les événements
        events = []
        if result.events:
            for event in result.events[:10]:
                events.append({
                    'status': event.status,
                    'description': event.description,
                    'location': event.location,
                    'timestamp': event.timestamp.isoformat() if event.timestamp else None
                })
        
        return jsonify({
            'message': 'Tracking mis à jour',
            'departure': departure.to_dict(),
            'updated_packages': update_result.get('updated_packages', 0),
            'notified_clients': update_result.get('notified_clients', 0),
            'tracking': {
                'carrier': result.carrier,
                'current_status': result.current_status,
                'current_location': result.current_location,
                'events': events
            }
        })
        
    except Exception as e:
        logger.error(f"Erreur refresh tracking départ: {e}")
        return jsonify({'error': 'Erreur lors du rafraîchissement'}), 500


@admin_bp.route('/departures/<departure_id>/carrier-history', methods=['GET'])
@module_required('departures')
def get_departure_carrier_history(departure_id):
    """
    Récupérer l'historique des transporteurs d'un départ
    
    Retourne la liste de tous les transporteurs qui ont géré ce départ,
    avec les dates et statuts finaux.
    
    Exemple de réponse:
    {
        "carrier_history": [
            {
                "carrier": "dhl",
                "carrier_name": "DHL Express",
                "tracking": "1234567890",
                "from": "2024-01-10T10:00:00",
                "to": "2024-01-15T14:30:00",
                "final_status": "delivered",
                "final_location": "Dubai, UAE"
            },
            {
                "carrier": "ethiopian",
                "carrier_name": "Ethiopian Airlines",
                "tracking": "ET-987654",
                "from": "2024-01-15T15:00:00",
                "to": null,
                "final_status": null,
                "final_location": null
            }
        ],
        "current_carrier": {
            "carrier": "ethiopian",
            "carrier_name": "Ethiopian Airlines",
            "tracking": "ET-987654",
            "status": "in_transit",
            "location": "Addis Ababa"
        }
    }
    """
    tenant_id = g.tenant_id
    
    departure = Departure.query.filter_by(
        id=departure_id,
        tenant_id=tenant_id
    ).first()
    
    if not departure:
        return jsonify({'error': 'Départ non trouvé'}), 404
    
    # Enrichir l'historique avec les noms des transporteurs
    history = departure.get_carrier_history()
    enriched_history = []
    
    for entry in history:
        carrier_code = entry.get('carrier', '')
        enriched_history.append({
            **entry,
            'carrier_name': SUPPORTED_CARRIERS.get(carrier_code, carrier_code.upper())
        })
    
    # Infos du transporteur actuel
    current_carrier = None
    if departure.carrier:
        current_carrier = {
            'carrier': departure.carrier,
            'carrier_name': SUPPORTED_CARRIERS.get(departure.carrier, departure.carrier.upper()),
            'tracking': departure.carrier_tracking,
            'status': departure.carrier_status,
            'location': departure.carrier_location
        }
    
    return jsonify({
        'carrier_history': enriched_history,
        'current_carrier': current_carrier,
        'total_carriers': len(enriched_history)
    })


# ==================== PACKAGES & NOTIFICATIONS ====================

@admin_bp.route('/departures/<departure_id>/packages', methods=['GET'])
@module_required('departures')
def get_departure_packages(departure_id):
    """
    Récupérer les colis assignés à un départ
    
    Query params:
        - status: Filtrer par statut de colis
        - page, per_page: Pagination
    
    Returns:
        Liste des colis avec infos client + total_revenue
    """
    tenant_id = g.tenant_id
    
    departure = Departure.query.filter_by(
        id=departure_id,
        tenant_id=tenant_id
    ).first()
    
    if not departure:
        return jsonify({'error': 'Départ non trouvé'}), 404
    
    # Filtres
    status = request.args.get('status')
    page = request.args.get('page', 1, type=int)
    per_page = min(request.args.get('per_page', 50, type=int), 100)
    
    query = Package.query.filter_by(
        tenant_id=tenant_id,
        departure_id=departure_id
    )
    
    if status:
        query = query.filter_by(status=status)
    
    query = query.order_by(Package.created_at.desc())
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)
    
    # Calculer le revenu total du départ (somme des montants des colis)
    from sqlalchemy import func
    total_revenue = db.session.query(func.sum(Package.amount)).filter(
        Package.tenant_id == tenant_id,
        Package.departure_id == departure_id
    ).scalar() or 0
    
    return jsonify({
        'packages': [p.to_dict(include_client=True) for p in pagination.items],
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': page,
        'total_revenue': total_revenue,
        'departure': {
            'id': departure.id,
            'status': departure.status,
            'departure_date': departure.departure_date.isoformat() if departure.departure_date else None
        }
    })


@admin_bp.route('/departures/<departure_id>/notify', methods=['POST'])
@module_required('departures')
def notify_departure_clients(departure_id):
    """
    Notifier les clients d'un départ
    
    Body JSON:
        - message: Message personnalisé (optionnel)
        - channels: Canaux à utiliser ['push', 'sms', 'whatsapp', 'email'] (défaut: ['push'])
        - target: Cible de la notification
            - 'with_packages': Clients avec colis dans ce départ (défaut)
            - 'all': Tous les clients actifs
    
    Returns:
        Résultat de l'envoi
    """
    tenant_id = g.tenant_id
    
    departure = Departure.query.filter_by(
        id=departure_id,
        tenant_id=tenant_id
    ).first()
    
    if not departure:
        return jsonify({'error': 'Départ non trouvé'}), 404
    
    data = request.get_json() or {}
    
    target = data.get('target', 'with_packages')
    channels = data.get('channels', ['push'])
    custom_message = data.get('message')
    
    try:
        notif_service = NotificationService(tenant_id)
        
        # Récupérer les clients cibles
        if target == 'with_packages':
            # Clients avec colis dans ce départ
            packages = departure.packages.all()
            client_ids = set(p.client_id for p in packages)
            clients = User.query.filter(User.id.in_(client_ids)).all()
        else:
            # Tous les clients actifs
            clients = User.query.filter_by(
                tenant_id=tenant_id,
                role='client',
                is_active=True
            ).all()
        
        if not clients:
            return jsonify({
                'message': 'Aucun client à notifier',
                'sent': 0
            })
        
        # Préparer le message
        from app.models import Tenant
        tenant = Tenant.query.get(tenant_id)
        company_name = tenant.name if tenant else 'Express Cargo'
        
        # Générer le message selon le statut du départ
        if departure.status == 'scheduled':
            default_title = f"Départ programmé - {departure.departure_date.strftime('%d/%m/%Y')}"
            default_message = f"Un départ {departure.transport_mode} est programmé pour le {departure.departure_date.strftime('%d/%m/%Y')}."
        elif departure.status == 'departed':
            default_title = "Vos colis sont en route!"
            default_message = f"Le départ {departure.transport_mode} du {departure.departure_date.strftime('%d/%m/%Y')} est parti. Arrivée estimée: {departure.estimated_arrival.strftime('%d/%m/%Y') if departure.estimated_arrival else 'N/A'}."
        elif departure.status == 'arrived':
            default_title = "Colis arrivés à destination!"
            default_message = f"Le départ du {departure.departure_date.strftime('%d/%m/%Y')} est arrivé. Vos colis sont disponibles pour retrait."
        else:
            default_title = f"Information - {company_name}"
            default_message = custom_message or "Nouvelle information concernant votre expédition."
        
        title = default_title
        message = custom_message or default_message
        
        # Envoyer les notifications
        sent_count = 0
        errors = []
        
        for client in clients:
            try:
                result = notif_service.send_notification(
                    user=client,
                    title=title,
                    message=message,
                    channels=channels
                )
                if result:
                    sent_count += 1
            except Exception as e:
                errors.append(f"{client.email}: {str(e)}")
                logger.error(f"Erreur notification client {client.id}: {e}")
        
        logger.info(f"Départ {departure_id}: {sent_count}/{len(clients)} clients notifiés")
        
        return jsonify({
            'message': f'{sent_count} clients notifiés',
            'sent': sent_count,
            'total_clients': len(clients),
            'channels': channels,
            'errors': errors if errors else None
        })
        
    except Exception as e:
        logger.error(f"Erreur notification départ: {e}")
        return jsonify({'error': 'Erreur lors de l\'envoi des notifications'}), 500
