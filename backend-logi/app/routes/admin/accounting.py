"""
Routes Admin - Comptabilité
API complète pour le module comptable (entrées, sorties, salaires, charges)
"""

from flask import request, jsonify, g
from flask_jwt_extended import get_jwt_identity
from app import db
from app.routes.admin import admin_bp
from app.models import Payment, DepartureExpense, Salary, Expense, OtherIncome, Departure, User
from app.utils.decorators import admin_required, module_required
from sqlalchemy import func
from datetime import datetime, date, timedelta
from app.models import Package, PackagePayment


def get_period_dates(period, year, month):
    """
    Calcule les dates de début et fin selon la période
    
    Args:
        period: 'week', 'month', 'quarter', 'year'
        year: Année
        month: Mois (1-12)
    
    Returns:
        tuple (start_date, end_date)
    """
    if period == 'week':
        # Semaine courante (du lundi au dimanche)
        today = date.today()
        start = today - timedelta(days=today.weekday())  # Lundi
        end = start + timedelta(days=6)  # Dimanche
    elif period == 'month':
        start = date(year, month, 1)
        # Dernier jour du mois
        if month == 12:
            end = date(year + 1, 1, 1) - timedelta(days=1)
        else:
            end = date(year, month + 1, 1) - timedelta(days=1)
    elif period == 'quarter':
        # Trimestre contenant le mois
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


