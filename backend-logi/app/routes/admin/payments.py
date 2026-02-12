"""
Routes Admin - Gestion des paiements
Enregistrement et suivi des paiements clients
"""

from flask import request, jsonify, g
from flask_jwt_extended import get_jwt_identity
from app import db
from app.routes.admin import admin_bp
from app.models import Payment, PackagePayment, Package, User
from app.utils.decorators import admin_required, permission_required, admin_or_permission_required, module_required
from app.utils.helpers import can_manage_payments
from sqlalchemy import func


def _apply_staff_destination_payment_scope(query):
    if g.user_role != 'staff':
        return query
    staff_wh_ids = getattr(g, 'staff_warehouse_ids', None) or ([] if not g.staff_warehouse_id else [g.staff_warehouse_id])
    if not staff_wh_ids:
        return query.filter(db.text('1=0'))
    return query.join(PackagePayment, Payment.id == PackagePayment.payment_id).join(
        Package, PackagePayment.package_id == Package.id
    ).filter(
        Package.destination_warehouse_id.in_(staff_wh_ids)
    ).distinct()


def _staff_can_manage_payment(payment: Payment) -> bool:
    if g.user_role != 'staff':
        return True
    staff_wh_ids = getattr(g, 'staff_warehouse_ids', None) or ([] if not g.staff_warehouse_id else [g.staff_warehouse_id])
    if not staff_wh_ids:
        return False
    pkg_payments = payment.package_payments.all()
    if not pkg_payments:
        return False
    for pp in pkg_payments:
        if not pp.package or pp.package.destination_warehouse_id not in staff_wh_ids:
            return False
    return True


@admin_bp.route('/payments', methods=['GET'])
@module_required('finance')
def admin_get_payments():
    """
    Liste des paiements avec filtres
    
    Query params:
        - client_id: Filtrer par client
        - method: Filtrer par méthode (cash, mobile_money, etc.)
        - search: Recherche par nom client ou référence
        - date_from, date_to: Période
        - page, per_page: Pagination
    """
    tenant_id = g.tenant_id
    
    client_id = request.args.get('client_id')
    method = request.args.get('method')
    search = request.args.get('search')
    date_from = request.args.get('date_from')
    date_to = request.args.get('date_to')
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    
    query = Payment.query.filter_by(tenant_id=tenant_id)
    query = _apply_staff_destination_payment_scope(query)
    
    if client_id:
        query = query.filter_by(client_id=client_id)
    
    if method:
        query = query.filter_by(method=method)
    
    if search:
        search_term = f'%{search}%'
        query = query.outerjoin(User, Payment.client_id == User.id).filter(
            db.or_(
                User.full_name.ilike(search_term),
                User.phone.ilike(search_term),
                Payment.reference.ilike(search_term),
                Payment.payer_name.ilike(search_term),
                Payment.payer_phone.ilike(search_term)
            )
        )
    
    if date_from:
        from datetime import datetime
        try:
            date_from_dt = datetime.strptime(date_from, '%Y-%m-%d')
            query = query.filter(Payment.created_at >= date_from_dt)
        except ValueError:
            pass
    
    if date_to:
        from datetime import datetime, timedelta
        try:
            date_to_dt = datetime.strptime(date_to, '%Y-%m-%d') + timedelta(days=1)
            query = query.filter(Payment.created_at < date_to_dt)
        except ValueError:
            pass
    
    query = query.order_by(Payment.created_at.desc())
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)
    
    # Récupérer les stats en même temps
    from datetime import datetime, timedelta
    today = datetime.utcnow().date()
    week_ago = today - timedelta(days=7)
    month_start = today.replace(day=1)
    
    confirmed_query = Payment.query.filter_by(tenant_id=tenant_id, status='confirmed')
    confirmed_query = _apply_staff_destination_payment_scope(confirmed_query)
    
    stats = {
        'today': confirmed_query.filter(func.date(Payment.created_at) == today).with_entities(func.sum(Payment.amount)).scalar() or 0,
        'week': confirmed_query.filter(Payment.created_at >= datetime.combine(week_ago, datetime.min.time())).with_entities(func.sum(Payment.amount)).scalar() or 0,
        'month': confirmed_query.filter(Payment.created_at >= datetime.combine(month_start, datetime.min.time())).with_entities(func.sum(Payment.amount)).scalar() or 0,
        'pending': Payment.query.filter_by(tenant_id=tenant_id, status='pending').with_entities(func.sum(Payment.amount)).scalar() or 0
    }
    
    return jsonify({
        'payments': [p.to_dict(include_packages=True) for p in pagination.items],
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': page,
        'stats': stats
    })


