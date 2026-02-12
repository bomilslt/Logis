"""
Routes Admin - Gestion du personnel
CRUD et gestion des comptes staff/admin
"""

from flask import request, jsonify, g
from flask_jwt_extended import get_jwt_identity
from app import db
from app.routes.admin import admin_bp
from app.models import User, Warehouse, VALID_ACCESS_MODULES
from app.utils.decorators import admin_required, permission_required, role_required, module_required
from app.utils.audit import audit_log, AuditAction
from datetime import datetime
import secrets
import logging
from sqlalchemy import inspect

logger = logging.getLogger(__name__)


def _user_warehouses_table_exists() -> bool:
    try:
        inspector = inspect(db.engine)
        return 'user_warehouses' in inspector.get_table_names()
    except Exception:
        return False


def _normalize_warehouse_ids(data: dict):
    warehouse_ids = data.get('warehouse_ids')
    if warehouse_ids is None:
        warehouse_ids = []
    if isinstance(warehouse_ids, str):
        warehouse_ids = [warehouse_ids]
    warehouse_ids = [w for w in warehouse_ids if w]

    legacy_warehouse_id = data.get('warehouse_id')
    if legacy_warehouse_id and legacy_warehouse_id not in warehouse_ids:
        warehouse_ids = [legacy_warehouse_id] + warehouse_ids
    return warehouse_ids


@admin_bp.route('/staff', methods=['GET'])
@module_required('staff')
def admin_get_staff():
    """Liste du personnel (admin et staff)"""
    tenant_id = g.tenant_id
    
    staff = User.query.filter_by(tenant_id=tenant_id).filter(
        User.role.in_(['admin', 'staff'])
    ).order_by(User.created_at.desc()).all()
    
    return jsonify({
        'staff': [s.to_dict(include_private=True) for s in staff]
    })


@admin_bp.route('/staff/<staff_id>', methods=['GET'])
@module_required('staff')
def admin_get_staff_member(staff_id):
    """Détails d'un membre du personnel"""
    tenant_id = g.tenant_id
    
    staff = User.query.filter_by(
        id=staff_id, 
        tenant_id=tenant_id
    ).filter(User.role.in_(['admin', 'staff'])).first()
    
    if not staff:
        return jsonify({'error': 'Staff member not found'}), 404
    
    return jsonify({
        'staff': staff.to_dict(include_private=True)
    })


