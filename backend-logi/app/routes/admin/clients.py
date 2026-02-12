"""
Routes Admin - Gestion des clients
CRUD et actions sur les comptes clients
"""

from flask import request, jsonify, g
from flask_jwt_extended import get_jwt_identity
from app import db
from app.routes.admin import admin_bp
from app.models import User, Package, Payment
from app.utils.decorators import admin_required, permission_required, admin_or_permission_required, module_required
from sqlalchemy import or_, func


@admin_bp.route('/clients', methods=['GET'])
@module_required('packages')
def admin_get_clients():
    """
    Liste des clients avec filtres
    
    Query params:
        - search: Recherche (nom, email, téléphone)
        - status: active/inactive
        - page, per_page: Pagination
    """
    tenant_id = g.tenant_id
    
    search = request.args.get('search')
    status = request.args.get('status')
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    
    query = User.query.filter_by(tenant_id=tenant_id, role='client')
    
    if search:
        query = query.filter(
            or_(
                User.first_name.ilike(f'%{search}%'),
                User.last_name.ilike(f'%{search}%'),
                User.email.ilike(f'%{search}%'),
                User.phone.ilike(f'%{search}%')
            )
        )
    
    if status == 'active':
        query = query.filter_by(is_active=True)
    elif status == 'inactive':
        query = query.filter_by(is_active=False)
    
    query = query.order_by(User.created_at.desc())
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)
    
    # Stats globales (sans les filtres de recherche)
    all_clients_query = User.query.filter_by(tenant_id=tenant_id, role='client')
    active_count = all_clients_query.filter_by(is_active=True).count()
    
    # Nouveaux ce mois
    from datetime import datetime
    month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    new_this_month = all_clients_query.filter(User.created_at >= month_start).count()
    
    # Précharger les stats pour éviter N+1
    client_ids = [c.id for c in pagination.items]

    packages_counts = {}
    pending_counts = {}
    total_paid_map = {}

    if client_ids:
        packages_counts = dict(
            db.session.query(Package.client_id, func.count(Package.id))
            .filter(Package.tenant_id == tenant_id, Package.client_id.in_(client_ids))
            .group_by(Package.client_id)
            .all()
        )

        pending_counts = dict(
            db.session.query(Package.client_id, func.count(Package.id))
            .filter(Package.tenant_id == tenant_id, Package.client_id.in_(client_ids), Package.status == 'pending')
            .group_by(Package.client_id)
            .all()
        )

        total_paid_map = dict(
            db.session.query(Payment.client_id, func.coalesce(func.sum(Payment.amount), 0))
            .filter(Payment.tenant_id == tenant_id, Payment.client_id.in_(client_ids), Payment.status == 'confirmed')
            .group_by(Payment.client_id)
            .all()
        )

    # Enrichir avec stats
    clients_data = []
    for client in pagination.items:
        client_dict = client.to_dict(include_private=True)
        client_dict['stats'] = {
            'packages_count': packages_counts.get(client.id, 0),
            'pending_count': pending_counts.get(client.id, 0),
            'total_paid': total_paid_map.get(client.id, 0) or 0
        }
        clients_data.append(client_dict)
    
    return jsonify({
        'clients': clients_data,
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': page,
        'active_count': active_count,
        'new_this_month': new_this_month
    })


@admin_bp.route('/clients/<client_id>', methods=['GET'])
@module_required('packages')
def admin_get_client(client_id):
    """
    Détails complets d'un client
    Inclut: infos, colis, paiements, stats
    """
    tenant_id = g.tenant_id
    
    client = User.query.filter_by(
        id=client_id, 
        tenant_id=tenant_id, 
        role='client'
    ).first()
    
    if not client:
        return jsonify({'error': 'Client not found'}), 404
    
    # Colis récents
    recent_packages = Package.query.filter_by(tenant_id=tenant_id, client_id=client_id).order_by(
        Package.created_at.desc()
    ).limit(10).all()
    
    # Paiements récents
    recent_payments = Payment.query.filter_by(tenant_id=tenant_id, client_id=client_id).order_by(
        Payment.created_at.desc()
    ).limit(10).all()
    
    # Stats
    packages_query = Package.query.filter_by(tenant_id=tenant_id, client_id=client_id)
    total_packages = packages_query.count()
    pending_packages = packages_query.filter(Package.status.in_(['pending', 'received', 'in_transit', 'arrived_port', 'customs', 'out_for_delivery'])).count()
    delivered_packages = packages_query.filter_by(status='delivered').count()
    total_paid = db.session.query(func.sum(Payment.amount)).filter(
        Payment.tenant_id == tenant_id, Payment.client_id == client_id, Payment.status == 'confirmed'
    ).scalar() or 0
    total_amount = db.session.query(func.sum(Package.amount)).filter(
        Package.tenant_id == tenant_id, Package.client_id == client_id
    ).scalar() or 0
    balance = total_amount - total_paid
    
    stats = {
        'packages_count': total_packages,
        'pending_packages': pending_packages,
        'delivered_packages': delivered_packages,
        'total_spent': total_paid,
        'balance': balance if balance > 0 else 0,
        # Anciens noms pour compatibilité
        'total_packages': total_packages,
        'pending': pending_packages,
        'in_transit': packages_query.filter_by(status='in_transit').count(),
        'delivered': delivered_packages,
        'total_paid': total_paid,
        'unpaid_amount': balance if balance > 0 else 0
    }
    
    return jsonify({
        'client': client.to_dict(include_private=True),
        'packages': [p.to_dict() for p in recent_packages],
        'payments': [p.to_dict() for p in recent_payments],
        'stats': stats
    })


