"""
Routes Super-Admin - Gestion des Abonnements
============================================

Gestion des abonnements des tenants, upgrades, downgrades, annulations.
"""

from flask import request, jsonify, g
from app.routes.superadmin import superadmin_bp
from app.routes.superadmin.auth import superadmin_required, superadmin_permission_required
from app.models import Subscription, SubscriptionPlan, SubscriptionPayment, Tenant, CurrencyRate
from app.services.payment_gateway_service import payment_gateway
from app import db
from datetime import datetime, timedelta
from sqlalchemy import func
import logging
from decimal import Decimal, ROUND_HALF_UP

logger = logging.getLogger(__name__)


def _parse_datetime_param(value: str, *, end_of_day: bool = False):
    if not value:
        return None
    s = value.strip()
    try:
        # Support ISO with Z
        if s.endswith('Z'):
            s = s[:-1] + '+00:00'
        dt = datetime.fromisoformat(s)
        return dt
    except Exception:
        pass
    try:
        d = datetime.strptime(s, '%Y-%m-%d')
        if end_of_day:
            return d + timedelta(days=1)
        return d
    except Exception:
        return None


@superadmin_bp.route('/subscriptions', methods=['GET'])
@superadmin_permission_required('subscriptions.read')
def list_subscriptions():
    """
    Liste tous les abonnements
    
    Query params:
        - status: active, trial, expired, cancelled
        - plan: ID ou code du plan
        - page, per_page: Pagination
    """
    status = request.args.get('status')
    plan_filter = request.args.get('plan')
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    
    query = Subscription.query.join(Tenant)
    
    if status:
        query = query.filter(Subscription.status == status)
    
    if plan_filter:
        plan = SubscriptionPlan.query.filter(
            db.or_(
                SubscriptionPlan.id == plan_filter,
                SubscriptionPlan.code == plan_filter
            )
        ).first()
        if plan:
            query = query.filter(Subscription.plan_id == plan.id)
    
    query = query.order_by(Subscription.created_at.desc())
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)
    
    subscriptions_data = []
    for sub in pagination.items:
        data = sub.to_dict(include_plan=True)
        data['tenant'] = sub.tenant.to_dict() if sub.tenant else None
        subscriptions_data.append(data)
    
    return jsonify({
        'subscriptions': subscriptions_data,
        'pagination': {
            'page': pagination.page,
            'per_page': pagination.per_page,
            'total': pagination.total,
            'pages': pagination.pages
        }
    })


@superadmin_bp.route('/subscriptions/<subscription_id>', methods=['GET'])
@superadmin_permission_required('subscriptions.read')
def get_subscription(subscription_id):
    """Détail d'un abonnement avec historique des paiements"""
    sub = Subscription.query.get_or_404(subscription_id)
    
    data = sub.to_dict(include_plan=True)
    data['tenant'] = sub.tenant.to_dict() if sub.tenant else None
    
    # Historique des paiements
    payments = sub.payments.order_by(SubscriptionPayment.created_at.desc()).limit(20).all()
    data['payments'] = [p.to_dict() for p in payments]
    
    return jsonify(data)


@superadmin_bp.route('/subscriptions/<subscription_id>/change-plan', methods=['POST'])
@superadmin_permission_required('subscriptions.write')
def change_subscription_plan(subscription_id):
    """
    Change le plan d'un abonnement (upgrade/downgrade)
    
    Body:
        - plan_id: ID du nouveau plan
        - prorate: Appliquer le prorata (défaut: true)
        - immediate: Appliquer immédiatement (défaut: true)
    """
    sub = Subscription.query.get_or_404(subscription_id)
    data = request.get_json()
    
    new_plan_id = data.get('plan_id')
    if not new_plan_id:
        return jsonify({'error': 'plan_id requis'}), 400
    
    new_plan = SubscriptionPlan.query.get_or_404(new_plan_id)
    old_plan = sub.plan
    
    if new_plan.id == old_plan.id:
        return jsonify({'error': 'Même plan'}), 400
    
    # Déterminer si c'est un upgrade ou downgrade
    is_upgrade = new_plan.price_monthly > old_plan.price_monthly
    
    # Changer le plan
    sub.plan_id = new_plan.id
    
    if data.get('immediate', True):
        # Appliquer immédiatement
        sub.current_period_start = datetime.utcnow()
        duration = sub.duration_months or 1
        sub.current_period_end = datetime.utcnow() + timedelta(days=30 * duration)
    
    # Mettre le statut à actif si était en trial/expired
    if sub.status in ['trial', 'expired']:
        sub.status = 'active'
    
    db.session.commit()
    
    logger.info(
        f"Subscription plan changed: {sub.tenant.slug} "
        f"from {old_plan.code} to {new_plan.code} "
        f"({'upgrade' if is_upgrade else 'downgrade'}) "
        f"by {g.superadmin.email}"
    )
    
    return jsonify({
        'message': 'Plan modifié',
        'subscription': sub.to_dict(include_plan=True),
        'is_upgrade': is_upgrade
    })


