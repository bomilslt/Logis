"""
Routes d'authentification
=========================

Gère l'inscription, la connexion, et la gestion des tokens JWT.
Inclut la protection CSRF et l'audit logging.
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import (
    create_access_token, create_refresh_token,
    jwt_required, get_jwt_identity, get_jwt,
    set_access_cookies, set_refresh_cookies, unset_jwt_cookies
)
from app import db, limiter
from app.models import User, Tenant
from app.utils.csrf import get_csrf_token_for_user, verify_csrf_token
from app.utils.audit import audit_log, AuditAction
from app.utils.decorators import tenant_required
from datetime import datetime
import re
import logging

auth_bp = Blueprint('auth', __name__)
logger = logging.getLogger(__name__)


# ==================== RATE LIMITING ====================
# Limites strictes sur les endpoints d'authentification

auth_limit = limiter.limit("5 per minute", error_message="Trop de tentatives. Réessayez dans 1 minute.")
register_limit = limiter.limit("3 per hour", error_message="Trop d'inscriptions. Réessayez plus tard.")
refresh_limit = limiter.limit("10 per minute", error_message="Trop de rafraîchissements. Réessayez plus tard.")

# Token revocation store (in-memory; use Redis in production for persistence)
revoked_tokens = set()

# ==================== VALIDATION ====================

def validate_email(email: str) -> bool:
    """Valide le format email"""
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return bool(re.match(pattern, email))

def validate_password(password: str) -> tuple[bool, str]:
    """
    Valide la complexité du mot de passe
    Retourne (is_valid, error_message)
    """
    if len(password) < 8:
        return False, 'Le mot de passe doit contenir au moins 8 caractères'
    if len(password) > 128:
        return False, 'Le mot de passe est trop long (max 128 caractères)'
    if not re.search(r'[A-Z]', password):
        return False, 'Le mot de passe doit contenir au moins une majuscule'
    if not re.search(r'[a-z]', password):
        return False, 'Le mot de passe doit contenir au moins une minuscule'
    if not re.search(r'\d', password):
        return False, 'Le mot de passe doit contenir au moins un chiffre'
    return True, ''

def validate_phone(phone: str) -> bool:
    """Valide le format téléphone (optionnel)"""
    if not phone:
        return True
    # Accepte formats internationaux: +243..., 00243..., 0...
    pattern = r'^(\+|00)?[0-9]{8,15}$'
    return bool(re.match(pattern, phone.replace(' ', '').replace('-', '')))

def _detect_app_channel() -> str:
    """
    Détecte le canal d'accès depuis la requête.
    Priorité: header X-App-Channel > détection User-Agent > défaut
    """
    from app.models.tenant import ALL_CHANNELS
    
    # 1. Header explicite
    channel = request.headers.get('X-App-Channel')
    if channel and channel in ALL_CHANNELS:
        return channel
    
    # 2. Détection User-Agent
    user_agent = request.headers.get('User-Agent', '').lower()
    
    if 'electron' in user_agent or 'cargo-desktop' in user_agent:
        if 'windows' in user_agent:
            return 'pc_admin'
        elif 'mac' in user_agent or 'darwin' in user_agent:
            return 'mac_admin'
    
    if 'android' in user_agent and 'cargo' in user_agent:
        return 'app_android_client'
    if ('iphone' in user_agent or 'ipad' in user_agent) and 'cargo' in user_agent:
        return 'app_ios_client'
    
    # 3. Défaut: web selon X-App-Type
    app_type = request.headers.get('X-App-Type', 'client')
    if app_type == 'admin':
        return 'web_admin'
    return 'web_client'


def create_tokens_with_claims(
    user: User, 
    app_channel: str = None,
    device_id: str = None
) -> tuple[str, str]:
    """
    Crée les tokens JWT avec les claims personnalisés.
    
    - Inclut tenant_id, role et app_channel dans le token
    - Pour desktop: tokens avec durée de vie courte (2h access, 24h refresh)
    - device_id optionnel pour lier le token à un appareil spécifique
    """
    from datetime import timedelta
    
    if not app_channel:
        app_channel = _detect_app_channel()
    
    additional_claims = {
        'tenant_id': user.tenant_id,
        'role': user.role,
        'email': user.email,
        'app_channel': app_channel
    }
    
    # Ajouter les modules d'accès et warehouses pour staff
    if user.role == 'staff':
        additional_claims['access_modules'] = user.access_modules or []
        additional_claims['warehouse_ids'] = [w.id for w in (user.warehouses or [])]
    
    # Ajouter device_id si fourni (pour device binding)
    if device_id:
        additional_claims['device_id'] = device_id
    
    # Durées de vie selon le canal
    if app_channel in ['pc_admin', 'mac_admin']:
        # Desktop: tokens courts pour sécurité renforcée
        access_expires = timedelta(hours=2)
        refresh_expires = timedelta(hours=24)
    elif app_channel in ['app_android_client', 'app_ios_client']:
        # Mobile: durée moyenne
        access_expires = timedelta(hours=8)
        refresh_expires = timedelta(days=7)
    else:
        # Web: durée standard
        access_expires = timedelta(hours=24)
        refresh_expires = timedelta(days=30)
    
    access_token = create_access_token(
        identity=user.id,
        additional_claims=additional_claims,
        expires_delta=access_expires
    )
    refresh_token = create_refresh_token(
        identity=user.id,
        additional_claims=additional_claims,
        expires_delta=refresh_expires
    )
    return access_token, refresh_token


@auth_bp.route('/register', methods=['POST'])
@register_limit
def register():
    """Inscription d'un nouveau client"""
    data = request.get_json()
    tenant_id = request.headers.get('X-Tenant-ID')
    
    if not tenant_id:
        return jsonify({'error': 'X-Tenant-ID header is required'}), 400
    
    # Vérifier que le tenant existe
    tenant = Tenant.query.get(tenant_id)
    if not tenant or not tenant.is_active:
        return jsonify({'error': 'Invalid tenant'}), 400
    
    # Validation des champs requis
    required = ['email', 'password', 'first_name', 'last_name']
    for field in required:
        if not data.get(field):
            return jsonify({'error': f'{field} is required'}), 400
    
    # Validation email
    email = data['email'].strip().lower()
    if not validate_email(email):
        return jsonify({'error': 'Format email invalide'}), 400
    
    # Validation mot de passe
    is_valid, error_msg = validate_password(data['password'])
    if not is_valid:
        return jsonify({'error': error_msg}), 400
    
    # Validation téléphone (optionnel)
    phone = data.get('phone', '').strip() or None
    if phone and not validate_phone(phone):
        return jsonify({'error': 'Format téléphone invalide'}), 400
    
    # Validation longueur noms
    first_name = data['first_name'].strip()[:50]
    last_name = data['last_name'].strip()[:50]
    if len(first_name) < 2 or len(last_name) < 2:
        return jsonify({'error': 'Nom et prénom doivent avoir au moins 2 caractères'}), 400
    
    # Vérifier email unique pour ce tenant
    existing = User.query.filter_by(tenant_id=tenant_id, email=email).first()
    if existing:
        return jsonify({'error': 'Email already registered'}), 409
    
    # Vérification des quotas clients
    from app.services.enforcement_service import EnforcementService
    quota_result = EnforcementService.check_quota(tenant_id, EnforcementService.RESOURCE_CLIENTS)
    if not quota_result['allowed']:
        return jsonify({
            'error': 'Inscriptions temporairement indisponibles. Veuillez réessayer plus tard.',
            'code': 'QUOTA_REACHED'
        }), 403
    
    try:
        # Créer l'utilisateur
        user = User(
            tenant_id=tenant_id,
            email=email,
            phone=phone,
            first_name=first_name,
            last_name=last_name,
            role='client'
        )
        user.set_password(data['password'])
        
        db.session.add(user)
        db.session.commit()
        
        # Générer tokens avec claims (tenant_id inclus)
        access_token, refresh_token = create_tokens_with_claims(user)
        
        # Générer le token CSRF
        csrf_token = get_csrf_token_for_user(user.id)
        
        # Audit log
        audit_log(
            action=AuditAction.USER_CREATE,
            resource_type='user',
            resource_id=user.id,
            user_id=user.id,
            user_email=user.email,
            tenant_id=tenant_id,
            details={'role': 'client', 'method': 'registration'}
        )
        
        response = jsonify({
            'message': 'Registration successful',
            'user': user.to_dict(include_private=True),
            'access_token': access_token,
            'refresh_token': refresh_token,
            'csrf_token': csrf_token
        })
        set_access_cookies(response, access_token)
        set_refresh_cookies(response, refresh_token)
        return response, 201
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Registration error: {e}")
        return jsonify({'error': 'Erreur lors de l\'inscription'}), 500


