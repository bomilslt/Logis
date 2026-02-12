"""
Routes API pour la gestion des retraits de colis
Gère le processus complet de retrait avec paiement intégré
"""

from flask import Blueprint, request, jsonify, current_app, g, make_response
from flask_jwt_extended import jwt_required
from app import db
from app.models import Package, Pickup, Payment, PackagePayment, User, PackageHistory
from app.utils.decorators import tenant_required, admin_required
from app.utils.helpers import can_process_pickup
from app.services.notification_service import NotificationService
from datetime import datetime
import base64
import os
import logging
from reportlab.lib.pagesizes import letter, A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import io
import qrcode
from qrcode.constants import ERROR_CORRECT_L

logger = logging.getLogger(__name__)

bp = Blueprint('pickups', __name__, url_prefix='/api/pickups')


@bp.route('/stats', methods=['GET'])
@admin_required
def get_pickup_stats():
    """
    Statistiques des retraits pour le mini dashboard
    """
    tenant_id = g.tenant_id
    
    # Colis en attente de retrait (arrivés mais pas encore livrés)
    ready_statuses = ['arrived_port', 'customs', 'out_for_delivery']
    
    awaiting_pickup_query = Package.query.filter(
        Package.tenant_id == tenant_id,
        Package.status.in_(ready_statuses)
    )

    if g.user_role == 'staff':
        staff_wh_ids = getattr(g, 'staff_warehouse_ids', None) or ([] if not g.staff_warehouse_id else [g.staff_warehouse_id])
        if not staff_wh_ids:
            return jsonify({'error': 'Accès refusé'}), 403
        awaiting_pickup_query = awaiting_pickup_query.filter(
            Package.destination_warehouse_id.in_(staff_wh_ids)
        )

    awaiting_pickup = awaiting_pickup_query.count()
    
    # Colis avec paiement en attente
    awaiting_payment_query = Package.query.filter(
        Package.tenant_id == tenant_id,
        Package.status.in_(ready_statuses),
        Package.amount > 0,
        (Package.paid_amount == None) | (Package.paid_amount < Package.amount)
    )

    if g.user_role == 'staff':
        staff_wh_ids = getattr(g, 'staff_warehouse_ids', None) or ([] if not g.staff_warehouse_id else [g.staff_warehouse_id])
        awaiting_payment_query = awaiting_payment_query.filter(Package.destination_warehouse_id.in_(staff_wh_ids))

    awaiting_payment = awaiting_payment_query.count()
    
    # Retraits aujourd'hui
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    pickups_today = Pickup.query.filter(
        Pickup.tenant_id == tenant_id,
        Pickup.picked_up_at >= today_start
    ).count()
    
    # Total retraits ce mois
    month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    pickups_month = Pickup.query.filter(
        Pickup.tenant_id == tenant_id,
        Pickup.picked_up_at >= month_start
    ).count()
    
    return jsonify({
        'awaiting_pickup': awaiting_pickup,
        'awaiting_payment': awaiting_payment,
        'pickups_today': pickups_today,
        'pickups_month': pickups_month
    })


@bp.route('/available', methods=['GET'])
@admin_required
def get_available_packages():
    """
    Liste des colis disponibles pour retrait (paginée)
    """
    tenant_id = g.tenant_id
    page = request.args.get('page', 1, type=int)
    per_page = min(request.args.get('per_page', 10, type=int), 50)
    search = request.args.get('search', '').strip()
    
    # Statuts éligibles au retrait
    ready_statuses = ['arrived_port', 'customs', 'out_for_delivery']
    
    query = Package.query.filter(
        Package.tenant_id == tenant_id,
        Package.status.in_(ready_statuses)
    )

    if g.user_role == 'staff':
        staff_wh_ids = getattr(g, 'staff_warehouse_ids', None) or ([] if not g.staff_warehouse_id else [g.staff_warehouse_id])
        if not staff_wh_ids:
            return jsonify({'error': 'Accès refusé'}), 403
        query = query.filter(Package.destination_warehouse_id.in_(staff_wh_ids))
    
    # Recherche
    if search:
        query = query.join(User, Package.client_id == User.id).filter(
            db.or_(
                Package.tracking_number.ilike(f'%{search}%'),
                User.first_name.ilike(f'%{search}%'),
                User.last_name.ilike(f'%{search}%'),
                User.phone.ilike(f'%{search}%')
            )
        )
    
    # Pagination
    packages = query.order_by(Package.updated_at.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )
    
    result = []
    for p in packages.items:
        client = User.query.get(p.client_id)
        result.append({
            'id': p.id,
            'tracking_number': p.tracking_number,
            'client_name': f"{client.first_name} {client.last_name}" if client else 'N/A',
            'client_phone': client.phone if client else '',
            'description': p.description[:50] + '...' if p.description and len(p.description) > 50 else p.description,
            'status': p.status,
            'amount': p.amount or 0,
            'paid_amount': p.paid_amount or 0,
            'remaining': (p.amount or 0) - (p.paid_amount or 0),
            'currency': p.amount_currency or 'XAF',
            'arrived_at': p.updated_at.isoformat() if p.updated_at else None
        })
    
    return jsonify({
        'packages': result,
        'pagination': {
            'page': page,
            'pages': packages.pages,
            'per_page': per_page,
            'total': packages.total
        }
    })