@superadmin_bp.route('/subscriptions/<subscription_id>/cancel', methods=['POST'])
@superadmin_permission_required('subscriptions.write')
def cancel_subscription(subscription_id):
    """
    Annule un abonnement
    
    Body:
        - immediate: Annuler immédiatement (défaut: false, à la fin de période)
        - reason: Raison de l'annulation
    """
    sub = Subscription.query.get_or_404(subscription_id)
    data = request.get_json() or {}
    
    immediate = data.get('immediate', False)
    reason = data.get('reason', '')
    
    sub.cancelled_at = datetime.utcnow()
    sub.notes = f"Annulé par {g.superadmin.email}. Raison: {reason}"
    
    if immediate:
        sub.status = 'cancelled'
        sub.current_period_end = datetime.utcnow()
    else:
        # L'abonnement reste actif jusqu'à la fin de la période
        sub.status = 'cancelled'
    
    db.session.commit()
    
    logger.info(f"Subscription cancelled: {sub.tenant.slug} by {g.superadmin.email}")
    
    return jsonify({
        'message': 'Abonnement annulé',
        'subscription': sub.to_dict()
    })


@superadmin_bp.route('/subscriptions/<subscription_id>/reactivate', methods=['POST'])
@superadmin_permission_required('subscriptions.write')
def reactivate_subscription(subscription_id):
    """Réactive un abonnement annulé ou expiré"""
    sub = Subscription.query.get_or_404(subscription_id)
    
    if sub.status == 'active':
        return jsonify({'error': 'Abonnement déjà actif'}), 400
    
    sub.status = 'active'
    sub.cancelled_at = None
    sub.current_period_start = datetime.utcnow()
    duration = sub.duration_months or 1
    sub.current_period_end = datetime.utcnow() + timedelta(days=30 * duration)
    
    db.session.commit()
    
    logger.info(f"Subscription reactivated: {sub.tenant.slug} by {g.superadmin.email}")
    
    return jsonify({
        'message': 'Abonnement réactivé',
        'subscription': sub.to_dict()
    })


@superadmin_bp.route('/subscriptions/<subscription_id>/extend', methods=['POST'])
@superadmin_permission_required('subscriptions.write')
def extend_subscription(subscription_id):
    """
    Prolonge un abonnement
    
    Body:
        - days: Nombre de jours à ajouter
        - reason: Raison de la prolongation
    """
    sub = Subscription.query.get_or_404(subscription_id)
    data = request.get_json()
    
    days = data.get('days', 30)
    reason = data.get('reason', '')
    
    if sub.current_period_end:
        sub.current_period_end = sub.current_period_end + timedelta(days=days)
    else:
        sub.current_period_end = datetime.utcnow() + timedelta(days=days)
    
    if sub.next_payment_at:
        sub.next_payment_at = sub.next_payment_at + timedelta(days=days)
    
    # Ajouter une note
    note = f"Prolongé de {days} jours par {g.superadmin.email}. Raison: {reason}"
    sub.notes = f"{sub.notes}\n{note}" if sub.notes else note
    
    db.session.commit()
    
    logger.info(f"Subscription extended: {sub.tenant.slug} +{days} days by {g.superadmin.email}")
    
    return jsonify({
        'message': f'Abonnement prolongé de {days} jours',
        'subscription': sub.to_dict()
    })


@superadmin_bp.route('/subscriptions/<subscription_id>/apply-discount', methods=['POST'])
@superadmin_permission_required('subscriptions.write')
def apply_discount(subscription_id):
    """
    Applique une réduction à un abonnement
    
    Body:
        - percent: Pourcentage de réduction (0-100)
        - reason: Raison de la réduction
    """
    sub = Subscription.query.get_or_404(subscription_id)
    data = request.get_json()
    
    percent = data.get('percent', 0)
    reason = data.get('reason', '')
    
    if percent < 0 or percent > 100:
        return jsonify({'error': 'Pourcentage invalide (0-100)'}), 400
    
    sub.discount_percent = percent
    sub.discount_reason = reason
    
    db.session.commit()
    
    logger.info(f"Discount applied: {sub.tenant.slug} {percent}% by {g.superadmin.email}")
    
    return jsonify({
        'message': f'Réduction de {percent}% appliquée',
        'subscription': sub.to_dict()
    })


