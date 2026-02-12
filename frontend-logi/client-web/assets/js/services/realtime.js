/**
 * Service Temps Réel - WebSocket Client
 * ======================================
 * 
 * Gère la connexion WebSocket pour les mises à jour en temps réel.
 * Utilise Socket.IO côté client.
 */

const RealtimeService = {
    socket: null,
    connected: false,
    reconnectAttempts: 0,
    maxReconnectAttempts: 5,
    reconnectDelay: 1000,
    listeners: new Map(),
    pendingSubscriptions: [],

    /**
     * Initialise la connexion WebSocket
     */
    async connect() {
        const token = Store.getToken();

        if (CONFIG.AUTH_MODE !== 'cookie' && !token) {
            console.warn('[Realtime] Pas de token, connexion impossible');
            return false;
        }

        // Vérifier si Socket.IO est chargé
        if (typeof io === 'undefined') {
            console.warn('[Realtime] Socket.IO non chargé');
            return false;
        }

        const wsUrl = CONFIG.WS_URL || CONFIG.API_URL.replace('/api', '');

        try {
            const ioOptions = {
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionAttempts: this.maxReconnectAttempts,
                reconnectionDelay: this.reconnectDelay,
                timeout: 10000
            };

            if (CONFIG.AUTH_MODE === 'cookie') {
                // Socket.IO enverra les cookies si CORS/serveur le permettent
                ioOptions.withCredentials = true;
            } else {
                ioOptions.query = { token };
            }

            this.socket = io(wsUrl, {
                ...ioOptions,
                transports: ['websocket', 'polling'],
                reconnection: true
            });

            this._setupEventHandlers();
            
            return new Promise((resolve) => {
                this.socket.on('connect', () => {
                    resolve(true);
                });
                
                this.socket.on('connect_error', () => {
                    resolve(false);
                });
                
                // Timeout
                setTimeout(() => resolve(false), 10000);
            });

        } catch (error) {
            console.error('[Realtime] Erreur connexion:', error);
            return false;
        }
    },

    /**
     * Configure les handlers d'événements
     */
    _setupEventHandlers() {
        if (!this.socket) return;

        this.socket.on('connect', () => {
            console.log('[Realtime] Connecté');
            this.connected = true;
            this.reconnectAttempts = 0;
            
            // Réabonner aux rooms en attente
            this.pendingSubscriptions.forEach(sub => {
                this.socket.emit(sub.event, sub.data);
            });
            this.pendingSubscriptions = [];
            
            this._emit('connected', { connected: true });
        });

        this.socket.on('disconnect', (reason) => {
            console.log('[Realtime] Déconnecté:', reason);
            this.connected = false;
            this._emit('disconnected', { reason });
        });

        this.socket.on('connect_error', (error) => {
            console.error('[Realtime] Erreur connexion:', error.message);
            this.reconnectAttempts++;
            this._emit('error', { error: error.message });
        });

        // Événements métier
        this.socket.on('package_update', (data) => {
            console.log('[Realtime] Package update:', data);
            this._emit('package_update', data);
        });

        this.socket.on('new_notification', (data) => {
            console.log('[Realtime] Nouvelle notification:', data);
            this._emit('notification', data);
            this._showNotification(data);
        });

        this.socket.on('invoice_update', (data) => {
            console.log('[Realtime] Invoice update:', data);
            this._emit('invoice_update', data);
        });

        this.socket.on('departure_update', (data) => {
            console.log('[Realtime] Departure update:', data);
            this._emit('departure_update', data);
        });

        this.socket.on('pong', () => {
            // Réponse au ping
        });
    },

    /**
     * Déconnecte le WebSocket
     */
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this.connected = false;
        }
    },

    /**
     * S'abonne aux mises à jour d'un colis
     */
    subscribeToPackage(packageId) {
        if (this.connected && this.socket) {
            this.socket.emit('join_package', { package_id: packageId });
        } else {
            this.pendingSubscriptions.push({
                event: 'join_package',
                data: { package_id: packageId }
            });
        }
    },

    /**
     * Se désabonne des mises à jour d'un colis
     */
    unsubscribeFromPackage(packageId) {
        if (this.connected && this.socket) {
            this.socket.emit('leave_package', { package_id: packageId });
        }
    },

    /**
     * Envoie un ping pour garder la connexion active
     */
    ping() {
        if (this.connected && this.socket) {
            this.socket.emit('ping');
        }
    },

    /**
     * Ajoute un listener pour un événement
     */
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
        
        return () => this.off(event, callback);
    },

    /**
     * Retire un listener
     */
    off(event, callback) {
        if (this.listeners.has(event)) {
            const callbacks = this.listeners.get(event);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    },

    /**
     * Émet un événement aux listeners locaux
     */
    _emit(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`[Realtime] Erreur listener ${event}:`, error);
                }
            });
        }
    },

    /**
     * Affiche une notification système
     */
    _showNotification(data) {
        if (!('Notification' in window)) return;
        
        if (Notification.permission === 'granted') {
            const notification = data.notification || data;
            new Notification(notification.title || 'Express Cargo', {
                body: notification.body || notification.message,
                icon: '/assets/images/icon-192.png',
                tag: notification.id || 'default',
                data: notification.data
            });
        }
    },

    /**
     * Vérifie si connecté
     */
    isConnected() {
        return this.connected;
    },
    
    /**
     * Démarre le service (appelé par App.init)
     */
    start() {
        this.connect();
    },
    
    /**
     * Arrête le service
     */
    stop() {
        this.disconnect();
    }
};
