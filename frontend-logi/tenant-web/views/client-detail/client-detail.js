/**
 * Vue Client Detail - Infos client, colis et historique paiements
 */

Views.clientDetail = {
    render(clientId) {
        const main = document.getElementById('main-content');
        main.innerHTML = Loader.page(I18n.t('loading'));
        
        // ============================================
        // MOCK DATA - Remplacer par: const client = await API.clients.getById(clientId);
        // ============================================
        const client = {
            id: clientId,
            first_name: 'Marie',
            last_name: 'Fotso',
            email: 'marie@example.com',
            phone: '+237 699 888 777',
            address: 'Akwa, Douala',
            is_active: true,
            created_at: '2024-01-01',
            stats: {
                total_packages: 12,
                delivered: 8,
                in_progress: 4,
                total_amount: 485000,
                total_paid: 420000,
                balance: 65000
            },
            packages: [
                { id: 'pkg-001', tracking: 'EC-2024-00001', description: 'Smartphones', status: 'in_transit', amount: 52400, paid: 52400, created_at: '2024-01-15' },
                { id: 'pkg-006', tracking: 'EC-2024-00006', description: 'Vetements', status: 'delivered', amount: 35000, paid: 35000, created_at: '2024-01-10' },
                { id: 'pkg-007', tracking: 'EC-2024-00007', description: 'Cosmetiques', status: 'pending', amount: 28000, paid: 0, created_at: '2024-01-20' }
            ],
            payments: [
                { id: 'pay-001', date: '2024-01-20', amount: 52400, method: 'Mobile Money', reference: 'OM-123456', packages: ['EC-2024-00001'] },
                { id: 'pay-002', date: '2024-01-12', amount: 35000, method: 'Especes', reference: 'CASH-789', packages: ['EC-2024-00006'] },
                { id: 'pay-003', date: '2024-01-05', amount: 50000, method: 'Virement', reference: 'VIR-456', packages: ['EC-2024-00003', 'EC-2024-00004'] }
            ]
        };
        // ============================================
        
        setTimeout(() => this.renderDetail(client), 200);
    },

    renderDetail(client) {
        const main = document.getElementById('main-content');
        const balance = client.stats.balance;
        const balanceClass = balance > 0 ? 'text-error' : 'text-success';
        
        main.innerHTML = `
            <div class="client-detail-page">
                <div class="page-header">
                    <div>
                        <button class="btn btn-ghost btn-sm" onclick="Router.navigate('/clients')">
                            ${Icons.get('arrow-left', { size: 16 })} ${I18n.t('clientDetail.back')}
                        </button>
                        <h1 class="page-title mt-md">${client.first_name} ${client.last_name}</h1>
                        <p class="text-sm text-muted">${client.phone} - ${client.email}</p>
                    </div>
                    <div class="header-actions">
                        <button class="btn btn-outline" id="btn-add-payment">
                            ${Icons.get('dollar-sign', {size:16})} ${I18n.t('clientDetail.register_payment')}
                        </button>
                        <span class="status-badge ${client.is_active ? 'status-delivered' : 'status-pending'}">
                            ${client.is_active ? I18n.t('clientDetail.active') : I18n.t('clientDetail.inactive')}
                        </span>
                    </div>
                </div>
                
                <!-- Stats -->
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-card-header">
                            <span class="stat-card-title">${I18n.t('clientDetail.total_packages')}</span>
                            <div class="stat-card-icon primary">${Icons.get('package')}</div>
                        </div>
                        <div class="stat-card-value">${client.stats.total_packages}</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-card-header">
                            <span class="stat-card-title">${I18n.t('clientDetail.delivered')}</span>
                            <div class="stat-card-icon success">${Icons.get('check-circle')}</div>
                        </div>
                        <div class="stat-card-value">${client.stats.delivered}</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-card-header">
                            <span class="stat-card-title">${I18n.t('clientDetail.total_invoiced')}</span>
                            <div class="stat-card-icon info">${Icons.get('file-text')}</div>
                        </div>
                        <div class="stat-card-value">${this.formatMoney(client.stats.total_amount)}</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-card-header">
                            <span class="stat-card-title">${I18n.t('clientDetail.balance_due')}</span>
                            <div class="stat-card-icon ${balance > 0 ? 'warning' : 'success'}">${Icons.get('dollar-sign')}</div>
                        </div>
                        <div class="stat-card-value ${balanceClass}">${this.formatMoney(balance)}</div>
                    </div>
                </div>
                
                <div class="detail-grid">
                    <!-- Colis -->
                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">${I18n.t('clientDetail.packages')} (${client.packages.length})</h3>
                            <a href="#/packages?client=${client.id}" class="btn btn-sm btn-ghost">${I18n.t('clientDetail.view_all')}</a>
                        </div>
                        <div class="card-body">
                            <table class="table">
                                <thead>
                                    <tr>
                                        <th>${I18n.t('clientDetail.tracking')}</th>
                                        <th>${I18n.t('clientDetail.description')}</th>
                                        <th>${I18n.t('clientDetail.amount')}</th>
                                        <th>${I18n.t('clientDetail.paid')}</th>
                                        <th>${I18n.t('clientDetail.status')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${client.packages.map(p => `
                                        <tr class="clickable" onclick="Router.navigate('/packages/${p.id}')">
                                            <td><strong>${p.tracking}</strong></td>
                                            <td>${p.description}</td>
                                            <td>${this.formatMoney(p.amount)}</td>
                                            <td class="${p.paid >= p.amount ? 'text-success' : 'text-error'}">${this.formatMoney(p.paid)}</td>
                                            <td><span class="status-badge status-${p.status}">${CONFIG.PACKAGE_STATUSES[p.status]?.label}</span></td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Historique paiements -->
                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">${I18n.t('clientDetail.payment_history')}</h3>
                        </div>
                        <div class="card-body">
                            ${client.payments.length > 0 ? `
                                <table class="table">
                                    <thead>
                                        <tr>
                                            <th>${I18n.t('clientDetail.date')}</th>
                                            <th>${I18n.t('clientDetail.amount')}</th>
                                            <th>${I18n.t('clientDetail.method')}</th>
                                            <th>${I18n.t('clientDetail.reference')}</th>
                                            <th>${I18n.t('clientDetail.packages_col')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${client.payments.map(p => `
                                            <tr>
                                                <td>${p.date}</td>
                                                <td class="font-medium text-success">${this.formatMoney(p.amount)}</td>
                                                <td>${p.method}</td>
                                                <td><code>${p.reference}</code></td>
                                                <td>${p.packages.join(', ')}</td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            ` : `
                                <div class="empty-state">
                                    <p class="text-muted">${I18n.t('clientDetail.no_payments')}</p>
                                </div>
                            `}
                        </div>
                    </div>
                </div>
                
                <!-- Infos client -->
                <div class="card mt-md">
                    <div class="card-header">
                        <h3 class="card-title">${I18n.t('clientDetail.information')}</h3>
                        <button class="btn btn-sm btn-ghost" id="btn-edit-client">${Icons.get('edit', {size:14})} ${I18n.t('clientDetail.edit')}</button>
                    </div>
                    <div class="card-body">
                        <div class="info-grid">
                            <div class="detail-row">
                                <span class="detail-label">${I18n.t('clientDetail.full_name')}</span>
                                <span class="detail-value">${client.first_name} ${client.last_name}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">${I18n.t('clientDetail.email')}</span>
                                <span class="detail-value">${client.email}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">${I18n.t('clientDetail.phone')}</span>
                                <span class="detail-value">${client.phone}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">${I18n.t('clientDetail.address')}</span>
                                <span class="detail-value">${client.address || '-'}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">${I18n.t('clientDetail.registered_on')}</span>
                                <span class="detail-value">${client.created_at}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        this.attachEvents(client);
    },

    attachEvents(client) {
        document.getElementById('btn-add-payment')?.addEventListener('click', () => {
            this.showPaymentForm(client);
        });
        
        document.getElementById('btn-edit-client')?.addEventListener('click', () => {
            this.showEditForm(client);
        });
    },
    
    showPaymentForm(client) {
        // Colis non payes
        const unpaidPackages = client.packages.filter(p => p.paid < p.amount);
        
        Modal.open({
            title: I18n.t('clientDetail.register_payment'),
            content: `
                <p class="text-sm text-muted mb-md">${I18n.t('clientDetail.packages')}: ${client.first_name} ${client.last_name}</p>
                
                <div class="form-group">
                    <label class="form-label">${I18n.t('clientDetail.amount_xaf')}</label>
                    <input type="number" id="payment-amount" class="form-input" placeholder="0">
                </div>
                
                <div class="form-group">
                    <label class="form-label">${I18n.t('clientDetail.payment_method')}</label>
                    <div id="payment-method-container"></div>
                </div>
                
                <div class="form-group">
                    <label class="form-label">${I18n.t('clientDetail.reference')}</label>
                    <input type="text" id="payment-ref" class="form-input" placeholder="${I18n.t('clientDetail.ref_placeholder')}">
                </div>
                
                ${unpaidPackages.length > 0 ? `
                    <div class="form-group">
                        <label class="form-label">${I18n.t('clientDetail.assign_packages')}</label>
                        <div class="checkbox-list">
                            ${unpaidPackages.map(p => `
                                <label class="checkbox-item">
                                    <input type="checkbox" value="${p.id}" class="payment-pkg">
                                    <span>${p.tracking} - ${I18n.t('clientDetail.remaining')} ${this.formatMoney(p.amount - p.paid)}</span>
                                </label>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
                
                <div class="form-group">
                    <label class="form-label">${I18n.t('clientDetail.notes')}</label>
                    <textarea id="payment-notes" class="form-input" rows="2"></textarea>
                </div>
            `,
            footer: `
                <button class="btn btn-secondary" onclick="Modal.close()">${I18n.t('cancel')}</button>
                <button class="btn btn-primary" id="btn-confirm-payment">${I18n.t('clientDetail.save')}</button>
            `
        });
        
        // Init payment method SearchSelect
        new SearchSelect({
            container: '#payment-method-container',
            placeholder: I18n.t('clientDetail.payment_method'),
            items: [
                { id: 'mobile_money', name: I18n.t('clientDetail.mobile_money') },
                { id: 'cash', name: I18n.t('clientDetail.cash') },
                { id: 'bank', name: I18n.t('clientDetail.bank') },
                { id: 'other', name: I18n.t('clientDetail.other') }
            ],
            onSelect: () => {}
        });
        
        document.getElementById('btn-confirm-payment')?.addEventListener('click', () => {
            const amount = document.getElementById('payment-amount').value;
            if (!amount || amount <= 0) {
                Toast.error(I18n.t('clientDetail.invalid_amount'));
                return;
            }
            
            // ============================================
            // API CALL - Remplacer par:
            // await API.payments.create({ client_id: client.id, amount, method, reference, packages, notes });
            // ============================================
            
            Toast.success(I18n.t('clientDetail.payment_saved'));
            Modal.close();
            this.render(client.id);
        });
    },
    
    showEditForm(client) {
        Modal.open({
            title: I18n.t('clientDetail.edit_client'),
            content: `
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">${I18n.t('clientDetail.first_name')}</label>
                        <input type="text" id="edit-fname" class="form-input" value="${client.first_name}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">${I18n.t('clientDetail.last_name')}</label>
                        <input type="text" id="edit-lname" class="form-input" value="${client.last_name}">
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">${I18n.t('clientDetail.phone')}</label>
                    <input type="tel" id="edit-phone" class="form-input" value="${client.phone}">
                </div>
                <div class="form-group">
                    <label class="form-label">${I18n.t('clientDetail.email')}</label>
                    <input type="email" id="edit-email" class="form-input" value="${client.email}">
                </div>
                <div class="form-group">
                    <label class="form-label">${I18n.t('clientDetail.address')}</label>
                    <textarea id="edit-address" class="form-input" rows="2">${client.address || ''}</textarea>
                </div>
            `,
            footer: `
                <button class="btn btn-secondary" onclick="Modal.close()">${I18n.t('cancel')}</button>
                <button class="btn btn-primary" id="btn-save-client">${I18n.t('clientDetail.save')}</button>
            `
        });
        
        document.getElementById('btn-save-client')?.addEventListener('click', () => {
            Toast.success(I18n.t('clientDetail.client_updated'));
            Modal.close();
            this.render(client.id);
        });
    },
    
    formatMoney(amount) {
        return new Intl.NumberFormat(I18n.locale === 'fr' ? 'fr-FR' : 'en-US').format(amount) + ' XAF';
    }
};
