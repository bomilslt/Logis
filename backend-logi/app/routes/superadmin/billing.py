"""
Routes Super-Admin - Billing / Pricing
======================================

Gestion de la tarification multi-devises, des taux FX (vers XAF)
et génération de devis (quote).
"""

from flask import request, jsonify, g
from app.routes.superadmin import superadmin_bp
from app.routes.superadmin.auth import superadmin_required, superadmin_permission_required
from app.models import SubscriptionPlan, SubscriptionPlanPrice, CurrencyRate, PlatformConfig
from app import db
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


_SUPPORTED_CURRENCIES = {'XAF', 'XOF', 'USD'}
_SUPPORTED_DURATIONS = {1, 2, 3, 6, 12}  # mois


def _get_annual_discount_percent() -> float:
    config = PlatformConfig.get_config()
    settings = config.settings or {}
    try:
        return float(settings.get('annual_discount_percent', 0) or 0)
    except Exception:
        return 0.0


def _get_rate_to_xaf(currency: str):
    currency = (currency or '').upper().strip()
    if currency == 'XAF':
        return 1.0
    rate = CurrencyRate.query.filter_by(currency=currency).first()
    if not rate:
        return None
    try:
        return float(rate.rate_to_xaf)
    except Exception:
        return None


def _require_currency(currency: str):
    currency = (currency or '').upper().strip()
    if currency not in _SUPPORTED_CURRENCIES:
        return None
    return currency


@superadmin_bp.route('/plans/<plan_id>/prices', methods=['GET'])
@superadmin_permission_required('plans.read')
def get_plan_prices(plan_id):
    plan = SubscriptionPlan.query.get_or_404(plan_id)
    prices = plan.prices.order_by(SubscriptionPlanPrice.currency.asc(), SubscriptionPlanPrice.duration_months.asc()).all()
    return jsonify({
        'plan_id': plan.id,
        'prices': [p.to_dict() for p in prices]
    })


@superadmin_bp.route('/plans/<plan_id>/prices', methods=['PUT'])
@superadmin_permission_required('plans.write')
def upsert_plan_prices(plan_id):
    plan = SubscriptionPlan.query.get_or_404(plan_id)
    data = request.get_json() or {}
    prices = data.get('prices')
    if not isinstance(prices, list):
        return jsonify({'error': 'prices (list) requis'}), 400

    updated = []
    for item in prices:
        currency = _require_currency(item.get('currency'))
        try:
            duration_months = int(item.get('duration_months', 0))
        except (TypeError, ValueError):
            return jsonify({'error': 'duration_months invalide'}), 400

        if not currency or duration_months not in _SUPPORTED_DURATIONS:
            return jsonify({'error': f'currency/duration_months invalides (durées supportées: {sorted(_SUPPORTED_DURATIONS)})'}), 400

        try:
            amount = float(item.get('amount'))
        except Exception:
            return jsonify({'error': 'amount invalide'}), 400

        is_active = bool(item.get('is_active', True))

        existing = SubscriptionPlanPrice.query.filter_by(
            plan_id=plan.id, currency=currency, duration_months=duration_months
        ).first()
        if not existing:
            existing = SubscriptionPlanPrice(plan_id=plan.id, currency=currency, duration_months=duration_months)
            db.session.add(existing)

        existing.amount = amount
        existing.is_active = is_active
        existing.updated_at = datetime.utcnow()
        updated.append(existing)

    db.session.commit()

    logger.info(f"Plan prices updated: {plan.code} by {g.superadmin.email}")

    return jsonify({
        'plan_id': plan.id,
        'prices': [p.to_dict() for p in updated]
    })


@superadmin_bp.route('/billing/rates', methods=['GET'])
@superadmin_required
def list_currency_rates():
    rates = CurrencyRate.query.order_by(CurrencyRate.currency.asc()).all()
    # Toujours exposer XAF comme référence
    result = [{'currency': 'XAF', 'rate_to_xaf': 1.0}]
    result.extend([r.to_dict() for r in rates if r.currency != 'XAF'])
    return jsonify(result)


@superadmin_bp.route('/billing/rates', methods=['PUT'])
@superadmin_permission_required('config.write')
def upsert_currency_rates():
    data = request.get_json() or {}
    rates = data.get('rates')
    if not isinstance(rates, list):
        return jsonify({'error': 'rates (list) requis'}), 400

    updated = []
    for item in rates:
        currency = _require_currency(item.get('currency'))
        if not currency or currency == 'XAF':
            continue

        try:
            rate_to_xaf = float(item.get('rate_to_xaf'))
        except Exception:
            return jsonify({'error': 'rate_to_xaf invalide'}), 400

        if rate_to_xaf <= 0:
            return jsonify({'error': 'rate_to_xaf doit être > 0'}), 400

        existing = CurrencyRate.query.filter_by(currency=currency).first()
        if not existing:
            existing = CurrencyRate(currency=currency, rate_to_xaf=rate_to_xaf)
            db.session.add(existing)
        else:
            existing.rate_to_xaf = rate_to_xaf

        existing.updated_by = g.superadmin.id
        updated.append(existing)

    db.session.commit()

    return jsonify([r.to_dict() for r in updated])


