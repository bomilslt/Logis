from datetime import datetime
from app import db
from app.models.shopproduct import Product
from app.models.invoice import Invoice
from app.models.customer import Customer
from app.models.sync import SyncQueue
import logging

class SyncService:
    """Service to handle synchronization logic."""
    
    @staticmethod
    def handle_push(payload, store_id, user_id):
        """
        Handle incoming push data from offline clients.
        
        Args:
            payload (dict): The data payload containing entity_type, operation, data, etc.
            store_id (str): The store ID.
            user_id (str): The user ID processing the request.
            
        Returns:
            dict: Result of the operation.
        """
        entity_type = payload.get('entity_type')
        operation = payload.get('operation')
        data = payload.get('data')
        entity_id = payload.get('entity_id')
        
        if not all([entity_type, operation, data]):
            return {'success': False, 'error': 'Missing required fields'}

        try:
            # Route to appropriate handler
            if entity_type == 'invoice':
                SyncService._sync_invoice(operation, data, store_id)
            elif entity_type == 'product':
                SyncService._sync_product(operation, data, store_id)
            elif entity_type == 'customer':
                SyncService._sync_customer(operation, data, store_id)
            # Add other entities as needed
            
            # Log the successful sync to SyncQueue history (optional but good for audit)
            # or just return success
            return {'success': True}

        except Exception as e:
            logging.error(f"Sync error for {entity_type} {entity_id}: {str(e)}")
            return {'success': False, 'error': str(e)}

    @staticmethod
    def handle_pull(store_id, last_sync=None):
        """
        Retrieve latest state for the store.
        
        Args:
            store_id (str): The store ID.
            last_sync (datetime, optional): Timestamp of last sync.
        
        Returns:
            dict: Dictionary of all relevant entities.
        """
        # For V1, we return full state for critical entities.
        # Optimizations: Implement filtering by updated_at > last_sync
        
        products = Product.query.filter_by(store_id=store_id).all()
        # Invoices might be too heavy to send all, maybe only recent ones or unsynced ones?
        # Usually for offline mode, you want the product catalog and maybe customers.
        # Invoices are often "write-only" from the offline client perspective (history),
        # but if we want two-way sync, we need them.
        # For now, let's send Products and Customers.
        
        customers = Customer.query.filter_by(store_id=store_id).all()
        
        return {
            'products': [p.to_dict() for p in products],
            'customers': [c.to_dict() for c in customers],
            'server_time': datetime.utcnow().isoformat()
        }

    @staticmethod
    def _sync_invoice(operation, data, store_id):
        if operation == 'create':
            # Check if exists to avoid duplicates
            existing = Invoice.query.filter_by(invoice_number=data.get('invoice_number'), store_id=store_id).first()
            if existing:
                return # Idempotency
            
            new_invoice = Invoice(
                store_id=store_id,
                # Map other fields from data
                invoice_number=data.get('invoice_number'),
                total_amount=data.get('total_amount'),
                payment_method=data.get('payment_method'),
                status='paid', # Assume paid if offline sale completed
                created_at=datetime.fromisoformat(data.get('created_at').replace('Z', '+00:00')) if data.get('created_at') else datetime.utcnow()
            )
            # Handle items... this requires more complex logic to create InvoiceItem
            # For this MVP step, we assume the Invoice model can handle a dict or we parse it manually
            # detailed implementation depends on Invoice model structure
            
            db.session.add(new_invoice)
            db.session.commit()

    @staticmethod
    def _sync_product(operation, data, store_id):
        # Product sync logic (mainly updating stock or creating new products)
        pass

    @staticmethod
    def _sync_customer(operation, data, store_id):
        # Customer sync logic
        pass