@auth_bp.route('/login', methods=['POST'])
@auth_limit
def login():
    """Connexion utilisateur"""
    data = request.get_json()
    tenant_id = request.headers.get('X-Tenant-ID')
    app_type = request.headers.get('X-App-Type', 'client')  # 'client' ou 'admin'
    
    if not tenant_id:
        return jsonify({'error': 'X-Tenant-ID header is required'}), 400
    
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')
    
    if not email or not password:
        return jsonify({'error': 'Email and password are required'}), 400
    
    user = User.query.filter_by(tenant_id=tenant_id, email=email).first()
    
    # Message générique pour éviter l'énumération d'utilisateurs
    if not user or not user.check_password(password):
        # Audit log - échec
        audit_log(
            action=AuditAction.LOGIN_FAILED,
            tenant_id=tenant_id,
            details={'email': email, 'reason': 'invalid_credentials'},
            status='failure'
        )
        return jsonify({'error': 'Email ou mot de passe incorrect'}), 401
    
    # Vérifier le rôle selon l'app
    if app_type == 'client' and user.role != 'client':
        audit_log(
            action=AuditAction.LOGIN_FAILED,
            user_id=user.id,
            user_email=user.email,
            tenant_id=tenant_id,
            details={'reason': 'wrong_app', 'app_type': app_type, 'user_role': user.role},
            status='failure'
        )
        return jsonify({'error': 'Utilisez l\'application administrateur pour vous connecter'}), 403
    
    if app_type == 'admin' and user.role == 'client':
        audit_log(
            action=AuditAction.LOGIN_FAILED,
            user_id=user.id,
            user_email=user.email,
            tenant_id=tenant_id,
            details={'reason': 'wrong_app', 'app_type': app_type, 'user_role': user.role},
            status='failure'
        )
        return jsonify({'error': 'Utilisez l\'application client pour vous connecter'}), 403
    
    # VÉRIFICATION DE SÉCURITÉ CRITIQUE
    # Si l'utilisateur a déjà un token valide avec un rôle différent, bloquer
    if 'access_token' in request.cookies:
        try:
            from flask_jwt_extended import decode_token
            current_token = decode_token(request.cookies['access_token'])
            token_role = current_token.get('role', '')
            
            if app_type == 'client' and token_role == 'admin':
                logger.warning(f"Cross-role login blocked: admin token on client app for {email}")
                return jsonify({'error': 'Session invalide. Utilisez l\'application appropriée.'}), 403
                
            if app_type == 'admin' and token_role == 'client':
                logger.warning(f"Cross-role login blocked: client token on admin app for {email}")
                return jsonify({'error': 'Session invalide. Utilisez l\'application appropriée.'}), 403
        except Exception:
            pass
    
    if not user.is_active:
        audit_log(
            action=AuditAction.LOGIN_FAILED,
            user_id=user.id,
            user_email=user.email,
            tenant_id=tenant_id,
            details={'reason': 'account_disabled'},
            status='failure'
        )
        return jsonify({'error': 'Compte désactivé'}), 403
    
    try:
        # Mettre à jour last_login
        user.last_login = datetime.utcnow()
        db.session.commit()
        
        # Générer tokens avec claims (tenant_id inclus)
        access_token, refresh_token = create_tokens_with_claims(user)
        
        # Générer le token CSRF
        csrf_token = get_csrf_token_for_user(user.id)
        
        # Audit log - succès
        audit_log(
            action=AuditAction.LOGIN_SUCCESS,
            user_id=user.id,
            user_email=user.email,
            tenant_id=tenant_id
        )
        
        response = jsonify({
            'user': user.to_dict(include_private=True),
            'access_token': access_token,
            'refresh_token': refresh_token,
            'csrf_token': csrf_token
        })
        
        set_access_cookies(response, access_token)
        set_refresh_cookies(response, refresh_token)
        
        return response
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Login error: {e}")
        return jsonify({'error': 'Erreur de connexion'}), 500


