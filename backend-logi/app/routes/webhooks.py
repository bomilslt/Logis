"""
Routes Webhooks - Intégration fournisseurs
==========================================

Endpoints pour recevoir les mises à jour de tracking des fournisseurs externes.
Supporte: DHL, FedEx, UPS, 17Track, AfterShip, etc.

FLUX:
1. Tu assignes un carrier_tracking à un DÉPART (pas à chaque colis)
2. Le webhook reçoit une update pour ce tracking
3. On trouve le DÉPART correspondant via carrier_tracking
4. On met à jour TOUS les colis du départ
5. On notifie TOUS les clients concernés
"""

from flask import Blueprint, request, jsonify, g
from app import db
from app.models import Package, PackageHistory, Tenant, Departure, User
from app.services.notification_service import NotificationService
from app.utils.decorators import tenant_required
import hmac
import hashlib
import logging
from datetime import datetime
from functools import wraps

webhooks_bp = Blueprint('webhooks', __name__)
logger = logging.getLogger(__name__)


# ==================== HELPERS ====================

def verify_webhook_signature(secret: str, payload: bytes, signature: str, algorithm: str = 'sha256') -> bool:
    """
    Vérifie la signature d'un webhook
    
    Args:
        secret: Clé secrète partagée
        payload: Corps de la requête
        signature: Signature fournie
        algorithm: Algorithme de hash (sha256, sha1)
    
    Returns:
        True si la signature est valide
    """
    if algorithm == 'sha256':
        expected = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    elif algorithm == 'sha1':
        expected = hmac.new(secret.encode(), payload, hashlib.sha1).hexdigest()
    else:
        return False
    
    return hmac.compare_digest(expected, signature)


def get_webhook_config(tenant_id: str, provider: str) -> dict:
    """Récupère la configuration webhook d'un tenant pour un provider"""
    from app.models import TenantConfig
    
    config = TenantConfig.query.filter_by(tenant_id=tenant_id).first()
    
    if config and config.config_data:
        webhooks_cfg = (config.config_data or {}).get('webhooks', {})
        return (webhooks_cfg or {}).get(provider, {})
    return {}


def webhook_auth_required(provider: str):
    """Décorateur pour authentifier les webhooks"""
    def decorator(fn):
        @wraps(fn)
        def wrapper(tenant_slug, *args, **kwargs):
            # Trouver le tenant par slug
            tenant = Tenant.query.filter_by(slug=tenant_slug, is_active=True).first()
            if not tenant:
                logger.warning(f"Webhook {provider}: tenant inconnu {tenant_slug}")
                return jsonify({'error': 'Tenant not found'}), 404
            
            # Récupérer la config webhook
            config = get_webhook_config(tenant.id, provider)
            
            if not config.get('enabled'):
                logger.warning(f"Webhook {provider} désactivé pour {tenant_slug}")
                return jsonify({'error': 'Webhook disabled'}), 403
            
            # Vérifier la signature: obligatoire si webhook activé
            secret = config.get('secret')
            if not secret:
                logger.warning(f"Webhook {provider}: secret manquant pour {tenant_slug}")
                return jsonify({'error': 'Webhook secret required'}), 403

            signature = request.headers.get('X-Webhook-Signature') or \
                       request.headers.get('X-Hub-Signature-256') or \
                       request.headers.get('X-Signature')

            if not signature:
                logger.warning(f"Webhook {provider}: signature manquante")
                return jsonify({'error': 'Missing signature'}), 401

            # Nettoyer la signature (retirer préfixe sha256= si présent)
            if '=' in signature:
                signature = signature.split('=', 1)[1]

            if not verify_webhook_signature(secret, request.data, signature):
                logger.warning(f"Webhook {provider}: signature invalide")
                return jsonify({'error': 'Invalid signature'}), 401
            
            # Stocker le tenant dans g
            g.tenant_id = tenant.id
            g.tenant = tenant
            g.webhook_config = config
            
            return fn(tenant_slug, *args, **kwargs)
        return wrapper
    return decorator


