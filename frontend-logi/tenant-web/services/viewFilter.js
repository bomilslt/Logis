/**
 * Service de filtrage des vues par rôle et modules d'accès
 * =========================================================
 * 
 * Logique d'autorisation:
 * - admin  → accès à TOUTES les vues
 * - staff  → accès selon ses access_modules (assignés par l'admin)
 * - client → ne devrait pas être sur tenant-web (redirigé au login)
 * 
 * Modules backend (VALID_ACCESS_MODULES):
 *   packages, finance, departures, communication, settings, staff
 * 
 * Mapping module → vues frontend:
 *   packages      → packages, packages/:id, clients, clients/:id, pickups-payments
 *   finance       → reports, payroll
 *   departures    → departures
 *   communication → announcements
 *   settings      → tarifs, warehouses, settings
 *   staff         → staff
 * 
 * Vues toujours accessibles (tout rôle admin/staff):
 *   dashboard, profile, subscription
 */

// Mapping: module backend → vues frontend autorisées
const MODULE_VIEWS = {
    packages:      ['packages', 'clients', 'pickups-payments'],
    finance:       ['reports', 'payroll'],
    departures:    ['departures'],
    communication: ['announcements'],
    settings:      ['tarifs', 'settings'],
    staff:         ['staff']
};

// Vues accessibles sans condition de module (tout admin/staff connecté)
const ALWAYS_ALLOWED_VIEWS = ['dashboard', 'profile', 'subscription', 'guide'];

// Vues réservées au développement / super-admin
const DEV_VIEWS = ['test-webhooks'];

// Vues avec sous-routes paramétrées (ex: packages/:id)
const PARAMETERIZED_PARENTS = ['packages', 'clients'];

const ViewFilter = {
    _cache: null,
    _cacheKey: null,

    /**
     * Construit la liste des vues autorisées pour l'utilisateur courant.
     * Utilise le user stocké dans Store (role + access_modules).
     */
    getAuthorizedViews(userRoleOrIgnored) {
        const user = Store.getUser();
        if (!user) return [...ALWAYS_ALLOWED_VIEWS];

        const role = user.role;
        const modules = user.access_modules || [];

        // Clé de cache basée sur le rôle + modules triés
        const key = `${role}:${modules.slice().sort().join(',')}`;
        if (this._cacheKey === key && this._cache) {
            return this._cache;
        }

        let views = [...ALWAYS_ALLOWED_VIEWS];

        if (role === 'admin') {
            // Admin: toutes les vues
            for (const moduleViews of Object.values(MODULE_VIEWS)) {
                views.push(...moduleViews);
            }
            views.push(...DEV_VIEWS);
        } else if (role === 'staff') {
            // Staff: uniquement les vues des modules assignés
            for (const mod of modules) {
                const moduleViews = MODULE_VIEWS[mod];
                if (moduleViews) {
                    views.push(...moduleViews);
                }
            }
        }

        // Dédupliquer
        views = [...new Set(views)];

        // Mettre en cache
        this._cache = views;
        this._cacheKey = key;

        return views;
    },

    /**
     * Vérifie si une vue est autorisée
     */
    isViewAuthorized(viewName, userRoleOrIgnored) {
        const authorizedViews = this.getAuthorizedViews();

        // Vérification exacte
        if (authorizedViews.includes(viewName)) {
            return true;
        }

        // Vérification des sous-routes paramétrées (ex: packages/abc123)
        for (const parent of PARAMETERIZED_PARENTS) {
            if (authorizedViews.includes(parent) && viewName.startsWith(parent + '/')) {
                return true;
            }
        }

        return false;
    },

    /**
     * Filtre la navigation sidebar selon les modules de l'utilisateur
     */
    filterNavigation(userRoleOrIgnored) {
        const navItems = document.querySelectorAll('.nav-link[data-view]');

        navItems.forEach(item => {
            const view = item.dataset.view;
            const isAuthorized = this.isViewAuthorized(view);

            if (!isAuthorized) {
                item.style.display = 'none';
                item.setAttribute('aria-hidden', 'true');
                item.classList.add('nav-link--disabled');
            } else {
                item.style.display = '';
                item.removeAttribute('aria-hidden');
                item.classList.remove('nav-link--disabled');
            }
        });
    },

    /**
     * Vérifie l'accès à une route et retourne les infos de redirection si refusé
     */
    checkRouteAccess(path, userRoleOrIgnored) {
        const cleanPath = path.split('?')[0];

        // Pages publiques
        const publicRoutes = ['/login', '/not-found', '/access-denied'];
        if (publicRoutes.includes(cleanPath)) {
            return { authorized: true, reason: 'public' };
        }

        // Extraire le nom de vue depuis le path (ex: '/packages/abc' → 'packages/abc')
        const viewName = cleanPath.startsWith('/') ? cleanPath.slice(1) : cleanPath;

        const isAuthorized = this.isViewAuthorized(viewName);

        if (!isAuthorized) {
            const user = Store.getUser();
            return {
                authorized: false,
                reason: 'module_restricted',
                userRole: user?.role || 'unknown',
                accessModules: user?.access_modules || [],
                path: cleanPath,
                suggestedRoute: this.getSuggestedRoute()
            };
        }

        return { authorized: true, reason: 'authorized' };
    },

    /**
     * Retourne la meilleure route de repli
     */
    getSuggestedRoute(userRoleOrIgnored) {
        const authorizedViews = this.getAuthorizedViews();
        const priorityRoutes = ['dashboard', 'packages', 'clients', 'profile'];

        for (const route of priorityRoutes) {
            if (authorizedViews.includes(route)) {
                return '/' + route;
            }
        }

        return '/dashboard';
    },

    /**
     * Invalide le cache (appeler après changement de user/modules)
     */
    invalidateCache() {
        this._cache = null;
        this._cacheKey = null;
    },

    /**
     * Retourne les modules disponibles et leur mapping pour l'UI d'administration
     */
    getModuleDefinitions() {
        return {
            packages:      { label: 'Colis & Clients', icon: 'package', description: 'Gestion des colis, clients, retraits et paiements' },
            finance:       { label: 'Finances', icon: 'trending-up', description: 'Rapports financiers et paie' },
            departures:    { label: 'Départs', icon: 'truck', description: 'Gestion des départs' },
            communication: { label: 'Communication', icon: 'megaphone', description: 'Annonces et notifications' },
            settings:      { label: 'Configuration', icon: 'settings', description: 'Tarifs, entrepôts et paramètres' },
            staff:         { label: 'Personnel', icon: 'user-cog', description: 'Gestion du personnel et permissions' }
        };
    },

    /**
     * Retourne des informations de débogage
     */
    getDebugInfo(userRoleOrIgnored) {
        const user = Store.getUser();
        return {
            userRole: user?.role,
            accessModules: user?.access_modules || [],
            authorizedViews: this.getAuthorizedViews(),
            moduleViewMapping: MODULE_VIEWS,
            alwaysAllowed: ALWAYS_ALLOWED_VIEWS,
            cacheKey: this._cacheKey
        };
    },

    /**
     * Crée un message d'erreur personnalisé
     */
    createAccessDeniedMessage(accessInfo) {
        const { userRole, path } = accessInfo;

        const roleLabels = {
            admin: 'Administrateur',
            staff: 'Agent'
        };

        const roleLabel = roleLabels[userRole] || userRole;

        return `Accès refusé: La page "${path}" n'est pas disponible avec vos modules d'accès actuels. Contactez votre administrateur pour obtenir l'accès.`;
    }
};

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ViewFilter;
} else {
    window.ViewFilter = ViewFilter;
}
