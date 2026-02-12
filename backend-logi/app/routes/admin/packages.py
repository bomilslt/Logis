"""
Routes Admin - Gestion des colis
CRUD complet et actions spéciales (réception, statut, livraison)
"""

from flask import request, jsonify, g
from flask_jwt_extended import get_jwt_identity
from app import db
from app.routes.admin import admin_bp
from app.models import Package, PackageHistory, User, Departure, Warehouse
from app.utils.decorators import admin_required, permission_required, admin_or_permission_required, module_required
from app.utils.audit import audit_log, AuditAction
from app.utils.helpers import (
    generate_tracking_number,
    can_read_package,
    can_edit_package_origin,
    can_edit_package_destination,
    can_manage_payments,
)
from app.services.pdf_export_service import PDFExportService
from datetime import datetime
from sqlalchemy import or_


def _apply_staff_package_scope(query, write=False):
    """
    Filtre les colis pour un staff.
    - write=False (lecture) : pas de filtre, le staff voit tous les colis
      pour pouvoir orienter les clients.
    - write=True (écriture/action) : filtre par agences assignées
      (origin OU destination dans les warehouses du staff).
    """
    if g.user_role != 'staff':
        return query
    if not write:
        return query
    staff_wh_ids = getattr(g, 'staff_warehouse_ids', None) or ([] if not g.staff_warehouse_id else [g.staff_warehouse_id])
    if not staff_wh_ids:
        return query.filter(db.text('1=0'))
    return query.filter(
        or_(
            Package.origin_warehouse_id.in_(staff_wh_ids),
            Package.destination_warehouse_id.in_(staff_wh_ids),
        )
    )


def _staff_can_write_package(package):
    """Vérifie si le staff peut modifier/agir sur ce colis (basé sur ses agences)."""
    if g.user_role != 'staff':
        return True
    staff_wh_ids = getattr(g, 'staff_warehouse_ids', None) or ([] if not g.staff_warehouse_id else [g.staff_warehouse_id])
    if not staff_wh_ids:
        return False
    return (package.origin_warehouse_id in staff_wh_ids or
            package.destination_warehouse_id in staff_wh_ids)


_ORIGIN_STATUSES = {'pending', 'received', 'in_transit'}
_DESTINATION_STATUSES = {'arrived_port', 'customs', 'out_for_delivery'}


@admin_bp.route('/packages', methods=['GET'])
@module_required('packages')
def admin_get_packages():
    """
    Liste des colis avec filtres avancés
    
    Query params:
        - status: Filtrer par statut
        - search: Recherche (tracking, client, téléphone)
        - departure_id: Filtrer par départ
        - client_id: Filtrer par client
        - payment_status: Filtrer par statut de paiement (paid, unpaid, partial)
        - date_from, date_to: Période
        - page, per_page: Pagination
    """
    tenant_id = g.tenant_id
    
    # Filtres
    status = request.args.get('status')
    search = request.args.get('search')
    departure_id = request.args.get('departure_id')
    client_id = request.args.get('client_id')
    payment_status = request.args.get('payment_status')
    date_from = request.args.get('date_from')
    date_to = request.args.get('date_to')
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    
    query = Package.query.filter_by(tenant_id=tenant_id)
    query = _apply_staff_package_scope(query)
    
    if status:
        query = query.filter_by(status=status)
    
    if client_id:
        query = query.filter_by(client_id=client_id)
    
    if departure_id:
        if departure_id == 'none':
            query = query.filter(Package.departure_id.is_(None))
        else:
            query = query.filter_by(departure_id=departure_id)
    
    # Filtre par statut de paiement
    if payment_status:
        if payment_status == 'paid':
            query = query.filter(Package.paid_amount >= Package.amount)
        elif payment_status == 'unpaid':
            query = query.filter(Package.paid_amount == 0)
        elif payment_status == 'partial':
            query = query.filter(Package.paid_amount > 0, Package.paid_amount < Package.amount)
        elif payment_status in ['unpaid,partial', 'partial,unpaid']:
            query = query.filter(Package.paid_amount < Package.amount)
    
    if search:
        # Recherche dans tracking, supplier_tracking, et infos client
        search_filter = or_(
            Package.tracking_number.ilike(f'%{search}%'),
            Package.supplier_tracking.ilike(f'%{search}%'),
            Package.description.ilike(f'%{search}%'),
            Package.recipient_name.ilike(f'%{search}%'),
            Package.recipient_phone.ilike(f'%{search}%')
        )
        # Recherche aussi dans les clients
        client_ids = User.query.filter_by(tenant_id=tenant_id).filter(
            or_(
                User.first_name.ilike(f'%{search}%'),
                User.last_name.ilike(f'%{search}%'),
                User.phone.ilike(f'%{search}%')
            )
        ).with_entities(User.id).all()
        
        if client_ids:
            search_filter = or_(search_filter, Package.client_id.in_([c.id for c in client_ids]))
        
        query = query.filter(search_filter)
    
    if date_from:
        query = query.filter(Package.created_at >= date_from)
    
    if date_to:
        query = query.filter(Package.created_at <= date_to)
    
    query = query.order_by(Package.created_at.desc())
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)
    
    return jsonify({
        'packages': [p.to_dict(include_client=True) for p in pagination.items],
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': page
    })


