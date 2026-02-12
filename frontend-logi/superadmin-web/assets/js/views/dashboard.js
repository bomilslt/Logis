/**
 * Dashboard View
 */
const DashboardView = (() => {

    async function render() {
        const el = document.getElementById('page-content');
        el.innerHTML = Utils.loading();

        try {
            const [stats, subs, payments] = await Promise.all([
                API.get('/api/superadmin/stats').catch(() => null),
                API.get('/api/superadmin/subscriptions?per_page=5').catch(() => ({ subscriptions: [] })),
                API.get('/api/superadmin/subscriptions/payments?per_page=5&status=completed').catch(() => ({ payments: [], stats: {} }))
            ]);

            const s = stats || {};
            const tenants = s.tenants_count || s.total_tenants || 0;
            const activeSubs = s.active_subscriptions || 0;
            const revenue = payments.stats?.total_revenue || 0;
            const trialSubs = s.trial_subscriptions || 0;

            el.innerHTML = `
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-label">Tenants</div>
                        <div class="stat-value">${Utils.formatNumber(tenants)}</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">Abonnements actifs</div>
                        <div class="stat-value">${Utils.formatNumber(activeSubs)}</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">En essai</div>
                        <div class="stat-value">${Utils.formatNumber(trialSubs)}</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">Revenus totaux (XAF)</div>
                        <div class="stat-value">${Utils.formatMoney(revenue, 'XAF')}</div>
                    </div>
                </div>

                <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 24px;">
                    <div class="card">
                        <div class="card-header"><h3>Derniers abonnements</h3></div>
                        <div class="card-body">
                            ${renderRecentSubs(subs.subscriptions || [])}
                        </div>
                    </div>
                    <div class="card">
                        <div class="card-header"><h3>Derniers paiements</h3></div>
                        <div class="card-body">
                            ${renderRecentPayments(payments.payments || [])}
                        </div>
                    </div>
                </div>
            `;
        } catch (err) {
            el.innerHTML = `<div class="alert alert-error">Erreur: ${Utils.escapeHtml(err.message)}</div>`;
        }
    }

    function renderRecentSubs(subs) {
        if (!subs.length) return Utils.emptyState('💳', 'Aucun abonnement', '');
        let rows = subs.map(s => `
            <tr>
                <td><strong>${Utils.escapeHtml(s.tenant?.name || s.tenant_id)}</strong></td>
                <td>${Utils.escapeHtml(s.plan?.code || '—')}</td>
                <td>${Utils.statusBadge(s.status)}</td>
                <td class="text-muted text-sm">${Utils.formatDate(s.created_at)}</td>
            </tr>
        `).join('');
        return `<div class="table-wrapper"><table><thead><tr><th>Tenant</th><th>Plan</th><th>Statut</th><th>Date</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }

    function renderRecentPayments(payments) {
        if (!payments.length) return Utils.emptyState('💰', 'Aucun paiement', '');
        let rows = payments.map(p => `
            <tr>
                <td>${Utils.formatMoney(p.amount, p.currency)}</td>
                <td>${Utils.escapeHtml(p.provider)}</td>
                <td>${Utils.statusBadge(p.status)}</td>
                <td class="text-muted text-sm">${Utils.formatDate(p.created_at)}</td>
            </tr>
        `).join('');
        return `<div class="table-wrapper"><table><thead><tr><th>Montant</th><th>Provider</th><th>Statut</th><th>Date</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }

    return { render };
})();
