from flask import Blueprint, request, jsonify, g
from flask_jwt_extended import get_jwt_identity
from app import db
from app.models import Package, PackageHistory, User, Tenant, Departure, TenantConfig
from app.utils.decorators import tenant_required, get_current_tenant_id
from app.utils.helpers import generate_tracking_number
from datetime import datetime, date
import logging

packages_bp = Blueprint('packages', __name__)
logger = logging.getLogger(__name__)

# ==================== VALIDATION ====================

# Limites de validation
MAX_WEIGHT = 10000  # kg
MAX_CBM = 1000  # m³
MAX_DIMENSION = 500  # cm
MAX_DECLARED_VALUE = 1000000  # USD
MAX_QUANTITY = 10000
MAX_DESCRIPTION_LENGTH = 2000
MAX_PER_PAGE = 100

def validate_package_data(data: dict, is_update: bool = False, tenant_id: str = None) -> tuple[bool, str]:
    """
    Valide les données d'un colis
    Retourne (is_valid, error_message)
    """
    # Description requise pour création
    if not is_update and not data.get('description'):
        return False, 'Description requise'
    
    # Validation description
    if 'description' in data:
        desc = data['description']
        if len(desc) > MAX_DESCRIPTION_LENGTH:
            return False, f'Description trop longue (max {MAX_DESCRIPTION_LENGTH} caractères)'
    
    # Validation poids
    if 'weight' in data and data['weight'] is not None:
        try:
            weight = float(data['weight'])
            if weight < 0:
                return False, 'Le poids ne peut pas être négatif'
            if weight > MAX_WEIGHT:
                return False, f'Poids trop élevé (max {MAX_WEIGHT} kg)'
        except (ValueError, TypeError):
            return False, 'Poids invalide'
    
    # Validation CBM
    if 'cbm' in data and data['cbm'] is not None:
        try:
            cbm = float(data['cbm'])
            if cbm < 0:
                return False, 'Le CBM ne peut pas être négatif'
            if cbm > MAX_CBM:
                return False, f'CBM trop élevé (max {MAX_CBM} m³)'
        except (ValueError, TypeError):
            return False, 'CBM invalide'
    
    # Validation dimensions
    for dim in ['length', 'width', 'height']:
        if dim in data and data[dim] is not None:
            try:
                val = float(data[dim])
                if val < 0:
                    return False, f'{dim} ne peut pas être négatif'
                if val > MAX_DIMENSION:
                    return False, f'{dim} trop élevé (max {MAX_DIMENSION} cm)'
            except (ValueError, TypeError):
                return False, f'{dim} invalide'
    
    # Validation valeur déclarée
    if 'declared_value' in data and data['declared_value'] is not None:
        try:
            value = float(data['declared_value'])
            if value < 0:
                return False, 'La valeur déclarée ne peut pas être négative'
            if value > MAX_DECLARED_VALUE:
                return False, f'Valeur déclarée trop élevée (max {MAX_DECLARED_VALUE})'
        except (ValueError, TypeError):
            return False, 'Valeur déclarée invalide'
    
    # Validation quantité
    if 'quantity' in data and data['quantity'] is not None:
        try:
            qty = int(data['quantity'])
            if qty < 1:
                return False, 'La quantité doit être au moins 1'
            if qty > MAX_QUANTITY:
                return False, f'Quantité trop élevée (max {MAX_QUANTITY})'
        except (ValueError, TypeError):
            return False, 'Quantité invalide'
    
    # Validation mode transport
    valid_transport_modes = ['air_normal', 'air_express', 'sea', 'road']
    if 'transport_mode' in data and data['transport_mode']:
        if data['transport_mode'] not in valid_transport_modes:
            return False, f'Mode de transport invalide. Valeurs acceptées: {", ".join(valid_transport_modes)}'
    
    # Validation compatibilité transport_mode / package_type
    # Les types sont maintenant configurés dynamiquement par l'admin dans les tarifs
    # On ne valide plus contre une liste hardcodée, mais on vérifie que le type existe
    # dans la configuration des tarifs pour la route sélectionnée
    if tenant_id and data.get('transport_mode') and data.get('package_type'):
        transport = data['transport_mode']
        pkg_type = data['package_type']
        origin = data.get('origin_country')
        dest = data.get('destination_country')
        
        # Si on a origine et destination, vérifier que le type existe dans les tarifs configurés
        if origin and dest:
            from app.models import TenantConfig
            config = TenantConfig.query.filter_by(tenant_id=tenant_id).first()
            if config and config.shipping_rates:
                route_key = f"{origin}_{dest}"
                route_rates = config.shipping_rates.get(route_key, {})
                transport_rates = route_rates.get(transport, {})
                
                # Vérifier que le type existe dans les tarifs (exclure 'currency')
                valid_types = [k for k in transport_rates.keys() if k != 'currency']
                
                if valid_types and pkg_type not in valid_types:
                    return False, f'Type de colis "{pkg_type}" non configuré pour cette route. Types disponibles: {", ".join(valid_types)}'
        
        # Si pas de config ou pas de route, on accepte (validation souple)
        # L'admin peut ne pas avoir encore configuré tous les tarifs
    
    # Validation warehouse si fourni et tenant_id disponible
    if tenant_id and data.get('destination_warehouse') and data.get('destination_country'):
        from app.models import Warehouse
        warehouse = Warehouse.query.filter_by(
            tenant_id=tenant_id,
            country=data['destination_country'],
            id=data['destination_warehouse']
        ).first()
        
        # Si pas trouvé par ID, chercher par nom
        if not warehouse:
            warehouse = Warehouse.query.filter_by(
                tenant_id=tenant_id,
                country=data['destination_country'],
                name=data['destination_warehouse']
            ).first()
        
        # Avertissement seulement (ne pas bloquer si warehouse non trouvé)
        # car le warehouse peut être un texte libre
    
    return True, ''