@admin_bp.route('/packages/<package_id>', methods=['GET'])
@module_required('packages')
def admin_get_package(package_id):
    """Détails complets d'un colis"""
    tenant_id = g.tenant_id
    
    package = Package.query.filter_by(id=package_id, tenant_id=tenant_id).first()
    
    if not package:
        return jsonify({'error': 'Package not found'}), 404

    if g.user_role == 'staff' and not can_read_package(g.user, package):
        return jsonify({'error': 'Accès refusé'}), 403
    
    return jsonify({
        'package': package.to_dict(include_history=True, include_client=True)
    })


@admin_bp.route('/packages/find', methods=['GET'])
@module_required('packages')
def admin_find_package():
    """
    Recherche un colis par tracking (pour scanner)
    
    Query params:
        - tracking: Code tracking à rechercher
    """
    tenant_id = g.tenant_id
    tracking = request.args.get('tracking', '').strip()
    
    if not tracking:
        return jsonify({'error': 'Tracking code required'}), 400
    
    # Recherche par tracking interne ou fournisseur
    package = Package.query.filter_by(tenant_id=tenant_id).filter(
        or_(
            Package.tracking_number.ilike(tracking),
            Package.supplier_tracking.ilike(tracking)
        )
    ).first()
    
    if not package:
        return jsonify({'found': False, 'message': 'Package not found'})

    if g.user_role == 'staff' and not can_read_package(g.user, package):
        return jsonify({'found': False, 'message': 'Package not found'})
    
    return jsonify({
        'found': True,
        'package': package.to_dict(include_client=True)
    })


@admin_bp.route('/packages', methods=['POST'])
@module_required('packages')
def admin_create_package():
    """
    Créer un colis manuellement (réception sans pré-enregistrement)
    
    Body:
        - client_id ou client_name + client_phone
        - description, transport_mode, package_type
        - weight, quantity, cbm (selon transport)
        - supplier_tracking (optionnel)
    """
    tenant_id = g.tenant_id
    user_id = get_jwt_identity()
    data = request.get_json()
    
    # Validation
    if not data.get('description'):
        return jsonify({'error': 'Description is required'}), 400
    
    # Vérification des quotas
    from app.services.enforcement_service import EnforcementService
    quota_result = EnforcementService.check_quota(tenant_id, EnforcementService.RESOURCE_PACKAGES_MONTHLY)
    if not quota_result['allowed']:
        return jsonify({
            'error': 'Quota atteint',
            'message': quota_result['reason'],
            'details': quota_result
        }), 403
    
    # Client existant ou nouveau
    client_id = data.get('client_id')
    if not client_id:
        # Chercher par téléphone si fourni
        phone = data.get('client_phone')
        if phone:
            client = User.query.filter_by(tenant_id=tenant_id, phone=phone).first()
            if client:
                client_id = client.id

    # Si toujours pas de client, créer un placeholder
    if not client_id:
        import uuid
        placeholder_name = (data.get('client_name') or 'Client inconnu').strip() or 'Client inconnu'
        name_parts = placeholder_name.split(' ', 1)
        first_name = name_parts[0]
        last_name = name_parts[1] if len(name_parts) > 1 else 'Inconnu'
        placeholder_phone = data.get('client_phone') or None
        placeholder_email = f"unknown_{tenant_id}_{uuid.uuid4().hex[:8]}@placeholder.local"

        client = User(
            tenant_id=tenant_id,
            email=placeholder_email,
            phone=placeholder_phone,
            first_name=first_name,
            last_name=last_name,
            role='client',
            is_active=True,
            is_verified=False,
            is_placeholder=True
        )
        client.set_password(uuid.uuid4().hex)
        db.session.add(client)
        db.session.flush()
        client_id = client.id
    
    # Générer tracking number unique (boucle jusqu'à unicité)
    from app.models import Tenant
    tenant = Tenant.query.get(tenant_id)
    base_count = Package.query.filter_by(tenant_id=tenant_id).count() + 1
    tracking_number = None
    attempt = 0
    while tracking_number is None:
        candidate = generate_tracking_number(tenant.slug if tenant else 'PKG', base_count + attempt)
        exists = Package.query.filter_by(tenant_id=tenant_id, tracking_number=candidate).first()
        if not exists:
            tracking_number = candidate
        else:
            attempt += 1
    
    origin_warehouse_id = data.get('origin_warehouse_id')
    destination_warehouse_id = data.get('destination_warehouse_id')

    package = Package(
        tenant_id=tenant_id,
        client_id=client_id,
        tracking_number=tracking_number,
        supplier_tracking=data.get('supplier_tracking'),
        description=data['description'],
        category=data.get('category'),
        transport_mode=data.get('transport_mode', 'air_normal'),
        package_type=data.get('package_type', 'normal'),
        weight=data.get('weight'),
        cbm=data.get('cbm'),
        quantity=data.get('quantity', 1),
        origin_country=data.get('origin_country', 'China'),
        origin_city=data.get('origin_city'),
        destination_country=data.get('destination_country'),
        destination_warehouse=data.get('destination_warehouse'),
        origin_warehouse_id=origin_warehouse_id,
        destination_warehouse_id=destination_warehouse_id,
        recipient_name=data.get('recipient_name'),
        recipient_phone=data.get('recipient_phone'),
        amount=data.get('amount', 0),
        status='received',  # Créé par admin = déjà reçu
        received_at=datetime.utcnow(),
        is_editable=False
    )
    
    db.session.add(package)
    db.session.flush()
    
    # Historique
    history = PackageHistory(
        package_id=package.id,
        status='received',
        location=data.get('location', 'Entrepôt'),
        notes='Colis reçu et enregistré',
        updated_by=user_id
    )
    db.session.add(history)
    db.session.commit()
    
    return jsonify({
        'message': 'Package created',
        'package': package.to_dict(include_client=True)
    }), 201


