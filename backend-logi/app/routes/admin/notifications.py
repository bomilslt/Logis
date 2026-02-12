"""
Routes Admin - Envoi de notifications
Envoi de SMS, WhatsApp, Email aux clients
"""

from flask import request, jsonify, g
from flask_jwt_extended import get_jwt_identity
from app import db
from app.routes.admin import admin_bp
from app.models import Notification, User
from app.utils.decorators import admin_required
from app.services.notification_service import NotificationService


@admin_bp.route('/notifications/status', methods=['GET'])
@admin_required
def admin_notification_status():
    """
    Vérifie le statut des services de notification configurés
    
    Returns:
        Statut de chaque canal (SMS, WhatsApp, Email)
    """
    tenant_id = g.tenant_id
    
    service = NotificationService(tenant_id)
    status = service.get_status()
    
    return jsonify({
        'status': status
    })


@admin_bp.route('/notifications/send', methods=['POST'])
@admin_required
def admin_send_notification():
    """
    Envoyer une notification à un client
    
    Body:
        - client_id: ID du client (requis)
        - title: Titre
        - message: Message (requis)
        - type: Type (info, status_update, payment, etc.)
        - channels: Canaux ['push', 'sms', 'whatsapp', 'email']
        - html_email: Version HTML pour l'email (optionnel)
    """
    tenant_id = g.tenant_id
    user_id = get_jwt_identity()
    data = request.get_json()
    
    if not data.get('client_id'):
        return jsonify({'error': 'Client ID is required'}), 400
    
    if not data.get('message'):
        return jsonify({'error': 'Message is required'}), 400
    
    # Vérifier que le client existe
    client = User.query.filter_by(
        id=data['client_id'], 
        tenant_id=tenant_id
    ).first()
    
    if not client:
        return jsonify({'error': 'Client not found'}), 404
    
    channels = data.get('channels', ['push'])
    title = data.get('title', 'Notification')
    message = data['message']
    
    # Initialiser le service
    service = NotificationService(tenant_id)
    
    # Envoyer la notification
    results = service.send_notification(
        user=client,
        title=title,
        message=message,
        channels=channels,
        html_email=data.get('html_email')
    )
    
    # Mettre à jour la notification in-app avec les canaux utilisés
    if 'push' in results and results['push'].get('success'):
        notification_id = results['push'].get('notification_id')
        if notification_id:
            notification = Notification.query.get(notification_id)
            if notification:
                notification.sent_push = True
                notification.sent_sms = 'sms' in results and results['sms'].get('success', False)
                notification.sent_whatsapp = 'whatsapp' in results and results['whatsapp'].get('success', False)
                notification.sent_email = 'email' in results and results['email'].get('success', False)
                notification.type = data.get('type', 'info')
                db.session.commit()
    
    return jsonify({
        'message': 'Notification sent',
        'results': results
    })


@admin_bp.route('/notifications/send-bulk', methods=['POST'])
@admin_required
def admin_send_bulk_notification():
    """
    Envoyer une notification à plusieurs clients
    
    Body:
        - client_ids: Liste des IDs clients (requis)
        - title: Titre
        - message: Message (requis)
        - type: Type
        - channels: Canaux
    """
    tenant_id = g.tenant_id
    data = request.get_json()
    
    client_ids = data.get('client_ids', [])
    if not client_ids:
        return jsonify({'error': 'Client IDs are required'}), 400
    
    if not data.get('message'):
        return jsonify({'error': 'Message is required'}), 400
    
    # Récupérer les clients
    clients = User.query.filter(
        User.id.in_(client_ids),
        User.tenant_id == tenant_id
    ).all()
    
    if not clients:
        return jsonify({'error': 'No valid clients found'}), 404
    
    channels = data.get('channels', ['push'])
    title = data.get('title', 'Notification')
    message = data['message']
    
    # Initialiser le service
    service = NotificationService(tenant_id)
    
    # Envoyer en masse
    stats = service.send_bulk_notification(
        users=clients,
        title=title,
        message=message,
        channels=channels
    )
    
    return jsonify({
        'message': f'Notifications sent to {stats["success"]} clients',
        'stats': stats
    })