def update_package_status(
    tenant_id: str,
    tracking_number: str,
    new_status: str,
    location: str = None,
    notes: str = None,
    external_data: dict = None
) -> dict:
    """
    Met à jour le statut depuis un webhook
    
    LOGIQUE:
    1. Cherche d'abord un DÉPART avec ce carrier_tracking
       → Si trouvé: met à jour TOUS les colis du départ + notifie tous les clients
    2. Sinon cherche un COLIS individuel avec ce tracking
       → Met à jour ce colis uniquement
    
    Args:
        tenant_id: ID du tenant
        tracking_number: Numéro de tracking (carrier_tracking du départ ou du colis)
        new_status: Nouveau statut
        location: Localisation actuelle
        notes: Notes additionnelles
        external_data: Données brutes du fournisseur
    
    Returns:
        dict avec success, updated_packages, notified_clients
    """
    result = {
        'success': False,
        'updated_packages': 0,
        'notified_clients': 0,
        'type': None  # 'departure' ou 'package'
    }
    
    # 1. Chercher d'abord un DÉPART avec ce carrier_tracking
    departure = Departure.query.filter(
        Departure.tenant_id == tenant_id,
        Departure.carrier_tracking == tracking_number
    ).first()
    
    if departure:
        result['type'] = 'departure'
        return _update_departure_from_webhook(
            departure, new_status, location, notes, external_data, result
        )
    
    # 2. Sinon chercher un COLIS individuel
    package = Package.query.filter(
        Package.tenant_id == tenant_id,
        db.or_(
            Package.tracking_number == tracking_number,
            Package.supplier_tracking == tracking_number,
            Package.carrier_tracking == tracking_number
        )
    ).first()
    
    if package:
        result['type'] = 'package'
        return _update_single_package_from_webhook(
            package, new_status, location, notes, external_data, result
        )
    
    logger.warning(f"Webhook: tracking non trouvé {tracking_number} pour tenant {tenant_id}")
    return result


