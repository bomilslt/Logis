"""
Routes Admin - Exports PDF et Excel
====================================

Endpoints pour générer et télécharger des documents.
"""

from flask import request, jsonify, g, Response
from flask_jwt_extended import get_jwt_identity
from app import db
from app.models import Package, Invoice, Departure, Tenant, TenantConfig
from app.routes.admin import admin_bp
from app.utils.decorators import admin_required
from app.services.export_service import PDFGenerator, ExcelGenerator
from datetime import datetime
import logging
from sqlalchemy import or_

logger = logging.getLogger(__name__)


def _get_staff_wh_ids():
    return getattr(g, 'staff_warehouse_ids', None) or ([] if not getattr(g, 'staff_warehouse_id', None) else [getattr(g, 'staff_warehouse_id')])


def _apply_staff_package_scope(query):
    if g.user_role != 'staff':
        return query
    staff_wh_ids = _get_staff_wh_ids()
    if not staff_wh_ids:
        return query.filter(db.text('1=0'))
    return query.filter(
        or_(
            Package.origin_warehouse_id.in_(staff_wh_ids),
            Package.destination_warehouse_id.in_(staff_wh_ids),
        )
    )


def get_tenant_info(tenant_id: str) -> dict:
    """Récupère les infos du tenant pour les documents (logo, header, footer, etc.)"""
    tenant = Tenant.query.get(tenant_id)
    if not tenant:
        return {}
    
    info = {
        'name': tenant.name,
        'email': tenant.email,
        'phone': tenant.phone,
        'address': tenant.address,
        # Valeurs par défaut pour les documents
        'logo': None,
        'header': '',
        'footer': '',
        'show_logo': True,
        'primary_color': '#2563eb',
        'export_footer': ''
    }
    
    # Récupérer la config principale du tenant (contient invoice, export, etc.)
    config = TenantConfig.query.filter_by(tenant_id=tenant_id).first()
    
    if config and config.config_data:
        # Config company
        if config.config_data.get('company'):
            info.update(config.config_data['company'])
        
        # Config invoice (logo, header, footer, couleur)
        invoice_config = config.config_data.get('invoice', {})
        if invoice_config:
            info['logo'] = invoice_config.get('logo', info['logo'])
            info['header'] = invoice_config.get('header', info['header'])
            info['footer'] = invoice_config.get('footer', info['footer'])
            info['show_logo'] = invoice_config.get('show_logo', info['show_logo'])
            info['primary_color'] = invoice_config.get('primary_color', info['primary_color'])
            
            # Log pour debug
            logger.info(f"[Export] Invoice config loaded - Logo: {'Yes' if info['logo'] else 'No'}, Color: {info['primary_color']}")
        
        # Config export
        export_config = config.config_data.get('export', {})
        if export_config:
            info['export_footer'] = export_config.get('footer', info['export_footer'])
    else:
        logger.warning(f"[Export] No config found for tenant {tenant_id}")
    
    return info


# ==================== PDF EXPORTS ====================

@admin_bp.route('/exports/invoice/<invoice_id>/pdf', methods=['GET'])
@admin_required
def export_invoice_pdf(invoice_id):
    """Génère et télécharge le PDF d'une facture"""
    tenant_id = g.tenant_id
    
    invoice = Invoice.query.filter_by(
        id=invoice_id,
        tenant_id=tenant_id
    ).first()
    
    if not invoice:
        return jsonify({'error': 'Facture non trouvée'}), 404

    if g.user_role == 'staff' and invoice.package:
        staff_wh_ids = _get_staff_wh_ids()
        if not staff_wh_ids:
            return jsonify({'error': 'Accès refusé'}), 403
        pkg = invoice.package
        if pkg.origin_warehouse_id not in staff_wh_ids and pkg.destination_warehouse_id not in staff_wh_ids:
            return jsonify({'error': 'Accès refusé'}), 403
    
    tenant_info = get_tenant_info(tenant_id)
    
    pdf_gen = PDFGenerator(tenant_info.get('name', 'Express Cargo'))
    result = pdf_gen.generate_invoice_pdf(invoice.to_dict(), tenant_info)
    
    if not result.success:
        return jsonify({'error': result.error or 'Erreur génération PDF'}), 500
    
    return Response(
        result.data,
        mimetype=result.content_type,
        headers={
            'Content-Disposition': f'attachment; filename="{result.filename}"',
            'Content-Length': len(result.data)
        }
    )


