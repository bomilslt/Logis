"""
Routes Super-Admin - Authentification
=====================================

Gère l'authentification des super-admins (niveau plateforme).
"""

from flask import request, jsonify, g
from flask_jwt_extended import (
    create_access_token, create_refresh_token,
    jwt_required, get_jwt_identity, get_jwt
)
from flask_jwt_extended import set_access_cookies, set_refresh_cookies, unset_jwt_cookies
from app.routes.superadmin import superadmin_bp
from app.models import SuperAdmin
from app import db, limiter
from app.utils.csrf import get_csrf_token_for_user, verify_csrf_token
from datetime import datetime, timedelta
from functools import wraps
import logging
import re

logger = logging.getLogger(__name__)


def _detect_app_channel() -> str:
    """Détecte le canal applicatif (superadmin-web => cookies + CSRF)."""
    header_channel = (request.headers.get('X-App-Channel') or '').strip()
    return header_channel or 'api'


from flask_jwt_extended import verify_jwt_in_request


def superadmin_required(fn):
    """
    Décorateur pour routes super-admin.
    Authentification JWT locale uniquement.
    """
    @wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            verify_jwt_in_request()
        except Exception:
            return jsonify({'error': 'Authentification requise'}), 401
            
        claims = get_jwt()
        
        # Vérifier que c'est un token super-admin
        if claims.get('type') != 'superadmin':
            return jsonify({'error': 'Accès super-admin requis'}), 403
        
        admin_id = get_jwt_identity()
        
        admin = SuperAdmin.query.get(admin_id)
        
        if not admin:
            return jsonify({'error': 'Admin non trouvé'}), 401
        
        if not admin.is_active:
            return jsonify({'error': 'Compte désactivé'}), 403
        
        g.superadmin = admin

        # CSRF: requis pour le canal web superadmin sur les méthodes mutantes
        app_channel = claims.get('app_channel') or _detect_app_channel()
        if app_channel == 'web_superadmin' and request.method in ['POST', 'PUT', 'PATCH', 'DELETE']:
            from flask import current_app

            csrf_token = request.headers.get('X-CSRF-Token')
            if not csrf_token:
                return jsonify({'error': 'CSRF token missing', 'code': 'CSRF_MISSING'}), 403

            secret_key = current_app.config.get('SECRET_KEY', '')
            if not verify_csrf_token(csrf_token, str(admin_id), secret_key):
                return jsonify({'error': 'Invalid CSRF token', 'code': 'CSRF_INVALID'}), 403
        
        return fn(*args, **kwargs)
    
    return wrapper


def superadmin_permission_required(permission: str):
    """Décorateur pour vérifier une permission spécifique"""
    def decorator(fn):
        @wraps(fn)
        @superadmin_required
        def wrapper(*args, **kwargs):
            if not g.superadmin.has_permission(permission):
                return jsonify({
                    'error': 'Permission insuffisante',
                    'required': permission
                }), 403
            return fn(*args, **kwargs)
        return wrapper
    return decorator


