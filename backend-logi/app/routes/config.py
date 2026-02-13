"""
Routes Config - Configuration publique du tenant
Endpoints accessibles sans authentification pour récupérer
les tarifs, origines, destinations, départs programmés
"""

from flask import Blueprint, request, jsonify
from app.models import TenantConfig, Tenant, Announcement, Departure, Subscription
from datetime import datetime, date

config_bp = Blueprint('config', __name__)


@config_bp.route('/tenant/<tenant_id>', methods=['GET'])
def get_tenant_config(tenant_id):
    """
    Récupérer la configuration publique d'un tenant
    
    Utilisé par le client-web pour synchroniser:
    - Origines (pays de départ)
    - Destinations (pays d'arrivée avec entrepôts)
    - Tarifs d'expédition
    - Devises supportées
    
    Args:
        tenant_id: ID ou slug du tenant
    
    Returns:
        Configuration publique du tenant
    """
    # Rechercher par ID ou slug
    tenant = Tenant.query.filter(
        (Tenant.id == tenant_id) | (Tenant.slug == tenant_id)
    ).first()
    
    if not tenant:
        return jsonify({'error': 'Tenant not found'}), 404
    
    if not tenant.is_active:
        return jsonify({'error': 'Tenant is inactive'}), 403
    
    # Récupérer la configuration
    config = TenantConfig.query.filter_by(tenant_id=tenant.id).first()
    
    if not config:
        # Retourner une config vide
        return jsonify({
            'tenant': {
                'id': tenant.id,
                'name': tenant.name,
                'slug': tenant.slug
            },
            'origins': {},
            'destinations': {},
            'shipping_rates': {},
            'currencies': ['XAF', 'XOF', 'USD'],
            'default_currency': 'XAF',
            'branding': {
                'logo': None,
                'header': '',
                'footer': '',
                'primary_color': '#2563eb'
            }
        })
    
    # Extraire les infos de branding depuis la config
    branding = {
        'logo': None,
        'header': '',
        'footer': '',
        'primary_color': '#2563eb'
    }
    
    if config.config_data:
        invoice_config = config.config_data.get('invoice', {})
        
        if invoice_config:
            # Le logo peut être très long (base64), on le prend tel quel
            branding['logo'] = invoice_config.get('logo') or None
            branding['header'] = invoice_config.get('header', '')
            branding['footer'] = invoice_config.get('footer', '')
            branding['primary_color'] = invoice_config.get('primary_color', '#2563eb')
    
    # Vérifier les features du plan d'abonnement
    features_flags = {
        'online_payments': False
    }
    subscription = Subscription.query.filter_by(tenant_id=tenant.id).first()
    if subscription and subscription.is_active and subscription.plan:
        plan_limits = subscription.plan.limits or {}
        features_flags['online_payments'] = bool(plan_limits.get('online_payments', False))
    
    return jsonify({
        'tenant': {
            'id': tenant.id,
            'name': tenant.name,
            'slug': tenant.slug,
            'phone': tenant.phone,
            'email': tenant.email,
            'address': tenant.address
        },
        'branding': branding,
        'features': features_flags,
        **config.to_dict(public_only=True)
    })


@config_bp.route('/tenant/<tenant_id>/announcements', methods=['GET'])
def get_tenant_announcements(tenant_id):
    """
    Récupérer les annonces actives d'un tenant
    
    Args:
        tenant_id: ID ou slug du tenant
    
    Returns:
        Liste des annonces visibles
    """
    # Rechercher par ID ou slug
    tenant = Tenant.query.filter(
        (Tenant.id == tenant_id) | (Tenant.slug == tenant_id)
    ).first()
    
    if not tenant:
        return jsonify({'error': 'Tenant not found'}), 404
    
    # Récupérer les annonces actives et visibles
    announcements = Announcement.query.filter_by(
        tenant_id=tenant.id,
        is_active=True
    ).order_by(
        Announcement.priority.desc(),
        Announcement.created_at.desc()
    ).all()
    
    # Filtrer les annonces visibles (dans la période de validité)
    visible_announcements = [a for a in announcements if a.is_visible]
    
    return jsonify({
        'announcements': [a.to_dict() for a in visible_announcements]
    })


