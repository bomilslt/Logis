"""
Routes Admin - Paramètres et configuration
Gestion des tarifs, entrepôts, et paramètres du tenant
"""

import logging
from flask import request, jsonify, g
from flask_jwt_extended import get_jwt_identity
from app import db
from app.routes.admin import admin_bp
from app.models import TenantConfig, Warehouse, Tenant
from app.utils.decorators import admin_required, module_required
from app.utils.audit import audit_log, AuditAction
from datetime import datetime
import os

logger = logging.getLogger(__name__)


def _safe_str(val):
    return (val or '').strip()


def _upsert_warehouse_from_tarifs(tenant_id: str, country: str, code: str, name: str, city: str = None):
    """Upsert a Warehouse using the stable business key (tenant_id, country, code)."""
    country = _safe_str(country)
    code = _safe_str(code)
    name = _safe_str(name)
    city = _safe_str(city)

    if not country or not code or not name:
        return None

    wh = Warehouse.query.filter_by(tenant_id=tenant_id, country=country, code=code).first()
    if not wh:
        wh = Warehouse(tenant_id=tenant_id, country=country, code=code)
        db.session.add(wh)

    wh.city = city or wh.city
    wh.name = name
    if wh.is_active is None:
        wh.is_active = True
    return wh


def _sync_tarifs_to_warehouses(tenant_id: str, origins: dict, destinations: dict):
    """Create/update Warehouse rows from Tarifs config.

    - Origins (country->cities[]) become warehouses with name "{CountryLabelOrKey} - {CityName}".
    - Destinations (country->warehouses[]) become warehouses with name "{CountryLabelOrKey} - {PointName}".

    Returns:
        tuple(origin_map, destination_map)
        origin_map[country_key][city_code] = warehouse_uuid
        destination_map[country_key][point_code] = warehouse_uuid
    """
    origin_map = {}
    destination_map = {}

    # Origins
    for country_key, country_data in (origins or {}).items():
        label = _safe_str((country_data or {}).get('label')) or _safe_str(country_key)
        cities = (country_data or {}).get('cities') or []
        for city in cities:
            city_code = _safe_str((city or {}).get('id'))
            city_name = _safe_str((city or {}).get('name'))
            if not city_code or not city_name:
                continue
            wh_name = f"{label} - {city_name}"
            wh = _upsert_warehouse_from_tarifs(
                tenant_id=tenant_id,
                country=country_key,
                code=city_code,
                name=wh_name,
                city=city_name
            )
            if not wh:
                continue
            db.session.flush()
            origin_map.setdefault(country_key, {})[city_code] = wh.id

    # Destinations
    for country_key, country_data in (destinations or {}).items():
        label = _safe_str((country_data or {}).get('label')) or _safe_str(country_key)
        points = (country_data or {}).get('warehouses') or []
        for point in points:
            point_code = _safe_str((point or {}).get('id'))
            point_name = _safe_str((point or {}).get('name'))
            if not point_code or not point_name:
                continue
            wh_name = f"{label} - {point_name}"
            wh = _upsert_warehouse_from_tarifs(
                tenant_id=tenant_id,
                country=country_key,
                code=point_code,
                name=wh_name,
                city=point_name
            )
            if not wh:
                continue
            db.session.flush()
            destination_map.setdefault(country_key, {})[point_code] = wh.id

    return origin_map, destination_map


def _enrich_rates_with_warehouse_ids(origins: dict, destinations: dict, origin_map: dict, destination_map: dict):
    """Return a copy of origins/destinations enriched with warehouse_id."""
    enriched_origins = {}
    for country_key, country_data in (origins or {}).items():
        enriched_origins[country_key] = dict(country_data or {})
        cities = (country_data or {}).get('cities') or []
        enriched_cities = []
        for city in cities:
            city_obj = dict(city or {})
            city_code = _safe_str(city_obj.get('id'))
            wh_id = (origin_map.get(country_key) or {}).get(city_code)
            if wh_id:
                city_obj['warehouse_id'] = wh_id
            enriched_cities.append(city_obj)
        enriched_origins[country_key]['cities'] = enriched_cities

    enriched_destinations = {}
    for country_key, country_data in (destinations or {}).items():
        enriched_destinations[country_key] = dict(country_data or {})
        points = (country_data or {}).get('warehouses') or []
        enriched_points = []
        for point in points:
            point_obj = dict(point or {})
            point_code = _safe_str(point_obj.get('id'))
            wh_id = (destination_map.get(country_key) or {}).get(point_code)
            if wh_id:
                point_obj['warehouse_id'] = wh_id
            enriched_points.append(point_obj)
        enriched_destinations[country_key]['warehouses'] = enriched_points

    return enriched_origins, enriched_destinations

@admin_bp.route('/settings', methods=['GET'])
@module_required('settings')
def admin_get_settings():
    """Récupérer tous les paramètres du tenant"""
    tenant_id = g.tenant_id
    
    # Récupérer ou créer la config
    config = TenantConfig.query.filter_by(tenant_id=tenant_id).first()
    if not config:
        config = TenantConfig(tenant_id=tenant_id, config_data={})
        db.session.add(config)
        db.session.commit()
    
    # Récupérer le tenant
    tenant = Tenant.query.get(tenant_id)
    
    return jsonify({
        'tenant': tenant.to_dict() if tenant else None,
        'config': config.to_dict()
    })


