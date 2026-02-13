"""
Routes Super-Admin - Gestion des Tenants
========================================

CRUD et gestion des entreprises clientes (tenants).
"""

from flask import request, jsonify, g
from app.routes.superadmin import superadmin_bp
from app.routes.superadmin.auth import superadmin_required, superadmin_permission_required
from app.models import Tenant, User, Package, Subscription, SubscriptionPlan
from app import db
from datetime import datetime, timedelta
from sqlalchemy import func
import logging

logger = logging.getLogger(__name__)


@superadmin_bp.route('/tenants', methods=['GET'])
@superadmin_permission_required('tenants.read')
def list_tenants():
    """
    Liste tous les tenants avec statistiques
    
    Query params:
        - search: Recherche par nom/email
        - status: active, inactive, all
        - plan: ID du plan
        - page, per_page: Pagination
    """
    search = request.args.get('search', '').strip()
    status = request.args.get('status', 'all')
    plan_id = request.args.get('plan')
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    
    query = Tenant.query
    
    if search:
        query = query.filter(
            db.or_(
                Tenant.name.ilike(f'%{search}%'),
                Tenant.email.ilike(f'%{search}%'),
                Tenant.slug.ilike(f'%{search}%')
            )
        )
    
    if status == 'active':
        query = query.filter_by(is_active=True)
    elif status == 'inactive':
        query = query.filter_by(is_active=False)
    
    if plan_id:
        query = query.join(Subscription).filter(Subscription.plan_id == plan_id)
    
    query = query.order_by(Tenant.created_at.desc())
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)
    
    tenants_data = []
    for tenant in pagination.items:
        data = tenant.to_dict()
        
        # Ajouter les stats
        data['stats'] = {
            'users_count': User.query.filter_by(tenant_id=tenant.id).count(),
            'packages_count': Package.query.filter_by(tenant_id=tenant.id).count(),
            'packages_this_month': Package.query.filter_by(tenant_id=tenant.id).filter(
                Package.created_at >= datetime.utcnow().replace(day=1, hour=0, minute=0, second=0)
            ).count()
        }
        
        # Ajouter l'abonnement
        if tenant.subscription:
            data['subscription'] = tenant.subscription.to_dict()
        else:
            data['subscription'] = None
        
        tenants_data.append(data)
    
    return jsonify({
        'tenants': tenants_data,
        'pagination': {
            'page': pagination.page,
            'per_page': pagination.per_page,
            'total': pagination.total,
            'pages': pagination.pages
        }
    })


@superadmin_bp.route('/tenants/<tenant_id>', methods=['GET'])
@superadmin_permission_required('tenants.read')
def get_tenant(tenant_id):
    """Détail d'un tenant avec statistiques complètes"""
    tenant = Tenant.query.get_or_404(tenant_id)
    
    data = tenant.to_dict()
    
    # Stats détaillées
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0)
    
    data['stats'] = {
        'users': {
            'total': User.query.filter_by(tenant_id=tenant.id).count(),
            'clients': User.query.filter_by(tenant_id=tenant.id, role='client').count(),
            'staff': User.query.filter_by(tenant_id=tenant.id).filter(
                User.role.in_(['staff', 'admin'])
            ).count(),
            'active': User.query.filter_by(tenant_id=tenant.id, is_active=True).count()
        },
        'packages': {
            'total': Package.query.filter_by(tenant_id=tenant.id).count(),
            'this_month': Package.query.filter_by(tenant_id=tenant.id).filter(
                Package.created_at >= month_start
            ).count(),
            'pending': Package.query.filter_by(tenant_id=tenant.id, status='pending').count(),
            'delivered': Package.query.filter_by(tenant_id=tenant.id, status='delivered').count()
        }
    }
    
    # Abonnement
    if tenant.subscription:
        data['subscription'] = tenant.subscription.to_dict(include_plan=True)
    
    # Admins du tenant
    admins = User.query.filter_by(tenant_id=tenant.id, role='admin').all()
    data['admins'] = [{
        'id': u.id,
        'email': u.email,
        'full_name': u.full_name,
        'last_login': u.last_login.isoformat() if u.last_login else None
    } for u in admins]
    
    return jsonify(data)


