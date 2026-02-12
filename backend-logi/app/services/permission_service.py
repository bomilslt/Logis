"""
Service de gestion des permissions et mapping routes/permissions
Centralise la configuration et la vérification des permissions
"""

from typing import Dict, List, Set
from flask import request
import logging

logger = logging.getLogger(__name__)


class PermissionService:
    """Service centralisé pour la gestion des permissions"""
    
    # Mapping des routes vers les permissions requises
    ROUTE_PERMISSIONS = {
        # Packages
        'GET /admin/packages': 'packages.read_all',
        'GET /admin/packages/{id}': 'packages.read',
        'POST /admin/packages': 'packages.write',
        'PUT /admin/packages/{id}': 'packages.write',
        'DELETE /admin/packages/{id}': 'packages.delete',
        'GET /admin/packages/stats': 'packages.read',
        'PUT /admin/packages/{id}/status': 'packages.manage_status',
        'PUT /admin/packages/bulk-status': 'packages.manage_status',
        'POST /admin/packages/{id}/carrier': 'packages.write',
        'DELETE /admin/packages/{id}/carrier': 'packages.write',
        'GET /admin/packages/export/pdf': 'packages.read',
        
        # Clients
        'GET /admin/clients': 'clients.read',
        'GET /admin/clients/{id}': 'clients.read',
        'POST /admin/clients': 'clients.write',
        'PUT /admin/clients/{id}': 'clients.write',
        'POST /admin/clients/{id}/toggle-active': 'clients.write',
        'GET /admin/clients/{id}/payments': 'payments.read',
        
        # Payments
        'GET /admin/payments': 'payments.read',
        'POST /admin/payments': 'payments.write',
        'GET /admin/payments/{id}': 'payments.read',
        'POST /admin/payments/{id}/cancel': 'payments.cancel',
        'POST /admin/payments/{id}/confirm': 'payments.write',
        'GET /admin/payments/stats': 'payments.read',
        
        # Staff
        'GET /admin/staff': 'staff.read',
        'GET /admin/staff/{id}': 'staff.read',
        'POST /admin/staff': 'staff.write',
        'PUT /admin/staff/{id}': 'staff.write',
        'POST /admin/staff/{id}/toggle-active': 'staff.write',
        'POST /admin/staff/{id}/reset-password': 'staff.write',
        'PUT /admin/staff/{id}/permissions': 'staff.permissions',
        
        # Invoices
        'GET /admin/invoices': 'invoices.read',
        'GET /admin/invoices/{id}': 'invoices.read',
        'POST /admin/invoices': 'invoices.write',
        'PUT /admin/invoices/{id}': 'invoices.write',
        'POST /admin/invoices/{id}/send': 'invoices.write',
        'GET /admin/invoices/{id}/pdf': 'invoices.read',
        
        # Departures
        'GET /admin/departures': 'departures.read',
        'GET /admin/departures/{id}': 'departures.read',
        'POST /admin/departures': 'departures.write',
        'PUT /admin/departures/{id}': 'departures.write',
        'POST /admin/departures/{id}/depart': 'departures.write',
        'POST /admin/departures/{id}/arrive': 'departures.write',
        
        # Reports
        'GET /admin/reports/financial': 'reports.financial',
        'GET /admin/reports/operational': 'reports.operational',
        
        # System
        'GET /admin/settings': 'system.settings',
        'PUT /admin/settings': 'system.settings',
        'GET /admin/audit': 'system.audit',
        
        # Warehouses
        'GET /admin/warehouses': 'warehouses.read',
        'POST /admin/warehouses': 'warehouses.write',
        'PUT /admin/warehouses/{id}': 'warehouses.write',
        'DELETE /admin/warehouses/{id}': 'warehouses.write',
        
        # Announcements
        'GET /admin/announcements': 'announcements.read',
        'POST /admin/announcements': 'announcements.write',
        'PUT /admin/announcements/{id}': 'announcements.write',
        'DELETE /admin/announcements/{id}': 'announcements.write',
        
        # Tarifs
        'GET /admin/tarifs': 'tarifs.read',
        'POST /admin/tarifs': 'tarifs.write',
        'PUT /admin/tarifs/{id}': 'tarifs.write',
        'DELETE /admin/tarifs/{id}': 'tarifs.write',
        
        # Pickups
        'GET /api/pickups/stats': 'packages.read',
        'GET /api/pickups/available': 'packages.read',
        'POST /api/pickups/search': 'packages.read',
        'POST /api/pickups/process': 'packages.manage_status',
        'GET /api/pickups/history': 'packages.read',
        'GET /api/pickups/{id}': 'packages.read',
        'GET /api/pickups/{id}/pdf': 'packages.read',
        'GET /api/pickups/qr/{tracking}': 'packages.read',
        'POST /api/pickups/scan': 'packages.read',
    }
    
    # Description des permissions avec leur niveau de criticité
    PERMISSION_DESCRIPTIONS = {
        'packages.read': {'description': 'Voir les colis', 'level': 'basic'},
        'packages.read_all': {'description': 'Voir tous les colis du tenant', 'level': 'enhanced'},
        'packages.write': {'description': 'Créer/modifier les colis', 'level': 'enhanced'},
        'packages.delete': {'description': 'Supprimer les colis', 'level': 'critical'},
        'packages.manage_status': {'description': 'Changer le statut des colis', 'level': 'enhanced'},
        
        'clients.read': {'description': 'Voir les clients', 'level': 'basic'},
        'clients.write': {'description': 'Créer/modifier les clients', 'level': 'enhanced'},
        'clients.delete': {'description': 'Supprimer les clients', 'level': 'critical'},
        
        'payments.read': {'description': 'Voir les paiements', 'level': 'enhanced'},
        'payments.write': {'description': 'Enregistrer des paiements', 'level': 'enhanced'},
        'payments.cancel': {'description': 'Annuler des paiements', 'level': 'critical'},
        
        'staff.read': {'description': 'Voir le personnel', 'level': 'enhanced'},
        'staff.write': {'description': 'Gérer le personnel', 'level': 'critical'},
        'staff.permissions': {'description': 'Gérer les permissions', 'level': 'critical'},
        
        'invoices.read': {'description': 'Voir les factures', 'level': 'basic'},
        'invoices.write': {'description': 'Créer/modifier les factures', 'level': 'enhanced'},
        
        'departures.read': {'description': 'Voir les départs', 'level': 'basic'},
        'departures.write': {'description': 'Gérer les départs', 'level': 'enhanced'},
        
        'reports.financial': {'description': 'Voir les rapports financiers', 'level': 'critical'},
        'reports.operational': {'description': 'Voir les rapports opérationnels', 'level': 'enhanced'},
        
        'system.settings': {'description': 'Modifier les paramètres système', 'level': 'critical'},
        'system.audit': {'description': 'Voir les logs d\'audit', 'level': 'critical'},
        
        'warehouses.read': {'description': 'Voir les entrepôts', 'level': 'basic'},
        'warehouses.write': {'description': 'Gérer les entrepôts', 'level': 'enhanced'},
        
        'announcements.read': {'description': 'Voir les annonces', 'level': 'basic'},
        'announcements.write': {'description': 'Gérer les annonces', 'level': 'enhanced'},
        
        'tarifs.read': {'description': 'Voir les tarifs', 'level': 'basic'},
        'tarifs.write': {'description': 'Gérer les tarifs', 'level': 'critical'},
    }
    
    @classmethod
    def get_permission_for_route(cls, method: str, path: str) -> str:
        """
        Retourne la permission requise pour une route donnée
        
        Args:
            method: Méthode HTTP (GET, POST, PUT, DELETE)
            path: Chemin de la route (peut contenir des placeholders comme {id})
        
        Returns:
            Permission requise ou None si non trouvée
        """
        # Normaliser le chemin (remplacer les placeholders)
        normalized_path = cls._normalize_path(path)
        route_key = f"{method.upper()} {normalized_path}"
        
        return cls.ROUTE_PERMISSIONS.get(route_key)
    
    @classmethod
    def _normalize_path(cls, path: str) -> str:
        """Normalise un chemin pour le matching"""
        # Remplacer les IDs numériques par {id}
        import re
        path = re.sub(r'/\d+(?=/|$)', '/{id}', path)
        # Remplacer les UUIDs par {id}
        path = re.sub(r'/[a-f0-9-]{36}(?=/|$)', '/{id}', path)
        return path
    
    @classmethod
    def get_all_route_permissions(cls) -> Dict[str, str]:
        """Retourne le mapping complet routes/permissions"""
        return cls.ROUTE_PERMISSIONS.copy()
    
    @classmethod
    def get_permissions_by_level(cls, level: str) -> List[str]:
        """
        Retourne toutes les permissions d'un niveau donné
        
        Args:
            level: basic, enhanced, critical
        
        Returns:
            Liste des permissions du niveau spécifié
        """
        permissions = []
        for perm, info in cls.PERMISSION_DESCRIPTIONS.items():
            if info['level'] == level:
                permissions.append(perm)
        return sorted(permissions)
    
    @classmethod
    def get_permission_info(cls, permission: str) -> Dict:
        """
        Retourne les informations détaillées d'une permission
        
        Args:
            permission: Nom de la permission
        
        Returns:
            Dictionnaire avec description, niveau, etc.
        """
        info = cls.PERMISSION_DESCRIPTIONS.get(permission, {})
        return {
            'name': permission,
            'description': info.get('description', 'Permission inconnue'),
            'level': info.get('level', 'unknown'),
            'exists': permission in cls.PERMISSION_DESCRIPTIONS
        }
    
    @classmethod
    def validate_permission_format(cls, permission: str) -> bool:
        """
        Valide le format d'une permission (resource.action)
        
        Args:
            permission: Permission à valider
        
        Returns:
            True si le format est valide
        """
        if not permission or '.' not in permission:
            return False
        
        parts = permission.split('.')
        if len(parts) != 2:
            return False
        
        resource, action = parts
        # Vérifier que resource et action sont alphanumériques avec underscores
        import re
        pattern = r'^[a-zA-Z][a-zA-Z0-9_]*$'
        
        return bool(re.match(pattern, resource) and re.match(pattern, action))
    
    @classmethod
    def get_permission_hierarchy(cls) -> Dict[str, int]:
        """
        Retourne la hiérarchie des niveaux de permissions
        
        Returns:
            Mapping niveau -> valeur numérique
        """
        return {
            'basic': 1,
            'enhanced': 2,
            'critical': 3
        }
    
    @classmethod
    def suggest_permissions_for_role(cls, role: str) -> List[str]:
        """
        Suggère les permissions appropriées pour un rôle
        
        Args:
            role: Nom du rôle (client, staff, admin)
        
        Returns:
            Liste des permissions suggérées
        """
        role_permissions = {
            'client': ['packages.read'],  # Uniquement ses propres colis
            'staff': cls.get_permissions_by_level('basic') + cls.get_permissions_by_level('enhanced'),
            'admin': list(cls.PERMISSION_DESCRIPTIONS.keys())  # Toutes les permissions
        }
        
        return role_permissions.get(role, [])
    
    @classmethod
    def audit_user_permissions(cls, user_permissions: Set[str], user_role: str) -> Dict:
        """
        Audite les permissions d'un utilisateur
        
        Args:
            user_permissions: Set des permissions de l'utilisateur
            user_role: Rôle de l'utilisateur
        
        Returns:
            Rapport d'audit avec recommandations
        """
        suggested = set(cls.suggest_permissions_for_role(user_role))
        current = set(user_permissions)
        
        # Permissions manquantes
        missing = suggested - current
        
        # Permissions en trop (non suggérées)
        extra = current - suggested
        
        # Permissions invalides
        invalid = current - {perm for perm in cls.PERMISSION_DESCRIPTIONS.keys()}
        
        # Analyse par niveau
        level_counts = {}
        for perm in current:
            info = cls.PERMISSION_DESCRIPTIONS.get(perm, {})
            level = info.get('level', 'unknown')
            level_counts[level] = level_counts.get(level, 0) + 1
        
        return {
            'role': user_role,
            'current_permissions': list(current),
            'suggested_permissions': list(suggested),
            'missing_permissions': list(missing),
            'extra_permissions': list(extra),
            'invalid_permissions': list(invalid),
            'permission_counts_by_level': level_counts,
            'total_permissions': len(current),
            'compliance_score': len(current & suggested) / len(suggested) if suggested else 0
        }


# Helper pour la vérification automatique dans les middlewares
def check_route_permission(user, required_permission: str) -> bool:
    """
    Vérifie si un utilisateur a la permission requise pour une route
    
    Args:
        user: Objet User
        required_permission: Permission requise
        
    Returns:
        True si l'utilisateur a la permission
    """
    if not required_permission:
        return True  # Pas de permission requise
    
    # Les admins ont toutes les permissions
    if user.role == 'admin':
        return True
    
    # Vérifier avec le système RBAC
    return user.has_permission(required_permission)


def log_permission_check(user, required_permission: str, granted: bool, route: str = None):
    """
    Log les vérifications de permissions pour l'audit
    
    Args:
        user: Objet User
        required_permission: Permission requise
        granted: Si la permission a été accordée
        route: Route actuelle (optionnel)
    """
    if granted:
        logger.debug(f"Permission accordée: user {user.id} ({user.email}) a '{required_permission}' pour {route or 'route'}")
    else:
        logger.warning(f"Permission refusée: user {user.id} ({user.email}) n'a pas '{required_permission}' pour {route or 'route'}")