@admin_bp.route('/settings', methods=['PUT'])
@module_required('settings')
def admin_update_settings():
    """
    Mettre à jour les paramètres généraux
    
    Body:
        - name, email, phone, address (infos tenant)
        - config_data (configuration partielle à fusionner)
    """
    tenant_id = g.tenant_id
    data = request.get_json()
    
    tenant = Tenant.query.get(tenant_id)
    if not tenant:
        return jsonify({'error': 'Tenant not found'}), 404
    
    # Mise à jour infos tenant
    if 'name' in data:
        tenant.name = data['name']
    if 'email' in data:
        tenant.email = data['email']
    if 'phone' in data:
        tenant.phone = data['phone']
    if 'address' in data:
        tenant.address = data['address']
    
    # Mise à jour config - FUSIONNER au lieu de remplacer
    if 'config_data' in data:
        config = TenantConfig.query.filter_by(tenant_id=tenant_id).first()
        if not config:
            config = TenantConfig(tenant_id=tenant_id, config_data={})
            db.session.add(config)
        
        # Fusionner les nouvelles données avec les existantes
        if not config.config_data:
            config.config_data = {}
        
        for key, value in data['config_data'].items():
            config.config_data[key] = value
        
        # Marquer comme modifié pour SQLAlchemy
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(config, 'config_data')
    
    db.session.commit()
    
    audit_log(
        action=AuditAction.SETTINGS_UPDATE,
        resource_type='tenant_config',
        resource_id=tenant_id,
        details={'updated_fields': list(data.keys())}
    )
    
    return jsonify({
        'message': 'Settings updated',
        'tenant': tenant.to_dict()
    })


# ==================== TARIFS ====================

@admin_bp.route('/settings/rates', methods=['GET'])
@module_required('settings')
def admin_get_rates():
    """Récupérer tous les tarifs"""
    tenant_id = g.tenant_id
    
    config = TenantConfig.query.filter_by(tenant_id=tenant_id).first()

    origins = config.origins if config else {}
    destinations = config.destinations if config else {}
    shipping_rates = config.shipping_rates if config else {}

    # Sync & enrich so frontend keeps UI unchanged but gets stable warehouse UUIDs.
    try:
        origin_map, destination_map = _sync_tarifs_to_warehouses(tenant_id, origins, destinations)
        db.session.commit()
        origins, destinations = _enrich_rates_with_warehouse_ids(origins, destinations, origin_map, destination_map)
    except Exception as e:
        db.session.rollback()
        logger.warning(f"Tarifs->warehouses sync failed on GET /settings/rates: {e}")

    return jsonify({
        'origins': origins,
        'destinations': destinations,
        'shipping_rates': shipping_rates
    })


@admin_bp.route('/settings/rates', methods=['PUT'])
@module_required('settings')
def admin_update_rates():
    """
    Mettre à jour les tarifs complets
    
    Body:
        - origins: Configuration des origines
        - destinations: Configuration des destinations
        - shipping_rates: Tarifs par route
    """
    tenant_id = g.tenant_id
    data = request.get_json()
    
    config = TenantConfig.query.filter_by(tenant_id=tenant_id).first()
    if not config:
        config = TenantConfig(tenant_id=tenant_id, config_data={})
        db.session.add(config)
    
    # S'assurer que config_data existe
    if not config.config_data:
        config.config_data = {}
    
    if 'origins' in data:
        config.config_data['origins'] = data['origins']
    
    if 'destinations' in data:
        config.config_data['destinations'] = data['destinations']
    
    if 'shipping_rates' in data:
        config.config_data['shipping_rates'] = data['shipping_rates']

    # Sync Tarifs -> warehouses before commit
    try:
        origin_map, destination_map = _sync_tarifs_to_warehouses(
            tenant_id,
            config.config_data.get('origins') or {},
            config.config_data.get('destinations') or {}
        )
    except Exception as e:
        db.session.rollback()
        logger.exception(f"Tarifs->warehouses sync failed on PUT /settings/rates: {e}")
        return jsonify({'error': 'Warehouse sync failed'}), 500
    
    # Marquer config_data comme modifié pour SQLAlchemy
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(config, 'config_data')
    
    db.session.commit()
    
    audit_log(
        action=AuditAction.SETTINGS_UPDATE,
        resource_type='tenant_config',
        resource_id=tenant_id,
        details={'action': 'rates_full_update', 'sections': ['origins', 'destinations', 'shipping_rates']}
    )
    
    enriched_origins, enriched_destinations = _enrich_rates_with_warehouse_ids(
        config.origins,
        config.destinations,
        origin_map,
        destination_map
    )

    return jsonify({
        'message': 'Rates updated',
        'origins': enriched_origins,
        'destinations': enriched_destinations,
        'shipping_rates': config.shipping_rates
    })


@admin_bp.route('/settings/rates/<country>', methods=['PUT'])
@module_required('settings')
def admin_update_country_rates(country):
    """
    Mettre à jour les tarifs pour un pays spécifique
    
    Body:
        - rates: Tarifs pour ce pays (toutes les routes)
    """
    tenant_id = g.tenant_id
    data = request.get_json()
    
    config = TenantConfig.query.filter_by(tenant_id=tenant_id).first()
    if not config:
        config = TenantConfig(tenant_id=tenant_id, config_data={})
        db.session.add(config)
    
    # Mettre à jour les routes concernant ce pays
    rates = config.shipping_rates or {}
    
    for route_key, route_rates in data.get('rates', {}).items():
        rates[route_key] = route_rates
    
    config.shipping_rates = rates
    db.session.commit()
    
    audit_log(
        action=AuditAction.SETTINGS_UPDATE,
        resource_type='tenant_config',
        resource_id=tenant_id,
        details={'action': 'rates_country_update', 'country': country, 'routes_count': len(data.get('rates', {}))}
    )
    
    return jsonify({
        'message': f'Rates for {country} updated',
        'shipping_rates': config.shipping_rates
    })


# ==================== ENTREPÔTS ====================

@admin_bp.route('/settings/warehouses', methods=['GET'])
@module_required('settings')
def admin_get_warehouses():
    """Liste des entrepôts/points de retrait"""
    tenant_id = g.tenant_id
    
    warehouses = Warehouse.query.filter_by(tenant_id=tenant_id).order_by(
        Warehouse.country, Warehouse.name
    ).all()
    
    return jsonify({
        'warehouses': [w.to_dict() for w in warehouses]
    })


