"""
Routes Super-Admin - Gestion des Providers de Paiement
======================================================

Configuration des providers (Stripe, Flutterwave, CinetPay, Monetbil).
"""

from flask import request, jsonify, g
from app.routes.superadmin import superadmin_bp
from app.routes.superadmin.auth import superadmin_required, superadmin_permission_required
from app.models import PlatformPaymentProvider
from app.services.payment_gateway_service import payment_gateway
from app import db
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


# Templates des providers supportés
PROVIDER_TEMPLATES = {
    'orange_money': {
        'name': 'Orange Money',
        'description': 'Paiements via Orange Money. Disponible au Cameroun, Côte d\'Ivoire, Sénégal, Mali, etc.',
        'supported_methods': ['mobile_money'],
        'supported_countries': ['CM', 'CI', 'SN', 'ML', 'BF', 'MG', 'GN', 'NE'],
        'supported_currencies': ['XAF', 'XOF'],
        'credentials_schema': {
            'merchant_key': {'label': 'Clé marchand', 'type': 'text', 'required': True},
            'api_user': {'label': 'Utilisateur API', 'type': 'text', 'required': True},
            'api_key': {'label': 'Clé API', 'type': 'password', 'required': True},
            'pin': {'label': 'Code PIN', 'type': 'password', 'required': False}
        },
        'config_schema': {
            'default_currency': {'label': 'Devise par défaut', 'type': 'select', 'options': ['XAF', 'XOF']},
            'environment': {'label': 'Environnement', 'type': 'select', 'options': ['sandbox', 'production']}
        },
        'docs_url': 'https://developer.orange.com/apis/om-webpay'
    },
    'mtn_momo': {
        'name': 'MTN Mobile Money',
        'description': 'Paiements via MTN MoMo. Disponible au Cameroun, Côte d\'Ivoire, Ghana, Uganda, etc.',
        'supported_methods': ['mobile_money'],
        'supported_countries': ['CM', 'CI', 'GH', 'UG', 'RW', 'BJ', 'CG', 'SZ'],
        'supported_currencies': ['XAF', 'XOF', 'GHS', 'UGX', 'RWF'],
        'credentials_schema': {
            'subscription_key': {'label': 'Clé d\'abonnement (Ocp-Apim-Subscription-Key)', 'type': 'password', 'required': True},
            'api_user': {'label': 'Utilisateur API (X-Reference-Id)', 'type': 'text', 'required': True},
            'api_key': {'label': 'Clé API', 'type': 'password', 'required': True},
            'callback_url': {'label': 'URL de callback', 'type': 'text', 'required': False}
        },
        'config_schema': {
            'default_currency': {'label': 'Devise par défaut', 'type': 'select', 'options': ['XAF', 'XOF']},
            'environment': {'label': 'Environnement', 'type': 'select', 'options': ['sandbox', 'production']},
            'target_environment': {'label': 'Environnement cible MTN', 'type': 'text'}
        },
        'docs_url': 'https://momodeveloper.mtn.com/api-documentation'
    },
    'stripe': {
        'name': 'Stripe',
        'description': 'Paiements par carte internationaux. Idéal pour les cartes Visa/Mastercard.',
        'supported_methods': ['card'],
        'supported_countries': ['*'],  # International
        'supported_currencies': ['EUR', 'USD', 'GBP', 'XAF', 'XOF'],
        'credentials_schema': {
            'secret_key': {'label': 'Clé secrète (sk_...)', 'type': 'password', 'required': True},
            'publishable_key': {'label': 'Clé publique (pk_...)', 'type': 'text', 'required': True},
            'webhook_secret': {'label': 'Secret webhook (whsec_...)', 'type': 'password', 'required': False}
        },
        'config_schema': {
            'default_currency': {'label': 'Devise par défaut', 'type': 'select', 'options': ['EUR', 'USD', 'XAF']}
        },
        'docs_url': 'https://stripe.com/docs/api'
    },
    'flutterwave': {
        'name': 'Flutterwave',
        'description': 'Paiements Mobile Money et cartes en Afrique. Supporte MTN, Orange Money, etc.',
        'supported_methods': ['card', 'mobile_money', 'bank_transfer'],
        'supported_countries': ['CM', 'CI', 'SN', 'GH', 'NG', 'KE', 'TZ', 'UG', 'RW', 'ZA'],
        'supported_currencies': ['XAF', 'XOF', 'NGN', 'GHS', 'KES', 'TZS', 'UGX', 'RWF', 'ZAR', 'USD'],
        'credentials_schema': {
            'secret_key': {'label': 'Clé secrète', 'type': 'password', 'required': True},
            'public_key': {'label': 'Clé publique', 'type': 'text', 'required': True},
            'encryption_key': {'label': 'Clé de chiffrement', 'type': 'password', 'required': False},
            'webhook_secret': {'label': 'Secret webhook', 'type': 'password', 'required': False}
        },
        'config_schema': {
            'default_currency': {'label': 'Devise par défaut', 'type': 'select', 'options': ['XAF', 'XOF', 'NGN']},
            'logo_url': {'label': 'URL du logo', 'type': 'text'}
        },
        'docs_url': 'https://developer.flutterwave.com/docs'
    },
    'cinetpay': {
        'name': 'CinetPay',
        'description': 'Paiements Mobile Money en Afrique francophone. MTN, Orange, Moov.',
        'supported_methods': ['mobile_money', 'card'],
        'supported_countries': ['CM', 'CI', 'SN', 'BF', 'ML', 'BJ', 'TG', 'NE', 'CD', 'CG'],
        'supported_currencies': ['XAF', 'XOF', 'CDF'],
        'credentials_schema': {
            'api_key': {'label': 'Clé API', 'type': 'password', 'required': True},
            'site_id': {'label': 'ID du site', 'type': 'text', 'required': True},
            'secret_key': {'label': 'Clé secrète (IPN)', 'type': 'password', 'required': False}
        },
        'config_schema': {
            'default_currency': {'label': 'Devise par défaut', 'type': 'select', 'options': ['XAF', 'XOF']}
        },
        'docs_url': 'https://docs.cinetpay.com/'
    },
    'monetbil': {
        'name': 'Monetbil',
        'description': 'Paiements Mobile Money en Afrique. MTN, Orange, Nexttel, Express Union.',
        'supported_methods': ['mobile_money'],
        'supported_countries': ['CM', 'CI', 'SN', 'BF', 'ML', 'BJ', 'TG', 'NE', 'CD', 'CG', 'GA'],
        'supported_currencies': ['XAF', 'XOF'],
        'credentials_schema': {
            'service_key': {'label': 'Clé de service', 'type': 'text', 'required': True},
            'service_secret': {'label': 'Secret de service', 'type': 'password', 'required': True}
        },
        'config_schema': {
            'default_currency': {'label': 'Devise par défaut', 'type': 'select', 'options': ['XAF', 'XOF']}
        },
        'docs_url': 'https://www.monetbil.com/developer'
    }
}


