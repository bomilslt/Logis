from functools import wraps
from flask import request, jsonify, g
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request, get_jwt
from app.models import User, Tenant
from app.models.tenant import ALL_CHANNELS, DEFAULT_CHANNELS, channel_matches
from app import db
import logging

logger = logging.getLogger(__name__)


def _get_channel_from_request() -> str:
    """
    Détermine le canal d'accès depuis la requête.
    Priorité: header X-App-Channel > claim JWT > détection User-Agent
    """
    # 1. Header explicite
    channel = request.headers.get('X-App-Channel')
    if channel and channel in ALL_CHANNELS:
        return channel
    
    # 2. Claim JWT (si déjà vérifié)
    try:
        jwt_claims = get_jwt()
        channel = jwt_claims.get('app_channel')
        if channel and channel in ALL_CHANNELS:
            return channel
    except:
        pass
    
    # 3. Détection User-Agent
    user_agent = request.headers.get('User-Agent', '').lower()
    
    if 'electron' in user_agent or 'cargo-desktop' in user_agent:
        if 'windows' in user_agent:
            return 'pc_admin'
        elif 'mac' in user_agent or 'darwin' in user_agent:
            return 'mac_admin'
    
    if 'android' in user_agent and 'cargo' in user_agent:
        return 'app_android_client'
    if 'iphone' in user_agent or 'ipad' in user_agent:
        if 'cargo' in user_agent:
            return 'app_ios_client'
    
    # 4. Défaut: web selon X-App-Type
    app_type = request.headers.get('X-App-Type', 'client')
    if app_type == 'admin':
        return 'web_admin'
    return 'web_client'


def tenant_required(fn):
    """
    Décorateur qui vérifie:
    1. JWT valide
    2. Tenant_id extrait du JWT (pas du header!)
    3. User actif
    
    Stocke tenant_id et user dans g pour accès facile
    """
    @wraps(fn)
    def wrapper(*args, **kwargs):
        # Skip JWT verification for OPTIONS (CORS preflight)
        if request.method == 'OPTIONS':
            return fn(*args, **kwargs)
        
        # Debug: Afficher les cookies et headers
        logger.debug(f"[DEBUG] Request cookies: {request.cookies}")
        logger.debug(f"[DEBUG] Request headers: {dict(request.headers)}")
        
        try:
            verify_jwt_in_request()
        except Exception as e:
            logger.error(f"[DEBUG] JWT verification failed: {e}")
            logger.error(f"[DEBUG] Cookie names: {list(request.cookies.keys())}")
            return jsonify({'error': 'Token invalide'}), 401
        
        # Extraire les claims du JWT
        jwt_claims = get_jwt()
        user_id = get_jwt_identity()
        
        logger.debug(f"[DEBUG] JWT verified - user_id: {user_id}, tenant_id: {jwt_claims.get('tenant_id')}")
        
        # Tenant_id vient du JWT, pas du header (sécurité!)
        tenant_id = jwt_claims.get('tenant_id')
        if not tenant_id:
            logger.warning(f"JWT sans tenant_id pour user {user_id}")
            return jsonify({'error': 'Token invalide - tenant manquant'}), 401
        
        user = db.session.get(User, user_id)
        
        if not user:
            return jsonify({'error': 'Utilisateur non trouvé'}), 404
        
        # Double vérification: le tenant du JWT doit correspondre au tenant du user
        if user.tenant_id != tenant_id:
            logger.warning(f"Tentative d'accès cross-tenant: user {user_id} (tenant {user.tenant_id}) avec token tenant {tenant_id}")
            return jsonify({'error': 'Accès refusé'}), 403
        
        if not user.is_active:
            return jsonify({'error': 'Compte désactivé'}), 403
        
        # Stocker dans g pour accès facile dans les routes
        g.tenant_id = tenant_id
        g.user = user
        g.user_role = jwt_claims.get('role', 'client')
        if g.user_role == 'staff':
            wh_ids = [w.id for w in (user.warehouses or [])]
            if not wh_ids and user.warehouse_id:
                wh_ids = [user.warehouse_id]
            g.staff_warehouse_ids = wh_ids
            g.staff_warehouse_id = wh_ids[0] if wh_ids else None
        else:
            g.staff_warehouse_ids = []
            g.staff_warehouse_id = None

        # CSRF (Option 1): requis uniquement pour les clients web (cookies) et méthodes mutantes
        # Mobile/Desktop (Bearer) n'en ont pas besoin.
        app_channel = _get_channel_from_request()
        if app_channel in ['web_client', 'web_admin'] and request.method in ['POST', 'PUT', 'PATCH', 'DELETE']:
            try:
                from app.utils.csrf import verify_csrf_token
                from flask import current_app

                csrf_token = request.headers.get('X-CSRF-Token')
                if not csrf_token:
                    return jsonify({'error': 'CSRF token missing', 'code': 'CSRF_MISSING'}), 403

                secret_key = current_app.config.get('SECRET_KEY', '')
                if not verify_csrf_token(csrf_token, str(g.user.id), secret_key):
                    return jsonify({'error': 'Invalid CSRF token', 'code': 'CSRF_INVALID'}), 403
            except Exception as e:
                logger.warning(f"CSRF validation error: {e}")
                return jsonify({'error': 'CSRF validation failed', 'code': 'CSRF_ERROR'}), 403
        
        return fn(*args, **kwargs)
    
    return wrapper


