/**
 * Configuration des vues par rôle
 * Définit quelles vues sont accessibles selon le rôle de l'utilisateur
 */

// Mapping des vues autorisées par rôle
const ROLE_VIEWS = {
    // Administrateur - Accès complet à tout
    admin: [
        'dashboard',
        'packages',
        'packages/:id',
        'clients',
        'clients/:id',
        'reports',
        'announcements',
        'departures',
        'staff',
        'payroll',
        'tarifs',
        'settings',
        'profile',
        'pickups-payments',
        'test-webhooks'
    ],
    
    // Manager - Gestion opérationnelle + rapports
    manager: [
        'dashboard',
        'packages',
        'packages/:id',
        'clients',
        'clients/:id',
        'reports',
        'announcements',
        'departures',
        'profile',
        'pickups-payments'
        // Note: staff, payroll, tarifs, settings exclus
    ],
    
    // Staff - Opérations quotidiennes uniquement
    staff: [
        'dashboard',
        'packages',
        'packages/:id',
        'clients',
        'clients/:id',
        'profile',
        'pickups-payments'
        // Note: reports, announcements, departures exclus
    ],
    
    // Accountant - Finances et rapports
    accountant: [
        'dashboard',
        'pickups-payments',
        'reports',
        'profile'
        // Note: packages, clients, staff exclus
    ],
    
    // Rôle par défaut si non reconnu
    default: [
        'dashboard',
        'profile'
    ]
};

// Catégories de vues pour l'organisation UI
const VIEW_CATEGORIES = {
    operations: {
        label: 'Opérations quotidiennes',
        icon: 'package',
        views: ['packages', 'clients', 'pickups-payments']
    },
    management: {
        label: 'Gestion',
        icon: 'users',
        views: ['staff', 'payroll', 'tarifs', 'settings']
    },
    reporting: {
        label: 'Rapports',
        icon: 'trending-up',
        views: ['reports']
    },
    communication: {
        label: 'Communication',
        icon: 'megaphone',
        views: ['announcements']
    },
    system: {
        label: 'Système',
        icon: 'settings',
        views: ['settings', 'test-webhooks']
    },
    logistics: {
        label: 'Logistique',
        icon: 'truck',
        views: ['departures']
    }
};

// Mapping des vues vers catégories
const VIEW_TO_CATEGORY = {};
for (const [category, config] of Object.entries(VIEW_CATEGORIES)) {
    for (const view of config.views) {
        VIEW_TO_CATEGORY[view] = category;
    }
}

// Permissions requises par vue (pour double vérification)
const VIEW_PERMISSIONS = {
    'packages': 'packages.read',
    'packages/:id': 'packages.read',
    'clients': 'clients.read',
    'clients/:id': 'clients.read',
    'reports': 'reports.operational',
    'announcements': 'announcements.read',
    'departures': 'departures.read',
    'staff': 'staff.read',
    'payroll': 'staff.read',
    'tarifs': 'tarifs.read',
    'settings': 'system.settings',
    'pickups-payments': 'packages.read',
    'test-webhooks': 'system.audit',
    'profile': null // Profil toujours autorisé
};

// Export pour utilisation
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ROLE_VIEWS,
        VIEW_CATEGORIES,
        VIEW_TO_CATEGORY,
        VIEW_PERMISSIONS
    };
}