@superadmin_bp.route('/payment-providers', methods=['GET'])
@superadmin_permission_required('payments.read')
def list_payment_providers():
    """Liste tous les providers de paiement configurés"""
    providers = PlatformPaymentProvider.query.order_by(
        PlatformPaymentProvider.display_order
    ).all()
    
    result = []
    for p in providers:
        data = p.to_dict(include_credentials=True)
        # Ajouter le template
        if p.provider_code in PROVIDER_TEMPLATES:
            data['template'] = PROVIDER_TEMPLATES[p.provider_code]
        result.append(data)
    
    return jsonify(result)


@superadmin_bp.route('/payment-providers/templates', methods=['GET'])
@superadmin_permission_required('payments.read')
def get_provider_templates():
    """Retourne les templates des providers disponibles"""
    return jsonify(PROVIDER_TEMPLATES)


@superadmin_bp.route('/payment-providers/<provider_code>', methods=['GET'])
@superadmin_permission_required('payments.read')
def get_payment_provider(provider_code):
    """Détail d'un provider"""
    provider = PlatformPaymentProvider.query.filter_by(provider_code=provider_code).first()
    
    if not provider:
        # Retourner le template si le provider n'est pas encore configuré
        if provider_code in PROVIDER_TEMPLATES:
            return jsonify({
                'configured': False,
                'template': PROVIDER_TEMPLATES[provider_code]
            })
        return jsonify({'error': 'Provider inconnu'}), 404
    
    data = provider.to_dict(include_credentials=True)
    data['configured'] = True
    if provider_code in PROVIDER_TEMPLATES:
        data['template'] = PROVIDER_TEMPLATES[provider_code]
    
    return jsonify(data)


@superadmin_bp.route('/payment-providers/<provider_code>', methods=['PUT'])
@superadmin_permission_required('payments.write')
def configure_payment_provider(provider_code):
    """
    Configure ou met à jour un provider de paiement
    
    Body:
        - credentials: Object avec les clés API
        - config: Configuration spécifique
        - is_enabled: Activer/désactiver
        - is_test_mode: Mode test/production
    """
    if provider_code not in PROVIDER_TEMPLATES:
        return jsonify({'error': 'Provider non supporté'}), 400
    
    data = request.get_json()
    template = PROVIDER_TEMPLATES[provider_code]
    
    # Récupérer ou créer le provider
    provider = PlatformPaymentProvider.query.filter_by(provider_code=provider_code).first()
    
    if not provider:
        provider = PlatformPaymentProvider(
            provider_code=provider_code,
            name=template['name'],
            description=template['description'],
            supported_methods=template['supported_methods'],
            supported_countries=template['supported_countries'],
            supported_currencies=template['supported_currencies']
        )
        db.session.add(provider)
    
    # Mettre à jour les credentials
    if 'credentials' in data:
        # Valider les credentials requis
        for key, schema in template['credentials_schema'].items():
            if schema.get('required') and not data['credentials'].get(key):
                return jsonify({'error': f'Credential requis: {key}'}), 400
        
        provider.credentials = data['credentials']
    
    # Mettre à jour la config
    if 'config' in data:
        provider.config = data['config']
    
    # Statut
    if 'is_enabled' in data:
        provider.is_enabled = data['is_enabled']
    if 'is_test_mode' in data:
        provider.is_test_mode = data['is_test_mode']
    if 'display_order' in data:
        provider.display_order = data['display_order']
    if 'webhook_url' in data:
        provider.webhook_url = data['webhook_url']
    
    db.session.commit()
    
    logger.info(f"Payment provider configured: {provider_code} by {g.superadmin.email}")
    
    return jsonify(provider.to_dict(include_credentials=True))


