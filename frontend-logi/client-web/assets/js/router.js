/**
 * Router - Navigation SPA simple
 */

const Router = {
    routes: {},
    currentView: null,
    initialized: false,
    _splashHidden: false,
    
    /**
     * Enregistrer une route
     */
    register(path, handler) {
        this.routes[path] = handler;
    },
    
    /**
     * Naviguer vers une route
     */
    navigate(path, replace = false) {
        if (replace) {
            window.history.replaceState(null, '', `#${path}`);
        } else {
            window.history.pushState(null, '', `#${path}`);
        }
        this.handleRoute();
    },
    
    /**
     * Gerer le changement de route
     */
    async handleRoute() {
        // Ne pas traiter si pas encore initialisé
        if (!this.initialized) return;
        
        let hash = window.location.hash.slice(1) || '/dashboard';
        
        // Rediriger '/' vers '/dashboard'
        if (hash === '/' || hash === '') {
            hash = '/dashboard';
        }
        
        const [path, queryString] = hash.split('?');
        const params = new URLSearchParams(queryString);
        
        // Verifier authentification
        const publicRoutes = ['/login', '/register', '/forgot-password'];
        if (!Store.isAuthenticated() && !publicRoutes.includes(path)) {
            this.navigate('/login', true);
            return;
        }
        
        // Rediriger si deja connecte
        if (Store.isAuthenticated() && publicRoutes.includes(path)) {
            this.navigate('/dashboard', true);
            return;
        }
        
        // Trouver la route
        let handler = this.routes[path];
        let routeParams = {};
        
        // Verifier les routes dynamiques (ex: /packages/:id)
        if (!handler) {
            for (const [routePath, routeHandler] of Object.entries(this.routes)) {
                const match = this.matchRoute(routePath, path);
                if (match) {
                    handler = routeHandler;
                    routeParams = match;
                    break;
                }
            }
        }
        
        if (handler) {
            // Mettre a jour la navigation active
            this.updateActiveNav(path);
            
            // Afficher/masquer header et nav selon la route
            this.updateLayout(path);
            
            // Charger la vue
            await handler({ params: routeParams, query: params });

            this.hideSplash();
        } else {
            // 404
            if (Views?.notFound?.render) {
                this.updateActiveNav('');
                this.updateLayout(path);
                Views.notFound.render(path);

                this.hideSplash();
            } else {
                this.navigate('/dashboard', true);
            }
        }
    },

    hideSplash() {
        if (this._splashHidden) return;
        this._splashHidden = true;

        if (window.Splash && typeof window.Splash.hide === 'function') {
            window.Splash.hide();
        } else {
            document.body.classList.add('splash-hidden');
        }
    },
    
    /**
     * Matcher une route dynamique
     */
    matchRoute(routePath, actualPath) {
        const routeParts = routePath.split('/');
        const actualParts = actualPath.split('/');
        
        if (routeParts.length !== actualParts.length) return null;
        
        const params = {};
        for (let i = 0; i < routeParts.length; i++) {
            if (routeParts[i].startsWith(':')) {
                params[routeParts[i].slice(1)] = actualParts[i];
            } else if (routeParts[i] !== actualParts[i]) {
                return null;
            }
        }
        return params;
    },
    
    /**
     * Mettre a jour l'element actif dans la navigation
     */
    updateActiveNav(path) {
        // Bottom nav
        document.querySelectorAll('.nav-item').forEach(item => {
            const itemPath = item.getAttribute('href')?.replace('#', '');
            if (itemPath === path || (path.startsWith(itemPath) && itemPath !== '/' && itemPath !== '/dashboard')) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
        
        // Header nav (desktop)
        document.querySelectorAll('.header-nav-item').forEach(item => {
            const itemPath = item.getAttribute('href')?.replace('#', '');
            if (itemPath === path || (path.startsWith(itemPath) && itemPath !== '/' && itemPath !== '/dashboard')) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    },
    
    /**
     * Afficher/masquer header et nav selon la route
     */
    updateLayout(path) {
        const header = document.getElementById('header');
        const bottomNav = document.getElementById('bottom-nav');
        const publicRoutes = ['/login', '/register', '/forgot-password'];
        
        if (publicRoutes.includes(path)) {
            header?.classList.add('hidden');
            bottomNav?.classList.add('hidden');
            document.querySelector('.main-content')?.classList.add('no-nav');
        } else {
            header?.classList.remove('hidden');
            bottomNav?.classList.remove('hidden');
            document.querySelector('.main-content')?.classList.remove('no-nav');
        }
    },
    
    /**
     * Initialiser le router
     */
    init() {
        // Ecouter les changements de hash
        window.addEventListener('hashchange', () => this.handleRoute());
        
        // Intercepter les clics sur les liens
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a[href^="#"]');
            if (link) {
                e.preventDefault();
                const path = link.getAttribute('href').slice(1);
                this.navigate(path);
            }
        });
        
        // Marquer comme initialisé et charger la route initiale immédiatement
        this.initialized = true;
        this.handleRoute();
    }
};
