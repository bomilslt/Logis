"""Invoice routes for cart management and invoice operations.

Handles:
- Cart operations (GET, POST, DELETE)
- Cart items (POST, DELETE)
- Invoice CRUD operations
- Paused cart management

Validates: Requirements 1.5, 1.6, 1.7, 1.8, 1.10, 1.11, 1.12
"""
from flask import Blueprint, request, jsonify, g

from app.services.auth_service import auth_required, manager_required, subscription_required
from app.services.invoice_service import InvoiceService, StockError

invoices_bp = Blueprint('invoices', __name__, url_prefix='/api/invoices')


def api_response(success, data=None, message=None, error=None, status_code=200):
    """Create standardized API response.
    
    Args:
        success: Whether the operation was successful
        data: Response data (for successful operations)
        message: Success message
        error: Error details (for failed operations)
        status_code: HTTP status code
        
    Returns:
        tuple: (response_json, status_code)
        
    Validates: Requirements 13.1
    """
    response = {'success': success}
    
    if success:
        if data is not None:
            response['data'] = data
        if message:
            response['message'] = message
    else:
        response['error'] = error or {'code': 'ERROR', 'message': 'An error occurred'}
    
    return jsonify(response), status_code


# ==================== Cart Routes ====================

@invoices_bp.route('/cart', methods=['GET'])
@auth_required
def get_cart():
    """Get current cart for the authenticated user.
    
    Returns:
        Cart data with items and total
        
    Validates: Requirements 1.7
    """
    cart_data = InvoiceService.get_cart_data(
        user_id=g.current_user.id,
        store_id=g.store_id
    )
    
    return api_response(
        True,
        data={'cart': cart_data}
    )


@invoices_bp.route('/cart', methods=['POST'])
@auth_required
@subscription_required
def add_to_cart():
    """Add a product to the cart.
    
    Request body:
        product_id: Product ID (required)
        quantity: Number of units (required, must be positive)
        variant_id: Optional variant ID for packaging
        
    Returns:
        Updated cart data
        
    Validates: Requirements 1.1, 1.2, 1.3, 1.5, 1.6, 1.7
    """
    data = request.get_json()
    
    if not data:
        return api_response(
            False,
            error={
                'code': 'VALIDATION_ERROR',
                'message': 'Request body is required',
                'details': {}
            },
            status_code=400
        )
    
    # Validate required fields
    errors = {}
    
    product_id = data.get('product_id')
    if not product_id:
        errors['product_id'] = 'Product ID is required'
    
    quantity = data.get('quantity')
    if quantity is None:
        errors['quantity'] = 'Quantity is required'
    else:
        try:
            quantity = int(quantity)
            if quantity < 1:
                errors['quantity'] = 'Quantity must be at least 1'
        except (ValueError, TypeError):
            errors['quantity'] = 'Quantity must be a valid integer'
    
    if errors:
        return api_response(
            False,
            error={
                'code': 'VALIDATION_ERROR',
                'message': 'Invalid data',
                'details': errors
            },
            status_code=400
        )
    
    variant_id = data.get('variant_id')
    
    try:
        result = InvoiceService.add_to_cart(
            user_id=g.current_user.id,
            store_id=g.store_id,
            product_id=product_id,
            quantity=quantity,
            variant_id=variant_id
        )
        
        return api_response(
            True,
            data={'cart': result['cart']},
            message=result['message']
        )
        
    except StockError as e:
        return api_response(
            False,
            error={
                'code': 'STOCK_INSUFFICIENT',
                'message': str(e),
                'details': {
                    'product_name': e.product_name,
                    'available': e.available,
                    'required': e.required
                }
            },
            status_code=422
        )
    except ValueError as e:
        return api_response(
            False,
            error={
                'code': 'NOT_FOUND',
                'message': str(e)
            },
            status_code=404
        )


@invoices_bp.route('/cart', methods=['DELETE'])
@auth_required
def clear_cart():
    """Clear the current cart (cancel without saving).
    
    Returns:
        Success confirmation
        
    Validates: Requirements 1.11
    """
    result = InvoiceService.cancel_cart(
        user_id=g.current_user.id,
        store_id=g.store_id
    )
    
    return api_response(
        True,
        message=result['message']
    )


# ==================== Cart Items Routes ====================

@invoices_bp.route('/cart/items', methods=['POST'])
@auth_required
def add_cart_item():
    """Add an item to the cart (alias for POST /cart).
    
    Request body:
        product_id: Product ID (required)
        quantity: Number of units (required, must be positive)
        variant_id: Optional variant ID for packaging
        
    Returns:
        Updated cart data
        
    Validates: Requirements 1.1, 1.2, 1.3, 1.5, 1.6, 1.7
    """
    # Delegate to add_to_cart logic
    return add_to_cart()