@admin_bp.route('/packages/<package_id>/receive', methods=['POST'])
@module_required('packages')
def admin_receive_package(package_id):
    """
    Marquer un colis comme reçu (réception en entrepôt)
    Permet de saisir les valeurs réelles mesurées et calcule le montant final.
    Le tarif unitaire est automatiquement récupéré depuis la configuration des tarifs.
    
    Body:
        - location: Localisation (optionnel)
        - notes: Notes (optionnel)
        - final_weight: Poids réel mesuré (kg)
        - final_cbm: Volume réel mesuré (m³)
        - final_quantity: Nombre de pièces réel
        - unit_price: Tarif unitaire (optionnel, récupéré auto depuis config si non fourni)
        - notify: Envoyer une notification au client (défaut: true)
    """
    tenant_id = g.tenant_id
    user_id = get_jwt_identity()
    data = request.get_json() or {}
    
    package = Package.query.filter_by(id=package_id, tenant_id=tenant_id).first()
    
    if not package:
        return jsonify({'error': 'Package not found'}), 404

    # Staff origin-only pour réception + auto-assign origin_warehouse_id
    if g.user_role == 'staff':
        if not g.staff_warehouse_id:
            return jsonify({'error': 'Accès refusé'}), 403
        if not package.origin_warehouse_id:
            package.origin_warehouse_id = g.staff_warehouse_id
        if not can_edit_package_origin(g.user, package):
            return jsonify({'error': 'Accès refusé'}), 403
    
    if package.status != 'pending':
        return jsonify({'error': 'Package already received'}), 400
    
    # Montants / paiements: destination-only + admin
    can_manage_amounts = g.user_role == 'admin' or can_edit_package_destination(g.user, package)
    unit_price = data.get('unit_price') if can_manage_amounts else None
    if can_manage_amounts and unit_price is None:
        # Récupérer depuis la config des tarifs
        from app.models import TenantConfig
        config = TenantConfig.query.filter_by(tenant_id=tenant_id).first()
        if config:
            origin = package.origin_country or 'China'
            dest = package.destination_country or 'Cameroon'
            transport = package.transport_mode or 'air_normal'
            pkg_type = package.package_type or 'normal'
            
            route_key = f"{origin}_{dest}"
            shipping_rates = config.shipping_rates or {}
            route_rates = shipping_rates.get(route_key, {})
            transport_rates = route_rates.get(transport, {})
            
            # Le tarif peut être:
            # - un nombre direct (ancien format)
            # - un objet avec 'rate' (nouveau format: {label, rate, unit})
            rate_data = transport_rates.get(pkg_type)
            if isinstance(rate_data, dict):
                unit_price = rate_data.get('rate')
            elif isinstance(rate_data, (int, float)):
                unit_price = rate_data
    
    # Mise à jour du statut
    package.status = 'received'
    package.received_at = datetime.utcnow()
    package.is_editable = False
    package.current_location = data.get('location', 'Entrepôt origine')
    
    # Valeurs finales mesurées par l'agence
    if data.get('final_weight') is not None:
        package.final_weight = float(data['final_weight'])
    if data.get('final_cbm') is not None:
        package.final_cbm = float(data['final_cbm'])
    if data.get('final_quantity') is not None:
        package.final_quantity = int(data['final_quantity'])
    
    # Utiliser le tarif récupéré (auto ou fourni)
    if can_manage_amounts and unit_price is not None:
        package.unit_price = float(unit_price)
    
    # Calculer le montant final si on a le tarif
    old_amount = package.amount
    if can_manage_amounts and package.unit_price:
        # Déterminer la quantité facturable selon le type
        if package.final_weight is not None:
            package.amount = package.final_weight * package.unit_price
        elif package.final_cbm is not None:
            package.amount = package.final_cbm * package.unit_price
        elif package.final_quantity is not None:
            package.amount = package.final_quantity * package.unit_price
        else:
            # Utiliser les estimations client si pas de valeurs finales
            if package.weight:
                package.amount = package.weight * package.unit_price
            elif package.cbm:
                package.amount = package.cbm * package.unit_price
            elif package.quantity:
                package.amount = package.quantity * package.unit_price
    
    # Historique
    notes_parts = ['Colis reçu en entrepôt']
    if package.final_weight:
        notes_parts.append(f'Poids: {package.final_weight} kg')
    if package.final_cbm:
        notes_parts.append(f'Volume: {package.final_cbm} m³')
    if package.final_quantity:
        notes_parts.append(f'Pièces: {package.final_quantity}')
    if package.amount and package.amount != old_amount:
        notes_parts.append(f'Montant: {int(package.amount)} {package.amount_currency}')
    if data.get('notes'):
        notes_parts.append(data['notes'])
    
    history = PackageHistory(
        package_id=package.id,
        status='received',
        location=package.current_location,
        notes=' - '.join(notes_parts),
        updated_by=user_id
    )
    db.session.add(history)
    db.session.commit()
    
    # Notification au client
    notification_result = None
    should_notify = data.get('notify', True)
    
    if should_notify and package.client_id:
        try:
            from app.services.notification_service import NotificationService
            from app.models import Tenant
            
            client = User.query.get(package.client_id)
            tenant = Tenant.query.get(tenant_id)
            
            if client:
                notif_service = NotificationService(tenant_id)
                
                # Formater les montants
                def format_amount(amount):
                    if amount is None or amount == 0:
                        return '0 XAF'
                    return f"{int(amount):,} XAF".replace(',', ' ')
                
                # Générer les détails de facturation
                billing_qty = ''
                billing_detail = ''
                
                if package.final_weight:
                    billing_qty = f"{package.final_weight} kg"
                    if package.unit_price:
                        billing_detail = f"{package.final_weight} kg × {int(package.unit_price):,} XAF/kg".replace(',', ' ')
                elif package.final_cbm:
                    billing_qty = f"{package.final_cbm} m³"
                    if package.unit_price:
                        billing_detail = f"{package.final_cbm} m³ × {int(package.unit_price):,} XAF/m³".replace(',', ' ')
                elif package.final_quantity:
                    billing_qty = f"{package.final_quantity} pièces"
                    if package.unit_price:
                        billing_detail = f"{package.final_quantity} pcs × {int(package.unit_price):,} XAF/pièce".replace(',', ' ')
                
                variables = {
                    'tracking': package.tracking_number,
                    'client_name': client.full_name or client.email,
                    'description': package.description or '',
                    'billing_qty': billing_qty,
                    'billing_detail': billing_detail,
                    'route': f"{package.origin_city or ''} → {package.destination_city or ''}",
                    'transport': package.transport_mode or '',
                    'shipping_cost': format_amount(package.amount),
                    'amount_due': format_amount(package.remaining_amount),
                    'warehouse': package.destination_warehouse or '',
                    'company': tenant.name if tenant else 'Express Cargo'
                }
                
                notification_result = notif_service.send_event_notification(
                    event_type='package_received',
                    user=client,
                    variables=variables,
                    title=f"Colis {package.tracking_number} reçu"
                )
                
        except Exception as e:
            import logging
            logging.error(f"Failed to send receive notification: {str(e)}")
            notification_result = {'error': str(e)}
    
    return jsonify({
        'message': 'Package received',
        'package': package.to_dict(include_client=True),
        'notification': notification_result
    })


