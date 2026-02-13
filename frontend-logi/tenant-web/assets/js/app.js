/**
 * App - Point d'entree Admin
 */

const App = {
    clock: null,

    init() {
        this.loadSvgSprite();
        this.initTheme();
        this.initI18n();
        this.initClock();
        Toast.init();
        Modal.init();
        this.registerRoutes();
        Router.init();
        this.setupEventListeners();

        // Démarrer la synchronisation temps réel si connecté
        if (Store.isAuthenticated()) {
            RealtimeService.start();
            // Charger les tarifs depuis l'API
            RatesService.load();
            // Mettre à jour le header avec les infos utilisateur
            this.updateHeaderUser();
        }
    },

    updateHeaderUser() {
        const user = Store.getUser();
        if (user) {
            const nameEl = document.getElementById('header-user-name');
            const roleEl = document.getElementById('header-user-role');
            const avatarEl = document.getElementById('header-user-avatar');

            if (nameEl) {
                nameEl.textContent = user.full_name || user.first_name || user.email || 'Utilisateur';
            }
            if (roleEl) {
                const roleKey = 'roles.' + (user.role || 'staff');
                roleEl.textContent = I18n.t(roleKey, user.role || 'Staff');
            }
            if (avatarEl && user.avatar) {
                const safeUrl = Sanitize?.sanitizeUrl ? Sanitize.sanitizeUrl(user.avatar) : null;
                avatarEl.innerHTML = '';
                if (safeUrl) {
                    const img = document.createElement('img');
                    img.src = safeUrl;
                    img.alt = 'Avatar';
                    img.className = 'header-avatar-img';
                    avatarEl.appendChild(img);
                }
            } else if (avatarEl && user.first_name) {
                // Afficher les initiales
                const initials = (user.first_name[0] || '') + (user.last_name?.[0] || '');
                avatarEl.innerHTML = '';
                const span = document.createElement('span');
                span.className = 'header-avatar-initials';
                span.textContent = initials.toUpperCase();
                avatarEl.appendChild(span);
            }

            // NOUVEAU: Filtrer la navigation selon le rôle
            if (window.ViewFilter) {
                ViewFilter.filterNavigation(user.role);
            }
        }
    },

    initClock() {
        const container = document.getElementById('header-clock-container');
        if (container && typeof Clock !== 'undefined') {
            this.clock = new Clock(container);
        }
    },

    // Charge le sprite SVG et l'injecte dans le DOM pour que <use href="#icon"> fonctionne
    loadSvgSprite() {
        fetch('assets/icons/icons.svg')
            .then(r => r.text())
            .then(svg => {
                const div = document.createElement('div');
                div.style.display = 'none';
                div.innerHTML = svg;
                document.body.insertBefore(div, document.body.firstChild);
            })
            .catch(e => console.warn('SVG sprite load failed:', e));
    },

    initI18n() {
        I18n.register('fr', LANG_FR);
        I18n.register('en', LANG_EN);
        I18n.init();

        // Re-render current view on language change
        I18n.onChange(() => {
            this.updateHeaderUser();
            // Re-render the current view to apply translations
            const hash = location.hash.slice(1) || '/dashboard';
            Router.navigate(hash);
        });
    },

    initTheme() {
        const savedTheme = localStorage.getItem('admin_theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
    },

    registerRoutes() {
        Router.register('/login', () => Views.login.render());
        Router.register('/dashboard', () => Views.dashboard.render());
        Router.register('/packages', () => Views.packages.render());
        Router.register('/packages/:id', (ctx) => Views.packageDetail.render(ctx.params.id));
        Router.register('/clients', () => Views.clients.render());
        Router.register('/clients/:id', (ctx) => Views.clientDetail.render(ctx.params.id));
        Router.register('/pickups-payments', () => Views.pickupsPayments.render());
        Router.register('/reports', () => Views.reports.render());
        Router.register('/announcements', () => Views.announcements.render());
        Router.register('/departures', () => Views.departures.render());
        Router.register('/staff', () => Views.staff.render());
        Router.register('/payroll', () => Views.payroll.render());
        Router.register('/tarifs', () => Views.tarifs.render());
        Router.register('/settings', () => Views.settings.render());
        Router.register('/profile', () => Views.profile.render());
        Router.register('/subscription', () => Views.subscription.render());
        Router.register('/test-webhooks', () => Views.testWebhooks.render());
        Router.register('/guide', () => Views.guide.render());

        // NOUVEAU: Route pour accès refusé
        Router.register('/access-denied', () => {
            // Cette route est utilisée par le router pour les redirections
            // La vue sera affichée directement par le router
        });
    },

    setupEventListeners() {
        // Menu mobile
        document.getElementById('btn-menu')?.addEventListener('click', () => {
            this.toggleSidebar(true);
        });

        document.getElementById('sidebar-close')?.addEventListener('click', () => {
            this.toggleSidebar(false);
        });

        document.getElementById('sidebar-overlay')?.addEventListener('click', () => {
            this.toggleSidebar(false);
        });

        // Init calculator component on header button
        this.initCalculator();

        // Tarif estimator button
        document.getElementById('btn-estimator')?.addEventListener('click', () => {
            this.showTarifEstimator();
        });

        // Language switcher
        document.querySelectorAll('#lang-switcher .lang-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const lang = btn.dataset.lang;
                I18n.setLocale(lang);
                document.querySelectorAll('#lang-switcher .lang-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
        // Set active lang button on init
        const currentLang = I18n.locale;
        document.querySelectorAll('#lang-switcher .lang-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.lang === currentLang);
        });

        // Logout
        document.getElementById('btn-logout')?.addEventListener('click', async () => {
            try {
                await API.auth.logout();
            } finally {
                Store.logout();
                if (window.ViewFilter) ViewFilter.invalidateCache();
                Router.navigate('/login');
            }
        });
    },

    showTarifEstimator() {
        Modal.open({
            title: 'Calculateur de tarifs',
            size: 'md',
            content: `
                <div class="calculator-modal">
                    <div class="form-row">
                        <div class="form-group">
                            <label class="form-label">Origine</label>
                            <div id="calc-origin"></div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Destination</label>
                            <div id="calc-dest"></div>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label class="form-label">Transport</label>
                            <div id="calc-transport"></div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Type de colis</label>
                            <div id="calc-type"></div>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label class="form-label">Poids (kg)</label>
                            <input type="number" id="calc-weight" class="form-input" placeholder="0" step="0.1">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Volume (m³)</label>
                            <input type="number" id="calc-cbm" class="form-input" placeholder="0" step="0.01">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Quantité</label>
                            <input type="number" id="calc-qty" class="form-input" placeholder="1" min="1" value="1">
                        </div>
                    </div>
                    <div class="calc-result" id="calc-result">
                        <p class="text-muted">Remplissez les champs pour calculer</p>
                    </div>
                </div>
            `,
            footer: `<button class="btn btn-secondary" onclick="Modal.close()">Fermer</button>`
        });

        // Utiliser RatesService pour les données réelles
        const origins = RatesService.getOriginItems();
        const dests = RatesService.getDestinationItems();

        let currentOrigin = null;
        let currentDest = null;
        let currentTransport = null;
        let currentType = null;

        // Fonction pour mettre à jour les transports disponibles
        const updateTransports = () => {
            if (currentOrigin && currentDest) {
                const transports = RatesService.getTransportItems(currentOrigin, currentDest);
                if (transports.length > 0) {
                    this._calcTransportSelect?.setItems(transports);
                } else {
                    this._calcTransportSelect?.setItems([{ id: '', name: 'Aucun transport disponible' }]);
                }
            }
        };

        // Fonction pour mettre à jour les types disponibles
        const updateTypes = () => {
            if (currentOrigin && currentDest && currentTransport) {
                const rates = RatesService.getRouteRates(currentOrigin, currentDest);
                if (rates && rates[currentTransport]) {
                    const types = Object.entries(rates[currentTransport])
                        .filter(([k, v]) => k !== 'currency' && typeof v === 'object')
                        .map(([k, v]) => ({ id: k, name: v.label || k }));
                    this._calcTypeSelect?.setItems(types.length > 0 ? types : [{ id: '', name: 'Aucun type' }]);
                }
            }
        };

        this._calcOriginSelect = new SearchSelect({
            container: '#calc-origin',
            placeholder: 'Origine',
            items: origins,
            onSelect: (item) => {
                currentOrigin = item?.id;
                updateTransports();
                this.updateCalcResult();
            }
        });

        this._calcDestSelect = new SearchSelect({
            container: '#calc-dest',
            placeholder: 'Destination',
            items: dests,
            onSelect: (item) => {
                currentDest = item?.id;
                updateTransports();
                this.updateCalcResult();
            }
        });

        this._calcTransportSelect = new SearchSelect({
            container: '#calc-transport',
            placeholder: 'Transport',
            items: [{ id: '', name: 'Sélectionnez origine/destination' }],
            onSelect: (item) => {
                currentTransport = item?.id;
                updateTypes();
                this.updateCalcResult();
            }
        });

        this._calcTypeSelect = new SearchSelect({
            container: '#calc-type',
            placeholder: 'Type',
            items: [{ id: '', name: 'Sélectionnez un transport' }],
            onSelect: (item) => {
                currentType = item?.id;
                this.updateCalcResult();
            }
        });

        // Stocker les sélections pour le calcul
        this._calcState = {
            getOrigin: () => currentOrigin,
            getDest: () => currentDest,
            getTransport: () => currentTransport,
            getType: () => currentType
        };

        document.getElementById('calc-weight')?.addEventListener('input', () => this.updateCalcResult());
        document.getElementById('calc-cbm')?.addEventListener('input', () => this.updateCalcResult());
        document.getElementById('calc-qty')?.addEventListener('input', () => this.updateCalcResult());
    },

    updateCalcResult() {
        const resultEl = document.getElementById('calc-result');
        const weight = parseFloat(document.getElementById('calc-weight')?.value) || 0;
        const cbm = parseFloat(document.getElementById('calc-cbm')?.value) || 0;
        const qty = parseInt(document.getElementById('calc-qty')?.value) || 1;

        const origin = this._calcState?.getOrigin();
        const dest = this._calcState?.getDest();
        const transport = this._calcState?.getTransport();
        const type = this._calcState?.getType();

        if (!origin || !dest || !transport || !type) {
            resultEl.innerHTML = '<p class="text-muted">Sélectionnez tous les paramètres</p>';
            return;
        }

        if (weight <= 0 && cbm <= 0 && qty <= 0) {
            resultEl.innerHTML = '<p class="text-muted">Entrez le poids, le volume ou la quantité</p>';
            return;
        }

        // Récupérer le tarif depuis RatesService
        const rates = RatesService.getRouteRates(origin, dest);
        if (!rates || !rates[transport] || !rates[transport][type]) {
            resultEl.innerHTML = '<p class="text-warning">Tarif non configuré pour cette route</p>';
            return;
        }

        const rateData = rates[transport][type];
        const rate = typeof rateData === 'object' ? rateData.rate : rateData;
        const unit = typeof rateData === 'object' ? rateData.unit : 'kg';
        const currency = rates[transport].currency || 'XAF';

        // Calculer selon l'unité
        let total = 0;
        let detail = '';

        if (unit === 'kg' && weight > 0) {
            total = weight * rate;
            detail = `${weight} kg × ${rate.toLocaleString()} ${currency}/kg`;
        } else if (unit === 'cbm' && cbm > 0) {
            total = cbm * rate;
            detail = `${cbm} m³ × ${rate.toLocaleString()} ${currency}/m³`;
        } else if (unit === 'piece' && qty > 0) {
            total = qty * rate;
            detail = `${qty} pièce(s) × ${rate.toLocaleString()} ${currency}/pièce`;
        } else if (unit === 'fixed') {
            total = rate;
            detail = `Forfait: ${rate.toLocaleString()} ${currency}`;
        } else if (weight > 0) {
            // Fallback au poids
            total = weight * rate;
            detail = `${weight} kg × ${rate.toLocaleString()} ${currency}/kg`;
        }

        if (total <= 0) {
            resultEl.innerHTML = '<p class="text-muted">Entrez une valeur pour calculer</p>';
            return;
        }

        resultEl.innerHTML = `
            <div class="calc-result-content">
                <div class="calc-result-row">
                    <span>Tarif unitaire</span>
                    <span>${rate.toLocaleString()} ${currency}/${unit === 'fixed' ? 'forfait' : unit}</span>
                </div>
                <div class="calc-result-row">
                    <span>Calcul</span>
                    <span>${detail}</span>
                </div>
                <div class="calc-result-total">
                    <span>Total estimé</span>
                    <span class="text-primary font-semibold">${Math.round(total).toLocaleString()} ${currency}</span>
                </div>
            </div>
        `;
    },

    toggleSidebar(open) {
        document.getElementById('sidebar')?.classList.toggle('open', open);
        document.getElementById('sidebar-overlay')?.classList.toggle('visible', open);
    },

    initCalculator() {
        // Mini calculator dropdown attached to header button
        const calcBtn = document.getElementById('btn-calculator');
        if (calcBtn && typeof Calculator !== 'undefined') {
            this.calculator = new Calculator({
                trigger: calcBtn,
                position: 'bottom-right',
                onResult: (value) => {
                    // Copy to clipboard
                    navigator.clipboard?.writeText(String(value));
                    Toast.success(`${value} copie`);
                }
            });
        }
    },
};

document.addEventListener('DOMContentLoaded', () => App.init());
