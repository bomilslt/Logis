"""
Utilitaires de chiffrement pour les données sensibles
=====================================================

Utilise Fernet (AES-128-CBC) pour chiffrer les credentials stockés en base.
La clé de chiffrement doit être définie dans ENCRYPTION_KEY.
"""

import os
import base64
import json
import logging
from typing import Any, Optional
from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

logger = logging.getLogger(__name__)

# Clé de chiffrement (doit être définie en variable d'environnement)
_ENCRYPTION_KEY = None


def _get_fernet() -> Optional[Fernet]:
    """Récupère l'instance Fernet avec la clé configurée"""
    global _ENCRYPTION_KEY
    
    if _ENCRYPTION_KEY is None:
        key = os.environ.get('ENCRYPTION_KEY')
        if not key:
            logger.warning("ENCRYPTION_KEY non définie - chiffrement désactivé")
            return None
        
        # Si la clé est un mot de passe, dériver une clé Fernet
        if len(key) != 44:  # Fernet key = 32 bytes base64 = 44 chars
            # Dériver une clé à partir du mot de passe
            salt = os.environ.get('ENCRYPTION_SALT', 'express-cargo-salt').encode()
            kdf = PBKDF2HMAC(
                algorithm=hashes.SHA256(),
                length=32,
                salt=salt,
                iterations=480000,
            )
            _ENCRYPTION_KEY = base64.urlsafe_b64encode(kdf.derive(key.encode()))
        else:
            _ENCRYPTION_KEY = key.encode()
    
    try:
        return Fernet(_ENCRYPTION_KEY)
    except Exception as e:
        logger.error(f"Erreur initialisation Fernet: {e}")
        return None


def encrypt_value(value: str) -> str:
    """
    Chiffre une valeur string
    
    Args:
        value: Valeur à chiffrer
        
    Returns:
        Valeur chiffrée en base64, ou valeur originale si chiffrement désactivé
    """
    if not value:
        return value
    
    fernet = _get_fernet()
    if not fernet:
        return value
    
    try:
        encrypted = fernet.encrypt(value.encode())
        return f"ENC:{encrypted.decode()}"
    except Exception as e:
        logger.error(f"Erreur chiffrement: {e}")
        return value


def decrypt_value(value: str) -> str:
    """
    Déchiffre une valeur
    
    Args:
        value: Valeur chiffrée (préfixée par ENC:)
        
    Returns:
        Valeur déchiffrée, ou valeur originale si non chiffrée
    """
    if not value or not value.startswith("ENC:"):
        return value
    
    fernet = _get_fernet()
    if not fernet:
        logger.warning("Tentative de déchiffrement sans clé configurée")
        return value
    
    try:
        encrypted_data = value[4:]  # Retirer "ENC:"
        decrypted = fernet.decrypt(encrypted_data.encode())
        return decrypted.decode()
    except InvalidToken:
        logger.error("Token de chiffrement invalide - clé incorrecte?")
        return value
    except Exception as e:
        logger.error(f"Erreur déchiffrement: {e}")
        return value


def encrypt_dict(data: dict, sensitive_keys: list[str]) -> dict:
    """
    Chiffre les valeurs sensibles dans un dictionnaire
    
    Args:
        data: Dictionnaire à traiter
        sensitive_keys: Liste des clés à chiffrer (supporte la notation pointée: "smtp.password")
        
    Returns:
        Dictionnaire avec les valeurs sensibles chiffrées
    """
    if not data:
        return data
    
    result = data.copy()
    
    for key in sensitive_keys:
        if '.' in key:
            # Notation pointée: "config.api_key"
            parts = key.split('.')
            current = result
            for part in parts[:-1]:
                if isinstance(current, dict) and part in current:
                    current = current[part]
                else:
                    current = None
                    break
            
            if current and isinstance(current, dict) and parts[-1] in current:
                current[parts[-1]] = encrypt_value(str(current[parts[-1]]))
        else:
            # Clé simple
            if key in result and result[key]:
                result[key] = encrypt_value(str(result[key]))
    
    return result


def decrypt_dict(data: dict, sensitive_keys: list[str]) -> dict:
    """
    Déchiffre les valeurs sensibles dans un dictionnaire
    
    Args:
        data: Dictionnaire à traiter
        sensitive_keys: Liste des clés à déchiffrer
        
    Returns:
        Dictionnaire avec les valeurs sensibles déchiffrées
    """
    if not data:
        return data
    
    result = data.copy()
    
    for key in sensitive_keys:
        if '.' in key:
            parts = key.split('.')
            current = result
            for part in parts[:-1]:
                if isinstance(current, dict) and part in current:
                    current = current[part]
                else:
                    current = None
                    break
            
            if current and isinstance(current, dict) and parts[-1] in current:
                current[parts[-1]] = decrypt_value(str(current[parts[-1]]))
        else:
            if key in result and result[key]:
                result[key] = decrypt_value(str(result[key]))
    
    return result


# Liste des clés sensibles à chiffrer dans les configs
SENSITIVE_CONFIG_KEYS = [
    # SMTP
    'smtp.password',
    'smtp.api_key',
    # SMS providers
    'twilio.auth_token',
    'vonage.api_secret',
    'africastalking.api_key',
    # WhatsApp
    'whatsapp.api_key',
    'whatsapp.access_token',
    # Push
    'firebase.private_key',
    'onesignal.api_key',
    'vapid.private_key',
    # Cloudinary
    'cloudinary.api_secret',
    # Génériques
    'api_key',
    'api_secret',
    'auth_token',
    'access_token',
    'password',
    'secret',
    'private_key',
]


def generate_encryption_key() -> str:
    """
    Génère une nouvelle clé de chiffrement Fernet
    À utiliser pour initialiser ENCRYPTION_KEY
    
    Returns:
        Clé Fernet en base64
    """
    return Fernet.generate_key().decode()
