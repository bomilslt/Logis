/**
 * Router - Navigation SPA
 */

const Router = {
    routes: {},
    currentView: null,
    _splashHidden: false,
    
    register(path, handler) {
        this.routes[path] = handler;
    },
    
    init() {
        window.addEventListener('hashchange', () => this.handleRoute());
        this.handleRoute();
    },
    
    handleRoute() {
        let hash = window.location.hash.slice(1) || '/dashboard';
        
        // Rediriger '/' vers '/dashboard'
        if (hash === '/' || hash === '') {
            hash = '/dashboard';
        }
        
        const [path, queryString] = hash.split('?');
        
        // Parse query params
        const params = {};
        if (queryString) {
            new URLSearchParams(queryString).forEach((v, k) => params[k] = v);
        }
        
        // Check auth
        const publicRoutes = ['/login'];
        if (!Store.isAuthenticated() && !publicRoutes.includes(path)) {
            this.navigate('/login');
            return;
        }
        
        if (Store.isAuthenticated() && path === '/login') {
            this.navigate('/dashboard');
            return;
        }
        
        // NOUVEAU: Vérifier les permissions de vue
        const user = Store.getUser();
        if (user && user.role) {
            const accessCheck = ViewFilter.checkRouteAccess(path, user.role);
            
            if (!accessCheck.authorized) {
                console.warn('Accès refusé à la vue:', path, 'Rôle:', user.role);
                
                // Afficher un message d'erreur
                if (Views?.accessDenied?.render) {
                    Views.accessDenied.render(accessCheck);
                } else {
                    // Rediriger vers une vue autorisée
                    const suggestedRoute = accessCheck.suggestedRoute;
                    console.info('Redirection vers:', suggestedRoute);
                    this.navigate(suggestedRoute);
                }
                return;
            }
        }
        
        // Find matching route
        let handler = this.routes[path];
        let routeParams = {};
        
        if (!handler) {
            for (const [route, h] of Object.entries(this.routes)) {
                const match = this.matchRoute(route, path);
                if (match) {
                    handler = h;
                    routeParams = match;
                    break;
                }
            }
        }
        
        if (handler) {
            // Appeler destroy sur la vue precedente si elle existe
            if (this.currentView) {
                const prevViewName = this.currentView.split('/')[1];
                const prevView = Views[prevViewName];
                if (prevView && typeof prevView.destroy === 'function') {
                    prevView.destroy();
                }
            }
            
            this.currentView = path;
            this.updateNav(path);
            this.updateTitle(path);
            handler({ params: routeParams, query: params });

            this.hideSplash();
        } else {
            if (Views?.notFound?.render) {
                this.updateNav('');
                this.updateTitle('/not-found');
                Views.notFound.render(path);

                this.hideSplash();
            } else {
                this.navigate('/dashboard');
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
    
    matchRoute(route, path) {
        const routeParts = route.split('/');
        const pathParts = path.split('/');
        
        if (routeParts.length !== pathParts.length) return null;
        
        const params = {};
        for (let i = 0; i < routeParts.length; i++) {
            if (routeParts[i].startsWith(':')) {
                params[routeParts[i].slice(1)] = pathParts[i];
            } else if (routeParts[i] !== pathParts[i]) {
                return null;
            }
        }
        return params;
    },
    
    navigate(path) {
        window.location.hash = path;
    },
    
    updateNav(path) {
        const basePath = '/' + path.split('/')[1];
        document.querySelectorAll('.nav-link').forEach(link => {
            const href = link.getAttribute('href');
            if (href) {
                const linkPath = href.replace('#', '');
                link.classList.toggle('active', linkPath === basePath);
            }
        });
    },
    
    updateTitle(path) {
        const titles = {
            '/dashboard': 'Dashboard',
            '/packages': 'Colis',
            '/clients': 'Clients',
            '/payments': 'Paiements',
            '/invoices': 'Factures',
            '/reports': 'Rapports',
            '/announcements': 'Annonces',
            '/departures': 'Departs',
            '/pickups': 'Retraits',
            '/pickups-payments': 'Retraits et Paiements',
            '/staff': 'Personnel',
            '/payroll': 'RH / Paie',
            '/tarifs': 'Tarifs',
            '/warehouses': 'Entrepots',
            '/settings': 'Parametres',
            '/profile': 'Mon profil',
            '/test-webhooks': 'Test Webhooks'
        };
        const basePath = '/' + path.split('/')[1];
        const title = titles[basePath] || 'Admin';
        
        // Mettre à jour le titre de la page (document.title)
        document.title = `${title} - Express Cargo Admin`;
        
        // Note: header-title a été remplacé par header-user (nom utilisateur)
        // donc on ne met plus à jour cet élément
    }
};
