/**
 * Vue Staff - Gestion des employes
 * CRUD complet via l'API
 */

Views.staff = {
    staffList: [],
    
    async render() {
        const main = document.getElementById('main-content');
        
        main.innerHTML = `
            <div class="staff-page">
                <div class="page-header">
                    <h1 class="page-title">Employes</h1>
                    <button class="btn btn-primary" id="btn-add-staff">
                        ${Icons.get('plus', {size:16})} Ajouter
                    </button>
                </div>
                
                <div class="card">
                    <div class="card-body" id="staff-table">${Loader.page('Chargement...')}</div>
                </div>
            </div>
        `;
        
        document.getElementById('btn-add-staff')?.addEventListener('click', () => this.showForm());
        
        await this.loadData();
    },
    
    async loadData() {
        try {
            const data = await API.staff.getAll();
            this.staffList = data.staff || [];
            this.renderTable();
        } catch (error) {
            console.error('Load staff error:', error);
            document.getElementById('staff-table').innerHTML = `
                <div class="empty-state">
                    ${Icons.get('alert-circle', {size:32})}
                    <p>Erreur de chargement: ${error.message}</p>
                    <button class="btn btn-outline" onclick="Views.staff.loadData()">Reessayer</button>
                </div>
            `;
        }
    },
    
    renderTable() {
        const container = document.getElementById('staff-table');
        
        if (this.staffList.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    ${Icons.get('users', {size:32})}
                    <p>Aucun employe</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = `
            <table class="table">
                <thead>
                    <tr>
                        <th>Nom</th>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Entrepots</th>
                        <th>Modules</th>
                        <th>Derniere connexion</th>
                        <th>Statut</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${this.staffList.map(s => `
                        <tr>
                            <td class="font-medium">${s.full_name || `${s.first_name} ${s.last_name}`}</td>
                            <td>${s.email}</td>
                            <td>
                                <span class="status-badge ${s.role === 'admin' ? 'status-in-transit' : 'status-received'}">
                                    ${s.role === 'admin' ? 'Admin' : 'Employe'}
                                </span>
                            </td>
                            <td class="warehouses-cell">
                                ${s.role === 'admin' ? '<span class="text-muted">Tous</span>' : this.renderWarehousesBadges(s)}
                            </td>
                            <td class="modules-cell">
                                ${s.role === 'admin' ? '<span class="text-muted">Tous</span>' : this.renderModulesBadges(s)}
                            </td>
                            <td>${s.last_login ? new Date(s.last_login).toLocaleDateString('fr-FR') : 'Jamais'}</td>
                            <td>
                                <span class="status-badge ${s.is_active ? 'status-delivered' : 'status-pending'}">
                                    ${s.is_active ? 'Actif' : 'Inactif'}
                                </span>
                            </td>
                            <td>
                                <div class="table-actions">
                                    <button class="btn btn-sm btn-ghost" onclick="Views.staff.editStaff('${s.id}')" title="Modifier">
                                        ${Icons.get('edit', {size:14})}
                                    </button>
                                    <button class="btn btn-sm btn-ghost" onclick="Views.staff.manageAccess('${s.id}', this)" title="Permissions">
                                        ${Icons.get('settings', {size:14})}
                                    </button>
                                    <button class="btn btn-sm btn-ghost" onclick="Views.staff.toggleActive('${s.id}', this)" title="${s.is_active ? 'Desactiver' : 'Activer'}">
                                        ${Icons.get(s.is_active ? 'user-x' : 'user-check', {size:14})}
                                    </button>
                                    <button class="btn btn-sm btn-ghost" onclick="Views.staff.resetPassword('${s.id}', this)" title="Reset mot de passe">
                                        ${Icons.get('key', {size:14})}
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    },
    
    async showForm(staffId = null) {
        const isEdit = !!staffId;
        let staff = null;
        
        if (isEdit) {
            staff = this.staffList.find(s => s.id === staffId);
            if (!staff) {
                Toast.error('Employe non trouve');
                return;
            }
        }
        
        Modal.open({
            title: isEdit ? 'Modifier l\'employe' : 'Nouvel employe',
            content: `
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Prenom *</label>
                        <input type="text" id="staff-fname" class="form-input" value="${staff?.first_name || ''}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Nom *</label>
                        <input type="text" id="staff-lname" class="form-input" value="${staff?.last_name || ''}">
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">Email *</label>
                    <input type="email" id="staff-email" class="form-input" value="${staff?.email || ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">Telephone</label>
                    <input type="tel" id="staff-phone" class="form-input" value="${staff?.phone || ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">Role</label>
                    <div id="staff-role-container"></div>
                </div>
                <div class="form-group" id="staff-warehouse-group">
                    <label class="form-label">Entrepots *</label>
                    <div id="staff-warehouse-container" class="warehouse-checkboxes"></div>
                    <small class="form-hint">Selectionnez un ou plusieurs entrepots pour l'employe</small>
                </div>
                <div class="form-group" id="staff-modules-group">
                    <label class="form-label">Modules d'acces</label>
                    <div id="staff-modules-container" class="module-checkboxes"></div>
                    <small class="form-hint">Definit les sections visibles dans l'interface pour cet employe</small>
                </div>
                ${!isEdit ? `
                    <div class="form-group">
                        <label class="form-label">Mot de passe</label>
                        <input type="password" id="staff-password" class="form-input" placeholder="Laisser vide pour generer automatiquement">
                        <small class="form-hint">Min. 8 caracteres. Si vide, un mot de passe temporaire sera genere.</small>
                    </div>
                ` : ''}
            `,
            footer: `
                <button class="btn btn-secondary" onclick="Modal.close()">Annuler</button>
                <button class="btn btn-primary" id="btn-save-staff">Enregistrer</button>
            `
        });
        
        // Init role SearchSelect
        this.roleSelect = new SearchSelect({
            container: '#staff-role-container',
            placeholder: 'Selectionner un role',
            items: [
                { id: 'staff', name: 'Employe' },
                { id: 'admin', name: 'Administrateur' }
            ],
            onSelect: (item) => {
                const isAdmin = item?.id === 'admin';
                // Afficher/masquer warehouse et modules selon le role
                const warehouseGroup = document.getElementById('staff-warehouse-group');
                const modulesGroup = document.getElementById('staff-modules-group');
                if (warehouseGroup) warehouseGroup.style.display = isAdmin ? 'none' : 'block';
                if (modulesGroup) modulesGroup.style.display = isAdmin ? 'none' : 'block';
            }
        });
        this.roleSelect.setValue(staff?.role || 'staff');
        
        // Init warehouse SearchSelect
        this.loadWarehousesForForm(staff);
        
        // Init modules checkboxes
        this.renderModulesCheckboxes(staff);
        
        // Afficher/masquer warehouse et modules selon le role initial
        const isAdmin = staff?.role === 'admin';
        const warehouseGroup = document.getElementById('staff-warehouse-group');
        const modulesGroup = document.getElementById('staff-modules-group');
        if (warehouseGroup && isAdmin) warehouseGroup.style.display = 'none';
        if (modulesGroup && isAdmin) modulesGroup.style.display = 'none';
        
        document.getElementById('btn-save-staff')?.addEventListener('click', (e) => this.saveStaff(staffId, e.currentTarget));
    },
    
    async loadWarehousesForForm(staff = null) {
        try {
            const data = await API.settings.getWarehouses();
            const warehouses = data.warehouses || [];
            this.availableWarehouses = warehouses;
            
            // Recuperer les IDs des entrepots assignes (multi ou legacy single)
            const assignedIds = staff?.warehouse_ids || (staff?.warehouse_id ? [staff.warehouse_id] : []);
            
            const container = document.getElementById('staff-warehouse-container');
            container.innerHTML = warehouses.map(w => `
                <label class="warehouse-checkbox-item">
                    <input type="checkbox" name="staff-warehouses" value="${w.id}" ${assignedIds.includes(w.id) ? 'checked' : ''}>
                    <span class="warehouse-label">
                        <strong>${w.name}</strong>
                        <small>${w.city}, ${w.country}</small>
                    </span>
                </label>
            `).join('');
            
            if (warehouses.length === 0) {
                container.innerHTML = '<p class="text-muted text-sm">Aucun entrepot configure</p>';
            }
        } catch (error) {
            console.error('Load warehouses error:', error);
            document.getElementById('staff-warehouse-container').innerHTML = '<p class="text-error text-sm">Erreur chargement entrepots</p>';
        }
    },
    
    getSelectedWarehouseIds() {
        const checkboxes = document.querySelectorAll('input[name="staff-warehouses"]:checked');
        return Array.from(checkboxes).map(cb => cb.value);
    },
    
    renderModulesCheckboxes(staff = null) {
        const container = document.getElementById('staff-modules-container');
        if (!container) return;
        
        const currentModules = staff?.access_modules || [];
        const moduleDefs = window.ViewFilter ? ViewFilter.getModuleDefinitions() : {
            packages:      { label: 'Colis & Clients', icon: 'package', description: 'Gestion des colis, clients, retraits et paiements' },
            finance:       { label: 'Finances', icon: 'trending-up', description: 'Rapports financiers et paie' },
            departures:    { label: 'Departs', icon: 'truck', description: 'Gestion des departs' },
            communication: { label: 'Communication', icon: 'megaphone', description: 'Annonces et notifications' },
            settings:      { label: 'Configuration', icon: 'settings', description: 'Tarifs, entrepots et parametres' },
            staff:         { label: 'Personnel', icon: 'user-cog', description: 'Gestion du personnel et permissions' }
        };
        
        container.innerHTML = Object.entries(moduleDefs).map(([key, def]) => `
            <label class="module-checkbox-item">
                <input type="checkbox" name="staff-modules" value="${key}" ${currentModules.includes(key) ? 'checked' : ''}>
                <span class="module-label">
                    <span class="module-label-icon">${Icons.get(def.icon, {size: 16})}</span>
                    <span class="module-label-text">
                        <strong>${def.label}</strong>
                        <small>${def.description}</small>
                    </span>
                </span>
            </label>
        `).join('');
    },
    
    getSelectedModules() {
        const checkboxes = document.querySelectorAll('input[name="staff-modules"]:checked');
        return Array.from(checkboxes).map(cb => cb.value);
    },
    
    renderWarehousesBadges(staff) {
        const ids = staff.warehouse_ids || (staff.warehouse_id ? [staff.warehouse_id] : []);
        const names = staff.warehouse_names || [];
        
        if (ids.length === 0) {
            return '<span class="text-muted">Aucun</span>';
        }
        
        if (names.length > 0) {
            return names.map(name => `<span class="warehouse-badge">${name}</span>`).join(' ');
        }
        
        return `<span class="warehouse-badge">${ids.length} entrepot${ids.length > 1 ? 's' : ''}</span>`;
    },
    
    renderModulesBadges(staff) {
        const modules = staff.access_modules || [];
        if (modules.length === 0) {
            return '<span class="text-muted">Aucun</span>';
        }
        
        const moduleDefs = window.ViewFilter ? ViewFilter.getModuleDefinitions() : {};
        return modules.map(m => {
            const label = moduleDefs[m]?.label || m;
            return `<span class="module-badge">${label}</span>`;
        }).join(' ');
    },
    
    async saveStaff(staffId = null, btn = null) {
        const firstName = document.getElementById('staff-fname').value.trim();
        const lastName = document.getElementById('staff-lname').value.trim();
        const email = document.getElementById('staff-email').value.trim();
        const phone = document.getElementById('staff-phone').value.trim();
        const role = this.roleSelect?.getValue() || 'staff';
        const warehouseIds = this.getSelectedWarehouseIds();
        const accessModules = this.getSelectedModules();
        const password = document.getElementById('staff-password')?.value;
        
        if (!firstName || !lastName) {
            Toast.error('Entrez le nom complet');
            return;
        }
        if (!email) {
            Toast.error('Entrez l\'email');
            return;
        }
        if (role === 'staff' && warehouseIds.length === 0) {
            Toast.error('Selectionnez au moins un entrepot pour l\'employe');
            return;
        }
        
        try {
            if (!btn) btn = document.getElementById('btn-save-staff');
            Loader.button(btn, true, { text: staffId ? 'Enregistrement...' : 'Creation...' });
            let result;
            if (staffId) {
                result = await API.staff.update(staffId, { 
                    first_name: firstName, 
                    last_name: lastName, 
                    email, 
                    phone, 
                    role,
                    warehouse_ids: role === 'staff' ? warehouseIds : [],
                    access_modules: role === 'staff' ? accessModules : []
                });
                Toast.success('Employe modifie');
            } else {
                const data = { 
                    first_name: firstName, 
                    last_name: lastName, 
                    email, 
                    phone, 
                    role,
                    warehouse_ids: role === 'staff' ? warehouseIds : [],
                    access_modules: role === 'staff' ? accessModules : []
                };
                if (password) data.password = password;
                result = await API.staff.create(data);
                
                if (result.temporary_password) {
                    Toast.success(`Employe cree. Mot de passe temporaire: ${result.temporary_password}`);
                    // Afficher le mot de passe dans une modal
                    setTimeout(() => {
                        Modal.alert({
                            title: 'Mot de passe temporaire',
                            message: `Le mot de passe temporaire pour ${firstName} ${lastName} est:\n\n<strong>${result.temporary_password}</strong>\n\nCommuniquez-le a l'employe.`
                        });
                    }, 500);
                } else {
                    Toast.success('Employe cree');
                }
            }
            Modal.close();
            await this.loadData();
        } catch (error) {
            console.error('Save staff error:', error);
            Toast.error(`Erreur: ${error.message}`);
        } finally {
            Loader.button(btn, false);
        }
    },
    
    editStaff(id) {
        this.showForm(id);
    },
    
    async manageAccess(id, btn = null) {
        const staff = this.staffList.find(s => s.id === id);
        if (!staff) return;
        
        try {
            Loader.button(btn, true, { text: '' });
            // Récupérer les permissions actuelles depuis le backend
            const permissionsData = await API.staff.getPermissions(id);
            const currentPermissions = permissionsData.individual_permissions || [];
            
            // Permissions disponibles (alignées avec le backend RBAC)
            const allPermissions = [
                // Packages
                { id: 'packages.read', label: 'Voir les colis' },
                { id: 'packages.read_all', label: 'Voir tous les colis du tenant' },
                { id: 'packages.write', label: 'Créer/modifier les colis' },
                { id: 'packages.delete', label: 'Supprimer les colis' },
                { id: 'packages.manage_status', label: 'Changer les statuts des colis' },
                
                // Clients
                { id: 'clients.read', label: 'Voir les clients' },
                { id: 'clients.write', label: 'Créer/modifier les clients' },
                { id: 'clients.delete', label: 'Supprimer les clients' },
                
                // Paiements
                { id: 'payments.read', label: 'Voir les paiements' },
                { id: 'payments.write', label: 'Enregistrer des paiements' },
                { id: 'payments.cancel', label: 'Annuler des paiements' },
                
                // Personnel
                { id: 'staff.read', label: 'Voir le personnel' },
                { id: 'staff.write', label: 'Gérer le personnel' },
                { id: 'staff.permissions', label: 'Gérer les permissions du personnel' },
                
                // Factures
                { id: 'invoices.read', label: 'Voir les factures' },
                { id: 'invoices.write', label: 'Créer/modifier les factures' },
                
                // Départs
                { id: 'departures.read', label: 'Voir les départs' },
                { id: 'departures.write', label: 'Gérer les départs' },
                
                // Rapports
                { id: 'reports.financial', label: 'Voir les rapports financiers' },
                { id: 'reports.operational', label: 'Voir les rapports opérationnels' },
                
                // Système
                { id: 'system.settings', label: 'Modifier les paramètres système' },
                { id: 'system.audit', label: 'Voir les logs d\'audit' },
                
                // Entrepôts
                { id: 'warehouses.read', label: 'Voir les entrepôts' },
                { id: 'warehouses.write', label: 'Gérer les entrepôts' },
                
                // Annonces
                { id: 'announcements.read', label: 'Voir les annonces' },
                { id: 'announcements.write', label: 'Gérer les annonces' },
                
                // Tarifs
                { id: 'tarifs.read', label: 'Voir les tarifs' },
                { id: 'tarifs.write', label: 'Gérer les tarifs' }
            ];
            
            Modal.open({
                title: `Permissions - ${staff.full_name || staff.first_name}`,
                content: `
                    <div class="permissions-info">
                        <p class="text-sm text-muted mb-md">Définir les permissions pour cet employé</p>
                        <div class="permission-summary mb-md">
                            <div class="permission-item">
                                <strong>Rôle:</strong> ${permissionsData.roles.map(r => r.display_name).join(', ')}
                            </div>
                            <div class="permission-item">
                                <strong>Permissions du rôle:</strong> ${permissionsData.role_permissions.length} permissions
                            </div>
                            <div class="permission-item">
                                <strong>Permissions individuelles:</strong> ${currentPermissions.length} permissions
                            </div>
                            <div class="permission-item">
                                <strong>Total effectif:</strong> ${permissionsData.effective_permissions.length} permissions
                            </div>
                        </div>
                    </div>
                    <div class="access-list">
                        ${allPermissions.map(p => `
                            <label class="access-item">
                                <input type="checkbox" value="${p.id}" ${currentPermissions.includes(p.id) ? 'checked' : ''}>
                                <span>${p.label}</span>
                                ${permissionsData.role_permissions.includes(p.id) ? '<small class="text-muted">(via rôle)</small>' : ''}
                            </label>
                        `).join('')}
                    </div>
                `,
                footer: `
                    <button class="btn btn-secondary" onclick="Modal.close()">Annuler</button>
                    <button class="btn btn-primary" id="btn-save-permissions">Enregistrer</button>
                `
            });
            
            document.getElementById('btn-save-permissions')?.addEventListener('click', async (e) => {
                const saveBtn = e.currentTarget;
                const permissions = [];
                document.querySelectorAll('.access-item input:checked').forEach(cb => {
                    permissions.push(cb.value);
                });
                
                try {
                    Loader.button(saveBtn, true, { text: 'Enregistrement...' });
                    await API.staff.updatePermissions(id, permissions);
                    Toast.success('Permissions mises à jour');
                    Modal.close();
                    await this.loadData();
                } catch (error) {
                    Toast.error(`Erreur: ${error.message}`);
                } finally {
                    Loader.button(saveBtn, false);
                }
            });
        } catch (error) {
            console.error('Load permissions error:', error);
            Toast.error(`Erreur de chargement des permissions: ${error.message}`);
        } finally {
            Loader.button(btn, false);
        }
    },

    async toggleActive(id, btn = null) {
        const staff = this.staffList.find(s => s.id === id);
        if (!staff) return;

        const confirmed = await Modal.confirm({
            title: staff.is_active ? 'Desactiver ?' : 'Activer ?',
            message: `Voulez-vous vraiment ${staff.is_active ? 'desactiver' : 'activer'} cet employe ?`,
            danger: staff.is_active
        });

        if (!confirmed) return;

        try {
            Loader.button(btn, true, { text: '' });
            await API.staff.toggleActive(id);
            Toast.success(staff.is_active ? 'Employe desactive' : 'Employe active');
            await this.loadData();
        } catch (error) {
            Toast.error(`Erreur: ${error.message}`);
        } finally {
            Loader.button(btn, false);
        }
    },

    async resetPassword(id, btn = null) {
        const confirmed = await Modal.confirm({
            title: 'Reinitialiser le mot de passe ?',
            message: 'Un nouveau mot de passe temporaire sera genere.',
            danger: true
        });

        if (!confirmed) return;

        try {
            Loader.button(btn, true, { text: '' });
            const result = await API.staff.resetPassword(id);
            Toast.success('Mot de passe reinitialise');

            if (result?.temporary_password) {
                setTimeout(() => {
                    Modal.open({
                        title: 'Mot de passe temporaire',
                        content: `<p>Mot de passe temporaire:</p><p><strong>${result.temporary_password}</strong></p>`,
                        footer: `<button class="btn btn-primary" onclick="Modal.close()">OK</button>`
                    });
                }, 200);
            }
        } catch (error) {
            Toast.error(`Erreur: ${error.message}`);
        } finally {
            Loader.button(btn, false);
        }
    }
};
