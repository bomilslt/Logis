/**
 * Vue Notifications - Liste des notifications
 * Avec swipe-to-delete sur mobile et cache
 */

Views.notifications = {
    CACHE_KEY: 'notifications_list',
    
    async render() {
        const main = document.getElementById('main-content');
        if (!main) return;
        
        // Vérifier si CacheService est disponible
        const cacheAvailable = typeof CacheService !== 'undefined' && CacheService.isReady();
        
        // Récupérer le cache
        const cached = cacheAvailable ? CacheService.get(this.CACHE_KEY) : null;
        
        // Si cache disponible et valide, afficher immédiatement
        if (cached && Array.isArray(cached)) {
            try {
                this.renderContent(main, cached);
                this.revalidateData(main);
            } catch (error) {
                console.error('[Notifications] Cache render error:', error);
                await this.loadFresh(main);
            }
        } else {
            await this.loadFresh(main);
        }
    },
    
    /**
     * Charge les données fraîches depuis l'API
     */
    async loadFresh(main) {
        main.innerHTML = Loader.page('Chargement...');
        
        try {
            const data = await API.notifications.getAll();
            const notifications = data.notifications || [];
            
            // Mettre en cache
            CacheService.set(this.CACHE_KEY, notifications);
            
            this.renderContent(main, notifications);
            
        } catch (error) {
            console.error('Notifications load error:', error);
            main.innerHTML = `
                <div class="error-state">
                    <svg class="error-state-icon" viewBox="0 0 24 24">
                        <use href="assets/icons/icons.svg#alert-circle"></use>
                    </svg>
                    <h3 class="error-state-title">Erreur de chargement</h3>
                    <p class="error-state-text">${error.message}</p>
                    <button class="btn btn-primary" onclick="Views.notifications.render()">Reessayer</button>
                </div>
            `;
        }
    },
    
    /**
     * Revalide les données en arrière-plan
     */
    async revalidateData(main) {
        try {
            const data = await API.notifications.getAll();
            const notifications = data.notifications || [];
            
            const cached = CacheService.get(this.CACHE_KEY);
            const hasChanged = JSON.stringify(notifications) !== JSON.stringify(cached);
            
            CacheService.set(this.CACHE_KEY, notifications);
            
            if (hasChanged) {
                this.renderContent(main, notifications);
            }
        } catch (error) {
            console.warn('[Notifications] Background refresh failed:', error.message);
        }
    },
    
    /**
     * Affiche le contenu des notifications
     */
    renderContent(main, notifications) {
        const unreadCount = notifications.filter(n => !n.is_read).length;
        
        main.innerHTML = `
            <div class="notifications-view">
                <div class="page-header">
                    <h1 class="page-title">Notifications</h1>
                    <div class="page-actions">
                        ${unreadCount > 0 ? `
                            <button class="btn btn-ghost btn-sm" id="btn-mark-all-read">
                                ${Icons.get('check', { size: 16 })}
                                <span class="btn-text">Tout lu</span>
                            </button>
                        ` : ''}
                        ${notifications.length > 0 ? `
                            <button class="btn btn-ghost btn-sm text-error" id="btn-delete-all">
                                ${Icons.get('trash', { size: 16 })}
                                <span class="btn-text">Supprimer</span>
                            </button>
                        ` : ''}
                    </div>
                </div>
                
                ${notifications.length > 0 ? `
                    <p class="swipe-hint" id="swipe-hint">
                        ${Icons.get('arrow-right', { size: 14 })}
                        Glissez vers la droite pour supprimer
                    </p>
                ` : ''}
                
                <div class="notifications-list" id="notifications-list">
                    ${notifications.length > 0 
                        ? notifications.map(n => this.renderNotification(n)).join('')
                        : this.renderEmpty()
                    }
                </div>
            </div>
        `;
        
        this.attachEvents();
        if (notifications.length > 0) {
            this.initSwipeToDelete();
        }
    },
    
    renderNotification(notification) {
        const icons = {
            status_update: 'truck',
            delivery: 'check-circle',
            payment: 'credit-card',
            promo: 'tag',
            system: 'bell',
            info: 'info'
        };
        const icon = icons[notification.type] || 'bell';
        
        return `
            <div class="notification-wrapper" data-id="${notification.id}">
                <div class="notification-delete-bg">
                    ${Icons.get('trash', { size: 20 })}
                    <span>Supprimer</span>
                </div>
                <div class="notification-item ${notification.is_read ? '' : 'unread'}" 
                     data-id="${notification.id}" data-package="${notification.package_id || ''}">
                    <div class="notification-icon">
                        <svg class="icon" viewBox="0 0 24 24">
                            <use href="assets/icons/icons.svg#${icon}"></use>
                        </svg>
                    </div>
                    <div class="notification-content">
                        <h4 class="notification-title">${notification.title}</h4>
                        <p class="notification-message">${notification.message}</p>
                        <span class="notification-time">${this.formatTime(notification.created_at)}</span>
                    </div>
                    ${!notification.is_read ? '<div class="notification-dot"></div>' : ''}
                </div>
            </div>
        `;
    },
    
    renderEmpty() {
        return `
            <div class="empty-state">
                <svg class="empty-state-icon" viewBox="0 0 24 24">
                    <use href="assets/icons/icons.svg#bell"></use>
                </svg>
                <h3 class="empty-state-title">Aucune notification</h3>
                <p class="empty-state-text">Vous n'avez pas de notification pour le moment</p>
            </div>
        `;
    },
    
    formatTime(dateString) {
        const normalized = (typeof dateString === 'string' && !/[zZ]|[+-]\d\d:?\d\d$/.test(dateString))
            ? `${dateString}Z`
            : dateString;
        const date = new Date(normalized);
        const now = new Date();
        if (Number.isNaN(date.getTime())) return '-';
        const diff = Math.max(0, now.getTime() - date.getTime());
        
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);
        
        if (minutes < 1) return 'A l\'instant';
        if (minutes < 60) return `Il y a ${minutes} min`;
        if (hours < 24) return `Il y a ${hours}h`;
        if (days < 7) return `Il y a ${days}j`;
        return date.toLocaleDateString('fr-FR');
    },
    
    /**
     * Initialise le swipe-to-delete sur les notifications
     */
    initSwipeToDelete() {
        const wrappers = document.querySelectorAll('.notification-wrapper');
        
        wrappers.forEach(wrapper => {
            const item = wrapper.querySelector('.notification-item');
            const deleteBg = wrapper.querySelector('.notification-delete-bg');
            let startX = 0;
            let currentX = 0;
            let isDragging = false;
            
            // Touch events
            item.addEventListener('touchstart', (e) => {
                startX = e.touches[0].clientX;
                currentX = startX;
                isDragging = true;
                item.style.transition = 'none';
            }, { passive: true });
            
            item.addEventListener('touchmove', (e) => {
                if (!isDragging) return;
                currentX = e.touches[0].clientX;
                const diff = currentX - startX;
                
                // Seulement vers la droite
                if (diff > 0) {
                    const translateX = Math.min(diff, 120);
                    item.style.transform = `translateX(${translateX}px)`;
                    deleteBg.style.opacity = Math.min(diff / 80, 1);
                }
            }, { passive: true });
            
            item.addEventListener('touchend', async () => {
                if (!isDragging) return;
                isDragging = false;
                
                const diff = currentX - startX;
                item.style.transition = 'transform 0.2s ease';
                
                if (diff > 80) {
                    // Supprimer
                    item.style.transform = 'translateX(100%)';
                    await this.deleteNotification(wrapper.dataset.id, wrapper);
                } else {
                    // Revenir
                    item.style.transform = 'translateX(0)';
                    deleteBg.style.opacity = 0;
                }
                
                startX = 0;
                currentX = 0;
            });
        });
        
        // Masquer le hint après 5 secondes
        setTimeout(() => {
            const hint = document.getElementById('swipe-hint');
            if (hint) {
                hint.style.opacity = '0';
                setTimeout(() => hint.remove(), 300);
            }
        }, 5000);
    },
    
    /**
     * Supprime une notification
     */
    async deleteNotification(id, wrapper) {
        try {
            await API.notifications.delete(id);
            
            // Invalider le cache
            CacheService.remove(this.CACHE_KEY);
            
            // Animation de suppression
            wrapper.style.height = wrapper.offsetHeight + 'px';
            wrapper.style.overflow = 'hidden';
            wrapper.style.transition = 'height 0.2s ease, opacity 0.2s ease, margin 0.2s ease';
            
            requestAnimationFrame(() => {
                wrapper.style.height = '0';
                wrapper.style.opacity = '0';
                wrapper.style.marginBottom = '0';
            });
            
            setTimeout(() => {
                wrapper.remove();
                App.loadNotifications();
                
                // Vérifier s'il reste des notifications
                const remaining = document.querySelectorAll('.notification-wrapper');
                if (remaining.length === 0) {
                    document.getElementById('notifications-list').innerHTML = this.renderEmpty();
                    document.querySelector('.page-actions')?.remove();
                    document.getElementById('swipe-hint')?.remove();
                }
            }, 200);
            
        } catch (error) {
            Toast.error('Erreur lors de la suppression');
            const item = wrapper.querySelector('.notification-item');
            item.style.transform = 'translateX(0)';
            wrapper.querySelector('.notification-delete-bg').style.opacity = 0;
        }
    },
    
    attachEvents() {
        // Click on notification (avec délai pour éviter conflit avec swipe)
        document.querySelectorAll('.notification-item').forEach(item => {
            let touchMoved = false;
            
            item.addEventListener('touchstart', () => { touchMoved = false; });
            item.addEventListener('touchmove', () => { touchMoved = true; });
            
            item.addEventListener('click', async (e) => {
                // Ignorer si on a swipé
                if (touchMoved) return;
                if (item.style.transform && !item.style.transform.includes('0')) return;
                
                const id = item.dataset.id;
                const packageId = item.dataset.package;
                
                // Mark as read
                if (item.classList.contains('unread')) {
                    try {
                        await API.notifications.markAsRead(id);
                        item.classList.remove('unread');
                        item.querySelector('.notification-dot')?.remove();
                        App.loadNotifications();
                    } catch (e) {
                        console.warn('Failed to mark as read:', e);
                    }
                }
                
                // Navigate to package if linked
                if (packageId) {
                    Router.navigate(`/packages/${packageId}`);
                }
            });
        });
        
        // Mark all as read
        document.getElementById('btn-mark-all-read')?.addEventListener('click', async () => {
            try {
                await API.notifications.markAllAsRead();
                
                // Invalider le cache
                CacheService.remove(this.CACHE_KEY);
                
                document.querySelectorAll('.notification-item.unread').forEach(item => {
                    item.classList.remove('unread');
                    item.querySelector('.notification-dot')?.remove();
                });
                document.getElementById('btn-mark-all-read')?.remove();
                App.loadNotifications();
                Toast.success('Toutes les notifications marquees comme lues');
            } catch (error) {
                Toast.error(error.message);
            }
        });
        
        // Delete all
        document.getElementById('btn-delete-all')?.addEventListener('click', async () => {
            const confirmed = await Modal.confirm({
                title: 'Supprimer toutes les notifications',
                message: 'Voulez-vous vraiment supprimer toutes vos notifications ?',
                confirmText: 'Supprimer tout',
                danger: true
            });
            
            if (confirmed) {
                try {
                    await API.notifications.deleteAll();
                    
                    // Invalider le cache
                    CacheService.remove(this.CACHE_KEY);
                    
                    document.getElementById('notifications-list').innerHTML = this.renderEmpty();
                    document.querySelector('.page-actions')?.remove();
                    document.getElementById('swipe-hint')?.remove();
                    App.loadNotifications();
                    Toast.success('Toutes les notifications supprimees');
                } catch (error) {
                    Toast.error(error.message);
                }
            }
        });
    }
};