@admin_bp.route('/settings/warehouses', methods=['POST'])
@module_required('settings')
def admin_create_warehouse():
    """
    Créer un entrepôt
    
    Body:
        - country: Pays (requis)
        - name: Nom (requis)
        - city, address, phone, email
        - latitude, longitude
    """
    tenant_id = g.tenant_id
    data = request.get_json()
    
    if not data.get('country'):
        return jsonify({'error': 'Country is required'}), 400
    
    if not data.get('name'):
        return jsonify({'error': 'Name is required'}), 400
    
    warehouse = Warehouse(
        tenant_id=tenant_id,
        country=data['country'],
        city=data.get('city'),
        code=data.get('code'),
        name=data['name'],
        address=data.get('address'),
        phone=data.get('phone'),
        email=data.get('email'),
        latitude=data.get('latitude'),
        longitude=data.get('longitude'),
        is_active=True
    )
    
    db.session.add(warehouse)
    db.session.commit()
    
    audit_log(
        action=AuditAction.SETTINGS_UPDATE,
        resource_type='warehouse',
        resource_id=warehouse.id,
        details={'action': 'warehouse_create', 'country': warehouse.country, 'name': warehouse.name}
    )
    
    return jsonify({
        'message': 'Entrepôt créé avec succès',
        'warehouse': warehouse.to_dict()
    }), 201


@admin_bp.route('/settings/warehouses/<warehouse_id>', methods=['PUT'])
@module_required('settings')
def admin_update_warehouse(warehouse_id):
    """Mettre à jour un entrepôt"""
    tenant_id = g.tenant_id
    data = request.get_json()
    
    warehouse = Warehouse.query.filter_by(
        id=warehouse_id, 
        tenant_id=tenant_id
    ).first()
    
    if not warehouse:
        return jsonify({'error': 'Warehouse not found'}), 404
    
    # Champs modifiables
    for field in ['country', 'city', 'code', 'name', 'address', 'phone', 'email', 'latitude', 'longitude', 'is_active']:
        if field in data:
            setattr(warehouse, field, data[field])
    
    db.session.commit()
    
    audit_log(
        action=AuditAction.SETTINGS_UPDATE,
        resource_type='warehouse',
        resource_id=warehouse.id,
        details={'action': 'warehouse_update', 'updated_fields': list(data.keys())}
    )
    
    return jsonify({
        'message': 'Warehouse updated',
        'warehouse': warehouse.to_dict()
    })


@admin_bp.route('/settings/warehouses/<warehouse_id>', methods=['DELETE'])
@module_required('settings')
def admin_delete_warehouse(warehouse_id):
    """Supprimer un entrepôt"""
    tenant_id = g.tenant_id
    
    warehouse = Warehouse.query.filter_by(
        id=warehouse_id, 
        tenant_id=tenant_id
    ).first()
    
    if not warehouse:
        return jsonify({'error': 'Warehouse not found'}), 404
    
    db.session.delete(warehouse)
    db.session.commit()
    
    audit_log(
        action=AuditAction.SETTINGS_UPDATE,
        resource_type='warehouse',
        resource_id=warehouse_id,
        details={'action': 'warehouse_delete', 'name': warehouse.name, 'country': warehouse.country}
    )
    
    return jsonify({'message': 'Warehouse deleted'})


# ==================== NOTIFICATIONS CONFIG ====================

@admin_bp.route('/settings/notifications', methods=['GET'])
@module_required('settings')
def admin_get_notification_settings():
    """Récupérer la configuration des notifications"""
    tenant_id = g.tenant_id
    
    config = TenantConfig.query.filter_by(tenant_id=tenant_id).first()
    
    notification_config = config.config_data.get('notifications', {}) if config else {}
    
    return jsonify({
        'notifications': notification_config
    })


@admin_bp.route('/settings/notifications', methods=['PUT'])
@module_required('settings')
def admin_update_notification_settings():
    """
    Mettre à jour la configuration des notifications
    
    Body:
        - sms: Configuration SMS
        - whatsapp: Configuration WhatsApp
        - email: Configuration Email
        - templates: Templates de messages
    """
    tenant_id = g.tenant_id
    data = request.get_json()
    
    config = TenantConfig.query.filter_by(tenant_id=tenant_id).first()
    if not config:
        config = TenantConfig(tenant_id=tenant_id, config_data={})
        db.session.add(config)
    
    if not config.config_data:
        config.config_data = {}
    
    config.config_data['notifications'] = data
    
    # Marquer comme modifié pour SQLAlchemy
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(config, 'config_data')
    
    db.session.commit()
    
    audit_log(
        action=AuditAction.NOTIFICATION_CONFIG_UPDATE,
        resource_type='tenant_config',
        resource_id=tenant_id,
        details={'action': 'notifications_config_update', 'sections': list(data.keys())}
    )
    
    return jsonify({
        'message': 'Notification settings updated',
        'notifications': config.config_data.get('notifications', {})
    })


@admin_bp.route('/settings/sms', methods=['PUT'])
@module_required('settings')
def admin_update_sms_config():
    """
    Mettre à jour la configuration SMS
    
    Body:
        - provider: Fournisseur (twilio, nexmo, etc.)
        - config: Configuration du fournisseur
    """
    tenant_id = g.tenant_id
    data = request.get_json()
    
    config = TenantConfig.query.filter_by(tenant_id=tenant_id).first()
    if not config:
        config = TenantConfig(tenant_id=tenant_id, config_data={})
        db.session.add(config)
    
    if not config.config_data:
        config.config_data = {}
    
    if 'notifications' not in config.config_data:
        config.config_data['notifications'] = {}
    
    config.config_data['notifications']['sms'] = {
        'provider': data.get('provider'),
        'config': data.get('config', {})
    }
    
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(config, 'config_data')
    
    db.session.commit()
    
    audit_log(
        action=AuditAction.NOTIFICATION_CONFIG_UPDATE,
        resource_type='tenant_config',
        resource_id=tenant_id,
        details={'action': 'sms_config_update', 'provider': data.get('provider')}
    )
    
    return jsonify({
        'message': 'SMS configuration updated'
    })