@invoices_bp.route('/cart/items', methods=['DELETE'])
@auth_required
def remove_cart_item():
    """Remove an item from the cart.
    
    Request body or query params:
        product_id: Product ID (required)
        variant_id: Optional variant ID
        
    Returns:
        Updated cart data
        
    Validates: Requirements 1.8
    """
    # Try to get data from request body first, then query params
    data = request.get_json() or {}
    
    product_id = data.get('product_id') or request.args.get('product_id')
    variant_id = data.get('variant_id') or request.args.get('variant_id')
    
    if not product_id:
        return api_response(
            False,
            error={
                'code': 'VALIDATION_ERROR',
                'message': 'Invalid data',
                'details': {'product_id': 'Product ID is required'}
            },
            status_code=400
        )
    
    result = InvoiceService.remove_from_cart(
        user_id=g.current_user.id,
        store_id=g.store_id,
        product_id=product_id,
        variant_id=variant_id
    )
    
    if result['success']:
        return api_response(
            True,
            data={'cart': result['cart']},
            message=result['message']
        )
    else:
        return api_response(
            False,
            error={
                'code': 'NOT_FOUND',
                'message': result['message']
            },
            status_code=404
        )


# ==================== Invoice Routes ====================

@invoices_bp.route('/verify-stock', methods=['POST'])
@auth_required
def verify_stock_for_sale():
    """Verify stock availability for items before processing a sale.
    
    This endpoint performs real-time stock verification to prevent overselling
    in multi-user scenarios. It should be called before confirming an invoice.
    
    Request body:
        items: List of items to verify, each containing:
            - product_id: Product ID (required)
            - variant_id: Optional variant ID
            - quantity: Number of units requested (required)
            
    Returns:
        success: True if all items have sufficient stock
        insufficient_items: List of items with insufficient stock (if any)
        message: Human-readable message
        
    Validates: Requirements 2.4, 5.2
    """
    data = request.get_json()
    
    if not data:
        return api_response(
            False,
            error={
                'code': 'VALIDATION_ERROR',
                'message': 'Request body is required',
                'details': {}
            },
            status_code=400
        )
    
    items = data.get('items', [])
    
    if not items:
        return api_response(
            False,
            error={
                'code': 'VALIDATION_ERROR',
                'message': 'Items list is required',
                'details': {'items': 'At least one item is required'}
            },
            status_code=400
        )
    
    # Validate items structure
    for i, item in enumerate(items):
        if not item.get('product_id'):
            return api_response(
                False,
                error={
                    'code': 'VALIDATION_ERROR',
                    'message': f'Item {i+1}: product_id is required',
                    'details': {f'items[{i}].product_id': 'Product ID is required'}
                },
                status_code=400
            )
        if item.get('quantity') is None:
            return api_response(
                False,
                error={
                    'code': 'VALIDATION_ERROR',
                    'message': f'Item {i+1}: quantity is required',
                    'details': {f'items[{i}].quantity': 'Quantity is required'}
                },
                status_code=400
            )
    
    result = InvoiceService.verify_stock_for_sale(
        store_id=g.store_id,
        items=items
    )
    
    if result['success']:
        return api_response(
            True,
            data={
                'verified': True,
                'insufficient_items': []
            },
            message=result['message']
        )
    else:
        return api_response(
            False,
            error={
                'code': 'STOCK_INSUFFICIENT',
                'message': result['message'],
                'details': {
                    'insufficient_items': result['insufficient_items']
                }
            },
            status_code=422
        )


@invoices_bp.route('', methods=['GET'])
@auth_required
def list_invoices():
    """List invoices for the current store.
    
    Query params:
        status: Filter by status ('completed', 'cancelled')
        user_id: Filter by user (managers only, or own invoices)
        
    Returns:
        List of invoices
        
    Validates: Requirements 5.1, 20.4
    """
    status = request.args.get('status')
    user_id_filter = request.args.get('user_id')
    
    # Check permissions for viewing other users' sales
    include_profit = g.current_user.can_view_profits or g.current_user.is_manager()
    
    # Non-managers can only see their own sales unless they have permission
    if not g.current_user.is_manager() and not g.current_user.can_view_all_sales:
        user_id_filter = g.current_user.id
    
    invoices = InvoiceService.get_invoices(
        store_id=g.store_id,
        user_id=user_id_filter,
        status=status,
        include_profit=include_profit
    )
    
    return api_response(
        True,
        data={'invoices': invoices}
    )


