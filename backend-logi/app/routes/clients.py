from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity
from app import db
from app.models import User
from app.utils.decorators import tenant_required

clients_bp = Blueprint('clients', __name__)


@clients_bp.route('/profile', methods=['GET'])
@tenant_required
def get_profile():
    """Récupérer le profil complet du client"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    return jsonify({'profile': user.to_dict(include_private=True)})


@clients_bp.route('/profile', methods=['PUT'])
@tenant_required
def update_profile():
    """Mettre à jour le profil du client"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    data = request.get_json()
    
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    # Champs modifiables
    allowed_fields = ['first_name', 'last_name', 'phone']
    for field in allowed_fields:
        if field in data:
            setattr(user, field, data[field])
    
    db.session.commit()
    
    return jsonify({
        'message': 'Profile updated',
        'profile': user.to_dict(include_private=True)
    })


@clients_bp.route('/settings/notifications', methods=['PUT'])
@tenant_required
def update_notification_settings():
    """Mettre à jour les préférences de notification"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    data = request.get_json()
    
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    if 'notify_email' in data:
        user.notify_email = bool(data['notify_email'])
    if 'notify_sms' in data:
        user.notify_sms = bool(data['notify_sms'])
    if 'notify_push' in data:
        user.notify_push = bool(data['notify_push'])
    
    db.session.commit()
    
    return jsonify({
        'message': 'Notification settings updated',
        'settings': {
            'notify_email': user.notify_email,
            'notify_sms': user.notify_sms,
            'notify_push': user.notify_push
        }
    })
