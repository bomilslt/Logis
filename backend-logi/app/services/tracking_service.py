"""
Service de Tracking - Suivi des colis via APIs transporteurs
============================================================

Permet d'interroger activement les APIs des transporteurs
pour récupérer le statut des colis.

Providers supportés:
- 17Track (agrégateur multi-transporteurs)
- AfterShip (agrégateur)
- DHL Direct API
- FedEx Direct API
"""

import logging
import requests
from typing import Optional, List
from dataclasses import dataclass
from datetime import datetime

logger = logging.getLogger(__name__)

# Timeout pour les appels API externes
API_TIMEOUT = 10  # secondes


@dataclass
class TrackingEvent:
    """Événement de tracking"""
    status: str
    description: str
    location: Optional[str] = None
    timestamp: Optional[datetime] = None
    raw_status: Optional[str] = None


@dataclass
class TrackingResult:
    """Résultat d'une requête de tracking"""
    success: bool
    tracking_number: str
    carrier: Optional[str] = None
    current_status: Optional[str] = None
    current_location: Optional[str] = None
    events: Optional[List[TrackingEvent]] = None
    estimated_delivery: Optional[datetime] = None
    error: Optional[str] = None
    raw_data: Optional[dict] = None


class TrackingProvider:
    """Classe de base pour les providers de tracking"""
    
    def track(self, tracking_number: str, carrier: str = None) -> TrackingResult:
        raise NotImplementedError


class Track17Provider(TrackingProvider):
    """
    Provider 17Track - Agrégateur multi-transporteurs
    
    Documentation: https://api.17track.net/en/doc
    
    Configuration:
        - api_key: Clé API 17Track
    """
    
    BASE_URL = "https://api.17track.net/track/v2"
    
    # Mapping des codes transporteurs 17Track
    CARRIER_CODES = {
        'dhl': 100001,
        'fedex': 100003,
        'ups': 100002,
        'ems': 190001,
        'china_post': 3011,
        'sf_express': 6057,
        'aramex': 100006,
    }
    
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.headers = {
            '17token': api_key,
            'Content-Type': 'application/json'
        }
    
    def track(self, tracking_number: str, carrier: str = None) -> TrackingResult:
        """Récupère le tracking via 17Track"""
        try:
            # Préparer la requête
            payload = [{
                'number': tracking_number
            }]
            
            # Ajouter le code transporteur si connu
            if carrier and carrier in self.CARRIER_CODES:
                payload[0]['carrier'] = self.CARRIER_CODES[carrier]
            
            response = requests.post(
                f"{self.BASE_URL}/register",
                headers=self.headers,
                json=payload,
                timeout=API_TIMEOUT
            )
            
            if response.status_code != 200:
                return TrackingResult(
                    success=False,
                    tracking_number=tracking_number,
                    error=f"API error: {response.status_code}"
                )
            
            # Récupérer le résultat
            result = response.json()
            
            # Maintenant récupérer le tracking
            response = requests.post(
                f"{self.BASE_URL}/gettrackinfo",
                headers=self.headers,
                json=[{'number': tracking_number}],
                timeout=API_TIMEOUT
            )
            
            if response.status_code != 200:
                return TrackingResult(
                    success=False,
                    tracking_number=tracking_number,
                    error=f"API error: {response.status_code}"
                )
            
            data = response.json()
            
            # Parser la réponse
            if data.get('code') != 0:
                return TrackingResult(
                    success=False,
                    tracking_number=tracking_number,
                    error=data.get('message', 'Unknown error')
                )
            
            accepted = data.get('data', {}).get('accepted', [])
            if not accepted:
                return TrackingResult(
                    success=False,
                    tracking_number=tracking_number,
                    error='No tracking data found'
                )
            
            track_info = accepted[0].get('track', {})
            
            # Extraire les événements
            events = []
            checkpoints = track_info.get('z', [])
            for cp in checkpoints:
                events.append(TrackingEvent(
                    status=self._map_status(cp.get('c', '')),
                    description=cp.get('a', ''),
                    location=cp.get('z', ''),
                    timestamp=self._parse_date(cp.get('d')),
                    raw_status=cp.get('c')
                ))
            
            # Statut actuel
            current_status = 'pending'
            if events:
                current_status = events[0].status
            
            return TrackingResult(
                success=True,
                tracking_number=tracking_number,
                carrier=carrier,
                current_status=current_status,
                current_location=events[0].location if events else None,
                events=events,
                raw_data=data
            )
            
        except requests.Timeout:
            return TrackingResult(
                success=False,
                tracking_number=tracking_number,
                error='Request timeout'
            )
        except Exception as e:
            logger.error(f"17Track error: {e}")
            return TrackingResult(
                success=False,
                tracking_number=tracking_number,
                error=str(e)
            )
    
    def _map_status(self, status_code: str) -> str:
        """Mappe les codes 17Track vers nos statuts"""
        mapping = {
            'NotFound': 'pending',
            'InfoReceived': 'pending',
            'InTransit': 'in_transit',
            'OutForDelivery': 'out_for_delivery',
            'Delivered': 'delivered',
            'AvailableForPickup': 'arrived_port',
            'Exception': 'exception',
            'Expired': 'exception',
        }
        return mapping.get(status_code, 'in_transit')
    
    def _parse_date(self, date_str: str) -> Optional[datetime]:
        """Parse une date 17Track"""
        if not date_str:
            return None
        try:
            return datetime.fromisoformat(date_str.replace('Z', '+00:00'))
        except:
            return None