@admin_bp.route('/exports/package/<package_id>/label', methods=['GET'])
@admin_required
def export_package_label(package_id):
    """Génère et télécharge l'étiquette d'un colis"""
    tenant_id = g.tenant_id
    
    package = Package.query.filter_by(
        id=package_id,
        tenant_id=tenant_id
    ).first()
    
    if not package:
        return jsonify({'error': 'Colis non trouvé'}), 404

    if g.user_role == 'staff':
        staff_wh_ids = _get_staff_wh_ids()
        if not staff_wh_ids:
            return jsonify({'error': 'Accès refusé'}), 403
        if package.origin_warehouse_id not in staff_wh_ids and package.destination_warehouse_id not in staff_wh_ids:
            return jsonify({'error': 'Accès refusé'}), 403
    
    tenant_info = get_tenant_info(tenant_id)
    
    pdf_gen = PDFGenerator(tenant_info.get('name', 'Express Cargo'))
    result = pdf_gen.generate_package_label_pdf(package.to_dict(include_client=True), tenant_info)
    
    if not result.success:
        return jsonify({'error': result.error or 'Erreur génération étiquette'}), 500
    
    return Response(
        result.data,
        mimetype=result.content_type,
        headers={
            'Content-Disposition': f'attachment; filename="{result.filename}"',
            'Content-Length': len(result.data)
        }
    )


@admin_bp.route('/exports/packages/labels', methods=['POST'])
@admin_required
def export_multiple_labels():
    """
    Génère les étiquettes de plusieurs colis
    
    Body JSON:
        - package_ids: Liste des IDs de colis
    """
    tenant_id = g.tenant_id
    data = request.get_json()
    
    package_ids = data.get('package_ids', [])
    if not package_ids:
        return jsonify({'error': 'Liste de colis requise'}), 400
    
    # Pour l'instant, on génère un ZIP ou on retourne une erreur
    # TODO: Implémenter génération multi-pages ou ZIP
    
    return jsonify({'error': 'Export multiple non encore implémenté. Utilisez l\'export individuel.'}), 501


# ==================== EXCEL EXPORTS ====================

@admin_bp.route('/exports/packages/excel', methods=['GET'])
@admin_required
def export_packages_excel():
    """
    Exporte les colis en Excel
    
    Query params:
        - status: Filtrer par statut
        - from_date, to_date: Période
        - client_id: Filtrer par client
        - departure_id: Filtrer par départ
    """
    tenant_id = g.tenant_id
    
    # Filtres
    status = request.args.get('status')
    client_id = request.args.get('client_id')
    departure_id = request.args.get('departure_id')
    from_date = request.args.get('from_date')
    to_date = request.args.get('to_date')
    
    query = Package.query.filter_by(tenant_id=tenant_id)
    query = _apply_staff_package_scope(query)
    
    if status:
        query = query.filter_by(status=status)
    if client_id:
        query = query.filter_by(client_id=client_id)
    if departure_id:
        query = query.filter_by(departure_id=departure_id)
    
    if from_date:
        try:
            from_dt = datetime.strptime(from_date, '%Y-%m-%d')
            query = query.filter(Package.created_at >= from_dt)
        except ValueError:
            pass
    
    if to_date:
        try:
            to_dt = datetime.strptime(to_date, '%Y-%m-%d')
            query = query.filter(Package.created_at <= to_dt)
        except ValueError:
            pass
    
    # Limiter à 10000 lignes max
    packages = query.order_by(Package.created_at.desc()).limit(10000).all()
    
    if not packages:
        return jsonify({'error': 'Aucun colis à exporter'}), 404
    
    excel_gen = ExcelGenerator()
    result = excel_gen.generate_packages_excel(
        [p.to_dict(include_client=True) for p in packages]
    )
    
    if not result.success:
        return jsonify({'error': result.error or 'Erreur génération Excel'}), 500
    
    logger.info(f"Export Excel colis: {len(packages)} lignes")
    
    return Response(
        result.data,
        mimetype=result.content_type,
        headers={
            'Content-Disposition': f'attachment; filename="{result.filename}"',
            'Content-Length': len(result.data)
        }
    )


