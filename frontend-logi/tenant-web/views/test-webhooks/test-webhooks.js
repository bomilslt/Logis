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
        { id: 'pending', label: () => I18n.t('testWebhooks.status_pending'), dot: 'pending' },
        { id: 'in_transit', label: () => I18n.t('testWebhooks.status_in_transit'), dot: 'in_transit' },
        { id: 'arrived_port', label: () => I18n.t('testWebhooks.status_arrived'), dot: 'arrived_port' },
        { id: 'out_for_delivery', label: () => I18n.t('testWebhooks.status_out_delivery'), dot: 'out_for_delivery' },
        { id: 'delivered', label: () => I18n.t('testWebhooks.status_delivered'), dot: 'delivered' },
        { id: 'exception', label: () => I18n.t('testWebhooks.status_exception'), dot: 'exception' }
    ],
    
    async render() {
        const container = document.getElementById('main-content');
        const headerTitle = document.getElementById('header-title');
        if (headerTitle) headerTitle.textContent = 'Test Webhooks';
        
        container.innerHTML = `
            <div class="test-webhooks">
                <div class="page-header">
                    <h1 class="page-title">${I18n.t('testWebhooks.title')}</h1>
                    <p class="page-subtitle">${I18n.t('testWebhooks.subtitle')}</p>
                </div>
                
                <div class="info-box">
                    <strong>${I18n.t('testWebhooks.how_it_works')}</strong>
                    ${I18n.t('testWebhooks.step1')}<br>
                    ${I18n.t('testWebhooks.step2')}<br>
                    ${I18n.t('testWebhooks.step3')}<br>
                    ${I18n.t('testWebhooks.step4')}
                </div>
                
                <div class="test-grid">
                    <!-- Simulateur -->
                    <div class="simulator-card">
                        <h3>
                            <svg class="icon" viewBox="0 0 24 24"><use href="#send"></use></svg>
                            ${I18n.t('testWebhooks.send_webhook')}
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
                        <label class="form-label">${I18n.t('testWebhooks.status')}</label>
                        <div class="status-grid">
                            ${this.statuses.map(s => `
                                <button class="status-btn ${this.status === s.id ? 'active' : ''}" data-status="${s.id}">
                                    <span class="status-dot ${s.dot}"></span>
                                    ${typeof s.label === 'function' ? s.label() : s.label}
                                </button>
                            `).join('')}
                        </div>
                        
                        <!-- Form -->
                        <div class="simulator-form">
                            <div class="form-group">
                                <label class="form-label">${I18n.t('testWebhooks.tracking_number')}</label>
                                <input type="text" id="webhook-tracking" class="form-input" 
                                       placeholder="${I18n.t('testWebhooks.tracking_placeholder')}" value="">
                            </div>
                            
                            <div class="form-group">
                                <label class="form-label">${I18n.t('testWebhooks.location')}</label>
                                <input type="text" id="webhook-location" class="form-input" 
                                       placeholder="${I18n.t('testWebhooks.location_placeholder')}" value="Dubai, UAE">
                            </div>
                            
                            <div class="form-group">
                                <label class="form-label">${I18n.t('testWebhooks.notes_optional')}</label>
                                <input type="text" id="webhook-notes" class="form-input" 
                                       placeholder="${I18n.t('testWebhooks.notes_placeholder')}">
                            </div>
                            
                            <button class="btn-send-webhook" id="btn-send-webhook">
                                <svg class="icon" viewBox="0 0 24 24"><use href="#send"></use></svg>
                                ${I18n.t('testWebhooks.send')}
                            </button>
                        </div>
                    </div>
                    
                    <!-- Log -->
                    <div class="log-card">
                        <h3>
                            <span style="display: flex; align-items: center; gap: 8px;">
                                <svg class="icon" viewBox="0 0 24 24"><use href="#list"></use></svg>
                                ${I18n.t('testWebhooks.history')}
                            </span>
                            <button class="btn-clear-log" id="btn-clear-log">${I18n.t('testWebhooks.clear')}</button>
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
            return `<div class="log-empty">${I18n.t('testWebhooks.no_webhooks')}</div>`;
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
                        ? `✅ ${log.result.updated_packages || 0} ${I18n.t('testWebhooks.packages_updated')}, ${log.result.notified_clients || 0} ${I18n.t('testWebhooks.clients_notified')}`
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
            Toast.error(I18n.t('testWebhooks.enter_tracking'));
            return;
        }
        
        const btn = document.getElementById('btn-send-webhook');
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner"></span> ${I18n.t('testWebhooks.sending')}`;
        
        const log = {
            carrier: this.carrier,
            tracking,
            status: this.status,
            location: location || 'Unknown',
            time: new Date().toLocaleTimeString(I18n.locale === 'fr' ? 'fr-FR' : 'en-US'),
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
            
            Toast.success(`${I18n.t('testWebhooks.webhook_sent')} ${result.updated_packages || 0} ${I18n.t('testWebhooks.packages_updated')}`);
            
        } catch (error) {
            log.error = error.message || I18n.t('testWebhooks.unknown_error');
            Toast.error(log.error);
        }
        
        // Add to logs (newest first)
        this.logs.unshift(log);
        if (this.logs.length > 20) this.logs.pop();
        
        document.getElementById('log-list').innerHTML = this.renderLogs();
        
        btn.disabled = false;
        btn.innerHTML = `
            <svg class="icon" viewBox="0 0 24 24"><use href="#send"></use></svg>
            ${I18n.t('testWebhooks.send')}
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