@superadmin_bp.route('/auth/login', methods=['POST'])
@limiter.limit("5 per minute")
def superadmin_login():
    """
    Connexion super-admin
    
    Body:
        - email: Email du super-admin
        - password: Mot de passe
    """
    data = request.get_json()
    
    if not data:
        return jsonify({'error': 'Données requises'}), 400
    
    email = data.get('email', '').lower().strip()
    password = data.get('password', '')
    
    if not email or not password:
        return jsonify({'error': 'Email et mot de passe requis'}), 400
    
    admin = SuperAdmin.query.filter_by(email=email).first()
    
    if not admin or not admin.check_password(password):
        logger.warning(f"Super-admin login failed for {email}")
        return jsonify({'error': 'Identifiants incorrects'}), 401
    
    if not admin.is_active:
        return jsonify({'error': 'Compte désactivé'}), 403
    
    # TODO: Vérifier 2FA si activé
    
    # Mettre à jour les infos de connexion
    admin.last_login = datetime.utcnow()
    admin.last_ip = request.remote_addr
    admin.login_count = (admin.login_count or 0) + 1
    db.session.commit()
    
    # Créer les tokens JWT avec claims spéciaux
    app_channel = _detect_app_channel()
    additional_claims = {
        'type': 'superadmin',
        'permissions': admin.permissions or [],
        'app_channel': app_channel
    }
    
    access_token = create_access_token(
        identity=admin.id,
        additional_claims=additional_claims,
        expires_delta=timedelta(hours=4)
    )
    refresh_token = create_refresh_token(
        identity=admin.id,
        additional_claims={'type': 'superadmin', 'app_channel': app_channel}
    )
    
    logger.info(f"Super-admin login: {admin.email}")
    
    csrf_token = get_csrf_token_for_user(admin.id)

    # Always return tokens in body (cross-origin: GitHub Pages ≠ Railway)
    response = jsonify({
        'access_token': access_token,
        'refresh_token': refresh_token,
        'csrf_token': csrf_token,
        'user': admin.to_dict()
    })
    
    # Also set cookies for same-origin setups
    set_access_cookies(response, access_token)
    set_refresh_cookies(response, refresh_token)
    
    return response


@superadmin_bp.route('/auth/refresh', methods=['POST'])
@jwt_required(refresh=True)
def superadmin_refresh():
    """Rafraîchit le token d'accès"""
    claims = get_jwt()
    
    if claims.get('type') != 'superadmin':
        return jsonify({'error': 'Token invalide'}), 401

    app_channel = claims.get('app_channel') or _detect_app_channel()
    if app_channel == 'web_superadmin':
        from flask import current_app

        csrf_token = request.headers.get('X-CSRF-Token')
        if not csrf_token:
            return jsonify({'error': 'CSRF token missing', 'code': 'CSRF_MISSING'}), 403

        secret_key = current_app.config.get('SECRET_KEY', '')
        if not verify_csrf_token(csrf_token, str(get_jwt_identity()), secret_key):
            return jsonify({'error': 'Invalid CSRF token', 'code': 'CSRF_INVALID'}), 403
    
    admin_id = get_jwt_identity()
    admin = SuperAdmin.query.get(admin_id)
    
    if not admin or not admin.is_active:
        return jsonify({'error': 'Compte désactivé'}), 403
    
    additional_claims = {
        'type': 'superadmin',
        'permissions': admin.permissions or [],
        'app_channel': app_channel
    }
    
    access_token = create_access_token(
        identity=admin.id,
        additional_claims=additional_claims,
        expires_delta=timedelta(hours=4)
    )

    new_csrf_token = get_csrf_token_for_user(admin.id)

    response = jsonify({'access_token': access_token, 'csrf_token': new_csrf_token})
    set_access_cookies(response, access_token)
    return response


@superadmin_bp.route('/auth/logout', methods=['POST'])
@superadmin_required
def superadmin_logout():
    response = jsonify({'message': 'Déconnexion réussie'})
    unset_jwt_cookies(response)
    return response


@superadmin_bp.route('/auth/csrf-token', methods=['GET'])
@superadmin_required
def superadmin_get_csrf_token():
    admin_id = get_jwt_identity()
    csrf_token = get_csrf_token_for_user(admin_id)
    return jsonify({'csrf_token': csrf_token})


@superadmin_bp.route('/auth/me', methods=['GET'])
@superadmin_required
def superadmin_me():
    """Retourne les infos de l'admin connecté"""
    return jsonify(g.superadmin.to_dict())


