/**
 * Tracking Progress Component
 * ============================
 * 
 * Affiche une timeline visuelle du parcours d'un colis
 * avec les étapes qui s'allument progressivement.
 * 
 * Usage:
 *   <tracking-progress status="in_transit" transport="air"></tracking-progress>
 */

// Définition des étapes par mode de transport
const TRACKING_STEPS = {
    // Transport aérien
    air: [
        { id: 'pending', label: 'Enregistré', icon: 'clipboard-list', description: 'Colis enregistré' },
        { id: 'received', label: 'Reçu', icon: 'warehouse', description: 'Reçu en entrepôt Chine' },
        { id: 'in_transit', label: 'En vol', icon: 'plane', description: 'En transit aérien' },
        { id: 'arrived_port', label: 'Arrivé', icon: 'map-pin', description: 'Arrivé à destination' },
        { id: 'customs', label: 'Douane', icon: 'shield-check', description: 'En cours de dédouanement' },
        { id: 'out_for_delivery', label: 'Livraison', icon: 'truck', description: 'En cours de livraison' },
        { id: 'delivered', label: 'Livré', icon: 'check-circle', description: 'Colis livré' }
    ],
    // Transport maritime
    sea: [
        { id: 'pending', label: 'Enregistré', icon: 'clipboard-list', description: 'Colis enregistré' },
        { id: 'received', label: 'Reçu', icon: 'warehouse', description: 'Reçu en entrepôt Chine' },
        { id: 'in_transit', label: 'En mer', icon: 'ship', description: 'En transit maritime' },
        { id: 'arrived_port', label: 'Au port', icon: 'anchor', description: 'Arrivé au port' },
        { id: 'customs', label: 'Douane', icon: 'shield-check', description: 'En cours de dédouanement' },
        { id: 'out_for_delivery', label: 'Livraison', icon: 'truck', description: 'En cours de livraison' },
        { id: 'delivered', label: 'Livré', icon: 'check-circle', description: 'Colis livré' }
    ]
};