@admin_bp.route('/packages/<package_id>/status', methods=['PUT'])
@module_required('packages')
def admin_update_status(package_id):
    """
    Mettre à jour le statut d'un colis
    
    Body:
        - status: Nouveau statut
        - location: Localisation actuelle
        - notes: Notes
        - notify: Notifier le client (bool)
    """
    tenant_id = g.tenant_id
    user_id = get_jwt_identity()
    data = request.get_json()
    
    if not data.get('status'):
        return jsonify({'error': 'Status is required'}), 400
    
    new_status = data['status']
    
    # Bloquer le passage direct à "delivered" - doit passer par Pickups
    if new_status == 'delivered':
        return jsonify({
            'error': 'Le statut "delivered" ne peut pas être défini manuellement',
            'hint': 'Utilisez la vue "Retraits" pour marquer un colis comme livré après paiement et signature'
        }), 400
    
    package = Package.query.filter_by(id=package_id, tenant_id=tenant_id).first()
    
    if not package:
        return jsonify({'error': 'Package not found'}), 404

    # Staff: origin-only ou destination-only selon le statut cible
    if g.user_role == 'staff':
        if new_status in _ORIGIN_STATUSES:
            if not can_edit_package_origin(g.user, package):
                return jsonify({'error': 'Accès refusé'}), 403
        elif new_status in _DESTINATION_STATUSES:
            if not can_edit_package_destination(g.user, package):
                return jsonify({'error': 'Accès refusé'}), 403
        else:
            if not can_read_package(g.user, package):
                return jsonify({'error': 'Accès refusé'}), 403
    
    old_status = package.status
    
    # Mise à jour
    package.status = new_status
    if data.get('location'):
        package.current_location = data['location']
    
    # Dates spéciales selon statut
    if new_status == 'received' and not package.received_at:
        package.received_at = datetime.utcnow()
    elif new_status == 'in_transit' and not package.shipped_at:
        package.shipped_at = datetime.utcnow()
    
    # Historique
    history = PackageHistory(
        package_id=package.id,
        status=new_status,
        location=data.get('location'),
        notes=data.get('notes'),
        updated_by=user_id
    )
    db.session.add(history)
    db.session.commit()
    
    # Notification au client si demandé
    notification_result = None
    if data.get('notify') and package.client_id:
        try:
            from app.services.notification_service import NotificationService
            from app.utils.helpers import get_status_label
            
            # Récupérer le client
            client = User.query.get(package.client_id)
            if client:
                # Initialiser le service de notification
                notif_service = NotificationService(tenant_id)
                
                # Mapper le statut vers le type d'événement
                event_map = {
                    'received': 'package_received',
                    'in_transit': 'package_shipped',
                    'arrived_port': 'package_arrived',
                    'customs': 'package_arrived',
                    'out_for_delivery': 'ready_pickup',
                    'delivered': 'ready_pickup'
                }
                event_type = event_map.get(new_status, 'status_update')
                
                # Préparer les variables pour les templates
                status_label = get_status_label(new_status, 'fr')
                
                # Récupérer les infos du tenant pour le nom de l'entreprise
                from app.models import Tenant
                tenant = Tenant.query.get(tenant_id)
                company_name = tenant.name if tenant else 'Express Cargo'
                
                # Formater les montants
                def format_amount(amount):
                    if amount is None or amount == 0:
                        return '0 XAF'
                    return f"{int(amount):,} XAF".replace(',', ' ')
                
                # Générer les variables de facturation intelligentes
                billing_qty = ''      # "25 kg" ou "2.5 m³" ou "10 pièces"
                billing_rate = ''     # "3 000 XAF/kg" ou "150 000 XAF/m³"
                billing_detail = ''   # "25 kg × 3 000 XAF/kg"
                
                amount = package.amount or 0
                
                if package.weight and package.weight > 0:
                    billing_qty = f"{package.weight} kg"
                    if amount > 0:
                        rate = int(amount / package.weight)
                        billing_rate = f"{rate:,} XAF/kg".replace(',', ' ')
                        billing_detail = f"{package.weight} kg × {billing_rate}"
                elif package.cbm and package.cbm > 0:
                    billing_qty = f"{package.cbm} m³"
                    if amount > 0:
                        rate = int(amount / package.cbm)
                        billing_rate = f"{rate:,} XAF/m³".replace(',', ' ')
                        billing_detail = f"{package.cbm} m³ × {billing_rate}"
                elif package.quantity and package.quantity > 1:
                    billing_qty = f"{package.quantity} pieces"
                    if amount > 0:
                        rate = int(amount / package.quantity)
                        billing_rate = f"{rate:,} XAF/piece".replace(',', ' ')
                        billing_detail = f"{package.quantity} pcs × {billing_rate}"
                else:
                    billing_qty = "forfait"
                    billing_rate = format_amount(amount)
                    billing_detail = f"Forfait: {billing_rate}"
                
                variables = {
                    'tracking': package.tracking_number,
                    'client_name': client.full_name or client.email,
                    'status': status_label,
                    'location': data.get('location', ''),
                    'notes': data.get('notes', ''),
                    'description': package.description or '',
                    'package_type': package.package_type or '',
                    'billing_qty': billing_qty,
                    'billing_rate': billing_rate,
                    'billing_detail': billing_detail,
                    'route': f"{package.origin_city or ''} → {package.destination_city or ''}",
                    'transport': package.transport_mode or '',
                    'shipping_cost': format_amount(package.amount),
                    'amount_paid': format_amount(package.paid_amount),
                    'amount_due': format_amount(package.remaining_amount),
                    'warehouse': package.destination_warehouse or '',
                    'company': company_name
                }
                
                # Envoyer via la config des événements
                notification_result = notif_service.send_event_notification(
                    event_type=event_type,
                    user=client,
                    variables=variables,
                    title=f"Colis {package.tracking_number}"
                )
                
                # Mettre à jour la notification avec la référence au colis
                if notification_result.get('push', {}).get('notification_id'):
                    from app.models import Notification
                    notif = Notification.query.get(notification_result['push']['notification_id'])
                    if notif:
                        notif.package_id = package.id
                        notif.type = event_type
                        db.session.commit()
                
        except Exception as e:
            # Log l'erreur mais ne pas faire échouer la mise à jour du statut
            import logging
            logging.error(f"Failed to send notification: {str(e)}")
            notification_result = {'error': str(e)}
    
    audit_log(
        action=AuditAction.PACKAGE_STATUS_CHANGE,
        resource_type='package',
        resource_id=package.id,
        details={'old_status': old_status, 'new_status': new_status, 'location': data.get('location')}
    )
    
    return jsonify({
        'message': 'Status updated',
        'package': package.to_dict(),
        'notification': notification_result
    })


