"""Report routes for sales reports with filters.

Handles:
- Sales list with filters (period, product, seller)
- Today's statistics
- Sales summary

Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5
"""
from datetime import datetime, date
from flask import Blueprint, request, jsonify, g

from app.services.auth_service import auth_required, manager_required
from app.services.report_service import ReportService

reports_bp = Blueprint('reports', __name__, url_prefix='/api/reports')


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


def parse_date(date_str):
    """Parse date string to date object.
    
    Args:
        date_str: Date string in YYYY-MM-DD format
        
    Returns:
        date: Parsed date or None
    """
    if not date_str:
        return None
    try:
        return datetime.strptime(date_str, '%Y-%m-%d').date()
    except ValueError:
        return None


@reports_bp.route('/sales', methods=['GET'])
@auth_required
def get_sales_report():
    """Get sales report with optional filters.
    
    Query params:
        start_date: Filter by start date (YYYY-MM-DD)
        end_date: Filter by end date (YYYY-MM-DD)
        product_id: Filter by product ID
        user_id: Filter by seller ID (managers only, or own sales)
        
    Returns:
        List of invoices matching filters
        
    Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5
    """
    # Parse filters
    start_date = parse_date(request.args.get('start_date'))
    end_date = parse_date(request.args.get('end_date'))
    product_id = request.args.get('product_id')
    user_id_filter = request.args.get('user_id')
    
    # Check permissions
    include_profit = g.current_user.can_view_profits or g.current_user.is_manager()
    
    # Non-managers can only see their own sales unless they have permission
    # Validates: Requirements 20.4
    if not g.current_user.is_manager() and not g.current_user.can_view_all_sales:
        user_id_filter = g.current_user.id
    
    # Get sales report
    sales = ReportService.get_sales_report(
        store_id=g.store_id,
        start_date=start_date,
        end_date=end_date,
        product_id=product_id,
        user_id=user_id_filter,
        include_profit=include_profit
    )
    
    # Get summary
    summary = ReportService.get_sales_summary(
        store_id=g.store_id,
        start_date=start_date,
        end_date=end_date,
        product_id=product_id,
        user_id=user_id_filter,
        include_profit=include_profit
    )
    
    return api_response(
        True,
        data={
            'sales': sales,
            'summary': summary,
            'filters': {
                'start_date': start_date.isoformat() if start_date else None,
                'end_date': end_date.isoformat() if end_date else None,
                'product_id': product_id,
                'user_id': user_id_filter
            }
        }
    )


@reports_bp.route('/today', methods=['GET'])
@auth_required
def get_today_stats():
    """Get today's sales statistics.
    
    Returns:
        Today's statistics (total sales, invoice count, profit, low stock)
    """
    include_profit = g.current_user.can_view_profits or g.current_user.is_manager()
    
    # Non-managers see only their own stats unless they have permission
    user_id_filter = None
    if not g.current_user.is_manager() and not g.current_user.can_view_all_sales:
        user_id_filter = g.current_user.id
    
    stats = ReportService.get_today_stats(
        store_id=g.store_id,
        user_id=user_id_filter,
        include_profit=include_profit
    )
    
    return api_response(
        True,
        data=stats
    )


@reports_bp.route('/sellers', methods=['GET'])
@auth_required
def get_sellers_list():
    """Get list of sellers for filter dropdown.
    
    Only managers or users with can_view_all_sales can see all sellers.
    
    Returns:
        List of sellers with id and name
    """
    # Check permissions
    if not g.current_user.is_manager() and not g.current_user.can_view_all_sales:
        # Return only current user
        return api_response(
            True,
            data={
                'sellers': [{'id': g.current_user.id, 'name': g.current_user.name}]
            }
        )
    
    sellers = ReportService.get_sellers_list(store_id=g.store_id)
    
    return api_response(
        True,
        data={'sellers': sellers}
    )


@reports_bp.route('/products', methods=['GET'])
@auth_required
def get_products_list():
    """Get list of products for filter dropdown.
    
    Returns:
        List of products with id and name
    """
    products = ReportService.get_products_list(store_id=g.store_id)
    
    return api_response(
        True,
        data={'products': products}
    )


@reports_bp.route('/stats/products', methods=['GET'])
@auth_required
def get_stats_by_product():
    """Get sales statistics grouped by product.
    
    Query params:
        start_date: Filter by start date (YYYY-MM-DD)
        end_date: Filter by end date (YYYY-MM-DD)
        
    Returns:
        Statistics per product (total sales, quantities, profit)
        
    Validates: Requirements 6.1
    """
    start_date = parse_date(request.args.get('start_date'))
    end_date = parse_date(request.args.get('end_date'))
    
    include_profit = g.current_user.can_view_profits or g.current_user.is_manager()
    
    stats = ReportService.get_stats_by_product(
        store_id=g.store_id,
        start_date=start_date,
        end_date=end_date,
        include_profit=include_profit
    )
    
    return api_response(
        True,
        data={'stats': stats}
    )


