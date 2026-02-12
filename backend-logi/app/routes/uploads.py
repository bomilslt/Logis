"""
Routes Upload - Gestion des fichiers
=====================================

Endpoints pour l'upload d'images et documents via Cloudinary.
"""

from flask import Blueprint, request, jsonify, g
from flask_jwt_extended import get_jwt_identity
from app.utils.decorators import tenant_required, admin_required
from app.services.cloudinary_service import get_cloudinary_service, CloudinaryService
import logging
import imghdr
import mimetypes

uploads_bp = Blueprint('uploads', __name__)
logger = logging.getLogger(__name__)

# Limites
MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10 MB
MAX_DOC_SIZE = 25 * 1024 * 1024  # 25 MB
ALLOWED_IMAGE_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
ALLOWED_DOC_EXTENSIONS = {'pdf', 'doc', 'docx'}

# Signatures basiques pour validation contenu
PDF_MAGIC = b"%PDF"
DOC_MAGIC = b"\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1"
ZIP_MAGIC = b"PK\x03\x04"


def allowed_file(filename: str, allowed_extensions: set) -> bool:
    """Vérifie si l'extension du fichier est autorisée"""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in allowed_extensions


def _read_file_head(file, size: int = 16) -> bytes:
    """Lit les premiers octets d'un fichier sans casser le stream"""
    pos = file.stream.tell()
    file.stream.seek(0)
    head = file.stream.read(size)
    file.stream.seek(pos)
    return head


def validate_image_content(file) -> bool:
    """Validation légère du contenu image via imghdr"""
    pos = file.stream.tell()
    file.stream.seek(0)
    kind = imghdr.what(file.stream)
    file.stream.seek(pos)
    return kind in ALLOWED_IMAGE_EXTENSIONS


def validate_document_content(file, extension: str) -> bool:
    """Validation minimale du contenu document par signature"""
    head = _read_file_head(file, 8)
    if extension == 'pdf':
        return head.startswith(PDF_MAGIC)
    if extension == 'doc':
        return head.startswith(DOC_MAGIC)
    if extension == 'docx':
        return head.startswith(ZIP_MAGIC)
    return False


def get_extension(filename: str) -> str:
    return filename.rsplit('.', 1)[1].lower() if '.' in filename else ''


@uploads_bp.route('/image', methods=['POST'])
@tenant_required
def upload_image():
    """
    Upload une image
    
    Form data:
        - file: Fichier image (required)
        - folder: Dossier de destination (optional, default: "images")
        - tags: Tags séparés par virgule (optional)
    
    Returns:
        URL de l'image uploadée
    """
    if 'file' not in request.files:
        return jsonify({'error': 'Aucun fichier fourni'}), 400
    
    file = request.files['file']
    
    if file.filename == '':
        return jsonify({'error': 'Nom de fichier vide'}), 400

    extension = get_extension(file.filename)
    if not allowed_file(file.filename, ALLOWED_IMAGE_EXTENSIONS):
        return jsonify({
            'error': f'Type de fichier non autorisé. Extensions acceptées: {", ".join(ALLOWED_IMAGE_EXTENSIONS)}'
        }), 400

    # Validation contenu (anti-fichier déguisé)
    if not validate_image_content(file):
        return jsonify({'error': 'Contenu image invalide'}), 400
    
    # Vérifier la taille
    file.seek(0, 2)  # Aller à la fin
    size = file.tell()
    file.seek(0)  # Revenir au début
    
    if size > MAX_IMAGE_SIZE:
        return jsonify({'error': f'Fichier trop volumineux. Max: {MAX_IMAGE_SIZE // (1024*1024)} MB'}), 400
    
    # Récupérer les options
    folder = request.form.get('folder', 'images')
    tags = request.form.get('tags', '').split(',') if request.form.get('tags') else None
    
    # Upload
    service = get_cloudinary_service(g.tenant_id)
    
    if not service.is_configured:
        return jsonify({'error': 'Service de stockage non configuré'}), 503
    
    result = service.upload_image(file, folder=folder, tags=tags)
    
    if not result.success:
        return jsonify({'error': result.error or 'Erreur lors de l\'upload'}), 500
    
    logger.info(f"Image uploadée par user {get_jwt_identity()}: {result.public_id}")
    
    return jsonify({
        'message': 'Image uploadée',
        'url': result.secure_url,
        'public_id': result.public_id,
        'width': result.width,
        'height': result.height,
        'format': result.format,
        'size': result.bytes
    }), 201


