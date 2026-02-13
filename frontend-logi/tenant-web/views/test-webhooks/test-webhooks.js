/**
 * Test Webhooks View
 * Interface pour simuler les webhooks des transporteurs
 */

Views.testWebhooks = {
    carrier: 'dhl',
    status: 'in_transit',
    logs: [],
    
    carriers: {
        dhl: { name: 'DHL', logo: '📦', color: '#FFCC00' },
        fedex: { name: 'FedEx', logo: '📮', color: '#4D148C' },
        ethiopian: { name: 'Ethiopian', logo: '✈️', color: '#006B3F' }
    },
    
    statuses: [
        { id: 'pending', label: 'En attente', dot: 'pending' },
        { id: 'in_transit', label: 'En transit', dot: 'in_transit' },
        { id: 'arrived_port', label: 'Arrivé', dot: 'arrived_port' },
        { id: 'out_for_delivery', label: 'En livraison', dot: 'out_for_delivery' },
        { id: 'delivered', label: 'Livré', dot: 'delivered' },
        { id: 'exception', label: 'Exception', dot: 'exception' }
    ],
    
    async render() {
        const container = document.getElementById('main-content');
        const headerTitle = document.getElementById('header-title');
        if (headerTitle) headerTitle.textContent = 'Test Webhooks';
        
        container.innerHTML = `
            <div class="test-webhooks">
                <div class="page-header">
                    <h1 class="page-title">Simulateur de Webhooks</h1>
                    <p class="page-subtitle">Testez le flux de tracking en simulant les webhooks des transporteurs</p>
                </div>
                
                <div class="info-box">
                    <strong>💡 Comment ça marche ?</strong>
                    1. Sélectionnez un transporteur<br>
                    2. Entrez le numéro de tracking d'un départ existant<br>
                    3. Choisissez un statut et une localisation<br>
                    4. Envoyez le webhook pour voir la mise à jour en temps réel
                </div>
                
                <div class="test-grid">
                    <!-- Simulateur -->
                    <div class="simulator-card">
                        <h3>
                            <svg class="icon" viewBox="0 0 24 24"><use href="#send"></use></svg>
                            Envoyer un webhook
                        </h3>
                        
                        <!-- Carrier Selector -->
                        <div class="carrier-selector">
                            ${Object.entries(this.carriers).map(([id, c]) => `
                                <button class="carrier-btn ${this.carrier === id ? 'active' : ''}" data-carrier="${id}">
                                    <div class="carrier-logo">${c.logo}</div>
                                    <div class="carrier-name">${c.name}</div>
                                </button>
                            `).join('')}
                        </div>
                        
                        <!-- Status Selector -->
                        <label class="form-label">Statut</label>
                        <div class="status-grid">
                            ${this.statuses.map(s => `
                                <button class="status-btn ${this.status === s.id ? 'active' : ''}" data-status="${s.id}">
                                    <span class="status-dot ${s.dot}"></span>
                                    ${s.label}
                                </button>
                            `).join('')}
                        </div>
                        
                        <!-- Form -->
                        <div class="simulator-form">
                            <div class="form-group">
                                <label class="form-label">Numéro de tracking</label>
                                <input type="text" id="webhook-tracking" class="form-input" 
                                       placeholder="Ex: DHL123456789" value="">
                            </div>
                            
                            <div class="form-group">
                                <label class="form-label">Localisation</label>
                                <input type="text" id="webhook-location" class="form-input" 
                                       placeholder="Ex: Dubai, UAE" value="Dubai, UAE">
                            </div>
                            
                            <div class="form-group">
                                <label class="form-label">Notes (optionnel)</label>
                                <input type="text" id="webhook-notes" class="form-input" 
                                       placeholder="Ex: Colis en cours de traitement">
                            </div>
                            
                            <button class="btn-send-webhook" id="btn-send-webhook">
                                <svg class="icon" viewBox="0 0 24 24"><use href="#send"></use></svg>
                                Envoyer le webhook
                            </button>
                        </div>
                    </div>
                    
                    <!-- Log -->
                    <div class="log-card">
                        <h3>
                            <span style="display: flex; align-items: center; gap: 8px;">
                                <svg class="icon" viewBox="0 0 24 24"><use href="#list"></use></svg>
                                Historique des tests
                            </span>
                            <button class="btn-clear-log" id="btn-clear-log">Effacer</button>
                        </h3>
                        
                        <div class="log-list" id="log-list">
                            ${this.renderLogs()}
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        this.bindEvents();
    },
    
    renderLogs() {
        if (this.logs.length === 0) {
            return '<div class="log-empty">Aucun webhook envoyé</div>';
        }
        
        return this.logs.map(log => `
            <div class="log-item ${log.success ? 'success' : 'error'}">
                <div class="log-item-header">
                    <span class="log-item-carrier">
                        ${this.carriers[log.carrier]?.logo || '📦'} ${this.carriers[log.carrier]?.name || log.carrier}
                    </span>
                    <span class="log-item-time">${log.time}</span>
                </div>
                <div class="log-item-body">
                    <span class="log-item-tracking">${log.tracking}</span>
                    → ${log.status} @ ${log.location}
                </div>
                <div class="log-item-result">
                    ${log.success 
                        ? `✅ ${log.result.updated_packages || 0} colis mis à jour, ${log.result.notified_clients || 0} clients notifiés`
                        : `❌ ${log.error}`
                    }
                </div>
            </div>
        `).join('');
    },
    
    bindEvents() {
        // Carrier selection
        document.querySelectorAll('.carrier-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.carrier = btn.dataset.carrier;
                document.querySelectorAll('.carrier-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
        
        // Status selection
        document.querySelectorAll('.status-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.status = btn.dataset.status;
                document.querySelectorAll('.status-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
        
        // Send webhook
        document.getElementById('btn-send-webhook')?.addEventListener('click', () => this.sendWebhook());
        
        // Clear log
        document.getElementById('btn-clear-log')?.addEventListener('click', () => {
            this.logs = [];
            document.getElementById('log-list').innerHTML = this.renderLogs();
        });
    },
    
    async sendWebhook() {
        const tracking = document.getElementById('webhook-tracking')?.value?.trim();
        const location = document.getElementById('webhook-location')?.value?.trim();
        const notes = document.getElementById('webhook-notes')?.value?.trim();
        
        if (!tracking) {
            Toast.error('Veuillez entrer un numéro de tracking');
            return;
        }
        
        const btn = document.getElementById('btn-send-webhook');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Envoi...';
        
        const log = {
            carrier: this.carrier,
            tracking,
            status: this.status,
            location: location || 'Unknown',
            time: new Date().toLocaleTimeString('fr-FR'),
            success: false,
            result: null,
            error: null
        };
        
        try {
            // Appel au endpoint de test webhook
            const result = await this.callTestWebhook({
                carrier: this.carrier,
                tracking_number: tracking,
                status: this.status,
                location: location,
                notes: notes
            });
            
            log.success = true;
            log.result = result;
            
            Toast.success(`Webhook envoyé! ${result.updated_packages || 0} colis mis à jour`);
            
        } catch (error) {
            log.error = error.message || 'Erreur inconnue';
            Toast.error(log.error);
        }
        
        // Add to logs (newest first)
        this.logs.unshift(log);
        if (this.logs.length > 20) this.logs.pop();
        
        document.getElementById('log-list').innerHTML = this.renderLogs();
        
        btn.disabled = false;
        btn.innerHTML = `
            <svg class="icon" viewBox="0 0 24 24"><use href="#send"></use></svg>
            Envoyer le webhook
        `;
    },
    
    async callTestWebhook(data) {
        // Utilise l'endpoint de test interne
        return API.request(`/webhooks/${CONFIG.TENANT_SLUG}/simulate`, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }
};