@invoices_bp.route('', methods=['POST'])
@auth_required
@subscription_required
def create_invoice():
    """Confirm the current cart as an invoice.

    Request body:
        items: List of cart items (from frontend)
        total_amount: Total amount
        discount_amount: Optional discount to apply (default: 0)
        voucher_code: Optional voucher code applied
        is_prepaid: Optional flag for prepaid sales (default: false)
        prepaid_client_name: Client name for prepaid sales (required if is_prepaid)

    Returns:
        Created invoice data

    Validates: Requirements 1.10
    """
    data = request.get_json() or {}

    items = data.get('items', [])
    total_amount = data.get('total_amount', 0)
    discount_amount = data.get('discount_amount', 0)
    voucher_code = data.get('voucher_code')
    is_prepaid = data.get('is_prepaid', False)
    prepaid_client_name = data.get('prepaid_client_name')
    
    # Convert is_prepaid to boolean if string
    if isinstance(is_prepaid, str):
        is_prepaid = is_prepaid.lower() in ('true', '1', 'yes')
    
    # Validate prepaid client name
    if is_prepaid and not prepaid_client_name:
        return api_response(
            False,
            error={
                'code': 'VALIDATION_ERROR',
                'message': 'Le nom du client est requis pour une vente prépayée',
                'details': {'prepaid_client_name': 'Client name is required for prepaid sales'}
            },
            status_code=400
        )

    # Validate discount
    try:
        discount_amount = float(discount_amount)
        if discount_amount < 0:
            return api_response(
                False,
                error={
                    'code': 'VALIDATION_ERROR',
                    'message': 'Invalid data',
                    'details': {'discount_amount': 'Discount must be non-negative'}
                },
                status_code=400
            )
    except (ValueError, TypeError):
        return api_response(
            False,
            error={
                'code': 'VALIDATION_ERROR',
                'message': 'Invalid data',
                'details': {'discount_amount': 'Discount must be a valid number'}
            },
            status_code=400
        )

    result = InvoiceService.confirm_invoice(
        user_id=g.current_user.id,
        store_id=g.store_id,
        items=items,
        total_amount=total_amount,
        discount_amount=discount_amount,
        voucher_code=voucher_code,
        is_prepaid=is_prepaid,
        prepaid_client_name=prepaid_client_name
    )

    if result['success']:
        return api_response(
            True,
            data=result['invoice'],
            message=result['message'],
            status_code=201
        )
    else:
        return api_response(
            False,
            error={
                'code': 'VALIDATION_ERROR',
                'message': result['error']
            },
            status_code=400
        )



@invoices_bp.route('/<invoice_id>', methods=['GET'])
@auth_required
def get_invoice(invoice_id):
    """Get a specific invoice by ID.
    
    Args:
        invoice_id: Invoice ID
        
    Returns:
        Invoice data with items
    """
    include_profit = g.current_user.can_view_profits or g.current_user.is_manager()
    
    invoice = InvoiceService.get_invoice(
        invoice_id=invoice_id,
        store_id=g.store_id,
        include_profit=include_profit
    )
    
    if not invoice:
        return api_response(
            False,
            error={
                'code': 'NOT_FOUND',
                'message': 'Invoice not found'
            },
            status_code=404
        )
    
    # Check if user can view this invoice
    if not g.current_user.is_manager() and not g.current_user.can_view_all_sales:
        if invoice.get('user_id') != g.current_user.id:
            return api_response(
                False,
                error={
                    'code': 'FORBIDDEN',
                    'message': 'You do not have permission to view this invoice'
                },
                status_code=403
            )
    
    return api_response(
        True,
        data={'invoice': invoice}
    )


@invoices_bp.route('/<invoice_id>', methods=['DELETE'])
@auth_required
@manager_required
def delete_invoice(invoice_id):
    """Delete an invoice with optional stock restoration.
    
    Only managers can delete invoices.
    
    Args:
        invoice_id: Invoice ID
        
    Query params:
        restore_stock: Whether to restore stock quantities (default: true)
                       Accepts 'true', 'false', '1', '0'
        
    Returns:
        Success confirmation
        
    Validates: Requirements 5.6, 7.1
    """
    # Parse restore_stock query parameter (default True for backward compatibility)
    restore_stock_param = request.args.get('restore_stock', 'true').lower()
    restore_stock = restore_stock_param not in ('false', '0', 'no')
    
    result = InvoiceService.delete_invoice(
        invoice_id=invoice_id,
        store_id=g.store_id,
        restore_stock=restore_stock
    )
    
    if result['success']:
        return api_response(
            True,
            message=result['message']
        )
    else:
        return api_response(
            False,
            error={
                'code': 'NOT_FOUND',
                'message': result['error']
            },
            status_code=404
        )