@packages_bp.route('', methods=['GET'])
@tenant_required
def get_packages():
    """Liste des colis du client connecté"""
    user_id = get_jwt_identity()
    tenant_id = g.tenant_id  # Depuis le JWT via décorateur
    
    # Filtres
    status = request.args.get('status')
    search = request.args.get('search', '').strip()[:100]  # Limite recherche
    page = request.args.get('page', 1, type=int)
    per_page = min(request.args.get('per_page', 20, type=int), MAX_PER_PAGE)  # Limite max
    
    # Validation page
    if page < 1:
        page = 1
    
    query = Package.query.filter_by(tenant_id=tenant_id, client_id=user_id)
    
    if status:
        query = query.filter_by(status=status)
    
    if search:
        query = query.filter(
            db.or_(
                Package.tracking_number.ilike(f'%{search}%'),
                Package.description.ilike(f'%{search}%')
            )
        )
    
    query = query.order_by(Package.created_at.desc())
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)
    
    return jsonify({
        'packages': [p.to_dict() for p in pagination.items],
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': page,
        'per_page': per_page
    })


@packages_bp.route('/<package_id>', methods=['GET'])
@tenant_required
def get_package(package_id):
    """Détails d'un colis avec historique"""
    user_id = get_jwt_identity()
    tenant_id = g.tenant_id
    
    package = Package.query.filter_by(
        id=package_id, 
        tenant_id=tenant_id, 
        client_id=user_id
    ).first()
    
    if not package:
        return jsonify({'error': 'Colis non trouvé'}), 404
    
    return jsonify({'package': package.to_dict(include_history=True)})