@superadmin_bp.route('/subscriptions/<subscription_id>/record-payment', methods=['POST'])
@superadmin_permission_required('subscriptions.write')
def record_manual_payment(subscription_id):
    """
    Enregistre un paiement manuel (virement, espèces, etc.)
    
    Body:
        - amount: Montant
        - currency: Devise
        - method: Méthode (cash, bank_transfer, mobile_money)
        - reference: Référence du paiement
        - notes: Notes
    """
    sub = Subscription.query.get_or_404(subscription_id)
    data = request.get_json()
    
    amount = data.get('amount')
    if amount is None:
        return jsonify({'error': 'Montant invalide'}), 400
    try:
        amount = float(amount)
    except Exception:
        return jsonify({'error': 'Montant invalide'}), 400

    if amount <= 0:
        return jsonify({'error': 'Montant invalide'}), 400
    
    currency = (data.get('currency', 'XAF') or 'XAF').upper().strip()
    fx_rate_to_xaf = 1.0
    if currency != 'XAF':
        rate = CurrencyRate.query.filter_by(currency=currency).first()
        if not rate or not rate.rate_to_xaf:
            return jsonify({'error': f'Taux FX manquant pour {currency}'}), 400
        fx_rate_to_xaf = float(rate.rate_to_xaf)

    duration_months = sub.duration_months or 1

    discount_percent = float(sub.discount_percent or 0)
    discount_factor = (Decimal('1') - (Decimal(str(discount_percent)) / Decimal('100')))
    if discount_factor <= Decimal('0'):
        return jsonify({'error': 'Réduction invalide'}), 400

    # Interprétation: amount = montant réellement payé (net)
    net_amount = Decimal(str(amount))
    gross_amount = (net_amount / discount_factor).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    discount_amount = (gross_amount - net_amount).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    unit_price = (gross_amount / Decimal(str(duration_months))).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    amount_xaf = (net_amount * Decimal(str(fx_rate_to_xaf))).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    period_days = 30 * duration_months

    payment = SubscriptionPayment(
        subscription_id=sub.id,
        tenant_id=sub.tenant_id,
        amount=float(net_amount),
        currency=currency,
        fx_rate_to_xaf=fx_rate_to_xaf,
        amount_xaf=float(amount_xaf),
        duration_months=duration_months,
        unit_price=float(unit_price),
        gross_amount=float(gross_amount),
        discount_percent=float(discount_percent),
        discount_amount=float(discount_amount),
        provider='manual',
        provider_reference=data.get('reference'),
        status='completed',
        period_start=datetime.utcnow(),
        period_end=datetime.utcnow() + timedelta(days=period_days),
        description=data.get('notes', f'Paiement manuel enregistré par {g.superadmin.email}'),
        completed_at=datetime.utcnow()
    )
    
    db.session.add(payment)
    
    # Mettre à jour l'abonnement
    sub.status = 'active'
    sub.last_payment_at = datetime.utcnow()
    sub.current_period_start = payment.period_start
    sub.current_period_end = payment.period_end
    sub.next_payment_at = payment.period_end
    
    db.session.commit()
    
    logger.info(f"Manual payment recorded: {sub.tenant.slug} {amount} by {g.superadmin.email}")
    
    return jsonify({
        'message': 'Paiement enregistré',
        'payment': payment.to_dict(),
        'subscription': sub.to_dict()
    }), 201


