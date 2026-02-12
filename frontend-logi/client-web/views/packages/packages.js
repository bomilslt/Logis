/**
 * Vue Packages - Liste des colis
 * Utilise le cache pour affichage instantané
 */

Views.packages = {
    currentPage: 1,
    pageSize: 10,
    currentStatus: '',
    searchQuery: '',
    statusSelect: null,
    CACHE_KEY: 'packages_list',
    
    async render() {
        const main = document.getElementById('main-content');
        if (!main) return;
        
        // Vérifier si CacheService est disponible
        const cacheAvailable = typeof CacheService !== 'undefined' && CacheService.isReady();
        
        // Récupérer le cache (seulement si pas de filtres actifs et cache disponible)
        const cached = cacheAvailable && !this.currentStatus && !this.searchQuery && this.currentPage === 1 
            ? CacheService.get(this.CACHE_KEY) 
            : null;
        
        main.innerHTML = `
            <div class="packages-view">
                <div class="page-header">
                    <h1 class="page-title">Mes colis</h1>
                    <a href="#/new-package" class="btn btn-primary btn-sm">
                        <svg class="icon-sm" viewBox="0 0 24 24">
                            <use href="assets/icons/icons.svg#plus"></use>
                        </svg>
                        Nouveau
                    </a>
                </div>
                
                <div class="filters-bar">
                    <div class="search-input-wrapper">
                        <svg class="icon" viewBox="0 0 24 24">
                            <use href="assets/icons/icons.svg#search"></use>
                        </svg>
                        <input type="text" class="form-input search-input" 
                               id="search-input" placeholder="Rechercher...">
                    </div>
                    <div id="status-filter" class="filter-select-container"></div>
                </div>
                
                <div id="packages-container">
                    ${Loader.page('Chargement des colis...')}
                </div>
            </div>
        `;
        
        this.initComponents();
        this.attachEvents();
        
        // Si cache disponible et valide, afficher immédiatement puis revalider
        if (cached && cached.packages && Array.isArray(cached.packages)) {
            try {
                this.renderPackagesList(cached.packages, cached.total);
                this.revalidateData();
            } catch (error) {
                console.error('[Packages] Cache render error:', error);
                await this.loadPackages();
            }
        } else {
            await this.loadPackages();
        }
    },
    
    initComponents() {
        const statusItems = [
            { id: '', name: 'Tous les statuts' },
            ...Object.entries(CONFIG.PACKAGE_STATUSES).map(([key, val]) => ({
                id: key,
                name: val.label
            }))
        ];
        
        this.statusSelect = new SearchSelect({
            container: '#status-filter',
            placeholder: 'Tous les statuts',
            items: statusItems,
            onSelect: (item) => {
                this.currentStatus = item.id;
                this.currentPage = 1;
                this.loadPackages();
            }
        });
    },
    
    attachEvents() {
        // Search
        let searchTimeout;
        document.getElementById('search-input')?.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                this.searchQuery = e.target.value;
                this.currentPage = 1;
                this.loadPackages();
            }, 300);
        });
    },
    
    async loadPackages() {
        const container = document.getElementById('packages-container');
        if (!container.querySelector('.packages-list')) {
            container.innerHTML = Loader.page('Chargement...');
        }
        
        try {
            const data = await API.packages.getAll({
                page: this.currentPage,
                per_page: this.pageSize,
                status: this.currentStatus || undefined,
                search: this.searchQuery || undefined
            });
            
            const packages = data.packages;
            const total = data.total;
            
            // Mettre en cache si c'est la page par défaut (sans filtres)
            if (!this.currentStatus && !this.searchQuery && this.currentPage === 1) {
                CacheService.set(this.CACHE_KEY, { packages, total });
            }
            
            this.renderPackagesList(packages, total);
            
        } catch (error) {
            console.error('Load packages error:', error);
            container.innerHTML = `
                <div class="error-state">
                    <svg class="error-state-icon" viewBox="0 0 24 24">
                        <use href="assets/icons/icons.svg#alert-circle"></use>
                    </svg>
                    <h3 class="error-state-title">Erreur de chargement</h3>
                    <p class="error-state-text">${error.message}</p>
                    <button class="btn btn-primary" onclick="Views.packages.loadPackages()">Reessayer</button>
                </div>
            `;
        }
    },
    
    /**
     * Revalide les données en arrière-plan
     */
    async revalidateData() {
        try {
            const data = await API.packages.getAll({
                page: 1,
                per_page: this.pageSize
            });
            
            const cached = CacheService.get(this.CACHE_KEY);
            const hasChanged = JSON.stringify(data.packages) !== JSON.stringify(cached?.packages);
            
            CacheService.set(this.CACHE_KEY, { packages: data.packages, total: data.total });
            
            if (hasChanged && !this.currentStatus && !this.searchQuery && this.currentPage === 1) {
                this.renderPackagesList(data.packages, data.total);
            }
        } catch (error) {
            console.warn('[Packages] Background refresh failed:', error.message);
        }
    },
    
    /**
     * Affiche la liste des colis
     */
    renderPackagesList(packages, total) {
        const container = document.getElementById('packages-container');
        if (!container) return;
        
        if (packages.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <svg class="empty-state-icon" viewBox="0 0 24 24">
                        <use href="assets/icons/icons.svg#package"></use>
                    </svg>
                    <h3 class="empty-state-title">Aucun colis trouve</h3>
                    <p class="empty-state-text">
                        ${this.searchQuery || this.currentStatus 
                            ? 'Essayez de modifier vos filtres' 
                            : 'Commencez par creer votre premier colis'}
                    </p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = `
            <div class="packages-list">
                ${packages.map(p => this.renderPackageCard(p)).join('')}
            </div>
            <div id="packages-pagination"></div>
        `;
        
        // Init pagination
        if (total > this.pageSize) {
            new Pagination({
                container: '#packages-pagination',
                totalItems: total,
                pageSize: this.pageSize,
                currentPage: this.currentPage,
                onChange: (page) => {
                    this.currentPage = page;
                    this.loadPackages();
                }
            });
        }
        
        // Click events
        container.querySelectorAll('.package-card').forEach(card => {
            card.addEventListener('click', () => {
                Router.navigate(`/packages/${card.dataset.id}`);
            });
        });
    },
    
    renderPackageCard(pkg) {
        const status = CONFIG.PACKAGE_STATUSES[pkg.status] || { label: pkg.status };
        const paymentStatus = pkg.amount ? (pkg.paid_amount >= pkg.amount ? 'paid' : (pkg.paid_amount > 0 ? 'partial' : 'unpaid')) : null;
        const paymentLabels = { paid: 'Paye', partial: 'Partiel', unpaid: 'A payer' };
        
        // Support des deux formats de tracking
        const tracking = pkg.supplier_tracking || pkg.tracking_number;
        const internalTracking = pkg.tracking_number;
        
        // Support des deux formats de destination
        const warehouseName = this.getWarehouseName(
            pkg.destination?.country, 
            pkg.destination?.warehouse || pkg.destination?.warehouse_id
        );
        
        return `
            <div class="package-card" data-id="${pkg.id}">
                <div class="package-card-header">
                    <div class="package-tracking-group">
                        ${internalTracking ? `<span class="package-tracking-internal">${internalTracking}</span>` : ''}
                        <span class="package-tracking">${tracking}</span>
                    </div>
                    <span class="status-badge status-${pkg.status}">${status.label}</span>
                </div>
                <p class="package-description">${pkg.description}</p>
                <div class="package-meta">
                    <span class="package-meta-item">
                        <svg class="icon-sm" viewBox="0 0 24 24">
                            <use href="assets/icons/icons.svg#map-pin"></use>
                        </svg>
                        ${warehouseName}
                    </span>
                    ${pkg.amount ? `
                        <span class="package-meta-item package-amount ${paymentStatus}">
                            <svg class="icon-sm" viewBox="0 0 24 24">
                                <use href="assets/icons/icons.svg#dollar-sign"></use>
                            </svg>
                            ${this.formatMoney(pkg.amount)} - ${paymentLabels[paymentStatus]}
                        </span>
                    ` : ''}
                </div>
            </div>
        `;
    },
    
    // Helper: Obtenir le nom de l'entrepot depuis l'ID
    getWarehouseName(country, warehouseId) {
        if (!country || !warehouseId) return 'N/A';
        const countryData = CONFIG.DESTINATIONS[country];
        if (!countryData) return warehouseId;
        const warehouse = countryData.warehouses.find(w => w.id === warehouseId);
        return warehouse ? warehouse.name : warehouseId;
    },
    
    formatMoney(amount) {
        if (amount >= 1000000) return (amount / 1000000).toFixed(1) + 'M XAF';
        if (amount >= 1000) return Math.round(amount / 1000) + 'K XAF';
        return new Intl.NumberFormat('fr-FR').format(amount) + ' XAF';
    },
    
    formatDepartureDate(dateStr) {
        const date = new Date(dateStr);
        const today = new Date();
        const diffDays = Math.ceil((date - today) / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) return "Aujourd'hui";
        if (diffDays === 1) return "Demain";
        if (diffDays < 7) return `Dans ${diffDays} jours`;
        
        return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    },
    
    goToPage(page) {
        this.currentPage = page;
        this.loadPackages();
    }
};
