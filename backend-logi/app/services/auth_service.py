"""Authentication service for user management and validation."""
import secrets
import hashlib
from functools import wraps
from flask import request, jsonify, g

from app import db
from app.models import User, Tenant


class AuthService:
    """Service for authentication and user management.
    
    Handles:
    - Secret code generation for sellers
    - Tenant code + secret code validation
    - User session management
    """
    
    SECRET_CODE_LENGTH = 3  # Length of generated secret codes

    @staticmethod
    def generate_secret_code():
        """Generate a secret code for a user."""
        chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
        return ''.join(secrets.choice(chars) for _ in range(AuthService.SECRET_CODE_LENGTH))
    
    @staticmethod
    def validate_credentials(store_code, secret_code):
        """Validate tenant code and secret code combination.
        
        Args:
            store_code: The tenant identifier code (slug)
            secret_code: The user's secret authentication code
        """
        if not store_code or not secret_code:
            return None
        
        # Find the tenant by code (slug)
        tenant = Tenant.query.filter_by(slug=store_code).first()
        if not tenant:
            return None
        
        # Find active user with matching secret code in this tenant
        user = User.query.filter_by(
            tenant_id=tenant.id,
            secret_code=secret_code,
            is_active=True
        ).first()
        
        return user
    
    @staticmethod
    def create_user(tenant_id, name, role='seller'):
        """Create a new user with auto-generated secret code."""
        secret_code = AuthService.generate_secret_code()
        
        user = User(
            tenant_id=tenant_id,
            name=name,
            secret_code=secret_code,
            role=role,
            is_active=True
        )
        
        db.session.add(user)
        db.session.commit()
        
        return user
    
    @staticmethod
    def deactivate_user(user_id):
        """Deactivate a user."""
        user = db.session.get(User, user_id)
        if user:
            user.is_active = False
            db.session.commit()
        return user
    
    @staticmethod
    def get_users_by_tenant(tenant_id, include_inactive=False):
        """Get all users for a tenant."""
        query = User.query.filter_by(tenant_id=tenant_id)
        if not include_inactive:
            query = query.filter_by(is_active=True)
        return query.all()


def auth_required(f):
    """Decorator to require authentication on routes."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Get auth headers
        # NOTE: Clients might still send X-Store-Code, support both?
        store_code = request.headers.get('X-Store-Code') or request.headers.get('X-Tenant-ID')
        secret_code = request.headers.get('X-Secret-Code')
        
        if not store_code or not secret_code:
            return jsonify({
                'success': False,
                'error': {
                    'code': 'UNAUTHORIZED',
                    'message': 'Authentication required. Please provide tenant ID/code and secret code.'
                }
            }), 401
        
        # Validate credentials
        user = AuthService.validate_credentials(store_code, secret_code)
        
        if not user:
            return jsonify({
                'success': False,
                'error': {
                    'code': 'UNAUTHORIZED',
                    'message': 'Invalid credentials.'
                }
            }), 401
        
        # Store user in request context
        g.current_user = user
        g.user_id = user.id
        g.tenant_id = user.tenant_id
        g.store_id = user.tenant_id # Alias for legacy compatibility

        return f(*args, **kwargs)
    
    return decorated_function


def manager_required(f):
    """Decorator to require manager role."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not hasattr(g, 'current_user') or not g.current_user:
            return jsonify({'success': False, 'error': {'code': 'UNAUTHORIZED'}}), 401
        
        if g.current_user.role != 'manager' and g.current_user.role != 'admin':
            return jsonify({'success': False, 'error': {'code': 'FORBIDDEN', 'message': 'Manager access required.'}}), 403
        
        return f(*args, **kwargs)
    
    return decorated_function


def subscription_required(f):
    """Decorator to require active subscription."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not hasattr(g, 'tenant_id') or not g.tenant_id:
            return jsonify({'success': False, 'error': {'code': 'UNAUTHORIZED'}}), 401
        
        tenant = Tenant.query.get(g.tenant_id)
        if not tenant:
            return jsonify({'success': False, 'error': {'code': 'NOT_FOUND'}}), 404
        
        # Assuming Tenant model has subscription linking directly or via service
        # For now, let's assume basic check passes or implement proper check later
        # Legacy code checked store.subscription_status
        
        return f(*args, **kwargs)
    
    return decorated_function