@packages_bp.route('/track/<tracking_number>', methods=['GET'])
@tenant_required
def track_package(tracking_number):
    """Suivi par numéro de tracking (public pour le tenant)"""
    tenant_id = g.tenant_id
    
    # Nettoyer le tracking number
    tracking_number = tracking_number.strip().upper()[:50]
    
    package = Package.query.filter_by(
        tracking_number=tracking_number,
        tenant_id=tenant_id
    ).first()
    
    if not package:
        return jsonify({'error': 'Colis non trouvé'}), 404
    
    return jsonify({'package': package.to_dict(include_history=True)})


@packages_bp.route('', methods=['POST'])
@tenant_required
def create_package():
    """Créer un nouveau colis"""
    user_id = get_jwt_identity()
    tenant_id = g.tenant_id
    tenant = Tenant.query.get(tenant_id)
    
    if not tenant:
        return jsonify({'error': 'Tenant non trouvé'}), 404
    
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Données JSON requises'}), 400
    
    # Validation des données
    is_valid, error_msg = validate_package_data(data, tenant_id=tenant_id)
    if not is_valid:
        return jsonify({'error': error_msg}), 400
        
    # Vérification des quotas (Enforcement)
    from app.services.enforcement_service import EnforcementService
    quota_result = EnforcementService.check_quota(tenant_id, EnforcementService.RESOURCE_PACKAGES_MONTHLY)
    if not quota_result['allowed']:
        return jsonify({
            'error': 'Quota atteint',
            'message': quota_result['reason'],
            'details': quota_result
        }), 403
    
    try:
        # Générer tracking number unique avec lock pour éviter race condition
        year = datetime.utcnow().year
        prefix = (tenant.slug or 'PK').upper()[:2]
        pattern = f"{prefix}-{year}-%"
        
        # SELECT FOR UPDATE pour éviter les doublons
        last_package = Package.query.filter(
            Package.tenant_id == tenant_id,
            Package.tracking_number.like(pattern)
        ).with_for_update().order_by(Package.tracking_number.desc()).first()
        
        if last_package:
            try:
                last_seq = int(last_package.tracking_number.split('-')[-1])
                next_seq = last_seq + 1
            except (ValueError, IndexError):
                next_seq = Package.query.filter_by(tenant_id=tenant_id).count() + 1
        else:
            next_seq = 1
        
        tracking_number = generate_tracking_number(tenant.slug, next_seq)
        
        package = Package(
            tenant_id=tenant_id,
            client_id=user_id,
            tracking_number=tracking_number,
            supplier_tracking=data.get('supplier_tracking', '').strip()[:100] or None,
            description=data['description'].strip()[:MAX_DESCRIPTION_LENGTH],
            category=data.get('category', '').strip()[:50] or None,
            transport_mode=data.get('transport_mode', 'air_normal'),
            package_type=data.get('package_type', 'normal'),
            weight=float(data['weight']) if data.get('weight') else None,
            cbm=float(data['cbm']) if data.get('cbm') else None,
            length=float(data['length']) if data.get('length') else None,
            width=float(data['width']) if data.get('width') else None,
            height=float(data['height']) if data.get('height') else None,
            declared_value=float(data['declared_value']) if data.get('declared_value') else None,
            currency=data.get('currency', 'USD')[:3].upper(),
            quantity=int(data.get('quantity', 1)),
            origin_address=data.get('origin_address', '').strip()[:500] or None,
            origin_city=data.get('origin_city', '').strip()[:100] or None,
            origin_country=data.get('origin_country', '').strip()[:100] or None,
            destination_address=data.get('destination_address', '').strip()[:500] or None,
            destination_city=data.get('destination_city', '').strip()[:100] or None,
            destination_country=data.get('destination_country', '').strip()[:100] or None,
            destination_warehouse=data.get('destination_warehouse', '').strip()[:100] or None,
            recipient_name=data.get('recipient_name', '').strip()[:100] or None,
            recipient_phone=data.get('recipient_phone', '').strip()[:20] or None,
            status='pending'
        )
        
        db.session.add(package)
        db.session.flush()
        
        # Vérifier si l'auto-assignation est activée dans les paramètres
        assigned_departure = None
        tenant_config = TenantConfig.query.filter_by(tenant_id=tenant_id).first()
        auto_assign_enabled = True  # Par défaut activé
        if tenant_config and tenant_config.config_data:
            auto_assign_settings = tenant_config.config_data.get('auto_assign', {})
            auto_assign_enabled = auto_assign_settings.get('on_package_create', True)
        
        # Auto-assigner au prochain départ correspondant si activé
        if auto_assign_enabled and package.origin_country and package.destination_country and package.transport_mode:
            today = date.today()
            next_departure = Departure.query.filter(
                Departure.tenant_id == tenant_id,
                Departure.status == 'scheduled',
                Departure.departure_date >= today,
                Departure.origin_country == package.origin_country,
                Departure.dest_country == package.destination_country,
                Departure.transport_mode == package.transport_mode
            ).order_by(Departure.departure_date.asc()).first()
            
            if next_departure:
                package.departure_id = next_departure.id
                assigned_departure = next_departure
                logger.info(f"Colis {tracking_number} auto-assigné au départ {next_departure.id}")
        
        # Ajouter à l'historique
        history_notes = 'Colis enregistré'
        if assigned_departure:
            history_notes += f' - Assigné au départ du {assigned_departure.departure_date.strftime("%d/%m/%Y")}'
        
        history = PackageHistory(
            package_id=package.id,
            status='pending',
            notes=history_notes,
            updated_by=user_id
        )
        db.session.add(history)
        
        db.session.commit()
        
        logger.info(f"Colis créé: {tracking_number} par user {user_id}")
        
        response_data = {
            'message': 'Colis créé',
            'package': package.to_dict()
        }
        
        if assigned_departure:
            response_data['assigned_departure'] = {
                'id': assigned_departure.id,
                'departure_date': assigned_departure.departure_date.isoformat(),
                'estimated_arrival': assigned_departure.estimated_arrival.isoformat() if assigned_departure.estimated_arrival else None
            }
        
        return jsonify(response_data), 201
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Erreur création colis: {str(e)}")
        return jsonify({'error': 'Erreur lors de la création du colis'}), 500


