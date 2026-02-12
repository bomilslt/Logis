"""
Service Cloudinary pour l'upload de fichiers
=============================================

Gère l'upload d'images et documents vers Cloudinary.
Configuration par tenant stockée dans TenantConfig.
"""

import os
import logging
from typing import Optional
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# Import conditionnel de cloudinary
try:
    import cloudinary
    import cloudinary.uploader
    import cloudinary.api
    CLOUDINARY_AVAILABLE = True
except ImportError:
    CLOUDINARY_AVAILABLE = False
    logger.warning("cloudinary non installé - pip install cloudinary")


@dataclass
class UploadResult:
    """Résultat d'un upload"""
    success: bool
    url: Optional[str] = None
    public_id: Optional[str] = None
    secure_url: Optional[str] = None
    format: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    bytes: Optional[int] = None
    error: Optional[str] = None


class CloudinaryService:
    """
    Service d'upload vers Cloudinary
    
    Usage:
        service = CloudinaryService(tenant_id)
        result = service.upload_image(file, folder="packages")
    """
    
    # Types de fichiers autorisés
    ALLOWED_IMAGE_TYPES = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
    ALLOWED_DOC_TYPES = {'pdf', 'doc', 'docx'}
    MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10 MB
    MAX_DOC_SIZE = 25 * 1024 * 1024  # 25 MB
    
    def __init__(self, tenant_id: str, config: dict = None):
        """
        Initialise le service Cloudinary
        
        Args:
            tenant_id: ID du tenant
            config: Configuration Cloudinary (cloud_name, api_key, api_secret)
        """
        self.tenant_id = tenant_id
        self.config = config or {}
        self._configured = False
        
        if not CLOUDINARY_AVAILABLE:
            logger.error("Cloudinary non disponible")
            return
        
        self._configure()
    
    def _configure(self):
        """Configure Cloudinary avec les credentials du tenant"""
        cloud_name = self.config.get('cloud_name') or os.environ.get('CLOUDINARY_CLOUD_NAME')
        api_key = self.config.get('api_key') or os.environ.get('CLOUDINARY_API_KEY')
        api_secret = self.config.get('api_secret') or os.environ.get('CLOUDINARY_API_SECRET')
        
        if not all([cloud_name, api_key, api_secret]):
            logger.warning(f"Cloudinary non configuré pour tenant {self.tenant_id}")
            return
        
        cloudinary.config(
            cloud_name=cloud_name,
            api_key=api_key,
            api_secret=api_secret,
            secure=True
        )
        self._configured = True
    
    @property
    def is_configured(self) -> bool:
        """Vérifie si Cloudinary est configuré"""
        return CLOUDINARY_AVAILABLE and self._configured
    
    def upload_image(
        self,
        file,
        folder: str = "uploads",
        public_id: str = None,
        transformation: dict = None,
        tags: list = None
    ) -> UploadResult:
        """
        Upload une image vers Cloudinary
        
        Args:
            file: Fichier (FileStorage, path, ou URL)
            folder: Dossier de destination
            public_id: ID public personnalisé (optionnel)
            transformation: Transformations à appliquer
            tags: Tags pour l'image
            
        Returns:
            UploadResult avec les infos de l'upload
        """
        if not self.is_configured:
            return UploadResult(success=False, error="Cloudinary non configuré")
        
        try:
            # Construire le chemin avec tenant
            full_folder = f"{self.tenant_id}/{folder}"
            
            # Options d'upload
            options = {
                'folder': full_folder,
                'resource_type': 'image',
                'overwrite': True,
                'tags': tags or [self.tenant_id],
            }
            
            if public_id:
                options['public_id'] = public_id
            
            if transformation:
                options['transformation'] = transformation
            else:
                # Transformation par défaut: limiter la taille
                options['transformation'] = {
                    'quality': 'auto:good',
                    'fetch_format': 'auto'
                }
            
            # Upload
            result = cloudinary.uploader.upload(file, **options)
            
            logger.info(f"Image uploadée: {result.get('public_id')}")
            
            return UploadResult(
                success=True,
                url=result.get('url'),
                secure_url=result.get('secure_url'),
                public_id=result.get('public_id'),
                format=result.get('format'),
                width=result.get('width'),
                height=result.get('height'),
                bytes=result.get('bytes')
            )
            
        except Exception as e:
            logger.error(f"Erreur upload Cloudinary: {str(e)}")
            return UploadResult(success=False, error=str(e))
    
    def upload_document(
        self,
        file,
        folder: str = "documents",
        public_id: str = None,
        tags: list = None
    ) -> UploadResult:
        """
        Upload un document (PDF, etc.) vers Cloudinary
        
        Args:
            file: Fichier à uploader
            folder: Dossier de destination
            public_id: ID public personnalisé
            tags: Tags pour le document
            
        Returns:
            UploadResult
        """
        if not self.is_configured:
            return UploadResult(success=False, error="Cloudinary non configuré")
        
        try:
            full_folder = f"{self.tenant_id}/{folder}"
            
            options = {
                'folder': full_folder,
                'resource_type': 'raw',  # Pour les documents
                'overwrite': True,
                'tags': tags or [self.tenant_id],
            }
            
            if public_id:
                options['public_id'] = public_id
            
            result = cloudinary.uploader.upload(file, **options)
            
            logger.info(f"Document uploadé: {result.get('public_id')}")
            
            return UploadResult(
                success=True,
                url=result.get('url'),
                secure_url=result.get('secure_url'),
                public_id=result.get('public_id'),
                format=result.get('format'),
                bytes=result.get('bytes')
            )
            
        except Exception as e:
            logger.error(f"Erreur upload document: {str(e)}")
            return UploadResult(success=False, error=str(e))
    
    def delete(self, public_id: str, resource_type: str = 'image') -> bool:
        """
        Supprime un fichier de Cloudinary
        
        Args:
            public_id: ID public du fichier
            resource_type: Type de ressource (image, raw, video)
            
        Returns:
            True si supprimé avec succès
        """
        if not self.is_configured:
            return False
        
        try:
            result = cloudinary.uploader.destroy(public_id, resource_type=resource_type)
            return result.get('result') == 'ok'
        except Exception as e:
            logger.error(f"Erreur suppression Cloudinary: {str(e)}")
            return False
    
    def get_url(
        self,
        public_id: str,
        transformation: dict = None,
        resource_type: str = 'image'
    ) -> str:
        """
        Génère une URL pour un fichier avec transformations optionnelles
        
        Args:
            public_id: ID public du fichier
            transformation: Transformations (width, height, crop, etc.)
            resource_type: Type de ressource
            
        Returns:
            URL du fichier
        """
        if not self.is_configured:
            return ""
        
        try:
            options = {'secure': True}
            if transformation:
                options['transformation'] = transformation
            
            return cloudinary.CloudinaryImage(public_id).build_url(**options)
        except Exception as e:
            logger.error(f"Erreur génération URL: {str(e)}")
            return ""
    
    def get_thumbnail_url(self, public_id: str, width: int = 150, height: int = 150) -> str:
        """
        Génère une URL de miniature
        
        Args:
            public_id: ID public de l'image
            width: Largeur de la miniature
            height: Hauteur de la miniature
            
        Returns:
            URL de la miniature
        """
        return self.get_url(public_id, transformation={
            'width': width,
            'height': height,
            'crop': 'fill',
            'quality': 'auto:low'
        })


def get_cloudinary_service(tenant_id: str) -> CloudinaryService:
    """
    Factory pour créer un service Cloudinary configuré pour un tenant
    
    Args:
        tenant_id: ID du tenant
        
    Returns:
        Instance CloudinaryService configurée
    """
    from app.models import TenantConfig
    
    # Charger la config du tenant
    tenant_config = TenantConfig.query.filter_by(
        tenant_id=tenant_id,
        config_key='cloudinary'
    ).first()
    
    config = {}
    if tenant_config and tenant_config.config_data:
        config = tenant_config.config_data
    
    return CloudinaryService(tenant_id, config)
