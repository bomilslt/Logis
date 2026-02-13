/**
 * Vue Package Detail - Details, mise a jour statut et rapport de livraison
 * Utilise l'API backend - pas de mock data
 */

Views.packageDetail = {
    currentPackage: null,
    
    async render(packageId) {
        const main = document.getElementById('main-content');
        const cacheKey = 'package:' + packageId;
        
        const cached = ViewCache.get(cacheKey);
        if (cached?.package) {
            this.currentPackage = cached.package;
            this.renderDetail(cached.package);
        } else {
            main.innerHTML = Loader.page('Chargement...');
        }
        
        try {
            const response = await API.packages.getById(packageId);
            const pkg = response.package;
            
            if (!pkg) {
                if (!cached) this.renderNotFound(main);
                return;
            }
            
            if (!cached || ViewCache.hasChanged(cacheKey, response)) {
                ViewCache.set(cacheKey, response);
                this.currentPackage = pkg;
                this.renderDetail(pkg);
            }
            
        } catch (error) {
            console.error('[package-detail] Load error:', error);
            if (!cached) this.renderNotFound(main, error.message);
        }
    },
    
    renderNotFound(main, message = null) {
        main.innerHTML = `
            <div class="empty-state">
                ${Icons.get('alert-circle', {size:48})}
                <h3 class="empty-state-title">Colis introuvable</h3>
                <p class="empty-state-text">${message || 'Ce colis n\'existe pas'}</p>
                <button class="btn btn-primary" onclick="Router.navigate('/packages')">Retour aux colis</button>
            </div>
        `;
    },

    renderDetail(pkg) {
        const main = document.getElementById('main-content');
        
        // Adapter les noms de champs de l'API
        const tracking = pkg.tracking_number || pkg.tracking;
        const supplierTracking = pkg.supplier_tracking || '';
        const amount = pkg.amount || 0;
        const paidAmount = pkg.paid_amount || 0;
        const remaining = amount - paidAmount;
        
        const statusLabel = CONFIG.PACKAGE_STATUSES[pkg.status]?.label || pkg.status;
        const transportLabel = this.getTransportLabel(pkg.transport_mode);
        const paymentStatus = amount === 0 ? '-' : (paidAmount >= amount ? 'Paye' : (paidAmount > 0 ? `Partiel (${this.formatMoney(paidAmount)})` : 'Non paye'));
        
        // Client info
        const clientName = pkg.client?.name || 'N/A';
        const clientPhone = pkg.client?.phone || 'N/A';
        const clientId = pkg.client?.id;
        
        // Recipient info
        const recipientName = pkg.recipient?.name || 'N/A';
        const recipientPhone = pkg.recipient?.phone || 'N/A';
        
        // History
        const history = pkg.history || [];
        
        main.innerHTML = `
            <div class="package-detail-page">
                <div class="page-header">
                    <div>
                        <button class="btn btn-ghost btn-sm" onclick="Router.navigate('/packages')">
                            ${Icons.get('arrow-left', { size: 16 })} Retour
                        </button>
                        <h1 class="page-title mt-md">${tracking}</h1>
                        ${supplierTracking ? `<p class="text-sm text-muted">${supplierTracking}</p>` : ''}
                    </div>
                    <div class="header-actions">
                        <button class="btn btn-outline" onclick="Views.packageDetail.printLabel()">
                            ${Icons.get('printer', {size:16})} Etiquette
                        </button>
                        ${remaining > 0 ? `
                            <button class="btn btn-primary" onclick="Views.packageDetail.showPaymentForm()">
                                ${Icons.get('dollar-sign', {size:16})} Payer
                            </button>
                        ` : ''}
                        <span class="status-badge status-${pkg.status}">${statusLabel}</span>
                    </div>
                </div>
                
                <div class="detail-grid">
                    <!-- Infos colis -->
                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">Informations colis</h3>
                        </div>
                        <div class="card-body">
                            <div class="detail-row">
                                <span class="detail-label">Description</span>
                                <span class="detail-value">${pkg.description || 'N/A'}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Transport</span>
                                <span class="detail-value">${transportLabel}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Type</span>
                                <span class="detail-value">${pkg.package_type || 'N/A'}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Origine</span>
                                <span class="detail-value">${pkg.origin?.city || 'N/A'}, ${this.getOriginLabel(pkg.origin?.country)}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Destination</span>
                                <span class="detail-value">${this.getWarehouseName(pkg.destination?.country, pkg.destination?.warehouse)}, ${this.getDestinationLabel(pkg.destination?.country)}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Poids / CBM</span>
                                <span class="detail-value">${pkg.weight ? pkg.weight + ' kg' : '-'} / ${pkg.cbm ? pkg.cbm + ' m³' : '-'}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Quantite</span>
                                <span class="detail-value">${pkg.quantity || 1} pcs</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Valeur declaree</span>
                                <span class="detail-value">${pkg.declared_value || '-'} ${pkg.currency || ''}</span>
                            </div>
                            <div class="detail-row">
                                <span class="detail-label">Montant</span>
                                <span class="detail-value font-medium">${amount > 0 ? this.formatMoney(amount) : '-'}</span>
                            </div>
                            ${this.renderPaymentBreakdown(pkg)}
                            <div class="detail-row">
                                <span class="detail-label">Date creation</span>
                                <span class="detail-value">${pkg.created_at ? new Date(pkg.created_at).toLocaleString('fr-FR') : 'N/A'}</span>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Client & Destinataire -->
                    <div class="card">
                        <div class="card-header">
                            <h3 class="card-title">Client & Destinataire</h3>
                        </div>
                        <div class="card-body">
                            <div class="detail-section">
                                <h4 class="detail-section-title">Client</h4>
                                <div class="detail-row">
                                    <span class="detail-label">Nom</span>
                                    <span class="detail-value">${clientId ? `<a href="#/clients/${clientId}">${clientName}</a>` : clientName}</span>
                                </div>
                                <div class="detail-row">
                                    <span class="detail-label">Telephone</span>
                                    <span class="detail-value">${clientPhone}</span>
                                </div>
                            </div>
                            <div class="detail-section mt-md">
                                <h4 class="detail-section-title">Destinataire</h4>
                                <div class="detail-row">
                                    <span class="detail-label">Nom</span>
                                    <span class="detail-value">${recipientName}</span>
                                </div>
                                <div class="detail-row">
                                    <span class="detail-label">Telephone</span>
                                    <span class="detail-value">${recipientPhone}</span>
                                </div>
                                <div class="detail-row">
                                    <span class="detail-label">Point de retrait</span>
                                    <span class="detail-value">${this.getWarehouseName(pkg.destination?.country, pkg.destination?.warehouse)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Actions -->
                <div class="card mt-md">
                    <div class="card-header">
                        <h3 class="card-title">Actions</h3>
                    </div>
                    <div class="card-body">
                        <div class="actions-grid">
                            <div class="action-box">
                                <h4>Mettre a jour le statut</h4>
                                <div class="form-group">
                                    <div id="status-select-container"></div>
                                </div>
                                <div class="form-group">
                                    <input type="text" id="status-location" class="form-input" placeholder="Localisation (optionnel)">
                                </div>
                                <div class="form-group">
                                    <textarea id="status-notes" class="form-input" rows="2" placeholder="Notes..."></textarea>
                                </div>
                                <label class="toggle-label mb-md">
                                    <input type="checkbox" id="notify-client" checked>
                                    <span>Notifier le client</span>
                                </label>
                                <button class="btn btn-primary" id="btn-update-status">
                                    ${Icons.get('refresh', {size:16})} Mettre a jour
                                </button>
                            </div>
                            
                            ${pkg.status !== 'delivered' ? `
                                <div class="action-box">
                                    <h4>Marquer comme livre</h4>
                                    <p class="text-sm text-muted mb-md">Enregistrer la preuve de livraison</p>
                                    <button class="btn btn-outline" id="btn-delivery-report">
                                        ${Icons.get('check-circle', {size:16})} Rapport de livraison
                                    </button>
                                </div>
                            ` : `
                                <div class="action-box">
                                    <h4>Livraison confirmee</h4>
                                    <p class="text-sm text-muted">Livre le ${pkg.delivered_at ? new Date(pkg.delivered_at).toLocaleDateString('fr-FR') : 'N/A'}</p>
                                </div>
                            `}
                        </div>
                    </div>
                </div>
                
                <!-- Suivi visuel -->
                <div class="card mt-md">
                    <div class="card-header">
                        <h3 class="card-title">Suivi du colis</h3>
                    </div>
                    <div class="card-body">
                        <tracking-progress 
                            status="${pkg.status}" 
                            transport="${pkg.transport_mode || 'air'}">
                        </tracking-progress>
                    </div>
                </div>
                
                <!-- Historique -->
                <div class="card mt-md">
                    <div class="card-header">
                        <h3 class="card-title">Historique detaille</h3>
                    </div>
                    <div class="card-body">
                        ${history.length > 0 ? `
                            <div class="timeline-container">
                                <div class="timeline">
                                    ${history.map((h, i) => `
                                        <div class="timeline-item ${i === 0 ? 'active' : ''}">
                                            <div class="timeline-dot"></div>
                                            <div class="timeline-content">
                                                <div class="timeline-title">${CONFIG.PACKAGE_STATUSES[h.status]?.label || h.status}</div>
                                                <div class="timeline-date">${new Date(h.created_at).toLocaleString('fr-FR')}</div>
                                                ${h.location ? `<div class="timeline-location">${Icons.get('map-pin', {size:12})} ${h.location}</div>` : ''}
                                                ${h.notes ? `<div class="timeline-notes">${h.notes}</div>` : ''}
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        ` : '<p class="text-muted">Aucun historique</p>'}
                    </div>
                </div>
            </div>
        `;
        
        this.attachEvents(pkg);
    },

    attachEvents(pkg) {
        // Init status SearchSelect
        const statusItems = Object.entries(CONFIG.PACKAGE_STATUSES).map(([k, v]) => ({ id: k, name: v.label }));
        this.statusSelect = new SearchSelect({
            container: '#status-select-container',
            placeholder: 'Selectionner un statut',
            items: statusItems,
            onSelect: () => {}
        });
        this.statusSelect.setValue(pkg.status);
        
        document.getElementById('btn-update-status')?.addEventListener('click', async () => {
            const newStatus = this.statusSelect?.getValue();
            const location = document.getElementById('status-location').value;
            const notes = document.getElementById('status-notes').value;
            const notify = document.getElementById('notify-client').checked;
            
            if (!newStatus) {
                Toast.error('Selectionnez un statut');
                return;
            }
            
            try {
                await API.packages.updateStatus(pkg.id, { 
                    status: newStatus, 
                    location, 
                    notes, 
                    notify 
                });
                Toast.success('Statut mis a jour' + (notify ? ' - Client notifie' : ''));
                this.render(pkg.id);
            } catch (error) {
                Toast.error(error.message || 'Erreur lors de la mise a jour');
            }
        });
        
        document.getElementById('btn-delivery-report')?.addEventListener('click', () => {
            this.showDeliveryReportForm(pkg);
        });
    },
    
    showDeliveryReportForm(pkg) {
        const recipientName = pkg.recipient?.name || '';
        
        Modal.open({
            title: 'Rapport de livraison',
            content: `
                <p class="text-sm text-muted mb-md">Confirmer la livraison du colis ${pkg.tracking_number}</p>
                
                <div class="form-group">
                    <label class="form-label">Recu par</label>
                    <input type="text" id="delivery-receiver" class="form-input" placeholder="Nom de la personne qui a recu" value="${recipientName}">
                </div>
                
                <div class="form-group">
                    <label class="form-label">Notes</label>
                    <textarea id="delivery-notes" class="form-input" rows="2" placeholder="Observations..."></textarea>
                </div>
                
                <label class="toggle-label">
                    <input type="checkbox" id="delivery-notify" checked>
                    <span>Envoyer confirmation au client</span>
                </label>
            `,
            footer: `
                <button class="btn btn-secondary" onclick="Modal.close()">Annuler</button>
                <button class="btn btn-primary" id="btn-confirm-delivery">Confirmer la livraison</button>
            `
        });
        
        document.getElementById('btn-confirm-delivery')?.addEventListener('click', async () => {
            const receiver = document.getElementById('delivery-receiver').value;
            const notes = document.getElementById('delivery-notes').value;
            
            if (!receiver) {
                Toast.error('Veuillez indiquer qui a recu le colis');
                return;
            }
            
            try {
                const formData = new FormData();
                formData.append('recipient_name', receiver);
                formData.append('notes', notes);
                
                await API.packages.confirmDelivery(pkg.id, formData);
                Toast.success('Livraison confirmee');
                Modal.close();
                this.render(pkg.id);
            } catch (error) {
                Toast.error(error.message || 'Erreur lors de la confirmation');
            }
        });
    },

    showPaymentForm() {
        const pkg = this.currentPackage;
        if (!pkg) return;
        
        const amount = pkg.amount || 0;
        const paidAmount = pkg.paid_amount || 0;
        const remaining = amount - paidAmount;
        
        const clientName = pkg.client?.name || 'N/A';
        const tracking = pkg.tracking_number || pkg.tracking;
        
        Modal.open({
            title: 'Enregistrer un paiement',
            content: `
                <div class="payment-summary mb-md">
                    <div class="detail-row">
                        <span class="detail-label">Colis</span>
                        <span class="detail-value">${tracking}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Client</span>
                        <span class="detail-value">${clientName}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Montant total</span>
                        <span class="detail-value">${this.formatMoney(amount)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Deja paye</span>
                        <span class="detail-value">${this.formatMoney(paidAmount)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Reste a payer</span>
                        <span class="detail-value font-medium text-error">${this.formatMoney(remaining)}</span>
                    </div>
                </div>
                
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Montant (XAF) *</label>
                        <input type="number" id="pkg-payment-amount" class="form-input" value="${remaining}" max="${remaining}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Methode *</label>
                        <div id="pkg-payment-method-container"></div>
                    </div>
                </div>
                
                <div class="form-group">
                    <label class="form-label">Reference</label>
                    <input type="text" id="pkg-payment-reference" class="form-input" placeholder="Ex: OM-123456, CASH-001...">
                </div>
                
                <div class="form-group">
                    <label class="form-label">Notes</label>
                    <textarea id="pkg-payment-notes" class="form-input" rows="2"></textarea>
                </div>
            `,
            footer: `
                <button class="btn btn-secondary" onclick="Modal.close()">Annuler</button>
                <button class="btn btn-primary" id="btn-save-pkg-payment">Enregistrer</button>
            `
        });
        
        // Init method SearchSelect
        this.pkgPaymentMethodSelect = new SearchSelect({
            container: '#pkg-payment-method-container',
            placeholder: 'Methode',
            items: [
                { id: 'mobile_money', name: 'Mobile Money (OM/MOMO)' },
                { id: 'cash', name: 'Especes' },
                { id: 'bank', name: 'Virement bancaire' },
                { id: 'card', name: 'Carte bancaire' }
            ],
            onSelect: () => {}
        });
        
        document.getElementById('btn-save-pkg-payment')?.addEventListener('click', async () => {
            const payAmount = parseFloat(document.getElementById('pkg-payment-amount').value);
            const method = this.pkgPaymentMethodSelect?.getValue();
            const reference = document.getElementById('pkg-payment-reference').value.trim();
            const notes = document.getElementById('pkg-payment-notes').value;
            
            if (!payAmount || payAmount <= 0) { Toast.error('Montant invalide'); return; }
            if (payAmount > remaining) { Toast.error('Le montant depasse le reste a payer'); return; }
            if (!method) { Toast.error('Selectionnez une methode'); return; }
            
            try {
                await API.payments.create({
                    client_id: pkg.client?.id,
                    amount: payAmount,
                    method,
                    reference,
                    packages: [pkg.id],
                    notes
                });
                
                Toast.success('Paiement enregistre');
                Modal.close();
                this.render(pkg.id);
            } catch (error) {
                Toast.error(error.message || 'Erreur lors de l\'enregistrement');
            }
        });
    },

    printLabel() {
        const pkg = this.currentPackage;
        if (!pkg) return;
        
        const tracking = pkg.tracking_number || pkg.tracking;
        const clientName = pkg.client?.name || 'N/A';
        const recipientName = pkg.recipient?.name || clientName;
        const recipientPhone = pkg.recipient?.phone || pkg.client?.phone || '';
        const destination = this.getWarehouseName(pkg.destination?.country, pkg.destination?.warehouse);
        
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Etiquette - ${tracking}</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: Arial, sans-serif; padding: 10mm; }
                    .label { width: 100mm; border: 2px solid #000; padding: 5mm; }
                    .label-header { text-align: center; font-size: 16px; font-weight: bold; border-bottom: 1px solid #000; padding-bottom: 3mm; margin-bottom: 3mm; }
                    .label-tracking { text-align: center; font-size: 14px; font-weight: bold; margin: 3mm 0; font-family: monospace; letter-spacing: 1px; }
                    .label-info { font-size: 11px; line-height: 1.5; }
                    .label-info div { margin: 2mm 0; }
                    .label-footer { text-align: center; font-size: 10px; margin-top: 3mm; padding-top: 3mm; border-top: 1px dashed #000; }
                </style>
            </head>
            <body>
                <div class="label">
                    <div class="label-header">EXPRESS CARGO</div>
                    <div class="label-tracking">${tracking}</div>
                    <div class="label-info">
                        <div><strong>Destinataire:</strong> ${recipientName}</div>
                        <div><strong>Tel:</strong> ${recipientPhone}</div>
                        <div><strong>Point de retrait:</strong> ${destination}</div>
                        <div><strong>Description:</strong> ${pkg.description || 'N/A'}</div>
                        <div><strong>Poids:</strong> ${pkg.weight ? pkg.weight + ' kg' : '-'}</div>
                    </div>
                    <div class="label-footer">${new Date().toLocaleDateString('fr-FR')}</div>
                </div>
                <script>window.onload = () => window.print();</script>
            </body>
            </html>
        `);
        printWindow.document.close();
    },
    
    renderPaymentBreakdown(pkg) {
        const amount = pkg.amount || 0;
        const paidAmount = pkg.paid_amount || 0;
        const remaining = amount - paidAmount;
        const currency = pkg.amount_currency || 'XAF';
        
        if (amount === 0) {
            return `
                <div class="detail-row">
                    <span class="detail-label">Paiement</span>
                    <span class="detail-value text-muted">-</span>
                </div>
            `;
        }
        
        const pct = Math.min(100, Math.round((paidAmount / amount) * 100));
        const isPaid = remaining <= 0;
        const isPartial = paidAmount > 0 && !isPaid;
        
        const statusLabel = isPaid ? 'Paye' : (isPartial ? 'Partiel' : 'Non paye');
        const statusClass = isPaid ? 'text-success' : (isPartial ? 'text-warning' : 'text-error');
        const barColor = isPaid ? 'var(--color-success, #22c55e)' : (isPartial ? 'var(--color-warning, #f59e0b)' : 'var(--color-error, #ef4444)');
        
        return `
            <div class="payment-breakdown" style="margin-top:8px;padding:12px;background:var(--color-gray-50, #f9fafb);border-radius:8px;border:1px solid var(--color-gray-200, #e5e7eb);">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                    <span style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--color-gray-500, #6b7280);">Statut paiement</span>
                    <span class="${statusClass}" style="font-weight:700;font-size:13px;">${statusLabel} (${pct}%)</span>
                </div>
                <div style="width:100%;height:8px;background:var(--color-gray-200, #e5e7eb);border-radius:4px;overflow:hidden;margin-bottom:10px;">
                    <div style="width:${pct}%;height:100%;background:${barColor};border-radius:4px;transition:width 0.3s;"></div>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
                    <span style="color:var(--color-gray-500, #6b7280);">Total</span>
                    <span style="font-weight:600;">${this.formatMoney(amount)}</span>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
                    <span style="color:var(--color-success, #22c55e);">Paye</span>
                    <span style="font-weight:600;color:var(--color-success, #22c55e);">${this.formatMoney(paidAmount)}</span>
                </div>
                ${remaining > 0 ? `
                    <div style="display:flex;justify-content:space-between;font-size:13px;padding-top:6px;border-top:1px dashed var(--color-gray-200, #e5e7eb);">
                        <span style="font-weight:700;color:var(--color-error, #ef4444);">Reste a payer</span>
                        <span style="font-weight:700;color:var(--color-error, #ef4444);">${this.formatMoney(remaining)}</span>
                    </div>
                ` : `
                    <div style="display:flex;align-items:center;gap:6px;padding-top:6px;border-top:1px dashed var(--color-gray-200, #e5e7eb);color:var(--color-success, #22c55e);font-size:12px;font-weight:600;">
                        ${Icons.get('check-circle', {size:14})} Entierement paye
                    </div>
                `}
            </div>
        `;
    },

    // Helpers
    getTransportLabel(mode) {
        const labels = {
            'sea': 'Bateau (Maritime)',
            'air_normal': 'Avion - Normal',
            'air_express': 'Avion - Express'
        };
        return labels[mode] || mode || 'N/A';
    },
    
    getOriginLabel(countryCode) {
        if (!countryCode) return 'N/A';
        return CONFIG.ORIGINS?.[countryCode]?.label || countryCode;
    },
    
    getDestinationLabel(countryCode) {
        if (!countryCode) return 'N/A';
        return CONFIG.DESTINATIONS?.[countryCode]?.label || countryCode;
    },
    
    getWarehouseName(country, warehouseId) {
        if (!country || !warehouseId) return 'N/A';
        const countryData = CONFIG.DESTINATIONS?.[country];
        if (!countryData) return warehouseId;
        const warehouse = countryData.warehouses?.find(w => w.id === warehouseId);
        return warehouse ? warehouse.name : warehouseId;
    },
    
    formatMoney(amount) {
        return new Intl.NumberFormat('fr-FR').format(amount || 0) + ' XAF';
    }
};
