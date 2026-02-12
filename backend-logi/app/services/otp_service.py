"""
Service OTP (One-Time Password)
===============================

Gère la génération, l'envoi et la vérification des codes OTP
pour l'authentification 2FA, la réinitialisation de mot de passe, etc.

Canaux supportés: SMS, WhatsApp, Email
Fallback EmailJS pour les tests
"""

import random
import string
import hashlib
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from app import db

logger = logging.getLogger(__name__)

# Durée de validité des OTP (en minutes)
OTP_VALIDITY_MINUTES = 10
OTP_LENGTH = 6
MAX_ATTEMPTS = 3
RESEND_COOLDOWN_SECONDS = 60


class OTPService:
    """
    Service de gestion des codes OTP
    
    Usage:
        service = OTPService(tenant_id)
        
        # Envoyer un OTP
        result = service.send_otp(
            user_id='xxx',
            purpose='login',
            channel='sms',
            destination='+237699000000'
        )
        
        # Vérifier un OTP
        is_valid = service.verify_otp(
            user_id='xxx',
            purpose='login',
            code='123456'
        )
    """
    
    def __init__(self, tenant_id: str):
        self.tenant_id = tenant_id
        self._notification_service = None
    
    @property
    def notification_service(self):
        """Lazy loading du service de notification"""
        if self._notification_service is None:
            from app.services.notification_service import NotificationService
            self._notification_service = NotificationService(self.tenant_id)
        return self._notification_service
    
    def get_available_channels(self, user_email: str = None, user_phone: str = None) -> List[Dict[str, Any]]:
        """
        Retourne les canaux disponibles pour l'envoi d'OTP
        Basé sur la configuration du tenant et les infos utilisateur
        
        Args:
            user_email: Email de l'utilisateur (optionnel)
            user_phone: Téléphone de l'utilisateur (optionnel)
        
        Returns:
            Liste des canaux disponibles avec leurs infos
        """
        channels = []
        
        # Vérifier la config du tenant
        config = self.notification_service.config
        
        # Email - toujours disponible avec fallback EmailJS
        if user_email:
            email_config = config.get('email', {})
            is_configured = bool(email_config.get('provider')) or True  # Fallback EmailJS
            channels.append({
                'id': 'email',
                'name': 'Email',
                'icon': 'mail',
                'destination': self._mask_email(user_email),
                'available': True,
                'configured': is_configured
            })
        
        # SMS
        if user_phone:
            sms_config = config.get('sms', {})
            is_configured = bool(sms_config.get('provider'))
            channels.append({
                'id': 'sms',
                'name': 'SMS',
                'icon': 'smartphone',
                'destination': self._mask_phone(user_phone),
                'available': is_configured,
                'configured': is_configured
            })
        
        # WhatsApp
        if user_phone:
            wa_config = config.get('whatsapp', {})
            is_configured = bool(wa_config.get('provider'))
            channels.append({
                'id': 'whatsapp',
                'name': 'WhatsApp',
                'icon': 'message-circle',
                'destination': self._mask_phone(user_phone),
                'available': is_configured,
                'configured': is_configured
            })
        
        return channels
    
    def generate_otp(self) -> str:
        """Génère un code OTP numérique"""
        return ''.join(random.choices(string.digits, k=OTP_LENGTH))
    
    def _hash_otp(self, code: str, user_id: str, purpose: str) -> str:
        """Hash le code OTP pour stockage sécurisé"""
        salt = f"{self.tenant_id}:{user_id}:{purpose}"
        return hashlib.sha256(f"{code}:{salt}".encode()).hexdigest()
    
    def send_otp(
        self,
        user_id: str,
        purpose: str,
        channel: str,
        destination: str,
        user_name: str = None
    ) -> Dict[str, Any]:
        """
        Génère et envoie un code OTP
        
        Args:
            user_id: ID de l'utilisateur
            purpose: But de l'OTP (login, register, password_reset, password_change)
            channel: Canal d'envoi (email, sms, whatsapp)
            destination: Email ou téléphone
            user_name: Nom de l'utilisateur (optionnel)
        
        Returns:
            dict: Résultat de l'envoi
        """
        from app.models import OTPCode
        
        # Vérifier le cooldown
        recent_otp = OTPCode.query.filter_by(
            tenant_id=self.tenant_id,
            user_id=user_id,
            purpose=purpose
        ).order_by(OTPCode.created_at.desc()).first()
        
        if recent_otp:
            elapsed = (datetime.utcnow() - recent_otp.created_at).total_seconds()
            if elapsed < RESEND_COOLDOWN_SECONDS:
                remaining = int(RESEND_COOLDOWN_SECONDS - elapsed)
                return {
                    'success': False,
                    'error': f'Veuillez attendre {remaining} secondes avant de renvoyer',
                    'cooldown': remaining
                }
        
        # Générer le code
        code = self.generate_otp()
        code_hash = self._hash_otp(code, user_id, purpose)
        expires_at = datetime.utcnow() + timedelta(minutes=OTP_VALIDITY_MINUTES)
        
        # Invalider les anciens codes
        OTPCode.query.filter_by(
            tenant_id=self.tenant_id,
            user_id=user_id,
            purpose=purpose,
            is_used=False
        ).update({'is_used': True})
        
        # Créer le nouveau code
        otp_record = OTPCode(
            tenant_id=self.tenant_id,
            user_id=user_id,
            purpose=purpose,
            code_hash=code_hash,
            channel=channel,
            destination=destination,
            expires_at=expires_at
        )
        db.session.add(otp_record)
        db.session.commit()
        
        # Envoyer le code
        send_result = self._send_code(channel, destination, code, purpose, user_name)
        
        if not send_result.get('success'):
            logger.error(f"Failed to send OTP via {channel}: {send_result.get('error')}")
            return {
                'success': False,
                'error': f"Échec de l'envoi via {channel}",
                'details': send_result.get('error')
            }
        
        logger.info(f"OTP sent to {self._mask_destination(channel, destination)} for {purpose}")
        
        return {
            'success': True,
            'message': f'Code envoyé via {channel}',
            'expires_in': OTP_VALIDITY_MINUTES * 60,
            'otp_id': otp_record.id
        }
    
    def _send_code(
        self,
        channel: str,
        destination: str,
        code: str,
        purpose: str,
        user_name: str = None
    ) -> Dict[str, Any]:
        """Envoie le code via le canal spécifié"""
        
        # Récupérer le nom de l'entreprise
        from app.models import Tenant
        tenant = Tenant.query.get(self.tenant_id)
        company_name = tenant.name if tenant else 'Express Cargo'
        
        # Messages selon le but
        purpose_labels = {
            'login': 'connexion',
            'register': 'inscription',
            'password_reset': 'réinitialisation de mot de passe',
            'password_change': 'changement de mot de passe'
        }
        purpose_label = purpose_labels.get(purpose, 'vérification')
        
        name = user_name or 'Client'
        
        if channel == 'email':
            return self._send_email_otp(destination, code, purpose_label, name, company_name)
        elif channel == 'sms':
            return self._send_sms_otp(destination, code, purpose_label, company_name)
        elif channel == 'whatsapp':
            return self._send_whatsapp_otp(destination, code, purpose_label, name, company_name)
        else:
            return {'success': False, 'error': f'Canal non supporté: {channel}'}
    
    def _send_email_otp(
        self,
        email: str,
        code: str,
        purpose: str,
        name: str,
        company: str
    ) -> Dict[str, Any]:
        """Envoie l'OTP par email"""
        
        subject = f"[{company}] Code de vérification: {code}"
        
        body = f"""Bonjour {name},

Votre code de vérification pour {purpose} est:

    {code}

Ce code expire dans {OTP_VALIDITY_MINUTES} minutes.

Si vous n'avez pas demandé ce code, ignorez ce message.

Cordialement,
{company}"""

        html = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }}
        .container {{ max-width: 480px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }}
        .header {{ background: linear-gradient(135deg, #2563eb, #1d4ed8); color: white; padding: 24px; text-align: center; }}
        .header h1 {{ margin: 0; font-size: 20px; }}
        .content {{ padding: 32px 24px; text-align: center; }}
        .code-box {{ background: #f8fafc; border: 2px dashed #e2e8f0; border-radius: 12px; padding: 24px; margin: 24px 0; }}
        .code {{ font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #1e293b; font-family: monospace; }}
        .info {{ color: #64748b; font-size: 14px; margin-top: 16px; }}
        .footer {{ background: #f8fafc; padding: 16px 24px; text-align: center; color: #94a3b8; font-size: 12px; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>{company}</h1>
        </div>
        <div class="content">
            <p>Bonjour <strong>{name}</strong>,</p>
            <p>Votre code de vérification pour <strong>{purpose}</strong> est:</p>
            <div class="code-box">
                <div class="code">{code}</div>
            </div>
            <p class="info">Ce code expire dans {OTP_VALIDITY_MINUTES} minutes.<br>Si vous n'avez pas demandé ce code, ignorez ce message.</p>
        </div>
        <div class="footer">
            &copy; {company} - Ne partagez jamais ce code
        </div>
    </div>
</body>
</html>"""

        # Essayer le service de notification configuré
        if self.notification_service.email_service:
            return self.notification_service.send_email(email, subject, body, html)
        
        # Fallback SMTP simple avec Gmail
        return self._send_smtp_fallback(email, subject, html, name, company, purpose)
    
    def _send_smtp_fallback(
        self,
        email: str,
        subject: str,
        html: str,
        name: str,
        company: str,
        purpose: str
    ) -> Dict[str, Any]:
        """Fallback SMTP simple pour les tests"""
        import smtplib
        from email.mime.text import MIMEText
        from email.mime.multipart import MIMEMultipart
        import os
        
        # Configuration SMTP depuis les variables d'environnement
        smtp_host = os.environ.get('SMTP_HOST', 'smtp.gmail.com')
        smtp_port = int(os.environ.get('SMTP_PORT', '587'))
        smtp_user = os.environ.get('SMTP_USER', '')
        smtp_pass = os.environ.get('SMTP_PASS', '')
        from_email = os.environ.get('SMTP_FROM', smtp_user)
        from_name = os.environ.get('SMTP_FROM_NAME', company)
        
        logger.info(f"SMTP config: host={smtp_host}, port={smtp_port}, user={'***' if smtp_user else 'EMPTY'}")
        
        if not smtp_user or not smtp_pass:
            # Mode développement - log le code
            import re
            code_match = re.search(r'<div class="code">(\d+)</div>', html)
            code = code_match.group(1) if code_match else 'UNKNOWN'
            logger.warning(f"[DEV MODE] OTP for {email}: {code}")
            return {
                'success': True,
                'dev_mode': True,
                'message': f'Code OTP (dev): {code}'
            }
        
        try:
            logger.info(f"Sending OTP via SMTP to {email}")
            
            # Créer le message
            msg = MIMEMultipart('alternative')
            msg['Subject'] = subject
            msg['From'] = f"{from_name} <{from_email}>"
            msg['To'] = email
            
            # Ajouter le contenu HTML
            html_part = MIMEText(html, 'html', 'utf-8')
            msg.attach(html_part)
            
            # Envoyer via SMTP
            with smtplib.SMTP(smtp_host, smtp_port) as server:
                server.starttls()
                server.login(smtp_user, smtp_pass)
                server.send_message(msg)
            
            logger.info(f"OTP email sent successfully to {email}")
            return {'success': True}
            
        except Exception as e:
            logger.error(f"SMTP fallback error: {e}")
            return {'success': False, 'error': str(e)}
    
    def _send_sms_otp(
        self,
        phone: str,
        code: str,
        purpose: str,
        company: str
    ) -> Dict[str, Any]:
        """Envoie l'OTP par SMS"""
        message = f"[{company}] Code {purpose}: {code}. Valide {OTP_VALIDITY_MINUTES} min."
        return self.notification_service.send_sms(phone, message)
    
    def _send_whatsapp_otp(
        self,
        phone: str,
        code: str,
        purpose: str,
        name: str,
        company: str
    ) -> Dict[str, Any]:
        """Envoie l'OTP par WhatsApp"""
        message = f"""🔐 *Code de vérification*

Bonjour {name},

Votre code pour {purpose}:

*{code}*

⏱️ Valide {OTP_VALIDITY_MINUTES} minutes

_{company}_"""
        return self.notification_service.send_whatsapp(phone, message)
    
    def verify_otp(self, user_id: str, purpose: str, code: str) -> Dict[str, Any]:
        """
        Vérifie un code OTP
        
        Args:
            user_id: ID de l'utilisateur
            purpose: But de l'OTP
            code: Code à vérifier
        
        Returns:
            dict: Résultat de la vérification
        """
        from app.models import OTPCode
        
        code_hash = self._hash_otp(code, user_id, purpose)
        
        otp_record = OTPCode.query.filter_by(
            tenant_id=self.tenant_id,
            user_id=user_id,
            purpose=purpose,
            is_used=False
        ).order_by(OTPCode.created_at.desc()).first()
        
        if not otp_record:
            return {
                'success': False,
                'error': 'Code invalide ou expiré'
            }
        
        # Vérifier expiration
        if datetime.utcnow() > otp_record.expires_at:
            otp_record.is_used = True
            db.session.commit()
            return {
                'success': False,
                'error': 'Code expiré'
            }
        
        # Vérifier tentatives
        if otp_record.attempts >= MAX_ATTEMPTS:
            otp_record.is_used = True
            db.session.commit()
            return {
                'success': False,
                'error': 'Trop de tentatives. Demandez un nouveau code.'
            }
        
        # Vérifier le code
        if otp_record.code_hash != code_hash:
            otp_record.attempts += 1
            db.session.commit()
            remaining = MAX_ATTEMPTS - otp_record.attempts
            return {
                'success': False,
                'error': f'Code incorrect. {remaining} tentative(s) restante(s).'
            }
        
        # Code valide
        otp_record.is_used = True
        otp_record.verified_at = datetime.utcnow()
        db.session.commit()
        
        logger.info(f"OTP verified for user {user_id}, purpose: {purpose}")
        
        return {
            'success': True,
            'message': 'Code vérifié avec succès'
        }
    
    def _mask_email(self, email: str) -> str:
        """Masque un email: j***@g***.com"""
        if not email or '@' not in email:
            return '***'
        local, domain = email.split('@')
        domain_parts = domain.split('.')
        masked_local = local[0] + '***' if len(local) > 1 else '***'
        masked_domain = domain_parts[0][0] + '***' if len(domain_parts[0]) > 1 else '***'
        return f"{masked_local}@{masked_domain}.{domain_parts[-1]}"
    
    def _mask_phone(self, phone: str) -> str:
        """Masque un téléphone: +237 6** *** **89"""
        if not phone:
            return '***'
        digits = ''.join(c for c in phone if c.isdigit())
        if len(digits) < 4:
            return '***'
        return f"+*** *** **{digits[-2:]}"
    
    def _mask_destination(self, channel: str, destination: str) -> str:
        """Masque la destination selon le canal"""
        if channel == 'email':
            return self._mask_email(destination)
        return self._mask_phone(destination)
