"""Credit routes for client credit management.

Handles:
- Credit CRUD operations
- Partial payments
- Overdue credit tracking

Validates: Requirements 11.1, 11.2, 11.3
"""
from flask import Blueprint, request, jsonify, g
from app.services.auth_service import auth_required, manager_required, subscription_required, plan_feature_required
from app.services.credit_service import CreditService, CreditError

credits_bp = Blueprint('credits', __name__, url_prefix='/api/credits')


# ==================== Credit CRUD ====================

@credits_bp.route('', methods=['GET'])
@auth_required
def get_credits():
    """Get all credits for the store.
    
    Query params:
        status: Filter by status ('pending', 'partial', 'paid')
        include_paid: Include paid credits (default: false)
        client_name: Filter by client name
    
    Returns:
        JSON: List of credits
        
    Validates: Requirements 11.3
    """
    store_id = g.current_user.store_id
    status = request.args.get('status')
    include_paid = request.args.get('include_paid', 'false').lower() == 'true'
    client_name = request.args.get('client_name')
    
    credits = CreditService.get_credits(
        store_id=store_id,
        status=status,
        include_paid=include_paid,
        client_name=client_name
    )
    
    return jsonify({
        'success': True,
        'data': credits
    })


@credits_bp.route('/overdue', methods=['GET'])
@auth_required
def get_overdue_credits():
    """Get all overdue credits.
    
    Returns:
        JSON: List of overdue credits
    """
    store_id = g.current_user.store_id
    
    credits = CreditService.get_overdue_credits(store_id)
    
    return jsonify({
        'success': True,
        'data': credits,
        'count': len(credits)
    })


@credits_bp.route('/summary', methods=['GET'])
@auth_required
def get_credit_summary():
    """Get credit summary statistics.
    
    Returns:
        JSON: Summary statistics
    """
    store_id = g.current_user.store_id
    
    summary = CreditService.get_credit_summary(store_id)
    
    return jsonify({
        'success': True,
        'data': summary
    })


@credits_bp.route('/<credit_id>', methods=['GET'])
@auth_required
def get_credit(credit_id):
    """Get a specific credit.
    
    Args:
        credit_id: Credit ID
        
    Returns:
        JSON: Credit data
    """
    store_id = g.current_user.store_id
    
    credit = CreditService.get_credit(store_id, credit_id)
    
    if not credit:
        return jsonify({
            'success': False,
            'error': 'Crédit non trouvé'
        }), 404
    
    return jsonify({
        'success': True,
        'data': credit
    })


@credits_bp.route('', methods=['POST'])
@auth_required
@manager_required
@subscription_required
@plan_feature_required('credits')
def create_credit():
    """Create a new client credit.
    
    Request body:
        client_name: Client's name (required)
        total_amount: Credit amount (required)
        client_phone: Client's phone (optional)
        invoice_id: Related invoice ID (optional)
        due_date: Due date ISO string (optional)
        due_days: Days until due (optional, default 30)
        
    Returns:
        JSON: Created credit data
        
    Validates: Requirements 11.1
    """
    store_id = g.current_user.store_id
    data = request.get_json() or {}
    
    client_name = data.get('client_name')
    total_amount = data.get('total_amount')
    
    if not client_name:
        return jsonify({
            'success': False,
            'error': 'Le nom du client est requis'
        }), 400
    
    if total_amount is None:
        return jsonify({
            'success': False,
            'error': 'Le montant est requis'
        }), 400
    
    try:
        total_amount = float(total_amount)
    except (ValueError, TypeError):
        return jsonify({
            'success': False,
            'error': 'Montant invalide'
        }), 400
    
    # Parse due_date if provided
    from datetime import datetime
    due_date = None
    if data.get('due_date'):
        try:
            due_date = datetime.fromisoformat(data['due_date'].replace('Z', '+00:00'))
        except (ValueError, AttributeError):
            return jsonify({
                'success': False,
                'error': 'Format de date invalide'
            }), 400
    
    due_days = data.get('due_days', 30)
    
    try:
        result = CreditService.create_credit(
            store_id=store_id,
            client_name=client_name,
            total_amount=total_amount,
            client_phone=data.get('client_phone'),
            invoice_id=data.get('invoice_id'),
            due_date=due_date,
            due_days=due_days
        )
        
        if result['success']:
            return jsonify(result), 201
        else:
            return jsonify(result), 400
            
    except CreditError as e:
        return jsonify({
            'success': False,
            'error': e.message,
            'error_code': e.code
        }), 400