@auth_bp.route('/refresh', methods=['POST'])
@jwt_required(refresh=True)
@refresh_limit
def refresh():
    """
    Rafraîchir le token d'accès
    
    SÉCURITÉ: Rate limited pour éviter les abus
    """
    current_user_id = get_jwt_identity()
    jwt_claims = get_jwt()

    # Conserver le canal d'origine du token
    app_channel = jwt_claims.get('app_channel', _detect_app_channel())

    # CSRF: empêcher le refresh cross-site sur web
    if app_channel in ['web_client', 'web_admin']:
        csrf_header = request.headers.get('X-CSRF-Token')
        if not csrf_header:
            return jsonify({'error': 'CSRF token missing', 'code': 'CSRF_MISSING'}), 403
    
    current_user = User.query.get(current_user_id)
    
    if not current_user or not current_user.is_active:
        return jsonify({'error': 'Utilisateur invalide'}), 401
    
    # Vérifier que le refresh token n'est pas révoqué
    jti = jwt_claims['jti']
    if jti in revoked_tokens:
        revoked_tokens.discard(jti)
        return jsonify({'error': 'Token révoqué'}), 401
    
    # Générer nouveau token d'accès (conserver le canal d'origine)
    refresh_claims = {
        'tenant_id': current_user.tenant_id,
        'role': current_user.role,
        'email': current_user.email,
        'app_channel': app_channel
    }
    if current_user.role == 'staff':
        refresh_claims['access_modules'] = current_user.access_modules or []
        refresh_claims['warehouse_ids'] = [w.id for w in (current_user.warehouses or [])]
    access_token = create_access_token(
        identity=current_user_id,
        additional_claims=refresh_claims
    )
    
    # Générer nouveau token CSRF
    csrf_token = get_csrf_token_for_user(current_user_id)
    
    response = jsonify({
        'access_token': access_token,
        'csrf_token': csrf_token
    })
    
    set_access_cookies(response, access_token)
    
    return response


