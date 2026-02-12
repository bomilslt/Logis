"""
Routes Admin - Dashboard
Statistiques et données du tableau de bord admin
"""

from flask import request, jsonify, g
from flask_jwt_extended import get_jwt_identity
from app.routes.admin import admin_bp
from app.models import Package, User, Payment, Departure
from app.utils.decorators import admin_required
from datetime import datetime, timedelta
from sqlalchemy import func, or_


@admin_bp.route('/dashboard/stats', methods=['GET'])
@admin_required
def get_dashboard_stats():
    """
    Statistiques générales du dashboard
    
    Returns:
        - packages: Compteurs par statut
        - clients: Nombre total et nouveaux ce mois
        - revenue: Revenus du mois, total, en attente
        - today: Stats du jour
        - upcoming_departures: Prochains départs
    """
    tenant_id = g.tenant_id
    staff_wh_ids = getattr(g, 'staff_warehouse_ids', None) or ([] if not getattr(g, 'staff_warehouse_id', None) else [getattr(g, 'staff_warehouse_id')])
    package_scope = None
    if g.user_role == 'staff':
        if not staff_wh_ids:
            return jsonify({'error': 'Accès refusé'}), 403
        package_scope = or_(
            Package.origin_warehouse_id.in_(staff_wh_ids),
            Package.destination_warehouse_id.in_(staff_wh_ids),
        )
    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    # Mois précédent
    if month_start.month == 1:
        prev_month_start = month_start.replace(year=month_start.year - 1, month=12)
    else:
        prev_month_start = month_start.replace(month=month_start.month - 1)
    prev_month_end = month_start - timedelta(seconds=1)
    
    # Stats colis
    base_pkg = Package.query.filter_by(tenant_id=tenant_id)
    if package_scope is not None:
        base_pkg = base_pkg.filter(package_scope)
    packages_stats = {
        'total': base_pkg.count(),
        'pending': base_pkg.filter(Package.status == 'pending').count(),
        'received': base_pkg.filter(Package.status == 'received').count(),
        'in_transit': base_pkg.filter(Package.status == 'in_transit').count(),
        'arrived_port': base_pkg.filter(Package.status == 'arrived_port').count(),
        'customs': base_pkg.filter(Package.status == 'customs').count(),
        'out_for_delivery': base_pkg.filter(Package.status == 'out_for_delivery').count(),
        'delivered': base_pkg.filter(Package.status == 'delivered').count(),
        'this_month': base_pkg.filter(Package.created_at >= month_start).count()
    }
    
    # Stats clients
    clients_stats = {
        'total': User.query.filter_by(tenant_id=tenant_id, role='client').count(),
        'active': User.query.filter_by(tenant_id=tenant_id, role='client', is_active=True).count(),
        'new_this_month': User.query.filter_by(tenant_id=tenant_id, role='client').filter(User.created_at >= month_start).count()
    }
    
    # Stats revenus
    payments_confirmed = Payment.query.filter_by(tenant_id=tenant_id, status='confirmed')
    payments_pending = Payment.query.filter_by(tenant_id=tenant_id, status='pending')
    if g.user_role == 'staff':
        from app.models import PackagePayment
        payments_confirmed = payments_confirmed.filter(
            Payment.package_payments.any()
        ).filter(
            ~Payment.package_payments.any(
                PackagePayment.package.has(Package.destination_warehouse_id.notin_(staff_wh_ids))
            )
        )
        payments_pending = payments_pending.filter(
            Payment.package_payments.any()
        ).filter(
            ~Payment.package_payments.any(
                PackagePayment.package.has(Package.destination_warehouse_id.notin_(staff_wh_ids))
            )
        )
    
    month_revenue = payments_confirmed.filter(
        Payment.created_at >= month_start
    ).with_entities(func.sum(Payment.amount)).scalar() or 0
    
    prev_month_revenue = payments_confirmed.filter(
        Payment.created_at >= prev_month_start,
        Payment.created_at <= prev_month_end
    ).with_entities(func.sum(Payment.amount)).scalar() or 0
    
    pending_revenue = payments_pending.with_entities(func.sum(Payment.amount)).scalar() or 0
    
    revenue_stats = {
        'month': float(month_revenue),
        'prev_month': float(prev_month_revenue),
        'pending': float(pending_revenue),
        'total': float(payments_confirmed.with_entities(func.sum(Payment.amount)).scalar() or 0)
    }
    
    # Stats aujourd'hui
    today_received = Package.query.filter_by(tenant_id=tenant_id, status='received').filter(Package.created_at >= today_start)
    today_updates = Package.query.filter_by(tenant_id=tenant_id).filter(Package.created_at >= today_start)
    today_deliveries = Package.query.filter_by(tenant_id=tenant_id, status='delivered').filter(Package.updated_at >= today_start)
    if package_scope is not None:
        today_received = today_received.filter(package_scope)
        today_updates = today_updates.filter(package_scope)
        today_deliveries = today_deliveries.filter(package_scope)
    today_stats = {
        'received': today_received.count(),
        'status_updates': today_updates.count(),
        'deliveries': today_deliveries.count()
    }
    
    # Prochains départs
    upcoming_departures = Departure.query.filter_by(
        tenant_id=tenant_id,
        status='scheduled'
    ).filter(
        Departure.departure_date >= now.date()
    ).order_by(Departure.departure_date).limit(3).all()
    
    return jsonify({
        'packages': packages_stats,
        'clients': clients_stats,
        'revenue': revenue_stats,
        'today': today_stats,
        'upcoming_departures': [d.to_dict() for d in upcoming_departures]
    })