@credits_bp.route('/<credit_id>', methods=['PUT'])
@auth_required
@manager_required
def update_credit(credit_id):
    """Update a credit.
    
    Args:
        credit_id: Credit ID
        
    Request body:
        client_name: New client name (optional)
        client_phone: New client phone (optional)
        due_date: New due date ISO string (optional)
        
    Returns:
        JSON: Updated credit data
    """
    store_id = g.current_user.store_id
    data = request.get_json() or {}
    
    # Parse due_date if provided
    from datetime import datetime
    due_date = None
    if 'due_date' in data and data['due_date']:
        try:
            due_date = datetime.fromisoformat(data['due_date'].replace('Z', '+00:00'))
        except (ValueError, AttributeError):
            return jsonify({
                'success': False,
                'error': 'Format de date invalide'
            }), 400
    
    result = CreditService.update_credit(
        store_id=store_id,
        credit_id=credit_id,
        client_name=data.get('client_name'),
        client_phone=data.get('client_phone'),
        due_date=due_date
    )
    
    if result['success']:
        return jsonify(result)
    else:
        return jsonify(result), 404 if 'non trouvé' in result.get('error', '') else 400


@credits_bp.route('/<credit_id>', methods=['DELETE'])
@auth_required
@manager_required
@subscription_required
@plan_feature_required('credits')
def delete_credit(credit_id):
    """Delete a credit.
    
    Args:
        credit_id: Credit ID
        
    Returns:
        JSON: Result
    """
    store_id = g.current_user.store_id
    
    result = CreditService.delete_credit(store_id, credit_id)
    
    if result['success']:
        return jsonify(result)
    else:
        return jsonify(result), 404 if 'non trouvé' in result.get('error', '') else 400


# ==================== Payments ====================

@credits_bp.route('/<credit_id>/payment', methods=['POST'])
@auth_required
@subscription_required
@plan_feature_required('credits')
def make_payment(credit_id):
    """Record a payment on a credit.
    
    Args:
        credit_id: Credit ID
        
    Request body:
        amount: Payment amount (required)
        notes: Payment notes (optional)
        
    Returns:
        JSON: Updated credit data
        
    Note:
        If the user has an open cash session, a CashTransaction will be
        created automatically with note "Encaissement crédit {client_name} - Partiel/Soldé"
        
    Validates: Requirements 11.2, 9.1, 9.2
    """
    store_id = g.current_user.store_id
    user_id = g.current_user.id
    data = request.get_json() or {}
    
    amount = data.get('amount')
    
    if amount is None:
        return jsonify({
            'success': False,
            'error': 'Le montant est requis'
        }), 400
    
    try:
        amount = float(amount)
    except (ValueError, TypeError):
        return jsonify({
            'success': False,
            'error': 'Montant invalide'
        }), 400
    
    result = CreditService.make_payment(
        store_id=store_id,
        credit_id=credit_id,
        amount=amount,
        user_id=user_id,
        notes=data.get('notes')
    )
    
    if result['success']:
        return jsonify(result)
    else:
        return jsonify(result), 404 if 'non trouvé' in result.get('error', '') else 400


# ==================== Credit Actions ====================

@credits_bp.route('/<credit_id>/cancel', methods=['POST'])
@auth_required
@manager_required
@subscription_required
def cancel_credit(credit_id):
    """Cancel a credit (mark as paid without payment).
    
    Args:
        credit_id: Credit ID
        
    Request body:
        reason: Cancellation reason (optional)
        
    Returns:
        JSON: Result
    """
    store_id = g.current_user.store_id
    data = request.get_json() or {}
    
    result = CreditService.cancel_credit(
        store_id=store_id,
        credit_id=credit_id,
        reason=data.get('reason')
    )
    
    if result['success']:
        return jsonify(result)
    else:
        return jsonify(result), 404 if 'non trouvé' in result.get('error', '') else 400