@admin_bp.route('/settings/whatsapp', methods=['PUT'])
@module_required('settings')
def admin_update_whatsapp_config():
    """Mettre à jour la configuration WhatsApp"""
    tenant_id = g.tenant_id
    data = request.get_json()
    
    config = TenantConfig.query.filter_by(tenant_id=tenant_id).first()
    if not config:
        config = TenantConfig(tenant_id=tenant_id, config_data={})
        db.session.add(config)
    
    if not config.config_data:
        config.config_data = {}
    
    if 'notifications' not in config.config_data:
        config.config_data['notifications'] = {}
    
    config.config_data['notifications']['whatsapp'] = {
        'provider': data.get('provider'),
        'config': data.get('config', {})
    }
    
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(config, 'config_data')
    
    db.session.commit()
    
    audit_log(
        action=AuditAction.NOTIFICATION_CONFIG_UPDATE,
        resource_type='tenant_config',
        resource_id=tenant_id,
        details={'action': 'whatsapp_config_update', 'provider': data.get('provider')}
    )
    
    return jsonify({
        'message': 'WhatsApp configuration updated'
    })


@admin_bp.route('/settings/email', methods=['PUT'])
@module_required('settings')
def admin_update_email_config():
    """Mettre à jour la configuration Email"""
    tenant_id = g.tenant_id
    data = request.get_json()
    
    config = TenantConfig.query.filter_by(tenant_id=tenant_id).first()
    if not config:
        config = TenantConfig(tenant_id=tenant_id, config_data={})
        db.session.add(config)
    
    if not config.config_data:
        config.config_data = {}
    
    if 'notifications' not in config.config_data:
        config.config_data['notifications'] = {}
    
    config.config_data['notifications']['email'] = {
        'provider': data.get('provider'),
        'config': data.get('config', {})
    }
    
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(config, 'config_data')
    
    db.session.commit()
    
    audit_log(
        action=AuditAction.NOTIFICATION_CONFIG_UPDATE,
        resource_type='tenant_config',
        resource_id=tenant_id,
        details={'action': 'email_config_update', 'provider': data.get('provider')}
    )
    
    return jsonify({
        'message': 'Email configuration updated'
    })


# ==================== TEMPLATES ====================

@admin_bp.route('/settings/templates', methods=['GET'])
@module_required('settings')
def admin_get_templates():
    """Récupérer les templates de messages"""
    tenant_id = g.tenant_id
    
    config = TenantConfig.query.filter_by(tenant_id=tenant_id).first()
    
    templates = config.config_data.get('templates', {}) if config else {}
    
    return jsonify({
        'templates': templates
    })


@admin_bp.route('/settings/templates/<template_key>', methods=['PUT'])
@module_required('settings')
def admin_update_template(template_key):
    """
    Mettre à jour un template de message
    
    Body:
        - sms: Template SMS
        - whatsapp: Template WhatsApp
        - email: Template Email
    """
    tenant_id = g.tenant_id
    data = request.get_json()
    
    config = TenantConfig.query.filter_by(tenant_id=tenant_id).first()
    if not config:
        config = TenantConfig(tenant_id=tenant_id, config_data={})
        db.session.add(config)
    
    if not config.config_data:
        config.config_data = {}
    
    if 'templates' not in config.config_data:
        config.config_data['templates'] = {}
    
    config.config_data['templates'][template_key] = data
    
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(config, 'config_data')
    
    db.session.commit()
    
    return jsonify({
        'message': f'Template {template_key} updated'
    })


# ==================== NOTIFICATION CHANNELS ====================

@admin_bp.route('/settings/notifications/channels/<channel_id>', methods=['PUT'])
@module_required('settings')
def admin_update_notification_channel(channel_id):
    """
    Mettre à jour la configuration d'un canal de notification spécifique
    
    Args:
        channel_id: sms, whatsapp, email, push
    
    Body:
        - provider: Fournisseur du service
        - config: Configuration spécifique au fournisseur
        - enabled: Activer/désactiver le canal
    """
    tenant_id = g.tenant_id
    data = request.get_json()
    
    valid_channels = ['sms', 'whatsapp', 'email', 'push']
    if channel_id not in valid_channels:
        return jsonify({'error': f'Invalid channel. Valid: {valid_channels}'}), 400
    
    config = TenantConfig.query.filter_by(tenant_id=tenant_id).first()
    if not config:
        config = TenantConfig(tenant_id=tenant_id, config_data={})
        db.session.add(config)
    
    if not config.config_data:
        config.config_data = {}
    
    if 'notifications' not in config.config_data:
        config.config_data['notifications'] = {}
    
    # Mettre à jour le canal spécifique (préserver les valeurs existantes si non fournies)
    existing = config.config_data['notifications'].get(channel_id, {})
    existing_config = existing.get('config', {}) or {}
    new_config = data.get('config')
    if new_config is None:
        new_config = existing_config
    else:
        # Conserver les clés sensibles si non fournies
        for key in ['api_key', 'access_token', 'password']:
            if key in existing_config and key not in new_config:
                new_config[key] = existing_config[key]

    config.config_data['notifications'][channel_id] = {
        'provider': data.get('provider', existing.get('provider')),
        'config': new_config,
        'enabled': data.get('enabled', existing.get('enabled', True))
    }
    
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(config, 'config_data')
    
    db.session.commit()
    
    return jsonify({
        'message': f'{channel_id} channel configuration updated',
        'channel': config.config_data['notifications'][channel_id]
    })


