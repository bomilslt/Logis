"""
Routes Devices - Gestion des appareils utilisateur
===================================================

Endpoints pour:
- Enregistrer un appareil
- Vérifier l'intégrité d'un appareil
- Lister les appareils de l'utilisateur
- Révoquer un appareil
"""

from flask import Blueprint, request, jsonify, g
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import db
from app.models import UserDevice, Tenant
from app.services.device_integrity_service import device_integrity_service
from app.utils.decorators import tenant_required
import logging

devices_bp = Blueprint('devices', __name__)
logger = logging.getLogger(__name__)


def get_client_ip():
    """Récupère l'IP du client"""
    if request.headers.get('X-Forwarded-For'):
        return request.headers.get('X-Forwarded-For').split(',')[0].strip()
    return request.remote_addr


@devices_bp.route('/register', methods=['POST'])
@tenant_required
def register_device():
    """
    Enregistre un nouvel appareil pour l'utilisateur connecté.
    
    Body:
        - device_id: Identifiant unique de l'appareil (requis)
        - device_name: Nom de l'appareil ("iPhone 15 Pro")
        - device_model: Modèle technique
        - platform: android, ios, windows, macos (requis)
        - os_version: Version de l'OS
        - app_version: Version de l'application
        - channel: Canal d'accès (app_android_client, app_ios_client, etc.)
        - push_token: Token pour les notifications push
    """
    user_id = get_jwt_identity()
    data = request.get_json()
    
    # Validation
    if not data.get('device_id'):
        return jsonify({'error': 'device_id is required'}), 400
    if not data.get('platform'):
        return jsonify({'error': 'platform is required'}), 400
    
    valid_platforms = ['android', 'ios', 'windows', 'macos', 'linux']
    if data['platform'].lower() not in valid_platforms:
        return jsonify({'error': f'Invalid platform. Must be one of: {valid_platforms}'}), 400
    
    try:
        device = device_integrity_service.register_device(
            user_id=user_id,
            tenant_id=g.tenant_id,
            device_info={
                'device_id': data['device_id'],
                'device_name': data.get('device_name'),
                'device_model': data.get('device_model'),
                'platform': data['platform'].lower(),
                'os_version': data.get('os_version'),
                'app_version': data.get('app_version'),
                'channel': data.get('channel'),
                'push_token': data.get('push_token')
            },
            ip_address=get_client_ip()
        )
        
        return jsonify({
            'message': 'Device registered',
            'device': device.to_dict(),
            'requires_verification': not device.integrity_verified
        }), 201
        
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.exception(f"Device registration error: {e}")
        return jsonify({'error': 'Failed to register device'}), 500


@devices_bp.route('/verify', methods=['POST'])
@tenant_required
def verify_device_integrity():
    """
    Vérifie l'intégrité d'un appareil enregistré.
    
    Body:
        - device_id: ID de l'appareil dans la DB (ou raw device_id)
        - integrity_token: Token Play Integrity (Android) ou DeviceCheck (iOS)
    """
    import asyncio
    
    user_id = get_jwt_identity()
    data = request.get_json()
    
    device_id = data.get('device_id')
    integrity_token = data.get('integrity_token')
    
    if not device_id or not integrity_token:
        return jsonify({'error': 'device_id and integrity_token are required'}), 400
    
    # Trouver l'appareil
    device = UserDevice.query.filter_by(id=device_id, user_id=user_id).first()
    
    if not device:
        # Essayer avec le hash du device_id
        hashed_id = UserDevice.hash_device_id(device_id)
        device = UserDevice.query.filter_by(device_id=hashed_id, user_id=user_id).first()
    
    if not device:
        return jsonify({'error': 'Device not found'}), 404
    
    if not device.is_active:
        return jsonify({'error': 'Device has been revoked'}), 403
    
    try:
        # Exécuter la vérification async
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        result = loop.run_until_complete(
            device_integrity_service.verify_device(
                device=device,
                integrity_token=integrity_token,
                ip_address=get_client_ip(),
                user_agent=request.headers.get('User-Agent')
            )
        )
        loop.close()
        
        if result.get('success'):
            return jsonify({
                'message': 'Device verified',
                'verified': True,
                'device': device.to_dict()
            })
        else:
            return jsonify({
                'message': 'Verification failed',
                'verified': False,
                'error': result.get('error'),
                'device': device.to_dict()
            }), 400
            
    except Exception as e:
        logger.exception(f"Device verification error: {e}")
        return jsonify({'error': 'Verification failed'}), 500


