/**
 * Subscription View
 */

const SubscriptionView = {
    render() {
        // Mettre à jour la navigation
        Router.updateNav('subscription');
        Router.updateTitle('Mon Abonnement');

        const container = document.getElementById('main-content');
        container.innerHTML = `
            <div class="subscription-container">
                <div class="page-header">
                    <h1 class="page-title">Mon Abonnement</h1>
                    <p class="text-muted">Gérez votre offre et vos renouvellements</p>
                </div>
                
                <div id="subscription-content">
                    <div class="loading-state">
                        <div class="spinner"></div>
                        <p>Chargement des informations...</p>
                    </div>
                </div>
            </div>
        `;

        this.loadSubscriptionData();
        this.loadAddons();

        // Inject styles if not present
        if (!document.getElementById('subscription-addons-css')) {
            const link = document.createElement('link');
            link.id = 'subscription-addons-css';
            link.rel = 'stylesheet';
            link.href = 'views/subscription/subscription_addons.css';
            document.head.appendChild(link);
        }
    },

    async loadSubscriptionData() {
        try {
            // 1. Récupérer les infos d'abonnement depuis backend-logi
            const response = await API.request('/subscription');
            const subscription = (response.data && response.data.subscription) || response.subscription || {};

            this.renderContent(subscription);
        } catch (error) {
            console.error('Erreur chargement abonnement:', error);
            document.getElementById('subscription-content').innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon text-danger">⚠️</div>
                    <h3>Erreur de chargement</h3>
                    <p>${error.message || "Impossible de récupérer les informations d'abonnement."}</p>
                    <button class="btn btn-primary mt-md" onclick="SubscriptionView.render()">Réessayer</button>
                </div>
            `;
        }
    },

    renderContent(sub) {
        const container = document.getElementById('subscription-content');
        const planName = sub.plan ? (sub.plan.name || sub.plan.toUpperCase()) : 'Inconnu';
        const statusLabel = this.getStatusLabel(sub.status);
        const daysRemaining = sub.days_remaining !== undefined ? sub.days_remaining : '-';
        const endDate = sub.end_date ? new Date(sub.end_date).toLocaleDateString() : '-';

        // Limites (features)
        const featuresHtml = (sub.features || []).map(f => `
            <li class="limit-item">
                <span class="limit-label">${f}</span>
                <span class="limit-value text-success">✓</span>
            </li>
        `).join('');

        // Plan add-ons (included with the plan)
        const planAddonsHtml = (sub.plan_add_ons || []).map(addon => `
            <li class="limit-item">
                <span class="limit-label">📦 ${addon.name || addon.code}${addon.quantity > 1 ? ` x${addon.quantity}` : ''}</span>
                <span class="limit-value text-success">✓</span>
            </li>
        `).join('');

        // Renewal URL generation (Direct request construction)
        // On construit l'order via Billing Service Public API
        // Mais pour simplifier, on utilisera un bouton qui déclenche createOrder()

        container.innerHTML = `
            <div class="subscription-grid">
                <!-- Status Card -->
                <div class="subscription-card text-center">
                    <h3 class="card-title justify-center">Statut Actuel</h3>
                    <div class="plan-info">
                        <div class="plan-name">${planName}</div>
                        <span class="plan-status status-${sub.status}">${statusLabel}</span>
                    </div>
                    
                    <div class="time-remaining">
                        <div class="days-remaining">${daysRemaining}</div>
                        <div class="days-label">Jours Restants</div>
                    </div>
                    
                    <p class="text-muted mt-md">Expire le : <strong>${endDate}</strong></p>
                    
                    <div class="actions-row">
                        <button class="btn-renew" onclick="SubscriptionView.startRenewal()">
                            <svg class="icon" style="width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2"><use href="#refresh-cw"></use></svg>
                            Renouveler maintenant
                        </button>
                    </div>
                </div>
                
                <!-- Limits / Details Card -->
                <div class="subscription-card">
                    <h3 class="card-title">
                        <svg class="icon"><use href="#list"></use></svg>
                        Fonctionnalités incluses
                    </h3>
                    <ul class="limits-list">
                        ${featuresHtml || ''}
                        ${planAddonsHtml || ''}
                        ${!featuresHtml && !planAddonsHtml ? '<li class="text-muted">Aucune fonctionnalité listée</li>' : ''}
                    </ul>
                </div>
            </div>
            
            </div>

            <!-- Add-ons Section -->
            <div class="subscription-card">
                <h3 class="card-title">
                    <svg class="icon" style="width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2"><use href="#plus-circle"></use></svg>
                    Offres Complémentaires
                </h3>
                <div id="addons-container" class="addons-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 1rem; margin-top: 1rem;">
                    <!-- Add-ons will be rendered here -->
                    <div class="text-muted">Chargement des offres...</div>
                </div>
            </div>
            
            <!-- History Section -->
            <div class="subscription-card">
                <h3 class="card-title">Historique</h3>
                <div class="table-responsive">
                    <table class="history-table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Action</th>
                                <th>Détails</th>
                            </tr>
                        </thead>
                        <tbody id="history-tbody">
                            <tr><td colspan="3" class="text-center text-muted">Chargement de l'historique...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        this.loadHistory();
    },

    async loadHistory() {
        try {
            const response = await API.request('/subscription/history');
            const history = (response.data && response.data.history) || response.history || [];
            const tbody = document.getElementById('history-tbody');

            if (history.length === 0) {
                tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">Aucun historique disponible</td></tr>';
                return;
            }

            tbody.innerHTML = history.map(h => `
                <tr>
                    <td>${new Date(h.created_at).toLocaleDateString()} ${new Date(h.created_at).toLocaleTimeString()}</td>
                    <td>${h.action}</td>
                    <td>${this.formatDetails(h.details)}</td>
                </tr>
            `).join('');

        } catch (e) {
            console.error('History error', e);
            document.getElementById('history-tbody').innerHTML = '<tr><td colspan="3" class="text-danger">Erreur chargement historique</td></tr>';
        }
    },

    async loadAddons() {
        try {
            const billingUrl = window.CONFIG?.BILLING_API_URL || 'http://localhost:5002/api/public';
            const response = await fetch(`${billingUrl}/plans/add-ons`);
            const data = await response.json();

            this.renderAddons(data.add_ons || []);

        } catch (e) {
            console.error('Addons load error', e);
            document.getElementById('addons-container').innerHTML = '<div class="text-muted">Aucune offre disponible pour le moment</div>';
        }
    },

    renderAddons(addons) {
        const container = document.getElementById('addons-container');
        if (!addons || addons.length === 0) {
            container.innerHTML = '<div class="text-muted">Aucune offre disponible pour le moment</div>';
            return;
        }

        container.innerHTML = addons.map(addon => `
            <div class="addon-card">
                <div class="addon-header">
                    <h4 class="addon-title">${addon.name}</h4>
                    <span class="addon-price">${this.formatCurrency(addon.price, addon.currency)}</span>
                </div>
                <p class="addon-desc">${addon.description}</p>
                <button class="btn-buy-addon" onclick="SubscriptionView.buyAddon('${addon.code}', '${addon.name}', ${addon.price}, '${addon.currency}')">
                    Acheter
                </button>
            </div>
        `).join('');
    },

    async buyAddon(addonCode, addonName, price, currency) {
        // Confirmation via Custom Modal
        const confirmed = await this.showConfirmModal(
            'Confirmation d\'achat',
            `Voulez-vous acheter l'option <strong>${addonName}</strong> pour <strong>${this.formatCurrency(price, currency)}</strong> ?`
        );

        if (!confirmed) return;

        const user = Store.getUser();
        if (!user || !user.tenant_id) {
            Toast.error("Impossible d'identifier le compte.");
            return;
        }

        try {
            const billingUrl = window.CONFIG?.BILLING_API_URL || 'http://localhost:5002/api/public';
            const response = await fetch(`${billingUrl}/orders`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    product: 'logi',
                    target_id: user.tenant_id,
                    order_type: 'addon',
                    add_ons: [{ code: addonCode, quantity: 1 }],
                    currency: currency || 'XAF'
                })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Erreur lors de la commande');

            const checkoutBase = billingUrl.replace('/api/public', '');
            window.location.href = `${checkoutBase}/checkout?order_id=${data.order_id}`;

        } catch (error) {
            console.error(error);
            Toast.error("Erreur lors de la commande: " + error.message);
        }
    },

    showConfirmModal(title, message) {
        return new Promise((resolve) => {
            // Remove existing modal if any
            const existing = document.getElementById('custom-modal-overlay');
            if (existing) existing.remove();

            const overlay = document.createElement('div');
            overlay.id = 'custom-modal-overlay';
            overlay.className = 'custom-modal-overlay';

            overlay.innerHTML = `
                <div class="custom-modal">
                    <div class="modal-header">
                        <div class="modal-title">
                            <svg class="icon" style="width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:2"><use href="#info"></use></svg>
                            ${title}
                        </div>
                    </div>
                    <div class="modal-body">
                        ${message}
                    </div>
                    <div class="modal-actions">
                        <button class="btn-modal btn-cancel" id="modal-cancel-btn">Annuler</button>
                        <button class="btn-modal btn-confirm" id="modal-confirm-btn">Confirmer</button>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);

            // Trigger animation
            setTimeout(() => overlay.classList.add('active'), 10);

            const close = (result) => {
                overlay.classList.remove('active');
                setTimeout(() => {
                    overlay.remove();
                    resolve(result);
                }, 300);
            };

            overlay.querySelector('#modal-cancel-btn').onclick = () => close(false);
            overlay.querySelector('#modal-confirm-btn').onclick = () => close(true);
            overlay.onclick = (e) => {
                if (e.target === overlay) close(false);
            };
        });
    },



    formatCurrency(amount, currency = 'XAF') {
        return new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 0
        }).format(amount);
    },

    formatDetails(details) {
        if (!details) return '-';

        // Handle stringified JSON
        if (typeof details === 'string') {
            try {
                details = JSON.parse(details);
            } catch (e) {
                return details;
            }
        }

        // Handle object
        if (typeof details === 'object') {
            const parts = [];

            if (details.amount_paid) {
                parts.push(`${details.amount_paid.toLocaleString()} ${details.currency || ''}`);
            }

            if (details.duration_days) {
                parts.push(`${details.duration_days} jours`);
            }

            if (details.billing_order_id) {
                parts.push(`Ref: ${details.billing_order_id}`);
            }

            if (parts.length > 0) {
                return parts.join(' • ');
            }

            // Fallback to cleaner JSON if specific fields missing
            return Object.entries(details)
                .map(([k, v]) => `${k}: ${v}`)
                .join(', ');
        }

        return details;
    },

    getStatusLabel(status) {
        const map = {
            'active': 'Actif',
            'expired': 'Expiré',
            'trial': 'Essai',
            'cancelled': 'Annulé'
        };
        return map[status] || status;
    },

    async startRenewal() {
        // 1. Get Tenant Info from Store or Backend
        // We know we are 'logi' product and 'tenant_id' is needed.
        // Actually, for public/orders, we need { product: 'logi', target_id: 'tenant_id' }
        // We can get tenant_id from Store.getUser().tenant_id if available, or fetch /subscription returns it?
        // Let's assume Store has it.

        const user = Store.getUser();
        if (!user || !user.tenant_id) {
            Toast.error("Impossible d'identifier le compte (Tenant ID manquant).");
            return;
        }

        const btn = document.querySelector('.btn-renew');
        const oldText = btn.innerHTML;
        btn.innerHTML = 'Initialisation...';
        btn.disabled = true;

        try {
            // 2. Créer une commande de renouvellement via l'API Publique du Billing Service
            // Note: On traverse via le backend-logi qui n'a PAS de proxy vers Billing public.
            // Donc on doit appeler l'URL du Billing Service directement depuis le JS (CORS doit l'autoriser).
            // L'URL du Billing Service doit être dans CONFIG.

            // Si CONFIG.BILLING_API_URL n'existe pas, on présume localhost:5002 pour le dev
            const billingUrl = window.CONFIG?.BILLING_API_URL || 'http://localhost:5002/api/public';

            const response = await fetch(`${billingUrl}/orders`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    product: 'logi',
                    target_id: user.tenant_id,
                    duration_months: 1, // Default to 1 month, user can change later? Or simple flow
                    currency: 'XAF' // Default currency
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Erreur lors de la création de la commande');
            }

            // 3. Rediriger vers le Checkout
            // URL: /checkout?order_id=...
            // Billing Service serves checkout at root /checkout usually? 
            // Wait, checkout.py says route is /checkout. Blueprint registered at /checkout?
            // "checkout_bp = Blueprint('checkout', __name__, url_prefix='/checkout')"
            // So URL is http://localhost:5002/checkout?order_id=...

            const checkoutBase = billingUrl.replace('/api/public', ''); // virer /api/public pour revenir à la racine
            window.location.href = `${checkoutBase}/checkout?order_id=${data.order_id}`;

        } catch (error) {
            console.error(error);
            Toast.error(error.message);
            btn.innerHTML = oldText;
            btn.disabled = false;
        }
    }
};

window.Views = window.Views || {};
window.Views.subscription = SubscriptionView;
console.log('SubscriptionView loaded', window.Views.subscription);
