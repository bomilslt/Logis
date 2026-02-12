"""
Modèle PushSubscription - Abonnements aux notifications push
Stocke les tokens FCM, OneSignal ou subscriptions WebPush des utilisateurs
"""

from app import db
from datetime import datetime
import uuid


class PushSubscription(db.Model):
    """
    Abonnement push d'un utilisateur
    
    Supporte plusieurs providers:
    - Firebase (FCM): token = FCM registration token
    - OneSignal: token = player_id
    - WebPush (VAPID): token = JSON subscription info (endpoint + keys)
    """
    __tablename__ = 'push_subscriptions'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    tenant_id = db.Column(db.String(36), db.ForeignKey('tenants.id'), nullable=False)
    
    # Token ou subscription info
    # Pour FCM/OneSignal: string simple
    # Pour WebPush: JSON stringifié {endpoint, keys: {p256dh, auth}}
    token = db.Column(db.Text, nullable=False)
    
    # Provider: firebase, onesignal, webpush
    provider = db.Column(db.String(30), nullable=False)
    
    # Type d'appareil: web, android, ios
    device_type = db.Column(db.String(20), default='web')
    
    # Nom/identifiant de l'appareil (optionnel)
    device_name = db.Column(db.String(100))
    
    # User agent du navigateur (pour debug)
    user_agent = db.Column(db.String(500))
    
    # Statut
    is_active = db.Column(db.Boolean, default=True)
    
    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_used_at = db.Column(db.DateTime)
    
    # Index unique pour éviter les doublons
    __table_args__ = (
        db.UniqueConstraint('user_id', 'token', name='unique_user_token'),
    )
    
    def to_dict(self):
        """Sérialisation en dictionnaire"""
        return {
            'id': self.id,
            'user_id': self.user_id,
            'provider': self.provider,
            'device_type': self.device_type,
            'device_name': self.device_name,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'last_used_at': self.last_used_at.isoformat() if self.last_used_at else None
        }
    
    def update_last_used(self):
        """Met à jour la date de dernière utilisation"""
        self.last_used_at = datetime.utcnow()
    
    @classmethod
    def subscribe(cls, user_id: str, tenant_id: str, token: str, provider: str, 
                  device_type: str = 'web', device_name: str = None, 
                  user_agent: str = None) -> 'PushSubscription':
        """
        Crée ou met à jour un abonnement push
        
        Args:
            user_id: ID de l'utilisateur
            tenant_id: ID du tenant
            token: Token push ou subscription info
            provider: Provider (firebase, onesignal, webpush)
            device_type: Type d'appareil (web, android, ios)
            device_name: Nom de l'appareil (optionnel)
            user_agent: User agent du navigateur (optionnel)
        
        Returns:
            PushSubscription: L'abonnement créé ou mis à jour
        """
        # Chercher un abonnement existant
        existing = cls.query.filter_by(user_id=user_id, token=token).first()
        
        if existing:
            # Réactiver si désactivé
            existing.is_active = True
            existing.device_name = device_name or existing.device_name
            existing.user_agent = user_agent or existing.user_agent
            existing.updated_at = datetime.utcnow()
            return existing
        
        # Créer un nouvel abonnement
        subscription = cls(
            user_id=user_id,
            tenant_id=tenant_id,
            token=token,
            provider=provider,
            device_type=device_type,
            device_name=device_name,
            user_agent=user_agent
        )
        db.session.add(subscription)
        return subscription
    
    @classmethod
    def unsubscribe(cls, user_id: str, token: str) -> bool:
        """
        Désactive un abonnement push
        
        Args:
            user_id: ID de l'utilisateur
            token: Token à désactiver
        
        Returns:
            bool: True si trouvé et désactivé
        """
        subscription = cls.query.filter_by(user_id=user_id, token=token).first()
        if subscription:
            subscription.is_active = False
            return True
        return False
    
    @classmethod
    def get_active_tokens(cls, user_id: str, provider: str = None) -> list:
        """
        Récupère les tokens actifs d'un utilisateur
        
        Args:
            user_id: ID de l'utilisateur
            provider: Filtrer par provider (optionnel)
        
        Returns:
            list: Liste des tokens actifs
        """
        query = cls.query.filter_by(user_id=user_id, is_active=True)
        if provider:
            query = query.filter_by(provider=provider)
        return [sub.token for sub in query.all()]
    
    @classmethod
    def cleanup_inactive(cls, days: int = 90) -> int:
        """
        Supprime les abonnements inactifs depuis X jours
        
        Args:
            days: Nombre de jours d'inactivité
        
        Returns:
            int: Nombre d'abonnements supprimés
        """
        from datetime import timedelta
        cutoff = datetime.utcnow() - timedelta(days=days)
        
        result = cls.query.filter(
            cls.is_active == False,
            cls.updated_at < cutoff
        ).delete()
        
        return result
