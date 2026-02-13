"""
Routes Support - Messages tenant <-> superadmin
================================================
"""

from flask import Blueprint, request, jsonify, g
from app import db
from app.utils.decorators import tenant_required
from app.models import SupportMessage, Tenant
from app.models.platform_config import PlatformConfig
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

support_bp = Blueprint('support', __name__)


@support_bp.route('/messages', methods=['GET'])
@tenant_required
def list_messages():
    """List support messages for the current tenant (threads only, no replies)."""
    tenant_id = g.tenant_id
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)

    query = SupportMessage.query.filter_by(
        tenant_id=tenant_id,
        parent_id=None
    ).order_by(SupportMessage.created_at.desc())

    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    messages = [m.to_dict(include_replies=True) for m in pagination.items]

    return jsonify({
        'messages': messages,
        'pagination': {
            'page': pagination.page,
            'total': pagination.total,
            'pages': pagination.pages
        }
    })


@support_bp.route('/messages', methods=['POST'])
@tenant_required
def send_message():
    """Send a support message from tenant to superadmin."""
    tenant_id = g.tenant_id
    data = request.get_json()

    subject = (data.get('subject') or '').strip()
    body = (data.get('body') or '').strip()

    if not subject or not body:
        return jsonify({'error': 'Sujet et message requis'}), 400

    user = g.user

    msg = SupportMessage(
        tenant_id=tenant_id,
        direction='tenant_to_admin',
        subject=subject,
        body=body,
        sender_id=user.id if user else None,
        sender_name=user.full_name if user else None,
        sender_email=user.email if user else None
    )
    db.session.add(msg)
    db.session.commit()

    logger.info(f"Support message from tenant {tenant_id}: {subject}")

    return jsonify(msg.to_dict()), 201


@support_bp.route('/messages/<message_id>', methods=['GET'])
@tenant_required
def get_message(message_id):
    """Get a single message thread with replies."""
    msg = SupportMessage.query.get_or_404(message_id)

    if msg.tenant_id != g.tenant_id:
        return jsonify({'error': 'Non autorisé'}), 403

    # Mark admin replies as read
    unread_replies = SupportMessage.query.filter_by(
        parent_id=message_id,
        direction='admin_to_tenant',
        is_read=False
    ).all()
    for r in unread_replies:
        r.is_read = True
    db.session.commit()

    return jsonify(msg.to_dict(include_replies=True))


@support_bp.route('/messages/unread-count', methods=['GET'])
@tenant_required
def unread_count():
    """Count unread replies from admin."""
    tenant_id = g.tenant_id
    count = SupportMessage.query.filter_by(
        tenant_id=tenant_id,
        direction='admin_to_tenant',
        is_read=False
    ).count()
    return jsonify({'unread': count})


@support_bp.route('/contact-info', methods=['GET'])
@tenant_required
def get_contact_info():
    """Get platform support contact info (public config)."""
    config = PlatformConfig.get_config()
    settings = config.settings or {}

    return jsonify({
        'support_email': config.support_email,
        'support_phone': config.support_phone,
        'platform_name': config.platform_name,
        'whatsapp_number': settings.get('renewal_whatsapp_number', ''),
        'website_url': config.website_url
    })
