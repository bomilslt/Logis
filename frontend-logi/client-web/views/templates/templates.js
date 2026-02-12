/**
 * Vue Templates - Gestion des templates destinataires
 */

Views.templates = {
    async render() {
        const main = document.getElementById('main-content');
        
        // Afficher loader pendant le chargement
        main.innerHTML = Loader.page('Chargement des templates...');
        
        // Charger les templates depuis l'API
        const templates = await TemplatesService.getAll();
        
        main.innerHTML = `
            <div class="templates-view">
                <div class="page-header">
                    <button class="btn btn-ghost btn-sm" onclick="history.back()">
                        ${Icons.get('arrowLeft', { size: 20 })}
                        Retour
                    </button>
                    <h1 class="page-title">Mes templates</h1>
                </div>
                
                <p class="templates-intro">
                    Sauvegardez vos destinataires frequents pour remplir rapidement vos formulaires.
                </p>
                
                ${templates.length === 0 ? `
                    <div class="empty-state">
                        ${Icons.get('users', { size: 48 })}
                        <h3 class="empty-state-title">Aucun template</h3>
                        <p class="empty-state-text">Creez votre premier template lors de l'ajout d'un colis</p>
                        <a href="#/new-package" class="btn btn-primary">
                            ${Icons.get('plus', { size: 18 })}
                            Nouveau colis
                        </a>
                    </div>
                ` : `
                    <div class="templates-list">
                        ${templates.map(tpl => this.renderTemplateCard(tpl)).join('')}
                    </div>
                `}
            </div>
        `;
        
        this.attachEvents();
    },
    
    renderTemplateCard(tpl) {
        const countryLabel = ShippingService.getCountryLabel(tpl.country);
        const warehouseLabel = ShippingService.getWarehouseLabel(tpl.country, tpl.warehouse);
        
        return `
            <div class="template-card" data-id="${tpl.id}">
                <div class="template-header">
                    <div class="template-icon">
                        ${Icons.get('user', { size: 20 })}
                    </div>
                    <div class="template-info">
                        <h3 class="template-name">${tpl.name}</h3>
                        <p class="template-recipient">${tpl.recipient_name || 'Sans nom'}</p>
                    </div>
                    <button class="btn-icon template-delete" data-id="${tpl.id}" title="Supprimer">
                        ${Icons.get('trash', { size: 18 })}
                    </button>
                </div>
                <div class="template-details">
                    <div class="template-detail">
                        ${Icons.get('phone', { size: 14 })}
                        <span>${tpl.recipient_phone || 'N/A'}</span>
                    </div>
                    <div class="template-detail">
                        ${Icons.get('mapPin', { size: 14 })}
                        <span>${countryLabel} - ${warehouseLabel}</span>
                    </div>
                </div>
                <button class="btn btn-outline btn-sm template-use" data-id="${tpl.id}">
                    Utiliser ce template
                </button>
            </div>
        `;
    },
    
    attachEvents() {
        // Delete template
        document.querySelectorAll('.template-delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                
                const confirmed = await Modal.confirm({
                    title: 'Supprimer le template',
                    message: 'Voulez-vous vraiment supprimer ce template ?',
                    confirmText: 'Supprimer',
                    danger: true
                });
                
                if (confirmed) {
                    try {
                        await TemplatesService.delete(id);
                        Toast.success('Template supprime');
                        this.render();
                    } catch (error) {
                        Toast.error('Erreur lors de la suppression');
                    }
                }
            });
        });
        
        // Use template
        document.querySelectorAll('.template-use').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                sessionStorage.setItem('use_template', id);
                Router.navigate('/new-package');
            });
        });
    }
};
