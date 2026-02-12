/**
 * API Service - Communication avec le backend
 * Gere toutes les requetes HTTP vers l'API Express Cargo
 * 
 * SECURITE:
 * - Gestion automatique du token CSRF
 * - Refresh token automatique
 * - Sanitization des erreurs
 */

const API = {
    /**
     * Configuration de base
     */
    baseURL: CONFIG.API_URL,
    tenantId: CONFIG.TENANT_ID,
    
    /**
     * Stockage du token CSRF
     */
    _csrfToken: null,
    
    /**
     * Getter/Setter pour le CSRF token
     */
    get csrfToken() {
        if (!this._csrfToken) {
            this._csrfToken = sessionStorage.getItem('csrf_token');
        }
        return this._csrfToken;
    },
    
    set csrfToken(token) {
        this._csrfToken = token;
        if (token) {
            sessionStorage.setItem('csrf_token', token);
        } else {
            sessionStorage.removeItem('csrf_token');
        }
    },
    
    /**
     * Headers par defaut pour toutes les requetes
     */
    getHeaders(includeAuth = true, method = 'GET') {
        const headers = {
            'Content-Type': 'application/json',
            'X-Tenant-ID': this.tenantId,
            'X-App-Type': 'client',
            'X-App-Channel': 'web_client'
        };
        
        // En mode cookie, ne pas envoyer d'en-tête Authorization
        if (includeAuth && CONFIG.AUTH_MODE !== 'cookie') {
            const token = Store.getToken();
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }
        }
        
        // Ajouter le token CSRF pour les requetes qui modifient des donnees
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && this.csrfToken) {
            headers['X-CSRF-Token'] = this.csrfToken;
        }
        
        return headers;
    },
    
    /**
     * Requete HTTP generique avec gestion des erreurs
     */
    async request(method, endpoint, data = null, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const includeAuth = options.auth !== false;
        
        const config = {
            method,
            headers: this.getHeaders(includeAuth, method),
            credentials: 'include'
        };
        
        if (data && ['POST', 'PUT', 'PATCH'].includes(method)) {
            config.body = JSON.stringify(data);
        }
        
        try {
            const response = await fetch(url, config);
            
            // Gerer le refresh token si 401
            if (response.status === 401 && includeAuth) {
                const refreshed = await this.refreshToken();
                if (refreshed) {
                    // Retry la requete avec le nouveau token
                    config.headers = this.getHeaders(true, method);
                    const retryResponse = await fetch(url, config);
                    return this.handleResponse(retryResponse);
                } else {
                    // Deconnexion si refresh echoue
                    this.clearAuth();
                    Router.navigate('/login');
                    throw new Error('Session expiree, veuillez vous reconnecter');
                }
            }
            
            // Gerer erreur CSRF
            if (response.status === 403) {
                const errorData = await response.json().catch(() => ({}));
                if (errorData.error && errorData.error.includes('CSRF')) {
                    // Tenter de recuperer un nouveau token CSRF
                    await this.refreshCsrfToken();
                    // Retry
                    config.headers = this.getHeaders(true, method);
                    const retryResponse = await fetch(url, config);
                    return this.handleResponse(retryResponse);
                }
            }
            
            return this.handleResponse(response);
        } catch (error) {
            // Erreur reseau
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                throw new Error('Impossible de contacter le serveur. Verifiez votre connexion.');
            }
            throw error;
        }
    },
    
    /**
     * Traitement de la reponse HTTP
     */
    async handleResponse(response) {
        const contentType = response.headers.get('content-type');
        let data;
        
        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            data = await response.text();
        }
        
        if (!response.ok) {
            // Si c'est une erreur 401, déconnecter l'utilisateur
            if (response.status === 401) {
                console.warn('[API] Session expired, logging out...');
                this.clearAuth();
                // Rediriger vers login seulement si on n'est pas déjà sur login
                if (window.location.hash !== '#/login') {
                    Router.navigate('/login');
                }
            }
            
            // Sanitize error message
            const errorMessage = typeof data?.error === 'string' 
                ? Sanitize.escapeHtml(data.error)
                : `Erreur ${response.status}`;
            throw new Error(errorMessage);
        }
        
        return data;
    },
    
    /**
     * Rafraichir le token d'acces
     */
    async refreshToken() {
        if (CONFIG.AUTH_MODE === 'cookie') {
            try {
                const headers = {
                    'Content-Type': 'application/json',
                    'X-Tenant-ID': this.tenantId,
                    'X-App-Type': 'client',
                    'X-App-Channel': 'web_client'
                };
                
                // Ajouter le token CSRF pour le refresh en mode cookie
                if (this.csrfToken) {
                    headers['X-CSRF-Token'] = this.csrfToken;
                }
                
                const response = await fetch(`${this.baseURL}/auth/refresh`, {
                    method: 'POST',
                    headers,
                    credentials: 'include'
                });
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.csrf_token) {
                        this.csrfToken = data.csrf_token;
                    }
                    return true;
                }
                return false;
            } catch {
                return false;
            }
        } else {
            const refreshToken = Store.getRefreshToken();
            if (!refreshToken) return false;
            
            try {
                const response = await fetch(`${this.baseURL}/auth/refresh`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${refreshToken}`,
                        'X-Tenant-ID': this.tenantId,
                        'X-App-Type': 'client',
                        'X-App-Channel': 'web_client'
                    }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    Store.setToken(data.access_token);
                    Store.setRefreshToken(data.refresh_token);
                    return true;
                }
                return false;
            } catch {
                return false;
            }
        }
    },
    
    /**
     * Recuperer un nouveau token CSRF
     */
    async refreshCsrfToken() {
        try {
            const response = await fetch(`${this.baseURL}/auth/csrf-token`, {
                method: 'GET',
                headers: this.getHeaders(true, 'GET'),
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                this.csrfToken = data.csrf_token;
                return true;
            }
        } catch (e) {
            console.error('CSRF token refresh failed:', e);
        }
        return false;
    },
    
    /**
     * Nettoyer l'authentification
     */
    clearAuth() {
        Store.logout();
        this.csrfToken = null;
    },
    
    // ==================== AUTH ====================
    
    auth: {
        /**
         * Connexion utilisateur
         */
        async login(email, password) {
            const result = await API.request('POST', '/auth/login', { email, password }, { auth: false });
            // Stocker le CSRF token
            if (result.csrf_token) {
                API.csrfToken = result.csrf_token;
            }
            return result;
        },
        
        /**
         * Inscription
         */
        async register(userData) {
            const result = await API.request('POST', '/auth/register', userData, { auth: false });
            // Stocker le CSRF token
            if (result.csrf_token) {
                API.csrfToken = result.csrf_token;
            }
            return result;
        },
        
        /**
         * Deconnexion
         */
        async logout() {
            try {
                await API.request('POST', '/auth/logout');
            } catch (e) {
                // Ignorer les erreurs de logout
            }
            API.clearAuth();
        },
        
        /**
         * Recuperer le profil utilisateur connecte
         */
        async getProfile() {
            return API.request('GET', '/auth/me');
        },
        
        /**
         * Mettre a jour le profil
         */
        async updateProfile(data) {
            return API.request('PUT', '/auth/me', data);
        },
        
        /**
         * Changer le mot de passe
         */
        async changePassword(currentPassword, newPassword) {
            return API.request('POST', '/auth/change-password', {
                current_password: currentPassword,
                new_password: newPassword
            });
        },
        
        /**
         * Changer le mot de passe avec vérification OTP
         */
        async changePasswordVerified(currentPassword, newPassword, verificationToken) {
            return API.request('POST', '/auth/change-password-verified', {
                current_password: currentPassword,
                new_password: newPassword,
                verification_token: verificationToken
            });
        },
        
        /**
         * Réinitialiser le mot de passe (après vérification OTP)
         */
        async resetPassword(email, password, verificationToken) {
            return API.request('POST', '/auth/reset-password', {
                email: email,
                password: password,
                verification_token: verificationToken
            }, { auth: false });
        },
        
        /**
         * Inscription avec email vérifié par OTP
         */
        async registerVerified(userData) {
            const result = await API.request('POST', '/auth/register-verified', userData, { auth: false });
            if (result.csrf_token) {
                API.csrfToken = result.csrf_token;
            }
            return result;
        }
    },
    
    // ==================== PACKAGES ====================
    
    packages: {
        /**
         * Liste des colis du client
         * @param {Object} params - Filtres (page, per_page, status, search)
         */
        async getAll(params = {}) {
            const query = new URLSearchParams();
            if (params.page) query.set('page', params.page);
            if (params.per_page) query.set('per_page', params.per_page);
            if (params.status) query.set('status', params.status);
            if (params.search) query.set('search', params.search);
            
            const queryStr = query.toString();
            return API.request('GET', `/packages${queryStr ? '?' + queryStr : ''}`);
        },
        
        /**
         * Details d'un colis avec historique
         */
        async getById(packageId) {
            return API.request('GET', `/packages/${packageId}`);
        },
        
        /**
         * Creer un nouveau colis
         */
        async create(packageData) {
            return API.request('POST', '/packages', packageData);
        },
        
        /**
         * Modifier un colis
         */
        async update(packageId, packageData) {
            return API.request('PUT', `/packages/${packageId}`, packageData);
        },
        
        /**
         * Supprimer un colis (si pending)
         */
        async delete(packageId) {
            return API.request('DELETE', `/packages/${packageId}`);
        },
        
        /**
         * Statistiques des colis
         */
        async getStats() {
            return API.request('GET', '/packages/stats');
        },
        
        /**
         * Suivi par numero de tracking
         */
        async track(trackingNumber) {
            return API.request('GET', `/packages/track/${trackingNumber}`);
        }
    },
    
    // ==================== TEMPLATES ====================
    
    templates: {
        /**
         * Liste des templates du client
         */
        async getAll() {
            return API.request('GET', '/templates');
        },
        
        /**
         * Détails d'un template
         */
        async getById(templateId) {
            return API.request('GET', `/templates/${templateId}`);
        },
        
        /**
         * Créer un template
         */
        async create(data) {
            return API.request('POST', '/templates', data);
        },
        
        /**
         * Modifier un template
         */
        async update(templateId, data) {
            return API.request('PUT', `/templates/${templateId}`, data);
        },
        
        /**
         * Supprimer un template
         */
        async delete(templateId) {
            return API.request('DELETE', `/templates/${templateId}`);
        }
    },
    
    // ==================== NOTIFICATIONS ====================
    
    notifications: {
        /**
         * Liste des notifications
         */
        async getAll(params = {}) {
            const query = new URLSearchParams();
            if (params.page) query.set('page', params.page);
            if (params.per_page) query.set('per_page', params.per_page);
            if (params.unread_only) query.set('unread_only', 'true');
            
            const queryStr = query.toString();
            return API.request('GET', `/notifications${queryStr ? '?' + queryStr : ''}`);
        },
        
        /**
         * Marquer une notification comme lue
         */
        async markAsRead(notificationId) {
            return API.request('POST', `/notifications/${notificationId}/read`);
        },
        
        /**
         * Marquer toutes comme lues
         */
        async markAllAsRead() {
            return API.request('POST', '/notifications/read-all');
        },
        
        /**
         * Supprimer une notification
         */
        async delete(notificationId) {
            return API.request('DELETE', `/notifications/${notificationId}`);
        },
        
        /**
         * Supprimer toutes les notifications
         */
        async deleteAll() {
            return API.request('DELETE', '/notifications');
        },
        
        /**
         * Nombre de non lues
         */
        async getUnreadCount() {
            return API.request('GET', '/notifications/unread-count');
        },
        
        /**
         * S'abonner aux push notifications
         */
        async subscribePush(token, provider, deviceType = 'web') {
            return API.request('POST', '/notifications/push/subscribe', {
                token,
                provider,
                device_type: deviceType
            });
        },
        
        /**
         * Se desabonner des push
         */
        async unsubscribePush(token) {
            return API.request('POST', '/notifications/push/unsubscribe', { token });
        },
        
        /**
         * Recuperer la cle VAPID pour WebPush
         */
        async getVapidKey() {
            return API.request('GET', '/notifications/push/vapid-key');
        }
    },
    
    // ==================== ONLINE PAYMENTS ====================
    
    payments: {
        async getProviders() {
            return API.request('GET', '/payments/providers');
        },
        
        async initiate(data) {
            return API.request('POST', '/payments/initiate', data);
        },
        
        async checkStatus(paymentId) {
            return API.request('GET', `/payments/${paymentId}/status`);
        },
        
        async getHistory(params = {}) {
            const query = new URLSearchParams();
            if (params.page) query.set('page', params.page);
            if (params.per_page) query.set('per_page', params.per_page);
            const queryStr = query.toString();
            return API.request('GET', `/payments/history${queryStr ? '?' + queryStr : ''}`);
        }
    },
    
    // ==================== CLIENT PROFILE ====================
    
    client: {
        /**
         * Recuperer le profil complet
         */
        async getProfile() {
            return API.request('GET', '/clients/profile');
        },
        
        /**
         * Mettre a jour le profil
         */
        async updateProfile(data) {
            return API.request('PUT', '/clients/profile', data);
        },
        
        /**
         * Mettre a jour les preferences de notification
         */
        async updateNotificationSettings(settings) {
            return API.request('PUT', '/clients/settings/notifications', settings);
        }
    },
    
    // ==================== CONFIG (PUBLIC) ====================
    
    config: {
        /**
         * Recuperer la configuration du tenant (tarifs, origines, destinations)
         * Endpoint public, pas besoin d'auth
         */
        async getTenantConfig() {
            return API.request('GET', `/config/tenant/${API.tenantId}`, null, { auth: false });
        },
        
        /**
         * Recuperer les annonces actives
         */
        async getAnnouncements() {
            return API.request('GET', `/config/tenant/${API.tenantId}/announcements`, null, { auth: false });
        },
        
        /**
         * Calculer le cout d'expedition
         */
        async calculateShipping(data) {
            return API.request('POST', `/config/tenant/${API.tenantId}/calculate`, data, { auth: false });
        }
    }
};