@superadmin_bp.route('/tenants', methods=['POST'])
@superadmin_permission_required('tenants.write')
def create_tenant():
    """
    Crée un nouveau tenant avec son admin
    
    Body:
        - name: Nom de l'entreprise
        - slug: Identifiant unique (URL-friendly)
        - email: Email de contact
        - phone: Téléphone (optionnel)
        - admin_email: Email de l'admin
        - admin_password: Mot de passe de l'admin
        - admin_first_name, admin_last_name: Nom de l'admin
        - plan_id: ID du plan (optionnel, défaut: free)
    """
    data = request.get_json()
    
    # Validation
    name = data.get('name', '').strip()
    slug = data.get('slug', '').lower().strip()
    email = data.get('email', '').lower().strip()
    
    if not name or not slug or not email:
        return jsonify({'error': 'Nom, slug et email requis'}), 400
    
    # Vérifier unicité du slug
    if Tenant.query.filter_by(slug=slug).first():
        return jsonify({'error': 'Ce slug existe déjà'}), 409
    
    # Custom tenant ID (optional)
    custom_id = data.get('id', '').strip()
    if custom_id:
        if Tenant.query.get(custom_id):
            return jsonify({'error': 'Ce Tenant ID existe déjà'}), 409
    
    # Créer le tenant
    tenant_kwargs = dict(
        name=name,
        slug=slug,
        email=email,
        phone=data.get('phone'),
        address=data.get('address'),
        is_active=True
    )
    if custom_id:
        tenant_kwargs['id'] = custom_id
    
    tenant = Tenant(**tenant_kwargs)
    db.session.add(tenant)
    db.session.flush()  # Pour avoir l'ID
    
    # Créer l'admin du tenant
    admin_email = data.get('admin_email', '').lower().strip()
    admin_password = data.get('admin_password')
    
    if admin_email and admin_password:
        admin = User(
            tenant_id=tenant.id,
            email=admin_email,
            first_name=data.get('admin_first_name', 'Admin'),
            last_name=data.get('admin_last_name', name),
            role='admin',
            is_active=True
        )
        admin.set_password(admin_password)
        db.session.add(admin)
    
    # Créer l'abonnement
    plan_id = data.get('plan_id')
    if not plan_id:
        # Chercher le plan gratuit par défaut
        free_plan = SubscriptionPlan.query.filter_by(code='free').first()
        if free_plan:
            plan_id = free_plan.id
    
    if plan_id:
        plan = SubscriptionPlan.query.get(plan_id)
        if plan:
            subscription = Subscription(
                tenant_id=tenant.id,
                plan_id=plan_id,
                status='trial' if plan.trial_days > 0 else 'active',
                started_at=datetime.utcnow(),
                trial_ends_at=datetime.utcnow() + timedelta(days=plan.trial_days) if plan.trial_days else None,
                current_period_start=datetime.utcnow(),
                current_period_end=datetime.utcnow() + timedelta(days=30)
            )
            db.session.add(subscription)
    
    db.session.commit()
    
    logger.info(f"Tenant created: {tenant.slug} by {g.superadmin.email}")
    
    return jsonify(tenant.to_dict()), 201


@superadmin_bp.route('/tenants/<tenant_id>', methods=['PUT'])
@superadmin_permission_required('tenants.write')
def update_tenant(tenant_id):
    """Modifie un tenant"""
    tenant = Tenant.query.get_or_404(tenant_id)
    data = request.get_json()
    
    if 'name' in data:
        tenant.name = data['name']
    if 'email' in data:
        tenant.email = data['email']
    if 'phone' in data:
        tenant.phone = data['phone']
    if 'address' in data:
        tenant.address = data['address']
    if 'is_active' in data:
        tenant.is_active = data['is_active']
    if 'settings' in data:
        tenant.settings = data['settings']
    
    db.session.commit()
    
    return jsonify(tenant.to_dict())