@admin_bp.route('/exports/packages', methods=['POST'])
@admin_required
def export_packages():
    """
    Exporte les colis en Excel ou PDF
    
    Body JSON:
        - format: 'excel' ou 'pdf'
        - status: Filtrer par statut
        - from_date, to_date: Période
        - client_id: Filtrer par client
        - departure_id: Filtrer par départ
    """
    tenant_id = g.tenant_id
    data = request.get_json()
    
    if not data or 'format' not in data:
        return jsonify({'error': 'Format requis (excel ou pdf)'}), 400
    
    format_type = data.get('format')
    if format_type not in ['excel', 'pdf']:
        return jsonify({'error': 'Format invalide. Utilisez excel ou pdf'}), 400
    
    # Filtres
    status = data.get('status')
    client_id = data.get('client_id')
    departure_id = data.get('departure_id')
    from_date = data.get('from_date')
    to_date = data.get('to_date')
    
    query = Package.query.filter_by(tenant_id=tenant_id)
    query = _apply_staff_package_scope(query)
    
    if status:
        query = query.filter_by(status=status)
    if client_id:
        query = query.filter_by(client_id=client_id)
    if departure_id:
        query = query.filter_by(departure_id=departure_id)
    
    if from_date:
        try:
            from_dt = datetime.strptime(from_date, '%Y-%m-%d')
            query = query.filter(Package.created_at >= from_dt)
        except ValueError:
            pass
    
    if to_date:
        try:
            to_dt = datetime.strptime(to_date, '%Y-%m-%d')
            query = query.filter(Package.created_at <= to_dt)
        except ValueError:
            pass
    
    # Limiter à 10000 lignes max
    packages = query.order_by(Package.created_at.desc()).limit(10000).all()
    
    if not packages:
        return jsonify({'error': 'Aucun colis à exporter'}), 404
    
    if format_type == 'excel':
        excel_gen = ExcelGenerator()
        result = excel_gen.generate_packages_excel(
            [p.to_dict(include_client=True) for p in packages]
        )
        
        if not result.success:
            return jsonify({'error': result.error or 'Erreur génération Excel'}), 500
        
        logger.info(f"Export Excel colis: {len(packages)} lignes")
        
        return Response(
            result.data,
            mimetype=result.content_type,
            headers={
                'Content-Disposition': f'attachment; filename="{result.filename}"',
                'Content-Length': len(result.data)
            }
        )
    
    elif format_type == 'pdf':
        tenant_info = get_tenant_info(tenant_id)
        pdf_gen = PDFGenerator(tenant_info.get('name', 'Express Cargo'))
        result = pdf_gen.generate_packages_pdf(
            [p.to_dict(include_client=True) for p in packages],
            tenant_info
        )
        
        if not result.success:
            return jsonify({'error': result.error or 'Erreur génération PDF'}), 500
        
        logger.info(f"Export PDF colis: {len(packages)} lignes")
        
        return Response(
            result.data,
            mimetype=result.content_type,
            headers={
                'Content-Disposition': f'attachment; filename="{result.filename}"',
                'Content-Length': len(result.data)
            }
        )


@admin_bp.route('/exports/invoices/excel', methods=['GET'])
@admin_required
def export_invoices_excel():
    """Exporte les factures en Excel"""
    tenant_id = g.tenant_id
    
    status = request.args.get('status')
    from_date = request.args.get('from_date')
    to_date = request.args.get('to_date')
    
    query = Invoice.query.filter_by(tenant_id=tenant_id)
    
    if g.user_role == 'staff':
        staff_wh_ids = _get_staff_wh_ids()
        if not staff_wh_ids:
            return jsonify({'error': 'Aucune facture à exporter'}), 404
        query = query.join(Package, Invoice.package_id == Package.id).filter(
            or_(
                Package.origin_warehouse_id.in_(staff_wh_ids),
                Package.destination_warehouse_id.in_(staff_wh_ids),
            )
        )
    
    if status:
        query = query.filter_by(status=status)
    
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
    
    invoices = query.order_by(Invoice.created_at.desc()).limit(10000).all()
    
    if not invoices:
        return jsonify({'error': 'Aucune facture à exporter'}), 404
    
    excel_gen = ExcelGenerator()
    result = excel_gen.generate_invoices_excel([i.to_dict() for i in invoices])
    
    if not result.success:
        return jsonify({'error': result.error or 'Erreur génération Excel'}), 500
    
    return Response(
        result.data,
        mimetype=result.content_type,
        headers={
            'Content-Disposition': f'attachment; filename="{result.filename}"',
            'Content-Length': len(result.data)
        }
    )