class AfterShipProvider(TrackingProvider):
    """
    Provider AfterShip
    
    Documentation: https://www.aftership.com/docs/tracking/api
    """
    
    BASE_URL = "https://api.aftership.com/v4"
    
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.headers = {
            'aftership-api-key': api_key,
            'Content-Type': 'application/json'
        }
    
    def track(self, tracking_number: str, carrier: str = None) -> TrackingResult:
        """Récupère le tracking via AfterShip"""
        try:
            # Construire l'URL
            url = f"{self.BASE_URL}/trackings/{carrier}/{tracking_number}" if carrier else \
                  f"{self.BASE_URL}/trackings/{tracking_number}"
            
            response = requests.get(
                url,
                headers=self.headers,
                timeout=API_TIMEOUT
            )
            
            if response.status_code == 404:
                # Tracking non trouvé, essayer de l'enregistrer
                return self._register_and_track(tracking_number, carrier)
            
            if response.status_code != 200:
                return TrackingResult(
                    success=False,
                    tracking_number=tracking_number,
                    error=f"API error: {response.status_code}"
                )
            
            data = response.json()
            tracking = data.get('data', {}).get('tracking', {})
            
            # Extraire les événements
            events = []
            for cp in tracking.get('checkpoints', []):
                events.append(TrackingEvent(
                    status=self._map_status(cp.get('tag', '')),
                    description=cp.get('message', ''),
                    location=cp.get('location', ''),
                    timestamp=self._parse_date(cp.get('checkpoint_time')),
                    raw_status=cp.get('tag')
                ))
            
            return TrackingResult(
                success=True,
                tracking_number=tracking_number,
                carrier=tracking.get('slug'),
                current_status=self._map_status(tracking.get('tag', '')),
                current_location=events[0].location if events else None,
                events=events,
                estimated_delivery=self._parse_date(tracking.get('expected_delivery')),
                raw_data=data
            )
            
        except requests.Timeout:
            return TrackingResult(
                success=False,
                tracking_number=tracking_number,
                error='Request timeout'
            )
        except Exception as e:
            logger.error(f"AfterShip error: {e}")
            return TrackingResult(
                success=False,
                tracking_number=tracking_number,
                error=str(e)
            )
    
    def _register_and_track(self, tracking_number: str, carrier: str = None) -> TrackingResult:
        """Enregistre un tracking puis le récupère"""
        try:
            payload = {
                'tracking': {
                    'tracking_number': tracking_number
                }
            }
            if carrier:
                payload['tracking']['slug'] = carrier
            
            response = requests.post(
                f"{self.BASE_URL}/trackings",
                headers=self.headers,
                json=payload,
                timeout=API_TIMEOUT
            )
            
            if response.status_code in [200, 201]:
                # Récupérer le tracking
                return self.track(tracking_number, carrier)
            
            return TrackingResult(
                success=False,
                tracking_number=tracking_number,
                error='Failed to register tracking'
            )
            
        except Exception as e:
            return TrackingResult(
                success=False,
                tracking_number=tracking_number,
                error=str(e)
            )
    
    def _map_status(self, tag: str) -> str:
        """Mappe les tags AfterShip vers nos statuts"""
        mapping = {
            'Pending': 'pending',
            'InfoReceived': 'pending',
            'InTransit': 'in_transit',
            'OutForDelivery': 'out_for_delivery',
            'Delivered': 'delivered',
            'AvailableForPickup': 'arrived_port',
            'AttemptFail': 'exception',
            'Exception': 'exception',
            'Expired': 'exception',
        }
        return mapping.get(tag, 'in_transit')
    
    def _parse_date(self, date_str: str) -> Optional[datetime]:
        if not date_str:
            return None
        try:
            return datetime.fromisoformat(date_str.replace('Z', '+00:00'))
        except:
            return None


