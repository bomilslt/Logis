"""
Routes Admin - Gestion des Factures
====================================

CRUD complet pour les factures clients.
Génération de numéros uniques et gestion des statuts.
"""

from flask import request, jsonify, g
from flask_jwt_extended import get_jwt_identity
from app import db
from app.models import Invoice, Package, User, Tenant
from app.routes.admin import admin_bp
from app.utils.decorators import admin_required, module_required
from datetime import datetime, date, timedelta
import logging
from sqlalchemy import or_

logger = logging.getLogger(__name__)


def _get_staff_wh_ids():
    return getattr(g, 'staff_warehouse_ids', None) or ([] if not getattr(g, 'staff_warehouse_id', None) else [getattr(g, 'staff_warehouse_id')])


def _staff_can_access_package(pkg: Package) -> bool:
    staff_wh_ids = _get_staff_wh_ids()
    if not staff_wh_ids or not pkg:
        return False
    return pkg.origin_warehouse_id in staff_wh_ids or pkg.destination_warehouse_id in staff_wh_ids


def generate_invoice_number(tenant_id: str) -> str:
    """Génère un numéro de facture unique"""
    year = datetime.utcnow().year
    
    # Trouver le dernier numéro pour ce tenant et cette année
    pattern = f"INV-{year}-%"
    last_invoice = Invoice.query.filter(
        Invoice.tenant_id == tenant_id,
        Invoice.invoice_number.like(pattern)
    ).order_by(Invoice.invoice_number.desc()).first()
    
    if last_invoice:
        try:
            last_seq = int(last_invoice.invoice_number.split('-')[-1])
            next_seq = last_seq + 1
        except (ValueError, IndexError):
            next_seq = Invoice.query.filter_by(tenant_id=tenant_id).count() + 1
    else:
        next_seq = 1
    
    return f"INV-{year}-{next_seq:05d}"


def validate_invoice_data(data: dict, is_update: bool = False) -> tuple[bool, str]:
    """Valide les données d'une facture"""
    if not is_update:
        if not data.get('client_id'):
            return False, 'Client requis'
        if not data.get('description'):
            return False, 'Description requise'
        if not data.get('amount'):
            return False, 'Montant requis'
    
    # Validation montant
    if 'amount' in data:
        try:
            amount = float(data['amount'])
            if amount <= 0:
                return False, 'Le montant doit être positif'
            if amount > 100000000:  # 100 millions max
                return False, 'Montant trop élevé'
        except (ValueError, TypeError):
            return False, 'Montant invalide'
    
    # Validation statut
    valid_statuses = ['draft', 'sent', 'paid', 'cancelled']
    if data.get('status') and data['status'] not in valid_statuses:
        return False, f'Statut invalide. Valeurs: {", ".join(valid_statuses)}'
    
    return True, ''


@admin_bp.route('/invoices', methods=['GET'])
@module_required('finance')
def get_invoices():
    """
    Liste des factures avec filtres
    
    Query params:
        - status: draft, sent, paid, cancelled
        - client_id: Filtrer par client
        - from_date, to_date: Période
        - page, per_page: Pagination
    """
    tenant_id = g.tenant_id
    
    status = request.args.get('status')
    client_id = request.args.get('client_id')
    from_date = request.args.get('from_date')
    to_date = request.args.get('to_date')
    page = request.args.get('page', 1, type=int)
    per_page = min(request.args.get('per_page', 20, type=int), 100)
    
    query = Invoice.query.filter_by(tenant_id=tenant_id)
    if g.user_role == 'staff':
        staff_wh_ids = _get_staff_wh_ids()
        if not staff_wh_ids:
            return jsonify({'invoices': [], 'total': 0, 'pages': 0, 'current_page': page})
        query = query.join(Package, Invoice.package_id == Package.id).filter(
            Package.tenant_id == tenant_id,
            or_(
                Package.origin_warehouse_id.in_(staff_wh_ids),
                Package.destination_warehouse_id.in_(staff_wh_ids),
            )
        )
    
    if status:
        query = query.filter_by(status=status)
    
    if client_id:
        query = query.filter_by(client_id=client_id)
    
    if from_date:
        try:
            from_dt = datetime.strptime(from_date, '%Y-%m-%d').date()
            query = query.filter(Invoice.issue_date >= from_dt)
        except ValueError:
            pass
    
    if to_date:
        try:
            to_dt = datetime.strptime(to_date, '%Y-%m-%d').date()
            query = query.filter(Invoice.issue_date <= to_dt)
        except ValueError:
            pass
    
    query = query.order_by(Invoice.created_at.desc())
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)
    
    return jsonify({
        'invoices': [i.to_dict() for i in pagination.items],
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': page
    })


