"""Voucher routes for voucher management.

Handles:
- Voucher CRUD operations
- Voucher validation and application
- Voucher refund operations

Validates: Requirements 12.1, 12.3, 12.4, 12.5, 12.6, 2.4, 2.5, 2.6
"""
from flask import Blueprint, request, jsonify, g
from app.services.auth_service import auth_required, manager_required, subscription_required, plan_feature_required
from app.services.voucher_service import VoucherService, VoucherError

vouchers_bp = Blueprint('vouchers', __name__, url_prefix='/api/vouchers')


# ==================== Voucher CRUD ====================

@vouchers_bp.route('', methods=['GET'])
@auth_required
def get_vouchers():
    """Get all vouchers for the store.
    
    Query params:
        include_inactive: Include inactive vouchers (default: false)
        include_expired: Include expired vouchers (default: false)
    
    Returns:
        JSON: List of vouchers
    """
    store_id = g.current_user.store_id
    include_inactive = request.args.get('include_inactive', 'false').lower() == 'true'
    include_expired = request.args.get('include_expired', 'false').lower() == 'true'
    
    vouchers = VoucherService.get_vouchers(
        store_id=store_id,
        include_inactive=include_inactive,
        include_expired=include_expired
    )
    
    return jsonify({
        'success': True,
        'data': vouchers
    })


@vouchers_bp.route('/<voucher_id>', methods=['GET'])
@auth_required
def get_voucher(voucher_id):
    """Get a specific voucher.
    
    Args:
        voucher_id: Voucher ID
        
    Returns:
        JSON: Voucher data
    """
    store_id = g.current_user.store_id
    
    voucher = VoucherService.get_voucher(store_id, voucher_id)
    
    if not voucher:
        return jsonify({
            'success': False,
            'error': 'Bon non trouvé'
        }), 404
    
    return jsonify({
        'success': True,
        'data': voucher
    })


@vouchers_bp.route('', methods=['POST'])
@auth_required
@subscription_required
@plan_feature_required('vouchers')
def create_voucher():
    """Create a new voucher.
    
    Request body:
        amount: Voucher amount (required)
        expiry_days: Days until expiry (optional, default 365)
        expiry_date: Specific expiry date ISO string (optional)
        
    Returns:
        JSON: Created voucher data
        
    Validates: Requirements 12.1
    """
    store_id = g.current_user.store_id
    data = request.get_json() or {}
    
    amount = data.get('amount')
    if not amount:
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
    
    expiry_days = data.get('expiry_days', 365)
    expiry_date = data.get('expiry_date')
    
    # Parse expiry_date if provided
    from datetime import datetime
    parsed_expiry = None
    if expiry_date:
        try:
            parsed_expiry = datetime.fromisoformat(expiry_date.replace('Z', '+00:00'))
        except (ValueError, AttributeError):
            return jsonify({
                'success': False,
                'error': 'Format de date invalide'
            }), 400
    
    try:
        result = VoucherService.create_voucher(
            store_id=store_id,
            amount=amount,
            expiry_days=expiry_days,
            expiry_date=parsed_expiry
        )
        
        if result['success']:
            return jsonify(result), 201
        else:
            return jsonify(result), 400
            
    except VoucherError as e:
        return jsonify({
            'success': False,
            'error': e.message,
            'error_code': e.code
        }), 400


@vouchers_bp.route('/<voucher_id>', methods=['DELETE'])
@auth_required
@subscription_required
@plan_feature_required('vouchers')
def delete_voucher(voucher_id):
    """Delete or deactivate a voucher.
    
    Args:
        voucher_id: Voucher ID
        
    Returns:
        JSON: Result
    """
    store_id = g.current_user.store_id
    
    result = VoucherService.delete_voucher(store_id, voucher_id)
    
    if result['success']:
        return jsonify(result)
    else:
        return jsonify(result), 404


# ==================== Voucher Validation ====================

@vouchers_bp.route('/validate', methods=['POST'])
@auth_required
def validate_voucher():
    """Validate a voucher code.
    
    Request body:
        code: Voucher code (required)
        
    Returns:
        JSON: Validation result with voucher data if valid
        
    Validates: Requirements 12.6
    """
    store_id = g.current_user.store_id
    data = request.get_json() or {}
    
    code = data.get('code')
    if not code:
        return jsonify({
            'success': False,
            'error': 'Le code du bon est requis'
        }), 400
    
    result = VoucherService.validate_voucher(store_id, code)
    
    if result['success']:
        return jsonify(result)
    else:
        return jsonify(result), 400


@vouchers_bp.route('/by-code/<code>', methods=['GET'])
@auth_required
def get_voucher_by_code(code):
    """Get voucher by code.
    
    Args:
        code: Voucher code
        
    Returns:
        JSON: Voucher data
    """
    store_id = g.current_user.store_id
    
    voucher = VoucherService.get_voucher_by_code(store_id, code)
    
    if not voucher:
        return jsonify({
            'success': False,
            'error': 'Bon non trouvé'
        }), 404
    
    return jsonify({
        'success': True,
        'data': voucher
    })


# ==================== Voucher Application ====================

@vouchers_bp.route('/apply', methods=['POST'])
@auth_required
def apply_voucher():
    """Apply a voucher to an invoice total.
    
    Request body:
        code: Voucher code (required)
        invoice_total: Invoice total amount (required)
        
    Returns:
        JSON: Application result with deduction and new total
        
    Validates: Requirements 12.3, 12.4, 12.5
    """
    store_id = g.current_user.store_id
    data = request.get_json() or {}
    
    code = data.get('code')
    invoice_total = data.get('invoice_total')
    
    if not code:
        return jsonify({
            'success': False,
            'error': 'Le code du bon est requis'
        }), 400
    
    if invoice_total is None:
        return jsonify({
            'success': False,
            'error': 'Le total de la facture est requis'
        }), 400
    
    try:
        invoice_total = float(invoice_total)
    except (ValueError, TypeError):
        return jsonify({
            'success': False,
            'error': 'Total invalide'
        }), 400
    
    result = VoucherService.apply_voucher(store_id, code, invoice_total)
    
    if result['success']:
        return jsonify(result)
    else:
        return jsonify(result), 400