@admin_bp.route('/settings/notifications/templates', methods=['GET'])
@module_required('settings')
def admin_get_notification_templates():
    """Récupérer tous les templates de notification"""
    tenant_id = g.tenant_id
    
    config = TenantConfig.query.filter_by(tenant_id=tenant_id).first()
    
    templates = {}
    if config and config.config_data:
        templates = config.config_data.get('templates', {})
    
    # Templates par défaut si vide
    if not templates:
        templates = {
            'package_received': {
                'sms': '[{company}] Colis {tracking} recu. {billing_qty} = {shipping_cost}. Reste: {amount_due}',
                'whatsapp': '📦 *Colis reçu en entrepôt*\n\nBonjour {client_name},\n\nVotre colis *{tracking}* a été reçu et mesuré.\n\n📋 *Détails:*\n• Description: {description}\n• {billing_detail}\n\n💰 *Facturation:*\n• Montant: {shipping_cost}\n• Reste à payer: {amount_due}\n\nNous vous informerons de son expédition.',
                'email': {
                    'subject': 'Colis reçu en entrepôt - {tracking}',
                    'body': 'Bonjour {client_name},\n\nVotre colis {tracking} a été reçu et mesuré dans notre entrepôt.\n\nDétails:\n- Description: {description}\n- {billing_detail}\n\nFacturation:\n- Montant: {shipping_cost}\n- Reste à payer: {amount_due}\n\nNous vous informerons dès son expédition.\n\nCordialement,\n{company}'
                },
                'push': 'Colis {tracking} reçu - {billing_qty} = {shipping_cost}'
            },
            'package_shipped': {
                'sms': '[{company}] Colis {tracking} expedie! Route: {route}. Transport: {transport}. Arrivee estimee: {eta}',
                'whatsapp': '🚀 *Colis expédié*\n\nBonjour {client_name},\n\nVotre colis *{tracking}* est en route!\n\n📋 *Détails:*\n• Route: {route}\n• Transport: {transport}\n• Départ: {departure_date}\n• Arrivée estimée: {eta}\n\nSuivez votre colis sur notre plateforme.',
                'email': {
                    'subject': 'Colis expédié - {tracking}',
                    'body': 'Bonjour {client_name},\n\nVotre colis {tracking} a été expédié!\n\nDétails du transport:\n- Route: {route}\n- Mode: {transport}\n- Date de départ: {departure_date}\n- Arrivée estimée: {eta}\n\nVous pouvez suivre votre colis sur notre plateforme.\n\nCordialement,\n{company}'
                },
                'push': 'Colis {tracking} expédié - Arrivée: {eta}'
            },
            'package_arrived': {
                'sms': '[{company}] Colis {tracking} arrive a destination! En cours de traitement. Vous serez notifie quand il sera pret.',
                'whatsapp': '✅ *Colis arrivé*\n\nBonjour {client_name},\n\nVotre colis *{tracking}* est arrivé à destination!\n\n📋 *Détails:*\n• Route: {route}\n• Transport: {transport}\n\n⏳ Votre colis est en cours de traitement (dédouanement, déchargement). Vous recevrez une notification dès qu\'il sera prêt pour le retrait.',
                'email': {
                    'subject': 'Colis arrivé à destination - {tracking}',
                    'body': 'Bonjour {client_name},\n\nBonne nouvelle! Votre colis {tracking} est arrivé à destination.\n\nDétails:\n- Route: {route}\n- Transport: {transport}\n\nVotre colis est actuellement en cours de traitement (dédouanement, déchargement). Vous recevrez une notification dès qu\'il sera disponible pour le retrait.\n\nCordialement,\n{company}'
                },
                'push': 'Colis {tracking} arrivé à destination!'
            },
            'ready_pickup': {
                'sms': '[{company}] Colis {tracking} PRET! {billing_qty} = {amount_due}. Retrait: {warehouse}',
                'whatsapp': '🎉 *Colis prêt pour retrait*\n\nBonjour {client_name},\n\nVotre colis *{tracking}* est disponible!\n\n📦 *Détails du colis:*\n• Référence: {tracking}\n• Description: {description}\n• {billing_detail}\n\n💰 *Facturation:*\n• Total: {shipping_cost}\n• Payé: {amount_paid}\n• *Reste à payer: {amount_due}*\n\n📍 *Point de retrait:*\n{warehouse}\n\n⏰ Horaires: Lun-Sam 8h-18h\n\nMunissez-vous de votre pièce d\'identité.',
                'email': {
                    'subject': '🎉 Colis prêt pour retrait - {tracking}',
                    'body': 'Bonjour {client_name},\n\nVotre colis {tracking} est maintenant disponible pour le retrait!\n\n--- DÉTAILS DU COLIS ---\nRéférence: {tracking}\nDescription: {description}\nType: {package_type}\n{billing_detail}\nRoute: {route}\nTransport: {transport}\n\n--- FACTURATION ---\nTotal: {shipping_cost}\nMontant déjà payé: {amount_paid}\nRESTE À PAYER: {amount_due}\n\n--- POINT DE RETRAIT ---\n{warehouse}\n\nHoraires d\'ouverture: Lundi - Samedi, 8h - 18h\n\nN\'oubliez pas de vous munir de votre pièce d\'identité.\n\nCordialement,\n{company}'
                },
                'push': 'Colis {tracking} prêt! Montant: {amount_due}'
            },
            'payment_received': {
                'sms': '[{company}] Paiement de {amount} recu pour colis {tracking}. Reste: {amount_due}. Merci!',
                'whatsapp': '💰 *Paiement reçu*\n\nBonjour {client_name},\n\nNous avons bien reçu votre paiement.\n\n📋 *Détails:*\n• Colis: {tracking}\n• Montant reçu: {amount}\n• Reste à payer: {amount_due}\n\nMerci pour votre confiance!',
                'email': {
                    'subject': 'Paiement reçu - {amount}',
                    'body': 'Bonjour {client_name},\n\nNous avons bien reçu votre paiement.\n\nDétails:\n- Colis: {tracking}\n- Montant reçu: {amount}\n- Reste à payer: {amount_due}\n\nMerci pour votre confiance.\n\nCordialement,\n{company}'
                },
                'push': 'Paiement de {amount} reçu. Merci!'
            },
            'payment_reminder': {
                'sms': '[{company}] Rappel: {amount_due} a payer pour colis {tracking}. Retrait: {warehouse}',
                'whatsapp': '⚠️ *Rappel de paiement*\n\nBonjour {client_name},\n\nVotre colis *{tracking}* est en attente de paiement.\n\n💰 *Montant dû: {amount_due}*\n\n📍 Point de retrait: {warehouse}\n\nRéglez votre solde pour récupérer votre colis.',
                'email': {
                    'subject': 'Rappel: Paiement en attente - {tracking}',
                    'body': 'Bonjour {client_name},\n\nVotre colis {tracking} est en attente de paiement.\n\nMontant dû: {amount_due}\n\nPoint de retrait: {warehouse}\n\nMerci de régulariser votre situation pour récupérer votre colis.\n\nCordialement,\n{company}'
                },
                'push': 'Rappel: {amount_due} à payer pour {tracking}'
            },
            'departure_reminder': {
                'sms': '[{company}] Depart {transport} prevu le {departure_date}. Route: {route}. Preparez vos colis!',
                'whatsapp': '📢 *Rappel de départ*\n\nBonjour,\n\nUn départ est prévu prochainement:\n\n🚀 *{transport}*\n📅 Date: {departure_date}\n🛤️ Route: {route}\n\nAssurez-vous que vos colis sont prêts!',
                'email': {
                    'subject': 'Rappel: Départ {transport} le {departure_date}',
                    'body': 'Bonjour,\n\nUn départ est prévu prochainement.\n\nDétails:\n- Transport: {transport}\n- Date: {departure_date}\n- Route: {route}\n\nAssurez-vous que vos colis sont prêts pour l\'expédition.\n\nCordialement,\n{company}'
                },
                'push': 'Départ {transport} le {departure_date}'
            }
        }
    
    return jsonify({
        'templates': templates
    })