@admin_bp.route('/notifications/sms', methods=['POST'])
@admin_required
def admin_send_sms():
    """
    Envoyer un SMS direct
    
    Body:
        - phone: Numéro de téléphone (requis)
        - message: Message (requis)
    """
    tenant_id = g.tenant_id
    data = request.get_json()
    
    if not data.get('phone'):
        return jsonify({'error': 'Phone number is required'}), 400
    
    if not data.get('message'):
        return jsonify({'error': 'Message is required'}), 400
    
    service = NotificationService(tenant_id)
    result = service.send_sms(data['phone'], data['message'])
    
    if result.get('success'):
        return jsonify({
            'message': 'SMS sent',
            'result': result
        })
    else:
        return jsonify({
            'error': result.get('error', 'Failed to send SMS'),
            'result': result
        }), 500


@admin_bp.route('/notifications/whatsapp', methods=['POST'])
@admin_required
def admin_send_whatsapp():
    """
    Envoyer un message WhatsApp direct
    
    Body:
        - phone: Numéro de téléphone (requis)
        - message: Message (requis)
        - template: Template ID (optionnel)
        - parameters: Paramètres du template (optionnel)
    """
    tenant_id = g.tenant_id
    data = request.get_json()
    
    if not data.get('phone'):
        return jsonify({'error': 'Phone number is required'}), 400
    
    if not data.get('message') and not data.get('template'):
        return jsonify({'error': 'Message or template is required'}), 400
    
    service = NotificationService(tenant_id)
    result = service.send_whatsapp(
        data['phone'], 
        data.get('message', ''),
        template=data.get('template'),
        parameters=data.get('parameters')
    )
    
    if result.get('success'):
        return jsonify({
            'message': 'WhatsApp message sent',
            'result': result
        })
    else:
        return jsonify({
            'error': result.get('error', 'Failed to send WhatsApp'),
            'result': result
        }), 500


@admin_bp.route('/notifications/email', methods=['POST'])
@admin_required
def admin_send_email():
    """
    Envoyer un email direct
    
    Body:
        - email: Adresse email (requis)
        - subject: Sujet (requis)
        - message: Message texte (requis)
        - html: Message HTML (optionnel)
    """
    tenant_id = g.tenant_id
    data = request.get_json()
    
    if not data.get('email'):
        return jsonify({'error': 'Email address is required'}), 400
    
    if not data.get('subject'):
        return jsonify({'error': 'Subject is required'}), 400
    
    if not data.get('message'):
        return jsonify({'error': 'Message is required'}), 400
    
    service = NotificationService(tenant_id)
    result = service.send_email(
        data['email'], 
        data['subject'],
        data['message'],
        html=data.get('html')
    )
    
    if result.get('success'):
        return jsonify({
            'message': 'Email sent',
            'result': result
        })
    else:
        return jsonify({
            'error': result.get('error', 'Failed to send email'),
            'result': result
        }), 500


@admin_bp.route('/notifications/test', methods=['POST'])
@admin_required
def admin_send_test_notification():
    """
    Tester l'envoi de notification
    
    Body:
        - channel: Canal à tester (sms, whatsapp, email)
        - recipient: Destinataire (phone ou email)
    """
    tenant_id = g.tenant_id
    data = request.get_json()
    
    channel = data.get('channel')
    recipient = data.get('recipient')
    
    if not channel:
        return jsonify({'error': 'Channel is required'}), 400
    
    if not recipient:
        return jsonify({'error': 'Recipient is required'}), 400
    
    service = NotificationService(tenant_id)
    
    if channel == 'sms':
        result = service.test_sms(recipient)
    elif channel == 'whatsapp':
        result = service.test_whatsapp(recipient)
    elif channel == 'email':
        result = service.test_email(recipient)
    else:
        return jsonify({'error': f'Invalid channel: {channel}'}), 400
    
    if result.get('success'):
        return jsonify({
            'message': f'Test {channel} sent successfully',
            'result': result
        })
    else:
        return jsonify({
            'error': f'Failed to send test {channel}',
            'details': result.get('error'),
            'result': result
        }), 500


