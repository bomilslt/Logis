"""
Routes OTP - Vérification 2FA
=============================

Endpoints pour la gestion des codes OTP:
- Récupérer les canaux disponibles
- Envoyer un code OTP
- Vérifier un code OTP
"""

from flask import Blueprint, request, jsonify, g
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import db, limiter
from app.models import User, TenantConfig
from app.services.otp_service import OTPService
from app.utils.audit import audit_log, AuditAction
from app.utils.decorators import tenant_required
import logging

otp_bp = Blueprint('otp', __name__)
logger = logging.getLogger(__name__)

# Rate limiting strict pour les OTP
otp_send_limit = limiter.limit("5 per minute", error_message="Trop de demandes. Réessayez dans 1 minute.")
otp_verify_limit = limiter.limit("10 per minute", error_message="Trop de tentatives. Réessayez dans 1 minute.")


@otp_bp.route('/otp/channels', methods=['POST'])
@otp_send_limit
def get_otp_channels():
    """
    Récupère les canaux disponibles pour l'envoi d'OTP
    
    Body:
        - email: Email de l'utilisateur (optionnel)
        - phone: Téléphone de l'utilisateur (optionnel)
        - purpose: But de l'OTP (login, register, password_reset)
    
    Returns:
        Liste des canaux disponibles
    """
    tenant_id = request.headers.get('X-Tenant-ID')
    if not tenant_id:
        return jsonify({'error': 'X-Tenant-ID header is required'}), 400
    
    data = request.get_json() or {}
    email = (data.get('email') or '').strip().lower()
    phone = (data.get('phone') or '').strip()
    purpose = data.get('purpose', 'login')
    
    if not email and not phone:
        return jsonify({'error': 'Email ou téléphone requis'}), 400
    
    # Pour login et password_reset, vérifier que l'utilisateur existe
    if purpose in ['login', 'password_reset']:
        user = None
        if email:
            user = User.query.filter_by(tenant_id=tenant_id, email=email).first()
        elif phone:
            user = User.query.filter_by(tenant_id=tenant_id, phone=phone).first()
        
        if not user:
            return jsonify({'error': 'Aucun compte trouvé avec cet identifiant'}), 404
        
        # Utiliser les vraies infos de l'utilisateur pour les canaux
        email = user.email
        phone = user.phone
    
    service = OTPService(tenant_id)
    channels = service.get_available_channels(user_email=email, user_phone=phone)
    
    # Filtrer pour ne garder que les canaux disponibles
    available_channels = [ch for ch in channels if ch['available']]
    
    return jsonify({
        'channels': available_channels,
        'all_channels': channels  # Pour debug/info
    })


