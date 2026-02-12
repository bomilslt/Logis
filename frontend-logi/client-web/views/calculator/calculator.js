/**
 * Vue Calculator - Estimation des couts d'expedition
 */

Views.calculator = {
    originCountrySelect: null,
    transportSelect: null,
    packageTypeSelect: null,
    countrySelect: null,
    
    async render() {
        const main = document.getElementById('main-content');
        
        main.innerHTML = `
            <div class="calculator-view">
                <div class="calculator-header">
                    <h1 class="calculator-title">Calculateur de tarifs</h1>
                    <p class="calculator-subtitle">Estimez le cout d'expedition de vos colis</p>
                </div>
                
                <div class="calculator-container">
                    <div class="calculator-form">
                        <div class="calc-section">
                            <label class="calc-label">Pays de depart</label>
                            <div id="calc-origin"></div>
                        </div>
                        
                        <div class="calc-section">
                            <label class="calc-label">Pays de destination</label>
                            <div id="calc-country"></div>
                        </div>
                        
                        <div class="calc-section">
                            <label class="calc-label">Moyen de transport</label>
                            <div id="calc-transport"></div>
                        </div>
                        
                        <div class="calc-section">
                            <label class="calc-label">Type de colis</label>
                            <div id="calc-type"></div>
                        </div>
                        
                        <div class="calc-section" id="calc-quantity-section" style="display: none;">
                            <label class="calc-label">Nombre de pieces</label>
                            <input type="number" id="calc-quantity" class="form-input" min="1" value="1">
                        </div>
                        
                        <div class="calc-section" id="calc-weight-section" style="display: none;">
                            <label class="calc-label">Poids (kg)</label>
                            <input type="number" id="calc-weight" class="form-input" step="0.1" min="0.1" placeholder="Ex: 5.5">
                        </div>
                        
                        <div class="calc-section" id="calc-cbm-section" style="display: none;">
                            <label class="calc-label">Volume (CBM / m³)</label>
                            <input type="number" id="calc-cbm" class="form-input" step="0.001" min="0.001" placeholder="Ex: 0.5">
                        </div>
                    </div>
                    
                    <div class="calculator-result">
                        <div class="result-card" id="result-card">
                            <div class="result-placeholder">
                                <div class="result-placeholder-icon">
                                    ${Icons.get('package', { size: 56 })}
                                </div>
                                <h3>Estimation du cout</h3>
                                <p>Selectionnez une route et un type de colis pour voir le tarif applicable</p>
                            </div>
                        </div>
                        
                        <button class="btn btn-primary btn-lg btn-block" id="btn-create-package" style="display: none;">
                            ${Icons.get('plus', { size: 20 })}
                            Creer un colis avec ces parametres
                        </button>
                    </div>
                </div>
                
                <div class="tarifs-section">
                    <h2 class="tarifs-title">Grille tarifaire</h2>
                    <div class="tarifs-filters">
                        <div class="tarif-filter">
                            <label>Origine:</label>
                            <div id="tarif-origin-filter"></div>
                        </div>
                    </div>
                    <div class="tarifs-tabs">
                        <button class="tarif-tab active" data-transport="air_normal">Avion Normal</button>
                        <button class="tarif-tab" data-transport="air_express">Avion Express</button>
                        <button class="tarif-tab" data-transport="sea">Bateau</button>
                    </div>
                    <div class="tarifs-table-container" id="tarifs-table"></div>
                </div>
            </div>
        `;
        
        this.initSelects();
        this.attachEvents();
        this.renderTarifsTable('air_normal');
    },
    
    initSelects() {
        // Origin country
        const originCountries = Object.entries(CONFIG.ORIGINS).map(([key, val]) => ({
            id: key,
            name: val.label
        }));
        
        this.originCountrySelect = new SearchSelect({
            container: '#calc-origin',
            placeholder: 'Selectionnez le pays de depart',
            items: originCountries,
            onSelect: () => {
                this.updateTransportSelect();
                this.calculate();
            }
        });
        
        // Transport - sera mis à jour quand origine ET destination sont sélectionnées
        this.transportSelect = new SearchSelect({
            container: '#calc-transport',
            placeholder: 'Choisissez d\'abord origine et destination',
            items: [],
            onSelect: (item, value) => {
                this.updateTypeSelect(value);
                this.updateInputVisibility();
                this.calculate();
            }
        });
        
        // Type (vide au depart)
        this.packageTypeSelect = new SearchSelect({
            container: '#calc-type',
            placeholder: 'Choisissez d\'abord le transport',
            items: [],
            onSelect: () => {
                this.updateInputVisibility();
                this.calculate();
            }
        });
        
        // Pays destination
        const countries = Object.entries(CONFIG.DESTINATIONS).map(([key, val]) => ({
            id: key,
            name: val.label
        }));
        
        this.countrySelect = new SearchSelect({
            container: '#calc-country',
            placeholder: 'Selectionnez le pays',
            items: countries,
            onSelect: () => {
                this.updateTransportSelect();
                this.calculate();
            }
        });
        
        // Filter pour la grille tarifaire
        this.tarifOriginFilter = new SearchSelect({
            container: '#tarif-origin-filter',
            placeholder: 'Origine',
            items: originCountries,
            onSelect: () => {
                const activeTab = document.querySelector('.tarif-tab.active');
                this.renderTarifsTable(activeTab?.dataset.transport || 'air_normal');
            }
        });
        this.tarifOriginFilter.setValue('China');
    },
    
    updateTypeSelect(transport) {
        if (!transport) return;
        
        // Sauvegarder la valeur actuelle
        const currentValue = this.packageTypeSelect?.getValue();
        
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
        
        // Restaurer la valeur si elle existe toujours
        if (currentValue && items.some(item => item.id === currentValue)) {
            this.packageTypeSelect.setValue(currentValue);
        } else {
            this.packageTypeSelect.clear();
        }
    },
    
    /**
     * Met à jour le select des transports selon la route origine → destination
     */
    updateTransportSelect() {
        if (!this.transportSelect) return;
        
        const originCountry = this.originCountrySelect?.getValue();
        const destCountry = this.countrySelect?.getValue();
        
        if (!originCountry || !destCountry) {
            this.transportSelect.setItems([]);
            this.transportSelect.clear();
            this.transportSelect.input.placeholder = 'Choisissez d\'abord origine et destination';
            this.packageTypeSelect?.setItems([]);
            this.packageTypeSelect?.clear();
            return;
        }
        
        const transports = ShippingService.getAvailableTransports(originCountry, destCountry);
        
        if (transports.length === 0) {
            this.transportSelect.setItems([]);
            this.transportSelect.clear();
            this.transportSelect.input.placeholder = 'Aucun transport disponible pour cette route';
            this.packageTypeSelect?.setItems([]);
            this.packageTypeSelect?.clear();
            return;
        }
        
        const items = transports.map(t => ({ id: t.value, name: t.label }));
        this.transportSelect.setItems(items);
        this.transportSelect.input.placeholder = 'Selectionnez le transport';
        
        // Vider la sélection si elle n'est plus valide
        const currentTransport = this.transportSelect.getValue();
        if (currentTransport && !items.some(i => i.id === currentTransport)) {
            this.transportSelect.clear();
            this.packageTypeSelect?.setItems([]);
            this.packageTypeSelect?.clear();
        }
    },
    
    updateInputVisibility() {
        const transport = this.transportSelect?.getValue();
        const packageType = this.packageTypeSelect?.getValue();
        const originCountry = this.originCountrySelect?.getValue();
        const destCountry = this.countrySelect?.getValue();
        
        const quantitySection = document.getElementById('calc-quantity-section');
        const weightSection = document.getElementById('calc-weight-section');
        const cbmSection = document.getElementById('calc-cbm-section');
        
        quantitySection.style.display = 'none';
        weightSection.style.display = 'none';
        cbmSection.style.display = 'none';
        
        if (!transport || !packageType) return;
        
        const typeConfig = ShippingService.getTypeConfig(packageType, transport, originCountry, destCountry);
        const unit = typeConfig?.unit || 'kg';
        
        if (unit === 'cbm') {
            cbmSection.style.display = 'block';
        } else if (unit === 'piece') {
            quantitySection.style.display = 'block';
        } else if (unit === 'kg') {
            weightSection.style.display = 'block';
        }
        // unit === 'fixed' -> rien a afficher
    },
    
    calculate() {
        const resultCard = document.getElementById('result-card');
        const btnCreate = document.getElementById('btn-create-package');
        
        const originCountry = this.originCountrySelect?.getValue();
        const transport = this.transportSelect?.getValue();
        const packageType = this.packageTypeSelect?.getValue();
        const country = this.countrySelect?.getValue();
        const quantity = parseInt(document.getElementById('calc-quantity')?.value) || 0;
        const weight = parseFloat(document.getElementById('calc-weight')?.value) || 0;
        const cbm = parseFloat(document.getElementById('calc-cbm')?.value) || 0;
        
        // Validations de base
        if (!originCountry || !transport || !packageType || !country) {
            btnCreate.style.display = 'none';
            resultCard.innerHTML = `
                <div class="result-placeholder">
                    <div class="result-placeholder-icon">
                        ${Icons.get('package', { size: 56 })}
                    </div>
                    <h3>Estimation du cout</h3>
                    <p>Selectionnez une route et un type de colis pour voir le tarif applicable</p>
                </div>
            `;
            return;
        }
        
        // Obtenir les tarifs
        const routeRates = ShippingService.getRouteRates(originCountry, country);
        if (!routeRates || !routeRates[transport]) {
            btnCreate.style.display = 'none';
            resultCard.innerHTML = `
                <div class="result-placeholder error">
                    <div class="result-placeholder-icon">
                        ${Icons.get('alert-circle', { size: 56 })}
                    </div>
                    <h3>Route non disponible</h3>
                    <p>Aucun tarif configure pour cette route et ce transport</p>
                </div>
            `;
            return;
        }
        
        const rates = routeRates[transport];
        const typeConfig = ShippingService.getTypeConfig(packageType, transport, originCountry, country);
        const rate = ShippingService.getRateValue(rates, packageType);
        const unit = typeConfig?.unit || 'kg';
        const typeLabel = typeConfig?.label || packageType;
        
        if (rate === null) {
            btnCreate.style.display = 'none';
            resultCard.innerHTML = `
                <div class="result-placeholder error">
                    <div class="result-placeholder-icon">
                        ${Icons.get('alert-circle', { size: 56 })}
                    </div>
                    <h3>Type non disponible</h3>
                    <p>Ce type de colis n'est pas disponible pour cette route</p>
                </div>
            `;
            return;
        }
        
        // Determiner si on peut calculer une estimation
        let canEstimate = false;
        let estimate = 0;
        let details = '';
        
        if (unit === 'fixed') {
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
        const destLabel = ShippingService.getCountryLabel(country);
        
        const unitLabels = { kg: '/kg', piece: '/piece', cbm: '/m³', fixed: '' };
        const unitLabel = unitLabels[unit] || '';
        
        btnCreate.style.display = 'flex';
        
        if (canEstimate) {
            resultCard.innerHTML = `
                <div class="result-success">
                    <div class="result-amount">
                        <span class="result-value">${estimate.toFixed(2)}</span>
                        <span class="result-currency">${rates.currency}</span>
                    </div>
                    <div class="result-details">
                        <div class="result-row">
                            <span>Route</span>
                            <span>${originLabel} → ${destLabel}</span>
                        </div>
                        <div class="result-row">
                            <span>Transport</span>
                            <span>${transportLabel}</span>
                        </div>
                        <div class="result-row">
                            <span>Type</span>
                            <span>${typeLabel}</span>
                        </div>
                        <div class="result-row result-row-highlight">
                            <span>Calcul</span>
                            <span>${details}</span>
                        </div>
                    </div>
                    ${this.renderDepartureInfo(originCountry, country, transport)}
                    <p class="result-note">* Estimation indicative, le cout final sera calcule a la reception</p>
                </div>
            `;
        } else {
            // Afficher juste le tarif
            const measureHint = unit === 'cbm' ? 'le volume' : unit === 'kg' ? 'le poids' : 'la quantite';
            
            resultCard.innerHTML = `
                <div class="result-tarif-only">
                    <div class="result-tarif-header">
                        <span class="result-tarif-label">Tarif applicable</span>
                        <span class="result-tarif-value">${rate} ${rates.currency}${unitLabel}</span>
                    </div>
                    <div class="result-details">
                        <div class="result-row">
                            <span>Route</span>
                            <span>${originLabel} → ${destLabel}</span>
                        </div>
                        <div class="result-row">
                            <span>Transport</span>
                            <span>${transportLabel}</span>
                        </div>
                        <div class="result-row">
                            <span>Type</span>
                            <span>${typeLabel}</span>
                        </div>
                    </div>
                    ${this.renderDepartureInfo(originCountry, country, transport)}
                    <p class="result-tarif-hint">
                        ${Icons.get('info', { size: 14 })}
                        Renseignez ${measureHint} pour calculer l'estimation
                    </p>
                </div>
            `;
        }
    },
    
    renderDepartureInfo(originCountry, destCountry, transport) {
        const nextDeparture = DeparturesService.getNextForRoute(originCountry, destCountry, transport);
        
        if (!nextDeparture) {
            return `
                <div class="result-departure none">
                    ${Icons.get('calendar', { size: 16 })}
                    <span>Aucun depart programme pour cette route</span>
                </div>
            `;
        }
        
        const dep = DeparturesService.formatDeparture(nextDeparture);
        
        return `
            <div class="result-departure ${dep.isUrgent ? 'urgent' : ''}">
                <div class="result-departure-header">
                    ${Icons.get('calendar', { size: 16 })}
                    <span>Prochain depart: <strong>${dep.departureDateStr}</strong></span>
                    <span class="departure-badge ${dep.isUrgent ? 'urgent' : ''}">${dep.daysUntilLabel}</span>
                </div>
                <div class="result-departure-details">
                    Arrivee estimee: ${dep.arrivalDateStr} (~${dep.duration} jours)
                </div>
            </div>
        `;
    },
    
    renderTarifsTable(transport) {
        const container = document.getElementById('tarifs-table');
        const originCountry = this.tarifOriginFilter?.getValue() || 'China';
        
        // Obtenir les destinations disponibles depuis cette origine
        const destinations = ShippingService.getAvailableDestinations(originCountry);
        
        if (destinations.length === 0) {
            container.innerHTML = `<p class="tarifs-empty">Aucune destination disponible depuis ${ShippingService.getOriginCountryLabel(originCountry)}</p>`;
            return;
        }
        
        // Collecter tous les types uniques pour ce transport depuis toutes les routes
        const allTypes = new Map();
        destinations.forEach(dest => {
            const rates = ShippingService.getRouteRates(originCountry, dest.id)?.[transport];
            if (rates) {
                Object.entries(rates).forEach(([key, value]) => {
                    if (key !== 'currency' && !allTypes.has(key)) {
                        // Nouveau format ou ancien format
                        const label = typeof value === 'object' ? value.label : ShippingService.getStaticTypeConfig(key, transport)?.label || key;
                        allTypes.set(key, label);
                    }
                });
            }
        });
        
        const typeKeys = Array.from(allTypes.keys());
        const typeLabels = Array.from(allTypes.values());
        
        if (typeKeys.length === 0) {
            container.innerHTML = `<p class="tarifs-empty">Aucun tarif disponible pour ce transport</p>`;
            return;
        }
        
        container.innerHTML = `
            <table class="tarifs-table">
                <thead>
                    <tr>
                        <th>Destination</th>
                        ${typeLabels.map(label => `<th>${label}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${destinations.map(dest => {
                        const rates = ShippingService.getRouteRates(originCountry, dest.id)?.[transport];
                        if (!rates) return '';
                        return `
                            <tr>
                                <td><strong>${dest.name}</strong></td>
                                ${typeKeys.map(key => {
                                    const rateData = rates[key];
                                    if (!rateData) return '<td>-</td>';
                                    
                                    // Nouveau format ou ancien format
                                    const rate = typeof rateData === 'object' ? rateData.rate : rateData;
                                    const unit = typeof rateData === 'object' ? rateData.unit : ShippingService.getStaticTypeConfig(key, transport)?.unit || 'kg';
                                    
                                    let unitLabel = '';
                                    if (unit === 'cbm') unitLabel = '/m³';
                                    else if (unit === 'piece') unitLabel = '/pc';
                                    else if (unit === 'kg') unitLabel = '/kg';
                                    
                                    return `<td>${rate}${unitLabel} ${rates.currency}</td>`;
                                }).join('')}
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
    },
    
    attachEvents() {
        // Input changes
        ['calc-quantity', 'calc-weight', 'calc-cbm'].forEach(id => {
            document.getElementById(id)?.addEventListener('input', () => this.calculate());
        });
        
        // Tabs
        document.querySelectorAll('.tarif-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.tarif-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.renderTarifsTable(tab.dataset.transport);
            });
        });
        
        // Create package button
        document.getElementById('btn-create-package')?.addEventListener('click', () => {
            const originCountry = this.originCountrySelect?.getValue();
            const transport = this.transportSelect?.getValue();
            const packageType = this.packageTypeSelect?.getValue();
            const country = this.countrySelect?.getValue();
            
            // Stocker les params pour pre-remplir le formulaire
            sessionStorage.setItem('calc_prefill', JSON.stringify({
                originCountry, transport, packageType, country
            }));
            
            Router.navigate('/new-package');
        });
    }
};
