/**
 * Shipping Service - Calculs de tarifs et estimations
 * Supporte les types de colis dynamiques configures par l'admin
 */

const ShippingService = {
    /**
     * Obtenir les types de colis selon le transport et la route
     * Retourne uniquement les types configurés par l'admin, pas de fallback statique
     */
    getPackageTypes(transport, originCountry = null, destCountry = null) {
        // Si route specifiee, obtenir les types depuis les tarifs
        if (originCountry && destCountry) {
            const routeRates = this.getRouteRates(originCountry, destCountry);
            if (routeRates && routeRates[transport]) {
                return this.extractTypesFromRates(routeRates[transport], transport);
            }
        }
        
        // Pas de fallback - retourner vide si pas configuré
        return [];
    },
    
    /**
     * Obtenir les moyens de transport disponibles pour une route
     * Retourne uniquement les transports configurés par l'admin
     */
    getAvailableTransports(originCountry, destCountry) {
        if (!originCountry || !destCountry) return [];
        
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
     * Extraire les types de colis depuis les tarifs d'un transport
     */
    extractTypesFromRates(rates, transport) {
        if (!rates) return [];
        
        const types = [];
        Object.entries(rates).forEach(([key, value]) => {
            if (key === 'currency') return;
            
            // Nouveau format: { label, rate, unit }
            if (typeof value === 'object' && value.rate !== undefined) {
                types.push({
                    value: key,
                    label: value.label || key,
                    unit: value.unit || 'kg',
                    rate: value.rate
                });
            }
            // Ancien format: number (rate direct)
            else if (typeof value === 'number') {
                const staticType = this.getStaticTypeConfig(key, transport);
                types.push({
                    value: key,
                    label: staticType?.label || key,
                    unit: staticType?.unit || 'kg',
                    rate: value
                });
            }
        });
        
        return types;
    },
    
    /**
     * Obtenir la config statique d'un type (fallback)
     */
    getStaticTypeConfig(type, transport) {
        const typeKey = transport === 'sea' ? 'sea' : 'air';
        const types = CONFIG.PACKAGE_TYPES[typeKey] || [];
        return types.find(t => t.value === type);
    },
    
    /**
     * Obtenir la config d'un type de colis (dynamique ou statique)
     */
    getTypeConfig(type, transport, originCountry = null, destCountry = null) {
        const types = this.getPackageTypes(transport, originCountry, destCountry);
        return types.find(t => t.value === type);
    },
    
    /**
     * Obtenir le label d'un transport
     */
    getTransportLabel(mode) {
        const transport = CONFIG.TRANSPORT_MODES.find(t => t.value === mode);
        return transport ? transport.label : mode || 'N/A';
    },
    
    /**
     * Obtenir le label d'un type
     */
    getTypeLabel(type, transport, originCountry = null, destCountry = null) {
        const typeConfig = this.getTypeConfig(type, transport, originCountry, destCountry);
        return typeConfig ? typeConfig.label : type || 'N/A';
    },
    
    /**
     * Obtenir les entrepots d'un pays
     */
    getWarehouses(country) {
        const countryData = CONFIG.DESTINATIONS[country];
        return countryData ? countryData.warehouses : [];
    },
    
    /**
     * Obtenir le label d'un entrepot
     */
    getWarehouseLabel(country, warehouseId) {
        if (!country || !warehouseId) return 'N/A';
        const warehouses = this.getWarehouses(country);
        const warehouse = warehouses.find(w => w.id === warehouseId);
        return warehouse ? warehouse.name : warehouseId;
    },
    
    /**
     * Obtenir le label d'un pays de destination
     */
    getCountryLabel(country) {
        return CONFIG.DESTINATIONS[country]?.label || country || 'N/A';
    },
    
    /**
     * Obtenir le label d'un pays d'origine
     */
    getOriginCountryLabel(country) {
        return CONFIG.ORIGINS[country]?.label || country || 'N/A';
    },
    
    /**
     * Obtenir les villes d'un pays d'origine
     */
    getOriginCities(country) {
        const countryData = CONFIG.ORIGINS[country];
        return countryData ? countryData.cities : [];
    },
    
    /**
     * Obtenir le label d'une ville d'origine
     */
    getOriginCityLabel(country, cityId) {
        if (!country || !cityId) return 'N/A';
        const cities = this.getOriginCities(country);
        const city = cities.find(c => c.id === cityId);
        return city ? city.name : cityId;
    },
    
    /**
     * Obtenir les tarifs pour une route (origine → destination)
     */
    getRouteRates(originCountry, destCountry) {
        const routeKey = `${originCountry}_${destCountry}`;
        return CONFIG.SHIPPING_RATES[routeKey] || null;
    },
    
    /**
     * Verifier si une route existe
     */
    routeExists(originCountry, destCountry) {
        return !!this.getRouteRates(originCountry, destCountry);
    },
    
    /**
     * Obtenir toutes les destinations disponibles depuis une origine
     */
    getAvailableDestinations(originCountry) {
        const destinations = [];
        Object.keys(CONFIG.SHIPPING_RATES).forEach(routeKey => {
            if (routeKey.startsWith(`${originCountry}_`)) {
                const destCountry = routeKey.split('_')[1];
                if (CONFIG.DESTINATIONS[destCountry]) {
                    destinations.push({
                        id: destCountry,
                        name: CONFIG.DESTINATIONS[destCountry].label
                    });
                }
            }
        });
        return destinations;
    },
    
    /**
     * Obtenir le tarif d'un type de colis (supporte ancien et nouveau format)
     */
    getRateValue(rates, packageType) {
        if (!rates || !rates[packageType]) return null;
        const rateData = rates[packageType];
        // Nouveau format: { rate, label, unit }
        if (typeof rateData === 'object' && rateData.rate !== undefined) {
            return rateData.rate;
        }
        // Ancien format: number
        return typeof rateData === 'number' ? rateData : null;
    },
    
    /**
     * Calculer l'estimation du cout
     * @param {Object} params - Parametres du calcul
     * @returns {Object} - { success, estimate, details, currency, error }
     */
    calculateEstimate(params) {
        const { originCountry, transport, packageType, country, quantity, weight, cbm } = params;
        
        // Validations
        if (!originCountry) {
            return { success: false, error: 'Pays de depart requis' };
        }
        if (!transport) {
            return { success: false, error: 'Transport requis' };
        }
        if (!packageType) {
            return { success: false, error: 'Type de colis requis' };
        }
        if (!country) {
            return { success: false, error: 'Pays de destination requis' };
        }
        
        // Tarifs de la route
        const routeRates = this.getRouteRates(originCountry, country);
        if (!routeRates) {
            return { success: false, error: 'Tarifs non disponibles pour cette route' };
        }
        
        const rates = routeRates[transport];
        if (!rates) {
            return { success: false, error: 'Tarifs non disponibles pour ce transport' };
        }
        
        const typeConfig = this.getTypeConfig(packageType, transport, originCountry, country);
        const rate = this.getRateValue(rates, packageType);
        
        if (rate === null) {
            return { success: false, error: 'Tarif non disponible pour ce type' };
        }
        
        let estimate = 0;
        let details = '';
        const unit = typeConfig?.unit || 'kg';
        
        if (unit === 'cbm') {
            // Calcul par volume
            if (!cbm || cbm <= 0) {
                return { success: false, error: 'Volume (CBM) requis', needsInput: 'cbm' };
            }
            estimate = cbm * rate;
            details = `${cbm} m³ × ${rate} ${rates.currency}/m³`;
        } else if (unit === 'fixed') {
            // Tarif fixe
            estimate = rate;
            details = `Tarif fixe: ${rate} ${rates.currency}`;
        } else if (unit === 'piece') {
            // Calcul par piece
            if (!quantity || quantity <= 0) {
                return { success: false, error: 'Quantite requise', needsInput: 'quantity' };
            }
            estimate = quantity * rate;
            details = `${quantity} piece(s) × ${rate} ${rates.currency}/piece`;
        } else {
            // Calcul par kg (defaut)
            if (!weight || weight <= 0) {
                return { success: false, error: 'Poids requis', needsInput: 'weight' };
            }
            estimate = weight * rate;
            details = `${weight} kg × ${rate} ${rates.currency}/kg`;
        }
        
        return {
            success: true,
            estimate: estimate,
            details: details,
            currency: rates.currency,
            origin: this.getOriginCountryLabel(originCountry),
            transport: this.getTransportLabel(transport),
            type: this.getTypeLabel(packageType, transport, originCountry, country),
            country: this.getCountryLabel(country)
        };
    }
};