@admin_bp.route('/invoices/<invoice_id>', methods=['GET'])
@module_required('finance')
def get_invoice(invoice_id):
    """Détails d'une facture"""
    tenant_id = g.tenant_id
    
    invoice = Invoice.query.filter_by(
        id=invoice_id,
        tenant_id=tenant_id
    ).first()
    
    if not invoice:
        return jsonify({'error': 'Facture non trouvée'}), 404

    if g.user_role == 'staff':
        if not invoice.package or not _staff_can_access_package(invoice.package):
            return jsonify({'error': 'Accès refusé'}), 403
    
    return jsonify({'invoice': invoice.to_dict()})


@admin_bp.route('/invoices', methods=['POST'])
@module_required('finance')
def create_invoice():
    """Créer une nouvelle facture"""
    tenant_id = g.tenant_id
    user_id = get_jwt_identity()
    
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Données JSON requises'}), 400
    
    # Validation
    is_valid, error_msg = validate_invoice_data(data)
    if not is_valid:
        return jsonify({'error': error_msg}), 400
    
    # Vérifier que le client existe
    client = User.query.filter_by(
        id=data['client_id'],
        tenant_id=tenant_id
    ).first()
    
    if not client:
        return jsonify({'error': 'Client non trouvé'}), 404
    
    # Vérifier le colis si fourni
    package_id = data.get('package_id')
    if package_id:
        package = Package.query.filter_by(
            id=package_id,
            tenant_id=tenant_id
        ).first()
        if not package:
            return jsonify({'error': 'Colis non trouvé'}), 404

        if g.user_role == 'staff' and not _staff_can_access_package(package):
            return jsonify({'error': 'Accès refusé'}), 403
    
    try:
        # Générer numéro de facture
        invoice_number = generate_invoice_number(tenant_id)
        
        # Date d'échéance par défaut: 30 jours
        issue_date = date.today()
        due_date = data.get('due_date')
        if due_date:
            due_date = datetime.strptime(due_date, '%Y-%m-%d').date()
        else:
            due_date = issue_date + timedelta(days=30)
        
        invoice = Invoice(
            tenant_id=tenant_id,
            client_id=data['client_id'],
            invoice_number=invoice_number,
            package_id=package_id,
            description=data['description'].strip()[:1000],
            amount=float(data['amount']),
            currency=data.get('currency', 'XAF')[:3].upper(),
            status='draft',
            issue_date=issue_date,
            due_date=due_date,
            notes=data.get('notes', '').strip()[:500] or None,
            created_by=user_id
        )
        
        db.session.add(invoice)
        db.session.commit()
        
        logger.info(f"Facture créée: {invoice_number} pour client {client.full_name}")
        
        return jsonify({
            'message': 'Facture créée',
            'invoice': invoice.to_dict()
        }), 201
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Erreur création facture: {str(e)}")
        return jsonify({'error': 'Erreur lors de la création'}), 500