// Icônes SVG
const TRACKING_ICONS = {
    'clipboard-list': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><path d="M12 11h4"></path><path d="M12 16h4"></path><path d="M8 11h.01"></path><path d="M8 16h.01"></path></svg>`,
    'warehouse': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z"></path><path d="M6 18h12"></path><path d="M6 14h12"></path><rect x="6" y="10" width="12" height="12"></rect></svg>`,
    'plane': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"></path></svg>`,
    'ship': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1 .6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"></path><path d="M19.38 20A11.6 11.6 0 0 0 21 14l-9-4-9 4c0 2.9.94 5.34 2.81 7.76"></path><path d="M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6"></path><path d="M12 10v4"></path><path d="M12 2v3"></path></svg>`,
    'map-pin': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path><circle cx="12" cy="10" r="3"></circle></svg>`,
    'anchor': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="3"></circle><line x1="12" y1="22" x2="12" y2="8"></line><path d="M5 12H2a10 10 0 0 0 20 0h-3"></path></svg>`,
    'shield-check': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><path d="m9 12 2 2 4-4"></path></svg>`,
    'truck': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 18H3c-.6 0-1-.4-1-1V7c0-.6.4-1 1-1h10c.6 0 1 .4 1 1v11"></path><path d="M14 9h4l4 4v4c0 .6-.4 1-1 1h-2"></path><circle cx="7" cy="18" r="2"></circle><path d="M15 18H9"></path><circle cx="17" cy="18" r="2"></circle></svg>`,
    'check-circle': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`
};

class TrackingProgress extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    static get observedAttributes() {
        return ['status', 'transport', 'compact', 'show-dates'];
    }

    connectedCallback() {
        this.render();
    }

    attributeChangedCallback() {
        this.render();
    }

    get status() {
        return this.getAttribute('status') || 'pending';
    }

    get transport() {
        const mode = this.getAttribute('transport') || 'air';
        return mode.includes('sea') ? 'sea' : 'air';
    }

    get compact() {
        return this.hasAttribute('compact');
    }

    get showDates() {
        return this.hasAttribute('show-dates');
    }

    get steps() {
        return TRACKING_STEPS[this.transport] || TRACKING_STEPS.air;
    }

    getCurrentStepIndex() {
        const index = this.steps.findIndex(step => step.id === this.status);
        return index >= 0 ? index : 0;
    }

    render() {
        const currentIndex = this.getCurrentStepIndex();
        const isException = this.status === 'exception';

        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: block;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                }

                .tracking-container {
                    padding: 1rem;
                }

                .tracking-steps {
                    display: flex;
                    justify-content: space-between;
                    position: relative;
                }

                .tracking-steps::before {
                    content: '';
                    position: absolute;
                    top: 20px;
                    left: 24px;
                    right: 24px;
                    height: 3px;
                    background: #e5e7eb;
                    z-index: 0;
                }

                .progress-line {
                    position: absolute;
                    top: 20px;
                    left: 24px;
                    height: 3px;
                    background: linear-gradient(90deg, #10b981, #059669);
                    z-index: 1;
                    transition: width 0.5s ease;
                    border-radius: 2px;
                }

                .step {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    position: relative;
                    z-index: 2;
                    flex: 1;
                    max-width: 100px;
                }

                .step-icon {
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: #f3f4f6;
                    border: 3px solid #e5e7eb;
                    color: #9ca3af;
                    transition: all 0.3s ease;
                }

                .step-icon svg {
                    width: 20px;
                    height: 20px;
                }

                .step.completed .step-icon {
                    background: #10b981;
                    border-color: #10b981;
                    color: white;
                }

                .step.current .step-icon {
                    background: #3b82f6;
                    border-color: #3b82f6;
                    color: white;
                    animation: pulse 2s infinite;
                }

                .step.exception .step-icon {
                    background: #ef4444;
                    border-color: #ef4444;
                    color: white;
                }

                @keyframes pulse {
                    0%, 100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4); }
                    50% { box-shadow: 0 0 0 10px rgba(59, 130, 246, 0); }
                }

                .step-label {
                    margin-top: 0.5rem;
                    font-size: 0.75rem;
                    font-weight: 500;
                    color: #6b7280;
                    text-align: center;
                    transition: color 0.3s ease;
                }

                .step.completed .step-label,
                .step.current .step-label {
                    color: #111827;
                    font-weight: 600;
                }

                .step-date {
                    font-size: 0.65rem;
                    color: #9ca3af;
                    margin-top: 0.25rem;
                }

                :host([compact]) .tracking-steps {
                    flex-wrap: nowrap;
                    overflow-x: auto;
                    padding-bottom: 0.5rem;
                }

                :host([compact]) .step {
                    min-width: 60px;
                }

                :host([compact]) .step-icon {
                    width: 32px;
                    height: 32px;
                }

                :host([compact]) .step-icon svg {
                    width: 16px;
                    height: 16px;
                }

                :host([compact]) .step-label {
                    font-size: 0.65rem;
                }

                :host([compact]) .tracking-steps::before,
                :host([compact]) .progress-line {
                    top: 16px;
                }

                @media (max-width: 640px) {
                    .tracking-steps {
                        flex-direction: column;
                        align-items: flex-start;
                    }

                    .tracking-steps::before {
                        top: 20px;
                        left: 19px;
                        right: auto;
                        width: 3px;
                        height: calc(100% - 40px);
                    }

                    .progress-line {
                        top: 20px;
                        left: 19px;
                        width: 3px !important;
                        height: var(--progress-height, 0);
                    }

                    .step {
                        flex-direction: row;
                        max-width: none;
                        width: 100%;
                        padding: 0.5rem 0;
                    }

                    .step-content {
                        margin-left: 1rem;
                        text-align: left;
                    }

                    .step-label {
                        margin-top: 0;
                    }

                    .step-description {
                        font-size: 0.75rem;
                        color: #6b7280;
                    }
                }

                .status-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.5rem;
                    padding: 0.5rem 1rem;
                    border-radius: 9999px;
                    font-size: 0.875rem;
                    font-weight: 500;
                    margin-bottom: 1rem;
                }

                .status-badge.in_transit {
                    background: #dbeafe;
                    color: #1d4ed8;
                }

                .status-badge.delivered {
                    background: #d1fae5;
                    color: #047857;
                }

                .status-badge.pending {
                    background: #fef3c7;
                    color: #b45309;
                }

                .status-badge.exception {
                    background: #fee2e2;
                    color: #dc2626;
                }
            </style>

            <div class="tracking-container">
                ${this._renderStatusBadge(isException)}
                <div class="tracking-steps">
                    <div class="progress-line" style="width: ${this._calculateProgress(currentIndex)}"></div>
                    ${this.steps.map((step, index) => this._renderStep(step, index, currentIndex, isException)).join('')}
                </div>
            </div>
        `;
    }

    _renderStatusBadge(isException) {
        const statusLabels = {
            pending: 'En attente',
            received: 'Reçu en entrepôt',
            in_transit: 'En transit',
            arrived_port: 'Arrivé à destination',
            customs: 'En douane',
            out_for_delivery: 'En livraison',
            delivered: 'Livré',
            exception: 'Problème de livraison'
        };

        const label = statusLabels[this.status] || this.status;
        const statusClass = isException ? 'exception' : this.status;

        return `
            <div class="status-badge ${statusClass}">
                ${TRACKING_ICONS[isException ? 'shield-check' : this.steps[this.getCurrentStepIndex()]?.icon] || ''}
                <span>${label}</span>
            </div>
        `;
    }

    _renderStep(step, index, currentIndex, isException) {
        let stepClass = '';
        if (isException && index === currentIndex) {
            stepClass = 'exception';
        } else if (index < currentIndex) {
            stepClass = 'completed';
        } else if (index === currentIndex) {
            stepClass = 'current';
        }

        const icon = TRACKING_ICONS[step.icon] || '';

        return `
            <div class="step ${stepClass}">
                <div class="step-icon">${icon}</div>
                <div class="step-content">
                    <div class="step-label">${step.label}</div>
                    ${this.showDates ? `<div class="step-date">${this._getStepDate(step.id)}</div>` : ''}
                    <div class="step-description">${step.description}</div>
                </div>
            </div>
        `;
    }

    _calculateProgress(currentIndex) {
        if (currentIndex === 0) return '0%';
        const totalSteps = this.steps.length - 1;
        const progress = (currentIndex / totalSteps) * 100;
        const stepWidth = 100 / totalSteps;
        return `calc(${progress}% - ${stepWidth / 2}%)`;
    }

    _getStepDate(stepId) {
        const dates = this.getAttribute('data-dates');
        if (dates) {
            try {
                const datesObj = JSON.parse(dates);
                return datesObj[stepId] || '';
            } catch {
                return '';
            }
        }
        return '';
    }

    updateStatus(newStatus) {
        this.setAttribute('status', newStatus);
    }

    setDates(dates) {
        this.setAttribute('data-dates', JSON.stringify(dates));
        this.setAttribute('show-dates', '');
        this.render();
    }
}

// Enregistrer le composant
customElements.define('tracking-progress', TrackingProgress);

// Export pour utilisation globale
if (typeof window !== 'undefined') {
    window.TrackingProgress = TrackingProgress;
}
