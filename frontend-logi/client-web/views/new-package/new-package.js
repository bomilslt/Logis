/**
 * Vue New Package - Creation/Edition de colis
 */

Views.newPackage = {
    editMode: false,
    packageId: null,
    originCountrySelect: null,
    originCitySelect: null,
    transportSelect: null,
    packageTypeSelect: null,
    countrySelect: null,
    warehouseSelect: null,
    currencySelect: null,
    photoUploader: null,
    
    async render() {
        const main = document.getElementById('main-content');
        const params = new URLSearchParams(window.location.hash.split('?')[1]);
        this.packageId = params.get('edit');
        this.editMode = !!this.packageId;
        
        let packageData = null;
        if (this.editMode) {
            main.innerHTML = Loader.page('Chargement...');
            
            try {
                // Appel API pour récupérer le colis à modifier
                const response = await API.packages.getById(this.packageId);
                packageData = response.package || response;
                
                if (!packageData) {
                    Toast.error('Colis introuvable');
                    Router.navigate('/packages');
                    return;
                }
                
                // Vérifier si le colis est encore modifiable
                if (!packageData.is_editable) {
                    Toast.error('Ce colis ne peut plus être modifié');
                    Router.navigate(`/packages/${this.packageId}`);
                    return;
                }
            } catch (error) {
                console.error('[new-package] Load error:', error);
                Toast.error('Colis introuvable');
                Router.navigate('/packages');
                return;
            }
        }
        
        // Log en mode dev uniquement
        if (this.editMode && packageData) {
            console.log('[new-package] Edit mode, package:', packageData.id);
        }
        
        // Verifier si on a un template a appliquer
        const templateId = sessionStorage.getItem('use_template');
        if (templateId) {
            sessionStorage.removeItem('use_template');
            const template = await TemplatesService.getById(templateId);
            if (template) {
                packageData = packageData || {};
                packageData.destination = { country: template.country, warehouse: template.warehouse };
                packageData.recipient = { name: template.recipient_name, phone: template.recipient_phone };
            }
        }
        
        // Verifier si on a des params du calculateur
        const calcPrefill = sessionStorage.getItem('calc_prefill');
        if (calcPrefill) {
            sessionStorage.removeItem('calc_prefill');
            const prefill = JSON.parse(calcPrefill);
            packageData = packageData || {};
            if (prefill.originCountry) {
                packageData.origin = packageData.origin || {};
                packageData.origin.country = prefill.originCountry;
            }
            packageData.transport_mode = prefill.transport;
            packageData.package_type = prefill.packageType;
            if (prefill.country) {
                packageData.destination = packageData.destination || {};
                packageData.destination.country = prefill.country;
            }
        }
        
        main.innerHTML = this.renderForm(packageData);
        this.initSelects(packageData);
        this.initPhotoUploader(packageData);
        this.attachEvents(packageData);
        this.updateFormVisibility();
        this.calculateEstimate();
    },
    
    renderForm(packageData) {
        return `
            <div class="new-package-view">
                <div class="page-header">
                    <button class="btn btn-ghost btn-sm" onclick="history.back()">
                        <svg class="icon" viewBox="0 0 24 24">
                            <use href="assets/icons/icons.svg#arrow-left"></use>
                        </svg>
                        Retour
                    </button>
                    <h1 class="page-title">${this.editMode ? 'Modifier le colis' : 'Nouveau colis'}</h1>
                </div>
                
                <form id="package-form" class="package-form">
                    <div class="form-section">
                        <h3 class="form-section-title">Tracking fournisseur</h3>
                        <div class="form-group">
                            <label class="form-label" for="supplier_tracking">Numero de suivi fournisseur *</label>
                            <input type="text" id="supplier_tracking" class="form-input" 
                                placeholder="Ex: 1688, Alibaba, Taobao..." required
                                value="${packageData?.supplier_tracking || ''}">
                            <p class="form-hint">Le numero de suivi fourni par votre vendeur</p>
                        </div>
                    </div>
                    
                    <div class="form-section">
                        <h3 class="form-section-title">Origine (depart)</h3>
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">Pays de depart *</label>
                                <div id="origin-country-select"></div>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Ville *</label>
                                <div id="origin-city-select"></div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="form-section">
                        <h3 class="form-section-title">Destination</h3>
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">Pays de destination *</label>
                                <div id="country-select"></div>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Point de retrait *</label>
                                <div id="warehouse-select"></div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="form-section">
                        <h3 class="form-section-title">Transport et type</h3>
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">Moyen de transport *</label>
                                <div id="transport-select"></div>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Type de colis *</label>
                                <div id="package-type-select"></div>
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="description">Description *</label>
                            <textarea id="description" class="form-input" rows="2" 
                                placeholder="Decrivez le contenu de votre colis" required
                            >${packageData?.description || ''}</textarea>
                        </div>
                    </div>
                    
                    <div class="form-section" id="measures-section">
                        <h3 class="form-section-title">Mesures (optionnel)</h3>
                        <div class="form-row" id="quantity-row">
                            <div class="form-group">
                                <label class="form-label" for="quantity">Nombre de pieces</label>
                                <input type="number" id="quantity" class="form-input" 
                                    min="1" value="${packageData?.quantity || 1}">
                            </div>
                        </div>
                        <div class="form-row" id="weight-row">
                            <div class="form-group">
                                <label class="form-label" for="weight">Poids total (kg)</label>
                                <input type="number" id="weight" class="form-input" 
                                    step="0.1" min="0.1" value="${packageData?.weight || ''}"
                                    placeholder="Optionnel">
                            </div>
                        </div>
                        <div class="form-row" id="cbm-row">
                            <div class="form-group">
                                <label class="form-label" for="cbm">Volume (CBM / m³)</label>
                                <input type="number" id="cbm" class="form-input" 
                                    step="0.001" min="0.001" value="${packageData?.cbm || ''}"
                                    placeholder="Ex: 0.5">
                            </div>
                        </div>
                    </div>
                    
                    <div class="form-section estimate-section" id="estimate-section">
                        <h3 class="form-section-title">Estimation</h3>
                        <div class="departure-info-card" id="departure-info-card">
                            <div class="departure-info-placeholder">
                                <div class="placeholder-icon">
                                    ${Icons.get('calendar', { size: 32 })}
                                </div>
                                <div class="placeholder-text">
                                    <strong>Prochains departs</strong>
                                    <span>Selectionnez la route et le transport</span>
                                </div>
                            </div>
                        </div>
                        <div class="estimate-card" id="estimate-card">
                            <div class="estimate-placeholder">
                                <div class="placeholder-icon">
                                    ${Icons.get('calculator', { size: 32 })}
                                </div>
                                <div class="placeholder-text">
                                    <strong>Estimation du cout</strong>
                                    <span>Remplissez les champs ci-dessus</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="form-section">
                        <h3 class="form-section-title">Valeur declaree</h3>
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label" for="declared_value">Valeur</label>
                                <input type="number" id="declared_value" class="form-input" 
                                    step="0.01" min="0" value="${packageData?.declared_value || ''}">
                            </div>
                            <div class="form-group">
                                <label class="form-label">Devise</label>
                                <div id="currency-select"></div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="form-section">
                        <h3 class="form-section-title">Destinataire</h3>
                        <div class="template-actions">
                            <a href="#/templates" class="btn btn-ghost btn-sm">
                                ${Icons.get('users', { size: 16 })}
                                Mes templates
                            </a>
                            <button type="button" class="btn btn-ghost btn-sm" id="btn-save-template">
                                ${Icons.get('save', { size: 16 })}
                                Sauvegarder
                            </button>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label" for="recipient_name">Nom</label>
                                <input type="text" id="recipient_name" class="form-input" 
                                    placeholder="Nom du destinataire" value="${packageData?.recipient?.name || ''}">
                            </div>
                            <div class="form-group">
                                <label class="form-label" for="recipient_phone">Telephone</label>
                                <input type="tel" id="recipient_phone" class="form-input" 
                                    placeholder="+237 6XX XXX XXX" value="${packageData?.recipient?.phone || ''}">
                            </div>
                        </div>
                    </div>
                    
                    <div class="form-section">
                        <h3 class="form-section-title">Photos du colis (optionnel)</h3>
                        <div id="photo-upload-container"></div>
                    </div>
                    
                    <div class="form-actions">
                        <button type="button" class="btn btn-secondary" onclick="history.back()">
                            Annuler
                        </button>
                        <button type="submit" class="btn btn-primary" id="btn-submit">
                            ${this.editMode ? 'Enregistrer' : 'Creer le colis'}
                        </button>
                    </div>
                </form>
            </div>
        `;
    },
    
    initSelects(packageData) {
        // Origin country select
        const originCountries = Object.entries(CONFIG.ORIGINS).map(([key, val]) => ({
            id: key,
            name: val.label
        }));
        
        this.originCountrySelect = new SearchSelect({
            container: '#origin-country-select',
            placeholder: 'Selectionnez le pays de depart',
            items: originCountries,
            onSelect: (item, value) => {
                this.updateOriginCitySelect(value);
                this.calculateEstimate();
            }
        });
        
        // Origin city select (vide au depart)
        this.originCitySelect = new SearchSelect({
            container: '#origin-city-select',
            placeholder: 'Choisissez d\'abord un pays',
            items: [],
            onSelect: () => {
                this.calculateEstimate();
            }
        });
        
        // Si edition, stocker les valeurs de transport/type pour les appliquer après
        // que origine et destination soient sélectionnées
        if (packageData?.transport_mode) {
            this._pendingTransport = packageData.transport_mode;
            this._pendingPackageType = packageData.package_type;
        }
        
        // Si edition ou prefill, pre-remplir origine
        if (packageData?.origin?.country) {
            this.originCountrySelect.setValue(packageData.origin.country);
            this.updateOriginCitySelect(packageData.origin.country, true);
            if (packageData?.origin?.city) {
                // Chercher l'ID de la ville par son nom (l'API stocke le nom, pas l'ID)
                const cities = CONFIG.ORIGINS[packageData.origin.country]?.cities || [];
                const cityMatch = cities.find(c => 
                    c.id === packageData.origin.city || 
                    c.name.toLowerCase() === packageData.origin.city.toLowerCase()
                );
                if (cityMatch) {
                    this.originCitySelect.setValue(cityMatch.id);
                }
            }
        } else {
            // Valeur par defaut: premier pays disponible
            const firstOriginKey = Object.keys(CONFIG.ORIGINS)[0];
            if (firstOriginKey) {
                this.originCountrySelect.setValue(firstOriginKey);
                this.updateOriginCitySelect(firstOriginKey);
                const firstCity = CONFIG.ORIGINS[firstOriginKey]?.cities?.[0];
                if (firstCity) {
                    this.originCitySelect.setValue(firstCity.id);
                }
            }
        }
        
        // Transport select - sera mis à jour quand origine ET destination sont sélectionnées
        this.transportSelect = new SearchSelect({
            container: '#transport-select',
            placeholder: 'Choisissez d\'abord origine et destination',
            items: [],
            onSelect: (item, value) => {
                this.updatePackageTypeSelect(value);
                this.updateFormVisibility();
                this.calculateEstimate();
            }
        });
        
        // Package type select (vide au depart)
        this.packageTypeSelect = new SearchSelect({
            container: '#package-type-select',
            placeholder: 'Choisissez d\'abord le transport',
            items: [],
            onSelect: () => {
                this.updateFormVisibility();
                this.calculateEstimate();
            }
        });
        
        // Country select (destination)
        const countries = Object.entries(CONFIG.DESTINATIONS).map(([key, val]) => ({
            id: key,
            name: val.label
        }));
        
        this.countrySelect = new SearchSelect({
            container: '#country-select',
            placeholder: 'Selectionnez le pays',
            items: countries,
            onSelect: (item, value) => {
                this.updateWarehouseSelect(value);
                // Mettre à jour les transports disponibles pour cette route
                this.updateTransportSelect();
                this.calculateEstimate();
            }
        });
        
        // Warehouse select (vide au depart)
        this.warehouseSelect = new SearchSelect({
            container: '#warehouse-select',
            placeholder: 'Choisissez d\'abord un pays',
            items: [],
            onSelect: () => {}
        });
        
        // Si edition, pre-remplir destination
        if (packageData?.destination?.country) {
            this.countrySelect.setValue(packageData.destination.country);
            this.updateWarehouseSelect(packageData.destination.country, true);
            if (packageData?.destination?.warehouse) {
                this.warehouseSelect.setValue(packageData.destination.warehouse);
            }
            // Mettre à jour les transports maintenant que origine ET destination sont définis
            this.updateTransportSelect();
        }
        
        // Currency select
        this.currencySelect = new SearchSelect({
            container: '#currency-select',
            placeholder: 'Devise',
            items: CONFIG.CURRENCIES.map(c => ({ id: c, name: c })),
            onSelect: () => {}
        });
        this.currencySelect.setValue(packageData?.currency || 'USD');
    },
    
    updateOriginCitySelect(country, skipClear = false) {
        if (!country || !this.originCitySelect) return;
        
        const countryData = CONFIG.ORIGINS[country];
        if (!countryData) return;
        
        const items = countryData.cities.map(c => ({ id: c.id, name: c.name }));
        this.originCitySelect.setItems(items);
        if (!skipClear) {
            this.originCitySelect.clear();
        }
        this.originCitySelect.input.placeholder = 'Selectionnez la ville';
        
        // Mettre à jour les transports si destination déjà sélectionnée
        this.updateTransportSelect();
    },
    
    /**
     * Met à jour le select des transports selon la route origine → destination
     * Affiche uniquement les transports configurés par l'admin
     */
    updateTransportSelect() {
        if (!this.transportSelect) return;
        
        const originCountry = this.originCountrySelect?.getValue();
        const destCountry = this.countrySelect?.getValue();
        
        if (!originCountry || !destCountry) {
            this.transportSelect.setItems([]);
            this.transportSelect.clear();
            this.transportSelect.input.placeholder = 'Choisissez d\'abord origine et destination';
            // Vider aussi les types
            this.packageTypeSelect?.setItems([]);
            this.packageTypeSelect?.clear();
            return;
        }
        
        const transports = ShippingService.getAvailableTransports(originCountry, destCountry);
        
        if (transports.length === 0) {
            this.transportSelect.setItems([]);
            this.transportSelect.clear();
            this.transportSelect.input.placeholder = 'Aucun transport disponible pour cette route';
            // Vider aussi les types
            this.packageTypeSelect?.setItems([]);
            this.packageTypeSelect?.clear();
            return;
        }
        
        const items = transports.map(t => ({ id: t.value, name: t.label }));
        this.transportSelect.setItems(items);
        this.transportSelect.input.placeholder = 'Selectionnez le transport';
        
        // Si on avait un transport en attente (mode édition), le sélectionner
        if (this._pendingTransport && items.some(i => i.id === this._pendingTransport)) {
            this.transportSelect.setValue(this._pendingTransport);
            this.updatePackageTypeSelect(this._pendingTransport);
            if (this._pendingPackageType) {
                // Chercher par ID ou par label (compatibilité avec anciennes données)
                const typeItems = this.packageTypeSelect?.options?.items || [];
                const typeMatch = typeItems.find(t => 
                    t.id === this._pendingPackageType || 
                    t.name.toLowerCase() === this._pendingPackageType.toLowerCase()
                );
                if (typeMatch) {
                    this.packageTypeSelect?.setValue(typeMatch.id);
                }
            }
            this._pendingTransport = null;
            this._pendingPackageType = null;
        } else {
            // Vider la sélection actuelle si elle n'est plus valide
            const currentTransport = this.transportSelect.getValue();
            if (currentTransport && !items.some(i => i.id === currentTransport)) {
                this.transportSelect.clear();
                this.packageTypeSelect?.setItems([]);
                this.packageTypeSelect?.clear();
            }
        }
    },
    
    initPhotoUploader(packageData) {
        const container = document.getElementById('photo-upload-container');
        if (!container) return;
        
        this.photoUploader = PhotosService.createUploadComponent(container, {
            initialPhotos: packageData?.photos || [],
            onPhotosChange: (photos) => {
                // Photos mises a jour
            }
        });
    },
    
    updatePackageTypeSelect(transport) {
        if (!transport || !this.packageTypeSelect) return;
        
        // Sauvegarder la valeur actuelle
        const currentValue = this.packageTypeSelect.getValue();
        
        // Obtenir les types dynamiquement depuis la route
        const originCountry = this.originCountrySelect?.getValue();
        const destCountry = this.countrySelect?.getValue();
        const types = ShippingService.getPackageTypes(transport, originCountry, destCountry);
        
        if (types.length === 0) {
            this.packageTypeSelect.setItems([]);
            this.packageTypeSelect.clear();
            this.packageTypeSelect.input.placeholder = 'Aucun type disponible';
            return;
        }
        
        const items = types.map(t => ({ id: t.value, name: t.label }));
        this.packageTypeSelect.setItems(items);
        this.packageTypeSelect.input.placeholder = 'Selectionnez le type';
        
        // Restaurer la valeur si elle existe toujours dans les nouveaux items
        if (currentValue && items.some(item => item.id === currentValue)) {
            this.packageTypeSelect.setValue(currentValue);
        } else {
            this.packageTypeSelect.clear();
        }
    },
    
    updateWarehouseSelect(country, skipClear = false) {
        if (!country || !this.warehouseSelect) return;
        
        const countryData = CONFIG.DESTINATIONS[country];
        if (!countryData) return;
        
        // Mettre a jour les items et le placeholder
        const items = countryData.warehouses.map(w => ({ id: w.id, name: w.name }));
        this.warehouseSelect.setItems(items);
        if (!skipClear) {
            this.warehouseSelect.clear();
        }
        this.warehouseSelect.input.placeholder = 'Selectionnez le point de retrait';
    },
    
    updateFormVisibility() {
        const transport = this.transportSelect?.getValue();
        const packageType = this.packageTypeSelect?.getValue();
        const originCountry = this.originCountrySelect?.getValue();
        const destCountry = this.countrySelect?.getValue();
        
        const quantityRow = document.getElementById('quantity-row');
        const weightRow = document.getElementById('weight-row');
        const cbmRow = document.getElementById('cbm-row');
        
        // Par defaut tout cacher
        quantityRow.style.display = 'none';
        weightRow.style.display = 'none';
        cbmRow.style.display = 'none';
        
        if (!transport || !packageType) return;
        
        // Obtenir la config du type dynamiquement
        const typeConfig = ShippingService.getTypeConfig(packageType, transport, originCountry, destCountry);
        const unit = typeConfig?.unit || 'kg';
        
        if (unit === 'cbm') {
            cbmRow.style.display = 'flex';
            weightRow.style.display = 'flex'; // Poids optionnel pour info
        } else if (unit === 'piece') {
            quantityRow.style.display = 'flex';
        } else if (unit === 'kg') {
            weightRow.style.display = 'flex';
        }
        // unit === 'fixed' -> rien a afficher
    },
    
    calculateEstimate() {
        const originCountry = this.originCountrySelect?.getValue();
        const transport = this.transportSelect?.getValue();
        const packageType = this.packageTypeSelect?.getValue();
        const destCountry = this.countrySelect?.getValue();
        const estimateCard = document.getElementById('estimate-card');
        
        // Mettre a jour les infos de depart
        this.updateDepartureInfo(originCountry, destCountry, transport);
        
        if (!originCountry) {
            estimateCard.innerHTML = `
                <div class="estimate-placeholder">
                    <div class="placeholder-icon">
                        ${Icons.get('map-pin', { size: 32 })}
                    </div>
                    <div class="placeholder-text">
                        <strong>Pays de depart</strong>
                        <span>Selectionnez le pays d'origine</span>
                    </div>
                </div>
            `;
            return;
        }
        
        if (!transport) {
            estimateCard.innerHTML = `
                <div class="estimate-placeholder">
                    <div class="placeholder-icon">
                        ${Icons.get('truck', { size: 32 })}
                    </div>
                    <div class="placeholder-text">
                        <strong>Transport</strong>
                        <span>Choisissez le moyen de transport</span>
                    </div>
                </div>
            `;
            return;
        }
        
        if (!packageType) {
            estimateCard.innerHTML = `
                <div class="estimate-placeholder">
                    <div class="placeholder-icon">
                        ${Icons.get('package', { size: 32 })}
                    </div>
                    <div class="placeholder-text">
                        <strong>Type de colis</strong>
                        <span>Choisissez le type de colis</span>
                    </div>
                </div>
            `;
            return;
        }
        
        if (!destCountry) {
            estimateCard.innerHTML = `
                <div class="estimate-placeholder">
                    <div class="placeholder-icon">
                        ${Icons.get('flag', { size: 32 })}
                    </div>
                    <div class="placeholder-text">
                        <strong>Destination</strong>
                        <span>Selectionnez le pays de destination</span>
                    </div>
                </div>
            `;
            return;
        }
        
        // Obtenir les tarifs de la route
        const routeRates = ShippingService.getRouteRates(originCountry, destCountry);
        if (!routeRates || !routeRates[transport]) {
            estimateCard.innerHTML = `
                <div class="estimate-placeholder error">
                    <div class="placeholder-icon">
                        ${Icons.get('alert-circle', { size: 32 })}
                    </div>
                    <div class="placeholder-text">
                        <strong>Route non disponible</strong>
                        <span>Aucun tarif pour cette route</span>
                    </div>
                </div>
            `;
            return;
        }
        
        const rates = routeRates[transport];
        const typeConfig = ShippingService.getTypeConfig(packageType, transport, originCountry, destCountry);
        const rate = ShippingService.getRateValue(rates, packageType);
        const unit = typeConfig?.unit || 'kg';
        const typeLabel = typeConfig?.label || packageType;
        
        if (rate === null) {
            estimateCard.innerHTML = `
                <div class="estimate-placeholder error">
                    <div class="placeholder-icon">
                        ${Icons.get('alert-circle', { size: 32 })}
                    </div>
                    <div class="placeholder-text">
                        <strong>Type non disponible</strong>
                        <span>Ce type n'est pas disponible pour cette route</span>
                    </div>
                </div>
            `;
            return;
        }
        
        // Recuperer les mesures (optionnelles)
        const quantity = parseInt(document.getElementById('quantity')?.value) || 0;
        const weight = parseFloat(document.getElementById('weight')?.value) || 0;
        const cbm = parseFloat(document.getElementById('cbm')?.value) || 0;
        
        // Determiner si on peut calculer une estimation
        let canEstimate = false;
        let estimate = 0;
        let details = '';
        
        if (unit === 'fixed') {
            // Tarif fixe - toujours calculable
            canEstimate = true;
            estimate = rate;
            details = `Tarif fixe`;
        } else if (unit === 'cbm' && cbm > 0) {
            canEstimate = true;
            estimate = cbm * rate;
            details = `${cbm} m³ × ${rate} ${rates.currency}/m³`;
        } else if (unit === 'piece' && quantity > 0) {
            canEstimate = true;
            estimate = quantity * rate;
            details = `${quantity} piece(s) × ${rate} ${rates.currency}/piece`;
        } else if (unit === 'kg' && weight > 0) {
            canEstimate = true;
            estimate = weight * rate;
            details = `${weight} kg × ${rate} ${rates.currency}/kg`;
        }
        
        const originLabel = ShippingService.getOriginCountryLabel(originCountry);
        const transportLabel = ShippingService.getTransportLabel(transport);
        const destLabel = ShippingService.getCountryLabel(destCountry);
        
        // Formater l'unite pour l'affichage
        const unitLabels = { kg: '/kg', piece: '/piece', cbm: '/m³', fixed: '' };
        const unitLabel = unitLabels[unit] || '';
        
        if (canEstimate) {
            // Afficher l'estimation complete
            estimateCard.innerHTML = `
                <div class="estimate-result">
                    <div class="estimate-header">
                        <span class="estimate-label">Cout estime</span>
                        <span class="estimate-value">${estimate.toFixed(2)} ${rates.currency}</span>
                    </div>
                    <div class="estimate-details">
                        <div class="estimate-detail-row">
                            <span>Route:</span>
                            <span>${originLabel} → ${destLabel}</span>
                        </div>
                        <div class="estimate-detail-row">
                            <span>Transport:</span>
                            <span>${transportLabel}</span>
                        </div>
                        <div class="estimate-detail-row">
                            <span>Type:</span>
                            <span>${typeLabel}</span>
                        </div>
                        <div class="estimate-detail-row">
                            <span>Calcul:</span>
                            <span>${details}</span>
                        </div>
                    </div>
                    <p class="estimate-note">* Estimation indicative, le cout final sera calcule a la reception</p>
                </div>
            `;
        } else {
            // Afficher juste le tarif applicable (pas de mesures)
            const measureHint = unit === 'cbm' ? 'le volume (m³)' : unit === 'kg' ? 'le poids (kg)' : 'la quantite';
            
            estimateCard.innerHTML = `
                <div class="estimate-tarif-only">
                    <div class="tarif-header">
                        <span class="tarif-label">Tarif applicable</span>
                        <span class="tarif-value">${rate} ${rates.currency}${unitLabel}</span>
                    </div>
                    <div class="tarif-details">
                        <div class="tarif-detail-row">
                            <span>Route:</span>
                            <span>${originLabel} → ${destLabel}</span>
                        </div>
                        <div class="tarif-detail-row">
                            <span>Transport:</span>
                            <span>${transportLabel}</span>
                        </div>
                        <div class="tarif-detail-row">
                            <span>Type:</span>
                            <span>${typeLabel}</span>
                        </div>
                    </div>
                    <p class="tarif-hint">
                        ${Icons.get('info', { size: 14 })}
                        Renseignez ${measureHint} pour voir l'estimation du cout
                    </p>
                </div>
            `;
        }
    },
    
    async updateDepartureInfo(originCountry, destCountry, transport) {
        const departureCard = document.getElementById('departure-info-card');
        if (!departureCard) return;
        
        // Verifier si on a toutes les infos necessaires
        if (!originCountry || !destCountry || !transport) {
            departureCard.innerHTML = `
                <div class="departure-info-placeholder">
                    <div class="placeholder-icon">
                        ${Icons.get('calendar', { size: 32 })}
                    </div>
                    <div class="placeholder-text">
                        <strong>Prochains departs</strong>
                        <span>Selectionnez la route et le transport</span>
                    </div>
                </div>
            `;
            return;
        }
        
        // Afficher un loader pendant le chargement
        departureCard.innerHTML = `
            <div class="departure-info-placeholder loading">
                <div class="placeholder-icon">
                    ${Icons.get('loader', { size: 32 })}
                </div>
                <div class="placeholder-text">
                    <strong>Recherche en cours</strong>
                    <span>Chargement des prochains departs...</span>
                </div>
            </div>
        `;
        
        // Chercher le prochain depart (async)
        const nextDeparture = await DeparturesService.getNextForRoute(originCountry, destCountry, transport);
        
        if (!nextDeparture) {
            const transportLabel = ShippingService.getTransportLabel(transport);
            const originLabel = ShippingService.getOriginCountryLabel(originCountry);
            const destLabel = ShippingService.getCountryLabel(destCountry);
            
            departureCard.innerHTML = `
                <div class="departure-info-none">
                    ${Icons.get('alert-circle', { size: 20 })}
                    <div class="departure-info-none-content">
                        <span class="departure-info-none-title">Aucun depart programme</span>
                        <span class="departure-info-none-desc">Pas de depart ${transportLabel} prevu pour ${originLabel} → ${destLabel}. Votre colis sera assigne au prochain depart disponible.</span>
                    </div>
                </div>
            `;
            return;
        }
        
        // Formater les infos du depart
        const dep = DeparturesService.formatDeparture(nextDeparture);
        const transportLabel = ShippingService.getTransportLabel(transport);
        
        departureCard.innerHTML = `
            <div class="departure-info-found ${dep.isUrgent ? 'urgent' : ''}">
                <div class="departure-info-header">
                    ${Icons.get('check-circle', { size: 18 })}
                    <span class="departure-info-title">Votre colis sera sur ce depart</span>
                    <span class="departure-info-badge ${dep.isUrgent ? 'urgent' : ''}">${dep.daysUntilLabel}</span>
                </div>
                <div class="departure-info-details">
                    <div class="departure-info-row">
                        <span class="departure-info-label">Depart ${transportLabel}:</span>
                        <span class="departure-info-value">${dep.departureDateStr}</span>
                    </div>
                    <div class="departure-info-row">
                        <span class="departure-info-label">Duree estimee:</span>
                        <span class="departure-info-value">~${dep.duration} jours</span>
                    </div>
                    <div class="departure-info-row">
                        <span class="departure-info-label">Arrivee estimee:</span>
                        <span class="departure-info-value">${dep.arrivalDateStr}</span>
                    </div>
                </div>
                ${dep.notes ? `<p class="departure-info-notes">${dep.notes}</p>` : ''}
            </div>
        `;
    },
    
    attachEvents(packageData) {
        // Form submit
        document.getElementById('package-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleSubmit();
        });
        
        // Recalculate on input change
        ['quantity', 'weight', 'cbm'].forEach(id => {
            document.getElementById(id)?.addEventListener('input', () => {
                this.calculateEstimate();
            });
        });
        
        // Save template
        document.getElementById('btn-save-template')?.addEventListener('click', async () => {
            const country = this.countrySelect?.getValue();
            const warehouse = this.warehouseSelect?.getValue();
            const recipientName = document.getElementById('recipient_name')?.value;
            const recipientPhone = document.getElementById('recipient_phone')?.value;
            
            if (!country || !warehouse) {
                Toast.error('Selectionnez d\'abord un pays et un point de retrait');
                return;
            }
            
            const name = await Modal.prompt({
                title: 'Sauvegarder le template',
                message: 'Donnez un nom a ce template (ex: "Maison Douala")',
                placeholder: 'Nom du template',
                confirmText: 'Sauvegarder'
            });
            
            if (name) {
                try {
                    await TemplatesService.save({
                        name: name,
                        recipient_name: recipientName,
                        recipient_phone: recipientPhone,
                        country: country,
                        warehouse: warehouse
                    });
                    Toast.success('Template sauvegarde');
                } catch (error) {
                    Toast.error('Erreur lors de la sauvegarde');
                }
            }
        });
    },
    
    async handleSubmit() {
        // Validations
        const originCountry = this.originCountrySelect?.getValue();
        const originCity = this.originCitySelect?.getValue();
        const transport = this.transportSelect?.getValue();
        const packageType = this.packageTypeSelect?.getValue();
        const country = this.countrySelect?.getValue();
        const warehouse = this.warehouseSelect?.getValue();
        
        if (!originCountry) {
            Toast.error('Veuillez selectionner un pays de depart');
            return;
        }
        if (!originCity) {
            Toast.error('Veuillez selectionner une ville de depart');
            return;
        }
        if (!transport) {
            Toast.error('Veuillez choisir un moyen de transport');
            return;
        }
        if (!packageType) {
            Toast.error('Veuillez choisir un type de colis');
            return;
        }
        if (!country) {
            Toast.error('Veuillez selectionner un pays');
            return;
        }
        if (!warehouse) {
            Toast.error('Veuillez selectionner un point de retrait');
            return;
        }
        
        const btn = document.getElementById('btn-submit');
        btn.disabled = true;
        btn.innerHTML = Loader.inline('sm') + ' Enregistrement...';
        
        // Obtenir le nom de la ville d'origine
        const originCityData = CONFIG.ORIGINS[originCountry]?.cities.find(c => c.id === originCity);
        
        const data = {
            supplier_tracking: document.getElementById('supplier_tracking').value,
            description: document.getElementById('description').value,
            origin_country: originCountry,
            origin_city: originCityData?.name || originCity,
            transport_mode: transport,
            package_type: packageType,
            quantity: parseInt(document.getElementById('quantity').value) || 1,
            weight: parseFloat(document.getElementById('weight').value) || null,
            cbm: parseFloat(document.getElementById('cbm').value) || null,
            declared_value: parseFloat(document.getElementById('declared_value').value) || null,
            currency: this.currencySelect?.getValue() || 'USD',
            destination_country: country,
            destination_warehouse: warehouse,
            recipient_name: document.getElementById('recipient_name').value,
            recipient_phone: document.getElementById('recipient_phone').value
        };
        
        console.log('[new-package] Submitting:', this.editMode ? 'UPDATE' : 'CREATE');
        
        try {
            if (this.editMode) {
                const result = await API.packages.update(this.packageId, data);
                Toast.success('Colis modifie');
                Router.navigate(`/packages/${this.packageId}`);
            } else {
                const result = await API.packages.create(data);
                Toast.success('Colis cree');
                Router.navigate(`/packages/${result.package.id}`);
            }
        } catch (error) {
            Toast.error(error.message || 'Erreur lors de l\'enregistrement');
            btn.disabled = false;
            btn.textContent = this.editMode ? 'Enregistrer' : 'Creer le colis';
        }
    }
};
