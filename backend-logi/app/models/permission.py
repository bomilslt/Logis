"""
Permission model for RBAC system
Defines granular permissions with resource.action format
"""

from app import db
from datetime import datetime
import uuid
import re


class Permission(db.Model):
    """Permissions granulaires du système"""
    __tablename__ = 'permissions'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = db.Column(db.String(100), unique=True, nullable=False)  # packages.read
    resource = db.Column(db.String(50), nullable=False)  # packages
    action = db.Column(db.String(50), nullable=False)    # read
    description = db.Column(db.Text)
    is_system = db.Column(db.Boolean, default=False)  # Permission système non modifiable
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    @classmethod
    def create_permission(cls, resource: str, action: str, description: str = None):
        """Crée une permission avec validation du format"""
        # Validation du format resource.action
        if not cls.validate_permission_format(resource, action):
            raise ValueError(f"Invalid permission format: {resource}.{action}")
        
        name = f"{resource}.{action}"
        return cls(
            name=name,
            resource=resource,
            action=action,
            description=description or f"{action.title()} {resource}"
        )
    
    @staticmethod
    def validate_permission_format(resource: str, action: str) -> bool:
        """Valide le format d'une permission resource.action"""
        # Vérifier que resource et action ne sont pas vides
        if not resource or not action:
            return False
        
        # Vérifier le format: lettres, chiffres, underscores seulement
        pattern = r'^[a-zA-Z][a-zA-Z0-9_]*$'
        
        if not re.match(pattern, resource) or not re.match(pattern, action):
            return False
        
        return True
    
    @staticmethod
    def validate_permission_name(name: str) -> bool:
        """Valide le format complet d'une permission name (resource.action)"""
        if not name or '.' not in name:
            return False
        
        parts = name.split('.')
        if len(parts) != 2:
            return False
        
        resource, action = parts
        return Permission.validate_permission_format(resource, action)
    
    def to_dict(self):
        """Convertit la permission en dictionnaire"""
        return {
            'id': self.id,
            'name': self.name,
            'resource': self.resource,
            'action': self.action,
            'description': self.description,
            'is_system': self.is_system,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
    
    def __repr__(self):
        return f'<Permission {self.name}>'


# Permissions système par défaut
SYSTEM_PERMISSIONS = [
    # Packages
    ('packages', 'read', 'Voir les colis'),
    ('packages', 'write', 'Créer/modifier les colis'),
    ('packages', 'delete', 'Supprimer les colis'),
    ('packages', 'read_all', 'Voir tous les colis du tenant'),
    ('packages', 'manage_status', 'Changer le statut des colis'),
    
    # Clients
    ('clients', 'read', 'Voir les clients'),
    ('clients', 'write', 'Créer/modifier les clients'),
    ('clients', 'delete', 'Supprimer les clients'),
    
    # Payments
    ('payments', 'read', 'Voir les paiements'),
    ('payments', 'write', 'Enregistrer des paiements'),
    ('payments', 'cancel', 'Annuler des paiements'),
    
    # Staff Management
    ('staff', 'read', 'Voir le personnel'),
    ('staff', 'write', 'Gérer le personnel'),
    ('staff', 'permissions', 'Gérer les permissions'),
    
    # Reports
    ('reports', 'financial', 'Voir les rapports financiers'),
    ('reports', 'operational', 'Voir les rapports opérationnels'),
    
    # System
    ('system', 'settings', 'Modifier les paramètres système'),
    ('system', 'audit', 'Voir les logs d\'audit'),
    
    # Departures
    ('departures', 'read', 'Voir les départs'),
    ('departures', 'write', 'Gérer les départs'),
    
    # Warehouses
    ('warehouses', 'read', 'Voir les entrepôts'),
    ('warehouses', 'write', 'Gérer les entrepôts'),
    
    # Invoices
    ('invoices', 'read', 'Voir les factures'),
    ('invoices', 'write', 'Créer/modifier les factures'),
    
    # Announcements
    ('announcements', 'read', 'Voir les annonces'),
    ('announcements', 'write', 'Gérer les annonces'),
    
    # Tarifs
    ('tarifs', 'read', 'Voir les tarifs'),
    ('tarifs', 'write', 'Gérer les tarifs'),
]


def seed_system_permissions():
    """Crée les permissions système par défaut"""
    from app import db
    
    created_count = 0
    
    for resource, action, description in SYSTEM_PERMISSIONS:
        # Vérifier si la permission existe déjà
        name = f"{resource}.{action}"
        existing = Permission.query.filter_by(name=name).first()
        
        if not existing:
            permission = Permission.create_permission(resource, action, description)
            permission.is_system = True
            db.session.add(permission)
            created_count += 1
    
    if created_count > 0:
        db.session.commit()
        print(f"✓ {created_count} permissions système créées")
    else:
        print("✓ Permissions système déjà présentes")
    
    return created_count