@config_bp.route('/tenant/<tenant_id>/rates', methods=['GET'])
def get_tenant_rates(tenant_id):
    """
    Récupérer uniquement les tarifs d'un tenant
    
    Query params:
        - origin: Filtrer par pays d'origine
        - destination: Filtrer par pays de destination
        - transport: Filtrer par mode de transport
    
    Returns:
        Tarifs filtrés
    """
    # Rechercher par ID ou slug
    tenant = Tenant.query.filter(
        (Tenant.id == tenant_id) | (Tenant.slug == tenant_id)
    ).first()
    
    if not tenant:
        return jsonify({'error': 'Tenant not found'}), 404
    
    config = TenantConfig.query.filter_by(tenant_id=tenant.id).first()
    
    if not config:
        return jsonify({'rates': {}})
    
    rates = config.shipping_rates or {}
    
    # Filtres optionnels
    origin = request.args.get('origin')
    destination = request.args.get('destination')
    transport = request.args.get('transport')
    
    if origin or destination:
        filtered_rates = {}
        for route_key, route_rates in rates.items():
            parts = route_key.split('_')
            if len(parts) == 2:
                route_origin, route_dest = parts
                
                if origin and route_origin != origin:
                    continue
                if destination and route_dest != destination:
                    continue
                
                if transport:
                    # Filtrer par mode de transport
                    if transport in route_rates:
                        filtered_rates[route_key] = {transport: route_rates[transport]}
                else:
                    filtered_rates[route_key] = route_rates
        
        rates = filtered_rates
    
    return jsonify({
        'rates': rates,
        'currencies': config.config_data.get('currencies', ['XAF', 'USD', 'EUR']),
        'default_currency': config.config_data.get('default_currency', 'XAF')
    })


@config_bp.route('/tenant/<tenant_id>/calculate', methods=['POST'])
def calculate_shipping(tenant_id):
    """
    Calculer le coût d'expédition
    
    Body:
        - origin: Pays d'origine
        - destination: Pays de destination
        - transport_mode: Mode de transport (sea, air_normal, air_express)
        - package_type: Type de colis
        - weight: Poids en kg (pour air)
        - cbm: Volume en m³ (pour sea)
        - quantity: Quantité (pour pièces)
    
    Returns:
        Estimation du coût
    """
    tenant = Tenant.query.filter(
        (Tenant.id == tenant_id) | (Tenant.slug == tenant_id)
    ).first()
    
    if not tenant:
        return jsonify({'error': 'Tenant not found'}), 404
    
    config = TenantConfig.query.filter_by(tenant_id=tenant.id).first()
    
    if not config:
        return jsonify({'error': 'No rates configured'}), 400
    
    data = request.get_json()
    
    # Validation
    required = ['origin', 'destination', 'transport_mode', 'package_type']
    for field in required:
        if not data.get(field):
            return jsonify({'error': f'{field} is required'}), 400
    
    # Récupérer le tarif
    route_key = f"{data['origin']}_{data['destination']}"
    route_rates = config.shipping_rates.get(route_key, {})
    transport_rates = route_rates.get(data['transport_mode'], {})
    
    if not transport_rates:
        return jsonify({'error': 'No rates for this route/transport'}), 404
    
    package_type = data['package_type']
    rate_info = transport_rates.get(package_type)
    
    if not rate_info:
        return jsonify({'error': f'No rate for package type: {package_type}'}), 404
    
    # Calculer le coût
    currency = transport_rates.get('currency', 'XAF')
    
    # Support ancien format (number) et nouveau format (object)
    if isinstance(rate_info, dict):
        rate = rate_info.get('rate', 0)
        unit = rate_info.get('unit', 'kg')
    else:
        rate = rate_info
        unit = 'kg'
    
    # Calculer selon l'unité
    if unit == 'kg':
        weight = data.get('weight', 0)
        total = rate * weight
        calculation = f"{weight} kg × {rate} {currency}/kg"
    elif unit == 'cbm':
        cbm = data.get('cbm', 0)
        total = rate * cbm
        calculation = f"{cbm} m³ × {rate} {currency}/m³"
    elif unit == 'piece':
        quantity = data.get('quantity', 1)
        total = rate * quantity
        calculation = f"{quantity} pcs × {rate} {currency}/pc"
    elif unit == 'fixed':
        total = rate
        calculation = f"Forfait: {rate} {currency}"
    else:
        total = rate
        calculation = f"{rate} {currency}"
    
    return jsonify({
        'route': route_key,
        'transport_mode': data['transport_mode'],
        'package_type': package_type,
        'rate': rate,
        'unit': unit,
        'currency': currency,
        'total': round(total, 2),
        'calculation': calculation
    })


