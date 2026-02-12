"""
Service de vérification d'intégrité des appareils
==================================================

Vérifie l'authenticité des appareils mobiles via:
- Google Play Integrity API (Android)
- Apple DeviceCheck / App Attest (iOS)

Configuration requise (variables d'environnement ou PlatformConfig):
- PLAY_INTEGRITY_DECRYPTION_KEY
- PLAY_INTEGRITY_VERIFICATION_KEY
- APPLE_DEVICE_CHECK_KEY_ID
- APPLE_DEVICE_CHECK_TEAM_ID
- APPLE_DEVICE_CHECK_PRIVATE_KEY
"""

import os
import json
import logging
import httpx
import jwt
import time
from datetime import datetime
from typing import Optional, Dict, Any
from app import db
from app.models import UserDevice, DeviceVerificationLog

logger = logging.getLogger(__name__)


class PlayIntegrityVerifier:
    """
    Vérificateur Play Integrity pour Android.
    
    Documentation: https://developer.android.com/google/play/integrity
    """
    
    GOOGLE_API_URL = "https://playintegrity.googleapis.com/v1/{packageName}:decodeIntegrityToken"
    
    def __init__(self):
        self.api_key = os.getenv('GOOGLE_CLOUD_API_KEY')
        self.package_name = os.getenv('ANDROID_PACKAGE_NAME', 'com.cargo.app')
    
    async def verify_token(self, integrity_token: str) -> Dict[str, Any]:
        """
        Vérifie un token Play Integrity.
        
        Args:
            integrity_token: Token d'intégrité reçu de l'app Android
            
        Returns:
            Dict avec success, verdict, et éventuellement error
        """
        if not self.api_key:
            logger.warning("Play Integrity API key not configured")
            return {
                'success': False,
                'error': 'Play Integrity not configured',
                'verdict': None
            }
        
        try:
            url = self.GOOGLE_API_URL.format(packageName=self.package_name)
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    url,
                    params={'key': self.api_key},
                    json={'integrityToken': integrity_token},
                    timeout=10.0
                )
                
                if response.status_code != 200:
                    logger.error(f"Play Integrity API error: {response.status_code} - {response.text}")
                    return {
                        'success': False,
                        'error': f'API error: {response.status_code}',
                        'verdict': None
                    }
                
                data = response.json()
                token_payload = data.get('tokenPayloadExternal', {})
                
                # Analyser le verdict
                verdict = self._analyze_verdict(token_payload)
                
                return {
                    'success': verdict['is_genuine'],
                    'verdict': verdict,
                    'raw_response': token_payload
                }
                
        except Exception as e:
            logger.exception(f"Play Integrity verification error: {e}")
            return {
                'success': False,
                'error': str(e),
                'verdict': None
            }
    
    def _analyze_verdict(self, payload: dict) -> dict:
        """Analyse le verdict Play Integrity"""
        request_details = payload.get('requestDetails', {})
        app_integrity = payload.get('appIntegrity', {})
        device_integrity = payload.get('deviceIntegrity', {})
        account_details = payload.get('accountDetails', {})
        
        # Vérifier l'intégrité de l'appareil
        device_recognition = device_integrity.get('deviceRecognitionVerdict', [])
        
        # Niveaux d'intégrité
        meets_basic = 'MEETS_BASIC_INTEGRITY' in device_recognition
        meets_device = 'MEETS_DEVICE_INTEGRITY' in device_recognition
        meets_strong = 'MEETS_STRONG_INTEGRITY' in device_recognition
        
        # Vérifier l'app
        app_recognition = app_integrity.get('appRecognitionVerdict', '')
        is_recognized_app = app_recognition in ['PLAY_RECOGNIZED', 'UNRECOGNIZED_VERSION']
        
        # Verdict global
        is_genuine = meets_basic and is_recognized_app
        
        return {
            'is_genuine': is_genuine,
            'device_integrity': {
                'meets_basic': meets_basic,
                'meets_device': meets_device,
                'meets_strong': meets_strong,
                'recognition_verdict': device_recognition
            },
            'app_integrity': {
                'is_recognized': is_recognized_app,
                'verdict': app_recognition,
                'package_name': app_integrity.get('packageName'),
                'version_code': app_integrity.get('versionCode')
            },
            'account_details': {
                'licensing_verdict': account_details.get('appLicensingVerdict')
            },
            'request_nonce': request_details.get('nonce'),
            'timestamp_ms': request_details.get('timestampMillis')
        }