@admin_bp.route('/payments', methods=['POST'])
@module_required('finance')
def admin_create_payment():
    """
    Enregistrer un paiement
    
    Body:
        - client_id: ID du client (optionnel si payer_name fourni)
        - payer_name: Nom du payeur externe (si pas client)
        - payer_phone: Téléphone du payeur externe
        - amount: Montant (requis)
        - currency: Devise (défaut: XAF)
        - method: Méthode (cash, mobile_money, bank_transfer, card)
        - reference: Référence externe
        - package_ids: Liste des colis à associer (optionnel, seulement si client_id)
        - notes: Notes
    """
    tenant_id = g.tenant_id
    user_id = get_jwt_identity()
    data = request.get_json()
    
    # Validation: soit client_id soit payer_name
    client_id = data.get('client_id')
    payer_name = data.get('payer_name')
    
    if not client_id and not payer_name:
        return jsonify({'error': 'Client ID or payer name is required'}), 400
    
    if not data.get('amount') or data['amount'] <= 0:
        return jsonify({'error': 'Valid amount is required'}), 400
    
    if not data.get('method'):
        return jsonify({'error': 'Payment method is required'}), 400
    
    # Vérifier que le client existe si client_id fourni
    client = None
    if client_id:
        client = User.query.filter_by(
            id=client_id, 
            tenant_id=tenant_id
        ).first()
        
        if not client:
            return jsonify({'error': 'Client not found'}), 404
    
    # Créer le paiement
    payment = Payment(
        tenant_id=tenant_id,
        client_id=client_id if client else None,
        payer_name=payer_name if not client else None,
        payer_phone=data.get('payer_phone') if not client else None,
        amount=data['amount'],
        currency=data.get('currency', 'XAF'),
        method=data['method'],
        reference=data.get('reference'),
        notes=data.get('notes'),
        status='confirmed',
        created_by=user_id
    )
    
    db.session.add(payment)
    db.session.flush()  # Pour obtenir l'ID
    
    # Associer aux colis si spécifiés (seulement pour les clients)
    package_ids = data.get('package_ids', [])
    remaining_amount = data['amount']

    if g.user_role == 'staff':
        staff_wh_ids = getattr(g, 'staff_warehouse_ids', None) or ([] if not g.staff_warehouse_id else [g.staff_warehouse_id])
        if not staff_wh_ids:
            return jsonify({'error': 'Accès refusé'}), 403
        if not client_id or not package_ids:
            return jsonify({'error': 'package_ids and client_id are required for staff payments'}), 400
    
    if package_ids and client_id:
        packages_query = Package.query.filter(
            Package.id.in_(package_ids),
            Package.tenant_id == tenant_id,
            Package.client_id == client_id
        )

        if g.user_role == 'staff':
            packages_query = packages_query.filter(Package.destination_warehouse_id.in_(staff_wh_ids))

        packages = packages_query.all()

        if g.user_role == 'staff':
            requested = set(package_ids)
            found = set([p.id for p in packages])
            if requested != found:
                return jsonify({'error': 'Accès refusé'}), 403
        
        for package in packages:
            if remaining_amount <= 0:
                break
            
            # Calculer le montant à allouer
            package_remaining = package.remaining_amount
            allocated = min(remaining_amount, package_remaining)
            
            if allocated > 0:
                # Créer la liaison
                pkg_payment = PackagePayment(
                    payment_id=payment.id,
                    package_id=package.id,
                    amount=allocated
                )
                db.session.add(pkg_payment)
                
                # Mettre à jour le colis
                package.paid_amount = (package.paid_amount or 0) + allocated
                remaining_amount -= allocated
    
    db.session.commit()
    
    return jsonify({
        'message': 'Payment recorded',
        'payment': payment.to_dict(include_packages=True)
    }), 201