@admin_bp.route('/staff', methods=['POST'])
@module_required('staff')
def admin_create_staff():
    """
    Créer un membre du personnel
    
    Body:
        - first_name, last_name: Nom (requis)
        - email: Email (requis)
        - phone: Téléphone
        - role: admin ou staff (défaut: staff)
        - position: Poste (Gestionnaire, Livreur, etc.)
        - salary: Salaire mensuel
        - hire_date: Date d'embauche (YYYY-MM-DD)
        - password: Mot de passe (optionnel, généré si absent)
    """
    tenant_id = g.tenant_id
    current_user_id = get_jwt_identity()
    data = request.get_json()
    
    # Vérifier que l'utilisateur actuel est admin
    current_user = User.query.get(current_user_id)
    if current_user.role != 'admin':
        return jsonify({'error': 'Only admins can create staff'}), 403
    
    # Vérification des quotas staff
    from app.services.enforcement_service import EnforcementService
    quota_result = EnforcementService.check_quota(tenant_id, EnforcementService.RESOURCE_STAFF)
    if not quota_result['allowed']:
        return jsonify({
            'error': 'Quota atteint',
            'message': quota_result['reason'],
            'details': quota_result
        }), 403
    
    # Validation
    required = ['first_name', 'last_name', 'email']
    for field in required:
        if not data.get(field):
            return jsonify({'error': f'{field} is required'}), 400
    
    # Vérifier unicité email
    existing = User.query.filter_by(tenant_id=tenant_id, email=data['email']).first()
    if existing:
        return jsonify({'error': 'Email already registered'}), 409
    
    # Rôle (seulement admin ou staff)
    role = data.get('role', 'staff')
    if role not in ['admin', 'staff']:
        role = 'staff'

    warehouse_ids = _normalize_warehouse_ids(data)
    warehouse_id = warehouse_ids[0] if warehouse_ids else None
    if role == 'staff':
        if not warehouse_id:
            return jsonify({'error': 'warehouse_id is required for staff'}), 400

        warehouses = Warehouse.query.filter(
            Warehouse.tenant_id == tenant_id,
            Warehouse.id.in_(warehouse_ids)
        ).all()
        if len(warehouses) != len(set(warehouse_ids)):
            return jsonify({'error': 'Warehouse not found'}), 404
    
    # Parser la date d'embauche
    hire_date = None
    if data.get('hire_date'):
        try:
            hire_date = datetime.strptime(data['hire_date'], '%Y-%m-%d').date()
        except:
            pass
    
    # Valider et assigner les modules d'accès
    access_modules = []
    if role == 'staff':
        raw_modules = data.get('access_modules', [])
        access_modules = [m for m in raw_modules if m in VALID_ACCESS_MODULES]
    
    # Créer le membre
    staff = User(
        tenant_id=tenant_id,
        email=data['email'],
        phone=data.get('phone'),
        first_name=data['first_name'],
        last_name=data['last_name'],
        role=role,
        warehouse_id=warehouse_id if role == 'staff' else None,
        position=data.get('position'),
        salary=data.get('salary', 0),
        hire_date=hire_date or datetime.utcnow().date(),
        access_modules=access_modules if role == 'staff' else [],
        is_active=True,
        is_verified=True
    )

    if role == 'staff' and warehouse_ids and _user_warehouses_table_exists():
        staff.warehouses = warehouses
    
    # Mot de passe
    password = data.get('password')
    if not password:
        password = secrets.token_urlsafe(8)
    
    staff.set_password(password)
    
    db.session.add(staff)
    db.session.commit()
    
    audit_log(
        action=AuditAction.USER_CREATE,
        resource_type='user',
        resource_id=staff.id,
        details={'role': 'staff', 'email': staff.email, 'position': staff.position}
    )
    
    return jsonify({
        'message': 'Staff member created',
        'staff': staff.to_dict(include_private=True),
        'temporary_password': password if not data.get('password') else None
    }), 201


@admin_bp.route('/staff/<staff_id>', methods=['PUT'])
@module_required('staff')
def admin_update_staff(staff_id):
    """
    Mettre à jour un membre du personnel
    
    Body:
        - first_name, last_name, phone, email, role
        - position, salary, hire_date
    """
    tenant_id = g.tenant_id
    current_user_id = get_jwt_identity()
    data = request.get_json()
    
    # Vérifier que l'utilisateur actuel est admin
    current_user = User.query.get(current_user_id)
    if current_user.role != 'admin':
        return jsonify({'error': 'Only admins can update staff'}), 403
    
    staff = User.query.filter_by(
        id=staff_id, 
        tenant_id=tenant_id
    ).filter(User.role.in_(['admin', 'staff'])).first()
    
    if not staff:
        return jsonify({'error': 'Staff member not found'}), 404
    
    target_role = data.get('role', staff.role)
    if target_role not in ['admin', 'staff']:
        target_role = staff.role

    # Champs modifiables - Infos personnelles
    if 'first_name' in data:
        staff.first_name = data['first_name']
    if 'last_name' in data:
        staff.last_name = data['last_name']
    if 'phone' in data:
        staff.phone = data['phone']
    if 'email' in data:
        # Vérifier unicité
        existing = User.query.filter_by(tenant_id=tenant_id, email=data['email']).first()
        if existing and existing.id != staff_id:
            return jsonify({'error': 'Email already used'}), 409
        staff.email = data['email']
    if 'role' in data and data['role'] in ['admin', 'staff']:
        # Ne pas permettre de se rétrograder soi-même
        if staff_id == current_user_id and data['role'] != 'admin':
            return jsonify({'error': 'Cannot demote yourself'}), 400
        staff.role = data['role']

    if 'warehouse_id' in data or 'warehouse_ids' in data or 'role' in data:
        if staff.role == 'staff':
            warehouse_ids = _normalize_warehouse_ids({
                'warehouse_id': data.get('warehouse_id', staff.warehouse_id),
                'warehouse_ids': data.get('warehouse_ids', [w.id for w in (staff.warehouses or [])])
            })
            warehouse_id = warehouse_ids[0] if warehouse_ids else None
            if not warehouse_id:
                return jsonify({'error': 'warehouse_id is required for staff'}), 400

            warehouses = Warehouse.query.filter(
                Warehouse.tenant_id == tenant_id,
                Warehouse.id.in_(warehouse_ids)
            ).all()
            if len(warehouses) != len(set(warehouse_ids)):
                return jsonify({'error': 'Warehouse not found'}), 404

            staff.warehouse_id = warehouse_id
            if _user_warehouses_table_exists():
                staff.warehouses = warehouses
        else:
            staff.warehouse_id = None
            if _user_warehouses_table_exists():
                staff.warehouses = []
    
    # Champs RH
    if 'position' in data:
        staff.position = data['position']
    if 'salary' in data:
        staff.salary = data['salary']
    if 'hire_date' in data:
        try:
            staff.hire_date = datetime.strptime(data['hire_date'], '%Y-%m-%d').date()
        except:
            pass
    if 'is_active' in data:
        # Ne pas permettre de se désactiver soi-même
        if staff_id != current_user_id:
            staff.is_active = data['is_active']
    
    # Modules d'accès
    if 'access_modules' in data:
        if staff.role == 'staff':
            raw_modules = data.get('access_modules', [])
            staff.access_modules = [m for m in raw_modules if m in VALID_ACCESS_MODULES]
        else:
            staff.access_modules = []
    
    db.session.commit()
    
    audit_log(
        action=AuditAction.USER_UPDATE,
        resource_type='user',
        resource_id=staff.id,
        details={'role': 'staff', 'updated_fields': list(data.keys())}
    )
    
    return jsonify({
        'message': 'Staff member updated',
        'staff': staff.to_dict(include_private=True)
    })