@admin_bp.route('/packages/bulk-status', methods=['PUT'])
@module_required('packages')
def admin_bulk_update_status():
    """
    Mise à jour de statut en masse
    
    Body:
        - ids: Liste des IDs de colis
        - status: Nouveau statut
        - location: Localisation
        - notes: Notes
        - notify: Notifier les clients
    """
    tenant_id = g.tenant_id
    user_id = get_jwt_identity()
    data = request.get_json()
    
    ids = data.get('ids', [])
    new_status = data.get('status')
    
    if not ids or not new_status:
        return jsonify({'error': 'IDs and status are required'}), 400
    
    # Bloquer le passage direct à "delivered" - doit passer par Pickups
    if new_status == 'delivered':
        return jsonify({
            'error': 'Le statut "delivered" ne peut pas être défini en masse',
            'hint': 'Utilisez la vue "Retraits" pour marquer les colis comme livrés individuellement'
        }), 400
    
    packages = Package.query.filter(
        Package.id.in_(ids),
        Package.tenant_id == tenant_id
    ).all()
    
    if g.user_role == 'staff':
        if new_status in _ORIGIN_STATUSES:
            packages = [p for p in packages if can_edit_package_origin(g.user, p)]
        elif new_status in _DESTINATION_STATUSES:
            packages = [p for p in packages if can_edit_package_destination(g.user, p)]
        else:
            packages = [p for p in packages if can_read_package(g.user, p)]
    
    updated_count = 0
    for package in packages:
        package.status = new_status
        if data.get('location'):
            package.current_location = data['location']
        
        # Historique
        history = PackageHistory(
            package_id=package.id,
            status=new_status,
            location=data.get('location'),
            notes=data.get('notes'),
            updated_by=user_id
        )
        db.session.add(history)
        updated_count += 1
    
    db.session.commit()
    
    audit_log(
        action=AuditAction.PACKAGE_BULK_STATUS_CHANGE,
        resource_type='package_bulk',
        resource_id=None,
        details={'action': 'bulk_status_update', 'status': new_status, 'package_ids': ids, 'updated_count': updated_count}
    )
    
    return jsonify({
        'message': f'{updated_count} packages updated',
        'updated_count': updated_count
    })