@devices_bp.route('', methods=['GET'])
@tenant_required
def list_user_devices():
    """
    Liste les appareils de l'utilisateur connecté.
    
    Query params:
        - include_revoked: true pour inclure les appareils révoqués
    """
    user_id = get_jwt_identity()
    include_revoked = request.args.get('include_revoked', 'false').lower() == 'true'
    
    devices = device_integrity_service.get_user_devices(
        user_id=user_id,
        active_only=not include_revoked
    )
    
    # Infos sur les limites
    tenant = Tenant.query.get(g.tenant_id)
    max_devices = tenant.get_entitlement('max_devices_per_user', 3) if tenant else 3
    active_count = sum(1 for d in devices if d.is_active)
    
    return jsonify({
        'devices': [d.to_dict() for d in devices],
        'active_count': active_count,
        'max_devices': max_devices,
        'can_add_more': active_count < max_devices
    })


@devices_bp.route('/<device_id>', methods=['GET'])
@tenant_required
def get_device(device_id):
    """Récupère les détails d'un appareil"""
    user_id = get_jwt_identity()
    
    device = UserDevice.query.filter_by(id=device_id, user_id=user_id).first()
    
    if not device:
        return jsonify({'error': 'Device not found'}), 404
    
    return jsonify({'device': device.to_dict()})


@devices_bp.route('/<device_id>', methods=['DELETE'])
@tenant_required
def revoke_user_device(device_id):
    """
    Révoque un appareil de l'utilisateur.
    L'appareil ne pourra plus accéder à l'application.
    """
    user_id = get_jwt_identity()
    
    device = UserDevice.query.filter_by(id=device_id, user_id=user_id).first()
    
    if not device:
        return jsonify({'error': 'Device not found'}), 404
    
    if not device.is_active:
        return jsonify({'error': 'Device already revoked'}), 400
    
    device.revoke(reason='Revoked by user')
    db.session.commit()
    
    logger.info(f"Device {device_id} revoked by user {user_id}")
    
    return jsonify({
        'message': 'Device revoked',
        'device': device.to_dict()
    })


@devices_bp.route('/<device_id>/trust', methods=['POST'])
@tenant_required
def toggle_device_trust(device_id):
    """
    Marque/démarque un appareil comme appareil de confiance.
    Les appareils de confiance peuvent avoir des privilèges supplémentaires.
    """
    user_id = get_jwt_identity()
    data = request.get_json() or {}
    
    device = UserDevice.query.filter_by(id=device_id, user_id=user_id).first()
    
    if not device:
        return jsonify({'error': 'Device not found'}), 404
    
    if not device.is_active:
        return jsonify({'error': 'Cannot trust a revoked device'}), 400
    
    # Toggle ou valeur explicite
    if 'trusted' in data:
        device.is_trusted = bool(data['trusted'])
    else:
        device.is_trusted = not device.is_trusted
    
    db.session.commit()
    
    return jsonify({
        'message': f'Device {"trusted" if device.is_trusted else "untrusted"}',
        'device': device.to_dict()
    })


@devices_bp.route('/<device_id>/push-token', methods=['PUT'])
@tenant_required
def update_push_token(device_id):
    """
    Met à jour le token push d'un appareil.
    
    Body:
        - push_token: Nouveau token FCM ou APNs
    """
    from datetime import datetime
    
    user_id = get_jwt_identity()
    data = request.get_json()
    
    if not data.get('push_token'):
        return jsonify({'error': 'push_token is required'}), 400
    
    device = UserDevice.query.filter_by(id=device_id, user_id=user_id).first()
    
    if not device:
        return jsonify({'error': 'Device not found'}), 404
    
    if not device.is_active:
        return jsonify({'error': 'Device is revoked'}), 400
    
    device.push_token = data['push_token']
    device.push_token_updated_at = datetime.utcnow()
    db.session.commit()
    
    return jsonify({
        'message': 'Push token updated',
        'device': device.to_dict()
    })
