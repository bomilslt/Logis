/**
 * Store - Gestion de l'etat
 * SECURITE: Utilise sessionStorage pour les tokens (protection XSS)
 */

const Store = {
    // ==================== AUTH ====================
    // Tokens en sessionStorage (plus sécurisé que localStorage)
    
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
            return !!this.getUser();
        }

        const token = this.getToken();
        if (!token) return false;

        // Vérifier si le token n'est pas expiré
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
    },
    
    // ==================== GENERIC STORAGE ====================
    // Données non sensibles en localStorage
    
    get(key) {
        const data = localStorage.getItem('admin_' + key);
        if (!data) return null;
        try { return JSON.parse(data); } catch { return data; }
    },
    
    set(key, value) {
        localStorage.setItem('admin_' + key, JSON.stringify(value));
    },
    
    remove(key) {
        localStorage.removeItem('admin_' + key);
    }
};