@superadmin_bp.route('/auth/password', methods=['PUT'])
@superadmin_required
def superadmin_change_password():
    """Change le mot de passe"""
    data = request.get_json()
    
    current_password = data.get('current_password')
    new_password = data.get('new_password')
    
    if not current_password or not new_password:
        return jsonify({'error': 'Mots de passe requis'}), 400
    
    if not g.superadmin.check_password(current_password):
        return jsonify({'error': 'Mot de passe actuel incorrect'}), 400
    
    # Validation mot de passe
    if len(new_password) < 12:
        return jsonify({'error': 'Le mot de passe doit contenir au moins 12 caractères'}), 400
    
    if not re.search(r'[A-Z]', new_password) or not re.search(r'[a-z]', new_password):
        return jsonify({'error': 'Le mot de passe doit contenir majuscules et minuscules'}), 400
    
    if not re.search(r'\d', new_password) or not re.search(r'[!@#$%^&*(),.?":{}|<>]', new_password):
        return jsonify({'error': 'Le mot de passe doit contenir chiffres et caractères spéciaux'}), 400
    
    g.superadmin.set_password(new_password)
    db.session.commit()
    
    logger.info(f"Super-admin password changed: {g.superadmin.email}")
    
    return jsonify({'message': 'Mot de passe modifié'})


@superadmin_bp.route('/auth/admins', methods=['GET'])
@superadmin_permission_required('admins.read')
def list_superadmins():
    """Liste tous les super-admins"""
    admins = SuperAdmin.query.order_by(SuperAdmin.created_at).all()
    return jsonify([a.to_dict() for a in admins])


@superadmin_bp.route('/auth/admins', methods=['POST'])
@superadmin_permission_required('admins.write')
def create_superadmin():
    """Crée un nouveau super-admin"""
    data = request.get_json()
    
    email = data.get('email', '').lower().strip()
    password = data.get('password')
    first_name = data.get('first_name')
    last_name = data.get('last_name')
    permissions = data.get('permissions', [])
    
    if not email or not password or not first_name or not last_name:
        return jsonify({'error': 'Tous les champs sont requis'}), 400
    
    if SuperAdmin.query.filter_by(email=email).first():
        return jsonify({'error': 'Cet email existe déjà'}), 409
    
    admin = SuperAdmin(
        email=email,
        first_name=first_name,
        last_name=last_name,
        permissions=permissions
    )
    admin.set_password(password)
    
    db.session.add(admin)
    db.session.commit()
    
    logger.info(f"Super-admin created: {email} by {g.superadmin.email}")
    
    return jsonify(admin.to_dict()), 201


@superadmin_bp.route('/auth/admins/<admin_id>', methods=['PUT'])
@superadmin_permission_required('admins.write')
def update_superadmin(admin_id):
    """Modifie un super-admin"""
    admin = SuperAdmin.query.get_or_404(admin_id)
    
    # Ne peut pas modifier l'admin primaire
    if admin.is_primary and admin.id != g.superadmin.id:
        return jsonify({'error': 'Impossible de modifier l\'admin primaire'}), 403
    
    data = request.get_json()
    
    if 'first_name' in data:
        admin.first_name = data['first_name']
    if 'last_name' in data:
        admin.last_name = data['last_name']
    if 'permissions' in data and not admin.is_primary:
        admin.permissions = data['permissions']
    if 'is_active' in data and not admin.is_primary:
        admin.is_active = data['is_active']
    if 'password' in data and data['password']:
        admin.set_password(data['password'])
    
    db.session.commit()
    
    return jsonify(admin.to_dict())


@superadmin_bp.route('/auth/admins/<admin_id>', methods=['DELETE'])
@superadmin_permission_required('admins.write')
def delete_superadmin(admin_id):
    """Supprime un super-admin"""
    admin = SuperAdmin.query.get_or_404(admin_id)
    
    if admin.is_primary:
        return jsonify({'error': 'Impossible de supprimer l\'admin primaire'}), 403
    
    if admin.id == g.superadmin.id:
        return jsonify({'error': 'Impossible de se supprimer soi-même'}), 400
    
    db.session.delete(admin)
    db.session.commit()
    
    logger.info(f"Super-admin deleted: {admin.email} by {g.superadmin.email}")
    
    return jsonify({'message': 'Admin supprimé'})
