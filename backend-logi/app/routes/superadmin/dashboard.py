"""
Routes Super-Admin - Dashboard
==============================

Statistiques globales et métriques de la plateforme.
"""

from flask import request, jsonify, g
from app.routes.superadmin import superadmin_bp
from app.routes.superadmin.auth import superadmin_required, superadmin_permission_required
from app.models import (
    Tenant, User, Package, Subscription, SubscriptionPlan,
    SubscriptionPayment, PlatformPaymentProvider
)
from app import db
from datetime import datetime, timedelta
from sqlalchemy import func
import logging

logger = logging.getLogger(__name__)


@superadmin_bp.route('/dashboard/stats', methods=['GET'])
@superadmin_required
def get_dashboard_stats():
    """
    Statistiques globales du dashboard super-admin
    
    Returns:
        - tenants: Nombre total, actifs, nouveaux ce mois
        - subscriptions: Par plan, revenus
        - packages: Volume global
        - users: Total clients et staff
    """
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    week_start = now - timedelta(days=now.weekday())
    
    # Stats Tenants
    tenants_stats = {
        'total': Tenant.query.count(),
        'active': Tenant.query.filter_by(is_active=True).count(),
        'new_this_month': Tenant.query.filter(Tenant.created_at >= month_start).count(),
        'new_this_week': Tenant.query.filter(Tenant.created_at >= week_start).count()
    }
    
    # Stats Abonnements
    subscriptions_stats = {
        'total': Subscription.query.count(),
        'active': Subscription.query.filter_by(status='active').count(),
        'trial': Subscription.query.filter_by(status='trial').count(),
        'cancelled': Subscription.query.filter_by(status='cancelled').count(),
        'expired': Subscription.query.filter_by(status='expired').count()
    }
    
    # Stats par plan
    plans_breakdown = []
    plans = SubscriptionPlan.query.filter_by(is_active=True).order_by(SubscriptionPlan.display_order).all()
    for plan in plans:
        active_count = Subscription.query.filter_by(plan_id=plan.id, status='active').count()
        trial_count = Subscription.query.filter_by(plan_id=plan.id, status='trial').count()
        plans_breakdown.append({
            'code': plan.code,
            'name': plan.name,
            'active': active_count,
            'trial': trial_count,
            'total': active_count + trial_count
        })
    subscriptions_stats['by_plan'] = plans_breakdown
    
    # Stats Revenus
    payments_this_month = db.session.query(
        func.sum(func.coalesce(SubscriptionPayment.amount_xaf, SubscriptionPayment.amount))
    ).filter(
        SubscriptionPayment.status == 'completed',
        SubscriptionPayment.created_at >= month_start
    ).scalar() or 0
    
    payments_total = db.session.query(
        func.sum(func.coalesce(SubscriptionPayment.amount_xaf, SubscriptionPayment.amount))
    ).filter(
        SubscriptionPayment.status == 'completed'
    ).scalar() or 0
    
    revenue_stats = {
        'this_month': float(payments_this_month),
        'total': float(payments_total),
        'currency': 'XAF'
    }
    
    # MRR (Monthly Recurring Revenue) estimé
    mrr = 0
    for plan in plans:
        active_subs = Subscription.query.filter_by(
            plan_id=plan.id, status='active'
        ).all()
        monthly_price_xaf = plan.get_price('XAF', 1)
        if monthly_price_xaf is None:
            monthly_price_xaf = float(plan.price_monthly or 0)
        for sub in active_subs:
            duration = sub.duration_months or 1
            plan_price = plan.get_price('XAF', duration)
            if plan_price is None:
                plan_price = float(monthly_price_xaf) * duration
            mrr += float(plan_price) / duration
    revenue_stats['mrr'] = round(mrr, 2)
    
    # Stats Utilisateurs globaux
    users_stats = {
        'total': User.query.count(),
        'clients': User.query.filter_by(role='client').count(),
        'staff': User.query.filter(User.role.in_(['staff', 'admin'])).count(),
        'active': User.query.filter_by(is_active=True).count()
    }
    
    # Stats Colis globaux
    packages_stats = {
        'total': Package.query.count(),
        'this_month': Package.query.filter(Package.created_at >= month_start).count(),
        'pending': Package.query.filter_by(status='pending').count(),
        'delivered': Package.query.filter_by(status='delivered').count()
    }
    
    return jsonify({
        'tenants': tenants_stats,
        'subscriptions': subscriptions_stats,
        'revenue': revenue_stats,
        'users': users_stats,
        'packages': packages_stats,
        'generated_at': now.isoformat()
    })


