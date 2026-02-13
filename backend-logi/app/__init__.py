"""
Application Flask - Express Cargo Backend
API REST pour la gestion de colis et logistique
"""

from flask import Flask, request
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_jwt_extended import JWTManager
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from config import config
import logging
import os

db = SQLAlchemy()
jwt = JWTManager()
migrate = Migrate()

def get_rate_limit_key():
    """
    Retourne la clé pour le rate limiting.
    - None pour les requêtes OPTIONS (CORS preflight) pour les exempter
    - IP de l'utilisateur sinon
    """
    if request.method == 'OPTIONS':
        return 'preflight'
    
    # Essayer d'obtenir l'IP réelle
    ip = get_remote_address()
    if not ip:
        # Fallback si l'IP n'est pas détectée
        ip = request.headers.get('X-Forwarded-For', request.headers.get('X-Real-IP', '127.0.0.1'))
        if ',' in ip:
            ip = ip.split(',')[0].strip()
    
    return ip or '127.0.0.1'

limiter = Limiter(
    key_func=get_rate_limit_key,
    default_limits=["500 per day", "100 per hour"],
    storage_uri=os.environ.get('REDIS_URL', 'memory://')
)

# Configuration logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def create_app(config_name='default'):
    """
    Factory function pour créer l'application Flask
    
    Args:
        config_name: Nom de la configuration (development, production, testing)
    
    Returns:
        Flask app configurée
    """
    app = Flask(__name__)
    app.config.from_object(config[config_name])
    
    # Vérifications de sécurité en production
    if config_name == 'production':
        config[config_name].init_app(app)
    
    # Initialisation des extensions
    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    limiter.init_app(app)
    
    # CORS - Utiliser les origines configurées (PAS de wildcard en prod!)
    cors_origins = app.config.get('CORS_ORIGINS', ['http://localhost:3000'])
    CORS(app, resources={
        r"/api/*": {
            "origins": cors_origins,
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            "allow_headers": app.config.get('CORS_ALLOW_HEADERS', ["Content-Type", "Authorization", "X-Tenant-ID"]),
            "expose_headers": app.config.get('CORS_EXPOSE_HEADERS', ["Content-Disposition"]),
            "supports_credentials": app.config.get('CORS_SUPPORTS_CREDENTIALS', True)
        }
    })
    
    # Headers de sécurité
    @app.after_request
    def add_security_headers(response):
        # HSTS - Force HTTPS (seulement en production)
        if config_name == 'production':
            response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
        
        # Autres headers de sécurité
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['X-XSS-Protection'] = '1; mode=block'
        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        
        return response
    
    # ==================== BLUEPRINTS ====================
    
    # Routes d'authentification
    from app.routes.auth import auth_bp
    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    
    # Routes colis (client)
    from app.routes.packages import packages_bp
    app.register_blueprint(packages_bp, url_prefix='/api/packages')
    
    # Routes clients (profil)
    from app.routes.clients import clients_bp
    app.register_blueprint(clients_bp, url_prefix='/api/clients')
    
    # Routes notifications (client)
    from app.routes.notifications import notifications_bp
    app.register_blueprint(notifications_bp, url_prefix='/api/notifications')
    
    # Routes templates (client)
    from app.routes.templates import templates_bp
    app.register_blueprint(templates_bp, url_prefix='/api/templates')
    
    # Routes configuration publique (tarifs, etc.)
    from app.routes.config import config_bp
    app.register_blueprint(config_bp, url_prefix='/api/config')
    
    # Routes admin (tenant-web)
    from app.routes.admin import admin_bp
    app.register_blueprint(admin_bp, url_prefix='/api/admin')
    
    # Routes uploads (Cloudinary)
    from app.routes.uploads import uploads_bp
    app.register_blueprint(uploads_bp, url_prefix='/api/uploads')
    
    # Routes webhooks (fournisseurs externes - tracking)
    from app.routes.webhooks import webhooks_bp
    app.register_blueprint(webhooks_bp, url_prefix='/api/webhooks')
    
    # Routes webhooks paiement abonnement
    from app.routes.subscription_webhooks import subscription_webhooks_bp
    app.register_blueprint(subscription_webhooks_bp, url_prefix='/api/webhooks/subscription')

    # Routes subscription (client)
    from app.routes.subscription import subscription_bp
    app.register_blueprint(subscription_bp, url_prefix='/api/subscription')
    
    # Routes paiements en ligne (client)
    from app.routes.client_payments import client_payments_bp
    app.register_blueprint(client_payments_bp, url_prefix='/api/payments')
    
    # Routes devices (gestion des appareils)
    from app.routes.devices import devices_bp
    app.register_blueprint(devices_bp, url_prefix='/api/devices')
    
    # Routes retraits (tenant-web)
    from app.routes.pickups import bp as pickups_bp
    app.register_blueprint(pickups_bp)
    
    # Routes OTP (2FA)
    from app.routes.otp import otp_bp
    app.register_blueprint(otp_bp, url_prefix='/api/auth')
    
    # Routes Support (tenant-side messaging)
    from app.routes.support import support_bp
    app.register_blueprint(support_bp, url_prefix='/api/support')
    
    # Routes Super-Admin (niveau plateforme)
    from app.routes.superadmin import superadmin_bp
    app.register_blueprint(superadmin_bp, url_prefix='/api/superadmin')
    
    # ==================== ERROR HANDLERS ====================
    
    @app.errorhandler(400)
    def bad_request(error):
        return {'error': 'Requête invalide', 'code': 'BAD_REQUEST'}, 400
    
    @app.errorhandler(401)
    def unauthorized(error):
        return {'error': 'Non autorisé', 'code': 'UNAUTHORIZED'}, 401
    
    @app.errorhandler(403)
    def forbidden(error):
        return {'error': 'Accès refusé', 'code': 'FORBIDDEN'}, 403
    
    @app.errorhandler(404)
    def not_found(error):
        return {'error': 'Ressource non trouvée', 'code': 'NOT_FOUND'}, 404
    
    @app.errorhandler(409)
    def conflict(error):
        return {'error': 'Conflit - La ressource existe déjà', 'code': 'CONFLICT'}, 409
    
    @app.errorhandler(422)
    def unprocessable_entity(error):
        return {'error': 'Données non traitables', 'code': 'UNPROCESSABLE_ENTITY'}, 422
    
    @app.errorhandler(429)
    def rate_limit_exceeded(error):
        return {'error': 'Trop de requêtes. Réessayez plus tard.', 'code': 'RATE_LIMITED'}, 429
    
    @app.errorhandler(500)
    def internal_error(error):
        logger.error(f"Erreur interne: {str(error)}")
        return {'error': 'Erreur interne du serveur', 'code': 'INTERNAL_ERROR'}, 500
    
    @app.errorhandler(503)
    def service_unavailable(error):
        return {'error': 'Service temporairement indisponible', 'code': 'SERVICE_UNAVAILABLE'}, 503
    
    # ==================== HEALTH CHECK ====================
    
    @app.route('/api/health')
    def health_check():
        """Endpoint de vérification de santé"""
        return {'status': 'healthy', 'version': '1.0.0'}
    
    # Créer les tables de la base de données (dev uniquement)
    if os.environ.get('AUTO_CREATE_DB', 'false').lower() == 'true':
        with app.app_context():
            db.create_all()
    
    # Seed system permissions (idempotent - ne crée que si manquantes)
    with app.app_context():
        try:
            from app.models.permission import seed_system_permissions
            seed_system_permissions()
        except Exception as e:
            logger.warning(f"Could not seed permissions (table may not exist yet): {e}")
    
    logger.info(f"Application démarrée en mode {config_name}")
    
    return app
