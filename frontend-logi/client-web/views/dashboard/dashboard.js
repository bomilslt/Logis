/**
 * Vue Dashboard - Accueil client
 * Utilise le cache pour affichage instantané
 */

Views.dashboard = {
    async render() {
        const main = document.getElementById('main-content');
        if (!main) {
            console.error('[Dashboard] main-content not found');
            return;
        }
        
        console.log('[Dashboard] Starting render...');
        const user = Store.getUser();
        console.log('[Dashboard] User from store:', user);
        
        if (!user) {
            console.error('[Dashboard] No user found, redirecting to login');
            Router.navigate('/login');
            return;
        }
        
        // Clés de cache
        const CACHE_KEYS = {
            stats: 'dashboard_stats',
            packages: 'dashboard_packages',
            announcements: 'dashboard_announcements'
        };
        
        // Vérifier si CacheService est disponible
        const cacheAvailable = typeof CacheService !== 'undefined' && CacheService.isReady();
        
        // Récupérer les données en cache (seulement si cache disponible)
        const cachedStats = cacheAvailable ? CacheService.get(CACHE_KEYS.stats) : null;
        const cachedPackages = cacheAvailable ? CacheService.get(CACHE_KEYS.packages) : null;
        const cachedAnnouncements = cacheAvailable ? CacheService.get(CACHE_KEYS.announcements) : null;
        
        // Si on a du cache valide, afficher immédiatement
        if (cachedStats && cachedPackages && Array.isArray(cachedPackages)) {
            try {
                this.renderContent(main, user, cachedStats, cachedPackages, cachedAnnouncements || []);
                this.attachEvents();
                
                // Revalider en arrière-plan
                this.revalidateData(main, user, CACHE_KEYS);
            } catch (error) {
                console.error('[Dashboard] Cache render error:', error);
                await this.loadFresh(main, user, CACHE_KEYS);
            }
        } else {
            await this.loadFresh(main, user, CACHE_KEYS);
        }
    },
    
    /**
     * Charge les données fraîches depuis l'API
     */
    async loadFresh(main, user, CACHE_KEYS) {
        main.innerHTML = Loader.page('Chargement du tableau de bord...');
        
        try {
            const [statsData, packagesData, announcementsData] = await Promise.all([
                API.packages.getStats(),
                API.packages.getAll({ per_page: 5 }),
                API.config.getAnnouncements().catch(() => ({ announcements: [] }))
            ]);
            
            const stats = statsData.stats;
            const recentPackages = packagesData.packages;
            const announcements = announcementsData.announcements || [];
            
            // Mettre en cache
            CacheService.set(CACHE_KEYS.stats, stats);
            CacheService.set(CACHE_KEYS.packages, recentPackages);
            CacheService.set(CACHE_KEYS.announcements, announcements);
            
            this.renderContent(main, user, stats, recentPackages, announcements);
            this.attachEvents();
            
        } catch (error) {
            console.error('Dashboard load error:', error);
            main.innerHTML = `
                <div class="error-state">
                    <svg class="error-state-icon" viewBox="0 0 24 24">
                        <use href="assets/icons/icons.svg#alert-circle"></use>
                    </svg>
                    <h3 class="error-state-title">Erreur de chargement</h3>
                    <p class="error-state-text">${error.message}</p>
                    <button class="btn btn-primary" onclick="Views.dashboard.render()">Reessayer</button>
                </div>
            `;
        }
    },
    
    /**
     * Revalide les données en arrière-plan et met à jour discrètement
     */
    async revalidateData(main, user, CACHE_KEYS) {
        try {
            const [statsData, packagesData, announcementsData] = await Promise.all([
                API.packages.getStats(),
                API.packages.getAll({ per_page: 5 }),
                API.config.getAnnouncements().catch(() => ({ announcements: [] }))
            ]);
            
            const stats = statsData.stats;
            const recentPackages = packagesData.packages;
            const announcements = announcementsData.announcements || [];
            
            // Vérifier si les données ont changé
            const oldStats = CacheService.get(CACHE_KEYS.stats);
            const oldPackages = CacheService.get(CACHE_KEYS.packages);
            
            const statsChanged = JSON.stringify(stats) !== JSON.stringify(oldStats);
            const packagesChanged = JSON.stringify(recentPackages) !== JSON.stringify(oldPackages);
            
            // Mettre à jour le cache
            CacheService.set(CACHE_KEYS.stats, stats);
            CacheService.set(CACHE_KEYS.packages, recentPackages);
            CacheService.set(CACHE_KEYS.announcements, announcements);
            
            // Mise à jour discrète des stats (sans re-render complet)
            if (statsChanged) {
                this.updateStats(stats);
            }
            
            // Si les colis ont changé, re-render la liste
            if (packagesChanged) {
                this.updatePackagesList(recentPackages);
            }
            
        } catch (error) {
            console.warn('[Dashboard] Background refresh failed:', error.message);
        }
    },
    
    /**
     * Met à jour les stats discrètement (sans flash)
     */
    updateStats(stats) {
        const statCards = document.querySelectorAll('.stat-card');
        const values = [stats.total, stats.pending, stats.received || 0, stats.in_transit, stats.delivered];
        
        statCards.forEach((card, index) => {
            const valueEl = card.querySelector('.stat-card-value');
            if (valueEl && values[index] !== undefined) {
                const oldValue = parseInt(valueEl.textContent);
                const newValue = values[index];
                
                if (oldValue !== newValue) {
                    valueEl.textContent = newValue;
                    // Petite animation subtile
                    valueEl.style.transition = 'transform 0.2s ease';
                    valueEl.style.transform = 'scale(1.1)';
                    setTimeout(() => {
                        valueEl.style.transform = 'scale(1)';
                    }, 200);
                }
            }
        });
    },
    
    /**
     * Met à jour la liste des colis
     */
    updatePackagesList(packages) {
        const list = document.querySelector('.packages-list');
        if (!list) return;
        
        list.innerHTML = packages.length > 0 
            ? packages.map(p => this.renderPackageCard(p)).join('')
            : this.renderEmptyState();
        
        // Réattacher les events
        document.querySelectorAll('.package-card').forEach(card => {
            card.addEventListener('click', () => {
                Router.navigate(`/packages/${card.dataset.id}`);
            });
        });
    },
    
    renderContent(main, user, stats, recentPackages, announcements) {
        main.innerHTML = `
            <div class="dashboard">
                <div class="dashboard-header">
                    <h1 class="dashboard-title">Bonjour, ${user?.first_name || 'Client'}</h1>
                    <p class="dashboard-subtitle">Voici un apercu de vos expeditions</p>
                </div>
                
                ${announcements.length > 0 ? this.renderAnnouncements(announcements) : ''}
                
                <div class="stats-grid">
                    ${this.renderStatCard('Total', stats.total, 'package', 'primary')}
                    ${this.renderStatCard('En attente', stats.pending, 'clock', 'warning')}
                    ${this.renderStatCard('Recus', stats.received || 0, 'inbox', 'gray')}
                    ${this.renderStatCard('En transit', stats.in_transit, 'truck', 'info')}
                    ${this.renderStatCard('Livres', stats.delivered, 'check-circle', 'success')}
                </div>
                
                <p class="stats-period">Statistiques des 3 derniers mois</p>
                
                <div class="dashboard-section">
                    <div class="section-header">
                        <h2 class="section-title">Derniers colis</h2>
                        <a href="#/history" class="btn btn-ghost btn-sm">
                            Voir l'historique
                            <svg class="icon-sm" viewBox="0 0 24 24">
                                <use href="assets/icons/icons.svg#chevron-right"></use>
                            </svg>
                        </a>
                    </div>
                    
                    <div class="packages-list">
                        ${recentPackages.length > 0 
                            ? recentPackages.map(p => this.renderPackageCard(p)).join('')
                            : this.renderEmptyState()
                        }
                    </div>
                </div>
            </div>
        `;
    },
    
    /**
     * Affiche les annonces actives (filtre celles déjà fermées)
     */
    renderAnnouncements(announcements) {
        // Filtrer les annonces déjà fermées par l'utilisateur
        const dismissed = JSON.parse(localStorage.getItem('dismissed_announcements') || '[]');
        const visibleAnnouncements = announcements.filter(a => !dismissed.includes(a.id));
        
        if (visibleAnnouncements.length === 0) return '';
        
        const typeIcons = {
            info: 'info',
            warning: 'alert-triangle',
            promo: 'tag',
            urgent: 'alert-circle'
        };
        
        return `
            <div class="announcements-section">
                ${visibleAnnouncements.map(a => `
                    <div class="announcement-banner announcement-${a.type || 'info'}">
                        <div class="announcement-icon">
                            <svg class="icon" viewBox="0 0 24 24">
                                <use href="assets/icons/icons.svg#${typeIcons[a.type] || 'info'}"></use>
                            </svg>
                        </div>
                        <div class="announcement-content">
                            <h4 class="announcement-title">${a.title}</h4>
                            <p class="announcement-text">${a.content}</p>
                        </div>
                        <button class="announcement-close" data-id="${a.id}" aria-label="Fermer">
                            <svg class="icon-sm" viewBox="0 0 24 24">
                                <use href="assets/icons/icons.svg#x"></use>
                            </svg>
                        </button>
                    </div>
                `).join('')}
            </div>
        `;
    },
    
    generateMockPackages(count) {
        const statuses = ['pending', 'received', 'in_transit', 'arrived', 'delivered'];
        const cities = ['Douala', 'Yaounde', 'Libreville', 'Brazzaville', 'Kinshasa'];
        const descriptions = [
            'Electronique - Smartphones et accessoires',
            'Vetements et chaussures',
            'Pieces automobiles',
            'Materiel informatique',
            'Cosmetiques et soins',
            'Equipements menagers'
        ];
        
        const packages = [];
        const now = new Date();
        
        for (let i = 0; i < count; i++) {
            const createdDate = new Date(now);
            createdDate.setDate(createdDate.getDate() - Math.floor(Math.random() * 120));
            
            packages.push({
                id: `pkg-${String(i + 1).padStart(3, '0')}`,
                supplier_tracking: `TB${2024}${String(Math.floor(Math.random() * 100000)).padStart(8, '0')}`,
                description: descriptions[Math.floor(Math.random() * descriptions.length)],
                status: statuses[Math.floor(Math.random() * statuses.length)],
                quantity: Math.floor(Math.random() * 5) + 1,
                destination: { city: cities[Math.floor(Math.random() * cities.length)], country: 'Cameroon' },
                created_at: createdDate.toISOString()
            });
        }
        
        return packages.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    },
    
    renderStatCard(label, value, icon, color) {
        const bgColors = {
            primary: 'var(--color-primary-bg)',
            success: 'var(--color-success-bg)',
            info: 'var(--color-info-bg)',
            warning: 'var(--color-warning-bg)',
            gray: 'var(--color-gray-100)'
        };
        const iconColors = {
            primary: 'var(--color-primary)',
            success: 'var(--color-success)',
            info: 'var(--color-info)',
            warning: 'var(--color-warning)',
            gray: 'var(--color-gray-500)'
        };
        
        return `
            <div class="stat-card">
                <div class="stat-card-icon" style="background: ${bgColors[color]}; color: ${iconColors[color]}">
                    <svg viewBox="0 0 24 24"><use href="assets/icons/icons.svg#${icon}"></use></svg>
                </div>
                <div class="stat-card-value">${value}</div>
                <div class="stat-card-label">${label}</div>
            </div>
        `;
    },
    
    renderPackageCard(pkg) {
        const status = CONFIG.PACKAGE_STATUSES[pkg.status] || { label: pkg.status, color: 'gray' };
        // Support des deux formats: ancien (supplier_tracking) et nouveau (tracking_number)
        const tracking = pkg.supplier_tracking || pkg.tracking_number;
        const destination = pkg.destination?.city || pkg.destination?.country || 'N/A';
        
        return `
            <div class="package-card" data-id="${pkg.id}">
                <div class="package-card-header">
                    <span class="package-tracking">${tracking}</span>
                    <span class="status-badge status-${pkg.status}">${status.label}</span>
                </div>
                <p class="package-description">${pkg.description}</p>
                <div class="package-meta">
                    <span class="package-meta-item">
                        <svg class="icon-sm" viewBox="0 0 24 24">
                            <use href="assets/icons/icons.svg#map-pin"></use>
                        </svg>
                        ${destination}
                    </span>
                    <span class="package-meta-item">
                        <svg class="icon-sm" viewBox="0 0 24 24">
                            <use href="assets/icons/icons.svg#calendar"></use>
                        </svg>
                        ${new Date(pkg.created_at).toLocaleDateString('fr-FR')}
                    </span>
                </div>
            </div>
        `;
    },
    
    renderEmptyState() {
        return `
            <div class="empty-state">
                <svg class="empty-state-icon" viewBox="0 0 24 24">
                    <use href="assets/icons/icons.svg#package"></use>
                </svg>
                <h3 class="empty-state-title">Aucun colis</h3>
                <p class="empty-state-text">Aucun colis pour cette periode</p>
                <a href="#/new-package" class="btn btn-primary">Creer un colis</a>
            </div>
        `;
    },
    
    attachEvents() {
        // Click sur les cartes de colis
        document.querySelectorAll('.package-card').forEach(card => {
            card.addEventListener('click', () => {
                const id = card.dataset.id;
                Router.navigate(`/packages/${id}`);
            });
        });
        
        // Fermer les annonces (stocke en localStorage pour ne pas les reafficher)
        document.querySelectorAll('.announcement-close').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                const banner = btn.closest('.announcement-banner');
                
                // Animation de fermeture
                banner.style.opacity = '0';
                banner.style.transform = 'translateY(-10px)';
                setTimeout(() => banner.remove(), 200);
                
                // Stocker l'ID pour ne pas reafficher
                const dismissed = JSON.parse(localStorage.getItem('dismissed_announcements') || '[]');
                if (!dismissed.includes(id)) {
                    dismissed.push(id);
                    localStorage.setItem('dismissed_announcements', JSON.stringify(dismissed));
                }
            });
        });
    }
};
