/**
 * Rates Service - Gestion des tarifs et routes
 * Charge les données depuis l'API et les met en cache
 */

const RatesService = {
    _loaded: false,
    _loading: null,
    
    origins: {},
    destinations: {},
    routes: {},
    
    /**
     * Vider le cache local (utile après modification des tarifs)
     */
    clearCache() {
        localStorage.removeItem('ec_origins');
        localStorage.removeItem('ec_destinations');
        localStorage.removeItem('ec_routes');
        this._loaded = false;
        this.origins = {};
        this.destinations = {};
        this.routes = {};
    },
    
    /**
     * Charger les tarifs depuis l'API
     * Appelé au démarrage de l'app si authentifié
     */
    async load() {
        // Éviter les chargements multiples simultanés
        if (this._loading) return this._loading;
        
        this._loading = this._doLoad();
        return this._loading;
    },
    
    async _doLoad() {
        try {
            const data = await API.settings.getRates();
            
            this.origins = data.origins || {};
            this.destinations = data.destinations || {};
            this.routes = data.shipping_rates || {};
            
            // Mettre en cache dans localStorage
            localStorage.setItem('ec_origins', JSON.stringify(this.origins));
            localStorage.setItem('ec_destinations', JSON.stringify(this.destinations));
            localStorage.setItem('ec_routes', JSON.stringify(this.routes));
            
            this._loaded = true;
            console.log('[RatesService] Loaded from API');
            
        } catch (error) {
            console.warn('[RatesService] API load failed, using cache:', error.message);
            
            // Fallback sur le cache localStorage uniquement (pas de données mock)
            try {
                this.origins = JSON.parse(localStorage.getItem('ec_origins') || '{}');
                this.destinations = JSON.parse(localStorage.getItem('ec_destinations') || '{}');
                this.routes = JSON.parse(localStorage.getItem('ec_routes') || '{}');
            } catch (e) {
                // Pas de fallback sur des données mock - retourner objets vides
                this.origins = {};
                this.destinations = {};
                this.routes = {};
            }
            
            this._loaded = true;
        }
        
        this._loading = null;
    },
    
    /**
     * S'assurer que les données sont chargées
     */
    async ensureLoaded() {
        if (!this._loaded) {
            await this.load();
        }
    },
    
    /**
     * Obtenir les origines (pays de départ)
     */
    getOrigins() {
        return this.origins;
    },
    
    /**
     * Obtenir les destinations (pays d'arrivée)
     */
    getDestinations() {
        return this.destinations;
    },
    
    /**
     * Obtenir les villes d'un pays d'origine
     */
    getOriginCities(country) {
        return this.origins[country]?.cities || [];
    },
    
    /**
     * Obtenir les entrepôts d'un pays de destination
     */
    getWarehouses(country) {
        return this.destinations[country]?.warehouses || [];
    },
    
    /**
     * Obtenir les tarifs d'une route
     */
    getRouteRates(originCountry, destCountry) {
        const routeKey = `${originCountry}_${destCountry}`;
        return this.routes[routeKey] || null;
    },
    
    /**
     * Vérifier si une route existe
     */
    routeExists(originCountry, destCountry) {
        return !!this.getRouteRates(originCountry, destCountry);
    },
    
    /**
     * Obtenir les transports disponibles pour une route
     */
    getAvailableTransports(originCountry, destCountry) {
        const routeRates = this.getRouteRates(originCountry, destCountry);
        if (!routeRates) return [];
        
        const transports = [];
        const transportLabels = {
            'sea': 'Bateau (Maritime)',
            'air_normal': 'Avion - Normal',
            'air_express': 'Avion - Express'
        };
        
        Object.keys(routeRates).forEach(key => {
            if (key !== 'currency' && transportLabels[key]) {
                transports.push({
                    value: key,
                    label: transportLabels[key]
                });
            }
        });
        
        return transports;
    },
    
    /**
     * Obtenir le label d'un pays d'origine
     */
    getOriginLabel(country) {
        return this.origins[country]?.label || country || 'N/A';
    },
    
    /**
     * Obtenir le label d'un pays de destination
     */
    getDestinationLabel(country) {
        return this.destinations[country]?.label || country || 'N/A';
    },
    
    /**
     * Obtenir le label d'une ville d'origine
     */
    getCityLabel(country, cityId) {
        const cities = this.getOriginCities(country);
        const city = cities.find(c => c.id === cityId);
        return city?.name || cityId || 'N/A';
    },
    
    /**
     * Obtenir le label d'un transport
     */
    getTransportLabel(mode) {
        const labels = {
            'sea': 'Bateau (Maritime)',
            'air_normal': 'Avion - Normal',
            'air_express': 'Avion - Express'
        };
        return labels[mode] || mode || 'N/A';
    },
    
    /**
     * Obtenir les items formatés pour SearchSelect (origines)
     */
    getOriginItems() {
        return Object.entries(this.origins).map(([key, val]) => ({
            id: key,
            name: val.label || key
        }));
    },
    
    /**
     * Obtenir les items formatés pour SearchSelect (destinations)
     */
    getDestinationItems() {
        return Object.entries(this.destinations).map(([key, val]) => ({
            id: key,
            name: val.label || key
        }));
    },
    
    /**
     * Obtenir les items formatés pour SearchSelect (villes d'une origine)
     */
    getCityItems(country) {
        return this.getOriginCities(country).map(c => ({
            id: c.id,
            name: c.name
        }));
    },
    
    /**
     * Obtenir les items formatés pour SearchSelect (transports d'une route)
     */
    getTransportItems(originCountry, destCountry) {
        return this.getAvailableTransports(originCountry, destCountry).map(t => ({
            id: t.value,
            name: t.label
        }));
    }
};
