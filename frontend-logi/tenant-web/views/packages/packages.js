/**
 * Vue Packages - Liste des colis avec actions en masse
 */

Views.packages = {
    selectedIds: new Set(),
    filters: { status: '', search: '', dateFrom: '', dateTo: '', departure: '' },
    allPackages: [],
    departures: [], // Cache des départs chargés depuis l'API
    receivedCount: 0, // Compteur pour la session de scan
    currentPage: 1,
    pageSize: 10,
    pagination: null,
    
    async render() {
        const main = document.getElementById('main-content');
        
        main.innerHTML = `
            <div class="packages-page">
                <div class="page-header">
                    <h1 class="page-title">${I18n.t('packages.title')}</h1>
                    <div class="header-actions">
                        <button class="btn btn-outline" id="btn-export" title="${I18n.t('packages.export_list')}">
                            ${Icons.get('download', {size:16})} ${I18n.t('export')}
                        </button>
                        <button class="btn btn-primary" id="btn-receive" title="${I18n.t('packages.receive')}">
                            ${Icons.get('package', {size:16})} ${I18n.t('packages.receive')}
                        </button>
                    </div>
                </div>
                
                <!-- Filtres -->
                <div class="card mb-md">
                    <div class="card-body">
                        <div class="filters-grid">
                            <div class="form-group">
                                <label class="form-label">${I18n.t('search')}</label>
                                <input type="text" id="filter-search" class="form-input" 
                                    placeholder="${I18n.t('packages.search_placeholder')}" value="${this.filters.search}">
                            </div>
                            <div class="form-group">
                                <label class="form-label">${I18n.t('packages.status')}</label>
                                <div id="filter-status-container"></div>
                            </div>
                            <div class="form-group">
                                <label class="form-label">${I18n.t('packages.departure')}</label>
                                <div id="filter-departure-container"></div>
                            </div>
                            <div class="form-group">
                                <label class="form-label">${I18n.t('packages.date_from')}</label>
                                <div id="filter-from-container"></div>
                            </div>
                            <div class="form-group">
                                <label class="form-label">${I18n.t('packages.date_to')}</label>
                                <div id="filter-to-container"></div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Actions en masse -->
                <div class="bulk-actions card mb-md ${this.selectedIds.size ? '' : 'hidden'}" id="bulk-actions">
                    <div class="card-body">
                        <span class="bulk-count"><strong id="selected-count">0</strong> ${I18n.t('packages.selected')}</span>
                        <div class="bulk-buttons">
                            <button class="btn btn-sm btn-outline" id="btn-bulk-departure">
                                ${Icons.get('send', {size:14})} ${I18n.t('packages.assign_departure')}
                            </button>
                            <button class="btn btn-sm btn-outline" id="btn-bulk-status">
                                ${Icons.get('refresh', {size:14})} ${I18n.t('packages.change_status')}
                            </button>
                            <button class="btn btn-sm btn-outline" id="btn-bulk-print">
                                ${Icons.get('printer', {size:14})} ${I18n.t('packages.labels')}
                            </button>
                            <button class="btn btn-sm btn-ghost" id="btn-clear-selection">
                                ${I18n.t('cancel')}
                            </button>
                        </div>
                    </div>
                </div>
                
                <!-- Liste -->
                <div class="card">
                    <div class="card-body" id="packages-list">
                        ${Loader.page(I18n.t('loading'))}
                    </div>
                </div>
            </div>
        `;
        
        // Show cached data instantly
        const cacheKey = 'packages:list:' + this.currentPage + ':' + this.filters.status;
        const cached = ViewCache.get(cacheKey);
        if (cached) {
            this._renderPackagesData(cached);
        }
        
        this.loadPackages(!!cached);
        await this.initFilters();
        this.attachEvents();
    },
    
    async initFilters() {
        // Status SearchSelect
        const statusItems = [{ id: '', name: I18n.t('all') }, ...Object.entries(CONFIG.PACKAGE_STATUSES).map(([k, v]) => ({ id: k, name: v.label }))];
        this.statusSelect = new SearchSelect({
            container: '#filter-status-container',
            placeholder: I18n.t('packages.all_statuses'),
            items: statusItems,
            onSelect: (item) => { this.filters.status = item?.id || ''; this.currentPage = 1; this.loadPackages(); }
        });
        if (this.filters.status) this.statusSelect.setValue(this.filters.status);
        
        // Departure filter SearchSelect - charger depuis l'API
        try {
            const data = await API.departures.getAll();
            this.departures = data.departures || [];
        } catch (e) {
            console.warn('Failed to load departures for filter:', e);
            this.departures = [];
        }
        
        // Filtrer pour le select (seulement scheduled et departed)
        const filterableDepartures = this.departures.filter(d => d.status === 'scheduled' || d.status === 'departed');
        
        const departureItems = [
            { id: '', name: I18n.t('packages.all_departures') },
            { id: 'none', name: I18n.t('packages.not_assigned') },
            ...filterableDepartures.map(d => {
                const dateStr = new Date(d.departure_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
                const destLabel = CONFIG.DESTINATIONS[d.dest_country]?.label || d.dest_country;
                return { id: d.id, name: `${dateStr} - ${destLabel}` };
            })
        ];
        this.departureSelect = new SearchSelect({
            container: '#filter-departure-container',
            placeholder: I18n.t('packages.all_departures'),
            items: departureItems,
            onSelect: (item) => { this.filters.departure = item?.id || ''; this.currentPage = 1; this.loadPackages(); }
        });
        if (this.filters.departure) this.departureSelect.setValue(this.filters.departure);
        
        // Date pickers
        this.dateFromPicker = new DatePicker({
            container: document.getElementById('filter-from-container'),
            placeholder: I18n.t('packages.date_start'),
            value: this.filters.dateFrom,
            onChange: (date, value) => { this.filters.dateFrom = value || ''; this.currentPage = 1; this.loadPackages(); }
        });
        
        this.dateToPicker = new DatePicker({
            container: document.getElementById('filter-to-container'),
            placeholder: I18n.t('packages.date_end'),
            value: this.filters.dateTo,
            onChange: (date, value) => { this.filters.dateTo = value || ''; this.currentPage = 1; this.loadPackages(); }
        });
    },
    
    async loadPackages(silent = false) {
        const container = document.getElementById('packages-list');
        if (!silent) container.innerHTML = Loader.page(I18n.t('loading'));
        
        const cacheKey = 'packages:list:' + this.currentPage + ':' + this.filters.status;
        
        try {
            const data = await API.packages.getAll({
                page: this.currentPage,
                per_page: this.pageSize,
                status: this.filters.status || undefined,
                search: this.filters.search || undefined,
                date_from: this.filters.dateFrom || undefined,
                date_to: this.filters.dateTo || undefined,
                departure_id: this.filters.departure || undefined
            });
            
            if (!silent || ViewCache.hasChanged(cacheKey, data)) {
                ViewCache.set(cacheKey, data);
                this._renderPackagesData(data);
            }
            
        } catch (error) {
            console.error('Load packages error:', error);
            if (!ViewCache.get(cacheKey)) {
                container.innerHTML = `
                    <div class="error-state">
                        ${Icons.get('alert-circle', {size:48})}
                        <h3>${I18n.t('error_loading')}</h3>
                        <p>${error.message}</p>
                        <button class="btn btn-primary" onclick="Views.packages.loadPackages()">${I18n.t('retry')}</button>
                    </div>
                `;
            }
        }
    },
    
    _renderPackagesData(data) {
        const container = document.getElementById('packages-list');
        const packages = data.packages || [];
        this.allPackages = packages;
        
        if (packages.length === 0) {
            container.innerHTML = `<div class="empty-state">${Icons.get('package', {size:48})}<p class="empty-state-title">${I18n.t('packages.no_packages')}</p></div>`;
            return;
        }
        
        container.innerHTML = `
            <div class="table-wrapper">
                <table class="table">
                    <thead><tr>
                        <th><input type="checkbox" id="select-all"></th>
                        <th>${I18n.t('packages.tracking')}</th><th>${I18n.t('packages.client')}</th><th>${I18n.t('packages.description')}</th><th>${I18n.t('packages.transport_mode')}</th>
                        <th>${I18n.t('packages.departure')}</th><th>${I18n.t('packages.amount')}</th><th>${I18n.t('packages.payment')}</th><th>${I18n.t('packages.status')}</th><th>${I18n.t('packages.date')}</th><th>${I18n.t('actions')}</th>
                    </tr></thead>
                    <tbody>${packages.map(p => this.renderRow(p)).join('')}</tbody>
                </table>
            </div>
            <div class="table-footer">
                <div id="packages-pagination"></div>
            </div>
        `;
        
        this.pagination = new Pagination({
            container: '#packages-pagination',
            totalItems: data.total || packages.length,
            pageSize: this.pageSize,
            currentPage: this.currentPage,
            onChange: (page) => {
                this.currentPage = page;
                this.loadPackages();
            }
        });
        
        this.attachTableEvents();
    },

    renderRow(p) {
        // Adapter les noms de champs de l'API backend
        // API retourne: tracking_number, transport_mode, paid_amount, client.name, client.phone
        const tracking = p.tracking_number || p.tracking;
        const supplierTracking = p.supplier_tracking || '';
        const clientName = p.client?.name || p.client_name || '-';
        const clientPhone = p.client?.phone || p.client_phone || '';
        const transport = p.transport_mode || p.transport;
        const amount = p.amount || 0;
        const paidAmount = p.paid_amount || p.paid || 0;
        const createdAt = p.created_at ? new Date(p.created_at).toLocaleDateString(I18n.locale === 'fr' ? 'fr-FR' : 'en-US') : '-';
        
        const paymentStatus = amount === 0 ? 'no_charge' : (paidAmount >= amount ? 'paid' : (paidAmount > 0 ? 'partial' : 'unpaid'));
        const paymentLabels = { paid: I18n.t('packages.paid'), partial: I18n.t('packages.partial'), unpaid: I18n.t('packages.unpaid'), no_charge: '-' };
        const paymentClasses = { paid: 'status-delivered', partial: 'status-arrived_port', unpaid: 'status-pending', no_charge: '' };
        
        // Obtenir le depart assigne directement depuis le colis
        const departureCell = p.departure_id ? this.renderDepartureCellById(p.departure_id) : '<span class="text-muted">-</span>';
        
        return `
            <tr data-id="${p.id}">
                <td><input type="checkbox" class="pkg-checkbox" value="${p.id}" ${this.selectedIds.has(p.id) ? 'checked' : ''}></td>
                <td><strong>${tracking}</strong><div class="text-sm text-muted">${supplierTracking}</div></td>
                <td><div>${clientName}</div><div class="text-sm text-muted">${clientPhone}</div></td>
                <td>${p.description || '-'}</td>
                <td><span class="transport-badge transport-${transport}">${this.getTransportLabel(transport)}</span></td>
                <td>${departureCell}</td>
                <td class="font-medium">${this.formatMoney(amount)}</td>
                <td>
                    <span class="status-badge ${paymentClasses[paymentStatus]}">${paymentLabels[paymentStatus]}</span>
                    ${paymentStatus === 'partial' ? `<div class="text-xs text-muted" style="margin-top:2px;">${this.formatMoney(paidAmount)} / ${this.formatMoney(amount)}</div>` : ''}
                    ${paymentStatus === 'unpaid' && amount > 0 ? `<div class="text-xs text-error" style="margin-top:2px;">${I18n.t('packages.due')}: ${this.formatMoney(amount)}</div>` : ''}
                </td>
                <td><span class="status-badge status-${p.status}">${CONFIG.PACKAGE_STATUSES[p.status]?.label || p.status}</span></td>
                <td>${createdAt}</td>
                <td>
                    <div class="table-actions">
                        <button class="btn btn-sm btn-ghost" onclick="Views.packages.quickStatus('${p.id}', '${p.status}')" title="${I18n.t('packages.change_status_title')}">${Icons.get('refresh', {size:14})}</button>
                        <button class="btn btn-sm btn-ghost" onclick="Views.packages.printLabel('${p.id}')" title="${I18n.t('packages.print_label_title')}">${Icons.get('printer', {size:14})}</button>
                        <button class="btn btn-sm btn-ghost" onclick="Router.navigate('/packages/${p.id}')" title="${I18n.t('packages.view_details')}">${Icons.get('eye', {size:14})}</button>
                    </div>
                </td>
            </tr>
        `;
    },
    
    renderDepartureCellById(departureId) {
        // Utiliser les départs chargés depuis l'API (pas le localStorage)
        const dep = this.departures.find(d => d.id === departureId);
        if (!dep) return '<span class="text-muted">-</span>';
        
        const dateStr = new Date(dep.departure_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
        const statusClass = dep.status === 'departed' ? 'in-transit' : dep.status === 'arrived' ? 'arrived' : '';
        const statusIcon = dep.status === 'departed' ? Icons.get('send', {size:12}) : 
                          dep.status === 'arrived' ? Icons.get('check', {size:12}) : 
                          Icons.get('calendar', {size:12});
        
        return `
            <div class="departure-cell ${statusClass}" title="Cliquez pour voir le depart" onclick="Router.navigate('/departures')">
                <span class="departure-cell-icon">${statusIcon}</span>
                <span class="departure-cell-date">${dateStr}</span>
            </div>
        `;
    },
    
    attachTableEvents() {
        document.getElementById('select-all')?.addEventListener('change', (e) => {
            document.querySelectorAll('.pkg-checkbox').forEach(cb => {
                cb.checked = e.target.checked;
                if (e.target.checked) this.selectedIds.add(cb.value);
                else this.selectedIds.delete(cb.value);
            });
            this.updateBulkActions();
        });
        document.querySelectorAll('.pkg-checkbox').forEach(cb => {
            cb.addEventListener('change', () => {
                if (cb.checked) this.selectedIds.add(cb.value);
                else this.selectedIds.delete(cb.value);
                this.updateBulkActions();
            });
        });
    },
    
    attachEvents() {
        let searchTimeout;
        document.getElementById('filter-search')?.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => { this.filters.search = e.target.value; this.currentPage = 1; this.loadPackages(); }, 300);
        });
        
        document.getElementById('btn-receive')?.addEventListener('click', () => this.openScannerMode());
        document.getElementById('btn-export')?.addEventListener('click', () => this.showExportMenu());
        document.getElementById('btn-bulk-departure')?.addEventListener('click', () => this.bulkAssignDeparture());
        document.getElementById('btn-bulk-status')?.addEventListener('click', () => this.bulkStatusChange());
        document.getElementById('btn-bulk-print')?.addEventListener('click', () => this.bulkPrintLabels());
        document.getElementById('btn-clear-selection')?.addEventListener('click', () => {
            this.selectedIds.clear(); this.loadPackages(); this.updateBulkActions();
        });
    },
    
    updateBulkActions() {
        const bulkDiv = document.getElementById('bulk-actions');
        const countSpan = document.getElementById('selected-count');
        if (this.selectedIds.size > 0) { bulkDiv?.classList.remove('hidden'); if (countSpan) countSpan.textContent = this.selectedIds.size; }
        else { bulkDiv?.classList.add('hidden'); }
    },
    
    showExportMenu() {
        Modal.open({
            title: I18n.t('packages.export_list'),
            content: `
                <div class="export-menu">
                    <p class="text-muted">${I18n.t('packages.export_choose')}</p>
                    <div class="export-options">
                        <button class="btn btn-outline btn-block" id="export-excel">
                            ${Icons.get('file-spreadsheet', {size:16})} Excel
                        </button>
                        <button class="btn btn-outline btn-block" id="export-pdf">
                            ${Icons.get('file-pdf', {size:16})} PDF
                        </button>
                    </div>
                </div>
            `
        });
        
        document.getElementById('export-excel')?.addEventListener('click', () => {
            Modal.close();
            this.exportExcel();
        });
        
        document.getElementById('export-pdf')?.addEventListener('click', () => {
            Modal.close();
            this.exportPDF();
        });
    },
    
    async exportExcel() {
        try {
            const data = await this.getExportData();
            try {
                ExportService.exportToExcel(data, 'Colis_' + new Date().toISOString().split('T')[0]);
                Toast.show(I18n.t('packages.export_started') + ' Excel', 'success');
            } catch (frontendError) {
                console.warn('Frontend export failed, falling back to backend:', frontendError);
                await this.fallbackToBackendExport('excel');
            }
        } catch (error) {
            console.error('Export Excel error:', error);
            Toast.show('Erreur lors de l\'export Excel', 'error');
        }
    },
    
    async exportPDF() {
        try {
            const data = await this.getExportData();
            try {
                ExportService.exportToPDF(data, 'Colis_' + new Date().toISOString().split('T')[0]);
                Toast.show(I18n.t('packages.export_started') + ' PDF', 'success');
            } catch (frontendError) {
                console.warn('Frontend export failed, falling back to backend:', frontendError);
                await this.fallbackToBackendExport('pdf');
            }
        } catch (error) {
            console.error('Export PDF error:', error);
            Toast.show('Erreur lors de l\'export PDF', 'error');
        }
    },
    
    async fallbackToBackendExport(format) {
        try {
            const response = await API.exports.exportPackages({
                format: format,
                status: this.filters.status || undefined,
                search: this.filters.search || undefined,
                date_from: this.filters.dateFrom || undefined,
                date_to: this.filters.dateTo || undefined,
                departure_id: this.filters.departure || undefined
            });
            
            if (response.url) {
                window.open(response.url, '_blank');
                Toast.show(`Export ${format.toUpperCase()} via backend démarré`, 'success');
            } else {
                Toast.show('Erreur lors de l\'export via backend', 'error');
            }
        } catch (error) {
            console.error('Backend export error:', error);
            Toast.show('Erreur lors de l\'export via backend', 'error');
        }
    },
    
    async getExportData() {
        // Fetch all packages data for export
        const response = await API.packages.getAll({
            page: 1,
            per_page: 10000, // Large number to get all packages
            status: this.filters.status || undefined,
            search: this.filters.search || undefined,
            date_from: this.filters.dateFrom || undefined,
            date_to: this.filters.dateTo || undefined,
            departure_id: this.filters.departure || undefined
        });
        
        return response.packages || [];
    },

    // ============================================
    // MODE SCANNER - Reception rapide par scan
    // ============================================
    openScannerMode() {
        this.receivedCount = 0;
        
        Modal.open({
            title: I18n.t('packages.scanner_title'),
            closable: false,
            content: `
                <div class="scanner-mode">
                    <div class="scanner-header">
                        <div class="scanner-icon">${Icons.get('package', {size:48})}</div>
                        <p class="text-muted">${I18n.t('packages.scanner_scan_text')}</p>
                    </div>
                    
                    <div class="scanner-input-wrapper">
                        <input type="text" id="scan-input" class="form-input scan-input" 
                            placeholder="${I18n.t('packages.scanner_placeholder')}" autofocus autocomplete="off">
                        <button class="btn btn-primary scan-btn" id="btn-scan-search">
                            ${Icons.get('search', {size:18})}
                        </button>
                    </div>
                    
                    <div class="scanner-status" id="scanner-status"></div>
                    
                    <div class="scanner-stats">
                        <div class="scanner-stat">
                            <span class="scanner-stat-value" id="scan-count">0</span>
                            <span class="scanner-stat-label">${I18n.t('packages.scanner_received')}</span>
                        </div>
                    </div>
                    
                    <!-- Zone formulaire manuel (cachee par defaut) -->
                    <div class="manual-form hidden" id="manual-form">
                        <div class="manual-form-header">
                            <span class="text-error">${Icons.get('alert-circle', {size:16})} ${I18n.t('packages.scanner_not_found')}</span>
                            <p class="text-sm text-muted">${I18n.t('packages.scanner_fill_manual')}</p>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Tracking</label>
                            <input type="text" id="manual-tracking" class="form-input" readonly>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">${I18n.t('packages.client_name')} *</label>
                                <input type="text" id="manual-client-name" class="form-input">
                            </div>
                            <div class="form-group">
                                <label class="form-label">${I18n.t('packages.phone')} *</label>
                                <input type="tel" id="manual-client-phone" class="form-input" placeholder="+237 6XX XXX XXX">
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">${I18n.t('packages.description')}</label>
                            <input type="text" id="manual-desc" class="form-input">
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">${I18n.t('packages.origin')}</label>
                                <div id="manual-origin-container"></div>
                            </div>
                            <div class="form-group">
                                <label class="form-label">${I18n.t('packages.destination')}</label>
                                <div id="manual-dest-container"></div>
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">${I18n.t('packages.transport_mode')}</label>
                                <div id="manual-transport-container"></div>
                            </div>
                            <div class="form-group">
                                <label class="form-label">${I18n.t('estimator.package_type')}</label>
                                <div id="manual-type-container"></div>
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">${I18n.t('packages.weight_kg')}</label>
                                <input type="number" id="manual-weight" class="form-input" step="0.1">
                            </div>
                            <div class="form-group">
                                <label class="form-label">${I18n.t('packages.volume_cbm')}</label>
                                <input type="number" id="manual-cbm" class="form-input" step="0.001">
                            </div>
                            <div class="form-group">
                                <label class="form-label">${I18n.t('packages.quantity')}</label>
                                <input type="number" id="manual-qty" class="form-input" value="1">
                            </div>
                        </div>
                        <div class="form-actions">
                            <button class="btn btn-secondary" id="btn-cancel-manual">${I18n.t('cancel')}</button>
                            <button class="btn btn-primary" id="btn-save-manual">${I18n.t('save')}</button>
                        </div>
                    </div>
                </div>
            `,
            footer: `
                <button class="btn btn-secondary" id="btn-close-scanner">${I18n.t('close')}</button>
            `
        });
        
        this.initScannerMode();
    },

    initScannerMode() {
        const scanInput = document.getElementById('scan-input');
        const statusDiv = document.getElementById('scanner-status');
        const manualForm = document.getElementById('manual-form');
        
        // Focus initial
        scanInput?.focus();
        
        // Fonction de recherche
        const doSearch = async () => {
            const code = scanInput.value.trim();
            if (!code) return;
            await this.processScannedCode(code);
        };
        
        // Enter pour scanner physique
        scanInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                doSearch();
            }
        });
        
        // Bouton recherche pour mobile
        document.getElementById('btn-scan-search')?.addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            try {
                Loader.button(btn, true, { text: '' });
                await doSearch();
            } finally {
                Loader.button(btn, false);
            }
        });
        
        // Bouton fermer
        document.getElementById('btn-close-scanner')?.addEventListener('click', () => {
            Modal.close();
            this.loadPackages();
        });
        
        // Bouton annuler formulaire manuel
        document.getElementById('btn-cancel-manual')?.addEventListener('click', () => {
            manualForm?.classList.add('hidden');
            scanInput.value = '';
            scanInput?.focus();
            statusDiv.innerHTML = '';
        });
        
        // Bouton sauvegarder manuel
        document.getElementById('btn-save-manual')?.addEventListener('click', (e) => {
            this.saveManualPackage(e.currentTarget);
        });
        
        // Init transport -> type pour formulaire manuel avec SearchSelect
        const transportItems = CONFIG.TRANSPORT_MODES.map(t => ({ id: t.value, name: t.label }));
        
        const updateTypeItems = (transport) => {
            const origin = this.manualOriginSelect?.getValue();
            const dest = this.manualDestSelect?.getValue();
            if (!origin || !dest || !transport || typeof RatesService === 'undefined') {
                this.manualTypeSelect?.setItems([]);
                this.manualTypeSelect?.clear();
                return;
            }

            const rates = RatesService.getRouteRates(origin, dest);
            const transportRates = rates?.[transport] || {};
            const typeItems = Object.entries(transportRates)
                .filter(([key]) => key !== 'currency')
                .map(([key, value]) => {
                    const label = typeof value === 'object' && value.label ? value.label : key;
                    return { id: key, name: label };
                });

            if (this.manualTypeSelect) {
                this.manualTypeSelect.setItems(typeItems);
                if (!this.manualTypeSelect.getValue() && typeItems.length > 0) {
                    this.manualTypeSelect.setValue(typeItems[0].id);
                }
            }
        };

        const updateTransportItems = () => {
            const origin = this.manualOriginSelect?.getValue();
            const dest = this.manualDestSelect?.getValue();
            if (!origin || !dest || typeof RatesService === 'undefined') {
                this.manualTransportSelect?.setItems([]);
                this.manualTransportSelect?.clear();
                this.manualTypeSelect?.setItems([]);
                this.manualTypeSelect?.clear();
                return;
            }

            const transports = RatesService.getAvailableTransports(origin, dest) || [];
            const transportItems = transports.map(t => ({ id: t.value, name: t.label }));
            this.manualTransportSelect?.setItems(transportItems);
            if (transportItems.length > 0 && !this.manualTransportSelect?.getValue()) {
                this.manualTransportSelect?.setValue(transportItems[0].id);
            } else {
                updateTypeItems(this.manualTransportSelect?.getValue());
            }
        };
        const originItems = typeof RatesService !== 'undefined' ? RatesService.getOriginItems() : [];
        const destItems = typeof RatesService !== 'undefined' ? RatesService.getDestinationItems() : [];

        this.manualOriginSelect = new SearchSelect({
            container: '#manual-origin-container',
            placeholder: I18n.t('packages.origin'),
            items: originItems,
            onSelect: () => updateTransportItems()
        });

        this.manualDestSelect = new SearchSelect({
            container: '#manual-dest-container',
            placeholder: I18n.t('packages.destination'),
            items: destItems,
            onSelect: () => updateTransportItems()
        });

        this.manualTransportSelect = new SearchSelect({
            container: '#manual-transport-container',
            placeholder: I18n.t('packages.transport_mode'),
            items: [],
            onSelect: (item) => { if (item) updateTypeItems(item.id); }
        });

        this.manualTypeSelect = new SearchSelect({
            container: '#manual-type-container',
            placeholder: I18n.t('estimator.package_type'),
            items: [],
            onSelect: () => {}
        });
    },
    
    async processScannedCode(code) {
        const scanInput = document.getElementById('scan-input');
        const statusDiv = document.getElementById('scanner-status');
        const manualForm = document.getElementById('manual-form');
        const countSpan = document.getElementById('scan-count');
        
        // Afficher recherche en cours
        statusDiv.innerHTML = `<div class="scan-searching">${Loader.inline('sm')} ${I18n.t('packages.scanner_searching')}</div>`;
        
        try {
            // Recherche via API
            const result = await API.packages.findByTracking(code);
            
            if (result.found && result.package) {
                const pkg = result.package;
                
                // Vérifier si déjà reçu
                if (pkg.status !== 'pending') {
                    statusDiv.innerHTML = `
                        <div class="scan-warning">
                            ${Icons.get('info', {size:20})}
                            <span>${I18n.t('packages.scanner_already_received')} (${CONFIG.PACKAGE_STATUSES[pkg.status]?.label || pkg.status})</span>
                        </div>
                    `;
                    this.playSound('warning');
                    setTimeout(() => {
                        scanInput.value = '';
                        scanInput?.focus();
                    }, 2000);
                    return;
                }
                
                // Afficher le formulaire de réception avec les valeurs estimées
                this.showReceiveForm(pkg, code);
            } else {
                this.showManualForm(code);
            }
        } catch (error) {
            console.error('Scan search error:', error);
            // En cas d'erreur API, proposer la saisie manuelle
            this.showManualForm(code);
        }
    },

    /**
     * Affiche le formulaire de réception avec les valeurs estimées par le client
     * et permet de saisir les valeurs réelles mesurées
     * Le tarif est automatiquement récupéré depuis les tarifs configurés (non-éditable)
     */
    showReceiveForm(pkg, code) {
        const statusDiv = document.getElementById('scanner-status');
        const manualForm = document.getElementById('manual-form');
        
        // Cacher le formulaire manuel s'il était visible
        manualForm?.classList.add('hidden');
        
        // Stocker le colis courant
        this.currentReceivePackage = pkg;
        
        // Déterminer l'unité de facturation selon les tarifs configurés
        const transport = pkg.transport_mode;
        const pkgType = pkg.package_type;
        let billingUnit = 'kg';
        let showWeight = true;
        let showCbm = false;
        let showQuantity = false;
        
        // Obtenir le tarif automatiquement depuis RatesService (non-éditable par l'opérateur)
        let configuredRate = null;
        let rateSource = '';
        let configuredUnit = null;
        try {
            if (typeof RatesService !== 'undefined') {
                const originCountry = pkg.origin_country || pkg.origin?.country;
                const destCountry = pkg.destination_country || pkg.destination?.country;
                
                if (originCountry && destCountry) {
                    const rates = RatesService.getRouteRates(originCountry, destCountry);
                    if (rates && rates[transport] && rates[transport][pkgType]) {
                        const rateData = rates[transport][pkgType];
                        // Support ancien format (number) et nouveau format (object avec rate)
                        configuredRate = typeof rateData === 'object' ? rateData.rate : rateData;
                        configuredUnit = typeof rateData === 'object' ? (rateData.unit || null) : null;
                        rateSource = `${RatesService.getOriginLabel(originCountry)} → ${RatesService.getDestinationLabel(destCountry)}`;
                    }
                }
            }
        } catch (e) {
            console.warn('Could not get configured rate:', e);
        }

        // Appliquer l'unité configurée si disponible
        if (configuredUnit) {
            billingUnit = configuredUnit;
        } else {
            // Fallback: logique historique si aucune unité configurée
            if (transport === 'sea') {
                billingUnit = 'cbm';
            } else if (pkgType === 'special' || pkgType === 'battery' || pkgType === 'liquid') {
                billingUnit = 'piece';
            }
        }

        // Déterminer les champs visibles selon l'unité
        if (billingUnit === 'cbm') {
            showWeight = true;
            showCbm = true;
        } else if (billingUnit === 'piece') {
            showQuantity = true;
            showWeight = false;
        } else if (billingUnit === 'fixed') {
            showWeight = false;
            showCbm = false;
            showQuantity = false;
        } else {
            showWeight = true;
        }
        
        // Stocker le tarif pour le calcul automatique
        this.currentReceiveRate = configuredRate;
        this.currentBillingUnit = billingUnit;
        
        // Affichage du tarif (lecture seule)
        const rateDisplay = configuredRate 
            ? `<span class="rate-value">${configuredRate.toLocaleString()} XAF/${billingUnit}</span>
               <span class="rate-source text-muted text-sm">(${rateSource})</span>`
            : `<span class="rate-warning text-warning">${Icons.get('alert-triangle', {size:14})} ${I18n.t('packages.rate_not_configured')}</span>`;
        
        statusDiv.innerHTML = `
            <div class="receive-form-container">
                <div class="receive-form-header">
                    <div class="receive-package-info">
                        <div class="receive-tracking">
                            <strong>${pkg.tracking_number}</strong>
                            ${pkg.supplier_tracking ? `<span class="text-muted">(${pkg.supplier_tracking})</span>` : ''}
                        </div>
                        <div class="receive-client">
                            ${Icons.get('user', {size:14})}
                            <span>${pkg.client?.name || 'Client'}</span>
                            <span class="text-muted">${pkg.client?.phone || ''}</span>
                        </div>
                        <div class="receive-desc text-muted">${pkg.description || '-'}</div>
                    </div>
                    <div class="receive-transport">
                        <span class="transport-badge transport-${transport}">${this.getTransportLabel(transport)}</span>
                        <span class="type-badge">${this.getTypeLabel(pkgType)}</span>
                    </div>
                </div>
                
                <div class="receive-form-body">
                    <div class="receive-comparison">
                        <div class="comparison-header">
                            <span></span>
                            <span class="comparison-label">${I18n.t('packages.estimate_client')}</span>
                            <span class="comparison-label">${I18n.t('packages.actual_value')}</span>
                        </div>
                        
                        ${showWeight ? `
                        <div class="comparison-row">
                            <span class="comparison-field">${I18n.t('packages.weight_kg')}</span>
                            <span class="comparison-estimated">${pkg.weight || '-'}</span>
                            <input type="number" id="receive-weight" class="form-input comparison-input" 
                                step="0.1" min="0" value="${pkg.weight || ''}" placeholder="Poids réel">
                        </div>
                        ` : ''}
                        
                        ${showCbm ? `
                        <div class="comparison-row">
                            <span class="comparison-field">${I18n.t('packages.volume_cbm')}</span>
                            <span class="comparison-estimated">${pkg.cbm || '-'}</span>
                            <input type="number" id="receive-cbm" class="form-input comparison-input" 
                                step="0.001" min="0" value="${pkg.cbm || ''}" placeholder="Volume réel">
                        </div>
                        ` : ''}
                        
                        ${showQuantity ? `
                        <div class="comparison-row">
                            <span class="comparison-field">${I18n.t('packages.pieces')}</span>
                            <span class="comparison-estimated">${pkg.quantity || '-'}</span>
                            <input type="number" id="receive-quantity" class="form-input comparison-input" 
                                min="1" value="${pkg.quantity || 1}" placeholder="Nombre réel">
                        </div>
                        ` : ''}
                    </div>
                    
                    <!-- Tarif automatique (non-éditable) -->
                    <div class="receive-rate-info">
                        <span class="rate-label">${I18n.t('packages.rate_applied')}:</span>
                        ${rateDisplay}
                    </div>
                    
                    <div class="receive-total" id="receive-total">
                        <span class="total-label">${I18n.t('packages.total_amount')}:</span>
                        <span class="total-value" id="receive-total-value">-</span>
                    </div>
                    
                    <div style="margin:12px 0;display:flex;align-items:center;gap:8px">
                        <input type="checkbox" id="receive-print-label" checked>
                        <label for="receive-print-label" style="cursor:pointer;font-size:14px">
                            ${Icons.get('printer', {size:14})} ${I18n.t('packages.print_label')}
                        </label>
                    </div>
                    
                    <div class="receive-actions">
                        <button class="btn btn-secondary" id="btn-cancel-receive">${I18n.t('cancel')}</button>
                        <button class="btn btn-primary" id="btn-confirm-receive" ${!configuredRate ? `disabled title="${I18n.t('packages.rate_not_configured')}"` : ''}>
                            ${Icons.get('check', {size:16})} ${I18n.t('packages.confirm_receive')}
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // Attacher les événements
        this.attachReceiveFormEvents(billingUnit);
        
        // Calculer le total initial
        this.calculateReceiveTotal(billingUnit);
    },
    
    attachReceiveFormEvents(billingUnit) {
        const scanInput = document.getElementById('scan-input');
        const statusDiv = document.getElementById('scanner-status');
        
        // Calcul automatique du total quand les mesures changent
        const inputs = ['receive-weight', 'receive-cbm', 'receive-quantity'];
        inputs.forEach(id => {
            document.getElementById(id)?.addEventListener('input', () => {
                this.calculateReceiveTotal(billingUnit);
            });
        });
        
        // Bouton annuler
        document.getElementById('btn-cancel-receive')?.addEventListener('click', () => {
            statusDiv.innerHTML = '';
            this.currentReceivePackage = null;
            this.currentReceiveRate = null;
            scanInput.value = '';
            scanInput?.focus();
        });
        
        // Bouton confirmer
        document.getElementById('btn-confirm-receive')?.addEventListener('click', (e) => {
            this.confirmReceive(billingUnit, e.currentTarget);
        });
    },
    
    calculateReceiveTotal(billingUnit) {
        const weight = parseFloat(document.getElementById('receive-weight')?.value) || 0;
        const cbm = parseFloat(document.getElementById('receive-cbm')?.value) || 0;
        const quantity = parseInt(document.getElementById('receive-quantity')?.value) || 0;
        
        // Utiliser le tarif configuré (stocké lors de l'affichage du formulaire)
        const unitPrice = this.currentReceiveRate || 0;
        
        let total = 0;
        if (billingUnit === 'cbm' && cbm > 0) {
            total = cbm * unitPrice;
        } else if (billingUnit === 'piece' && quantity > 0) {
            total = quantity * unitPrice;
        } else if (weight > 0) {
            total = weight * unitPrice;
        }
        
        const totalEl = document.getElementById('receive-total-value');
        if (totalEl) {
            totalEl.textContent = total > 0 ? `${Math.round(total).toLocaleString()} XAF` : '-';
            totalEl.classList.toggle('has-value', total > 0);
        }
    },
    
    async confirmReceive(billingUnit, btn = null) {
        if (!this.currentReceivePackage) return;
        
        const pkg = this.currentReceivePackage;
        const weight = parseFloat(document.getElementById('receive-weight')?.value) || null;
        const cbm = parseFloat(document.getElementById('receive-cbm')?.value) || null;
        const quantity = parseInt(document.getElementById('receive-quantity')?.value) || null;
        
        // Utiliser le tarif configuré (non-éditable par l'opérateur)
        const unitPrice = this.currentReceiveRate || null;
        
        // Validation: au moins une valeur de mesure
        if (!weight && !cbm && !quantity) {
            Toast.error(I18n.t('packages.enter_measure'));
            return;
        }
        
        // Validation: tarif doit être configuré
        if (!unitPrice) {
            Toast.error(I18n.t('packages.rate_not_configured_settings'));
            return;
        }
        
        const scanInput = document.getElementById('scan-input');
        const statusDiv = document.getElementById('scanner-status');
        const countSpan = document.getElementById('scan-count');
        
        try {
            Loader.button(btn, true, { text: I18n.t('packages.validating') });
            // Appel API pour confirmer la réception avec les valeurs finales
            // Le tarif est envoyé mais le backend peut aussi le recalculer pour sécurité
            const result = await API.packages.receive(pkg.id, {
                location: 'Entrepôt origine',
                final_weight: weight,
                final_cbm: cbm,
                final_quantity: quantity,
                unit_price: unitPrice,
                notify: true
            });
            
            this.receivedCount++;
            countSpan.textContent = this.receivedCount;
            
            // Calculer le montant pour l'affichage
            let amount = 0;
            let measureInfo = '';
            if (billingUnit === 'cbm' && cbm) {
                amount = cbm * unitPrice;
                measureInfo = `${cbm} m³`;
            } else if (billingUnit === 'piece' && quantity) {
                amount = quantity * unitPrice;
                measureInfo = `${quantity} pièces`;
            } else if (weight) {
                amount = weight * unitPrice;
                measureInfo = `${weight} kg`;
            }
            
            statusDiv.innerHTML = `
                <div class="scan-success">
                    ${Icons.get('check-circle', {size:24})}
                    <div class="scan-success-info">
                        <strong>${pkg.tracking_number}</strong>
                        <span>${pkg.client?.name || 'Client'} - ${pkg.description}</span>
                        <span class="text-sm">${measureInfo} × ${unitPrice.toLocaleString()} XAF = ${Math.round(amount).toLocaleString()} XAF</span>
                        ${result.notification ? `<span class="text-sm text-success">✓ ${I18n.t('packages.scanner_client_notified')}</span>` : ''}
                    </div>
                </div>
            `;
            
            this.playSound('success');
            Toast.success(`${I18n.t('packages.scanner_received_toast')}: ${pkg.client?.name || 'Client'}`);
            ViewCache.onMutate('packages');
            
            // Auto-print label if checkbox is checked
            const printLabel = document.getElementById('receive-print-label')?.checked;
            if (printLabel) {
                this.printDetailedLabel({
                    tracking_number: pkg.tracking_number,
                    supplier_tracking: pkg.supplier_tracking,
                    client_name: pkg.client?.name || 'Client',
                    client_phone: pkg.client?.phone || '',
                    description: pkg.description || '',
                    origin_country: pkg.origin_country || pkg.origin?.country || '',
                    destination_country: pkg.destination_country || pkg.destination?.country || '',
                    transport_mode: pkg.transport_mode,
                    package_type: pkg.package_type,
                    weight: weight,
                    cbm: cbm,
                    quantity: quantity,
                    amount: Math.round(amount),
                    created_at: new Date().toLocaleDateString(I18n.locale === 'fr' ? 'fr-FR' : 'en-US')
                });
            }
            
            // Reset des variables
            this.currentReceivePackage = null;
            this.currentReceiveRate = null;
            
        } catch (error) {
            console.error('Receive package error:', error);
            statusDiv.innerHTML = `
                <div class="scan-warning">
                    ${Icons.get('alert-triangle', {size:20})}
                    <span>Erreur: ${error.message}</span>
                </div>
            `;
            this.playSound('warning');
        } finally {
            Loader.button(btn, false);
        }
        
        // Reset et refocus après un délai
        setTimeout(() => {
            scanInput.value = '';
            scanInput?.focus();
        }, 2000);
    },

    async autoReceivePackage(pkg, code) {
        // Cette fonction n'est plus utilisée directement
        // La réception passe maintenant par showReceiveForm
        this.showReceiveForm(pkg, code);
    },
    
    showManualForm(code) {
        const statusDiv = document.getElementById('scanner-status');
        const manualForm = document.getElementById('manual-form');
        
        manualForm?.classList.remove('hidden');
        document.getElementById('manual-tracking').value = code;
        
        // Reset les champs du formulaire
        document.getElementById('manual-client-name').value = '';
        document.getElementById('manual-client-phone').value = '';
        document.getElementById('manual-desc').value = '';
        document.getElementById('manual-weight').value = '';
        document.getElementById('manual-cbm').value = '';
        document.getElementById('manual-qty').value = '1';

        this.manualOriginSelect?.clear();
        this.manualDestSelect?.clear();
        this.manualTransportSelect?.setItems([]);
        this.manualTransportSelect?.clear();
        this.manualTypeSelect?.setItems([]);
        this.manualTypeSelect?.clear();
        
        this.playSound('warning');
        
        statusDiv.innerHTML = `
            <div class="scan-warning">
                ${Icons.get('alert-triangle', {size:20})}
                <span>${I18n.t('packages.scanner_not_preregistered')}</span>
            </div>
        `;
        
        // Focus sur le premier champ
        document.getElementById('manual-client-name')?.focus();
    },

    async saveManualPackage(btn = null) {
        const tracking = document.getElementById('manual-tracking').value;
        const clientName = document.getElementById('manual-client-name').value.trim();
        const clientPhone = document.getElementById('manual-client-phone').value.trim();
        const desc = document.getElementById('manual-desc').value;
        const origin = this.manualOriginSelect?.getValue();
        const destination = this.manualDestSelect?.getValue();
        const transport = this.manualTransportSelect?.getValue();
        const type = this.manualTypeSelect?.getValue();
        const weight = document.getElementById('manual-weight').value;
        const cbm = document.getElementById('manual-cbm').value;
        const qty = document.getElementById('manual-qty').value;

        try {
            if (!btn) btn = document.getElementById('btn-save-manual');
            Loader.button(btn, true, { text: I18n.t('packages.saving') });

            // Appel API pour creer le colis
            await API.packages.create({ 
                supplier_tracking: tracking, 
                client_name: clientName,
                client_phone: clientPhone,
                origin_country: origin || undefined,
                destination_country: destination || undefined,
                description: desc, 
                transport_mode: transport, 
                package_type: type, 
                weight: weight ? parseFloat(weight) : null, 
                cbm: cbm ? parseFloat(cbm) : null,
                quantity: parseInt(qty) || 1, 
                status: 'received' 
            });

            this.receivedCount++;
            document.getElementById('scan-count').textContent = this.receivedCount;

            const manualForm = document.getElementById('manual-form');
            const scanInput = document.getElementById('scan-input');
            const statusDiv = document.getElementById('scanner-status');

            manualForm?.classList.add('hidden');

            statusDiv.innerHTML = `
                <div class="scan-success">
                    ${Icons.get('check-circle', {size:24})}
                    <div class="scan-success-info">
                        <strong>${tracking}</strong>
                        <span>${I18n.t('packages.scanner_new_client')}: ${clientName}</span>
                    </div>
                </div>
            `;

            this.playSound('success');
            Toast.success(I18n.t('packages.scanner_registered'));
            ViewCache.onMutate('packages');

            // Reset et refocus
            setTimeout(() => {
                scanInput.value = '';
                scanInput?.focus();
            }, 1000);

        } catch (error) {
            console.error('Create package error:', error);
            Toast.error(`Erreur: ${error.message}`);
        } finally {
            Loader.button(btn, false);
        }
    },

    getAvailableDepartures() {
        const stored = localStorage.getItem('ec_departures');
        if (!stored) return [];
        
        try {
            const departures = JSON.parse(stored);
            return departures.filter(d => d.status === 'scheduled' || d.status === 'departed')
                .sort((a, b) => new Date(a.departure_date) - new Date(b.departure_date));
        } catch (e) {
            return [];
        }
    },
    
    /**
     * Assigner des colis a un depart (mise a jour localStorage)
     */
    assignPackagesToDeparture(packageIds, departureId) {
        // En mode demo, on stocke dans localStorage
        // En prod: API call pour mettre a jour les colis
        
        let packages = JSON.parse(localStorage.getItem('ec_packages') || '[]');
        
        packageIds.forEach(pkgId => {
            const pkg = packages.find(p => p.id === pkgId);
            if (pkg) {
                pkg.departure_id = departureId;
            }
        });
        
        localStorage.setItem('ec_packages', JSON.stringify(packages));
    },
    
    /**
     * Obtenir le depart assigne a un colis
     */
    getDepartureForPackage(packageId) {
        const packages = JSON.parse(localStorage.getItem('ec_packages') || '[]');
        const pkg = packages.find(p => p.id === packageId);
        if (!pkg?.departure_id) return null;
        
        const departures = JSON.parse(localStorage.getItem('ec_departures') || '[]');
        return departures.find(d => d.id === pkg.departure_id);
    },

    exportExcel() {
        if (this.allPackages.length === 0) { 
            Toast.error(I18n.t('packages.no_data_export')); 
            return; 
        }
        
        // Utiliser le service d'export
        ExportService.exportPackages(this.allPackages.map(p => ({
            tracking_number: p.tracking,
            client: { name: p.client_name },
            description: p.description,
            status: p.status,
            weight: p.weight,
            amount: p.amount,
            paid_amount: p.paid || 0,
            created_at: p.created_at
        })), {
            title: 'Liste des Colis',
            subtitle: this.currentFilter !== 'all' ? `Filtre: ${CONFIG.PACKAGE_STATUSES[this.currentFilter]?.label || this.currentFilter}` : null,
            format: 'csv',
            filename: `colis_export_${new Date().toISOString().split('T')[0]}.csv`
        });
    },

    exportPDF() {
        if (this.allPackages.length === 0) { 
            Toast.error(I18n.t('packages.no_data_export')); 
            return; 
        }
        
        ExportService.exportPackages(this.allPackages.map(p => ({
            tracking_number: p.tracking,
            client: { name: p.client_name },
            description: p.description,
            status: p.status,
            weight: p.weight,
            amount: p.amount,
            paid_amount: p.paid || 0,
            created_at: p.created_at
        })), {
            title: 'Liste des Colis',
            subtitle: this.currentFilter !== 'all' ? `Filtre: ${CONFIG.PACKAGE_STATUSES[this.currentFilter]?.label || this.currentFilter}` : null,
            format: 'pdf',
            filename: `colis_export_${new Date().toISOString().split('T')[0]}.pdf`
        });
    },
    
    printLabel(pkgId) {
        const pkg = this.allPackages.find(p => p.id === pkgId);
        if (!pkg) { Toast.error(I18n.t('packages.no_packages')); return; }
        this.openLabelPrintWindow([pkg]);
    },
    
    bulkPrintLabels() {
        const packages = this.allPackages.filter(p => this.selectedIds.has(p.id));
        if (packages.length === 0) { Toast.error(I18n.t('packages.no_packages')); return; }
        this.openLabelPrintWindow(packages);
    },
    
    printDetailedLabel(pkg) {
        // Get tenant branding from settings
        let companyName = 'Express Cargo';
        let companyPhone = '';
        let companyAddress = '';
        try {
            const user = Store.getUser();
            if (user?.tenant_name) companyName = user.tenant_name;
        } catch(e) {}

        const tracking = pkg.tracking_number || pkg.tracking || '';
        const originLabel = typeof RatesService !== 'undefined' ? RatesService.getOriginLabel(pkg.origin_country) : (pkg.origin_country || '');
        const destLabel = typeof RatesService !== 'undefined' ? RatesService.getDestinationLabel(pkg.destination_country) : (pkg.destination_country || '');
        const transportLabel = this.getTransportLabel(pkg.transport_mode);
        const typeLabel = this.getTypeLabel(pkg.package_type);

        const labelHtml = `
            <div class="label">
                <div class="label-header"><strong>${companyName}</strong></div>
                <div class="label-qr"><img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(tracking)}" alt="QR"></div>
                <div class="label-tracking">${tracking}</div>
                ${pkg.supplier_tracking ? `<div class="label-sub-tracking">Ref: ${pkg.supplier_tracking}</div>` : ''}
                <div class="label-divider"></div>
                <div class="label-info">
                    <div class="label-row"><strong>Client:</strong> ${pkg.client_name}</div>
                    <div class="label-row"><strong>Tel:</strong> ${pkg.client_phone}</div>
                    <div class="label-row"><strong>Contenu:</strong> ${pkg.description || '-'}</div>
                </div>
                <div class="label-divider"></div>
                <div class="label-info">
                    <div class="label-row"><strong>Route:</strong> ${originLabel} → ${destLabel}</div>
                    <div class="label-row"><strong>Transport:</strong> ${transportLabel} | <strong>Type:</strong> ${typeLabel}</div>
                    ${pkg.weight ? `<div class="label-row"><strong>Poids:</strong> ${pkg.weight} kg</div>` : ''}
                    ${pkg.cbm ? `<div class="label-row"><strong>Volume:</strong> ${pkg.cbm} m³</div>` : ''}
                    ${pkg.quantity && pkg.quantity > 1 ? `<div class="label-row"><strong>Qté:</strong> ${pkg.quantity}</div>` : ''}
                    ${pkg.amount ? `<div class="label-row"><strong>Montant:</strong> ${pkg.amount.toLocaleString()} XAF</div>` : ''}
                </div>
                <div class="label-footer">${pkg.created_at || new Date().toLocaleDateString(I18n.locale === 'fr' ? 'fr-FR' : 'en-US')}</div>
            </div>`;

        this._openPrintWindow(labelHtml);
    },

    openLabelPrintWindow(packages) {
        let companyName = 'Express Cargo';
        try { const u = Store.getUser(); if (u?.tenant_name) companyName = u.tenant_name; } catch(e) {}

        const labelsHtml = packages.map(p => {
            const tracking = p.tracking_number || p.tracking || '';
            return `
            <div class="label">
                <div class="label-header"><strong>${companyName}</strong></div>
                <div class="label-qr"><img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(tracking)}" alt="QR"></div>
                <div class="label-tracking">${tracking}</div>
                <div class="label-divider"></div>
                <div class="label-info">
                    <div class="label-row"><strong>Client:</strong> ${p.client?.name || p.client_name || '-'}</div>
                    <div class="label-row"><strong>Tel:</strong> ${p.client?.phone || p.client_phone || '-'}</div>
                    <div class="label-row"><strong>Desc:</strong> ${p.description || '-'}</div>
                    ${p.weight ? `<div class="label-row"><strong>Poids:</strong> ${p.weight} kg</div>` : ''}
                    ${p.amount ? `<div class="label-row"><strong>Montant:</strong> ${(p.amount||0).toLocaleString()} XAF</div>` : ''}
                </div>
                <div class="label-footer">${p.created_at ? new Date(p.created_at).toLocaleDateString(I18n.locale === 'fr' ? 'fr-FR' : 'en-US') : ''}</div>
            </div>`;
        }).join('');

        this._openPrintWindow(labelsHtml);
    },

    _openPrintWindow(labelsHtml) {
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`<!DOCTYPE html><html><head><title>Etiquettes</title>
            <style>
                *{margin:0;padding:0;box-sizing:border-box}
                body{font-family:Arial,sans-serif;padding:10mm}
                .labels{display:flex;flex-wrap:wrap;gap:5mm}
                .label{width:80mm;border:2px solid #000;padding:3mm;page-break-inside:avoid;border-radius:2mm}
                .label-header{text-align:center;font-size:14px;border-bottom:2px solid #000;padding-bottom:2mm;margin-bottom:2mm;letter-spacing:1px}
                .label-qr{text-align:center;margin:2mm 0}
                .label-qr img{width:25mm;height:25mm}
                .label-tracking{text-align:center;font-size:14px;font-weight:bold;margin:1mm 0;font-family:monospace;letter-spacing:1px}
                .label-sub-tracking{text-align:center;font-size:9px;color:#666;margin-bottom:1mm}
                .label-divider{border-top:1px dashed #999;margin:2mm 0}
                .label-info{font-size:10px;line-height:1.6}
                .label-row{margin-bottom:0.5mm}
                .label-footer{text-align:right;font-size:8px;margin-top:2mm;color:#666;border-top:1px solid #ccc;padding-top:1mm}
                @media print{body{padding:0}.labels{gap:3mm}}
            </style>
        </head><body><div class="labels">${labelsHtml}</div><script>window.onload=()=>window.print()<\/script></body></html>`);
        printWindow.document.close();
    },
    
    getTransportLabel(mode) { return CONFIG.TRANSPORT_MODES.find(t => t.value === mode)?.label || mode; },
    getTypeLabel(type) { 
        const allTypes = [...(CONFIG.PACKAGE_TYPES?.air || []), ...(CONFIG.PACKAGE_TYPES?.sea || [])];
        return allTypes.find(t => t.value === type)?.label || type; 
    },
    formatMoney(amount) { return new Intl.NumberFormat(I18n.locale === 'fr' ? 'fr-FR' : 'en-US').format(amount) + ' XAF'; }
};