@admin_bp.route('/notifications/templates', methods=['GET'])
@admin_required
def admin_list_notification_templates():
    """Récupère les templates de notification configurés"""
    tenant_id = g.tenant_id
    
    service = NotificationService(tenant_id)
    templates = service.get_templates()
    
    return jsonify({
        'templates': templates
    })


@admin_bp.route('/notifications/send-template', methods=['POST'])
@admin_required
def admin_send_template_notification():
    """
    Envoyer une notification basée sur un template
    
    Body:
        - client_id: ID du client (requis)
        - template: Clé du template (requis)
        - variables: Variables pour le template
        - channels: Canaux (optionnel)
    """
    tenant_id = g.tenant_id
    data = request.get_json()
    
    if not data.get('client_id'):
        return jsonify({'error': 'Client ID is required'}), 400
    
    if not data.get('template'):
        return jsonify({'error': 'Template key is required'}), 400
    
    client = User.query.filter_by(
        id=data['client_id'], 
        tenant_id=tenant_id
    ).first()
    
    if not client:
        return jsonify({'error': 'Client not found'}), 404
    
    service = NotificationService(tenant_id)
    
    results = service.send_templated_notification(
        user=client,
        template_key=data['template'],
        variables=data.get('variables', {}),
        channels=data.get('channels')
    )
    
    return jsonify({
        'message': 'Template notification sent',
        'results': results
    })


# ==================== PUSH NOTIFICATIONS ADMIN ====================

@admin_bp.route('/notifications/push/send', methods=['POST'])
@admin_required
def admin_send_push():
    """
    Envoyer une notification push directe
    
    Body:
        - client_id: ID du client (requis si pas de token)
        - token: Token push direct (optionnel)
        - title: Titre (requis)
        - message: Message (requis)
        - data: Données additionnelles (optionnel)
    """
    tenant_id = g.tenant_id
    data = request.get_json()
    
    if not data.get('title'):
        return jsonify({'error': 'Title is required'}), 400
    
    if not data.get('message'):
        return jsonify({'error': 'Message is required'}), 400
    
    service = NotificationService(tenant_id)
    
    # Envoi direct à un token
    if data.get('token'):
        result = service.send_push_to_token(
            token=data['token'],
            title=data['title'],
            message=data['message'],
            data=data.get('data')
        )
    # Envoi à un client (via ses tokens enregistrés)
    elif data.get('client_id'):
        client = User.query.filter_by(
            id=data['client_id'],
            tenant_id=tenant_id
        ).first()
        
        if not client:
            return jsonify({'error': 'Client not found'}), 404
        
        result = service.send_push(
            user_id=client.id,
            title=data['title'],
            message=data['message'],
            data=data.get('data')
        )
    else:
        return jsonify({'error': 'client_id or token is required'}), 400
    
    if result.get('success'):
        return jsonify({
            'message': 'Push notification sent',
            'result': result
        })
    else:
        return jsonify({
            'error': result.get('error', 'Failed to send push'),
            'result': result
        }), 500


@admin_bp.route('/notifications/push/topic', methods=['POST'])
@admin_required
def admin_send_push_topic():
    """
    Envoyer une notification push à un topic/segment
    
    Body:
        - topic: Nom du topic (requis)
        - title: Titre (requis)
        - message: Message (requis)
        - data: Données additionnelles (optionnel)
    """
    tenant_id = g.tenant_id
    data = request.get_json()
    
    if not data.get('topic'):
        return jsonify({'error': 'Topic is required'}), 400
    
    if not data.get('title'):
        return jsonify({'error': 'Title is required'}), 400
    
    if not data.get('message'):
        return jsonify({'error': 'Message is required'}), 400
    
    service = NotificationService(tenant_id)
    
    result = service.send_push_to_topic(
        topic=data['topic'],
        title=data['title'],
        message=data['message'],
        data=data.get('data')
    )
    
    if result.get('success'):
        return jsonify({
            'message': f'Push notification sent to topic {data["topic"]}',
            'result': result
        })
    else:
        return jsonify({
            'error': result.get('error', 'Failed to send push to topic'),
            'result': result
        }), 500


