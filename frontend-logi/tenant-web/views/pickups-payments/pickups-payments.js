/**
 * Vue Pickups & Payments - Retraits et Paiements fusionnés
 * 2 onglets: Retraits | Paiements
 */

Views.pickupsPayments = {
    currentTab: 'pickups',
    
    // État Pickups
    pickups: {
        currentPackage: null,
        signatureCanvas: null,
        signatureCtx: null,
        isDrawing: false,
        photoFile: null,
        dataTable: null
    },
    
    // État Payments
    payments: {
        filters: { search: '', method: '', dateFrom: '', dateTo: '' },
        allPayments: [],
        paymentMethods: [],
        currentPage: 1,
        pageSize: 10
    },
    
    async render() {
        const main = document.getElementById('main-content');
        
        main.innerHTML = `
            <div class="pickups-payments-page">
                <div class="page-header">
                    <h1 class="page-title">Retraits et Paiements</h1>
                </div>
                
                <!-- Tabs -->
                <div class="tabs-container">
                    <div class="tabs">
                        <button class="tab-btn active" data-tab="pickups">
                            ${Icons.get('check-circle', {size:16})} Retraits
                        </button>
                        <button class="tab-btn" data-tab="payments">
                            ${Icons.get('credit-card', {size:16})} Paiements
                        </button>
                    </div>
                </div>
                
                <!-- Tab Content -->
                <div id="tab-content">
                    ${Loader.page('Chargement...')}
                </div>
            </div>
        `;
        
        this.attachTabEvents();
        this.renderTab('pickups');
    },
    
    attachTabEvents() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentTab = btn.dataset.tab;
                this.renderTab(this.currentTab);
            });
        });
    },
    
    renderTab(tab) {
        if (tab === 'pickups') {
            this.renderPickupsTab();
        } else {
            this.renderPaymentsTab();
        }
    },

    // ==================== PICKUPS TAB ====================
    
    async renderPickupsTab() {
        const container = document.getElementById('tab-content');
        
        container.innerHTML = `
            <div class="pickups-content">
                <!-- Stats -->
                <div class="stats-grid mb-md">
                    <div class="stat-card">
                        <div class="stat-icon bg-warning">${Icons.get('package', {size:24})}</div>
                        <div class="stat-info">
                            <span class="stat-value" id="stat-awaiting">-</span>
                            <span class="stat-label">En attente</span>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon bg-danger">${Icons.get('dollar-sign', {size:24})}</div>
                        <div class="stat-info">
                            <span class="stat-value" id="stat-payment">-</span>
                            <span class="stat-label">Paiement requis</span>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon bg-success">${Icons.get('check-circle', {size:24})}</div>
                        <div class="stat-info">
                            <span class="stat-value" id="stat-today">-</span>
                            <span class="stat-label">Aujourd'hui</span>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon bg-primary">${Icons.get('calendar', {size:24})}</div>
                        <div class="stat-info">
                            <span class="stat-value" id="stat-month">-</span>
                            <span class="stat-label">Ce mois</span>
                        </div>
                    </div>
                </div>

                <!-- Recherche -->
                <div class="card mb-md">
                    <div class="card-body">
                        <div class="search-row">
                            <div class="search-group flex-2">
                                <label class="form-label">Scanner ou rechercher</label>
                                <div class="input-with-btn">
                                    <input type="text" id="pickupSearchInput" class="form-input" 
                                        placeholder="Tracking, nom ou telephone..." autofocus />
                                    <button id="pickupSearchBtn" class="btn btn-primary">
                                        ${Icons.get('search', {size:18})}
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div id="pickupSearchError" class="alert alert-error mt-sm" style="display: none;"></div>
                    </div>
                </div>
                
                <!-- Table des colis -->
                <div class="card mb-md">
                    <div class="card-header">
                        <h3 class="card-title">Colis disponibles pour retrait</h3>
                    </div>
                    <div class="card-body" id="pickupsTable"></div>
                </div>

                <!-- Formulaire de retrait -->
                <div class="card" id="pickupFormCard">
                    <div class="card-header">
                        <h3 class="card-title">Formulaire de retrait</h3>
                        <span class="badge badge-secondary" id="pickupFormTracking">Aucun colis selectionne</span>
                    </div>
                    <div class="card-body" id="pickupFormContent">
                        <div class="empty-state-sm">
                            ${Icons.get('package', {size:32})}
                            <p>Selectionnez un colis dans la liste ou recherchez par tracking</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        this.loadPickupsStats();
        this.loadAvailablePackages();
        this.attachPickupsEvents();
    },
    
    async loadPickupsStats() {
        try {
            const stats = await API.request('/pickups/stats');
            document.getElementById('stat-awaiting').textContent = stats.awaiting_pickup || 0;
            document.getElementById('stat-payment').textContent = stats.awaiting_payment || 0;
            document.getElementById('stat-today').textContent = stats.pickups_today || 0;
            document.getElementById('stat-month').textContent = stats.pickups_month || 0;
        } catch (e) {
            console.error('Erreur stats pickups:', e);
        }
    },
    
    async loadAvailablePackages() {
        const container = document.getElementById('pickupsTable');
        container.innerHTML = Loader.page('Chargement...');
        
        try {
            const response = await API.request('/pickups/available?per_page=20');
            const packages = response.packages || [];
            
            if (packages.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        ${Icons.get('check-circle', {size:48})}
                        <p>Aucun colis en attente de retrait</p>
                    </div>
                `;
                return;
            }
            
            container.innerHTML = `
                <div class="table-wrapper">
                    <table class="table">
                        <thead>
                            <tr>
                                <th>Tracking</th>
                                <th>Client</th>
                                <th>Telephone</th>
                                <th>Description</th>
                                <th>Reste a payer</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${packages.map(p => `
                                <tr>
                                    <td><code>${p.tracking_number}</code></td>
                                    <td>${p.client_name || '-'}</td>
                                    <td>${p.client_phone || '-'}</td>
                                    <td>${p.description || '-'}</td>
                                    <td class="${p.remaining > 0 ? 'text-danger font-bold' : 'text-success'}">
                                        ${this.formatMoney(p.remaining || 0)}
                                    </td>
                                    <td>
                                        <button class="btn btn-sm btn-primary" onclick="Views.pickupsPayments.selectPackageForPickup('${p.tracking_number}')">
                                            ${Icons.get('check', {size:14})} Retirer
                                        </button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        } catch (e) {
            console.error('Erreur chargement colis:', e);
            container.innerHTML = `<p class="text-danger">Erreur de chargement</p>`;
        }
    },
    
    attachPickupsEvents() {
        // Recherche
        document.getElementById('pickupSearchBtn')?.addEventListener('click', () => {
            const val = document.getElementById('pickupSearchInput').value.trim();
            if (val) this.searchPackageForPickup(val);
        });
        
        document.getElementById('pickupSearchInput')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const val = e.target.value.trim();
                if (val) this.searchPackageForPickup(val);
            }
        });
    },
    
    async searchPackageForPickup(query) {
        const errorDiv = document.getElementById('pickupSearchError');
        errorDiv.style.display = 'none';
        
        try {
            const response = await API.post('/pickups/search', { query });
            this.showPickupForm(response.package, response.payment);
        } catch (error) {
            errorDiv.textContent = error.message || 'Colis non trouve';
            errorDiv.style.display = 'block';
        }
    },
    
    selectPackageForPickup(tracking) {
        this.searchPackageForPickup(tracking);
    },
    
    showPickupForm(pkg, payment) {
        this.pickups.currentPackage = pkg;
        
        document.getElementById('pickupFormTracking').textContent = pkg.tracking_number;
        document.getElementById('pickupFormTracking').className = 'badge badge-primary';
        
        const remaining = payment?.remaining_amount || 0;
        const currency = payment?.currency || 'XAF';
        
        document.getElementById('pickupFormContent').innerHTML = `
            <div class="pickup-form-grid">
                <div class="form-section">
                    <h4 class="section-title">Informations</h4>
                    <div class="info-grid">
                        <div><strong>Client:</strong> ${pkg.client?.full_name || '-'}</div>
                        <div><strong>Telephone:</strong> ${pkg.client?.phone || '-'}</div>
                        <div><strong>Description:</strong> ${pkg.description || '-'}</div>
                        <div><strong>Total:</strong> ${this.formatMoney(payment?.total_amount || 0)}</div>
                        <div><strong>Paye:</strong> ${this.formatMoney(payment?.paid_amount || 0)}</div>
                        <div class="${remaining > 0 ? 'text-danger font-bold' : 'text-success'}">
                            <strong>Reste:</strong> ${this.formatMoney(remaining)}
                        </div>
                    </div>
                </div>
                
                <div class="form-section">
                    <h4 class="section-title">Qui retire ?</h4>
                    <div class="radio-group">
                        <label class="radio-label">
                            <input type="radio" name="pickupBy" value="client" checked>
                            <span>Client lui-meme</span>
                        </label>
                        <label class="radio-label">
                            <input type="radio" name="pickupBy" value="proxy">
                            <span>Mandataire</span>
                        </label>
                    </div>
                    
                    <div id="proxyFieldsPickup" style="display:none;" class="mt-sm">
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">Nom *</label>
                                <input type="text" id="proxyNamePickup" class="form-input">
                            </div>
                            <div class="form-group">
                                <label class="form-label">Telephone *</label>
                                <input type="tel" id="proxyPhonePickup" class="form-input">
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">Piece d'identite</label>
                                <input type="text" id="proxyIdPickup" class="form-input" placeholder="CNI, Passeport...">
                            </div>
                        </div>
                    </div>
                    
                    ${remaining > 0 ? `
                        <h4 class="section-title mt-md">Encaissement: ${this.formatMoney(remaining)}</h4>
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">Methode *</label>
                                <select id="pickupPaymentMethod" class="form-input">
                                    <option value="">Selectionner...</option>
                                    <option value="cash">Especes</option>
                                    <option value="mobile_money">Mobile Money</option>
                                    <option value="bank_transfer">Virement</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Reference</label>
                                <input type="text" id="pickupPaymentRef" class="form-input" placeholder="N° transaction">
                            </div>
                        </div>
                    ` : ''}
                    
                    <div class="form-group mt-md">
                        <label class="form-label">Notes</label>
                        <textarea id="pickupNotes" class="form-input" rows="2"></textarea>
                    </div>
                    
                    <div class="form-actions mt-md">
                        <button class="btn btn-outline" onclick="Views.pickupsPayments.cancelPickup()">Annuler</button>
                        <button class="btn btn-primary" onclick="Views.pickupsPayments.confirmPickup(this)">
                            ${Icons.get('check', {size:16})} Confirmer le retrait
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // Toggle proxy fields
        document.querySelectorAll('input[name="pickupBy"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                document.getElementById('proxyFieldsPickup').style.display = 
                    e.target.value === 'proxy' ? 'block' : 'none';
            });
        });
        
        formCard.scrollIntoView({ behavior: 'smooth' });
    },
    
    cancelPickup() {
        this.pickups.currentPackage = null;
        document.getElementById('pickupFormTracking').textContent = 'Aucun colis selectionne';
        document.getElementById('pickupFormTracking').className = 'badge badge-secondary';
        document.getElementById('pickupFormContent').innerHTML = `
            <div class="empty-state-sm">
                ${Icons.get('package', {size:32})}
                <p>Selectionnez un colis dans la liste ou recherchez par tracking</p>
            </div>
        `;
        document.getElementById('pickupSearchInput').value = '';
    },
    
    async confirmPickup(btn = null) {
        if (!this.pickups.currentPackage) return;
        
        const pickupBy = document.querySelector('input[name="pickupBy"]:checked')?.value || 'client';
        const notes = document.getElementById('pickupNotes')?.value || '';
        
        const data = {
            package_id: this.pickups.currentPackage.id,
            pickup_by: pickupBy,
            notes
        };
        
        if (pickupBy === 'proxy') {
            data.proxy_name = document.getElementById('proxyNamePickup')?.value;
            data.proxy_phone = document.getElementById('proxyPhonePickup')?.value;
            data.proxy_id = document.getElementById('proxyIdPickup')?.value;
            
            if (!data.proxy_name || !data.proxy_phone) {
                Toast.error('Nom et telephone du mandataire requis');
                return;
            }
        }
        
        // Paiement si necessaire
        const paymentMethod = document.getElementById('pickupPaymentMethod')?.value;
        if (paymentMethod) {
            data.payment_method = paymentMethod;
            data.payment_reference = document.getElementById('pickupPaymentRef')?.value;
        }
        
        try {
            Loader.button(btn, true, { text: 'Validation...' });
            await API.post('/pickups/confirm', data);
            Toast.success('Retrait confirme');
            this.cancelPickup();
            this.loadPickupsStats();
            this.loadAvailablePackages();
        } catch (error) {
            Toast.error(error.message);
        } finally {
            Loader.button(btn, false);
        }
    },

    // ==================== PAYMENTS TAB ====================
    
    async renderPaymentsTab() {
        const container = document.getElementById('tab-content');
        
        container.innerHTML = `
            <div class="payments-content">
                <!-- Stats -->
                <div class="stats-grid mb-md">
                    <div class="stat-card">
                        <div class="stat-icon bg-success">${Icons.get('dollar-sign', {size:24})}</div>
                        <div class="stat-info">
                            <span class="stat-value" id="pay-stat-today">-</span>
                            <span class="stat-label">Aujourd'hui</span>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon bg-primary">${Icons.get('trending-up', {size:24})}</div>
                        <div class="stat-info">
                            <span class="stat-value" id="pay-stat-week">-</span>
                            <span class="stat-label">Cette semaine</span>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon bg-info">${Icons.get('calendar', {size:24})}</div>
                        <div class="stat-info">
                            <span class="stat-value" id="pay-stat-month">-</span>
                            <span class="stat-label">Ce mois</span>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon bg-warning">${Icons.get('clock', {size:24})}</div>
                        <div class="stat-info">
                            <span class="stat-value" id="pay-stat-pending">-</span>
                            <span class="stat-label">En attente</span>
                        </div>
                    </div>
                </div>
                
                <!-- Actions -->
                <div class="page-actions mb-md">
                    <button class="btn btn-primary" id="btn-new-payment">
                        ${Icons.get('plus', {size:16})} Nouveau paiement
                    </button>
                </div>
                
                <!-- Filtres -->
                <div class="card mb-md">
                    <div class="card-body">
                        <div class="filters-grid">
                            <div class="form-group">
                                <label class="form-label">Recherche</label>
                                <input type="text" id="pay-filter-search" class="form-input" placeholder="Client, reference...">
                            </div>
                            <div class="form-group">
                                <label class="form-label">Methode</label>
                                <div id="pay-filter-method"></div>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Du</label>
                                <div id="pay-filter-from"></div>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Au</label>
                                <div id="pay-filter-to"></div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Liste -->
                <div class="card">
                    <div class="card-body" id="payments-list">
                        ${Loader.page('Chargement...')}
                    </div>
                </div>
            </div>
        `;
        
        await this.loadPaymentMethods();
        this.initPaymentFilters();
        this.loadPayments();
        this.attachPaymentsEvents();
    },
    
    async loadPaymentMethods() {
        try {
            this.payments.paymentMethods = await API.settings.getPaymentMethods();
        } catch (e) {
            this.payments.paymentMethods = [
                { id: 'mobile_money', name: 'Mobile Money' },
                { id: 'cash', name: 'Especes' },
                { id: 'bank', name: 'Virement' }
            ];
        }
    },
    
    initPaymentFilters() {
        const methods = [
            { id: '', name: 'Toutes' },
            ...this.payments.paymentMethods.map(m => ({ id: m.id, name: m.name }))
        ];
        
        new SearchSelect({
            container: '#pay-filter-method',
            placeholder: 'Toutes',
            items: methods,
            onSelect: (item) => {
                this.payments.filters.method = item?.id || '';
                this.payments.currentPage = 1;
                this.loadPayments();
            }
        });
        
        new DatePicker({
            container: document.getElementById('pay-filter-from'),
            placeholder: 'Date debut',
            onChange: (d, v) => {
                this.payments.filters.dateFrom = v || '';
                this.payments.currentPage = 1;
                this.loadPayments();
            }
        });
        
        new DatePicker({
            container: document.getElementById('pay-filter-to'),
            placeholder: 'Date fin',
            onChange: (d, v) => {
                this.payments.filters.dateTo = v || '';
                this.payments.currentPage = 1;
                this.loadPayments();
            }
        });
    },
    
    async loadPayments() {
        const container = document.getElementById('payments-list');
        container.innerHTML = Loader.page('Chargement...');
        
        try {
            // Construire les params en excluant les valeurs vides
            const params = {
                page: this.payments.currentPage,
                per_page: this.payments.pageSize
            };
            
            if (this.payments.filters.method) params.method = this.payments.filters.method;
            if (this.payments.filters.search) params.search = this.payments.filters.search;
            if (this.payments.filters.dateFrom) params.date_from = this.payments.filters.dateFrom;
            if (this.payments.filters.dateTo) params.date_to = this.payments.filters.dateTo;
            
            const data = await API.payments.getAll(params);
            
            const payments = data.payments || [];
            this.payments.allPayments = payments;
            
            // Stats
            const stats = data.stats || {};
            document.getElementById('pay-stat-today').textContent = this.formatMoney(stats.today || 0);
            document.getElementById('pay-stat-week').textContent = this.formatMoney(stats.week || 0);
            document.getElementById('pay-stat-month').textContent = this.formatMoney(stats.month || 0);
            document.getElementById('pay-stat-pending').textContent = this.formatMoney(stats.pending || 0);
            
            if (payments.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        ${Icons.get('dollar-sign', {size:48})}
                        <p>Aucun paiement trouvé</p>
                    </div>
                `;
                return;
            }
            
            this.renderPaymentsList(data.total || payments.length);
            
        } catch (error) {
            console.error('Erreur chargement paiements:', error);
            container.innerHTML = `
                <div class="error-state">
                    ${Icons.get('alert-circle', {size:48})}
                    <p>${error.message}</p>
                    <button class="btn btn-primary" onclick="Views.pickupsPayments.loadPayments()">Réessayer</button>
                </div>
            `;
        }
    },
    
    renderPaymentsList(total) {
        const container = document.getElementById('payments-list');
        const payments = this.payments.allPayments;
        
        container.innerHTML = `
            <div class="table-wrapper">
                <table class="table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Client</th>
                            <th>Montant</th>
                            <th>Methode</th>
                            <th>Reference</th>
                            <th>Statut</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${payments.map(p => {
                            const date = p.created_at ? new Date(p.created_at).toLocaleDateString('fr-FR') : '-';
                            const method = this.payments.paymentMethods.find(m => m.id === p.method);
                            return `
                            <tr>
                                <td>${date}</td>
                                <td>
                                    <span class="font-medium">${p.client_name || '-'}</span>
                                    <div class="text-sm text-muted">${p.client_phone || ''}</div>
                                </td>
                                <td class="font-medium text-success">${this.formatMoney(p.amount)}</td>
                                <td>${method?.name || p.method}</td>
                                <td><code>${p.reference || '-'}</code></td>
                                <td>
                                    <span class="status-badge ${p.status === 'completed' ? 'status-delivered' : 'status-pending'}">
                                        ${p.status === 'completed' ? 'Confirme' : 'En attente'}
                                    </span>
                                </td>
                                <td>
                                    <div class="table-actions">
                                        ${p.status === 'pending' ? `
                                            <button class="btn btn-sm btn-ghost" onclick="Views.pickupsPayments.confirmPayment('${p.id}', this)" title="Confirmer">
                                                ${Icons.get('check', {size:14})}
                                            </button>
                                        ` : ''}
                                        <button class="btn btn-sm btn-ghost" onclick="Views.pickupsPayments.printReceipt('${p.id}')" title="Recu">
                                            ${Icons.get('printer', {size:14})}
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        `}).join('')}
                    </tbody>
                </table>
            </div>
            <div class="table-footer">
                <span class="text-sm">Total: ${this.formatMoney(payments.reduce((s, p) => s + (p.amount || 0), 0))}</span>
                <div id="payments-pagination"></div>
            </div>
        `;
        
        new Pagination({
            container: '#payments-pagination',
            totalItems: total,
            pageSize: this.payments.pageSize,
            currentPage: this.payments.currentPage,
            onChange: (page) => {
                this.payments.currentPage = page;
                this.loadPayments();
            }
        });
    },
    
    attachPaymentsEvents() {
        let timeout;
        document.getElementById('pay-filter-search')?.addEventListener('input', (e) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                this.payments.filters.search = e.target.value;
                this.payments.currentPage = 1;
                this.loadPayments();
            }, 300);
        });
        
        document.getElementById('btn-new-payment')?.addEventListener('click', () => this.showPaymentForm());
    },
    
    async showPaymentForm() {
        Modal.open({
            title: 'Nouveau paiement',
            content: `
                <div class="form-group">
                    <label class="form-label">Payeur *</label>
                    <div class="payer-toggle mb-sm">
                        <label class="radio-label">
                            <input type="radio" name="payer-type" value="client" checked>
                            <span>Client existant</span>
                        </label>
                        <label class="radio-label">
                            <input type="radio" name="payer-type" value="other">
                            <span>Autre personne</span>
                        </label>
                    </div>
                    <div id="payment-client-select"></div>
                    <div id="payment-payer-fields" style="display:none;">
                        <input type="text" id="payment-payer-name" class="form-input" placeholder="Nom du payeur *">
                        <input type="tel" id="payment-payer-phone" class="form-input mt-sm" placeholder="Telephone (optionnel)">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Montant (XAF) *</label>
                        <input type="number" id="payment-amount" class="form-input" placeholder="0">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Methode *</label>
                        <div id="payment-method-select"></div>
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">Reference</label>
                    <input type="text" id="payment-reference" class="form-input" placeholder="N° transaction">
                </div>
                <div class="form-group">
                    <label class="form-label">Notes</label>
                    <textarea id="payment-notes" class="form-input" rows="2"></textarea>
                </div>
                <div class="form-group">
                    <label class="form-label">Imprimer reçu</label>
                    <div class="print-options">
                        <label class="checkbox-label">
                            <input type="checkbox" id="payment-print-receipt" checked>
                            <span>Générer un reçu</span>
                        </label>
                    </div>
                </div>
            `,
            footer: `
                <button class="btn btn-secondary" onclick="Modal.close()">Annuler</button>
                <button class="btn btn-primary" id="btn-save-payment">Enregistrer</button>
            `
        });
        
        // Toggle entre client existant et autre payeur
        document.querySelectorAll('input[name="payer-type"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const isClient = e.target.value === 'client';
                document.getElementById('payment-client-select').style.display = isClient ? 'block' : 'none';
                document.getElementById('payment-payer-fields').style.display = isClient ? 'none' : 'block';
            });
        });
        
        // Load clients
        try {
            const clientsData = await API.clients.getAll({ per_page: 100 });
            const clients = clientsData.clients || [];
            
            this._paymentClientSelect = new SearchSelect({
                container: '#payment-client-select',
                placeholder: 'Selectionner un client',
                items: clients.map(c => ({
                    id: c.id,
                    name: `${c.full_name || c.first_name} (${c.phone || ''})`
                }))
            });
        } catch (e) {
            document.getElementById('payment-client-select').innerHTML = '<p class="text-error">Erreur</p>';
        }
        
        this._paymentMethodSelect = new SearchSelect({
            container: '#payment-method-select',
            placeholder: 'Methode',
            items: this.payments.paymentMethods.map(m => ({ id: m.id, name: m.name }))
        });
        
        document.getElementById('btn-save-payment')?.addEventListener('click', (e) => this.savePayment(e.currentTarget));
    },
    
    async savePayment(btn = null) {
        const payerType = document.querySelector('input[name="payer-type"]:checked')?.value || 'client';
        const clientId = payerType === 'client' ? this._paymentClientSelect?.getValue() : null;
        const payerName = payerType === 'other' ? document.getElementById('payment-payer-name')?.value.trim() : null;
        const payerPhone = payerType === 'other' ? document.getElementById('payment-payer-phone')?.value.trim() : null;
        const amount = parseFloat(document.getElementById('payment-amount')?.value);
        const method = this._paymentMethodSelect?.getValue();
        const reference = document.getElementById('payment-reference')?.value;
        const notes = document.getElementById('payment-notes')?.value;
        const printReceipt = document.getElementById('payment-print-receipt')?.checked;
        
        if (payerType === 'client' && !clientId) { Toast.error('Selectionnez un client'); return; }
        if (payerType === 'other' && !payerName) { Toast.error('Entrez le nom du payeur'); return; }
        if (!amount || amount <= 0) { Toast.error('Montant invalide'); return; }
        if (!method) { Toast.error('Selectionnez une methode'); return; }
        
        try {
            if (!btn) btn = document.getElementById('btn-save-payment');
            Loader.button(btn, true, { text: 'Enregistrement...' });
            const paymentData = {
                amount,
                method,
                reference: reference || undefined,
                notes: notes || undefined
            };
            
            if (clientId) {
                paymentData.client_id = clientId;
            } else {
                paymentData.payer_name = payerName;
                paymentData.payer_phone = payerPhone || undefined;
            }
            
            const result = await API.payments.create(paymentData);
            
            Toast.success('Paiement enregistre');
            Modal.close();
            
            // Imprimer le reçu si demandé
            if (printReceipt && result.payment) {
                this.printReceipt(result.payment.id, result.payment);
            }
            
            this.loadPayments();
        } catch (error) {
            Toast.error(error.message);
        } finally {
            Loader.button(btn, false);
        }
    },
    
    async confirmPayment(paymentId, btn = null) {
        const confirmed = await Modal.confirm({
            title: 'Confirmer le paiement',
            message: 'Confirmer que ce paiement a bien ete recu ?'
        });
        
        if (confirmed) {
            try {
                Loader.button(btn, true, { text: '' });
                await API.payments.confirm(paymentId);
                Toast.success('Paiement confirme');
                this.loadPayments();
            } catch (error) {
                Toast.error(error.message);
            } finally {
                Loader.button(btn, false);
            }
        }
    },
    
    printReceipt(paymentId, paymentData = null) {
        // Utiliser InvoiceService pour imprimer le reçu
        if (typeof InvoiceService !== 'undefined') {
            const payment = paymentData || this.payments.allPayments.find(p => p.id === paymentId);
            if (payment) {
                InvoiceService.print({
                    type: 'payment',
                    id: paymentId,
                    data: payment
                });
            } else {
                // Charger les données du paiement si non disponibles
                API.payments.get(paymentId).then(data => {
                    InvoiceService.print({
                        type: 'payment',
                        id: paymentId,
                        data: data.payment
                    });
                }).catch(err => {
                    Toast.error('Erreur lors du chargement du reçu');
                    console.error(err);
                });
            }
        } else {
            Toast.error('Service d\'impression non disponible');
        }
    },
    
    // ==================== UTILS ====================
    
    formatMoney(amount) {
        if (!amount) return '0 XAF';
        return new Intl.NumberFormat('fr-FR').format(amount) + ' XAF';
    }
};