def admin_required(fn):
    """Décorateur pour les routes admin uniquement"""
    @wraps(fn)
    @tenant_required
    def wrapper(*args, **kwargs):
        # Skip for OPTIONS (CORS preflight) - already handled by tenant_required
        if request.method == 'OPTIONS':
            return '', 200
        
        # g.user est déjà défini par tenant_required
        if g.user_role not in ['admin', 'staff']:
            return jsonify({'error': 'Accès admin requis'}), 403
        
        return fn(*args, **kwargs)
    
    return wrapper


def permission_required(permission: str):
    """
    Décorateur pour vérifier une permission spécifique
    Utilise le système RBAC complet (rôles + permissions individuelles)
    
    Usage: @permission_required('packages.read')
    """
    def decorator(fn):
        @wraps(fn)
        @tenant_required
        def wrapper(*args, **kwargs):
            # Skip for OPTIONS (CORS preflight)
            if request.method == 'OPTIONS':
                return fn(*args, **kwargs)
            
            # Vérifier la permission avec le système RBAC
            if not g.user.has_permission(permission):
                logger.warning(f"Permission refusée: user {g.user.id} ({g.user.email}) n'a pas '{permission}'")
                return jsonify({
                    'error': 'Permission refusée',
                    'required_permission': permission,
                    'code': 'INSUFFICIENT_PERMISSIONS'
                }), 403
            
            logger.debug(f"Permission accordée: user {g.user.id} a '{permission}'")
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def any_permission_required(permissions: list):
    """
    Décorateur pour vérifier au moins une permission parmi plusieurs
    
    Usage: @any_permission_required(['packages.read', 'packages.read_all'])
    """
    def decorator(fn):
        @wraps(fn)
        @tenant_required
        def wrapper(*args, **kwargs):
            # Skip for OPTIONS (CORS preflight)
            if request.method == 'OPTIONS':
                return fn(*args, **kwargs)
            
            # Vérifier si l'utilisateur a au moins une des permissions
            if not g.user.has_any_permission(permissions):
                logger.warning(f"Permissions refusées: user {g.user.id} n'a aucune de {permissions}")
                return jsonify({
                    'error': 'Permission refusée',
                    'required_permissions': permissions,
                    'code': 'INSUFFICIENT_PERMISSIONS'
                }), 403
            
            logger.debug(f"Permission accordée: user {g.user.id} a une de {permissions}")
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def role_required(roles: list):
    """
    Décorateur pour vérifier un rôle spécifique (plus granulaire que admin_required)
    
    Usage: @role_required(['admin', 'manager'])
    """
    def decorator(fn):
        @wraps(fn)
        @tenant_required
        def wrapper(*args, **kwargs):
            # Skip for OPTIONS (CORS preflight)
            if request.method == 'OPTIONS':
                return fn(*args, **kwargs)
            
            user_role = g.user_role
            
            # Normaliser les rôles en liste
            required_roles = [roles] if isinstance(roles, str) else roles
            
            if user_role not in required_roles:
                logger.warning(f"Rôle refusé: user {g.user.id} ({user_role}) n'est pas dans {roles}")
                return jsonify({
                    'error': 'Rôle requis',
                    'required_roles': roles,
                    'current_role': user_role,
                    'code': 'INSUFFICIENT_ROLE'
                }), 403
            
            logger.debug(f"Rôle accordé: user {g.user.id} ({user_role})")
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def module_required(module: str):
    """
    Décorateur pour vérifier l'accès à un module staff.
    Admin a toujours accès. Staff doit avoir le module dans access_modules.
    
    Usage: @module_required('finance')
    """
    def decorator(fn):
        @wraps(fn)
        @admin_required
        def wrapper(*args, **kwargs):
            if request.method == 'OPTIONS':
                return fn(*args, **kwargs)
            
            if not g.user.has_module(module):
                logger.warning(f"Module refusé: user {g.user.id} ({g.user.email}) n'a pas le module '{module}'")
                return jsonify({
                    'error': 'Accès refusé',
                    'message': f"Vous n'avez pas accès au module '{module}'",
                    'code': 'MODULE_ACCESS_DENIED'
                }), 403
            
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def admin_or_permission_required(permission: str):
    """
    Décorateur qui autorise les admins OU les utilisateurs avec la permission spécifique
    Utile pour les routes où les admins ont toujours accès mais les staff peuvent avoir un accès limité
    
    Usage: @admin_or_permission_required('packages.write')
    """
    def decorator(fn):
        @wraps(fn)
        @tenant_required
        def wrapper(*args, **kwargs):
            # Skip for OPTIONS (CORS preflight)
            if request.method == 'OPTIONS':
                return fn(*args, **kwargs)
            
            # Les admins ont toujours accès
            if g.user_role == 'admin':
                logger.debug(f"Accès admin accordé: user {g.user.id}")
                return fn(*args, **kwargs)
            
            # Les autres doivent avoir la permission spécifique
            if not g.user.has_permission(permission):
                logger.warning(f"Permission refusée: user {g.user.id} ({g.user_role}) n'a pas '{permission}'")
                return jsonify({
                    'error': 'Permission refusée',
                    'required_permission': permission,
                    'code': 'INSUFFICIENT_PERMISSIONS'
                }), 403
            
            logger.debug(f"Permission accordée: user {g.user.id} ({g.user_role}) a '{permission}'")
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def get_current_tenant_id() -> str:
    """Helper pour récupérer le tenant_id courant"""
    return getattr(g, 'tenant_id', None)


