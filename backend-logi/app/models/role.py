"""
Role model for RBAC system
Defines roles with hierarchy and permission associations
"""

from app import db
from datetime import datetime
import uuid


class Role(db.Model):
    """Rôles avec permissions associées"""
    __tablename__ = 'roles'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = db.Column(db.String(36), db.ForeignKey('tenants.id'), nullable=True)  # None pour rôles système
    name = db.Column(db.String(50), nullable=False)  # admin, staff, client
    display_name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text)
    is_system = db.Column(db.Boolean, default=False)  # Rôle système non modifiable
    hierarchy_level = db.Column(db.Integer, default=0)  # 0=client, 10=staff, 20=admin, 30=super_admin
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relations many-to-many avec permissions
    permissions = db.relationship('Permission', secondary='role_permissions', backref='roles')
    
    # Contrainte unique nom par tenant
    __table_args__ = (
        db.UniqueConstraint('tenant_id', 'name', name='unique_role_per_tenant'),
    )
    
    def to_dict(self):
        """Convertit le rôle en dictionnaire"""
        return {
            'id': self.id,
            'tenant_id': self.tenant_id,
            'name': self.name,
            'display_name': self.display_name,
            'description': self.description,
            'is_system': self.is_system,
            'hierarchy_level': self.hierarchy_level,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
    
    def __repr__(self):
        return f'<Role {self.name} (level {self.hierarchy_level})>'


# Table d'association rôle-permissions
role_permissions = db.Table('role_permissions',
    db.Column('role_id', db.String(36), db.ForeignKey('roles.id'), primary_key=True),
    db.Column('permission_id', db.String(36), db.ForeignKey('permissions.id'), primary_key=True)
)

# Table d'association utilisateur-rôles
user_roles = db.Table('user_roles',
    db.Column('user_id', db.String(36), db.ForeignKey('users.id'), primary_key=True),
    db.Column('role_id', db.String(36), db.ForeignKey('roles.id'), primary_key=True)
)

# Table d'association utilisateur-permissions individuelles
user_permissions = db.Table('user_permissions',
    db.Column('user_id', db.String(36), db.ForeignKey('users.id'), primary_key=True),
    db.Column('permission_id', db.String(36), db.ForeignKey('permissions.id'), primary_key=True)
)


# Configuration des rôles par défaut
DEFAULT_ROLES = {
    'client': {
        'display_name': 'Client',
        'description': 'Client final utilisant les services',
        'hierarchy_level': 0,
        'permissions': [
            'packages.read',  # Ses propres colis seulement
        ]
    },
    'staff': {
        'display_name': 'Employé',
        'description': 'Employé avec accès limité aux fonctionnalités',
        'hierarchy_level': 10,
        'permissions': [
            'packages.read', 'packages.write', 'packages.manage_status',
            'clients.read', 'clients.write',
            'payments.read', 'payments.write'
        ]
    },
    'admin': {
        'display_name': 'Administrateur',
        'description': 'Administrateur avec accès complet au tenant',
        'hierarchy_level': 20,
        'permissions': [
            'packages.read_all', 'packages.write', 'packages.delete', 'packages.manage_status',
            'clients.read', 'clients.write', 'clients.delete',
            'payments.read', 'payments.write', 'payments.cancel',
            'staff.read', 'staff.write', 'staff.permissions',
            'reports.financial', 'reports.operational',
            'system.settings', 'system.audit',
            'departures.read', 'departures.write',
            'warehouses.read', 'warehouses.write',
            'invoices.read', 'invoices.write',
            'announcements.read', 'announcements.write',
            'tarifs.read', 'tarifs.write'
        ]
    },
    'super_admin': {
        'display_name': 'Super Administrateur',
        'description': 'Super administrateur avec accès système complet',
        'hierarchy_level': 30,
        'permissions': ['*']  # Toutes les permissions
    }
}


def seed_default_roles(tenant_id=None):
    """Crée les rôles par défaut pour un tenant ou système"""
    from app.models.permission import Permission
    
    created_count = 0
    
    for role_name, role_config in DEFAULT_ROLES.items():
        # Vérifier si le rôle existe déjà
        existing = Role.query.filter_by(
            tenant_id=tenant_id,
            name=role_name
        ).first()
        
        if not existing:
            role = Role(
                tenant_id=tenant_id,
                name=role_name,
                display_name=role_config['display_name'],
                description=role_config['description'],
                hierarchy_level=role_config['hierarchy_level'],
                is_system=(tenant_id is None)
            )
            
            db.session.add(role)
            db.session.flush()  # Pour obtenir l'ID
            
            # Assigner les permissions
            permissions = role_config['permissions']
            if permissions == ['*']:
                # Super admin: toutes les permissions
                all_permissions = Permission.query.all()
                for permission in all_permissions:
                    db.session.execute(
                        role_permissions.insert().values(
                            role_id=role.id,
                            permission_id=permission.id
                        )
                    )
            else:
                # Permissions spécifiques
                for perm_name in permissions:
                    permission = Permission.query.filter_by(name=perm_name).first()
                    if permission:
                        db.session.execute(
                            role_permissions.insert().values(
                                role_id=role.id,
                                permission_id=permission.id
                            )
                        )
            
            created_count += 1
    
    if created_count > 0:
        db.session.commit()
        tenant_info = f"tenant {tenant_id}" if tenant_id else "système"
        print(f"✓ {created_count} rôles créés pour {tenant_info}")
    
    return created_count