def _update_departure_from_webhook(
    departure: Departure,
    new_status: str,
    location: str,
    notes: str,
    external_data: dict,
    result: dict
) -> dict:
    """
    Met à jour un départ et TOUS ses colis depuis un webhook
    
    RÈGLES:
    - Un départ sans colis ne peut pas être marqué comme parti
    - Seuls les colis "received" partent avec le départ
    - Les colis "pending" sont automatiquement retirés quand le départ part
    """
    try:
        # Mapper le statut externe vers notre statut interne
        status_mapping = {
            # Statuts génériques
            'picked_up': 'in_transit',
            'in_transit': 'in_transit',
            'out_for_delivery': 'out_for_delivery',
            'delivered': 'arrived_port',  # Pour un départ, "delivered" = arrivé au port
            'exception': 'exception',
            'returned': 'exception',
            # DHL
            'transit': 'in_transit',
            'delivery': 'out_for_delivery',
            # FedEx
            'PU': 'in_transit',
            'IT': 'in_transit',
            'OD': 'out_for_delivery',
            'DL': 'arrived_port',
        }
        
        mapped_status = status_mapping.get(new_status, new_status)
        
        # Mettre à jour le départ
        departure.carrier_status = new_status
        if location:
            departure.carrier_location = location
        
        # Récupérer tous les colis du départ
        all_packages = departure.packages.all()
        
        # Si le départ est encore "scheduled" et qu'on reçoit un signal de mouvement
        if departure.status == 'scheduled' and mapped_status in ['in_transit', 'out_for_delivery']:
            # Séparer les colis prêts (received) des autres
            packages_ready = [p for p in all_packages if p.status == 'received']
            packages_not_ready = [p for p in all_packages if p.status != 'received']
            
            # Retirer les colis non reçus du départ
            for p in packages_not_ready:
                p.departure_id = None
                logger.info(f"Webhook: colis {p.tracking_number} retiré du départ (statut: {p.status})")
            
            # Vérifier qu'il reste des colis prêts
            if not packages_ready:
                logger.warning(f"Webhook: départ {departure.id} ne peut pas partir - aucun colis reçu en entrepôt")
                db.session.commit()
                result['success'] = True
                result['message'] = 'Départ ignoré - aucun colis prêt'
                return result
            
            departure.mark_departed()
            logger.info(f"Départ {departure.id} marqué comme parti via webhook ({len(packages_ready)} colis, {len(packages_not_ready)} retirés)")
            
            # Utiliser seulement les colis prêts pour la suite
            all_packages = packages_ready
        
        # Logique pour "arrived" selon is_final_leg
        is_arrival_status = mapped_status in ['arrived_port', 'delivered']
        
        if is_arrival_status and departure.status == 'departed':
            if departure.is_final_leg:
                # C'est l'étape finale → marquer le départ comme vraiment arrivé
                departure.mark_arrived()
                # Fermer le transporteur dans l'historique
                departure.close_current_carrier(new_status)
                logger.info(f"Départ {departure.id} marqué comme arrivé (étape finale)")
            else:
                # Ce n'est PAS l'étape finale → juste archiver le transporteur
                # Le départ reste en "departed", en attente du prochain transporteur
                departure.close_current_carrier(new_status)
                # Réinitialiser le transporteur actuel pour permettre l'assignation du suivant
                departure.carrier = None
                departure.carrier_tracking = None
                departure.carrier_status = None
                departure.is_final_leg = True  # Reset pour le prochain
                logger.info(f"Départ {departure.id}: étape intermédiaire terminée, en attente du prochain transporteur")
                # Ne pas mettre à jour les colis vers "arrived_port" car ce n'est pas la destination finale
                mapped_status = 'in_transit'  # Garder en transit
        
        # Vérifier qu'il y a des colis à mettre à jour
        packages = all_packages
        if not packages:
            logger.warning(f"Webhook départ {departure.id}: aucun colis assigné")
            db.session.commit()
            result['success'] = True
            return result
        
        # Mapper le statut pour les colis
        package_status_mapping = {
            'in_transit': 'in_transit',
            'out_for_delivery': 'out_for_delivery',
            'arrived_port': 'arrived_port',
            'exception': 'exception',
        }
        package_status = package_status_mapping.get(mapped_status, 'in_transit')
        
        # Ordre des statuts pour éviter les rétrogradations
        status_order = ['pending', 'received', 'in_transit', 'arrived_port', 'customs', 'out_for_delivery', 'delivered']
        
        # Collecter les clients à notifier (éviter les doublons)
        clients_to_notify = {}
        
        for package in packages:
            old_status = package.status
            
            # Ne pas rétrograder le statut
            if package_status in status_order and old_status in status_order:
                if status_order.index(package_status) <= status_order.index(old_status):
                    continue
            
            # Mettre à jour le colis
            package.status = package_status
            if location:
                package.current_location = location
            
            # Ajouter à l'historique
            history = PackageHistory(
                package_id=package.id,
                status=package_status,
                location=location,
                notes=notes or f"Mise à jour automatique via transporteur",
                updated_by=None  # Système
            )
            db.session.add(history)
            result['updated_packages'] += 1
            
            # Collecter le client pour notification
            if package.client_id and package.client_id not in clients_to_notify:
                client = User.query.get(package.client_id)
                if client:
                    clients_to_notify[package.client_id] = {
                        'client': client,
                        'packages': []
                    }
            
            if package.client_id in clients_to_notify:
                clients_to_notify[package.client_id]['packages'].append(package)
        
        db.session.commit()
        
        logger.info(f"Webhook départ {departure.id}: {result['updated_packages']} colis mis à jour")
        
        # Notifier les clients
        if clients_to_notify and package_status in ['in_transit', 'arrived_port', 'out_for_delivery']:
            try:
                notif_service = NotificationService(departure.tenant_id)
                
                for client_id, data in clients_to_notify.items():
                    client = data['client']
                    packages_list = data['packages']
                    
                    # Construire le message
                    if len(packages_list) == 1:
                        pkg = packages_list[0]
                        title = f"Mise à jour colis {pkg.tracking_number}"
                        message = f"Votre colis est maintenant: {_get_status_label(package_status)}"
                    else:
                        title = f"Mise à jour de {len(packages_list)} colis"
                        trackings = ", ".join([p.tracking_number for p in packages_list[:3]])
                        if len(packages_list) > 3:
                            trackings += f" et {len(packages_list) - 3} autres"
                        message = f"Vos colis ({trackings}) sont maintenant: {_get_status_label(package_status)}"
                    
                    if location:
                        message += f"\nLocalisation: {location}"
                    
                    # Envoyer la notification
                    notif_service.send_notification(
                        user=client,
                        title=title,
                        message=message,
                        channels=['push']
                    )
                    result['notified_clients'] += 1
                    
            except Exception as e:
                logger.error(f"Erreur notification webhook départ: {e}")
        
        result['success'] = True
        return result
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Erreur mise à jour webhook départ: {e}")
        return result


