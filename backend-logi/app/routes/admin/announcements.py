"""
Routes Admin - Gestion des annonces
Publication et gestion des communications vers les clients
"""

from flask import request, jsonify, g
from flask_jwt_extended import get_jwt_identity
from app import db
from app.routes.admin import admin_bp
from app.models import Announcement
from app.utils.decorators import admin_required, module_required
from datetime import datetime


@admin_bp.route('/announcements', methods=['GET'])
@module_required('communication')
def admin_get_announcements():
    """
    Liste des annonces
    
    Query params:
        - active_only: Filtrer les annonces actives uniquement
    """
    tenant_id = g.tenant_id
    active_only = request.args.get('active_only', 'false').lower() == 'true'
    
    query = Announcement.query.filter_by(tenant_id=tenant_id)
    
    if active_only:
        query = query.filter_by(is_active=True)
    
    announcements = query.order_by(
        Announcement.priority.desc(),
        Announcement.created_at.desc()
    ).all()
    
    return jsonify({
        'announcements': [a.to_dict() for a in announcements]
    })


@admin_bp.route('/announcements/<announcement_id>', methods=['GET'])
@module_required('communication')
def admin_get_announcement(announcement_id):
    """Détails d'une annonce"""
    tenant_id = g.tenant_id
    
    announcement = Announcement.query.filter_by(
        id=announcement_id, 
        tenant_id=tenant_id
    ).first()
    
    if not announcement:
        return jsonify({'error': 'Announcement not found'}), 404
    
    return jsonify({
        'announcement': announcement.to_dict()
    })


@admin_bp.route('/announcements', methods=['POST'])
@module_required('communication')
def admin_create_announcement():
    """
    Créer une annonce
    
    Body:
        - title: Titre (requis)
        - content: Contenu (requis)
        - type: Type (info, warning, promo, urgent)
        - is_active: Activer immédiatement
        - start_date, end_date: Période de validité
        - priority: Priorité d'affichage
        - notify_clients: Envoyer une notification aux clients (bool)
        - notify_channels: Canaux de notification ['push', 'sms', 'email']
    """
    tenant_id = g.tenant_id
    user_id = get_jwt_identity()
    data = request.get_json()
    
    # Validation
    if not data.get('title'):
        return jsonify({'error': 'Title is required'}), 400
    
    if not data.get('content'):
        return jsonify({'error': 'Content is required'}), 400
    
    announcement = Announcement(
        tenant_id=tenant_id,
        title=data['title'],
        content=data['content'],
        type=data.get('type', 'info'),
        is_active=data.get('is_active', True),
        priority=data.get('priority', 0),
        created_by=user_id
    )
    
    # Dates de validité
    if data.get('start_date'):
        announcement.start_date = datetime.strptime(data['start_date'], '%Y-%m-%d')
    
    if data.get('end_date'):
        announcement.end_date = datetime.strptime(data['end_date'], '%Y-%m-%d')
    
    db.session.add(announcement)
    db.session.commit()
    
    # Envoyer les notifications aux clients si demandé
    notification_result = None
    if data.get('notify_clients') and announcement.is_active:
        try:
            from app.services.notification_service import NotificationService
            from app.models import User
            
            # Récupérer tous les clients actifs du tenant
            clients = User.query.filter_by(
                tenant_id=tenant_id,
                role='client',
                is_active=True
            ).all()
            
            if clients:
                notif_service = NotificationService(tenant_id)
                
                # Canaux à utiliser (par défaut: push uniquement)
                channels = data.get('notify_channels', ['push'])
                
                # Préparer le titre selon le type d'annonce
                type_emojis = {
                    'info': 'ℹ️',
                    'warning': '⚠️',
                    'promo': '🎉',
                    'urgent': '🚨'
                }
                emoji = type_emojis.get(announcement.type, 'ℹ️')
                title = f"{emoji} {announcement.title}"
                
                # Envoyer à tous les clients
                notification_result = notif_service.send_bulk_notification(
                    users=clients,
                    title=title,
                    message=announcement.content,
                    channels=channels
                )
                
                import logging
                logging.info(f"Announcement notifications sent: {notification_result}")
                
        except Exception as e:
            import logging
            logging.error(f"Failed to send announcement notifications: {str(e)}")
            notification_result = {'error': str(e)}
    
    return jsonify({
        'message': 'Announcement created',
        'announcement': announcement.to_dict(),
        'notifications': notification_result
    }), 201


@admin_bp.route('/announcements/<announcement_id>', methods=['PUT'])
@module_required('communication')
def admin_update_announcement(announcement_id):
    """
    Mettre à jour une annonce
    
    Body:
        - title, content, type, is_active, start_date, end_date, priority
    """
    tenant_id = g.tenant_id
    data = request.get_json()
    
    announcement = Announcement.query.filter_by(
        id=announcement_id, 
        tenant_id=tenant_id
    ).first()
    
    if not announcement:
        return jsonify({'error': 'Announcement not found'}), 404
    
    # Champs modifiables
    if 'title' in data:
        announcement.title = data['title']
    if 'content' in data:
        announcement.content = data['content']
    if 'type' in data:
        announcement.type = data['type']
    if 'is_active' in data:
        announcement.is_active = data['is_active']
    if 'priority' in data:
        announcement.priority = data['priority']
    if 'start_date' in data:
        announcement.start_date = datetime.strptime(data['start_date'], '%Y-%m-%d') if data['start_date'] else None
    if 'end_date' in data:
        announcement.end_date = datetime.strptime(data['end_date'], '%Y-%m-%d') if data['end_date'] else None
    
    db.session.commit()
    
    return jsonify({
        'message': 'Announcement updated',
        'announcement': announcement.to_dict()
    })


@admin_bp.route('/announcements/<announcement_id>', methods=['DELETE'])
@module_required('communication')
def admin_delete_announcement(announcement_id):
    """Supprimer une annonce"""
    tenant_id = g.tenant_id
    
    announcement = Announcement.query.filter_by(
        id=announcement_id, 
        tenant_id=tenant_id
    ).first()
    
    if not announcement:
        return jsonify({'error': 'Announcement not found'}), 404
    
    db.session.delete(announcement)
    db.session.commit()
    
    return jsonify({'message': 'Announcement deleted'})


@admin_bp.route('/announcements/<announcement_id>/toggle', methods=['POST'])
@module_required('communication')
def admin_toggle_announcement(announcement_id):
    """Activer/Désactiver une annonce"""
    tenant_id = g.tenant_id
    
    announcement = Announcement.query.filter_by(
        id=announcement_id, 
        tenant_id=tenant_id
    ).first()
    
    if not announcement:
        return jsonify({'error': 'Announcement not found'}), 404
    
    announcement.toggle_active()
    db.session.commit()
    
    status = 'activated' if announcement.is_active else 'deactivated'
    
    return jsonify({
        'message': f'Announcement {status}',
        'is_active': announcement.is_active
    })