class AppleDeviceCheckVerifier:
    """
    Vérificateur DeviceCheck pour iOS.
    
    Documentation: https://developer.apple.com/documentation/devicecheck
    """
    
    DEVICECHECK_API_URL = "https://api.devicecheck.apple.com/v1/validate_device_token"
    
    def __init__(self):
        self.key_id = os.getenv('APPLE_DEVICE_CHECK_KEY_ID')
        self.team_id = os.getenv('APPLE_DEVICE_CHECK_TEAM_ID')
        self.private_key = os.getenv('APPLE_DEVICE_CHECK_PRIVATE_KEY')
    
    async def verify_token(self, device_token: str) -> Dict[str, Any]:
        """
        Vérifie un token DeviceCheck iOS.
        
        Args:
            device_token: Token reçu de l'app iOS
            
        Returns:
            Dict avec success, verdict, et éventuellement error
        """
        if not all([self.key_id, self.team_id, self.private_key]):
            logger.warning("Apple DeviceCheck not configured")
            return {
                'success': False,
                'error': 'DeviceCheck not configured',
                'verdict': None
            }
        
        try:
            # Générer le JWT pour l'authentification Apple
            auth_token = self._generate_auth_token()
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    self.DEVICECHECK_API_URL,
                    headers={
                        'Authorization': f'Bearer {auth_token}',
                        'Content-Type': 'application/json'
                    },
                    json={
                        'device_token': device_token,
                        'timestamp': int(time.time() * 1000),
                        'transaction_id': str(int(time.time() * 1000))
                    },
                    timeout=10.0
                )
                
                if response.status_code == 200:
                    return {
                        'success': True,
                        'verdict': {
                            'is_genuine': True,
                            'device_valid': True
                        }
                    }
                else:
                    logger.error(f"DeviceCheck API error: {response.status_code}")
                    return {
                        'success': False,
                        'error': f'API error: {response.status_code}',
                        'verdict': None
                    }
                    
        except Exception as e:
            logger.exception(f"DeviceCheck verification error: {e}")
            return {
                'success': False,
                'error': str(e),
                'verdict': None
            }
    
    def _generate_auth_token(self) -> str:
        """Génère un JWT pour l'authentification Apple"""
        now = int(time.time())
        
        payload = {
            'iss': self.team_id,
            'iat': now,
            'exp': now + 300  # 5 minutes
        }
        
        headers = {
            'kid': self.key_id,
            'alg': 'ES256'
        }
        
        return jwt.encode(
            payload,
            self.private_key,
            algorithm='ES256',
            headers=headers
        )


