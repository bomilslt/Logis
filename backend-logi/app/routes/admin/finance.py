"""
Routes Admin - Finance
Statistiques financières et exports
"""

from flask import request, jsonify, Response, g
from flask_jwt_extended import get_jwt_identity
from app import db
from app.routes.admin import admin_bp
from app.models import Payment, Invoice, Package, User, TenantConfig
from app.utils.decorators import admin_required, module_required
from sqlalchemy import func, and_, extract, or_
from datetime import datetime, timedelta, date
import csv
import io


def get_period_dates(period, year, month):
    """
    Calcule les dates de début et fin selon la période
    """
    today = date.today()
    
    if period == 'week':
        # Semaine courante
        start = today - timedelta(days=today.weekday())  # Lundi
        end = start + timedelta(days=6)  # Dimanche
    elif period == 'month':
        start = date(year, month, 1)
        if month == 12:
            end = date(year + 1, 1, 1) - timedelta(days=1)
        else:
            end = date(year, month + 1, 1) - timedelta(days=1)
    elif period == 'quarter':
        quarter_start_month = ((month - 1) // 3) * 3 + 1
        start = date(year, quarter_start_month, 1)
        quarter_end_month = quarter_start_month + 2
        if quarter_end_month == 12:
            end = date(year + 1, 1, 1) - timedelta(days=1)
        else:
            end = date(year, quarter_end_month + 1, 1) - timedelta(days=1)
    else:  # year
        start = date(year, 1, 1)
        end = date(year, 12, 31)
    
    return start, end


def get_previous_period_dates(period, year, month):
    """
    Calcule les dates de la période précédente pour comparaison
    """
    if period == 'week':
        start, end = get_period_dates(period, year, month)
        prev_start = start - timedelta(days=7)
        prev_end = end - timedelta(days=7)
    elif period == 'month':
        if month == 1:
            prev_start, prev_end = get_period_dates(period, year - 1, 12)
        else:
            prev_start, prev_end = get_period_dates(period, year, month - 1)
    elif period == 'quarter':
        quarter = (month - 1) // 3
        if quarter == 0:
            prev_start, prev_end = get_period_dates(period, year - 1, 10)  # Q4 année précédente
        else:
            prev_month = (quarter - 1) * 3 + 1
            prev_start, prev_end = get_period_dates(period, year, prev_month)
    else:  # year
        prev_start, prev_end = get_period_dates(period, year - 1, 1)
    
    return prev_start, prev_end


@admin_bp.route('/finance/stats', methods=['GET'])
@module_required('finance')
def admin_finance_stats():
    """
    Statistiques financières complètes
    
    Query params:
        - period: week, month, quarter, year
        - year: Année (défaut: année courante)
        - month: Mois 1-12 (défaut: mois courant)
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
    period = request.args.get('period', 'month')
    year = request.args.get('year', datetime.now().year, type=int)
    month = request.args.get('month', datetime.now().month, type=int)
    
    # Calculer les dates de la période
    start_date, end_date = get_period_dates(period, year, month)
    prev_start, prev_end = get_previous_period_dates(period, year, month)
    
    # Convertir en datetime pour les requêtes
    start_dt = datetime.combine(start_date, datetime.min.time())
    end_dt = datetime.combine(end_date, datetime.max.time())
    prev_start_dt = datetime.combine(prev_start, datetime.min.time())
    prev_end_dt = datetime.combine(prev_end, datetime.max.time())
    
    # ============================================
    # REVENUS (Paiements confirmés)
    # ============================================
    
    # Période actuelle
    payment_base = db.session.query(func.sum(Payment.amount)).filter(
        Payment.tenant_id == tenant_id,
        Payment.status == 'confirmed',
        Payment.created_at >= start_dt,
        Payment.created_at <= end_dt
    )
    if g.user_role == 'staff':
        from app.models import PackagePayment
        payment_base = payment_base.filter(
            Payment.package_payments.any()
        ).filter(
            ~Payment.package_payments.any(
                PackagePayment.package.has(Package.destination_warehouse_id.notin_(staff_wh_ids))
            )
        )
    revenue_current = payment_base.scalar() or 0
    
    # Période précédente
    payment_prev = db.session.query(func.sum(Payment.amount)).filter(
        Payment.tenant_id == tenant_id,
        Payment.status == 'confirmed',
        Payment.created_at >= prev_start_dt,
        Payment.created_at <= prev_end_dt
    )
    if g.user_role == 'staff':
        from app.models import PackagePayment
        payment_prev = payment_prev.filter(
            Payment.package_payments.any()
        ).filter(
            ~Payment.package_payments.any(
                PackagePayment.package.has(Package.destination_warehouse_id.notin_(staff_wh_ids))
            )
        )
    revenue_prev = payment_prev.scalar() or 0
    
    # Par méthode de paiement
    by_method = {}
    methods = db.session.query(
        Payment.method,
        func.sum(Payment.amount)
    ).filter(
        Payment.tenant_id == tenant_id,
        Payment.status == 'confirmed',
        Payment.created_at >= start_dt,
        Payment.created_at <= end_dt
    )
    if g.user_role == 'staff':
        from app.models import PackagePayment
        methods = methods.filter(
            Payment.package_payments.any()
        ).filter(
            ~Payment.package_payments.any(
                PackagePayment.package.has(Package.destination_warehouse_id.notin_(staff_wh_ids))
            )
        )
    methods = methods.group_by(Payment.method).all()
    
    for method, amount in methods:
        by_method[method] = amount or 0
    
    # ============================================
    # COLIS
    # ============================================
    
    # Période actuelle
    pkg_current_q = Package.query.filter(
        Package.tenant_id == tenant_id,
        Package.created_at >= start_dt,
        Package.created_at <= end_dt
    )
    if package_scope is not None:
        pkg_current_q = pkg_current_q.filter(package_scope)
    packages_current = pkg_current_q.count()
    
    # Période précédente
    pkg_prev_q = Package.query.filter(
        Package.tenant_id == tenant_id,
        Package.created_at >= prev_start_dt,
        Package.created_at <= prev_end_dt
    )
    if package_scope is not None:
        pkg_prev_q = pkg_prev_q.filter(package_scope)
    packages_prev = pkg_prev_q.count()
    
    # Montants des colis
    packages_amounts = db.session.query(
        func.sum(Package.amount),
        func.sum(Package.paid_amount)
    ).filter(
        Package.tenant_id == tenant_id,
        Package.created_at >= start_dt,
        Package.created_at <= end_dt
    )
    if package_scope is not None:
        packages_amounts = packages_amounts.filter(package_scope)
    packages_amounts = packages_amounts.first()
    
    packages_total_amount = packages_amounts[0] or 0
    packages_paid_amount = packages_amounts[1] or 0
    packages_unpaid = packages_total_amount - packages_paid_amount

    # Colis avec client inconnu (placeholder)
    unknown_packages_amounts = db.session.query(
        func.sum(Package.amount),
        func.sum(Package.paid_amount)
    ).join(User, Package.client_id == User.id).filter(
        Package.tenant_id == tenant_id,
        User.is_placeholder == True,
        Package.created_at >= start_dt,
        Package.created_at <= end_dt
    )
    if package_scope is not None:
        unknown_packages_amounts = unknown_packages_amounts.filter(package_scope)
    unknown_packages_amounts = unknown_packages_amounts.first()
    unknown_total_amount = unknown_packages_amounts[0] or 0
    unknown_paid_amount = unknown_packages_amounts[1] or 0
    unknown_unpaid_amount = unknown_total_amount - unknown_paid_amount

    unknown_packages_count = Package.query.join(User, Package.client_id == User.id).filter(
        Package.tenant_id == tenant_id,
        User.is_placeholder == True,
        Package.created_at >= start_dt,
        Package.created_at <= end_dt
    )
    if package_scope is not None:
        unknown_packages_count = unknown_packages_count.filter(package_scope)
    unknown_packages_count = unknown_packages_count.count()
    
    # Par statut
    by_status = {}
    status_counts = db.session.query(
        Package.status,
        func.count(Package.id)
    ).filter(
        Package.tenant_id == tenant_id,
        Package.created_at >= start_dt,
        Package.created_at <= end_dt
    )
    if package_scope is not None:
        status_counts = status_counts.filter(package_scope)
    status_counts = status_counts.group_by(Package.status).all()
    
    for status, count in status_counts:
        by_status[status] = count
    
    # Par mode de transport
    by_transport = {}
    transport_counts = db.session.query(
        Package.transport_mode,
        func.count(Package.id),
        func.sum(Package.amount)
    ).filter(
        Package.tenant_id == tenant_id,
        Package.created_at >= start_dt,
        Package.created_at <= end_dt
    )
    if package_scope is not None:
        transport_counts = transport_counts.filter(package_scope)
    transport_counts = transport_counts.group_by(Package.transport_mode).all()
    
    for mode, count, amount in transport_counts:
        by_transport[mode] = {'count': count, 'revenue': amount or 0}
    
    # ============================================
    # CLIENTS
    # ============================================
    
    # Nouveaux clients période actuelle
    new_clients_current = User.query.filter(
        User.tenant_id == tenant_id,
        User.role == 'client',
        User.created_at >= start_dt,
        User.created_at <= end_dt
    ).count()

    # Clients inconnus (placeholder) période actuelle
    unknown_clients_current = User.query.filter(
        User.tenant_id == tenant_id,
        User.role == 'client',
        User.is_placeholder == True,
        User.created_at >= start_dt,
        User.created_at <= end_dt
    ).count()
    
    # Nouveaux clients période précédente
    new_clients_prev = User.query.filter(
        User.tenant_id == tenant_id,
        User.role == 'client',
        User.created_at >= prev_start_dt,
        User.created_at <= prev_end_dt
    ).count()

    unknown_clients_prev = User.query.filter(
        User.tenant_id == tenant_id,
        User.role == 'client',
        User.is_placeholder == True,
        User.created_at >= prev_start_dt,
        User.created_at <= prev_end_dt
    ).count()
    
    # ============================================
    # TAUX DE LIVRAISON
    # ============================================
    
    delivered_current = Package.query.filter(
        Package.tenant_id == tenant_id,
        Package.status == 'delivered',
        Package.delivered_at >= start_dt,
        Package.delivered_at <= end_dt
    ).count()
    
    total_eligible = Package.query.filter(
        Package.tenant_id == tenant_id,
        Package.status.in_(['delivered', 'arrived']),
        Package.created_at >= start_dt,
        Package.created_at <= end_dt
    ).count()
    
    delivery_rate = round((delivered_current / total_eligible * 100), 1) if total_eligible > 0 else 0
    
    # Période précédente
    delivered_prev = Package.query.filter(
        Package.tenant_id == tenant_id,
        Package.status == 'delivered',
        Package.delivered_at >= prev_start_dt,
        Package.delivered_at <= prev_end_dt
    ).count()
    
    total_eligible_prev = Package.query.filter(
        Package.tenant_id == tenant_id,
        Package.status.in_(['delivered', 'arrived']),
        Package.created_at >= prev_start_dt,
        Package.created_at <= prev_end_dt
    ).count()
    
    delivery_rate_prev = round((delivered_prev / total_eligible_prev * 100), 1) if total_eligible_prev > 0 else 0
    
    # ============================================
    # REVENUS PAR JOUR (pour graphiques)
    # ============================================
    
    revenue_by_day = []
    current = start_date
    while current <= end_date:
        day_start = datetime.combine(current, datetime.min.time())
        day_end = datetime.combine(current, datetime.max.time())
        
        day_revenue_q = db.session.query(func.sum(Payment.amount)).filter(
            Payment.tenant_id == tenant_id,
            Payment.status == 'confirmed',
            Payment.created_at >= day_start,
            Payment.created_at <= day_end
        )
        if g.user_role == 'staff':
            from app.models import PackagePayment
            day_revenue_q = day_revenue_q.filter(
                Payment.package_payments.any()
            ).filter(
                ~Payment.package_payments.any(
                    PackagePayment.package.has(Package.destination_warehouse_id.notin_(staff_wh_ids))
                )
            )
        day_revenue = day_revenue_q.scalar() or 0
        
        day_packages_q = Package.query.filter(
            Package.tenant_id == tenant_id,
            Package.created_at >= day_start,
            Package.created_at <= day_end
        )
        if package_scope is not None:
            day_packages_q = day_packages_q.filter(package_scope)
        day_packages = day_packages_q.count()
        
        revenue_by_day.append({
            'date': current.isoformat(),
            'revenue': day_revenue,
            'packages': day_packages
        })
        
        current += timedelta(days=1)
    
    # ============================================
    # TOP CLIENTS
    # ============================================
    
    top_clients_query = db.session.query(
        User.id,
        User.first_name,
        User.last_name,
        func.count(Package.id).label('packages_count'),
        func.sum(Package.amount).label('total_amount'),
        func.sum(Package.paid_amount).label('paid_amount')
    ).join(Package, Package.client_id == User.id).filter(
        Package.tenant_id == tenant_id,
        Package.created_at >= start_dt,
        Package.created_at <= end_dt
    )
    if package_scope is not None:
        top_clients_query = top_clients_query.filter(package_scope)
    top_clients_query = top_clients_query.group_by(User.id, User.first_name, User.last_name).order_by(
        func.sum(Package.amount).desc()
    ).limit(10).all()
    
    top_clients = [{
        'id': c[0],
        'name': f"{c[1]} {c[2]}",  # Construire full_name manuellement
        'packages': c[3],
        'revenue': c[4] or 0,
        'paid': c[5] or 0
    } for c in top_clients_query]
    
    # ============================================
    # PAR DESTINATION
    # ============================================
    
    by_destination = db.session.query(
        Package.destination_city,
        func.count(Package.id),
        func.sum(Package.amount)
    ).filter(
        Package.tenant_id == tenant_id,
        Package.created_at >= start_dt,
        Package.created_at <= end_dt
    )
    if package_scope is not None:
        by_destination = by_destination.filter(package_scope)
    by_destination = by_destination.group_by(Package.destination_city).all()
    
    destinations = [{
        'city': d[0] or 'Non spécifié',
        'packages': d[1],
        'revenue': d[2] or 0
    } for d in by_destination if d[0]]
    
    # ============================================
    # DÉLAIS DE LIVRAISON (par mode de transport)
    # ============================================
    from app.models import Departure
    
    delivery_times = {
        'air': [0, 0, 0, 0, 0],  # < 7j, 7-14j, 14-21j, 21-30j, > 30j
        'sea': [0, 0, 0, 0, 0]
    }
    
    # Colis livrés avec date de création et date de livraison
    delivered_packages = Package.query.filter(
        Package.tenant_id == tenant_id,
        Package.status == 'delivered',
        Package.delivered_at.isnot(None),
        Package.delivered_at >= start_dt,
        Package.delivered_at <= end_dt
    )
    if package_scope is not None:
        delivered_packages = delivered_packages.filter(package_scope)
    delivered_packages = delivered_packages.all()
    
    for pkg in delivered_packages:
        if pkg.delivered_at and pkg.created_at:
            days = (pkg.delivered_at - pkg.created_at).days
            mode = 'sea' if pkg.transport_mode == 'sea' else 'air'
            
            if days < 7:
                delivery_times[mode][0] += 1
            elif days < 14:
                delivery_times[mode][1] += 1
            elif days < 21:
                delivery_times[mode][2] += 1
            elif days < 30:
                delivery_times[mode][3] += 1
            else:
                delivery_times[mode][4] += 1
    
    # ============================================
    # PERFORMANCE PAR ENTREPÔT
    # ============================================
    from app.models import TenantConfig
    
    warehouse_performance = []
    
    # Récupérer les entrepôts depuis la config
    config = TenantConfig.query.filter_by(tenant_id=tenant_id).first()
    warehouses = config.config_data.get('warehouses', []) if config and config.config_data else []
    
    for wh in warehouses:
        wh_name = wh.get('name', '')
        wh_country = wh.get('country', '')
        
        # Colis reçus dans cet entrepôt (basé sur origin_city ou warehouse_id)
        received = Package.query.filter(
            Package.tenant_id == tenant_id,
            Package.origin_city == wh_country,
            Package.created_at >= start_dt,
            Package.created_at <= end_dt
        ).count()
        
        # Colis expédiés (passés en transit)
        shipped = Package.query.filter(
            Package.tenant_id == tenant_id,
            Package.origin_city == wh_country,
            Package.status.in_(['transit', 'customs', 'arrived', 'delivered']),
            Package.created_at >= start_dt,
            Package.created_at <= end_dt
        ).count()
        
        # Délai moyen (jours entre création et passage en transit)
        avg_days_query = db.session.query(
            func.avg(func.julianday(Package.updated_at) - func.julianday(Package.created_at))
        ).filter(
            Package.tenant_id == tenant_id,
            Package.origin_city == wh_country,
            Package.status.in_(['transit', 'customs', 'arrived', 'delivered']),
            Package.created_at >= start_dt,
            Package.created_at <= end_dt
        ).scalar()
        
        avg_days = round(avg_days_query or 0, 1)
        
        if received > 0:
            warehouse_performance.append({
                'name': wh_name,
                'country': wh_country,
                'received': received,
                'shipped': shipped,
                'avgDays': avg_days
            })
    
    # ============================================
    # COMPARAISON MENSUELLE (12 derniers mois)
    # ============================================
    
    monthly_comparison = []
    month_names = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc']
    
    for i in range(11, -1, -1):
        # Calculer le mois
        m = month - i
        y = year
        while m <= 0:
            m += 12
            y -= 1
        
        m_start = datetime(y, m, 1)
        if m == 12:
            m_end = datetime(y + 1, 1, 1) - timedelta(seconds=1)
        else:
            m_end = datetime(y, m + 1, 1) - timedelta(seconds=1)
        
        # Revenus du mois
        m_revenue = db.session.query(func.sum(Payment.amount)).filter(
            Payment.tenant_id == tenant_id,
            Payment.status == 'confirmed',
            Payment.created_at >= m_start,
            Payment.created_at <= m_end
        ).scalar() or 0
        
        # Colis du mois
        m_packages = Package.query.filter(
            Package.tenant_id == tenant_id,
            Package.created_at >= m_start,
            Package.created_at <= m_end
        ).count()
        
        # Nouveaux clients du mois
        m_clients = User.query.filter(
            User.tenant_id == tenant_id,
            User.role == 'client',
            User.created_at >= m_start,
            User.created_at <= m_end
        ).count()
        
        monthly_comparison.append({
            'month': f"{month_names[m-1]} {y}",
            'revenue': m_revenue,
            'packages': m_packages,
            'clients': m_clients
        })
    
    return jsonify({
        'period': {
            'type': period,
            'start': start_date.isoformat(),
            'end': end_date.isoformat(),
            'year': year,
            'month': month
        },
        'revenue': {
            'total': revenue_current,
            'previous': revenue_prev,
            'by_method': by_method
        },
        'packages': {
            'count': packages_current,
            'count_previous': packages_prev,
            'total_amount': packages_total_amount,
            'paid_amount': packages_paid_amount,
            'unpaid_amount': packages_unpaid,
            'by_status': by_status,
            'by_transport': by_transport,
            'unknown': {
                'count': unknown_packages_count,
                'total_amount': unknown_total_amount,
                'paid_amount': unknown_paid_amount,
                'unpaid_amount': unknown_unpaid_amount
            }
        },
        'clients': {
            'new': new_clients_current,
            'new_previous': new_clients_prev,
            'unknown': unknown_clients_current,
            'unknown_previous': unknown_clients_prev
        },
        'delivery': {
            'rate': delivery_rate,
            'rate_previous': delivery_rate_prev,
            'delivered': delivered_current,
            'total_eligible': total_eligible
        },
        'daily': revenue_by_day,
        'top_clients': top_clients,
        'by_destination': destinations,
        'delivery_times': delivery_times,
        'warehouse_performance': warehouse_performance,
        'monthly_comparison': monthly_comparison
    })


@admin_bp.route('/finance/transactions', methods=['GET'])
@module_required('finance')
def admin_finance_transactions():
    """
    Liste des transactions (paiements)
    
    Query params:
        - date_from, date_to: Période
        - method: Méthode de paiement
        - page, per_page: Pagination
    """
    tenant_id = g.tenant_id
    
    date_from = request.args.get('date_from')
    date_to = request.args.get('date_to')
    method = request.args.get('method')
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 50, type=int)
    
    query = Payment.query.filter_by(tenant_id=tenant_id)
    
    if date_from:
        query = query.filter(Payment.created_at >= date_from)
    
    if date_to:
        query = query.filter(Payment.created_at <= date_to)
    
    if method:
        query = query.filter_by(method=method)
    
    query = query.order_by(Payment.created_at.desc())
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)
    
    # Calculer le total
    total_amount = query.with_entities(func.sum(Payment.amount)).scalar() or 0
    
    return jsonify({
        'transactions': [p.to_dict(include_packages=True) for p in pagination.items],
        'total': pagination.total,
        'total_amount': total_amount,
        'pages': pagination.pages,
        'current_page': page
    })


@admin_bp.route('/finance/export', methods=['GET'])
@module_required('finance')
def admin_finance_export():
    """
    Exporter les données financières en CSV
    
    Query params:
        - type: payments, invoices, packages
        - date_from, date_to: Période
        - format: csv (défaut)
    """
    tenant_id = g.tenant_id
    
    export_type = request.args.get('type', 'payments')
    date_from = request.args.get('date_from')
    date_to = request.args.get('date_to')
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    if export_type == 'payments':
        # Export des paiements
        writer.writerow(['Date', 'Client', 'Montant', 'Devise', 'Méthode', 'Référence', 'Statut'])
        
        query = Payment.query.filter_by(tenant_id=tenant_id)
        if date_from:
            query = query.filter(Payment.created_at >= date_from)
        if date_to:
            query = query.filter(Payment.created_at <= date_to)
        
        for payment in query.order_by(Payment.created_at.desc()).all():
            writer.writerow([
                payment.created_at.strftime('%Y-%m-%d %H:%M'),
                payment.client.full_name if payment.client else '',
                payment.amount,
                payment.currency,
                payment.method,
                payment.reference or '',
                payment.status
            ])
    
    elif export_type == 'invoices':
        # Export des factures
        writer.writerow(['Numéro', 'Date', 'Client', 'Description', 'Montant', 'Devise', 'Statut', 'Payé le'])
        
        query = Invoice.query.filter_by(tenant_id=tenant_id)
        if date_from:
            query = query.filter(Invoice.created_at >= date_from)
        if date_to:
            query = query.filter(Invoice.created_at <= date_to)
        
        for invoice in query.order_by(Invoice.created_at.desc()).all():
            writer.writerow([
                invoice.invoice_number,
                invoice.issue_date.strftime('%Y-%m-%d') if invoice.issue_date else '',
                invoice.client.full_name if invoice.client else '',
                invoice.description,
                invoice.amount,
                invoice.currency,
                invoice.status,
                invoice.paid_at.strftime('%Y-%m-%d') if invoice.paid_at else ''
            ])
    
    elif export_type == 'packages':
        # Export des colis avec montants
        writer.writerow(['Tracking', 'Client', 'Description', 'Transport', 'Montant', 'Payé', 'Reste', 'Statut', 'Date'])
        
        query = Package.query.filter_by(tenant_id=tenant_id)
        if date_from:
            query = query.filter(Package.created_at >= date_from)
        if date_to:
            query = query.filter(Package.created_at <= date_to)
        
        for package in query.order_by(Package.created_at.desc()).all():
            writer.writerow([
                package.tracking_number,
                package.client.full_name if package.client else '',
                package.description,
                package.transport_mode,
                package.amount or 0,
                package.paid_amount or 0,
                package.remaining_amount,
                package.status,
                package.created_at.strftime('%Y-%m-%d')
            ])
    
    output.seek(0)
    
    return Response(
        output.getvalue(),
        mimetype='text/csv',
        headers={
            'Content-Disposition': f'attachment; filename={export_type}_{datetime.utcnow().strftime("%Y%m%d")}.csv'
        }
    )