@admin_bp.route('/settings/notifications/templates/<template_id>', methods=['PUT'])
@module_required('settings')
def admin_update_notification_template(template_id):
    """
    Mettre à jour un template de notification spécifique
    
    Args:
        template_id: Clé du template (package_received, package_shipped, etc.)
    
    Body:
        - sms: Template SMS
        - whatsapp: Template WhatsApp
        - email: { subject, body } Template Email
    """
    tenant_id = g.tenant_id
    data = request.get_json()
    
    config = TenantConfig.query.filter_by(tenant_id=tenant_id).first()
    if not config:
        config = TenantConfig(tenant_id=tenant_id, config_data={})
        db.session.add(config)
    
    if not config.config_data:
        config.config_data = {}
    
    if 'templates' not in config.config_data:
        config.config_data['templates'] = {}
    
    # Mettre à jour le template
    config.config_data['templates'][template_id] = {
        'sms': data.get('sms'),
        'whatsapp': data.get('whatsapp'),
        'email': data.get('email')
    }
    
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(config, 'config_data')
    
    db.session.commit()
    
    return jsonify({
        'message': f'Template {template_id} updated',
        'template': config.config_data['templates'][template_id]
    })


# ==================== NOTIFICATION CHANNELS (avec stats) ====================

@admin_bp.route('/settings/notifications/channels', methods=['GET'])
@module_required('settings')
def admin_get_notification_channels():
    """
    Récupérer tous les canaux de notification avec leurs stats
    
    Retourne:
        - channels: Liste des canaux avec config et stats d'envoi du mois
        - notification_types: Types de notifications configurables
    """
    from app.models import Notification
    from datetime import datetime
    
    tenant_id = g.tenant_id
    
    # Récupérer la config du tenant
    config = TenantConfig.query.filter_by(tenant_id=tenant_id).first()
    notification_config = {}
    if config and config.config_data:
        notification_config = config.config_data.get('notifications', {})
    
    # Calculer les stats du mois en cours
    month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    # Récupérer les notifications du tenant (via les users du tenant)
    from app.models import User
    tenant_users = User.query.filter_by(tenant_id=tenant_id).with_entities(User.id).all()
    user_ids = [u.id for u in tenant_users]
    
    # Stats par canal
    sms_sent = Notification.query.filter(
        Notification.user_id.in_(user_ids),
        Notification.sent_sms == True,
        Notification.created_at >= month_start
    ).count() if user_ids else 0
    
    whatsapp_sent = Notification.query.filter(
        Notification.user_id.in_(user_ids),
        Notification.sent_whatsapp == True,
        Notification.created_at >= month_start
    ).count() if user_ids else 0
    
    push_sent = Notification.query.filter(
        Notification.user_id.in_(user_ids),
        Notification.sent_push == True,
        Notification.created_at >= month_start
    ).count() if user_ids else 0
    
    email_sent = Notification.query.filter(
        Notification.user_id.in_(user_ids),
        Notification.sent_email == True,
        Notification.created_at >= month_start
    ).count() if user_ids else 0
    
    # Construire la liste des canaux
    # On considère qu'un canal est "connecté" s'il a une config provider définie
    sms_config = notification_config.get('sms', {})
    whatsapp_config = notification_config.get('whatsapp', {})
    email_config = notification_config.get('email', {})
    push_config = notification_config.get('push', {})
    
    channels = [
        {
            'id': 'sms',
            'name': 'SMS',
            'icon': 'message-square',
            'provider': sms_config.get('provider', ''),
            'connected': bool(sms_config.get('provider')),
            'enabled': sms_config.get('enabled', False),
            'config': {k: v for k, v in sms_config.get('config', {}).items() if k != 'api_key'},  # Masquer les clés sensibles
            'stats': {
                'sent_month': sms_sent,
                'delivered': sms_sent  # Approximation - idéalement tracker via webhooks
            }
        },
        {
            'id': 'whatsapp',
            'name': 'WhatsApp',
            'icon': 'message-circle',
            'provider': whatsapp_config.get('provider', 'WhatsApp Business API'),
            'connected': bool(whatsapp_config.get('provider') or whatsapp_config.get('config', {}).get('phone_id')),
            'enabled': whatsapp_config.get('enabled', False),
            'config': {k: v for k, v in whatsapp_config.get('config', {}).items() if k not in ['access_token', 'api_key']},
            'stats': {
                'sent_month': whatsapp_sent,
                'delivered': whatsapp_sent
            }
        },
        {
            'id': 'push',
            'name': 'Push',
            'icon': 'bell',
            'provider': push_config.get('provider', 'Firebase FCM'),
            'connected': True,  # Push est toujours disponible via le navigateur
            'enabled': push_config.get('enabled', True),
            'config': {},
            'stats': {
                'sent_month': push_sent,
                'delivered': push_sent
            }
        },
        {
            'id': 'email',
            'name': 'Email',
            'icon': 'mail',
            'provider': email_config.get('provider', ''),
            'connected': bool(email_config.get('provider')),
            'enabled': email_config.get('enabled', False),
            'config': {k: v for k, v in email_config.get('config', {}).items() if k not in ['api_key', 'password']},  # Masquer les clés sensibles mais garder les autres
            'stats': {
                'sent_month': email_sent,
                'delivered': email_sent
            }
        }
    ]
    
    # Types de notifications configurables
    # Récupérer la config des types ou utiliser les valeurs par défaut
    notification_types_config = notification_config.get('types', {})
    
    notification_types = [
        {
            'id': 'package_received',
            'name': 'Colis reçu en entrepôt',
            'desc': 'Quand un colis est réceptionné à l\'origine',
            'channels': notification_types_config.get('package_received', ['push'])
        },
        {
            'id': 'package_shipped',
            'name': 'Colis expédié',
            'desc': 'Quand le colis part en transit',
            'channels': notification_types_config.get('package_shipped', ['sms', 'push'])
        },
        {
            'id': 'package_arrived',
            'name': 'Colis arrivé',
            'desc': 'Quand le colis arrive à destination',
            'channels': notification_types_config.get('package_arrived', ['sms', 'whatsapp', 'push'])
        },
        {
            'id': 'ready_pickup',
            'name': 'Prêt pour retrait',
            'desc': 'Quand le colis est disponible au point de retrait',
            'channels': notification_types_config.get('ready_pickup', ['sms', 'whatsapp', 'push'])
        },
        {
            'id': 'payment_received',
            'name': 'Paiement reçu',
            'desc': 'Confirmation de réception de paiement',
            'channels': notification_types_config.get('payment_received', ['sms', 'push'])
        },
        {
            'id': 'payment_reminder',
            'name': 'Rappel de paiement',
            'desc': 'Pour les paiements en attente',
            'channels': notification_types_config.get('payment_reminder', ['sms'])
        },
        {
            'id': 'departure_reminder',
            'name': 'Rappel de départ',
            'desc': 'Avant un départ programmé',
            'channels': notification_types_config.get('departure_reminder', ['sms', 'whatsapp'])
        }
    ]
    
    return jsonify({
        'channels': channels,
        'notification_types': notification_types
    })