@auth_bp.route('/logout', methods=['POST'])
@tenant_required
def logout():
    """
    Déconnexion
    
    Note: Côté serveur, on ne peut pas vraiment invalider un JWT.
    Le client doit supprimer les tokens de son côté.
    Pour une vraie invalidation, il faudrait une blacklist Redis.
    """
    user_id = get_jwt_identity()
    
    audit_log(
        action=AuditAction.LOGOUT,
        user_id=user_id
    )
    
    response = jsonify({'message': 'Déconnexion réussie'})
    unset_jwt_cookies(response)
    return response


@auth_bp.route('/me', methods=['GET'])
@tenant_required
def get_current_user():
    """Récupérer le profil de l'utilisateur connecté"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    return jsonify({'user': user.to_dict(include_private=True)})


@auth_bp.route('/me', methods=['PUT'])
@tenant_required
def update_profile():
    """Mettre à jour le profil"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    data = request.get_json()
    
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    # VÉRIFICATION DE SÉCURITÉ CRITIQUE
    # Empêcher la modification cross-rôle
    app_type = request.headers.get('X-App-Type', 'client')
    if app_type == 'client' and user.role != 'client':
        return jsonify({'error': 'Action non autorisée'}), 403
    
    if app_type == 'admin' and user.role == 'client':
        return jsonify({'error': 'Action non autorisée'}), 403
    
    # Champs modifiables
    if 'first_name' in data:
        user.first_name = data['first_name'][:50]
    if 'last_name' in data:
        user.last_name = data['last_name'][:50]
    if 'phone' in data:
        phone = data['phone'].strip() if data['phone'] else None
        if phone and not validate_phone(phone):
            return jsonify({'error': 'Format téléphone invalide'}), 400
        user.phone = phone
    if 'notify_email' in data:
        user.notify_email = bool(data['notify_email'])
    if 'notify_sms' in data:
        user.notify_sms = bool(data['notify_sms'])
    if 'notify_push' in data:
        user.notify_push = bool(data['notify_push'])
    if 'notify_whatsapp' in data:
        user.notify_whatsapp = bool(data['notify_whatsapp'])
    
    db.session.commit()
    
    return jsonify({
        'message': 'Profile updated',
        'user': user.to_dict(include_private=True)
    })


