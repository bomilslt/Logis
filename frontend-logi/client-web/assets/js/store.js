/**
 * Store - Gestion de l'etat de l'application
 * SECURITE: Utilise sessionStorage pour les tokens (protection XSS)
 */

const Store = {
    // ==================== AUTH ====================
    // Tokens en sessionStorage (plus sécurisé que localStorage)
    // Se vide automatiquement à la fermeture du navigateur
    
    getToken() {
        return sessionStorage.getItem(CONFIG.STORAGE_KEYS.ACCESS_TOKEN);
    },
    
    setToken(token) {
        sessionStorage.setItem(CONFIG.STORAGE_KEYS.ACCESS_TOKEN, token);
    },
    
    getRefreshToken() {
        return sessionStorage.getItem(CONFIG.STORAGE_KEYS.REFRESH_TOKEN);
    },
    
    setRefreshToken(token) {
        sessionStorage.setItem(CONFIG.STORAGE_KEYS.REFRESH_TOKEN, token);
    },
    
    getUser() {
        const user = sessionStorage.getItem(CONFIG.STORAGE_KEYS.USER);
        return user ? JSON.parse(user) : null;
    },
    
    setUser(user) {
        sessionStorage.setItem(CONFIG.STORAGE_KEYS.USER, JSON.stringify(user));
    },
    
    isAuthenticated() {
        if (CONFIG.AUTH_MODE === 'cookie') {
            // En mode cookie, vérifier qu'on a un user ET qu'une requête API fonctionne
            const user = this.getUser();
            if (!user) return false;
            
            // Vérifier que la session est encore valide (optionnel, pour éviter les redirects)
            return true; // Temporairement, on fait confiance au cookie
        }

        const token = this.getToken();
        if (!token) return false;

        // Vérifier si le token n'est pas expiré (décodage basique)
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            return payload.exp * 1000 > Date.now();
        } catch {
            return false;
        }
    },
    
    login(data) {
        if (CONFIG.AUTH_MODE !== 'cookie') {
            this.setToken(data.access_token);
            this.setRefreshToken(data.refresh_token);
        }
        if (data && data.csrf_token) {
            sessionStorage.setItem('csrf_token', data.csrf_token);
        }
        this.setUser(data.user);
    },
    
    logout() {
        sessionStorage.removeItem(CONFIG.STORAGE_KEYS.ACCESS_TOKEN);
        sessionStorage.removeItem(CONFIG.STORAGE_KEYS.REFRESH_TOKEN);
        sessionStorage.removeItem(CONFIG.STORAGE_KEYS.USER);
        sessionStorage.removeItem('csrf_token');
        // Nettoyer le cache
        if (typeof CacheService !== 'undefined') {
            CacheService.clear();
        }
        // Nettoyer aussi le state
        this._state = {
            packages: [],
            notifications: [],
            unreadCount: 0,
            stats: null,
            currentPackage: null,
            loading: false
        };
    },
    
    // ==================== GENERIC STORAGE ====================
    // Données non sensibles peuvent rester en localStorage
    
    get(key) {
        const data = localStorage.getItem('app_' + key);
        if (!data) return null;
        try {
            return JSON.parse(data);
        } catch {
            return data;
        }
    },
    
    set(key, value) {
        localStorage.setItem('app_' + key, JSON.stringify(value));
    },
    
    remove(key) {
        localStorage.removeItem('app_' + key);
    },
    
    // ==================== STATE ====================
    
    _state: {
        packages: [],
        notifications: [],
        unreadCount: 0,
        stats: null,
        currentPackage: null,
        loading: false
    },
    
    _listeners: [],
    
    getState() {
        return this._state;
    },
    
    setState(newState) {
        this._state = { ...this._state, ...newState };
        this._notifyListeners();
    },
    
    subscribe(listener) {
        this._listeners.push(listener);
        return () => {
            this._listeners = this._listeners.filter(l => l !== listener);
        };
    },
    
    _notifyListeners() {
        this._listeners.forEach(listener => listener(this._state));
    }
};
