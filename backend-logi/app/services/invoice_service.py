"""Invoice service for cart management and invoice operations.

Handles:
- Cart management (add, remove, clear items)
- Stock verification with packaging multiplier
- Subtotal and total calculation
- Invoice confirmation and cancellation
- Paused cart management

Validates: Requirements 1.1-1.12
"""
from decimal import Decimal
from typing import Optional, List, Dict, Any
from datetime import datetime

from app import db
from app.models import Product, ProductVariant, Invoice, InvoiceItem
from app.services.event_service import EventService


class CartItem:
    """Represents an item in the shopping cart.
    
    Attributes:
        product_id: Product ID
        variant_id: Optional variant ID
        quantity: Number of units
        unit_price: Price per unit/variant
        unit_multiplier: Units per variant (for stock calculation)
        product_name: Product name for display
        variant_name: Variant name for display
        purchase_price: Purchase price per base unit (for profit calculation)
    """
    
    def __init__(self, product_id: str, quantity: int, unit_price: Decimal,
                 unit_multiplier: int = 1, variant_id: Optional[str] = None,
                 product_name: str = '', variant_name: Optional[str] = None,
                 purchase_price: Decimal = Decimal('0')):
        self.product_id = product_id
        self.variant_id = variant_id
        self.quantity = quantity
        self.unit_price = Decimal(str(unit_price))
        self.unit_multiplier = unit_multiplier
        self.product_name = product_name
        self.variant_name = variant_name
        self.purchase_price = Decimal(str(purchase_price))
    
    @property
    def subtotal(self) -> Decimal:
        """Calculate subtotal (price × quantity).
        
        Returns:
            Decimal: Subtotal amount
            
        Validates: Requirements 1.4
        """
        return self.unit_price * Decimal(str(self.quantity))
    
    @property
    def stock_required(self) -> int:
        """Calculate stock required in base units.
        
        Returns:
            int: Number of base units required
        """
        return self.quantity * self.unit_multiplier
    
    @property
    def profit(self) -> Decimal:
        """Calculate profit for this item.
        
        Profit = (variant.sale_price - variant.purchase_price) × quantity
        
        Returns:
            Decimal: Profit amount
            
        Validates: Requirements 2.3
        """
        revenue = self.subtotal  # unit_price * quantity (unit_price is variant's sale_price)
        # purchase_price is the variant's purchase_price (cost for the entire variant)
        cost = Decimal(str(self.quantity)) * self.purchase_price
        return revenue - cost
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary.
        
        Returns:
            dict: Item data
        """
        return {
            'product_id': self.product_id,
            'variant_id': self.variant_id,
            'quantity': self.quantity,
            'unit_price': float(self.unit_price),
            'unit_multiplier': self.unit_multiplier,
            'product_name': self.product_name,
            'variant_name': self.variant_name,
            'subtotal': float(self.subtotal),
            'stock_required': self.stock_required
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'CartItem':
        """Create CartItem from dictionary.
        
        Args:
            data: Dictionary with item data
            
        Returns:
            CartItem instance
        """
        return cls(
            product_id=data['product_id'],
            quantity=data['quantity'],
            unit_price=Decimal(str(data['unit_price'])),
            unit_multiplier=data.get('unit_multiplier', 1),
            variant_id=data.get('variant_id'),
            product_name=data.get('product_name', ''),
            variant_name=data.get('variant_name'),
            purchase_price=Decimal(str(data.get('purchase_price', 0)))
        )


class Cart:
    """Shopping cart for managing items before invoice creation.
    
    Validates: Requirements 1.5, 1.6, 1.7, 1.9
    """
    
    def __init__(self, user_id: str, store_id: str):
        self.user_id = user_id
        self.store_id = store_id
        self.items: List[CartItem] = []
        self.created_at = datetime.utcnow()
    
    @property
    def total(self) -> Decimal:
        """Calculate cart total.
        
        Returns:
            Decimal: Sum of all item subtotals
            
        Validates: Requirements 1.7, 1.9
        """
        return sum(item.subtotal for item in self.items)
    
    @property
    def total_profit(self) -> Decimal:
        """Calculate total profit.
        
        Returns:
            Decimal: Sum of all item profits
        """
        return sum(item.profit for item in self.items)
    
    def add_item(self, item: CartItem) -> None:
        """Add item to cart.
        
        Args:
            item: CartItem to add
        """
        # Check if same product/variant already in cart
        for existing in self.items:
            if (existing.product_id == item.product_id and 
                existing.variant_id == item.variant_id):
                # Update quantity instead of adding new item
                existing.quantity += item.quantity
                return
        
        self.items.append(item)
    
    def remove_item(self, product_id: str, variant_id: Optional[str] = None) -> bool:
        """Remove item from cart.
        
        Args:
            product_id: Product ID
            variant_id: Optional variant ID
            
        Returns:
            bool: True if item was removed
            
        Validates: Requirements 1.8
        """
        for i, item in enumerate(self.items):
            if (item.product_id == product_id and 
                item.variant_id == variant_id):
                self.items.pop(i)
                return True
        return False
    
    def clear(self) -> None:
        """Clear all items from cart.
        
        Validates: Requirements 1.11
        """
        self.items = []
    
    def is_empty(self) -> bool:
        """Check if cart is empty.
        
        Returns:
            bool: True if cart has no items
        """
        return len(self.items) == 0
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert cart to dictionary.
        
        Returns:
            dict: Cart data
        """
        return {
            'user_id': self.user_id,
            'store_id': self.store_id,
            'items': [item.to_dict() for item in self.items],
            'total': float(self.total),
            'created_at': self.created_at.isoformat()
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Cart':
        """Create Cart from dictionary.
        
        Args:
            data: Dictionary with cart data
            
        Returns:
            Cart instance
            
        Validates: Requirements 1.12
        """
        cart = cls(
            user_id=data['user_id'],
            store_id=data['store_id']
        )
        cart.items = [CartItem.from_dict(item) for item in data.get('items', [])]
        if 'created_at' in data:
            cart.created_at = datetime.fromisoformat(data['created_at'])
        return cart


class StockError(Exception):
    """Exception raised when stock is insufficient."""
    
    def __init__(self, product_name: str, available: int, required: int,
                 product_id: str = None, variant_id: str = None):
        self.product_name = product_name
        self.available = available
        self.required = required
        self.product_id = product_id
        self.variant_id = variant_id
        super().__init__(
            f"Stock insuffisant pour '{product_name}': "
            f"{available} unités disponibles, {required} requises"
        )
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for API response."""
        return {
            'product_name': self.product_name,
            'available': self.available,
            'required': self.required,
            'product_id': self.product_id,
            'variant_id': self.variant_id
        }


class InvoiceService:
    """Service for invoice and cart management.
    
    Validates: Requirements 1.1-1.12
    """
    
    # In-memory cart storage (per user)
    # In production, this would be stored in Redis or session
    _carts: Dict[str, Cart] = {}
    _paused_carts: Dict[str, List[Dict[str, Any]]] = {}
    
    @classmethod
    def get_cart(cls, user_id: str, store_id: str) -> Cart:
        """Get or create cart for user.
        
        Args:
            user_id: User ID
            store_id: Store ID
            
        Returns:
            Cart instance
        """
        cart_key = f"{store_id}:{user_id}"
        if cart_key not in cls._carts:
            cls._carts[cart_key] = Cart(user_id, store_id)
        return cls._carts[cart_key]
    
    @classmethod
    def clear_cart(cls, user_id: str, store_id: str) -> None:
        """Clear user's cart.
        
        Args:
            user_id: User ID
            store_id: Store ID
        """
        cart_key = f"{store_id}:{user_id}"
        if cart_key in cls._carts:
            cls._carts[cart_key].clear()

    @classmethod
    def verify_stock(cls, product: Product, quantity: int, 
                     unit_multiplier: int = 1) -> bool:
        """Verify if stock is sufficient for the requested quantity.
        
        Args:
            product: Product to check
            quantity: Number of units requested
            unit_multiplier: Multiplier for packaging
            
        Returns:
            bool: True if stock is sufficient
            
        Validates: Requirements 1.5
        """
        required_units = quantity * unit_multiplier
        return product.stock_quantity >= required_units
    
    @classmethod
    def verify_stock_for_sale(cls, store_id: str, items: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Verify stock availability for all items before processing a sale.
        
        This method performs real-time stock verification to prevent overselling
        in multi-user scenarios. It checks current stock levels against requested
        quantities and returns detailed information about any insufficient stock.
        
        Args:
            store_id: Store ID
            items: List of items to verify, each containing:
                - product_id: Product ID
                - variant_id: Optional variant ID
                - quantity: Number of units requested
                
        Returns:
            dict: Result with:
                - success: True if all items have sufficient stock
                - insufficient_items: List of items with insufficient stock (if any)
                - message: Human-readable message
                
        Validates: Requirements 2.4, 5.2
        """
        insufficient_items = []
        
        for item in items:
            product_id = item.get('product_id')
            variant_id = item.get('variant_id')
            quantity = int(item.get('quantity', 1))
            
            # Get current product stock from database
            product = Product.query.filter_by(
                id=product_id,
                store_id=store_id,
                is_active=True
            ).first()
            
            if not product:
                insufficient_items.append({
                    'product_id': product_id,
                    'variant_id': variant_id,
                    'product_name': 'Produit non trouvé',
                    'requested': quantity,
                    'available': 0,
                    'error': 'product_not_found'
                })
                continue
            
            # Get unit multiplier from variant if specified
            unit_multiplier = 1
            if variant_id:
                variant = ProductVariant.query.filter_by(
                    id=variant_id,
                    product_id=product_id
                ).first()
                if variant:
                    unit_multiplier = variant.unit_multiplier or 1
            
            # Calculate required stock in base units
            required_units = quantity * unit_multiplier
            
            # Check if stock is sufficient
            if product.stock_quantity < required_units:
                # Calculate available quantity in variant units
                available_in_variant_units = product.stock_quantity // unit_multiplier
                
                insufficient_items.append({
                    'product_id': product_id,
                    'variant_id': variant_id,
                    'product_name': product.name,
                    'requested': quantity,
                    'available': available_in_variant_units,
                    'available_base_units': product.stock_quantity,
                    'unit_multiplier': unit_multiplier,
                    'error': 'insufficient_stock'
                })
        
        if insufficient_items:
            return {
                'success': False,
                'insufficient_items': insufficient_items,
                'message': f"Stock insuffisant pour {len(insufficient_items)} produit(s)"
            }
        
        return {
            'success': True,
            'insufficient_items': [],
            'message': 'Stock disponible pour tous les produits'
        }
    
    @classmethod
    def add_to_cart(cls, user_id: str, store_id: str, product_id: str,
                    quantity: int, variant_id: Optional[str] = None) -> Dict[str, Any]:
        """Add product to cart with stock verification.
        
        Args:
            user_id: User ID
            store_id: Store ID
            product_id: Product ID
            quantity: Number of units
            variant_id: Optional variant ID
            
        Returns:
            dict: Result with cart data or error
            
        Raises:
            StockError: If stock is insufficient
            ValueError: If product not found
            
        Validates: Requirements 1.1, 1.2, 1.3, 1.5, 1.6, 1.7
        """
        # Get product
        product = Product.query.filter_by(
            id=product_id,
            store_id=store_id,
            is_active=True
        ).first()
        
        if not product:
            raise ValueError(f"Produit non trouvé: {product_id}")
        
        # Determine price and multiplier
        unit_price = product.sale_price
        unit_multiplier = 1
        variant_name = None
        
        if variant_id:
            variant = ProductVariant.query.filter_by(
                id=variant_id,
                product_id=product_id
            ).first()
            
            if not variant:
                raise ValueError(f"Conditionnement non trouvé: {variant_id}")
            
            unit_price = variant.sale_price
            unit_multiplier = variant.unit_multiplier
            variant_name = variant.name
        
        # Calculate total stock required including existing cart items
        cart = cls.get_cart(user_id, store_id)
        existing_required = 0
        
        for item in cart.items:
            if item.product_id == product_id:
                existing_required += item.stock_required
        
        new_required = quantity * unit_multiplier
        total_required = existing_required + new_required
        
        # Verify stock
        if product.stock_quantity < total_required:
            raise StockError(
                product_name=product.name,
                available=product.stock_quantity,
                required=total_required
            )
        
        # Determine purchase price: use variant's purchase_price if available, fallback to product
        # purchase_price should be the cost for the variant (not per base unit)
        purchase_price = Decimal(str(product.purchase_price or 0)) * unit_multiplier  # Default: product cost * multiplier
        if variant_id:
            variant = ProductVariant.query.filter_by(
                id=variant_id,
                product_id=product_id
            ).first()
            if variant and variant.purchase_price is not None and variant.purchase_price > 0:
                # Use variant's purchase_price directly (cost for the entire variant)
                purchase_price = Decimal(str(variant.purchase_price))
            elif variant:
                # Fallback to product's purchase_price * multiplier
                purchase_price = Decimal(str(product.purchase_price or 0)) * unit_multiplier
        
        # Create cart item
        cart_item = CartItem(
            product_id=product_id,
            quantity=quantity,
            unit_price=unit_price,
            unit_multiplier=unit_multiplier,
            variant_id=variant_id,
            product_name=product.name,
            variant_name=variant_name,
            purchase_price=purchase_price
        )
        
        # Add to cart
        cart.add_item(cart_item)
        
        return {
            'success': True,
            'cart': cart.to_dict(),
            'message': f"'{product.name}' ajouté au panier"
        }
    
    @classmethod
    def remove_from_cart(cls, user_id: str, store_id: str, product_id: str,
                         variant_id: Optional[str] = None) -> Dict[str, Any]:
        """Remove item from cart.
        
        Args:
            user_id: User ID
            store_id: Store ID
            product_id: Product ID
            variant_id: Optional variant ID
            
        Returns:
            dict: Result with updated cart
            
        Validates: Requirements 1.8
        """
        cart = cls.get_cart(user_id, store_id)
        removed = cart.remove_item(product_id, variant_id)
        
        return {
            'success': removed,
            'cart': cart.to_dict(),
            'message': 'Item retiré du panier' if removed else 'Item non trouvé'
        }
    
    @classmethod
    def get_cart_data(cls, user_id: str, store_id: str) -> Dict[str, Any]:
        """Get current cart data.
        
        Args:
            user_id: User ID
            store_id: Store ID
            
        Returns:
            dict: Cart data
        """
        cart = cls.get_cart(user_id, store_id)
        return cart.to_dict()
    
    @classmethod
    def calculate_subtotal(cls, quantity: int, unit_price: float) -> float:
        """Calculate subtotal for an item.
        
        Args:
            quantity: Number of units
            unit_price: Price per unit
            
        Returns:
            float: Subtotal (quantity × unit_price)
            
        Validates: Requirements 1.4
        """
        return float(Decimal(str(quantity)) * Decimal(str(unit_price)))
    
    # ==================== Invoice Operations ====================
    
    @classmethod
    def _get_next_invoice_number(cls, store_id: str) -> str:
        """Generate next unique invoice number.
        
        Args:
            store_id: Store ID
            
        Returns:
            str: Unique invoice number
            
        Validates: Requirements 1.10
        """
        today = datetime.utcnow().date()
        date_str = today.strftime('%Y%m%d')
        store_prefix = store_id[:4].upper()
        
        # Count invoices for today
        today_start = datetime.combine(today, datetime.min.time())
        today_end = datetime.combine(today, datetime.max.time())
        
        count = Invoice.query.filter(
            Invoice.store_id == store_id,
            Invoice.created_at >= today_start,
            Invoice.created_at <= today_end
        ).count()
        
        sequence = count + 1
        return f"{store_prefix}-{date_str}-{sequence:04d}"
    
    @classmethod
    def confirm_invoice(cls, user_id: str, store_id: str,
                        items: Optional[List[Dict]] = None,
                        total_amount: float = 0,
                        discount_amount: float = 0,
                        voucher_code: Optional[str] = None,
                        is_prepaid: bool = False,
                        prepaid_client_name: Optional[str] = None) -> Dict[str, Any]:
        """Confirm cart as invoice and update stock.

        Args:
            user_id: User ID
            store_id: Store ID
            items: List of items from frontend (optional)
            total_amount: Total amount from frontend
            discount_amount: Optional discount
            voucher_code: Optional voucher code applied
            is_prepaid: If True, stock is NOT decremented (prepaid sale)
            prepaid_client_name: Client name for prepaid sales

        Returns:
            dict: Result with invoice data

        Validates: Requirements 1.10
        """
        # If items provided from frontend, use them directly
        if items and len(items) > 0:
            return cls._confirm_invoice_from_items(
                user_id=user_id,
                store_id=store_id,
                items=items,
                total_amount=total_amount,
                discount_amount=discount_amount,
                voucher_code=voucher_code,
                is_prepaid=is_prepaid,
                prepaid_client_name=prepaid_client_name
            )

        # Otherwise use server-side cart
        cart = cls.get_cart(user_id, store_id)

        if cart.is_empty():
            return {
                'success': False,
                'error': 'Le panier est vide'
            }

        # Final stock verification
        for item in cart.items:
            product = Product.query.get(item.product_id)
            if not product:
                return {
                    'success': False,
                    'error': f"Produit non trouvé: {item.product_name}"
                }

            if product.stock_quantity < item.stock_required:
                return {
                    'success': False,
                    'error': f"Stock insuffisant pour '{item.product_name}': "
                             f"{product.stock_quantity} disponibles, "
                             f"{item.stock_required} requis"
                }

        # Create invoice
        invoice_number = cls._get_next_invoice_number(store_id)
        invoice_total = cart.total - Decimal(str(discount_amount))
        total_profit = cart.total_profit

        invoice = Invoice(
            store_id=store_id,
            user_id=user_id,
            invoice_number=invoice_number,
            total_amount=max(invoice_total, Decimal('0')),
            discount_amount=Decimal(str(discount_amount)),
            profit=total_profit,
            status='completed',
            voucher_code=voucher_code
        )

        db.session.add(invoice)
        db.session.flush()  # Get invoice ID

        # Create invoice items and update stock
        for item in cart.items:
            invoice_item = InvoiceItem(
                invoice_id=invoice.id,
                product_id=item.product_id,
                variant_id=item.variant_id,
                quantity=item.quantity,
                unit_price=item.unit_price,
                subtotal=item.subtotal,
                profit=item.profit
            )
            db.session.add(invoice_item)

            # Update stock
            product = Product.query.get(item.product_id)
            product.stock_quantity -= item.stock_required

        db.session.commit()

        # Clear cart
        cls.clear_cart(user_id, store_id)

        # Emit invoice created event
        # Validates: Requirements 3.1
        EventService.emit_invoice_change(
            store_id=store_id,
            invoice=invoice.to_dict(),
            action='created'
        )

        return {
            'success': True,
            'invoice': invoice.to_dict(),
            'message': f"Facture {invoice_number} créée avec succès"
        }

    @classmethod
    def _confirm_invoice_from_items(cls, user_id: str, store_id: str,
                                     items: List[Dict],
                                     total_amount: float = 0,
                                     discount_amount: float = 0,
                                     voucher_code: Optional[str] = None,
                                     is_prepaid: bool = False,
                                     prepaid_client_name: Optional[str] = None) -> Dict[str, Any]:
        """Create invoice from frontend items.

        Args:
            user_id: User ID
            store_id: Store ID
            items: List of items from frontend
            total_amount: Total amount
            discount_amount: Discount amount
            voucher_code: Voucher code
            is_prepaid: If True, stock is NOT decremented (prepaid sale)
            prepaid_client_name: Client name for prepaid sales

        Returns:
            dict: Result with invoice data
        """
        if not items:
            return {'success': False, 'error': 'Le panier est vide'}

        # Verify stock and prepare items
        invoice_items_data = []
        total_profit = Decimal('0')
        calculated_total = Decimal('0')

        for item in items:
            product_id = item.get('product_id')
            variant_id = item.get('variant_id')
            quantity = int(item.get('quantity', 1))
            unit_price = Decimal(str(item.get('unit_price', 0)))

            product = Product.query.filter_by(id=product_id, store_id=store_id).first()
            if not product:
                return {'success': False, 'error': f"Produit non trouvé"}

            # Get variant for multiplier and purchase_price
            multiplier = 1
            variant = None
            if variant_id:
                variant = ProductVariant.query.get(variant_id)
                if variant:
                    multiplier = variant.unit_multiplier or 1

            stock_required = quantity * multiplier

            if product.stock_quantity < stock_required:
                return {
                    'success': False,
                    'error': f"Stock insuffisant pour '{product.name}'"
                }

            subtotal = unit_price * quantity
            # Profit = (variant.sale_price - variant.purchase_price) × quantity
            # Use variant's purchase_price if available, fallback to product's purchase_price
            if variant and variant.purchase_price is not None and variant.purchase_price > 0:
                # variant.purchase_price is the cost for the entire variant (e.g., pack of 6)
                # So profit = (sale_price - purchase_price) * quantity where both are per variant
                item_profit = (unit_price - Decimal(str(variant.purchase_price))) * quantity
            else:
                # Fallback: use product's purchase_price per base unit * multiplier
                cost_per_variant = Decimal(str(product.purchase_price or 0)) * multiplier
                item_profit = (unit_price - cost_per_variant) * quantity

            invoice_items_data.append({
                'product_id': product_id,
                'variant_id': variant_id,
                'quantity': quantity,
                'unit_price': unit_price,
                'subtotal': subtotal,
                'profit': item_profit,
                'stock_required': stock_required,
                'product': product
            })

            calculated_total += subtotal
            total_profit += item_profit

        # Create invoice
        invoice_number = cls._get_next_invoice_number(store_id)
        final_total = calculated_total - Decimal(str(discount_amount))

        invoice = Invoice(
            store_id=store_id,
            user_id=user_id,
            invoice_number=invoice_number,
            total_amount=max(final_total, Decimal('0')),
            discount_amount=Decimal(str(discount_amount)),
            profit=total_profit,
            status='completed',
            voucher_code=voucher_code,
            is_prepaid=is_prepaid,
            prepaid_status='pending' if is_prepaid else None,
            prepaid_client_name=prepaid_client_name if is_prepaid else None
        )

        db.session.add(invoice)
        db.session.flush()

        # Create invoice items and update stock (only if not prepaid)
        for item_data in invoice_items_data:
            invoice_item = InvoiceItem(
                invoice_id=invoice.id,
                product_id=item_data['product_id'],
                variant_id=item_data['variant_id'],
                quantity=item_data['quantity'],
                unit_price=item_data['unit_price'],
                subtotal=item_data['subtotal'],
                profit=item_data['profit'],
                delivered_quantity=0 if is_prepaid else item_data['quantity']
            )
            db.session.add(invoice_item)

            # Update stock only if NOT prepaid
            if not is_prepaid:
                item_data['product'].stock_quantity -= item_data['stock_required']

        db.session.commit()

        # Build response with items included
        invoice_dict = invoice.to_dict()
        invoice_dict['items'] = []
        for item_data in invoice_items_data:
            invoice_dict['items'].append({
                'product_id': item_data['product_id'],
                'product_name': item_data['product'].name,
                'variant_id': item_data['variant_id'],
                'quantity': item_data['quantity'],
                'unit_price': float(item_data['unit_price']),
                'total_price': float(item_data['subtotal'])
            })

        # Emit invoice created event
        # Validates: Requirements 3.1
        EventService.emit_invoice_change(
            store_id=store_id,
            invoice=invoice_dict,
            action='created'
        )

        return {
            'success': True,
            'invoice': invoice_dict,
            'message': f"Facture {invoice_number} créée avec succès"
        }
    
    @classmethod
    def cancel_cart(cls, user_id: str, store_id: str) -> Dict[str, Any]:
        """Cancel current cart (clear without saving).
        
        Args:
            user_id: User ID
            store_id: Store ID
            
        Returns:
            dict: Result
            
        Validates: Requirements 1.11
        """
        cls.clear_cart(user_id, store_id)
        return {
            'success': True,
            'message': 'Panier annulé'
        }

    # ==================== Paused Cart Operations ====================
    
    @classmethod
    def pause_cart(cls, user_id: str, store_id: str,
                   name: Optional[str] = None,
                   items: Optional[List[Dict]] = None) -> Dict[str, Any]:
        """Pause current cart for later restoration.

        Args:
            user_id: User ID
            store_id: Store ID
            name: Optional name for the paused cart
            items: Optional list of items (from frontend cart)

        Returns:
            dict: Result with paused cart ID

        Validates: Requirements 1.12, 2.1
        """
        # If items provided from frontend, use them directly
        if items and len(items) > 0:
            paused_key = f"{store_id}:{user_id}"
            if paused_key not in cls._paused_carts:
                cls._paused_carts[paused_key] = []

            # Calculate total from items
            total = sum(
                item.get('unitPrice', 0) * item.get('quantity', 0)
                for item in items
            )

            paused_data = {
                'items': items,
                'total': total,
                'paused_at': datetime.utcnow().isoformat(),
                'name': name or f"Panier {len(cls._paused_carts[paused_key]) + 1}",
                'id': str(len(cls._paused_carts[paused_key])),
                'user_id': user_id,  # Associate cart with user (Requirement 2.1)
                'store_id': store_id
            }

            cls._paused_carts[paused_key].append(paused_data)

            return {
                'success': True,
                'paused_cart_id': paused_data['id'],
                'message': f"Panier mis en pause: {paused_data['name']}"
            }

        # Otherwise use server-side cart
        cart = cls.get_cart(user_id, store_id)

        if cart.is_empty():
            return {
                'success': False,
                'error': 'Le panier est vide'
            }

        # Store paused cart
        paused_key = f"{store_id}:{user_id}"
        if paused_key not in cls._paused_carts:
            cls._paused_carts[paused_key] = []

        paused_data = cart.to_dict()
        paused_data['paused_at'] = datetime.utcnow().isoformat()
        paused_data['name'] = name or f"Panier {len(cls._paused_carts[paused_key]) + 1}"
        paused_data['id'] = str(len(cls._paused_carts[paused_key]))
        paused_data['user_id'] = user_id  # Associate cart with user (Requirement 2.1)
        paused_data['store_id'] = store_id

        cls._paused_carts[paused_key].append(paused_data)

        # Clear current cart
        cls.clear_cart(user_id, store_id)

        return {
            'success': True,
            'paused_cart_id': paused_data['id'],
            'message': f"Panier mis en pause: {paused_data['name']}"
        }
    
    @classmethod
    def get_paused_carts(cls, user_id: str, store_id: str) -> List[Dict[str, Any]]:
        """Get all paused carts for user.
        
        Only returns carts belonging to the specified user (Requirement 2.2).
        
        Args:
            user_id: User ID
            store_id: Store ID
            
        Returns:
            list: List of paused cart data belonging to the user
            
        Validates: Requirements 2.2
        """
        paused_key = f"{store_id}:{user_id}"
        carts = cls._paused_carts.get(paused_key, [])
        
        # Filter to ensure only carts belonging to this user are returned
        # This provides defense-in-depth even though the key already filters by user
        # Also filter out carts without user_id (legacy carts created before this fix)
        filtered_carts = []
        for cart in carts:
            cart_user_id = cart.get('user_id')
            # Only include carts that have user_id AND it matches the requesting user
            if cart_user_id and cart_user_id == user_id:
                filtered_carts.append(cart)
        
        return filtered_carts
    
    @classmethod
    def restore_cart(cls, user_id: str, store_id: str, 
                     paused_cart_id: str) -> Dict[str, Any]:
        """Restore a paused cart.
        
        Verifies ownership before allowing restoration (Requirement 2.3).
        
        Args:
            user_id: User ID
            store_id: Store ID
            paused_cart_id: ID of paused cart to restore
            
        Returns:
            dict: Result with restored cart
            
        Validates: Requirements 1.12, 2.3
        """
        paused_key = f"{store_id}:{user_id}"
        paused_carts = cls._paused_carts.get(paused_key, [])
        
        # Find paused cart
        paused_data = None
        paused_index = None
        
        for i, cart_data in enumerate(paused_carts):
            if cart_data.get('id') == paused_cart_id:
                paused_data = cart_data
                paused_index = i
                break
        
        if paused_data is None:
            return {
                'success': False,
                'error': 'Panier en pause non trouvé'
            }
        
        # Verify ownership (Requirement 2.3)
        cart_owner_id = paused_data.get('user_id')
        if cart_owner_id and cart_owner_id != user_id:
            return {
                'success': False,
                'error': 'Ce panier ne vous appartient pas'
            }
        
        # Check if current cart has items
        current_cart = cls.get_cart(user_id, store_id)
        if not current_cart.is_empty():
            return {
                'success': False,
                'error': 'Le panier actuel n\'est pas vide. Veuillez le vider ou le mettre en pause.'
            }
        
        # Restore cart
        cart_key = f"{store_id}:{user_id}"
        cls._carts[cart_key] = Cart.from_dict(paused_data)
        
        # Remove from paused carts
        cls._paused_carts[paused_key].pop(paused_index)
        
        return {
            'success': True,
            'cart': cls._carts[cart_key].to_dict(),
            'message': f"Panier restauré: {paused_data.get('name', 'Panier')}"
        }
    
    @classmethod
    def delete_paused_cart(cls, user_id: str, store_id: str,
                           paused_cart_id: str) -> Dict[str, Any]:
        """Delete a paused cart.
        
        Verifies ownership before allowing deletion (Requirement 2.3).
        
        Args:
            user_id: User ID
            store_id: Store ID
            paused_cart_id: ID of paused cart to delete
            
        Returns:
            dict: Result
            
        Validates: Requirements 2.3
        """
        paused_key = f"{store_id}:{user_id}"
        paused_carts = cls._paused_carts.get(paused_key, [])
        
        for i, cart_data in enumerate(paused_carts):
            if cart_data.get('id') == paused_cart_id:
                # Verify ownership (Requirement 2.3)
                cart_owner_id = cart_data.get('user_id')
                if cart_owner_id and cart_owner_id != user_id:
                    return {
                        'success': False,
                        'error': 'Ce panier ne vous appartient pas'
                    }
                
                cls._paused_carts[paused_key].pop(i)
                return {
                    'success': True,
                    'message': 'Panier en pause supprimé'
                }
        
        return {
            'success': False,
            'error': 'Panier en pause non trouvé'
        }
    
    # ==================== Invoice Queries ====================
    
    @classmethod
    def get_invoice(cls, invoice_id: str, store_id: str,
                    include_profit: bool = True) -> Optional[Dict[str, Any]]:
        """Get invoice by ID.
        
        Args:
            invoice_id: Invoice ID
            store_id: Store ID
            include_profit: Include profit fields
            
        Returns:
            dict: Invoice data or None
        """
        invoice = Invoice.query.filter_by(
            id=invoice_id,
            store_id=store_id
        ).first()
        
        if not invoice:
            return None
        
        data = invoice.to_dict(include_profit=include_profit)
        data['items'] = []
        for item in invoice.items.all():
            item_dict = item.to_dict()
            # Add product name
            if item.product:
                item_dict['product_name'] = item.product.name
            data['items'].append(item_dict)
        
        return data
    
    @classmethod
    def get_invoices(cls, store_id: str, user_id: Optional[str] = None,
                     status: Optional[str] = None,
                     include_profit: bool = True) -> List[Dict[str, Any]]:
        """Get invoices with optional filters.
        
        Args:
            store_id: Store ID
            user_id: Optional filter by user
            status: Optional filter by status
            include_profit: Include profit fields
            
        Returns:
            list: List of invoice data
        """
        query = Invoice.query.filter_by(store_id=store_id)
        
        if user_id:
            query = query.filter_by(user_id=user_id)
        
        if status:
            query = query.filter_by(status=status)
        
        invoices = query.order_by(Invoice.created_at.desc()).all()
        
        return [
            invoice.to_dict(include_profit=include_profit)
            for invoice in invoices
        ]
    
    @classmethod
    def delete_invoice(cls, invoice_id: str, store_id: str, 
                       restore_stock: bool = True) -> Dict[str, Any]:
        """Delete an invoice with optional stock restoration.
        
        Args:
            invoice_id: Invoice ID
            store_id: Store ID
            restore_stock: Whether to restore stock quantities (default True for backward compatibility)
            
        Returns:
            dict: Result with success status and message
            
        Validates: Requirements 7.1, 7.3, 7.4
        """
        invoice = Invoice.query.filter_by(
            id=invoice_id,
            store_id=store_id
        ).first()
        
        if not invoice:
            return {
                'success': False,
                'error': 'Facture non trouvée'
            }
        
        invoice_number = invoice.invoice_number
        deleted_invoice_id = invoice.id
        
        # Optionally restore stock for each item based on restore_stock parameter
        if restore_stock:
            for item in invoice.items.all():
                product = Product.query.get(item.product_id)
                if product:
                    # Calculate units to restore
                    unit_multiplier = 1
                    if item.variant_id:
                        variant = ProductVariant.query.get(item.variant_id)
                        if variant:
                            unit_multiplier = variant.unit_multiplier
                    
                    product.stock_quantity += item.quantity * unit_multiplier
        
        # Delete invoice (cascade deletes items and payments)
        db.session.delete(invoice)
        db.session.commit()
        
        # Emit invoice deleted event
        # Validates: Requirements 3.2
        EventService.emit_invoice_change(
            store_id=store_id,
            invoice={'id': deleted_invoice_id, 'invoice_number': invoice_number},
            action='deleted'
        )
        
        stock_message = " (stock restauré)" if restore_stock else " (stock non restauré)"
        return {
            'success': True,
            'message': f"Facture {invoice_number} supprimée{stock_message}"
        }
    
    @classmethod
    def get_invoices_for_deletion(cls, store_id: str, start_date: datetime,
                                   end_date: datetime) -> Dict[str, Any]:
        """Preview invoices to be deleted in a date range.
        
        Args:
            store_id: Store ID
            start_date: Start date (inclusive)
            end_date: End date (inclusive)
            
        Returns:
            dict: Preview data with count and total amount
            
        Validates: Requirements 10.2
        """
        from sqlalchemy import func
        
        # Query invoices in date range
        invoices = Invoice.query.filter(
            Invoice.store_id == store_id,
            Invoice.created_at >= start_date,
            Invoice.created_at <= end_date
        ).all()
        
        # Calculate totals
        count = len(invoices)
        total_amount = sum(float(inv.total_amount) for inv in invoices)
        
        # Build invoice list for preview
        invoice_list = []
        for inv in invoices:
            invoice_list.append({
                'id': inv.id,
                'invoice_number': inv.invoice_number,
                'total_amount': float(inv.total_amount),
                'created_at': inv.created_at.isoformat() if inv.created_at else None,
                'status': inv.status
            })
        
        return {
            'count': count,
            'total_amount': total_amount,
            'invoices': invoice_list,
            'start_date': start_date.isoformat() if start_date else None,
            'end_date': end_date.isoformat() if end_date else None
        }
    
    @classmethod
    def bulk_delete_invoices(cls, store_id: str, start_date: datetime,
                              end_date: datetime,
                              restore_stock: bool = False) -> Dict[str, Any]:
        """Bulk delete invoices in a date range.
        
        Args:
            store_id: Store ID
            start_date: Start date (inclusive)
            end_date: End date (inclusive)
            restore_stock: Whether to restore stock quantities
            
        Returns:
            dict: Result with count of deleted invoices
            
        Validates: Requirements 10.6
        """
        # Get invoices in date range
        invoices = Invoice.query.filter(
            Invoice.store_id == store_id,
            Invoice.created_at >= start_date,
            Invoice.created_at <= end_date
        ).all()
        
        if not invoices:
            return {
                'success': True,
                'count': 0,
                'message': 'Aucune facture à supprimer dans cette période'
            }
        
        deleted_count = 0
        deleted_invoice_ids = []
        
        for invoice in invoices:
            deleted_invoice_ids.append({'id': invoice.id, 'invoice_number': invoice.invoice_number})
            
            # Optionally restore stock for each item
            if restore_stock:
                for item in invoice.items.all():
                    product = Product.query.get(item.product_id)
                    if product:
                        # Calculate units to restore
                        unit_multiplier = 1
                        if item.variant_id:
                            variant = ProductVariant.query.get(item.variant_id)
                            if variant:
                                unit_multiplier = variant.unit_multiplier
                        
                        product.stock_quantity += item.quantity * unit_multiplier
            
            # Delete invoice (cascade deletes items and payments)
            db.session.delete(invoice)
            deleted_count += 1
        
        db.session.commit()
        
        # Emit invoice deleted events for all deleted invoices
        # Validates: Requirements 3.2
        for invoice_info in deleted_invoice_ids:
            EventService.emit_invoice_change(
                store_id=store_id,
                invoice=invoice_info,
                action='deleted'
            )
        
        stock_message = " (stock restauré)" if restore_stock else " (stock non restauré)"
        return {
            'success': True,
            'count': deleted_count,
            'message': f"{deleted_count} facture(s) supprimée(s){stock_message}"
        }
