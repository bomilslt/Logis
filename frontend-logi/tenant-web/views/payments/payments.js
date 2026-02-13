/**
 * Vue Payments - Gestion des paiements
 */

Views.payments = {
    filters: { search: '', method: '', dateFrom: '', dateTo: '', status: '' },
    allPayments: [],
    paymentMethods: [], // Chargé depuis l'API
    currentPage: 1,
    pageSize: 10,
    
    async render() {
        const main = document.getElementById('main-content');
        
        main.innerHTML = `
            <div class="payments-page">
                <div class="page-header">
                    <h1 class="page-title">${I18n.t('payments.title')}</h1>
                    <div class="header-actions">
                        <button class="btn btn-outline" id="btn-export" title="${I18n.t('packages.export_list')}">
                            ${Icons.get('download', {size:16})} ${I18n.t('export')}
                        </button>
                        <button class="btn btn-primary" id="btn-new-payment" title="${I18n.t('payments.new_payment')}">
                            ${Icons.get('plus', {size:16})} ${I18n.t('payments.new_payment')}
                        </button>
                    </div>
                </div>
                
                <!-- Stats -->
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-card-header">
                            <span class="stat-card-title">${I18n.t('payments.today_collections')}</span>
                            <div class="stat-card-icon success">${Icons.get('dollar-sign')}</div>
                        </div>
                        <div class="stat-card-value" id="stat-today">-</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-card-header">
                            <span class="stat-card-title">${I18n.t('payments.this_week')}</span>
                            <div class="stat-card-icon primary">${Icons.get('trending-up')}</div>
                        </div>
                        <div class="stat-card-value" id="stat-week">-</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-card-header">
                            <span class="stat-card-title">${I18n.t('payments.this_month')}</span>
                            <div class="stat-card-icon info">${Icons.get('calendar')}</div>
                        </div>
                        <div class="stat-card-value" id="stat-month">-</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-card-header">
                            <span class="stat-card-title">${I18n.t('payments.pending')}</span>
                            <div class="stat-card-icon warning">${Icons.get('clock')}</div>
                        </div>
                        <div class="stat-card-value" id="stat-pending">-</div>
                    </div>
                </div>
                
                <!-- Filtres -->
                <div class="card mb-md">
                    <div class="card-body">
                        <div class="filters-grid">
                            <div class="form-group">
                                <label class="form-label">${I18n.t('search')}</label>
                                <input type="text" id="filter-search" class="form-input" 
                                    placeholder="${I18n.t('payments.search_placeholder')}" value="${this.filters.search}">
                            </div>
                            <div class="form-group">
                                <label class="form-label">${I18n.t('payments.method')}</label>
                                <div id="filter-method-container"></div>
                            </div>
                            <div class="form-group">
                                <label class="form-label">${I18n.t('payments.date_from')}</label>
                                <div id="filter-from-container"></div>
                            </div>
                            <div class="form-group">
                                <label class="form-label">${I18n.t('payments.date_to')}</label>
                                <div id="filter-to-container"></div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Liste -->
                <div class="card">
                    <div class="card-body" id="payments-list">
                        ${Loader.page(I18n.t('loading'))}
                    </div>
                </div>
            </div>
        `;
        
        // Charger les moyens de paiement depuis l'API
        await this.loadPaymentMethods();
        
        this.initFilters();
        
        const cacheKey = 'payments:list:' + this.currentPage;
        const cached = ViewCache.get(cacheKey);
        if (cached) {
            this._applyPaymentsData(cached);
        }
        
        this.loadPayments(!!cached);
        this.attachEvents();
    },
    
    _applyPaymentsData(data) {
        const payments = data.payments || [];
        this.allPayments = payments;
        const stats = data.stats || {};
        document.getElementById('stat-today').textContent = this.formatMoney(stats.today || 0);
        document.getElementById('stat-week').textContent = this.formatMoney(stats.week || 0);
        document.getElementById('stat-month').textContent = this.formatMoney(stats.month || 0);
        document.getElementById('stat-pending').textContent = this.formatMoney(stats.pending || 0);
        if (payments.length === 0) {
            document.getElementById('payments-list').innerHTML = `<div class="empty-state">${Icons.get('dollar-sign', {size:48})}<p class="empty-state-title">${I18n.t('payments.no_payments')}</p></div>`;
            return;
        }
        this.renderList(data.total || payments.length);
    },
    
    async loadPaymentMethods() {
        try {
            this.paymentMethods = await API.settings.getPaymentMethods();
        } catch (error) {
            console.error('Erreur chargement moyens de paiement:', error);
            // Fallback par défaut
            this.paymentMethods = [
                { id: 'mobile_money', name: 'Mobile Money', icon: 'smartphone' },
                { id: 'cash', name: 'Especes', icon: 'dollar-sign' },
                { id: 'bank', name: 'Virement bancaire', icon: 'building' },
                { id: 'card', name: 'Carte bancaire', icon: 'credit-card' }
            ];
        }
    },
    
    getPaymentMethodName(methodId) {
        const method = this.paymentMethods.find(m => m.id === methodId);
        return method?.name || methodId;
    },
    
    getPaymentMethodIcon(methodId) {
        const method = this.paymentMethods.find(m => m.id === methodId);
        return method?.icon || 'dollar-sign';
    },
    
    initFilters() {
        // Method SearchSelect - utiliser les méthodes chargées depuis l'API
        const methodItems = [
            { id: '', name: I18n.t('payments.all_methods') },
            ...this.paymentMethods.map(m => ({ id: m.id, name: m.name }))
        ];
        
        this.methodSelect = new SearchSelect({
            container: '#filter-method-container',
            placeholder: I18n.t('all'),
            items: methodItems,
            onSelect: (item) => { this.filters.method = item?.id || ''; this.currentPage = 1; this.loadPayments(); }
        });
        
        // Date pickers
        this.dateFromPicker = new DatePicker({
            container: document.getElementById('filter-from-container'),
            placeholder: I18n.t('payments.date_from'),
            value: this.filters.dateFrom,
            onChange: (date, value) => { this.filters.dateFrom = value || ''; this.currentPage = 1; this.loadPayments(); }
        });
        
        this.dateToPicker = new DatePicker({
            container: document.getElementById('filter-to-container'),
            placeholder: I18n.t('payments.date_to'),
            value: this.filters.dateTo,
            onChange: (date, value) => { this.filters.dateTo = value || ''; this.currentPage = 1; this.loadPayments(); }
        });
    },

    async loadPayments(silent = false) {
        const container = document.getElementById('payments-list');
        if (!silent) container.innerHTML = Loader.page(I18n.t('loading'));
        
        const cacheKey = 'payments:list:' + this.currentPage;
        
        try {
            const data = await API.payments.getAll({
                page: this.currentPage,
                per_page: this.pageSize,
                method: this.filters.method || undefined,
                search: this.filters.search || undefined,
                date_from: this.filters.dateFrom || undefined,
                date_to: this.filters.dateTo || undefined
            });
            
            if (!silent || ViewCache.hasChanged(cacheKey, data)) {
                ViewCache.set(cacheKey, data);
                this._applyPaymentsData(data);
            }
            
        } catch (error) {
            console.error('Load payments error:', error);
            if (!ViewCache.get(cacheKey)) {
                container.innerHTML = `
                    <div class="error-state">
                        ${Icons.get('alert-circle', {size:48})}
                        <h3>${I18n.t('error_loading')}</h3>
                        <p>${error.message}</p>
                        <button class="btn btn-primary" onclick="Views.payments.loadPayments()">${I18n.t('retry')}</button>
                    </div>
                `;
            }
        }
    },
    
    renderList(total) {
        const container = document.getElementById('payments-list');
        const payments = this.allPayments;
        
        if (payments.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    ${Icons.get('dollar-sign', {size:48})}
                    <p class="empty-state-title">${I18n.t('payments.no_payments')}</p>
                </div>
            `;
            return;
        }
        
        // Pagination
        const paginated = Pagination.paginate(payments, this.currentPage, this.pageSize);
        
        container.innerHTML = `
            <div class="table-wrapper">
                <table class="table">
                    <thead>
                        <tr>
                            <th>${I18n.t('payments.date')}</th>
                            <th>${I18n.t('clients.name')}</th>
                            <th>${I18n.t('payments.amount')}</th>
                            <th>${I18n.t('payments.method')}</th>
                            <th>${I18n.t('payments.reference')}</th>
                            <th>${I18n.t('departures.packages')}</th>
                            <th>${I18n.t('packages.status')}</th>
                            <th>${I18n.t('actions')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${paginated.map(p => {
                            // Adapter les noms de champs de l'API
                            const date = p.created_at ? new Date(p.created_at).toLocaleDateString(I18n.locale === 'fr' ? 'fr-FR' : 'en-US') : p.date || '-';
                            const clientName = p.client?.name || p.client_name || '-';
                            const clientPhone = p.client?.phone || p.client_phone || '';
                            const clientId = p.client?.id || p.client_id || '';
                            const packages = p.packages || p.package_ids || [];
                            const packagesDisplay = Array.isArray(packages) ? packages : [packages];
                            
                            return `
                            <tr>
                                <td>${date}</td>
                                <td>
                                    <a href="#/clients/${clientId}" class="font-medium">${clientName}</a>
                                    <div class="text-sm text-muted">${clientPhone}</div>
                                </td>
                                <td class="font-medium text-success">${this.formatMoney(p.amount)}</td>
                                <td>
                                    <span class="method-badge method-${p.method}">
                                        ${Icons.get(this.getPaymentMethodIcon(p.method), {size:14})}
                                        ${this.getPaymentMethodName(p.method)}
                                    </span>
                                </td>
                                <td><code>${p.reference || '-'}</code></td>
                                <td>
                                    ${packagesDisplay.length > 0 ? packagesDisplay.map(pkg => `<a href="#/packages?search=${pkg}" class="pkg-link">${pkg}</a>`).join(', ') : '-'}
                                </td>
                                <td>
                                    <span class="status-badge ${p.status === 'completed' ? 'status-delivered' : 'status-pending'}">
                                        ${p.status === 'completed' ? I18n.t('payments.confirmed') : I18n.t('payments.pending')}
                                    </span>
                                </td>
                                <td>
                                    <div class="table-actions">
                                        ${p.status === 'pending' ? `
                                            <button class="btn btn-sm btn-ghost" onclick="Views.payments.confirmPayment('${p.id}', this)" title="${I18n.t('payments.confirm_btn')}">
                                                ${Icons.get('check', {size:14})}
                                            </button>
                                        ` : ''}
                                        <button class="btn btn-sm btn-ghost" onclick="Views.payments.printReceipt('${p.id}')" title="${I18n.t('payments.receipt')}">
                                            ${Icons.get('printer', {size:14})}
                                        </button>
                                        <button class="btn btn-sm btn-ghost" onclick="Views.payments.viewDetails('${p.id}')" title="${I18n.t('payments.details')}">
                                            ${Icons.get('eye', {size:14})}
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        `}).join('')}
                    </tbody>
                </table>
            </div>
            <div class="table-footer">
                <span class="text-sm font-medium">Total: ${this.formatMoney(payments.reduce((s, p) => s + (p.amount || 0), 0))}</span>
                <div id="payments-pagination"></div>
            </div>
        `;
        
        // Init pagination
        new Pagination({
            container: '#payments-pagination',
            totalItems: total || payments.length,
            pageSize: this.pageSize,
            currentPage: this.currentPage,
            onChange: (page) => {
                this.currentPage = page;
                this.loadPayments();
            }
        });
    },

    attachEvents() {
        let searchTimeout;
        document.getElementById('filter-search')?.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => { this.filters.search = e.target.value; this.currentPage = 1; this.loadPayments(); }, 300);
        });
        
        document.getElementById('btn-new-payment')?.addEventListener('click', () => this.showPaymentForm());
        document.getElementById('btn-export')?.addEventListener('click', () => this.exportPayments());
    },
    
    async showPaymentForm(preselectedClient = null, preselectedPackages = []) {
        Modal.open({
            title: I18n.t('payments.register_payment'),
            content: `
                <div class="form-group">
                    <label class="form-label">${I18n.t('payments.payer')} *</label>
                    <div class="payer-input-group">
                        <div class="payer-toggle mb-sm">
                            <label class="radio-label">
                                <input type="radio" name="payer-type" value="client" checked>
                                <span>${I18n.t('payments.existing_client')}</span>
                            </label>
                            <label class="radio-label">
                                <input type="radio" name="payer-type" value="other">
                                <span>${I18n.t('payments.other_person')}</span>
                            </label>
                        </div>
                        <div id="payment-client-container"></div>
                        <div id="payment-payer-name-container" style="display:none;">
                            <input type="text" id="payment-payer-name" class="form-input" placeholder="${I18n.t('payments.payer_name')}">
                            <input type="tel" id="payment-payer-phone" class="form-input mt-sm" placeholder="${I18n.t('payments.phone_optional')}">
                        </div>
                    </div>
                </div>
                
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">${I18n.t('payments.amount_xaf')} *</label>
                        <input type="number" id="payment-amount" class="form-input" placeholder="0">
                    </div>
                    <div class="form-group">
                        <label class="form-label">${I18n.t('payments.method')} *</label>
                        <div id="payment-method-container"></div>
                    </div>
                </div>
                
                <div class="form-group">
                    <label class="form-label">${I18n.t('payments.reference')}</label>
                    <input type="text" id="payment-reference" class="form-input" placeholder="Ex: OM-123456, VIR-789...">
                </div>
                
                <div class="form-group">
                    <label class="form-label">${I18n.t('payments.assign_packages')}</label>
                    <div id="payment-packages-container">
                        <p class="text-sm text-muted">${I18n.t('payments.select_client_first')}</p>
                    </div>
                </div>
                
                <div class="form-group">
                    <label class="form-label">${I18n.t('payments.notes')}</label>
                    <textarea id="payment-notes" class="form-input" rows="2" placeholder="${I18n.t('payments.notes_placeholder')}"></textarea>
                </div>
                
                <label class="toggle-label">
                    <input type="checkbox" id="payment-receipt" checked>
                    <span>${I18n.t('payments.generate_receipt')}</span>
                </label>
            `,
            footer: `
                <button class="btn btn-secondary" onclick="Modal.close()">${I18n.t('cancel')}</button>
                <button class="btn btn-primary" id="btn-save-payment">${I18n.t('save')}</button>
            `
        });
        
        // Toggle entre client existant et autre payeur
        const payerTypeRadios = document.querySelectorAll('input[name="payer-type"]');
        const clientContainer = document.getElementById('payment-client-container');
        const payerNameContainer = document.getElementById('payment-payer-name-container');
        
        payerTypeRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.value === 'client') {
                    clientContainer.style.display = 'block';
                    payerNameContainer.style.display = 'none';
                } else {
                    clientContainer.style.display = 'none';
                    payerNameContainer.style.display = 'block';
                    // Vider les colis sélectionnés car pas de client
                    document.getElementById('payment-packages-container').innerHTML = 
                        `<p class="text-sm text-muted">${I18n.t('payments.not_available_external')}</p>`;
                }
            });
        });
        
        // Charger les clients depuis l'API
        try {
            const clientsData = await API.clients.getAll({ per_page: 100 });
            const clients = clientsData.clients || [];
            
            this.paymentClientSelect = new SearchSelect({
                container: '#payment-client-container',
                placeholder: I18n.t('payments.select_client'),
                items: clients.map(c => {
                    const name = c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim();
                    const balance = c.balance || 0;
                    return { 
                        id: c.id, 
                        name: `${name} (${c.phone || ''})${balance > 0 ? ' - Solde: ' + this.formatMoney(balance) : ''}`
                    };
                }),
                onSelect: (item) => {
                    if (item) this.loadClientPackages(item.id);
                }
            });
            
            if (preselectedClient) {
                this.paymentClientSelect.setValue(preselectedClient);
                this.loadClientPackages(preselectedClient);
            }
        } catch (error) {
            console.error('Load clients error:', error);
            document.getElementById('payment-client-container').innerHTML = `
                <p class="text-error">${I18n.t('payments.error_loading_clients')}</p>
            `;
        }
        
        // Init method SearchSelect - utiliser les méthodes chargées depuis l'API
        this.paymentMethodSelect = new SearchSelect({
            container: '#payment-method-container',
            placeholder: I18n.t('payments.payment_method'),
            items: this.paymentMethods.map(m => ({ id: m.id, name: m.name })),
            onSelect: (item) => {
                const refInput = document.getElementById('payment-reference');
                if (refInput && !refInput.value) {
                    // Générer un préfixe basé sur l'ID de la méthode
                    const prefix = item?.id ? item.id.substring(0, 3).toUpperCase() + '-' : '';
                    refInput.placeholder = `Ex: ${prefix}${new Date().getFullYear()}-XXXXX`;
                }
            }
        });
        
        // Save handler
        document.getElementById('btn-save-payment')?.addEventListener('click', (e) => this.savePayment(e.currentTarget));
    },
    
    async loadClientPackages(clientId) {
        const container = document.getElementById('payment-packages-container');
        container.innerHTML = Loader.inline('sm');
        
        try {
            // Charger les colis non payes du client via API
            const data = await API.packages.getAll({ 
                client_id: clientId, 
                payment_status: 'unpaid,partial',
                per_page: 50 
            });
            
            const packages = (data.packages || []).filter(p => (p.remaining_amount || (p.amount - (p.paid_amount || 0))) > 0);
            
            if (packages.length === 0) {
                container.innerHTML = `<p class="text-sm text-success">${I18n.t('payments.no_pending_payment')}</p>`;
                return;
            }
            
            container.innerHTML = `
                <div class="packages-checklist">
                    ${packages.map(p => {
                        const tracking = p.tracking_number || p.tracking;
                        const remaining = p.remaining_amount || (p.amount - (p.paid_amount || 0));
                        return `
                        <label class="checkbox-item">
                            <input type="checkbox" class="payment-pkg-checkbox" value="${p.id}" data-amount="${remaining}">
                            <div class="checkbox-item-content">
                                <span class="font-medium">${tracking}</span>
                                <span class="text-sm text-muted">${p.description || ''}</span>
                                <span class="text-sm text-error">${I18n.t('payments.remaining')}: ${this.formatMoney(remaining)}</span>
                            </div>
                        </label>
                    `}).join('')}
                </div>
                <button class="btn btn-sm btn-ghost mt-sm" id="btn-select-all-packages">${I18n.t('payments.select_all')}</button>
            `;
            
            // Auto-calculate amount when packages are selected
            container.querySelectorAll('.payment-pkg-checkbox').forEach(cb => {
                cb.addEventListener('change', () => this.updatePaymentAmount());
            });
            
            document.getElementById('btn-select-all-packages')?.addEventListener('click', () => {
                container.querySelectorAll('.payment-pkg-checkbox').forEach(cb => cb.checked = true);
                this.updatePaymentAmount();
            });
            
        } catch (error) {
            console.error('Load client packages error:', error);
            container.innerHTML = `<p class="text-sm text-error">Erreur de chargement</p>`;
        }
    },
    
    updatePaymentAmount() {
        const checkboxes = document.querySelectorAll('.payment-pkg-checkbox:checked');
        const total = Array.from(checkboxes).reduce((sum, cb) => sum + parseFloat(cb.dataset.amount || 0), 0);
        const amountInput = document.getElementById('payment-amount');
        if (amountInput && total > 0) {
            amountInput.value = total;
        }
    },
    
    async savePayment(btn = null) {
        const payerType = document.querySelector('input[name="payer-type"]:checked')?.value || 'client';
        const clientId = payerType === 'client' ? this.paymentClientSelect?.getValue() : null;
        const payerName = payerType === 'other' ? document.getElementById('payment-payer-name')?.value.trim() : null;
        const payerPhone = payerType === 'other' ? document.getElementById('payment-payer-phone')?.value.trim() : null;
        const amount = parseFloat(document.getElementById('payment-amount').value);
        const method = this.paymentMethodSelect?.getValue();
        const reference = document.getElementById('payment-reference').value.trim();
        const notes = document.getElementById('payment-notes').value;
        const generateReceipt = document.getElementById('payment-receipt').checked;
        
        // Get selected packages
        const selectedPackages = Array.from(document.querySelectorAll('.payment-pkg-checkbox:checked'))
            .map(cb => cb.value);
        
        // Validation
        if (payerType === 'client' && !clientId) { Toast.error(I18n.t('payments.select_client')); return; }
        if (payerType === 'other' && !payerName) { Toast.error(I18n.t('payments.enter_payer_name')); return; }
        if (!amount || amount <= 0) { Toast.error(I18n.t('payments.invalid_amount')); return; }
        if (!method) { Toast.error(I18n.t('payments.select_method')); return; }
        
        try {
            if (!btn) btn = document.getElementById('btn-save-payment');
            Loader.button(btn, true, { text: I18n.t('payments.saving') });
            const paymentData = {
                amount,
                method,
                reference: reference || undefined,
                notes: notes || undefined
            };
            
            if (clientId) {
                paymentData.client_id = clientId;
                if (selectedPackages.length > 0) {
                    paymentData.package_ids = selectedPackages;
                }
            } else {
                // Payeur externe (non client)
                paymentData.payer_name = payerName;
                paymentData.payer_phone = payerPhone || undefined;
            }
            
            const payment = await API.payments.create(paymentData);
            
            Toast.success(I18n.t('payments.payment_saved'));
            Modal.close();
            
            if (generateReceipt && payment.payment) {
                this.printReceipt(payment.payment.id, payment.payment);
            }
            
            this.loadPayments();
            
        } catch (error) {
            console.error('Save payment error:', error);
            Toast.error(`Erreur: ${error.message}`);
        } finally {
            Loader.button(btn, false);
        }
    },

    async confirmPayment(paymentId, btn = null) {
        const confirmed = await Modal.confirm({
            title: I18n.t('payments.confirm_payment'),
            message: I18n.t('payments.confirm_payment_msg')
        });
        
        if (confirmed) {
            try {
                Loader.button(btn, true, { text: '' });
                await API.payments.confirm(paymentId);
                Toast.success(I18n.t('payments.payment_confirmed'));
                this.loadPayments();
            } catch (error) {
                console.error('Confirm payment error:', error);
                Toast.error(`Erreur: ${error.message}`);
            } finally {
                Loader.button(btn, false);
            }
        }
    },
    
    viewDetails(paymentId) {
        const payment = this.allPayments.find(p => p.id === paymentId);
        if (!payment) return;
        
        const date = payment.created_at ? new Date(payment.created_at).toLocaleDateString(I18n.locale === 'fr' ? 'fr-FR' : 'en-US') : payment.date || '-';
        const packages = payment.packages || [];
        
        Modal.open({
            title: I18n.t('payments.payment_details'),
            content: `
                <div class="payment-details">
                    <div class="detail-row">
                        <span class="detail-label">${I18n.t('payments.date')}</span>
                        <span class="detail-value">${date}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">${I18n.t('clients.name')}</span>
                        <span class="detail-value">${payment.client_name || '-'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">${I18n.t('clients.phone')}</span>
                        <span class="detail-value">${payment.client_phone || '-'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">${I18n.t('payments.amount')}</span>
                        <span class="detail-value font-medium text-success">${this.formatMoney(payment.amount)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">${I18n.t('payments.method')}</span>
                        <span class="detail-value">${this.getPaymentMethodName(payment.method)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">${I18n.t('payments.reference')}</span>
                        <span class="detail-value"><code>${payment.reference || '-'}</code></span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">${I18n.t('departures.packages')}</span>
                        <span class="detail-value">${packages.length > 0 ? packages.join(', ') : '-'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">${I18n.t('packages.status')}</span>
                        <span class="detail-value">
                            <span class="status-badge ${payment.status === 'completed' ? 'status-delivered' : 'status-pending'}">
                                ${payment.status === 'completed' ? I18n.t('payments.confirmed') : I18n.t('payments.pending')}
                            </span>
                        </span>
                    </div>
                    ${payment.notes ? `
                    <div class="detail-row">
                        <span class="detail-label">${I18n.t('payments.notes')}</span>
                        <span class="detail-value">${payment.notes}</span>
                    </div>
                    ` : ''}
                </div>
            `,
            footer: `
                <button class="btn btn-secondary" onclick="Modal.close()">${I18n.t('close')}</button>
                <button class="btn btn-outline" onclick="Views.payments.printReceipt('${paymentId}'); Modal.close();">
                    ${Icons.get('printer', {size:16})} ${I18n.t('payments.print_receipt')}
                </button>
            `
        });
    },
    
    printReceipt(paymentId, paymentData = null, forceMenu = false) {
        const payment = paymentData || this.allPayments.find(p => p.id === paymentId);
        if (!payment) { Toast.error(I18n.t('payments.payment_not_found')); return; }
        
        const date = payment.created_at ? new Date(payment.created_at).toLocaleDateString(I18n.locale === 'fr' ? 'fr-FR' : 'en-US') : payment.date || '-';
        const packages = payment.packages || [];
        
        const printData = {
            receipt_number: payment.reference,
            date: date,
            client: {
                name: payment.client_name || 'Client',
                phone: payment.client_phone || ''
            },
            items: packages.map(p => ({ tracking: p, description: `Colis ${p}` })),
            amount: payment.amount,
            method: this.getPaymentMethodName(payment.method),
            reference: payment.reference,
            currency: 'XAF'
        };
        
        // Utiliser le format par défaut (ou afficher menu si forceMenu)
        InvoiceService.print({
            type: 'payment',
            id: paymentId,
            data: printData,
            showMenu: forceMenu
        });
    },
    
    exportPayments() {
        if (this.allPayments.length === 0) { 
            Toast.error(I18n.t('packages.no_data_export')); 
            return; 
        }
        
        ExportService.exportPayments(this.allPayments.map(p => ({
            reference: p.reference,
            client_name: p.client_name,
            amount: p.amount,
            method: p.method,
            packages_count: p.packages?.length || 0,
            created_at: p.created_at || p.date,
            received_by_name: p.received_by_name
        })), {
            format: 'csv',
            filename: `paiements_export_${new Date().toISOString().split('T')[0]}.csv`
        });
    },

    exportPaymentsPDF() {
        if (this.allPayments.length === 0) { 
            Toast.error(I18n.t('packages.no_data_export')); 
            return; 
        }
        
        ExportService.exportPayments(this.allPayments.map(p => ({
            reference: p.reference,
            client_name: p.client_name,
            amount: p.amount,
            method: p.method,
            packages_count: p.packages?.length || 0,
            created_at: p.created_at || p.date,
            received_by_name: p.received_by_name
        })), {
            title: I18n.t('payments.title'),
            format: 'pdf',
            filename: `paiements_export_${new Date().toISOString().split('T')[0]}.pdf`
        });
    },
    
    formatMoney(amount) {
        return new Intl.NumberFormat(I18n.locale === 'fr' ? 'fr-FR' : 'en-US').format(amount) + ' XAF';
    }
};