@reports_bp.route('/stats/sellers', methods=['GET'])
@auth_required
def get_stats_by_seller():
    """Get sales statistics grouped by seller.
    
    Query params:
        start_date: Filter by start date (YYYY-MM-DD)
        end_date: Filter by end date (YYYY-MM-DD)
        
    Returns:
        Statistics per seller (total sales, invoice count, profit)
        
    Validates: Requirements 6.2, 6.3
    """
    # Only managers or users with can_view_all_sales can see all sellers
    if not g.current_user.is_manager() and not g.current_user.can_view_all_sales:
        return api_response(
            False,
            error={
                'code': 'FORBIDDEN',
                'message': 'Vous n\'avez pas la permission de voir les statistiques par vendeur'
            },
            status_code=403
        )
    
    start_date = parse_date(request.args.get('start_date'))
    end_date = parse_date(request.args.get('end_date'))
    
    include_profit = g.current_user.can_view_profits or g.current_user.is_manager()
    
    stats = ReportService.get_stats_by_seller(
        store_id=g.store_id,
        start_date=start_date,
        end_date=end_date,
        include_profit=include_profit
    )
    
    return api_response(
        True,
        data={'stats': stats}
    )


@reports_bp.route('/stats/suppliers', methods=['GET'])
@auth_required
def get_stats_by_supplier():
    """Get purchase statistics grouped by supplier.
    
    Query params:
        start_date: Filter by start date (YYYY-MM-DD)
        end_date: Filter by end date (YYYY-MM-DD)
        
    Returns:
        Statistics per supplier (total purchases, purchase count)
        
    Validates: Requirements 6.4
    """
    # Only managers can see supplier stats (purchase data)
    if not g.current_user.is_manager():
        return api_response(
            False,
            error={
                'code': 'FORBIDDEN',
                'message': 'Vous n\'avez pas la permission de voir les statistiques fournisseurs'
            },
            status_code=403
        )
    
    start_date = parse_date(request.args.get('start_date'))
    end_date = parse_date(request.args.get('end_date'))
    
    stats = ReportService.get_stats_by_supplier(
        store_id=g.store_id,
        start_date=start_date,
        end_date=end_date
    )
    
    return api_response(
        True,
        data={'stats': stats}
    )


@reports_bp.route('/stats/peak-times', methods=['GET'])
@auth_required
def get_peak_times():
    """Get peak sales times analysis.
    
    Query params:
        start_date: Filter by start date (YYYY-MM-DD)
        end_date: Filter by end date (YYYY-MM-DD)
        
    Returns:
        Peak times data (by hour, by day of week)
        
    Validates: Requirements 6.5
    """
    start_date = parse_date(request.args.get('start_date'))
    end_date = parse_date(request.args.get('end_date'))
    
    stats = ReportService.get_peak_times(
        store_id=g.store_id,
        start_date=start_date,
        end_date=end_date
    )
    
    return api_response(
        True,
        data=stats
    )


@reports_bp.route('/stats/trend', methods=['GET'])
@auth_required
def get_sales_trend():
    """Get sales trend over time.
    
    Query params:
        period: Grouping period ('day', 'week', 'month')
        start_date: Filter by start date (YYYY-MM-DD)
        end_date: Filter by end date (YYYY-MM-DD)
        
    Returns:
        Sales data grouped by period
        
    Validates: Requirements 6.5
    """
    period = request.args.get('period', 'day')
    if period not in ['day', 'week', 'month']:
        period = 'day'
    
    start_date = parse_date(request.args.get('start_date'))
    end_date = parse_date(request.args.get('end_date'))
    
    include_profit = g.current_user.can_view_profits or g.current_user.is_manager()
    
    trend = ReportService.get_sales_trend(
        store_id=g.store_id,
        period=period,
        start_date=start_date,
        end_date=end_date,
        include_profit=include_profit
    )
    
    return api_response(
        True,
        data={'trend': trend, 'period': period}
    )


@reports_bp.route('/stats/advanced', methods=['GET'])
@auth_required
def get_advanced_stats():
    """Get comprehensive advanced statistics.
    
    Query params:
        start_date: Filter by start date (YYYY-MM-DD)
        end_date: Filter by end date (YYYY-MM-DD)
        
    Returns:
        All advanced statistics combined
        
    Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5
    """
    start_date = parse_date(request.args.get('start_date'))
    end_date = parse_date(request.args.get('end_date'))
    
    include_profit = g.current_user.can_view_profits or g.current_user.is_manager()
    
    # Check if user can see seller stats
    can_view_seller_stats = g.current_user.is_manager() or g.current_user.can_view_all_sales
    
    stats = ReportService.get_advanced_stats(
        store_id=g.store_id,
        start_date=start_date,
        end_date=end_date,
        include_profit=include_profit
    )
    
    # Remove seller stats if user doesn't have permission
    if not can_view_seller_stats:
        stats['by_seller'] = []
    
    return api_response(
        True,
        data=stats
    )