@superadmin_bp.route('/tenants/<tenant_id>', methods=['DELETE'])
@superadmin_permission_required('tenants.delete')
def delete_tenant(tenant_id):
    """
    Supprime un tenant (soft delete - désactivation)
    Ajouter ?force=true pour suppression définitive
    """
    tenant = Tenant.query.get_or_404(tenant_id)
    force = request.args.get('force', 'false').lower() == 'true'
    
    if force:
        # Suppression définitive (attention!)
        logger.warning(f"Force deleting tenant: {tenant.slug} by {g.superadmin.email}")
        
        # Supprimer les données liées
        User.query.filter_by(tenant_id=tenant.id).delete()
        Package.query.filter_by(tenant_id=tenant.id).delete()
        Subscription.query.filter_by(tenant_id=tenant.id).delete()
        
        db.session.delete(tenant)
        db.session.commit()
        
        return jsonify({'message': 'Tenant supprimé définitivement'})
    else:
        # Soft delete
        tenant.is_active = False
        db.session.commit()
        
        logger.info(f"Tenant deactivated: {tenant.slug} by {g.superadmin.email}")
        
        return jsonify({'message': 'Tenant désactivé'})


@superadmin_bp.route('/tenants/<tenant_id>/impersonate', methods=['POST'])
@superadmin_permission_required('tenants.impersonate')
def impersonate_tenant_admin(tenant_id):
    """
    Génère un token pour se connecter en tant qu'admin du tenant
    Utile pour le support/debug
    """
    from flask_jwt_extended import create_access_token
    
    tenant = Tenant.query.get_or_404(tenant_id)
    
    # Trouver l'admin principal du tenant
    admin = User.query.filter_by(tenant_id=tenant.id, role='admin').first()
    
    if not admin:
        return jsonify({'error': 'Aucun admin trouvé pour ce tenant'}), 404
    
    # Créer un token avec marqueur d'impersonation
    additional_claims = {
        'tenant_id': tenant.id,
        'role': 'admin',
        'impersonated_by': g.superadmin.id
    }
    
    access_token = create_access_token(
        identity=admin.id,
        additional_claims=additional_claims,
        expires_delta=timedelta(hours=1)
    )
    
    logger.warning(f"Impersonation: {g.superadmin.email} -> {admin.email} (tenant: {tenant.slug})")
    
    return jsonify({
        'access_token': access_token,
        'admin': {
            'id': admin.id,
            'email': admin.email,
            'full_name': admin.full_name
        },
        'tenant': tenant.to_dict(),
        'expires_in': 3600
    })


# ==================== GESTION DES CANAUX ====================

@superadmin_bp.route('/tenants/<tenant_id>/channels', methods=['GET'])
@superadmin_permission_required('tenants.read')
def get_tenant_channels(tenant_id):
    """
    Récupère les canaux autorisés pour un tenant
    """
    from app.models.tenant import ALL_CHANNELS, DEFAULT_CHANNELS
    
    tenant = Tenant.query.get_or_404(tenant_id)
    
    return jsonify({
        'tenant_id': tenant.id,
        'tenant_name': tenant.name,
        'allowed_channels': tenant.allowed_channels or DEFAULT_CHANNELS,
        'available_channels': ALL_CHANNELS
    })