@superadmin_bp.route('/billing/settings', methods=['GET'])
@superadmin_required
def get_billing_settings():
    config = PlatformConfig.get_config()
    settings = config.settings or {}

    return jsonify({
        'annual_discount_percent': float(settings.get('annual_discount_percent', 0) or 0),
        'supported_currencies': list(settings.get('supported_currencies', sorted(list(_SUPPORTED_CURRENCIES))))
    })


@superadmin_bp.route('/billing/settings', methods=['PUT'])
@superadmin_permission_required('config.write')
def update_billing_settings():
    config = PlatformConfig.get_config()
    data = request.get_json() or {}

    annual_discount_percent = data.get('annual_discount_percent')
    supported_currencies = data.get('supported_currencies')

    settings = config.settings or {}

    if annual_discount_percent is not None:
        try:
            annual_discount_percent = float(annual_discount_percent)
        except Exception:
            return jsonify({'error': 'annual_discount_percent invalide'}), 400
        if annual_discount_percent < 0 or annual_discount_percent > 100:
            return jsonify({'error': 'annual_discount_percent doit être entre 0 et 100'}), 400
        settings['annual_discount_percent'] = annual_discount_percent

    if supported_currencies is not None:
        if not isinstance(supported_currencies, list):
            return jsonify({'error': 'supported_currencies doit être une liste'}), 400
        sanitized = []
        for c in supported_currencies:
            c = (c or '').upper().strip()
            if c in _SUPPORTED_CURRENCIES and c not in sanitized:
                sanitized.append(c)
        settings['supported_currencies'] = sanitized

    config.settings = settings
    config.updated_by = g.superadmin.id
    db.session.commit()

    return jsonify({
        'annual_discount_percent': float(settings.get('annual_discount_percent', 0) or 0),
        'supported_currencies': list(settings.get('supported_currencies', []))
    })


@superadmin_bp.route('/billing/quote', methods=['POST'])
@superadmin_permission_required('subscriptions.read')
def billing_quote():
    """
    Calcule un devis (quote) pour un achat/renouvellement.

    Body:
        - plan_id
        - currency: XAF, XOF, USD
        - duration_months: 1, 2, 3, 6, 12
        - discount_percent: optionnel (réduction manuelle)
    """
    data = request.get_json() or {}

    plan_id = data.get('plan_id')
    currency = _require_currency(data.get('currency'))

    try:
        duration_months = int(data.get('duration_months', 1))
    except (TypeError, ValueError):
        return jsonify({'error': 'duration_months invalide'}), 400

    if not plan_id or not currency:
        return jsonify({'error': 'plan_id et currency requis'}), 400

    if duration_months not in _SUPPORTED_DURATIONS:
        return jsonify({'error': f'Durées supportées: {sorted(_SUPPORTED_DURATIONS)}'}), 400

    plan = SubscriptionPlan.query.get_or_404(plan_id)

    # Chercher le prix exact pour cette durée
    total = plan.get_price(currency=currency, duration_months=duration_months)

    if total is None:
        # Fallback: calculer à partir du prix mensuel
        monthly_price = plan.get_price(currency=currency, duration_months=1)
        if monthly_price is None:
            return jsonify({'error': 'Prix introuvable pour cette devise'}), 400
        total = float(monthly_price) * duration_months

    total = float(total)
    monthly_equivalent = total / duration_months if duration_months > 0 else total

    # Réduction manuelle optionnelle
    discount_percent = 0.0
    if data.get('discount_percent'):
        try:
            discount_percent = float(data['discount_percent'])
        except Exception:
            pass

    discount_amount = total * (discount_percent / 100.0)
    net_total = total - discount_amount

    rate_to_xaf = _get_rate_to_xaf(currency)
    if rate_to_xaf is None:
        return jsonify({'error': f'Taux FX manquant pour {currency}'}), 400

    net_total_xaf = float(net_total) * float(rate_to_xaf)

    return jsonify({
        'plan': plan.to_dict(include_stats=False),
        'currency': currency,
        'duration_months': duration_months,
        'monthly_equivalent': round(monthly_equivalent, 2),
        'gross_amount': round(total, 2),
        'discount_percent': round(discount_percent, 2),
        'discount_amount': round(discount_amount, 2),
        'total': round(net_total, 2),
        'fx_rate_to_xaf': float(rate_to_xaf),
        'total_xaf': round(net_total_xaf, 2)
    })
