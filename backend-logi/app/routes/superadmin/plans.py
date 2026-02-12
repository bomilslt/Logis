"""
Routes Super-Admin - Gestion des Plans d'Abonnement
===================================================

CRUD pour les plans tarifaires (Free, Pro, Enterprise, etc.)
"""

from flask import request, jsonify, g
from app.routes.superadmin import superadmin_bp
from app.routes.superadmin.auth import superadmin_required, superadmin_permission_required
from app.models import SubscriptionPlan, Subscription
from app import db
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


@superadmin_bp.route('/plans', methods=['GET'])
@superadmin_permission_required('plans.read')
def list_plans():
    """Liste tous les plans avec statistiques"""
    include_inactive = request.args.get('include_inactive', 'false').lower() == 'true'
    
    query = SubscriptionPlan.query
    
    if not include_inactive:
        query = query.filter_by(is_active=True)
    
    plans = query.order_by(SubscriptionPlan.display_order).all()
    
    return jsonify([p.to_dict(include_stats=True) for p in plans])


@superadmin_bp.route('/plans/<plan_id>', methods=['GET'])
@superadmin_permission_required('plans.read')
def get_plan(plan_id):
    """Détail d'un plan avec statistiques"""
    plan = SubscriptionPlan.query.get_or_404(plan_id)
    
    data = plan.to_dict(include_stats=True, include_prices=True)
    
    # Stats détaillées
    monthly_price_xaf = plan.get_price('XAF', 1) or plan.price_monthly or 0
    yearly_price_xaf = plan.get_price('XAF', 12) or plan.price_yearly or 0

    active_subs = plan.subscriptions.filter_by(status='active')
    data['stats'] = {
        'total_subscribers': plan.subscriptions.count(),
        'active_subscribers': active_subs.count(),
        'trial_subscribers': plan.subscriptions.filter_by(status='trial').count(),
        'estimated_mrr': active_subs.count() * float(monthly_price_xaf)
    }
    
    return jsonify(data)


@superadmin_bp.route('/plans', methods=['POST'])
@superadmin_permission_required('plans.write')
def create_plan():
    """
    Crée un nouveau plan d'abonnement
    
    Body:
        - code: Identifiant unique (ex: pro, enterprise)
        - name: Nom affiché
        - description: Description
        - price_monthly: Prix mensuel
        - price_yearly: Prix annuel
        - currency: Devise (XAF, EUR, USD)
        - limits: Object des limites
        - features: Array des fonctionnalités
        - trial_days: Jours d'essai
        - display_order: Ordre d'affichage
        - is_popular: Badge "Populaire"
    """
    data = request.get_json()
    
    code = data.get('code', '').lower().strip()
    name = data.get('name', '').strip()
    
    if not code or not name:
        return jsonify({'error': 'Code et nom requis'}), 400
    
    # Vérifier unicité du code
    if SubscriptionPlan.query.filter_by(code=code).first():
        return jsonify({'error': 'Ce code existe déjà'}), 409
    
    plan = SubscriptionPlan(
        code=code,
        name=name,
        description=data.get('description'),
        max_packages_monthly=data.get('max_packages_monthly', 500),
        max_staff=data.get('max_staff', 3),
        max_clients=data.get('max_clients', 200),
        allowed_channels=data.get('allowed_channels', ['web_admin', 'web_client']),
        price_monthly=data.get('price_monthly', 0),
        price_yearly=data.get('price_yearly', 0),
        currency=data.get('currency', 'XAF'),
        limits=data.get('limits', {}),
        features=data.get('features', []),
        trial_days=data.get('trial_days', 0),
        display_order=data.get('display_order', 0),
        is_popular=data.get('is_popular', False),
        is_active=data.get('is_active', True)
    )
    
    db.session.add(plan)
    db.session.commit()
    
    logger.info(f"Plan created: {plan.code} by {g.superadmin.email}")
    
    return jsonify(plan.to_dict()), 201


@superadmin_bp.route('/plans/<plan_id>', methods=['PUT'])
@superadmin_permission_required('plans.write')
def update_plan(plan_id):
    """Modifie un plan d'abonnement"""
    plan = SubscriptionPlan.query.get_or_404(plan_id)
    data = request.get_json()
    
    # Ne pas modifier le code si des abonnements existent
    if 'code' in data and data['code'] != plan.code:
        if plan.subscriptions.count() > 0:
            return jsonify({'error': 'Impossible de modifier le code avec des abonnés actifs'}), 400
        plan.code = data['code'].lower().strip()
    
    if 'name' in data:
        plan.name = data['name']
    if 'description' in data:
        plan.description = data['description']
    if 'max_packages_monthly' in data:
        plan.max_packages_monthly = data['max_packages_monthly']
    if 'max_staff' in data:
        plan.max_staff = data['max_staff']
    if 'max_clients' in data:
        plan.max_clients = data['max_clients']
    if 'allowed_channels' in data:
        plan.allowed_channels = data['allowed_channels']
    if 'price_monthly' in data:
        plan.price_monthly = data['price_monthly']
    if 'price_yearly' in data:
        plan.price_yearly = data['price_yearly']
    if 'currency' in data:
        plan.currency = data['currency']
    if 'limits' in data:
        plan.limits = data['limits']
    if 'features' in data:
        plan.features = data['features']
    if 'trial_days' in data:
        plan.trial_days = data['trial_days']
    if 'display_order' in data:
        plan.display_order = data['display_order']
    if 'is_popular' in data:
        plan.is_popular = data['is_popular']
    if 'is_active' in data:
        plan.is_active = data['is_active']
    
    db.session.commit()
    
    logger.info(f"Plan updated: {plan.code} by {g.superadmin.email}")
    
    return jsonify(plan.to_dict())