@admin_bp.route('/dashboard/recent-packages', methods=['GET'])
@admin_required
def get_recent_packages():
    """
    Derniers colis enregistrés
    
    Query params:
        - limit: Nombre de résultats (défaut: 5)
    """
    tenant_id = g.tenant_id
    limit = request.args.get('limit', 5, type=int)
    
    query = Package.query.filter_by(tenant_id=tenant_id)
    if g.user_role == 'staff':
        staff_wh_ids = getattr(g, 'staff_warehouse_ids', None) or ([] if not getattr(g, 'staff_warehouse_id', None) else [getattr(g, 'staff_warehouse_id')])
        if not staff_wh_ids:
            return jsonify({'packages': []})
        query = query.filter(or_(
            Package.origin_warehouse_id.in_(staff_wh_ids),
            Package.destination_warehouse_id.in_(staff_wh_ids),
        ))

    packages = query.order_by(
        Package.created_at.desc()
    ).limit(limit).all()
    
    # Formater pour le dashboard
    result = []
    for p in packages:
        client = User.query.get(p.client_id)
        result.append({
            'id': p.id,
            'tracking': p.tracking_number,
            'client': f"{client.first_name} {client.last_name}" if client else 'N/A',
            'amount': float(p.amount or 0),
            'status': p.status
        })
    
    return jsonify({
        'packages': result
    })


@admin_bp.route('/dashboard/activity', methods=['GET'])
@admin_required
def get_recent_activity():
    """
    Activité récente (dernières actions)
    
    Query params:
        - limit: Nombre de résultats (défaut: 10)
    """
    tenant_id = g.tenant_id
    limit = request.args.get('limit', 10, type=int)
    
    activities = []
    
    # Derniers colis créés
    pkg_query = Package.query.filter_by(tenant_id=tenant_id)
    pay_query = Payment.query.filter_by(tenant_id=tenant_id)
    if g.user_role == 'staff':
        staff_wh_ids = getattr(g, 'staff_warehouse_ids', None) or ([] if not getattr(g, 'staff_warehouse_id', None) else [getattr(g, 'staff_warehouse_id')])
        if not staff_wh_ids:
            return jsonify({'activity': []})
        pkg_query = pkg_query.filter(or_(
            Package.origin_warehouse_id.in_(staff_wh_ids),
            Package.destination_warehouse_id.in_(staff_wh_ids),
        ))
        from app.models import PackagePayment
        pay_query = pay_query.filter(
            Payment.package_payments.any()
        ).filter(
            ~Payment.package_payments.any(
                PackagePayment.package.has(Package.destination_warehouse_id.notin_(staff_wh_ids))
            )
        )

    recent_packages = pkg_query.order_by(
        Package.created_at.desc()
    ).limit(5).all()
    
    for pkg in recent_packages:
        activities.append({
            'type': 'receive',
            'message': f'Nouveau colis {pkg.tracking_number}',
            'time': _format_time_ago(pkg.created_at),
            'timestamp': (pkg.created_at.isoformat() + 'Z') if pkg.created_at else None
        })
    
    # Derniers paiements
    recent_payments = pay_query.order_by(
        Payment.created_at.desc()
    ).limit(5).all()
    
    for pay in recent_payments:
        activities.append({
            'type': 'payment',
            'message': f'Paiement de {pay.amount:,.0f} {pay.currency}',
            'time': _format_time_ago(pay.created_at),
            'timestamp': (pay.created_at.isoformat() + 'Z') if pay.created_at else None
        })
    
    # Nouveaux clients
    recent_clients = User.query.filter_by(tenant_id=tenant_id, role='client').order_by(
        User.created_at.desc()
    ).limit(3).all()
    
    for client in recent_clients:
        activities.append({
            'type': 'client',
            'message': f'Nouveau client: {client.first_name} {client.last_name}',
            'time': _format_time_ago(client.created_at),
            'timestamp': (client.created_at.isoformat() + 'Z') if client.created_at else None
        })
    
    # Trier par date et limiter
    activities.sort(key=lambda x: x['timestamp'], reverse=True)
    
    return jsonify({
        'activity': activities[:limit]
    })


def _format_time_ago(dt):
    """Formate une date en 'il y a X'"""
    if not dt:
        return ''

    now = datetime.utcnow()
    # Normaliser les datetimes naïves comme UTC (SQLite retourne souvent des naïves)
    if getattr(dt, 'tzinfo', None) is not None:
        dt = dt.replace(tzinfo=None)

    # Empêcher les écarts négatifs (décalage horloge / timezone)
    seconds = max(0, (now - dt).total_seconds())
    
    if seconds < 60:
        return "A l'instant"
    elif seconds < 3600:
        mins = int(seconds / 60)
        return f"Il y a {mins} min"
    elif seconds < 86400:
        hours = int(seconds / 3600)
        return f"Il y a {hours}h"
    elif seconds < 604800:
        days = int(seconds / 86400)
        return f"Il y a {days}j"
    else:
        return dt.strftime('%d/%m/%Y')