def get_current_user() -> User:
    """Helper pour récupérer l'utilisateur courant"""
    return getattr(g, 'user', None)


def get_current_channel() -> str:
    """Helper pour récupérer le canal d'accès courant"""
    return getattr(g, 'app_channel', None)


def channel_required(allowed_channels: list = None):
    """
    Décorateur pour vérifier que le canal d'accès est autorisé pour le tenant.
    
    Si allowed_channels est spécifié, vérifie aussi que le canal est dans cette liste.
    Sinon, vérifie uniquement contre les canaux autorisés du tenant.
    
    Usage:
        @channel_required()  # Vérifie seulement les canaux du tenant
        @channel_required(['web_admin', 'pc_admin'])  # Restreint en plus
    """
    def decorator(fn):
        @wraps(fn)
        @tenant_required
        def wrapper(*args, **kwargs):
            # Skip for OPTIONS (CORS preflight)
            if request.method == 'OPTIONS':
                return fn(*args, **kwargs)
            
            channel = _get_channel_from_request()
            g.app_channel = channel
            
            # Récupérer le tenant
            tenant = db.session.get(Tenant, g.tenant_id)
            if not tenant:
                return jsonify({'error': 'Tenant non trouvé'}), 404
            
            # Vérifier si le canal est autorisé pour le tenant
            if not tenant.is_channel_allowed(channel):
                logger.warning(
                    f"Canal refusé: user {g.user.id} tente d'accéder via '{channel}' "
                    f"(tenant autorise: {tenant.allowed_channels})"
                )
                return jsonify({
                    'error': 'Canal d\'accès non autorisé',
                    'channel': channel,
                    'code': 'CHANNEL_NOT_ALLOWED'
                }), 403
            
            # Si des canaux spécifiques sont requis par la route
            if allowed_channels and not channel_matches(channel, allowed_channels):
                logger.warning(
                    f"Canal non supporté pour cette route: {channel} "
                    f"(requis: {allowed_channels})"
                )
                return jsonify({
                    'error': 'Cette fonctionnalité n\'est pas disponible sur ce canal',
                    'channel': channel,
                    'allowed': allowed_channels,
                    'code': 'CHANNEL_NOT_SUPPORTED'
                }), 403
            
            logger.debug(f"Canal autorisé: user {g.user.id} via '{channel}'")
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def entitlement_required(entitlement: str, min_value=None):
    """
    Décorateur pour vérifier qu'un tenant a un entitlement spécifique.
    
    Usage:
        @entitlement_required('api_access')  # Vérifie que la valeur est truthy
        @entitlement_required('max_devices_per_user', min_value=1)  # Vérifie >= min_value
    """
    def decorator(fn):
        @wraps(fn)
        @tenant_required
        def wrapper(*args, **kwargs):
            # Skip for OPTIONS (CORS preflight)
            if request.method == 'OPTIONS':
                return fn(*args, **kwargs)
            
            tenant = db.session.get(Tenant, g.tenant_id)
            if not tenant:
                return jsonify({'error': 'Tenant non trouvé'}), 404
            
            value = tenant.get_entitlement(entitlement)
            
            # Vérification selon le type
            if min_value is not None:
                if value is None or value < min_value:
                    logger.warning(
                        f"Entitlement insuffisant: tenant {g.tenant_id} "
                        f"'{entitlement}'={value} (min: {min_value})"
                    )
                    return jsonify({
                        'error': 'Fonctionnalité non disponible pour votre plan',
                        'entitlement': entitlement,
                        'code': 'ENTITLEMENT_REQUIRED'
                    }), 403
            else:
                if not value:
                    logger.warning(
                        f"Entitlement manquant: tenant {g.tenant_id} "
                        f"'{entitlement}' non activé"
                    )
                    return jsonify({
                        'error': 'Fonctionnalité non disponible pour votre plan',
                        'entitlement': entitlement,
                        'code': 'ENTITLEMENT_REQUIRED'
                    }), 403
            
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def device_binding_required(fn):
    """
    Décorateur pour vérifier que le token est lié à un appareil enregistré.
    
    Utilisé pour les routes sensibles sur desktop/mobile.
    Vérifie que:
    1. Le token contient un device_id
    2. L'appareil existe et est actif
    3. L'appareil appartient à l'utilisateur
    
    Usage:
        @device_binding_required
        def sensitive_route():
            ...
    """
    @wraps(fn)
    @tenant_required
    def wrapper(*args, **kwargs):
        from app.models import UserDevice
        
        # Skip for OPTIONS (CORS preflight)
        if request.method == 'OPTIONS':
            return fn(*args, **kwargs)
        
        jwt_claims = get_jwt()
        device_id = jwt_claims.get('device_id')
        app_channel = jwt_claims.get('app_channel', '')
        
        # Device binding requis uniquement pour desktop et mobile
        requires_binding = app_channel in [
            'pc_admin', 'mac_admin',
            'app_android_client', 'app_ios_client'
        ]
        
        if not requires_binding:
            return fn(*args, **kwargs)
        
        if not device_id:
            logger.warning(
                f"Device binding manquant: user {g.user.id} via {app_channel}"
            )
            return jsonify({
                'error': 'Appareil non enregistré',
                'code': 'DEVICE_BINDING_REQUIRED'
            }), 403
        
        # Vérifier que l'appareil existe et est actif
        device = UserDevice.query.filter_by(
            id=device_id,
            user_id=g.user.id,
            is_active=True
        ).first()
        
        if not device:
            logger.warning(
                f"Appareil invalide ou révoqué: {device_id} pour user {g.user.id}"
            )
            return jsonify({
                'error': 'Appareil non reconnu ou révoqué',
                'code': 'DEVICE_INVALID'
            }), 403
        
        # Stocker l'appareil dans g pour accès facile
        g.device = device
        
        # Mettre à jour last_used
        device.record_usage(request.remote_addr)
        db.session.commit()
        
        return fn(*args, **kwargs)
    
    return wrapper