@admin_bp.route('/packages/<package_id>/deliver', methods=['POST'])
@module_required('packages')
def admin_confirm_delivery(package_id):
    """
    Confirmer la livraison avec rapport
    
    ATTENTION: Cette route est dépréciée!
    Utilisez plutôt le système de retrait (Pickups) pour marquer un colis comme livré.
    
    Cette route ne fonctionne que pour les colis déjà arrivés et crée un enregistrement de retrait.
    """
    tenant_id = g.tenant_id
    user_id = get_jwt_identity()
    
    package = Package.query.filter_by(id=package_id, tenant_id=tenant_id).first()
    
    if not package:
        return jsonify({'error': 'Colis non trouvé'}), 404

    if g.user_role == 'staff' and not can_edit_package_destination(g.user, package):
        return jsonify({'error': 'Accès refusé'}), 403
    
    # Vérifier que le colis est dans un statut éligible
    eligible_statuses = ['arrived_port', 'customs', 'out_for_delivery']
    if package.status not in eligible_statuses:
        return jsonify({
            'error': f'Le colis doit être arrivé pour être marqué comme livré. Statut actuel: {package.status}',
            'hint': 'Utilisez la vue "Retraits" pour gérer les livraisons'
        }), 400
    
    # Vérifier le paiement
    if package.remaining_amount > 0:
        return jsonify({
            'error': f'Le colis a un solde impayé de {package.remaining_amount} {package.amount_currency}',
            'hint': 'Utilisez la vue "Retraits" pour encaisser le paiement et confirmer le retrait'
        }), 400
    
    # Créer un enregistrement de retrait simplifié
    from app.models import Pickup
    
    pickup = Pickup(
        tenant_id=tenant_id,
        package_id=package.id,
        client_id=package.client_id,
        pickup_by='client',
        staff_id=user_id,
        notes=request.form.get('notes', 'Livraison confirmée via rapport')
    )
    
    recipient = request.form.get('recipient_name')
    if recipient:
        pickup.pickup_by = 'proxy'
        pickup.proxy_name = recipient
        pickup.notes = f"Livré à: {recipient}. {pickup.notes}"
    
    db.session.add(pickup)
    
    # Mise à jour du colis
    package.status = 'delivered'
    package.delivered_at = datetime.utcnow()
    package.picked_up_by = recipient or 'Client'
    package.picked_up_at = datetime.utcnow()
    
    # Historique
    history = PackageHistory(
        package_id=package.id,
        status='delivered',
        location='Livré',
        notes=pickup.notes,
        updated_by=user_id
    )
    db.session.add(history)
    db.session.commit()
    
    return jsonify({
        'message': 'Livraison confirmée',
        'package': package.to_dict(),
        'pickup_id': pickup.id
    })


@admin_bp.route('/packages/<package_id>', methods=['DELETE'])
@permission_required('packages.delete')
def admin_delete_package(package_id):
    """Supprimer un colis"""
    tenant_id = g.tenant_id
    
    package = Package.query.filter_by(id=package_id, tenant_id=tenant_id).first()
    
    if not package:
        return jsonify({'error': 'Package not found'}), 404
    
    # Supprimer l'historique d'abord
    PackageHistory.query.filter_by(package_id=package_id).delete()
    db.session.delete(package)
    db.session.commit()
    
    audit_log(
        action=AuditAction.PACKAGE_DELETE,
        resource_type='package',
        resource_id=package_id,
        details={'tracking_number': package.tracking_number, 'client_id': package.client_id}
    )
    
    return jsonify({'message': 'Package deleted'})


@admin_bp.route('/packages/stats', methods=['GET'])
@module_required('packages')
def admin_packages_stats():
    """Statistiques détaillées des colis"""
    tenant_id = g.tenant_id
    
    base_query = Package.query.filter_by(tenant_id=tenant_id)
    base_query = _apply_staff_package_scope(base_query)
    
    # Compteurs par statut
    statuses = ['pending', 'received', 'in_transit', 'arrived_port', 'customs', 'out_for_delivery', 'delivered']
    by_status = {}
    for status in statuses:
        by_status[status] = base_query.filter_by(status=status).count()
    
    # Compteurs par transport
    by_transport = {
        'sea': base_query.filter_by(transport_mode='sea').count(),
        'air_normal': base_query.filter_by(transport_mode='air_normal').count(),
        'air_express': base_query.filter_by(transport_mode='air_express').count()
    }
    
    return jsonify({
        'stats': {
            'total': base_query.count(),
            'by_status': by_status,
            'by_transport': by_transport
        }
    })


# ==================== TRANSPORTEUR / CARRIER ====================

SUPPORTED_CARRIERS = {
    'dhl': 'DHL Express',
    'fedex': 'FedEx',
    'ups': 'UPS',
    'ems': 'EMS',
    'china_post': 'China Post',
    'sf_express': 'SF Express',
    'aramex': 'Aramex',
    'dpd': 'DPD',
    'tnt': 'TNT',
    'other': 'Autre'
}