@bp.route('/search', methods=['POST'])
@admin_required
def search_package():
    """
    Recherche un colis pour retrait par tracking ou téléphone client
    """
    data = request.get_json()
    if not data or 'query' not in data:
        return jsonify({'error': 'Champ "query" requis'}), 400
    
    query = data['query'].strip()
    tenant_id = g.tenant_id
    
    if not query:
        return jsonify({'error': 'Requête de recherche vide'}), 400
    
    # Recherche par tracking number ou téléphone client
    package = None
    
    # Essayer par tracking number
    package = Package.query.filter_by(
        tenant_id=tenant_id,
        tracking_number=query
    ).first()
    
    # Si pas trouvé, essayer par téléphone client
    if not package:
        client = User.query.filter_by(
            tenant_id=tenant_id,
            phone=query,
            role='client'
        ).first()
        
        if client:
            # Prendre le dernier colis arrivé de ce client
            package = Package.query.filter_by(
                tenant_id=tenant_id,
                client_id=client.id
            ).filter(
                Package.status.in_(['arrived_port', 'customs', 'out_for_delivery'])
            ).order_by(Package.updated_at.desc()).first()
    
    if not package:
        return jsonify({'error': 'Colis non trouvé'}), 404

    if g.user_role == 'staff' and not can_process_pickup(g.user, package):
        return jsonify({'error': 'Colis non trouvé'}), 404
    
    # Vérifier si déjà retiré
    if package.status == 'delivered':
        existing_pickup = Pickup.query.filter_by(package_id=package.id).first()
        return jsonify({
            'error': 'Colis déjà retiré',
            'pickup_date': existing_pickup.picked_up_at.isoformat() if existing_pickup else None
        }), 400
    
    # Calculer les infos de paiement
    payment_info = {
        'total_amount': package.amount or 0,
        'paid_amount': package.paid_amount or 0,
        'remaining_amount': package.remaining_amount,
        'payment_required': package.remaining_amount > 0,
        'can_pickup': package.can_be_picked_up,
        'currency': package.amount_currency
    }
    
    return jsonify({
        'package': package.to_dict(include_client=True),
        'payment': payment_info
    })



