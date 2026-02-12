from flask import Blueprint, request, jsonify
from flask_jwt_extended import get_jwt_identity
from app import db
from app.models import Notification, User, PushSubscription
from app.utils.decorators import tenant_required
from datetime import datetime

notifications_bp = Blueprint('notifications', __name__)


@notifications_bp.route('', methods=['GET'])
@tenant_required
def get_notifications():
    """Liste des notifications de l'utilisateur"""
    user_id = get_jwt_identity()
    
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    unread_only = request.args.get('unread_only', 'false').lower() == 'true'
    
    query = Notification.query.filter_by(user_id=user_id)
    
    if unread_only:
        query = query.filter_by(is_read=False)
    
    query = query.order_by(Notification.created_at.desc())
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)
    
    return jsonify({
        'notifications': [n.to_dict() for n in pagination.items],
        'total': pagination.total,
        'unread_count': Notification.query.filter_by(user_id=user_id, is_read=False).count(),
        'pages': pagination.pages,
        'current_page': page
    })


@notifications_bp.route('/<notification_id>/read', methods=['POST'])
@tenant_required
def mark_as_read(notification_id):
    """Marquer une notification comme lue"""
    user_id = get_jwt_identity()
    
    notification = Notification.query.filter_by(
        id=notification_id,
        user_id=user_id
    ).first()
    
    if not notification:
        return jsonify({'error': 'Notification not found'}), 404
    
    notification.mark_as_read()
    db.session.commit()
    
    return jsonify({'message': 'Notification marked as read'})


@notifications_bp.route('/read-all', methods=['POST'])
@tenant_required
def mark_all_as_read():
    """Marquer toutes les notifications comme lues"""
    user_id = get_jwt_identity()
    
    Notification.query.filter_by(
        user_id=user_id,
        is_read=False
    ).update({
        'is_read': True,
        'read_at': datetime.utcnow()
    })
    
    db.session.commit()
    
    return jsonify({'message': 'All notifications marked as read'})


@notifications_bp.route('/<notification_id>', methods=['DELETE'])
@tenant_required
def delete_notification(notification_id):
    """Supprimer une notification"""
    user_id = get_jwt_identity()
    
    notification = Notification.query.filter_by(
        id=notification_id,
        user_id=user_id
    ).first()
    
    if not notification:
        return jsonify({'error': 'Notification not found'}), 404
    
    db.session.delete(notification)
    db.session.commit()
    
    return jsonify({'message': 'Notification deleted'})


@notifications_bp.route('', methods=['DELETE'])
@tenant_required
def delete_all_notifications():
    """Supprimer toutes les notifications de l'utilisateur"""
    user_id = get_jwt_identity()
    
    deleted_count = Notification.query.filter_by(user_id=user_id).delete()
    db.session.commit()
    
    return jsonify({
        'message': 'All notifications deleted',
        'deleted_count': deleted_count
    })


@notifications_bp.route('/unread-count', methods=['GET'])
@tenant_required
def get_unread_count():
    """Nombre de notifications non lues"""
    user_id = get_jwt_identity()
    
    count = Notification.query.filter_by(
        user_id=user_id,
        is_read=False
    ).count()
    
    return jsonify({'unread_count': count})


# ==================== PUSH SUBSCRIPTIONS ====================

@notifications_bp.route('/push/subscribe', methods=['POST'])
@tenant_required
def subscribe_push():
    """
    Enregistre un abonnement push pour l'utilisateur
    
    Body JSON:
        - token: Token FCM/OneSignal ou subscription WebPush (JSON)
        - provider: firebase, onesignal, webpush
        - device_type: web, android, ios (optionnel, défaut: web)
        - device_name: Nom de l'appareil (optionnel)
    """
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    data = request.get_json()
    
    token = data.get('token')
    provider = data.get('provider')
    
    if not token or not provider:
        return jsonify({'error': 'token and provider are required'}), 400
    
    # Valider le provider
    valid_providers = ['firebase', 'fcm', 'onesignal', 'webpush', 'vapid']
    if provider.lower() not in valid_providers:
        return jsonify({
            'error': f'Invalid provider. Valid: {valid_providers}'
        }), 400
    
    # Normaliser le provider
    provider = provider.lower()
    if provider == 'fcm':
        provider = 'firebase'
    elif provider == 'vapid':
        provider = 'webpush'
    
    try:
        subscription = PushSubscription.subscribe(
            user_id=user_id,
            tenant_id=user.tenant_id,
            token=token,
            provider=provider,
            device_type=data.get('device_type', 'web'),
            device_name=data.get('device_name'),
            user_agent=request.headers.get('User-Agent')
        )
        
        db.session.commit()
        
        return jsonify({
            'message': 'Push subscription registered',
            'subscription_id': subscription.id
        }), 201
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@notifications_bp.route('/push/unsubscribe', methods=['POST'])
@tenant_required
def unsubscribe_push():
    """
    Désactive un abonnement push
    
    Body JSON:
        - token: Token à désactiver
    """
    user_id = get_jwt_identity()
    data = request.get_json()
    
    token = data.get('token')
    if not token:
        return jsonify({'error': 'token is required'}), 400
    
    success = PushSubscription.unsubscribe(user_id, token)
    
    if success:
        db.session.commit()
        return jsonify({'message': 'Push subscription removed'})
    else:
        return jsonify({'error': 'Subscription not found'}), 404


@notifications_bp.route('/push/subscriptions', methods=['GET'])
@tenant_required
def list_push_subscriptions():
    """Liste les abonnements push de l'utilisateur"""
    user_id = get_jwt_identity()
    
    subscriptions = PushSubscription.query.filter_by(
        user_id=user_id,
        is_active=True
    ).all()
    
    return jsonify({
        'subscriptions': [sub.to_dict() for sub in subscriptions]
    })


@notifications_bp.route('/push/subscriptions/<subscription_id>', methods=['DELETE'])
@tenant_required
def delete_push_subscription(subscription_id):
    """Supprime un abonnement push spécifique"""
    user_id = get_jwt_identity()
    
    subscription = PushSubscription.query.filter_by(
        id=subscription_id,
        user_id=user_id
    ).first()
    
    if not subscription:
        return jsonify({'error': 'Subscription not found'}), 404
    
    subscription.is_active = False
    db.session.commit()
    
    return jsonify({'message': 'Subscription removed'})


@notifications_bp.route('/push/vapid-key', methods=['GET'])
@tenant_required
def get_vapid_public_key():
    """
    Récupère la clé publique VAPID pour les subscriptions WebPush
    Nécessaire côté frontend pour s'abonner aux notifications
    """
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    # Charger la config du tenant
    from app.models import TenantConfig
    config = TenantConfig.query.filter_by(tenant_id=user.tenant_id).first()
    
    if not config or not config.config_data:
        return jsonify({'error': 'Push not configured'}), 404
    
    push_config = config.config_data.get('notifications', {}).get('push', {})
    
    if push_config.get('provider') != 'webpush':
        return jsonify({'error': 'WebPush not configured'}), 404
    
    vapid_public_key = push_config.get('config', {}).get('vapid_public_key')
    
    if not vapid_public_key:
        return jsonify({'error': 'VAPID key not configured'}), 404
    
    return jsonify({
        'vapid_public_key': vapid_public_key
    })