@admin_bp.route('/packages/<package_id>/carrier', methods=['PUT'])
@module_required('packages')
def admin_assign_carrier(package_id):
    """
    Assigner un transporteur à un colis
    
    Body JSON:
        - carrier: Code du transporteur (dhl, fedex, ups, etc.)
        - carrier_tracking: Numéro de tracking du transporteur
        - notify: Notifier le client (optionnel, défaut: false)
    
    Utilisé quand tu confies le colis à DHL/FedEx après réception en Chine.
    """
    from flask import g
    tenant_id = g.tenant_id
    user_id = get_jwt_identity()
    
    package = Package.query.filter_by(id=package_id, tenant_id=tenant_id).first()
    
    if not package:
        return jsonify({'error': 'Colis non trouvé'}), 404

    # Staff origin-only pour assignation transporteur
    if g.user_role == 'staff' and not can_edit_package_origin(g.user, package):
        return jsonify({'error': 'Accès refusé'}), 403
    
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Données JSON requises'}), 400
    
    carrier = data.get('carrier', '').lower().strip()
    carrier_tracking = data.get('carrier_tracking', '').strip()
    
    if not carrier or not carrier_tracking:
        return jsonify({'error': 'Transporteur et numéro de tracking requis'}), 400
    
    if carrier not in SUPPORTED_CARRIERS and carrier != 'other':
        return jsonify({
            'error': f'Transporteur non supporté. Valeurs: {", ".join(SUPPORTED_CARRIERS.keys())}'
        }), 400
    
    # Vérifier que le tracking n'est pas déjà utilisé
    existing = Package.query.filter(
        Package.tenant_id == tenant_id,
        Package.carrier_tracking == carrier_tracking,
        Package.id != package_id
    ).first()
    
    if existing:
        return jsonify({
            'error': f'Ce numéro de tracking est déjà assigné au colis {existing.tracking_number}'
        }), 409
    
    try:
        old_carrier = package.carrier
        old_tracking = package.carrier_tracking
        
        package.carrier = carrier
        package.carrier_tracking = carrier_tracking
        
        # Si le colis était en "received", le passer en "in_transit"
        if package.status == 'received':
            package.status = 'in_transit'
            package.shipped_at = datetime.utcnow()
        
        # Ajouter à l'historique
        carrier_name = SUPPORTED_CARRIERS.get(carrier, carrier.upper())
        notes = f"Confié à {carrier_name} - Tracking: {carrier_tracking}"
        
        history = PackageHistory(
            package_id=package.id,
            status=package.status,
            location=package.current_location,
            notes=notes,
            updated_by=user_id
        )
        db.session.add(history)
        db.session.commit()
        
        # Notifier le client si demandé
        notification_result = None
        if data.get('notify') and package.client_id:
            try:
                from app.services.notification_service import NotificationService
                
                client = User.query.get(package.client_id)
                if client:
                    notif_service = NotificationService(tenant_id)
                    
                    title = f"Colis {package.tracking_number} expédié"
                    message = f"Votre colis a été confié à {carrier_name}.\n"
                    message += f"Numéro de suivi {carrier_name}: {carrier_tracking}"
                    
                    notification_result = notif_service.send_notification(
                        user=client,
                        title=title,
                        message=message,
                        channels=['push']
                    )
            except Exception as e:
                import logging
                logging.error(f"Erreur notification carrier: {e}")
        
        return jsonify({
            'message': 'Transporteur assigné',
            'package': package.to_dict(),
            'carrier_name': carrier_name,
            'notification': notification_result
        })
        
    except Exception as e:
        db.session.rollback()
        import logging
        logging.error(f"Erreur assignation transporteur: {e}")
        return jsonify({'error': 'Erreur lors de l\'assignation'}), 500