@superadmin_bp.route('/plans/<plan_id>', methods=['DELETE'])
@superadmin_permission_required('plans.write')
def delete_plan(plan_id):
    """
    Supprime un plan (désactivation)
    Ne peut pas supprimer si des abonnés actifs
    """
    plan = SubscriptionPlan.query.get_or_404(plan_id)
    
    active_subs = plan.subscriptions.filter(
        Subscription.status.in_(['active', 'trial'])
    ).count()
    
    if active_subs > 0:
        return jsonify({
            'error': f'Impossible de supprimer: {active_subs} abonnés actifs',
            'active_subscribers': active_subs
        }), 400
    
    # Soft delete
    plan.is_active = False
    db.session.commit()
    
    logger.info(f"Plan deactivated: {plan.code} by {g.superadmin.email}")
    
    return jsonify({'message': 'Plan désactivé'})


@superadmin_bp.route('/plans/reorder', methods=['POST'])
@superadmin_permission_required('plans.write')
def reorder_plans():
    """
    Réordonne les plans
    
    Body:
        - order: Array des IDs dans le nouvel ordre
    """
    data = request.get_json()
    order = data.get('order', [])
    
    for index, plan_id in enumerate(order):
        plan = SubscriptionPlan.query.get(plan_id)
        if plan:
            plan.display_order = index
    
    db.session.commit()
    
    return jsonify({'message': 'Ordre mis à jour'})


# ==================== Templates de plans par défaut ====================

DEFAULT_PLANS = [
    {
        'code': 'starter',
        'name': 'Starter',
        'description': 'Idéal pour les petites entreprises de livraison',
        'max_packages_monthly': 500,
        'max_staff': 3,
        'max_clients': 200,
        'allowed_channels': ['web_admin', 'web_client'],
        'price_monthly': 15000,
        'price_yearly': 150000,
        'currency': 'XAF',
        'limits': {
            'max_warehouses': 1
        },
        'features': [
            '500 colis/mois',
            '3 utilisateurs staff',
            '200 clients',
            'Interface web admin',
            'Interface web client',
            'Support email'
        ],
        'trial_days': 14,
        'display_order': 0,
        'is_popular': False
    },
    {
        'code': 'pro',
        'name': 'Pro',
        'description': 'Pour les entreprises en croissance',
        'max_packages_monthly': 2000,
        'max_staff': 10,
        'max_clients': 1000,
        'allowed_channels': ['web_admin', 'web_client', 'app_android_client', 'app_ios_client'],
        'price_monthly': 25000,
        'price_yearly': 250000,
        'currency': 'XAF',
        'limits': {
            'max_warehouses': 3,
            'online_payments': True
        },
        'features': [
            '2 000 colis/mois',
            '10 utilisateurs staff',
            '1 000 clients',
            'Interface web admin',
            'Interface web client',
            'App client mobile',
            'Paiement en ligne',
            'Support prioritaire'
        ],
        'trial_days': 14,
        'display_order': 1,
        'is_popular': True
    },
    {
        'code': 'business',
        'name': 'Business',
        'description': 'Pour les grandes entreprises de logistique',
        'max_packages_monthly': 10000,
        'max_staff': 30,
        'max_clients': 5000,
        'allowed_channels': ['web_admin', 'web_client', 'app_android_client', 'app_ios_client', 'pc_admin', 'mac_admin'],
        'price_monthly': 45000,
        'price_yearly': 450000,
        'currency': 'XAF',
        'limits': {
            'max_warehouses': 10,
            'api_access': True,
            'online_payments': True
        },
        'features': [
            '10 000 colis/mois',
            '30 utilisateurs staff',
            '5 000 clients',
            'Tous les canaux d\'accès',
            'App desktop admin',
            'Paiement en ligne',
            'Accès API',
            'Support dédié'
        ],
        'trial_days': 14,
        'display_order': 2,
        'is_popular': False
    },
    {
        'code': 'enterprise',
        'name': 'Enterprise',
        'description': 'Solution sur mesure, volume illimité',
        'max_packages_monthly': -1,
        'max_staff': -1,
        'max_clients': -1,
        'allowed_channels': ['web_admin', 'web_client', 'app_android_client', 'app_ios_client', 'pc_admin', 'mac_admin'],
        'price_monthly': 0,
        'price_yearly': 0,
        'currency': 'XAF',
        'limits': {
            'max_warehouses': -1,
            'api_access': True,
            'online_payments': True,
            'custom_domain': True,
            'white_label': True
        },
        'features': [
            'Volume illimité',
            'Utilisateurs illimités',
            'Tous les canaux d\'accès',
            'Paiement en ligne',
            'Domaine personnalisé',
            'White label',
            'Support dédié 24/7'
        ],
        'trial_days': 30,
        'display_order': 3,
        'is_popular': False
    }
]


@superadmin_bp.route('/plans/seed-defaults', methods=['POST'])
@superadmin_permission_required('plans.write')
def seed_default_plans():
    """Crée les plans par défaut s'ils n'existent pas"""
    created = []
    
    for plan_data in DEFAULT_PLANS:
        existing = SubscriptionPlan.query.filter_by(code=plan_data['code']).first()
        if not existing:
            plan = SubscriptionPlan(**plan_data)
            db.session.add(plan)
            created.append(plan_data['code'])
    
    db.session.commit()
    
    return jsonify({
        'message': f'{len(created)} plans créés',
        'created': created
    })
