"""
Configuration Express Cargo Backend
===================================

Variables d'environnement supportées:
-------------------------------------
FLASK_ENV           : development | production | testing (défaut: development)
SECRET_KEY          : Clé secrète Flask (OBLIGATOIRE en production)
JWT_SECRET_KEY      : Clé secrète JWT (OBLIGATOIRE en production)
DATABASE_URL        : URL PostgreSQL (OBLIGATOIRE en production)
                      Format: postgresql://user:password@host:port/dbname

CORS_ORIGINS        : Origines autorisées, séparées par virgule
                      Ex: https://client.expresscargo.com,https://admin.expresscargo.com
CORS_ALLOW_ALL      : "true" pour autoriser toutes les origines (dev uniquement!)

JWT_ACCESS_HOURS    : Durée du token d'accès en heures (défaut: 24)
JWT_REFRESH_DAYS    : Durée du refresh token en jours (défaut: 30)

UPLOAD_FOLDER       : Dossier pour les uploads (défaut: uploads)
MAX_UPLOAD_MB       : Taille max upload en MB (défaut: 16)

REDIS_URL           : URL Redis pour le cache/sessions/rate limiting (optionnel)
                      Format: redis://host:port/db

LOG_LEVEL           : Niveau de log (DEBUG, INFO, WARNING, ERROR)

ENCRYPTION_KEY      : Clé de chiffrement pour les credentials (OBLIGATOIRE en production)
                      Générer avec: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

CLOUDINARY_CLOUD_NAME : Nom du cloud Cloudinary (optionnel, peut être par tenant)
CLOUDINARY_API_KEY    : Clé API Cloudinary
CLOUDINARY_API_SECRET : Secret API Cloudinary

SENTRY_DSN          : DSN Sentry pour le monitoring (optionnel)

CELERY_BROKER_URL   : URL du broker Celery (Redis recommandé)
"""

import os
from datetime import timedelta
from flask import request

def get_rate_limit_key():
    """
    Retourne la clé pour le rate limiting.
    - 'preflight' pour les requêtes OPTIONS (CORS preflight) pour les exempter
    - IP de l'utilisateur sinon
    """
    if request.method == 'OPTIONS':
        return 'preflight'
    return request.remote_addr

def get_cors_origins():
    """Parse les origines CORS depuis les variables d'environnement"""
    if os.environ.get('CORS_ALLOW_ALL', '').lower() == 'true':
        return '*'
    
    origins = os.environ.get('CORS_ORIGINS', '')
    if origins:
        return [o.strip() for o in origins.split(',') if o.strip()]
    
    # Défaut: localhost pour le dev + GitHub Pages pour la prod
    defaults = [
        'http://localhost:3000',
        'http://localhost:5000',
        'http://localhost:8080',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:5500',
        'http://127.0.0.1:8080',
        'http://127.0.0.1:4000',
        'http://localhost:4000',
        'capacitor://localhost',
        'ionic://localhost',
        'http://localhost',
        # GitHub Pages (production frontends)
        'https://logisclient.bomils.com',
        'https://logisadmin.bomils.com',
        'https://logissuperadmin.bomils.com',
        'https://bomilslt.github.io',
    ]
    return defaults