@otp_bp.route('/otp/send', methods=['POST'])
@otp_send_limit
def send_otp():
    """
    Envoie un code OTP
    
    Body:
        - email: Email de l'utilisateur
        - phone: Téléphone (optionnel, pour SMS/WhatsApp)
        - channel: Canal d'envoi (email, sms, whatsapp)
        - purpose: But (login, register, password_reset, password_change)
    
    Returns:
        Résultat de l'envoi
    """
    tenant_id = request.headers.get('X-Tenant-ID')
    if not tenant_id:
        return jsonify({'error': 'X-Tenant-ID header is required'}), 400
    
    data = request.get_json() or {}
    email = (data.get('email') or '').strip().lower()
    phone = (data.get('phone') or '').strip()
    channel = data.get('channel', 'email')
    purpose = data.get('purpose', 'login')
    
    # Validation
    valid_purposes = ['login', 'register', 'password_reset', 'password_change', 'email_change']
    if purpose not in valid_purposes:
        return jsonify({'error': f'Purpose invalide. Valeurs: {valid_purposes}'}), 400
    
    valid_channels = ['email', 'sms', 'whatsapp']
    if channel not in valid_channels:
        return jsonify({'error': f'Canal invalide. Valeurs: {valid_channels}'}), 400
    
    # Déterminer la destination
    if channel == 'email':
        if not email:
            return jsonify({'error': 'Email requis pour ce canal'}), 400
        destination = email
    else:
        if not phone:
            return jsonify({'error': 'Téléphone requis pour ce canal'}), 400
        destination = phone
    
    # Trouver ou créer l'utilisateur temporaire
    user = None
    user_name = None
    
    if purpose in ['login', 'password_reset']:
        # L'utilisateur doit exister
        if email:
            user = User.query.filter_by(tenant_id=tenant_id, email=email).first()
        elif phone:
            user = User.query.filter_by(tenant_id=tenant_id, phone=phone).first()
        
        if not user:
            # Message générique pour éviter l'énumération
            return jsonify({'error': 'Utilisateur non trouvé'}), 404
        
        user_name = user.first_name or user.name
        
    elif purpose == 'register':
        # Vérifier que l'email n'existe pas déjà
        if email:
            existing = User.query.filter_by(tenant_id=tenant_id, email=email).first()
            if existing:
                return jsonify({'error': 'Email déjà utilisé'}), 409
        
        # Créer un ID temporaire pour le processus d'inscription
        import uuid
        user_id = f"temp_{uuid.uuid4().hex[:12]}"
        user_name = data.get('name', 'Client')
        
    elif purpose == 'password_change':
        # Nécessite d'être connecté - géré par un autre endpoint
        return jsonify({'error': 'Utilisez /otp/send-authenticated pour ce purpose'}), 400
    
    # Envoyer l'OTP
    service = OTPService(tenant_id)
    
    if user:
        user_id = user.id
    
    result = service.send_otp(
        user_id=user_id,
        purpose=purpose,
        channel=channel,
        destination=destination,
        user_name=user_name
    )
    
    if result.get('success'):
        # Audit log
        audit_log(
            action=AuditAction.OTP_SENT if hasattr(AuditAction, 'OTP_SENT') else 'otp_sent',
            tenant_id=tenant_id,
            user_id=user.id if user else None,
            details={'channel': channel, 'purpose': purpose}
        )
        
        return jsonify({
            'success': True,
            'message': result.get('message'),
            'expires_in': result.get('expires_in'),
            'channel': channel,
            'destination_masked': service._mask_destination(channel, destination)
        })
    else:
        return jsonify({
            'success': False,
            'error': result.get('error'),
            'cooldown': result.get('cooldown')
        }), 400 if result.get('cooldown') else 500


@otp_bp.route('/otp/send-authenticated', methods=['POST'])
@tenant_required
@otp_send_limit
def send_otp_authenticated():
    """
    Envoie un code OTP pour un utilisateur connecté
    (changement de mot de passe, etc.)
    """
    tenant_id = getattr(g, 'tenant_id', None) or request.headers.get('X-Tenant-ID')
    user_id = str(get_jwt_identity())  # S'assurer que c'est une string
    
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404
    
    data = request.get_json() or {}
    channel = data.get('channel', 'email')
    purpose = data.get('purpose', 'password_change')
    
    # Déterminer la destination
    if channel == 'email':
        destination = user.email
    else:
        if not user.phone:
            return jsonify({'error': 'Aucun téléphone enregistré'}), 400
        destination = user.phone
    
    service = OTPService(tenant_id)
    result = service.send_otp(
        user_id=user_id,
        purpose=purpose,
        channel=channel,
        destination=destination,
        user_name=user.first_name or user.name
    )
    
    if result.get('success'):
        return jsonify({
            'success': True,
            'message': result.get('message'),
            'expires_in': result.get('expires_in'),
            'channel': channel,
            'destination_masked': service._mask_destination(channel, destination)
        })
    else:
        return jsonify({
            'success': False,
            'error': result.get('error'),
            'cooldown': result.get('cooldown')
        }), 400 if result.get('cooldown') else 500