@bp.route('/process', methods=['POST'])
@admin_required
def process_pickup():
    """
    Traite le retrait complet d'un colis avec paiement
    """
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Données requises'}), 400
    
    # Validation des champs requis
    if 'package_id' not in data:
        return jsonify({'error': 'Champ "package_id" requis'}), 400
    if 'pickup_by' not in data:
        return jsonify({'error': 'Champ "pickup_by" requis'}), 400
    
    package_id = data['package_id']
    pickup_by = data['pickup_by']  # 'client' ou 'proxy'
    tenant_id = g.tenant_id
    staff_id = g.user.id
    
    # Validation pickup_by
    if pickup_by not in ['client', 'proxy']:
        return jsonify({'error': 'pickup_by doit être "client" ou "proxy"'}), 400
    
    # Récupérer le colis
    package = Package.query.filter_by(
        id=package_id,
        tenant_id=tenant_id
    ).first()
    
    if not package:
        return jsonify({'error': 'Colis non trouvé'}), 404

    # Staff destination-only pour traiter un retrait
    if g.user_role == 'staff' and not can_process_pickup(g.user, package):
        return jsonify({'error': 'Accès refusé'}), 403
    
    if package.status == 'delivered':
        return jsonify({'error': 'Colis déjà retiré'}), 400
    
    if not package.can_be_picked_up:
        if package.remaining_amount > 0:
            return jsonify({
                'error': 'Paiement requis avant retrait',
                'remaining_amount': package.remaining_amount
            }), 400
        return jsonify({'error': 'Colis non disponible pour retrait'}), 400
    
    # Données du retireur
    proxy_data = {}
    if pickup_by == 'proxy':
        required_proxy_fields = ['proxy_name', 'proxy_phone', 'proxy_id_type', 'proxy_id_number']
        for field in required_proxy_fields:
            if field not in data:
                return jsonify({'error': f'Champ requis pour mandataire: {field}'}), 400
            proxy_data[field] = data[field]
    
    # Gestion du paiement si nécessaire
    payment_id = None
    payment_collected = 0
    
    if package.remaining_amount > 0:
        payment_data = data.get('payment', {})
        
        if not payment_data or 'method' not in payment_data:
            return jsonify({'error': 'Paiement requis (méthode manquante)'}), 400
        
        # Validation de la méthode de paiement
        valid_methods = ['cash', 'mobile_money', 'bank_transfer', 'card']
        if payment_data['method'] not in valid_methods:
            return jsonify({'error': f'Méthode de paiement invalide. Valeurs acceptées: {", ".join(valid_methods)}'}), 400
        
        payment_collected = package.remaining_amount
        
        # Créer le paiement
        payment = Payment(
            tenant_id=tenant_id,
            client_id=package.client_id,
            amount=payment_collected,
            currency=package.amount_currency,
            method=payment_data['method'],
            reference=payment_data.get('reference'),
            notes=f"Paiement au retrait - {package.tracking_number}",
            status='confirmed',
            created_by=staff_id
        )
        
        # Payeur externe si mandataire
        if pickup_by == 'proxy':
            payment.payer_name = proxy_data['proxy_name']
            payment.payer_phone = proxy_data['proxy_phone']
        
        db.session.add(payment)
        db.session.flush()  # Pour obtenir l'ID
        
        # Lier le paiement au colis
        package_payment = PackagePayment(
            payment_id=payment.id,
            package_id=package.id,
            amount=payment_collected
        )
        db.session.add(package_payment)
        
        # Mettre à jour le montant payé du colis
        package.paid_amount = (package.paid_amount or 0) + payment_collected
        payment_id = payment.id
    
    # Créer l'enregistrement de retrait
    pickup = Pickup(
        tenant_id=tenant_id,
        package_id=package.id,
        client_id=package.client_id,
        pickup_by=pickup_by,
        payment_id=payment_id,
        payment_required=package.remaining_amount > 0,
        payment_collected=payment_collected,
        payment_method=data.get('payment', {}).get('method'),
        payment_reference=data.get('payment', {}).get('reference'),
        warehouse_id=data.get('warehouse_id'),
        staff_id=staff_id,
        notes=data.get('notes'),
        **proxy_data
    )
    
    # Signature et photo
    if 'signature' in data and data['signature']:
        pickup.signature = data['signature']
    
    if 'photo_url' in data and data['photo_url']:
        pickup.photo_proof = data['photo_url']
    
    db.session.add(pickup)
    
    # Mettre à jour le statut du colis
    old_status = package.status
    package.status = 'delivered'
    package.delivered_at = datetime.utcnow()
    
    # Copier les infos de retrait dans le package (pour compatibilité)
    if pickup_by == 'proxy':
        package.picked_up_by = proxy_data['proxy_name']
        package.picked_up_by_phone = proxy_data['proxy_phone']
        package.picked_up_by_id_type = proxy_data['proxy_id_type']
        package.picked_up_by_id_number = proxy_data['proxy_id_number']
    else:
        package.picked_up_by = package.client.full_name
        package.picked_up_by_phone = package.client.phone
    
    package.picked_up_at = pickup.picked_up_at
    package.pickup_signature = pickup.signature
    package.pickup_photo = pickup.photo_proof
    package.pickup_notes = pickup.notes
    
    # Ajouter à l'historique
    history = PackageHistory(
        package_id=package.id,
        status='delivered',
        location=data.get('warehouse_id', 'Entrepôt'),
        notes=f"Retrait effectué par {pickup_by}",
        updated_by=staff_id
    )
    db.session.add(history)
    
    try:
        db.session.commit()
        
        logger.info(f"Retrait effectué: Package {package.tracking_number} par {pickup_by} (staff: {staff_id})")
        
        # ==================== NOTIFICATIONS AUTOMATIQUES ====================
        try:
            # Initialiser le service de notifications
            notification_service = NotificationService(tenant_id)
            
            # Préparer les variables pour les templates
            notification_vars = {
                'tracking': package.tracking_number,
                'client_name': package.client.full_name if package.client else 'Client',
                'pickup_date': pickup.picked_up_at.strftime('%d/%m/%Y %H:%M'),
                'pickup_by': pickup_by,
                'proxy_name': proxy_data.get('proxy_name', '') if pickup_by == 'proxy' else '',
                'amount_collected': f"{payment_collected:.0f}" if payment_collected > 0 else '0',
                'payment_method': data.get('payment', {}).get('method', '') if payment_collected > 0 else '',
                'warehouse': data.get('warehouse_id', 'Entrepôt principal')
            }
            
            # Envoyer la notification de retrait effectué
            notification_results = notification_service.send_event_notification(
                event_type='package_picked_up',
                user=package.client,
                variables=notification_vars,
                title='Colis retiré avec succès'
            )
            
            logger.info(f"Notifications envoyées pour retrait {package.tracking_number}: {notification_results}")
            
        except Exception as notif_error:
            logger.error(f"Erreur lors de l'envoi des notifications: {str(notif_error)}")
            # Ne pas échouer le retrait si les notifications échouent
        
        return jsonify({
            'success': True,
            'pickup': pickup.to_dict(include_package=True, include_client=True),
            'message': 'Retrait effectué avec succès'
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Erreur lors du retrait: {str(e)}")
        return jsonify({'error': 'Erreur lors du retrait'}), 500



@bp.route('/upload-signature', methods=['POST'])
@admin_required
def upload_signature():
    """
    Valide une signature en base64
    """
    data = request.get_json()
    if not data or 'signature' not in data:
        return jsonify({'error': 'Champ "signature" requis'}), 400
    
    # Valider le format base64
    try:
        signature_data = data['signature']
        if not signature_data.startswith('data:image/'):
            return jsonify({'error': 'Format de signature invalide (doit commencer par data:image/)'}), 400
        
        # Extraire les données base64
        if ',' not in signature_data:
            return jsonify({'error': 'Format de signature invalide (séparateur manquant)'}), 400
        
        header, encoded = signature_data.split(',', 1)
        decoded = base64.b64decode(encoded)
        
        # Vérifier la taille (max 500KB)
        if len(decoded) > 500 * 1024:
            return jsonify({'error': 'Signature trop volumineuse (max 500KB)'}), 400
        
        # La signature est valide, on la retourne
        return jsonify({
            'success': True,
            'signature': signature_data
        })
        
    except Exception as e:
        logger.error(f"Erreur validation signature: {str(e)}")
        return jsonify({'error': 'Signature invalide'}), 400


@bp.route('/upload-photo', methods=['POST'])
@admin_required
def upload_photo():
    """
    Upload d'une photo de preuve
    """
    if 'photo' not in request.files:
        return jsonify({'error': 'Aucune photo fournie'}), 400
    
    file = request.files['photo']
    if file.filename == '':
        return jsonify({'error': 'Aucune photo sélectionnée'}), 400
    
    # Valider le type de fichier
    allowed_extensions = {'png', 'jpg', 'jpeg', 'webp'}
    if not ('.' in file.filename and 
            file.filename.rsplit('.', 1)[1].lower() in allowed_extensions):
        return jsonify({'error': f'Type de fichier non autorisé. Formats acceptés: {", ".join(allowed_extensions)}'}), 400
    
    # Vérifier la taille (max 5MB)
    file.seek(0, os.SEEK_END)
    file_size = file.tell()
    file.seek(0)
    
    if file_size > 5 * 1024 * 1024:
        return jsonify({'error': 'Photo trop volumineuse (max 5MB)'}), 400
    
    try:
        # Générer un nom unique
        import uuid
        ext = file.filename.rsplit('.', 1)[1].lower()
        filename = f"pickup_{uuid.uuid4().hex}.{ext}"
        
        # Créer le dossier s'il n'existe pas
        upload_dir = os.path.join(current_app.instance_path, 'uploads', 'pickups')
        os.makedirs(upload_dir, exist_ok=True)
        
        # Sauvegarder le fichier
        filepath = os.path.join(upload_dir, filename)
        file.save(filepath)
        
        # Retourner l'URL relative
        photo_url = f"/uploads/pickups/{filename}"
        
        logger.info(f"Photo de retrait uploadée: {filename}")
        
        return jsonify({
            'success': True,
            'photo_url': photo_url
        })
        
    except Exception as e:
        logger.error(f"Erreur upload photo: {str(e)}")
        return jsonify({'error': 'Erreur lors de l\'upload'}), 500


@bp.route('/history', methods=['GET'])
@admin_required
def pickup_history():
    """
    Historique des retraits
    """
    tenant_id = g.tenant_id
    page = request.args.get('page', 1, type=int)
    per_page = min(request.args.get('per_page', 20, type=int), 100)
    
    # Filtres
    client_id = request.args.get('client_id')
    date_from = request.args.get('date_from')
    date_to = request.args.get('date_to')
    search = request.args.get('search')
    
    query = Pickup.query.filter_by(tenant_id=tenant_id)
    
    if client_id:
        query = query.filter_by(client_id=client_id)
    
    if date_from:
        try:
            date_from_dt = datetime.fromisoformat(date_from.replace('Z', '+00:00'))
            query = query.filter(Pickup.picked_up_at >= date_from_dt)
        except ValueError:
            pass
    
    if date_to:
        try:
            date_to_dt = datetime.fromisoformat(date_to.replace('Z', '+00:00'))
            query = query.filter(Pickup.picked_up_at <= date_to_dt)
        except ValueError:
            pass
    
    if search:
        # Recherche sur tracking number, nom ou téléphone client
        query = query.join(Package).join(User, Pickup.client_id == User.id).filter(
            db.or_(
                Package.tracking_number.ilike(f'%{search}%'),
                User.first_name.ilike(f'%{search}%'),
                User.last_name.ilike(f'%{search}%'),
                User.phone.ilike(f'%{search}%')
            )
        )
    
    # Pagination
    pickups = query.order_by(Pickup.picked_up_at.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )
    
    return jsonify({
        'pickups': [p.to_dict(include_package=True, include_client=True) for p in pickups.items],
        'pagination': {
            'page': page,
            'pages': pickups.pages,
            'per_page': per_page,
            'total': pickups.total
        }
    })


@bp.route('/qr/<tracking_number>', methods=['GET'])
@admin_required
def generate_qr_code(tracking_number):
    """
    Génère un QR code pour un colis (contient le tracking number)
    """
    tenant_id = g.tenant_id
    
    # Vérifier que le colis existe et appartient au tenant
    package = Package.query.filter_by(
        tenant_id=tenant_id,
        tracking_number=tracking_number
    ).first()
    
    if not package:
        return jsonify({'error': 'Colis non trouvé'}), 404
    
    try:
        # Créer le QR code
        qr = qrcode.QRCode(
            version=1,
            error_correction=ERROR_CORRECT_L,
            box_size=10,
            border=4,
        )
        
        # Ajouter les données au QR code
        qr_data = {
            'tracking': tracking_number,
            'tenant_id': tenant_id,
            'package_id': package.id
        }
        
        import json
        qr.add_data(json.dumps(qr_data))
        qr.make(fit=True)
        
        # Créer l'image
        img = qr.make_image(fill_color="black", back_color="white")
        
        # Convertir en base64
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        buffer.seek(0)
        
        img_base64 = base64.b64encode(buffer.getvalue()).decode()
        img_data_url = f"data:image/png;base64,{img_base64}"
        
        buffer.close()
        
        return jsonify({
            'success': True,
            'qr_code': img_data_url,
            'tracking_number': tracking_number,
            'package_id': package.id
        })
        
    except Exception as e:
        logger.error(f"Erreur génération QR code: {str(e)}")
        return jsonify({'error': 'Erreur lors de la génération du QR code'}), 500


@bp.route('/scan', methods=['POST'])
@admin_required
def scan_qr_code():
    """
    Traite le scan d'un QR code pour identifier un colis
    """
    data = request.get_json()
    
    if not data or 'qr_data' not in data:
        return jsonify({'error': 'Données QR code requises'}), 400
    
    tenant_id = g.tenant_id
    
    try:
        # Décoder les données QR
        import json
        qr_data = json.loads(data['qr_data'])
        
        tracking_number = qr_data.get('tracking')
        package_id = qr_data.get('package_id')
        qr_tenant_id = qr_data.get('tenant_id')
        
        # Vérifier que le tenant correspond
        if qr_tenant_id != tenant_id:
            return jsonify({'error': 'QR code invalide pour ce tenant'}), 403
        
        # Récupérer le colis
        package = None
        if package_id:
            package = Package.query.filter_by(
                id=package_id,
                tenant_id=tenant_id
            ).first()
        elif tracking_number:
            package = Package.query.filter_by(
                tenant_id=tenant_id,
                tracking_number=tracking_number
            ).first()
        
        if not package:
            return jsonify({'error': 'Colis non trouvé'}), 404
        
        # Vérifier si déjà retiré
        if package.status == 'delivered':
            existing_pickup = Pickup.query.filter_by(package_id=package.id).first()
            return jsonify({
                'error': 'Colis déjà retiré',
                'pickup_date': existing_pickup.picked_up_at.isoformat() if existing_pickup else None
            }), 400
        
        # Vérifier si disponible pour retrait
        if not package.can_be_picked_up:
            if package.remaining_amount > 0:
                return jsonify({
                    'error': 'Paiement requis avant retrait',
                    'remaining_amount': package.remaining_amount
                }), 400
            return jsonify({'error': 'Colis non disponible pour retrait'}), 400
        
        # Retourner les informations du colis pour le retrait
        payment_info = {
            'total_amount': package.amount or 0,
            'paid_amount': package.paid_amount or 0,
            'remaining_amount': package.remaining_amount,
            'payment_required': package.remaining_amount > 0,
            'can_pickup': package.can_be_picked_up,
            'currency': package.amount_currency
        }
        
        return jsonify({
            'success': True,
            'package': package.to_dict(include_client=True),
            'payment': payment_info,
            'message': 'Colis identifié avec succès'
        })
        
    except json.JSONDecodeError:
        return jsonify({'error': 'QR code invalide'}), 400
    except Exception as e:
        logger.error(f"Erreur scan QR code: {str(e)}")
        return jsonify({'error': 'Erreur lors du traitement du QR code'}), 500


@bp.route('/<pickup_id>/pdf', methods=['GET'])
@admin_required
def generate_pickup_pdf(pickup_id):
    """
    Génère un PDF de reçu pour un retrait
    """
    tenant_id = g.tenant_id
    
    # Récupérer le retrait
    pickup = Pickup.query.filter_by(
        id=pickup_id,
        tenant_id=tenant_id
    ).first()
    
    if not pickup:
        return jsonify({'error': 'Retrait non trouvé'}), 404
    
    try:
        # Créer le buffer PDF
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4)
        
        # Styles
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=24,
            spaceAfter=30,
            alignment=1  # Centré
        )
        heading_style = ParagraphStyle(
            'CustomHeading',
            parent=styles['Heading2'],
            fontSize=14,
            spaceAfter=12
        )
        normal_style = styles['Normal']
        
        # Contenu du PDF
        story = []
        
        # Titre
        story.append(Paragraph("REÇU DE RETRAIT", title_style))
        story.append(Spacer(1, 20))
        
        # Informations du retrait
        pickup_data = [
            ['Numéro de suivi:', pickup.package.tracking_number],
            ['Date de retrait:', pickup.picked_up_at.strftime('%d/%m/%Y %H:%M')],
            ['Entrepôt:', pickup.warehouse_id or 'Entrepôt principal'],
            ['Retiré par:', 'Client' if pickup.pickup_by == 'client' else f'Mandataire: {pickup.proxy_name}'],
        ]
        
        if pickup.pickup_by == 'proxy':
            pickup_data.extend([
                ['Nom du mandataire:', pickup.proxy_name],
                ['Téléphone:', pickup.proxy_phone],
                ['Type d\'ID:', pickup.proxy_id_type],
                ['Numéro d\'ID:', pickup.proxy_id_number],
            ])
        
        pickup_table = Table(pickup_data, colWidths=[2*inch, 4*inch])
        pickup_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), colors.grey),
            ('TEXTCOLOR', (0, 0), (0, -1), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
            ('BACKGROUND', (1, 0), (1, -1), colors.beige),
            ('GRID', (0, 0), (-1, -1), 1, colors.black)
        ]))
        
        story.append(pickup_table)
        story.append(Spacer(1, 20))
        
        # Informations du colis
        story.append(Paragraph("INFORMATIONS DU COLIS", heading_style))
        
        package_data = [
            ['Description:', pickup.package.description],
            ['Client:', f"{pickup.client.first_name} {pickup.client.last_name}"],
            ['Téléphone client:', pickup.client.phone or 'N/A'],
        ]
        
        package_table = Table(package_data, colWidths=[2*inch, 4*inch])
        package_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), colors.grey),
            ('TEXTCOLOR', (0, 0), (0, -1), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
            ('BACKGROUND', (1, 0), (1, -1), colors.beige),
            ('GRID', (0, 0), (-1, -1), 1, colors.black)
        ]))
        
        story.append(package_table)
        story.append(Spacer(1, 20))
        
        # Informations de paiement si applicable
        if pickup.payment_required and pickup.payment_collected > 0:
            story.append(Paragraph("PAIEMENT", heading_style))
            
            payment_data = [
                ['Montant collecté:', f"{pickup.payment_collected:.0f} {pickup.package.amount_currency or 'XAF'}"],
                ['Méthode:', pickup.payment_method],
                ['Référence:', pickup.payment_reference or 'N/A'],
            ]
            
            payment_table = Table(payment_data, colWidths=[2*inch, 4*inch])
            payment_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (0, -1), colors.grey),
                ('TEXTCOLOR', (0, 0), (0, -1), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 10),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
                ('BACKGROUND', (1, 0), (1, -1), colors.beige),
                ('GRID', (0, 0), (-1, -1), 1, colors.black)
            ]))
            
            story.append(payment_table)
            story.append(Spacer(1, 20))
        
        # Notes si présentes
        if pickup.notes:
            story.append(Paragraph("NOTES", heading_style))
            story.append(Paragraph(pickup.notes, normal_style))
            story.append(Spacer(1, 20))
        
        # Signature
        story.append(Paragraph("SIGNATURE", heading_style))
        if pickup.signature:
            story.append(Paragraph("Signature numérique présente ✓", normal_style))
        else:
            story.append(Paragraph("Signature non fournie", normal_style))
        
        story.append(Spacer(1, 30))
        
        # Pied de page
        footer_text = f"""
        <br/><br/>
        <hr/>
        <para align="center" fontSize="8" textColor="gray">
        Reçu généré le {datetime.now().strftime('%d/%m/%Y %H:%M')}<br/>
        Express Cargo - Système de gestion logistique<br/>
        ID du retrait: {pickup.id}
        </para>
        """
        
        story.append(Paragraph(footer_text, normal_style))
        
        # Générer le PDF
        doc.build(story)
        
        # Préparer la réponse
        buffer.seek(0)
        pdf_data = buffer.getvalue()
        buffer.close()
        
        response = make_response(pdf_data)
        response.headers['Content-Type'] = 'application/pdf'
        response.headers['Content-Disposition'] = f'inline; filename=retrait_{pickup.package.tracking_number}.pdf'
        response.headers['Content-Length'] = len(pdf_data)
        
        return response
        
    except Exception as e:
        logger.error(f"Erreur génération PDF: {str(e)}")
        return jsonify({'error': 'Erreur lors de la génération du PDF'}), 500


@bp.route('/<pickup_id>', methods=['GET'])
@admin_required
def get_pickup(pickup_id):
    """
    Détails d'un retrait
    """
    pickup = Pickup.query.filter_by(
        id=pickup_id,
        tenant_id=g.tenant_id
    ).first()
    
    if not pickup:
        return jsonify({'error': 'Retrait non trouvé'}), 404
    
    return jsonify({
        'pickup': pickup.to_dict(include_package=True, include_client=True)
    })