@superadmin_bp.route('/payment-providers/<provider_code>/toggle', methods=['POST'])
@superadmin_permission_required('payments.write')
def toggle_payment_provider(provider_code):
    """Active ou désactive un provider"""
    provider = PlatformPaymentProvider.query.filter_by(provider_code=provider_code).first_or_404()
    
    # Vérifier que les credentials sont configurés avant d'activer
    if not provider.is_enabled and not provider.credentials:
        return jsonify({'error': 'Configurez les credentials avant d\'activer'}), 400
    
    provider.is_enabled = not provider.is_enabled
    db.session.commit()
    
    status = 'activé' if provider.is_enabled else 'désactivé'
    logger.info(f"Payment provider {status}: {provider_code} by {g.superadmin.email}")
    
    return jsonify({
        'message': f'Provider {status}',
        'is_enabled': provider.is_enabled
    })


@superadmin_bp.route('/payment-providers/<provider_code>/test', methods=['POST'])
@superadmin_permission_required('payments.write')
def test_payment_provider(provider_code):
    """
    Teste la connexion à un provider
    
    Body:
        - amount: Montant de test (défaut: 100)
        - currency: Devise de test
    """
    provider = PlatformPaymentProvider.query.filter_by(provider_code=provider_code).first_or_404()
    
    if not provider.credentials:
        return jsonify({'error': 'Credentials non configurés'}), 400
    
    data = request.get_json() or {}
    amount = data.get('amount', 100)
    currency = data.get('currency', 'XAF')
    
    # Forcer le mode test temporairement
    original_test_mode = provider.is_test_mode
    provider.is_test_mode = True
    db.session.commit()
    
    try:
        result = payment_gateway.initialize_payment(
            provider=provider_code,
            amount=amount,
            currency=currency,
            customer_email='test@example.com',
            customer_name='Test User',
            description='Test de connexion',
            metadata={'test': True}
        )
        
        # Restaurer le mode
        provider.is_test_mode = original_test_mode
        db.session.commit()
        
        if result.get('success'):
            return jsonify({
                'success': True,
                'message': 'Connexion réussie',
                'payment_url': result.get('payment_url'),
                'payment_id': result.get('payment_id')
            })
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Erreur inconnue')
            }), 400
            
    except Exception as e:
        provider.is_test_mode = original_test_mode
        db.session.commit()
        
        logger.exception(f"Provider test failed: {provider_code}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@superadmin_bp.route('/payment-providers/<provider_code>/stats', methods=['GET'])
@superadmin_permission_required('payments.read')
def get_provider_stats(provider_code):
    """Statistiques d'un provider"""
    from app.models import SubscriptionPayment
    from sqlalchemy import func
    
    provider = PlatformPaymentProvider.query.filter_by(provider_code=provider_code).first_or_404()
    
    # Stats depuis la DB
    stats = db.session.query(
        func.count(SubscriptionPayment.id).label('count'),
        func.sum(SubscriptionPayment.amount).label('total')
    ).filter(
        SubscriptionPayment.provider == provider_code,
        SubscriptionPayment.status == 'completed'
    ).first()
    
    # Stats par mois (12 derniers mois)
    from datetime import datetime, timedelta
    monthly_stats = []
    for i in range(12):
        month_start = (datetime.utcnow().replace(day=1) - timedelta(days=30*i)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        month_end = (month_start + timedelta(days=32)).replace(day=1)
        
        month_data = db.session.query(
            func.count(SubscriptionPayment.id).label('count'),
            func.sum(SubscriptionPayment.amount).label('total')
        ).filter(
            SubscriptionPayment.provider == provider_code,
            SubscriptionPayment.status == 'completed',
            SubscriptionPayment.created_at >= month_start,
            SubscriptionPayment.created_at < month_end
        ).first()
        
        monthly_stats.append({
            'month': month_start.strftime('%Y-%m'),
            'count': month_data.count or 0,
            'total': float(month_data.total or 0)
        })
    
    return jsonify({
        'provider': provider.to_dict(),
        'total_transactions': stats.count or 0,
        'total_amount': float(stats.total or 0),
        'monthly': list(reversed(monthly_stats))
    })


@superadmin_bp.route('/payment-providers/enabled', methods=['GET'])
def get_enabled_providers_public():
    """
    Liste publique des providers activés (pour le frontend de paiement)
    Ne nécessite pas d'authentification super-admin
    """
    providers = PlatformPaymentProvider.query.filter_by(is_enabled=True).order_by(
        PlatformPaymentProvider.display_order
    ).all()
    
    return jsonify([{
        'code': p.provider_code,
        'name': p.name,
        'methods': p.supported_methods,
        'currencies': p.supported_currencies
    } for p in providers])