@otp_bp.route('/otp/verify', methods=['POST'])
@otp_verify_limit
def verify_otp():
    """
    Vérifie un code OTP
    
    Body:
        - email: Email de l'utilisateur
        - code: Code OTP à vérifier
        - purpose: But de l'OTP
    
    Returns:
        Résultat de la vérification + token temporaire si succès
    """
    tenant_id = request.headers.get('X-Tenant-ID')
    if not tenant_id:
        return jsonify({'error': 'X-Tenant-ID header is required'}), 400
    
    data = request.get_json() or {}
    email = (data.get('email') or '').strip().lower()
    phone = (data.get('phone') or '').strip()
    code = (data.get('code') or '').strip()
    purpose = data.get('purpose', 'login')
    
    if not code:
        return jsonify({'error': 'Code requis'}), 400
    
    if not email and not phone:
        return jsonify({'error': 'Email ou téléphone requis'}), 400
    
    # Trouver l'utilisateur
    user = None
    user_id = None
    
    if purpose == 'register':
        # Pour l'inscription, on utilise l'ID temporaire
        # Le frontend doit le stocker après send_otp
        user_id = data.get('temp_user_id')
        if not user_id:
            return jsonify({'error': 'temp_user_id requis pour inscription'}), 400
    else:
        if email:
            user = User.query.filter_by(tenant_id=tenant_id, email=email).first()
        elif phone:
            user = User.query.filter_by(tenant_id=tenant_id, phone=phone).first()
        
        if not user:
            return jsonify({'error': 'Utilisateur non trouvé'}), 404
        
        user_id = user.id
    
    # Vérifier l'OTP
    service = OTPService(tenant_id)
    result = service.verify_otp(user_id=user_id, purpose=purpose, code=code)
    
    if result.get('success'):
        # Générer un token temporaire pour l'action suivante
        import secrets
        verification_token = secrets.token_urlsafe(32)
        
        # Stocker le token temporairement (en session ou cache)
        # Pour simplifier, on le stocke dans la DB
        from app.models import OTPCode
        otp_record = OTPCode.query.filter_by(
            tenant_id=tenant_id,
            user_id=user_id,
            purpose=purpose,
            is_used=True
        ).order_by(OTPCode.verified_at.desc()).first()
        
        if otp_record:
            # Stocker le token de vérification
            otp_record.verification_token = verification_token
            db.session.commit()
        
        # Audit log
        audit_log(
            action=AuditAction.OTP_VERIFIED if hasattr(AuditAction, 'OTP_VERIFIED') else 'otp_verified',
            tenant_id=tenant_id,
            user_id=user.id if user else None,
            details={'purpose': purpose}
        )
        
        response_data = {
            'success': True,
            'message': result.get('message'),
            'verification_token': verification_token
        }
        
        # Pour login, générer directement les tokens JWT
        if purpose == 'login' and user:
            from app.routes.auth import create_tokens_with_claims
            from app.utils.csrf import get_csrf_token_for_user
            from datetime import datetime
            
            user.last_login = datetime.utcnow()
            db.session.commit()
            
            access_token, refresh_token = create_tokens_with_claims(user)
            csrf_token = get_csrf_token_for_user(user.id)
            
            response_data.update({
                'user': user.to_dict(include_private=True),
                'access_token': access_token,
                'refresh_token': refresh_token,
                'csrf_token': csrf_token
            })
        
        return jsonify(response_data)
    else:
        return jsonify({
            'success': False,
            'error': result.get('error')
        }), 400


