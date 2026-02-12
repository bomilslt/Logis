/**
 * Templates Service - Gestion des templates destinataires
 * Utilise l'API backend pour persister les données
 */

const TemplatesService = {
    // Cache local pour éviter les appels API répétés
    _cache: null,
    _cacheTime: null,
    CACHE_DURATION: 60000, // 1 minute
    
    /**
     * Obtenir tous les templates (avec cache)
     */
    async getAll() {
        // Vérifier le cache
        if (this._cache && this._cacheTime && (Date.now() - this._cacheTime < this.CACHE_DURATION)) {
            return this._cache;
        }
        
        try {
            const response = await API.templates.getAll();
            this._cache = response.templates || [];
            this._cacheTime = Date.now();
            return this._cache;
        } catch (error) {
            console.error('[TemplatesService] getAll error:', error);
            return [];
        }
    },
    
    /**
     * Obtenir un template par ID
     */
    async getById(id) {
        // Chercher d'abord dans le cache
        if (this._cache) {
            const cached = this._cache.find(t => t.id === id);
            if (cached) return cached;
        }
        
        try {
            const response = await API.templates.getById(id);
            return response.template;
        } catch (error) {
            console.error('[TemplatesService] getById error:', error);
            return null;
        }
    },
    
    /**
     * Sauvegarder un nouveau template
     */
    async save(template) {
        try {
            const response = await API.templates.create({
                name: template.name,
                recipient_name: template.recipient_name,
                recipient_phone: template.recipient_phone,
                country: template.country,
                warehouse: template.warehouse
            });
            
            // Invalider le cache
            this._invalidateCache();
            
            return response.template;
        } catch (error) {
            console.error('[TemplatesService] save error:', error);
            throw error;
        }
    },
    
    /**
     * Mettre à jour un template
     */
    async update(id, data) {
        try {
            const response = await API.templates.update(id, data);
            
            // Invalider le cache
            this._invalidateCache();
            
            return response.template;
        } catch (error) {
            console.error('[TemplatesService] update error:', error);
            throw error;
        }
    },
    
    /**
     * Supprimer un template
     */
    async delete(id) {
        try {
            await API.templates.delete(id);
            
            // Invalider le cache
            this._invalidateCache();
            
            return true;
        } catch (error) {
            console.error('[TemplatesService] delete error:', error);
            throw error;
        }
    },
    
    /**
     * Invalider le cache
     */
    _invalidateCache() {
        this._cache = null;
        this._cacheTime = null;
    }
};
