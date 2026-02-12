"""
Routes Templates - CRUD pour les templates de destinataires
"""

from flask import Blueprint, request, jsonify, g
from flask_jwt_extended import get_jwt_identity
from app import db
from app.models import RecipientTemplate
from app.utils.decorators import tenant_required

templates_bp = Blueprint('templates', __name__)


@templates_bp.route('', methods=['GET'])
@tenant_required
def get_templates():
    """Liste des templates du client connecté"""
    user_id = get_jwt_identity()
    tenant_id = g.tenant_id
    
    templates = RecipientTemplate.query.filter_by(
        tenant_id=tenant_id,
        user_id=user_id
    ).order_by(RecipientTemplate.created_at.desc()).all()
    
    return jsonify({
        'templates': [t.to_dict() for t in templates]
    })


@templates_bp.route('/<template_id>', methods=['GET'])
@tenant_required
def get_template(template_id):
    """Détails d'un template"""
    user_id = get_jwt_identity()
    tenant_id = g.tenant_id
    
    template = RecipientTemplate.query.filter_by(
        id=template_id,
        tenant_id=tenant_id,
        user_id=user_id
    ).first()
    
    if not template:
        return jsonify({'error': 'Template not found'}), 404
    
    return jsonify({'template': template.to_dict()})


@templates_bp.route('', methods=['POST'])
@tenant_required
def create_template():
    """Créer un nouveau template"""
    user_id = get_jwt_identity()
    tenant_id = g.tenant_id
    
    data = request.get_json()
    
    if not data.get('name'):
        return jsonify({'error': 'Name is required'}), 400
    
    template = RecipientTemplate(
        tenant_id=tenant_id,
        user_id=user_id,
        name=data['name'],
        recipient_name=data.get('recipient_name'),
        recipient_phone=data.get('recipient_phone'),
        country=data.get('country'),
        warehouse=data.get('warehouse')
    )
    
    db.session.add(template)
    db.session.commit()
    
    return jsonify({
        'message': 'Template created',
        'template': template.to_dict()
    }), 201


@templates_bp.route('/<template_id>', methods=['PUT'])
@tenant_required
def update_template(template_id):
    """Modifier un template"""
    user_id = get_jwt_identity()
    tenant_id = g.tenant_id
    
    template = RecipientTemplate.query.filter_by(
        id=template_id,
        tenant_id=tenant_id,
        user_id=user_id
    ).first()
    
    if not template:
        return jsonify({'error': 'Template not found'}), 404
    
    data = request.get_json()
    
    if 'name' in data:
        template.name = data['name']
    if 'recipient_name' in data:
        template.recipient_name = data['recipient_name']
    if 'recipient_phone' in data:
        template.recipient_phone = data['recipient_phone']
    if 'country' in data:
        template.country = data['country']
    if 'warehouse' in data:
        template.warehouse = data['warehouse']
    
    db.session.commit()
    
    return jsonify({
        'message': 'Template updated',
        'template': template.to_dict()
    })


@templates_bp.route('/<template_id>', methods=['DELETE'])
@tenant_required
def delete_template(template_id):
    """Supprimer un template"""
    user_id = get_jwt_identity()
    tenant_id = g.tenant_id
    
    template = RecipientTemplate.query.filter_by(
        id=template_id,
        tenant_id=tenant_id,
        user_id=user_id
    ).first()
    
    if not template:
        return jsonify({'error': 'Template not found'}), 404
    
    db.session.delete(template)
    db.session.commit()
    
    return jsonify({'message': 'Template deleted'})