# ==================== Paused Cart Routes ====================

@invoices_bp.route('/paused', methods=['GET'])
@auth_required
def list_paused_carts():
    """List all paused carts for the current user.
    
    Returns:
        List of paused cart data
        
    Validates: Requirements 1.12
    """
    paused_carts = InvoiceService.get_paused_carts(
        user_id=g.current_user.id,
        store_id=g.store_id
    )
    
    return api_response(
        True,
        data={'paused_carts': paused_carts}
    )


@invoices_bp.route('/paused', methods=['POST'])
@auth_required
def pause_cart():
    """Pause the current cart for later restoration.

    Request body:
        name: Optional name for the paused cart
        items: Optional list of cart items (if not using server-side cart)

    Returns:
        Paused cart ID

    Validates: Requirements 1.12
    """
    data = request.get_json() or {}
    name = data.get('name')
    items = data.get('items')

    result = InvoiceService.pause_cart(
        user_id=g.current_user.id,
        store_id=g.store_id,
        name=name,
        items=items
    )

    if result['success']:
        return api_response(
            True,
            data={'paused_cart_id': result['paused_cart_id']},
            message=result['message'],
            status_code=201
        )
    else:
        return api_response(
            False,
            error={
                'code': 'VALIDATION_ERROR',
                'message': result['error']
            },
            status_code=400
        )


@invoices_bp.route('/paused/<paused_cart_id>', methods=['GET'])
@auth_required
def get_paused_cart(paused_cart_id):
    """Get a specific paused cart.
    
    Args:
        paused_cart_id: Paused cart ID
        
    Returns:
        Paused cart data
    """
    paused_carts = InvoiceService.get_paused_carts(
        user_id=g.current_user.id,
        store_id=g.store_id
    )
    
    for cart in paused_carts:
        if cart.get('id') == paused_cart_id:
            return api_response(
                True,
                data={'paused_cart': cart}
            )
    
    return api_response(
        False,
        error={
            'code': 'NOT_FOUND',
            'message': 'Paused cart not found'
        },
        status_code=404
    )


@invoices_bp.route('/paused/<paused_cart_id>/restore', methods=['POST'])
@auth_required
def restore_paused_cart(paused_cart_id):
    """Restore a paused cart as the current cart.
    
    Args:
        paused_cart_id: Paused cart ID
        
    Returns:
        Restored cart data
        
    Validates: Requirements 1.12
    """
    result = InvoiceService.restore_cart(
        user_id=g.current_user.id,
        store_id=g.store_id,
        paused_cart_id=paused_cart_id
    )
    
    if result['success']:
        return api_response(
            True,
            data={'cart': result['cart']},
            message=result['message']
        )
    else:
        error_code = 'NOT_FOUND' if 'non trouvé' in result['error'] else 'VALIDATION_ERROR'
        status_code = 404 if error_code == 'NOT_FOUND' else 400
        
        return api_response(
            False,
            error={
                'code': error_code,
                'message': result['error']
            },
            status_code=status_code
        )


@invoices_bp.route('/paused/<paused_cart_id>', methods=['DELETE'])
@auth_required
def delete_paused_cart(paused_cart_id):
    """Delete a paused cart.
    
    Args:
        paused_cart_id: Paused cart ID
        
    Returns:
        Success confirmation
    """
    result = InvoiceService.delete_paused_cart(
        user_id=g.current_user.id,
        store_id=g.store_id,
        paused_cart_id=paused_cart_id
    )
    
    if result['success']:
        return api_response(
            True,
            message=result['message']
        )
    else:
        return api_response(
            False,
            error={
                'code': 'NOT_FOUND',
                'message': result['error']
            },
            status_code=404
        )


# ==================== Bulk Delete Routes ====================

