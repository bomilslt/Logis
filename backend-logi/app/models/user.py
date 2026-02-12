from app import db
from datetime import datetime, timedelta
from werkzeug.security import generate_password_hash, check_password_hash
import uuid
import json
from typing import Set, List


# Modules d'accès disponibles pour le staff
VALID_ACCESS_MODULES = [
    'packages',       # Colis (lecture globale, écriture filtrée par agence)
    'finance',        # Finances (strictement par agence destination)
    'departures',     # Départs (gestion complète, cascade statuts colis)
    'communication',  # Annonces
    'settings',       # Configurations (tarifs, entrepôts, etc.)
    'staff',          # Gestion du personnel
]


user_warehouses = db.Table(
    'user_warehouses',
    db.Column('user_id', db.String(36), db.ForeignKey('users.id'), primary_key=True),
    db.Column('warehouse_id', db.String(36), db.ForeignKey('warehouses.id'), primary_key=True),
)


class User(db.Model):
    """Utilisateur (client final ou staff de l'entreprise)"""
    __tablename__ = 'users'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = db.Column(db.String(36), db.ForeignKey('tenants.id'), nullable=False)
    
    email = db.Column(db.String(120), nullable=False)
    phone = db.Column(db.String(20))
    password_hash = db.Column(db.String(256), nullable=False)
    
    first_name = db.Column(db.String(50), nullable=False)
    last_name = db.Column(db.String(50), nullable=False)
    
    # Rôles: admin (gérant), staff (employé), client (client final)
    role = db.Column(db.String(20), default='client')

    warehouse_id = db.Column(db.String(36), db.ForeignKey('warehouses.id'))
    
    # Champs RH (pour staff/admin uniquement)
    position = db.Column(db.String(100))  # Poste: Gestionnaire, Livreur, etc.
    salary = db.Column(db.Numeric(18, 2, asdecimal=False), default=0)  # Salaire mensuel
    hire_date = db.Column(db.Date)  # Date d'embauche
    permissions_json = db.Column(db.Text)  # Permissions JSON: ["packages", "clients", ...]
    access_modules = db.Column(db.JSON, default=list)  # Modules d'accès staff: ["packages", "finance", ...]
    
    is_active = db.Column(db.Boolean, default=True)
    is_verified = db.Column(db.Boolean, default=False)
    email_verified = db.Column(db.Boolean, default=False)  # Vérifié par OTP
    
    # Préférences notifications
    notify_email = db.Column(db.Boolean, default=True)
    notify_sms = db.Column(db.Boolean, default=True)
    notify_whatsapp = db.Column(db.Boolean, default=True)
    notify_push = db.Column(db.Boolean, default=True)

    # Client placeholder (créé lorsque nom/téléphone inconnus)
    is_placeholder = db.Column(db.Boolean, default=False)
    
    # RBAC fields
    permissions_cache = db.Column(db.Text)  # Cache des permissions calculées (JSON)
    permissions_cache_updated = db.Column(db.DateTime)
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_login = db.Column(db.DateTime)
    
    # Relations
    packages = db.relationship('Package', backref='client', lazy='dynamic')
    notifications = db.relationship('Notification', backref='user', lazy='dynamic')

    warehouses = db.relationship('Warehouse', secondary='user_warehouses', backref='users')
    
    # Relations RBAC
    roles = db.relationship('Role', secondary='user_roles', backref='users')
    individual_permissions = db.relationship('Permission', secondary='user_permissions', backref='users')
    
    # Contrainte unique email par tenant
    __table_args__ = (
        db.UniqueConstraint('tenant_id', 'email', name='unique_email_per_tenant'),
    )
    
    def set_password(self, password):
        self.password_hash = generate_password_hash(password)
    
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)
    
    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}"
    
    @property
    def permissions(self):
        """Retourne la liste des permissions"""
        if self.permissions_json:
            try:
                return json.loads(self.permissions_json)
            except:
                return []
        return []
    
    @permissions.setter
    def permissions(self, value):
        """Définit les permissions"""
        self.permissions_json = json.dumps(value) if value else None
    
    def get_effective_permissions(self) -> Set[str]:
        """Retourne toutes les permissions effectives (rôles + individuelles)"""
        # Vérifier le cache
        if (self.permissions_cache_updated and 
            datetime.utcnow() - self.permissions_cache_updated < timedelta(minutes=15)):
            try:
                return set(json.loads(self.permissions_cache))
            except:
                pass
        
        # Recalculer les permissions
        permissions = set()
        
        # Permissions des rôles
        for role in self.roles:
            permissions.update(p.name for p in role.permissions)
        
        # Permissions individuelles
        permissions.update(p.name for p in self.individual_permissions)
        
        # Mettre en cache
        self.permissions_cache = json.dumps(list(permissions))
        self.permissions_cache_updated = datetime.utcnow()
        db.session.commit()
        
        return permissions
    
    def has_permission(self, permission: str) -> bool:
        """Vérifie si l'utilisateur a une permission spécifique"""
        return permission in self.get_effective_permissions()
    
    def has_any_permission(self, permissions: List[str]) -> bool:
        """Vérifie si l'utilisateur a au moins une des permissions"""
        user_perms = self.get_effective_permissions()
        return any(p in user_perms for p in permissions)
    
    def has_module(self, module: str) -> bool:
        """Vérifie si le staff a accès à un module. Admin a toujours accès à tout."""
        if self.role == 'admin':
            return True
        if self.role != 'staff':
            return False
        modules = self.access_modules or []
        return module in modules
    
    def get_highest_role_level(self) -> int:
        """Retourne le niveau hiérarchique le plus élevé"""
        if not self.roles:
            return 0
        return max(role.hierarchy_level for role in self.roles)
    
    def invalidate_permissions_cache(self):
        """Invalide le cache des permissions"""
        self.permissions_cache = None
        self.permissions_cache_updated = None
        db.session.commit()
    
    def to_dict(self, include_private=False):
        data = {
            'id': self.id,
            'tenant_id': self.tenant_id,
            'email': self.email,
            'phone': self.phone,
            'first_name': self.first_name,
            'last_name': self.last_name,
            'full_name': self.full_name,
            'role': self.role,
            'is_placeholder': self.is_placeholder,
            'is_active': self.is_active,
            'is_verified': self.is_verified,
            'created_at': (self.created_at.isoformat() + 'Z') if self.created_at else None
        }
        
        # Inclure les champs RH pour staff/admin
        if self.role in ['admin', 'staff']:
            data['position'] = self.position
            data['salary'] = self.salary or 0
            data['hire_date'] = self.hire_date.isoformat() if self.hire_date else None
            data['permissions'] = self.permissions
            data['warehouse_id'] = self.warehouse_id
            data['warehouse_ids'] = [w.id for w in (self.warehouses or [])]
            data['warehouse_names'] = [w.name for w in (self.warehouses or [])]
            data['access_modules'] = self.access_modules or []
        
        if include_private:
            data.update({
                'notify_email': self.notify_email,
                'notify_sms': self.notify_sms,
                'notify_whatsapp': self.notify_whatsapp,
                'notify_push': self.notify_push,
                'last_login': (self.last_login.isoformat() + 'Z') if self.last_login else None
            })
        return data