def verified_device_required(fn):
    """
    Décorateur plus strict: vérifie que l'appareil a passé la vérification d'intégrité.
    
    Combine device_binding_required + vérification d'intégrité.
    
    Usage:
        @verified_device_required
        def highly_sensitive_route():
            ...
    """
    @wraps(fn)
    @device_binding_required
    def wrapper(*args, **kwargs):
        # Skip for OPTIONS (CORS preflight)
        if request.method == 'OPTIONS':
            return fn(*args, **kwargs)
        
        device = getattr(g, 'device', None)
        
        if not device:
            # Pas de device binding requis pour ce canal
            return fn(*args, **kwargs)
        
        # Vérifier l'intégrité
        if not device.integrity_verified:
            logger.warning(
                f"Appareil non vérifié: {device.id} pour user {g.user.id}"
            )
            return jsonify({
                'error': 'Vérification de l\'appareil requise',
                'code': 'DEVICE_VERIFICATION_REQUIRED'
            }), 403
        
        # Vérifier si re-vérification nécessaire
        if device.needs_reverification:
            return jsonify({
                'error': 'Re-vérification de l\'appareil requise',
                'code': 'DEVICE_REVERIFICATION_REQUIRED'
            }), 403
        
        return fn(*args, **kwargs)
    
    return wrapper