@admin_bp.route('/staff/<staff_id>/toggle-active', methods=['POST'])
@module_required('staff')
def admin_toggle_staff_active(staff_id):
    """Activer/Désactiver un compte staff"""
    tenant_id = g.tenant_id
    current_user_id = get_jwt_identity()
    
    # Vérifier que l'utilisateur actuel est admin
    current_user = User.query.get(current_user_id)
    if current_user.role != 'admin':
        return jsonify({'error': 'Only admins can toggle staff status'}), 403
    
    staff = User.query.filter_by(
        id=staff_id, 
        tenant_id=tenant_id
    ).filter(User.role.in_(['admin', 'staff'])).first()
    
    if not staff:
        return jsonify({'error': 'Staff member not found'}), 404
    
    # Ne pas permettre de se désactiver soi-même
    if staff_id == current_user_id:
        return jsonify({'error': 'Cannot deactivate yourself'}), 400
    
    staff.is_active = not staff.is_active
    db.session.commit()
    
    audit_log(
        action=AuditAction.USER_DEACTIVATE if not staff.is_active else AuditAction.USER_ACTIVATE,
        resource_type='user',
        resource_id=staff.id,
        details={'role': 'staff', 'email': staff.email, 'is_active': staff.is_active}
    )
    
    return jsonify({
        'message': f"Compte {'activé' if staff.is_active else 'désactivé'} avec succès",
        'user': staff.to_dict()
    })


@admin_bp.route('/staff/<staff_id>/reset-password', methods=['POST'])
@module_required('staff')
def admin_reset_staff_password(staff_id):
    """Réinitialiser le mot de passe d'un membre du personnel"""
    tenant_id = g.tenant_id
    current_user_id = get_jwt_identity()
    
    # Vérifier que l'utilisateur actuel est admin
    current_user = User.query.get(current_user_id)
    if current_user.role != 'admin':
        return jsonify({'error': 'Only admins can reset passwords'}), 403
    
    staff = User.query.filter_by(
        id=staff_id, 
        tenant_id=tenant_id
    ).filter(User.role.in_(['admin', 'staff'])).first()
    
    if not staff:
        return jsonify({'error': 'Staff member not found'}), 404
    
    # Générer nouveau mot de passe
    new_password = secrets.token_urlsafe(8)
    staff.set_password(new_password)
    db.session.commit()
    
    audit_log(
        action=AuditAction.PASSWORD_RESET,
        resource_type='user',
        resource_id=staff.id,
        details={'role': 'staff', 'email': staff.email, 'reset_by_admin': True}
    )
    
    return jsonify({
        'message': 'Password reset',
        'temporary_password': new_password
    })