@auth_bp.route('/change-password', methods=['POST'])
@tenant_required
def change_password():
    """Changer le mot de passe"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    data = request.get_json()
    
    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404
    
    # VÉRIFICATION DE SÉCURITÉ CRITIQUE
    # Empêtrer le changement de mot de passe cross-rôle
    app_type = request.headers.get('X-App-Type', 'client')
    if app_type == 'client' and user.role != 'client':
        return jsonify({'error': 'Action non autorisée'}), 403
    
    if app_type == 'admin' and user.role == 'client':
        return jsonify({'error': 'Action non autorisée'}), 403
    
    current_password = data.get('current_password')
    new_password = data.get('new_password')
    
    if not current_password or not new_password:
        return jsonify({'error': 'Mot de passe actuel et nouveau requis'}), 400
    
    if not user.check_password(current_password):
        audit_log(
            action=AuditAction.PASSWORD_CHANGE,
            user_id=user.id,
            user_email=user.email,
            details={'reason': 'wrong_current_password'},
            status='failure'
        )
        return jsonify({'error': 'Mot de passe actuel incorrect'}), 401
    
    # Validation du nouveau mot de passe
    is_valid, error_msg = validate_password(new_password)
    if not is_valid:
        return jsonify({'error': error_msg}), 400
    
    try:
        user.set_password(new_password)
        db.session.commit()
        
        audit_log(
            action=AuditAction.PASSWORD_CHANGE,
            user_id=user.id,
            user_email=user.email
        )
        
        return jsonify({'message': 'Mot de passe modifié avec succès'})
    except Exception as e:
        db.session.rollback()
        logger.error(f"Password change error: {e}")
        return jsonify({'error': 'Erreur lors du changement de mot de passe'}), 500


@auth_bp.route('/admin/login', methods=['POST'])
@auth_limit
def admin_login():
    """
    Connexion admin/staff
    Vérifie que l'utilisateur a un rôle admin ou staff
    """
    data = request.get_json()
    tenant_id = request.headers.get('X-Tenant-ID')
    
    if not tenant_id:
        return jsonify({'error': 'X-Tenant-ID header is required'}), 400
    
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')
    
    if not email or not password:
        return jsonify({'error': 'Email et mot de passe requis'}), 400
    
    user = User.query.filter_by(tenant_id=tenant_id, email=email).first()
    
    # Message générique pour éviter l'énumération
    if not user or not user.check_password(password):
        audit_log(
            action=AuditAction.LOGIN_FAILED,
            tenant_id=tenant_id,
            details={'email': email, 'reason': 'invalid_credentials', 'type': 'admin'},
            status='failure'
        )
        return jsonify({'error': 'Email ou mot de passe incorrect'}), 401
    
    if not user.is_active:
        audit_log(
            action=AuditAction.LOGIN_FAILED,
            user_id=user.id,
            user_email=user.email,
            tenant_id=tenant_id,
            details={'reason': 'account_disabled', 'type': 'admin'},
            status='failure'
        )
        return jsonify({'error': 'Compte désactivé'}), 403
    
    # Vérifier le rôle admin/staff
    if user.role not in ['admin', 'staff', 'super_admin']:
        audit_log(
            action=AuditAction.LOGIN_FAILED,
            user_id=user.id,
            user_email=user.email,
            tenant_id=tenant_id,
            details={'reason': 'insufficient_role', 'role': user.role, 'type': 'admin'},
            status='failure'
        )
        return jsonify({'error': 'Accès refusé. Rôle admin ou staff requis'}), 403
    
    try:
        # Mettre à jour last_login
        user.last_login = datetime.utcnow()
        db.session.commit()
        
        # Générer tokens avec claims (tenant_id inclus)
        access_token, refresh_token = create_tokens_with_claims(user)
        
        # Générer le token CSRF
        csrf_token = get_csrf_token_for_user(user.id)
        
        # Audit log - succès
        audit_log(
            action=AuditAction.LOGIN_SUCCESS,
            user_id=user.id,
            user_email=user.email,
            tenant_id=tenant_id,
            details={'type': 'admin', 'role': user.role}
        )
        
        response = jsonify({
            'user': user.to_dict(include_private=True),
            'access_token': access_token,
            'refresh_token': refresh_token,
            'csrf_token': csrf_token
        })
        set_access_cookies(response, access_token)
        set_refresh_cookies(response, refresh_token)
        return response
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Admin login error: {e}")
        return jsonify({'error': 'Erreur de connexion'}), 500


@auth_bp.route('/csrf-token', methods=['GET'])
@tenant_required
def get_csrf_token():
    """
    Récupère un nouveau token CSRF
    Utile si le token a expiré ou pour les SPA
    """
    user_id = get_jwt_identity()
    csrf_token = get_csrf_token_for_user(user_id)
    return jsonify({'csrf_token': csrf_token})