@admin_bp.route('/accounting', methods=['GET'])
@module_required('finance')
def admin_get_accounting():
    """
    Récupère toutes les données comptables pour une période
    
    Query params:
        - period: week, month, quarter, year (défaut: month)
        - year: Année (défaut: année courante)
        - month: Mois 1-12 (défaut: mois courant)
    
    Returns:
        {
            period: { start, end },
            income: {
                payments: [...],  // Paiements clients
                other: [...]      // Autres revenus
            },
            expenses: {
                departures: [...],  // Dépenses liées aux départs
                salaries: [...],    // Salaires payés
                charges: [...]      // Charges diverses
            },
            totals: {
                income: { payments, other, total },
                expenses: { departures, salaries, charges, total },
                netProfit,
                margin
            },
            chargesByCategory: { ... }
        }
    """
    tenant_id = g.tenant_id
    staff_wh_ids = getattr(g, 'staff_warehouse_ids', None) or ([] if not getattr(g, 'staff_warehouse_id', None) else [getattr(g, 'staff_warehouse_id')])
    
    # Paramètres de période
    period = request.args.get('period', 'month')
    year = request.args.get('year', datetime.now().year, type=int)
    month = request.args.get('month', datetime.now().month, type=int)
    
    # Calculer les dates
    start_date, end_date = get_period_dates(period, year, month)
    
    # ============================================
    # ENTRÉES (Recettes)
    # ============================================
    
    # 1. Paiements clients confirmés
    payments_query = Payment.query.filter(
        Payment.tenant_id == tenant_id,
        Payment.status == 'confirmed',
        Payment.created_at >= start_date,
        Payment.created_at <= end_date
    ).order_by(Payment.created_at.desc())

    if g.user_role == 'staff':
        if not staff_wh_ids:
            return jsonify({'error': 'Accès refusé'}), 403
        payments_query = payments_query.filter(
            Payment.package_payments.any()
        ).filter(
            ~Payment.package_payments.any(
                PackagePayment.package.has(Package.destination_warehouse_id.notin_(staff_wh_ids))
            )
        )
    
    payments = []
    for p in payments_query.all():
        # Récupérer la référence du premier colis lié si disponible
        package_ref = None
        if p.package_payments.first():
            pkg = p.package_payments.first().package
            if pkg:
                package_ref = pkg.tracking_number
        
        payments.append({
            'id': p.id,
            'date': p.created_at.isoformat() if p.created_at else None,
            'client': p.client.full_name if p.client else 'Client inconnu',
            'client_is_placeholder': True if p.client and getattr(p.client, 'is_placeholder', False) else False,
            'package_ref': package_ref or p.reference or '',
            'amount': p.amount or 0
        })
    
    # 2. Autres revenus
    if g.user_role == 'staff':
        other_incomes = []
    else:
        other_incomes_query = OtherIncome.query.filter(
            OtherIncome.tenant_id == tenant_id,
            OtherIncome.date >= start_date,
            OtherIncome.date <= end_date
        ).order_by(OtherIncome.date.desc())

        other_incomes = [{
            'id': o.id,
            'date': o.date.isoformat() if o.date else None,
            'description': o.description,
            'amount': o.amount or 0
        } for o in other_incomes_query.all()]
    
    # ============================================
    # SORTIES (Charges)
    # ============================================
    
    # 1. Dépenses liées aux départs
    if g.user_role == 'staff':
        departure_expenses = []
    else:
        departure_expenses_query = DepartureExpense.query.filter(
            DepartureExpense.tenant_id == tenant_id,
            DepartureExpense.date >= start_date,
            DepartureExpense.date <= end_date
        ).order_by(DepartureExpense.date.desc())

        departure_expenses = []
        for d in departure_expenses_query.all():
            departure_title = f"Départ {d.departure.transport_mode}" if d.departure else "Départ"
            if d.departure and d.departure.notes:
                departure_title = d.departure.notes

            departure_expenses.append({
                'id': d.id,
                'date': d.date.isoformat() if d.date else None,
                'departure': departure_title,
                'category': d.category,
                'description': d.description,
                'amount': d.amount or 0
            })
    
    # 2. Salaires payés
    if g.user_role == 'staff':
        salaries = []
    else:
        salaries_query = Salary.query.filter(
            Salary.tenant_id == tenant_id,
            Salary.paid_date >= start_date,
            Salary.paid_date <= end_date
        ).order_by(Salary.paid_date.desc())

        salaries = [{
            'id': s.id,
            'date': s.paid_date.isoformat() if s.paid_date else None,
            'employee': s.employee.full_name if s.employee else 'Employé',
            'month': f"{s.period_year}-{str(s.period_month).zfill(2)}",
            'amount': s.net_amount or 0
        } for s in salaries_query.all()]
    
    # 3. Charges diverses
    if g.user_role == 'staff':
        charges = []
    else:
        charges_query = Expense.query.filter(
            Expense.tenant_id == tenant_id,
            Expense.date >= start_date,
            Expense.date <= end_date
        ).order_by(Expense.date.desc())

        charges = [{
            'id': c.id,
            'date': c.date.isoformat() if c.date else None,
            'category': c.category,
            'description': c.description,
            'amount': c.amount or 0
        } for c in charges_query.all()]
    
    # ============================================
    # CALCUL DES TOTAUX
    # ============================================
    
    totals_income_payments = sum(p['amount'] for p in payments)
    totals_income_other = sum(o['amount'] for o in other_incomes)
    totals_income_total = totals_income_payments + totals_income_other
    
    totals_expenses_departures = sum(d['amount'] for d in departure_expenses)
    totals_expenses_salaries = sum(s['amount'] for s in salaries)
    totals_expenses_charges = sum(c['amount'] for c in charges)
    totals_expenses_total = totals_expenses_departures + totals_expenses_salaries + totals_expenses_charges
    
    net_profit = totals_income_total - totals_expenses_total
    margin = round((net_profit / totals_income_total * 100), 1) if totals_income_total > 0 else 0
    
    # ============================================
    # GROUPEMENT PAR CATÉGORIE (pour graphiques)
    # ============================================
    
    # Charges par catégorie
    charges_by_category = {}
    for c in charges:
        cat = c['category']
        charges_by_category[cat] = charges_by_category.get(cat, 0) + c['amount']
    
    # Dépenses départs par catégorie
    departures_by_category = {}
    for d in departure_expenses:
        cat = d['category']
        departures_by_category[cat] = departures_by_category.get(cat, 0) + d['amount']
    
    return jsonify({
        'period': {
            'start': start_date.isoformat(),
            'end': end_date.isoformat(),
            'type': period,
            'year': year,
            'month': month
        },
        'income': {
            'payments': payments,
            'other': other_incomes
        },
        'expenses': {
            'departures': departure_expenses,
            'salaries': salaries,
            'charges': charges
        },
        'totals': {
            'income': {
                'payments': totals_income_payments,
                'other': totals_income_other,
                'total': totals_income_total
            },
            'expenses': {
                'departures': totals_expenses_departures,
                'salaries': totals_expenses_salaries,
                'charges': totals_expenses_charges,
                'total': totals_expenses_total
            },
            'netProfit': net_profit,
            'margin': margin
        },
        'chargesByCategory': charges_by_category,
        'departuresByCategory': departures_by_category
    })


# ============================================
# CRUD - Dépenses de départ
# ============================================

@admin_bp.route('/departures/<departure_id>/expenses', methods=['GET'])
@module_required('finance')
def admin_get_departure_expenses(departure_id):
    """Liste les dépenses d'un départ"""
    tenant_id = g.tenant_id
    if g.user_role == 'staff':
        return jsonify({'error': 'Accès refusé'}), 403
    
    expenses = DepartureExpense.query.filter_by(
        tenant_id=tenant_id,
        departure_id=departure_id
    ).order_by(DepartureExpense.date.desc()).all()
    
    total = sum(e.amount for e in expenses)
    
    return jsonify({
        'expenses': [e.to_dict() for e in expenses],
        'total': total
    })