@admin_bp.route('/invoices/<invoice_id>', methods=['PUT'])
@module_required('finance')
def update_invoice(invoice_id):
    """Modifier une facture (seulement si draft)"""
    tenant_id = g.tenant_id
    
    invoice = Invoice.query.filter_by(
        id=invoice_id,
        tenant_id=tenant_id
    ).first()
    
    if not invoice:
        return jsonify({'error': 'Facture non trouvée'}), 404
    
    if invoice.status != 'draft':
        return jsonify({'error': 'Seules les factures en brouillon peuvent être modifiées'}), 403
    
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Données JSON requises'}), 400
    
    is_valid, error_msg = validate_invoice_data(data, is_update=True)
    if not is_valid:
        return jsonify({'error': error_msg}), 400
    
    try:
        if 'description' in data:
            invoice.description = data['description'].strip()[:1000]
        if 'amount' in data:
            invoice.amount = float(data['amount'])
        if 'currency' in data:
            invoice.currency = data['currency'][:3].upper()
        if 'due_date' in data:
            invoice.due_date = datetime.strptime(data['due_date'], '%Y-%m-%d').date()
        if 'notes' in data:
            invoice.notes = data['notes'].strip()[:500] or None
        if 'package_id' in data:
            if data['package_id']:
                package = Package.query.filter_by(
                    id=data['package_id'],
                    tenant_id=tenant_id
                ).first()
                if not package:
                    return jsonify({'error': 'Colis non trouvé'}), 404

                if g.user_role == 'staff' and not _staff_can_access_package(package):
                    return jsonify({'error': 'Accès refusé'}), 403
            invoice.package_id = data['package_id'] or None
        
        db.session.commit()
        
        return jsonify({
            'message': 'Facture mise à jour',
            'invoice': invoice.to_dict()
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Erreur mise à jour facture: {str(e)}")
        return jsonify({'error': 'Erreur lors de la mise à jour'}), 500


@admin_bp.route('/invoices/<invoice_id>', methods=['DELETE'])
@module_required('finance')
def delete_invoice(invoice_id):
    """Supprimer une facture (seulement si draft)"""
    tenant_id = g.tenant_id
    
    invoice = Invoice.query.filter_by(
        id=invoice_id,
        tenant_id=tenant_id
    ).first()
    
    if not invoice:
        return jsonify({'error': 'Facture non trouvée'}), 404
    
    if invoice.status != 'draft':
        return jsonify({'error': 'Seules les factures en brouillon peuvent être supprimées'}), 403
    
    try:
        db.session.delete(invoice)
        db.session.commit()
        
        logger.info(f"Facture supprimée: {invoice.invoice_number}")
        
        return jsonify({'message': 'Facture supprimée'})
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Erreur lors de la suppression'}), 500


@admin_bp.route('/invoices/<invoice_id>/send', methods=['POST'])
@module_required('finance')
def send_invoice(invoice_id):
    """Envoyer une facture au client (change statut en 'sent')"""
    tenant_id = g.tenant_id
    
    invoice = Invoice.query.filter_by(
        id=invoice_id,
        tenant_id=tenant_id
    ).first()
    
    if not invoice:
        return jsonify({'error': 'Facture non trouvée'}), 404
    
    if invoice.status not in ['draft']:
        return jsonify({'error': 'Cette facture a déjà été envoyée'}), 403
    
    try:
        invoice.status = 'sent'
        db.session.commit()
        
        # TODO: Envoyer notification au client (email/SMS)
        
        logger.info(f"Facture envoyée: {invoice.invoice_number}")
        
        return jsonify({
            'message': 'Facture envoyée',
            'invoice': invoice.to_dict()
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Erreur lors de l\'envoi'}), 500


@admin_bp.route('/invoices/<invoice_id>/pay', methods=['POST'])
@module_required('finance')
def mark_invoice_paid(invoice_id):
    """Marquer une facture comme payée"""
    tenant_id = g.tenant_id
    
    invoice = Invoice.query.filter_by(
        id=invoice_id,
        tenant_id=tenant_id
    ).first()
    
    if not invoice:
        return jsonify({'error': 'Facture non trouvée'}), 404
    
    if invoice.status == 'paid':
        return jsonify({'error': 'Cette facture est déjà payée'}), 400
    
    if invoice.status == 'cancelled':
        return jsonify({'error': 'Impossible de payer une facture annulée'}), 403
    
    try:
        invoice.mark_paid()
        
        # Si liée à un colis, mettre à jour le paiement du colis
        if invoice.package:
            invoice.package.paid_amount = (invoice.package.paid_amount or 0) + invoice.amount
        
        db.session.commit()
        
        logger.info(f"Facture payée: {invoice.invoice_number}")
        
        return jsonify({
            'message': 'Facture marquée comme payée',
            'invoice': invoice.to_dict()
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Erreur lors du marquage'}), 500


@admin_bp.route('/invoices/<invoice_id>/cancel', methods=['POST'])
@module_required('finance')
def cancel_invoice(invoice_id):
    """Annuler une facture"""
    tenant_id = g.tenant_id
    
    invoice = Invoice.query.filter_by(
        id=invoice_id,
        tenant_id=tenant_id
    ).first()
    
    if not invoice:
        return jsonify({'error': 'Facture non trouvée'}), 404
    
    if invoice.status == 'paid':
        return jsonify({'error': 'Impossible d\'annuler une facture payée'}), 403
    
    try:
        invoice.cancel()
        db.session.commit()
        
        logger.info(f"Facture annulée: {invoice.invoice_number}")
        
        return jsonify({
            'message': 'Facture annulée',
            'invoice': invoice.to_dict()
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Erreur lors de l\'annulation'}), 500


@admin_bp.route('/invoices/stats', methods=['GET'])
@module_required('finance')
def get_invoice_stats():
    """Statistiques des factures"""
    tenant_id = g.tenant_id
    
    # Période (défaut: mois en cours)
    from_date = request.args.get('from_date')
    to_date = request.args.get('to_date')
    
    if not from_date:
        from_date = date.today().replace(day=1)
    else:
        from_date = datetime.strptime(from_date, '%Y-%m-%d').date()
    
    if not to_date:
        to_date = date.today()
    else:
        to_date = datetime.strptime(to_date, '%Y-%m-%d').date()
    
    base_query = Invoice.query.filter(
        Invoice.tenant_id == tenant_id,
        Invoice.issue_date >= from_date,
        Invoice.issue_date <= to_date
    )
    
    # Totaux par statut
    stats = {
        'period': {
            'from': from_date.isoformat(),
            'to': to_date.isoformat()
        },
        'total_count': base_query.count(),
        'total_amount': db.session.query(db.func.sum(Invoice.amount)).filter(
            Invoice.tenant_id == tenant_id,
            Invoice.issue_date >= from_date,
            Invoice.issue_date <= to_date
        ).scalar() or 0,
        'by_status': {}
    }
    
    for status in ['draft', 'sent', 'paid', 'cancelled']:
        status_query = base_query.filter_by(status=status)
        stats['by_status'][status] = {
            'count': status_query.count(),
            'amount': db.session.query(db.func.sum(Invoice.amount)).filter(
                Invoice.tenant_id == tenant_id,
                Invoice.issue_date >= from_date,
                Invoice.issue_date <= to_date,
                Invoice.status == status
            ).scalar() or 0
        }
    
    return jsonify({'stats': stats})
