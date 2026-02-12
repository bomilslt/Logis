/**
 * Vue Track - Suivi de colis par numero
 */

Views.track = {
    render() {
        const main = document.getElementById('main-content');
        main.innerHTML = `
            <div class="track-view">
                <div class="track-hero">
                    <div class="track-hero-icon">
                        <svg class="icon" viewBox="0 0 24 24">
                            <use href="assets/icons/icons.svg#search"></use>
                        </svg>
                    </div>
                    <h1 class="track-title">Suivre un colis</h1>
                    <p class="track-subtitle">Entrez votre numero de suivi pour connaitre l'etat de votre expedition</p>
                </div>
                
                <form id="track-form" class="track-form">
                    <div class="track-input-wrapper">
                        <svg class="track-input-icon" viewBox="0 0 24 24">
                            <use href="assets/icons/icons.svg#package"></use>
                        </svg>
                        <input type="text" id="tracking-number" class="form-input track-input" 
                               placeholder="Ex: TB202401150001, 1688-xxx..." required>
                        <button type="submit" class="btn btn-primary track-btn" id="btn-track">
                            Rechercher
                        </button>
                    </div>
                    <p class="track-hint">Le numero de suivi se trouve sur votre recu ou dans l'email de confirmation</p>
                </form>
                
                <div id="track-result"></div>
                
                <div class="track-help">
                    <h3 class="track-help-title">Comment ca marche ?</h3>
                    <div class="track-steps">
                        <div class="track-step">
                            <div class="track-step-number">1</div>
                            <div class="track-step-content">
                                <h4>Entrez votre numero</h4>
                                <p>Saisissez le numero de suivi fourni lors de l'enregistrement de votre colis</p>
                            </div>
                        </div>
                        <div class="track-step">
                            <div class="track-step-number">2</div>
                            <div class="track-step-content">
                                <h4>Consultez le statut</h4>
                                <p>Visualisez en temps reel ou se trouve votre colis et son historique</p>
                            </div>
                        </div>
                        <div class="track-step">
                            <div class="track-step-number">3</div>
                            <div class="track-step-content">
                                <h4>Recevez les alertes</h4>
                                <p>Activez les notifications pour etre informe a chaque etape</p>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="track-statuses">
                    <h3 class="track-help-title">Les etapes de livraison</h3>
                    <div class="status-list">
                        <div class="status-item">
                            <span class="status-badge status-pending">En attente</span>
                            <span class="status-desc">Colis enregistre, en attente de reception</span>
                        </div>
                        <div class="status-item">
                            <span class="status-badge status-received">Recu</span>
                            <span class="status-desc">Colis receptionne a l'entrepot</span>
                        </div>
                        <div class="status-item">
                            <span class="status-badge status-in_transit">En transit</span>
                            <span class="status-desc">En route vers la destination</span>
                        </div>
                        <div class="status-item">
                            <span class="status-badge status-arrived_port">Arrive au port</span>
                            <span class="status-desc">Arrive au port de destination</span>
                        </div>
                        <div class="status-item">
                            <span class="status-badge status-customs">Dedouanement</span>
                            <span class="status-desc">En cours de dedouanement</span>
                        </div>
                        <div class="status-item">
                            <span class="status-badge status-out_for_delivery">En livraison</span>
                            <span class="status-desc">En cours de livraison finale</span>
                        </div>
                        <div class="status-item">
                            <span class="status-badge status-delivered">Livre</span>
                            <span class="status-desc">Colis livre au destinataire</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        this.attachEvents();
    },
    
    attachEvents() {
        document.getElementById('track-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleTrack();
        });
    },
    
    async handleTrack() {
        const trackingNumber = document.getElementById('tracking-number').value.trim();
        const resultContainer = document.getElementById('track-result');
        const btn = document.getElementById('btn-track');
        
        if (!trackingNumber) return;
        
        btn.disabled = true;
        resultContainer.innerHTML = Loader.page('Recherche en cours...');
        
        try {
            const data = await API.packages.track(trackingNumber);
            const pkg = data.package;
            
            const status = CONFIG.PACKAGE_STATUSES[pkg.status] || { label: pkg.status };
            
            resultContainer.innerHTML = `
                <div class="track-result-card animate-slide-up">
                    <div class="result-header">
                        <div>
                            <span class="result-tracking">${pkg.supplier_tracking || pkg.tracking_number}</span>
                            <span class="status-badge status-${pkg.status}">${status.label}</span>
                        </div>
                    </div>
                    
                    <p class="result-description">${pkg.description}</p>
                    
                    <!-- Tracking Progress Visual -->
                    <div class="result-tracking-progress">
                        <tracking-progress 
                            status="${pkg.status}" 
                            transport="${pkg.transport_mode || 'air'}"
                            compact>
                        </tracking-progress>
                    </div>
                    
                    <div class="result-route">
                        <div class="route-point">
                            <div class="route-dot route-dot-origin"></div>
                            <div class="route-info">
                                <span class="route-label">Origine</span>
                                <span class="route-value">${pkg.origin?.city || 'N/A'}, ${pkg.origin?.country || ''}</span>
                            </div>
                        </div>
                        <div class="route-line"></div>
                        <div class="route-point">
                            <div class="route-dot route-dot-destination"></div>
                            <div class="route-info">
                                <span class="route-label">Destination</span>
                                <span class="route-value">${pkg.destination?.city || 'N/A'}, ${pkg.destination?.country || ''}</span>
                            </div>
                        </div>
                    </div>
                    
                    ${pkg.estimated_delivery ? `
                        <div class="result-eta">
                            <svg class="icon" viewBox="0 0 24 24">
                                <use href="assets/icons/icons.svg#calendar"></use>
                            </svg>
                            <span>Livraison estimee: <strong>${new Date(pkg.estimated_delivery).toLocaleDateString('fr-FR')}</strong></span>
                        </div>
                    ` : ''}
                    
                    <div class="result-timeline">
                        <h4 class="timeline-title">Historique</h4>
                        ${this.renderTimeline(pkg.history || [])}
                    </div>
                    
                    <a href="#/packages/${pkg.id}" class="btn btn-primary btn-block">
                        Voir les details
                    </a>
                </div>
            `;
        } catch (error) {
            resultContainer.innerHTML = `
                <div class="track-not-found animate-slide-up">
                    <svg class="empty-state-icon" viewBox="0 0 24 24">
                        <use href="assets/icons/icons.svg#package"></use>
                    </svg>
                    <h3>Colis introuvable</h3>
                    <p>${error.message || 'Verifiez le numero de suivi et reessayez'}</p>
                </div>
            `;
        } finally {
            btn.disabled = false;
        }
    },
    
    renderTimeline(history) {
        if (history.length === 0) {
            return '<p class="text-muted text-sm">Aucun historique disponible</p>';
        }
        
        return `
            <div class="timeline">
                ${history.slice(0, 5).map((h, i) => {
                    const status = CONFIG.PACKAGE_STATUSES[h.status] || { label: h.status };
                    return `
                        <div class="timeline-item ${i === 0 ? 'active' : 'completed'}">
                            <div class="timeline-dot"></div>
                            <div class="timeline-content">
                                <div class="timeline-title">${status.label}</div>
                                <div class="timeline-date">${new Date(h.created_at).toLocaleString('fr-FR')}</div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }
};
