/**
 * Vue Departures - Programmation des departs
 * L'admin peut configurer les departs avec route, transport, date et duree estimee
 * Cycle: scheduled → departed → arrived
 */

Views.departures = {
    currentTab: 'upcoming',
    departures: [],
    
    render() {
        const main = document.getElementById('main-content');
        
        main.innerHTML = `
            <div class="departures-page">
                <div class="page-header">
                    <h1 class="page-title">Departs programmes</h1>
                    <button class="btn btn-primary" id="btn-new-departure" title="Programmer un nouveau départ">
                        ${Icons.get('plus', {size:16})} Programmer un depart
                    </button>
                </div>
                
                <div class="departures-tabs">
                    <button class="departure-tab ${this.currentTab === 'upcoming' ? 'active' : ''}" data-tab="upcoming">A venir</button>
                    <button class="departure-tab ${this.currentTab === 'in_transit' ? 'active' : ''}" data-tab="in_transit">En transit</button>
                    <button class="departure-tab ${this.currentTab === 'arrived' ? 'active' : ''}" data-tab="arrived">Arrives</button>
                    <button class="departure-tab ${this.currentTab === 'all' ? 'active' : ''}" data-tab="all">Tous</button>
                </div>
                
                <div id="departures-list">${Loader.page('Chargement...')}</div>
            </div>
        `;
        
        this.loadDataAndRender();
        this.attachEvents();
    },
    
    async loadDataAndRender() {
        await this.loadData();
        this.renderDepartures();
    },
    
    async loadData() {
        try {
            // Charger depuis l'API
            const data = await API.departures.getAll();
            this.departures = data.departures || [];
        } catch (error) {
            console.error('Load departures error:', error);
            // Fallback sur localStorage
            const stored = localStorage.getItem('ec_departures');
            if (stored) {
                try { this.departures = JSON.parse(stored); return; } catch(e) {}
            }
            this.departures = [];
        }
    },
    
    saveData() {
        // Garder une copie locale pour le fallback
        localStorage.setItem('ec_departures', JSON.stringify(this.departures));
    },
    
    /**
     * Compter les colis assignes a un depart
     */
    countPackagesForDeparture(departureId) {
        // Recuperer les colis depuis le store
        const packages = JSON.parse(localStorage.getItem('ec_packages') || '[]');
        return packages.filter(p => p.departure_id === departureId).length;
    },
    
    /**
     * Obtenir les colis assignes a un depart
     */
    getPackagesForDeparture(departureId) {
        const packages = JSON.parse(localStorage.getItem('ec_packages') || '[]');
        return packages.filter(p => p.departure_id === departureId);
    },
    
    renderDepartures() {
        const container = document.getElementById('departures-list');
        if (!container) return; // Container pas disponible (autre vue active)
        
        const today = new Date().toISOString().split('T')[0];
        
        let filtered = [...this.departures];
        
        if (this.currentTab === 'upcoming') {
            filtered = filtered.filter(d => d.status === 'scheduled');
        } else if (this.currentTab === 'in_transit') {
            filtered = filtered.filter(d => d.status === 'departed');
        } else if (this.currentTab === 'arrived') {
            filtered = filtered.filter(d => d.status === 'arrived');
        }
        
        // Tri: a venir par date croissante, autres par date decroissante
        filtered.sort((a, b) => {
            if (this.currentTab === 'upcoming') {
                return new Date(a.departure_date) - new Date(b.departure_date);
            }
            return new Date(b.departure_date) - new Date(a.departure_date);
        });
        
        if (filtered.length === 0) {
            const emptyMessages = {
                upcoming: 'Aucun départ programmé',
                in_transit: 'Aucun départ en transit',
                arrived: 'Aucun départ arrivé',
                all: 'Aucun départ enregistré'
            };
            container.innerHTML = `
                <div class="departures-empty">
                    ${Icons.get('truck')}
                    <p>${emptyMessages[this.currentTab]}</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = `<div class="departures-list">${filtered.map(d => this.renderDepartureCard(d, today)).join('')}</div>`;
    },
    
    renderDepartureCard(dep, today) {
        const isToday = dep.departure_date === today;
        const statusClass = dep.status === 'cancelled' ? 'cancelled' : 
                           dep.status === 'arrived' ? 'arrived' :
                           dep.status === 'departed' ? 'departed' : 
                           isToday ? 'today' : 'upcoming';
        
        const dateObj = new Date(dep.departure_date);
        const day = dateObj.getDate();
        const month = dateObj.toLocaleDateString('fr-FR', { month: 'short' });
        const fullDate = dateObj.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        
        // Calcul date d'arrivee estimee
        const arrivalDate = new Date(dateObj);
        arrivalDate.setDate(arrivalDate.getDate() + dep.estimated_duration);
        const arrivalStr = arrivalDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
        
        // Utiliser RatesService pour les labels (avec fallback sur CONFIG)
        const transportLabel = RatesService.getTransportLabel(dep.transport_mode);
        const originLabel = RatesService.getOriginLabel(dep.origin_country);
        const originCity = RatesService.getCityLabel(dep.origin_country, dep.origin_city);
        const destLabel = RatesService.getDestinationLabel(dep.dest_country);
        
        const statusLabels = { scheduled: 'Programme', departed: 'En transit', arrived: 'Arrive', cancelled: 'Annule' };
        const statusBadgeClass = { scheduled: 'status-pending', departed: 'status-in-transit', arrived: 'status-delivered', cancelled: 'status-customs' };
        
        // Compter les colis
        const packagesCount = this.countPackagesForDeparture(dep.id);
        
        // Jours restants (pour scheduled) ou jours depuis depart (pour departed)
        let timingInfo = '';
        if (dep.status === 'scheduled') {
            const daysUntil = Math.ceil((dateObj - new Date()) / (1000 * 60 * 60 * 24));
            timingInfo = daysUntil === 0 ? "Aujourd'hui" : daysUntil === 1 ? 'Demain' : daysUntil > 0 ? `Dans ${daysUntil} jours` : '';
        } else if (dep.status === 'departed') {
            const departedDate = new Date(dep.departed_at || dep.departure_date);
            const daysSince = Math.floor((new Date() - departedDate) / (1000 * 60 * 60 * 24));
            const daysRemaining = dep.estimated_duration - daysSince;
            if (daysRemaining > 0) {
                timingInfo = `~${daysRemaining} jours restants`;
            } else {
                timingInfo = 'Arrivee imminente';
            }
        }
        
        // Badge transporteur actuel
        const carrierBadge = dep.carrier ? `
            <span class="carrier-badge" title="Tracking: ${dep.carrier_tracking || 'N/A'}${dep.is_final_leg === false ? ' (étape intermédiaire)' : ''}">
                ${Icons.get('truck', {size:12})} ${dep.carrier.toUpperCase()}
                ${dep.carrier_status ? `<span class="carrier-status">${dep.carrier_status}</span>` : ''}
            </span>
        ` : '';
        
        return `
            <div class="card departure-card ${statusClass}">
                <div class="card-body">
                    <div class="departure-header">
                        <div class="departure-main-info">
                            <div class="departure-calendar-icon ${statusClass}">
                                <span class="day">${day}</span>
                                <span class="month">${month}</span>
                            </div>
                            <div class="departure-details">
                                <div class="departure-route">
                                    <span class="route-origin">${originLabel} (${originCity})</span>
                                    <span class="route-arrow">${Icons.get('arrow-right', {size:16})}</span>
                                    <span class="route-dest">${destLabel}</span>
                                </div>
                                <div class="departure-transport">
                                    <span class="transport-badge transport-${dep.transport_mode}">${transportLabel}</span>
                                    ${carrierBadge}
                                    ${timingInfo ? `<span class="timing-badge ${dep.status === 'departed' ? 'in-transit' : (isToday ? 'urgent' : '')}">${timingInfo}</span>` : ''}
                                </div>
                                <div class="departure-timing">
                                    <span class="timing-item">
                                        ${Icons.get('calendar', {size:14})}
                                        Depart: ${fullDate}
                                    </span>
                                    <span class="timing-item">
                                        ${Icons.get('clock', {size:14})}
                                        Duree: ~${dep.estimated_duration} jours
                                    </span>
                                    <span class="timing-item">
                                        ${Icons.get('map-pin', {size:14})}
                                        Arrivee estimee: ${arrivalStr}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div class="departure-badges">
                            <span class="status-badge ${statusBadgeClass[dep.status]}">${statusLabels[dep.status]}</span>
                            ${dep.notified ? `<span class="status-badge status-delivered" title="Clients notifies">${Icons.get('bell', {size:12})} Notifie</span>` : ''}
                        </div>
                    </div>
                    
                    <div class="departure-stats">
                        <div class="departure-stat">
                            <div class="departure-stat-value">${packagesCount}</div>
                            <div class="departure-stat-label">Colis</div>
                        </div>
                    </div>
                    
                    ${dep.notes ? `<p class="departure-notes">${Icons.get('info', {size:14})} ${dep.notes}</p>` : ''}
                    
                    <div class="departure-actions">
                        <button class="btn btn-sm btn-outline" onclick="Views.departures.viewDepartureDetail('${dep.id}', this)" title="Voir détails">
                            ${Icons.get('eye', {size:14})} Détails
                        </button>
                        <button class="btn btn-sm btn-outline" onclick="Views.departures.viewPackages('${dep.id}', this)">
                            ${Icons.get('package', {size:14})} Colis
                        </button>
                        
                        ${dep.status === 'scheduled' || dep.status === 'departed' ? `
                            <button class="btn btn-sm ${dep.carrier ? 'btn-outline' : 'btn-primary'}" onclick="Views.departures.showCarrierModal('${dep.id}')">
                                ${Icons.get('truck', {size:14})} ${dep.carrier ? 'Changer transporteur' : 'Transporteur'}
                            </button>
                        ` : ''}
                        
                        ${dep.status === 'scheduled' ? `
                            <button class="btn btn-sm btn-outline" onclick="Views.departures.editDeparture('${dep.id}')" title="Modifier ce départ">
                                ${Icons.get('edit', {size:14})} Modifier
                            </button>
                            ${!dep.notified ? `
                                <button class="btn btn-sm btn-outline" onclick="Views.departures.notifyClients('${dep.id}', this)" title="Notifier les clients">
                                    ${Icons.get('bell', {size:14})} Notifier
                                </button>
                            ` : ''}
                            ${packagesCount > 0 ? `
                                <button class="btn btn-sm btn-primary" onclick="Views.departures.markDeparted('${dep.id}', this)" title="Marquer comme parti">
                                    ${Icons.get('send', {size:14})} Marquer parti
                                </button>
                            ` : `
                                <button class="btn btn-sm btn-outline" disabled title="Ajoutez des colis avant de marquer comme parti">
                                    ${Icons.get('send', {size:14})} Marquer parti
                                </button>
                            `}
                            <button class="btn btn-sm btn-ghost text-error" onclick="Views.departures.deleteDeparture('${dep.id}', this)" title="Supprimer ce départ">
                                ${Icons.get('trash', {size:14})}
                            </button>
                        ` : ''}
                        
                        ${dep.status === 'departed' ? `
                            <button class="btn btn-sm btn-outline" onclick="Views.departures.editDeparture('${dep.id}')" title="Modifier ce départ">
                                ${Icons.get('edit', {size:14})} Modifier
                            </button>
                            <button class="btn btn-sm btn-primary" onclick="Views.departures.markArrived('${dep.id}', this)" title="Marquer comme arrivé">
                                ${Icons.get('check', {size:14})} Marquer arrivé
                            </button>
                        ` : ''}
                        
                        ${dep.status === 'arrived' ? `
                            <button class="btn btn-sm btn-outline" onclick="Views.departures.viewPackages('${dep.id}')" title="Gérer les colis de ce départ">
                                ${Icons.get('package', {size:14})} Gerer colis
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    },
    
    attachEvents() {
        document.getElementById('btn-new-departure')?.addEventListener('click', () => this.showDepartureModal());
        
        document.querySelectorAll('.departure-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.departure-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.currentTab = tab.dataset.tab;
                this.renderDepartures();
            });
        });
    },
    
    async showDepartureModal(editId = null) {
        const isEdit = !!editId;
        const dep = isEdit ? this.departures.find(d => d.id === editId) : null;
        
        // Charger les données depuis RatesService (API)
        await RatesService.ensureLoaded();
        const origins = RatesService.getOrigins();
        const destinations = RatesService.getDestinations();
        
        const defaultDate = new Date();
        defaultDate.setDate(defaultDate.getDate() + 7);
        const defaultDateStr = defaultDate.toISOString().split('T')[0];
        
        const content = `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Pays d'origine *</label>
                    <div id="dep-origin-container"></div>
                </div>
                <div class="form-group">
                    <label class="form-label">Ville *</label>
                    <div id="dep-city-container"></div>
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">Destination *</label>
                <div id="dep-dest-container"></div>
            </div>
            <div class="form-group">
                <label class="form-label">Type de transport *</label>
                <div id="dep-transport-container"></div>
                <p class="form-hint" id="transport-hint" style="display:none;color:#d97706;">Sélectionnez origine et destination pour voir les transports disponibles</p>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Date de depart *</label>
                    <div id="dep-date-container"></div>
                </div>
                <div class="form-group">
                    <label class="form-label">Duree estimee (jours) *</label>
                    <input type="number" id="dep-duration" class="form-input" min="1" value="${dep?.estimated_duration || 7}" placeholder="Ex: 7">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">Notes</label>
                <textarea id="dep-notes" class="form-input" rows="2" placeholder="Numero de vol, conteneur, etc.">${dep?.notes || ''}</textarea>
            </div>
            
            ${!isEdit ? `
                <div class="auto-assign-section" id="auto-assign-section">
                    <div class="auto-assign-info" id="auto-assign-info">
                        ${Icons.get('package', {size:16})}
                        <span>Selectionnez la route et le transport pour voir les colis en attente</span>
                    </div>
                    <label class="toggle-label" id="auto-assign-toggle" style="display:none;">
                        <input type="checkbox" id="dep-auto-assign" checked>
                        <span id="auto-assign-label">Assigner automatiquement les colis en attente</span>
                    </label>
                </div>
            ` : ''}
        `;
        
        const result = await Modal.form({
            title: isEdit ? 'Modifier le depart' : 'Programmer un depart',
            content,
            confirmText: isEdit ? 'Enregistrer' : 'Programmer',
            size: 'md',
            onOpen: () => {
                // Fonction pour mettre à jour les transports disponibles
                const updateTransportSelect = () => {
                    const origin = this.depOriginSelect?.getValue();
                    const dest = this.depDestSelect?.getValue();
                    const hint = document.getElementById('transport-hint');
                    
                    if (!origin || !dest) {
                        this.depTransportSelect?.setItems([]);
                        this.depTransportSelect?.clear();
                        if (hint) hint.style.display = 'block';
                        return;
                    }
                    
                    // Obtenir les transports disponibles pour cette route
                    const transportItems = RatesService.getTransportItems(origin, dest);
                    
                    if (transportItems.length === 0) {
                        this.depTransportSelect?.setItems([]);
                        this.depTransportSelect?.clear();
                        if (hint) {
                            hint.textContent = 'Aucun transport configuré pour cette route';
                            hint.style.display = 'block';
                        }
                    } else {
                        this.depTransportSelect?.setItems(transportItems);
                        if (hint) hint.style.display = 'none';
                        
                        // Restaurer la valeur si en mode édition
                        if (dep?.transport_mode && transportItems.some(t => t.id === dep.transport_mode)) {
                            this.depTransportSelect?.setValue(dep.transport_mode);
                        }
                    }
                    
                    updatePendingCount();
                };
                
                // Fonction pour mettre à jour le compteur de colis en attente
                const updatePendingCount = () => {
                    if (isEdit) return;
                    
                    const origin = this.depOriginSelect?.getValue();
                    const dest = this.depDestSelect?.getValue();
                    const transport = this.depTransportSelect?.getValue();
                    
                    const infoDiv = document.getElementById('auto-assign-info');
                    const toggleDiv = document.getElementById('auto-assign-toggle');
                    const labelSpan = document.getElementById('auto-assign-label');
                    
                    if (!origin || !dest || !transport) {
                        infoDiv.innerHTML = `${Icons.get('package', {size:16})}<span>Selectionnez la route et le transport</span>`;
                        infoDiv.style.display = 'flex';
                        toggleDiv.style.display = 'none';
                        return;
                    }
                    
                    const pendingCount = this.countPendingPackagesForRoute(origin, dest, transport);
                    
                    if (pendingCount > 0) {
                        infoDiv.innerHTML = `${Icons.get('check-circle', {size:16})}<span class="text-success">${pendingCount} colis en attente pour cette route</span>`;
                        infoDiv.className = 'auto-assign-info has-packages';
                        toggleDiv.style.display = 'flex';
                        labelSpan.textContent = `Assigner automatiquement les ${pendingCount} colis en attente`;
                    } else {
                        infoDiv.innerHTML = `${Icons.get('info', {size:16})}<span>Aucun colis en attente pour cette route</span>`;
                        infoDiv.className = 'auto-assign-info';
                        toggleDiv.style.display = 'none';
                    }
                };
                
                // Init SearchSelects avec données de RatesService
                const originItems = RatesService.getOriginItems();
                const destItems = RatesService.getDestinationItems();
                
                const selectedOrigin = dep?.origin_country || (originItems.length > 0 ? originItems[0].id : null);
                const cityItems = selectedOrigin ? RatesService.getCityItems(selectedOrigin) : [];
                
                this.depCitySelect = new SearchSelect({
                    container: '#dep-city-container',
                    placeholder: 'Ville',
                    items: cityItems,
                    onSelect: () => {}
                });
                if (dep?.origin_city) this.depCitySelect.setValue(dep.origin_city);
                
                this.depOriginSelect = new SearchSelect({
                    container: '#dep-origin-container',
                    placeholder: 'Pays d\'origine',
                    items: originItems,
                    onSelect: (item) => {
                        if (item) {
                            const cities = RatesService.getCityItems(item.id);
                            this.depCitySelect.setItems(cities);
                        }
                        updateTransportSelect();
                    }
                });
                if (dep?.origin_country) this.depOriginSelect.setValue(dep.origin_country);
                else if (originItems.length > 0) this.depOriginSelect.setValue(originItems[0].id);
                
                this.depDestSelect = new SearchSelect({
                    container: '#dep-dest-container',
                    placeholder: 'Destination',
                    items: destItems,
                    onSelect: () => updateTransportSelect()
                });
                if (dep?.dest_country) this.depDestSelect.setValue(dep.dest_country);
                
                // Transport select - initialement vide, rempli quand origine+dest sélectionnés
                this.depTransportSelect = new SearchSelect({
                    container: '#dep-transport-container',
                    placeholder: 'Sélectionnez origine et destination d\'abord',
                    items: [],
                    onSelect: (item) => {
                        if (item) {
                            const durations = { sea: 45, air_normal: 10, air_express: 5 };
                            document.getElementById('dep-duration').value = durations[item.id] || 7;
                        }
                        updatePendingCount();
                    }
                });
                
                // Date picker
                this.depDatePicker = new DatePicker({
                    container: document.getElementById('dep-date-container'),
                    placeholder: 'Date de depart',
                    value: dep?.departure_date || defaultDateStr,
                    onChange: () => {}
                });
                
                // Si édition, mettre à jour les transports après init
                if (dep?.origin_country && dep?.dest_country) {
                    updateTransportSelect();
                }
                
                // Initial update
                updatePendingCount();
            }
        });
        
        if (result) {
            const confirmBtn = document.getElementById('modal-form-confirm');
            const originCountry = this.depOriginSelect?.getValue();
            const originCity = this.depCitySelect?.getValue();
            const destCountry = this.depDestSelect?.getValue();
            const transport = this.depTransportSelect?.getValue();
            const date = this.depDatePicker?.getValue();
            const duration = parseInt(document.getElementById('dep-duration').value) || 7;
            const notes = document.getElementById('dep-notes').value.trim();
            const autoAssign = !isEdit && document.getElementById('dep-auto-assign')?.checked;
            
            if (!originCountry || !destCountry || !transport || !date) {
                Toast.error('Veuillez remplir tous les champs obligatoires');
                return;
            }
            
            try {
                Loader.button(confirmBtn, true, { text: isEdit ? 'Enregistrement...' : 'Programmation...' });
                if (isEdit) {
                    // Appel API pour modifier
                    const updated = await API.departures.update(editId, {
                        origin_country: originCountry,
                        origin_city: originCity,
                        dest_country: destCountry,
                        transport_mode: transport,
                        departure_date: date,
                        estimated_duration: duration,
                        notes
                    });
                    
                    // Mettre à jour localement
                    const idx = this.departures.findIndex(d => d.id === editId);
                    if (idx !== -1) {
                        this.departures[idx] = updated.departure || { ...this.departures[idx], ...updated };
                    }
                    Toast.success('Départ modifié');
                } else {
                    // Appel API pour créer
                    const created = await API.departures.create({
                        origin_country: originCountry,
                        origin_city: originCity,
                        dest_country: destCountry,
                        transport_mode: transport,
                        departure_date: date,
                        estimated_duration: duration,
                        notes,
                        auto_assign: autoAssign
                    });
                    
                    const newDeparture = created.departure;
                    this.departures.push(newDeparture);
                    
                    const assignedCount = created.assigned_packages || 0;
                    if (assignedCount > 0) {
                        Toast.success(`Départ programmé - ${assignedCount} colis assignés automatiquement`);
                    } else {
                        Toast.success('Départ programmé');
                    }
                }
                
                Modal.close();
                this.saveData();
                this.renderDepartures();
                
            } catch (error) {
                console.error('Save departure error:', error);
                Toast.error(`Erreur: ${error.message}`);
            } finally {
                Loader.button(confirmBtn, false);
            }
        }
    },
    
    /**
     * Compter les colis en attente (sans depart assigne) pour une route specifique
     */
    countPendingPackagesForRoute(originCountry, destCountry, transportMode) {
        const packages = this.ensurePackagesLoaded();
        return packages.filter(p => 
            !p.departure_id &&
            p.origin_country === originCountry &&
            p.destination_country === destCountry &&
            p.transport_mode === transportMode
        ).length;
    },
    
    /**
     * Assigner automatiquement les colis en attente a un depart
     */
    autoAssignPendingPackages(departureId, originCountry, destCountry, transportMode) {
        let packages = JSON.parse(localStorage.getItem('ec_packages') || '[]');
        let assignedCount = 0;
        
        packages.forEach(pkg => {
            if (!pkg.departure_id &&
                pkg.origin_country === originCountry &&
                pkg.destination_country === destCountry &&
                pkg.transport_mode === transportMode) {
                pkg.departure_id = departureId;
                assignedCount++;
            }
        });
        
        if (assignedCount > 0) {
            localStorage.setItem('ec_packages', JSON.stringify(packages));
        }
        
        return assignedCount;
    },
    
    editDeparture(id) {
        this.showDepartureModal(id);
    },
    
    async deleteDeparture(id, btn = null) {
        const packagesCount = this.countPackagesForDeparture(id);
        const message = packagesCount > 0 
            ? `Ce depart a ${packagesCount} colis assigne(s). Supprimer quand meme ?`
            : 'Supprimer ce depart programme ?';
            
        if (await Modal.confirm({ title: 'Supprimer ?', message, danger: true })) {
            try {
                Loader.button(btn, true, { text: '' });
                await API.departures.delete(id);
                this.departures = this.departures.filter(d => d.id !== id);
                this.saveData();
                this.renderDepartures();
                Toast.success('Depart supprime');
            } catch (error) {
                console.error('Delete departure error:', error);
                Toast.error(`Erreur: ${error.message}`);
            } finally {
                Loader.button(btn, false);
            }
        }
    },
    
    async markDeparted(id, btn = null) {
        if (await Modal.confirm({ title: 'Confirmer le depart', message: 'Marquer ce depart comme parti ?' })) {
            try {
                Loader.button(btn, true, { text: '' });
                const result = await API.departures.markDeparted(id);
                // Recharger les données pour avoir la date mise à jour
                await this.loadData();
                this.renderDepartures();
                Toast.success('Depart marque comme parti');
            } catch (error) {
                console.error('Mark departed error:', error);
                Toast.error(`Erreur: ${error.message}`);
            } finally {
                Loader.button(btn, false);
            }
        }
    },
    
    async markArrived(id, btn = null) {
        if (await Modal.confirm({ title: 'Confirmer l\'arrivee', message: 'Marquer ce depart comme arrive a destination ?' })) {
            try {
                Loader.button(btn, true, { text: '' });
                const result = await API.departures.markArrived(id);
                // Recharger les données pour avoir la date mise à jour
                await this.loadData();
                this.renderDepartures();
                Toast.success('Depart marque comme arrive');
            } catch (error) {
                console.error('Mark arrived error:', error);
                Toast.error(`Erreur: ${error.message}`);
            } finally {
                Loader.button(btn, false);
            }
        }
    },
    
    async notifyClients(id, btn = null) {
        const dep = this.departures.find(d => d.id === id);
        if (!dep) return;
        
        const packagesCount = this.countPackagesForDeparture(id);
        const message = packagesCount > 0
            ? `Envoyer une notification aux clients des ${packagesCount} colis de ce depart ?`
            : 'Aucun colis assigne a ce depart. Notifier quand meme ?';
        
        if (await Modal.confirm({ title: 'Notifier les clients', message })) {
            try {
                Loader.button(btn, true, { text: '' });
                await API.departures.notify(id, { target: 'with_packages' });
                dep.notified = true;
                dep.notified_at = new Date().toISOString();
                this.saveData();
                this.renderDepartures();
                Toast.success('Clients notifies');
            } catch (error) {
                console.error('Notify clients error:', error);
                Toast.error(`Erreur: ${error.message}`);
            } finally {
                Loader.button(btn, false);
            }
        }
    },
    
    viewPackages(departureId, btn = null) {
        const dep = this.departures.find(d => d.id === departureId);
        if (!dep) return;
        
        // Afficher un loader pendant le chargement
        Modal.open({
            title: 'Chargement...',
            content: Loader.page('Chargement des colis...'),
            closable: false
        });
        
        // Charger les données depuis l'API
        this.loadPackagesForModal(departureId, dep, btn);
    },
    
    async loadPackagesForModal(departureId, dep, btn = null) {
        try {
            Loader.button(btn, true, { text: '' });
            // Charger les colis du départ depuis l'API
            const depData = await API.departures.getById(departureId);
            const packages = depData.departure?.packages || [];
            
            // Charger les colis non assignés depuis l'API
            const unassignedData = await API.packages.getAll({ departure_id: 'none', per_page: 100 });
            const unassignedPackages = unassignedData.packages || [];
            
            // Fermer le loader et ouvrir la vraie modale
            Modal.close();
            this.showPackagesModal(departureId, dep, packages, unassignedPackages);
            
        } catch (error) {
            console.error('Erreur chargement colis:', error);
            Modal.close();
            Toast.error('Erreur lors du chargement des colis');
        } finally {
            Loader.button(btn, false);
        }
    },
    
    showPackagesModal(departureId, dep, packages, unassignedPackages) {
        const originLabel = RatesService.getOriginLabel(dep.origin_country);
        const destLabel = RatesService.getDestinationLabel(dep.dest_country);
        const transportLabel = RatesService.getTransportLabel(dep.transport_mode);
        const dateStr = new Date(dep.departure_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
        
        const totalWeight = packages.reduce((sum, p) => sum + (p.weight || 0), 0);
        
        // Helper pour obtenir le nom du client
        const getClientName = (p) => p.client?.name || p.client_name || p.recipient?.name || 'Client';
        
        // Vérifier si le départ permet les modifications
        const isEditable = dep.status === 'scheduled';
        const statusLabels = { scheduled: 'Programmé', departed: 'En transit', arrived: 'Arrivé' };
        
        Modal.open({
            title: `${isEditable ? 'Gestion' : 'Liste'} colis - Depart ${dateStr}`,
            size: 'lg',
            closable: false,
            content: `
                <div class="departure-packages-modal">
                    <div class="departure-packages-header">
                        <div class="departure-route-info">
                            <span>${originLabel} → ${destLabel}</span>
                            <span class="transport-badge transport-${dep.transport_mode}">${transportLabel}</span>
                            ${!isEditable ? `<span class="status-badge status-${dep.status === 'departed' ? 'in-transit' : dep.status}">${statusLabels[dep.status]}</span>` : ''}
                        </div>
                        <div class="departure-stats-mini">
                            <span class="stat-item">${Icons.get('package', {size:14})} ${packages.length} colis</span>
                            <span class="stat-item">${Icons.get('scale', {size:14})} ${totalWeight.toFixed(1)} kg</span>
                        </div>
                    </div>
                    
                    ${!isEditable ? `
                        <div class="info-box warning mb-md">
                            ${Icons.get('info', {size:16})} Ce départ est ${dep.status === 'departed' ? 'en transit' : 'arrivé'} - les colis ne peuvent plus être modifiés
                        </div>
                    ` : ''}
                    
                    <div class="packages-modal-tabs">
                        <button class="modal-tab active" data-tab="list">${Icons.get('list', {size:14})} Liste (${packages.length})</button>
                        ${isEditable ? `
                            <button class="modal-tab" data-tab="add">${Icons.get('plus', {size:14})} Ajouter</button>
                            <button class="modal-tab" data-tab="remove">${Icons.get('minus', {size:14})} Retirer</button>
                        ` : ''}
                    </div>
                    
                    <div class="modal-tab-content active" id="tab-list">
                        <div class="departure-packages-list">
                            ${packages.length === 0 ? `<div class="empty-state">${Icons.get('package', {size:32})}<p>Aucun colis</p></div>` : `
                                <table class="table table-sm"><thead><tr><th>Tracking</th><th>Client</th><th>Description</th><th>Poids</th>${isEditable ? '<th></th>' : ''}</tr></thead>
                                <tbody>${packages.map(p => `<tr><td><strong>${p.tracking_number || p.supplier_tracking}</strong></td><td>${getClientName(p)}</td><td>${p.description || ''}</td><td>${p.weight ? p.weight + ' kg' : ''}</td>${isEditable ? `<td><div class="table-actions"><button class="btn btn-sm btn-ghost text-error" onclick="Views.departures.removePackageFromDepartureAPI('${p.id}', '${departureId}', this)">${Icons.get('x', {size:14})}</button></div></td>` : ''}</tr>`).join('')}</tbody></table>
                            `}
                        </div>
                    </div>
                    
                    ${isEditable ? `
                    <div class="modal-tab-content" id="tab-add">
                        <div class="scan-section">
                            <p class="scan-instruction">${Icons.get('scan', {size:16})} Scannez ou saisissez le code du colis a ajouter</p>
                            <div class="scan-input-row">
                                <input type="text" id="add-scan-input" class="form-input scan-input" placeholder="Code tracking..." autocomplete="off">
                                <button class="btn btn-primary" id="btn-add-scan">${Icons.get('plus', {size:16})}</button>
                            </div>
                            <div class="scan-status" id="add-scan-status"></div>
                        </div>
                        <div class="manual-section">
                            <p class="section-divider"><span>ou selection manuelle</span></p>
                            <div class="add-package-row">
                                <div id="add-package-select" class="add-package-select"></div>
                                <button class="btn btn-outline" id="btn-add-manual" ${unassignedPackages.length === 0 ? 'disabled' : ''}>${Icons.get('plus', {size:14})} Ajouter</button>
                            </div>
                            <p class="text-sm text-muted mt-sm">${unassignedPackages.length} colis disponibles</p>
                        </div>
                    </div>
                    
                    <div class="modal-tab-content" id="tab-remove">
                        <div class="scan-section">
                            <p class="scan-instruction">${Icons.get('scan', {size:16})} Scannez ou saisissez le code du colis a retirer</p>
                            <div class="scan-input-row">
                                <input type="text" id="remove-scan-input" class="form-input scan-input" placeholder="Code tracking..." autocomplete="off">
                                <button class="btn btn-error" id="btn-remove-scan">${Icons.get('minus', {size:16})}</button>
                            </div>
                            <div class="scan-status" id="remove-scan-status"></div>
                        </div>
                        <div class="manual-section">
                            <p class="section-divider"><span>ou selection manuelle</span></p>
                            <div class="add-package-row">
                                <div id="remove-package-select" class="add-package-select"></div>
                                <button class="btn btn-outline text-error" id="btn-remove-manual" ${packages.length === 0 ? 'disabled' : ''}>${Icons.get('minus', {size:14})} Retirer</button>
                            </div>
                            <p class="text-sm text-muted mt-sm">${packages.length} colis dans ce depart</p>
                        </div>
                    </div>
                    ` : ''}
                </div>
            `,
            footer: `<button class="btn btn-secondary" onclick="Modal.close()">Fermer</button>`
        });
        
        // Attendre que le DOM soit pret (seulement si éditable)
        if (isEditable) {
            setTimeout(() => this.initPackagesModalEventsAPI(departureId, unassignedPackages, packages), 50);
        }
    },
    
    initPackagesModalEventsAPI(departureId, unassignedPackages, packages) {
        // Tab switching
        document.querySelectorAll('.modal-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.modal-tab-content').forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById(`tab-${tab.dataset.tab}`)?.classList.add('active');
                if (tab.dataset.tab === 'add') document.getElementById('add-scan-input')?.focus();
                if (tab.dataset.tab === 'remove') document.getElementById('remove-scan-input')?.focus();
            });
        });
        
        // Add scan
        const addInput = document.getElementById('add-scan-input');
        const addStatus = document.getElementById('add-scan-status');
        const doAdd = () => {
            const code = addInput.value.trim();
            if (code) {
                this.scanAddPackageAPI(code, departureId, addInput, addStatus);
            }
        };
        addInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } });
        document.getElementById('btn-add-scan')?.addEventListener('click', doAdd);
        
        // Remove scan
        const removeInput = document.getElementById('remove-scan-input');
        const removeStatus = document.getElementById('remove-scan-status');
        const doRemove = () => {
            const code = removeInput.value.trim();
            if (code) {
                this.scanRemovePackageAPI(code, departureId, removeInput, removeStatus);
            }
        };
        removeInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doRemove(); } });
        document.getElementById('btn-remove-scan')?.addEventListener('click', doRemove);
        
        // Helper pour obtenir le nom du client
        const getClientName = (p) => p.client?.name || p.client_name || p.recipient?.name || 'Client';
        
        // Manual selects
        this.addPackageSelect = new SearchSelect({
            container: '#add-package-select',
            placeholder: 'Rechercher...',
            items: unassignedPackages.map(p => ({ id: p.id, name: `${p.tracking_number || p.supplier_tracking} - ${getClientName(p)}` })),
            onSelect: () => {},
            dropUp: true  // Ouvrir vers le haut pour éviter le débordement
        });
        document.getElementById('btn-add-manual')?.addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            const id = this.addPackageSelect?.getValue();
            if (!id) { Toast.error('Selectionnez un colis'); return; }
            await this.addPackageToDepartureAPI(id, departureId, btn);
        });
        
        this.removePackageSelect = new SearchSelect({
            container: '#remove-package-select',
            placeholder: 'Rechercher...',
            items: packages.map(p => ({ id: p.id, name: `${p.tracking_number || p.supplier_tracking} - ${getClientName(p)}` })),
            onSelect: () => {},
            dropUp: true  // Ouvrir vers le haut pour éviter le débordement
        });
        document.getElementById('btn-remove-manual')?.addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            const id = this.removePackageSelect?.getValue();
            if (!id) { Toast.error('Selectionnez un colis'); return; }
            await this.removePackageFromDepartureAPI(id, departureId, btn);
        });
    },
    
    async addPackageToDepartureAPI(packageId, departureId, btn = null) {
        try {
            Loader.button(btn, true, { text: '' });
            await API.departures.assignPackages(departureId, [packageId]);
            Toast.success('Colis ajoute au depart');
            this.viewPackages(departureId);
            this.renderDepartures();
        } catch (error) {
            Toast.error(`Erreur: ${error.message}`);
        } finally {
            Loader.button(btn, false);
        }
    },
    
    async removePackageFromDepartureAPI(packageId, departureId, btn = null) {
        try {
            Loader.button(btn, true, { text: '' });
            await API.departures.removePackage(departureId, packageId);
            Toast.success('Colis retire du depart');
            this.viewPackages(departureId);
            this.renderDepartures();
        } catch (error) {
            Toast.error(`Erreur: ${error.message}`);
        } finally {
            Loader.button(btn, false);
        }
    },
    
    async scanAddPackageAPI(code, departureId, inputEl, statusEl) {
        try {
            // Chercher le colis par tracking
            const data = await API.packages.getAll({ search: code, per_page: 10 });
            const packages = data.packages || [];
            const pkg = packages.find(p => 
                p.tracking_number?.toLowerCase() === code.toLowerCase() ||
                p.supplier_tracking?.toLowerCase() === code.toLowerCase()
            );
            
            if (!pkg) {
                statusEl.innerHTML = `<span class="text-error">${Icons.get('x', {size:14})} Colis non trouve</span>`;
                return;
            }
            
            if (pkg.departure_id) {
                statusEl.innerHTML = `<span class="text-warning">${Icons.get('alert-circle', {size:14})} Colis deja assigne</span>`;
                return;
            }
            
            await this.addPackageToDepartureAPI(pkg.id, departureId);
            inputEl.value = '';
            statusEl.innerHTML = `<span class="text-success">${Icons.get('check', {size:14})} Colis ajoute</span>`;
        } catch (error) {
            statusEl.innerHTML = `<span class="text-error">${Icons.get('x', {size:14})} Erreur</span>`;
        }
    },
    
    async scanRemovePackageAPI(code, departureId, inputEl, statusEl) {
        try {
            // Chercher le colis dans le départ
            const depData = await API.departures.getById(departureId);
            const packages = depData.departure?.packages || [];
            const pkg = packages.find(p => 
                p.tracking_number?.toLowerCase() === code.toLowerCase() ||
                p.supplier_tracking?.toLowerCase() === code.toLowerCase()
            );
            
            if (!pkg) {
                statusEl.innerHTML = `<span class="text-error">${Icons.get('x', {size:14})} Colis non trouve dans ce depart</span>`;
                return;
            }
            
            await this.removePackageFromDepartureAPI(pkg.id, departureId);
            inputEl.value = '';
            statusEl.innerHTML = `<span class="text-success">${Icons.get('check', {size:14})} Colis retire</span>`;
        } catch (error) {
            statusEl.innerHTML = `<span class="text-error">${Icons.get('x', {size:14})} Erreur</span>`;
        }
    },
    
    /**
     * S'assurer que les colis sont charges dans localStorage
     */
    ensurePackagesLoaded() {
        let packages = JSON.parse(localStorage.getItem('ec_packages') || '[]');
        
        // Si vide, initialiser avec les donnees mock
        if (packages.length === 0) {
            packages = [
                { id: 'pkg-001', tracking: 'EC-2024-00001', supplier_tracking: 'TB202401150001', client_id: 'c1', client_name: 'Marie Fotso', client_phone: '+237 699 888 777', description: 'Electronique - Smartphones', transport: 'air_normal', type: 'phone_boxed', status: 'in_transit', weight: 5, quantity: 10, amount: 52400, paid: 52400, created_at: '2024-01-15' },
                { id: 'pkg-002', tracking: 'EC-2024-00002', supplier_tracking: '1688-2024-98765', client_id: 'c2', client_name: 'Paul Mbarga', client_phone: '+237 677 111 222', description: 'Vetements', transport: 'sea', type: 'carton', status: 'pending', weight: 25, cbm: 0.12, amount: 11790, paid: 0, created_at: '2024-01-18' },
                { id: 'pkg-003', tracking: 'EC-2024-00003', supplier_tracking: 'ALI20240110333', client_id: 'c3', client_name: 'Jean Kamga', client_phone: '+237 655 333 444', description: 'Pieces auto', transport: 'air_express', type: 'risky', status: 'delivered', weight: 8, amount: 94360, paid: 94360, created_at: '2024-01-10' },
                { id: 'pkg-004', tracking: 'EC-2024-00004', supplier_tracking: 'TB202401200044', client_id: 'c4', client_name: 'Sophie Ngo', client_phone: '+237 699 555 666', description: 'Cosmetiques', transport: 'air_normal', type: 'normal', status: 'received', weight: 12, amount: 94320, paid: 50000, created_at: '2024-01-20' },
                { id: 'pkg-005', tracking: 'EC-2024-00005', supplier_tracking: '1688-2024-55512', client_id: 'c5', client_name: 'Eric Tamba', client_phone: '+237 677 888 999', description: 'Informatique - Laptops', transport: 'air_express', type: 'laptop', status: 'customs', quantity: 2, amount: 28930, paid: 28930, created_at: '2024-01-12' }
            ];
            localStorage.setItem('ec_packages', JSON.stringify(packages));
        }
        
        return packages;
    },
    
    addPackageToDeparture(packageId, departureId) {
        const packages = JSON.parse(localStorage.getItem('ec_packages') || '[]');
        const pkg = packages.find(p => p.id === packageId);
        
        if (pkg) {
            pkg.departure_id = departureId;
            localStorage.setItem('ec_packages', JSON.stringify(packages));
            Toast.success('Colis ajoute au depart');
            
            // Rafraichir la modale et la liste
            this.viewPackages(departureId);
            this.renderDepartures();
        }
    },
    
    removePackageFromDeparture(packageId, departureId) {
        const packages = JSON.parse(localStorage.getItem('ec_packages') || '[]');
        const pkg = packages.find(p => p.id === packageId);
        
        if (pkg) {
            delete pkg.departure_id;
            localStorage.setItem('ec_packages', JSON.stringify(packages));
            Toast.success('Colis retire du depart');
            this.updatePackagesModalList(departureId);
            this.renderDepartures();
        }
    },
    
    // === SCAN FUNCTIONS ===
    
    scanAddPackage(code, departureId, inputEl, statusEl) {
        const allPackages = this.ensurePackagesLoaded();
        const pkg = allPackages.find(p => 
            (p.tracking && p.tracking.toLowerCase() === code.toLowerCase()) ||
            (p.supplier_tracking && p.supplier_tracking.toLowerCase() === code.toLowerCase())
        );
        
        // Feedback immediat
        inputEl.value = '';
        
        if (!pkg) {
            statusEl.innerHTML = `<div class="scan-result error">${Icons.get('x-circle', {size:20})}<span>Colis non trouve: ${code}</span></div>`;
            this.flashInput(inputEl, 'error');
            this.playSound('error');
        } else if (pkg.departure_id === departureId) {
            statusEl.innerHTML = `<div class="scan-result warning">${Icons.get('alert-circle', {size:20})}<span>Deja dans ce depart: ${pkg.client_name || code}</span></div>`;
            this.flashInput(inputEl, 'warning');
            this.playSound('warning');
        } else if (pkg.departure_id) {
            statusEl.innerHTML = `<div class="scan-result warning">${Icons.get('alert-circle', {size:20})}<span>Deja assigne a un autre depart</span></div>`;
            this.flashInput(inputEl, 'warning');
            this.playSound('warning');
        } else {
            // Feedback AVANT l'update
            statusEl.innerHTML = `<div class="scan-result success">${Icons.get('check-circle', {size:20})}<div class="scan-result-info"><strong>${pkg.tracking || pkg.supplier_tracking}</strong><span>${pkg.client_name || 'N/A'}</span></div></div>`;
            this.flashInput(inputEl, 'success');
            this.playSound('success');
            // Update apres
            this.addPackageQuiet(pkg.id, departureId);
        }
        
        inputEl.focus();
        this.autoHideStatus(statusEl);
    },
    
    scanRemovePackage(code, departureId, inputEl, statusEl) {
        const packages = this.getPackagesForDeparture(departureId);
        const pkg = packages.find(p => 
            (p.tracking && p.tracking.toLowerCase() === code.toLowerCase()) ||
            (p.supplier_tracking && p.supplier_tracking.toLowerCase() === code.toLowerCase())
        );
        
        // Feedback immediat
        inputEl.value = '';
        
        if (!pkg) {
            statusEl.innerHTML = `<div class="scan-result error">${Icons.get('x-circle', {size:20})}<span>Colis non trouve dans ce depart: ${code}</span></div>`;
            this.flashInput(inputEl, 'error');
            this.playSound('error');
        } else {
            // Feedback AVANT l'update
            statusEl.innerHTML = `<div class="scan-result success removed">${Icons.get('check-circle', {size:20})}<div class="scan-result-info"><strong>${pkg.tracking || pkg.supplier_tracking}</strong><span>Retire: ${pkg.client_name || 'N/A'}</span></div></div>`;
            this.flashInput(inputEl, 'success');
            this.playSound('success');
            // Update apres
            this.removePackageQuiet(pkg.id, departureId);
        }
        
        inputEl.focus();
        this.autoHideStatus(statusEl);
    },
    
    // Flash visuel sur l'input
    flashInput(inputEl, type) {
        inputEl.classList.add(`flash-${type}`);
        setTimeout(() => inputEl.classList.remove(`flash-${type}`), 300);
    },
    
    // Auto-hide du status apres quelques secondes (sauf erreur)
    autoHideStatus(statusEl) {
        clearTimeout(this.statusTimeout);
        this.statusTimeout = setTimeout(() => {
            if (statusEl.querySelector('.success')) {
                statusEl.innerHTML = '';
            }
        }, 3000);
    },
    
    addPackageQuiet(packageId, departureId) {
        const packages = JSON.parse(localStorage.getItem('ec_packages') || '[]');
        const pkg = packages.find(p => p.id === packageId);
        if (pkg) {
            pkg.departure_id = departureId;
            localStorage.setItem('ec_packages', JSON.stringify(packages));
            this.updatePackagesModalList(departureId);
            // Re-render les cartes en arriere-plan
            setTimeout(() => this.renderDepartures(), 100);
        }
    },
    
    removePackageQuiet(packageId, departureId) {
        const packages = JSON.parse(localStorage.getItem('ec_packages') || '[]');
        const pkg = packages.find(p => p.id === packageId);
        if (pkg) {
            delete pkg.departure_id;
            localStorage.setItem('ec_packages', JSON.stringify(packages));
            this.updatePackagesModalList(departureId);
            // Re-render les cartes en arriere-plan
            setTimeout(() => this.renderDepartures(), 100);
        }
    },
    
    updatePackagesModalList(departureId) {
        const dep = this.departures.find(d => d.id === departureId);
        if (!dep) return;
        
        const packages = this.getPackagesForDeparture(departureId);
        const allPackages = this.ensurePackagesLoaded();
        const unassignedPackages = allPackages.filter(p => !p.departure_id);
        
        const totalWeight = packages.reduce((sum, p) => sum + (p.weight || 0), 0);
        
        // Update stats
        const statsEl = document.querySelector('.departure-stats-mini');
        if (statsEl) {
            statsEl.innerHTML = `<span class="stat-item">${Icons.get('package', {size:14})} ${packages.length} colis</span><span class="stat-item">${Icons.get('scale', {size:14})} ${totalWeight.toFixed(1)} kg</span>`;
        }
        
        // Update tab count
        const listTab = document.querySelector('.modal-tab[data-tab="list"]');
        if (listTab) listTab.innerHTML = `${Icons.get('list', {size:14})} Liste (${packages.length})`;
        
        // Update list
        const listEl = document.querySelector('#tab-list .departure-packages-list');
        if (listEl) {
            listEl.innerHTML = packages.length === 0 ? 
                `<div class="empty-state">${Icons.get('package', {size:32})}<p>Aucun colis</p></div>` :
                `<table class="table table-sm"><thead><tr><th>Tracking</th><th>Client</th><th>Description</th><th>Poids</th><th></th></tr></thead><tbody>${packages.map(p => `<tr><td><strong>${p.tracking || p.supplier_tracking}</strong></td><td>${p.client_name || 'N/A'}</td><td>${p.description || ''}</td><td>${p.weight ? p.weight + ' kg' : ''}</td><td><div class="table-actions"><button class="btn btn-sm btn-ghost text-error" onclick="Views.departures.removePackageFromDeparture('${p.id}', '${departureId}')">${Icons.get('x', {size:14})}</button></div></td></tr>`).join('')}</tbody></table>`;
        }
        
        // Update selects
        if (this.addPackageSelect) {
            this.addPackageSelect.setItems(unassignedPackages.map(p => ({ id: p.id, name: `${p.tracking || p.supplier_tracking} - ${p.client_name || 'N/A'}` })));
            this.addPackageSelect.selectedItem = null;
            const addTrigger = document.querySelector('#add-package-select .search-select-value');
            if (addTrigger) addTrigger.textContent = 'Rechercher...';
        }
        if (this.removePackageSelect) {
            this.removePackageSelect.setItems(packages.map(p => ({ id: p.id, name: `${p.tracking || p.supplier_tracking} - ${p.client_name || 'N/A'}` })));
            this.removePackageSelect.selectedItem = null;
            const removeTrigger = document.querySelector('#remove-package-select .search-select-value');
            if (removeTrigger) removeTrigger.textContent = 'Rechercher...';
        }
    },
    
    playSound(type) {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            gain.gain.value = 0.1;
            osc.frequency.value = type === 'success' ? 800 : type === 'warning' ? 400 : 200;
            osc.start();
            osc.stop(ctx.currentTime + (type === 'success' ? 0.1 : type === 'warning' ? 0.2 : 0.3));
        } catch (e) {}
    },
    
    // ==================== DEPARTURE DETAIL VIEW ====================
    
    /**
     * Affiche les détails d'un départ avec:
     * - Timeline de suivi visuel
     * - Historique des transporteurs
     * - Infos carrier actuel
     */
    async viewDepartureDetail(departureId, btn = null) {
        const dep = this.departures.find(d => d.id === departureId);
        if (!dep) {
            Toast.error('Départ non trouvé');
            return;
        }
        
        // Charger l'historique des transporteurs depuis l'API
        let carrierHistory = [];
        let currentCarrier = null;
        
        try {
            Loader.button(btn, true, { text: '' });
            const response = await API.departures.getCarrierHistory(departureId);
            carrierHistory = response.carrier_history || [];
            currentCarrier = response.current_carrier;
        } catch (e) {
            console.warn('Could not load carrier history:', e);
        } finally {
            Loader.button(btn, false);
        }
        
        const packages = this.getPackagesForDeparture(departureId);
        const originLabel = CONFIG.ORIGINS[dep.origin_country]?.label || dep.origin_country;
        const originCity = CONFIG.ORIGINS[dep.origin_country]?.cities?.find(c => c.id === dep.origin_city)?.name || dep.origin_city || '';
        const destLabel = CONFIG.DESTINATIONS[dep.dest_country]?.label || dep.dest_country;
        const transportLabel = CONFIG.TRANSPORT_MODES.find(t => t.value === dep.transport_mode)?.label || dep.transport_mode;
        
        const statusLabels = { scheduled: 'Programmé', departed: 'En transit', arrived: 'Arrivé', cancelled: 'Annulé' };
        
        // Déterminer le statut pour le tracking-progress
        let trackingStatus = 'pending';
        if (dep.status === 'departed') trackingStatus = 'in_transit';
        else if (dep.status === 'arrived') trackingStatus = 'arrived_port';
        else if (dep.status === 'scheduled') trackingStatus = 'received';
        
        Modal.open({
            title: `Détails du départ`,
            size: 'lg',
            content: `
                <div class="departure-detail-modal">
                    <div class="departure-detail-header">
                        <div class="departure-route-big">
                            <span class="route-origin">${originLabel} ${originCity ? `(${originCity})` : ''}</span>
                            <span class="route-arrow">${Icons.get('arrow-right', {size:20})}</span>
                            <span class="route-dest">${destLabel}</span>
                        </div>
                        <div class="departure-meta">
                            <span class="transport-badge transport-${dep.transport_mode}">${transportLabel}</span>
                            <span class="status-badge status-${dep.status === 'departed' ? 'in-transit' : dep.status}">${statusLabels[dep.status]}</span>
                        </div>
                    </div>
                    
                    <div class="departure-tracking-section">
                        <h4 class="section-title">${Icons.get('map', {size:16})} Suivi du départ</h4>
                        <tracking-progress status="${trackingStatus}" transport="${dep.transport_mode}"></tracking-progress>
                    </div>
                    
                    ${currentCarrier ? `
                        <div class="current-carrier-section">
                            <h4 class="section-title">${Icons.get('truck', {size:16})} Transporteur actuel</h4>
                            <div class="carrier-card active">
                                <div class="carrier-info">
                                    <span class="carrier-name">${currentCarrier.carrier_name}</span>
                                    <span class="carrier-tracking">${Icons.get('hash', {size:14})} ${currentCarrier.tracking}</span>
                                </div>
                                <div class="carrier-status">
                                    ${currentCarrier.status ? `<span class="carrier-status-badge">${currentCarrier.status}</span>` : ''}
                                    ${currentCarrier.location ? `<span class="carrier-location">${Icons.get('map-pin', {size:12})} ${currentCarrier.location}</span>` : ''}
                                </div>
                                <button class="btn btn-sm btn-outline" onclick="Views.departures.refreshTracking('${departureId}', this)">
                                    ${Icons.get('refresh', {size:14})} Actualiser
                                </button>
                            </div>
                        </div>
                    ` : dep.status !== 'scheduled' ? `
                        <div class="no-carrier-section">
                            <p class="text-muted">${Icons.get('info', {size:14})} Aucun transporteur assigné</p>
                            <button class="btn btn-sm btn-primary" onclick="Modal.close(); Views.departures.showCarrierModal('${departureId}')">
                                ${Icons.get('plus', {size:14})} Assigner un transporteur
                            </button>
                        </div>
                    ` : ''}
                    
                    ${carrierHistory.length > 1 ? `
                        <div class="carrier-history-section">
                            <h4 class="section-title">${Icons.get('clock', {size:16})} Historique transporteurs</h4>
                            <div class="carrier-history-list">
                                ${carrierHistory.slice(0, -1).reverse().map(h => `
                                    <div class="carrier-card past">
                                        <div class="carrier-info">
                                            <span class="carrier-name">${h.carrier_name || h.carrier}</span>
                                            <span class="carrier-tracking">${Icons.get('hash', {size:12})} ${h.tracking}</span>
                                        </div>
                                        <div class="carrier-dates">
                                            <span>${Icons.get('calendar', {size:12})} ${new Date(h.from).toLocaleDateString('fr-FR')} → ${h.to ? new Date(h.to).toLocaleDateString('fr-FR') : 'En cours'}</span>
                                        </div>
                                        ${h.final_status ? `<span class="carrier-final-status">${h.final_status}</span>` : ''}
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                    
                    <div class="departure-stats-section">
                        <div class="stat-box"><span class="stat-value">${packages.length}</span><span class="stat-label">Colis</span></div>
                        <div class="stat-box"><span class="stat-value">${packages.reduce((sum, p) => sum + (p.weight || 0), 0).toFixed(1)}</span><span class="stat-label">kg total</span></div>
                        <div class="stat-box"><span class="stat-value">${dep.estimated_duration}</span><span class="stat-label">jours</span></div>
                        <div class="stat-box"><span class="stat-value">${carrierHistory.length}</span><span class="stat-label">transporteur(s)</span></div>
                    </div>
                    
                    ${dep.notes ? `<p class="departure-notes-detail">${Icons.get('info', {size:14})} ${dep.notes}</p>` : ''}
                </div>
            `,
            footer: `
                <button class="btn btn-secondary" onclick="Modal.close()">Fermer</button>
                <button class="btn btn-outline" onclick="Modal.close(); Views.departures.viewPackages('${departureId}')">${Icons.get('package', {size:14})} Gérer colis</button>
                ${dep.status === 'departed' && !currentCarrier ? `<button class="btn btn-primary" onclick="Modal.close(); Views.departures.showCarrierModal('${departureId}')">${Icons.get('truck', {size:14})} Assigner transporteur</button>` : ''}
            `
        });
    },
    
    async showCarrierModal(departureId) {
        const dep = this.departures.find(d => d.id === departureId);
        if (!dep) return;
        
        const hasCarrier = !!dep.carrier;
        const carrierOptions = [
            { id: 'dhl', name: 'DHL Express' },
            { id: 'fedex', name: 'FedEx' },
            { id: 'ups', name: 'UPS' },
            { id: 'ems', name: 'EMS' },
            { id: 'china_post', name: 'China Post' },
            { id: 'sf_express', name: 'SF Express' },
            { id: 'aramex', name: 'Aramex' },
            { id: 'ethiopian', name: 'Ethiopian Airlines Cargo' },
            { id: 'other', name: 'Autre' }
        ];
        
        Modal.open({
            title: hasCarrier ? 'Changer de transporteur' : 'Assigner un transporteur',
            content: `
                <div class="carrier-form">
                    ${hasCarrier ? `
                        <div class="current-carrier-info mb-md">
                            <p class="text-sm text-muted">Transporteur actuel: <strong>${dep.carrier.toUpperCase()}</strong> - ${dep.carrier_tracking}</p>
                            ${dep.carrier_location ? `<p class="text-sm text-muted">Dernière position: ${dep.carrier_location}</p>` : ''}
                        </div>
                    ` : ''}
                    <div class="form-group">
                        <label class="form-label">Transporteur *</label>
                        <div id="carrier-select-container"></div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Numéro de tracking *</label>
                        <input type="text" id="carrier-tracking-input" class="form-input" placeholder="Ex: 1234567890">
                    </div>
                    <div class="form-group">
                        <label class="toggle-label">
                            <input type="checkbox" id="carrier-is-final-leg" checked>
                            <span>Étape finale du voyage</span>
                        </label>
                        <p class="form-hint">Décochez si le colis sera repris par un autre transporteur après cette étape</p>
                    </div>
                    <div class="form-group">
                        <label class="toggle-label">
                            <input type="checkbox" id="carrier-notify-clients">
                            <span>Notifier les clients</span>
                        </label>
                    </div>
                </div>
            `,
            footer: `
                <button class="btn btn-secondary" onclick="Modal.close()">Annuler</button>
                <button class="btn btn-primary" id="btn-save-carrier">${hasCarrier ? 'Changer' : 'Assigner'}</button>
            `
        });
        
        setTimeout(() => {
            this.carrierSelect = new SearchSelect({ 
                container: '#carrier-select-container', 
                placeholder: 'Sélectionner un transporteur', 
                items: carrierOptions, 
                onSelect: () => {} 
            });
            if (dep.carrier) this.carrierSelect.setValue(dep.carrier);
            
            document.getElementById('btn-save-carrier')?.addEventListener('click', async (e) => {
                const btn = e.currentTarget;
                const carrier = this.carrierSelect?.getValue();
                const tracking = document.getElementById('carrier-tracking-input').value.trim();
                const isFinalLeg = document.getElementById('carrier-is-final-leg').checked;
                const notify = document.getElementById('carrier-notify-clients').checked;
                
                if (!carrier || !tracking) { 
                    Toast.error('Transporteur et tracking requis'); 
                    return; 
                }
                
                try {
                    Loader.button(btn, true, { text: hasCarrier ? 'Changement...' : 'Assignation...' });
                    const result = await API.departures.assignCarrier(departureId, { 
                        carrier, 
                        carrier_tracking: tracking, 
                        is_final_leg: isFinalLeg,
                        notify_clients: notify 
                    });
                    
                    // Mettre à jour localement
                    const updatedDep = result.departure || dep;
                    Object.assign(dep, {
                        carrier,
                        carrier_tracking: tracking,
                        is_final_leg: isFinalLeg,
                        status: updatedDep.status || dep.status
                    });
                    
                    this.saveData();
                    Modal.close();
                    Toast.success(hasCarrier ? 'Transporteur changé' : 'Transporteur assigné');
                    this.renderDepartures();
                } catch (error) {
                    Toast.error(error.message || 'Erreur');
                } finally {
                    Loader.button(btn, false);
                }
            });
        }, 50);
    },
    
    async refreshTracking(departureId, btn = null) {
        try {
            Loader.button(btn, true, { text: '' });
            Toast.info('Actualisation...');
            const result = await API.departures.refreshTracking(departureId);
            Toast.success(`Mis à jour - ${result.updated_packages} colis`);
            Modal.close();
            this.viewDepartureDetail(departureId);
        } catch (error) {
            Toast.error(error.message || 'Erreur');
        } finally {
            Loader.button(btn, false);
        }
    }
};
