/**
 * Vue Payroll - Gestion RH, salaires et charges
 */

Views.payroll = {
    currentTab: 'employees',
    employees: [],
    payments: [],
    expenses: [],
    
    render() {
        const main = document.getElementById('main-content');
        
        main.innerHTML = `
            <div class="payroll-page">
                <div class="page-header">
                    <h1 class="page-title">Ressources Humaines</h1>
                    <div class="header-actions">
                        <button class="btn btn-outline" id="btn-add-expense">
                            ${Icons.get('plus', {size:16})} Charge diverse
                        </button>
                        <button class="btn btn-primary" id="btn-add-employee">
                            ${Icons.get('user-plus', {size:16})} Nouvel employe
                        </button>
                    </div>
                </div>
                
                <!-- Onglets -->
                <div class="payroll-tabs mb-md">
                    <button class="payroll-tab ${this.currentTab === 'employees' ? 'active' : ''}" data-tab="employees">
                        ${Icons.get('users', {size:16})} Employes
                    </button>
                    <button class="payroll-tab ${this.currentTab === 'payments' ? 'active' : ''}" data-tab="payments">
                        ${Icons.get('dollar-sign', {size:16})} Paiements
                    </button>
                    <button class="payroll-tab ${this.currentTab === 'expenses' ? 'active' : ''}" data-tab="expenses">
                        ${Icons.get('file-text', {size:16})} Charges diverses
                    </button>
                </div>
                
                <div id="payroll-content">${Loader.page()}</div>
            </div>
        `;
        
        const cached = ViewCache.get('payroll:all');
        if (cached) {
            this._applyPayrollData(cached);
            this.renderCurrentTab();
        }
        
        this.loadData(!!cached);
        this.attachEvents();
    },
    
    attachEvents() {
        document.querySelectorAll('.payroll-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this.currentTab = tab.dataset.tab;
                document.querySelectorAll('.payroll-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.renderCurrentTab();
            });
        });
        
        document.getElementById('btn-add-employee')?.addEventListener('click', () => this.showEmployeeModal());
        document.getElementById('btn-add-expense')?.addEventListener('click', () => this.showExpenseModal());
    },
    
    _applyPayrollData(raw) {
        const staffData = raw.staffData || {};
        const salariesData = raw.salariesData || {};
        const expensesData = raw.expensesData || {};
        this.employees = (staffData.staff || []).map(s => ({
            id: s.id, name: s.full_name || `${s.first_name} ${s.last_name}`,
            email: s.email, phone: s.phone || '', role: s.role,
            position: s.position || s.role, salary: s.salary || 0,
            hire_date: s.hire_date || s.created_at,
            status: s.is_active ? 'active' : 'inactive',
            last_login: s.last_login, permissions: s.permissions || []
        }));
        this.payments = (salariesData.salaries || []).map(s => ({
            id: s.id, employee_id: s.employee_id, employee_name: s.employee_name,
            amount: s.net_amount, month: s.period, paid_at: s.paid_date, method: s.payment_method
        }));
        this.expenses = (expensesData.expenses || []).map(e => ({
            id: e.id, category: e.category, description: e.description, amount: e.amount, date: e.date
        }));
    },

    async loadData(silent = false) {
        try {
            const [staffData, salariesData, expensesData] = await Promise.all([
                API.staff.getAll(),
                API.accounting.getSalaries(),
                API.accounting.getExpenses()
            ]);
            
            const freshData = { staffData, salariesData, expensesData };
            
            if (!silent || ViewCache.hasChanged('payroll:all', freshData)) {
                ViewCache.set('payroll:all', freshData);
                this._applyPayrollData(freshData);
                this.renderCurrentTab();
            }
        } catch (error) {
            console.error('Load payroll data error:', error);
            if (!ViewCache.get('payroll:all')) {
                this.employees = [];
                this.payments = [];
                this.expenses = [];
                Toast.error('Erreur de chargement des données');
                this.renderCurrentTab();
            }
        }
    },
    
    renderCurrentTab() {
        const container = document.getElementById('payroll-content');
        
        switch (this.currentTab) {
            case 'employees':
                this.renderEmployeesTab(container);
                break;
            case 'payments':
                this.renderPaymentsTab(container);
                break;
            case 'expenses':
                this.renderExpensesTab(container);
                break;
        }
    },
    
    renderEmployeesTab(container) {
        const activeEmployees = this.employees.filter(e => e.status === 'active');
        const totalSalaries = activeEmployees.reduce((s, e) => s + e.salary, 0);
        
        container.innerHTML = `
            <!-- Stats -->
            <div class="stats-grid stats-grid-3 mb-md">
                <div class="stat-card">
                    <div class="stat-icon bg-primary">${Icons.get('users', {size:24})}</div>
                    <div class="stat-info">
                        <span class="stat-value">${activeEmployees.length}</span>
                        <span class="stat-label">Employes actifs</span>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon bg-warning">${Icons.get('dollar-sign', {size:24})}</div>
                    <div class="stat-info">
                        <span class="stat-value">${this.formatMoney(totalSalaries)}</span>
                        <span class="stat-label">Masse salariale / mois</span>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon bg-info">${Icons.get('trending-up', {size:24})}</div>
                    <div class="stat-info">
                        <span class="stat-value">${this.formatMoney(Math.round(totalSalaries / (activeEmployees.length || 1)))}</span>
                        <span class="stat-label">Salaire moyen</span>
                    </div>
                </div>
            </div>
            
            <!-- Liste employes -->
            <div class="card">
                <div class="card-body">
                    <div class="table-wrapper">
                        <table class="table">
                            <thead>
                                <tr>
                                    <th>Employe</th>
                                    <th>Contact</th>
                                    <th>Poste</th>
                                    <th>Salaire</th>
                                    <th>Role</th>
                                    <th>Statut</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${this.employees.map(emp => `
                                    <tr>
                                        <td>
                                            <div class="font-medium">${emp.name}</div>
                                            <div class="text-sm text-muted">Depuis ${new Date(emp.hire_date).toLocaleDateString('fr-FR')}</div>
                                        </td>
                                        <td>
                                            <div class="text-sm">${emp.email}</div>
                                            <div class="text-sm text-muted">${emp.phone}</div>
                                        </td>
                                        <td>${emp.position}</td>
                                        <td class="font-medium">${this.formatMoney(emp.salary)}</td>
                                        <td>
                                            <span class="status-badge ${emp.role === 'admin' ? 'status-transit' : 'status-received'}">
                                                ${emp.role === 'admin' ? 'Admin' : 'Employe'}
                                            </span>
                                        </td>
                                        <td>
                                            <span class="status-badge ${emp.status === 'active' ? 'status-delivered' : 'status-customs'}">
                                                ${emp.status === 'active' ? 'Actif' : 'Inactif'}
                                            </span>
                                        </td>
                                        <td>
                                            <div class="table-actions">
                                                <button class="btn btn-sm btn-primary" onclick="Views.payroll.showPaySalaryModal('${emp.id}')" title="Payer salaire">
                                                    ${Icons.get('dollar-sign', {size:14})}
                                                </button>
                                                <button class="btn btn-sm btn-outline" onclick="Views.payroll.showEmployeeModal('${emp.id}')" title="Modifier">
                                                    ${Icons.get('edit', {size:14})}
                                                </button>
                                                <button class="btn btn-sm btn-outline" onclick="Views.payroll.showAccessModal('${emp.id}')" title="Gerer les acces">
                                                    ${Icons.get('settings', {size:14})}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    },

    renderPaymentsTab(container) {
        const currentMonth = new Date().toISOString().slice(0, 7);
        const thisMonthPayments = this.payments.filter(p => p.month === currentMonth);
        const totalPaid = thisMonthPayments.reduce((s, p) => s + p.amount, 0);
        const activeEmployees = this.employees.filter(e => e.status === 'active');
        const totalDue = activeEmployees.reduce((s, e) => s + e.salary, 0);
        
        container.innerHTML = `
            <!-- Stats -->
            <div class="stats-grid stats-grid-3 mb-md">
                <div class="stat-card">
                    <div class="stat-icon bg-success">${Icons.get('check-circle', {size:24})}</div>
                    <div class="stat-info">
                        <span class="stat-value">${thisMonthPayments.length} / ${activeEmployees.length}</span>
                        <span class="stat-label">Payes ce mois</span>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon bg-primary">${Icons.get('dollar-sign', {size:24})}</div>
                    <div class="stat-info">
                        <span class="stat-value">${this.formatMoney(totalPaid)}</span>
                        <span class="stat-label">Total verse</span>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon bg-warning">${Icons.get('alert-circle', {size:24})}</div>
                    <div class="stat-info">
                        <span class="stat-value">${this.formatMoney(totalDue - totalPaid)}</span>
                        <span class="stat-label">Reste a payer</span>
                    </div>
                </div>
            </div>
            
            <!-- Historique paiements -->
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">Historique des paiements</h3>
                </div>
                <div class="card-body">
                    <div class="table-wrapper">
                        <table class="table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Employe</th>
                                    <th>Periode</th>
                                    <th>Montant</th>
                                    <th>Methode</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${this.payments.length === 0 ? `
                                    <tr><td colspan="5" class="text-center text-muted py-md">Aucun paiement enregistre</td></tr>
                                ` : this.payments.map(pay => `
                                    <tr>
                                        <td>${new Date(pay.paid_at).toLocaleDateString('fr-FR')}</td>
                                        <td class="font-medium">${pay.employee_name}</td>
                                        <td>${this.formatMonth(pay.month)}</td>
                                        <td class="text-error">-${this.formatMoney(pay.amount)}</td>
                                        <td><span class="status-badge status-transit">${this.getPaymentMethodLabel(pay.method)}</span></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    },
    
    renderExpensesTab(container) {
        const totalExpenses = this.expenses.reduce((s, e) => s + e.amount, 0);
        
        container.innerHTML = `
            <!-- Stats -->
            <div class="stats-grid stats-grid-2 mb-md">
                <div class="stat-card">
                    <div class="stat-icon bg-danger">${Icons.get('dollar-sign', {size:24})}</div>
                    <div class="stat-info">
                        <span class="stat-value">${this.formatMoney(totalExpenses)}</span>
                        <span class="stat-label">Total charges</span>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon bg-info">${Icons.get('file-text', {size:24})}</div>
                    <div class="stat-info">
                        <span class="stat-value">${this.expenses.length}</span>
                        <span class="stat-label">Nombre de charges</span>
                    </div>
                </div>
            </div>
            
            <!-- Liste charges -->
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">Charges diverses</h3>
                    <button class="btn btn-sm btn-primary" onclick="Views.payroll.showExpenseModal()">
                        ${Icons.get('plus', {size:14})} Ajouter
                    </button>
                </div>
                <div class="card-body">
                    <div class="table-wrapper">
                        <table class="table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Categorie</th>
                                    <th>Description</th>
                                    <th>Montant</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${this.expenses.length === 0 ? `
                                    <tr><td colspan="5" class="text-center text-muted py-md">Aucune charge enregistree</td></tr>
                                ` : this.expenses.map(exp => `
                                    <tr>
                                        <td>${new Date(exp.date).toLocaleDateString('fr-FR')}</td>
                                        <td><span class="expense-category expense-cat-${exp.category}">${this.getExpenseCategoryLabel(exp.category)}</span></td>
                                        <td>${exp.description}</td>
                                        <td class="text-error font-medium">-${this.formatMoney(exp.amount)}</td>
                                        <td>
                                            <div class="table-actions">
                                                <button class="btn btn-sm btn-ghost text-error" onclick="Views.payroll.deleteExpense('${exp.id}', this)">
                                                    ${Icons.get('trash-2', {size:14})}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    },
    
    // ========================================
    // MODALES
    // ========================================
    
    showEmployeeModal(employeeId = null) {
        const employee = employeeId ? this.employees.find(e => e.id === employeeId) : null;
        const isEdit = !!employee;
        
        Modal.open({
            title: isEdit ? 'Modifier employe' : 'Nouvel employe',
            size: 'lg',
            content: `
                <div class="form-section">
                    <h4 class="form-section-title">Informations personnelles</h4>
                    <div class="form-grid">
                        <div class="form-group">
                            <label class="form-label">Nom complet</label>
                            <input type="text" class="form-input" id="emp-name" value="${employee?.name || ''}" placeholder="Jean Dupont">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Poste</label>
                            <input type="text" class="form-input" id="emp-position" value="${employee?.position || ''}" placeholder="Gestionnaire">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Telephone</label>
                            <input type="tel" class="form-input" id="emp-phone" value="${employee?.phone || ''}" placeholder="+86 138 0000 0000">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Salaire mensuel (XAF)</label>
                            <input type="number" class="form-input" id="emp-salary" value="${employee?.salary || ''}" placeholder="300000">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Date d'embauche</label>
                            <div id="emp-hire-date"></div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Statut</label>
                            <div id="emp-status"></div>
                        </div>
                    </div>
                </div>
                
                <div class="form-section">
                    <h4 class="form-section-title">Compte utilisateur</h4>
                    <div class="form-grid">
                        <div class="form-group">
                            <label class="form-label">Email</label>
                            <input type="email" class="form-input" id="emp-email" value="${employee?.email || ''}" placeholder="employe@expresscargo.com">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Role</label>
                            <div id="emp-role"></div>
                        </div>
                        <div class="form-group" id="emp-warehouse-group">
                            <label class="form-label">Entrepots *</label>
                            <div id="emp-warehouse" class="warehouse-checkboxes"></div>
                            <small class="form-hint">Selectionnez un ou plusieurs entrepots pour l'employe</small>
                        </div>
                        ${!isEdit ? `
                            <div class="form-group">
                                <label class="form-label">Mot de passe</label>
                                <input type="password" class="form-input" id="emp-password" placeholder="Min. 8 caracteres">
                            </div>
                            <div class="form-group">
                                <label class="form-label">Confirmer mot de passe</label>
                                <input type="password" class="form-input" id="emp-password-confirm" placeholder="Confirmer">
                            </div>
                        ` : `
                            <div class="form-group full-width">
                                <button class="btn btn-outline btn-sm" type="button" id="btn-change-password">
                                    ${Icons.get('edit', {size:14})} Modifier le mot de passe
                                </button>
                            </div>
                        `}
                    </div>
                </div>
            `,
            footer: `
                <button class="btn btn-secondary" onclick="Modal.close()">Annuler</button>
                <button class="btn btn-primary" id="btn-save-employee">${isEdit ? 'Enregistrer' : 'Ajouter'}</button>
            `
        });
        
        // Init DatePicker
        new DatePicker({
            container: '#emp-hire-date',
            placeholder: 'Date embauche',
            value: employee?.hire_date || new Date().toISOString().split('T')[0]
        });
        
        // Init SearchSelect pour statut
        const statusSelect = new SearchSelect({
            container: '#emp-status',
            placeholder: 'Statut',
            items: [
                { id: 'active', name: 'Actif' },
                { id: 'inactive', name: 'Inactif' }
            ]
        });
        statusSelect.setValue(employee?.status || 'active');
        
        // Init SearchSelect pour role
        const roleSelect = new SearchSelect({
            container: '#emp-role',
            placeholder: 'Role',
            items: [
                { id: 'staff', name: 'Employe' },
                { id: 'admin', name: 'Administrateur' }
            ],
            onSelect: (item) => {
                const warehouseGroup = document.getElementById('emp-warehouse-group');
                if (warehouseGroup) {
                    warehouseGroup.style.display = item?.id === 'admin' ? 'none' : 'block';
                }
            }
        });
        roleSelect.setValue(employee?.role || 'staff');
        
        // Init SearchSelect pour warehouse
        let warehouseSelect = null;
        this.loadWarehousesForEmployeeForm(employee).then(ws => { warehouseSelect = ws; });
        
        // Afficher/masquer warehouse selon role initial
        const warehouseGroup = document.getElementById('emp-warehouse-group');
        if (warehouseGroup && employee?.role === 'admin') {
            warehouseGroup.style.display = 'none';
        }
        
        // Event bouton changer mot de passe
        document.getElementById('btn-change-password')?.addEventListener('click', () => {
            this.showChangePasswordModal(employeeId);
        });
        
        document.getElementById('btn-save-employee')?.addEventListener('click', (e) => {
            this.saveEmployee(employeeId, statusSelect, roleSelect, warehouseSelect, e.currentTarget);
        });
    },
    
    async loadWarehousesForEmployeeForm(employee = null) {
        try {
            const data = await API.settings.getWarehouses();
            const warehouses = data.warehouses || [];
            this.availableWarehouses = warehouses;
            
            // Recuperer les IDs des entrepots assignes (multi ou legacy single)
            const assignedIds = employee?.warehouse_ids || (employee?.warehouse_id ? [employee.warehouse_id] : []);
            
            const container = document.getElementById('emp-warehouse');
            container.innerHTML = warehouses.map(w => `
                <label class="warehouse-checkbox-item">
                    <input type="checkbox" name="emp-warehouses" value="${w.id}" ${assignedIds.includes(w.id) ? 'checked' : ''}>
                    <span class="warehouse-label">
                        <strong>${w.name}</strong>
                        <small>${w.city}, ${w.country}</small>
                    </span>
                </label>
            `).join('');
            
            if (warehouses.length === 0) {
                container.innerHTML = '<p class="text-muted text-sm">Aucun entrepot configure</p>';
            }
            
            return true;
        } catch (error) {
            console.error('Load warehouses error:', error);
            document.getElementById('emp-warehouse').innerHTML = '<p class="text-error text-sm">Erreur chargement</p>';
            return false;
        }
    },
    
    getSelectedWarehouseIds() {
        const checkboxes = document.querySelectorAll('input[name="emp-warehouses"]:checked');
        return Array.from(checkboxes).map(cb => cb.value);
    },
    
    showChangePasswordModal(employeeId) {
        const employee = this.employees.find(e => e.id === employeeId);
        if (!employee) return;
        
        Modal.open({
            title: `Modifier mot de passe - ${employee.name}`,
            content: `
                <div class="form-group mb-md">
                    <label class="form-label">Nouveau mot de passe</label>
                    <input type="password" class="form-input" id="new-password" placeholder="Min. 8 caracteres">
                </div>
                <div class="form-group">
                    <label class="form-label">Confirmer mot de passe</label>
                    <input type="password" class="form-input" id="confirm-password" placeholder="Confirmer">
                </div>
            `,
            footer: `
                <button class="btn btn-secondary" onclick="Views.payroll.showEmployeeModal('${employeeId}')">Retour</button>
                <button class="btn btn-primary" id="btn-save-password">Enregistrer</button>
            `
        });
        
        document.getElementById('btn-save-password')?.addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            const newPwd = document.getElementById('new-password').value;
            const confirmPwd = document.getElementById('confirm-password').value;
            
            if (newPwd.length < 8) {
                Toast.error('Le mot de passe doit contenir au moins 8 caractères');
                return;
            }
            if (newPwd !== confirmPwd) {
                Toast.error('Les mots de passe ne correspondent pas');
                return;
            }
            
            try {
                Loader.button(btn, true, { text: 'Enregistrement...' });
                await API.staff.resetPassword(employeeId);
                Toast.success('Mot de passe réinitialisé');
                this.showEmployeeModal(employeeId);
            } catch (error) {
                console.error('Change password error:', error);
                Toast.error(error.message || 'Erreur lors du changement');
            } finally {
                Loader.button(btn, false);
            }
        });
    },
    
    async saveEmployee(employeeId, statusSelect, roleSelect, warehouseSelect, btn = null) {
        const name = document.getElementById('emp-name').value.trim();
        const position = document.getElementById('emp-position').value.trim();
        const phone = document.getElementById('emp-phone').value.trim();
        const email = document.getElementById('emp-email').value.trim();
        const salary = parseInt(document.getElementById('emp-salary').value) || 0;
        const status = statusSelect.getValue();
        const role = roleSelect.getValue();
        const warehouseIds = this.getSelectedWarehouseIds();
        
        // Récupérer la date d'embauche depuis le DatePicker
        const hireDateInput = document.querySelector('#emp-hire-date input');
        const hireDate = hireDateInput?.value || new Date().toISOString().split('T')[0];
        
        if (!name || !position || !email || salary <= 0) {
            Toast.error('Veuillez remplir tous les champs obligatoires');
            return;
        }
        if (role === 'staff' && warehouseIds.length === 0) {
            Toast.error('Selectionnez au moins un entrepot pour l\'employe');
            return;
        }
        
        // Séparer le nom en prénom et nom
        const nameParts = name.split(' ');
        const firstName = nameParts[0];
        const lastName = nameParts.slice(1).join(' ') || firstName;
        
        try {
            if (!btn) btn = document.getElementById('btn-save-employee');
            Loader.button(btn, true, { text: employeeId ? 'Enregistrement...' : 'Creation...' });
            
            if (employeeId) {
                // Mise à jour
                await API.staff.update(employeeId, {
                    first_name: firstName,
                    last_name: lastName,
                    email,
                    phone,
                    role,
                    position,
                    salary,
                    hire_date: hireDate,
                    is_active: status === 'active',
                    warehouse_ids: role === 'staff' ? warehouseIds : []
                });
                Toast.success('Employé modifié');
            } else {
                // Création
                const password = document.getElementById('emp-password')?.value;
                const passwordConfirm = document.getElementById('emp-password-confirm')?.value;
                
                if (!password || password.length < 8) {
                    Toast.error('Le mot de passe doit contenir au moins 8 caractères');
                    return;
                }
                if (password !== passwordConfirm) {
                    Toast.error('Les mots de passe ne correspondent pas');
                    return;
                }
                
                await API.staff.create({
                    first_name: firstName,
                    last_name: lastName,
                    email,
                    phone,
                    role,
                    position,
                    salary,
                    hire_date: hireDate,
                    password,
                    warehouse_ids: role === 'staff' ? warehouseIds : []
                });
                Toast.success('Employé ajouté');
            }
            
            Modal.close();
            this.loadData();
        } catch (error) {
            console.error('Save employee error:', error);
            Toast.error(error.message || 'Erreur lors de l\'enregistrement');
        } finally {
            Loader.button(btn, false);
        }
    },

    showAccessModal(employeeId) {
        const employee = this.employees.find(e => e.id === employeeId);
        if (!employee) return;
        
        const allPermissions = [
            { id: 'packages', label: 'Voir et gerer les colis' },
            { id: 'packages_status', label: 'Modifier les statuts des colis' },
            { id: 'packages_receive', label: 'Recevoir des colis (scanner)' },
            { id: 'clients', label: 'Voir et gerer les clients' },
            { id: 'payments', label: 'Gerer les paiements' },
            { id: 'invoices', label: 'Gerer les factures' },
            { id: 'reports', label: 'Voir les rapports' },
            { id: 'departures', label: 'Gerer les departs' },
            { id: 'tarifs', label: 'Modifier les tarifs' },
            { id: 'warehouses', label: 'Gerer les entrepots' },
            { id: 'announcements', label: 'Gerer les annonces' },
            { id: 'payroll', label: 'Gerer RH et paie' },
            { id: 'settings', label: 'Parametres generaux' }
        ];
        
        Modal.open({
            title: `Gestion des acces - ${employee.name}`,
            content: `
                <p class="text-sm text-muted mb-md">Definir les permissions pour cet employe</p>
                <div class="access-list">
                    ${allPermissions.map(p => `
                        <label class="access-item">
                            <input type="checkbox" value="${p.id}" ${employee.permissions?.includes(p.id) ? 'checked' : ''}>
                            <span>${p.label}</span>
                        </label>
                    `).join('')}
                </div>
                <div class="access-actions mt-md">
                    <button class="btn btn-sm btn-ghost" type="button" id="btn-select-all">Tout selectionner</button>
                    <button class="btn btn-sm btn-ghost" type="button" id="btn-deselect-all">Tout deselectionner</button>
                </div>
            `,
            footer: `
                <button class="btn btn-secondary" onclick="Modal.close()">Annuler</button>
                <button class="btn btn-primary" id="btn-save-access">Enregistrer</button>
            `
        });
        
        document.getElementById('btn-select-all')?.addEventListener('click', () => {
            document.querySelectorAll('.access-item input').forEach(cb => cb.checked = true);
        });
        
        document.getElementById('btn-deselect-all')?.addEventListener('click', () => {
            document.querySelectorAll('.access-item input').forEach(cb => cb.checked = false);
        });
        
        document.getElementById('btn-save-access')?.addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            const permissions = [];
            document.querySelectorAll('.access-item input:checked').forEach(cb => {
                permissions.push(cb.value);
            });
            
            try {
                Loader.button(btn, true, { text: 'Enregistrement...' });
                await API.staff.updatePermissions(employeeId, permissions);
                Toast.success('Accès mis à jour');
                Modal.close();
                this.loadData();
            } catch (error) {
                console.error('Update permissions error:', error);
                Toast.error(error.message || 'Erreur lors de la mise à jour');
            } finally {
                Loader.button(btn, false);
            }
        });
    },
    
    showPaySalaryModal(employeeId) {
        const employee = this.employees.find(e => e.id === employeeId);
        if (!employee) return;
        
        const currentMonth = new Date().toISOString().slice(0, 7);
        
        Modal.open({
            title: `Payer salaire - ${employee.name}`,
            content: `
                <div class="pay-salary-info mb-md">
                    <div class="info-row">
                        <span class="label">Employe</span>
                        <span class="value font-medium">${employee.name}</span>
                    </div>
                    <div class="info-row">
                        <span class="label">Poste</span>
                        <span class="value">${employee.position}</span>
                    </div>
                    <div class="info-row">
                        <span class="label">Salaire</span>
                        <span class="value text-success font-medium">${this.formatMoney(employee.salary)}</span>
                    </div>
                </div>
                
                <div class="form-group mb-md">
                    <label class="form-label">Periode (mois)</label>
                    <input type="month" class="form-input" id="pay-month" value="${currentMonth}">
                </div>
                
                <div class="form-group mb-md">
                    <label class="form-label">Montant</label>
                    <input type="number" class="form-input" id="pay-amount" value="${employee.salary}">
                </div>
                
                <div class="form-group">
                    <label class="form-label">Methode de paiement</label>
                    <div id="pay-method"></div>
                </div>
            `,
            footer: `
                <button class="btn btn-secondary" onclick="Modal.close()">Annuler</button>
                <button class="btn btn-primary" id="btn-confirm-pay">Confirmer le paiement</button>
            `
        });
        
        const methodSelect = new SearchSelect({
            container: '#pay-method',
            placeholder: 'Methode...',
            items: [
                { id: 'virement', name: 'Virement bancaire' },
                { id: 'mobile_money', name: 'Mobile Money' },
                { id: 'especes', name: 'Especes' }
            ]
        });
        methodSelect.setValue('virement');
        
        document.getElementById('btn-confirm-pay')?.addEventListener('click', (e) => {
            this.confirmPaySalary(employeeId, methodSelect, e.currentTarget);
        });
    },
    
    async confirmPaySalary(employeeId, methodSelect, btn = null) {
        const month = document.getElementById('pay-month').value;
        const amount = parseInt(document.getElementById('pay-amount').value) || 0;
        const method = methodSelect.getValue();
        
        if (!month || amount <= 0) {
            Toast.error('Veuillez remplir tous les champs');
            return;
        }
        
        const [year, monthNum] = month.split('-').map(Number);
        
        try {
            if (!btn) btn = document.getElementById('btn-confirm-pay');
            Loader.button(btn, true, { text: 'Paiement...' });
            
            await API.accounting.addSalary({
                employee_id: employeeId,
                period_month: monthNum,
                period_year: year,
                base_salary: amount,
                bonus: 0,
                deductions: 0,
                paid_date: new Date().toISOString().split('T')[0],
                payment_method: method
            });
            
            Toast.success('Salaire payé avec succès');
            Modal.close();
            this.loadData();
        } catch (error) {
            console.error('Pay salary error:', error);
            Toast.error(error.message || 'Erreur lors du paiement');
        } finally {
            Loader.button(btn, false);
        }
    },
    
    showExpenseModal() {
        Modal.open({
            title: 'Nouvelle charge',
            content: `
                <div class="form-group mb-md">
                    <label class="form-label">Categorie</label>
                    <div id="expense-category"></div>
                </div>
                <div class="form-group mb-md">
                    <label class="form-label">Description</label>
                    <input type="text" class="form-input" id="expense-desc" placeholder="Ex: Loyer bureau janvier">
                </div>
                <div class="form-group mb-md">
                    <label class="form-label">Montant (XAF)</label>
                    <input type="number" class="form-input" id="expense-amount" placeholder="0">
                </div>
                <div class="form-group">
                    <label class="form-label">Date</label>
                    <div id="expense-date"></div>
                </div>
            `,
            footer: `
                <button class="btn btn-secondary" onclick="Modal.close()">Annuler</button>
                <button class="btn btn-primary" id="btn-save-expense">Enregistrer</button>
            `
        });
        
        const categorySelect = new SearchSelect({
            container: '#expense-category',
            placeholder: 'Categorie...',
            items: [
                { id: 'loyer', name: 'Loyer' },
                { id: 'utilities', name: 'Electricite / Internet' },
                { id: 'fournitures', name: 'Fournitures bureau' },
                { id: 'transport', name: 'Transport' },
                { id: 'communication', name: 'Communication' },
                { id: 'maintenance', name: 'Maintenance' },
                { id: 'taxes', name: 'Taxes / Impots' },
                { id: 'other', name: 'Autres' }
            ]
        });
        categorySelect.setValue('other');
        
        new DatePicker({
            container: '#expense-date',
            placeholder: 'Date',
            value: new Date().toISOString().split('T')[0]
        });
        
        document.getElementById('btn-save-expense')?.addEventListener('click', (e) => {
            this.saveExpense(categorySelect, e.currentTarget);
        });
    },
    
    async saveExpense(categorySelect, btn = null) {
        const category = categorySelect.getValue();
        const description = document.getElementById('expense-desc').value.trim();
        const amount = parseInt(document.getElementById('expense-amount').value) || 0;
        
        if (!description || amount <= 0) {
            Toast.error('Veuillez remplir tous les champs');
            return;
        }
        
        try {
            if (!btn) btn = document.getElementById('btn-save-expense');
            Loader.button(btn, true, { text: 'Enregistrement...' });
            
            await API.accounting.addExpense({
                category,
                description,
                amount,
                date: new Date().toISOString().split('T')[0]
            });
            
            Toast.success('Charge enregistrée');
            Modal.close();
            this.loadData();
        } catch (error) {
            console.error('Save expense error:', error);
            Toast.error(error.message || 'Erreur lors de l\'enregistrement');
        } finally {
            Loader.button(btn, false);
        }
    },
    
    async deleteExpense(expenseId, btn = null) {
        const confirmed = await Modal.confirm({
            title: 'Supprimer la charge',
            message: 'Voulez-vous vraiment supprimer cette charge ?',
            danger: true
        });
        
        if (!confirmed) return;
        
        try {
            Loader.button(btn, true, { text: '' });
            await API.accounting.deleteExpense(expenseId);
            Toast.success('Charge supprimée');
            this.loadData();
        } catch (error) {
            console.error('Delete expense error:', error);
            Toast.error(error.message || 'Erreur lors de la suppression');
        } finally {
            Loader.button(btn, false);
        }
    },
    
    // ========================================
    // HELPERS
    // ========================================
    
    formatMoney(amount) {
        return new Intl.NumberFormat('fr-FR').format(amount) + ' XAF';
    },
    
    formatMonth(monthStr) {
        const [year, month] = monthStr.split('-');
        const months = ['Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre'];
        return `${months[parseInt(month) - 1]} ${year}`;
    },
    
    getPaymentMethodLabel(method) {
        const labels = { virement: 'Virement', mobile_money: 'Mobile Money', especes: 'Especes' };
        return labels[method] || method;
    },
    
    getExpenseCategoryLabel(cat) {
        const labels = {
            loyer: 'Loyer', utilities: 'Utilities', fournitures: 'Fournitures',
            transport: 'Transport', communication: 'Communication', maintenance: 'Maintenance',
            taxes: 'Taxes', other: 'Autres'
        };
        return labels[cat] || cat;
    }
};