@superadmin_bp.route('/tenants/<tenant_id>/channels', methods=['PUT'])
@superadmin_permission_required('tenants.write')
def update_tenant_channels(tenant_id):
    """
    Met à jour les canaux autorisés pour un tenant
    
    Body:
        - channels: Liste des canaux autorisés
    """
    from app.models.tenant import ALL_CHANNELS
    
    tenant = Tenant.query.get_or_404(tenant_id)
    data = request.get_json()
    
    channels = data.get('channels', [])
    
    # Valider les canaux
    invalid_channels = [c for c in channels if c not in ALL_CHANNELS]
    if invalid_channels:
        return jsonify({
            'error': f'Canaux invalides: {invalid_channels}',
            'valid_channels': ALL_CHANNELS
        }), 400
    
    tenant.allowed_channels = channels
    db.session.commit()
    
    logger.info(f"Tenant {tenant.slug} channels updated to {channels} by {g.superadmin.email}")
    
    return jsonify({
        'message': 'Canaux mis à jour',
        'allowed_channels': tenant.allowed_channels
    })


# ==================== GESTION DES ENTITLEMENTS ====================

@superadmin_bp.route('/tenants/<tenant_id>/entitlements', methods=['GET'])
@superadmin_permission_required('tenants.read')
def get_tenant_entitlements(tenant_id):
    """
    Récupère les entitlements (fonctionnalités avancées) d'un tenant
    """
    tenant = Tenant.query.get_or_404(tenant_id)
    
    # Entitlements par défaut
    default_entitlements = {
        'max_devices_per_user': 3,
        'offline_mode': False,
        'api_access': False,
        'api_rate_limit': 100,
        'custom_branding': False,
        'white_label': False,
        'priority_support': False,
        'sso_enabled': False,
        'audit_logs': False,
        'advanced_analytics': False
    }
    
    # Fusionner avec les entitlements du tenant
    current = default_entitlements.copy()
    if tenant.entitlements:
        current.update(tenant.entitlements)
    
    return jsonify({
        'tenant_id': tenant.id,
        'tenant_name': tenant.name,
        'entitlements': current,
        'default_entitlements': default_entitlements
    })


@superadmin_bp.route('/tenants/<tenant_id>/entitlements', methods=['PUT'])
@superadmin_permission_required('tenants.write')
def update_tenant_entitlements(tenant_id):
    """
    Met à jour les entitlements d'un tenant
    
    Body:
        - entitlements: Dictionnaire des entitlements
    """
    tenant = Tenant.query.get_or_404(tenant_id)
    data = request.get_json()
    
    entitlements = data.get('entitlements', {})
    
    if not isinstance(entitlements, dict):
        return jsonify({'error': 'entitlements doit être un objet'}), 400
    
    # Fusionner avec les entitlements existants
    current = tenant.entitlements or {}
    current.update(entitlements)
    tenant.entitlements = current
    
    db.session.commit()
    
    logger.info(f"Tenant {tenant.slug} entitlements updated by {g.superadmin.email}")
    
    return jsonify({
        'message': 'Entitlements mis à jour',
        'entitlements': tenant.entitlements
    })


@superadmin_bp.route('/channels', methods=['GET'])
@superadmin_permission_required('tenants.read')
def list_available_channels():
    """
    Liste tous les canaux disponibles avec descriptions
    """
    from app.models.tenant import ALL_CHANNELS
    
    channel_info = {
        'web_admin': {
            'name': 'Web Admin',
            'description': 'Interface d\'administration web',
            'platform': 'web'
        },
        'web_client': {
            'name': 'Web Client',
            'description': 'Interface client web (tracking)',
            'platform': 'web'
        },
        'app_android_client': {
            'name': 'App Android Client',
            'description': 'Application mobile Android client',
            'platform': 'mobile'
        },
        'app_ios_client': {
            'name': 'App iOS Client',
            'description': 'Application mobile iOS client',
            'platform': 'mobile'
        },
        'pc_admin': {
            'name': 'PC Admin',
            'description': 'Application desktop Windows admin',
            'platform': 'desktop'
        },
        'mac_admin': {
            'name': 'Mac Admin',
            'description': 'Application desktop macOS admin',
            'platform': 'desktop'
        }
    }
    
    return jsonify({
        'channels': [
            {'code': c, **channel_info.get(c, {'name': c, 'description': '', 'platform': 'other'})}
            for c in ALL_CHANNELS
        ]
    })