def _update_single_package_from_webhook(
    package: Package,
    new_status: str,
    location: str,
    notes: str,
    external_data: dict,
    result: dict
) -> dict:
    """
    Met à jour un seul colis depuis un webhook
    """
    try:
        old_status = package.status
        
        # Mapper le statut externe
        status_mapping = {
            'picked_up': 'received',
            'in_transit': 'in_transit',
            'out_for_delivery': 'out_for_delivery',
            'delivered': 'delivered',
            'exception': 'exception',
            'transit': 'in_transit',
            'delivery': 'out_for_delivery',
            'PU': 'received',
            'IT': 'in_transit',
            'OD': 'out_for_delivery',
            'DL': 'delivered',
        }
        
        mapped_status = status_mapping.get(new_status, new_status)
        
        # Ne pas rétrograder
        status_order = ['pending', 'received', 'in_transit', 'arrived_port', 'customs', 'out_for_delivery', 'delivered']
        if mapped_status in status_order and old_status in status_order:
            if status_order.index(mapped_status) <= status_order.index(old_status):
                result['success'] = True
                return result
        
        # Mettre à jour
        package.status = mapped_status
        if location:
            package.current_location = location
        
        if mapped_status == 'delivered':
            package.delivered_at = datetime.utcnow()
        
        # Historique
        history = PackageHistory(
            package_id=package.id,
            status=mapped_status,
            location=location,
            notes=notes or f"Mise à jour automatique: {new_status}",
            updated_by=None
        )
        db.session.add(history)
        db.session.commit()
        
        result['updated_packages'] = 1
        result['success'] = True
        
        logger.info(f"Webhook colis {package.tracking_number}: {old_status} -> {mapped_status}")
        
        # Notifier le client
        if mapped_status in ['in_transit', 'out_for_delivery', 'delivered']:
            try:
                notif_service = NotificationService(package.tenant_id)
                client = User.query.get(package.client_id)
                
                if client:
                    notif_service.send_notification(
                        user=client,
                        title=f"Mise à jour colis {package.tracking_number}",
                        message=f"Votre colis est maintenant: {_get_status_label(mapped_status)}",
                        channels=['push']
                    )
                    result['notified_clients'] = 1
            except Exception as e:
                logger.error(f"Erreur notification webhook colis: {e}")
        
        return result
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Erreur mise à jour webhook colis: {e}")
        return result


def _get_status_label(status: str) -> str:
    """Retourne le label français d'un statut"""
    labels = {
        'pending': 'En attente',
        'received': 'Reçu en entrepôt',
        'in_transit': 'En transit',
        'arrived_port': 'Arrivé à destination',
        'customs': 'En douane',
        'out_for_delivery': 'En cours de livraison',
        'delivered': 'Livré',
        'exception': 'Problème de livraison',
    }
    return labels.get(status, status)


# ==================== ENDPOINTS WEBHOOKS ====================

@webhooks_bp.route('/<tenant_slug>/generic', methods=['POST'])
@webhook_auth_required('generic')
def generic_webhook(tenant_slug):
    """
    Webhook générique pour les fournisseurs
    
    Body JSON:
        - tracking_number: Numéro de tracking (required)
        - status: Nouveau statut (required)
        - location: Localisation (optional)
        - notes: Notes (optional)
        - timestamp: Date/heure de l'événement (optional)
    
    Le tracking_number peut être:
    - Le carrier_tracking d'un DÉPART → met à jour tous les colis du départ
    - Le carrier_tracking d'un COLIS individuel
    - Le tracking_number interne d'un colis
    """
    data = request.get_json()
    
    if not data:
        return jsonify({'error': 'JSON body required'}), 400
    
    tracking = data.get('tracking_number')
    status = data.get('status')
    
    if not tracking or not status:
        return jsonify({'error': 'tracking_number and status required'}), 400
    
    result = update_package_status(
        tenant_id=g.tenant_id,
        tracking_number=tracking,
        new_status=status,
        location=data.get('location'),
        notes=data.get('notes'),
        external_data=data
    )
    
    if result['success']:
        return jsonify({
            'message': 'Updated',
            'tracking': tracking,
            'type': result['type'],
            'updated_packages': result['updated_packages'],
            'notified_clients': result['notified_clients']
        })
    else:
        return jsonify({'error': 'Tracking not found'}), 404


