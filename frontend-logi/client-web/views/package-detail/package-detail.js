/**
 * Vue Package Detail - Détails d'un colis
 * Affiche les informations complètes d'un colis récupéré via l'API
 */

Views.packageDetail = {
    /**
     * Point d'entrée - Charge et affiche les détails du colis
     * @param {string} packageId - ID du colis à afficher
     */
    async render(packageId) {
        const main = document.getElementById('main-content');
        if (!main) {
            console.error('[package-detail] main-content not found');
            return;
        }
        
        // Afficher le loader pendant le chargement
        main.innerHTML = Loader.page('Chargement du colis...');
        
        try {
            // Appel API pour récupérer le colis avec son historique
            const data = await API.packages.getById(packageId);
            const pkg = data.package || data;
            
            if (!pkg) {
                this.renderNotFound(main);
                return;
            }
            
            // Afficher les détails du colis
            this.renderPackage(main, pkg);
            
        } catch (error) {
            console.error('[package-detail] Load error:', error);
            this.renderNotFound(main, error.message);
        }
    },
    
    /**
     * Affiche l'état "colis introuvable"
     * @param {HTMLElement} main - Conteneur principal
     * @param {string} message - Message d'erreur optionnel
     */
    renderNotFound(main, message = null) {
        main.innerHTML = `
            <div class="empty-state">
                <svg class="empty-state-icon" viewBox="0 0 24 24">
                    <use href="assets/icons/icons.svg#alert-circle"></use>
                </svg>
                <h3 class="empty-state-title">Colis introuvable</h3>
                <p class="empty-state-text">${message || 'Ce colis n\'existe pas ou vous n\'y avez pas accès'}</p>
                <a href="#/packages" class="btn btn-primary">Retour aux colis</a>
            </div>
        `;
    },
    
    /**
     * Affiche les détails complets du colis
     * @param {HTMLElement} main - Conteneur principal
     * @param {Object} pkg - Données du colis depuis l'API
     */
    renderPackage(main, pkg) {
        // Récupérer le label du statut
        const status = CONFIG.PACKAGE_STATUSES[pkg.status] || { label: pkg.status };
        
        // Déterminer si le colis est modifiable
        const isEditable = pkg.is_editable && ['pending', 'received'].includes(pkg.status);
        
        // Tracking numbers
        const tracking = pkg.tracking_number;
        const supplierTracking = pkg.supplier_tracking || tracking;
        
        main.innerHTML = `
            <div class="package-detail">
                <!-- Header avec navigation et actions -->
                <div class="detail-header">
                    <button class="btn btn-ghost btn-sm" onclick="history.back()">
                        <svg class="icon" viewBox="0 0 24 24">
                            <use href="assets/icons/icons.svg#arrow-left"></use>
                        </svg>
                        Retour
                    </button>
                    ${isEditable ? `
                        <div class="detail-actions">
                            <button class="btn btn-outline btn-sm" id="btn-edit">
                                <svg class="icon-sm" viewBox="0 0 24 24">
                                    <use href="assets/icons/icons.svg#edit"></use>
                                </svg>
                                Modifier
                            </button>
                            <button class="btn btn-ghost btn-sm text-error" id="btn-delete">
                                <svg class="icon-sm" viewBox="0 0 24 24">
                                    <use href="assets/icons/icons.svg#trash"></use>
                                </svg>
                            </button>
                        </div>
                    ` : ''}
                </div>
                
                <!-- Carte principale avec tracking et statut -->
                <div class="detail-card">
                    <div class="detail-card-header">
                        <div class="tracking-group">
                            <span class="tracking-internal">${tracking}</span>
                            ${supplierTracking !== tracking ? `
                                <div class="tracking-supplier">
                                    <span class="tracking-number">${supplierTracking}</span>
                                    <button class="btn-icon btn-sm" id="btn-copy" title="Copier">
                                        <svg class="icon-sm" viewBox="0 0 24 24">
                                            <use href="assets/icons/icons.svg#copy"></use>
                                        </svg>
                                    </button>
                                </div>
                            ` : `
                                <button class="btn-icon btn-sm" id="btn-copy" title="Copier">
                                    <svg class="icon-sm" viewBox="0 0 24 24">
                                        <use href="assets/icons/icons.svg#copy"></use>
                                    </svg>
                                </button>
                            `}
                        </div>
                        <span class="status-badge status-${pkg.status}">${status.label}</span>
                    </div>
                    
                    <p class="detail-description">${pkg.description || 'Aucune description'}</p>
                    
                    <!-- Grille d'informations -->
                    <div class="detail-grid">
                        <div class="detail-item">
                            <span class="detail-label">Transport</span>
                            <span class="detail-value">${this.getTransportLabel(pkg.transport_mode)}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Type</span>
                            <span class="detail-value">${this.getTypeLabel(pkg.package_type)}</span>
                        </div>
                        ${this.renderMeasures(pkg)}
                        <div class="detail-item">
                            <span class="detail-label">Valeur declaree</span>
                            <span class="detail-value">${pkg.declared_value ? pkg.declared_value + ' ' + (pkg.currency || 'USD') : 'N/A'}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Date creation</span>
                            <span class="detail-value">${pkg.created_at ? new Date(pkg.created_at).toLocaleDateString('fr-FR') : 'N/A'}</span>
                        </div>
                    </div>
                    
                    <!-- Résumé paiement si montant défini -->
                    ${this.renderPaymentSummary(pkg)}
                </div>
                
                <!-- Section Suivi Visuel -->
                <div class="detail-section">
                    <h3 class="section-title">Suivi du colis</h3>
                    <div class="detail-card">
                        <tracking-progress 
                            status="${pkg.status}" 
                            transport="${pkg.transport_mode || 'air'}"
                            ${pkg.history && pkg.history.length > 0 ? `data-dates='${this.getHistoryDates(pkg.history)}' show-dates` : ''}>
                        </tracking-progress>
                        
                        ${pkg.history && pkg.history.length > 0 ? `
                            <div class="history-details">
                                <button class="btn btn-ghost btn-sm" id="btn-toggle-history">
                                    ${Icons.get('clock', { size: 16 })}
                                    Voir le detail de l'historique
                                    ${Icons.get('chevron-down', { size: 16 })}
                                </button>
                                <div class="history-timeline" id="history-timeline" style="display: none;">
                                    ${this.renderTimeline(pkg.history)}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                </div>
                
                <!-- Section Origine -->
                <div class="detail-section">
                    <h3 class="section-title">Origine</h3>
                    <div class="detail-card">
                        <div class="address-block">
                            <svg class="icon" viewBox="0 0 24 24">
                                <use href="assets/icons/icons.svg#send"></use>
                            </svg>
                            <div>
                                <p class="address-main">${pkg.origin?.city || 'N/A'}</p>
                                <p class="address-detail">${this.getOriginLabel(pkg.origin?.country)}</p>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Section Destination -->
                <div class="detail-section">
                    <h3 class="section-title">Point de retrait</h3>
                    <div class="detail-card">
                        <div class="address-block">
                            <svg class="icon" viewBox="0 0 24 24">
                                <use href="assets/icons/icons.svg#map-pin"></use>
                            </svg>
                            <div>
                                <p class="address-main">${this.getWarehouseLabel(pkg.destination?.country, pkg.destination?.warehouse)}</p>
                                <p class="address-detail">${this.getDestinationLabel(pkg.destination?.country)}</p>
                            </div>
                        </div>
                        ${pkg.recipient?.name || pkg.recipient?.phone ? `
                            <div class="recipient-info">
                                ${pkg.recipient?.name ? `<p><strong>Destinataire:</strong> ${pkg.recipient.name}</p>` : ''}
                                ${pkg.recipient?.phone ? `<p><strong>Telephone:</strong> ${pkg.recipient.phone}</p>` : ''}
                            </div>
                        ` : ''}
                    </div>
                </div>
                
                <!-- Livraison estimée (seulement si pas encore livré) -->
                ${pkg.estimated_delivery && pkg.status !== 'delivered' ? `
                    <div class="estimated-delivery">
                        <svg class="icon" viewBox="0 0 24 24">
                            <use href="assets/icons/icons.svg#calendar"></use>
                        </svg>
                        <span>Livraison estimee: <strong>${new Date(pkg.estimated_delivery).toLocaleDateString('fr-FR')}</strong></span>
                    </div>
                ` : ''}
                
                <!-- Actions en bas de page -->
                <div class="detail-actions-bottom">
                    <button class="btn btn-outline" id="btn-receipt">
                        <svg class="icon-sm" viewBox="0 0 24 24">
                            <use href="assets/icons/icons.svg#printer"></use>
                        </svg>
                        Telecharger le recu
                    </button>
                </div>
            </div>
        `;
        
        // Attacher les événements
        this.attachEvents(pkg);
    },

    /**
     * Récupère le label d'un mode de transport
     * Cherche d'abord dans les données dynamiques CONFIG.SHIPPING_RATES
     * @param {string} mode - Code du mode de transport (sea, air_normal, etc.)
     */
    getTransportLabel(mode) {
        if (!mode) return 'N/A';
        
        // Labels par défaut pour les modes connus
        const defaultLabels = {
            'sea': 'Bateau (maritime)',
            'air_normal': 'Avion - Normal',
            'air_express': 'Avion - Express'
        };
        
        return defaultLabels[mode] || mode;
    },
    
    /**
     * Récupère le label d'un type de colis
     * @param {string} type - Code du type de colis
     */
    getTypeLabel(type) {
        if (!type) return 'N/A';
        
        // Chercher dans les shipping_rates configurés
        const rates = CONFIG.SHIPPING_RATES || {};
        for (const routeKey in rates) {
            const route = rates[routeKey];
            for (const transportKey in route) {
                if (transportKey === 'currency') continue;
                const transport = route[transportKey];
                if (transport[type]) {
                    return transport[type].label || type;
                }
            }
        }
        
        return type;
    },
    
    /**
     * Récupère le label d'un pays d'origine
     * @param {string} countryCode - Code du pays
     */
    getOriginLabel(countryCode) {
        if (!countryCode) return 'N/A';
        const origin = CONFIG.ORIGINS?.[countryCode];
        return origin?.label || countryCode;
    },
    
    /**
     * Récupère le label d'un pays de destination
     * @param {string} countryCode - Code du pays
     */
    getDestinationLabel(countryCode) {
        if (!countryCode) return 'N/A';
        const dest = CONFIG.DESTINATIONS?.[countryCode];
        return dest?.label || countryCode;
    },
    
    /**
     * Récupère le label d'un entrepôt
     * @param {string} country - Code du pays
     * @param {string} warehouseId - ID de l'entrepôt
     */
    getWarehouseLabel(country, warehouseId) {
        if (!country || !warehouseId) return 'N/A';
        const countryData = CONFIG.DESTINATIONS?.[country];
        if (!countryData) return warehouseId;
        const warehouse = countryData.warehouses?.find(w => w.id === warehouseId);
        return warehouse ? warehouse.name : warehouseId;
    },
    
    /**
     * Génère le HTML pour les mesures du colis
     * Affiche les valeurs estimées et finales si disponibles
     * @param {Object} pkg - Données du colis
     */
    renderMeasures(pkg) {
        let html = '';
        const hasFinal = pkg.has_final_values;
        
        // Quantité
        if (pkg.quantity && pkg.quantity > 1) {
            if (hasFinal && pkg.final_quantity !== null && pkg.final_quantity !== undefined) {
                html += `
                    <div class="detail-item">
                        <span class="detail-label">Quantite</span>
                        <span class="detail-value">
                            <span class="measure-final">${pkg.final_quantity} piece(s)</span>
                            <span class="measure-estimated">(estimation: ${pkg.quantity})</span>
                        </span>
                    </div>
                `;
            } else {
                html += `
                    <div class="detail-item">
                        <span class="detail-label">Quantite</span>
                        <span class="detail-value">${pkg.quantity} piece(s) ${!hasFinal ? '<span class="measure-tag">estimation</span>' : ''}</span>
                    </div>
                `;
            }
        }
        
        // Poids
        if (pkg.weight || pkg.final_weight) {
            if (hasFinal && pkg.final_weight !== null && pkg.final_weight !== undefined) {
                html += `
                    <div class="detail-item">
                        <span class="detail-label">Poids</span>
                        <span class="detail-value">
                            <span class="measure-final">${pkg.final_weight} kg</span>
                            ${pkg.weight ? `<span class="measure-estimated">(estimation: ${pkg.weight} kg)</span>` : ''}
                        </span>
                    </div>
                `;
            } else if (pkg.weight) {
                html += `
                    <div class="detail-item">
                        <span class="detail-label">Poids</span>
                        <span class="detail-value">${pkg.weight} kg ${!hasFinal ? '<span class="measure-tag">estimation</span>' : ''}</span>
                    </div>
                `;
            }
        }
        
        // CBM (Volume)
        if (pkg.cbm || pkg.final_cbm) {
            if (hasFinal && pkg.final_cbm !== null && pkg.final_cbm !== undefined) {
                html += `
                    <div class="detail-item">
                        <span class="detail-label">Volume (CBM)</span>
                        <span class="detail-value">
                            <span class="measure-final">${pkg.final_cbm} m³</span>
                            ${pkg.cbm ? `<span class="measure-estimated">(estimation: ${pkg.cbm} m³)</span>` : ''}
                        </span>
                    </div>
                `;
            } else if (pkg.cbm) {
                html += `
                    <div class="detail-item">
                        <span class="detail-label">Volume (CBM)</span>
                        <span class="detail-value">${pkg.cbm} m³ ${!hasFinal ? '<span class="measure-tag">estimation</span>' : ''}</span>
                    </div>
                `;
            }
        }
        
        // Dimensions
        if (pkg.dimensions?.length || pkg.dimensions?.width || pkg.dimensions?.height) {
            const dims = pkg.dimensions;
            html += `
                <div class="detail-item">
                    <span class="detail-label">Dimensions</span>
                    <span class="detail-value">${dims.length || 0} x ${dims.width || 0} x ${dims.height || 0} cm</span>
                </div>
            `;
        }
        
        // Si aucune mesure, afficher N/A
        if (!html) {
            html = `
                <div class="detail-item">
                    <span class="detail-label">Mesures</span>
                    <span class="detail-value">Non renseignees</span>
                </div>
            `;
        }
        
        return html;
    },
    
    /**
     * Génère le HTML pour le résumé de paiement
     * Indique si le montant est une estimation ou le montant final confirmé
     * @param {Object} pkg - Données du colis
     */
    renderPaymentSummary(pkg) {
        if (!pkg.amount || pkg.amount === 0) {
            // Si pas de montant mais colis en attente, afficher estimation en attente
            if (pkg.status === 'pending') {
                return `
                    <div class="payment-summary payment-pending">
                        <div class="payment-notice">
                            <svg class="icon-sm" viewBox="0 0 24 24">
                                <use href="assets/icons/icons.svg#clock"></use>
                            </svg>
                            <span>Le montant sera calcule a la reception du colis</span>
                        </div>
                    </div>
                `;
            }
            return '';
        }
        
        const paid = pkg.paid_amount || 0;
        const remaining = pkg.remaining_amount || (pkg.amount - paid);
        const currency = pkg.amount_currency || 'XAF';
        const hasFinal = pkg.has_final_values;
        
        // Déterminer le type de montant (estimation ou final)
        const amountType = hasFinal ? 'final' : 'estimation';
        const amountLabel = hasFinal ? 'Montant a payer' : 'Montant estime';
        const amountIcon = hasFinal ? 'check-circle' : 'clock';
        
        return `
            <div class="payment-summary ${hasFinal ? 'payment-confirmed' : 'payment-estimated'}">
                ${!hasFinal ? `
                    <div class="payment-notice payment-notice-warning">
                        <svg class="icon-sm" viewBox="0 0 24 24">
                            <use href="assets/icons/icons.svg#info"></use>
                        </svg>
                        <span>Montant estimatif - sera confirme a la reception</span>
                    </div>
                ` : `
                    <div class="payment-notice payment-notice-success">
                        <svg class="icon-sm" viewBox="0 0 24 24">
                            <use href="assets/icons/icons.svg#check-circle"></use>
                        </svg>
                        <span>Montant confirme par l'agence</span>
                    </div>
                `}
                <div class="payment-row">
                    <span class="payment-label">${amountLabel}</span>
                    <span class="payment-value">${this.formatMoney(pkg.amount, currency)}</span>
                </div>
                ${pkg.unit_price ? `
                    <div class="payment-row payment-detail">
                        <span class="payment-label">Tarif applique</span>
                        <span class="payment-value text-muted">${this.formatMoney(pkg.unit_price, currency)}/${this.getBillingUnit(pkg)}</span>
                    </div>
                ` : ''}
                <div class="payment-row">
                    <span class="payment-label">Deja paye</span>
                    <span class="payment-value text-success">${this.formatMoney(paid, currency)}</span>
                </div>
                ${remaining > 0 ? `
                    <div class="payment-row payment-remaining">
                        <span class="payment-label">Reste a payer</span>
                        <span class="payment-value text-error">${this.formatMoney(remaining, currency)}</span>
                    </div>
                    ${CONFIG.FEATURES.online_payments ? `
                    <div class="payment-action">
                        <button class="btn btn-primary btn-block" id="btn-pay-online">
                            <svg class="icon-sm" viewBox="0 0 24 24"><use href="assets/icons/icons.svg#credit-card"></use></svg>
                            Payer ${this.formatMoney(remaining, currency)} en ligne
                        </button>
                    </div>
                    ` : ''}
                ` : `
                    <div class="payment-notice payment-notice-success" style="margin-top:8px;">
                        <svg class="icon-sm" viewBox="0 0 24 24"><use href="assets/icons/icons.svg#check-circle"></use></svg>
                        <span>Entierement paye</span>
                    </div>
                `}
            </div>
        `;
    },
    
    /**
     * Détermine l'unité de facturation selon le type de colis
     * @param {Object} pkg - Données du colis
     */
    getBillingUnit(pkg) {
        if (pkg.transport_mode === 'sea') return 'm³';
        if (['special', 'battery', 'liquid'].includes(pkg.package_type)) return 'pièce';
        return 'kg';
    },
    
    /**
     * Génère le HTML pour la timeline d'historique
     * @param {Array} history - Liste des entrées d'historique
     */
    renderTimeline(history) {
        if (!history || history.length === 0) {
            return '<p class="text-muted text-sm">Aucun historique disponible</p>';
        }
        
        return `
            <div class="timeline">
                ${history.map((h, i) => {
                    const status = CONFIG.PACKAGE_STATUSES[h.status] || { label: h.status };
                    return `
                        <div class="timeline-item ${i === 0 ? 'active' : 'completed'}">
                            <div class="timeline-dot"></div>
                            <div class="timeline-content">
                                <div class="timeline-title">${status.label}</div>
                                <div class="timeline-date">${new Date(h.created_at).toLocaleString('fr-FR')}</div>
                                ${h.location ? `<div class="timeline-location">${h.location}</div>` : ''}
                                ${h.notes ? `<div class="timeline-notes">${h.notes}</div>` : ''}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    },
    
    /**
     * Attache les événements aux boutons
     * @param {Object} pkg - Données du colis
     */
    attachEvents(pkg) {
        // Copier le numéro de tracking
        document.getElementById('btn-copy')?.addEventListener('click', () => {
            const textToCopy = pkg.supplier_tracking || pkg.tracking_number;
            navigator.clipboard.writeText(textToCopy);
            Toast.success('Numero copie');
        });
        
        // Toggle historique détaillé
        document.getElementById('btn-toggle-history')?.addEventListener('click', (e) => {
            const btn = e.currentTarget;
            const timeline = document.getElementById('history-timeline');
            const isVisible = timeline.style.display !== 'none';
            
            timeline.style.display = isVisible ? 'none' : 'block';
            btn.innerHTML = isVisible 
                ? `${Icons.get('clock', { size: 16 })} Voir le detail de l'historique ${Icons.get('chevron-down', { size: 16 })}`
                : `${Icons.get('clock', { size: 16 })} Masquer l'historique ${Icons.get('chevron-up', { size: 16 })}`;
        });
        
        // Modifier le colis
        document.getElementById('btn-edit')?.addEventListener('click', () => {
            Router.navigate(`/new-package?edit=${pkg.id}`);
        });
        
        // Supprimer le colis
        document.getElementById('btn-delete')?.addEventListener('click', async () => {
            const confirmed = await Modal.confirm({
                title: 'Supprimer le colis',
                message: 'Etes-vous sur de vouloir supprimer ce colis ?',
                confirmText: 'Supprimer',
                danger: true
            });
            
            if (confirmed) {
                try {
                    await API.packages.delete(pkg.id);
                    Toast.success('Colis supprime');
                    Router.navigate('/packages');
                } catch (error) {
                    Toast.error(error.message);
                }
            }
        });
        
        // Télécharger le reçu
        document.getElementById('btn-receipt')?.addEventListener('click', () => {
            if (typeof PDFService !== 'undefined') {
                PDFService.generateReceipt(pkg);
            } else {
                Toast.info('Fonctionnalite bientot disponible');
            }
        });
        
        // Payer en ligne
        document.getElementById('btn-pay-online')?.addEventListener('click', () => {
            this.showOnlinePaymentModal(pkg);
        });
    },
    
    async showOnlinePaymentModal(pkg) {
        const paid = pkg.paid_amount || 0;
        const remaining = pkg.remaining_amount || (pkg.amount - paid);
        const currency = pkg.amount_currency || 'XAF';
        
        // Charger les providers
        let providers = [];
        try {
            providers = await API.payments.getProviders();
        } catch (e) {
            Toast.error('Paiement en ligne non disponible');
            return;
        }
        
        if (!providers || providers.length === 0) {
            Toast.info('Aucun moyen de paiement en ligne disponible');
            return;
        }
        
        const providerOptions = providers.map(p => `
            <label class="provider-option" data-code="${p.code}">
                <input type="radio" name="payment-provider" value="${p.code}">
                <div class="provider-option-content">
                    <strong>${p.name}</strong>
                    <span class="text-sm text-muted">${(p.methods || []).join(', ')}</span>
                </div>
            </label>
        `).join('');
        
        Modal.open({
            title: 'Payer en ligne',
            content: `
                <div class="payment-summary mb-md">
                    <div class="payment-row">
                        <span class="payment-label">Colis</span>
                        <span class="payment-value">${pkg.supplier_tracking || pkg.tracking_number}</span>
                    </div>
                    <div class="payment-row payment-remaining">
                        <span class="payment-label">Montant a payer</span>
                        <span class="payment-value text-error font-medium">${this.formatMoney(remaining, currency)}</span>
                    </div>
                </div>
                
                <h4 class="mb-sm">Choisir un moyen de paiement</h4>
                <div class="provider-list" id="provider-list">
                    ${providerOptions}
                </div>
                
                <div id="phone-field" style="display:none;margin-top:12px;">
                    <label class="form-label">Numero de telephone</label>
                    <input type="tel" id="pay-phone" class="form-input" placeholder="Ex: 237670000000">
                    <p class="text-sm text-muted" style="margin-top:4px;">Numero qui recevra la demande USSD</p>
                </div>
                
                <div id="payment-status-area" style="display:none;margin-top:16px;"></div>
            `,
            footer: `
                <button class="btn btn-secondary" onclick="Modal.close()">Annuler</button>
                <button class="btn btn-primary" id="btn-confirm-pay" disabled>Payer</button>
            `
        });
        
        // Provider selection
        let selectedProvider = null;
        document.querySelectorAll('.provider-option').forEach(opt => {
            opt.addEventListener('click', () => {
                document.querySelectorAll('.provider-option').forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');
                opt.querySelector('input').checked = true;
                selectedProvider = opt.dataset.code;
                document.getElementById('btn-confirm-pay').disabled = false;
                
                const phoneField = document.getElementById('phone-field');
                phoneField.style.display = selectedProvider === 'mtn_momo' ? 'block' : 'none';
            });
        });
        
        // Pay button
        document.getElementById('btn-confirm-pay')?.addEventListener('click', async () => {
            if (!selectedProvider) return;
            
            const phone = document.getElementById('pay-phone')?.value?.trim();
            if (selectedProvider === 'mtn_momo' && !phone) {
                Toast.error('Numero de telephone requis pour MTN MoMo');
                return;
            }
            
            const btn = document.getElementById('btn-confirm-pay');
            btn.disabled = true;
            btn.textContent = 'Traitement...';
            
            try {
                const result = await API.payments.initiate({
                    provider: selectedProvider,
                    package_ids: [pkg.id],
                    currency: currency,
                    phone: phone || undefined
                });
                
                // Redirect type: open payment URL
                if (result.payment_url) {
                    window.open(result.payment_url, '_blank');
                }
                
                // Show status area
                const statusArea = document.getElementById('payment-status-area');
                statusArea.style.display = 'block';
                
                if (result.payment_type === 'ussd_push') {
                    statusArea.innerHTML = `
                        <div class="payment-notice">
                            <div class="spinner-sm"></div>
                            <span>${result.message || 'Confirmez le paiement sur votre telephone...'}</span>
                        </div>
                    `;
                    this._pollPaymentStatus(result.payment_id, pkg);
                } else {
                    statusArea.innerHTML = `
                        <div class="payment-notice">
                            <svg class="icon-sm" viewBox="0 0 24 24"><use href="assets/icons/icons.svg#external-link"></use></svg>
                            <span>Vous avez ete redirige vers la page de paiement. Revenez ici apres avoir termine.</span>
                        </div>
                        <button class="btn btn-outline btn-sm mt-sm" id="btn-check-status">Verifier le statut</button>
                    `;
                    document.getElementById('btn-check-status')?.addEventListener('click', () => {
                        this._checkPaymentOnce(result.payment_id, pkg);
                    });
                }
                
                btn.textContent = 'En attente...';
                
            } catch (error) {
                Toast.error(error.message || 'Erreur lors du paiement');
                btn.disabled = false;
                btn.textContent = 'Payer';
            }
        });
    },
    
    async _pollPaymentStatus(paymentId, pkg) {
        for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 3000));
            try {
                const status = await API.payments.checkStatus(paymentId);
                if (status.status === 'confirmed') {
                    Toast.success('Paiement confirme !');
                    Modal.close();
                    this.render(pkg.id);
                    return;
                } else if (status.status === 'cancelled') {
                    const area = document.getElementById('payment-status-area');
                    if (area) area.innerHTML = '<div class="payment-notice payment-notice-warning"><span>Paiement echoue ou annule.</span></div>';
                    return;
                }
            } catch (e) { /* continue polling */ }
        }
        const area = document.getElementById('payment-status-area');
        if (area) area.innerHTML = '<div class="payment-notice payment-notice-warning"><span>Delai depasse. Verifiez le statut plus tard.</span></div>';
    },
    
    async _checkPaymentOnce(paymentId, pkg) {
        try {
            const status = await API.payments.checkStatus(paymentId);
            if (status.status === 'confirmed') {
                Toast.success('Paiement confirme !');
                Modal.close();
                this.render(pkg.id);
            } else if (status.status === 'cancelled') {
                Toast.error('Paiement echoue.');
            } else {
                Toast.info('Paiement encore en attente...');
            }
        } catch (e) {
            Toast.error('Erreur de verification');
        }
    },
    
    /**
     * Formate un montant avec devise
     * @param {number} amount - Montant
     * @param {string} currency - Code devise
     */
    formatMoney(amount, currency = 'XAF') {
        return new Intl.NumberFormat('fr-FR').format(amount) + ' ' + currency;
    },
    
    /**
     * Extrait les dates de l'historique pour le composant tracking-progress
     * @param {Array} history - Liste des entrées d'historique
     * @returns {string} JSON des dates par statut
     */
    getHistoryDates(history) {
        if (!history || history.length === 0) return '{}';
        
        const dates = {};
        history.forEach(h => {
            if (h.status && h.created_at && !dates[h.status]) {
                dates[h.status] = new Date(h.created_at).toLocaleDateString('fr-FR');
            }
        });
        
        return JSON.stringify(dates).replace(/'/g, "\\'");
    }
};