class DeviceIntegrityService:
    """
    Service principal de vérification d'intégrité des appareils.
    """
    
    def __init__(self):
        self.play_integrity = PlayIntegrityVerifier()
        self.device_check = AppleDeviceCheckVerifier()
    
    async def verify_device(
        self,
        device: UserDevice,
        integrity_token: str,
        ip_address: str = None,
        user_agent: str = None
    ) -> Dict[str, Any]:
        """
        Vérifie l'intégrité d'un appareil.
        
        Args:
            device: Instance UserDevice
            integrity_token: Token d'intégrité de l'app
            ip_address: Adresse IP de la requête
            user_agent: User-Agent de la requête
            
        Returns:
            Dict avec success et verdict
        """
        platform = device.platform.lower()
        
        # Choisir le vérificateur selon la plateforme
        if platform == 'android':
            result = await self.play_integrity.verify_token(integrity_token)
            verification_type = 'play_integrity'
        elif platform == 'ios':
            result = await self.device_check.verify_token(integrity_token)
            verification_type = 'device_check'
        else:
            # Plateformes non mobiles (desktop) - vérification basique
            result = self._basic_verification(device, integrity_token)
            verification_type = 'basic'
        
        # Enregistrer le résultat
        log = DeviceVerificationLog(
            device_id=device.id,
            verification_type=verification_type,
            success=result.get('success', False),
            verdict=result.get('verdict'),
            error_message=result.get('error'),
            ip_address=ip_address,
            user_agent=user_agent
        )
        db.session.add(log)
        
        # Mettre à jour l'appareil
        if result.get('success'):
            device.integrity_verified = True
            device.integrity_verified_at = datetime.utcnow()
            device.integrity_verdict = result.get('verdict')
        
        db.session.commit()
        
        return result
    
    def _basic_verification(self, device: UserDevice, token: str) -> Dict[str, Any]:
        """
        Vérification basique pour les plateformes non mobiles.
        Vérifie principalement que le token correspond à l'appareil.
        """
        # Pour desktop, on vérifie le hash du device_id
        expected_hash = UserDevice.hash_device_id(token)
        
        if device.device_id == expected_hash or device.device_id == token:
            return {
                'success': True,
                'verdict': {
                    'is_genuine': True,
                    'verification_method': 'device_id_match'
                }
            }
        
        return {
            'success': False,
            'error': 'Device ID mismatch',
            'verdict': {
                'is_genuine': False,
                'verification_method': 'device_id_match'
            }
        }
    
    def register_device(
        self,
        user_id: str,
        tenant_id: str,
        device_info: dict,
        ip_address: str = None
    ) -> UserDevice:
        """
        Enregistre un nouvel appareil pour un utilisateur.
        
        Args:
            user_id: ID de l'utilisateur
            tenant_id: ID du tenant
            device_info: Informations sur l'appareil
            ip_address: Adresse IP
            
        Returns:
            Instance UserDevice créée ou existante
        """
        raw_device_id = device_info.get('device_id', '')
        device_id = UserDevice.hash_device_id(raw_device_id) if raw_device_id else None
        
        if not device_id:
            raise ValueError("device_id is required")
        
        # Chercher un appareil existant
        existing = UserDevice.query.filter_by(
            user_id=user_id,
            device_id=device_id
        ).first()
        
        if existing:
            # Mettre à jour les infos
            existing.device_name = device_info.get('device_name', existing.device_name)
            existing.os_version = device_info.get('os_version', existing.os_version)
            existing.app_version = device_info.get('app_version', existing.app_version)
            existing.push_token = device_info.get('push_token', existing.push_token)
            if device_info.get('push_token'):
                existing.push_token_updated_at = datetime.utcnow()
            existing.record_usage(ip_address)
            
            # Réactiver si révoqué
            if not existing.is_active:
                existing.is_active = True
                existing.revoked_at = None
                existing.revoked_reason = None
            
            db.session.commit()
            return existing
        
        # Vérifier la limite d'appareils
        from app.models import Tenant
        tenant = Tenant.query.get(tenant_id)
        max_devices = tenant.get_entitlement('max_devices_per_user', 3) if tenant else 3
        
        active_devices = UserDevice.query.filter_by(
            user_id=user_id,
            is_active=True
        ).count()
        
        if active_devices >= max_devices:
            raise ValueError(f"Maximum devices limit ({max_devices}) reached")
        
        # Créer le nouvel appareil
        device = UserDevice(
            user_id=user_id,
            tenant_id=tenant_id,
            device_id=device_id,
            device_name=device_info.get('device_name'),
            device_model=device_info.get('device_model'),
            platform=device_info.get('platform', 'unknown'),
            os_version=device_info.get('os_version'),
            app_version=device_info.get('app_version'),
            channel=device_info.get('channel'),
            push_token=device_info.get('push_token'),
            last_ip=ip_address
        )
        
        if device_info.get('push_token'):
            device.push_token_updated_at = datetime.utcnow()
        
        db.session.add(device)
        db.session.commit()
        
        logger.info(f"New device registered: {device.id} for user {user_id}")
        
        return device
    
    def get_user_devices(self, user_id: str, active_only: bool = True) -> list:
        """Récupère les appareils d'un utilisateur"""
        query = UserDevice.query.filter_by(user_id=user_id)
        if active_only:
            query = query.filter_by(is_active=True)
        return query.order_by(UserDevice.last_used_at.desc()).all()
    
    def revoke_device(self, device_id: str, reason: str = None) -> bool:
        """Révoque un appareil"""
        device = UserDevice.query.get(device_id)
        if device:
            device.revoke(reason)
            db.session.commit()
            logger.info(f"Device {device_id} revoked: {reason}")
            return True
        return False


# Instance singleton
device_integrity_service = DeviceIntegrityService()
