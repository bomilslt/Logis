/**
 * Vue Invoices - Facturation manuelle
 * Gestion des factures clients via l'API
 */

Views.invoices = {
    invoices: [],
    clients: [],
    
    async render() {
        const main = document.getElementById('main-content');
        
        main.innerHTML = `
            <div class="invoices-page">
                <div class="page-header">
                    <h1 class="page-title">${I18n.t('invoices.title')}</h1>
                    <button class="btn btn-primary" id="btn-new-invoice">
                        ${Icons.get('plus', {size:16})} ${I18n.t('invoices.new_invoice')}
                    </button>
                </div>
                
                <div class="card">
                    <div class="card-body" id="invoices-table">${Loader.page(I18n.t('loading'))}</div>
                </div>
            </div>
        `;
        
        document.getElementById('btn-new-invoice')?.addEventListener('click', () => this.showForm());
        
        const cached = ViewCache.get('invoices:list');
        if (cached) {
            this.invoices = cached.invoices || [];
            this.renderTable();
        }
        
        await this.loadData(!!cached);
    },
    
    async loadData(silent = false) {
        try {
            const data = await API.invoices.getAll();
            if (!silent || ViewCache.hasChanged('invoices:list', data)) {
                ViewCache.set('invoices:list', data);
                this.invoices = data.invoices || [];
                this.renderTable();
            }
        } catch (error) {
            console.error('Load invoices error:', error);
            if (!ViewCache.get('invoices:list')) {
                document.getElementById('invoices-table').innerHTML = `
                    <div class="empty-state">
                        ${Icons.get('alert-circle', {size:32})}
                        <p>${I18n.t('invoices.load_error').replace('{msg}', error.message)}</p>
                        <button class="btn btn-outline" onclick="Views.invoices.loadData()">${I18n.t('invoices.retry')}</button>
                    </div>
                `;
            }
        }
    },
    
    renderTable() {
        new DataTable({
            container: '#invoices-table',
            data: this.invoices,
            emptyMessage: I18n.t('invoices.no_invoices'),
            columns: [
                { key: 'invoice_number', label: I18n.t('invoices.invoice_number') },
                { key: 'client', label: I18n.t('invoices.client'), render: (v, row) => row.client?.full_name || row.client_name || 'N/A' },
                { key: 'description', label: I18n.t('invoices.description') },
                { key: 'amount', label: I18n.t('invoices.amount'), render: (v, row) => new Intl.NumberFormat(I18n.locale === 'fr' ? 'fr-FR' : 'en-US').format(v) + ' ' + (row.currency || 'XAF') },
                { key: 'issue_date', label: I18n.t('invoices.date'), render: (v) => v ? new Date(v).toLocaleDateString(I18n.locale === 'fr' ? 'fr-FR' : 'en-US') : '' },
                { key: 'status', label: I18n.t('invoices.status'), render: (v) => {
                    const labels = { draft: I18n.t('invoices.status_draft'), sent: I18n.t('invoices.status_sent'), paid: I18n.t('invoices.status_paid'), cancelled: I18n.t('invoices.status_cancelled') };
                    const classes = { draft: 'status-pending', sent: 'status-in-transit', paid: 'status-delivered', cancelled: 'status-customs' };
                    return `<span class="status-badge ${classes[v] || 'status-pending'}">${labels[v] || v}</span>`;
                }},
                { key: 'id', label: I18n.t('invoices.actions'), render: (v, row) => `
                    <div class="table-actions">
                        ${row.status === 'draft' ? `
                            <button class="btn btn-sm btn-ghost" onclick="Views.invoices.sendInvoice('${v}', this)" title="${I18n.t('invoices.send_title')}">
                                ${Icons.get('send', {size:14})}
                            </button>
                        ` : ''}
                        ${row.status !== 'paid' && row.status !== 'cancelled' ? `
                            <button class="btn btn-sm btn-ghost" onclick="Views.invoices.markPaid('${v}', this)" title="${I18n.t('invoices.mark_paid_title')}">
                                ${Icons.get('check', {size:14})}
                            </button>
                        ` : ''}
                        <button class="btn btn-sm btn-ghost" onclick="Views.invoices.print('${v}')" title="${I18n.t('invoices.print_title')}">
                            ${Icons.get('printer', {size:14})}
                        </button>
                        ${row.status !== 'paid' ? `
                            <button class="btn btn-sm btn-ghost text-error" onclick="Views.invoices.cancelInvoice('${v}', this)" title="${I18n.t('invoices.cancel_title')}">
                                ${Icons.get('x', {size:14})}
                            </button>
                        ` : ''}
                    </div>
                `}
            ]
        });
    },
    
    async showForm(invoice = null) {
        // Charger les clients si pas encore fait
        if (this.clients.length === 0) {
            try {
                const data = await API.clients.getAll({ per_page: 1000 });
                this.clients = data.clients || [];
            } catch (e) {
                console.error('Load clients error:', e);
            }
        }
        
        const isEdit = !!invoice;
        
        Modal.open({
            title: isEdit ? I18n.t('invoices.edit_invoice') : I18n.t('invoices.new_invoice'),
            content: `
                <div class="form-group">
                    <label class="form-label">${I18n.t('invoices.client')} *</label>
                    <div id="invoice-client"></div>
                </div>
                <div class="form-group">
                    <label class="form-label">${I18n.t('invoices.description')} *</label>
                    <input type="text" id="invoice-desc" class="form-input" placeholder="${I18n.t('invoices.desc_placeholder')}" value="${invoice?.description || ''}">
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">${I18n.t('invoices.amount')} *</label>
                        <input type="number" id="invoice-amount" class="form-input" placeholder="0" value="${invoice?.amount || ''}" min="0" step="0.01">
                    </div>
                    <div class="form-group">
                        <label class="form-label">${I18n.t('invoices.currency')}</label>
                        <div id="invoice-currency-container"></div>
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">${I18n.t('invoices.due_date')}</label>
                    <div id="invoice-due-date-container"></div>
                </div>
                <div class="form-group">
                    <label class="form-label">${I18n.t('invoices.notes')}</label>
                    <textarea id="invoice-notes" class="form-input" rows="2">${invoice?.notes || ''}</textarea>
                </div>
            `,
            footer: `
                <button class="btn btn-secondary" onclick="Modal.close()">${I18n.t('cancel')}</button>
                <button class="btn btn-primary" id="btn-save-invoice">${isEdit ? I18n.t('invoices.save') : I18n.t('invoices.create_invoice')}</button>
            `
        });
        
        // Init client select
        const clientItems = this.clients.map(c => ({ id: c.id, name: c.full_name || `${c.first_name} ${c.last_name}` }));
        this.clientSelect = new SearchSelect({
            container: '#invoice-client',
            placeholder: I18n.t('invoices.select_client'),
            items: clientItems,
            onSelect: () => {}
        });
        if (invoice?.client_id) this.clientSelect.setValue(invoice.client_id);
        
        // Init currency select
        this.currencySelect = new SearchSelect({
            container: '#invoice-currency-container',
            placeholder: I18n.t('invoices.currency'),
            items: CONFIG.CURRENCIES.map(c => ({ id: c, name: c })),
            onSelect: () => {}
        });
        this.currencySelect.setValue(invoice?.currency || 'XAF');
        
        // Init due date picker
        this.dueDatePicker = new DatePicker({
            container: document.getElementById('invoice-due-date-container'),
            placeholder: I18n.t('invoices.due_date'),
            value: invoice?.due_date || null,
            onChange: () => {}
        });
        
        document.getElementById('btn-save-invoice')?.addEventListener('click', (e) => this.saveInvoice(invoice?.id, e.currentTarget));
    },
    
    async saveInvoice(invoiceId = null, btn = null) {
        const clientId = this.clientSelect?.getValue();
        const description = document.getElementById('invoice-desc').value.trim();
        const amount = parseFloat(document.getElementById('invoice-amount').value) || 0;
        const currency = this.currencySelect?.getValue() || 'XAF';
        const dueDate = this.dueDatePicker?.getValue() || null;
        const notes = document.getElementById('invoice-notes').value.trim();
        
        if (!clientId) {
            Toast.error(I18n.t('invoices.select_client_error'));
            return;
        }
        if (!description) {
            Toast.error(I18n.t('invoices.enter_desc'));
            return;
        }
        if (amount <= 0) {
            Toast.error(I18n.t('invoices.enter_valid_amount'));
            return;
        }
        
        try {
            if (!btn) btn = document.getElementById('btn-save-invoice');
            Loader.button(btn, true, { text: invoiceId ? I18n.t('invoices.saving') : I18n.t('invoices.creating') });
            if (invoiceId) {
                await API.invoices.update(invoiceId, { description, amount, currency, due_date: dueDate, notes });
                Toast.success(I18n.t('invoices.invoice_updated'));
            } else {
                await API.invoices.create({ client_id: clientId, description, amount, currency, due_date: dueDate, notes });
                Toast.success(I18n.t('invoices.invoice_created'));
            }
            Modal.close();
            await this.loadData();
        } catch (error) {
            console.error('Save invoice error:', error);
            Toast.error(`Erreur: ${error.message}`);
        } finally {
            Loader.button(btn, false);
        }
    },
    
    async sendInvoice(id, btn = null) {
        if (await Modal.confirm({ title: I18n.t('invoices.send_invoice'), message: I18n.t('invoices.send_invoice_msg') })) {
            try {
                Loader.button(btn, true, { text: '' });
                await API.invoices.send(id);
                Toast.success(I18n.t('invoices.invoice_sent'));
                await this.loadData();
            } catch (error) {
                Toast.error(`Erreur: ${error.message}`);
            } finally {
                Loader.button(btn, false);
            }
        }
    },
    
    async markPaid(id, btn = null) {
        if (await Modal.confirm({ title: I18n.t('invoices.mark_paid'), message: I18n.t('invoices.mark_paid_msg') })) {
            try {
                Loader.button(btn, true, { text: '' });
                await API.invoices.markPaid(id);
                Toast.success(I18n.t('invoices.invoice_paid'));
                await this.loadData();
            } catch (error) {
                Toast.error(`Erreur: ${error.message}`);
            } finally {
                Loader.button(btn, false);
            }
        }
    },
    
    async cancelInvoice(id, btn = null) {
        if (await Modal.confirm({ title: I18n.t('invoices.cancel_invoice'), message: I18n.t('invoices.cancel_invoice_msg'), danger: true })) {
            try {
                Loader.button(btn, true, { text: '' });
                await API.invoices.cancel(id);
                Toast.success(I18n.t('invoices.invoice_cancelled'));
                await this.loadData();
            } catch (error) {
                Toast.error(`Erreur: ${error.message}`);
            } finally {
                Loader.button(btn, false);
            }
        }
    },
    
    print(id) {
        const invoice = this.invoices.find(i => i.id === id);
        if (!invoice) return;
        
        // Utiliser le service de facture centralisé
        InvoiceService.generateInvoice({
            invoice_number: invoice.invoice_number,
            date: invoice.issue_date ? new Date(invoice.issue_date).toLocaleDateString(I18n.locale === 'fr' ? 'fr-FR' : 'en-US') : new Date().toLocaleDateString(I18n.locale === 'fr' ? 'fr-FR' : 'en-US'),
            due_date: invoice.due_date ? new Date(invoice.due_date).toLocaleDateString(I18n.locale === 'fr' ? 'fr-FR' : 'en-US') : null,
            client: {
                name: invoice.client?.full_name || invoice.client_name || 'Client',
                phone: invoice.client?.phone || '',
                email: invoice.client?.email || '',
                address: invoice.client?.address || ''
            },
            items: [{
                description: invoice.description,
                quantity: 1,
                unit_price: invoice.amount,
                total: invoice.amount
            }],
            subtotal: invoice.amount,
            tax: 0,
            total: invoice.amount,
            paid: invoice.paid_amount || 0,
            balance: invoice.amount - (invoice.paid_amount || 0),
            notes: invoice.notes,
            currency: invoice.currency || 'XAF'
        });
    }
};
