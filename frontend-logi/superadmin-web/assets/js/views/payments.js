/**
 * Payments View
 */
const PaymentsView = (() => {
    let currentPage = 1;
    let statusFilter = '';
    let providerFilter = '';

    async function render() {
        const el = document.getElementById('page-content');
        el.innerHTML = `
            <div class="toolbar">
                <div class="toolbar-left">
                    <select class="filter-select" id="pay-status">
                        <option value="">Tous les statuts</option>
                        <option value="completed">Complété</option>
                        <option value="pending">En attente</option>
                        <option value="failed">Échoué</option>
                        <option value="refunded">Remboursé</option>
                    </select>
                    <select class="filter-select" id="pay-provider">
                        <option value="">Tous les providers</option>
                        <option value="stripe">Stripe</option>
                        <option value="flutterwave">Flutterwave</option>
                        <option value="cinetpay">CinetPay</option>
                        <option value="manual">Manuel</option>
                    </select>
                </div>
            </div>
            <div class="card">
                <div class="card-body" id="payments-table">${Utils.loading()}</div>
            </div>
        `;
        document.getElementById('pay-status').value = statusFilter;
        document.getElementById('pay-provider').value = providerFilter;
        document.getElementById('pay-status').addEventListener('change', e => { statusFilter = e.target.value; currentPage = 1; loadPayments(); });
        document.getElementById('pay-provider').addEventListener('change', e => { providerFilter = e.target.value; currentPage = 1; loadPayments(); });
        await loadPayments();
    }

    async function loadPayments() {
        const container = document.getElementById('payments-table');
        try {
            let url = `/api/superadmin/subscriptions/payments?page=${currentPage}&per_page=20`;
            if (statusFilter) url += `&status=${statusFilter}`;
            if (providerFilter) url += `&provider=${providerFilter}`;
            const data = await API.get(url);
            const payments = data.payments || [];
            const pagination = data.pagination;
            const totalRevenue = data.stats?.total_revenue || 0;

            if (!payments.length) {
                container.innerHTML = Utils.emptyState('💰', 'Aucun paiement', '');
                return;
            }

            let rows = payments.map(p => `
                <tr>
                    <td>${Utils.formatMoney(p.amount, p.currency)}</td>
                    <td>${p.amount_xaf ? Utils.formatMoney(p.amount_xaf, 'XAF') : '—'}</td>
                    <td>${Utils.escapeHtml(p.provider)}</td>
                    <td>${Utils.statusBadge(p.status)}</td>
                    <td>${Utils.durationLabel(p.duration_months)}</td>
                    <td>${Utils.formatDate(p.period_start)} → ${Utils.formatDate(p.period_end)}</td>
                    <td class="text-muted text-sm">${Utils.formatDateTime(p.created_at)}</td>
                </tr>
            `).join('');

            container.innerHTML = `
                <div class="mb-4 text-sm text-muted">Revenu total (XAF): <strong>${Utils.formatMoney(totalRevenue, 'XAF')}</strong></div>
                <div class="table-wrapper">
                    <table>
                        <thead><tr><th>Montant</th><th>Montant XAF</th><th>Provider</th><th>Statut</th><th>Durée</th><th>Période</th><th>Date</th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
                ${pagination ? Utils.paginationHtml(pagination, 'PaymentsView.goToPage') : ''}
            `;
        } catch (err) {
            container.innerHTML = `<div class="alert alert-error">${Utils.escapeHtml(err.message)}</div>`;
        }
    }

    function goToPage(page) { currentPage = page; loadPayments(); }

    return { render, goToPage };
})();