class Config:
    """Configuration de base"""
    # Sécurité
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-secret-key-change-in-production'
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY') or 'jwt-secret-key-change-in-production'
    
    # CSRF Protection
    CSRF_ENABLED = os.environ.get('CSRF_ENABLED', 'true').lower() == 'true'
    
    # JWT Tokens
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=int(os.environ.get('JWT_ACCESS_HOURS', 24)))
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=int(os.environ.get('JWT_REFRESH_DAYS', 30)))
    JWT_TOKEN_LOCATION = ['cookies', 'headers']
    JWT_HEADER_NAME = 'Authorization'
    JWT_HEADER_TYPE = 'Bearer'
    JWT_ACCESS_COOKIE_NAME = 'access_token'
    JWT_REFRESH_COOKIE_NAME = 'refresh_token'
    JWT_COOKIE_SECURE = False  # False pour localhost (HTTP)
    JWT_COOKIE_SAMESITE = 'Lax'  # Lax pour localhost (pas None!)
    JWT_COOKIE_CSRF_PROTECT = False  # Désactiver CSRF pour SameSite=Lax
    JWT_COOKIE_DOMAIN = None  # Auto pour localhost
    
    # Base de données
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_pre_ping': True,  # Vérifie la connexion avant utilisation
        'pool_recycle': 300,    # Recycle les connexions après 5 min
    }
    
    # CORS
    CORS_ORIGINS = get_cors_origins()
    CORS_SUPPORTS_CREDENTIALS = True
    CORS_ALLOW_HEADERS = ['Content-Type', 'Authorization', 'X-Tenant-ID', 'X-CSRF-Token', 'X-App-Type', 'X-App-Channel']
    CORS_EXPOSE_HEADERS = ['Content-Disposition']
    
    # Pagination
    ITEMS_PER_PAGE = 20
    
    # Upload
    MAX_CONTENT_LENGTH = int(os.environ.get('MAX_UPLOAD_MB', 16)) * 1024 * 1024
    UPLOAD_FOLDER = os.environ.get('UPLOAD_FOLDER', 'uploads')
    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'pdf', 'doc', 'docx'}
    
    # Redis (optionnel)
    REDIS_URL = os.environ.get('REDIS_URL')
    
    # Logging
    LOG_LEVEL = os.environ.get('LOG_LEVEL', 'DEBUG')  # Changer à DEBUG pour diagnostiquer


class DevelopmentConfig(Config):
    """Configuration développement"""
    DEBUG = True
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or 'sqlite:///logistics.db'
    
    # En dev, on peut être plus permissif sur CORS
    CORS_ORIGINS = get_cors_origins()


class ProductionConfig(Config):
    """Configuration production"""
    DEBUG = False
    
    # CSRF obligatoire en production
    CSRF_ENABLED = True
    
    # En production, DATABASE_URL est OBLIGATOIRE
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL')
    
    # Pool de connexions plus grand en production
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_pre_ping': True,
        'pool_recycle': 300,
        'pool_size': 10,
        'max_overflow': 20,
    }
    
    # CORS strict en production
    CORS_ORIGINS = get_cors_origins()
    
    # Vérifications de sécurité
    @classmethod
    def init_app(cls, app):
        """Vérifications au démarrage en production"""
        errors = []
        
        if not os.environ.get('DATABASE_URL'):
            errors.append('DATABASE_URL must be set in production')
        
        secret_key = os.environ.get('SECRET_KEY', '')
        if not secret_key or secret_key == 'dev-secret-key-change-in-production':
            errors.append('SECRET_KEY must be set to a secure value in production')
        
        jwt_secret = os.environ.get('JWT_SECRET_KEY', '')
        if not jwt_secret or jwt_secret == 'jwt-secret-key-change-in-production':
            errors.append('JWT_SECRET_KEY must be set to a secure value in production')
        
        # Vérifier la longueur minimale des secrets
        if secret_key and len(secret_key) < 32:
            errors.append('SECRET_KEY should be at least 32 characters')
        
        if jwt_secret and len(jwt_secret) < 32:
            errors.append('JWT_SECRET_KEY should be at least 32 characters')
        
        # Vérifier ENCRYPTION_KEY
        encryption_key = os.environ.get('ENCRYPTION_KEY', '')
        if not encryption_key:
            errors.append('ENCRYPTION_KEY must be set in production (generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")')
        
        # Vérifier que CORS n'est pas en wildcard
        cors_origins = os.environ.get('CORS_ORIGINS', '')
        if os.environ.get('CORS_ALLOW_ALL', '').lower() == 'true':
            errors.append('CORS_ALLOW_ALL must not be true in production')
        
        # Cookies JWT en production (cross-origin: SameSite=None + Secure)
        cls.JWT_COOKIE_SECURE = True
        cls.JWT_COOKIE_SAMESITE = 'None'

        if errors:
            raise ValueError('Production configuration errors:\n- ' + '\n- '.join(errors))


class TestingConfig(Config):
    """Configuration tests"""
    TESTING = True
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'
    WTF_CSRF_ENABLED = False


config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': DevelopmentConfig
}