@config_bp.route('/tenant/<tenant_id>/departures', methods=['GET'])
def get_upcoming_departures(tenant_id):
    """
    Récupérer les prochains départs programmés d'un tenant
    
    Endpoint public pour le client-web afin d'afficher
    l'estimateur de date de départ.
    
    Query params:
        - origin: Filtrer par pays d'origine
        - destination: Filtrer par pays de destination
        - transport: Filtrer par mode de transport
        - limit: Nombre max de résultats (défaut: 10)
    
    Returns:
        Liste des départs programmés à venir
    """
    # Rechercher par ID ou slug
    tenant = Tenant.query.filter(
        (Tenant.id == tenant_id) | (Tenant.slug == tenant_id)
    ).first()
    
    if not tenant:
        return jsonify({'error': 'Tenant not found'}), 404
    
    if not tenant.is_active:
        return jsonify({'error': 'Tenant is inactive'}), 403
    
    # Filtres
    origin = request.args.get('origin')
    destination = request.args.get('destination')
    transport = request.args.get('transport')
    limit = min(request.args.get('limit', 10, type=int), 50)
    
    # Query: départs programmés à partir d'aujourd'hui
    today = date.today()
    query = Departure.query.filter(
        Departure.tenant_id == tenant.id,
        Departure.status == 'scheduled',
        Departure.departure_date >= today
    )
    
    if origin:
        query = query.filter(Departure.origin_country == origin)
    
    if destination:
        query = query.filter(Departure.dest_country == destination)
    
    if transport:
        query = query.filter(Departure.transport_mode == transport)
    
    # Trier par date de départ
    departures = query.order_by(Departure.departure_date.asc()).limit(limit).all()
    
    # Formater pour le client (données publiques uniquement)
    result = []
    for dep in departures:
        result.append({
            'id': dep.id,
            'origin_country': dep.origin_country,
            'origin_city': dep.origin_city,
            'dest_country': dep.dest_country,
            'transport_mode': dep.transport_mode,
            'departure_date': dep.departure_date.isoformat() if dep.departure_date else None,
            'estimated_duration': dep.estimated_duration,
            'estimated_arrival': dep.estimated_arrival.isoformat() if dep.estimated_arrival else None,
            'status': dep.status
        })
    
    return jsonify({
        'departures': result,
        'count': len(result)
    })



@config_bp.route('/tenant/<tenant_id>/payment-methods', methods=['GET'])
def get_payment_methods(tenant_id):
    """
    Récupérer les moyens de paiement configurés d'un tenant
    
    Endpoint public pour récupérer les moyens de paiement
    actifs configurés par l'admin.
    
    Returns:
        Liste des moyens de paiement actifs
    """
    # Rechercher par ID ou slug
    tenant = Tenant.query.filter(
        (Tenant.id == tenant_id) | (Tenant.slug == tenant_id)
    ).first()
    
    if not tenant:
        return jsonify({'error': 'Tenant not found'}), 404
    
    if not tenant.is_active:
        return jsonify({'error': 'Tenant is inactive'}), 403
    
    # Récupérer la configuration
    config = TenantConfig.query.filter_by(tenant_id=tenant.id).first()
    
    # Moyens de paiement par défaut si non configurés
    default_methods = [
        {'id': 'mobile_money', 'name': 'Mobile Money (OM/MOMO)', 'icon': 'smartphone', 'enabled': True},
        {'id': 'cash', 'name': 'Especes', 'icon': 'dollar-sign', 'enabled': True},
        {'id': 'bank', 'name': 'Virement bancaire', 'icon': 'building', 'enabled': True},
        {'id': 'card', 'name': 'Carte bancaire', 'icon': 'credit-card', 'enabled': False}
    ]
    
    if not config or not config.config_data:
        # Retourner seulement les méthodes actives par défaut
        return jsonify({
            'payment_methods': [m for m in default_methods if m.get('enabled', True)]
        })
    
    payment_methods = config.config_data.get('payment_methods', default_methods)
    
    # Filtrer pour ne retourner que les méthodes actives
    active_methods = [m for m in payment_methods if m.get('enabled', True)]
    
    return jsonify({
        'payment_methods': active_methods
    })