@webhooks_bp.route('/<tenant_slug>/17track', methods=['POST'])
@webhook_auth_required('17track')
def webhook_17track(tenant_slug):
    """
    Webhook 17Track
    
    Documentation: https://api.17track.net/en/doc
    """
    data = request.get_json()
    
    if not data:
        return jsonify({'error': 'JSON body required'}), 400
    
    # 17Track envoie un tableau d'événements
    events = data.get('data', [])
    
    processed = 0
    for event in events:
        tracking = event.get('number')
        track_info = event.get('track', {})
        
        if not tracking:
            continue
        
        # Dernier événement
        checkpoints = track_info.get('z', [])
        if checkpoints:
            latest = checkpoints[0]
            status = latest.get('c', '')  # Code statut
            location = latest.get('z', '')  # Localisation
            notes = latest.get('a', '')  # Description
            
            # Mapper les codes 17Track
            status_map = {
                'NotFound': 'pending',
                'InfoReceived': 'pending',
                'InTransit': 'in_transit',
                'OutForDelivery': 'out_for_delivery',
                'Delivered': 'delivered',
                'Exception': 'exception',
            }
            
            mapped_status = status_map.get(status, 'in_transit')
            
            result = update_package_status(
                tenant_id=g.tenant_id,
                tracking_number=tracking,
                new_status=mapped_status,
                location=location,
                notes=notes,
                external_data=event
            )
            if result['success']:
                processed += 1
    
    return jsonify({
        'message': 'Processed',
        'count': processed,
        'total': len(events)
    })


@webhooks_bp.route('/<tenant_slug>/aftership', methods=['POST'])
@webhook_auth_required('aftership')
def webhook_aftership(tenant_slug):
    """
    Webhook AfterShip
    
    Documentation: https://www.aftership.com/docs/tracking/webhook
    """
    data = request.get_json()
    
    if not data:
        return jsonify({'error': 'JSON body required'}), 400
    
    msg = data.get('msg', {})
    tracking = msg.get('tracking_number')
    tag = msg.get('tag', '')  # Statut AfterShip
    
    if not tracking:
        return jsonify({'error': 'tracking_number required'}), 400
    
    # Mapper les tags AfterShip
    status_map = {
        'Pending': 'pending',
        'InfoReceived': 'pending',
        'InTransit': 'in_transit',
        'OutForDelivery': 'out_for_delivery',
        'AttemptFail': 'exception',
        'Delivered': 'delivered',
        'AvailableForPickup': 'arrived_port',
        'Exception': 'exception',
        'Expired': 'exception',
    }
    
    mapped_status = status_map.get(tag, 'in_transit')
    
    # Dernière localisation
    checkpoints = msg.get('checkpoints', [])
    location = checkpoints[0].get('location') if checkpoints else None
    notes = checkpoints[0].get('message') if checkpoints else None
    
    result = update_package_status(
        tenant_id=g.tenant_id,
        tracking_number=tracking,
        new_status=mapped_status,
        location=location,
        notes=notes,
        external_data=data
    )
    
    return jsonify({'message': 'Processed' if result.get('success') else 'Not found'})


