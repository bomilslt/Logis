/**
 * Tenants View
 */
const TenantsView = (() => {
    let currentPage = 1;
    let searchTerm = '';

    async function render() {
        const el = document.getElementById('page-content');
        el.innerHTML = `
            <div class="toolbar">
                <div class="toolbar-left">
                    <input type="text" class="search-input" id="tenants-search" placeholder="Rechercher un tenant..." value="${Utils.escapeHtml(searchTerm)}">
                </div>
            </div>
            <div class="card">
                <div class="card-body" id="tenants-table">${Utils.loading()}</div>
            </div>
        `;
        document.getElementById('tenants-search').addEventListener('input', Utils.debounce(e => {
            searchTerm = e.target.value;
            currentPage = 1;
            loadTenants();
        }));
        await loadTenants();
    }

    async function loadTenants() {
        const container = document.getElementById('tenants-table');
        try {
            let url = `/api/superadmin/tenants?page=${currentPage}&per_page=15`;
            if (searchTerm) url += `&search=${encodeURIComponent(searchTerm)}`;
            const data = await API.get(url);
            const tenants = data.tenants || data || [];
            const pagination = data.pagination;

            if (!tenants.length) {
                container.innerHTML = Utils.emptyState('🏢', 'Aucun tenant', 'Aucun tenant trouvé.');
                return;
            }

            let rows = tenants.map(t => `
                <tr>
                    <td>
                        <strong>${Utils.escapeHtml(t.name)}</strong>
                        <div class="text-muted text-sm">${Utils.escapeHtml(t.slug || '')}</div>
                    </td>
                    <td>${Utils.escapeHtml(t.contact_email || '—')}</td>
                    <td>${Utils.statusBadge(t.subscription_status || 'none')}</td>
                    <td>${Utils.formatDate(t.created_at)}</td>
                    <td>
                        <button class="btn btn-sm btn-ghost" onclick="TenantsView.viewTenant('${t.id}')">Voir</button>
                        <button class="btn btn-sm btn-primary" onclick="TenantsView.activatePlan('${t.id}', '${Utils.escapeHtml(t.name)}')">Activer plan</button>
                    </td>
                </tr>
            `).join('');

            container.innerHTML = `
                <div class="table-wrapper">
                    <table>
                        <thead><tr><th>Tenant</th><th>Email</th><th>Abonnement</th><th>Créé le</th><th>Actions</th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
                ${pagination ? Utils.paginationHtml(pagination, 'TenantsView.goToPage') : ''}
            `;
        } catch (err) {
            container.innerHTML = `<div class="alert alert-error">${Utils.escapeHtml(err.message)}</div>`;
        }
    }

    function goToPage(page) {
        currentPage = page;
        loadTenants();
    }

    async function viewTenant(id) {
        try {
            const t = await API.get(`/api/superadmin/tenants/${id}`);
            const sub = t.subscription || {};
            Utils.showModal(`Tenant: ${Utils.escapeHtml(t.name)}`, `
                <div class="form-row mb-4">
                    <div><strong>Slug:</strong> ${Utils.escapeHtml(t.slug)}</div>
                    <div><strong>Email:</strong> ${Utils.escapeHtml(t.contact_email || '—')}</div>
                </div>
                <div class="form-row mb-4">
                    <div><strong>Statut abo:</strong> ${Utils.statusBadge(t.subscription_status || 'none')}</div>
                    <div><strong>Créé le:</strong> ${Utils.formatDate(t.created_at)}</div>
                </div>
                ${sub.plan ? `
                    <h4 class="mb-2">Abonnement actuel</h4>
                    <div class="form-row mb-4">
                        <div><strong>Plan:</strong> ${Utils.escapeHtml(sub.plan.name || sub.plan.code)}</div>
                        <div><strong>Durée:</strong> ${Utils.durationLabel(sub.duration_months)}</div>
                    </div>
                    <div class="form-row">
                        <div><strong>Début:</strong> ${Utils.formatDate(sub.current_period_start)}</div>
                        <div><strong>Fin:</strong> ${Utils.formatDate(sub.current_period_end)}</div>
                    </div>
                ` : '<p class="text-muted">Aucun abonnement actif</p>'}
            `);
        } catch (err) {
            Utils.showToast(err.message, 'error');
        }
    }

    async function activatePlan(tenantId, tenantName) {
        try {
            const plans = await API.get('/api/superadmin/plans');
            const activePlans = (Array.isArray(plans) ? plans : plans.plans || []).filter(p => p.is_active);

            if (!activePlans.length) {
                Utils.showToast('Aucun plan actif disponible', 'warning');
                return;
            }

            const planOptions = activePlans.map(p =>
                `<option value="${p.id}">${Utils.escapeHtml(p.name)} — ${Utils.formatMoney(p.price_monthly, p.currency)}/mois</option>`
            ).join('');

            Utils.showModal(`Activer un plan pour ${Utils.escapeHtml(tenantName)}`, `
                <form id="activate-plan-form">
                    <div class="form-group">
                        <label>Plan</label>
                        <select id="ap-plan" class="form-group select" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:var(--radius);">${planOptions}</select>
                    </div>
                    <div class="form-group">
                        <label>Durée</label>
                        <select id="ap-duration" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:var(--radius);">
                            <option value="1">1 mois</option>
                            <option value="2">2 mois</option>
                            <option value="3">3 mois</option>
                            <option value="6">6 mois</option>
                            <option value="12">12 mois (1 an)</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Raison (optionnel)</label>
                        <input type="text" id="ap-reason" placeholder="Ex: Offre spéciale, migration..." style="width:100%;padding:10px;border:1px solid var(--border);border-radius:var(--radius);">
                    </div>
                </form>
            `, `
                <button class="btn btn-ghost" onclick="Utils.closeModal()">Annuler</button>
                <button class="btn btn-primary" onclick="TenantsView.submitActivation('${tenantId}')">Activer</button>
            `);
        } catch (err) {
            Utils.showToast(err.message, 'error');
        }
    }

    async function submitActivation(tenantId) {
        const planId = document.getElementById('ap-plan').value;
        const duration = parseInt(document.getElementById('ap-duration').value);
        const reason = document.getElementById('ap-reason').value;

        try {
            await API.post('/api/superadmin/subscriptions/activate', {
                tenant_id: tenantId,
                plan_id: planId,
                duration_months: duration,
                reason
            });
            Utils.closeModal();
            Utils.showToast('Plan activé avec succès', 'success');
            loadTenants();
        } catch (err) {
            Utils.showToast(err.message, 'error');
        }
    }

    return { render, goToPage, viewTenant, activatePlan, submitActivation };
})();
