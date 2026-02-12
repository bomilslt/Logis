/**
 * Vue Client Detail - Infos client, colis et historique paiements
 */

Views.clientDetail = {
    render(clientId) {
        const main = document.getElementById('main-content');
        main.innerHTML = Loader.page('Chargement...');
        
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
                            ${Icons.get('arrow-left', { size: 16 })} Retour
                        </button>
                        <h1 class="page-title mt-md">${client.first_name} ${client.last_name}</h1>
                        <p class="text-sm text-muted">${client.phone} - ${client.email}</p>
                    </div>
                    <div class="header-actions">
                        <button class="btn btn-outline" id="btn-add-payment">
                            ${Icons.get('dollar-sign', {size:16})} Enregistrer paiement
                        </button>
                        <span class="status-badge ${client.is_active ? 'status-delivered' : 'status-pending'}">
                            ${client.is_active ? 'Actif' : 'Inactif'}
                        </span>
                    </div>
                </div>
                
                <!-- Stats -->
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-card-header">
                            <span class="stat-card-title">Total colis</span>
                            <div class="stat-card-icon primary">${Icons.get('package')}</div>
                        </div>
                        <div class="stat-card-value">${client.stats.total_packages}</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-card-header">
                            <span class="stat-card-title">Livres</span>
                            <div class="stat-card-icon success">${Icons.get('check-circle')}</div>
                        </div>
                        <div class="stat-card-value">${client.stats.delivered}</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-card-header">
                            <span class="stat-card-title">Total facture</span>
                            <div class="stat-card-icon info">${Icons.get('file-text')}</div>
                        </div>
                        <div class="stat-card-value">${this.formatMoney(client.stats.total_amount)}</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-card-header">
                            <span class="stat-card-title">Solde du</span>
                            <div class="stat-card-icon ${balance > 0 ? 'warning' : 'success'}">${Icons.get('dollar-sign')}</div>
                        </div>
                        <div class="stat-card-value ${balanceClass}">${this.formatMoney(balance)}</div>
                    </div>
                </div>
                
                <div class="detail-grid">
                    <!-- Colis -->
                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">Colis (${client.packages.length})</h3>
                            <a href="#/packages?client=${client.id}" class="btn btn-sm btn-ghost">Voir tout</a>
                        </div>
                        <div class="card-body">
                            <table class="table">
                                <thead>
                                    <tr>
                                        <th>Tracking</th>
                                        <th>Description</th>
                                        <th>Montant</th>
                                        <th>Paye</th>
                                        <th>Statut</th>
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
                            <h3 class="card-title">Historique paiements</h3>
                        </div>
                        <div class="card-body">
                            ${client.payments.length > 0 ? `
                                <table class="table">
                                    <thead>
                                        <tr>
                                            <th>Date</th>
                                            <th>Montant</th>
                                            <th>Methode</th>
                                            <th>Reference</th>
                                            <th>Colis</th>
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
                                    <p class="text-muted">Aucun paiement enregistre</p>
                                </div>
                            `}
                        </div>
                    </div>
                </div>
                
                <!-- Infos client -->
                <div class="card mt-md">
                    <div class="card-header">
                        <h3 class="card-title">Informations</h3>
                        <button class="btn btn-sm btn-ghost" id="btn-edit-client">${Icons.get('edit', {size:14})} Modifier</button>
                    </div>
                    <div class="card-body">
                        <div class="info-grid">
                            <div class="detail-row">
                                <span class="detail-label">Nom complet</span>
                                <span class="detail-value">${client.first_name} ${client.last_name}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Email</span>
                                <span class="detail-value">${client.email}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Telephone</span>
                                <span class="detail-value">${client.phone}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Adresse</span>
                                <span class="detail-value">${client.address || '-'}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Inscrit le</span>
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
            title: 'Enregistrer un paiement',
            content: `
                <p class="text-sm text-muted mb-md">Client: ${client.first_name} ${client.last_name}</p>
                
                <div class="form-group">
                    <label class="form-label">Montant (XAF)</label>
                    <input type="number" id="payment-amount" class="form-input" placeholder="0">
                </div>
                
                <div class="form-group">
                    <label class="form-label">Methode de paiement</label>
                    <div id="payment-method-container"></div>
                </div>
                
                <div class="form-group">
                    <label class="form-label">Reference</label>
                    <input type="text" id="payment-ref" class="form-input" placeholder="Ex: OM-123456, CASH-001...">
                </div>
                
                ${unpaidPackages.length > 0 ? `
                    <div class="form-group">
                        <label class="form-label">Affecter aux colis</label>
                        <div class="checkbox-list">
                            ${unpaidPackages.map(p => `
                                <label class="checkbox-item">
                                    <input type="checkbox" value="${p.id}" class="payment-pkg">
                                    <span>${p.tracking} - Reste: ${this.formatMoney(p.amount - p.paid)}</span>
                                </label>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
                
                <div class="form-group">
                    <label class="form-label">Notes</label>
                    <textarea id="payment-notes" class="form-input" rows="2"></textarea>
                </div>
            `,
            footer: `
                <button class="btn btn-secondary" onclick="Modal.close()">Annuler</button>
                <button class="btn btn-primary" id="btn-confirm-payment">Enregistrer</button>
            `
        });
        
        // Init payment method SearchSelect
        new SearchSelect({
            container: '#payment-method-container',
            placeholder: 'Methode de paiement',
            items: [
                { id: 'mobile_money', name: 'Mobile Money (OM/MOMO)' },
                { id: 'cash', name: 'Especes' },
                { id: 'bank', name: 'Virement bancaire' },
                { id: 'other', name: 'Autre' }
            ],
            onSelect: () => {}
        });
        
        document.getElementById('btn-confirm-payment')?.addEventListener('click', () => {
            const amount = document.getElementById('payment-amount').value;
            if (!amount || amount <= 0) {
                Toast.error('Montant invalide');
                return;
            }
            
            // ============================================
            // API CALL - Remplacer par:
            // await API.payments.create({ client_id: client.id, amount, method, reference, packages, notes });
            // ============================================
            
            Toast.success('Paiement enregistre');
            Modal.close();
            this.render(client.id);
        });
    },
    
    showEditForm(client) {
        Modal.open({
            title: 'Modifier le client',
            content: `
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Prenom</label>
                        <input type="text" id="edit-fname" class="form-input" value="${client.first_name}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Nom</label>
                        <input type="text" id="edit-lname" class="form-input" value="${client.last_name}">
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">Telephone</label>
                    <input type="tel" id="edit-phone" class="form-input" value="${client.phone}">
                </div>
                <div class="form-group">
                    <label class="form-label">Email</label>
                    <input type="email" id="edit-email" class="form-input" value="${client.email}">
                </div>
                <div class="form-group">
                    <label class="form-label">Adresse</label>
                    <textarea id="edit-address" class="form-input" rows="2">${client.address || ''}</textarea>
                </div>
            `,
            footer: `
                <button class="btn btn-secondary" onclick="Modal.close()">Annuler</button>
                <button class="btn btn-primary" id="btn-save-client">Enregistrer</button>
            `
        });
        
        document.getElementById('btn-save-client')?.addEventListener('click', () => {
            Toast.success('Client mis a jour');
            Modal.close();
            this.render(client.id);
        });
    },
    
    formatMoney(amount) {
        return new Intl.NumberFormat('fr-FR').format(amount) + ' XAF';
    }
};
