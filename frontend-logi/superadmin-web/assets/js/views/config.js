/**
 * Configuration View
 */
const ConfigView = (() => {

    async function render() {
        const el = document.getElementById('page-content');
        el.innerHTML = Utils.loading();

        try {
            const [billing, config] = await Promise.all([
                API.get('/api/superadmin/billing/settings').catch(() => ({})),
                API.get('/api/superadmin/config').catch(() => ({}))
            ]);

            const settings = config.settings || {};

            el.innerHTML = `
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 24px;">
                    <!-- Billing Settings -->
                    <div class="card">
                        <div class="card-header"><h3>Paramètres de facturation</h3></div>
                        <div class="card-body">
                            <form id="billing-settings-form">
                                <div class="form-group">
                                    <label>Devises supportées</label>
                                    <div style="display:flex;gap:12px;margin-top:4px;">
                                        ${['XAF','XOF','USD'].map(c => `<label style="display:flex;align-items:center;gap:4px;font-size:13px;">
                                            <input type="checkbox" class="bs-cur" value="${c}" ${(billing.supported_currencies || ['XAF','XOF','USD']).includes(c) ? 'checked' : ''}> ${c}
                                        </label>`).join('')}
                                    </div>
                                </div>
                                <button type="button" class="btn btn-primary btn-sm" onclick="ConfigView.saveBillingSettings()">Enregistrer</button>
                            </form>
                        </div>
                    </div>

                    <!-- Currency Rates -->
                    <div class="card">
                        <div class="card-header"><h3>Taux de change (vers XAF)</h3></div>
                        <div class="card-body" id="rates-section">${Utils.loading()}</div>
                    </div>

                    <!-- Renewal Contact -->
                    <div class="card">
                        <div class="card-header"><h3>Contact de renouvellement</h3></div>
                        <div class="card-body">
                            <form id="renewal-form">
                                <div class="form-group">
                                    <label>Type de contact</label>
                                    <select id="rc-type">
                                        <option value="whatsapp" ${settings.renewal_contact_type === 'whatsapp' ? 'selected' : ''}>WhatsApp</option>
                                        <option value="email" ${settings.renewal_contact_type === 'email' ? 'selected' : ''}>Email</option>
                                        <option value="url" ${settings.renewal_contact_type === 'url' ? 'selected' : ''}>URL personnalisée</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label>Numéro WhatsApp</label>
                                    <input type="text" id="rc-whatsapp" value="${Utils.escapeHtml(settings.renewal_whatsapp_number || '')}" placeholder="+237600000000">
                                </div>
                                <div class="form-group">
                                    <label>Email de contact</label>
                                    <input type="email" id="rc-email" value="${Utils.escapeHtml(settings.renewal_contact_email || '')}" placeholder="billing@example.com">
                                </div>
                                <div class="form-group">
                                    <label>URL personnalisée</label>
                                    <input type="url" id="rc-url" value="${Utils.escapeHtml(settings.renewal_contact_url || '')}" placeholder="https://...">
                                </div>
                                <button type="button" class="btn btn-primary btn-sm" onclick="ConfigView.saveRenewalConfig()">Enregistrer</button>
                            </form>
                        </div>
                    </div>

                    <!-- Platform Info -->
                    <div class="card">
                        <div class="card-header"><h3>Plateforme</h3></div>
                        <div class="card-body">
                            <form id="platform-form">
                                <div class="form-group">
                                    <label>Nom de la plateforme</label>
                                    <input type="text" id="pf-name" value="${Utils.escapeHtml(config.platform_name || settings.platform_name || 'Express Cargo')}">
                                </div>
                                <div class="form-group">
                                    <label>Email support</label>
                                    <input type="email" id="pf-support" value="${Utils.escapeHtml(config.support_email || settings.support_email || '')}">
                                </div>
                                <button type="button" class="btn btn-primary btn-sm" onclick="ConfigView.savePlatformConfig()">Enregistrer</button>
                            </form>
                        </div>
                    </div>
                </div>
            `;

            loadRates();
        } catch (err) {
            el.innerHTML = `<div class="alert alert-error">${Utils.escapeHtml(err.message)}</div>`;
        }
    }

    async function loadRates() {
        const container = document.getElementById('rates-section');
        try {
            const rates = await API.get('/api/superadmin/billing/rates');
            const list = Array.isArray(rates) ? rates : [];

            let rows = list.map(r => `
                <tr>
                    <td><strong>${Utils.escapeHtml(r.currency)}</strong></td>
                    <td>${r.currency === 'XAF' ? '<em>Référence</em>' : `<input type="number" class="rate-input" data-cur="${r.currency}" value="${r.rate_to_xaf}" step="0.01" style="width:120px;padding:6px;border:1px solid var(--border);border-radius:4px;">`}</td>
                </tr>
            `).join('');

            // Add missing currencies
            const existing = list.map(r => r.currency);
            ['XOF', 'USD'].forEach(c => {
                if (!existing.includes(c)) {
                    rows += `<tr><td><strong>${c}</strong></td><td><input type="number" class="rate-input" data-cur="${c}" value="" step="0.01" placeholder="Taux vers XAF" style="width:120px;padding:6px;border:1px solid var(--border);border-radius:4px;"></td></tr>`;
                }
            });

            container.innerHTML = `
                <div class="table-wrapper"><table>
                    <thead><tr><th>Devise</th><th>Taux → XAF</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table></div>
                <button class="btn btn-primary btn-sm mt-4" onclick="ConfigView.saveRates()">Enregistrer les taux</button>
            `;
        } catch (err) {
            container.innerHTML = `<div class="alert alert-error">${Utils.escapeHtml(err.message)}</div>`;
        }
    }

    async function saveRates() {
        const inputs = document.querySelectorAll('.rate-input');
        const rates = [];
        inputs.forEach(input => {
            const val = input.value.trim();
            if (!val) return;
            rates.push({ currency: input.dataset.cur, rate_to_xaf: parseFloat(val) });
        });

        try {
            await API.put('/api/superadmin/billing/rates', { rates });
            Utils.showToast('Taux mis à jour', 'success');
        } catch (err) {
            Utils.showToast(err.message, 'error');
        }
    }

    async function saveBillingSettings() {
        const currencies = [...document.querySelectorAll('.bs-cur:checked')].map(c => c.value);
        try {
            await API.put('/api/superadmin/billing/settings', { supported_currencies: currencies });
            Utils.showToast('Paramètres de facturation enregistrés', 'success');
        } catch (err) {
            Utils.showToast(err.message, 'error');
        }
    }

    async function saveRenewalConfig() {
        const settings = {
            renewal_contact_type: document.getElementById('rc-type').value,
            renewal_whatsapp_number: document.getElementById('rc-whatsapp').value.trim(),
            renewal_contact_email: document.getElementById('rc-email').value.trim(),
            renewal_contact_url: document.getElementById('rc-url').value.trim()
        };

        try {
            await API.put('/api/superadmin/config', { settings });
            Utils.showToast('Configuration de renouvellement enregistrée', 'success');
        } catch (err) {
            Utils.showToast(err.message, 'error');
        }
    }

    async function savePlatformConfig() {
        const data = {
            platform_name: document.getElementById('pf-name').value.trim(),
            support_email: document.getElementById('pf-support').value.trim()
        };

        try {
            await API.put('/api/superadmin/config', data);
            Utils.showToast('Configuration plateforme enregistrée', 'success');
        } catch (err) {
            Utils.showToast(err.message, 'error');
        }
    }

    return { render, saveRates, saveBillingSettings, saveRenewalConfig, savePlatformConfig };
})();