@otp_bp.route('/otp/verify-authenticated', methods=['POST'])
@tenant_required
@otp_verify_limit
def verify_otp_authenticated():
    """
    Vérifie un code OTP pour un utilisateur connecté
    """
    tenant_id = getattr(g, 'tenant_id', None) or request.headers.get('X-Tenant-ID')
    user_id = str(get_jwt_identity())  # S'assurer que c'est une string
    
    data = request.get_json() or {}
    code = (data.get('code') or '').strip()
    purpose = data.get('purpose', 'password_change')
    
    if not code:
        return jsonify({'error': 'Code requis'}), 400
    
    service = OTPService(tenant_id)
    result = service.verify_otp(user_id=user_id, purpose=purpose, code=code)
    
    if result.get('success'):
        import secrets
        verification_token = secrets.token_urlsafe(32)
        
        # Stocker le token dans l'OTP record
        from app.models import OTPCode
        otp_record = OTPCode.query.filter_by(
            tenant_id=tenant_id,
            user_id=user_id,
            purpose=purpose,
            is_used=True
        ).order_by(OTPCode.verified_at.desc()).first()
        
        if otp_record:
            otp_record.verification_token = verification_token
            db.session.commit()
            logger.info(f"Stored verification_token for user {user_id}: {verification_token[:10]}...")
        else:
            logger.warning(f"Could not find OTP record to store verification_token for user {user_id}")
        
        return jsonify({
            'success': True,
            'message': result.get('message'),
            'verification_token': verification_token
        })
    else:
        return jsonify({
            'success': False,
            'error': result.get('error')
        }), 400


@otp_bp.route('/otp/resend', methods=['POST'])
@otp_send_limit
def resend_otp():
    """
    Renvoie un code OTP (raccourci pour send avec les mêmes paramètres)
    """
    # Simplement rediriger vers send_otp
    return send_otp()


