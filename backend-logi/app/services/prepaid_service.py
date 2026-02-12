"""Prepaid sales service for managing prepaid invoices and deliveries.

Handles:
- Listing prepaid invoices pending delivery
- Recording deliveries (full or partial)
- Stock decrement on delivery
- Delivery history

"""
from decimal import Decimal
from typing import Optional, List, Dict, Any
from datetime import datetime

from app import db
from app.models import (
    Invoice, InvoiceItem, Product, ProductVariant, User,
    PrepaidDelivery, PrepaidDeliveryItem
)


class PrepaidService:
    """Service for managing prepaid sales and deliveries."""
    
    @classmethod
    def get_pending_prepaids(
        cls,
        store_id: str,
        status_filter: Optional[str] = None,
        client_name: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Get prepaid invoices pending delivery.
        
        Args:
            store_id: Store ID
            status_filter: Optional filter ('pending', 'partial', 'delivered')
            client_name: Optional client name filter (partial match)
            start_date: Optional start date filter (YYYY-MM-DD)
            end_date: Optional end date filter (YYYY-MM-DD)
            
        Returns:
            list: List of prepaid invoices with delivery status
        """
        query = Invoice.query.filter(
            Invoice.store_id == store_id,
            Invoice.is_prepaid == True,
            Invoice.status == 'completed'
        )
        
        if status_filter:
            query = query.filter(Invoice.prepaid_status == status_filter)
        else:
            # By default, show pending and partial (not fully delivered)
            query = query.filter(Invoice.prepaid_status.in_(['pending', 'partial']))
        
        # Filter by client name (case-insensitive partial match)
        if client_name:
            query = query.filter(Invoice.prepaid_client_name.ilike(f'%{client_name}%'))
        
        # Filter by date range
        if start_date:
            try:
                from datetime import datetime
                start_dt = datetime.strptime(start_date, '%Y-%m-%d')
                query = query.filter(Invoice.created_at >= start_dt)
            except ValueError:
                pass
        
        if end_date:
            try:
                from datetime import datetime
                end_dt = datetime.strptime(end_date, '%Y-%m-%d')
                end_dt = end_dt.replace(hour=23, minute=59, second=59)
                query = query.filter(Invoice.created_at <= end_dt)
            except ValueError:
                pass
        
        query = query.order_by(Invoice.created_at.desc())
        invoices = query.all()
        
        result = []
        for invoice in invoices:
            result.append(cls._invoice_to_dict(invoice))
        
        return result
    
    @classmethod
    def get_prepaid_invoice(
        cls,
        invoice_id: str,
        store_id: str
    ) -> Optional[Dict[str, Any]]:
        """Get a specific prepaid invoice with full details.
        
        Args:
            invoice_id: Invoice ID
            store_id: Store ID
            
        Returns:
            dict: Invoice data or None
        """
        invoice = Invoice.query.filter(
            Invoice.id == invoice_id,
            Invoice.store_id == store_id,
            Invoice.is_prepaid == True
        ).first()
        
        if not invoice:
            return None
        
        return cls._invoice_to_dict(invoice, include_deliveries=True)
    
    @classmethod
    def _invoice_to_dict(
        cls,
        invoice: Invoice,
        include_deliveries: bool = False
    ) -> Dict[str, Any]:
        """Convert prepaid invoice to dictionary.
        
        Args:
            invoice: Invoice model
            include_deliveries: Include delivery history
            
        Returns:
            dict: Invoice data
        """
        # Get seller name
        user = User.query.get(invoice.user_id)
        user_name = user.name if user else 'Inconnu'
        
        # Get items with delivery status
        items = []
        for item in invoice.items.all():
            product = Product.query.get(item.product_id)
            variant = ProductVariant.query.get(item.variant_id) if item.variant_id else None
            
            items.append({
                'id': item.id,
                'product_id': item.product_id,
                'product_name': product.name if product else 'Produit supprimé',
                'variant_id': item.variant_id,
                'variant_name': variant.name if variant else None,
                'quantity': item.quantity,
                'delivered_quantity': item.delivered_quantity,
                'remaining_quantity': item.quantity - item.delivered_quantity,
                'unit_price': float(item.unit_price),
                'subtotal': float(item.subtotal)
            })
        
        data = {
            'id': invoice.id,
            'invoice_number': invoice.invoice_number,
            'user_id': invoice.user_id,
            'user_name': user_name,
            'client_name': invoice.prepaid_client_name or 'Client inconnu',
            'total_amount': float(invoice.total_amount),
            'prepaid_status': invoice.prepaid_status,
            'created_at': invoice.created_at.isoformat() if invoice.created_at else None,
            'items': items,
            'delivery_progress': invoice.get_delivery_progress()
        }
        
        if include_deliveries:
            data['deliveries'] = cls._get_delivery_history(invoice)
        
        return data
    
    @classmethod
    def _get_delivery_history(cls, invoice: Invoice) -> List[Dict[str, Any]]:
        """Get delivery history for an invoice.
        
        Args:
            invoice: Invoice model
            
        Returns:
            list: List of deliveries
        """
        deliveries = []
        for delivery in invoice.deliveries.order_by(PrepaidDelivery.created_at.desc()).all():
            user = User.query.get(delivery.user_id)
            
            items = []
            for item in delivery.items.all():
                invoice_item = InvoiceItem.query.get(item.invoice_item_id)
                product = Product.query.get(invoice_item.product_id) if invoice_item else None
                
                items.append({
                    'product_name': product.name if product else 'Produit supprimé',
                    'quantity': item.quantity
                })
            
            deliveries.append({
                'id': delivery.id,
                'user_name': user.name if user else 'Inconnu',
                'created_at': delivery.created_at.isoformat() if delivery.created_at else None,
                'notes': delivery.notes,
                'items': items
            })
        
        return deliveries
    
    @classmethod
    def record_delivery(
        cls,
        invoice_id: str,
        store_id: str,
        user_id: str,
        items: List[Dict[str, Any]],
        notes: Optional[str] = None
    ) -> Dict[str, Any]:
        """Record a delivery for a prepaid invoice.
        
        Args:
            invoice_id: Invoice ID
            store_id: Store ID
            user_id: User performing the delivery
            items: List of items to deliver, each with:
                - invoice_item_id: Invoice item ID
                - quantity: Quantity to deliver
            notes: Optional delivery notes
            
        Returns:
            dict: Result with success status
        """
        # Get invoice
        invoice = Invoice.query.filter(
            Invoice.id == invoice_id,
            Invoice.store_id == store_id,
            Invoice.is_prepaid == True,
            Invoice.status == 'completed'
        ).first()
        
        if not invoice:
            return {
                'success': False,
                'error': 'Facture prépayée non trouvée'
            }
        
        if invoice.prepaid_status == 'delivered':
            return {
                'success': False,
                'error': 'Cette facture a déjà été entièrement livrée'
            }
        
        # Validate items
        if not items:
            return {
                'success': False,
                'error': 'Aucun article à livrer'
            }
        
        # Create delivery record
        delivery = PrepaidDelivery(
            invoice_id=invoice_id,
            user_id=user_id,
            notes=notes
        )
        db.session.add(delivery)
        db.session.flush()  # Get delivery ID
        
        total_delivered = 0
        
        for item_data in items:
            invoice_item_id = item_data.get('invoice_item_id')
            quantity = item_data.get('quantity', 0)
            
            if quantity <= 0:
                continue
            
            # Get invoice item
            invoice_item = InvoiceItem.query.filter(
                InvoiceItem.id == invoice_item_id,
                InvoiceItem.invoice_id == invoice_id
            ).first()
            
            if not invoice_item:
                db.session.rollback()
                return {
                    'success': False,
                    'error': f'Article non trouvé: {invoice_item_id}'
                }
            
            # Check remaining quantity
            remaining = invoice_item.quantity - invoice_item.delivered_quantity
            if quantity > remaining:
                db.session.rollback()
                product = Product.query.get(invoice_item.product_id)
                return {
                    'success': False,
                    'error': f'Quantité demandée ({quantity}) supérieure au reste à livrer ({remaining}) pour {product.name if product else "produit"}'
                }
            
            # Decrement stock
            stock_result = cls._decrement_stock(
                invoice_item.product_id,
                invoice_item.variant_id,
                quantity
            )
            
            if not stock_result['success']:
                db.session.rollback()
                return stock_result
            
            # Update delivered quantity
            invoice_item.delivered_quantity += quantity
            
            # Create delivery item record
            delivery_item = PrepaidDeliveryItem(
                delivery_id=delivery.id,
                invoice_item_id=invoice_item_id,
                quantity=quantity
            )
            db.session.add(delivery_item)
            
            total_delivered += quantity
        
        if total_delivered == 0:
            db.session.rollback()
            return {
                'success': False,
                'error': 'Aucune quantité à livrer'
            }
        
        # Update prepaid status
        cls._update_prepaid_status(invoice)
        
        db.session.commit()
        
        return {
            'success': True,
            'message': f'Livraison enregistrée ({total_delivered} article(s))',
            'invoice': cls._invoice_to_dict(invoice, include_deliveries=True)
        }
    
    @classmethod
    def deliver_all(
        cls,
        invoice_id: str,
        store_id: str,
        user_id: str,
        notes: Optional[str] = None
    ) -> Dict[str, Any]:
        """Deliver all remaining items for a prepaid invoice.
        
        Args:
            invoice_id: Invoice ID
            store_id: Store ID
            user_id: User performing the delivery
            notes: Optional delivery notes
            
        Returns:
            dict: Result with success status
        """
        # Get invoice
        invoice = Invoice.query.filter(
            Invoice.id == invoice_id,
            Invoice.store_id == store_id,
            Invoice.is_prepaid == True,
            Invoice.status == 'completed'
        ).first()
        
        if not invoice:
            return {
                'success': False,
                'error': 'Facture prépayée non trouvée'
            }
        
        # Build items list with remaining quantities
        items = []
        for item in invoice.items.all():
            remaining = item.quantity - item.delivered_quantity
            if remaining > 0:
                items.append({
                    'invoice_item_id': item.id,
                    'quantity': remaining
                })
        
        if not items:
            return {
                'success': False,
                'error': 'Tous les articles ont déjà été livrés'
            }
        
        return cls.record_delivery(
            invoice_id=invoice_id,
            store_id=store_id,
            user_id=user_id,
            items=items,
            notes=notes
        )
    
    @classmethod
    def _decrement_stock(
        cls,
        product_id: str,
        variant_id: Optional[str],
        quantity: int
    ) -> Dict[str, Any]:
        """Decrement stock for a product.
        
        Args:
            product_id: Product ID
            variant_id: Optional variant ID
            quantity: Quantity to decrement
            
        Returns:
            dict: Result with success status
        """
        product = Product.query.get(product_id)
        if not product:
            return {
                'success': False,
                'error': 'Produit non trouvé'
            }
        
        # Calculate stock units to decrement
        unit_multiplier = 1
        if variant_id:
            variant = ProductVariant.query.get(variant_id)
            if variant:
                unit_multiplier = variant.unit_multiplier or 1
        
        stock_to_decrement = quantity * unit_multiplier
        
        # Check stock availability
        if product.stock_quantity < stock_to_decrement:
            return {
                'success': False,
                'error': f'Stock insuffisant pour {product.name}. Disponible: {product.stock_quantity}, Requis: {stock_to_decrement}'
            }
        
        # Decrement stock
        product.stock_quantity -= stock_to_decrement
        
        return {'success': True}
    
    @classmethod
    def _update_prepaid_status(cls, invoice: Invoice) -> None:
        """Update prepaid status based on delivery progress.
        
        Args:
            invoice: Invoice model
        """
        total_qty = sum(item.quantity for item in invoice.items.all())
        delivered_qty = sum(item.delivered_quantity for item in invoice.items.all())
        
        if delivered_qty == 0:
            invoice.prepaid_status = 'pending'
        elif delivered_qty >= total_qty:
            invoice.prepaid_status = 'delivered'
        else:
            invoice.prepaid_status = 'partial'