@superadmin_bp.route('/subscriptions/payments', methods=['GET'])
@superadmin_permission_required('subscriptions.read')
def list_all_payments():
    """
    Liste tous les paiements d'abonnements
    
    Query params:
        - status: pending, completed, failed
        - provider: stripe, flutterwave, cinetpay, manual
        - tenant_id: ID du tenant
        - from_date, to_date: Période
        - page, per_page: Pagination
    """
    status = request.args.get('status')
    provider = request.args.get('provider')
    tenant_id = request.args.get('tenant_id')
    from_date = request.args.get('from_date')
    to_date = request.args.get('to_date')
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    
    query = SubscriptionPayment.query
    
    if status:
        query = query.filter_by(status=status)
    if provider:
        query = query.filter_by(provider=provider)
    if tenant_id:
        query = query.filter_by(tenant_id=tenant_id)

    dt_from = _parse_datetime_param(from_date)
    if from_date and not dt_from:
        return jsonify({'error': 'from_date invalide (ISO ou YYYY-MM-DD)'}), 400
    dt_to = _parse_datetime_param(to_date, end_of_day=True)
    if to_date and not dt_to:
        return jsonify({'error': 'to_date invalide (ISO ou YYYY-MM-DD)'}), 400

    if dt_from:
        query = query.filter(SubscriptionPayment.created_at >= dt_from)
    if dt_to:
        query = query.filter(SubscriptionPayment.created_at < dt_to)
    
    query = query.order_by(SubscriptionPayment.created_at.desc())
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)
    
    # Stats
    total_amount = db.session.query(func.sum(func.coalesce(SubscriptionPayment.amount_xaf, SubscriptionPayment.amount))).filter(
        SubscriptionPayment.status == 'completed'
    ).scalar() or 0
    
    return jsonify({
        'payments': [p.to_dict() for p in pagination.items],
        'pagination': {
            'page': pagination.page,
            'per_page': pagination.per_page,
            'total': pagination.total,
            'pages': pagination.pages
        },
        'stats': {
            'total_revenue': total_amount
        }
    })


@superadmin_bp.route('/subscriptions/activate', methods=['POST'])
@superadmin_permission_required('subscriptions.write')
def activate_plan_for_tenant():
    """
    Active un plan spécifique pour un tenant (création ou mise à jour).
    Permet à l'admin d'assigner directement un plan sans paiement en ligne.
    
    Body:
        - tenant_id: ID du tenant
        - plan_id: ID du plan à activer
        - duration_months: Durée en mois (1, 2, 3, 6, 12)
        - reason: Raison (optionnel)
    """
    data = request.get_json()
    
    tenant_id = data.get('tenant_id')
    plan_id = data.get('plan_id')
    
    if not tenant_id or not plan_id:
        return jsonify({'error': 'tenant_id et plan_id requis'}), 400
    
    tenant = Tenant.query.get_or_404(tenant_id)
    plan = SubscriptionPlan.query.get_or_404(plan_id)
    
    try:
        duration_months = int(data.get('duration_months', 1))
    except (TypeError, ValueError):
        return jsonify({'error': 'duration_months invalide'}), 400
    
    if duration_months not in {1, 2, 3, 6, 12}:
        return jsonify({'error': 'Durées supportées: 1, 2, 3, 6, 12 mois'}), 400
    
    reason = data.get('reason', '')
    now = datetime.utcnow()
    period_end = now + timedelta(days=30 * duration_months)
    
    # Chercher un abonnement existant
    sub = Subscription.query.filter_by(tenant_id=tenant_id).first()
    
    if sub:
        old_plan_code = sub.plan.code if sub.plan else 'none'
        sub.plan_id = plan.id
        sub.status = 'active'
        sub.duration_months = duration_months
        sub.current_period_start = now
        sub.current_period_end = period_end
        sub.next_payment_at = period_end
        sub.cancelled_at = None
        
        note = f"Plan activé manuellement: {plan.code} ({duration_months} mois) par {g.superadmin.email}. Raison: {reason}"
        sub.notes = f"{sub.notes}\n{note}" if sub.notes else note
        
        action = 'updated'
    else:
        sub = Subscription(
            tenant_id=tenant_id,
            plan_id=plan.id,
            status='active',
            duration_months=duration_months,
            started_at=now,
            current_period_start=now,
            current_period_end=period_end,
            next_payment_at=period_end,
            notes=f"Plan activé manuellement: {plan.code} ({duration_months} mois) par {g.superadmin.email}. Raison: {reason}"
        )
        db.session.add(sub)
        action = 'created'
    
    # Mettre à jour les canaux autorisés du tenant selon le plan
    if plan.allowed_channels:
        tenant.allowed_channels = plan.allowed_channels
    
    db.session.commit()
    
    logger.info(
        f"Plan activated for tenant {tenant.name}: {plan.code} "
        f"({duration_months} months) by {g.superadmin.email}"
    )
    
    return jsonify({
        'message': f'Plan {plan.code} activé pour {tenant.name}',
        'action': action,
        'subscription': sub.to_dict(include_plan=True)
    }), 201