@otp_bp.route('/reset-password', methods=['POST'])
@otp_verify_limit
def reset_password_with_token():
    """
    Réinitialise le mot de passe après vérification OTP
    
    Body:
        - email: Email de l'utilisateur
        - password: Nouveau mot de passe
        - verification_token: Token obtenu après vérification OTP
    """
    tenant_id = request.headers.get('X-Tenant-ID')
    if not tenant_id:
        return jsonify({'error': 'X-Tenant-ID header is required'}), 400
    
    data = request.get_json() or {}
    email = (data.get('email') or '').strip().lower()
    password = data.get('password', '')
    verification_token = data.get('verification_token', '')
    
    if not email or not password or not verification_token:
        return jsonify({'error': 'Email, mot de passe et token requis'}), 400
    
    # Trouver l'utilisateur
    user = User.query.filter_by(tenant_id=tenant_id, email=email).first()
    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404
    
    # Vérifier le token
    from app.models import OTPCode
    otp_record = OTPCode.query.filter_by(
        tenant_id=tenant_id,
        user_id=user.id,
        purpose='password_reset',
        verification_token=verification_token,
        is_used=True
    ).order_by(OTPCode.verified_at.desc()).first()
    
    if not otp_record:
        return jsonify({'error': 'Token invalide ou expiré'}), 400
    
    # Vérifier que le token n'est pas trop vieux (15 min max après vérification)
    from datetime import datetime, timedelta
    if otp_record.verified_at and datetime.utcnow() > otp_record.verified_at + timedelta(minutes=15):
        return jsonify({'error': 'Token expiré. Recommencez la procédure.'}), 400
    
    # Valider le mot de passe
    from app.routes.auth import validate_password
    is_valid, error_msg = validate_password(password)
    if not is_valid:
        return jsonify({'error': error_msg}), 400
    
    try:
        # Mettre à jour le mot de passe
        user.set_password(password)
        
        # Invalider le token
        otp_record.verification_token = None
        
        db.session.commit()
        
        # Audit log
        audit_log(
            action=AuditAction.PASSWORD_RESET,
            user_id=user.id,
            user_email=user.email,
            tenant_id=tenant_id
        )
        
        return jsonify({
            'success': True,
            'message': 'Mot de passe réinitialisé avec succès'
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Password reset error: {e}")
        return jsonify({'error': 'Erreur lors de la réinitialisation'}), 500


@otp_bp.route('/register-verified', methods=['POST'])
@otp_verify_limit
def register_with_verification():
    """
    Inscription avec email vérifié par OTP
    
    Body:
        - email, password, first_name, last_name, phone
        - verification_token: Token obtenu après vérification OTP
    """
    from app.routes.auth import validate_email, validate_password, validate_phone, create_tokens_with_claims
    from app.utils.csrf import get_csrf_token_for_user
    from app.models import Tenant
    
    tenant_id = request.headers.get('X-Tenant-ID')
    if not tenant_id:
        return jsonify({'error': 'X-Tenant-ID header is required'}), 400
    
    # Vérifier que le tenant existe
    tenant = Tenant.query.get(tenant_id)
    if not tenant or not tenant.is_active:
        return jsonify({'error': 'Invalid tenant'}), 400
    
    data = request.get_json() or {}
    email = (data.get('email') or '').strip().lower()
    password = data.get('password', '')
    first_name = (data.get('first_name') or '').strip()[:50]
    last_name = (data.get('last_name') or '').strip()[:50]
    phone = (data.get('phone') or '').strip() or None
    verification_token = data.get('verification_token', '')
    
    # Validations
    if not email or not password or not first_name or not last_name:
        return jsonify({'error': 'Tous les champs requis'}), 400
    
    if not verification_token:
        return jsonify({'error': 'Token de vérification requis'}), 400
    
    if not validate_email(email):
        return jsonify({'error': 'Format email invalide'}), 400
    
    is_valid, error_msg = validate_password(password)
    if not is_valid:
        return jsonify({'error': error_msg}), 400
    
    if phone and not validate_phone(phone):
        return jsonify({'error': 'Format téléphone invalide'}), 400
    
    if len(first_name) < 2 or len(last_name) < 2:
        return jsonify({'error': 'Nom et prénom doivent avoir au moins 2 caractères'}), 400
    
    # Vérifier que l'email n'existe pas déjà
    existing = User.query.filter_by(tenant_id=tenant_id, email=email).first()
    if existing:
        return jsonify({'error': 'Email déjà utilisé'}), 409
    
    # Vérifier le token OTP (pour les inscriptions, user_id commence par "temp_")
    from app.models import OTPCode
    otp_record = OTPCode.query.filter(
        OTPCode.tenant_id == tenant_id,
        OTPCode.user_id.like('temp_%'),
        OTPCode.purpose == 'register',
        OTPCode.destination == email,
        OTPCode.verification_token == verification_token,
        OTPCode.is_used == True
    ).order_by(OTPCode.verified_at.desc()).first()
    
    if not otp_record:
        return jsonify({'error': 'Token de vérification invalide'}), 400
    
    # Vérifier que le token n'est pas trop vieux (30 min max)
    from datetime import datetime, timedelta
    if otp_record.verified_at and datetime.utcnow() > otp_record.verified_at + timedelta(minutes=30):
        return jsonify({'error': 'Token expiré. Recommencez l\'inscription.'}), 400
    
    try:
        # Créer l'utilisateur
        user = User(
            tenant_id=tenant_id,
            email=email,
            phone=phone,
            first_name=first_name,
            last_name=last_name,
            role='client',
            email_verified=True  # Email vérifié par OTP
        )
        user.set_password(password)
        
        db.session.add(user)
        
        # Invalider le token
        otp_record.verification_token = None
        
        db.session.commit()
        
        # Générer tokens
        access_token, refresh_token = create_tokens_with_claims(user)
        csrf_token = get_csrf_token_for_user(user.id)
        
        # Audit log
        audit_log(
            action=AuditAction.USER_CREATE,
            resource_type='user',
            resource_id=user.id,
            user_id=user.id,
            user_email=user.email,
            tenant_id=tenant_id,
            details={'role': 'client', 'method': 'registration_verified'}
        )
        
        return jsonify({
            'message': 'Compte créé avec succès',
            'user': user.to_dict(include_private=True),
            'access_token': access_token,
            'refresh_token': refresh_token,
            'csrf_token': csrf_token
        }), 201
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Registration error: {e}")
        return jsonify({'error': 'Erreur lors de l\'inscription'}), 500


@otp_bp.route('/verify-password', methods=['POST'])
@tenant_required
def verify_current_password():
    """
    Vérifie le mot de passe actuel de l'utilisateur connecté
    Utilisé avant le changement de mot de passe
    """
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    
    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404
    
    data = request.get_json() or {}
    password = data.get('password', '')
    
    if not password:
        return jsonify({'error': 'Mot de passe requis'}), 400
    
    if not user.check_password(password):
        return jsonify({'error': 'Mot de passe incorrect'}), 401
    
    return jsonify({'success': True, 'message': 'Mot de passe vérifié'})


@otp_bp.route('/send-email-change-otp', methods=['POST'])
@tenant_required
@otp_send_limit
def send_email_change_otp():
    """
    Envoie un code OTP à la nouvelle adresse email pour vérification
    L'utilisateur doit d'abord confirmer son mot de passe actuel
    """
    from app.routes.auth import validate_email
    
    tenant_id = getattr(g, 'tenant_id', None) or request.headers.get('X-Tenant-ID')
    user_id = str(get_jwt_identity())
    
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404
    
    data = request.get_json() or {}
    new_email = (data.get('new_email') or '').strip().lower()
    
    if not new_email:
        return jsonify({'error': 'Nouvel email requis'}), 400
    
    if not validate_email(new_email):
        return jsonify({'error': 'Format email invalide'}), 400
    
    # Vérifier que le nouvel email n'est pas déjà utilisé
    existing = User.query.filter_by(tenant_id=tenant_id, email=new_email).first()
    if existing:
        return jsonify({'error': 'Cet email est déjà utilisé'}), 409
    
    # Envoyer l'OTP à la nouvelle adresse
    service = OTPService(tenant_id)
    result = service.send_otp(
        user_id=user_id,
        purpose='email_change',
        channel='email',
        destination=new_email,
        user_name=user.first_name or user.name
    )
    
    if result.get('success'):
        return jsonify({
            'success': True,
            'message': result.get('message'),
            'expires_in': result.get('expires_in'),
            'destination_masked': service._mask_destination('email', new_email)
        })
    else:
        return jsonify({
            'success': False,
            'error': result.get('error'),
            'cooldown': result.get('cooldown')
        }), 400 if result.get('cooldown') else 500


@otp_bp.route('/change-email-verified', methods=['POST'])
@tenant_required
@otp_verify_limit
def change_email_with_otp():
    """
    Change l'email après vérification OTP sur la nouvelle adresse
    
    Body:
        - current_password: Mot de passe actuel
        - new_email: Nouvel email
        - code: Code OTP reçu sur le nouvel email
    """
    from app.routes.auth import validate_email
    
    tenant_id = getattr(g, 'tenant_id', None) or request.headers.get('X-Tenant-ID')
    user_id = str(get_jwt_identity())
    
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404
    
    data = request.get_json() or {}
    current_password = data.get('current_password', '')
    new_email = (data.get('new_email') or '').strip().lower()
    code = (data.get('code') or '').strip()
    
    if not current_password or not new_email or not code:
        return jsonify({'error': 'Tous les champs requis'}), 400
    
    # Vérifier le mot de passe actuel
    if not user.check_password(current_password):
        return jsonify({'error': 'Mot de passe incorrect'}), 401
    
    if not validate_email(new_email):
        return jsonify({'error': 'Format email invalide'}), 400
    
    # Vérifier que le nouvel email n'est pas déjà utilisé
    existing = User.query.filter_by(tenant_id=tenant_id, email=new_email).first()
    if existing:
        return jsonify({'error': 'Cet email est déjà utilisé'}), 409
    
    # Vérifier l'OTP
    service = OTPService(tenant_id)
    result = service.verify_otp(user_id=user_id, purpose='email_change', code=code)
    
    if not result.get('success'):
        return jsonify({
            'success': False,
            'error': result.get('error')
        }), 400
    
    try:
        old_email = user.email
        user.email = new_email
        user.email_verified = True  # Vérifié par OTP
        
        db.session.commit()
        
        # Audit log
        audit_log(
            action=AuditAction.USER_UPDATE if hasattr(AuditAction, 'USER_UPDATE') else 'user_update',
            user_id=user.id,
            user_email=new_email,
            tenant_id=tenant_id,
            details={'field': 'email', 'old_value': old_email, 'new_value': new_email}
        )
        
        return jsonify({
            'success': True,
            'message': 'Email modifié avec succès',
            'user': user.to_dict(include_private=True)
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Email change error: {e}")
        return jsonify({'error': 'Erreur lors du changement'}), 500


@otp_bp.route('/change-password-verified', methods=['POST'])
@tenant_required
@otp_verify_limit
def change_password_with_otp():
    """
    Change le mot de passe après vérification OTP
    
    Body:
        - current_password: Mot de passe actuel
        - new_password: Nouveau mot de passe
        - verification_token: Token obtenu après vérification OTP
    """
    from app.routes.auth import validate_password
    
    tenant_id = getattr(g, 'tenant_id', None) or request.headers.get('X-Tenant-ID')
    user_id = get_jwt_identity()
    
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'Utilisateur non trouvé'}), 404
    
    data = request.get_json() or {}
    current_password = data.get('current_password', '')
    new_password = data.get('new_password', '')
    verification_token = data.get('verification_token', '')
    
    if not current_password or not new_password or not verification_token:
        return jsonify({'error': 'Tous les champs requis'}), 400
    
    # Vérifier le mot de passe actuel
    if not user.check_password(current_password):
        return jsonify({'error': 'Mot de passe actuel incorrect'}), 401
    
    # Valider le nouveau mot de passe
    is_valid, error_msg = validate_password(new_password)
    if not is_valid:
        return jsonify({'error': error_msg}), 400
    
    # Vérifier le token OTP
    from app.models import OTPCode
    
    # Debug log
    logger.info(f"Looking for OTP: tenant={tenant_id}, user={user_id}, token={verification_token[:10]}...")
    
    otp_record = OTPCode.query.filter_by(
        tenant_id=tenant_id,
        user_id=str(user_id),  # S'assurer que c'est une string
        purpose='password_change',
        verification_token=verification_token,
        is_used=True
    ).order_by(OTPCode.verified_at.desc()).first()
    
    if not otp_record:
        # Debug: chercher sans le token pour voir si l'OTP existe
        debug_otp = OTPCode.query.filter_by(
            tenant_id=tenant_id,
            user_id=str(user_id),
            purpose='password_change',
            is_used=True
        ).order_by(OTPCode.verified_at.desc()).first()
        
        if debug_otp:
            logger.warning(f"OTP found but token mismatch. DB token: {debug_otp.verification_token[:10] if debug_otp.verification_token else 'None'}...")
        else:
            logger.warning(f"No OTP found for user {user_id} with purpose password_change")
        
        return jsonify({'error': 'Token de vérification invalide'}), 400
    
    # Vérifier que le token n'est pas trop vieux (15 min max)
    from datetime import datetime, timedelta
    if otp_record.verified_at and datetime.utcnow() > otp_record.verified_at + timedelta(minutes=15):
        return jsonify({'error': 'Token expiré. Recommencez la procédure.'}), 400
    
    try:
        # Mettre à jour le mot de passe
        user.set_password(new_password)
        
        # Invalider le token
        otp_record.verification_token = None
        
        db.session.commit()
        
        # Audit log
        audit_log(
            action=AuditAction.PASSWORD_CHANGE,
            user_id=user.id,
            user_email=user.email,
            tenant_id=tenant_id,
            details={'method': 'otp_verified'}
        )
        
        return jsonify({
            'success': True,
            'message': 'Mot de passe modifié avec succès'
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Password change error: {e}")
        return jsonify({'error': 'Erreur lors du changement'}), 500
