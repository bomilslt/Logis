/**
 * Vue Clients - Liste des clients avec filtres et actions
 * Connectee a l'API backend
 */

Views.clients = {
    filters: { search: '', status: '' },
    allClients: [],
    currentPage: 1,
    pageSize: 15,
    
    render() {
        const main = document.getElementById('main-content');
        
        main.innerHTML = `
            <div class="clients-page">
                <div class="page-header">
                    <h1 class="page-title">Clients</h1>
                    <div class="header-actions">
                        <button class="btn btn-outline" id="btn-export" title="Exporter la liste des clients">
                            ${Icons.get('download', {size:16})} Export
                        </button>
                        <button class="btn btn-primary" id="btn-new-client" title="Créer un nouveau client">
                            ${Icons.get('plus', {size:16})} Nouveau client
                        </button>
                    </div>
                </div>
                
                <!-- Stats rapides -->
                <div class="stats-grid mb-md">
                    <div class="stat-card">
                        <div class="stat-icon bg-primary">${Icons.get('users', {size:24})}</div>
                        <div class="stat-info">
                            <span class="stat-value" id="stat-total">-</span>
                            <span class="stat-label">Total clients</span>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon bg-success">${Icons.get('user-check', {size:24})}</div>
                        <div class="stat-info">
                            <span class="stat-value" id="stat-active">-</span>
                            <span class="stat-label">Clients actifs</span>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon bg-info">${Icons.get('user-plus', {size:24})}</div>
                        <div class="stat-info">
                            <span class="stat-value" id="stat-new">-</span>
                            <span class="stat-label">Nouveaux ce mois</span>
                        </div>
                    </div>
                </div>
                
                <!-- Filtres -->
                <div class="card mb-md">
                    <div class="card-body">
                        <div class="filters-grid">
                            <div class="form-group">
                                <label class="form-label">Recherche</label>
                                <input type="text" id="filter-search" class="form-input" 
                                    placeholder="Nom, email, telephone..." value="${this.filters.search}">
                            </div>
                            <div class="form-group">
                                <label class="form-label">Statut</label>
                                <div id="filter-status-container"></div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Liste -->
                <div class="card">
                    <div class="card-body" id="clients-list">
                        ${Loader.page('Chargement...')}
                    </div>
                </div>
            </div>
        `;
        
        this.initFilters();
        this.loadClients();
        this.attachEvents();
    },
    
    initFilters() {
        this.statusSelect = new SearchSelect({
            container: '#filter-status-container',
            placeholder: 'Tous',
            items: [
                { id: '', name: 'Tous les statuts' },
                { id: 'active', name: 'Actifs' },
                { id: 'inactive', name: 'Inactifs' }
            ],
            onSelect: (item) => { 
                this.filters.status = item?.id || ''; 
                this.currentPage = 1; 
                this.loadClients(); 
            }
        });
    },
    
    async loadClients() {
        const container = document.getElementById('clients-list');
        container.innerHTML = Loader.page('Chargement...');
        
        try {
            console.log('Loading clients with params:', {
                page: this.currentPage,
                per_page: this.pageSize,
                search: this.filters.search || undefined,
                status: this.filters.status || undefined
            });
            
            const data = await API.clients.getAll({
                page: this.currentPage,
                per_page: this.pageSize,
                search: this.filters.search || undefined,
                status: this.filters.status || undefined
            });
            
            console.log('API response:', data);
            
            const clients = data.clients || [];
            this.allClients = clients;
            
            console.log('Clients count:', clients.length);
            
            const totalEl = document.getElementById('stat-total');
            const activeEl = document.getElementById('stat-active');
            const newEl = document.getElementById('stat-new');
            
            if (totalEl) totalEl.textContent = data.total || clients.length;
            if (activeEl) activeEl.textContent = data.active_count || clients.filter(c => c.is_active).length;
            if (newEl) newEl.textContent = data.new_this_month || '-';
            
            if (clients.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        ${Icons.get('users', {size:48})}
                        <p class="empty-state-title">Aucun client trouve</p>
                    </div>
                `;
                return;
            }
            
            this.renderList(clients, data.total || clients.length);
            
        } catch (error) {
            console.error('Load clients error:', error);
            container.innerHTML = `
                <div class="error-state">
                    ${Icons.get('alert-circle', {size:48})}
                    <h3>Erreur de chargement</h3>
                    <p>${error.message}</p>
                    <button class="btn btn-primary" onclick="Views.clients.loadClients()">Reessayer</button>
                </div>
            `;
        }
    },

    renderList(clients, total) {
        const container = document.getElementById('clients-list');
        
        container.innerHTML = `
            <div class="table-wrapper">
                <table class="table">
                    <thead>
                        <tr>
                            <th>Client</th>
                            <th>Contact</th>
                            <th>Colis</th>
                            <th>Solde</th>
                            <th>Inscription</th>
                            <th>Statut</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${clients.map(c => this.renderRow(c)).join('')}
                    </tbody>
                </table>
            </div>
            <div class="table-footer">
                <span class="text-sm text-muted">${total} client(s)</span>
                <div id="clients-pagination"></div>
            </div>
        `;
        
        new Pagination({
            container: '#clients-pagination',
            totalItems: total,
            pageSize: this.pageSize,
            currentPage: this.currentPage,
            onChange: (page) => {
                this.currentPage = page;
                this.loadClients();
            }
        });
    },
    
    renderRow(c) {
        const name = c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Client';
        const email = c.email || '-';
        const phone = c.phone || '-';
        const packagesCount = c.packages_count || c.stats?.packages_count || 0;
        const balance = c.balance || c.stats?.balance || 0;
        const createdAt = c.created_at ? new Date(c.created_at).toLocaleDateString('fr-FR') : '-';
        const isActive = c.is_active !== false;
        
        return `
            <tr data-id="${c.id}">
                <td>
                    <div class="client-info">
                        <div class="client-avatar">${name.charAt(0).toUpperCase()}</div>
                        <div>
                            <div class="font-medium">${name}</div>
                            <div class="text-sm text-muted">${email}</div>
                        </div>
                    </div>
                </td>
                <td>${phone}</td>
                <td><span class="badge">${packagesCount}</span></td>
                <td class="${balance > 0 ? 'text-error' : 'text-success'}">${this.formatMoney(balance)}</td>
                <td>${createdAt}</td>
                <td>
                    <span class="status-badge ${isActive ? 'status-delivered' : 'status-pending'}">
                        ${isActive ? 'Actif' : 'Inactif'}
                    </span>
                </td>
                <td>
                    <div class="table-actions">
                        <button class="btn btn-sm btn-ghost" onclick="Views.clients.viewClient('${c.id}')" title="Voir les détails">${Icons.get('eye', {size:14})}</button>
                        <button class="btn btn-sm btn-ghost" onclick="Views.clients.editClient('${c.id}')" title="Modifier">${Icons.get('edit', {size:14})}</button>
                        <button class="btn btn-sm btn-ghost" onclick="Views.clients.toggleActive('${c.id}', ${isActive}, this)" title="${isActive ? 'Désactiver' : 'Activer'}">${Icons.get(isActive ? 'user-x' : 'user-check', {size:14})}</button>
                    </div>
                </td>
            </tr>
        `;
    },
    
    attachEvents() {
        let searchTimeout;
        document.getElementById('filter-search')?.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => { 
                this.filters.search = e.target.value; 
                this.currentPage = 1; 
                this.loadClients(); 
            }, 300);
        });
        
        document.getElementById('btn-new-client')?.addEventListener('click', () => this.showClientForm());
        document.getElementById('btn-export')?.addEventListener('click', () => this.exportClients());
    },
    
    async viewClient(clientId) {
        try {
            const data = await API.clients.getById(clientId);
            const client = data.client || data;
            const name = client.full_name || `${client.first_name || ''} ${client.last_name || ''}`.trim();
            const stats = client.stats || {};
            
            Modal.open({
                title: `Client: ${name}`,
                size: 'lg',
                content: `
                    <div class="client-details">
                        <div class="client-header">
                            <div class="client-avatar-lg">${name.charAt(0).toUpperCase()}</div>
                            <div class="client-header-info">
                                <h3>${name}</h3>
                                <p class="text-muted">${client.email || '-'}</p>
                                <p>${client.phone || '-'}</p>
                            </div>
                        </div>
                        <div class="client-stats-grid">
                            <div class="client-stat">
                                <span class="client-stat-value">${stats.packages_count || 0}</span>
                                <span class="client-stat-label">Colis total</span>
                            </div>
                            <div class="client-stat">
                                <span class="client-stat-value">${stats.pending_packages || 0}</span>
                                <span class="client-stat-label">En cours</span>
                            </div>
                            <div class="client-stat">
                                <span class="client-stat-value">${this.formatMoney(stats.total_spent || 0)}</span>
                                <span class="client-stat-label">Total depense</span>
                            </div>
                            <div class="client-stat ${(stats.balance || 0) > 0 ? 'text-error' : ''}">
                                <span class="client-stat-value">${this.formatMoney(stats.balance || 0)}</span>
                                <span class="client-stat-label">Solde du</span>
                            </div>
                        </div>
                    </div>
                `,
                footer: `
                    <button class="btn btn-secondary" onclick="Modal.close()">Fermer</button>
                    <button class="btn btn-outline" onclick="Router.navigate('/packages?client=${clientId}'); Modal.close();">${Icons.get('package', {size:16})} Voir colis</button>
                    <button class="btn btn-primary" onclick="Views.clients.editClient('${clientId}'); Modal.close();">${Icons.get('edit', {size:16})} Modifier</button>
                `
            });
        } catch (error) {
            Toast.error(`Erreur: ${error.message}`);
        }
    },
    
    showClientForm(clientId = null) {
        const isEdit = !!clientId;
        const client = isEdit ? this.allClients.find(c => c.id === clientId) : null;
        
        Modal.open({
            title: isEdit ? 'Modifier le client' : 'Nouveau client',
            content: `
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Prenom *</label>
                        <input type="text" id="client-firstname" class="form-input" value="${client?.first_name || ''}" placeholder="Prenom">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Nom *</label>
                        <input type="text" id="client-lastname" class="form-input" value="${client?.last_name || ''}" placeholder="Nom">
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">Email</label>
                    <input type="email" id="client-email" class="form-input" value="${client?.email || ''}" placeholder="email@exemple.com">
                </div>
                <div class="form-group">
                    <label class="form-label">Telephone *</label>
                    <input type="tel" id="client-phone" class="form-input" value="${client?.phone || ''}" placeholder="+237 6XX XXX XXX">
                </div>
                <div class="form-group">
                    <label class="form-label">Adresse</label>
                    <textarea id="client-address" class="form-input" rows="2" placeholder="Adresse complete">${client?.address || ''}</textarea>
                </div>
            `,
            footer: `
                <button class="btn btn-secondary" onclick="Modal.close()">Annuler</button>
                <button class="btn btn-primary" id="btn-save-client">${isEdit ? 'Enregistrer' : 'Creer'}</button>
            `
        });
        
        document.getElementById('btn-save-client')?.addEventListener('click', (e) => this.saveClient(clientId, e.currentTarget));
    },
    
    editClient(clientId) {
        this.showClientForm(clientId);
    },
    
    async saveClient(clientId = null, btn = null) {
        const firstName = document.getElementById('client-firstname').value.trim();
        const lastName = document.getElementById('client-lastname').value.trim();
        const email = document.getElementById('client-email').value.trim();
        const phone = document.getElementById('client-phone').value.trim();
        const address = document.getElementById('client-address').value.trim();
        
        if (!firstName || !lastName) { Toast.error('Le nom et prenom sont requis'); return; }
        if (!phone) { Toast.error('Le telephone est requis'); return; }
        
        const data = { first_name: firstName, last_name: lastName, email: email || undefined, phone, address: address || undefined };
        
        try {
            if (!btn) btn = document.getElementById('btn-save-client');
            Loader.button(btn, true, { text: clientId ? 'Enregistrement...' : 'Creation...' });
            if (clientId) {
                await API.clients.update(clientId, data);
                Toast.success('Client modifie');
            } else {
                await API.clients.create(data);
                Toast.success('Client cree');
            }
            Modal.close();
            this.loadClients();
        } catch (error) {
            Toast.error(`Erreur: ${error.message}`);
        } finally {
            Loader.button(btn, false);
        }
    },
    
    async toggleActive(clientId, currentlyActive, btn = null) {
        const confirmed = await Modal.confirm({
            title: `${currentlyActive ? 'Desactiver' : 'Activer'} le client ?`,
            message: `Voulez-vous vraiment ${currentlyActive ? 'desactiver' : 'activer'} ce client ?`,
            danger: currentlyActive
        });
        
        if (confirmed) {
            try {
                Loader.button(btn, true, { text: '' });
                await API.clients.toggleActive(clientId);
                Toast.success(`Client ${currentlyActive ? 'desactive' : 'active'}`);
                this.loadClients();
            } catch (error) {
                Toast.error(`Erreur: ${error.message}`);
            } finally {
                Loader.button(btn, false);
            }
        }
    },
    
    exportClients() {
        if (this.allClients.length === 0) { 
            Toast.error('Aucune donnee a exporter'); 
            return; 
        }
        
        ExportService.exportClients(this.allClients, {
            format: 'csv',
            filename: `clients_export_${new Date().toISOString().split('T')[0]}.csv`
        });
    },

    exportClientsPDF() {
        if (this.allClients.length === 0) { 
            Toast.error('Aucune donnee a exporter'); 
            return; 
        }
        
        ExportService.exportClients(this.allClients, {
            title: 'Liste des Clients',
            format: 'pdf',
            filename: `clients_export_${new Date().toISOString().split('T')[0]}.pdf`
        });
    },
    
    formatMoney(amount) {
        return new Intl.NumberFormat('fr-FR').format(amount || 0) + ' XAF';
    }
};