@admin_bp.route('/notifications/push/broadcast', methods=['POST'])
@admin_required
def admin_broadcast_push():
    """
    Envoyer une notification push à tous les clients
    
    Body:
        - title: Titre (requis)
        - message: Message (requis)
        - data: Données additionnelles (optionnel)
        - filter: Filtre optionnel (active_only, etc.)
    """
    tenant_id = g.tenant_id
    data = request.get_json()
    
    if not data.get('title'):
        return jsonify({'error': 'Title is required'}), 400
    
    if not data.get('message'):
        return jsonify({'error': 'Message is required'}), 400
    
    from app.models import PushSubscription
    
    # Récupérer tous les tokens actifs du tenant
    subscriptions = PushSubscription.query.filter_by(
        tenant_id=tenant_id,
        is_active=True
    ).all()
    
    if not subscriptions:
        return jsonify({
            'error': 'No active push subscriptions found',
            'sent': 0
        }), 404
    
    service = NotificationService(tenant_id)
    
    if not service.push_service:
        return jsonify({'error': 'Push service not configured'}), 400
    
    # Grouper par provider pour optimiser l'envoi
    tokens_by_provider = {}
    for sub in subscriptions:
        if sub.provider not in tokens_by_provider:
            tokens_by_provider[sub.provider] = []
        tokens_by_provider[sub.provider].append(sub.token)
    
    # Envoyer via le service (utilise send_to_tokens pour l'envoi groupé)
    all_tokens = [sub.token for sub in subscriptions]
    result = service.push_service.send_to_tokens(
        tokens=all_tokens,
        title=data['title'],
        body=data['message'],
        data=data.get('data')
    )
    
    return jsonify({
        'message': f'Broadcast sent to {len(subscriptions)} devices',
        'total_devices': len(subscriptions),
        'result': result
    })


@admin_bp.route('/notifications/push/subscriptions', methods=['GET'])
@admin_required
def admin_list_push_subscriptions():
    """
    Liste toutes les subscriptions push du tenant
    
    Query params:
        - page: Page (défaut: 1)
        - per_page: Éléments par page (défaut: 50)
        - provider: Filtrer par provider
        - device_type: Filtrer par type d'appareil
    """
    tenant_id = g.tenant_id
    
    from app.models import PushSubscription
    
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 50, type=int)
    provider = request.args.get('provider')
    device_type = request.args.get('device_type')
    
    query = PushSubscription.query.filter_by(tenant_id=tenant_id)
    
    if provider:
        query = query.filter_by(provider=provider)
    if device_type:
        query = query.filter_by(device_type=device_type)
    
    # Stats
    total_active = PushSubscription.query.filter_by(
        tenant_id=tenant_id, 
        is_active=True
    ).count()
    
    pagination = query.order_by(
        PushSubscription.created_at.desc()
    ).paginate(page=page, per_page=per_page, error_out=False)
    
    return jsonify({
        'subscriptions': [sub.to_dict() for sub in pagination.items],
        'total': pagination.total,
        'total_active': total_active,
        'pages': pagination.pages,
        'current_page': page
    })


@admin_bp.route('/notifications/push/test', methods=['POST'])
@admin_required
def admin_test_push():
    """
    Tester l'envoi de notification push
    
    Body:
        - token: Token de test (optionnel, utilise le premier token du tenant sinon)
    """
    tenant_id = g.tenant_id
    data = request.get_json() or {}
    
    service = NotificationService(tenant_id)
    
    if not service.push_service:
        return jsonify({
            'error': 'Push service not configured',
            'status': service.get_status().get('push')
        }), 400
    
    # Utiliser le token fourni ou trouver un token de test
    token = data.get('token')
    
    if not token:
        from app.models import PushSubscription
        sub = PushSubscription.query.filter_by(
            tenant_id=tenant_id,
            is_active=True
        ).first()
        
        if sub:
            token = sub.token
        else:
            return jsonify({
                'error': 'No token provided and no active subscriptions found'
            }), 400
    
    result = service.push_service.send_to_token(
        token=token,
        title='Test Push Notification',
        body='Ceci est un test de notification push. Express Cargo.',
        data={'test': True}
    )
    
    if result.get('success'):
        return jsonify({
            'message': 'Test push sent successfully',
            'result': result
        })
    else:
        return jsonify({
            'error': 'Failed to send test push',
            'result': result
        }), 500