@admin_bp.route('/staff/<staff_id>/permissions', methods=['GET'])
@module_required('staff')
def admin_get_staff_permissions(staff_id):
    """
    Récupère les permissions actuelles d'un membre du personnel
    Retourne les permissions effectives (rôles + individuelles)
    """
    tenant_id = g.tenant_id
    
    staff = User.query.filter_by(
        id=staff_id, 
        tenant_id=tenant_id
    ).filter(User.role.in_(['admin', 'staff'])).first()
    
    if not staff:
        return jsonify({'error': 'Staff member not found'}), 404
    
    # Récupérer les permissions effectives
    effective_permissions = list(staff.get_effective_permissions())
    
    # Récupérer les permissions individuelles (pour l'édition)
    individual_permissions = [p.name for p in staff.individual_permissions]
    
    # Récupérer les permissions des rôles (pour information)
    role_permissions = []
    for role in staff.roles:
        role_permissions.extend([p.name for p in role.permissions])
    
    return jsonify({
        'id': staff.id,
        'email': staff.email,
        'full_name': staff.full_name,
        'role': staff.role,
        'effective_permissions': effective_permissions,
        'individual_permissions': individual_permissions,
        'role_permissions': list(set(role_permissions)),
        'roles': [{'id': role.id, 'name': role.name, 'display_name': role.display_name} for role in staff.roles]
    })


@admin_bp.route('/staff/<staff_id>/permissions', methods=['PUT'])
@module_required('staff')
def admin_update_staff_permissions(staff_id):
    """
    Mettre à jour les permissions d'un membre du personnel
    
    Body:
        - permissions: Liste des permissions ["packages.read", "clients.write", ...]
    """
    tenant_id = g.tenant_id
    current_user_id = get_jwt_identity()
    data = request.get_json()
    
    # Vérifier que l'utilisateur actuel est admin
    current_user = User.query.get(current_user_id)
    if current_user.role != 'admin':
        return jsonify({'error': 'Only admins can update permissions'}), 403
    
    staff = User.query.filter_by(
        id=staff_id, 
        tenant_id=tenant_id
    ).filter(User.role.in_(['admin', 'staff'])).first()
    
    if not staff:
        return jsonify({'error': 'Staff member not found'}), 404
    
    # Récupérer les permissions depuis la requête
    permissions = data.get('permissions', [])
    
    # Vider les permissions individuelles existantes
    staff.individual_permissions.clear()
    
    # Ajouter les nouvelles permissions individuelles
    from app.models import Permission
    for perm_name in permissions:
        permission = Permission.query.filter_by(name=perm_name).first()
        if permission:
            staff.individual_permissions.append(permission)
        else:
            logger.warning(f"Permission inconnue ignorée: {perm_name}")
    
    # Invalider le cache des permissions
    staff.invalidate_permissions_cache()
    
    db.session.commit()
    
    audit_log(
        action=AuditAction.PERMISSIONS_UPDATE,
        resource_type='user',
        resource_id=staff.id,
        details={'role': 'staff', 'email': staff.email, 'new_permissions': permissions}
    )
    
    # Retourner les permissions effectives pour le frontend
    effective_permissions = list(staff.get_effective_permissions())
    
    return jsonify({
        'message': 'Permissions updated',
        'permissions': effective_permissions,
        'individual_permissions': permissions
    })


@admin_bp.route('/access-modules', methods=['GET'])
@admin_required
def get_access_modules():
    """Liste des modules d'accès disponibles pour le frontend (checkboxes)"""
    MODULE_LABELS = {
        'packages': 'Colis & Clients',
        'finance': 'Finances & Paiements',
        'departures': 'Départs & Logistique',
        'communication': 'Annonces & Communication',
        'settings': 'Configuration & Paramètres',
        'staff': 'Gestion du Personnel',
    }
    return jsonify({
        'modules': [
            {'code': m, 'label': MODULE_LABELS.get(m, m)}
            for m in VALID_ACCESS_MODULES
        ]
    })
