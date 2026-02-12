/**
 * Realtime Service - Synchronisation en temps réel via polling (Admin)
 * Vérifie périodiquement les changements et met à jour l'UI
 */

const RealtimeService = {
    // Intervalle de polling en ms (20 secondes pour admin)
    POLL_INTERVAL: 20000,
    
    // Timer ID
    _pollTimer: null,
    
    // Dernières données connues
    _lastData: {
        packagesHash: null,
        paymentsHash: null
    },
    
    /**
     * Démarrer le polling
     */
    start() {
        if (this._pollTimer) return;
        
        console.log('[Realtime] Starting polling every', this.POLL_INTERVAL / 1000, 'seconds');
        
        // Premier check après 5 secondes (laisser le temps à la page de charger)
        setTimeout(() => this.check(), 5000);
        
        // Puis polling régulier
        this._pollTimer = setInterval(() => this.check(), this.POLL_INTERVAL);
        
        // Pause quand page cachée
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.pause();
            } else {
                this.resume();
            }
        });
    },
    
    /**
     * Arrêter le polling
     */
    stop() {
        if (this._pollTimer) {
            clearInterval(this._pollTimer);
            this._pollTimer = null;
        }
    },
    
    pause() {
        this.stop();
    },
    
    resume() {
        if (!this._pollTimer && Store.isAuthenticated()) {
            this.check();
            this._pollTimer = setInterval(() => this.check(), this.POLL_INTERVAL);
        }
    },
    
    /**
     * Vérifier les changements
     */
    async check() {
        if (!Store.isAuthenticated()) return;
        
        try {
            await this.checkPackages();
        } catch (error) {
            console.warn('[Realtime] Check failed:', error.message);
        }
    },
    
    /**
     * Vérifier les changements de colis
     */
    async checkPackages() {
        try {
            const data = await API.packages.getStats();
            const stats = data.stats || {};
            const hash = JSON.stringify(stats);
            
            if (this._lastData.packagesHash !== null && hash !== this._lastData.packagesHash) {
                console.log('[Realtime] Data changed, refreshing view...');
                this.refreshCurrentView();
            }
            
            this._lastData.packagesHash = hash;
        } catch (error) {
            // Silencieux
        }
    },
    
    /**
     * Rafraîchir la vue courante si pertinent
     */
    refreshCurrentView() {
        const route = window.location.hash;
        
        // Dashboard
        if (route === '#/' || route === '' || route.includes('/dashboard')) {
            if (typeof Views.dashboard?.render === 'function') {
                Views.dashboard.render();
            }
        }
        // Liste des colis
        else if (route === '#/packages' || route === '#/packages/') {
            if (typeof Views.packages?.loadPackages === 'function') {
                Views.packages.loadPackages();
            }
        }
        // Liste des clients
        else if (route === '#/clients' || route === '#/clients/') {
            if (typeof Views.clients?.loadClients === 'function') {
                Views.clients.loadClients();
            }
        }
        // Liste des paiements
        else if (route === '#/payments' || route === '#/payments/') {
            if (typeof Views.payments?.loadPayments === 'function') {
                Views.payments.loadPayments();
            }
        }
    },
    
    /**
     * Forcer un refresh
     */
    forceRefresh() {
        this._lastData.packagesHash = null;
        this.check();
    }
};
