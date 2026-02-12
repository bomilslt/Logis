/**
 * Vue Tarifs - Gestion des origines, destinations et tarifs par route
 */

Views.tarifs = {
    activeTab: 'origins',
    origins: {},
    destinations: {},
    routes: {},
    
    async render() {
        const main = document.getElementById('main-content');
        
        // Afficher un loader pendant le chargement
        main.innerHTML = `<div class="tarifs-page">${Loader.page('Chargement des tarifs...')}</div>`;
        
        await this.loadData();
        
        main.innerHTML = `
            <div class="tarifs-page">
                <div class="page-header">
                    <h1 class="page-title">Configuration des tarifs</h1>
                </div>
                
                <div class="tarifs-nav">
                    <button class="tarifs-nav-btn active" data-tab="origins">
                        ${Icons.get('send', {size: 18})}
                        <span>Origines</span>
                    </button>
                    <button class="tarifs-nav-btn" data-tab="destinations">
                        ${Icons.get('map-pin', {size: 18})}
                        <span>Destinations</span>
                    </button>
                    <button class="tarifs-nav-btn" data-tab="routes">
                        ${Icons.get('dollar-sign', {size: 18})}
                        <span>Tarifs par route</span>
                    </button>
                </div>
                
                <div id="tarifs-content"></div>
            </div>
        `;
        
        this.attachNavEvents();
        this.renderTab('origins');
    },
    
    async loadData() {
        try {
            // Charger depuis l'API - pas de fallback sur des données mock
            const data = await API.settings.getRates();
            this.origins = data.origins || {};
            this.destinations = data.destinations || {};
            this.routes = data.shipping_rates || {};
        } catch (error) {
            console.error('Load rates error:', error);
            // En cas d'erreur, initialiser avec des objets vides
            // L'admin configurera ses propres origines/destinations/tarifs
            this.origins = {};
            this.destinations = {};
            this.routes = {};
            Toast.error('Erreur de chargement des tarifs');
        }
    },
    
    attachNavEvents() {
        document.querySelectorAll('.tarifs-nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tarifs-nav-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.renderTab(btn.dataset.tab);
            });
        });
    },
    
    renderTab(tab) {
        const content = document.getElementById('tarifs-content');
        switch(tab) {
            case 'origins': content.innerHTML = this.renderOriginsTab(); this.attachOriginsEvents(); break;
            case 'destinations': content.innerHTML = this.renderDestinationsTab(); this.attachDestinationsEvents(); break;
            case 'routes': content.innerHTML = this.renderRoutesTab(); this.attachRoutesEvents(); break;
        }
    },

    // ==================== ORIGINES ====================
    renderOriginsTab() {
        const list = Object.entries(this.origins).map(([key, data]) => `
            <div class="config-card">
                <div class="config-card-header">
                    <div class="config-card-title">
                        <span class="config-card-flag">${this.getFlag(key)}</span>
                        <span>${data.label}</span>
                    </div>
                    <div class="config-card-actions">
                        <button class="btn btn-ghost btn-sm btn-edit-origin" data-key="${key}">${Icons.get('edit', {size: 14})}</button>
                        <button class="btn btn-ghost btn-sm text-error btn-delete-origin" data-key="${key}">${Icons.get('trash', {size: 14})}</button>
                    </div>
                </div>
                <div class="config-card-body">
                    <div class="cities-list">${data.cities.map(c => `<span class="city-tag">${c.name}</span>`).join('')}</div>
                </div>
            </div>
        `).join('');
        
        const emptyState = `
            <div class="empty-state">
                <div class="empty-state-icon">${Icons.get('send', {size: 48})}</div>
                <h3>Aucune origine configuree</h3>
                <p>Ajoutez les pays depuis lesquels vous expediez vos colis</p>
                <button class="btn btn-primary" id="btn-add-origin-empty">${Icons.get('plus', {size: 16})} Ajouter une origine</button>
            </div>
        `;
        
        return `
            <div class="config-section">
                <div class="config-section-header">
                    <div>
                        <h2 class="config-section-title">Pays de depart</h2>
                        <p class="config-section-desc">Configurez les pays et villes depuis lesquels vous expediez</p>
                    </div>
                    ${list ? `<button class="btn btn-primary" id="btn-add-origin">${Icons.get('plus', {size: 16})} Ajouter</button>` : ''}
                </div>
                <div class="config-cards-grid">${list || emptyState}</div>
            </div>
        `;
    },
    
    attachOriginsEvents() {
        document.getElementById('btn-add-origin')?.addEventListener('click', () => this.showOriginModal());
        document.getElementById('btn-add-origin-empty')?.addEventListener('click', () => this.showOriginModal());
        document.querySelectorAll('.btn-edit-origin').forEach(btn => btn.addEventListener('click', () => this.showOriginModal(btn.dataset.key)));
        document.querySelectorAll('.btn-delete-origin').forEach(btn => btn.addEventListener('click', () => this.deleteOrigin(btn.dataset.key)));
    },
    
    async showOriginModal(editKey = null) {
        const isEdit = !!editKey;
        const origin = isEdit ? this.origins[editKey] : { label: '', cities: [{ id: '', name: '' }] };
        
        const content = `
            <div class="form-group">
                <label class="form-label">Code pays</label>
                <input type="text" id="origin-key" class="form-input" value="${editKey || ''}" ${isEdit ? 'disabled' : ''} placeholder="India">
            </div>
            <div class="form-group">
                <label class="form-label">Nom affiche</label>
                <input type="text" id="origin-label" class="form-input" value="${origin.label}" placeholder="Inde">
            </div>
            <div class="form-group">
                <label class="form-label">Villes</label>
                <div id="cities-container">${origin.cities.map(c => this.renderCityInput(c)).join('')}</div>
                <button type="button" class="btn btn-ghost btn-sm mt-sm" id="btn-add-city">${Icons.get('plus', {size: 14})} Ajouter ville</button>
            </div>
        `;
        
        const result = await Modal.form({ title: isEdit ? 'Modifier origine' : 'Nouvelle origine', content, confirmText: 'Enregistrer', size: 'md',
            onOpen: () => {
                document.getElementById('btn-add-city')?.addEventListener('click', () => {
                    document.getElementById('cities-container').insertAdjacentHTML('beforeend', this.renderCityInput({id:'',name:''}));
                });
                document.getElementById('cities-container')?.addEventListener('click', e => {
                    if (e.target.closest('.btn-remove-city')) e.target.closest('.city-input-row').remove();
                });
            }
        });
        
        if (result) {
            const key = isEdit ? editKey : document.getElementById('origin-key').value.trim();
            const label = document.getElementById('origin-label').value.trim();
            const cities = [];
            document.querySelectorAll('.city-input-row').forEach(row => {
                const id = row.querySelector('.city-id').value.trim();
                const name = row.querySelector('.city-name').value.trim();
                if (id && name) cities.push({ id, name });
            });
            
            if (!key || !label || cities.length === 0) { Toast.error('Remplissez tous les champs'); return; }
            
            Modal.close();
            this.origins[key] = { label, cities };
            this.saveData();
            this.renderTab('origins');
            Toast.success('Origine enregistree');
        }
    },
    
    renderCityInput(city) {
        return `<div class="city-input-row">
            <input type="text" class="form-input city-id" value="${city.id}" placeholder="Code">
            <input type="text" class="form-input city-name" value="${city.name}" placeholder="Nom">
            <button type="button" class="btn btn-ghost btn-sm btn-remove-city">${Icons.get('x', {size: 14})}</button>
        </div>`;
    },
    
    async deleteOrigin(key) {
        if (await Modal.confirm({ title: 'Supprimer ?', message: `Supprimer "${this.origins[key]?.label}" et ses tarifs ?`, danger: true })) {
            delete this.origins[key];
            Object.keys(this.routes).filter(r => r.startsWith(`${key}_`)).forEach(r => delete this.routes[r]);
            this.saveData();
            this.renderTab('origins');
            Toast.success('Supprime');
        }
    },

    // ==================== DESTINATIONS ====================
    renderDestinationsTab() {
        const list = Object.entries(this.destinations).map(([key, data]) => `
            <div class="config-card">
                <div class="config-card-header">
                    <div class="config-card-title">
                        <span class="config-card-flag">${this.getFlag(key)}</span>
                        <span>${data.label}</span>
                    </div>
                    <div class="config-card-actions">
                        <button class="btn btn-ghost btn-sm btn-edit-dest" data-key="${key}">${Icons.get('edit', {size: 14})}</button>
                        <button class="btn btn-ghost btn-sm text-error btn-delete-dest" data-key="${key}">${Icons.get('trash', {size: 14})}</button>
                    </div>
                </div>
                <div class="config-card-body">
                    <div class="warehouses-list">${data.warehouses.map(w => `<span class="warehouse-tag">${w.name}</span>`).join('')}</div>
                </div>
            </div>
        `).join('');
        
        const emptyState = `
            <div class="empty-state">
                <div class="empty-state-icon">${Icons.get('map-pin', {size: 48})}</div>
                <h3>Aucune destination configuree</h3>
                <p>Ajoutez les pays vers lesquels vous livrez vos colis</p>
                <button class="btn btn-primary" id="btn-add-dest-empty">${Icons.get('plus', {size: 16})} Ajouter une destination</button>
            </div>
        `;
        
        return `
            <div class="config-section">
                <div class="config-section-header">
                    <div>
                        <h2 class="config-section-title">Pays de destination</h2>
                        <p class="config-section-desc">Configurez les pays et points de retrait</p>
                    </div>
                    ${list ? `<button class="btn btn-primary" id="btn-add-dest">${Icons.get('plus', {size: 16})} Ajouter</button>` : ''}
                </div>
                <div class="config-cards-grid">${list || emptyState}</div>
            </div>
        `;
    },
    
    attachDestinationsEvents() {
        document.getElementById('btn-add-dest')?.addEventListener('click', () => this.showDestModal());
        document.getElementById('btn-add-dest-empty')?.addEventListener('click', () => this.showDestModal());
        document.querySelectorAll('.btn-edit-dest').forEach(btn => btn.addEventListener('click', () => this.showDestModal(btn.dataset.key)));
        document.querySelectorAll('.btn-delete-dest').forEach(btn => btn.addEventListener('click', () => this.deleteDest(btn.dataset.key)));
    },
    
    async showDestModal(editKey = null) {
        const isEdit = !!editKey;
        const dest = isEdit ? this.destinations[editKey] : { label: '', warehouses: [{ id: '', name: '' }] };
        
        const content = `
            <div class="form-group">
                <label class="form-label">Code pays</label>
                <input type="text" id="dest-key" class="form-input" value="${editKey || ''}" ${isEdit ? 'disabled' : ''} placeholder="Kenya">
            </div>
            <div class="form-group">
                <label class="form-label">Nom affiche</label>
                <input type="text" id="dest-label" class="form-input" value="${dest.label}" placeholder="Kenya">
            </div>
            <div class="form-group">
                <label class="form-label">Points de retrait</label>
                <div id="warehouses-container">${dest.warehouses.map(w => this.renderWarehouseInput(w)).join('')}</div>
                <button type="button" class="btn btn-ghost btn-sm mt-sm" id="btn-add-wh">${Icons.get('plus', {size: 14})} Ajouter</button>
            </div>
        `;
        
        const result = await Modal.form({ title: isEdit ? 'Modifier destination' : 'Nouvelle destination', content, confirmText: 'Enregistrer', size: 'md',
            onOpen: () => {
                document.getElementById('btn-add-wh')?.addEventListener('click', () => {
                    document.getElementById('warehouses-container').insertAdjacentHTML('beforeend', this.renderWarehouseInput({id:'',name:''}));
                });
                document.getElementById('warehouses-container')?.addEventListener('click', e => {
                    if (e.target.closest('.btn-remove-wh')) e.target.closest('.warehouse-input-row').remove();
                });
            }
        });
        
        if (result) {
            const key = isEdit ? editKey : document.getElementById('dest-key').value.trim();
            const label = document.getElementById('dest-label').value.trim();
            const warehouses = [];
            document.querySelectorAll('.warehouse-input-row').forEach(row => {
                const id = row.querySelector('.wh-id').value.trim();
                const name = row.querySelector('.wh-name').value.trim();
                if (id && name) warehouses.push({ id, name });
            });
            
            if (!key || !label || warehouses.length === 0) { Toast.error('Remplissez tous les champs'); return; }
            
            Modal.close();
            this.destinations[key] = { label, warehouses };
            this.saveData();
            this.renderTab('destinations');
            Toast.success('Destination enregistree');
        }
    },
    
    renderWarehouseInput(wh) {
        return `<div class="warehouse-input-row">
            <input type="text" class="form-input wh-id" value="${wh.id}" placeholder="Code">
            <input type="text" class="form-input wh-name" value="${wh.name}" placeholder="Nom">
            <button type="button" class="btn btn-ghost btn-sm btn-remove-wh">${Icons.get('x', {size: 14})}</button>
        </div>`;
    },
    
    async deleteDest(key) {
        if (await Modal.confirm({ title: 'Supprimer ?', message: `Supprimer "${this.destinations[key]?.label}" et ses tarifs ?`, danger: true })) {
            delete this.destinations[key];
            Object.keys(this.routes).filter(r => r.endsWith(`_${key}`)).forEach(r => delete this.routes[r]);
            this.saveData();
            this.renderTab('destinations');
            Toast.success('Supprime');
        }
    },

    // ==================== ROUTES / TARIFS ====================
    renderRoutesTab() {
        const hasOrigins = Object.keys(this.origins).length > 0;
        const hasDestinations = Object.keys(this.destinations).length > 0;
        
        // Si pas d'origines ou destinations, afficher un message
        if (!hasOrigins || !hasDestinations) {
            const missingItems = [];
            if (!hasOrigins) missingItems.push('origines');
            if (!hasDestinations) missingItems.push('destinations');
            
            return `
                <div class="config-section">
                    <div class="config-section-header">
                        <div>
                            <h2 class="config-section-title">Tarifs par route</h2>
                            <p class="config-section-desc">Definissez les tarifs pour chaque combinaison origine → destination</p>
                        </div>
                    </div>
                    <div class="empty-state">
                        <div class="empty-state-icon">${Icons.get('alert-circle', {size: 48})}</div>
                        <h3>Configuration incomplete</h3>
                        <p>Vous devez d'abord configurer vos ${missingItems.join(' et ')} avant de definir les tarifs</p>
                        <button class="btn btn-primary" onclick="Views.tarifs.renderTab('${!hasOrigins ? 'origins' : 'destinations'}'); document.querySelector('[data-tab=${!hasOrigins ? 'origins' : 'destinations'}]')?.click();">
                            ${Icons.get('settings', {size: 16})} Configurer les ${!hasOrigins ? 'origines' : 'destinations'}
                        </button>
                    </div>
                </div>
            `;
        }
        
        const originOpts = Object.entries(this.origins).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
        const destOpts = Object.entries(this.destinations).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
        
        const routesList = Object.entries(this.routes).map(([routeKey, rates]) => {
            const [orig, dest] = routeKey.split('_');
            return `
                <div class="route-card" data-route="${routeKey}">
                    <div class="route-card-header">
                        <div class="route-path">
                            <span>${this.getFlag(orig)} ${this.origins[orig]?.label || orig}</span>
                            <span class="route-arrow">${Icons.get('arrow-right', {size: 16})}</span>
                            <span>${this.getFlag(dest)} ${this.destinations[dest]?.label || dest}</span>
                        </div>
                        <div class="route-actions">
                            <button class="btn btn-ghost btn-sm btn-edit-route" data-route="${routeKey}">${Icons.get('edit', {size: 14})}</button>
                            <button class="btn btn-ghost btn-sm text-error btn-delete-route" data-route="${routeKey}">${Icons.get('trash', {size: 14})}</button>
                        </div>
                    </div>
                    <div class="route-card-body">
                        <div class="route-rates-preview">
                            ${rates.sea ? '<span class="rate-tag">Maritime</span>' : ''}
                            ${rates.air_normal ? '<span class="rate-tag">Avion Normal</span>' : ''}
                            ${rates.air_express ? '<span class="rate-tag">Avion Express</span>' : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        const emptyState = `
            <div class="empty-state">
                <div class="empty-state-icon">${Icons.get('dollar-sign', {size: 48})}</div>
                <h3>Aucun tarif configure</h3>
                <p>Definissez les tarifs pour vos routes d'expedition</p>
                <button class="btn btn-primary" id="btn-add-route-empty">${Icons.get('plus', {size: 16})} Creer une route</button>
            </div>
        `;
        
        return `
            <div class="config-section">
                <div class="config-section-header">
                    <div>
                        <h2 class="config-section-title">Tarifs par route</h2>
                        <p class="config-section-desc">Definissez les tarifs pour chaque combinaison origine → destination</p>
                    </div>
                    ${routesList ? `<button class="btn btn-primary" id="btn-add-route">${Icons.get('plus', {size: 16})} Nouvelle route</button>` : ''}
                </div>
                ${routesList ? `
                    <div class="routes-filter mb-md">
                        <div class="form-group">
                            <label class="form-label">Origine</label>
                            <select id="filter-origin" class="form-input"><option value="">Toutes</option>${originOpts}</select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Destination</label>
                            <select id="filter-dest" class="form-input"><option value="">Toutes</option>${destOpts}</select>
                        </div>
                    </div>
                ` : ''}
                <div class="routes-grid">${routesList || emptyState}</div>
            </div>
        `;
    },
    
    attachRoutesEvents() {
        document.getElementById('btn-add-route')?.addEventListener('click', () => this.showRouteModal());
        document.getElementById('btn-add-route-empty')?.addEventListener('click', () => this.showRouteModal());
        document.querySelectorAll('.btn-edit-route').forEach(btn => btn.addEventListener('click', () => this.showRouteModal(btn.dataset.route)));
        document.querySelectorAll('.btn-delete-route').forEach(btn => btn.addEventListener('click', () => this.deleteRoute(btn.dataset.route)));
        document.getElementById('filter-origin')?.addEventListener('change', () => this.filterRoutes());
        document.getElementById('filter-dest')?.addEventListener('change', () => this.filterRoutes());
    },
    
    filterRoutes() {
        const origF = document.getElementById('filter-origin')?.value;
        const destF = document.getElementById('filter-dest')?.value;
        document.querySelectorAll('.route-card').forEach(card => {
            const [o, d] = card.dataset.route.split('_');
            card.style.display = (!origF || o === origF) && (!destF || d === destF) ? '' : 'none';
        });
    },
    
    async showRouteModal(editRouteKey = null) {
        const isEdit = !!editRouteKey;
        let origin = '', dest = '', rates = {};
        
        if (isEdit) {
            [origin, dest] = editRouteKey.split('_');
            rates = JSON.parse(JSON.stringify(this.routes[editRouteKey] || {}));
        }
        
        const originOpts = Object.entries(this.origins).map(([k, v]) => `<option value="${k}" ${origin === k ? 'selected' : ''}>${v.label}</option>`).join('');
        const destOpts = Object.entries(this.destinations).map(([k, v]) => `<option value="${k}" ${dest === k ? 'selected' : ''}>${v.label}</option>`).join('');
        
        const content = `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Origine</label>
                    <select id="route-origin" class="form-input" ${isEdit ? 'disabled' : ''}><option value="">Selectionnez</option>${originOpts}</select>
                </div>
                <div class="form-group">
                    <label class="form-label">Destination</label>
                    <select id="route-dest" class="form-input" ${isEdit ? 'disabled' : ''}><option value="">Selectionnez</option>${destOpts}</select>
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">Devise</label>
                <select id="route-currency" class="form-input" style="max-width:120px;">
                    ${CONFIG.CURRENCIES.map(c => `<option value="${c}" ${(rates.sea?.currency || rates.air_normal?.currency || 'USD') === c ? 'selected' : ''}>${c}</option>`).join('')}
                </select>
            </div>
            <div class="route-rates-form">
                ${this.renderTransportSection('sea', 'Maritime (Bateau)', rates.sea)}
                ${this.renderTransportSection('air_normal', 'Avion Normal', rates.air_normal)}
                ${this.renderTransportSection('air_express', 'Avion Express', rates.air_express)}
            </div>
        `;
        
        const result = await Modal.form({ title: isEdit ? 'Modifier tarifs' : 'Nouvelle route', content, confirmText: 'Enregistrer', size: 'lg',
            onOpen: () => {
                ['sea', 'air_normal', 'air_express'].forEach(t => {
                    const cb = document.getElementById(`enable-${t}`);
                    const sec = document.getElementById(`${t}-rates`);
                    cb?.addEventListener('change', () => sec.style.display = cb.checked ? '' : 'none');
                });
                document.querySelectorAll('.btn-add-rate-item').forEach(btn => {
                    btn.addEventListener('click', () => {
                        document.getElementById(`${btn.dataset.transport}-items`).insertAdjacentHTML('beforeend', this.renderRateItemRow('', '', ''));
                    });
                });
                document.querySelector('.route-rates-form')?.addEventListener('click', e => {
                    if (e.target.closest('.btn-remove-rate-item')) e.target.closest('.rate-item-row').remove();
                });
            }
        });
        
        if (result) {
            const routeOrigin = isEdit ? origin : document.getElementById('route-origin').value;
            const routeDest = isEdit ? dest : document.getElementById('route-dest').value;
            const currency = document.getElementById('route-currency').value;
            
            if (!routeOrigin || !routeDest) { Toast.error('Selectionnez origine et destination'); return; }
            
            const routeKey = `${routeOrigin}_${routeDest}`;
            if (!isEdit && this.routes[routeKey]) { Toast.error('Route existe deja'); return; }
            
            const newRates = {};
            ['sea', 'air_normal', 'air_express'].forEach(transport => {
                if (document.getElementById(`enable-${transport}`)?.checked) {
                    const items = { currency };
                    document.querySelectorAll(`#${transport}-items .rate-item-row`).forEach(row => {
                        const key = row.querySelector('.rate-item-key').value.trim();
                        const label = row.querySelector('.rate-item-label').value.trim();
                        const unit = row.querySelector('.rate-item-unit').value;
                        const rate = parseFloat(row.querySelector('.rate-item-rate').value) || 0;
                        if (key && rate > 0) {
                            items[key] = { label: label || key, rate, unit };
                        }
                    });
                    if (Object.keys(items).length > 1) newRates[transport] = items;
                }
            });
            
            if (Object.keys(newRates).length === 0) { Toast.error('Ajoutez au moins un tarif'); return; }
            
            Modal.close();
            this.routes[routeKey] = newRates;
            this.saveData();
            this.renderTab('routes');
            Toast.success('Tarifs enregistres');
        }
    },
    
    renderTransportSection(transport, label, rates) {
        const hasRates = rates && Object.keys(rates).filter(k => k !== 'currency').length > 0;
        let itemsHtml = '';
        
        if (rates) {
            Object.entries(rates).forEach(([key, value]) => {
                if (key !== 'currency') {
                    // Support ancien format (number) et nouveau format (object avec rate, label, unit)
                    if (typeof value === 'object') {
                        itemsHtml += this.renderRateItemRow(key, value.label || key, value.rate || 0, value.unit || 'kg');
                    } else if (typeof value === 'number') {
                        itemsHtml += this.renderRateItemRow(key, this.getRateLabel(key), value, this.getDefaultUnit(key, transport));
                    }
                }
            });
        }
        
        if (!itemsHtml) {
            // Lignes par defaut avec unites
            if (transport === 'sea') {
                itemsHtml = this.renderRateItemRow('container', 'Conteneur', '', 'fixed') + 
                           this.renderRateItemRow('baco', 'Baco', '', 'fixed') + 
                           this.renderRateItemRow('carton', 'Carton', '', 'cbm');
            } else {
                itemsHtml = this.renderRateItemRow('normal', 'Normal', '', 'kg') + 
                           this.renderRateItemRow('risky', 'Risque', '', 'kg') + 
                           this.renderRateItemRow('phone_boxed', 'Tel. +carton', '', 'piece');
            }
        }
        
        return `
            <div class="rates-section">
                <div class="rates-section-header">
                    <label class="toggle-label"><input type="checkbox" id="enable-${transport}" ${hasRates ? 'checked' : ''}><span>${label}</span></label>
                </div>
                <div class="rates-section-body" id="${transport}-rates" style="${hasRates ? '' : 'display:none'}">
                    <div class="rate-items-list" id="${transport}-items">${itemsHtml}</div>
                    <button type="button" class="btn btn-ghost btn-sm btn-add-rate-item" data-transport="${transport}">${Icons.get('plus', {size: 14})} Ajouter conditionnement</button>
                </div>
            </div>
        `;
    },
    
    renderRateItemRow(key, label, rate, unit = 'kg') {
        const unitOptions = [
            { value: 'kg', label: '/kg' },
            { value: 'piece', label: '/piece' },
            { value: 'cbm', label: '/m³' },
            { value: 'fixed', label: 'Fixe' }
        ];
        return `
            <div class="rate-item-row">
                <input type="text" class="form-input rate-item-key" value="${key}" placeholder="Code">
                <input type="text" class="form-input rate-item-label" value="${label}" placeholder="Nom">
                <select class="form-input rate-item-unit">
                    ${unitOptions.map(o => `<option value="${o.value}" ${unit === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
                </select>
                <input type="number" class="form-input rate-item-rate" value="${rate}" placeholder="Tarif" step="0.01">
                <button type="button" class="btn btn-ghost btn-sm btn-remove-rate-item">${Icons.get('x', {size: 14})}</button>
            </div>
        `;
    },
    
    getRateLabel(key) {
        const labels = { container: 'Conteneur', baco: 'Baco', carton: 'Carton', vehicle: 'Vehicule', other_sea: 'Autre',
            normal: 'Normal', risky: 'Risque', phone_boxed: 'Tel. +carton', phone_unboxed: 'Tel. -carton', laptop: 'Laptop', tablet: 'Tablette' };
        return labels[key] || key;
    },
    
    getDefaultUnit(key, transport) {
        const units = { container: 'fixed', baco: 'fixed', vehicle: 'fixed', carton: 'cbm', other_sea: 'cbm',
            phone_boxed: 'piece', phone_unboxed: 'piece', laptop: 'piece', tablet: 'piece', normal: 'kg', risky: 'kg' };
        return units[key] || (transport === 'sea' ? 'cbm' : 'kg');
    },
    
    async deleteRoute(routeKey) {
        const [o, d] = routeKey.split('_');
        if (await Modal.confirm({ title: 'Supprimer ?', message: `Supprimer tarifs ${this.origins[o]?.label} → ${this.destinations[d]?.label} ?`, danger: true })) {
            delete this.routes[routeKey];
            this.saveData();
            this.renderTab('routes');
            Toast.success('Supprime');
        }
    },

    // ==================== HELPERS ====================
    getFlag(key) {
        const flags = { 'China': '🇨🇳', 'Dubai': '🇦🇪', 'Turkey': '🇹🇷', 'India': '🇮🇳', 'Vietnam': '🇻🇳',
            'Cameroon': '🇨🇲', 'Nigeria': '🇳🇬', 'Senegal': '🇸🇳', 'Ivory Coast': '🇨🇮', 'Ghana': '🇬🇭', 'Gabon': '🇬🇦', 'Congo': '🇨🇬', 'DRC': '🇨🇩', 'Kenya': '🇰🇪' };
        return flags[key] || '🌍';
    },
    
    async saveData() {
        // Synchroniser avec l'API
        try {
            await API.settings.updateRates({
                origins: this.origins,
                destinations: this.destinations,
                shipping_rates: this.routes
            });
            
            // Mettre à jour le cache local après succès API
            localStorage.setItem('ec_origins', JSON.stringify(this.origins));
            localStorage.setItem('ec_destinations', JSON.stringify(this.destinations));
            localStorage.setItem('ec_routes', JSON.stringify(this.routes));
            
            // Recharger le RatesService pour que les autres vues aient les données à jour
            if (typeof RatesService !== 'undefined') {
                RatesService.origins = this.origins;
                RatesService.destinations = this.destinations;
                RatesService.routes = this.routes;
            }
        } catch (error) {
            console.error('Save rates error:', error);
            Toast.error('Erreur lors de la sauvegarde');
        }
    }
};
