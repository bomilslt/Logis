"""
Service Enforcement - Vérification des Quotas et Restrictions
=============================================================

Ce service centralise la logique de restriction basée sur le plan d'abonnement actif.
Il est appelé par les routes pour vérifier si une action est autorisée AVANT de l'exécuter.

Les limites principales sont des colonnes typées sur SubscriptionPlan :
- max_packages_monthly : colis créés par mois
- max_staff : utilisateurs staff actifs (admin + staff)
- max_clients : clients actifs

Les limites supplémentaires (max_warehouses, api_access, etc.) restent dans le JSON `limits`.
"""

from app.models import Tenant, Subscription, SubscriptionPlan, Package, User
from app import db
import logging
from datetime import datetime

logger = logging.getLogger(__name__)


class EnforcementService:
    """
    Vérifie les quotas et permissions liés au plan d'abonnement.
    """
    
    # Ressources limitables (colonnes typées)
    RESOURCE_PACKAGES_MONTHLY = 'max_packages_monthly'
    RESOURCE_STAFF = 'max_staff'
    RESOURCE_CLIENTS = 'max_clients'
    # Ressources dans le JSON limits
    RESOURCE_WAREHOUSES = 'max_warehouses'
    
    @classmethod
    def _get_active_plan(cls, tenant_id: str):
        """Récupère le plan actif du tenant."""
        subscription = Subscription.query.filter_by(tenant_id=tenant_id).first()
        if not subscription or not subscription.is_active:
            return None, subscription
        return subscription.plan, subscription
    
    @classmethod
    def check_quota(cls, tenant_id: str, resource: str, requested_amount: int = 1) -> dict:
        """
        Vérifie si le tenant peut consommer la ressource demandée.
        
        Args:
            tenant_id: ID du tenant
            resource: Nom de la ressource (voir constantes)
            requested_amount: Quantité demandée (défaut 1)
            
        Returns:
            dict: {
                'allowed': bool,
                'reason': str (si refusé),
                'limit': int/float,
                'current': int/float
            }
        """
        tenant = Tenant.query.get(tenant_id)
        if not tenant:
            return {'allowed': False, 'reason': 'Tenant introuvable', 'limit': 0, 'current': 0}
        
        plan, subscription = cls._get_active_plan(tenant_id)
        
        if not subscription or not subscription.is_active:
            return {
                'allowed': False, 
                'reason': 'Abonnement inactif ou expiré. Veuillez renouveler.',
                'limit': 0,
                'current': 0
            }
            
        if not plan:
            return {'allowed': False, 'reason': 'Plan invalide', 'limit': 0, 'current': 0}
             
        # Récupérer la limite selon la ressource
        if resource == cls.RESOURCE_PACKAGES_MONTHLY:
            limit = plan.max_packages_monthly
        elif resource == cls.RESOURCE_STAFF:
            limit = plan.max_staff
        elif resource == cls.RESOURCE_CLIENTS:
            limit = plan.max_clients
        else:
            # Fallback vers le JSON limits pour les autres ressources
            limit = plan.get_limit(resource, default=0)
        
        # -1 signifie Illimité
        if limit is None:
            limit = 0
        if limit == -1:
            return {'allowed': True, 'limit': -1, 'current': 0}
            
        current_usage = cls._get_current_usage(tenant_id, resource)
        
        # Vérification
        if current_usage + requested_amount > limit:
            labels = {
                cls.RESOURCE_PACKAGES_MONTHLY: 'colis ce mois',
                cls.RESOURCE_STAFF: 'utilisateurs staff',
                cls.RESOURCE_CLIENTS: 'clients',
                cls.RESOURCE_WAREHOUSES: 'entrepôts'
            }
            label = labels.get(resource, resource)
            return {
                'allowed': False,
                'reason': f'Limite atteinte ({current_usage}/{limit} {label}). Mettez à niveau votre plan.',
                'limit': limit,
                'current': current_usage
            }
            
        return {
            'allowed': True,
            'limit': limit,
            'current': current_usage
        }
    
    @classmethod
    def _get_current_usage(cls, tenant_id: str, resource: str) -> int:
        """Calcule l'usage actuel pour une ressource donnée."""
        if resource == cls.RESOURCE_PACKAGES_MONTHLY:
            now = datetime.utcnow()
            start_of_month = datetime(now.year, now.month, 1)
            return Package.query.filter(
                Package.tenant_id == tenant_id,
                Package.created_at >= start_of_month
            ).count()
            
        elif resource == cls.RESOURCE_STAFF:
            return User.query.filter(
                User.tenant_id == tenant_id,
                User.role.in_(['admin', 'staff']),
                User.is_active == True
            ).count()
            
        elif resource == cls.RESOURCE_CLIENTS:
            return User.query.filter(
                User.tenant_id == tenant_id,
                User.role == 'client',
                User.is_active == True
            ).count()
            
        elif resource == cls.RESOURCE_WAREHOUSES:
            from app.models.config import Warehouse
            return Warehouse.query.filter_by(tenant_id=tenant_id).count()
        
        return 0

    @classmethod
    def check_feature(cls, tenant_id: str, feature_code: str) -> dict:
        """
        Vérifie si une fonctionnalité spécifique est incluse dans le plan.
        Regarde dans le JSON `limits` pour les booléens (ex: api_access, custom_domain, online_payments).
        
        Returns:
            dict: {'allowed': bool, 'reason': str (si refusé)}
        """
        plan, subscription = cls._get_active_plan(tenant_id)
        
        if not subscription or not subscription.is_active:
            return {'allowed': False, 'reason': 'Abonnement inactif ou expiré.'}
        
        if not plan:
            return {'allowed': False, 'reason': 'Plan invalide.'}
        
        limit_val = plan.get_limit(feature_code)
        if isinstance(limit_val, bool) and limit_val:
            return {'allowed': True}
            
        return {'allowed': False, 'reason': f'Fonctionnalité "{feature_code}" non incluse dans votre plan.'}
