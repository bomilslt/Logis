/**
 * Admins View
 */
const AdminsView = (() => {

    async function render() {
        const el = document.getElementById('page-content');
        el.innerHTML = Utils.loading();

        try {
            const data = await API.get('/api/superadmin/auth/admins');
            const admins = data.admins || data || [];

            el.innerHTML = `
                <div class="toolbar">
                    <div class="toolbar-left"><h3>${admins.length} administrateur(s)</h3></div>
                    <div class="toolbar-right">
                        <button class="btn btn-primary btn-sm" onclick="AdminsView.showCreateForm()">+ Nouvel admin</button>
                    </div>
                </div>
                <div class="card">
                    <div class="card-body">
                        ${admins.length ? renderAdminsList(admins) : Utils.emptyState('👤', 'Aucun admin', '')}
                    </div>
                </div>
            `;
        } catch (err) {
            el.innerHTML = `<div class="alert alert-error">${Utils.escapeHtml(err.message)}</div>`;
        }
    }

    function renderAdminsList(admins) {
        let rows = admins.map(a => `
            <tr>
                <td><strong>${Utils.escapeHtml(a.email)}</strong></td>
                <td>${a.is_primary ? '<span class="badge badge-info">Principal</span>' : '<span class="badge badge-neutral">Secondaire</span>'}</td>
                <td>${a.is_active ? Utils.statusBadge('active') : Utils.statusBadge('suspended')}</td>
                <td>${Utils.formatDate(a.last_login_at || a.created_at)}</td>
                <td>
                    ${!a.is_primary ? `
                        <button class="btn btn-sm btn-ghost" onclick="AdminsView.toggleAdmin('${a.id}', ${!a.is_active})">${a.is_active ? 'Désactiver' : 'Activer'}</button>
                        <button class="btn btn-sm btn-danger" onclick="AdminsView.deleteAdmin('${a.id}')">Supprimer</button>
                    ` : '<span class="text-muted text-sm">—</span>'}
                </td>
            </tr>
        `).join('');

        return `<div class="table-wrapper"><table>
            <thead><tr><th>Email</th><th>Rôle</th><th>Statut</th><th>Dernière connexion</th><th>Actions</th></tr></thead>
            <tbody>${rows}</tbody>
        </table></div>`;
    }

    function showCreateForm() {
        Utils.showModal('Nouvel administrateur', `
            <form id="admin-form">
                <div class="form-group">
                    <label>Email</label>
                    <input type="email" id="adm-email" required placeholder="admin@example.com">
                </div>
                <div class="form-group">
                    <label>Mot de passe</label>
                    <input type="password" id="adm-password" required placeholder="Min. 8 caractères" minlength="8">
                </div>
                <div class="form-group">
                    <label>Permissions</label>
                    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px;">
                        ${['plans.read','plans.write','subscriptions.read','subscriptions.write','config.read','config.write','tenants.read','tenants.write'].map(p => `
                            <label style="display:flex;align-items:center;gap:4px;font-size:12px;background:var(--bg);padding:4px 8px;border-radius:4px;">
                                <input type="checkbox" class="adm-perm" value="${p}" checked> ${p}
                            </label>
                        `).join('')}
                    </div>
                </div>
            </form>
        `, `
            <button class="btn btn-ghost" onclick="Utils.closeModal()">Annuler</button>
            <button class="btn btn-primary" onclick="AdminsView.submitCreate()">Créer</button>
        `);
    }

    async function submitCreate() {
        const email = document.getElementById('adm-email').value.trim();
        const password = document.getElementById('adm-password').value;
        const permissions = [...document.querySelectorAll('.adm-perm:checked')].map(c => c.value);

        if (!email || !password) { Utils.showToast('Email et mot de passe requis', 'error'); return; }

        try {
            await API.post('/api/superadmin/auth/admins', { email, password, permissions });
            Utils.showToast('Admin créé', 'success');
            Utils.closeModal();
            render();
        } catch (err) {
            Utils.showToast(err.message, 'error');
        }
    }

    async function toggleAdmin(id, activate) {
        try {
            await API.put(`/api/superadmin/auth/admins/${id}`, { is_active: activate });
            Utils.showToast(activate ? 'Admin activé' : 'Admin désactivé', 'success');
            render();
        } catch (err) {
            Utils.showToast(err.message, 'error');
        }
    }

    async function deleteAdmin(id) {
        if (!confirm('Supprimer cet administrateur ?')) return;
        try {
            await API.del(`/api/superadmin/auth/admins/${id}`);
            Utils.showToast('Admin supprimé', 'success');
            render();
        } catch (err) {
            Utils.showToast(err.message, 'error');
        }
    }

    return { render, showCreateForm, submitCreate, toggleAdmin, deleteAdmin };
})();