@uploads_bp.route('/document', methods=['POST'])
@tenant_required
def upload_document():
    """
    Upload un document (PDF, etc.)
    
    Form data:
        - file: Fichier document (required)
        - folder: Dossier de destination (optional, default: "documents")
        - tags: Tags séparés par virgule (optional)
    
    Returns:
        URL du document uploadé
    """
    if 'file' not in request.files:
        return jsonify({'error': 'Aucun fichier fourni'}), 400
    
    file = request.files['file']
    
    if file.filename == '':
        return jsonify({'error': 'Nom de fichier vide'}), 400
    
    extension = get_extension(file.filename)
    if not allowed_file(file.filename, ALLOWED_DOC_EXTENSIONS):
        return jsonify({
            'error': f'Type de fichier non autorisé. Extensions acceptées: {", ".join(ALLOWED_DOC_EXTENSIONS)}'
        }), 400

    # Validation contenu (signature minimale)
    if not validate_document_content(file, extension):
        return jsonify({'error': 'Contenu document invalide'}), 400
    
    # Vérifier la taille
    file.seek(0, 2)
    size = file.tell()
    file.seek(0)
    
    if size > MAX_DOC_SIZE:
        return jsonify({'error': f'Fichier trop volumineux. Max: {MAX_DOC_SIZE // (1024*1024)} MB'}), 400
    
    folder = request.form.get('folder', 'documents')
    tags = request.form.get('tags', '').split(',') if request.form.get('tags') else None
    
    service = get_cloudinary_service(g.tenant_id)
    
    if not service.is_configured:
        return jsonify({'error': 'Service de stockage non configuré'}), 503
    
    result = service.upload_document(file, folder=folder, tags=tags)
    
    if not result.success:
        return jsonify({'error': result.error or 'Erreur lors de l\'upload'}), 500
    
    logger.info(f"Document uploadé par user {get_jwt_identity()}: {result.public_id}")
    
    return jsonify({
        'message': 'Document uploadé',
        'url': result.secure_url,
        'public_id': result.public_id,
        'format': result.format,
        'size': result.bytes
    }), 201


@uploads_bp.route('/package/<package_id>/photo', methods=['POST'])
@tenant_required
def upload_package_photo(package_id):
    """
    Upload une photo pour un colis
    
    Form data:
        - file: Fichier image (required)
        - type: Type de photo (package, label, damage) (optional)
    
    Returns:
        URL de la photo
    """
    from app.models import Package
    from app import db
    
    user_id = get_jwt_identity()
    
    # Vérifier que le colis existe et appartient au user
    package = Package.query.filter_by(
        id=package_id,
        tenant_id=g.tenant_id,
        client_id=user_id
    ).first()
    
    if not package:
        return jsonify({'error': 'Colis non trouvé'}), 404
    
    if 'file' not in request.files:
        return jsonify({'error': 'Aucun fichier fourni'}), 400
    
    file = request.files['file']
    
    extension = get_extension(file.filename)
    if not allowed_file(file.filename, ALLOWED_IMAGE_EXTENSIONS):
        return jsonify({'error': 'Type de fichier non autorisé'}), 400

    if not validate_image_content(file):
        return jsonify({'error': 'Contenu image invalide'}), 400
    
    photo_type = request.form.get('type', 'package')
    
    service = get_cloudinary_service(g.tenant_id)
    
    if not service.is_configured:
        return jsonify({'error': 'Service de stockage non configuré'}), 503
    
    result = service.upload_image(
        file,
        folder=f"packages/{package.tracking_number}",
        tags=[g.tenant_id, package.tracking_number, photo_type]
    )
    
    if not result.success:
        return jsonify({'error': result.error or 'Erreur lors de l\'upload'}), 500
    
    # Stocker l'URL dans le colis (si champ photos existe)
    if hasattr(package, 'photos') and package.photos is not None:
        photos = package.photos or []
        photos.append({
            'url': result.secure_url,
            'public_id': result.public_id,
            'type': photo_type
        })
        package.photos = photos
        db.session.commit()
    
    return jsonify({
        'message': 'Photo uploadée',
        'url': result.secure_url,
        'public_id': result.public_id,
        'thumbnail': service.get_thumbnail_url(result.public_id)
    }), 201


@uploads_bp.route('/<public_id>', methods=['DELETE'])
@admin_required
def delete_file(public_id):
    """
    Supprime un fichier (admin uniquement)
    
    Args:
        public_id: ID public Cloudinary du fichier
    
    Query params:
        - type: Type de ressource (image, raw) (default: image)
    """
    resource_type = request.args.get('type', 'image')
    
    service = get_cloudinary_service(g.tenant_id)
    
    if not service.is_configured:
        return jsonify({'error': 'Service de stockage non configuré'}), 503
    
    # Vérifier que le fichier appartient au tenant
    if not public_id.startswith(g.tenant_id):
        return jsonify({'error': 'Accès refusé'}), 403
    
    success = service.delete(public_id, resource_type=resource_type)
    
    if success:
        logger.info(f"Fichier supprimé par admin {get_jwt_identity()}: {public_id}")
        return jsonify({'message': 'Fichier supprimé'})
    else:
        return jsonify({'error': 'Erreur lors de la suppression'}), 500