@admin_bp.route('/exports/departures/excel', methods=['GET'])
@admin_required
def export_departures_excel():
    """Exporte les départs en Excel"""
    tenant_id = g.tenant_id
    
    status = request.args.get('status')
    from_date = request.args.get('from_date')
    to_date = request.args.get('to_date')
    
    query = Departure.query.filter_by(tenant_id=tenant_id)
    
    if g.user_role == 'staff':
        staff_wh_ids = _get_staff_wh_ids()
        if not staff_wh_ids:
            return jsonify({'error': 'Aucun départ à exporter'}), 404
        query = query.join(Package, Package.departure_id == Departure.id).filter(
            or_(
                Package.origin_warehouse_id.in_(staff_wh_ids),
                Package.destination_warehouse_id.in_(staff_wh_ids),
            )
        ).distinct()
    
    if status:
        query = query.filter_by(status=status)
    
    if from_date:
        try:
            from_dt = datetime.strptime(from_date, '%Y-%m-%d').date()
            query = query.filter(Departure.departure_date >= from_dt)
        except ValueError:
            pass
    
    if to_date:
        try:
            to_dt = datetime.strptime(to_date, '%Y-%m-%d').date()
            query = query.filter(Departure.departure_date <= to_dt)
        except ValueError:
            pass
    
    departures = query.order_by(Departure.departure_date.desc()).limit(1000).all()
    
    if not departures:
        return jsonify({'error': 'Aucun départ à exporter'}), 404
    
    excel_gen = ExcelGenerator()
    result = excel_gen.generate_departures_excel([d.to_dict() for d in departures])
    
    if not result.success:
        return jsonify({'error': result.error or 'Erreur génération Excel'}), 500
    
    return Response(
        result.data,
        mimetype=result.content_type,
        headers={
            'Content-Disposition': f'attachment; filename="{result.filename}"',
            'Content-Length': len(result.data)
        }
    )


# ==================== REÇUS PDF ====================

@admin_bp.route('/exports/payment/<payment_id>/receipt', methods=['GET', 'OPTIONS'])
@admin_required
def export_payment_receipt(payment_id):
    """Génère et télécharge le reçu de paiement"""
    from app.models import Payment
    
    # Handle CORS preflight
    if request.method == 'OPTIONS':
        return '', 200
    
    tenant_id = g.tenant_id
    
    payment = Payment.query.filter_by(
        id=payment_id,
        tenant_id=tenant_id
    ).first()
    
    if not payment:
        return jsonify({'error': 'Paiement non trouvé'}), 404

    if g.user_role == 'staff':
        staff_wh_ids = _get_staff_wh_ids()
        if not staff_wh_ids:
            return jsonify({'error': 'Accès refusé'}), 403
        pkg_payments = payment.package_payments.all()
        if not pkg_payments:
            return jsonify({'error': 'Accès refusé'}), 403
        for pp in pkg_payments:
            if not pp.package:
                continue
            if pp.package.origin_warehouse_id not in staff_wh_ids and pp.package.destination_warehouse_id not in staff_wh_ids:
                return jsonify({'error': 'Accès refusé'}), 403
    
    tenant_info = get_tenant_info(tenant_id)
    
    pdf_gen = PDFGenerator(tenant_info.get('name', 'Express Cargo'))
    result = pdf_gen.generate_payment_receipt(payment.to_dict(include_packages=True), tenant_info)
    
    if not result.success:
        return jsonify({'error': result.error or 'Erreur génération reçu'}), 500
    
    return Response(
        result.data,
        mimetype=result.content_type,
        headers={
            'Content-Disposition': f'attachment; filename="{result.filename}"',
            'Content-Length': len(result.data)
        }
    )


@admin_bp.route('/exports/pickup/<pickup_id>/receipt', methods=['GET', 'OPTIONS'])
@admin_required
def export_pickup_receipt(pickup_id):
    """Génère et télécharge le reçu de retrait"""
    from app.models import Pickup
    
    # Handle CORS preflight
    if request.method == 'OPTIONS':
        return '', 200
    
    tenant_id = g.tenant_id
    
    pickup = Pickup.query.filter_by(
        id=pickup_id,
        tenant_id=tenant_id
    ).first()
    
    if not pickup:
        return jsonify({'error': 'Retrait non trouvé'}), 404

    if g.user_role == 'staff':
        staff_wh_ids = _get_staff_wh_ids()
        if not staff_wh_ids or not pickup.package:
            return jsonify({'error': 'Accès refusé'}), 403
        pkg = pickup.package
        if pkg.origin_warehouse_id not in staff_wh_ids and pkg.destination_warehouse_id not in staff_wh_ids:
            return jsonify({'error': 'Accès refusé'}), 403
    
    tenant_info = get_tenant_info(tenant_id)
    
    pdf_gen = PDFGenerator(tenant_info.get('name', 'Express Cargo'))
    result = pdf_gen.generate_pickup_receipt(pickup.to_dict(), tenant_info)
    
    if not result.success:
        return jsonify({'error': result.error or 'Erreur génération reçu'}), 500
    
    return Response(
        result.data,
        mimetype=result.content_type,
        headers={
            'Content-Disposition': f'attachment; filename="{result.filename}"',
            'Content-Length': len(result.data)
        }
    )


