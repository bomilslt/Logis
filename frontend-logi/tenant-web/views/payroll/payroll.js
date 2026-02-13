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
                    <h1 class="page-title">${I18n.t('payroll.title')}</h1>
                    <div class="header-actions">
                        <button class="btn btn-outline" id="btn-add-expense">
                            ${Icons.get('plus', {size:16})} ${I18n.t('payroll.new_expense')}
                        </button>
                        <button class="btn btn-primary" id="btn-add-employee">
                            ${Icons.get('user-plus', {size:16})} ${I18n.t('payroll.new_employee')}
                        </button>
                    </div>
                </div>
                
                <!-- Onglets -->
                <div class="payroll-tabs mb-md">
                    <button class="payroll-tab ${this.currentTab === 'employees' ? 'active' : ''}" data-tab="employees">
                        ${Icons.get('users', {size:16})} ${I18n.t('payroll.tab_employees')}
                    </button>
                    <button class="payroll-tab ${this.currentTab === 'payments' ? 'active' : ''}" data-tab="payments">
                        ${Icons.get('dollar-sign', {size:16})} ${I18n.t('payroll.tab_payments')}
                    </button>
                    <button class="payroll-tab ${this.currentTab === 'expenses' ? 'active' : ''}" data-tab="expenses">
                        ${Icons.get('file-text', {size:16})} ${I18n.t('payroll.tab_expenses')}
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
                Toast.error(I18n.t('error_loading'));
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
                        <span class="stat-label">${I18n.t('payroll.active_employees')}</span>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon bg-warning">${Icons.get('dollar-sign', {size:24})}</div>
                    <div class="stat-info">
                        <span class="stat-value">${this.formatMoney(totalSalaries)}</span>
                        <span class="stat-label">${I18n.t('payroll.monthly_payroll')}</span>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon bg-info">${Icons.get('trending-up', {size:24})}</div>
                    <div class="stat-info">
                        <span class="stat-value">${this.formatMoney(Math.round(totalSalaries / (activeEmployees.length || 1)))}</span>
                        <span class="stat-label">${I18n.t('payroll.avg_salary')}</span>
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
                                    <th>${I18n.t('staff.name')}</th>
                                    <th>${I18n.t('clients.phone')}</th>
                                    <th>${I18n.t('payroll.position')}</th>
                                    <th>${I18n.t('payroll.salary')}</th>
                                    <th>${I18n.t('staff.role')}</th>
                                    <th>${I18n.t('staff.status')}</th>
                                    <th>${I18n.t('actions')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${this.employees.map(emp => `
                                    <tr>
                                        <td>
                                            <div class="font-medium">${emp.name}</div>
                                            <div class="text-sm text-muted">${I18n.t('payroll.since')} ${new Date(emp.hire_date).toLocaleDateString(I18n.locale === 'fr' ? 'fr-FR' : 'en-US')}</div>
                                        </td>
                                        <td>
                                            <div class="text-sm">${emp.email}</div>
                                            <div class="text-sm text-muted">${emp.phone}</div>
                                        </td>
                                        <td>${emp.position}</td>
                                        <td class="font-medium">${this.formatMoney(emp.salary)}</td>
                                        <td>
                                            <span class="status-badge ${emp.role === 'admin' ? 'status-transit' : 'status-received'}">
                                                ${emp.role === 'admin' ? I18n.t('staff.admin') : I18n.t('staff.employee')}
                                            </span>
                                        </td>
                                        <td>
                                            <span class="status-badge ${emp.status === 'active' ? 'status-delivered' : 'status-customs'}">
                                                ${emp.status === 'active' ? I18n.t('staff.active') : I18n.t('staff.inactive')}
                                            </span>
                                        </td>
                                        <td>
                                            <div class="table-actions">
                                                <button class="btn btn-sm btn-primary" onclick="Views.payroll.showPaySalaryModal('${emp.id}')" title="${I18n.t('payroll.pay_salary')}">
                                                    ${Icons.get('dollar-sign', {size:14})}
                                                </button>
                                                <button class="btn btn-sm btn-outline" onclick="Views.payroll.showEmployeeModal('${emp.id}')" title="${I18n.t('edit')}">
                                                    ${Icons.get('edit', {size:14})}
                                                </button>
                                                <button class="btn btn-sm btn-outline" onclick="Views.payroll.showAccessModal('${emp.id}')" title="${I18n.t('payroll.manage_access')}">
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
                        <span class="stat-label">${I18n.t('payroll.paid_this_month')}</span>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon bg-primary">${Icons.get('dollar-sign', {size:24})}</div>
                    <div class="stat-info">
                        <span class="stat-value">${this.formatMoney(totalPaid)}</span>
                        <span class="stat-label">${I18n.t('payroll.total_paid')}</span>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon bg-warning">${Icons.get('alert-circle', {size:24})}</div>
                    <div class="stat-info">
                        <span class="stat-value">${this.formatMoney(totalDue - totalPaid)}</span>
                        <span class="stat-label">${I18n.t('payroll.remaining_to_pay')}</span>
                    </div>
                </div>
            </div>
            
            <!-- Historique paiements -->
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">${I18n.t('payroll.payment_history')}</h3>
                </div>
                <div class="card-body">
                    <div class="table-wrapper">
                        <table class="table">
                            <thead>
                                <tr>
                                    <th>${I18n.t('payments.date')}</th>
                                    <th>${I18n.t('staff.name')}</th>
                                    <th>${I18n.t('payroll.period')}</th>
                                    <th>${I18n.t('payments.amount')}</th>
                                    <th>${I18n.t('payments.method')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${this.payments.length === 0 ? `
                                    <tr><td colspan="5" class="text-center text-muted py-md">${I18n.t('payroll.no_payments')}</td></tr>
                                ` : this.payments.map(pay => `
                                    <tr>
                                        <td>${new Date(pay.paid_at).toLocaleDateString(I18n.locale === 'fr' ? 'fr-FR' : 'en-US')}</td>
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
                        <span class="stat-label">${I18n.t('payroll.total_expenses')}</span>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon bg-info">${Icons.get('file-text', {size:24})}</div>
                    <div class="stat-info">
                        <span class="stat-value">${this.expenses.length}</span>
                        <span class="stat-label">${I18n.t('payroll.expense_count')}</span>
                    </div>
                </div>
            </div>
            
            <!-- Liste charges -->
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">${I18n.t('payroll.tab_expenses')}</h3>
                    <button class="btn btn-sm btn-primary" onclick="Views.payroll.showExpenseModal()">
                        ${Icons.get('plus', {size:14})} ${I18n.t('payroll.add')}
                    </button>
                </div>
                <div class="card-body">
                    <div class="table-wrapper">
                        <table class="table">
                            <thead>
                                <tr>
                                    <th>${I18n.t('payments.date')}</th>
                                    <th>${I18n.t('payroll.category')}</th>
                                    <th>${I18n.t('payroll.description')}</th>
                                    <th>${I18n.t('payments.amount')}</th>
                                    <th>${I18n.t('actions')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${this.expenses.length === 0 ? `
                                    <tr><td colspan="5" class="text-center text-muted py-md">${I18n.t('payroll.no_expenses')}</td></tr>
                                ` : this.expenses.map(exp => `
                                    <tr>
                                        <td>${new Date(exp.date).toLocaleDateString(I18n.locale === 'fr' ? 'fr-FR' : 'en-US')}</td>
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
            title: isEdit ? I18n.t('payroll.edit_employee') : I18n.t('payroll.new_employee'),
            size: 'lg',
            content: `
                <div class="form-section">
                    <h4 class="form-section-title">${I18n.t('payroll.personal_info')}</h4>
                    <div class="form-grid">
                        <div class="form-group">
                            <label class="form-label">${I18n.t('payroll.full_name')}</label>
                            <input type="text" class="form-input" id="emp-name" value="${employee?.name || ''}" placeholder="Jean Dupont">
                        </div>
                        <div class="form-group">
                            <label class="form-label">${I18n.t('payroll.position')}</label>
                            <input type="text" class="form-input" id="emp-position" value="${employee?.position || ''}">
                        </div>
                        <div class="form-group">
                            <label class="form-label">${I18n.t('staff.phone')}</label>
                            <input type="tel" class="form-input" id="emp-phone" value="${employee?.phone || ''}" placeholder="+86 138 0000 0000">
                        </div>
                        <div class="form-group">
                            <label class="form-label">${I18n.t('payroll.monthly_salary')}</label>
                            <input type="number" class="form-input" id="emp-salary" value="${employee?.salary || ''}" placeholder="300000">
                        </div>
                        <div class="form-group">
                            <label class="form-label">${I18n.t('payroll.hire_date')}</label>
                            <div id="emp-hire-date"></div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">${I18n.t('staff.status')}</label>
                            <div id="emp-status"></div>
                        </div>
                    </div>
                </div>
                
                <div class="form-section">
                    <h4 class="form-section-title">${I18n.t('payroll.user_account')}</h4>
                    <div class="form-grid">
                        <div class="form-group">
                            <label class="form-label">${I18n.t('staff.email')}</label>
                            <input type="email" class="form-input" id="emp-email" value="${employee?.email || ''}" placeholder="employe@expresscargo.com">
                        </div>
                        <div class="form-group">
                            <label class="form-label">${I18n.t('staff.role')}</label>
                            <div id="emp-role"></div>
                        </div>
                        <div class="form-group" id="emp-warehouse-group">
                            <label class="form-label">${I18n.t('payroll.warehouses')} *</label>
                            <div id="emp-warehouse" class="warehouse-checkboxes"></div>
                            <small class="form-hint">${I18n.t('payroll.warehouses_hint')}</small>
                        </div>
                        ${!isEdit ? `
                            <div class="form-group">
                                <label class="form-label">${I18n.t('payroll.password')}</label>
                                <input type="password" class="form-input" id="emp-password" placeholder="${I18n.t('payroll.min_8_chars')}">
                            </div>
                            <div class="form-group">
                                <label class="form-label">${I18n.t('payroll.confirm_password')}</label>
                                <input type="password" class="form-input" id="emp-password-confirm">
                            </div>
                        ` : `
                            <div class="form-group full-width">
                                <button class="btn btn-outline btn-sm" type="button" id="btn-change-password">
                                    ${Icons.get('edit', {size:14})} ${I18n.t('payroll.change_password')}
                                </button>
                            </div>
                        `}
                    </div>
                </div>
            `,
            footer: `
                <button class="btn btn-secondary" onclick="Modal.close()">${I18n.t('cancel')}</button>
                <button class="btn btn-primary" id="btn-save-employee">${isEdit ? I18n.t('save') : I18n.t('payroll.add')}</button>
            `
        });
        
        // Init DatePicker
        new DatePicker({
            container: '#emp-hire-date',
            placeholder: I18n.t('payroll.hire_date'),
            value: employee?.hire_date || new Date().toISOString().split('T')[0]
        });
        
        // Init SearchSelect pour statut
        const statusSelect = new SearchSelect({
            container: '#emp-status',
            placeholder: I18n.t('staff.status'),
            items: [
                { id: 'active', name: I18n.t('staff.active') },
                { id: 'inactive', name: I18n.t('staff.inactive') }
            ]
        });
        statusSelect.setValue(employee?.status || 'active');
        
        // Init SearchSelect pour role
        const roleSelect = new SearchSelect({
            container: '#emp-role',
            placeholder: I18n.t('staff.role'),
            items: [
                { id: 'staff', name: I18n.t('staff.employee') },
                { id: 'admin', name: I18n.t('staff.admin') }
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
                container.innerHTML = `<p class="text-muted text-sm">${I18n.t('payroll.no_warehouse')}</p>`;
            }
            
            return true;
        } catch (error) {
            console.error('Load warehouses error:', error);
            document.getElementById('emp-warehouse').innerHTML = `<p class="text-error text-sm">${I18n.t('payroll.error_loading')}</p>`;
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
            title: I18n.t('payroll.change_password_title').replace('{name}', employee.name),
            content: `
                <div class="form-group mb-md">
                    <label class="form-label">${I18n.t('payroll.new_password')}</label>
                    <input type="password" class="form-input" id="new-password" placeholder="${I18n.t('payroll.min_8_chars')}">
                </div>
                <div class="form-group">
                    <label class="form-label">${I18n.t('payroll.confirm_password')}</label>
                    <input type="password" class="form-input" id="confirm-password">
                </div>
            `,
            footer: `
                <button class="btn btn-secondary" onclick="Views.payroll.showEmployeeModal('${employeeId}')">${I18n.t('payroll.back')}</button>
                <button class="btn btn-primary" id="btn-save-password">${I18n.t('save')}</button>
            `
        });
        
        document.getElementById('btn-save-password')?.addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            const newPwd = document.getElementById('new-password').value;
            const confirmPwd = document.getElementById('confirm-password').value;
            
            if (newPwd.length < 8) {
                Toast.error(I18n.t('payroll.password_min_8'));
                return;
            }
            if (newPwd !== confirmPwd) {
                Toast.error(I18n.t('payroll.passwords_mismatch'));
                return;
            }
            
            try {
                Loader.button(btn, true, { text: '...' });
                await API.staff.resetPassword(employeeId);
                Toast.success(I18n.t('payroll.password_reset'));
                this.showEmployeeModal(employeeId);
            } catch (error) {
                console.error('Change password error:', error);
                Toast.error(error.message);
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
            Toast.error(I18n.t('payroll.fill_required'));
            return;
        }
        if (role === 'staff' && warehouseIds.length === 0) {
            Toast.error(I18n.t('payroll.select_warehouse'));
            return;
        }
        
        // Séparer le nom en prénom et nom
        const nameParts = name.split(' ');
        const firstName = nameParts[0];
        const lastName = nameParts.slice(1).join(' ') || firstName;
        
        try {
            if (!btn) btn = document.getElementById('btn-save-employee');
            Loader.button(btn, true, { text: '...' });
            
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
                Toast.success(I18n.t('payroll.employee_updated'));
            } else {
                // Création
                const password = document.getElementById('emp-password')?.value;
                const passwordConfirm = document.getElementById('emp-password-confirm')?.value;
                
                if (!password || password.length < 8) {
                    Toast.error(I18n.t('payroll.password_min_8'));
                    return;
                }
                if (password !== passwordConfirm) {
                    Toast.error(I18n.t('payroll.passwords_mismatch'));
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
                Toast.success(I18n.t('payroll.employee_added'));
            }
            
            Modal.close();
            this.loadData();
        } catch (error) {
            console.error('Save employee error:', error);
            Toast.error(error.message);
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
            title: I18n.t('payroll.access_title').replace('{name}', employee.name),
            content: `
                <p class="text-sm text-muted mb-md">${I18n.t('payroll.define_permissions')}</p>
                <div class="access-list">
                    ${allPermissions.map(p => `
                        <label class="access-item">
                            <input type="checkbox" value="${p.id}" ${employee.permissions?.includes(p.id) ? 'checked' : ''}>
                            <span>${p.label}</span>
                        </label>
                    `).join('')}
                </div>
                <div class="access-actions mt-md">
                    <button class="btn btn-sm btn-ghost" type="button" id="btn-select-all">${I18n.t('payroll.select_all')}</button>
                    <button class="btn btn-sm btn-ghost" type="button" id="btn-deselect-all">${I18n.t('payroll.deselect_all')}</button>
                </div>
            `,
            footer: `
                <button class="btn btn-secondary" onclick="Modal.close()">${I18n.t('cancel')}</button>
                <button class="btn btn-primary" id="btn-save-access">${I18n.t('save')}</button>
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
                Loader.button(btn, true, { text: '...' });
                await API.staff.updatePermissions(employeeId, permissions);
                Toast.success(I18n.t('payroll.access_updated'));
                Modal.close();
                this.loadData();
            } catch (error) {
                console.error('Update permissions error:', error);
                Toast.error(error.message);
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
            title: I18n.t('payroll.pay_salary_title').replace('{name}', employee.name),
            content: `
                <div class="pay-salary-info mb-md">
                    <div class="info-row">
                        <span class="label">${I18n.t('staff.name')}</span>
                        <span class="value font-medium">${employee.name}</span>
                    </div>
                    <div class="info-row">
                        <span class="label">${I18n.t('payroll.position')}</span>
                        <span class="value">${employee.position}</span>
                    </div>
                    <div class="info-row">
                        <span class="label">${I18n.t('payroll.salary')}</span>
                        <span class="value text-success font-medium">${this.formatMoney(employee.salary)}</span>
                    </div>
                </div>
                
                <div class="form-group mb-md">
                    <label class="form-label">${I18n.t('payroll.period_month')}</label>
                    <input type="month" class="form-input" id="pay-month" value="${currentMonth}">
                </div>
                
                <div class="form-group mb-md">
                    <label class="form-label">${I18n.t('payments.amount')}</label>
                    <input type="number" class="form-input" id="pay-amount" value="${employee.salary}">
                </div>
                
                <div class="form-group">
                    <label class="form-label">${I18n.t('payroll.payment_method')}</label>
                    <div id="pay-method"></div>
                </div>
            `,
            footer: `
                <button class="btn btn-secondary" onclick="Modal.close()">${I18n.t('cancel')}</button>
                <button class="btn btn-primary" id="btn-confirm-pay">${I18n.t('payroll.confirm_payment')}</button>
            `
        });
        
        const methodSelect = new SearchSelect({
            container: '#pay-method',
            placeholder: I18n.t('payroll.payment_method'),
            items: [
                { id: 'virement', name: 'Virement bancaire' },
                { id: 'mobile_money', name: 'Mobile Money' },
                { id: 'especes', name: 'Espèces' }
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
            Toast.error(I18n.t('payroll.fill_required'));
            return;
        }
        
        const [year, monthNum] = month.split('-').map(Number);
        
        try {
            if (!btn) btn = document.getElementById('btn-confirm-pay');
            Loader.button(btn, true, { text: '...' });
            
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
            
            Toast.success(I18n.t('payroll.salary_paid'));
            Modal.close();
            this.loadData();
        } catch (error) {
            console.error('Pay salary error:', error);
            Toast.error(error.message);
        } finally {
            Loader.button(btn, false);
        }
    },
    
    showExpenseModal() {
        Modal.open({
            title: I18n.t('payroll.new_expense_title'),
            content: `
                <div class="form-group mb-md">
                    <label class="form-label">${I18n.t('payroll.category')}</label>
                    <div id="expense-category"></div>
                </div>
                <div class="form-group mb-md">
                    <label class="form-label">${I18n.t('payroll.description')}</label>
                    <input type="text" class="form-input" id="expense-desc" placeholder="${I18n.t('payroll.expense_desc_placeholder')}">
                </div>
                <div class="form-group mb-md">
                    <label class="form-label">${I18n.t('payments.amount')} (XAF)</label>
                    <input type="number" class="form-input" id="expense-amount" placeholder="0">
                </div>
                <div class="form-group">
                    <label class="form-label">${I18n.t('payments.date')}</label>
                    <div id="expense-date"></div>
                </div>
            `,
            footer: `
                <button class="btn btn-secondary" onclick="Modal.close()">${I18n.t('cancel')}</button>
                <button class="btn btn-primary" id="btn-save-expense">${I18n.t('save')}</button>
            `
        });
        
        const categorySelect = new SearchSelect({
            container: '#expense-category',
            placeholder: I18n.t('payroll.category'),
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
            placeholder: I18n.t('payments.date'),
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
            Toast.error(I18n.t('payroll.fill_required'));
            return;
        }
        
        try {
            if (!btn) btn = document.getElementById('btn-save-expense');
            Loader.button(btn, true, { text: '...' });
            
            await API.accounting.addExpense({
                category,
                description,
                amount,
                date: new Date().toISOString().split('T')[0]
            });
            
            Toast.success(I18n.t('payroll.expense_saved'));
            Modal.close();
            this.loadData();
        } catch (error) {
            console.error('Save expense error:', error);
            Toast.error(error.message);
        } finally {
            Loader.button(btn, false);
        }
    },
    
    async deleteExpense(expenseId, btn = null) {
        const confirmed = await Modal.confirm({
            title: I18n.t('payroll.delete_expense'),
            message: I18n.t('payroll.delete_expense_msg'),
            danger: true
        });
        
        if (!confirmed) return;
        
        try {
            Loader.button(btn, true, { text: '' });
            await API.accounting.deleteExpense(expenseId);
            Toast.success(I18n.t('payroll.expense_deleted'));
            this.loadData();
        } catch (error) {
            console.error('Delete expense error:', error);
            Toast.error(error.message);
        } finally {
            Loader.button(btn, false);
        }
    },
    
    // ========================================
    // HELPERS
    // ========================================
    
    formatMoney(amount) {
        return new Intl.NumberFormat(I18n.locale === 'fr' ? 'fr-FR' : 'en-US').format(amount) + ' XAF';
    },
    
    formatMonth(monthStr) {
        const [year, month] = monthStr.split('-');
        const date = new Date(parseInt(year), parseInt(month) - 1, 1);
        return date.toLocaleDateString(I18n.locale === 'fr' ? 'fr-FR' : 'en-US', { month: 'long', year: 'numeric' });
    },
    
    getPaymentMethodLabel(method) {
        const labels = { virement: 'Virement', mobile_money: 'Mobile Money', especes: 'Espèces' };
        return labels[method] || method;
    },
    
    getExpenseCategoryLabel(cat) {
        const labels = {
            loyer: 'Loyer', utilities: 'Utilities', fournitures: 'Fournitures',
            transport: 'Transport', communication: 'Communication', maintenance: 'Maintenance',
            taxes: 'Taxes', other: I18n.locale === 'fr' ? 'Autres' : 'Other'
        };
        return labels[cat] || cat;
    }
};
