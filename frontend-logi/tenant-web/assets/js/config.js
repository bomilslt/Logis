/**
 * Configuration Express Cargo - Tenant Admin
 * ===========================================
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
        TENANT_ID: 'ec-tenant-001',
        TENANT_SLUG: 'express-cargo'
    },
    production: {
        // Ces valeurs seront surchargées par window.EXPRESS_CARGO_CONFIG
        API_URL: 'https://api.expresscargo.com/api',
        TENANT_ID: 'ec-tenant-001',
        TENANT_SLUG: 'express-cargo'
    },
    mobile: {
        // Pour l'APK, utiliser l'URL de production
        API_URL: 'https://api.expresscargo.com/api',
        TENANT_ID: 'ec-tenant-001',
        TENANT_SLUG: 'express-cargo'
    }
};

// Fusion avec la config injectée (si présente)
const INJECTED_CONFIG = window.EXPRESS_CARGO_CONFIG || {};

const CONFIG = {
    // ==========================================
    // Configuration dynamique (par environnement)
    // ==========================================
    
    get TENANT_ID() {
        return INJECTED_CONFIG.TENANT_ID || ENV_CONFIG[ENV].TENANT_ID;
    },
    
    get TENANT_SLUG() {
        return INJECTED_CONFIG.TENANT_SLUG || ENV_CONFIG[ENV].TENANT_SLUG;
    },
    
    get API_URL() {
        return INJECTED_CONFIG.API_URL || ENV_CONFIG[ENV].API_URL;
    },
    
    ENV: ENV,
    
    // ==========================================
    // Configuration statique
    // ==========================================
    
    APP_NAME: 'Express Cargo Admin',
    APP_VERSION: '1.0.0',

    // Auth mode: 'cookie' utilise les cookies HttpOnly du backend
    AUTH_MODE: 'cookie',
    
    STORAGE_KEYS: {
        ACCESS_TOKEN: 'ec_admin_access_token',
        REFRESH_TOKEN: 'ec_admin_refresh_token',
        USER: 'ec_admin_user'
    },
    
    PACKAGE_STATUSES: {
        pending: { label: 'En attente', color: 'gray' },
        received: { label: 'Recu', color: 'info' },
        in_transit: { label: 'En transit', color: 'primary' },
        arrived_port: { label: 'Arrive au port', color: 'warning' },
        customs: { label: 'Dedouanement', color: 'warning' },
        out_for_delivery: { label: 'En livraison', color: 'success' },
        delivered: { label: 'Livre', color: 'success' }
    },
    
    TRANSPORT_MODES: [
        { value: 'sea', label: 'Bateau (Maritime)' },
        { value: 'air_normal', label: 'Avion - Normal' },
        { value: 'air_express', label: 'Avion - Express' }
    ],
    
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
    
    USER_ROLES: {
        admin: { label: 'Administrateur', color: 'primary' },
        staff: { label: 'Employe', color: 'info' },
        client: { label: 'Client', color: 'gray' }
    },
    
    // ==========================================
    // Données dynamiques (chargées depuis l'API ou localStorage)
    // Retourne un objet vide si pas de données - l'admin doit configurer ses propres valeurs
    // ==========================================
    
    get ORIGINS() {
        const cached = localStorage.getItem('ec_origins');
        if (cached) {
            try { return JSON.parse(cached); } catch(e) {}
        }
        // Pas de fallback sur les valeurs par défaut - retourner objet vide
        return {};
    },
    
    get DESTINATIONS() {
        const cached = localStorage.getItem('ec_destinations');
        if (cached) {
            try { return JSON.parse(cached); } catch(e) {}
        }
        // Pas de fallback sur les valeurs par défaut - retourner objet vide
        return {};
    },
    
    get SHIPPING_RATES() {
        const cached = localStorage.getItem('ec_routes');
        if (cached) {
            try { return JSON.parse(cached); } catch(e) {}
        }
        // Pas de fallback sur les valeurs par défaut - retourner objet vide
        return {};
    },
    
    // ==========================================
    // Valeurs par défaut
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
                { id: 'dla-akwa', name: 'Douala - Akwa (Rue de la Joie)' },
                { id: 'dla-bonaberi', name: 'Douala - Bonaberi' },
                { id: 'yde-bastos', name: 'Yaounde - Bastos' },
                { id: 'yde-mvog-ada', name: 'Yaounde - Mvog-Ada' }
            ]
        },
        'Nigeria': {
            label: 'Nigeria',
            warehouses: [
                { id: 'lag-ikeja', name: 'Lagos - Ikeja' },
                { id: 'lag-vi', name: 'Lagos - Victoria Island' }
            ]
        },
        'Senegal': {
            label: 'Senegal',
            warehouses: [
                { id: 'dkr-plateau', name: 'Dakar - Plateau' }
            ]
        },
        'Ivory Coast': {
            label: 'Cote d\'Ivoire',
            warehouses: [
                { id: 'abj-plateau', name: 'Abidjan - Plateau' },
                { id: 'abj-cocody', name: 'Abidjan - Cocody' }
            ]
        },
        'Ghana': {
            label: 'Ghana',
            warehouses: [
                { id: 'acc-osu', name: 'Accra - Osu' }
            ]
        },
        'Gabon': {
            label: 'Gabon',
            warehouses: [{ id: 'lbv-centre', name: 'Libreville - Centre ville' }]
        },
        'Congo': {
            label: 'Congo',
            warehouses: [
                { id: 'bzv-centre', name: 'Brazzaville - Centre' },
                { id: 'pnr-centre', name: 'Pointe-Noire - Centre' }
            ]
        },
        'DRC': {
            label: 'RD Congo',
            warehouses: [
                { id: 'kin-gombe', name: 'Kinshasa - Gombe' },
                { id: 'lshi-centre', name: 'Lubumbashi - Centre' }
            ]
        }
    },
    
    _DEFAULT_SHIPPING_RATES: {
        'China_Cameroon': {
            sea: { container: 2500, baco: 800, carton: 150, vehicle: 1500, other_sea: 150, currency: 'USD' },
            air_normal: { normal: 12, risky: 18, phone_boxed: 8, phone_unboxed: 6, laptop: 15, tablet: 10, currency: 'USD' },
            air_express: { normal: 18, risky: 25, phone_boxed: 12, phone_unboxed: 9, laptop: 22, tablet: 15, currency: 'USD' }
        },
        'China_Nigeria': {
            sea: { container: 2800, baco: 900, carton: 165, vehicle: 1700, other_sea: 165, currency: 'USD' },
            air_normal: { normal: 13, risky: 19, phone_boxed: 9, phone_unboxed: 7, laptop: 16, tablet: 11, currency: 'USD' },
            air_express: { normal: 20, risky: 27, phone_boxed: 13, phone_unboxed: 10, laptop: 24, tablet: 16, currency: 'USD' }
        },
        'Dubai_Cameroon': {
            sea: { container: 2200, baco: 700, carton: 130, vehicle: 1300, other_sea: 130, currency: 'USD' },
            air_normal: { normal: 10, risky: 15, phone_boxed: 7, phone_unboxed: 5, laptop: 13, tablet: 9, currency: 'USD' },
            air_express: { normal: 15, risky: 22, phone_boxed: 10, phone_unboxed: 8, laptop: 19, tablet: 13, currency: 'USD' }
        },
        'Turkey_Cameroon': {
            sea: { container: 2300, baco: 750, carton: 140, vehicle: 1400, other_sea: 140, currency: 'USD' },
            air_normal: { normal: 11, risky: 16, phone_boxed: 7, phone_unboxed: 5, laptop: 14, tablet: 9, currency: 'USD' },
            air_express: { normal: 16, risky: 23, phone_boxed: 11, phone_unboxed: 8, laptop: 20, tablet: 14, currency: 'USD' }
        }
    },
    
    // Devises supportées
    CURRENCIES: ['XAF', 'XOF', 'USD'],
    
    ITEMS_PER_PAGE: 20,
    TOAST_DURATION: 4000
};

// Log de la configuration au démarrage
console.log(`[CONFIG] Environment: ${ENV}, API: ${CONFIG.API_URL}`);
