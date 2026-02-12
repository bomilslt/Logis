/**
 * CacheService - Cache local avec stratégie stale-while-revalidate
 * 
 * Affiche les données en cache immédiatement, puis met à jour
 * discrètement quand le serveur répond (sans flash/refresh)
 */

const CacheService = {
    STORAGE_KEY: 'app_cache',
    DEFAULT_TTL: 5 * 60 * 1000, // 5 minutes
    _ready: false,
    
    /**
     * Initialise le service (appelé automatiquement)
     */
    init() {
        this._ready = true;
        this.clearOld();
    },
    
    /**
     * Vérifie si le service est prêt
     */
    isReady() {
        return this._ready;
    },
    
    /**
     * Récupère le cache complet depuis localStorage
     */
    _getStore() {
        try {
            const data = localStorage.getItem(this.STORAGE_KEY);
            return data ? JSON.parse(data) : {};
        } catch (e) {
            return {};
        }
    },
    
    /**
     * Sauvegarde le cache dans localStorage
     */
    _setStore(store) {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(store));
        } catch (e) {
            console.warn('[Cache] Storage full, clearing old entries');
            this.clearOld();
        }
    },
    
    /**
     * Récupère une valeur du cache
     * @param {string} key - Clé unique
     * @returns {any|null} - Données ou null si non trouvé
     */
    get(key) {
        if (!this._ready) return null;
        
        try {
            const store = this._getStore();
            const entry = store[key];
            
            if (!entry) return null;
            
            return entry.data;
        } catch (e) {
            console.warn('[Cache] Get error:', e);
            return null;
        }
    },
    
    /**
     * Vérifie si le cache est encore frais (non expiré)
     * @param {string} key - Clé unique
     * @returns {boolean}
     */
    isFresh(key) {
        const store = this._getStore();
        const entry = store[key];
        
        if (!entry) return false;
        
        return Date.now() < entry.expires;
    },
    
    /**
     * Stocke une valeur dans le cache
     * @param {string} key - Clé unique
     * @param {any} data - Données à stocker
     * @param {number} ttl - Durée de vie en ms (défaut: 5min)
     */
    set(key, data, ttl = this.DEFAULT_TTL) {
        const store = this._getStore();
        
        store[key] = {
            data,
            expires: Date.now() + ttl,
            timestamp: Date.now()
        };
        
        this._setStore(store);
    },
    
    /**
     * Supprime une entrée du cache
     * @param {string} key - Clé à supprimer
     */
    remove(key) {
        const store = this._getStore();
        delete store[key];
        this._setStore(store);
    },
    
    /**
     * Supprime les entrées qui matchent un pattern
     * @param {string} pattern - Pattern à matcher (ex: 'packages')
     */
    invalidate(pattern) {
        const store = this._getStore();
        
        Object.keys(store).forEach(key => {
            if (key.includes(pattern)) {
                delete store[key];
            }
        });
        
        this._setStore(store);
    },
    
    /**
     * Nettoie les entrées expirées
     */
    clearOld() {
        const store = this._getStore();
        const now = Date.now();
        
        Object.keys(store).forEach(key => {
            if (store[key].expires < now) {
                delete store[key];
            }
        });
        
        this._setStore(store);
    },
    
    /**
     * Vide tout le cache
     */
    clear() {
        localStorage.removeItem(this.STORAGE_KEY);
    },
    
    /**
     * Stratégie stale-while-revalidate
     * 
     * 1. Retourne les données en cache immédiatement (si disponibles)
     * 2. Fetch les nouvelles données en arrière-plan
     * 3. Appelle onUpdate avec les nouvelles données (pour mise à jour discrète)
     * 
     * @param {string} key - Clé de cache
     * @param {Function} fetchFn - Fonction async qui fetch les données
     * @param {Object} options - Options
     * @param {Function} options.onUpdate - Callback appelé quand nouvelles données arrivent
     * @param {number} options.ttl - Durée de vie du cache
     * @param {boolean} options.forceRefresh - Force le refresh même si cache frais
     * @returns {Promise<any>} - Données (cache ou fraîches)
     */
    async swr(key, fetchFn, options = {}) {
        const { onUpdate, ttl = this.DEFAULT_TTL, forceRefresh = false } = options;
        
        const cached = this.get(key);
        const isFresh = this.isFresh(key);
        
        // Si cache frais et pas de force refresh, retourner directement
        if (cached && isFresh && !forceRefresh) {
            return cached;
        }
        
        // Si cache existe (même périmé), le retourner et revalider en arrière-plan
        if (cached && !forceRefresh) {
            // Revalidate en arrière-plan
            this._revalidate(key, fetchFn, ttl, onUpdate);
            return cached;
        }
        
        // Pas de cache, fetch obligatoire
        try {
            const freshData = await fetchFn();
            this.set(key, freshData, ttl);
            return freshData;
        } catch (error) {
            // En cas d'erreur, retourner le cache périmé si disponible
            if (cached) {
                console.warn('[Cache] Fetch failed, using stale data');
                return cached;
            }
            throw error;
        }
    },
    
    /**
     * Revalide en arrière-plan et appelle onUpdate si données différentes
     */
    async _revalidate(key, fetchFn, ttl, onUpdate) {
        try {
            const freshData = await fetchFn();
            const cached = this.get(key);
            
            // Comparer les données (simple JSON stringify)
            const hasChanged = JSON.stringify(freshData) !== JSON.stringify(cached);
            
            // Mettre à jour le cache
            this.set(key, freshData, ttl);
            
            // Notifier si changement et callback fourni
            if (hasChanged && onUpdate) {
                onUpdate(freshData);
            }
        } catch (error) {
            console.warn('[Cache] Background revalidation failed:', error.message);
        }
    }
};

// Initialiser le service au chargement
CacheService.init();
