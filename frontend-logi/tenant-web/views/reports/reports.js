/**
 * Vue Reports - Rapports financiers et statistiques
 */

Views.reports = {
    charts: {},
    currentPeriod: 'month',
    currentYear: new Date().getFullYear(),
    currentMonth: new Date().getMonth(),
    currentTab: 'statistics', // 'statistics', 'departures', 'accounting'
    departuresData: [],
    expenseCategorySelect: null,
    
    render() {
        const main = document.getElementById('main-content');
        
        main.innerHTML = `
            <div class="reports-page">
                <div class="page-header">
                    <h1 class="page-title">Rapports</h1>
                    <div class="header-actions">
                        <button class="btn btn-outline" id="btn-export-pdf">
                            ${Icons.get('download', {size:16})} Export PDF
                        </button>
                        <button class="btn btn-outline" id="btn-export-excel">
                            ${Icons.get('download', {size:16})} Export Excel
                        </button>
                    </div>
                </div>
                
                <!-- Onglets principaux -->
                <div class="reports-main-tabs mb-md">
                    <button class="main-tab ${this.currentTab === 'statistics' ? 'active' : ''}" data-main-tab="statistics">
                        ${Icons.get('trending-up', {size:16})} Statistiques
                    </button>
                    <button class="main-tab ${this.currentTab === 'departures' ? 'active' : ''}" data-main-tab="departures">
                        ${Icons.get('truck', {size:16})} Departs
                    </button>
                    <button class="main-tab ${this.currentTab === 'accounting' ? 'active' : ''}" data-main-tab="accounting">
                        ${Icons.get('dollar-sign', {size:16})} Comptabilite
                    </button>
                </div>
                
                <!-- Filtres periode -->
                <div class="card mb-md">
                    <div class="card-body">
                        <div class="period-filters">
                            <div class="period-tabs">
                                <button class="period-tab ${this.currentPeriod === 'week' ? 'active' : ''}" data-period="week">Semaine</button>
                                <button class="period-tab ${this.currentPeriod === 'month' ? 'active' : ''}" data-period="month">Mois</button>
                                <button class="period-tab ${this.currentPeriod === 'quarter' ? 'active' : ''}" data-period="quarter">Trimestre</button>
                                <button class="period-tab ${this.currentPeriod === 'year' ? 'active' : ''}" data-period="year">Annee</button>
                            </div>
                            <div class="period-selector">
                                <button class="btn btn-ghost btn-sm" id="btn-prev-period">${Icons.get('chevron-left', {size:16})}</button>
                                <span class="period-label" id="period-label"></span>
                                <button class="btn btn-ghost btn-sm" id="btn-next-period">${Icons.get('chevron-right', {size:16})}</button>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Contenu dynamique selon l'onglet -->
                <div id="reports-content"></div>
            </div>
        `;
        
        this.updatePeriodLabel();
        this.renderCurrentTab();
        this.attachEvents();
    },
    
    renderCurrentTab() {
        if (this.currentTab === 'statistics') {
            this.renderStatisticsTab();
        } else if (this.currentTab === 'departures') {
            this.renderDeparturesTab();
        } else {
            this.renderAccountingTab();
        }
    },
    
    renderStatisticsTab() {
        const container = document.getElementById('reports-content');
        container.innerHTML = `
                
            <!-- KPIs principaux -->
            <div class="stats-grid stats-grid-5 mb-md">
                <div class="stat-card">
                    <div class="stat-icon bg-success">${Icons.get('dollar-sign', {size:24})}</div>
                    <div class="stat-info">
                        <span class="stat-value" id="kpi-revenue">-</span>
                        <span class="stat-label">Chiffre d'affaires</span>
                        <span class="stat-change" id="kpi-revenue-change"></span>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon bg-primary">${Icons.get('package', {size:24})}</div>
                    <div class="stat-info">
                        <span class="stat-value" id="kpi-packages">-</span>
                        <span class="stat-label">Colis traites</span>
                        <span class="stat-change" id="kpi-packages-change"></span>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon bg-info">${Icons.get('users', {size:24})}</div>
                    <div class="stat-info">
                        <span class="stat-value" id="kpi-clients">-</span>
                        <span class="stat-label">Nouveaux clients</span>
                        <span class="stat-change" id="kpi-clients-change"></span>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon bg-success">${Icons.get('check-circle', {size:24})}</div>
                    <div class="stat-info">
                        <span class="stat-value" id="kpi-delivery-rate">-</span>
                        <span class="stat-label">Taux livraison</span>
                        <span class="stat-change" id="kpi-delivery-change"></span>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon bg-warning">${Icons.get('alert-circle', {size:24})}</div>
                    <div class="stat-info">
                        <span class="stat-value" id="kpi-unpaid">-</span>
                        <span class="stat-label">Impayes</span>
                        <span class="stat-change" id="kpi-unpaid-change"></span>
                    </div>
                </div>
            </div>
            
            <!-- Graphiques principaux -->
            <div class="charts-grid mb-md">
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Evolution du chiffre d'affaires</h3>
                    </div>
                    <div class="card-body">
                        <canvas id="chart-revenue" height="300"></canvas>
                    </div>
                </div>
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Volume de colis</h3>
                    </div>
                    <div class="card-body">
                        <canvas id="chart-packages" height="300"></canvas>
                    </div>
                </div>
            </div>
            
            <!-- Repartitions -->
            <div class="charts-grid charts-grid-3 mb-md">
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Par mode de transport</h3>
                    </div>
                    <div class="card-body">
                        <canvas id="chart-transport" height="250"></canvas>
                    </div>
                </div>
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Par methode de paiement</h3>
                    </div>
                    <div class="card-body">
                        <canvas id="chart-payment-methods" height="250"></canvas>
                    </div>
                </div>
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Statut des colis</h3>
                    </div>
                    <div class="card-body">
                        <canvas id="chart-status" height="250"></canvas>
                    </div>
                </div>
            </div>
            
            <!-- Tableaux detailles -->
            <div class="reports-tables">
                <!-- Clients inconnus -->
                <div class="card mb-md">
                    <div class="card-header">
                        <h3 class="card-title">Clients inconnus</h3>
                    </div>
                    <div class="card-body" id="unknown-clients-summary"></div>
                </div>

                <!-- Top clients -->
                <div class="card mb-md">
                    <div class="card-header">
                        <h3 class="card-title">Top 10 clients</h3>
                    </div>
                    <div class="card-body" id="top-clients-table"></div>
                </div>
                
                <!-- Revenus par destination -->
                <div class="charts-grid mb-md">
                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">Revenus par destination</h3>
                        </div>
                        <div class="card-body" id="revenue-by-destination"></div>
                    </div>
                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">Performance par entrepot</h3>
                        </div>
                        <div class="card-body" id="warehouse-performance"></div>
                    </div>
                </div>
                
                <!-- Analyse des delais -->
                <div class="card mb-md">
                    <div class="card-header">
                        <h3 class="card-title">Analyse des delais de livraison</h3>
                    </div>
                    <div class="card-body">
                        <canvas id="chart-delivery-times" height="200"></canvas>
                    </div>
                </div>
                
                <!-- Comparaison mensuelle -->
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Comparaison mensuelle</h3>
                    </div>
                    <div class="card-body" id="monthly-comparison"></div>
                </div>
            </div>
        `;
        
        this.loadData();
    },
    
    renderDeparturesTab() {
        const container = document.getElementById('reports-content');
        container.innerHTML = `
            <!-- Resume financier des departs -->
            <div class="stats-grid stats-grid-4 mb-md">
                <div class="stat-card">
                    <div class="stat-icon bg-success">${Icons.get('dollar-sign', {size:24})}</div>
                    <div class="stat-info">
                        <span class="stat-value" id="dep-total-revenue">-</span>
                        <span class="stat-label">Total Revenus</span>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon bg-danger">${Icons.get('dollar-sign', {size:24})}</div>
                    <div class="stat-info">
                        <span class="stat-value" id="dep-total-expenses">-</span>
                        <span class="stat-label">Total Depenses</span>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon bg-primary">${Icons.get('trending-up', {size:24})}</div>
                    <div class="stat-info">
                        <span class="stat-value" id="dep-total-gain">-</span>
                        <span class="stat-label">Gain Net</span>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon bg-info">${Icons.get('trending-up', {size:24})}</div>
                    <div class="stat-info">
                        <span class="stat-value" id="dep-avg-margin">-</span>
                        <span class="stat-label">Marge Moyenne</span>
                    </div>
                </div>
            </div>
            
            <!-- Liste des departs -->
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">Departs de la periode</h3>
                </div>
                <div class="card-body">
                    <div id="departures-list">${Loader.inline()}</div>
                </div>
            </div>
        `;
        
        this.loadDeparturesData();
    },
    
    async loadDeparturesData() {
        try {
            // Charger les départs depuis l'API
            const data = await API.departures.getAll();
            const allDepartures = (data.departures || []).map(d => ({
                ...d,
                date: d.departure_date,
                title: d.notes || d.reference || `Départ ${d.transport_mode}`,
                destination: CONFIG.DESTINATIONS[d.dest_country]?.label || d.dest_country,
                expenses: d.expenses || [],
                total_revenue: d.total_revenue || 0  // Revenu calculé côté backend
            }));
            
            // Filtrer par periode
            const filtered = this.filterDeparturesByPeriod(allDepartures);
            this.departuresData = filtered;
            
            // Charger les dépenses pour chaque départ filtré
            await Promise.all(filtered.map(async (d) => {
                try {
                    const expData = await API.accounting.getDepartureExpenses(d.id);
                    d.expenses = expData.expenses || [];
                } catch (e) {
                    d.expenses = [];
                }
            }));
            
            // Calculer les totaux
            let totalRevenue = 0, totalExpenses = 0;
            filtered.forEach(d => {
                totalRevenue += d.total_revenue || 0;
                (d.expenses || []).forEach(e => totalExpenses += e.amount || 0);
            });
            const totalGain = totalRevenue - totalExpenses;
            const avgMargin = totalRevenue > 0 ? (totalGain / totalRevenue * 100).toFixed(1) : 0;
            
            // Mettre a jour les KPIs
            const setDepEl = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
            setDepEl('dep-total-revenue', this.formatMoney(totalRevenue));
            setDepEl('dep-total-expenses', this.formatMoney(totalExpenses));
            setDepEl('dep-total-gain', this.formatMoney(totalGain));
            const gainEl = document.getElementById('dep-total-gain');
            if (gainEl) {
                gainEl.classList.toggle('text-success', totalGain >= 0);
                gainEl.classList.toggle('text-error', totalGain < 0);
            }
            setDepEl('dep-avg-margin', avgMargin + '%');
            
            // Afficher la liste
            this.renderDeparturesList(filtered);
        } catch (error) {
            console.error('Load departures error:', error);
            const depList = document.getElementById('departures-list');
            if (depList) {
                depList.innerHTML = `
                    <div class="empty-state">
                        ${Icons.get('alert-circle', {size:32})}
                        <p>Erreur de chargement: ${error.message}</p>
                    </div>
                `;
            }
        }
    },
    
    filterDeparturesByPeriod(departures) {
        let start, end;
        const today = new Date();
        
        switch (this.currentPeriod) {
            case 'week':
                // Semaine courante (lundi à dimanche)
                const dayOfWeek = today.getDay();
                const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
                start = new Date(today);
                start.setDate(today.getDate() + mondayOffset);
                end = new Date(start);
                end.setDate(start.getDate() + 6);
                break;
            case 'month':
                start = new Date(this.currentYear, this.currentMonth, 1);
                end = new Date(this.currentYear, this.currentMonth + 1, 0);
                break;
            case 'quarter':
                const qStart = Math.floor(this.currentMonth / 3) * 3;
                start = new Date(this.currentYear, qStart, 1);
                end = new Date(this.currentYear, qStart + 3, 0);
                break;
            case 'year':
                start = new Date(this.currentYear, 0, 1);
                end = new Date(this.currentYear, 11, 31);
                break;
        }
        
        // Normaliser les dates pour comparaison (début de journée)
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        
        return departures.filter(d => {
            const date = new Date(d.date);
            return date >= start && date <= end;
        });
    },
    
    renderDeparturesList(departures) {
        const container = document.getElementById('departures-list');
        
        if (departures.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    ${Icons.get('calendar', {size:48})}
                    <p>Aucun depart effectue sur cette periode</p>
                </div>
            `;
            return;
        }
        
        const transportLabels = {
            air_express: 'Aerien Express',
            air_normal: 'Aerien Normal',
            sea: 'Maritime'
        };
        
        container.innerHTML = `
            <div class="table-wrapper">
                <table class="table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Depart</th>
                            <th>Transport</th>
                            <th>Colis</th>
                            <th>Revenus</th>
                            <th>Depenses</th>
                            <th>Gain</th>
                            <th>Marge</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${departures.map(d => {
                            const totalExp = (d.expenses || []).reduce((s, e) => s + (e.amount || 0), 0);
                            const revenue = d.total_revenue || 0;
                            const gain = revenue - totalExp;
                            const margin = revenue > 0 ? (gain / revenue * 100).toFixed(1) : 0;
                            const departTitle = d.title || d.notes || d.reference || `Départ ${d.transport_mode}`;
                            const destination = d.destination || CONFIG.DESTINATIONS[d.dest_country]?.label || d.dest_country || '-';
                            
                            return `
                                <tr>
                                    <td>${d.date ? new Date(d.date).toLocaleDateString('fr-FR') : '-'}</td>
                                    <td>
                                        <div class="font-medium">${departTitle}</div>
                                        <div class="text-sm text-muted">${destination}</div>
                                    </td>
                                    <td><span class="transport-badge transport-${d.transport_mode}">${transportLabels[d.transport_mode] || d.transport_mode}</span></td>
                                    <td>${d.packages_count || 0}</td>
                                    <td class="text-success">${revenue > 0 ? this.formatMoney(revenue) : '-'}</td>
                                    <td class="text-error">${totalExp > 0 ? '-' + this.formatMoney(totalExp) : '-'}</td>
                                    <td class="${gain >= 0 ? 'text-success' : 'text-error'} font-medium">${revenue > 0 || totalExp > 0 ? this.formatMoney(gain) : '-'}</td>
                                    <td>${revenue > 0 ? `<span class="status-badge ${margin >= 30 ? 'status-delivered' : margin >= 15 ? 'status-transit' : 'status-customs'}">${margin}%</span>` : '-'}</td>
                                    <td>
                                        <div class="table-actions">
                                            <button class="btn btn-sm btn-outline" onclick="Views.reports.showExpensesModal('${d.id}')" title="Gerer les depenses">
                                                ${Icons.get('dollar-sign', {size:14})}
                                                ${(d.expenses || []).length > 0 ? `<span class="badge-count">${d.expenses.length}</span>` : ''}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    },
    
    renderAccountingTab() {
        const container = document.getElementById('reports-content');
        container.innerHTML = `<div class="text-center py-md">${Loader.inline()}</div>`;
        
        // Charger les donnees comptables
        this.loadAccountingData().then(data => {
            this.renderAccountingContent(container, data);
        });
    },
    
    async loadAccountingData() {
        // ============================================
        // Charger les donnees comptables depuis l'API
        // GET /api/admin/accounting?period=month&year=2026&month=1
        // ============================================
        
        try {
            // Appeler l'API comptabilité avec les paramètres de période
            const data = await API.accounting.getData({
                period: this.currentPeriod,
                year: this.currentYear,
                month: this.currentMonth + 1  // JavaScript months are 0-indexed
            });
            
            // L'API retourne directement le format attendu par le frontend
            return {
                period: {
                    start: new Date(data.period.start),
                    end: new Date(data.period.end)
                },
                income: data.income,
                expenses: data.expenses,
                totals: data.totals,
                chargesByCategory: data.chargesByCategory
            };
            
        } catch (error) {
            console.error('Load accounting data error:', error);
            // Retourner des donnees vides en cas d'erreur
            const periodStart = new Date(this.currentYear, this.currentMonth, 1);
            const periodEnd = new Date(this.currentYear, this.currentMonth + 1, 0);
            
            return {
                period: { start: periodStart, end: periodEnd },
                income: { payments: [], other: [] },
                expenses: { departures: [], salaries: [], charges: [] },
                totals: {
                    income: { payments: 0, other: 0, total: 0 },
                    expenses: { departures: 0, salaries: 0, charges: 0, total: 0 },
                    netProfit: 0,
                    margin: 0
                },
                chargesByCategory: {},
                error: error.message
            };
        }
    },
    
    renderAccountingContent(container, data) {
        const { totals, income, expenses, chargesByCategory } = data;
        
        // Afficher un message d'erreur si le chargement a echoue
        if (data.error) {
            container.innerHTML = `
                <div class="empty-state">
                    ${Icons.get('alert-circle', {size:48})}
                    <p>Erreur de chargement des donnees comptables</p>
                    <p class="text-muted text-sm">${data.error}</p>
                </div>
            `;
            return;
        }
        
        // Stocker les donnees pour la pagination
        this.accountingData = data;
        
        const ITEMS_PER_PAGE = 5;
        
        // Verifier si on a des donnees
        const hasData = income.payments.length > 0 || income.other.length > 0 || 
                        expenses.departures.length > 0 || expenses.salaries.length > 0 || expenses.charges.length > 0;
        
        container.innerHTML = `
            <!-- Bilan global -->
            <div class="stats-grid mb-md">
                <div class="stat-card">
                    <div class="stat-icon bg-success">${Icons.get('download', {size:24})}</div>
                    <div class="stat-info">
                        <span class="stat-value">${this.formatMoney(totals.income.total)}</span>
                        <span class="stat-label">Total Entrees</span>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon bg-danger">${Icons.get('send', {size:24})}</div>
                    <div class="stat-info">
                        <span class="stat-value">${this.formatMoney(totals.expenses.total)}</span>
                        <span class="stat-label">Total Sorties</span>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon ${totals.netProfit >= 0 ? 'bg-primary' : 'bg-danger'}">${Icons.get('dollar-sign', {size:24})}</div>
                    <div class="stat-info">
                        <span class="stat-value ${totals.netProfit >= 0 ? 'text-success' : 'text-error'}">${totals.netProfit >= 0 ? '+' : ''}${this.formatMoney(totals.netProfit)}</span>
                        <span class="stat-label">Resultat Net</span>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon bg-info">${Icons.get('trending-up', {size:24})}</div>
                    <div class="stat-info">
                        <span class="stat-value">${totals.margin}%</span>
                        <span class="stat-label">Marge Nette</span>
                    </div>
                </div>
            </div>
            
            ${!hasData ? `
                <div class="empty-state mb-md">
                    ${Icons.get('file-text', {size:48})}
                    <p>Aucune donnee comptable sur cette periode</p>
                    <p class="text-muted text-sm">Les paiements et depenses apparaitront ici une fois enregistres</p>
                </div>
            ` : ''}
            
            <!-- Details Entrees/Sorties -->
            <div class="accounting-details mb-md">
                <!-- Entrees -->
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title text-success">${Icons.get('arrow-down', {size:18})} Entrees (Recettes)</h3>
                    </div>
                    <div class="card-body">
                        <div class="accounting-list">
                            <div class="accounting-item clickable" onclick="Views.reports.toggleDetail('income-payments')">
                                <span class="item-label">${Icons.get('chevron-right', {size:14})} Paiements clients (${income.payments.length})</span>
                                <span class="item-value text-success">+${this.formatMoney(totals.income.payments)}</span>
                            </div>
                            <div class="accounting-detail hidden" id="income-payments">
                                ${this.renderDetailRows(income.payments, 'payment', ITEMS_PER_PAGE)}
                            </div>
                            
                            <div class="accounting-item clickable" onclick="Views.reports.toggleDetail('income-other')">
                                <span class="item-label">${Icons.get('chevron-right', {size:14})} Autres revenus (${income.other.length})</span>
                                <span class="item-value text-success">+${this.formatMoney(totals.income.other)}</span>
                            </div>
                            <div class="accounting-detail hidden" id="income-other">
                                ${this.renderDetailRows(income.other, 'other-income', ITEMS_PER_PAGE)}
                            </div>
                            
                            <div class="accounting-item total">
                                <span class="item-label">Total Entrees</span>
                                <span class="item-value text-success font-semibold">+${this.formatMoney(totals.income.total)}</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Sorties -->
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title text-error">${Icons.get('arrow-up', {size:18})} Sorties (Charges)</h3>
                    </div>
                    <div class="card-body">
                        <div class="accounting-list">
                            <div class="accounting-item clickable" onclick="Views.reports.toggleDetail('exp-departures')">
                                <span class="item-label">${Icons.get('chevron-right', {size:14})} Depenses departs (${expenses.departures.length})</span>
                                <span class="item-value text-error">-${this.formatMoney(totals.expenses.departures)}</span>
                            </div>
                            <div class="accounting-detail hidden" id="exp-departures">
                                ${this.renderDetailRows(expenses.departures, 'departure', ITEMS_PER_PAGE)}
                            </div>
                            
                            <div class="accounting-item clickable" onclick="Views.reports.toggleDetail('exp-salaries')">
                                <span class="item-label">${Icons.get('chevron-right', {size:14})} Salaires (${expenses.salaries.length})</span>
                                <span class="item-value text-error">-${this.formatMoney(totals.expenses.salaries)}</span>
                            </div>
                            <div class="accounting-detail hidden" id="exp-salaries">
                                ${this.renderDetailRows(expenses.salaries, 'salary', ITEMS_PER_PAGE)}
                            </div>
                            
                            <div class="accounting-item clickable" onclick="Views.reports.toggleDetail('exp-charges')">
                                <span class="item-label">${Icons.get('chevron-right', {size:14})} Charges diverses (${expenses.charges.length})</span>
                                <span class="item-value text-error">-${this.formatMoney(totals.expenses.charges)}</span>
                            </div>
                            <div class="accounting-detail hidden" id="exp-charges">
                                ${this.renderDetailRows(expenses.charges, 'charge', ITEMS_PER_PAGE)}
                            </div>
                            
                            <div class="accounting-item total">
                                <span class="item-label">Total Sorties</span>
                                <span class="item-value text-error font-semibold">-${this.formatMoney(totals.expenses.total)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Graphiques -->
            <div class="charts-grid">
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Repartition des sorties</h3>
                    </div>
                    <div class="card-body">
                        <canvas id="chart-expenses-breakdown" height="250"></canvas>
                    </div>
                </div>
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Charges par categorie</h3>
                    </div>
                    <div class="card-body">
                        <canvas id="chart-charges-category" height="250"></canvas>
                    </div>
                </div>
            </div>
        `;
        
        // Render charts
        this.renderExpensesBreakdownChart(totals.expenses);
        this.renderChargesCategoryChart(chargesByCategory);
    },
    
    renderDetailRows(items, type, limit) {
        if (items.length === 0) {
            return '<div class="detail-row text-muted">Aucun</div>';
        }
        
        const isIncome = type === 'payment' || type === 'other-income';
        const colorClass = isIncome ? 'text-success' : 'text-error';
        const sign = isIncome ? '+' : '-';
        
        const visibleItems = items.slice(0, limit);
        const hiddenItems = items.slice(limit);
        
        let html = '<div class="detail-rows-container">';
        
        // Lignes visibles
        html += visibleItems.map(item => {
            const label = this.getDetailLabel(item, type);
            return `
                <div class="detail-row">
                    <span>${new Date(item.date).toLocaleDateString('fr-FR')} - ${label}</span>
                    <span class="${colorClass}">${sign}${this.formatMoney(item.amount)}</span>
                </div>
            `;
        }).join('');
        
        // Lignes cachees + bouton "Afficher plus"
        if (hiddenItems.length > 0) {
            html += `<div class="detail-rows-hidden hidden" data-type="${type}">`;
            html += hiddenItems.map(item => {
                const label = this.getDetailLabel(item, type);
                return `
                    <div class="detail-row">
                        <span>${new Date(item.date).toLocaleDateString('fr-FR')} - ${label}</span>
                        <span class="${colorClass}">${sign}${this.formatMoney(item.amount)}</span>
                    </div>
                `;
            }).join('');
            html += '</div>';
            
            html += `
                <button class="btn-show-more" onclick="Views.reports.showMoreDetails('${type}', this)">
                    ${Icons.get('chevron-down', {size:14})}
                    <span>Afficher ${hiddenItems.length} de plus</span>
                </button>
            `;
        }
        
        html += '</div>';
        return html;
    },
    
    getDetailLabel(item, type) {
        switch (type) {
            case 'payment': return item.client;
            case 'other-income': return item.description;
            case 'departure': return item.description;
            case 'salary': return item.employee;
            case 'charge': return item.description;
            default: return item.description || '';
        }
    },
    
    showMoreDetails(type, btn) {
        const hiddenContainer = document.querySelector(`.detail-rows-hidden[data-type="${type}"]`);
        if (hiddenContainer) {
            hiddenContainer.classList.remove('hidden');
            btn.remove();
        }
    },
    toggleDetail(id) {
        const el = document.getElementById(id);
        if (el) {
            el.classList.toggle('hidden');
            // Rotate chevron
            const item = el.previousElementSibling;
            item?.classList.toggle('expanded');
        }
    },
    
    renderExpensesBreakdownChart(expensesTotals) {
        this.destroyChart('expensesBreakdown');
        const ctx = document.getElementById('chart-expenses-breakdown');
        if (!ctx) return;
        
        this.charts.expensesBreakdown = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Departs', 'Salaires', 'Charges diverses'],
                datasets: [{
                    data: [expensesTotals.departures, expensesTotals.salaries, expensesTotals.charges],
                    backgroundColor: ['#3b82f6', '#f59e0b', '#8b5cf6']
                }]
            },
            options: this.getDoughnutOptions()
        });
    },
    
    renderChargesCategoryChart(chargesByCategory) {
        this.destroyChart('chargesCategory');
        const ctx = document.getElementById('chart-charges-category');
        if (!ctx) return;
        
        const categoryLabels = {
            loyer: 'Loyer', utilities: 'Utilities', fournitures: 'Fournitures',
            transport: 'Transport', communication: 'Communication', 
            maintenance: 'Maintenance', taxes: 'Taxes', other: 'Autres'
        };
        
        const categoryColors = {
            loyer: '#8b5cf6', utilities: '#06b6d4', fournitures: '#f59e0b',
            transport: '#10b981', communication: '#3b82f6',
            maintenance: '#ec4899', taxes: '#dc2626', other: '#6b7280'
        };
        
        const labels = Object.keys(chargesByCategory).map(k => categoryLabels[k] || k);
        const data = Object.values(chargesByCategory);
        const colors = Object.keys(chargesByCategory).map(k => categoryColors[k] || '#6b7280');
        
        this.charts.chargesCategory = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{ data, backgroundColor: colors }]
            },
            options: this.getDoughnutOptions()
        });
    },
    
    showExpensesModal(departureId) {
        const departure = this.departuresData.find(d => d.id === departureId);
        if (!departure) return;
        
        const totalExpenses = departure.expenses.reduce((s, e) => s + e.amount, 0);
        const gain = departure.total_revenue - totalExpenses;
        
        const categoryOptions = [
            { id: 'freight', name: 'Fret' },
            { id: 'customs', name: 'Douane' },
            { id: 'transport', name: 'Transport' },
            { id: 'handling', name: 'Manutention' },
            { id: 'storage', name: 'Stockage' },
            { id: 'insurance', name: 'Assurance' },
            { id: 'other', name: 'Divers' }
        ];
        
        const getCategoryLabel = (cat) => categoryOptions.find(c => c.id === cat)?.name || cat;
        
        Modal.open({
            title: `Depenses - ${departure.title}`,
            size: 'lg',
            content: `
                <!-- Resume -->
                <div class="expense-summary mb-md">
                    <div class="expense-summary-item">
                        <span class="label">Revenus</span>
                        <span class="value text-success">${this.formatMoney(departure.total_revenue)}</span>
                    </div>
                    <div class="expense-summary-item">
                        <span class="label">Depenses</span>
                        <span class="value text-error" id="modal-total-expenses">${this.formatMoney(totalExpenses)}</span>
                    </div>
                    <div class="expense-summary-item">
                        <span class="label">Gain</span>
                        <span class="value ${gain >= 0 ? 'text-success' : 'text-error'}" id="modal-gain">${this.formatMoney(gain)}</span>
                    </div>
                </div>
                
                <!-- Liste des depenses -->
                <div class="expenses-list mb-md" id="expenses-list">
                    ${departure.expenses.length === 0 ? 
                        '<p class="text-muted text-center py-md">Aucune depense enregistree</p>' :
                        departure.expenses.map(e => `
                            <div class="expense-item" data-id="${e.id}">
                                <div class="expense-info">
                                    <span class="expense-category expense-cat-${e.category}">${getCategoryLabel(e.category)}</span>
                                    <span class="expense-desc">${e.description}</span>
                                </div>
                                <div class="expense-amount">${this.formatMoney(e.amount)}</div>
                                <button class="btn btn-ghost btn-sm text-error" onclick="Views.reports.deleteExpense('${departureId}', '${e.id}')">
                                    ${Icons.get('trash-2', {size:14})}
                                </button>
                            </div>
                        `).join('')
                    }
                </div>
                
                <!-- Formulaire ajout -->
                <div class="expense-form">
                    <h4 class="mb-sm">Ajouter une depense</h4>
                    <div class="form-row">
                        <div class="form-group">
                            <label class="form-label">Categorie</label>
                            <div id="expense-category-select"></div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Description</label>
                            <input type="text" class="form-input" id="expense-description" placeholder="Ex: Fret aerien lot janvier">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Montant (XAF)</label>
                            <input type="number" class="form-input" id="expense-amount" placeholder="0">
                        </div>
                    </div>
                    <button class="btn btn-primary" id="btn-add-expense">
                        ${Icons.get('plus', {size:14})} Ajouter
                    </button>
                </div>
            `,
            footer: `<button class="btn btn-secondary" onclick="Modal.close()">Fermer</button>`
        });
        
        // Init SearchSelect pour la categorie
        this.expenseCategorySelect = new SearchSelect({
            container: '#expense-category-select',
            placeholder: 'Categorie...',
            items: categoryOptions,
            onSelect: () => {}
        });
        this.expenseCategorySelect.setValue('freight');
        
        // Event bouton ajouter
        document.getElementById('btn-add-expense')?.addEventListener('click', () => {
            this.addExpense(departureId);
        });
    },
    
    async addExpense(departureId) {
        const category = this.expenseCategorySelect?.getValue() || 'other';
        const description = document.getElementById('expense-description').value.trim();
        const amount = parseInt(document.getElementById('expense-amount').value) || 0;
        
        if (!description) {
            Toast.error('Veuillez saisir une description');
            return;
        }
        if (amount <= 0) {
            Toast.error('Veuillez saisir un montant valide');
            return;
        }
        
        try {
            // Appel API pour sauvegarder la dépense
            await API.accounting.addDepartureExpense(departureId, {
                category,
                description,
                amount,
                date: new Date().toISOString().split('T')[0]  // Date du jour
            });
            
            // Rafraichir la modale et les données
            Modal.close();
            await this.loadDeparturesData();
            
            // Réouvrir la modale avec les données mises à jour
            const departure = this.departuresData.find(d => d.id === departureId);
            if (departure) {
                this.showExpensesModal(departureId);
            }
            
            Toast.success('Dépense ajoutée');
        } catch (error) {
            console.error('Add expense error:', error);
            Toast.error('Erreur lors de l\'ajout: ' + error.message);
        }
    },
    
    async deleteExpense(departureId, expenseId) {
        const confirmed = await Modal.confirm({
            title: 'Supprimer la dépense',
            message: 'Voulez-vous vraiment supprimer cette dépense ?',
            danger: true
        });
        
        if (!confirmed) return;
        
        try {
            // Appel API pour supprimer la dépense
            await API.accounting.deleteDepartureExpense(expenseId);
            
            // Rafraichir les données
            await this.loadDeparturesData();
            
            // Réouvrir la modale avec les données mises à jour
            const departure = this.departuresData.find(d => d.id === departureId);
            if (departure) {
                this.showExpensesModal(departureId);
            }
            
            Toast.success('Dépense supprimée');
        } catch (error) {
            console.error('Delete expense error:', error);
            Toast.error('Erreur lors de la suppression: ' + error.message);
        }
    },
    
    attachEvents() {
        // Main tabs (Statistics / Departures)
        document.querySelectorAll('.main-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this.currentTab = tab.dataset.mainTab;
                document.querySelectorAll('.main-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.renderCurrentTab();
            });
        });
        
        // Period tabs
        document.querySelectorAll('.period-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this.currentPeriod = tab.dataset.period;
                document.querySelectorAll('.period-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.updatePeriodLabel();
                this.renderCurrentTab();
            });
        });
        
        // Period navigation
        document.getElementById('btn-prev-period')?.addEventListener('click', () => this.changePeriod(-1));
        document.getElementById('btn-next-period')?.addEventListener('click', () => this.changePeriod(1));
        
        // Exports
        document.getElementById('btn-export-pdf')?.addEventListener('click', () => this.exportPDF());
        document.getElementById('btn-export-excel')?.addEventListener('click', () => this.exportExcel());
    },
    
    changePeriod(delta) {
        if (this.currentPeriod === 'week' || this.currentPeriod === 'month') {
            this.currentMonth += delta;
            if (this.currentMonth < 0) { this.currentMonth = 11; this.currentYear--; }
            if (this.currentMonth > 11) { this.currentMonth = 0; this.currentYear++; }
        } else {
            this.currentYear += delta;
        }
        this.updatePeriodLabel();
        this.renderCurrentTab();
    },
    
    updatePeriodLabel() {
        const months = ['Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre'];
        let label = '';
        
        switch (this.currentPeriod) {
            case 'week':
                // Calculer les dates de la semaine courante
                const today = new Date();
                const dayOfWeek = today.getDay();
                const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
                const monday = new Date(today);
                monday.setDate(today.getDate() + mondayOffset);
                const sunday = new Date(monday);
                sunday.setDate(monday.getDate() + 6);
                label = `${monday.getDate()} - ${sunday.getDate()} ${months[sunday.getMonth()]} ${sunday.getFullYear()}`;
                break;
            case 'month':
                label = `${months[this.currentMonth]} ${this.currentYear}`;
                break;
            case 'quarter':
                const q = Math.floor(this.currentMonth / 3) + 1;
                label = `T${q} ${this.currentYear}`;
                break;
            case 'year':
                label = `${this.currentYear}`;
                break;
        }
        
        document.getElementById('period-label').textContent = label;
    },

    async loadData() {
        try {
            const data = await this.loadDataFromAPI();
            
            // Stocker les données brutes pour l'export
            this._rawData = data;
            
            this.updateKPIs(data.kpis);
            this.renderRevenueChart(data.revenueByDay);
            this.renderPackagesChart(data.packagesByDay);
            this.renderTransportChart(data.byTransport);
            this.renderPaymentMethodsChart(data.byPaymentMethod);
            this.renderStatusChart(data.byStatus);
            this.renderDeliveryTimesChart(data.deliveryTimes);
            this.renderTopClients(data.topClients);
            this.renderUnknownClients(data.unknownClients);
            this.renderRevenueByDestination(data.byDestination);
            this.renderWarehousePerformance(data.warehousePerformance);
            this.renderMonthlyComparison(data.monthlyComparison);
        } catch (error) {
            console.error('[Reports] Erreur chargement:', error);
            Toast.error('Erreur de chargement des rapports');
        }
    },
    
    /**
     * Charger les données depuis l'API
     */
    async loadDataFromAPI() {
        // Charger les stats financières avec les paramètres de période
        const stats = await API.finance.getStats({
            period: this.currentPeriod,
            year: this.currentYear,
            month: this.currentMonth + 1  // JavaScript months are 0-indexed
        });
        
        // Extraire les données journalières pour les graphiques
        const daily = stats.daily || [];
        const labels = daily.map(d => {
            const date = new Date(d.date);
            return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
        });
        const revenueByDay = daily.map(d => d.revenue || 0);
        const packagesByDay = daily.map(d => d.packages || 0);
        
        // Extraire les méthodes de paiement
        const byMethod = stats.revenue?.by_method || {};
        const methodLabels = Object.keys(byMethod).length > 0 
            ? Object.keys(byMethod).map(m => this.getMethodLabel(m))
            : ['Aucune donnee'];
        const methodData = Object.keys(byMethod).length > 0 
            ? Object.values(byMethod)
            : [0];
        
        // Extraire les données par transport
        const byTransport = stats.packages?.by_transport || {};
        const transportLabels = [];
        const transportCounts = [];
        const transportRevenue = [];
        
        const transportNames = {
            air_express: 'Aerien Express',
            air_normal: 'Aerien Normal',
            sea: 'Maritime'
        };
        
        for (const [mode, data] of Object.entries(byTransport)) {
            transportLabels.push(transportNames[mode] || mode);
            transportCounts.push(data.count || 0);
            transportRevenue.push(data.revenue || 0);
        }
        
        // Extraire les données par statut
        const byStatus = stats.packages?.by_status || {};
        const statusLabels = [];
        const statusCounts = [];
        
        const statusNames = {
            pending: 'En attente',
            received: 'Recu',
            transit: 'En transit',
            customs: 'Douane',
            arrived: 'Arrive',
            delivered: 'Livre'
        };
        
        for (const [status, count] of Object.entries(byStatus)) {
            statusLabels.push(statusNames[status] || status);
            statusCounts.push(count);
        }
        
        // Top clients
        const topClients = (stats.top_clients || []).map(c => ({
            name: c.name,
            packages: c.packages,
            revenue: c.revenue,
            paid: c.paid
        }));
        
        // Par destination
        const byDestination = (stats.by_destination || []).map(d => ({
            city: d.city,
            packages: d.packages,
            revenue: d.revenue
        }));
        
        // Délais de livraison (depuis l'API)
        const deliveryTimesData = stats.delivery_times || { air: [0,0,0,0,0], sea: [0,0,0,0,0] };
        
        // Performance entrepôts (depuis l'API)
        const warehousePerformance = (stats.warehouse_performance || []).map(w => ({
            name: w.name,
            received: w.received,
            shipped: w.shipped,
            avgDays: w.avgDays
        }));
        
        // Comparaison mensuelle (depuis l'API)
        const monthlyComparison = (stats.monthly_comparison || []).map(m => ({
            month: m.month,
            revenue: m.revenue,
            packages: m.packages,
            clients: m.clients
        }));
        
        return {
            kpis: {
                revenue: stats.revenue?.total || 0,
                revenuePrev: stats.revenue?.previous || 0,
                packages: stats.packages?.count || 0,
                packagesPrev: stats.packages?.count_previous || 0,
                newClients: stats.clients?.new || 0,
                newClientsPrev: stats.clients?.new_previous || 0,
                deliveryRate: stats.delivery?.rate || 0,
                deliveryRatePrev: stats.delivery?.rate_previous || 0,
                unpaid: stats.packages?.unpaid_amount || 0,
                unpaidPrev: 0
            },
            revenueByDay: { labels, data: revenueByDay },
            packagesByDay: { labels, data: packagesByDay },
            byTransport: {
                labels: transportLabels.length > 0 ? transportLabels : ['Aucune donnee'],
                data: transportCounts.length > 0 ? transportCounts : [0],
                revenue: transportRevenue.length > 0 ? transportRevenue : [0]
            },
            byPaymentMethod: {
                labels: methodLabels,
                data: methodData
            },
            byStatus: {
                labels: statusLabels.length > 0 ? statusLabels : ['Aucune donnee'],
                data: statusCounts.length > 0 ? statusCounts : [0]
            },
            deliveryTimes: {
                labels: ['< 7j', '7-14j', '14-21j', '21-30j', '> 30j'],
                air: deliveryTimesData.air || [0, 0, 0, 0, 0],
                sea: deliveryTimesData.sea || [0, 0, 0, 0, 0]
            },
            topClients,
            unknownClients: {
                packages: stats.packages?.unknown?.count || 0,
                revenue: stats.packages?.unknown?.total_amount || 0,
                unpaid: stats.packages?.unknown?.unpaid_amount || 0,
                newClients: stats.clients?.unknown || 0
            },
            byDestination,
            warehousePerformance,
            monthlyComparison
        };
    },

    renderUnknownClients(data) {
        const container = document.getElementById('unknown-clients-summary');
        if (!container) return;

        container.innerHTML = `
            <div class="stats-grid stats-grid-4">
                <div class="stat-card">
                    <div class="stat-info">
                        <span class="stat-value">${data.packages}</span>
                        <span class="stat-label">Colis</span>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-info">
                        <span class="stat-value">${this.formatMoney(data.revenue)}</span>
                        <span class="stat-label">Montant total</span>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-info">
                        <span class="stat-value">${this.formatMoney(data.unpaid)}</span>
                        <span class="stat-label">Impayes</span>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-info">
                        <span class="stat-value">${data.newClients}</span>
                        <span class="stat-label">Nouveaux clients inconnus</span>
                    </div>
                </div>
            </div>
        `;
    },
    
    getMethodLabel(method) {
        const labels = {
            cash: 'Especes',
            mobile_money: 'Mobile Money',
            bank_transfer: 'Virement',
            card: 'Carte',
            other: 'Autre'
        };
        return labels[method] || method;
    },
    
    updateKPIs(kpis) {
        const formatChange = (current, prev) => {
            if (prev === 0) return '<span class="text-muted">-</span>';
            const change = ((current - prev) / prev * 100).toFixed(1);
            const isPositive = change >= 0;
            return `<span class="${isPositive ? 'positive' : 'negative'}">${isPositive ? '+' : ''}${change}%</span>`;
        };
        
        const setEl = (id, value, html = false) => {
            const el = document.getElementById(id);
            if (el) { html ? el.innerHTML = value : el.textContent = value; }
        };
        
        setEl('kpi-revenue', this.formatMoney(kpis.revenue));
        setEl('kpi-revenue-change', formatChange(kpis.revenue, kpis.revenuePrev), true);
        
        setEl('kpi-packages', kpis.packages);
        setEl('kpi-packages-change', formatChange(kpis.packages, kpis.packagesPrev), true);
        
        setEl('kpi-clients', kpis.newClients);
        setEl('kpi-clients-change', formatChange(kpis.newClients, kpis.newClientsPrev), true);
        
        setEl('kpi-delivery-rate', kpis.deliveryRate + '%');
        setEl('kpi-delivery-change', formatChange(kpis.deliveryRate, kpis.deliveryRatePrev), true);
        
        setEl('kpi-unpaid', this.formatMoney(kpis.unpaid));
        setEl('kpi-unpaid-change', formatChange(kpis.unpaidPrev, kpis.unpaid), true);
    },
    
    renderRevenueChart(data) {
        this.destroyChart('revenue');
        const ctx = document.getElementById('chart-revenue');
        this.charts.revenue = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.labels,
                datasets: [{
                    label: 'Revenus (XAF)',
                    data: data.data,
                    borderColor: '#059669',
                    backgroundColor: 'rgba(5, 150, 105, 0.1)',
                    fill: true,
                    tension: 0.3
                }]
            },
            options: this.getLineChartOptions('XAF')
        });
    },
    
    renderPackagesChart(data) {
        this.destroyChart('packages');
        const ctx = document.getElementById('chart-packages');
        this.charts.packages = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.labels,
                datasets: [{
                    label: 'Colis',
                    data: data.data,
                    backgroundColor: '#3b82f6'
                }]
            },
            options: this.getBarChartOptions()
        });
    },
    
    renderTransportChart(data) {
        this.destroyChart('transport');
        const ctx = document.getElementById('chart-transport');
        this.charts.transport = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: data.labels,
                datasets: [{
                    data: data.data,
                    backgroundColor: ['#f59e0b', '#3b82f6', '#06b6d4']
                }]
            },
            options: this.getDoughnutOptions()
        });
    },
    
    renderPaymentMethodsChart(data) {
        this.destroyChart('paymentMethods');
        const ctx = document.getElementById('chart-payment-methods');
        this.charts.paymentMethods = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: data.labels,
                datasets: [{
                    data: data.data,
                    backgroundColor: ['#f59e0b', '#10b981', '#3b82f6', '#8b5cf6']
                }]
            },
            options: this.getDoughnutOptions()
        });
    },
    
    renderStatusChart(data) {
        this.destroyChart('status');
        const ctx = document.getElementById('chart-status');
        this.charts.status = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: data.labels,
                datasets: [{
                    data: data.data,
                    backgroundColor: ['#9ca3af', '#06b6d4', '#3b82f6', '#f59e0b', '#10b981']
                }]
            },
            options: this.getDoughnutOptions()
        });
    },
    
    renderDeliveryTimesChart(data) {
        this.destroyChart('deliveryTimes');
        const ctx = document.getElementById('chart-delivery-times');
        this.charts.deliveryTimes = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.labels,
                datasets: [
                    { label: 'Aerien', data: data.air, backgroundColor: '#f59e0b' },
                    { label: 'Maritime', data: data.sea, backgroundColor: '#06b6d4' }
                ]
            },
            options: { ...this.getBarChartOptions(), plugins: { legend: { display: true } } }
        });
    },

    renderTopClients(clients) {
        const container = document.getElementById('top-clients-table');
        container.innerHTML = `
            <div class="table-wrapper">
                <table class="table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Client</th>
                            <th>Colis</th>
                            <th>CA Total</th>
                            <th>Paye</th>
                            <th>Solde</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${clients.map((c, i) => `
                            <tr>
                                <td>${i + 1}</td>
                                <td class="font-medium">${c.name}</td>
                                <td>${c.packages}</td>
                                <td>${this.formatMoney(c.revenue)}</td>
                                <td class="text-success">${this.formatMoney(c.paid)}</td>
                                <td class="${c.revenue - c.paid > 0 ? 'text-error' : 'text-success'}">${this.formatMoney(c.revenue - c.paid)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    },
    
    renderRevenueByDestination(destinations) {
        const container = document.getElementById('revenue-by-destination');
        const total = destinations.reduce((s, d) => s + d.revenue, 0);
        
        container.innerHTML = `
            <div class="destination-bars">
                ${destinations.map(d => {
                    const percent = (d.revenue / total * 100).toFixed(1);
                    return `
                        <div class="destination-item">
                            <div class="destination-header">
                                <span class="destination-name">${d.city}</span>
                                <span class="destination-value">${this.formatMoney(d.revenue)} (${d.packages} colis)</span>
                            </div>
                            <div class="progress-bar">
                                <div class="progress-fill" style="width: ${percent}%"></div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    },
    
    renderWarehousePerformance(warehouses) {
        const container = document.getElementById('warehouse-performance');
        container.innerHTML = `
            <div class="table-wrapper">
                <table class="table">
                    <thead>
                        <tr>
                            <th>Entrepot</th>
                            <th>Recus</th>
                            <th>Expedies</th>
                            <th>Taux</th>
                            <th>Delai moyen</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${warehouses.map(w => {
                            const rate = (w.shipped / w.received * 100).toFixed(1);
                            return `
                                <tr>
                                    <td class="font-medium">${w.name}</td>
                                    <td>${w.received}</td>
                                    <td>${w.shipped}</td>
                                    <td><span class="status-badge ${rate >= 90 ? 'status-delivered' : 'status-pending'}">${rate}%</span></td>
                                    <td>${w.avgDays} jours</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    },
    
    renderMonthlyComparison(months) {
        const container = document.getElementById('monthly-comparison');
        
        // Filtrer les mois sans aucune activité (optionnel)
        const activeMonths = months.filter(m => m.revenue > 0 || m.packages > 0 || m.clients > 0);
        
        // Si aucun mois actif, afficher un message
        if (activeMonths.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    ${Icons.get('calendar', {size:32})}
                    <p>Aucune donnée sur les 12 derniers mois</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = `
            <div class="table-wrapper">
                <table class="table">
                    <thead>
                        <tr>
                            <th>Mois</th>
                            <th>CA</th>
                            <th>Colis</th>
                            <th>Clients</th>
                            <th>CA/Colis</th>
                            <th>Tendance</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${activeMonths.map((m, i) => {
                            // Gérer le cas où packages est 0 pour éviter NaN
                            const avgPerPkg = m.packages > 0 ? Math.round(m.revenue / m.packages) : 0;
                            
                            // Gérer le cas où prevRevenue est 0 pour éviter Infinity
                            const prevRevenue = i > 0 ? activeMonths[i-1].revenue : null;
                            let trendDisplay = '-';
                            if (prevRevenue !== null && prevRevenue > 0) {
                                const trend = ((m.revenue - prevRevenue) / prevRevenue * 100).toFixed(1);
                                trendDisplay = `<span class="${parseFloat(trend) >= 0 ? 'text-success' : 'text-error'}">${parseFloat(trend) >= 0 ? '+' : ''}${trend}%</span>`;
                            } else if (prevRevenue === 0 && m.revenue > 0) {
                                // Passage de 0 à quelque chose = nouveau
                                trendDisplay = `<span class="text-success">Nouveau</span>`;
                            } else if (i === 0) {
                                // Premier mois, pas de comparaison
                                trendDisplay = '-';
                            }
                            
                            return `
                                <tr>
                                    <td class="font-medium">${m.month}</td>
                                    <td>${m.revenue > 0 ? this.formatMoney(m.revenue) : '-'}</td>
                                    <td>${m.packages > 0 ? m.packages : '-'}</td>
                                    <td>${m.clients > 0 ? m.clients : '-'}</td>
                                    <td>${avgPerPkg > 0 ? this.formatMoney(avgPerPkg) : '-'}</td>
                                    <td>${trendDisplay}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    },
    
    // Chart options
    getLineChartOptions(unit = '') {
        return {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: (value) => unit ? this.formatCompact(value) : value
                    }
                }
            }
        };
    },
    
    getBarChartOptions() {
        return {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        };
    },
    
    getDoughnutOptions() {
        return {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 12, padding: 15 } }
            }
        };
    },
    
    destroyChart(name) {
        if (this.charts[name]) {
            this.charts[name].destroy();
            this.charts[name] = null;
        }
    },
    
    // Export functions - Export selon l'onglet actif
    async exportPDF() {
        const periodLabel = this._getPeriodLabel();
        const filename = `rapport_${this.currentTab}_${this._getDateString()}.pdf`;
        
        if (this.currentTab === 'statistics') {
            await this._exportStatisticsPDF(periodLabel, filename);
        } else if (this.currentTab === 'departures') {
            await this._exportDeparturesPDF(periodLabel, filename);
        } else {
            await this._exportAccountingPDF(periodLabel, filename);
        }
    },
    
    async _exportStatisticsPDF(periodLabel, filename) {
        const kpis = this._rawData?.kpis || {};
        const byTransport = this._rawData?.byTransport || {};
        
        // Convertir byTransport au format attendu
        const transportData = {};
        if (byTransport.labels && byTransport.data) {
            byTransport.labels.forEach((label, index) => {
                if (label !== 'Aucune donnee') {
                    const modeKey = label === 'Maritime' ? 'sea' : label === 'Aérien Normal' ? 'air_normal' : 'air_express';
                    transportData[modeKey] = {
                        count: byTransport.data[index] || 0,
                        amount: byTransport.revenue?.[index] || 0
                    };
                }
            });
        }
        
        await ExportService.exportStatisticsReport({
            revenue: kpis.revenue || 0,
            packages_count: kpis.packages || 0,
            new_clients: kpis.newClients || 0,
            delivery_rate: kpis.deliveryRate || 0,
            unpaid: kpis.unpaid || 0,
            by_transport: transportData
        }, { period: periodLabel, filename });
    },
    
    async _exportDeparturesPDF(periodLabel, filename) {
        // Préparer les données des départs
        const departures = this.departuresData.map(d => ({
            departure_date: d.departure_date,
            reference: d.reference || d.notes || '-',
            origin: d.origin_country,
            destination: d.dest_country,
            transport_mode: d.transport_mode,
            packages_count: d.packages_count || 0,
            revenue: d.total_revenue || 0,
            expenses_total: (d.expenses || []).reduce((sum, e) => sum + (e.amount || 0), 0)
        }));
        
        const totalRevenue = departures.reduce((s, d) => s + (d.revenue || 0), 0);
        const totalExpenses = departures.reduce((s, d) => s + (d.expenses_total || 0), 0);
        const totalPackages = departures.reduce((s, d) => s + (d.packages_count || 0), 0);
        
        await ExportService.exportDeparturesReport({
            departures,
            total_packages: totalPackages,
            total_revenue: totalRevenue,
            total_expenses: totalExpenses
        }, { period: periodLabel, filename });
    },
    
    async _exportAccountingPDF(periodLabel, filename) {
        // Utiliser les données comptables chargées (this.accountingData)
        // Si pas encore chargées, les charger
        if (!this.accountingData) {
            this.accountingData = await this.loadAccountingData();
        }
        
        const data = this.accountingData;
        const totals = data.totals || {};
        
        // Reconstituer les revenus par méthode depuis les paiements
        const revenueByMethod = {};
        (data.income?.payments || []).forEach(p => {
            const method = p.method || 'other';
            revenueByMethod[method] = (revenueByMethod[method] || 0) + (p.amount || 0);
        });
        
        await ExportService.exportAccountingReport({
            revenue: { 
                total: totals.income?.total || 0, 
                by_method: revenueByMethod 
            },
            expenses: { 
                departures: totals.expenses?.departures || 0, 
                salaries: totals.expenses?.salaries || 0, 
                charges: totals.expenses?.charges || 0 
            },
            unpaid: this._rawData?.kpis?.unpaid || 0,
            // Ajouter les détails pour un export plus complet
            income: data.income,
            expensesDetails: data.expenses
        }, { period: periodLabel, filename });
    },
    
    async exportExcel() {
        const periodLabel = this._getPeriodLabel();
        const filename = `rapport_${this.currentTab}_${this._getDateString()}.csv`;
        
        if (this.currentTab === 'statistics') {
            this._exportStatisticsCSV(filename);
        } else if (this.currentTab === 'departures') {
            this._exportDeparturesCSV(filename);
        } else {
            await this._exportAccountingCSV(filename);
        }
    },
    
    _exportStatisticsCSV(filename) {
        const kpis = this._rawData?.kpis || {};
        ExportService.toCSV({
            columns: [
                { header: 'Indicateur', key: 'indicateur' },
                { header: 'Valeur', key: 'valeur', format: 'number' }
            ],
            data: [
                { indicateur: 'Chiffre d\'affaires', valeur: kpis.revenue || 0 },
                { indicateur: 'Colis traités', valeur: kpis.packages || 0 },
                { indicateur: 'Nouveaux clients', valeur: kpis.newClients || 0 },
                { indicateur: 'Taux de livraison (%)', valeur: kpis.deliveryRate || 0 },
                { indicateur: 'Impayés', valeur: kpis.unpaid || 0 }
            ],
            filename
        });
    },
    
    _exportDeparturesCSV(filename) {
        ExportService.toCSV({
            columns: [
                { header: 'Date', key: 'date', format: 'date' },
                { header: 'Référence', key: 'reference' },
                { header: 'Origine', key: 'origin' },
                { header: 'Destination', key: 'destination' },
                { header: 'Transport', key: 'transport' },
                { header: 'Colis', key: 'packages', format: 'number' },
                { header: 'Revenus', key: 'revenue', format: 'number' },
                { header: 'Dépenses', key: 'expenses', format: 'number' }
            ],
            data: this.departuresData.map(d => ({
                date: d.departure_date,
                reference: d.reference || d.notes || '-',
                origin: d.origin_country,
                destination: d.dest_country,
                transport: d.transport_mode,
                packages: d.packages_count || 0,
                revenue: d.total_revenue || 0,
                expenses: (d.expenses || []).reduce((sum, e) => sum + (e.amount || 0), 0)
            })),
            filename
        });
    },
    
    async _exportAccountingCSV(filename) {
        // Utiliser les données comptables chargées
        if (!this.accountingData) {
            this.accountingData = await this.loadAccountingData();
        }
        
        const data = this.accountingData;
        const totals = data.totals || {};
        const incomeTotal = totals.income?.total || 0;
        const expDepartures = totals.expenses?.departures || 0;
        const expSalaries = totals.expenses?.salaries || 0;
        const expCharges = totals.expenses?.charges || 0;
        const expTotal = totals.expenses?.total || 0;
        const netProfit = totals.netProfit || 0;
        
        ExportService.toCSV({
            columns: [
                { header: 'Catégorie', key: 'category' },
                { header: 'Montant', key: 'amount', format: 'number' }
            ],
            data: [
                { category: '--- RECETTES ---', amount: '' },
                { category: 'Paiements clients', amount: totals.income?.payments || 0 },
                { category: 'Autres revenus', amount: totals.income?.other || 0 },
                { category: 'Total Recettes', amount: incomeTotal },
                { category: '', amount: '' },
                { category: '--- DEPENSES ---', amount: '' },
                { category: 'Dépenses départs', amount: -expDepartures },
                { category: 'Salaires', amount: -expSalaries },
                { category: 'Charges diverses', amount: -expCharges },
                { category: 'Total Dépenses', amount: -expTotal },
                { category: '', amount: '' },
                { category: '--- RESULTAT ---', amount: '' },
                { category: 'Résultat net', amount: netProfit },
                { category: 'Marge (%)', amount: totals.margin || 0 }
            ],
            filename
        });
    },
    
    _getPeriodLabel() {
        const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 
                           'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
        return `${monthNames[this.currentMonth]} ${this.currentYear}`;
    },
    
    _getDateString() {
        const now = new Date();
        return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    },
    
    // Utilities
    formatMoney(amount) {
        if (amount >= 1000000) return (amount / 1000000).toFixed(1) + 'M XAF';
        if (amount >= 1000) return (amount / 1000).toFixed(0) + 'K XAF';
        return new Intl.NumberFormat('fr-FR').format(amount) + ' XAF';
    },
    
    formatCompact(value) {
        if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
        if (value >= 1000) return (value / 1000).toFixed(0) + 'K';
        return value;
    },
    
    destroy() {
        Object.keys(this.charts).forEach(key => this.destroyChart(key));
    }
};
