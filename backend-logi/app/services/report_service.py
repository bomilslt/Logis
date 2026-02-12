"""Report service for sales reports with filters.

Handles:
- Sales list with filters (period, product, seller)
- Combined filters
- Statistics and summaries
- Advanced statistics (by product, by seller, peak times, trends)

Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4, 6.5
"""
from decimal import Decimal
from typing import Optional, List, Dict, Any
from datetime import datetime, date, timedelta
from collections import defaultdict

from sqlalchemy import and_, or_, func, extract

from app import db
from app.models import Invoice, InvoiceItem, Product, User, Purchase, PurchaseItem


class ReportService:
    """Service for generating sales reports with filters.
    
    Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5
    """
    
    @classmethod
    def get_sales_report(
        cls,
        store_id: str,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        product_id: Optional[str] = None,
        user_id: Optional[str] = None,
        include_profit: bool = True
    ) -> List[Dict[str, Any]]:
        """Get sales report with optional filters.
        
        Args:
            store_id: Store ID
            start_date: Filter by start date (inclusive)
            end_date: Filter by end date (inclusive)
            product_id: Filter by product ID
            user_id: Filter by seller ID
            include_profit: Include profit fields
            
        Returns:
            list: List of invoice data matching filters
            
        Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5
        """
        # Base query
        query = Invoice.query.filter_by(
            store_id=store_id,
            status='completed'
        )
        
        # Apply period filter
        # Validates: Requirements 5.2
        if start_date:
            start_datetime = datetime.combine(start_date, datetime.min.time())
            query = query.filter(Invoice.created_at >= start_datetime)
        
        if end_date:
            end_datetime = datetime.combine(end_date, datetime.max.time())
            query = query.filter(Invoice.created_at <= end_datetime)
        
        # Apply seller filter
        # Validates: Requirements 5.4
        if user_id:
            query = query.filter(Invoice.user_id == user_id)
        
        # Apply product filter
        # Validates: Requirements 5.3
        if product_id:
            # Get invoice IDs that contain the product
            invoice_ids_with_product = db.session.query(InvoiceItem.invoice_id).filter(
                InvoiceItem.product_id == product_id
            ).distinct().subquery()
            
            query = query.filter(Invoice.id.in_(invoice_ids_with_product))
        
        # Order by date descending
        query = query.order_by(Invoice.created_at.desc())
        
        # Execute query
        invoices = query.all()
        
        # Build result
        result = []
        for invoice in invoices:
            invoice_data = cls._invoice_to_dict(invoice, include_profit)
            result.append(invoice_data)
        
        return result
    
    @classmethod
    def _invoice_to_dict(cls, invoice: Invoice, include_profit: bool = True) -> Dict[str, Any]:
        """Convert invoice to dictionary with items and user info.
        
        Args:
            invoice: Invoice model
            include_profit: Include profit fields
            
        Returns:
            dict: Invoice data
        """
        # Get user name
        user = User.query.get(invoice.user_id)
        user_name = user.name if user else 'Inconnu'
        
        # Get items
        items = []
        for item in invoice.items.all():
            product = Product.query.get(item.product_id)
            item_data = {
                'id': item.id,
                'product_id': item.product_id,
                'product_name': product.name if product else 'Produit supprimé',
                'variant_id': item.variant_id,
                'quantity': item.quantity,
                'unit_price': float(item.unit_price),
                'subtotal': float(item.subtotal)
            }
            if include_profit:
                item_data['profit'] = float(item.profit)
            items.append(item_data)
        
        data = {
            'id': invoice.id,
            'invoice_number': invoice.invoice_number,
            'user_id': invoice.user_id,
            'user_name': user_name,
            'total_amount': float(invoice.total_amount),
            'discount_amount': float(invoice.discount_amount),
            'status': invoice.status,
            'voucher_code': invoice.voucher_code,
            'created_at': invoice.created_at.isoformat() if invoice.created_at else None,
            'items': items
        }
        
        if include_profit:
            data['profit'] = float(invoice.profit)
        
        return data
    
    @classmethod
    def get_today_stats(
        cls,
        store_id: str,
        user_id: Optional[str] = None,
        include_profit: bool = True
    ) -> Dict[str, Any]:
        """Get today's sales statistics.
        
        Args:
            store_id: Store ID
            user_id: Optional filter by seller
            include_profit: Include profit fields
            
        Returns:
            dict: Today's statistics
        """
        today = date.today()
        today_start = datetime.combine(today, datetime.min.time())
        today_end = datetime.combine(today, datetime.max.time())
        
        # Base query
        query = Invoice.query.filter(
            Invoice.store_id == store_id,
            Invoice.status == 'completed',
            Invoice.created_at >= today_start,
            Invoice.created_at <= today_end
        )
        
        if user_id:
            query = query.filter(Invoice.user_id == user_id)
        
        invoices = query.all()
        
        total_sales = sum(float(inv.total_amount) for inv in invoices)
        invoice_count = len(invoices)
        total_profit = sum(float(inv.profit) for inv in invoices) if include_profit else 0
        
        # Get low stock count
        low_stock_count = Product.query.filter(
            Product.store_id == store_id,
            Product.is_active == True,
            Product.stock_quantity <= Product.alert_threshold
        ).count()
        
        result = {
            'total_sales': total_sales,
            'invoice_count': invoice_count,
            'low_stock_count': low_stock_count
        }
        
        if include_profit:
            result['total_profit'] = total_profit
        
        return result
    
    @classmethod
    def get_sales_summary(
        cls,
        store_id: str,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        product_id: Optional[str] = None,
        user_id: Optional[str] = None,
        include_profit: bool = True
    ) -> Dict[str, Any]:
        """Get sales summary with totals for the filtered data.
        
        Args:
            store_id: Store ID
            start_date: Filter by start date
            end_date: Filter by end date
            product_id: Filter by product
            user_id: Filter by seller
            include_profit: Include profit fields
            
        Returns:
            dict: Summary statistics
        """
        sales = cls.get_sales_report(
            store_id=store_id,
            start_date=start_date,
            end_date=end_date,
            product_id=product_id,
            user_id=user_id,
            include_profit=include_profit
        )
        
        total_sales = sum(sale['total_amount'] for sale in sales)
        invoice_count = len(sales)
        average_basket = total_sales / invoice_count if invoice_count > 0 else 0
        
        result = {
            'total_sales': total_sales,
            'invoice_count': invoice_count,
            'average_basket': average_basket
        }
        
        if include_profit:
            total_profit = sum(sale.get('profit', 0) for sale in sales)
            result['total_profit'] = total_profit
        
        return result
    
    @classmethod
    def get_sellers_list(cls, store_id: str) -> List[Dict[str, Any]]:
        """Get list of sellers for filter dropdown.
        
        Args:
            store_id: Store ID
            
        Returns:
            list: List of sellers with id and name
        """
        users = User.query.filter_by(
            store_id=store_id,
            is_active=True
        ).order_by(User.name).all()
        
        return [{'id': user.id, 'name': user.name} for user in users]
    
    @classmethod
    def get_products_list(cls, store_id: str) -> List[Dict[str, Any]]:
        """Get list of products for filter dropdown.
        
        Args:
            store_id: Store ID
            
        Returns:
            list: List of products with id and name
        """
        products = Product.query.filter_by(
            store_id=store_id,
            is_active=True
        ).order_by(Product.name).all()
        
        return [{'id': product.id, 'name': product.name} for product in products]

    @classmethod
    def get_stats_by_product(
        cls,
        store_id: str,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        include_profit: bool = True
    ) -> List[Dict[str, Any]]:
        """Get sales statistics grouped by product.
        
        Args:
            store_id: Store ID
            start_date: Filter by start date
            end_date: Filter by end date
            include_profit: Include profit fields
            
        Returns:
            list: Statistics per product (total sales, quantities, profit)
            
        Validates: Requirements 6.1
        """
        # Build base query for invoice items
        query = db.session.query(
            InvoiceItem.product_id,
            func.sum(InvoiceItem.quantity).label('total_quantity'),
            func.sum(InvoiceItem.subtotal).label('total_sales'),
            func.sum(InvoiceItem.profit).label('total_profit'),
            func.count(InvoiceItem.id.distinct()).label('sale_count')
        ).join(
            Invoice, Invoice.id == InvoiceItem.invoice_id
        ).filter(
            Invoice.store_id == store_id,
            Invoice.status == 'completed'
        )
        
        # Apply date filters
        if start_date:
            start_datetime = datetime.combine(start_date, datetime.min.time())
            query = query.filter(Invoice.created_at >= start_datetime)
        
        if end_date:
            end_datetime = datetime.combine(end_date, datetime.max.time())
            query = query.filter(Invoice.created_at <= end_datetime)
        
        # Group by product
        query = query.group_by(InvoiceItem.product_id)
        
        # Order by total sales descending
        query = query.order_by(func.sum(InvoiceItem.subtotal).desc())
        
        results = query.all()
        
        # Build response with product names
        stats = []
        for row in results:
            product = Product.query.get(row.product_id)
            product_name = product.name if product else 'Produit supprimé'
            
            item = {
                'product_id': row.product_id,
                'product_name': product_name,
                'total_quantity': int(row.total_quantity or 0),
                'total_sales': float(row.total_sales or 0),
                'sale_count': int(row.sale_count or 0)
            }
            
            if include_profit:
                item['total_profit'] = float(row.total_profit or 0)
            
            stats.append(item)
        
        return stats
    
    @classmethod
    def get_stats_by_seller(
        cls,
        store_id: str,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        include_profit: bool = True
    ) -> List[Dict[str, Any]]:
        """Get sales statistics grouped by seller.
        
        Args:
            store_id: Store ID
            start_date: Filter by start date
            end_date: Filter by end date
            include_profit: Include profit fields
            
        Returns:
            list: Statistics per seller (total sales, invoice count, profit)
            
        Validates: Requirements 6.2, 6.3
        """
        # Build base query
        query = db.session.query(
            Invoice.user_id,
            func.sum(Invoice.total_amount).label('total_sales'),
            func.sum(Invoice.profit).label('total_profit'),
            func.count(Invoice.id).label('invoice_count')
        ).filter(
            Invoice.store_id == store_id,
            Invoice.status == 'completed'
        )
        
        # Apply date filters
        if start_date:
            start_datetime = datetime.combine(start_date, datetime.min.time())
            query = query.filter(Invoice.created_at >= start_datetime)
        
        if end_date:
            end_datetime = datetime.combine(end_date, datetime.max.time())
            query = query.filter(Invoice.created_at <= end_datetime)
        
        # Group by seller
        query = query.group_by(Invoice.user_id)
        
        # Order by total sales descending
        query = query.order_by(func.sum(Invoice.total_amount).desc())
        
        results = query.all()
        
        # Build response with seller names
        stats = []
        for row in results:
            user = User.query.get(row.user_id)
            user_name = user.name if user else 'Vendeur inconnu'
            
            total_sales = float(row.total_sales or 0)
            invoice_count = int(row.invoice_count or 0)
            average_basket = total_sales / invoice_count if invoice_count > 0 else 0
            
            item = {
                'user_id': row.user_id,
                'user_name': user_name,
                'total_sales': total_sales,
                'invoice_count': invoice_count,
                'average_basket': average_basket
            }
            
            if include_profit:
                item['total_profit'] = float(row.total_profit or 0)
            
            stats.append(item)
        
        return stats
    
    @classmethod
    def get_stats_by_supplier(
        cls,
        store_id: str,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None
    ) -> List[Dict[str, Any]]:
        """Get purchase statistics grouped by supplier.
        
        Args:
            store_id: Store ID
            start_date: Filter by start date
            end_date: Filter by end date
            
        Returns:
            list: Statistics per supplier (total purchases, item count)
            
        Validates: Requirements 6.4
        """
        # Build base query
        query = db.session.query(
            Purchase.supplier_name,
            func.sum(Purchase.total_cost).label('total_cost'),
            func.count(Purchase.id).label('purchase_count')
        ).filter(
            Purchase.store_id == store_id
        )
        
        # Apply date filters
        if start_date:
            start_datetime = datetime.combine(start_date, datetime.min.time())
            query = query.filter(Purchase.purchase_date >= start_datetime)
        
        if end_date:
            end_datetime = datetime.combine(end_date, datetime.max.time())
            query = query.filter(Purchase.purchase_date <= end_datetime)
        
        # Group by supplier
        query = query.group_by(Purchase.supplier_name)
        
        # Order by total cost descending
        query = query.order_by(func.sum(Purchase.total_cost).desc())
        
        results = query.all()
        
        # Build response
        stats = []
        for row in results:
            stats.append({
                'supplier_name': row.supplier_name or 'Fournisseur inconnu',
                'total_cost': float(row.total_cost or 0),
                'purchase_count': int(row.purchase_count or 0)
            })
        
        return stats
    
    @classmethod
    def get_peak_times(
        cls,
        store_id: str,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None
    ) -> Dict[str, Any]:
        """Get peak sales times analysis.
        
        Args:
            store_id: Store ID
            start_date: Filter by start date
            end_date: Filter by end date
            
        Returns:
            dict: Peak times data (by hour, by day of week)
            
        Validates: Requirements 6.5
        """
        # Build base query
        query = Invoice.query.filter(
            Invoice.store_id == store_id,
            Invoice.status == 'completed'
        )
        
        # Apply date filters
        if start_date:
            start_datetime = datetime.combine(start_date, datetime.min.time())
            query = query.filter(Invoice.created_at >= start_datetime)
        
        if end_date:
            end_datetime = datetime.combine(end_date, datetime.max.time())
            query = query.filter(Invoice.created_at <= end_datetime)
        
        invoices = query.all()
        
        # Analyze by hour
        by_hour = defaultdict(lambda: {'count': 0, 'total': 0})
        # Analyze by day of week (0=Monday, 6=Sunday)
        by_day = defaultdict(lambda: {'count': 0, 'total': 0})
        
        for invoice in invoices:
            if invoice.created_at:
                hour = invoice.created_at.hour
                day = invoice.created_at.weekday()
                
                by_hour[hour]['count'] += 1
                by_hour[hour]['total'] += float(invoice.total_amount)
                
                by_day[day]['count'] += 1
                by_day[day]['total'] += float(invoice.total_amount)
        
        # Format hourly data (0-23)
        hourly_data = []
        for hour in range(24):
            data = by_hour.get(hour, {'count': 0, 'total': 0})
            hourly_data.append({
                'hour': hour,
                'label': f'{hour:02d}:00',
                'count': data['count'],
                'total': data['total']
            })
        
        # Format daily data
        day_names = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
        daily_data = []
        for day in range(7):
            data = by_day.get(day, {'count': 0, 'total': 0})
            daily_data.append({
                'day': day,
                'label': day_names[day],
                'count': data['count'],
                'total': data['total']
            })
        
        # Find peak hour and day
        peak_hour = max(hourly_data, key=lambda x: x['total']) if hourly_data else None
        peak_day = max(daily_data, key=lambda x: x['total']) if daily_data else None
        
        return {
            'by_hour': hourly_data,
            'by_day': daily_data,
            'peak_hour': peak_hour,
            'peak_day': peak_day
        }
    
    @classmethod
    def get_sales_trend(
        cls,
        store_id: str,
        period: str = 'day',
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        include_profit: bool = True
    ) -> List[Dict[str, Any]]:
        """Get sales trend over time.
        
        Args:
            store_id: Store ID
            period: Grouping period ('day', 'week', 'month')
            start_date: Filter by start date
            end_date: Filter by end date
            include_profit: Include profit fields
            
        Returns:
            list: Sales data grouped by period
            
        Validates: Requirements 6.5
        """
        # Default date range if not specified
        if not end_date:
            end_date = date.today()
        if not start_date:
            if period == 'day':
                start_date = end_date - timedelta(days=30)
            elif period == 'week':
                start_date = end_date - timedelta(weeks=12)
            else:  # month
                start_date = end_date - timedelta(days=365)
        
        # Build base query
        query = Invoice.query.filter(
            Invoice.store_id == store_id,
            Invoice.status == 'completed'
        )
        
        start_datetime = datetime.combine(start_date, datetime.min.time())
        end_datetime = datetime.combine(end_date, datetime.max.time())
        query = query.filter(
            Invoice.created_at >= start_datetime,
            Invoice.created_at <= end_datetime
        )
        
        invoices = query.order_by(Invoice.created_at).all()
        
        # Group by period
        grouped = defaultdict(lambda: {'total': 0, 'profit': 0, 'count': 0})
        
        for invoice in invoices:
            if invoice.created_at:
                if period == 'day':
                    key = invoice.created_at.date().isoformat()
                elif period == 'week':
                    # Get ISO week
                    iso_cal = invoice.created_at.isocalendar()
                    key = f'{iso_cal[0]}-W{iso_cal[1]:02d}'
                else:  # month
                    key = invoice.created_at.strftime('%Y-%m')
                
                grouped[key]['total'] += float(invoice.total_amount)
                grouped[key]['profit'] += float(invoice.profit)
                grouped[key]['count'] += 1
        
        # Convert to sorted list
        trend = []
        for key in sorted(grouped.keys()):
            data = grouped[key]
            item = {
                'period': key,
                'total_sales': data['total'],
                'invoice_count': data['count'],
                'average_basket': data['total'] / data['count'] if data['count'] > 0 else 0
            }
            if include_profit:
                item['total_profit'] = data['profit']
            trend.append(item)
        
        return trend
    
    @classmethod
    def get_advanced_stats(
        cls,
        store_id: str,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        include_profit: bool = True
    ) -> Dict[str, Any]:
        """Get comprehensive advanced statistics.
        
        Args:
            store_id: Store ID
            start_date: Filter by start date
            end_date: Filter by end date
            include_profit: Include profit fields
            
        Returns:
            dict: All advanced statistics combined
            
        Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5
        """
        # Get summary
        summary = cls.get_sales_summary(
            store_id=store_id,
            start_date=start_date,
            end_date=end_date,
            include_profit=include_profit
        )
        
        # Get stats by product
        by_product = cls.get_stats_by_product(
            store_id=store_id,
            start_date=start_date,
            end_date=end_date,
            include_profit=include_profit
        )
        
        # Get stats by seller
        by_seller = cls.get_stats_by_seller(
            store_id=store_id,
            start_date=start_date,
            end_date=end_date,
            include_profit=include_profit
        )
        
        # Get peak times
        peak_times = cls.get_peak_times(
            store_id=store_id,
            start_date=start_date,
            end_date=end_date
        )
        
        # Get daily trend
        daily_trend = cls.get_sales_trend(
            store_id=store_id,
            period='day',
            start_date=start_date,
            end_date=end_date,
            include_profit=include_profit
        )
        
        # Get stats by supplier
        by_supplier = cls.get_stats_by_supplier(
            store_id=store_id,
            start_date=start_date,
            end_date=end_date
        )
        
        return {
            'summary': summary,
            'by_product': by_product,
            'by_seller': by_seller,
            'by_supplier': by_supplier,
            'peak_times': peak_times,
            'daily_trend': daily_trend
        }
