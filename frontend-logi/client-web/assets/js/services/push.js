/**
 * Push Notifications Service
 * Gere les notifications push pour PWA et Capacitor (natif)
 */

const PushService = {
    // Cles VAPID pour Web Push (a remplacer par les vraies cles du backend)
    VAPID_PUBLIC_KEY: 'YOUR_VAPID_PUBLIC_KEY_HERE',
    
    // Etat
    _initialized: false,
    _permission: 'default',
    _subscription: null,
    _isNative: false,
    
    /**
     * Initialiser le service push
     */
    async init() {
        if (this._initialized) return;
        
        // Detecter si on est dans Capacitor (app native)
        this._isNative = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();
        
        if (this._isNative) {
            await this._initNative();
        } else {
            await this._initWeb();
        }
        
        this._initialized = true;
    },
    
    /**
     * Init pour app native (Capacitor)
     */
    async _initNative() {
        try {
            const { PushNotifications } = await import('@capacitor/push-notifications');
            
            // Verifier les permissions
            const permStatus = await PushNotifications.checkPermissions();
            this._permission = permStatus.receive;
            
            // Listeners
            PushNotifications.addListener('registration', (token) => {
                console.log('Push registration success, token:', token.value);
                this._sendTokenToServer(token.value, 'fcm');
            });
            
            PushNotifications.addListener('registrationError', (error) => {
                console.error('Push registration error:', error);
            });
            
            PushNotifications.addListener('pushNotificationReceived', (notification) => {
                console.log('Push received:', notification);
                this._handleNotification(notification);
            });
            
            PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
                console.log('Push action:', action);
                this._handleNotificationClick(action.notification);
            });
            
        } catch (e) {
            console.warn('Capacitor Push not available:', e);
        }
    },
    
    /**
     * Init pour PWA (Web Push)
     */
    async _initWeb() {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            console.warn('Push notifications not supported');
            return;
        }
        
        try {
            // Enregistrer le service worker
            const registration = await navigator.serviceWorker.register('/sw.js');
            console.log('Service Worker registered');
            
            // Verifier la permission actuelle
            this._permission = Notification.permission;
            
            // Recuperer la subscription existante
            this._subscription = await registration.pushManager.getSubscription();
            
        } catch (e) {
            console.error('Service Worker registration failed:', e);
        }
    },
    
    /**
     * Demander la permission et s'abonner
     */
    async requestPermission() {
        if (this._isNative) {
            return await this._requestNativePermission();
        } else {
            return await this._requestWebPermission();
        }
    },
    
    /**
     * Permission native (Capacitor)
     */
    async _requestNativePermission() {
        try {
            const { PushNotifications } = await import('@capacitor/push-notifications');
            
            const permStatus = await PushNotifications.requestPermissions();
            this._permission = permStatus.receive;
            
            if (permStatus.receive === 'granted') {
                await PushNotifications.register();
                return true;
            }
            
            return false;
        } catch (e) {
            console.error('Native permission error:', e);
            return false;
        }
    },
    
    /**
     * Permission web (PWA)
     */
    async _requestWebPermission() {
        try {
            const permission = await Notification.requestPermission();
            this._permission = permission;
            
            if (permission !== 'granted') {
                return false;
            }
            
            // S'abonner aux push
            const registration = await navigator.serviceWorker.ready;
            
            this._subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: this._urlBase64ToUint8Array(this.VAPID_PUBLIC_KEY)
            });
            
            // Envoyer la subscription au serveur
            await this._sendTokenToServer(JSON.stringify(this._subscription), 'webpush');
            
            return true;
        } catch (e) {
            console.error('Web permission error:', e);
            return false;
        }
    },
    
    /**
     * Verifier si les notifications sont activees
     */
    isEnabled() {
        return this._permission === 'granted';
    },
    
    /**
     * Verifier si les notifications sont supportees
     */
    isSupported() {
        if (this._isNative) {
            return true; // Capacitor supporte toujours
        }
        return 'serviceWorker' in navigator && 'PushManager' in window;
    },
    
    /**
     * Obtenir le statut de permission
     */
    getPermissionStatus() {
        return this._permission;
    },
    
    /**
     * Se desabonner des notifications
     */
    async unsubscribe() {
        if (this._isNative) {
            // Pour Capacitor, on supprime juste le token cote serveur
            await this._removeTokenFromServer();
        } else if (this._subscription) {
            await this._subscription.unsubscribe();
            await this._removeTokenFromServer();
            this._subscription = null;
        }
    },
    
    /**
     * Envoyer le token au serveur
     */
    async _sendTokenToServer(token, type) {
        try {
            await API.request('/notifications/push/subscribe', {
                method: 'POST',
                body: JSON.stringify({
                    token: token,
                    type: type, // 'fcm' ou 'webpush'
                    device: this._getDeviceInfo()
                })
            });
            console.log('Push token sent to server');
        } catch (e) {
            console.error('Failed to send token to server:', e);
        }
    },
    
    /**
     * Supprimer le token du serveur
     */
    async _removeTokenFromServer() {
        try {
            await API.request('/notifications/push/unsubscribe', {
                method: 'POST'
            });
        } catch (e) {
            console.error('Failed to remove token:', e);
        }
    },
    
    /**
     * Gerer une notification recue (app ouverte)
     */
    _handleNotification(notification) {
        // Mettre a jour le badge
        NotificationService.refreshBadge();
        
        // Afficher un toast si l'app est au premier plan
        if (notification.title) {
            Toast.info(notification.title);
        }
    },
    
    /**
     * Gerer le clic sur une notification
     */
    _handleNotificationClick(notification) {
        const data = notification.data || {};
        
        // Naviguer vers le colis si package_id present
        if (data.package_id) {
            Router.navigate(`/packages/${data.package_id}`);
        } else {
            Router.navigate('/notifications');
        }
    },
    
    /**
     * Obtenir les infos du device
     */
    _getDeviceInfo() {
        return {
            platform: this._isNative ? (Capacitor.getPlatform()) : 'web',
            userAgent: navigator.userAgent,
            language: navigator.language
        };
    },
    
    /**
     * Convertir la cle VAPID en Uint8Array
     */
    _urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding)
            .replace(/-/g, '+')
            .replace(/_/g, '/');
        
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    },
    
    /**
     * Afficher une notification locale (pour test)
     */
    async showLocalNotification(title, body, data = {}) {
        if (this._isNative) {
            const { LocalNotifications } = await import('@capacitor/local-notifications');
            await LocalNotifications.schedule({
                notifications: [{
                    title: title,
                    body: body,
                    id: Date.now(),
                    extra: data
                }]
            });
        } else if (this._permission === 'granted') {
            new Notification(title, {
                body: body,
                icon: '/assets/images/logo.svg',
                data: data
            });
        }
    }
};
