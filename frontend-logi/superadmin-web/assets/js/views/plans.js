/**
 * Plans View
 */
const PlansView = (() => {

    async function render() {
        const el = document.getElementById('page-content');
        el.innerHTML = Utils.loading();

        try {
            const plans = await API.get('/api/superadmin/plans?include_inactive=true');
            const list = Array.isArray(plans) ? plans : plans.plans || [];

            el.innerHTML = `
                <div class="toolbar">
                    <div class="toolbar-left"><h3>${list.length} plan(s)</h3></div>
                    <div class="toolbar-right">
                        <button class="btn btn-ghost btn-sm" onclick="PlansView.seedDefaults()">Charger plans par défaut</button>
                        <button class="btn btn-primary btn-sm" onclick="PlansView.showCreateForm()">+ Nouveau plan</button>
                    </div>
                </div>
                <div class="plans-grid" id="plans-grid">
                    ${list.length ? list.map(renderPlanCard).join('') : Utils.emptyState('📋', 'Aucun plan', 'Créez votre premier plan ou chargez les plans par défaut.')}
                </div>
            `;
        } catch (err) {
            el.innerHTML = `<div class="alert alert-error">${Utils.escapeHtml(err.message)}</div>`;
        }
    }

    function renderPlanCard(p) {
        const channels = (p.allowed_channels || []).join(', ') || '—';
        return `
            <div class="plan-card ${p.is_popular ? 'popular' : ''} ${!p.is_active ? 'text-muted' : ''}">
                ${p.is_popular ? '<div class="plan-badge">Populaire</div>' : ''}
                ${!p.is_active ? '<div class="plan-badge" style="background:var(--text-muted)">Inactif</div>' : ''}
                <h3>${Utils.escapeHtml(p.name)}</h3>
                <div class="text-sm text-muted mb-2">${Utils.escapeHtml(p.code)}</div>
                <div class="plan-price">${Utils.formatMoney(p.price_monthly, p.currency)} <span>/mois</span></div>
                <div class="plan-limits">
                    <div class="limit-item"><span class="limit-value">${Utils.formatNumber(p.max_packages_monthly)}</span><span class="limit-label">Colis/mois</span></div>
                    <div class="limit-item"><span class="limit-value">${Utils.formatNumber(p.max_staff)}</span><span class="limit-label">Staff</span></div>
                    <div class="limit-item"><span class="limit-value">${Utils.formatNumber(p.max_clients)}</span><span class="limit-label">Clients</span></div>
                    <div class="limit-item"><span class="limit-value">${p.subscribers_count || 0}</span><span class="limit-label">Abonnés</span></div>
                </div>
                <div class="text-sm text-muted mb-2">Canaux: ${Utils.escapeHtml(channels)}</div>
                <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
                    ${p.limits?.online_payments ? '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;background:#ECFDF5;color:#10B981;">💳 Paiement en ligne</span>' : ''}
                    ${p.limits?.api_access ? '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;background:#EFF6FF;color:#3B82F6;">🔌 API</span>' : ''}
                    ${p.limits?.custom_domain ? '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;background:#FEF3C7;color:#D97706;">🌐 Domaine</span>' : ''}
                    ${p.limits?.white_label ? '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;background:#F3E8FF;color:#7C3AED;">🏷️ White label</span>' : ''}
                </div>
                <ul class="plan-features">${(p.features || []).map(f => `<li>${Utils.escapeHtml(f)}</li>`).join('')}</ul>
                <div class="flex gap-2 mt-4">
                    <button class="btn btn-sm btn-ghost" onclick="PlansView.editPlan('${p.id}')">Modifier</button>
                    <button class="btn btn-sm btn-ghost" onclick="PlansView.managePrices('${p.id}', '${Utils.escapeHtml(p.name)}')">Prix</button>
                </div>
            </div>
        `;
    }

    function showCreateForm(plan = null) {
        const isEdit = !!plan;
        const title = isEdit ? `Modifier: ${plan.name}` : 'Nouveau plan';
        const channels = ['web_admin', 'web_client', 'app_android_client', 'app_ios_client', 'pc_admin', 'mac_admin'];
        const selectedChannels = plan ? (plan.allowed_channels || []) : ['web_admin', 'web_client'];

        Utils.showModal(title, `
            <form id="plan-form">
                <div class="form-row">
                    <div class="form-group">
                        <label>Code</label>
                        <input type="text" id="pf-code" value="${Utils.escapeHtml(plan?.code || '')}" ${isEdit ? 'readonly' : ''} required>
                    </div>
                    <div class="form-group">
                        <label>Nom</label>
                        <input type="text" id="pf-name" value="${Utils.escapeHtml(plan?.name || '')}" required>
                    </div>
                </div>
                <div class="form-group">
                    <label>Description</label>
                    <textarea id="pf-desc" rows="2">${Utils.escapeHtml(plan?.description || '')}</textarea>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Max colis/mois (-1 = illimité)</label>
                        <input type="number" id="pf-pkg" value="${plan?.max_packages_monthly ?? 500}">
                    </div>
                    <div class="form-group">
                        <label>Max staff (-1 = illimité)</label>
                        <input type="number" id="pf-staff" value="${plan?.max_staff ?? 3}">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Max clients (-1 = illimité)</label>
                        <input type="number" id="pf-clients" value="${plan?.max_clients ?? 200}">
                    </div>
                    <div class="form-group">
                        <label>Jours d'essai</label>
                        <input type="number" id="pf-trial" value="${plan?.trial_days ?? 14}">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Prix mensuel (réf.)</label>
                        <input type="number" id="pf-pm" value="${plan?.price_monthly ?? 0}" step="100">
                    </div>
                    <div class="form-group">
                        <label>Prix annuel (réf.)</label>
                        <input type="number" id="pf-py" value="${plan?.price_yearly ?? 0}" step="100">
                    </div>
                </div>
                <div class="form-group">
                    <label>Canaux autorisés</label>
                    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:4px;">
                        ${channels.map(c => `<label style="display:flex;align-items:center;gap:4px;font-size:13px;">
                            <input type="checkbox" class="pf-channel" value="${c}" ${selectedChannels.includes(c) ? 'checked' : ''}> ${c}
                        </label>`).join('')}
                    </div>
                </div>
                <div class="form-group">
                    <label>Max entrepôts (-1 = illimité)</label>
                    <input type="number" id="pf-warehouses" value="${plan?.limits?.max_warehouses ?? 1}">
                </div>
                <div class="form-group">
                    <label>Features avancées</label>
                    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:4px;">
                        <label style="display:flex;align-items:center;gap:4px;font-size:13px;">
                            <input type="checkbox" id="pf-online-payments" ${plan?.limits?.online_payments ? 'checked' : ''}> Paiement en ligne
                        </label>
                        <label style="display:flex;align-items:center;gap:4px;font-size:13px;">
                            <input type="checkbox" id="pf-api-access" ${plan?.limits?.api_access ? 'checked' : ''}> Accès API
                        </label>
                        <label style="display:flex;align-items:center;gap:4px;font-size:13px;">
                            <input type="checkbox" id="pf-custom-domain" ${plan?.limits?.custom_domain ? 'checked' : ''}> Domaine personnalisé
                        </label>
                        <label style="display:flex;align-items:center;gap:4px;font-size:13px;">
                            <input type="checkbox" id="pf-white-label" ${plan?.limits?.white_label ? 'checked' : ''}> White label
                        </label>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label><input type="checkbox" id="pf-popular" ${plan?.is_popular ? 'checked' : ''}> Populaire</label>
                    </div>
                    <div class="form-group">
                        <label><input type="checkbox" id="pf-active" ${plan?.is_active !== false ? 'checked' : ''}> Actif</label>
                    </div>
                </div>
            </form>
        `, `
            <button class="btn btn-ghost" onclick="Utils.closeModal()">Annuler</button>
            <button class="btn btn-primary" onclick="PlansView.submitPlan(${isEdit ? `'${plan.id}'` : 'null'})">${isEdit ? 'Enregistrer' : 'Créer'}</button>
        `);
    }

    async function submitPlan(planId) {
        const data = {
            code: document.getElementById('pf-code').value.trim(),
            name: document.getElementById('pf-name').value.trim(),
            description: document.getElementById('pf-desc').value.trim(),
            max_packages_monthly: parseInt(document.getElementById('pf-pkg').value),
            max_staff: parseInt(document.getElementById('pf-staff').value),
            max_clients: parseInt(document.getElementById('pf-clients').value),
            trial_days: parseInt(document.getElementById('pf-trial').value),
            price_monthly: parseFloat(document.getElementById('pf-pm').value),
            price_yearly: parseFloat(document.getElementById('pf-py').value),
            allowed_channels: [...document.querySelectorAll('.pf-channel:checked')].map(c => c.value),
            limits: {
                max_warehouses: parseInt(document.getElementById('pf-warehouses').value) || 1,
                online_payments: document.getElementById('pf-online-payments').checked,
                api_access: document.getElementById('pf-api-access').checked,
                custom_domain: document.getElementById('pf-custom-domain').checked,
                white_label: document.getElementById('pf-white-label').checked
            },
            is_popular: document.getElementById('pf-popular').checked,
            is_active: document.getElementById('pf-active').checked
        };

        try {
            if (planId) {
                await API.put(`/api/superadmin/plans/${planId}`, data);
                Utils.showToast('Plan mis à jour', 'success');
            } else {
                await API.post('/api/superadmin/plans', data);
                Utils.showToast('Plan créé', 'success');
            }
            Utils.closeModal();
            render();
        } catch (err) {
            Utils.showToast(err.message, 'error');
        }
    }

    async function editPlan(planId) {
        try {
            const plan = await API.get(`/api/superadmin/plans/${planId}`);
            showCreateForm(plan);
        } catch (err) {
            Utils.showToast(err.message, 'error');
        }
    }

    async function managePrices(planId, planName) {
        try {
            const data = await API.get(`/api/superadmin/plans/${planId}/prices`);
            const prices = data.prices || [];
            const currencies = ['XAF', 'XOF', 'USD'];
            const durations = [1, 2, 3, 6, 12];

            let rows = '';
            for (const cur of currencies) {
                for (const dur of durations) {
                    const existing = prices.find(p => p.currency === cur && p.duration_months === dur);
                    rows += `<tr>
                        <td>${cur}</td>
                        <td>${Utils.durationLabel(dur)}</td>
                        <td><input type="number" class="price-input" data-cur="${cur}" data-dur="${dur}" value="${existing ? existing.amount : ''}" placeholder="—" style="width:120px;padding:6px;border:1px solid var(--border);border-radius:4px;"></td>
                        <td><label><input type="checkbox" class="price-active" data-cur="${cur}" data-dur="${dur}" ${existing?.is_active !== false ? 'checked' : ''}> Actif</label></td>
                    </tr>`;
                }
            }

            Utils.showModal(`Prix: ${planName}`, `
                <div class="table-wrapper">
                    <table>
                        <thead><tr><th>Devise</th><th>Durée</th><th>Montant</th><th>Actif</th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            `, `
                <button class="btn btn-ghost" onclick="Utils.closeModal()">Annuler</button>
                <button class="btn btn-primary" onclick="PlansView.savePrices('${planId}')">Enregistrer</button>
            `);
        } catch (err) {
            Utils.showToast(err.message, 'error');
        }
    }

    async function savePrices(planId) {
        const inputs = document.querySelectorAll('.price-input');
        const prices = [];
        inputs.forEach(input => {
            const val = input.value.trim();
            if (!val) return;
            const cur = input.dataset.cur;
            const dur = parseInt(input.dataset.dur);
            const activeCheckbox = document.querySelector(`.price-active[data-cur="${cur}"][data-dur="${dur}"]`);
            prices.push({
                currency: cur,
                duration_months: dur,
                amount: parseFloat(val),
                is_active: activeCheckbox ? activeCheckbox.checked : true
            });
        });

        try {
            await API.put(`/api/superadmin/plans/${planId}/prices`, { prices });
            Utils.closeModal();
            Utils.showToast('Prix mis à jour', 'success');
        } catch (err) {
            Utils.showToast(err.message, 'error');
        }
    }

    async function seedDefaults() {
        try {
            const result = await API.post('/api/superadmin/plans/seed-defaults');
            Utils.showToast(result.message || 'Plans par défaut chargés', 'success');
            render();
        } catch (err) {
            Utils.showToast(err.message, 'error');
        }
    }

    return { render, showCreateForm, submitPlan, editPlan, managePrices, savePrices, seedDefaults };
})();