@admin_bp.route('/payments/<payment_id>', methods=['GET'])
@module_required('finance')
def admin_get_payment(payment_id):
    """Détails d'un paiement"""
    tenant_id = g.tenant_id
    
    payment = Payment.query.filter_by(
        id=payment_id, 
        tenant_id=tenant_id
    ).first()
    
    if not payment:
        return jsonify({'error': 'Payment not found'}), 404

    if g.user_role == 'staff' and not _staff_can_manage_payment(payment):
        return jsonify({'error': 'Accès refusé'}), 403
    
    return jsonify({
        'payment': payment.to_dict(include_packages=True)
    })


@admin_bp.route('/payments/<payment_id>/cancel', methods=['POST'])
@module_required('finance')
def admin_cancel_payment(payment_id):
    """
    Annuler un paiement
    Remet à jour les montants payés des colis associés
    """
    tenant_id = g.tenant_id
    
    payment = Payment.query.filter_by(
        id=payment_id, 
        tenant_id=tenant_id
    ).first()
    
    if not payment:
        return jsonify({'error': 'Payment not found'}), 404
    
    if payment.status == 'cancelled':
        return jsonify({'error': 'Payment already cancelled'}), 400
    
    # Annuler les allocations aux colis
    for pkg_payment in payment.package_payments.all():
        package = pkg_payment.package
        if package:
            package.paid_amount = max(0, (package.paid_amount or 0) - (pkg_payment.amount or 0))
    
    payment.status = 'cancelled'
    db.session.commit()
    
    return jsonify({
        'message': 'Payment cancelled',
        'payment': payment.to_dict()
    })


@admin_bp.route('/payments/<payment_id>/confirm', methods=['POST'])
@module_required('finance')
def admin_confirm_payment(payment_id):
    """
    Confirmer un paiement en attente
    Change le statut de 'pending' à 'confirmed'
    """
    tenant_id = g.tenant_id
    
    payment = Payment.query.filter_by(
        id=payment_id, 
        tenant_id=tenant_id
    ).first()
    
    if not payment:
        return jsonify({'error': 'Payment not found'}), 404
    
    if payment.status == 'confirmed':
        return jsonify({'error': 'Payment already confirmed'}), 400
    
    if payment.status == 'cancelled':
        return jsonify({'error': 'Cannot confirm cancelled payment'}), 400
    
    payment.status = 'confirmed'
    db.session.commit()
    
    return jsonify({
        'message': 'Payment confirmed',
        'payment': payment.to_dict()
    })


@admin_bp.route('/payments/stats', methods=['GET'])
@module_required('finance')
def admin_payments_stats():
    """
    Statistiques des paiements
    Retourne les totaux par période pour les stats du frontend
    """
    tenant_id = g.tenant_id
    
    from datetime import datetime, timedelta
    
    today = datetime.utcnow().date()
    week_ago = today - timedelta(days=7)
    month_start = today.replace(day=1)
    
    # Paiements confirmés
    confirmed_query = Payment.query.filter_by(tenant_id=tenant_id, status='confirmed')
    
    # Stats
    today_total = confirmed_query.filter(
        func.date(Payment.created_at) == today
    ).with_entities(func.sum(Payment.amount)).scalar() or 0
    
    week_total = confirmed_query.filter(
        Payment.created_at >= datetime.combine(week_ago, datetime.min.time())
    ).with_entities(func.sum(Payment.amount)).scalar() or 0
    
    month_total = confirmed_query.filter(
        Payment.created_at >= datetime.combine(month_start, datetime.min.time())
    ).with_entities(func.sum(Payment.amount)).scalar() or 0
    
    pending_query = Payment.query.filter_by(
        tenant_id=tenant_id,
        status='pending'
    )
    pending_query = _apply_staff_destination_payment_scope(pending_query)
    pending_total = pending_query.with_entities(func.sum(Payment.amount)).scalar() or 0
    
    return jsonify({
        'stats': {
            'today': today_total,
            'week': week_total,
            'month': month_total,
            'pending': pending_total
        }
    })