class TrackingService:
    """
    Service principal de tracking
    
    Usage:
        service = TrackingService(tenant_id)
        result = service.track('1234567890', carrier='dhl')
    """
    
    def __init__(self, tenant_id: str, config: dict = None):
        self.tenant_id = tenant_id
        self.config = config or self._load_config()
        self.provider = self._init_provider()
    
    def _load_config(self) -> dict:
        """Charge la config tracking du tenant"""
        from app.models import TenantConfig
        
        config = TenantConfig.query.filter_by(
            tenant_id=self.tenant_id,
            config_key='tracking'
        ).first()
        
        if config and config.config_data:
            return config.config_data
        return {}
    
    def _init_provider(self) -> Optional[TrackingProvider]:
        """Initialise le provider configuré"""
        provider_name = self.config.get('provider', '17track')
        provider_config = self.config.get(provider_name, {})
        
        api_key = provider_config.get('api_key')
        if not api_key:
            logger.warning(f"Tracking provider {provider_name} not configured")
            return None
        
        if provider_name == '17track':
            return Track17Provider(api_key)
        elif provider_name == 'aftership':
            return AfterShipProvider(api_key)
        else:
            logger.warning(f"Unknown tracking provider: {provider_name}")
            return None
    
    def track(self, tracking_number: str, carrier: str = None) -> TrackingResult:
        """
        Récupère le tracking d'un colis
        
        Args:
            tracking_number: Numéro de tracking
            carrier: Code du transporteur (optionnel)
        
        Returns:
            TrackingResult avec les infos de tracking
        """
        if not self.provider:
            return TrackingResult(
                success=False,
                tracking_number=tracking_number,
                error='Tracking service not configured'
            )
        
        return self.provider.track(tracking_number, carrier)
    
    def update_package_from_tracking(self, package_id: str) -> bool:
        """
        Met à jour un colis depuis son tracking transporteur
        
        Args:
            package_id: ID du colis
        
        Returns:
            True si mis à jour avec succès
        """
        from app.models import Package, PackageHistory
        from app import db
        
        package = Package.query.filter_by(
            id=package_id,
            tenant_id=self.tenant_id
        ).first()
        
        if not package or not package.carrier_tracking:
            return False
        
        result = self.track(package.carrier_tracking, package.carrier)
        
        if not result.success:
            logger.warning(f"Tracking failed for {package.tracking_number}: {result.error}")
            return False
        
        # Mettre à jour si le statut a changé
        if result.current_status and result.current_status != package.status:
            old_status = package.status
            package.status = result.current_status
            
            if result.current_location:
                package.current_location = result.current_location
            
            if result.estimated_delivery:
                package.estimated_delivery = result.estimated_delivery
            
            # Historique
            history = PackageHistory(
                package_id=package.id,
                status=result.current_status,
                location=result.current_location,
                notes=f"Mise à jour automatique via {self.config.get('provider', 'tracking')}",
                updated_by=None
            )
            db.session.add(history)
            db.session.commit()
            
            logger.info(f"Package {package.tracking_number} updated: {old_status} -> {result.current_status}")
            return True
        
        return False
