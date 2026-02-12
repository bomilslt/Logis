/**
 * Subscriptions View
 */
const SubscriptionsView = (() => {
    let currentPage = 1;
    let statusFilter = '';

    async function render() {
        const el = document.getElementById('page-content');
        el.innerHTML = `
            <div class="toolbar">
                <div class="toolbar-left">
                    <select class="filter-select" id="sub-status-filter">
                        <option value="">Tous les statuts</option>
                        <option value="active">Actif</option>
                        <option value="trial">Essai</option>
                        <option value="expired">Expiré</option>
                        <option value="cancelled">Annulé</option>
                        <option value="suspended">Suspendu</option>
                    </select>
                </div>
            </div>
            <div class="card">
                <div class="card-body" id="subs-table">${Utils.loading()}</div>
            </div>
        `;
        document.getElementById('sub-status-filter').value = statusFilter;
        document.getElementById('sub-status-filter').addEventListener('change', e => {
            statusFilter = e.target.value;
            currentPage = 1;
            loadSubs();
        });
        await loadSubs();
    }

    async function loadSubs() {
        const container = document.getElementById('subs-table');
        try {
            let url = `/api/superadmin/subscriptions?page=${currentPage}&per_page=15`;
            if (statusFilter) url += `&status=${statusFilter}`;
            const data = await API.get(url);
            const subs = data.subscriptions || [];
            const pagination = data.pagination;

            if (!subs.length) {
                container.innerHTML = Utils.emptyState('💳', 'Aucun abonnement', '');
                return;
            }

            let rows = subs.map(s => `
                <tr>
                    <td><strong>${Utils.escapeHtml(s.tenant?.name || s.tenant_id)}</strong></td>
                    <td>${Utils.escapeHtml(s.plan?.name || s.plan?.code || '—')}</td>
                    <td>${Utils.statusBadge(s.status)}</td>
                    <td>${Utils.durationLabel(s.duration_months)}</td>
                    <td>${s.days_remaining != null ? s.days_remaining + 'j' : '—'}</td>
                    <td>${Utils.formatDate(s.current_period_end)}</td>
                    <td>
                        <button class="btn btn-sm btn-ghost" onclick="SubscriptionsView.viewSub('${s.id}')">Détails</button>
                    </td>
                </tr>
            `).join('');

            container.innerHTML = `
                <div class="table-wrapper">
                    <table>
                        <thead><tr><th>Tenant</th><th>Plan</th><th>Statut</th><th>Durée</th><th>Reste</th><th>Fin période</th><th>Actions</th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
                ${pagination ? Utils.paginationHtml(pagination, 'SubscriptionsView.goToPage') : ''}
            `;
        } catch (err) {
            container.innerHTML = `<div class="alert alert-error">${Utils.escapeHtml(err.message)}</div>`;
        }
    }

    function goToPage(page) { currentPage = page; loadSubs(); }

    async function viewSub(subId) {
        try {
            const s = await API.get(`/api/superadmin/subscriptions/${subId}`);
            const payments = (s.payments || []).slice(0, 5);

            let paymentsHtml = '';
            if (payments.length) {
                paymentsHtml = `<h4 class="mt-4 mb-2">Derniers paiements</h4><div class="table-wrapper"><table>
                    <thead><tr><th>Montant</th><th>Provider</th><th>Statut</th><th>Date</th></tr></thead>
                    <tbody>${payments.map(p => `<tr>
                        <td>${Utils.formatMoney(p.amount, p.currency)}</td>
                        <td>${Utils.escapeHtml(p.provider)}</td>
                        <td>${Utils.statusBadge(p.status)}</td>
                        <td>${Utils.formatDate(p.created_at)}</td>
                    </tr>`).join('')}</tbody>
                </table></div>`;
            }

            Utils.showModal(`Abonnement: ${Utils.escapeHtml(s.tenant?.name || s.tenant_id)}`, `
                <div class="form-row mb-4">
                    <div><strong>Plan:</strong> ${Utils.escapeHtml(s.plan?.name || '—')}</div>
                    <div><strong>Statut:</strong> ${Utils.statusBadge(s.status)}</div>
                </div>
                <div class="form-row mb-4">
                    <div><strong>Durée:</strong> ${Utils.durationLabel(s.duration_months)}</div>
                    <div><strong>Jours restants:</strong> ${s.days_remaining ?? '—'}</div>
                </div>
                <div class="form-row mb-4">
                    <div><strong>Début période:</strong> ${Utils.formatDate(s.current_period_start)}</div>
                    <div><strong>Fin période:</strong> ${Utils.formatDate(s.current_period_end)}</div>
                </div>
                <div class="form-row mb-4">
                    <div><strong>Réduction:</strong> ${s.discount_percent || 0}%</div>
                    <div><strong>Montant dû:</strong> ${Utils.formatMoney(s.amount_due, s.plan?.currency)}</div>
                </div>
                ${paymentsHtml}
                <div class="flex gap-2 mt-4" style="flex-wrap:wrap;">
                    ${s.status !== 'active' ? `<button class="btn btn-sm btn-success" onclick="SubscriptionsView.reactivate('${s.id}')">Réactiver</button>` : ''}
                    ${s.status === 'active' ? `<button class="btn btn-sm btn-warning" onclick="SubscriptionsView.cancel('${s.id}')">Annuler</button>` : ''}
                    <button class="btn btn-sm btn-ghost" onclick="SubscriptionsView.extend('${s.id}')">Prolonger</button>
                    <button class="btn btn-sm btn-primary" onclick="SubscriptionsView.recordPayment('${s.id}')">Paiement manuel</button>
                </div>
            `);
        } catch (err) {
            Utils.showToast(err.message, 'error');
        }
    }

    async function reactivate(subId) {
        try {
            await API.post(`/api/superadmin/subscriptions/${subId}/reactivate`);
            Utils.showToast('Abonnement réactivé', 'success');
            Utils.closeModal();
            loadSubs();
        } catch (err) { Utils.showToast(err.message, 'error'); }
    }

    async function cancel(subId) {
        if (!confirm('Annuler cet abonnement ?')) return;
        try {
            await API.post(`/api/superadmin/subscriptions/${subId}/cancel`, { immediate: false });
            Utils.showToast('Abonnement annulé', 'success');
            Utils.closeModal();
            loadSubs();
        } catch (err) { Utils.showToast(err.message, 'error'); }
    }

    async function extend(subId) {
        const days = prompt('Nombre de jours à ajouter:', '30');
        if (!days) return;
        try {
            await API.post(`/api/superadmin/subscriptions/${subId}/extend`, { days: parseInt(days), reason: 'Extension manuelle' });
            Utils.showToast(`Prolongé de ${days} jours`, 'success');
            Utils.closeModal();
            loadSubs();
        } catch (err) { Utils.showToast(err.message, 'error'); }
    }

    async function recordPayment(subId) {
        Utils.showModal('Enregistrer un paiement manuel', `
            <form id="manual-pay-form">
                <div class="form-row">
                    <div class="form-group">
                        <label>Montant</label>
                        <input type="number" id="mp-amount" required step="100" min="1">
                    </div>
                    <div class="form-group">
                        <label>Devise</label>
                        <select id="mp-currency"><option>XAF</option><option>XOF</option><option>USD</option></select>
                    </div>
                </div>
                <div class="form-group">
                    <label>Référence</label>
                    <input type="text" id="mp-ref" placeholder="N° virement, reçu...">
                </div>
                <div class="form-group">
                    <label>Notes</label>
                    <input type="text" id="mp-notes" placeholder="Paiement espèces, virement...">
                </div>
            </form>
        `, `
            <button class="btn btn-ghost" onclick="Utils.closeModal()">Annuler</button>
            <button class="btn btn-primary" onclick="SubscriptionsView.submitPayment('${subId}')">Enregistrer</button>
        `);
    }

    async function submitPayment(subId) {
        const amount = parseFloat(document.getElementById('mp-amount').value);
        const currency = document.getElementById('mp-currency').value;
        const reference = document.getElementById('mp-ref').value;
        const notes = document.getElementById('mp-notes').value;

        if (!amount || amount <= 0) { Utils.showToast('Montant invalide', 'error'); return; }

        try {
            await API.post(`/api/superadmin/subscriptions/${subId}/record-payment`, { amount, currency, reference, notes });
            Utils.showToast('Paiement enregistré', 'success');
            Utils.closeModal();
            loadSubs();
        } catch (err) { Utils.showToast(err.message, 'error'); }
    }

    return { render, goToPage, viewSub, reactivate, cancel, extend, recordPayment, submitPayment };
})();