@vouchers_bp.route('/calculate', methods=['POST'])
@auth_required
def calculate_deduction():
    """Calculate voucher deduction without applying.
    
    Request body:
        voucher_amount: Available voucher amount (required)
        invoice_total: Invoice total (required)
        
    Returns:
        JSON: Calculation result
    """
    data = request.get_json() or {}
    
    voucher_amount = data.get('voucher_amount')
    invoice_total = data.get('invoice_total')
    
    if voucher_amount is None or invoice_total is None:
        return jsonify({
            'success': False,
            'error': 'Montant du bon et total requis'
        }), 400
    
    try:
        voucher_amount = float(voucher_amount)
        invoice_total = float(invoice_total)
    except (ValueError, TypeError):
        return jsonify({
            'success': False,
            'error': 'Montants invalides'
        }), 400
    
    result = VoucherService.calculate_deduction(voucher_amount, invoice_total)
    
    return jsonify({
        'success': True,
        **result
    })


# ==================== Voucher Refund ====================

@vouchers_bp.route('/from-refund', methods=['POST'])
@auth_required
def create_voucher_from_refund():
    """Create a voucher from a refund.
    
    Request body:
        invoice_id: Source invoice ID (required)
        refund_amount: Refund amount (required)
        expiry_days: Days until expiry (optional, default 365)
        
    Returns:
        JSON: Created voucher data
        
    Validates: Requirements 2.4, 2.5, 2.6
    """
    store_id = g.current_user.store_id
    data = request.get_json() or {}
    
    invoice_id = data.get('invoice_id')
    refund_amount = data.get('refund_amount')
    
    if not invoice_id:
        return jsonify({
            'success': False,
            'error': "L'ID de la facture est requis"
        }), 400
    
    if refund_amount is None:
        return jsonify({
            'success': False,
            'error': 'Le montant du remboursement est requis'
        }), 400
    
    try:
        refund_amount = float(refund_amount)
    except (ValueError, TypeError):
        return jsonify({
            'success': False,
            'error': 'Montant invalide'
        }), 400
    
    expiry_days = data.get('expiry_days', 365)
    
    try:
        result = VoucherService.create_voucher_from_refund(
            store_id=store_id,
            invoice_id=invoice_id,
            refund_amount=refund_amount,
            expiry_days=expiry_days
        )
        
        if result['success']:
            return jsonify(result), 201
        else:
            return jsonify(result), 400
            
    except VoucherError as e:
        return jsonify({
            'success': False,
            'error': e.message,
            'error_code': e.code
        }), 400


@vouchers_bp.route('/<voucher_id>/refund', methods=['POST'])
@auth_required
@subscription_required
@plan_feature_required('vouchers')
def refund_voucher(voucher_id):
    """Refund a voucher (cash out) - partial or total based on amount.
    
    Args:
        voucher_id: Voucher ID
        
    Request body:
        amount: Amount to refund (required)
        session_id: Cash session ID (required for creating CashTransaction)
        payment_method_id: Payment method ID (required)
        reason: Refund reason (optional)
        
    Returns:
        JSON: Refund result with type (partial or total)
        
    Validates: Requirements 8.1, 8.4
    """
    store_id = g.current_user.store_id
    data = request.get_json() or {}
    
    amount = data.get('amount')
    session_id = data.get('session_id')
    payment_method_id = data.get('payment_method_id')
    
    if amount is None:
        return jsonify({
            'success': False,
            'error': 'Le montant du remboursement est requis'
        }), 400
    
    try:
        amount = float(amount)
    except (ValueError, TypeError):
        return jsonify({
            'success': False,
            'error': 'Montant invalide'
        }), 400
    
    if amount <= 0:
        return jsonify({
            'success': False,
            'error': 'Le montant doit être supérieur à 0'
        }), 400
    
    if not session_id:
        return jsonify({
            'success': False,
            'error': "L'ID de session de caisse est requis"
        }), 400
    
    if not payment_method_id:
        return jsonify({
            'success': False,
            'error': "Le moyen de paiement est requis"
        }), 400
    
    # Get voucher to determine refund type
    voucher = VoucherService.get_voucher(store_id, voucher_id)
    
    if not voucher:
        return jsonify({
            'success': False,
            'error': 'Bon non trouvé'
        }), 404
    
    remaining_amount = float(voucher.get('remaining_amount', 0))
    
    # Determine partial vs total based on amount vs remaining
    if amount >= remaining_amount:
        # Total refund - refund the full remaining amount
        result = VoucherService.refund_voucher_total(
            store_id=store_id,
            voucher_id=voucher_id,
            session_id=session_id,
            payment_method_id=payment_method_id
        )
    else:
        # Partial refund
        result = VoucherService.refund_voucher_partial(
            store_id=store_id,
            voucher_id=voucher_id,
            refund_amount=amount,
            session_id=session_id,
            payment_method_id=payment_method_id
        )
    
    if result['success']:
        return jsonify(result)
    else:
        status_code = 400
        if result.get('error_code') == 'VOUCHER_NOT_FOUND':
            status_code = 404
        elif result.get('error_code') == 'NO_OPEN_SESSION':
            status_code = 400
        return jsonify(result), status_code
