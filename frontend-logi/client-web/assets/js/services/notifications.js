/**
 * Notifications Service - Gestion des notifications via API
 */

const NotificationsService = {
    listeners: [],
    _cachedCount: 0,
    
    /**
     * Obtenir toutes les notifications depuis l'API
     */
    async getAll(params = {}) {
        try {
            const data = await API.notifications.getAll(params);
            return data.notifications || [];
        } catch (e) {
            console.error('Erreur chargement notifications:', e);
            return [];
        }
    },
    
    /**
     * Obtenir le nombre de non-lues depuis l'API
     */
    async fetchUnreadCount() {
        try {
            const data = await API.notifications.getUnreadCount();
            this._cachedCount = data.unread_count || 0;
            this._notifyListeners();
            return this._cachedCount;
        } catch (e) {
            console.error('Erreur comptage notifications:', e);
            return 0;
        }
    },
    
    /**
     * Retourne le dernier compte connu (sans appel API)
     */
    getUnreadCount() {
        return this._cachedCount;
    },
    
    /**
     * Marquer une notification comme lue
     */
    async markAsRead(id) {
        try {
            await API.notifications.markAsRead(id);
            this._cachedCount = Math.max(0, this._cachedCount - 1);
            this._notifyListeners();
        } catch (e) {
            console.error('Erreur marquage notification:', e);
            throw e;
        }
    },
    
    /**
     * Marquer toutes comme lues
     */
    async markAllAsRead() {
        try {
            await API.notifications.markAllAsRead();
            this._cachedCount = 0;
            this._notifyListeners();
        } catch (e) {
            console.error('Erreur marquage toutes notifications:', e);
            throw e;
        }
    },
    
    /**
     * S'abonner aux changements du compteur
     */
    subscribe(callback) {
        this.listeners.push(callback);
        return () => {
            this.listeners = this.listeners.filter(l => l !== callback);
        };
    },
    
    /**
     * Notifier les listeners du nouveau compteur
     */
    _notifyListeners() {
        this.listeners.forEach(cb => cb(this._cachedCount));
    },
    
    /**
     * Initialiser le service (charger le compteur initial)
     */
    async init() {
        if (Store.isAuthenticated()) {
            await this.fetchUnreadCount();
        }
    }
};
