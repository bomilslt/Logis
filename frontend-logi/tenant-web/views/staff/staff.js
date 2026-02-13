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
                    <h1 class="page-title">${I18n.t('staff.title')}</h1>
                    <button class="btn btn-primary" id="btn-add-staff">
                        ${Icons.get('plus', {size:16})} ${I18n.t('staff.new_staff')}
                    </button>
                </div>
                
                <div class="card">
                    <div class="card-body" id="staff-table"></div>
                </div>
            </div>
        `;
        
        document.getElementById('btn-add-staff')?.addEventListener('click', () => this.showForm());
        
        // Show cached data instantly, then refresh silently
        const cached = ViewCache.get('staff:list');
        if (cached) {
            this.staffList = cached.staff || [];
            this.renderTable();
        } else {
            document.getElementById('staff-table').innerHTML = Loader.page(I18n.t('loading'));
        }
        
        await this.loadData(!!cached);
    },
    
    async loadData(silent = false) {
        try {
            const data = await API.staff.getAll();
            if (!silent || ViewCache.hasChanged('staff:list', data)) {
                ViewCache.set('staff:list', data);
                this.staffList = data.staff || [];
                this.renderTable();
            }
        } catch (error) {
            console.error('Load staff error:', error);
            if (!ViewCache.get('staff:list')) {
                document.getElementById('staff-table').innerHTML = `
                    <div class="empty-state">
                        ${Icons.get('alert-circle', {size:32})}
                        <p>${I18n.t('error_loading')}: ${error.message}</p>
                        <button class="btn btn-outline" onclick="Views.staff.loadData()">${I18n.t('retry')}</button>
                    </div>
                `;
            }
        }
    },
    
    renderTable() {
        const container = document.getElementById('staff-table');
        
        if (this.staffList.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    ${Icons.get('users', {size:32})}
                    <p>${I18n.t('staff.no_staff')}</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = `
            <table class="table">
                <thead>
                    <tr>
                        <th>${I18n.t('staff.name')}</th>
                        <th>${I18n.t('staff.email')}</th>
                        <th>${I18n.t('staff.role')}</th>
                        <th>${I18n.t('staff.warehouses')}</th>
                        <th>${I18n.t('staff.modules')}</th>
                        <th>${I18n.t('staff.last_login')}</th>
                        <th>${I18n.t('staff.status')}</th>
                        <th>${I18n.t('actions')}</th>
                    </tr>
                </thead>
                <tbody>
                    ${this.staffList.map(s => `
                        <tr>
                            <td class="font-medium">${s.full_name || `${s.first_name} ${s.last_name}`}</td>
                            <td>${s.email}</td>
                            <td>
                                <span class="status-badge ${s.role === 'admin' ? 'status-in-transit' : 'status-received'}">
                                    ${s.role === 'admin' ? I18n.t('staff.admin') : I18n.t('staff.employee')}
                                </span>
                            </td>
                            <td class="warehouses-cell">
                                ${s.role === 'admin' ? `<span class="text-muted">${I18n.t('staff.all')}</span>` : this.renderWarehousesBadges(s)}
                            </td>
                            <td class="modules-cell">
                                ${s.role === 'admin' ? `<span class="text-muted">${I18n.t('staff.all')}</span>` : this.renderModulesBadges(s)}
                            </td>
                            <td>${s.last_login ? new Date(s.last_login).toLocaleDateString(I18n.locale === 'fr' ? 'fr-FR' : 'en-US') : I18n.t('staff.never')}</td>
                            <td>
                                <span class="status-badge ${s.is_active ? 'status-delivered' : 'status-pending'}">
                                    ${s.is_active ? I18n.t('staff.active') : I18n.t('staff.inactive')}
                                </span>
                            </td>
                            <td>
                                <div class="table-actions">
                                    <button class="btn btn-sm btn-ghost" onclick="Views.staff.editStaff('${s.id}')" title="${I18n.t('edit')}">
                                        ${Icons.get('edit', {size:14})}
                                    </button>
                                    <button class="btn btn-sm btn-ghost" onclick="Views.staff.manageAccess('${s.id}', this)" title="${I18n.t('staff.permissions')}">
                                        ${Icons.get('settings', {size:14})}
                                    </button>
                                    <button class="btn btn-sm btn-ghost" onclick="Views.staff.toggleActive('${s.id}', this)" title="${s.is_active ? I18n.t('staff.inactive') : I18n.t('staff.active')}">
                                        ${Icons.get(s.is_active ? 'user-x' : 'user-check', {size:14})}
                                    </button>
                                    <button class="btn btn-sm btn-ghost" onclick="Views.staff.resetPassword('${s.id}', this)" title="${I18n.t('staff.reset_password')}">
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
                Toast.error(I18n.t('staff.not_found'));
                return;
            }
        }
        
        Modal.open({
            title: isEdit ? I18n.t('staff.edit_staff') : I18n.t('staff.new_staff'),
            content: `
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">${I18n.t('staff.first_name')} *</label>
                        <input type="text" id="staff-fname" class="form-input" value="${staff?.first_name || ''}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">${I18n.t('staff.last_name')} *</label>
                        <input type="text" id="staff-lname" class="form-input" value="${staff?.last_name || ''}">
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">${I18n.t('staff.email')} *</label>
                    <input type="email" id="staff-email" class="form-input" value="${staff?.email || ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">${I18n.t('staff.phone')}</label>
                    <input type="tel" id="staff-phone" class="form-input" value="${staff?.phone || ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">${I18n.t('staff.role')}</label>
                    <div id="staff-role-container"></div>
                </div>
                <div class="form-group" id="staff-warehouse-group">
                    <label class="form-label">${I18n.t('staff.warehouses_label')} *</label>
                    <div id="staff-warehouse-container" class="warehouse-checkboxes"></div>
                    <small class="form-hint">${I18n.t('staff.warehouses_hint')}</small>
                </div>
                <div class="form-group" id="staff-modules-group">
                    <label class="form-label">${I18n.t('staff.modules_label')}</label>
                    <div id="staff-modules-container" class="module-checkboxes"></div>
                    <small class="form-hint">${I18n.t('staff.modules_hint')}</small>
                </div>
                ${!isEdit ? `
                    <div class="form-group">
                        <label class="form-label">${I18n.t('staff.password')}</label>
                        <input type="password" id="staff-password" class="form-input" placeholder="${I18n.t('staff.password_placeholder')}">
                        <small class="form-hint">${I18n.t('staff.password_hint')}</small>
                    </div>
                ` : ''}
            `,
            footer: `
                <button class="btn btn-secondary" onclick="Modal.close()">${I18n.t('cancel')}</button>
                <button class="btn btn-primary" id="btn-save-staff">${I18n.t('save')}</button>
            `
        });
        
        // Init role SearchSelect
        this.roleSelect = new SearchSelect({
            container: '#staff-role-container',
            placeholder: I18n.t('staff.select_role'),
            items: [
                { id: 'staff', name: I18n.t('staff.employee') },
                { id: 'admin', name: I18n.t('staff.admin') }
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
                container.innerHTML = `<p class="text-muted text-sm">${I18n.t('staff.no_warehouse')}</p>`;
            }
        } catch (error) {
            console.error('Load warehouses error:', error);
            document.getElementById('staff-warehouse-container').innerHTML = `<p class="text-error text-sm">${I18n.t('staff.error_warehouses')}</p>`;
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
            return `<span class="text-muted">${I18n.t('staff.none')}</span>`;
        }
        
        if (names.length > 0) {
            return names.map(name => `<span class="warehouse-badge">${name}</span>`).join(' ');
        }
        
        return `<span class="warehouse-badge">${I18n.t('staff.warehouse_count').replace('{n}', ids.length)}</span>`;
    },
    
    renderModulesBadges(staff) {
        const modules = staff.access_modules || [];
        if (modules.length === 0) {
            return `<span class="text-muted">${I18n.t('staff.none')}</span>`;
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
            Toast.error(I18n.t('staff.enter_full_name'));
            return;
        }
        if (!email) {
            Toast.error(I18n.t('staff.enter_email'));
            return;
        }
        if (role === 'staff' && warehouseIds.length === 0) {
            Toast.error(I18n.t('staff.select_warehouse'));
            return;
        }
        
        try {
            if (!btn) btn = document.getElementById('btn-save-staff');
            Loader.button(btn, true, { text: '...' });
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
                Toast.success(I18n.t('staff.staff_updated'));
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
                    Toast.success(I18n.t('staff.staff_created_password').replace('{p}', result.temporary_password));
                    // Afficher le mot de passe dans une modal
                    setTimeout(() => {
                        Modal.alert({
                            title: I18n.t('staff.temp_password'),
                            message: I18n.t('staff.temp_password_msg').replace('{name}', `${firstName} ${lastName}`).replace('{p}', result.temporary_password)
                        });
                    }, 500);
                } else {
                    Toast.success(I18n.t('staff.staff_created'));
                }
            }
            Modal.close();
            ViewCache.onMutate('staff');
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
                title: I18n.t('staff.permissions_title').replace('{name}', staff.full_name || staff.first_name),
                content: `
                    <div class="permissions-info">
                        <p class="text-sm text-muted mb-md">${I18n.t('staff.define_permissions')}</p>
                        <div class="permission-summary mb-md">
                            <div class="permission-item">
                                <strong>${I18n.t('staff.role_label')}:</strong> ${permissionsData.roles.map(r => r.display_name).join(', ')}
                            </div>
                            <div class="permission-item">
                                <strong>${I18n.t('staff.role_permissions')}:</strong> ${I18n.t('staff.permissions_count').replace('{n}', permissionsData.role_permissions.length)}
                            </div>
                            <div class="permission-item">
                                <strong>${I18n.t('staff.individual_permissions')}:</strong> ${I18n.t('staff.permissions_count').replace('{n}', currentPermissions.length)}
                            </div>
                            <div class="permission-item">
                                <strong>${I18n.t('staff.total_effective')}:</strong> ${I18n.t('staff.permissions_count').replace('{n}', permissionsData.effective_permissions.length)}
                            </div>
                        </div>
                    </div>
                    <div class="access-list">
                        ${allPermissions.map(p => `
                            <label class="access-item">
                                <input type="checkbox" value="${p.id}" ${currentPermissions.includes(p.id) ? 'checked' : ''}>
                                <span>${p.label}</span>
                                ${permissionsData.role_permissions.includes(p.id) ? `<small class="text-muted">${I18n.t('staff.via_role')}</small>` : ''}
                            </label>
                        `).join('')}
                    </div>
                `,
                footer: `
                    <button class="btn btn-secondary" onclick="Modal.close()">${I18n.t('cancel')}</button>
                    <button class="btn btn-primary" id="btn-save-permissions">${I18n.t('save')}</button>
                `
            });
            
            document.getElementById('btn-save-permissions')?.addEventListener('click', async (e) => {
                const saveBtn = e.currentTarget;
                const permissions = [];
                document.querySelectorAll('.access-item input:checked').forEach(cb => {
                    permissions.push(cb.value);
                });
                
                try {
                    Loader.button(saveBtn, true, { text: '...' });
                    await API.staff.updatePermissions(id, permissions);
                    Toast.success(I18n.t('staff.permissions_updated'));
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
            Toast.error(`${I18n.t('staff.error_permissions')}: ${error.message}`);
        } finally {
            Loader.button(btn, false);
        }
    },

    async toggleActive(id, btn = null) {
        const staff = this.staffList.find(s => s.id === id);
        if (!staff) return;

        const confirmed = await Modal.confirm({
            title: staff.is_active ? I18n.t('staff.inactive') + ' ?' : I18n.t('staff.active') + ' ?',
            message: staff.is_active ? I18n.t('staff.confirm_deactivate') : I18n.t('staff.confirm_activate'),
            danger: staff.is_active
        });

        if (!confirmed) return;

        try {
            Loader.button(btn, true, { text: '' });
            await API.staff.toggleActive(id);
            Toast.success(staff.is_active ? I18n.t('staff.staff_deactivated') : I18n.t('staff.staff_activated'));
            ViewCache.onMutate('staff');
            await this.loadData();
        } catch (error) {
            Toast.error(`Erreur: ${error.message}`);
        } finally {
            Loader.button(btn, false);
        }
    },

    async resetPassword(id, btn = null) {
        const confirmed = await Modal.confirm({
            title: I18n.t('staff.reset_password_title'),
            message: I18n.t('staff.reset_password_msg'),
            danger: true
        });

        if (!confirmed) return;

        try {
            Loader.button(btn, true, { text: '' });
            const result = await API.staff.resetPassword(id);
            Toast.success(I18n.t('staff.password_reset'));

            if (result?.temporary_password) {
                setTimeout(() => {
                    Modal.open({
                        title: I18n.t('staff.temp_password'),
                        content: `<p>${I18n.t('staff.temp_password')}:</p><p><strong>${result.temporary_password}</strong></p>`,
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
