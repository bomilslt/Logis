"""Prepaid sales routes for managing prepaid invoices and deliveries.

Handles:
- List prepaid invoices pending delivery
- Get prepaid invoice details
- Record delivery (partial or full)
- Delivery history

"""
from flask import Blueprint, request, jsonify, g

from app.services.auth_service import auth_required
from app.services.prepaid_service import PrepaidService

prepaids_bp = Blueprint('prepaids', __name__, url_prefix='/api/prepaids')


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


@prepaids_bp.route('', methods=['GET'])
@auth_required
def list_prepaids():
    """List prepaid invoices pending delivery.
    
    Query params:
        status: Filter by status ('pending', 'partial', 'delivered', 'all')
        client_name: Filter by client name (partial match)
        start_date: Filter by start date (YYYY-MM-DD)
        end_date: Filter by end date (YYYY-MM-DD)
        
    Returns:
        List of prepaid invoices
    """
    status_filter = request.args.get('status')
    client_name = request.args.get('client_name')
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    
    # Handle 'all' status
    if status_filter == 'all':
        status_filter = None
    
    prepaids = PrepaidService.get_pending_prepaids(
        store_id=g.store_id,
        status_filter=status_filter,
        client_name=client_name,
        start_date=start_date,
        end_date=end_date
    )
    
    return api_response(
        True,
        data={'prepaids': prepaids}
    )


@prepaids_bp.route('/<invoice_id>', methods=['GET'])
@auth_required
def get_prepaid(invoice_id):
    """Get a specific prepaid invoice with delivery details.
    
    Args:
        invoice_id: Invoice ID
        
    Returns:
        Prepaid invoice data with items and delivery history
    """
    prepaid = PrepaidService.get_prepaid_invoice(
        invoice_id=invoice_id,
        store_id=g.store_id
    )
    
    if not prepaid:
        return api_response(
            False,
            error={
                'code': 'NOT_FOUND',
                'message': 'Facture prépayée non trouvée'
            },
            status_code=404
        )
    
    return api_response(
        True,
        data={'prepaid': prepaid}
    )


@prepaids_bp.route('/<invoice_id>/deliver', methods=['POST'])
@auth_required
def record_delivery(invoice_id):
    """Record a delivery for a prepaid invoice.
    
    Args:
        invoice_id: Invoice ID
        
    Request body:
        items: List of items to deliver, each with:
            - invoice_item_id: Invoice item ID
            - quantity: Quantity to deliver
        notes: Optional delivery notes
        
    Returns:
        Updated prepaid invoice data
    """
    data = request.get_json()
    
    if not data:
        return api_response(
            False,
            error={
                'code': 'VALIDATION_ERROR',
                'message': 'Request body is required'
            },
            status_code=400
        )
    
    items = data.get('items', [])
    notes = data.get('notes')
    
    if not items:
        return api_response(
            False,
            error={
                'code': 'VALIDATION_ERROR',
                'message': 'Items list is required'
            },
            status_code=400
        )
    
    # Validate items structure
    for i, item in enumerate(items):
        if not item.get('invoice_item_id'):
            return api_response(
                False,
                error={
                    'code': 'VALIDATION_ERROR',
                    'message': f'Item {i+1}: invoice_item_id is required'
                },
                status_code=400
            )
        
        quantity = item.get('quantity')
        if quantity is None or quantity < 0:
            return api_response(
                False,
                error={
                    'code': 'VALIDATION_ERROR',
                    'message': f'Item {i+1}: quantity must be a positive number'
                },
                status_code=400
            )
    
    result = PrepaidService.record_delivery(
        invoice_id=invoice_id,
        store_id=g.store_id,
        user_id=g.current_user.id,
        items=items,
        notes=notes
    )
    
    if result['success']:
        return api_response(
            True,
            data={'prepaid': result['invoice']},
            message=result['message']
        )
    else:
        return api_response(
            False,
            error={
                'code': 'DELIVERY_ERROR',
                'message': result['error']
            },
            status_code=400
        )


@prepaids_bp.route('/<invoice_id>/deliver-all', methods=['POST'])
@auth_required
def deliver_all(invoice_id):
    """Deliver all remaining items for a prepaid invoice.
    
    Args:
        invoice_id: Invoice ID
        
    Request body:
        notes: Optional delivery notes
        
    Returns:
        Updated prepaid invoice data
    """
    data = request.get_json() or {}
    notes = data.get('notes')
    
    result = PrepaidService.deliver_all(
        invoice_id=invoice_id,
        store_id=g.store_id,
        user_id=g.current_user.id,
        notes=notes
    )
    
    if result['success']:
        return api_response(
            True,
            data={'prepaid': result['invoice']},
            message=result['message']
        )
    else:
        return api_response(
            False,
            error={
                'code': 'DELIVERY_ERROR',
                'message': result['error']
            },
            status_code=400
        )