# ==================== RAPPORTS PDF ====================

@admin_bp.route('/exports/reports/statistics', methods=['GET'])
@admin_required
def export_statistics_report():
    """
    Génère un rapport statistiques PDF
    
    Query params:
        - period: week, month, quarter, year
        - year, month: Période
    """
    from app.routes.admin.finance import admin_finance_stats
    
    tenant_id = g.tenant_id
    tenant_info = get_tenant_info(tenant_id)
    
    # Récupérer les stats via l'endpoint existant
    with db.session.begin_nested():
        stats_response = admin_finance_stats()
        stats = stats_response.get_json()
    
    pdf_gen = PDFGenerator(tenant_info.get('name', 'Express Cargo'))
    result = pdf_gen.generate_statistics_report(stats, tenant_info)
    
    if not result.success:
        return jsonify({'error': result.error or 'Erreur génération rapport'}), 500
    
    return Response(
        result.data,
        mimetype=result.content_type,
        headers={
            'Content-Disposition': f'attachment; filename="{result.filename}"',
            'Content-Length': len(result.data)
        }
    )


# ==================== TICKETS (Format 80mm) ====================

@admin_bp.route('/exports/payment/<payment_id>/ticket', methods=['GET', 'OPTIONS'])
@admin_required
def export_payment_ticket(payment_id):
    """Génère et télécharge un ticket de paiement (format 80mm)"""
    from app.models import Payment
    
    # Handle CORS preflight
    if request.method == 'OPTIONS':
        return '', 200
    
    tenant_id = g.tenant_id
    
    payment = Payment.query.filter_by(
        id=payment_id,
        tenant_id=tenant_id
    ).first()
    
    if not payment:
        return jsonify({'error': 'Paiement non trouvé'}), 404

    if g.user_role == 'staff':
        staff_wh_ids = _get_staff_wh_ids()
        if not staff_wh_ids:
            return jsonify({'error': 'Accès refusé'}), 403
        pkg_payments = payment.package_payments.all()
        if not pkg_payments:
            return jsonify({'error': 'Accès refusé'}), 403
        for pp in pkg_payments:
            if not pp.package:
                continue
            if pp.package.origin_warehouse_id not in staff_wh_ids and pp.package.destination_warehouse_id not in staff_wh_ids:
                return jsonify({'error': 'Accès refusé'}), 403
    
    tenant_info = get_tenant_info(tenant_id)
    
    pdf_gen = PDFGenerator(tenant_info.get('name', 'Express Cargo'))
    result = pdf_gen.generate_payment_ticket(payment.to_dict(include_packages=True), tenant_info)
    
    if not result.success:
        return jsonify({'error': result.error or 'Erreur génération ticket'}), 500
    
    return Response(
        result.data,
        mimetype=result.content_type,
        headers={
            'Content-Disposition': f'attachment; filename="{result.filename}"',
            'Content-Length': len(result.data)
        }
    )


@admin_bp.route('/exports/pickup/<pickup_id>/ticket', methods=['GET', 'OPTIONS'])
@admin_required
def export_pickup_ticket(pickup_id):
    """Génère et télécharge un ticket de retrait (format 80mm)"""
    from app.models import Pickup
    
    # Handle CORS preflight
    if request.method == 'OPTIONS':
        return '', 200
    
    tenant_id = g.tenant_id
    
    pickup = Pickup.query.filter_by(
        id=pickup_id,
        tenant_id=tenant_id
    ).first()
    
    if not pickup:
        return jsonify({'error': 'Retrait non trouvé'}), 404

    if g.user_role == 'staff':
        staff_wh_ids = _get_staff_wh_ids()
        if not staff_wh_ids or not pickup.package:
            return jsonify({'error': 'Accès refusé'}), 403
        pkg = pickup.package
        if pkg.origin_warehouse_id not in staff_wh_ids and pkg.destination_warehouse_id not in staff_wh_ids:
            return jsonify({'error': 'Accès refusé'}), 403
    
    tenant_info = get_tenant_info(tenant_id)
    
    pdf_gen = PDFGenerator(tenant_info.get('name', 'Express Cargo'))
    result = pdf_gen.generate_pickup_ticket(pickup.to_dict(), tenant_info)
    
    if not result.success:
        return jsonify({'error': result.error or 'Erreur génération ticket'}), 500
    
    return Response(
        result.data,
        mimetype=result.content_type,
        headers={
            'Content-Disposition': f'attachment; filename="{result.filename}"',
            'Content-Length': len(result.data)
        }
    )