@admin_bp.route('/settings/notifications/channels', methods=['PUT'])
@module_required('settings')
def admin_update_notification_channels():
    """
    Mettre à jour la configuration des canaux et types de notifications
    
    Body:
        - channels: { sms: {...}, whatsapp: {...}, ... }
        - notification_types: { status_update: ['sms', 'push'], ... }
    """
    tenant_id = g.tenant_id
    data = request.get_json()
    
    config = TenantConfig.query.filter_by(tenant_id=tenant_id).first()
    if not config:
        config = TenantConfig(tenant_id=tenant_id, config_data={})
        db.session.add(config)
    
    if not config.config_data:
        config.config_data = {}
    
    if 'notifications' not in config.config_data:
        config.config_data['notifications'] = {}
    
    # Mettre à jour les canaux
    if 'channels' in data:
        for channel_id, channel_config in data['channels'].items():
            if channel_id in ['sms', 'whatsapp', 'email', 'push']:
                # Préserver les clés API existantes si non fournies
                existing = config.config_data['notifications'].get(channel_id, {})
                existing_config = existing.get('config', {})
                
                new_config = channel_config.get('config', {})
                # Fusionner en gardant les clés sensibles existantes si non remplacées
                for key in ['api_key', 'access_token']:
                    if key in existing_config and key not in new_config:
                        new_config[key] = existing_config[key]
                
                config.config_data['notifications'][channel_id] = {
                    'provider': channel_config.get('provider', existing.get('provider', '')),
                    'enabled': channel_config.get('enabled', existing.get('enabled', False)),
                    'config': new_config
                }
    
    # Mettre à jour les types de notifications
    if 'notification_types' in data:
        config.config_data['notifications']['types'] = data['notification_types']
    
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(config, 'config_data')
    
    db.session.commit()
    
    return jsonify({
        'message': 'Notification channels updated'
    })