@packages_bp.route('/<package_id>', methods=['PUT'])
@tenant_required
def update_package(package_id):
    """Modifier un colis (si encore éditable)"""
    user_id = get_jwt_identity()
    tenant_id = g.tenant_id
    
    package = Package.query.filter_by(
        id=package_id,
        tenant_id=tenant_id,
        client_id=user_id
    ).first()
    
    if not package:
        return jsonify({'error': 'Colis non trouvé'}), 404
    
    if not package.is_editable:
        return jsonify({'error': 'Ce colis ne peut plus être modifié'}), 403
    
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Données JSON requises'}), 400
    
    # Validation des données
    is_valid, error_msg = validate_package_data(data, is_update=True, tenant_id=tenant_id)
    if not is_valid:
        return jsonify({'error': error_msg}), 400
    
    try:
        # Champs modifiables par le client avec sanitization
        if 'supplier_tracking' in data:
            package.supplier_tracking = data['supplier_tracking'].strip()[:100] if data['supplier_tracking'] else None
        if 'description' in data:
            package.description = data['description'].strip()[:MAX_DESCRIPTION_LENGTH]
        if 'category' in data:
            package.category = data['category'].strip()[:50] if data['category'] else None
        if 'transport_mode' in data:
            package.transport_mode = data['transport_mode']
        if 'package_type' in data:
            package.package_type = data['package_type']
        if 'weight' in data:
            package.weight = float(data['weight']) if data['weight'] else None
        if 'cbm' in data:
            package.cbm = float(data['cbm']) if data['cbm'] else None
        if 'length' in data:
            package.length = float(data['length']) if data['length'] else None
        if 'width' in data:
            package.width = float(data['width']) if data['width'] else None
        if 'height' in data:
            package.height = float(data['height']) if data['height'] else None
        if 'declared_value' in data:
            package.declared_value = float(data['declared_value']) if data['declared_value'] else None
        if 'currency' in data:
            package.currency = data['currency'][:3].upper() if data['currency'] else 'USD'
        if 'quantity' in data:
            package.quantity = int(data['quantity']) if data['quantity'] else 1
        if 'origin_address' in data:
            package.origin_address = data['origin_address'].strip()[:500] if data['origin_address'] else None
        if 'origin_city' in data:
            package.origin_city = data['origin_city'].strip()[:100] if data['origin_city'] else None
        if 'origin_country' in data:
            package.origin_country = data['origin_country'].strip()[:100] if data['origin_country'] else None
        if 'destination_address' in data:
            package.destination_address = data['destination_address'].strip()[:500] if data['destination_address'] else None
        if 'destination_city' in data:
            package.destination_city = data['destination_city'].strip()[:100] if data['destination_city'] else None
        if 'destination_country' in data:
            package.destination_country = data['destination_country'].strip()[:100] if data['destination_country'] else None
        if 'destination_warehouse' in data:
            package.destination_warehouse = data['destination_warehouse'].strip()[:100] if data['destination_warehouse'] else None
        if 'recipient_name' in data:
            package.recipient_name = data['recipient_name'].strip()[:100] if data['recipient_name'] else None
        if 'recipient_phone' in data:
            package.recipient_phone = data['recipient_phone'].strip()[:20] if data['recipient_phone'] else None
        
        db.session.commit()
        
        return jsonify({
            'message': 'Colis mis à jour',
            'package': package.to_dict()
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Erreur mise à jour colis {package_id}: {str(e)}")
        return jsonify({'error': 'Erreur lors de la mise à jour'}), 500


@packages_bp.route('/<package_id>', methods=['DELETE'])
@tenant_required
def delete_package(package_id):
    """Supprimer un colis (si encore en attente)"""
    user_id = get_jwt_identity()
    tenant_id = g.tenant_id
    
    package = Package.query.filter_by(
        id=package_id,
        tenant_id=tenant_id,
        client_id=user_id
    ).first()
    
    if not package:
        return jsonify({'error': 'Colis non trouvé'}), 404
    
    if package.status != 'pending':
        return jsonify({'error': 'Seuls les colis en attente peuvent être supprimés'}), 403
    
    try:
        tracking = package.tracking_number
        # Supprimer l'historique d'abord
        PackageHistory.query.filter_by(package_id=package_id).delete()
        db.session.delete(package)
        db.session.commit()
        
        logger.info(f"Colis supprimé: {tracking} par user {user_id}")
        
        return jsonify({'message': 'Colis supprimé'})
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Erreur suppression colis {package_id}: {str(e)}")
        return jsonify({'error': 'Erreur lors de la suppression'}), 500


@packages_bp.route('/stats', methods=['GET'])
@tenant_required
def get_stats():
    """Statistiques des colis du client (3 derniers mois)"""
    from datetime import datetime, timedelta
    
    user_id = get_jwt_identity()
    tenant_id = g.tenant_id
    
    # Filtrer sur les 3 derniers mois
    three_months_ago = datetime.utcnow() - timedelta(days=90)
    
    base_query = Package.query.filter_by(tenant_id=tenant_id, client_id=user_id).filter(
        Package.created_at >= three_months_ago
    )
    
    stats = {
        'total': base_query.count(),
        'pending': base_query.filter_by(status='pending').count(),
        'received': base_query.filter_by(status='received').count(),
        'in_transit': base_query.filter_by(status='in_transit').count(),
        'delivered': base_query.filter_by(status='delivered').count(),
        'by_status': {}
    }
    
    statuses = ['pending', 'received', 'in_transit', 'arrived_port', 'customs', 'out_for_delivery', 'delivered']
    for status in statuses:
        stats['by_status'][status] = base_query.filter_by(status=status).count()
    
    return jsonify({'stats': stats})