@webhooks_bp.route('/<tenant_slug>/dhl', methods=['POST'])
@webhook_auth_required('dhl')
def webhook_dhl(tenant_slug):
    """
    Webhook DHL Express
    
    Documentation: https://developer.dhl.com/api-reference/shipment-tracking
    """
    data = request.get_json()
    
    if not data:
        return jsonify({'error': 'JSON body required'}), 400
    
    shipments = data.get('shipments', [data])  # Peut être un tableau ou un objet
    
    processed = 0
    for shipment in shipments:
        tracking = shipment.get('id') or shipment.get('trackingNumber')
        
        if not tracking:
            continue
        
        events = shipment.get('events', [])
        if events:
            latest = events[0]
            status_code = latest.get('statusCode', '')
            location = latest.get('location', {}).get('address', {}).get('addressLocality', '')
            notes = latest.get('description', '')
            
            # Mapper les codes DHL
            status_map = {
                'pre-transit': 'pending',
                'transit': 'in_transit',
                'delivered': 'delivered',
                'failure': 'exception',
            }
            
            mapped_status = status_map.get(status_code.lower(), 'in_transit')
            
            dhl_result = update_package_status(
                tenant_id=g.tenant_id,
                tracking_number=tracking,
                new_status=mapped_status,
                location=location,
                notes=notes,
                external_data=shipment
            )
            if dhl_result.get('success'):
                processed += 1
    
    return jsonify({'message': 'Processed', 'count': processed})


@webhooks_bp.route('/<tenant_slug>/test', methods=['POST'])
def test_webhook(tenant_slug):
    """
    Endpoint de test pour vérifier la configuration webhook
    
    Retourne les headers et le body reçus (sans authentification)
    """
    tenant = Tenant.query.filter_by(slug=tenant_slug).first()
    
    if not tenant:
        return jsonify({'error': 'Tenant not found'}), 404
    
    return jsonify({
        'message': 'Webhook test received',
        'tenant': tenant_slug,
        'headers': dict(request.headers),
        'body': request.get_json(silent=True) or request.data.decode('utf-8', errors='ignore')[:1000],
        'method': request.method,
        'timestamp': datetime.utcnow().isoformat()
    })


@webhooks_bp.route('/<tenant_slug>/simulate', methods=['POST'])
@tenant_required
def simulate_webhook(tenant_slug):
    """
    Endpoint de simulation pour tester les webhooks en interne
    
    Permet aux admins de simuler un webhook de transporteur pour tester
    le flux complet: mise à jour des colis, notifications, etc.
    
    Body JSON:
        - carrier: Transporteur (dhl, fedex, ethiopian, etc.)
        - tracking_number: Numéro de tracking du départ
        - status: Statut à simuler
        - location: Localisation (optionnel)
        - notes: Notes (optionnel)
    
    Nécessite un token JWT valide (admin du tenant)
    """
    # Vérifier le tenant
    tenant = Tenant.query.filter_by(slug=tenant_slug, is_active=True).first()
    if not tenant:
        return jsonify({'error': 'Tenant not found'}), 404

    # Vérifier que l'utilisateur appartient au bon tenant (tenant_required a déjà validé le JWT)
    if getattr(g, 'tenant_id', None) != tenant.id:
        return jsonify({'error': 'Unauthorized'}), 403

    # Restreindre aux rôles admin/staff
    if getattr(g, 'user_role', None) not in ['admin', 'staff']:
        return jsonify({'error': 'Admin access required'}), 403
    
    data = request.get_json()
    if not data:
        return jsonify({'error': 'JSON body required'}), 400
    
    carrier = data.get('carrier', 'generic')
    tracking = data.get('tracking_number')
    status = data.get('status')
    location = data.get('location')
    notes = data.get('notes')
    
    if not tracking or not status:
        return jsonify({'error': 'tracking_number and status required'}), 400
    
    # Simuler le webhook
    logger.info(f"Simulating {carrier} webhook for {tracking}: {status}")
    
    result = update_package_status(
        tenant_id=tenant.id,
        tracking_number=tracking,
        new_status=status,
        location=location,
        notes=notes or f"[TEST] Simulation {carrier.upper()}",
        external_data={
            'simulated': True,
            'carrier': carrier,
            'timestamp': datetime.utcnow().isoformat()
        }
    )
    
    if result['success']:
        return jsonify({
            'message': 'Webhook simulated successfully',
            'carrier': carrier,
            'tracking': tracking,
            'status': status,
            'type': result['type'],
            'updated_packages': result['updated_packages'],
            'notified_clients': result['notified_clients']
        })
    else:
        return jsonify({
            'error': 'Tracking not found',
            'tracking': tracking,
            'hint': 'Assurez-vous que ce tracking est assigné à un départ existant'
        }), 404
