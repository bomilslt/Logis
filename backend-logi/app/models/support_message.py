"""
Support Messages - Communication Tenant <-> SuperAdmin
======================================================
"""

from app import db
from datetime import datetime
import uuid


class SupportMessage(db.Model):
    """Message de support entre un tenant et le super-admin."""
    __tablename__ = 'support_messages'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = db.Column(db.String(36), db.ForeignKey('tenants.id'), nullable=False, index=True)

    # Direction: 'tenant_to_admin' or 'admin_to_tenant'
    direction = db.Column(db.String(20), nullable=False, default='tenant_to_admin')

    subject = db.Column(db.String(200), nullable=False)
    body = db.Column(db.Text, nullable=False)

    # Who sent it
    sender_id = db.Column(db.String(36))
    sender_name = db.Column(db.String(100))
    sender_email = db.Column(db.String(120))

    # Thread: replies reference the original message
    parent_id = db.Column(db.String(36), db.ForeignKey('support_messages.id'), nullable=True, index=True)

    # Read status
    is_read = db.Column(db.Boolean, default=False)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relations
    tenant = db.relationship('Tenant', backref=db.backref('support_messages', lazy='dynamic'))
    replies = db.relationship('SupportMessage', backref=db.backref('parent', remote_side=[id]), lazy='dynamic')

    def to_dict(self, include_replies=False):
        result = {
            'id': self.id,
            'tenant_id': self.tenant_id,
            'direction': self.direction,
            'subject': self.subject,
            'body': self.body,
            'sender_id': self.sender_id,
            'sender_name': self.sender_name,
            'sender_email': self.sender_email,
            'parent_id': self.parent_id,
            'is_read': self.is_read,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
        if include_replies:
            result['replies'] = [r.to_dict() for r in self.replies.order_by(SupportMessage.created_at.asc()).all()]
        return result
