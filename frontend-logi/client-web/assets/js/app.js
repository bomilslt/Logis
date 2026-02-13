/**
 * App - Point d'entree de l'application
 */

const App = {
    async init() {
        // Initialiser le theme
        this.initTheme();
        
        // Synchroniser la configuration (tarifs, origines, destinations) depuis l'API
        await this.syncConfig();
        
        // Initialiser les composants
        Toast.init();
        Modal.init();
        
        // Enregistrer les routes
        this.registerRoutes();
        
        // Initialiser le router
        Router.init();
        
        // Charger les notifications si connecte
        if (Store.isAuthenticated()) {
            this.loadNotifications();
            this.initPushNotifications();
            
            // Démarrer la synchronisation temps réel
            RealtimeService.start();
        }
        
        // Event listeners globaux
        this.setupEventListeners();
    },
    
    /**
     * Synchronise la configuration depuis l'API du tenant
     * Les tarifs, origines et destinations sont geres par l'admin (tenant-web)
     * et doivent etre synchronises sur le client
     */
    async syncConfig() {
        if (CONFIG.shouldSync()) {
            await CONFIG.syncFromAPI();
        }
    },
    
    initTheme() {
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
    },
    
    /**
     * Initialiser les notifications push
     */
    async initPushNotifications() {
        try {
            await PushService.init();
            
            // Si pas encore de permission, on demandera plus tard (dans les settings)
            if (PushService.isEnabled()) {
                console.log('Push notifications enabled');
            }
        } catch (e) {
            console.warn('Push init failed:', e);
        }
    },
    
    /**
     * Demander la permission push (appele depuis les settings)
     */
    async requestPushPermission() {
        if (!PushService.isSupported()) {
            Toast.error('Notifications non supportees sur ce navigateur');
            return false;
        }
        
        const granted = await PushService.requestPermission();
        if (granted) {
            Toast.success('Notifications activees');
        } else {
            Toast.error('Permission refusee');
        }
        return granted;
    },
    
    registerRoutes() {
        // Auth
        Router.register('/login', () => Views.login.render());
        Router.register('/register', () => Views.register.render());
        Router.register('/forgot-password', () => Views.forgotPassword.render());
        
        // Main
        Router.register('/dashboard', () => Views.dashboard.render());
        Router.register('/packages', () => Views.packages.render());
        Router.register('/packages/:id', (ctx) => Views.packageDetail.render(ctx.params.id));
        Router.register('/new-package', () => Views.newPackage.render());
        Router.register('/track', () => Views.track.render());
        Router.register('/profile', () => Views.profile.render());
        Router.register('/notifications', () => Views.notifications.render());
        Router.register('/history', () => Views.history.render());
        Router.register('/calculator', () => Views.calculator.render());
        Router.register('/templates', () => Views.templates.render());
    },
    
    setupEventListeners() {
        // Bouton notifications header
        document.getElementById('btn-notifications')?.addEventListener('click', () => {
            Router.navigate('/notifications');
        });
        
        // Bouton profil header
        document.getElementById('btn-profile')?.addEventListener('click', () => {
            Router.navigate('/profile');
        });
    },
    
    async loadNotifications() {
        // S'abonner aux changements du compteur
        NotificationsService.subscribe((count) => {
            this.updateNotificationBadge(count);
        });
        
        // Charger le compteur depuis l'API
        await NotificationsService.init();
        
        // Ecouter les nouvelles notifications en temps reel
        RealtimeService.on('notification', () => {
            NotificationsService.fetchUnreadCount();
        });
    },
    
    updateNotificationBadge(count) {
        const badge = document.getElementById('notification-badge');
        if (badge) {
            if (count > 0) {
                badge.textContent = count > 99 ? '99+' : count;
                badge.hidden = false;
            } else {
                badge.hidden = true;
            }
        }
    }
};

// Demarrer l'application
document.addEventListener('DOMContentLoaded', () => App.init());
