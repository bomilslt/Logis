/**
 * Vue Historique - Liste complete des colis avec filtres et pagination
 * Utilise le cache pour affichage instantané
 */

Views.history = {
    datatable: null,
    datePickerStart: null,
    datePickerEnd: null,
    statusSelect: null,
    allData: [],
    CACHE_KEY: 'history_packages',
    
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
                this.allData = cached;
                this.renderContent(main);
                this.revalidateData(main);
            } catch (error) {
                console.error('[History] Cache render error:', error);
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
        main.innerHTML = Loader.page('Chargement de l\'historique...');
        
        try {
            const response = await API.packages.getAll({ per_page: 500 });
            this.allData = this.transformData(response.packages || []);
            
            // Mettre en cache
            CacheService.set(this.CACHE_KEY, this.allData);
            
            this.renderContent(main);
            
        } catch (error) {
            console.error('Load history error:', error);
            main.innerHTML = `
                <div class="history-view">
                    <div class="empty-state">
                        ${Icons.get('alert-circle', { size: 48 })}
                        <p>Erreur de chargement</p>
                        <p class="text-muted text-sm">${error.message}</p>
                        <button class="btn btn-primary mt-md" onclick="Views.history.render()">Reessayer</button>
                    </div>
                </div>
            `;
        }
    },
    
    /**
     * Transforme les données de l'API
     */
    transformData(packages) {
        return packages.map(p => ({
            id: p.id,
            supplier_tracking: p.tracking_number,
            description: p.description || 'Sans description',
            status: p.status,
            quantity: p.quantity || 1,
            destination: p.destination_city || p.destination_country || '-',
            created_at: p.created_at,
            weight: p.weight || 0
        }));
    },
    
    /**
     * Revalide les données en arrière-plan
     */
    async revalidateData(main) {
        try {
            const response = await API.packages.getAll({ per_page: 500 });
            const newData = this.transformData(response.packages || []);
            
            const hasChanged = JSON.stringify(newData) !== JSON.stringify(this.allData);
            
            CacheService.set(this.CACHE_KEY, newData);
            
            if (hasChanged) {
                this.allData = newData;
                // Mettre à jour les stats discrètement
                const stats = this.calculateStats(this.allData);
                const statsEl = document.getElementById('history-stats');
                if (statsEl) {
                    statsEl.innerHTML = this.renderStats(stats);
                }
                // Mettre à jour la table
                this.datatable?.setData(this.allData);
            }
        } catch (error) {
            console.warn('[History] Background refresh failed:', error.message);
        }
    },
    
    /**
     * Affiche le contenu de l'historique
     */
    renderContent(main) {
        const stats = this.calculateStats(this.allData);
        
        main.innerHTML = `
            <div class="history-view">
                <div class="history-header">
                    <h1 class="history-title">Historique des colis</h1>
                    <p class="history-subtitle">Consultez l'ensemble de vos expeditions</p>
                </div>
                
                <div class="history-filters">
                    <div class="filter-group">
                        <label class="filter-label">Statut</label>
                        <div id="status-filter"></div>
                    </div>
                    <div class="filter-group">
                        <label class="filter-label">Date debut</label>
                        <div id="date-start-filter"></div>
                    </div>
                    <div class="filter-group">
                        <label class="filter-label">Date fin</label>
                        <div id="date-end-filter"></div>
                    </div>
                    <div class="filter-actions">
                        <button class="btn btn-secondary btn-sm" id="btn-reset-filters">
                            ${Icons.get('refresh', { size: 16 })}
                            Reinitialiser
                        </button>
                    </div>
                </div>
                
                <div class="history-stats" id="history-stats">
                    ${this.renderStats(stats)}
                </div>
                
                ${this.allData.length === 0 ? `
                    <div class="empty-state">
                        ${Icons.get('package', { size: 48 })}
                        <p>Aucun colis dans votre historique</p>
                        <p class="text-muted text-sm">Vos colis apparaitront ici une fois enregistres</p>
                    </div>
                ` : '<div id="history-table"></div>'}
            </div>
        `;
        
        if (this.allData.length > 0) {
            this.initComponents(this.allData);
        }
        this.attachEvents();
    },
    
    calculateStats(data) {
        return {
            total: data.length,
            pending: data.filter(p => p.status === 'pending').length,
            in_transit: data.filter(p => ['received', 'in_transit', 'arrived'].includes(p.status)).length,
            delivered: data.filter(p => p.status === 'delivered').length
        };
    },
    
    renderStats(stats) {
        return `
            <div class="history-stat">
                <span class="history-stat-value">${stats.total}</span>
                <span class="history-stat-label">Total</span>
            </div>
            <div class="history-stat">
                <span class="history-stat-value">${stats.pending}</span>
                <span class="history-stat-label">En attente</span>
            </div>
            <div class="history-stat">
                <span class="history-stat-value">${stats.in_transit}</span>
                <span class="history-stat-label">En transit</span>
            </div>
            <div class="history-stat">
                <span class="history-stat-value">${stats.delivered}</span>
                <span class="history-stat-label">Livres</span>
            </div>
        `;
    },
    
    initComponents(data) {
        // Status filter
        this.statusSelect = new SearchSelect({
            container: '#status-filter',
            placeholder: 'Tous les statuts',
            items: [
                { id: '', name: 'Tous les statuts' },
                { id: 'pending', name: 'En attente' },
                { id: 'received', name: 'Recu' },
                { id: 'in_transit', name: 'En transit' },
                { id: 'arrived', name: 'Arrive' },
                { id: 'delivered', name: 'Livre' }
            ],
            onSelect: () => this.applyFilters()
        });
        
        // Date pickers
        this.datePickerStart = new DatePicker({
            container: document.getElementById('date-start-filter'),
            placeholder: 'Date debut',
            onChange: () => this.applyFilters()
        });
        
        this.datePickerEnd = new DatePicker({
            container: document.getElementById('date-end-filter'),
            placeholder: 'Date fin',
            onChange: () => this.applyFilters()
        });
        
        // DataTable
        this.datatable = new DataTable({
            container: '#history-table',
            columns: [
                { 
                    key: 'supplier_tracking', 
                    label: 'Tracking',
                    render: (val) => `<span class="tracking-link">${val}</span>`
                },
                { key: 'description', label: 'Description' },
                { 
                    key: 'status', 
                    label: 'Statut',
                    render: (val) => {
                        const status = CONFIG.PACKAGE_STATUSES[val] || { label: val, color: 'gray' };
                        return `<span class="status-badge status-${val}">${status.label}</span>`;
                    }
                },
                { key: 'destination', label: 'Destination' },
                { 
                    key: 'quantity', 
                    label: 'Qte',
                    render: (val) => `${val} colis`
                },
                { 
                    key: 'weight', 
                    label: 'Poids',
                    render: (val) => `${val} kg`
                },
                { 
                    key: 'created_at', 
                    label: 'Date',
                    render: (val) => new Date(val).toLocaleDateString('fr-FR')
                }
            ],
            data: data,
            pageSize: 15,
            pageSizeOptions: [15, 30, 50, 100],
            onRowClick: (row) => Router.navigate(`/packages/${row.id}`),
            renderActions: (row) => `
                <button class="btn btn-ghost btn-sm btn-view" data-id="${row.id}" title="Voir">
                    ${Icons.get('eye', { size: 16 })}
                </button>
            `
        });
    },
    
    applyFilters() {
        let filtered = [...this.allData];
        
        // Filter by status
        const status = this.statusSelect?.getValue();
        if (status) {
            filtered = filtered.filter(p => p.status === status);
        }
        
        // Filter by date range
        const startDate = this.datePickerStart?.getValue();
        const endDate = this.datePickerEnd?.getValue();
        
        if (startDate) {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            filtered = filtered.filter(p => new Date(p.created_at) >= start);
        }
        
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            filtered = filtered.filter(p => new Date(p.created_at) <= end);
        }
        
        // Update stats
        const stats = this.calculateStats(filtered);
        const statsEl = document.getElementById('history-stats');
        if (statsEl) {
            statsEl.innerHTML = this.renderStats(stats);
        }
        
        this.datatable?.setData(filtered);
    },
    
    attachEvents() {
        // Reset filters
        document.getElementById('btn-reset-filters')?.addEventListener('click', () => {
            this.statusSelect?.clear();
            this.datePickerStart?.clear();
            this.datePickerEnd?.clear();
            this.datatable?.setData(this.allData);
            
            // Reset stats
            const stats = this.calculateStats(this.allData);
            const statsEl = document.getElementById('history-stats');
            if (statsEl) {
                statsEl.innerHTML = this.renderStats(stats);
            }
        });
        
        // View buttons in table
        document.getElementById('history-table')?.addEventListener('click', (e) => {
            const viewBtn = e.target.closest('.btn-view');
            if (viewBtn) {
                e.stopPropagation();
                Router.navigate(`/packages/${viewBtn.dataset.id}`);
            }
        });
    }
};