@admin_bp.route('/packages/<package_id>/carrier', methods=['DELETE'])
@module_required('packages')
def admin_remove_carrier(package_id):
    """Retirer le transporteur d'un colis"""
    from flask import g
    tenant_id = g.tenant_id
    user_id = get_jwt_identity()
    
    package = Package.query.filter_by(id=package_id, tenant_id=tenant_id).first()
    
    if not package:
        return jsonify({'error': 'Colis non trouvé'}), 404
    
    if not package.carrier:
        return jsonify({'error': 'Aucun transporteur assigné'}), 400
    
    try:
        old_carrier = package.carrier
        old_tracking = package.carrier_tracking
        
        package.carrier = None
        package.carrier_tracking = None
        
        # Historique
        history = PackageHistory(
            package_id=package.id,
            status=package.status,
            notes=f"Transporteur retiré (était: {old_carrier} - {old_tracking})",
            updated_by=user_id
        )
        db.session.add(history)
        db.session.commit()
        
        return jsonify({
            'message': 'Transporteur retiré',
            'package': package.to_dict()
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Erreur lors du retrait'}), 500


@admin_bp.route('/carriers', methods=['GET'])
@module_required('packages')
def get_supported_carriers():
    """Liste des transporteurs supportés"""
    return jsonify({
        'carriers': [
            {'code': code, 'name': name}
            for code, name in SUPPORTED_CARRIERS.items()
        ]
    })



@admin_bp.route('/packages/<package_id>/refresh-tracking', methods=['POST'])
@module_required('packages')
def admin_refresh_tracking(package_id):
    """
    Rafraîchir le tracking d'un colis depuis l'API du transporteur
    
    Interroge 17Track ou AfterShip pour récupérer le dernier statut.
    """
    from flask import g
    from app.services.tracking_service import TrackingService
    
    tenant_id = g.tenant_id
    
    package = Package.query.filter_by(id=package_id, tenant_id=tenant_id).first()
    
    if not package:
        return jsonify({'error': 'Colis non trouvé'}), 404
    
    if not package.carrier_tracking:
        return jsonify({'error': 'Aucun numéro de tracking transporteur'}), 400
    
    try:
        tracking_service = TrackingService(tenant_id)
        result = tracking_service.track(package.carrier_tracking, package.carrier)
        
        if not result.success:
            return jsonify({
                'error': result.error or 'Impossible de récupérer le tracking',
                'tracking_number': package.carrier_tracking
            }), 400
        
        # Mettre à jour le colis si le statut a changé
        updated = False
        if result.current_status and result.current_status != package.status:
            old_status = package.status
            package.status = result.current_status
            
            if result.current_location:
                package.current_location = result.current_location
            
            if result.estimated_delivery:
                package.estimated_delivery = result.estimated_delivery
            
            # Historique
            user_id = get_jwt_identity()
            history = PackageHistory(
                package_id=package.id,
                status=result.current_status,
                location=result.current_location,
                notes=f"Rafraîchi manuellement - {result.events[0].description if result.events else ''}",
                updated_by=user_id
            )
            db.session.add(history)
            db.session.commit()
            updated = True
        
        # Formater les événements pour la réponse
        events = []
        if result.events:
            for event in result.events[:10]:  # Limiter à 10 événements
                events.append({
                    'status': event.status,
                    'description': event.description,
                    'location': event.location,
                    'timestamp': event.timestamp.isoformat() if event.timestamp else None
                })
        
        return jsonify({
            'message': 'Tracking mis à jour' if updated else 'Aucun changement',
            'updated': updated,
            'package': package.to_dict(),
            'tracking': {
                'carrier': result.carrier,
                'current_status': result.current_status,
                'current_location': result.current_location,
                'estimated_delivery': result.estimated_delivery.isoformat() if result.estimated_delivery else None,
                'events': events
            }
        })
        
    except Exception as e:
        import logging
        logging.error(f"Erreur refresh tracking: {e}")
        return jsonify({'error': 'Erreur lors du rafraîchissement'}), 500


@admin_bp.route('/packages/export/pdf', methods=['GET'])
@module_required('packages')
def admin_export_packages_pdf():
    """
    Exporte la liste des colis en PDF
    
    Query params:
        - status: Filtrer par statut
        - search: Recherche
        - client_id: Filtrer par client
        - payment_status: Filtrer par statut de paiement
        - date_from, date_to: Période
    """
    tenant_id = g.tenant_id
    
    # Récupérer les mêmes filtres que la liste normale
    status = request.args.get('status')
    search = request.args.get('search')
    client_id = request.args.get('client_id')
    payment_status = request.args.get('payment_status')
    date_from = request.args.get('date_from')
    date_to = request.args.get('date_to')
    
    query = Package.query.filter_by(tenant_id=tenant_id)
    
    # Appliquer les filtres (même logique que admin_get_packages)
    if status:
        query = query.filter_by(status=status)
    
    if client_id:
        query = query.filter_by(client_id=client_id)
    
    if payment_status:
        if payment_status == 'paid':
            query = query.filter(Package.paid_amount >= Package.amount)
        elif payment_status == 'unpaid':
            query = query.filter(
                (Package.amount > 0) & 
                ((Package.paid_amount == None) | (Package.paid_amount == 0))
            )
        elif payment_status == 'partial':
            query = query.filter(
                (Package.amount > 0) & 
                (Package.paid_amount > 0) & 
                (Package.paid_amount < Package.amount)
            )
    
    if date_from:
        try:
            date_from_dt = datetime.fromisoformat(date_from.replace('Z', '+00:00'))
            query = query.filter(Package.created_at >= date_from_dt)
        except ValueError:
            pass
    
    if date_to:
        try:
            date_to_dt = datetime.fromisoformat(date_to.replace('Z', '+00:00'))
            query = query.filter(Package.created_at <= date_to_dt)
        except ValueError:
            pass
    
    if search:
        query = query.join(User, Package.client_id == User.id).filter(
            or_(
                Package.tracking_number.ilike(f'%{search}%'),
                Package.description.ilike(f'%{search}%'),
                User.first_name.ilike(f'%{search}%'),
                User.last_name.ilike(f'%{search}%'),
                User.phone.ilike(f'%{search}%')
            )
        )
    
    # Limiter pour éviter les PDF trop volumineux
    packages = query.order_by(Package.created_at.desc()).limit(1000).all()
    
    try:
        # Préparer les données pour l'export
        packages_data = []
        total_amount = 0
        total_paid = 0
        
        for pkg in packages:
            pkg_data = pkg.to_dict(include_client=True)
            packages_data.append(pkg_data)
            
            total_amount += pkg.amount or 0
            total_paid += pkg.paid_amount or 0
        
        # Préparer les filtres et résumé
        filters = {}
        if status:
            filters['Statut'] = status
        if client_id:
            client = User.query.get(client_id)
            filters['Client'] = f"{client.first_name} {client.last_name}" if client else client_id
        if payment_status:
            filters['Paiement'] = payment_status
        if date_from or date_to:
            date_range = f"{date_from or 'Début'} - {date_to or 'Fin'}"
        else:
            date_range = None
        
        summary = {
            'Total Montant': f"{total_amount:.0f} XAF",
            'Total Payé': f"{total_paid:.0f} XAF",
            'Total Restant': f"{total_amount - total_paid:.0f} XAF"
        }
        
        # Utiliser le service d'export
        tenant = g.tenant
        tenant_name = tenant.name if tenant else "Express Cargo"
        
        pdf_service = PDFExportService(tenant_name)
        return pdf_service.export_packages(
            packages_data=packages_data,
            title="Liste des Colis",
            date_range=date_range,
            filters=filters if filters else None,
            summary=summary
        )
        
    except Exception as e:
        import logging
        logging.error(f"Erreur export PDF colis: {e}")
        return jsonify({'error': 'Erreur lors de la génération du PDF'}), 500
