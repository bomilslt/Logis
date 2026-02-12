/**
 * Configuration Express Cargo - Client Web
 * =========================================
 * 
 * Ce fichier gère la configuration pour différents environnements:
 * - Développement local
 * - Production (site web)
 * - APK mobile (Capacitor)
 * 
 * Les valeurs peuvent être surchargées via:
 * 1. window.EXPRESS_CARGO_CONFIG (injecté au build)
 * 2. Variables dans index.html
 * 3. Valeurs par défaut ci-dessous
 */

// Détection de l'environnement
const ENV = (() => {
    // Capacitor/Cordova (APK)
    if (window.Capacitor || window.cordova) return 'mobile';
    
    // Production (hostname personnalisé)
    if (location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return 'production';
    
    // Développement
    return 'development';
})();

// Configuration par environnement
const ENV_CONFIG = {
    development: {
        // Utiliser la même origine que le frontend pour éviter les problèmes CORS
        API_URL: `http://${location.hostname}:5000/api`,
        TENANT_ID: 'ec-tenant-001'
    },
    production: {
        // Ces valeurs seront surchargées par window.EXPRESS_CARGO_CONFIG
        API_URL: 'https://logis-production.up.railway.app/api',
        TENANT_ID: 'ec-tenant-001'
    },
    mobile: {
        // Pour l'APK, utiliser l'URL de production
        API_URL: 'https://logis-production.up.railway.app/api',
        TENANT_ID: 'ec-tenant-001'
    }
};

// Fusion avec la config injectée (si présente)
const INJECTED_CONFIG = window.EXPRESS_CARGO_CONFIG || {};

const CONFIG = {
    // ==========================================
    // Configuration dynamique (par environnement)
    // ==========================================
    
    // Tenant ID - Identifiant unique de l'entreprise
    get TENANT_ID() {
        return INJECTED_CONFIG.TENANT_ID || ENV_CONFIG[ENV].TENANT_ID;
    },
    
    // API URL - URL du backend
    get API_URL() {
        return INJECTED_CONFIG.API_URL || ENV_CONFIG[ENV].API_URL;
    },
    
    // Environnement actuel
    ENV: ENV,
    
    // ==========================================
    // Configuration statique
    // ==========================================
    
    // App Info
    APP_NAME: 'Express Cargo',
    APP_VERSION: '1.0.0',

    // Auth mode: 'cookie' utilise les cookies HttpOnly du backend
    AUTH_MODE: 'cookie',
    
    // Storage Keys
    STORAGE_KEYS: {
        ACCESS_TOKEN: 'ec_access_token',
        REFRESH_TOKEN: 'ec_refresh_token',
        USER: 'ec_user'
    },
    
    // Statuts des colis avec labels et couleurs
    PACKAGE_STATUSES: {
        pending: { label: 'En attente', color: 'gray' },
        received: { label: 'Recu', color: 'info' },
        in_transit: { label: 'En transit', color: 'primary' },
        arrived_port: { label: 'Arrive au port', color: 'warning' },
        customs: { label: 'Dedouanement', color: 'warning' },
        out_for_delivery: { label: 'En livraison', color: 'success' },
        delivered: { label: 'Livre', color: 'success' }
    },
    
    // Moyens de transport
    TRANSPORT_MODES: [
        { value: 'sea', label: 'Bateau (Maritime)' },
        { value: 'air_normal', label: 'Avion - Normal' },
        { value: 'air_express', label: 'Avion - Express' }
    ],
    
    // Types de colis par transport
    PACKAGE_TYPES: {
        sea: [
            { value: 'container', label: 'Conteneur', unit: 'fixed' },
            { value: 'baco', label: 'Baco', unit: 'fixed' },
            { value: 'carton', label: 'Carton', unit: 'cbm' },
            { value: 'vehicle', label: 'Vehicule', unit: 'fixed' },
            { value: 'other_sea', label: 'Autre (au m³)', unit: 'cbm' }
        ],
        air: [
            { value: 'normal', label: 'Normal', unit: 'kg' },
            { value: 'risky', label: 'Risque (batterie, liquide, gaz)', unit: 'kg' },
            { value: 'phone_boxed', label: 'Telephone avec carton', unit: 'piece' },
            { value: 'phone_unboxed', label: 'Telephone sans carton', unit: 'piece' },
            { value: 'laptop', label: 'Ordinateur', unit: 'piece' },
            { value: 'tablet', label: 'Tablette', unit: 'piece' }
        ]
    },
    
    // ==========================================
    // Données dynamiques (chargées depuis l'API)
    // Retourne un objet vide si pas de données - les données viennent de l'API
    // ==========================================
    
    // Tarifs - chargés depuis le cache local (synchronisé avec l'API)
    get SHIPPING_RATES() {
        const cached = localStorage.getItem('ec_cached_routes');
        if (cached) {
            try { return JSON.parse(cached); } catch(e) {}
        }
        // Pas de fallback - retourner objet vide
        return {};
    },
    
    // Infos du tenant (nom, téléphone, email, adresse)
    get TENANT_INFO() {
        const cached = localStorage.getItem('ec_cached_tenant');
        if (cached) {
            try { return JSON.parse(cached); } catch(e) {}
        }
        return { name: this.APP_NAME };
    },
    
    // Branding (logo, header, footer, couleur)
    get BRANDING() {
        const cached = localStorage.getItem('ec_cached_branding');
        if (cached) {
            try { 
                const branding = JSON.parse(cached);
                console.log('[CONFIG] Branding loaded:', { 
                    hasLogo: !!branding.logo, 
                    color: branding.primary_color 
                });
                return branding; 
            } catch(e) {
                console.warn('[CONFIG] Failed to parse branding:', e);
            }
        }
        return { logo: null, header: '', footer: '', primary_color: '#2563eb' };
    },
    
    /**
     * Force la synchronisation (ignore le cache)
     */
    async forceSync() {
        localStorage.removeItem('ec_config_last_sync');
        return await this.syncFromAPI();
    },
    
    // Pays/villes de départ
    get ORIGINS() {
        const cached = localStorage.getItem('ec_cached_origins');
        if (cached) {
            try { return JSON.parse(cached); } catch(e) {}
        }
        // Pas de fallback - retourner objet vide
        return {};
    },
    
    // Pays de destination
    get DESTINATIONS() {
        const cached = localStorage.getItem('ec_cached_destinations');
        if (cached) {
            try { return JSON.parse(cached); } catch(e) {}
        }
        // Pas de fallback - retourner objet vide
        return {};
    },
    
    /**
     * Synchronise les données de configuration depuis l'API
     * Appelé au démarrage de l'app et périodiquement
     */
    async syncFromAPI() {
        try {
            const response = await fetch(`${this.API_URL}/config/tenant/${this.TENANT_ID}`, { credentials: 'include' });
            if (response.ok) {
                const data = await response.json();
                console.log('[CONFIG] Received from API:', {
                    hasTenant: !!data.tenant,
                    hasBranding: !!data.branding,
                    brandingColor: data.branding?.primary_color,
                    hasLogo: !!data.branding?.logo
                });
                if (data.origins) localStorage.setItem('ec_cached_origins', JSON.stringify(data.origins));
                if (data.destinations) localStorage.setItem('ec_cached_destinations', JSON.stringify(data.destinations));
                if (data.shipping_rates) localStorage.setItem('ec_cached_routes', JSON.stringify(data.shipping_rates));
                if (data.tenant) localStorage.setItem('ec_cached_tenant', JSON.stringify(data.tenant));
                if (data.branding) localStorage.setItem('ec_cached_branding', JSON.stringify(data.branding));
                localStorage.setItem('ec_config_last_sync', Date.now().toString());
                console.log('[CONFIG] Synchronized from API');
                return true;
            }
        } catch (e) {
            console.warn('[CONFIG] Sync failed, using cached/default values:', e.message);
        }
        return false;
    },
    
    /**
     * Vérifie si une synchronisation est nécessaire (toutes les 5 minutes)
     */
    shouldSync() {
        const lastSync = localStorage.getItem('ec_config_last_sync');
        if (!lastSync) return true;
        const elapsed = Date.now() - parseInt(lastSync);
        return elapsed > 5 * 60 * 1000; // 5 minutes
    },
    
    // ==========================================
    // Valeurs par défaut (fallback)
    // ==========================================
    
    _DEFAULT_ORIGINS: {
        'China': {
            label: 'Chine',
            cities: [
                { id: 'gz', name: 'Guangzhou (Canton)' },
                { id: 'sz', name: 'Shenzhen' },
                { id: 'yw', name: 'Yiwu' },
                { id: 'sh', name: 'Shanghai' }
            ]
        },
        'Dubai': {
            label: 'Dubai',
            cities: [{ id: 'dxb', name: 'Dubai' }]
        },
        'Turkey': {
            label: 'Turquie',
            cities: [{ id: 'ist', name: 'Istanbul' }]
        }
    },

    _DEFAULT_DESTINATIONS: {
        'Cameroon': {
            label: 'Cameroun',
            warehouses: [
                { id: 'dla-akwa', name: 'Douala - Akwa' },
                { id: 'yde-bastos', name: 'Yaounde - Bastos' }
            ]
        }
    },

    _DEFAULT_SHIPPING_RATES: {
        'China_Cameroon': {
            sea: { container: 2500, baco: 800, carton: 150, currency: 'USD' },
            air_normal: { normal: 12, risky: 18, currency: 'USD' },
            air_express: { normal: 18, risky: 25, currency: 'USD' }
        }
    },
    
    // Helper pour obtenir les tarifs d'une route
    getRouteRates(originCountry, destCountry) {
        const routeKey = `${originCountry}_${destCountry}`;
        return this.SHIPPING_RATES[routeKey] || null;
    },
    
    // Devises supportées
    CURRENCIES: ['XAF', 'XOF', 'USD'],
    
    // Pagination
    ITEMS_PER_PAGE: 20,
    
    // Timeouts
    TOAST_DURATION: 4000,
    API_TIMEOUT: 30000
};

// Freeze pour éviter les modifications accidentelles
Object.freeze(CONFIG.STORAGE_KEYS);
Object.freeze(CONFIG.PACKAGE_STATUSES);

// Log de la configuration au démarrage
console.log(`[CONFIG] Environment: ${ENV}, API: ${CONFIG.API_URL}`);