@admin_bp.route('/departures/<departure_id>/expenses', methods=['POST'])
@module_required('finance')
def admin_add_departure_expense(departure_id):
    """Ajoute une dépense à un départ"""
    tenant_id = g.tenant_id
    if g.user_role == 'staff':
        return jsonify({'error': 'Accès refusé'}), 403
    user_id = get_jwt_identity()
    data = request.get_json()
    
    # Vérifier que le départ existe
    departure = Departure.query.filter_by(id=departure_id, tenant_id=tenant_id).first()
    if not departure:
        return jsonify({'error': 'Départ non trouvé'}), 404
    
    expense = DepartureExpense(
        tenant_id=tenant_id,
        departure_id=departure_id,
        category=data.get('category', 'other'),
        description=data.get('description', ''),
        amount=data.get('amount', 0),
        currency=data.get('currency', 'XAF'),
        date=datetime.strptime(data['date'], '%Y-%m-%d').date() if data.get('date') else date.today(),
        reference=data.get('reference'),
        notes=data.get('notes'),
        created_by=user_id
    )
    
    db.session.add(expense)
    db.session.commit()
    
    return jsonify(expense.to_dict()), 201


@admin_bp.route('/expenses/departure/<expense_id>', methods=['DELETE'])
@module_required('finance')
def admin_delete_departure_expense(expense_id):
    """Supprime une dépense de départ"""
    tenant_id = g.tenant_id
    if g.user_role == 'staff':
        return jsonify({'error': 'Accès refusé'}), 403
    
    expense = DepartureExpense.query.filter_by(id=expense_id, tenant_id=tenant_id).first()
    if not expense:
        return jsonify({'error': 'Dépense non trouvée'}), 404
    
    db.session.delete(expense)
    db.session.commit()
    
    return jsonify({'message': 'Dépense supprimée'})


# ============================================
# CRUD - Salaires
# ============================================

@admin_bp.route('/salaries', methods=['GET'])
@module_required('finance')
def admin_get_salaries():
    """Liste les salaires"""
    tenant_id = g.tenant_id
    if g.user_role == 'staff':
        return jsonify({'error': 'Accès refusé'}), 403
    
    year = request.args.get('year', type=int)
    month = request.args.get('month', type=int)
    employee_id = request.args.get('employee_id')
    
    query = Salary.query.filter_by(tenant_id=tenant_id)
    
    if year:
        query = query.filter(Salary.period_year == year)
    if month:
        query = query.filter(Salary.period_month == month)
    if employee_id:
        query = query.filter(Salary.employee_id == employee_id)
    
    salaries = query.order_by(Salary.paid_date.desc()).all()
    
    return jsonify({
        'salaries': [s.to_dict() for s in salaries],
        'total': sum(s.net_amount for s in salaries)
    })


@admin_bp.route('/salaries', methods=['POST'])
@module_required('finance')
def admin_add_salary():
    """Enregistre un paiement de salaire"""
    tenant_id = g.tenant_id
    if g.user_role == 'staff':
        return jsonify({'error': 'Accès refusé'}), 403
    user_id = get_jwt_identity()
    data = request.get_json()
    
    # Vérifier que l'employé existe
    employee = User.query.filter_by(id=data.get('employee_id'), tenant_id=tenant_id).first()
    if not employee:
        return jsonify({'error': 'Employé non trouvé'}), 404
    
    # Calculer le net
    base = data.get('base_salary', 0)
    bonus = data.get('bonus', 0)
    deductions = data.get('deductions', 0)
    net = base + bonus - deductions
    
    salary = Salary(
        tenant_id=tenant_id,
        employee_id=data['employee_id'],
        period_month=data.get('period_month', datetime.now().month),
        period_year=data.get('period_year', datetime.now().year),
        base_salary=base,
        bonus=bonus,
        deductions=deductions,
        net_amount=net,
        currency=data.get('currency', 'XAF'),
        paid_date=datetime.strptime(data['paid_date'], '%Y-%m-%d').date() if data.get('paid_date') else date.today(),
        payment_method=data.get('payment_method', 'cash'),
        reference=data.get('reference'),
        notes=data.get('notes'),
        created_by=user_id
    )
    
    db.session.add(salary)
    db.session.commit()
    
    return jsonify(salary.to_dict()), 201


@admin_bp.route('/salaries/<salary_id>', methods=['DELETE'])
@module_required('finance')
def admin_delete_salary(salary_id):
    """Supprime un enregistrement de salaire"""
    tenant_id = g.tenant_id
    if g.user_role == 'staff':
        return jsonify({'error': 'Accès refusé'}), 403
    
    salary = Salary.query.filter_by(id=salary_id, tenant_id=tenant_id).first()
    if not salary:
        return jsonify({'error': 'Salaire non trouvé'}), 404
    
    db.session.delete(salary)
    db.session.commit()
    
    return jsonify({'message': 'Salaire supprimé'})


# ============================================
# CRUD - Charges diverses
# ============================================

