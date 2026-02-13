"""
Routes Super-Admin - Support Messages
======================================
"""

from flask import request, jsonify, g
from app.routes.superadmin import superadmin_bp
from app.routes.superadmin.auth import superadmin_required
from app.models import SupportMessage, Tenant
from app import db
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


@superadmin_bp.route('/support/messages', methods=['GET'])
@superadmin_required
def list_support_messages():
    """List all support message threads across all tenants."""
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    tenant_id = request.args.get('tenant_id')
    unread_only = request.args.get('unread', 'false').lower() == 'true'

    query = SupportMessage.query.filter_by(parent_id=None)

    if tenant_id:
        query = query.filter_by(tenant_id=tenant_id)

    if unread_only:
        # Threads that have unread tenant messages
        query = query.filter_by(direction='tenant_to_admin', is_read=False)

    query = query.order_by(SupportMessage.created_at.desc())
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    messages = []
    for m in pagination.items:
        data = m.to_dict(include_replies=True)
        # Add tenant info
        tenant = Tenant.query.get(m.tenant_id)
        if tenant:
            data['tenant_name'] = tenant.name
            data['tenant_slug'] = tenant.slug
        messages.append(data)

    return jsonify({
        'messages': messages,
        'pagination': {
            'page': pagination.page,
            'total': pagination.total,
            'pages': pagination.pages
        }
    })


@superadmin_bp.route('/support/messages/<message_id>', methods=['GET'])
@superadmin_required
def get_support_message(message_id):
    """Get a support message thread with replies."""
    msg = SupportMessage.query.get_or_404(message_id)

    # Mark tenant messages as read
    if msg.direction == 'tenant_to_admin' and not msg.is_read:
        msg.is_read = True

    unread_replies = SupportMessage.query.filter_by(
        parent_id=message_id,
        direction='tenant_to_admin',
        is_read=False
    ).all()
    for r in unread_replies:
        r.is_read = True
    db.session.commit()

    data = msg.to_dict(include_replies=True)
    tenant = Tenant.query.get(msg.tenant_id)
    if tenant:
        data['tenant_name'] = tenant.name
        data['tenant_slug'] = tenant.slug

    return jsonify(data)


@superadmin_bp.route('/support/messages/<message_id>/reply', methods=['POST'])
@superadmin_required
def reply_support_message(message_id):
    """Reply to a support message from superadmin."""
    parent = SupportMessage.query.get_or_404(message_id)
    data = request.get_json()

    body = (data.get('body') or '').strip()
    if not body:
        return jsonify({'error': 'Message requis'}), 400

    reply = SupportMessage(
        tenant_id=parent.tenant_id,
        direction='admin_to_tenant',
        subject=f"Re: {parent.subject}",
        body=body,
        sender_id=g.superadmin.id,
        sender_name=g.superadmin.full_name,
        sender_email=g.superadmin.email,
        parent_id=parent.id
    )
    db.session.add(reply)

    # Mark parent as read
    if not parent.is_read:
        parent.is_read = True

    db.session.commit()

    logger.info(f"Support reply by {g.superadmin.email} to tenant {parent.tenant_id}")

    return jsonify(reply.to_dict()), 201


@superadmin_bp.route('/support/unread-count', methods=['GET'])
@superadmin_required
def support_unread_count():
    """Count unread support messages from tenants."""
    count = SupportMessage.query.filter_by(
        direction='tenant_to_admin',
        is_read=False
    ).count()
    return jsonify({'unread': count})
