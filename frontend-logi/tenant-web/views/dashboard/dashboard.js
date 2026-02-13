/**
 * Vue Dashboard - Tableau de bord avec stats temps reel
 */

Views.dashboard = {
    refreshInterval: null,
    
    render() {
        const main = document.getElementById('main-content');
        
        // Show cached data instantly if available
        const cached = ViewCache.get('dashboard:all');
        if (cached) {
            this.renderDashboard(cached);
        } else {
            main.innerHTML = Loader.page(I18n.t('loading'));
        }
        
        this.loadDashboard(!!cached);
        
        // Rafraichir toutes les 30 secondes
        this.startAutoRefresh();
    },

    async refreshDashboard(btn) {
        try {
            Loader.button(btn, true, { text: '' });
            await this.loadDashboard();
        } finally {
            Loader.button(btn, false);
        }
    },
    
    startAutoRefresh() {
        this.stopAutoRefresh();
        this.refreshInterval = setInterval(() => this.loadDashboard(true), 30000);
    },
    
    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    },
    
    async loadDashboard(silent = false) {
        // Verifier qu'on est toujours sur la vue dashboard
        if (Router.currentView !== '/dashboard') {
            this.stopAutoRefresh();
            return;
        }
        
        try {
            // Charger les stats depuis l'API
            const [statsData, recentPkgData, activityData] = await Promise.all([
                API.dashboard.getStats(),
                API.dashboard.getRecentPackages(5),
                API.dashboard.getRecentActivity(5)
            ]);
            
            const freshData = { statsData, recentPkgData, activityData };
            
            // Only re-render if data changed or first load
            if (!silent || ViewCache.hasChanged('dashboard:all', freshData)) {
                ViewCache.set('dashboard:all', freshData);
                this.renderDashboard(freshData);
            }
        } catch (error) {
            console.error('Dashboard load error:', error);
            // If we have cached data, keep showing it
            if (!ViewCache.get('dashboard:all')) {
                const main = document.getElementById('main-content');
                main.innerHTML = `
                    <div class="error-state">
                        ${Icons.get('alert-circle', {size:48})}
                        <h3>${I18n.t('error_loading')}</h3>
                        <p>${error.message}</p>
                        <button class="btn btn-primary" onclick="Views.dashboard.loadDashboard()">${I18n.t('retry')}</button>
                    </div>
                `;
            }
        }
    },

    renderDashboard(data) {
        const stats = (data.statsData?.stats || data.statsData);
        const recentPackages = (data.recentPkgData?.packages || data.recentPkgData);
        const recentActivity = (data.activityData?.activity || data.activityData);

        const growth = stats.revenue?.prev_month > 0 
            ? ((stats.revenue.month - stats.revenue.prev_month) / stats.revenue.prev_month * 100).toFixed(1)
            : 0;
        const main = document.getElementById('main-content');
        
        main.innerHTML = `
            <div class="dashboard">
                <div class="page-header">
                    <h1 class="page-title">${I18n.t('dashboard.title')}</h1>
                    <div class="header-actions">
                        <span class="text-sm text-muted" id="last-update">Mis a jour: ${new Date().toLocaleTimeString('fr-FR')}</span>
                        <button class="btn btn-ghost btn-sm" onclick="Views.dashboard.refreshDashboard(this)" title="Actualiser le tableau de bord">
                            ${Icons.get('refresh', {size:16})}
                        </button>
                    </div>
                </div>
                
                <!-- Stats principales -->
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-icon bg-primary">${Icons.get('package', {size:24})}</div>
                        <div class="stat-info">
                            <span class="stat-value">${stats.packages.total}</span>
                            <span class="stat-label">${I18n.t('dashboard.total_packages')}</span>
                            <span class="stat-sub">${stats.packages.pending} en attente · ${stats.packages.in_transit} en transit</span>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon bg-success">${Icons.get('dollar-sign', {size:24})}</div>
                        <div class="stat-info">
                            <span class="stat-value">${this.formatMoney(stats.revenue.month)}</span>
                            <span class="stat-label">${I18n.t('dashboard.revenue')}</span>
                            <span class="stat-change ${growth >= 0 ? 'positive' : 'negative'}">${growth >= 0 ? '+' : ''}${growth}% vs mois dernier</span>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon bg-warning">${Icons.get('clock', {size:24})}</div>
                        <div class="stat-info">
                            <span class="stat-value">${this.formatMoney(stats.revenue.pending)}</span>
                            <span class="stat-label">${I18n.t('payments.pending')}</span>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon bg-info">${Icons.get('users', {size:24})}</div>
                        <div class="stat-info">
                            <span class="stat-value">${stats.clients.active}</span>
                            <span class="stat-label">${I18n.t('nav.clients')}</span>
                            <span class="stat-sub text-success">+${stats.clients.new_this_month} ce mois</span>
                        </div>
                    </div>
                </div>
                
                <!-- Stats aujourd'hui -->
                <div class="today-stats card mb-md">
                    <div class="card-body">
                        <h3 class="today-title">${I18n.t('dashboard.today')}</h3>
                        <div class="today-grid">
                            <div class="today-item">
                                <span class="today-value">${stats.today.received}</span>
                                <span class="today-label">Colis recus</span>
                            </div>
                            <div class="today-item">
                                <span class="today-value">${stats.today.status_updates}</span>
                                <span class="today-label">Mises a jour</span>
                            </div>
                            <div class="today-item">
                                <span class="today-value">${stats.today.deliveries}</span>
                                <span class="today-label">Livraisons</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Grille principale -->
                <div class="dashboard-grid">
                    <!-- Colis recents -->
                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">${I18n.t('dashboard.recent_packages')}</h3>
                            <a href="#/packages" class="btn btn-sm btn-ghost">${I18n.t('all')}</a>
                        </div>
                        <div class="card-body">
                            <div class="table-wrapper table-responsive-cards">
                                <table class="table">
                                    <thead>
                                        <tr>
                                            <th>Tracking</th>
                                            <th>Client</th>
                                            <th>Montant</th>
                                            <th>Statut</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${recentPackages.map(p => `
                                            <tr class="clickable" onclick="Router.navigate('/packages/${p.id}')">
                                                <td data-label="Tracking"><strong>${p.tracking}</strong></td>
                                                <td data-label="Client">${p.client}</td>
                                                <td data-label="Montant">${this.formatMoney(p.amount)}</td>
                                                <td data-label="Statut"><span class="status-badge status-${p.status}">${CONFIG.PACKAGE_STATUSES[p.status]?.label}</span></td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Activite recente -->
                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">${I18n.t('dashboard.recent_activity')}</h3>
                        </div>
                        <div class="card-body">
                            <div class="activity-list">
                                ${recentActivity.map(a => `
                                    <div class="activity-item">
                                        <div class="activity-icon activity-${a.type}">
                                            ${this.getActivityIcon(a.type)}
                                        </div>
                                        <div class="activity-content">
                                            <div class="activity-message">${a.message}</div>
                                            <div class="activity-time">${a.time}</div>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Repartition par statut -->
                <div class="card mt-md">
                    <div class="card-header">
                        <h3 class="card-title">Repartition des colis</h3>
                    </div>
                    <div class="card-body">
                        <div class="status-bars">
                            ${Object.entries(CONFIG.PACKAGE_STATUSES).map(([key, val]) => {
                                const count = stats.packages[key] || 0;
                                const percent = stats.packages.total > 0 ? (count / stats.packages.total * 100).toFixed(1) : 0;
                                return `
                                    <div class="status-bar-item">
                                        <div class="status-bar-header">
                                            <span>${val.label}</span>
                                            <span>${count} (${percent}%)</span>
                                        </div>
                                        <div class="status-bar">
                                            <div class="status-bar-fill status-${key}" style="width: ${percent}%"></div>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    getActivityIcon(type) {
        const icons = {
            status: Icons.get('refresh', {size:14}),
            payment: Icons.get('dollar-sign', {size:14}),
            receive: Icons.get('package', {size:14}),
            delivery: Icons.get('check-circle', {size:14}),
            client: Icons.get('user', {size:14})
        };
        return icons[type] || Icons.get('info', {size:14});
    },
    
    formatMoney(amount) {
        if (amount >= 1000000) {
            return (amount / 1000000).toFixed(1) + 'M XAF';
        }
        return new Intl.NumberFormat('fr-FR').format(amount) + ' XAF';
    },
    
    // Appele quand on quitte la vue
    destroy() {
        this.stopAutoRefresh();
    }
};