@admin_bp.route('/expenses', methods=['GET'])
@module_required('finance')
def admin_get_expenses():
    """Liste les charges diverses"""
    tenant_id = g.tenant_id
    if g.user_role == 'staff':
        return jsonify({'error': 'Accès refusé'}), 403
    
    category = request.args.get('category')
    date_from = request.args.get('date_from')
    date_to = request.args.get('date_to')
    
    query = Expense.query.filter_by(tenant_id=tenant_id)
    
    if category:
        query = query.filter(Expense.category == category)
    if date_from:
        query = query.filter(Expense.date >= date_from)
    if date_to:
        query = query.filter(Expense.date <= date_to)
    
    expenses = query.order_by(Expense.date.desc()).all()
    
    return jsonify({
        'expenses': [e.to_dict() for e in expenses],
        'total': sum(e.amount for e in expenses)
    })


@admin_bp.route('/expenses', methods=['POST'])
@module_required('finance')
def admin_add_expense():
    """Ajoute une charge diverse"""
    tenant_id = g.tenant_id
    if g.user_role == 'staff':
        return jsonify({'error': 'Accès refusé'}), 403
    user_id = get_jwt_identity()
    data = request.get_json()
    
    expense = Expense(
        tenant_id=tenant_id,
        category=data.get('category', 'other'),
        description=data.get('description', ''),
        amount=data.get('amount', 0),
        currency=data.get('currency', 'XAF'),
        date=datetime.strptime(data['date'], '%Y-%m-%d').date() if data.get('date') else date.today(),
        is_recurring=data.get('is_recurring', False),
        recurrence_type=data.get('recurrence_type'),
        reference=data.get('reference'),
        notes=data.get('notes'),
        created_by=user_id
    )
    
    db.session.add(expense)
    db.session.commit()
    
    return jsonify(expense.to_dict()), 201


@admin_bp.route('/expenses/<expense_id>', methods=['DELETE'])
@module_required('finance')
def admin_delete_expense(expense_id):
    """Supprime une charge"""
    tenant_id = g.tenant_id
    if g.user_role == 'staff':
        return jsonify({'error': 'Accès refusé'}), 403
    
    expense = Expense.query.filter_by(id=expense_id, tenant_id=tenant_id).first()
    if not expense:
        return jsonify({'error': 'Charge non trouvée'}), 404
    
    db.session.delete(expense)
    db.session.commit()
    
    return jsonify({'message': 'Charge supprimée'})


# ============================================
# CRUD - Autres revenus
# ============================================

@admin_bp.route('/other-incomes', methods=['GET'])
@module_required('finance')
def admin_get_other_incomes():
    """Liste les autres revenus"""
    tenant_id = g.tenant_id
    if g.user_role == 'staff':
        return jsonify({'error': 'Accès refusé'}), 403
    
    date_from = request.args.get('date_from')
    date_to = request.args.get('date_to')
    
    query = OtherIncome.query.filter_by(tenant_id=tenant_id)
    
    if date_from:
        query = query.filter(OtherIncome.date >= date_from)
    if date_to:
        query = query.filter(OtherIncome.date <= date_to)
    
    incomes = query.order_by(OtherIncome.date.desc()).all()
    
    return jsonify({
        'incomes': [i.to_dict() for i in incomes],
        'total': sum(i.amount for i in incomes)
    })


@admin_bp.route('/other-incomes', methods=['POST'])
@module_required('finance')
def admin_add_other_income():
    """Ajoute un autre revenu"""
    tenant_id = g.tenant_id
    if g.user_role == 'staff':
        return jsonify({'error': 'Accès refusé'}), 403
    user_id = get_jwt_identity()
    data = request.get_json()
    
    income = OtherIncome(
        tenant_id=tenant_id,
        income_type=data.get('income_type', 'other'),
        description=data.get('description', ''),
        amount=data.get('amount', 0),
        currency=data.get('currency', 'XAF'),
        date=datetime.strptime(data['date'], '%Y-%m-%d').date() if data.get('date') else date.today(),
        reference=data.get('reference'),
        notes=data.get('notes'),
        created_by=user_id
    )
    
    db.session.add(income)
    db.session.commit()
    
    return jsonify(income.to_dict()), 201


@admin_bp.route('/other-incomes/<income_id>', methods=['DELETE'])
@module_required('finance')
def admin_delete_other_income(income_id):
    """Supprime un autre revenu"""
    tenant_id = g.tenant_id
    if g.user_role == 'staff':
        return jsonify({'error': 'Accès refusé'}), 403
    
    income = OtherIncome.query.filter_by(id=income_id, tenant_id=tenant_id).first()
    if not income:
        return jsonify({'error': 'Revenu non trouvé'}), 404
    
    db.session.delete(income)
    db.session.commit()
    
    return jsonify({'message': 'Revenu supprimé'})
