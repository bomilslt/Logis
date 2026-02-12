/**
 * Payment Providers View
 *
 * Loads provider templates from the backend to dynamically render
 * provider-specific credential fields (each provider has its own API keys).
 * Uses correct backend field names: provider_code, is_enabled, display_order, credentials.
 */
const ProvidersView = (() => {

    let _templates = null;

    async function loadTemplates() {
        if (!_templates) {
            _templates = await API.get('/api/superadmin/payment-providers/templates');
        }
        return _templates;
    }

    async function render() {
        const el = document.getElementById('page-content');
        el.innerHTML = Utils.loading();

        try {
            const [providers, templates] = await Promise.all([
                API.get('/api/superadmin/payment-providers'),
                loadTemplates()
            ]);
            const list = Array.isArray(providers) ? providers : providers.providers || [];

            el.innerHTML = `
                <div class="toolbar">
                    <div class="toolbar-left"><h3>Providers de paiement</h3></div>
                    <div class="toolbar-right">
                        <button class="btn btn-primary btn-sm" onclick="ProvidersView.showAddForm()">+ Configurer un provider</button>
                    </div>
                </div>
                <div class="card">
                    <div class="card-body" id="providers-list">
                        ${list.length ? renderProvidersList(list) : Utils.emptyState('🔌', 'Aucun provider', 'Configurez vos providers de paiement.')}
                    </div>
                </div>
            `;
        } catch (err) {
            el.innerHTML = `<div class="alert alert-error">${Utils.escapeHtml(err.message)}</div>`;
        }
    }

    function renderProvidersList(providers) {
        let rows = providers.map(p => `
            <tr>
                <td><strong>${Utils.escapeHtml(p.name || p.provider_code)}</strong></td>
                <td>${Utils.escapeHtml(p.provider_code)}</td>
                <td>${p.is_enabled ? Utils.statusBadge('active') : Utils.statusBadge('suspended')}</td>
                <td>${p.display_order ?? 0}</td>
                <td>${Utils.escapeHtml((p.supported_currencies || []).join(', '))}</td>
                <td>
                    <button class="btn btn-sm btn-ghost" onclick="ProvidersView.editProvider('${Utils.escapeHtml(p.provider_code)}')">Modifier</button>
                    <button class="btn btn-sm ${p.is_enabled ? 'btn-warning' : 'btn-success'}" onclick="ProvidersView.toggleProvider('${Utils.escapeHtml(p.provider_code)}')">${p.is_enabled ? 'Désactiver' : 'Activer'}</button>
                    <button class="btn btn-sm btn-ghost" onclick="ProvidersView.testProvider('${Utils.escapeHtml(p.provider_code)}')">Tester</button>
                </td>
            </tr>
        `).join('');

        return `<div class="table-wrapper"><table>
            <thead><tr><th>Nom</th><th>Code</th><th>Statut</th><th>Ordre</th><th>Devises</th><th>Actions</th></tr></thead>
            <tbody>${rows}</tbody>
        </table></div>`;
    }

    function renderCredentialFields(schema, existingCredentials, isEdit) {
        if (!schema) return '';
        return Object.entries(schema).map(([key, field]) => {
            const inputType = field.type === 'password' ? 'password' : 'text';
            const placeholder = isEdit ? '(inchangé si vide)' : (field.required ? 'Requis' : 'Optionnel');
            const requiredMark = field.required ? ' <span style="color:var(--error)">*</span>' : '';
            return `
                <div class="form-group">
                    <label>${Utils.escapeHtml(field.label)}${requiredMark}</label>
                    <input type="${inputType}" class="prov-cred" data-key="${Utils.escapeHtml(key)}" value="" placeholder="${placeholder}">
                </div>
            `;
        }).join('');
    }

    async function showAddForm(providerData = null) {
        const templates = await loadTemplates();
        const isEdit = !!(providerData && providerData.configured !== false);
        const currentCode = providerData?.provider_code || '';
        const title = isEdit ? `Modifier: ${providerData.name}` : 'Configurer un provider';

        const templateKeys = Object.keys(templates);
        const selectedCode = currentCode || templateKeys[0] || '';
        const selectedTemplate = templates[selectedCode] || {};

        Utils.showModal(title, `
            <form id="provider-form">
                <div class="form-group">
                    <label>Provider</label>
                    <select id="prov-code" ${isEdit ? 'disabled' : ''} onchange="ProvidersView.onProviderTypeChange()">
                        ${templateKeys.map(code => {
                            const t = templates[code];
                            return `<option value="${code}" ${code === selectedCode ? 'selected' : ''}>${Utils.escapeHtml(t.name)}</option>`;
                        }).join('')}
                    </select>
                </div>
                <div id="prov-description" class="text-sm text-muted mb-2">${Utils.escapeHtml(selectedTemplate.description || '')}</div>
                <div class="form-group">
                    <label>Ordre d'affichage (plus bas = plus prioritaire)</label>
                    <input type="number" id="prov-order" value="${providerData?.display_order ?? 1}" min="0">
                </div>
                <div class="form-group">
                    <label>Devises supportées</label>
                    <div style="display:flex;gap:12px;margin-top:4px;">
                        ${['XAF','XOF','USD'].map(c => `<label style="display:flex;align-items:center;gap:4px;font-size:13px;">
                            <input type="checkbox" class="prov-cur" value="${c}" ${(providerData?.supported_currencies || selectedTemplate.supported_currencies || ['XAF']).includes(c) ? 'checked' : ''}> ${c}
                        </label>`).join('')}
                    </div>
                </div>
                <hr style="margin:16px 0;border:none;border-top:1px solid var(--border);">
                <p class="text-sm text-muted mb-2">Identifiants API <em>(chiffrés en base)</em></p>
                <div id="prov-credentials-container">
                    ${renderCredentialFields(selectedTemplate.credentials_schema, providerData?.credentials, isEdit)}
                </div>
                <hr style="margin:16px 0;border:none;border-top:1px solid var(--border);">
                <div class="form-row">
                    <div class="form-group">
                        <label><input type="checkbox" id="prov-enabled" ${providerData?.is_enabled !== false ? 'checked' : ''}> Actif</label>
                    </div>
                    <div class="form-group">
                        <label><input type="checkbox" id="prov-testmode" ${providerData?.is_test_mode !== false ? 'checked' : ''}> Mode test</label>
                    </div>
                </div>
            </form>
        `, `
            <button class="btn btn-ghost" onclick="Utils.closeModal()">Annuler</button>
            <button class="btn btn-primary" onclick="ProvidersView.submitProvider()">${isEdit ? 'Enregistrer' : 'Configurer'}</button>
        `);
    }

    function onProviderTypeChange() {
        if (!_templates) return;
        const code = document.getElementById('prov-code').value;
        const template = _templates[code];
        if (!template) return;

        const descEl = document.getElementById('prov-description');
        if (descEl) descEl.textContent = template.description || '';

        const container = document.getElementById('prov-credentials-container');
        if (container) {
            container.innerHTML = renderCredentialFields(template.credentials_schema, null, false);
        }
    }

    async function submitProvider() {
        const providerCode = document.getElementById('prov-code').value;

        const credentials = {};
        let hasCredentials = false;
        document.querySelectorAll('.prov-cred').forEach(input => {
            const val = input.value.trim();
            if (val) {
                credentials[input.dataset.key] = val;
                hasCredentials = true;
            }
        });

        const data = {
            display_order: parseInt(document.getElementById('prov-order').value) || 0,
            is_enabled: document.getElementById('prov-enabled').checked,
            is_test_mode: document.getElementById('prov-testmode').checked
        };

        if (hasCredentials) {
            data.credentials = credentials;
        }

        try {
            await API.put(`/api/superadmin/payment-providers/${providerCode}`, data);
            Utils.showToast('Provider configuré', 'success');
            Utils.closeModal();
            render();
        } catch (err) {
            Utils.showToast(err.message, 'error');
        }
    }

    async function editProvider(providerCode) {
        try {
            const p = await API.get(`/api/superadmin/payment-providers/${providerCode}`);
            showAddForm(p);
        } catch (err) {
            Utils.showToast(err.message, 'error');
        }
    }

    async function toggleProvider(providerCode) {
        try {
            const result = await API.post(`/api/superadmin/payment-providers/${providerCode}/toggle`);
            Utils.showToast(result.message || 'Statut modifié', 'success');
            render();
        } catch (err) {
            Utils.showToast(err.message, 'error');
        }
    }

    async function testProvider(providerCode) {
        try {
            Utils.showToast('Test en cours...', 'info');
            const result = await API.post(`/api/superadmin/payment-providers/${providerCode}/test`, { amount: 100, currency: 'XAF' });
            if (result.success) {
                Utils.showToast('Connexion réussie', 'success');
            } else {
                Utils.showToast(result.error || 'Échec du test', 'error');
            }
        } catch (err) {
            Utils.showToast(err.message, 'error');
        }
    }

    return { render, showAddForm, submitProvider, editProvider, toggleProvider, testProvider, onProviderTypeChange };
})();