@invoices_bp.route('/preview-delete', methods=['GET'])
@auth_required
@manager_required
def preview_bulk_delete():
    """Preview invoices to be deleted in a date range.
    
    Only managers can access this endpoint.
    
    Query params:
        start_date: Start date (YYYY-MM-DD format, required)
        end_date: End date (YYYY-MM-DD format, required)
        
    Returns:
        Preview data with count and total amount
        
    Validates: Requirements 10.2
    """
    from datetime import datetime
    
    start_date_str = request.args.get('start_date')
    end_date_str = request.args.get('end_date')
    
    # Validate required parameters
    errors = {}
    if not start_date_str:
        errors['start_date'] = 'Start date is required'
    if not end_date_str:
        errors['end_date'] = 'End date is required'
    
    if errors:
        return api_response(
            False,
            error={
                'code': 'VALIDATION_ERROR',
                'message': 'Invalid data',
                'details': errors
            },
            status_code=400
        )
    
    # Parse dates
    try:
        start_date = datetime.strptime(start_date_str, '%Y-%m-%d')
        # Set to start of day
        start_date = start_date.replace(hour=0, minute=0, second=0, microsecond=0)
    except ValueError:
        return api_response(
            False,
            error={
                'code': 'VALIDATION_ERROR',
                'message': 'Invalid data',
                'details': {'start_date': 'Invalid date format. Use YYYY-MM-DD'}
            },
            status_code=400
        )
    
    try:
        end_date = datetime.strptime(end_date_str, '%Y-%m-%d')
        # Set to end of day
        end_date = end_date.replace(hour=23, minute=59, second=59, microsecond=999999)
    except ValueError:
        return api_response(
            False,
            error={
                'code': 'VALIDATION_ERROR',
                'message': 'Invalid data',
                'details': {'end_date': 'Invalid date format. Use YYYY-MM-DD'}
            },
            status_code=400
        )
    
    # Validate date range
    if start_date > end_date:
        return api_response(
            False,
            error={
                'code': 'VALIDATION_ERROR',
                'message': 'Invalid data',
                'details': {'start_date': 'Start date must be before or equal to end date'}
            },
            status_code=400
        )
    
    result = InvoiceService.get_invoices_for_deletion(
        store_id=g.store_id,
        start_date=start_date,
        end_date=end_date
    )
    
    return api_response(
        True,
        data=result
    )


@invoices_bp.route('/bulk-delete', methods=['POST'])
@auth_required
@manager_required
def bulk_delete():
    """Bulk delete invoices in a date range.
    
    Only managers can access this endpoint.
    
    Request body:
        start_date: Start date (YYYY-MM-DD format, required)
        end_date: End date (YYYY-MM-DD format, required)
        restore_stock: Whether to restore stock quantities (default: false)
        
    Returns:
        Result with count of deleted invoices
        
    Validates: Requirements 10.6
    """
    from datetime import datetime
    
    data = request.get_json()
    
    if not data:
        return api_response(
            False,
            error={
                'code': 'VALIDATION_ERROR',
                'message': 'Request body is required',
                'details': {}
            },
            status_code=400
        )
    
    start_date_str = data.get('start_date')
    end_date_str = data.get('end_date')
    restore_stock = data.get('restore_stock', False)
    
    # Validate required parameters
    errors = {}
    if not start_date_str:
        errors['start_date'] = 'Start date is required'
    if not end_date_str:
        errors['end_date'] = 'End date is required'
    
    if errors:
        return api_response(
            False,
            error={
                'code': 'VALIDATION_ERROR',
                'message': 'Invalid data',
                'details': errors
            },
            status_code=400
        )
    
    # Parse dates
    try:
        start_date = datetime.strptime(start_date_str, '%Y-%m-%d')
        # Set to start of day
        start_date = start_date.replace(hour=0, minute=0, second=0, microsecond=0)
    except ValueError:
        return api_response(
            False,
            error={
                'code': 'VALIDATION_ERROR',
                'message': 'Invalid data',
                'details': {'start_date': 'Invalid date format. Use YYYY-MM-DD'}
            },
            status_code=400
        )
    
    try:
        end_date = datetime.strptime(end_date_str, '%Y-%m-%d')
        # Set to end of day
        end_date = end_date.replace(hour=23, minute=59, second=59, microsecond=999999)
    except ValueError:
        return api_response(
            False,
            error={
                'code': 'VALIDATION_ERROR',
                'message': 'Invalid data',
                'details': {'end_date': 'Invalid date format. Use YYYY-MM-DD'}
            },
            status_code=400
        )
    
    # Validate date range
    if start_date > end_date:
        return api_response(
            False,
            error={
                'code': 'VALIDATION_ERROR',
                'message': 'Invalid data',
                'details': {'start_date': 'Start date must be before or equal to end date'}
            },
            status_code=400
        )
    
    # Convert restore_stock to boolean if it's a string
    if isinstance(restore_stock, str):
        restore_stock = restore_stock.lower() in ('true', '1', 'yes')
    
    result = InvoiceService.bulk_delete_invoices(
        store_id=g.store_id,
        start_date=start_date,
        end_date=end_date,
        restore_stock=restore_stock
    )
    
    if result['success']:
        return api_response(
            True,
            data={'count': result['count']},
            message=result['message']
        )
    else:
        return api_response(
            False,
            error={
                'code': 'ERROR',
                'message': result.get('error', 'An error occurred')
            },
            status_code=500
        )