@admin_bp.route('/settings/notifications/test', methods=['POST'])
@module_required('settings')
def admin_test_notification():
    """
    Envoyer une notification de test
    
    Body:
        - channel: 'sms' | 'whatsapp' | 'email'
        - recipient: Numéro de téléphone ou email
        - message: Message optionnel (sinon message par défaut)
    """
    tenant_id = g.tenant_id
    data = request.get_json()
    
    channel = data.get('channel')
    recipient = data.get('recipient')
    message = data.get('message', 'Ceci est un message de test de Express Cargo.')
    
    if not channel:
        return jsonify({'error': 'Channel is required'}), 400
    if not recipient:
        return jsonify({'error': 'Recipient is required'}), 400
    
    # Récupérer la config du canal
    config = TenantConfig.query.filter_by(tenant_id=tenant_id).first()
    if not config or not config.config_data:
        return jsonify({'error': 'Notification channels not configured'}), 400
    
    channel_config = config.config_data.get('notifications', {}).get(channel, {})
    
    if not channel_config.get('provider'):
        return jsonify({'error': f'{channel.upper()} channel not configured'}), 400
    
    # Envoyer via le NotificationService
    try:
        from app.services.notification_service import NotificationService
        notification_service = NotificationService(tenant_id)
        
        if channel == 'email':
            result = notification_service.send_email(
                recipient, 
                'Test Express Cargo', 
                message,
                f'<h1>Test Express Cargo</h1><p>{message}</p>'
            )
        elif channel == 'sms':
            result = notification_service.send_sms(recipient, message)
        elif channel == 'whatsapp':
            result = notification_service.send_whatsapp(recipient, message)
        else:
            return jsonify({'error': f'Channel {channel} not supported'}), 400
        
        if result.get('success'):
            return jsonify({
                'message': f'Test {channel.upper()} envoyé à {recipient}',
                'success': True,
                'provider': result.get('provider', 'unknown')
            })
        else:
            return jsonify({
                'error': f'Échec envoi {channel.upper()}: {result.get("error", "Unknown error")}',
                'success': False
            }), 500
            
    except Exception as e:
        logger.error(f"Test notification error: {str(e)}")
        return jsonify({
            'error': f'Erreur interne: {str(e)}',
            'success': False
        }), 500


# ==================== INVOICE CONFIG ====================

@admin_bp.route('/settings/invoice', methods=['GET'])
@module_required('settings')
def admin_get_invoice_settings():
    """Récupérer la configuration des factures"""
    tenant_id = g.tenant_id
    
    config = TenantConfig.query.filter_by(tenant_id=tenant_id).first()
    tenant = Tenant.query.get(tenant_id)
    
    invoice_config = {}
    if config and config.config_data:
        invoice_config = config.config_data.get('invoice', {})
    
    return jsonify({
        'invoice': {
            'logo': invoice_config.get('logo', ''),
            'header': invoice_config.get('header', ''),
            'footer': invoice_config.get('footer', ''),
            'show_logo': invoice_config.get('show_logo', True),
            'primary_color': invoice_config.get('primary_color', '#2563eb')
        },
        'company': {
            'name': tenant.name if tenant else '',
            'email': tenant.email if tenant else '',
            'phone': tenant.phone if tenant else '',
            'address': tenant.address if tenant else ''
        }
    })


@admin_bp.route('/settings/invoice', methods=['PUT'])
@module_required('settings')
def admin_update_invoice_settings():
    """
    Mettre à jour la configuration des factures
    
    Body:
        - header: Texte d'en-tête de la facture
        - footer: Texte de pied de page de la facture
        - show_logo: Afficher le logo (bool)
        - primary_color: Couleur principale (hex)
    """
    tenant_id = g.tenant_id
    data = request.get_json()
    
    config = TenantConfig.query.filter_by(tenant_id=tenant_id).first()
    if not config:
        config = TenantConfig(tenant_id=tenant_id, config_data={})
        db.session.add(config)
    
    if not config.config_data:
        config.config_data = {}
    
    if 'invoice' not in config.config_data:
        config.config_data['invoice'] = {}
    
    # Mettre à jour les champs (sauf logo qui a sa propre route)
    if 'header' in data:
        config.config_data['invoice']['header'] = data['header']
    if 'footer' in data:
        config.config_data['invoice']['footer'] = data['footer']
    if 'show_logo' in data:
        config.config_data['invoice']['show_logo'] = data['show_logo']
    if 'primary_color' in data:
        config.config_data['invoice']['primary_color'] = data['primary_color']
    
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(config, 'config_data')
    
    db.session.commit()
    
    return jsonify({
        'message': 'Invoice settings updated',
        'invoice': config.config_data.get('invoice', {})
    })


@admin_bp.route('/settings/invoice/logo', methods=['POST'])
@module_required('settings')
def admin_upload_invoice_logo():
    """
    Upload du logo pour les factures (base64)
    
    Body:
        - logo: Image en base64 (data:image/png;base64,...)
    """
    tenant_id = g.tenant_id
    data = request.get_json()
    
    logo = data.get('logo', '')
    
    # Validation basique du format base64
    if logo and not logo.startswith('data:image/'):
        return jsonify({'error': 'Invalid image format. Must be base64 data URL'}), 400
    
    # Limiter la taille (environ 500KB en base64)
    if len(logo) > 700000:
        return jsonify({'error': 'Image too large. Max 500KB'}), 400
    
    config = TenantConfig.query.filter_by(tenant_id=tenant_id).first()
    if not config:
        config = TenantConfig(tenant_id=tenant_id, config_data={})
        db.session.add(config)
    
    if not config.config_data:
        config.config_data = {}
    
    if 'invoice' not in config.config_data:
        config.config_data['invoice'] = {}
    
    config.config_data['invoice']['logo'] = logo
    
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(config, 'config_data')
    
    db.session.commit()
    
    return jsonify({
        'message': 'Logo uploaded successfully',
        'logo': logo[:100] + '...' if len(logo) > 100 else logo  # Truncate for response
    })


@admin_bp.route('/settings/invoice/logo', methods=['DELETE'])
@module_required('settings')
def admin_delete_invoice_logo():
    """Supprimer le logo des factures"""
    tenant_id = g.tenant_id
    
    config = TenantConfig.query.filter_by(tenant_id=tenant_id).first()
    if config and config.config_data and 'invoice' in config.config_data:
        config.config_data['invoice']['logo'] = ''
        
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(config, 'config_data')
        
        db.session.commit()
    
    return jsonify({'message': 'Logo deleted'})