@superadmin_bp.route('/dashboard/activity', methods=['GET'])
@superadmin_required
def get_recent_activity():
    """
    Activité récente (nouveaux tenants, paiements, etc.)
    
    Query params:
        - limit: Nombre d'éléments (défaut: 20)
    """
    limit = request.args.get('limit', 20, type=int)
    
    activity = []
    
    # Nouveaux tenants
    recent_tenants = Tenant.query.order_by(Tenant.created_at.desc()).limit(limit).all()
    for t in recent_tenants:
        activity.append({
            'type': 'tenant_created',
            'date': t.created_at.isoformat(),
            'data': {
                'tenant_id': t.id,
                'name': t.name,
                'slug': t.slug
            }
        })
    
    # Paiements récents
    recent_payments = SubscriptionPayment.query.filter_by(status='completed').order_by(
        SubscriptionPayment.created_at.desc()
    ).limit(limit).all()
    for p in recent_payments:
        tenant = Tenant.query.get(p.tenant_id)
        activity.append({
            'type': 'payment_received',
            'date': p.created_at.isoformat(),
            'data': {
                'amount': p.amount,
                'currency': p.currency,
                'provider': p.provider,
                'tenant_name': tenant.name if tenant else 'Unknown'
            }
        })
    
    # Trier par date
    activity.sort(key=lambda x: x['date'], reverse=True)
    
    return jsonify(activity[:limit])


@superadmin_bp.route('/dashboard/charts/revenue', methods=['GET'])
@superadmin_required
def get_revenue_chart():
    """
    Données pour graphique de revenus
    
    Query params:
        - period: daily, weekly, monthly (défaut: monthly)
        - months: Nombre de mois (défaut: 12)
    """
    period = request.args.get('period', 'monthly')
    months = request.args.get('months', 12, type=int)
    
    data = []
    now = datetime.utcnow()
    
    if period == 'monthly':
        for i in range(months):
            month_start = (now.replace(day=1) - timedelta(days=30*i)).replace(
                hour=0, minute=0, second=0, microsecond=0
            )
            month_end = (month_start + timedelta(days=32)).replace(day=1)
            
            revenue = db.session.query(
                func.sum(func.coalesce(SubscriptionPayment.amount_xaf, SubscriptionPayment.amount))
            ).filter(
                SubscriptionPayment.status == 'completed',
                SubscriptionPayment.created_at >= month_start,
                SubscriptionPayment.created_at < month_end
            ).scalar() or 0
            
            new_tenants = Tenant.query.filter(
                Tenant.created_at >= month_start,
                Tenant.created_at < month_end
            ).count()
            
            data.append({
                'period': month_start.strftime('%Y-%m'),
                'label': month_start.strftime('%b %Y'),
                'revenue': float(revenue),
                'new_tenants': new_tenants
            })
    
    return jsonify(list(reversed(data)))


@superadmin_bp.route('/dashboard/charts/subscriptions', methods=['GET'])
@superadmin_required
def get_subscriptions_chart():
    """Données pour graphique d'évolution des abonnements"""
    months = request.args.get('months', 12, type=int)
    
    data = []
    now = datetime.utcnow()
    
    for i in range(months):
        month_start = (now.replace(day=1) - timedelta(days=30*i)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        month_end = (month_start + timedelta(days=32)).replace(day=1)
        
        # Abonnements créés ce mois
        new_subs = Subscription.query.filter(
            Subscription.created_at >= month_start,
            Subscription.created_at < month_end
        ).count()
        
        # Annulations ce mois
        cancelled = Subscription.query.filter(
            Subscription.cancelled_at >= month_start,
            Subscription.cancelled_at < month_end
        ).count()
        
        data.append({
            'period': month_start.strftime('%Y-%m'),
            'label': month_start.strftime('%b %Y'),
            'new': new_subs,
            'cancelled': cancelled,
            'net': new_subs - cancelled
        })
    
    return jsonify(list(reversed(data)))


@superadmin_bp.route('/dashboard/health', methods=['GET'])
@superadmin_required
def get_platform_health():
    """
    État de santé de la plateforme
    
    Returns:
        - database: État de la DB
        - payment_providers: État des providers
        - storage: Utilisation stockage
    """
    health = {
        'status': 'healthy',
        'checks': []
    }
    
    # Check Database
    try:
        db.session.execute(db.text('SELECT 1'))
        health['checks'].append({
            'name': 'database',
            'status': 'ok',
            'message': 'Connexion OK'
        })
    except Exception as e:
        health['status'] = 'degraded'
        health['checks'].append({
            'name': 'database',
            'status': 'error',
            'message': str(e)
        })
    
    # Check Payment Providers
    providers = PlatformPaymentProvider.query.filter_by(is_enabled=True).all()
    for provider in providers:
        has_credentials = bool(provider.credentials)
        health['checks'].append({
            'name': f'payment_{provider.provider_code}',
            'status': 'ok' if has_credentials else 'warning',
            'message': 'Configuré' if has_credentials else 'Credentials manquants'
        })
    
    # Expiring subscriptions warning
    expiring_soon = Subscription.query.filter(
        Subscription.status == 'active',
        Subscription.current_period_end <= datetime.utcnow() + timedelta(days=7)
    ).count()
    
    if expiring_soon > 0:
        health['checks'].append({
            'name': 'expiring_subscriptions',
            'status': 'warning',
            'message': f'{expiring_soon} abonnements expirent dans 7 jours'
        })
    
    return jsonify(health)
