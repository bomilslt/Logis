"""Subscription routes for client subscription management.

These routes provide subscription information, history, and renewal URLs
for the client-side subscription dashboard.

**Feature: cash-multiuser-and-subscription**
"""
from flask import Blueprint, request, jsonify, g
from datetime import datetime
import urllib.parse

from app import db
from app.utils.decorators import tenant_required
from app.models import Tenant, Subscription, SubscriptionLog, SubscriptionPlan
from app.models.platform_config import PlatformConfig

subscription_bp = Blueprint('subscription', __name__)


def api_response(success, data=None, message=None, error=None, status_code=200):
    """Create standardized API response."""
    response = {'success': success}
    
    if success:
        if data is not None:
            response['data'] = data
        if message:
            response['message'] = message
    else:
        response['error'] = error or {'code': 'ERROR', 'message': 'An error occurred'}
    
    return jsonify(response), status_code


@subscription_bp.route('', methods=['GET'])
@tenant_required
def get_subscription():
    """Get current tenant's subscription info."""
    tenant_id = g.tenant_id
    
    subscription = Subscription.query.filter_by(
        tenant_id=tenant_id
    ).order_by(Subscription.created_at.desc()).first()
    
    if not subscription:
        # Should technically not happen if tenant exists, but handle it
        return api_response(True, data={'subscription': {'status': 'none', 'plan': 'none'}})
    
    # Calculate days remaining
    days_remaining = subscription.days_remaining
    
    # Determine reminder level
    reminder_level = 'none'
    if days_remaining <= 0:
        reminder_level = 'blocked'
    elif days_remaining == 1:
        reminder_level = 'urgent'
    elif days_remaining <= 3:
        reminder_level = 'warning'
    elif days_remaining <= 7:
        reminder_level = 'info'
        
    # Get plan info
    plan_code = 'unknown'
    plan_features = []
    plan_data = None
    if subscription.plan:
        plan_code = subscription.plan.code
        plan_features = subscription.plan.features or []
        plan_data = {
            'code': subscription.plan.code,
            'name': subscription.plan.name,
            'max_packages_monthly': subscription.plan.max_packages_monthly,
            'max_staff': subscription.plan.max_staff,
            'max_clients': subscription.plan.max_clients,
            'allowed_channels': subscription.plan.allowed_channels or []
        }

    # Can upgrade? Check if there's a higher plan available
    can_upgrade = False
    if subscription.plan:
        higher_plan = SubscriptionPlan.query.filter(
            SubscriptionPlan.is_active == True,
            SubscriptionPlan.display_order > subscription.plan.display_order
        ).first()
        can_upgrade = higher_plan is not None
    
    sub_data = {
        'status': subscription.status,
        'plan': plan_code,
        'plan_details': plan_data,
        'start_date': subscription.started_at.isoformat() if subscription.started_at else None,
        'end_date': subscription.current_period_end.isoformat() if subscription.current_period_end else None,
        'days_remaining': days_remaining,
        'is_expired': not subscription.is_active,
        'show_reminder': days_remaining <= 7,
        'reminder_level': reminder_level,
        'features': plan_features,
        'can_upgrade': can_upgrade
    }
    
    return api_response(True, data={'subscription': sub_data})


@subscription_bp.route('/history', methods=['GET'])
@tenant_required
def get_subscription_history():
    """Get subscription history for current tenant."""
    tenant_id = g.tenant_id
    
    # Get logs via join on Subscription (since logs are linked to subscription, not directly tenant in model? 
    # Wait, model has tenant_id too: tenant_id = db.Column(db.String(36), ...))
    
    try:
        logs = SubscriptionLog.query.filter_by(tenant_id=tenant_id)\
            .order_by(SubscriptionLog.created_at.desc()).limit(50).all()
        
        history = []
        for log in logs:
            history.append({
                'id': log.id,
                'action': log.action,
                'details': log.details,
                'created_at': log.created_at.isoformat() if log.created_at else None
            })
    except Exception as e:
        # Graceful degradation if table is missing or DB error
        from flask import current_app
        current_app.logger.warning(f"Error fetching subscription history: {e}")
        history = []
    
    return api_response(True, data={'history': history})


@subscription_bp.route('/renewal-link', methods=['GET'])
@tenant_required
def get_renewal_link():
    """Get the renewal/contact link for the current tenant.
    
    Returns a configurable contact link (WhatsApp, email, or custom URL)
    based on platform configuration.
    """
    tenant_id = g.tenant_id
    tenant = Tenant.query.get(tenant_id)
    
    advance = request.args.get('advance', 'false').lower() == 'true'
    
    # Récupérer la config de contact depuis PlatformConfig
    config = PlatformConfig.get_config()
    settings = config.settings or {}
    
    renewal_type = settings.get('renewal_contact_type', 'whatsapp')
    renewal_url = settings.get('renewal_contact_url', '')
    whatsapp_number = settings.get('renewal_whatsapp_number', '')
    contact_email = settings.get('renewal_contact_email', '')
    
    if renewal_type == 'url' and renewal_url:
        # Lien direct vers une page de renouvellement
        separator = '&' if '?' in renewal_url else '?'
        url = f"{renewal_url}{separator}tenant_id={tenant_id}"
        return api_response(True, data={'url': url, 'type': 'url'})
    
    if renewal_type == 'email' and contact_email:
        subject = urllib.parse.quote(f"Renouvellement abonnement - {tenant.name}")
        body = urllib.parse.quote(
            f"Bonjour,\n\nJe souhaite renouveler mon abonnement.\n"
            f"- Entreprise: {tenant.name}\n"
            f"- Code: {tenant.slug}\n\nCordialement"
        )
        url = f"mailto:{contact_email}?subject={subject}&body={body}"
        return api_response(True, data={'url': url, 'type': 'email'})
    
    # WhatsApp (défaut)
    if not whatsapp_number:
        return api_response(False, error={
            'code': 'NO_RENEWAL_CONTACT',
            'message': 'Aucun contact de renouvellement configuré. Veuillez contacter le support.'
        }, status_code=404)
    
    message = "Bonjour, je souhaite renouveler mon abonnement pour :\n"
    if advance:
        message = "Bonjour, je souhaite effectuer un paiement anticipé pour :\n"
        
    message += f"- Code: {tenant.slug}\n"
    message += f"- Nom: {tenant.name}\n"
    
    encoded_message = urllib.parse.quote(message)
    url = f"https://wa.me/{whatsapp_number}?text={encoded_message}"
    
    return api_response(True, data={'url': url, 'type': 'whatsapp'})