@admin_bp.route('/clients', methods=['POST'])
@module_required('packages')
def admin_create_client():
    """
    Créer un nouveau client
    
    Body:
        - first_name, last_name: Nom (requis)
        - email: Email (requis)
        - phone: Téléphone
        - password: Mot de passe (optionnel, généré si absent)
    """
    tenant_id = g.tenant_id
    data = request.get_json()
    
    # Validation
    required = ['first_name', 'last_name', 'email']
    for field in required:
        if not data.get(field):
            return jsonify({'error': f'{field} is required'}), 400
    
    # Vérification des quotas clients
    from app.services.enforcement_service import EnforcementService
    quota_result = EnforcementService.check_quota(tenant_id, EnforcementService.RESOURCE_CLIENTS)
    if not quota_result['allowed']:
        return jsonify({
            'error': 'Quota atteint',
            'message': quota_result['reason'],
            'details': quota_result
        }), 403
    
    # Vérifier unicité email
    existing = User.query.filter_by(tenant_id=tenant_id, email=data['email']).first()
    if existing:
        return jsonify({'error': 'Email already registered'}), 409
    
    # Créer le client
    client = User(
        tenant_id=tenant_id,
        email=data['email'],
        phone=data.get('phone'),
        first_name=data['first_name'],
        last_name=data['last_name'],
        role='client',
        is_active=True,
        is_verified=True  # Créé par admin = vérifié
    )
    
    # Mot de passe
    password = data.get('password')
    if not password:
        # Générer un mot de passe temporaire
        import secrets
        password = secrets.token_urlsafe(8)
    
    client.set_password(password)
    
    db.session.add(client)
    db.session.commit()
    
    return jsonify({
        'message': 'Client created',
        'client': client.to_dict(include_private=True),
        'temporary_password': password if not data.get('password') else None
    }), 201


@admin_bp.route('/clients/<client_id>', methods=['PUT'])
@module_required('packages')
def admin_update_client(client_id):
    """
    Mettre à jour un client
    
    Body:
        - first_name, last_name, phone, email
    """
    tenant_id = g.tenant_id
    data = request.get_json()
    
    client = User.query.filter_by(
        id=client_id, 
        tenant_id=tenant_id, 
        role='client'
    ).first()
    
    if not client:
        return jsonify({'error': 'Client not found'}), 404
    
    # Champs modifiables
    if 'first_name' in data:
        client.first_name = data['first_name']
    if 'last_name' in data:
        client.last_name = data['last_name']
    if 'phone' in data:
        client.phone = data['phone']
    if 'email' in data:
        # Vérifier unicité
        existing = User.query.filter_by(tenant_id=tenant_id, email=data['email']).first()
        if existing and existing.id != client_id:
            return jsonify({'error': 'Email already used'}), 409
        client.email = data['email']
    
    db.session.commit()
    
    return jsonify({
        'message': 'Client updated',
        'client': client.to_dict(include_private=True)
    })


@admin_bp.route('/clients/<client_id>/toggle-active', methods=['POST'])
@module_required('packages')
def admin_toggle_client_active(client_id):
    """Activer/Désactiver un compte client"""
    tenant_id = g.tenant_id
    
    client = User.query.filter_by(
        id=client_id, 
        tenant_id=tenant_id, 
        role='client'
    ).first()
    
    if not client:
        return jsonify({'error': 'Client not found'}), 404
    
    client.is_active = not client.is_active
    db.session.commit()
    
    status = 'activated' if client.is_active else 'deactivated'
    
    return jsonify({
        'message': f'Client {status}',
        'is_active': client.is_active
    })


@admin_bp.route('/clients/<client_id>/payments', methods=['GET'])
@module_required('finance')
def admin_get_client_payments(client_id):
    """Liste des paiements d'un client"""
    tenant_id = g.tenant_id
    
    client = User.query.filter_by(
        id=client_id, 
        tenant_id=tenant_id, 
        role='client'
    ).first()
    
    if not client:
        return jsonify({'error': 'Client not found'}), 404
    
    payments = Payment.query.filter_by(tenant_id=tenant_id, client_id=client_id).order_by(
        Payment.created_at.desc()
    ).all()
    
    return jsonify({
        'payments': [p.to_dict(include_packages=True) for p in payments]
    })
