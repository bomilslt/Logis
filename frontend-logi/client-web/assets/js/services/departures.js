/**
 * Departures Service - Gestion des departs programmes
 * Permet au client de voir les prochains departs correspondant a son itineraire
 * 
 * Charge les données depuis l'API backend au lieu du localStorage
 */

const DeparturesService = {
    // Cache local des départs
    _cache: null,
    _cacheTime: null,
    _cacheDuration: 5 * 60 * 1000, // 5 minutes
    
    /**
     * Charger les départs depuis l'API
     * @returns {Promise<Array>} Liste des départs
     */
    async fetchFromAPI() {
        try {
            const url = `${CONFIG.API_URL}/config/tenant/${CONFIG.TENANT_ID}/departures`;
            const response = await fetch(url, { credentials: 'include' });
            
            if (!response.ok) {
                console.warn('[DeparturesService] API error:', response.status);
                return [];
            }
            
            const data = await response.json();
            this._cache = data.departures || [];
            this._cacheTime = Date.now();
            
            console.log(`[DeparturesService] Loaded ${this._cache.length} departures from API`);
            return this._cache;
        } catch (e) {
            console.error('[DeparturesService] Fetch error:', e);
            return [];
        }
    },
    
    /**
     * Obtenir tous les départs (avec cache)
     * @returns {Promise<Array>}
     */
    async getAll() {
        // Vérifier le cache
        if (this._cache && this._cacheTime && (Date.now() - this._cacheTime < this._cacheDuration)) {
            return this._cache;
        }
        
        return await this.fetchFromAPI();
    },
    
    /**
     * Obtenir les prochains départs programmés (non partis)
     * @returns {Promise<Array>}
     */
    async getUpcoming() {
        const departures = await this.getAll();
        const today = new Date().toISOString().split('T')[0];
        
        return departures
            .filter(d => d.departure_date >= today && d.status === 'scheduled')
            .sort((a, b) => new Date(a.departure_date) - new Date(b.departure_date));
    },
    
    /**
     * Obtenir les prochains départs pour une route et un transport spécifiques
     * @param {string} originCountry - Pays d'origine
     * @param {string} destCountry - Pays de destination
     * @param {string} transportMode - Mode de transport (sea, air_normal, air_express)
     * @returns {Promise<Array>} - Liste des départs correspondants
     */
    async getForRoute(originCountry, destCountry, transportMode) {
        if (!originCountry || !destCountry || !transportMode) return [];
        
        const upcoming = await this.getUpcoming();
        return upcoming.filter(d => 
            d.origin_country === originCountry &&
            d.dest_country === destCountry &&
            d.transport_mode === transportMode
        );
    },
    
    /**
     * Obtenir le prochain départ pour une route et un transport
     * @returns {Promise<Object|null>}
     */
    async getNextForRoute(originCountry, destCountry, transportMode) {
        const departures = await this.getForRoute(originCountry, destCountry, transportMode);
        return departures.length > 0 ? departures[0] : null;
    },
    
    /**
     * Formater les infos d'un départ pour affichage
     */
    formatDeparture(dep) {
        if (!dep) return null;
        
        const departureDate = new Date(dep.departure_date);
        const arrivalDate = dep.estimated_arrival 
            ? new Date(dep.estimated_arrival)
            : new Date(departureDate.getTime() + (dep.estimated_duration || 7) * 24 * 60 * 60 * 1000);
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const daysUntil = Math.ceil((departureDate - today) / (1000 * 60 * 60 * 24));
        
        return {
            id: dep.id,
            departureDate: departureDate,
            departureDateStr: departureDate.toLocaleDateString('fr-FR', { 
                weekday: 'short', day: 'numeric', month: 'short' 
            }),
            arrivalDate: arrivalDate,
            arrivalDateStr: arrivalDate.toLocaleDateString('fr-FR', { 
                day: 'numeric', month: 'short' 
            }),
            duration: dep.estimated_duration,
            daysUntil: daysUntil,
            daysUntilLabel: daysUntil === 0 ? "Aujourd'hui" : 
                           daysUntil === 1 ? 'Demain' : 
                           `Dans ${daysUntil} jours`,
            isUrgent: daysUntil <= 3,
            originCountry: dep.origin_country,
            originCity: dep.origin_city,
            destCountry: dep.dest_country,
            transportMode: dep.transport_mode,
            notes: dep.notes
        };
    },
    
    /**
     * Obtenir tous les prochains départs groupés par route
     * @returns {Promise<Object>}
     */
    async getGroupedByRoute() {
        const departures = await this.getUpcoming();
        const grouped = {};
        
        departures.forEach(dep => {
            const routeKey = `${dep.origin_country}_${dep.dest_country}`;
            if (!grouped[routeKey]) {
                grouped[routeKey] = {
                    originCountry: dep.origin_country,
                    destCountry: dep.dest_country,
                    departures: []
                };
            }
            grouped[routeKey].departures.push(this.formatDeparture(dep));
        });
        
        return grouped;
    },
    
    /**
     * Forcer le rafraîchissement du cache
     */
    async refresh() {
        this._cache = null;
        this._cacheTime = null;
        return await this.fetchFromAPI();
    }
};
