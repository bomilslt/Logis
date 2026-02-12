/**
 * Vue Settings - Parametres avec onglets
 */

Views.settings = {
    currentTab: 'general',
    channels: [],
    notificationTypes: [],
    
    render() {
        const main = document.getElementById('main-content');
        
        main.innerHTML = `
            <div class="settings-page">
                <div class="page-header">
                    <h1 class="page-title">Parametres</h1>
                </div>
                
                <div class="settings-tabs">
                    <button class="settings-tab ${this.currentTab === 'general' ? 'active' : ''}" data-tab="general">
                        ${Icons.get('settings', {size:16})} General
                    </button>
                    <button class="settings-tab ${this.currentTab === 'system' ? 'active' : ''}" data-tab="system">
                        ${Icons.get('sliders', {size:16})} Systeme
                    </button>
                    <button class="settings-tab ${this.currentTab === 'notifications' ? 'active' : ''}" data-tab="notifications">
                        ${Icons.get('message-circle', {size:16})} SMS / WhatsApp
                    </button>
                    <button class="settings-tab ${this.currentTab === 'online-payments' ? 'active' : ''}" data-tab="online-payments">
                        ${Icons.get('credit-card', {size:16})} Paiement en ligne
                    </button>
                    <button class="settings-tab ${this.currentTab === 'appearance' ? 'active' : ''}" data-tab="appearance">
                        ${Icons.get('sun', {size:16})} Apparence
                    </button>
                </div>
                
                <div id="settings-content"></div>
            </div>
        `;
        
        this.loadTabContent();
        this.attachTabEvents();
    },
    
    attachTabEvents() {
        document.querySelectorAll('.settings-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this.currentTab = tab.dataset.tab;
                document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.loadTabContent();
            });
        });
    },
    
    loadTabContent() {
        const container = document.getElementById('settings-content');
        
        switch (this.currentTab) {
            case 'general':
                this.renderGeneralTab(container);
                break;
            case 'system':
                this.renderSystemTab(container);
                break;
            case 'notifications':
                // renderNotificationsTab est maintenant async
                this.renderNotificationsTab(container);
                break;
            case 'online-payments':
                this.renderOnlinePaymentsTab(container);
                break;
            case 'appearance':
                this.renderAppearanceTab(container);
                break;
        }
    },
    
    // ============================================
    // ONGLET GENERAL
    // ============================================
    async renderGeneralTab(container) {
        container.innerHTML = Loader.page('Chargement...');
        
        // Charger les paramètres depuis l'API
        let settings = {
            company: { name: 'Express Cargo', email: '', phone: '', address: '', website: '' },
            currency: 'XAF',
            timezone: 'Africa/Douala'
        };
        
        try {
            const data = await API.settings.get();
            if (data.tenant) {
                settings.company = {
                    name: data.tenant.name || 'Express Cargo',
                    email: data.tenant.email || '',
                    phone: data.tenant.phone || '',
                    address: data.tenant.address || '',
                    website: data.tenant.website || ''
                };
            }
            if (data.config?.config_data) {
                settings.currency = data.config.config_data.currency || 'XAF';
                settings.timezone = data.config.config_data.timezone || 'Africa/Douala';
            }
        } catch (error) {
            console.error('Erreur chargement paramètres:', error);
        }
        
        container.innerHTML = `
            <div class="card mb-md">
                <div class="card-header"><h3 class="card-title">Entreprise</h3></div>
                <div class="card-body">
                    <div class="form-row">
                        <div class="form-group">
                            <label class="form-label">Nom de l'entreprise</label>
                            <input type="text" id="company-name" class="form-input" value="${settings.company.name}">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Email</label>
                            <input type="email" id="company-email" class="form-input" value="${settings.company.email}">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label class="form-label">Telephone</label>
                            <input type="tel" id="company-phone" class="form-input" value="${settings.company.phone}">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Site web</label>
                            <input type="text" id="company-website" class="form-input" value="${settings.company.website || ''}">
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Adresse</label>
                        <input type="text" id="company-address" class="form-input" value="${settings.company.address}">
                    </div>
                </div>
            </div>
            
            <div class="card mb-md">
                <div class="card-header"><h3 class="card-title">Regional</h3></div>
                <div class="card-body">
                    <div class="form-row">
                        <div class="form-group">
                            <label class="form-label">Devise</label>
                            <div id="currency-container"></div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Fuseau horaire</label>
                            <div id="timezone-container"></div>
                        </div>
                    </div>
                </div>
            </div>
            
            <button class="btn btn-primary" id="btn-save-general">Enregistrer</button>
        `;
        
        // Init SearchSelects
        this.currencySelect = new SearchSelect({
            container: '#currency-container',
            placeholder: 'Devise',
            items: [
                { id: 'XAF', name: 'XAF (Franc CFA)' },
                { id: 'USD', name: 'USD (Dollar)' },
                { id: 'EUR', name: 'EUR (Euro)' }
            ],
            onSelect: () => {}
        });
        this.currencySelect.setValue(settings.currency);
        
        this.timezoneSelect = new SearchSelect({
            container: '#timezone-container',
            placeholder: 'Fuseau horaire',
            items: [
                { id: 'Africa/Douala', name: 'Africa/Douala (UTC+1)' },
                { id: 'Africa/Lagos', name: 'Africa/Lagos (UTC+1)' },
                { id: 'Asia/Shanghai', name: 'Asia/Shanghai (UTC+8)' }
            ],
            onSelect: () => {}
        });
        this.timezoneSelect.setValue(settings.timezone);
        
        document.getElementById('btn-save-general')?.addEventListener('click', async () => {
            const btn = document.getElementById('btn-save-general');
            const data = {
                name: document.getElementById('company-name').value.trim(),
                email: document.getElementById('company-email').value.trim(),
                phone: document.getElementById('company-phone').value.trim(),
                address: document.getElementById('company-address').value.trim(),
                config_data: {
                    currency: this.currencySelect.getValue(),
                    timezone: this.timezoneSelect.getValue()
                }
            };
            
            try {
                Loader.button(btn, true, { text: 'Enregistrement...' });
                await API.settings.update(data);
                Toast.success('Parametres enregistres');
            } catch (error) {
                Toast.error(`Erreur: ${error.message}`);
            } finally {
                Loader.button(btn, false);
            }
        });
    },
    
    // ============================================
    // ONGLET SYSTEME
    // ============================================
    async renderSystemTab(container) {
        container.innerHTML = Loader.page('Chargement...');
        
        // Charger les paramètres depuis l'API
        let settings = {
            auto_assign: {
                on_departure_create: true,
                on_package_create: true
            },
            payment_methods: [],
            invoice: {
                logo: '',
                header: '',
                footer: '',
                show_logo: true,
                primary_color: '#2563eb'
            },
            export: {
                footer: ''
            },
            company: {}
        };
        
        try {
            const data = await API.settings.get();
            if (data.config?.config_data?.auto_assign) {
                settings.auto_assign = data.config.config_data.auto_assign;
            }
            if (data.config?.config_data?.payment_methods) {
                settings.payment_methods = data.config.config_data.payment_methods;
            }
            if (data.config?.config_data?.invoice) {
                settings.invoice = { ...settings.invoice, ...data.config.config_data.invoice };
            }
            if (data.config?.config_data?.export) {
                settings.export = { ...settings.export, ...data.config.config_data.export };
            }
            if (data.tenant) {
                settings.company = {
                    name: data.tenant.name || '',
                    email: data.tenant.email || '',
                    phone: data.tenant.phone || '',
                    address: data.tenant.address || ''
                };
            }
        } catch (error) {
            console.error('Erreur chargement paramètres système:', error);
        }
        
        // Stocker pour manipulation
        this.invoiceSettings = settings.invoice;
        this.exportSettings = settings.export;
        this.companySettings = settings.company;
        
        // Stocker les méthodes de paiement pour manipulation
        this.paymentMethods = settings.payment_methods.length > 0 ? settings.payment_methods : [
            { id: 'mobile_money', name: 'Mobile Money (OM/MOMO)', icon: 'smartphone', enabled: true },
            { id: 'cash', name: 'Especes', icon: 'dollar-sign', enabled: true },
            { id: 'bank', name: 'Virement bancaire', icon: 'building', enabled: true },
            { id: 'card', name: 'Carte bancaire', icon: 'credit-card', enabled: false }
        ];
        
        container.innerHTML = `
            <div class="card mb-md">
                <div class="card-header"><h3 class="card-title">Assignation automatique des colis</h3></div>
                <div class="card-body">
                    <div class="form-group">
                        <label class="toggle-label">
                            <input type="checkbox" id="auto-assign-departure" ${settings.auto_assign.on_departure_create ? 'checked' : ''}>
                            <span>A la creation d'un depart</span>
                        </label>
                        <p class="form-hint">Quand vous programmez un nouveau depart, les colis en attente correspondant a la meme route et transport seront automatiquement assignes.</p>
                    </div>
                    <div class="form-group mt-md">
                        <label class="toggle-label">
                            <input type="checkbox" id="auto-assign-package" ${settings.auto_assign.on_package_create ? 'checked' : ''}>
                            <span>A la creation d'un colis par le client</span>
                        </label>
                        <p class="form-hint">Quand un client enregistre un nouveau colis, il sera automatiquement assigne au prochain depart programme correspondant a sa route et transport.</p>
                    </div>
                </div>
            </div>
            
            <div class="card mb-md">
                <div class="card-header">
                    <h3 class="card-title">Moyens de paiement acceptes</h3>
                    <button class="btn btn-sm btn-outline" id="btn-add-payment-method">
                        ${Icons.get('plus', {size:14})} Ajouter
                    </button>
                </div>
                <div class="card-body">
                    <p class="form-hint mb-md">Configurez les moyens de paiement que vous acceptez. Seuls les moyens actifs seront proposes aux utilisateurs.</p>
                    <div id="payment-methods-list">
                        ${this.renderPaymentMethodsList()}
                    </div>
                </div>
            </div>
            
            <!-- Configuration des factures -->
            <div class="card mb-md">
                <div class="card-header">
                    <h3 class="card-title">${Icons.get('file-text', {size:18})} Factures et recus</h3>
                    <button class="btn btn-sm btn-outline" id="btn-preview-invoice" title="Prévisualiser la facture">
                        ${Icons.get('eye', {size:14})} Previsualiser
                    </button>
                </div>
                <div class="card-body">
                    <p class="form-hint mb-md">Personnalisez l'apparence de vos factures et recus avec votre logo et vos informations.</p>
                    
                    <!-- Logo -->
                    <div class="form-group">
                        <label class="form-label">Logo de l'entreprise</label>
                        <div class="invoice-logo-section">
                            <div class="invoice-logo-preview" id="invoice-logo-preview">
                                ${settings.invoice.logo ? 
                                    `<img src="${settings.invoice.logo}" alt="Logo">` : 
                                    `<div class="invoice-logo-placeholder">${Icons.get('image', {size:32})}<span>Aucun logo</span></div>`
                                }
                            </div>
                            <div class="invoice-logo-actions">
                                <input type="file" id="invoice-logo-input" accept="image/png,image/jpeg,image/svg+xml" style="display:none">
                                <button class="btn btn-sm btn-outline" id="btn-upload-logo" title="Choisir un fichier image">
                                    ${Icons.get('upload', {size:14})} Choisir une image
                                </button>
                                ${settings.invoice.logo ? `
                                    <button class="btn btn-sm btn-ghost text-error" id="btn-delete-logo" title="Supprimer le logo">
                                        ${Icons.get('trash', {size:14})} Supprimer
                                    </button>
                                ` : ''}
                                <p class="form-hint mt-sm">PNG, JPG ou SVG. Max 500KB. Taille recommandee: 200x80px</p>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Couleur principale -->
                    <div class="form-group">
                        <label class="form-label">Couleur principale</label>
                        <div class="color-picker-row">
                            <input type="color" id="invoice-color" class="color-input" value="${settings.invoice.primary_color || '#2563eb'}">
                            <input type="text" id="invoice-color-hex" class="form-input" value="${settings.invoice.primary_color || '#2563eb'}" style="width:120px">
                        </div>
                    </div>
                    
                    <!-- En-tête -->
                    <div class="form-group">
                        <label class="form-label">En-tete de la facture</label>
                        <textarea id="invoice-header" class="form-input" rows="3" placeholder="Ex: Merci pour votre confiance! Voici le detail de votre commande...">${settings.invoice.header || ''}</textarea>
                        <p class="form-hint">Texte affiche sous les informations de l'entreprise</p>
                    </div>
                    
                    <!-- Pied de page -->
                    <div class="form-group">
                        <label class="form-label">Pied de page</label>
                        <textarea id="invoice-footer" class="form-input" rows="3" placeholder="Ex: Conditions de paiement: Paiement a la livraison. Pour toute question, contactez-nous...">${settings.invoice.footer || ''}</textarea>
                        <p class="form-hint">Texte affiche en bas de la facture (conditions, mentions legales, etc.)</p>
                    </div>
                </div>
            </div>
            
            <!-- Configuration des exports PDF -->
            <div class="card mb-md">
                <div class="card-header">
                    <h3 class="card-title">${Icons.get('download', {size:18})} Exports PDF</h3>
                </div>
                <div class="card-body">
                    <p class="form-hint mb-md">Personnalisez l'apparence des exports PDF (listes de colis, clients, rapports, etc.). Le logo et le nom de l'entreprise sont automatiquement repris des parametres de facture.</p>
                    
                    <!-- Pied de page des exports -->
                    <div class="form-group">
                        <label class="form-label">Pied de page des exports</label>
                        <textarea id="export-footer" class="form-input" rows="2" placeholder="Ex: Document genere automatiquement - Express Cargo">${settings.export?.footer || ''}</textarea>
                        <p class="form-hint">Texte affiche en bas de chaque page des exports PDF</p>
                    </div>
                </div>
            </div>
            
            <button class="btn btn-primary" id="btn-save-system">Enregistrer</button>
        `;
        
        this.attachSystemTabEvents();
    },
    
    renderPaymentMethodsList() {
        if (this.paymentMethods.length === 0) {
            return `<p class="text-muted">Aucun moyen de paiement configure</p>`;
        }
        
        const iconOptions = ['smartphone', 'dollar-sign', 'building', 'credit-card', 'wallet', 'banknote', 'coins', 'qr-code'];
        
        return `
            <div class="payment-methods-grid">
                ${this.paymentMethods.map((pm, index) => `
                    <div class="payment-method-item ${pm.enabled ? 'enabled' : 'disabled'}" data-index="${index}">
                        <div class="payment-method-icon">
                            ${Icons.get(pm.icon || 'dollar-sign', {size:20})}
                        </div>
                        <div class="payment-method-info">
                            <span class="payment-method-name">${pm.name}</span>
                            <span class="payment-method-id text-sm text-muted">${pm.id}</span>
                        </div>
                        <div class="payment-method-actions">
                            <label class="toggle-label">
                                <input type="checkbox" ${pm.enabled ? 'checked' : ''} data-pm-toggle="${index}">
                                <span class="text-sm">Actif</span>
                            </label>
                            <button class="btn btn-sm btn-ghost" onclick="Views.settings.editPaymentMethod(${index})" title="Modifier">
                                ${Icons.get('edit', {size:14})}
                            </button>
                            <button class="btn btn-sm btn-ghost text-error" onclick="Views.settings.deletePaymentMethod(${index})" title="Supprimer">
                                ${Icons.get('trash', {size:14})}
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    },
    
    attachSystemTabEvents() {
        // Toggle payment method enabled/disabled
        document.querySelectorAll('[data-pm-toggle]').forEach(input => {
            input.addEventListener('change', (e) => {
                const index = parseInt(e.target.dataset.pmToggle);
                this.paymentMethods[index].enabled = e.target.checked;
                const item = e.target.closest('.payment-method-item');
                item.classList.toggle('enabled', e.target.checked);
                item.classList.toggle('disabled', !e.target.checked);
            });
        });
        
        // Add payment method button
        document.getElementById('btn-add-payment-method')?.addEventListener('click', () => {
            this.editPaymentMethod(-1); // -1 = new
        });
        
        // ===== Invoice Logo Events =====
        const logoInput = document.getElementById('invoice-logo-input');
        const btnUploadLogo = document.getElementById('btn-upload-logo');
        const btnDeleteLogo = document.getElementById('btn-delete-logo');
        
        btnUploadLogo?.addEventListener('click', () => logoInput?.click());
        
        logoInput?.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            // Validation
            if (!['image/png', 'image/jpeg', 'image/svg+xml'].includes(file.type)) {
                Toast.error('Format non supporte. Utilisez PNG, JPG ou SVG');
                return;
            }
            if (file.size > 500 * 1024) {
                Toast.error('Image trop grande. Max 500KB');
                return;
            }
            
            // Convert to base64
            const reader = new FileReader();
            reader.onload = async (event) => {
                const base64 = event.target.result;
                this.invoiceSettings.logo = base64;
                
                // Update preview
                document.getElementById('invoice-logo-preview').innerHTML = `<img src="${base64}" alt="Logo">`;
                
                // Show delete button if not present
                if (!document.getElementById('btn-delete-logo')) {
                    const actionsDiv = document.querySelector('.invoice-logo-actions');
                    const deleteBtn = document.createElement('button');
                    deleteBtn.className = 'btn btn-sm btn-ghost text-error';
                    deleteBtn.id = 'btn-delete-logo';
                    deleteBtn.innerHTML = `${Icons.get('trash', {size:14})} Supprimer`;
                    deleteBtn.addEventListener('click', () => this.deleteInvoiceLogo());
                    actionsDiv.insertBefore(deleteBtn, actionsDiv.querySelector('.form-hint'));
                }
                
                Toast.success('Logo charge. N\'oubliez pas d\'enregistrer');
            };
            reader.readAsDataURL(file);
        });
        
        btnDeleteLogo?.addEventListener('click', () => this.deleteInvoiceLogo());
        
        // Color picker sync
        const colorInput = document.getElementById('invoice-color');
        const colorHex = document.getElementById('invoice-color-hex');
        
        colorInput?.addEventListener('input', (e) => {
            colorHex.value = e.target.value;
            this.invoiceSettings.primary_color = e.target.value;
        });
        
        colorHex?.addEventListener('change', (e) => {
            const hex = e.target.value;
            if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
                colorInput.value = hex;
                this.invoiceSettings.primary_color = hex;
            }
        });
        
        // Preview invoice button
        document.getElementById('btn-preview-invoice')?.addEventListener('click', () => {
            this.previewInvoice();
        });
        
        // Save button
        document.getElementById('btn-save-system')?.addEventListener('click', async () => {
            const btn = document.getElementById('btn-save-system');
            const data = {
                config_data: {
                    auto_assign: {
                        on_departure_create: document.getElementById('auto-assign-departure').checked,
                        on_package_create: document.getElementById('auto-assign-package').checked
                    },
                    payment_methods: this.paymentMethods,
                    invoice: {
                        logo: this.invoiceSettings.logo || '',
                        header: document.getElementById('invoice-header').value.trim(),
                        footer: document.getElementById('invoice-footer').value.trim(),
                        show_logo: true,
                        primary_color: this.invoiceSettings.primary_color || '#2563eb'
                    },
                    export: {
                        footer: document.getElementById('export-footer').value.trim()
                    }
                }
            };
            
            try {
                Loader.button(btn, true, { text: 'Enregistrement...' });
                await API.settings.update(data);
                // Invalider le cache des services
                if (typeof InvoiceService !== 'undefined') {
                    InvoiceService.clearCache();
                }
                if (typeof ExportService !== 'undefined') {
                    ExportService.clearCache();
                }
                Toast.success('Parametres systeme enregistres');
            } catch (error) {
                Toast.error(`Erreur: ${error.message}`);
            } finally {
                Loader.button(btn, false);
            }
        });
    },
    
    deleteInvoiceLogo() {
        this.invoiceSettings.logo = '';
        document.getElementById('invoice-logo-preview').innerHTML = `
            <div class="invoice-logo-placeholder">${Icons.get('image', {size:32})}<span>Aucun logo</span></div>
        `;
        document.getElementById('btn-delete-logo')?.remove();
        Toast.success('Logo supprime. N\'oubliez pas d\'enregistrer');
    },
    
    previewInvoice() {
        const header = document.getElementById('invoice-header')?.value || '';
        const footer = document.getElementById('invoice-footer')?.value || '';
        const primaryColor = this.invoiceSettings?.primary_color || '#2563eb';
        const logo = this.invoiceSettings?.logo || '';
        const company = this.companySettings || {};
        
        // Données de démonstration
        const demoData = {
            invoice_number: 'FAC-2025-0001',
            date: new Date().toLocaleDateString('fr-FR'),
            due_date: new Date(Date.now() + 30*24*60*60*1000).toLocaleDateString('fr-FR'),
            client: {
                name: 'Jean Dupont',
                phone: '+237 6XX XXX XXX',
                email: 'jean.dupont@email.com'
            },
            items: [
                { description: 'Colis #TRK-ABC123 - Chine → Cameroun (Maritime)', quantity: 1, unit_price: 75000, total: 75000 },
                { description: 'Colis #TRK-DEF456 - Chine → Cameroun (Aérien)', quantity: 1, unit_price: 45000, total: 45000 }
            ],
            subtotal: 120000,
            tax: 0,
            total: 120000,
            paid: 50000,
            balance: 70000,
            currency: 'XAF'
        };
        
        // Temporairement mettre à jour les settings de InvoiceService pour la preview
        const tempSettings = {
            logo,
            header,
            footer,
            primaryColor,
            company: {
                name: company.name || 'Express Cargo',
                email: company.email || '',
                phone: company.phone || '',
                address: company.address || ''
            }
        };
        
        // Générer le HTML avec les styles de InvoiceService
        const invoiceStyles = InvoiceService.getInvoiceStyles(primaryColor);
        const invoiceHtml = this.generateInvoicePreviewHTML(demoData, tempSettings);
        
        Modal.open({
            title: 'Aperçu de la facture',
            size: 'large',
            content: `
                <div class="invoice-preview-container">
                    <style>${invoiceStyles}</style>
                    ${invoiceHtml}
                </div>
            `,
            footer: `
                <button class="btn btn-secondary" onclick="Modal.close()">Fermer</button>
                <button class="btn btn-primary" onclick="Views.settings.printInvoicePreview()">
                    ${Icons.get('printer', {size:16})} Imprimer
                </button>
            `
        });
    },
    
    generateInvoicePreviewHTML(data, settings) {
        const { invoice_number, date, due_date, client, items, subtotal, tax, total, paid, balance, currency } = data;
        const { logo, header, footer, primaryColor, company } = settings;
        
        const formatCurrency = (amount) => new Intl.NumberFormat('fr-FR').format(amount) + ' ' + currency;
        
        return `
            <div class="invoice-document">
                <!-- Header -->
                <div class="invoice-header">
                    <div class="invoice-brand">
                        ${logo ? `<img src="${logo}" alt="Logo" class="invoice-logo">` : ''}
                        <div class="invoice-company">
                            <h2>${company.name}</h2>
                            ${company.address ? `<p>${company.address}</p>` : ''}
                            ${company.phone ? `<p>Tél: ${company.phone}</p>` : ''}
                            ${company.email ? `<p>${company.email}</p>` : ''}
                        </div>
                    </div>
                    <div class="invoice-title">
                        <h1>FACTURE</h1>
                        <p class="invoice-number">${invoice_number}</p>
                        <p class="invoice-date">Date: ${date}</p>
                        ${due_date ? `<p class="invoice-due">Échéance: ${due_date}</p>` : ''}
                    </div>
                </div>
                
                ${header ? `<div class="invoice-message">${header}</div>` : ''}
                
                <!-- Client Info -->
                <div class="invoice-client">
                    <h3>Facturé à:</h3>
                    <p class="client-name">${client.name}</p>
                    ${client.phone ? `<p>${client.phone}</p>` : ''}
                    ${client.email ? `<p>${client.email}</p>` : ''}
                </div>
                
                <!-- Items Table -->
                <table class="invoice-table">
                    <thead>
                        <tr>
                            <th>Description</th>
                            <th>Qté</th>
                            <th class="text-right">Prix unit.</th>
                            <th class="text-right">Montant</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${items.map(item => `
                            <tr>
                                <td>${item.description}</td>
                                <td>${item.quantity || 1}</td>
                                <td class="text-right">${formatCurrency(item.unit_price || item.total)}</td>
                                <td class="text-right">${formatCurrency(item.total)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                
                <!-- Totals -->
                <div class="invoice-totals">
                    <div class="invoice-total-row">
                        <span>Sous-total</span>
                        <span>${formatCurrency(subtotal)}</span>
                    </div>
                    ${tax > 0 ? `
                        <div class="invoice-total-row">
                            <span>TVA</span>
                            <span>${formatCurrency(tax)}</span>
                        </div>
                    ` : ''}
                    <div class="invoice-total-row total">
                        <span>Total</span>
                        <span>${formatCurrency(total)}</span>
                    </div>
                    ${paid > 0 ? `
                        <div class="invoice-total-row paid">
                            <span>Déjà payé</span>
                            <span>- ${formatCurrency(paid)}</span>
                        </div>
                        <div class="invoice-total-row balance">
                            <span>Reste à payer</span>
                            <span>${formatCurrency(balance)}</span>
                        </div>
                    ` : ''}
                </div>
                
                <!-- Footer -->
                ${footer ? `<div class="invoice-footer-text">${footer}</div>` : ''}
                
                <div class="invoice-thank-you">
                    Merci pour votre confiance!
                </div>
            </div>
        `;
    },
    
    formatCurrency(amount) {
        return new Intl.NumberFormat('fr-FR').format(amount) + ' XAF';
    },
    
    printInvoicePreview() {
        const content = document.querySelector('.invoice-preview-container .invoice-document').outerHTML;
        const primaryColor = this.invoiceSettings?.primary_color || '#2563eb';
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Facture - Aperçu</title>
                <style>
                    ${InvoiceService.getInvoiceStyles(primaryColor)}
                </style>
            </head>
            <body>
                ${content}
                <script>window.onload = () => { window.print(); }<\/script>
            </body>
            </html>
        `);
        printWindow.document.close();
    },
    
    editPaymentMethod(index) {
        const isNew = index === -1;
        const pm = isNew ? { id: '', name: '', icon: 'dollar-sign', enabled: true } : this.paymentMethods[index];
        
        Modal.open({
            title: isNew ? 'Ajouter un moyen de paiement' : 'Modifier le moyen de paiement',
            content: `
                <div class="form-group">
                    <label class="form-label">Identifiant unique *</label>
                    <input type="text" id="pm-id" class="form-input" value="${pm.id}" placeholder="ex: mobile_money, cash, bank..." ${!isNew ? 'readonly' : ''}>
                    <p class="form-hint">Identifiant technique (sans espaces ni accents)</p>
                </div>
                <div class="form-group">
                    <label class="form-label">Nom affiche *</label>
                    <input type="text" id="pm-name" class="form-input" value="${pm.name}" placeholder="ex: Mobile Money (OM/MOMO)">
                </div>
                <div class="form-group">
                    <label class="form-label">Icone</label>
                    <div id="pm-icon-container"></div>
                </div>
                <div class="form-group">
                    <label class="toggle-label">
                        <input type="checkbox" id="pm-enabled" ${pm.enabled ? 'checked' : ''}>
                        <span>Actif</span>
                    </label>
                </div>
            `,
            footer: `
                <button class="btn btn-secondary" onclick="Modal.close()">Annuler</button>
                <button class="btn btn-primary" id="btn-save-pm">${isNew ? 'Ajouter' : 'Enregistrer'}</button>
            `
        });
        
        // Init icon select
        const iconSelect = new SearchSelect({
            container: '#pm-icon-container',
            placeholder: 'Choisir une icone',
            items: [
                { id: 'smartphone', name: 'Smartphone (Mobile Money)' },
                { id: 'dollar-sign', name: 'Dollar (Especes)' },
                { id: 'building', name: 'Batiment (Banque)' },
                { id: 'credit-card', name: 'Carte bancaire' },
                { id: 'wallet', name: 'Portefeuille' },
                { id: 'banknote', name: 'Billet' },
                { id: 'coins', name: 'Pieces' },
                { id: 'qr-code', name: 'QR Code' },
                { id: 'globe', name: 'Globe (International)' },
                { id: 'zap', name: 'Eclair (Rapide)' }
            ],
            onSelect: () => {}
        });
        iconSelect.setValue(pm.icon || 'dollar-sign');
        
        document.getElementById('btn-save-pm')?.addEventListener('click', () => {
            const id = document.getElementById('pm-id').value.trim().toLowerCase().replace(/\s+/g, '_');
            const name = document.getElementById('pm-name').value.trim();
            const icon = iconSelect.getValue() || 'dollar-sign';
            const enabled = document.getElementById('pm-enabled').checked;
            
            if (!id) { Toast.error('Entrez un identifiant'); return; }
            if (!name) { Toast.error('Entrez un nom'); return; }
            
            // Vérifier unicité de l'ID pour les nouveaux
            if (isNew && this.paymentMethods.some(p => p.id === id)) {
                Toast.error('Cet identifiant existe deja');
                return;
            }
            
            if (isNew) {
                this.paymentMethods.push({ id, name, icon, enabled });
            } else {
                this.paymentMethods[index] = { id: pm.id, name, icon, enabled }; // Keep original ID
            }
            
            // Refresh list
            document.getElementById('payment-methods-list').innerHTML = this.renderPaymentMethodsList();
            this.attachSystemTabEvents();
            
            Modal.close();
            Toast.success(isNew ? 'Moyen de paiement ajoute' : 'Moyen de paiement modifie');
        });
    },
    
    async deletePaymentMethod(index) {
        const pm = this.paymentMethods[index];
        const confirmed = await Modal.confirm({
            title: 'Supprimer ce moyen de paiement ?',
            message: `Voulez-vous supprimer "${pm.name}" ?`,
            danger: true
        });
        
        if (confirmed) {
            this.paymentMethods.splice(index, 1);
            document.getElementById('payment-methods-list').innerHTML = this.renderPaymentMethodsList();
            this.attachSystemTabEvents();
            Toast.success('Moyen de paiement supprime');
        }
    },
    
    // ============================================
    // ONGLET NOTIFICATIONS (SMS/WhatsApp)
    // ============================================
    async renderNotificationsTab(container) {
        // Afficher le loader pendant le chargement
        container.innerHTML = Loader.page('Chargement des canaux...');
        
        try {
            // Appel API pour récupérer les canaux et types de notifications
            const data = await API.notificationSettings.getChannels();
            
            this.channels = data.channels || [];
            this.notificationTypes = data.notification_types || [];
            
        } catch (error) {
            console.error('Erreur chargement canaux:', error);
            // Valeurs par défaut si erreur API
            this.channels = [
                { id: 'sms', name: 'SMS', provider: '', icon: 'message-square', connected: false, enabled: false, stats: { sent_month: 0, delivered: 0 } },
                { id: 'whatsapp', name: 'WhatsApp', provider: '', icon: 'message-circle', connected: false, enabled: false, stats: { sent_month: 0, delivered: 0 } },
                { id: 'push', name: 'Push', provider: 'Navigateur', icon: 'bell', connected: true, enabled: true, stats: { sent_month: 0, delivered: 0 } },
                { id: 'email', name: 'Email', provider: '', icon: 'mail', connected: false, enabled: false, stats: { sent_month: 0, delivered: 0 } }
            ];
            this.notificationTypes = [
                { id: 'package_received', name: 'Colis recu en entrepot', desc: 'Quand un colis est receptionne', channels: ['push'] },
                { id: 'package_shipped', name: 'Colis expedie', desc: 'Quand le colis part en transit', channels: ['sms', 'push'] },
                { id: 'package_arrived', name: 'Colis arrive', desc: 'Quand le colis arrive a destination', channels: ['sms', 'whatsapp', 'push'] },
                { id: 'ready_pickup', name: 'Pret pour retrait', desc: 'Quand le colis est disponible', channels: ['sms', 'whatsapp', 'push'] },
                { id: 'payment_received', name: 'Paiement recu', desc: 'Confirmation de paiement', channels: ['sms', 'push'] },
                { id: 'payment_reminder', name: 'Rappel de paiement', desc: 'Pour les paiements en attente', channels: ['sms'] },
                { id: 'departure_reminder', name: 'Rappel de depart', desc: 'Avant un depart programme', channels: ['sms', 'whatsapp'] }
            ];
        }
        
        container.innerHTML = `
            <!-- Canaux de notification -->
            <div class="card mb-md">
                <div class="card-header">
                    <h3 class="card-title">${Icons.get('settings', {size:18})} Configuration des canaux</h3>
                    <p class="text-sm text-muted">Configurez vos fournisseurs SMS, WhatsApp et Email</p>
                </div>
                <div class="card-body">
                    <div class="channels-grid">
                        ${this.channels.map(ch => this.renderChannelCard(ch)).join('')}
                    </div>
                </div>
            </div>
            
            <!-- Configuration par evenement -->
            <div class="card mb-md">
                <div class="card-header">
                    <h3 class="card-title">${Icons.get('bell', {size:18})} Notifications par evenement</h3>
                    <p class="text-sm text-muted">Choisissez quels canaux utiliser pour chaque type d'evenement</p>
                </div>
                <div class="card-body">
                    <div class="event-channels-config">
                        <div class="event-channels-header">
                            <div class="event-name-col">Evenement</div>
                            <div class="channels-cols">
                                ${this.channels.map(ch => `
                                    <div class="channel-col ${ch.connected ? '' : 'disabled'}" title="${ch.connected ? ch.name : ch.name + ' (non configure)'}">
                                        <span class="channel-icon-small ${ch.id}">${Icons.get(ch.icon, {size:16})}</span>
                                        <span class="channel-label">${ch.name}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        ${this.notificationTypes.map(nt => this.renderEventChannelRow(nt)).join('')}
                    </div>
                </div>
            </div>
            
            <!-- Templates de messages -->
            <div class="card mb-md">
                <div class="card-header">
                    <h3 class="card-title">${Icons.get('file-text', {size:18})} Modeles de messages</h3>
                    <p class="text-sm text-muted">Personnalisez les messages envoyes aux clients</p>
                </div>
                <div class="card-body">
                    ${this.renderTemplates()}
                </div>
            </div>
            
            <!-- Test d'envoi -->
            <div class="card mb-md">
                <div class="card-header">
                    <h3 class="card-title">${Icons.get('send', {size:18})} Tester l'envoi</h3>
                </div>
                <div class="card-body">
                    <div class="test-section">
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">Canal</label>
                                <div id="test-channel-container"></div>
                            </div>
                            <div class="form-group">
                                <label class="form-label" id="test-recipient-label">Numero</label>
                                <input type="text" id="test-recipient" class="form-input" placeholder="+237 6XX XXX XXX">
                            </div>
                            <div class="form-group" style="align-self:flex-end;">
                                <button class="btn btn-outline" id="btn-send-test">
                                    ${Icons.get('send', {size:16})} Envoyer test
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <button class="btn btn-primary" id="btn-save-notifications">
                ${Icons.get('save', {size:16})} Enregistrer les parametres
            </button>
        `;
        
        this.attachNotificationEvents();
    },
    
    renderChannelCard(channel) {
        const iconClass = channel.id;
        const deliveryRate = channel.stats.sent_month > 0 ? Math.round(channel.stats.delivered / channel.stats.sent_month * 100) : 0;
        
        return `
            <div class="channel-card ${channel.connected ? 'active' : 'inactive'}">
                <div class="channel-header">
                    <div class="channel-info">
                        <div class="channel-icon ${iconClass}">${Icons.get(channel.icon, {size:20})}</div>
                        <div>
                            <div class="channel-name">${channel.name}</div>
                            <div class="channel-provider">${channel.provider || 'Non configure'}</div>
                        </div>
                    </div>
                    <div class="channel-status ${channel.connected ? 'connected' : ''}">
                        ${channel.connected ? Icons.get('check-circle', {size:16}) : Icons.get('x-circle', {size:16})}
                    </div>
                </div>
                ${channel.connected ? `
                    <div class="channel-stats">
                        <div class="channel-stat">
                            <span class="channel-stat-value">${channel.stats.sent_month}</span>
                            <span class="channel-stat-label">ce mois</span>
                        </div>
                        <div class="channel-stat">
                            <span class="channel-stat-value">${deliveryRate}%</span>
                            <span class="channel-stat-label">livres</span>
                        </div>
                    </div>
                ` : ''}
                <div class="channel-actions">
                    <button class="btn btn-sm btn-outline" onclick="Views.settings.configureChannel('${channel.id}')">
                        ${Icons.get('settings', {size:14})} Configurer
                    </button>
                    ${channel.connected ? `
                        <label class="toggle-label" style="margin-left:auto;">
                            <input type="checkbox" ${channel.enabled ? 'checked' : ''} data-channel="${channel.id}">
                            <span class="text-sm">Actif</span>
                        </label>
                    ` : ''}
                </div>
            </div>
        `;
    },
    
    renderEventChannelRow(nt) {
        return `
            <div class="event-channel-row">
                <div class="event-info">
                    <div class="event-name">${nt.name}</div>
                    <div class="event-desc">${nt.desc}</div>
                </div>
                <div class="event-channels">
                    ${this.channels.map(ch => {
                        const isActive = nt.channels.includes(ch.id);
                        const isDisabled = !ch.connected;
                        return `
                            <label class="event-channel-toggle ${isActive ? 'active' : ''} ${isDisabled ? 'disabled' : ''}" 
                                   title="${isDisabled ? ch.name + ' non configure' : (isActive ? 'Desactiver ' + ch.name : 'Activer ' + ch.name)}">
                                <input type="checkbox" 
                                       ${isActive ? 'checked' : ''} 
                                       ${isDisabled ? 'disabled' : ''}
                                       data-event="${nt.id}" 
                                       data-channel="${ch.id}">
                                <span class="toggle-icon">${Icons.get(ch.icon, {size:16})}</span>
                            </label>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    },
    
    renderNotificationType(nt) {
        // Ancienne méthode - gardée pour compatibilité
        const activeChannels = this.channels.filter(c => c.connected && c.enabled);
        
        return `
            <div class="notification-type-item">
                <div class="notification-type-info">
                    <div class="notification-type-name">${nt.name}</div>
                    <div class="notification-type-desc">${nt.desc}</div>
                </div>
                <div class="notification-type-channels">
                    ${activeChannels.map(ch => `
                        <label class="channel-toggle ${nt.channels.includes(ch.id) ? 'active' : ''}">
                            <input type="checkbox" ${nt.channels.includes(ch.id) ? 'checked' : ''} data-type="${nt.id}" data-channel="${ch.id}">
                            ${Icons.get(ch.icon, {size:14})}
                        </label>
                    `).join('')}
                </div>
            </div>
        `;
    },
    
    renderTemplates() {
        // Templates correspondant aux événements
        const templates = [
            { id: 'package_received', name: 'Colis recu en entrepot', preview: 'Colis {tracking} recu. Type: {package_type}' },
            { id: 'package_shipped', name: 'Colis expedie', preview: 'Colis {tracking} en route. Arrivee: {eta}' },
            { id: 'package_arrived', name: 'Colis arrive', preview: 'Colis {tracking} arrive a destination' },
            { id: 'ready_pickup', name: 'Pret pour retrait', preview: 'Colis {tracking} pret! Montant: {amount_due}' },
            { id: 'payment_received', name: 'Paiement recu', preview: 'Paiement de {amount} recu pour {tracking}' },
            { id: 'payment_reminder', name: 'Rappel de paiement', preview: 'Rappel: {amount_due} a payer pour {tracking}' },
            { id: 'departure_reminder', name: 'Rappel de depart', preview: 'Depart {transport} le {departure_date}' }
        ];
        
        return templates.map(t => `
            <div class="template-item" onclick="Views.settings.editTemplate('${t.id}')">
                <div class="template-info">
                    <span class="template-name">${t.name}</span>
                    <span class="template-preview">${t.preview}</span>
                </div>
                ${Icons.get('chevron-right', {size:16})}
            </div>
        `).join('');
    },
    
    attachNotificationEvents() {
        // Init test channel SearchSelect
        this.testChannelSelect = new SearchSelect({
            container: '#test-channel-container',
            placeholder: 'Canal',
            items: [
                { id: 'sms', name: 'SMS' },
                { id: 'whatsapp', name: 'WhatsApp' },
                { id: 'email', name: 'Email' }
            ],
            onSelect: (item) => {
                const label = document.getElementById('test-recipient-label');
                const input = document.getElementById('test-recipient');
                if (item?.id === 'email') {
                    label.textContent = 'Email';
                    input.placeholder = 'exemple@email.com';
                    input.type = 'email';
                } else {
                    label.textContent = 'Numero';
                    input.placeholder = '+237 6XX XXX XXX';
                    input.type = 'tel';
                }
            }
        });
        
        // Channel toggles (activer/désactiver un canal)
        document.querySelectorAll('.channel-card input[data-channel]').forEach(input => {
            input.addEventListener('change', async (e) => {
                const channelId = e.target.dataset.channel;
                const enabled = e.target.checked;
                try {
                    await API.notificationSettings.updateChannel(channelId, { enabled });
                    Toast.success(`Canal ${channelId.toUpperCase()} ${enabled ? 'activé' : 'désactivé'}`);
                } catch (error) {
                    Toast.error(`Erreur: ${error.message}`);
                    e.target.checked = !enabled; // Revert
                }
            });
        });
        
        // Notification type channel toggles
        document.querySelectorAll('.channel-toggle input').forEach(input => {
            input.addEventListener('change', (e) => {
                e.target.closest('.channel-toggle').classList.toggle('active', e.target.checked);
            });
        });
        
        // Send test - appel API réel
        document.getElementById('btn-send-test')?.addEventListener('click', async () => {
            const btn = document.getElementById('btn-send-test');
            const channel = this.testChannelSelect?.getValue() || 'sms';
            const recipient = document.getElementById('test-recipient').value.trim();
            if (!recipient) { 
                Toast.error(channel === 'email' ? 'Entrez un email' : 'Entrez un numero'); 
                return; 
            }
            
            try {
                Loader.button(btn, true, { text: 'Envoi...' });
                const result = await API.notificationSettings.sendTest({ channel, recipient });
                Toast.success(result.message || `Test ${channel.toUpperCase()} envoyé à ${recipient}`);
            } catch (error) {
                Toast.error(`Erreur: ${error.message}`);
            } finally {
                Loader.button(btn, false);
            }
        });
        
        // Save - sauvegarde des types de notifications par evenement
        document.getElementById('btn-save-notifications')?.addEventListener('click', async () => {
            const btn = document.getElementById('btn-save-notifications');
            // Collecter les canaux actifs pour chaque evenement
            const notificationTypes = {};
            this.notificationTypes.forEach(nt => {
                const activeChannels = [];
                document.querySelectorAll(`input[data-event="${nt.id}"]:checked`).forEach(input => {
                    activeChannels.push(input.dataset.channel);
                });
                notificationTypes[nt.id] = activeChannels;
            });
            
            try {
                Loader.button(btn, true, { text: 'Enregistrement...' });
                await API.notificationSettings.updateChannels({ notification_types: notificationTypes });
                Toast.success('Configuration des notifications enregistree');
            } catch (error) {
                Toast.error(`Erreur: ${error.message}`);
            } finally {
                Loader.button(btn, false);
            }
        });
        
        // Event channel toggles - mise a jour visuelle
        document.querySelectorAll('.event-channel-toggle input').forEach(input => {
            input.addEventListener('change', (e) => {
                e.target.closest('.event-channel-toggle').classList.toggle('active', e.target.checked);
            });
        });
    },
    
    configureChannel(channelId) {
        const channel = this.channels.find(c => c.id === channelId);
        let content = '';
        
        if (channelId === 'sms') {
            content = `
                <div class="form-group">
                    <label class="form-label">Fournisseur SMS</label>
                    <div id="sms-provider-container"></div>
                </div>
                <div class="form-group">
                    <label class="form-label">API Key</label>
                    <input type="password" id="sms-api-key" class="form-input" placeholder="Votre cle API">
                </div>
                <div class="form-group">
                    <label class="form-label">Sender ID</label>
                    <input type="text" id="sms-sender" class="form-input" placeholder="Ex: ExpCargo" maxlength="11" value="${channel.config?.sender_id || ''}">
                </div>
            `;
        } else if (channelId === 'whatsapp') {
            content = `
                <div class="form-group">
                    <label class="form-label">Phone Number ID</label>
                    <input type="text" id="wa-phone-id" class="form-input" placeholder="ID du numero WhatsApp Business" value="${channel.config?.phone_id || ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">Access Token</label>
                    <input type="password" id="wa-token" class="form-input" placeholder="Token d'acces">
                </div>
                <p class="text-sm text-muted mt-md">${Icons.get('info', {size:14})} Webhook: <code>${CONFIG.API_URL}/webhooks/whatsapp</code></p>
            `;
        } else if (channelId === 'email') {
            content = `
                <div class="form-group">
                    <label class="form-label">Fournisseur Email</label>
                    <div id="email-provider-container"></div>
                </div>
                <div id="email-config-fields">
                    <!-- Les champs seront ajoutés dynamiquement selon le provider -->
                    <div class="form-group">
                        <label class="form-label">API Key</label>
                        <input type="password" id="email-api-key" class="form-input" placeholder="Votre cle API">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Email expediteur</label>
                        <input type="email" id="email-from" class="form-input" placeholder="noreply@expresscargo.com" value="${channel.config?.from_email || ''}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Nom expediteur</label>
                        <input type="text" id="email-from-name" class="form-input" placeholder="Express Cargo" value="${channel.config?.from_name || ''}">
                    </div>
                </div>
            `;
        } else {
            content = `<p class="text-muted">Push notifications configurees automatiquement via Firebase.</p>`;
        }
        
        Modal.open({
            title: `Configurer ${channel.name}`,
            content,
            footer: `
                <button class="btn btn-secondary" onclick="Modal.close()">Annuler</button>
                <button class="btn btn-primary" id="btn-save-channel">Enregistrer</button>
            `
        });
        
        // Init SearchSelects apres ouverture du modal
        if (channelId === 'sms') {
            const smsProviderSelect = new SearchSelect({
                container: '#sms-provider-container',
                placeholder: 'Fournisseur SMS',
                items: [
                    { id: 'africas_talking', name: "Africa's Talking" },
                    { id: 'twilio', name: 'Twilio' },
                    { id: 'orange_sms', name: 'Orange SMS API' }
                ],
                onSelect: () => {}
            });
            if (channel.provider) {
                // Trouver l'ID correspondant au provider
                const providerMap = { "Africa's Talking": 'africas_talking', 'Twilio': 'twilio', 'Orange SMS API': 'orange_sms' };
                const providerId = Object.entries(providerMap).find(([name]) => channel.provider.includes(name))?.[1];
                if (providerId) smsProviderSelect.setValue(providerId);
            }
            
            document.getElementById('btn-save-channel')?.addEventListener('click', async () => {
                const btn = document.getElementById('btn-save-channel');
                const provider = smsProviderSelect.getValue();
                const apiKey = document.getElementById('sms-api-key').value.trim();
                const senderId = document.getElementById('sms-sender').value.trim();
                
                const config = { sender_id: senderId };
                if (apiKey) config.api_key = apiKey;
                
                try {
                    Loader.button(btn, true, { text: 'Enregistrement...' });
                    await API.notificationSettings.updateChannel('sms', { provider, config, enabled: true });
                    Toast.success('Configuration SMS enregistree');
                    Modal.close();
                    this.renderNotificationsTab(document.getElementById('settings-content'));
                } catch (error) {
                    Toast.error(`Erreur: ${error.message}`);
                } finally {
                    Loader.button(btn, false);
                }
            });
        } else if (channelId === 'whatsapp') {
            document.getElementById('btn-save-channel')?.addEventListener('click', async () => {
                const btn = document.getElementById('btn-save-channel');
                const phoneId = document.getElementById('wa-phone-id').value.trim();
                const token = document.getElementById('wa-token').value.trim();
                
                const config = { phone_id: phoneId };
                if (token) config.access_token = token;
                
                try {
                    Loader.button(btn, true, { text: 'Enregistrement...' });
                    await API.notificationSettings.updateChannel('whatsapp', { provider: 'WhatsApp Business API', config, enabled: true });
                    Toast.success('Configuration WhatsApp enregistree');
                    Modal.close();
                    this.renderNotificationsTab(document.getElementById('settings-content'));
                } catch (error) {
                    Toast.error(`Erreur: ${error.message}`);
                } finally {
                    Loader.button(btn, false);
                }
            });
        } else if (channelId === 'email') {
            const emailProviderSelect = new SearchSelect({
                container: '#email-provider-container',
                placeholder: 'Fournisseur Email',
                items: [
                    { id: 'sendgrid', name: 'SendGrid' },
                    { id: 'mailgun', name: 'Mailgun' },
                    { id: 'aws_ses', name: 'Amazon SES' },
                    { id: 'smtp', name: 'SMTP personnalise' }
                ],
                onSelect: (item) => {
                    // Mettre à jour les champs selon le provider
                    this.updateEmailConfigFields(item?.id || 'smtp', channel);
                }
            });
            
            if (channel.provider) {
                const providerMap = { 
                    'SendGrid': 'sendgrid', 
                    'Mailgun': 'mailgun',
                    'Amazon SES': 'aws_ses',
                    'SMTP personnalise': 'smtp',
                    'smtp': 'smtp',
                    'aws_ses': 'aws_ses'
                };
                const providerId = Object.entries(providerMap).find(([name]) => 
                    channel.provider.includes(name) || channel.provider === name
                )?.[1];
                if (providerId) {
                    emailProviderSelect.setValue(providerId);
                    this.updateEmailConfigFields(providerId, channel);
                }
            } else {
                this.updateEmailConfigFields('smtp', channel);
            }
            
            document.getElementById('btn-save-channel')?.addEventListener('click', async () => {
                const btn = document.getElementById('btn-save-channel');
                const provider = emailProviderSelect.getValue();
                const fromEmail = document.getElementById('email-from').value.trim();
                const fromName = document.getElementById('email-from-name').value.trim();
                
                const config = { from_email: fromEmail, from_name: fromName };
                
                // Champs selon le provider
                if (provider === 'aws_ses') {
                    const accessKey = document.getElementById('email-api-key').value.trim();
                    const secretKey = document.getElementById('email-secret-key')?.value.trim();
                    const region = document.getElementById('email-region')?.value.trim() || 'us-east-1';
                    
                    if (accessKey) config.api_key = accessKey;
                    if (secretKey) config.aws_secret_access_key = secretKey;
                    config.region = region;
                } else {
                    const apiKey = document.getElementById('email-api-key').value.trim();
                    if (apiKey) config.api_key = apiKey;
                }
                
                try {
                    Loader.button(btn, true, { text: 'Enregistrement...' });
                    await API.notificationSettings.updateChannel('email', { provider, config, enabled: true });
                    Toast.success('Configuration Email enregistree');
                    Modal.close();
                    this.renderNotificationsTab(document.getElementById('settings-content'));
                } catch (error) {
                    Toast.error(`Erreur: ${error.message}`);
                } finally {
                    Loader.button(btn, false);
                }
            });
        } else {
            document.getElementById('btn-save-channel')?.addEventListener('click', () => {
                Toast.success(`Configuration ${channel.name} enregistree`);
                Modal.close();
            });
        }
    },
    
    // Labels français pour les variables de templates
    variableLabels: {
        tracking: 'N° de suivi',
        client_name: 'Nom du client',
        package_type: 'Type de colis',
        description: 'Description',
        billing_qty: 'Quantite (auto)',
        billing_rate: 'Prix unitaire (auto)',
        billing_detail: 'Detail facturation',
        company: 'Nom entreprise',
        route: 'Trajet',
        transport: 'Mode transport',
        departure_date: 'Date depart',
        eta: 'Date arrivee estimee',
        shipping_cost: 'Total frais',
        amount_paid: 'Montant paye',
        amount_due: 'Reste a payer',
        amount: 'Montant',
        warehouse: 'Point de retrait'
    },
    
    async editTemplate(templateId) {
        // Définition des templates avec leurs variables disponibles
        const templateDefs = {
            package_received: { 
                name: 'Colis recu en entrepot',
                variables: ['tracking', 'client_name', 'package_type', 'description', 'company'],
                defaults: {
                    sms: '[{company}] Colis {tracking} recu. Type: {package_type}',
                    whatsapp: '📦 *Colis reçu*\n\nBonjour {client_name},\n\nVotre colis *{tracking}* a été reçu.\n\n• Type: {package_type}\n• Description: {description}',
                    email: 'Bonjour {client_name},\n\nVotre colis {tracking} a été reçu.\n\nType: {package_type}\nDescription: {description}\n\nCordialement,\n{company}'
                }
            },
            package_shipped: { 
                name: 'Colis expedie',
                variables: ['tracking', 'client_name', 'route', 'transport', 'departure_date', 'eta', 'company'],
                defaults: {
                    sms: '[{company}] Colis {tracking} expedie! Route: {route}. Arrivee: {eta}',
                    whatsapp: '🚀 *Colis expédié*\n\nBonjour {client_name},\n\nVotre colis *{tracking}* est en route!\n\n• Route: {route}\n• Transport: {transport}\n• Arrivée: {eta}',
                    email: 'Bonjour {client_name},\n\nVotre colis {tracking} a été expédié.\n\nRoute: {route}\nTransport: {transport}\nArrivée estimée: {eta}\n\nCordialement,\n{company}'
                }
            },
            package_arrived: { 
                name: 'Colis arrive',
                variables: ['tracking', 'client_name', 'route', 'transport', 'company'],
                defaults: {
                    sms: '[{company}] Colis {tracking} arrive! En cours de traitement.',
                    whatsapp: '✅ *Colis arrivé*\n\nBonjour {client_name},\n\nVotre colis *{tracking}* est arrivé!\n\n• Route: {route}\n\nVous serez notifié quand il sera prêt.',
                    email: 'Bonjour {client_name},\n\nVotre colis {tracking} est arrivé à destination.\n\nRoute: {route}\n\nVous recevrez une notification quand il sera prêt pour le retrait.\n\nCordialement,\n{company}'
                }
            },
            ready_pickup: { 
                name: 'Pret pour retrait',
                variables: ['tracking', 'client_name', 'description', 'package_type', 'billing_qty', 'billing_rate', 'billing_detail', 'route', 'transport', 'shipping_cost', 'amount_paid', 'amount_due', 'warehouse', 'company'],
                defaults: {
                    sms: '[{company}] Colis {tracking} PRET! {billing_qty} = {amount_due}. Retrait: {warehouse}',
                    whatsapp: '🎉 *Colis prêt*\n\nBonjour {client_name},\n\nVotre colis *{tracking}* est disponible!\n\n📦 *Détails:*\n• {description}\n• {billing_detail}\n\n💰 *Total: {shipping_cost}*\n*Payé: {amount_paid}*\n*Reste: {amount_due}*\n\n📍 {warehouse}',
                    email: 'Bonjour {client_name},\n\nVotre colis {tracking} est prêt pour le retrait!\n\nDétails:\n- Description: {description}\n- Type: {package_type}\n- {billing_detail}\n\nFacturation:\n- Total: {shipping_cost}\n- Payé: {amount_paid}\n- Reste à payer: {amount_due}\n\nPoint de retrait: {warehouse}\n\nCordialement,\n{company}'
                }
            },
            payment_received: { 
                name: 'Paiement recu',
                variables: ['tracking', 'client_name', 'amount', 'amount_due', 'company'],
                defaults: {
                    sms: '[{company}] Paiement de {amount} recu pour {tracking}. Reste: {amount_due}',
                    whatsapp: '💰 *Paiement reçu*\n\nBonjour {client_name},\n\n• Colis: {tracking}\n• Reçu: {amount}\n• Reste: {amount_due}\n\nMerci!',
                    email: 'Bonjour {client_name},\n\nPaiement reçu pour le colis {tracking}.\n\nMontant: {amount}\nReste à payer: {amount_due}\n\nMerci!\n\n{company}'
                }
            },
            payment_reminder: { 
                name: 'Rappel de paiement',
                variables: ['tracking', 'client_name', 'amount_due', 'warehouse', 'company'],
                defaults: {
                    sms: '[{company}] Rappel: {amount_due} a payer pour {tracking}',
                    whatsapp: '⚠️ *Rappel*\n\nBonjour {client_name},\n\nColis *{tracking}* en attente.\n\n💰 *Montant dû: {amount_due}*\n\n📍 {warehouse}',
                    email: 'Bonjour {client_name},\n\nRappel: votre colis {tracking} est en attente de paiement.\n\nMontant dû: {amount_due}\nRetrait: {warehouse}\n\nCordialement,\n{company}'
                }
            },
            departure_reminder: { 
                name: 'Rappel de depart',
                variables: ['route', 'transport', 'departure_date', 'company'],
                defaults: {
                    sms: '[{company}] Depart {transport} le {departure_date}. Route: {route}',
                    whatsapp: '📢 *Rappel départ*\n\n🚀 {transport}\n📅 {departure_date}\n🛤️ {route}\n\nPréparez vos colis!',
                    email: 'Bonjour,\n\nRappel: départ prévu.\n\nTransport: {transport}\nDate: {departure_date}\nRoute: {route}\n\nCordialement,\n{company}'
                }
            }
        };
        
        const def = templateDefs[templateId];
        if (!def) {
            Toast.error('Template non trouvé');
            return;
        }
        
        // Charger les templates depuis l'API
        let savedTemplates = {};
        try {
            const data = await API.notificationSettings.getTemplates();
            savedTemplates = data.templates || {};
        } catch (e) {
            console.warn('Erreur chargement templates:', e);
        }
        
        // Utiliser les valeurs sauvegardées ou les défauts
        const tpl = savedTemplates[templateId] || def.defaults;
        const smsValue = tpl.sms || def.defaults.sms;
        const waValue = tpl.whatsapp || def.defaults.whatsapp;
        const emailValue = typeof tpl.email === 'object' ? tpl.email.body : (tpl.email || def.defaults.email);
        
        // Générer les boutons de variables avec labels français
        const variableButtons = def.variables.map(v => {
            const label = this.variableLabels[v] || v;
            return `<button type="button" class="variable-btn" data-var="{${v}}" title="Insere {${v}}">${label}</button>`;
        }).join('');
        
        Modal.open({
            title: `Modele: ${def.name}`,
            size: 'lg',
            content: `
                <div class="template-variables mb-md">
                    <p class="text-sm font-medium mb-xs">Cliquez pour inserer dans le message:</p>
                    <div class="variables-btn-list">
                        ${variableButtons}
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">${Icons.get('message-square', {size:14})} SMS <span class="text-muted">(160 car. max recommande)</span></label>
                    <textarea id="tpl-sms" class="form-input template-textarea" rows="2" maxlength="320">${smsValue}</textarea>
                    <div class="char-count text-xs text-muted mt-xs"><span id="sms-count">${smsValue.length}</span>/160 caracteres</div>
                </div>
                <div class="form-group">
                    <label class="form-label">${Icons.get('message-circle', {size:14})} WhatsApp</label>
                    <textarea id="tpl-whatsapp" class="form-input template-textarea" rows="5">${waValue}</textarea>
                    <p class="text-xs text-muted mt-xs">Utilisez *texte* pour le gras</p>
                </div>
                <div class="form-group">
                    <label class="form-label">${Icons.get('mail', {size:14})} Email (corps du message)</label>
                    <textarea id="tpl-email" class="form-input template-textarea" rows="6">${emailValue}</textarea>
                </div>
            `,
            footer: `
                <button class="btn btn-secondary" onclick="Modal.close()">Annuler</button>
                <button class="btn btn-outline" id="btn-reset-tpl">${Icons.get('refresh-cw', {size:14})} Reinitialiser</button>
                <button class="btn btn-primary" id="btn-save-tpl">${Icons.get('save', {size:14})} Enregistrer</button>
            `
        });
        
        // Stocker le dernier textarea actif
        this.lastActiveTextarea = document.getElementById('tpl-sms');
        
        // Tracker le focus sur les textareas
        document.querySelectorAll('.template-textarea').forEach(textarea => {
            textarea.addEventListener('focus', () => {
                this.lastActiveTextarea = textarea;
            });
        });
        
        // Attacher les événements aux boutons de variables
        document.querySelectorAll('.variable-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const variable = btn.dataset.var;
                this.insertVariable(variable);
            });
        });
        
        // Compteur de caractères SMS
        document.getElementById('tpl-sms')?.addEventListener('input', (e) => {
            document.getElementById('sms-count').textContent = e.target.value.length;
        });
        
        // Réinitialiser aux valeurs par défaut
        document.getElementById('btn-reset-tpl')?.addEventListener('click', () => {
            document.getElementById('tpl-sms').value = def.defaults.sms;
            document.getElementById('tpl-whatsapp').value = def.defaults.whatsapp;
            document.getElementById('tpl-email').value = def.defaults.email;
            document.getElementById('sms-count').textContent = def.defaults.sms.length;
            Toast.info('Valeurs par defaut restaurees');
        });
        
        // Sauvegarder
        document.getElementById('btn-save-tpl')?.addEventListener('click', async () => {
            const btn = document.getElementById('btn-save-tpl');
            const sms = document.getElementById('tpl-sms').value;
            const whatsapp = document.getElementById('tpl-whatsapp').value;
            const emailBody = document.getElementById('tpl-email').value;
            
            try {
                Loader.button(btn, true, { text: 'Enregistrement...' });
                await API.notificationSettings.updateTemplate(templateId, { 
                    sms, 
                    whatsapp, 
                    email: { subject: `${def.name} - {tracking}`, body: emailBody },
                    push: sms.substring(0, 100) // Push = version courte du SMS
                });
                Toast.success('Modele enregistre');
                Modal.close();
            } catch (error) {
                Toast.error(`Erreur: ${error.message}`);
            } finally {
                Loader.button(btn, false);
            }
        });
    },
    
    insertVariable(variable) {
        // Utiliser le dernier textarea actif ou le SMS par défaut
        const textarea = this.lastActiveTextarea || document.getElementById('tpl-sms');
        
        if (textarea && textarea.tagName === 'TEXTAREA') {
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const text = textarea.value;
            textarea.value = text.substring(0, start) + variable + text.substring(end);
            textarea.selectionStart = textarea.selectionEnd = start + variable.length;
            textarea.focus();
            
            // Mettre à jour le compteur si c'est le SMS
            if (textarea.id === 'tpl-sms') {
                document.getElementById('sms-count').textContent = textarea.value.length;
            }
        }
    },
    
    // ============================================
    // ONGLET APPARENCE
    // ============================================
    renderAppearanceTab(container) {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const currentPrintFormat = typeof InvoiceService !== 'undefined' ? InvoiceService.getDefaultPrintFormat() : 'quick';
        
        console.log('[Settings] Current print format:', currentPrintFormat);
        
        container.innerHTML = `
            <div class="card mb-md">
                <div class="card-header"><h3 class="card-title">Theme</h3></div>
                <div class="card-body">
                    <div class="setting-item">
                        <div>
                            <div class="font-medium">Mode sombre</div>
                            <div class="text-sm text-muted">Activer le theme sombre</div>
                        </div>
                        <label class="toggle">
                            <input type="checkbox" id="dark-mode" ${isDark ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>
            </div>
            
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">${Icons.get('printer', {size:18})} Format d'impression par defaut</h3>
                </div>
                <div class="card-body">
                    <p class="form-hint mb-md">Choisissez le format utilise par defaut pour l'impression des recus et factures.</p>
                    
                    <div class="print-format-options">
                        <label class="print-format-card ${currentPrintFormat === 'quick' ? 'selected' : ''}" data-format="quick">
                            <input type="radio" name="default_print_format" value="quick" ${currentPrintFormat === 'quick' ? 'checked' : ''}>
                            <div class="print-format-card-icon">${Icons.get('printer', {size:24})}</div>
                            <div class="print-format-card-content">
                                <span class="print-format-card-title">Impression rapide</span>
                                <span class="print-format-card-desc">Ticket HTML pour imprimante thermique (80mm)</span>
                            </div>
                            ${currentPrintFormat === 'quick' ? `<span class="print-format-badge">Actuel</span>` : ''}
                        </label>
                        
                        <label class="print-format-card ${currentPrintFormat === 'pdf_a4' ? 'selected' : ''}" data-format="pdf_a4">
                            <input type="radio" name="default_print_format" value="pdf_a4" ${currentPrintFormat === 'pdf_a4' ? 'checked' : ''}>
                            <div class="print-format-card-icon">${Icons.get('file-text', {size:24})}</div>
                            <div class="print-format-card-content">
                                <span class="print-format-card-title">PDF A4</span>
                                <span class="print-format-card-desc">Document complet format A4 professionnel</span>
                            </div>
                            ${currentPrintFormat === 'pdf_a4' ? `<span class="print-format-badge">Actuel</span>` : ''}
                        </label>
                        
                        <label class="print-format-card ${currentPrintFormat === 'pdf_ticket' ? 'selected' : ''}" data-format="pdf_ticket">
                            <input type="radio" name="default_print_format" value="pdf_ticket" ${currentPrintFormat === 'pdf_ticket' ? 'checked' : ''}>
                            <div class="print-format-card-icon">${Icons.get('receipt', {size:24})}</div>
                            <div class="print-format-card-content">
                                <span class="print-format-card-title">PDF Ticket</span>
                                <span class="print-format-card-desc">PDF format ticket 80mm pour imprimante thermique</span>
                            </div>
                            ${currentPrintFormat === 'pdf_ticket' ? `<span class="print-format-badge">Actuel</span>` : ''}
                        </label>
                    </div>
                </div>
            </div>
            
            <style>
                .print-format-options { display: flex; flex-direction: column; gap: 12px; }
                .print-format-card { 
                    display: flex; 
                    align-items: center; 
                    gap: 16px; 
                    padding: 16px; 
                    border: 2px solid var(--color-gray-200); 
                    border-radius: var(--radius-md); 
                    cursor: pointer; 
                    transition: all 0.2s;
                    position: relative;
                }
                .print-format-card:hover { 
                    border-color: var(--color-primary-300); 
                    background: var(--color-primary-50); 
                }
                .print-format-card.selected { 
                    border-color: var(--color-primary); 
                    background: var(--color-primary-50); 
                }
                .print-format-card input { display: none; }
                .print-format-card-icon { 
                    width: 48px; 
                    height: 48px; 
                    display: flex; 
                    align-items: center; 
                    justify-content: center; 
                    background: var(--color-gray-100); 
                    border-radius: var(--radius-md); 
                    color: var(--color-gray-600);
                    flex-shrink: 0;
                }
                .print-format-card.selected .print-format-card-icon { 
                    background: var(--color-primary-100); 
                    color: var(--color-primary); 
                }
                .print-format-card-content { flex: 1; }
                .print-format-card-title { 
                    display: block; 
                    font-weight: 600; 
                    font-size: 15px; 
                    color: var(--color-gray-900); 
                    margin-bottom: 4px;
                }
                .print-format-card-desc { 
                    display: block; 
                    font-size: 13px; 
                    color: var(--color-gray-600); 
                }
                .print-format-badge { 
                    position: absolute;
                    top: 12px;
                    right: 12px;
                    font-size: 11px; 
                    padding: 4px 8px; 
                    background: var(--color-primary); 
                    color: white; 
                    border-radius: var(--radius-sm);
                    font-weight: 500;
                }
                
                [data-theme="dark"] .print-format-card { border-color: var(--color-gray-700); }
                [data-theme="dark"] .print-format-card:hover { background: var(--color-gray-800); }
                [data-theme="dark"] .print-format-card.selected { background: var(--color-gray-800); }
                [data-theme="dark"] .print-format-card-icon { background: var(--color-gray-700); color: var(--color-gray-400); }
                [data-theme="dark"] .print-format-card.selected .print-format-card-icon { background: var(--color-primary-900); }
                [data-theme="dark"] .print-format-card-title { color: var(--color-gray-100); }
                [data-theme="dark"] .print-format-card-desc { color: var(--color-gray-400); }
            </style>
        `;
        
        // Dark mode toggle
        document.getElementById('dark-mode')?.addEventListener('change', (e) => {
            const theme = e.target.checked ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', theme);
            localStorage.setItem('admin_theme', theme);
        });
        
        // Print format selection
        document.querySelectorAll('.print-format-card').forEach(card => {
            card.addEventListener('click', () => {
                const format = card.dataset.format;
                
                // Update UI
                document.querySelectorAll('.print-format-card').forEach(c => {
                    c.classList.remove('selected');
                    c.querySelector('.print-format-badge')?.remove();
                });
                card.classList.add('selected');
                card.querySelector('input').checked = true;
                
                // Add badge
                const badge = document.createElement('span');
                badge.className = 'print-format-badge';
                badge.textContent = 'Actuel';
                card.appendChild(badge);
                
                // Save to localStorage
                InvoiceService.setDefaultPrintFormat(format);
                Toast.success('Format d\'impression mis a jour');
            });
        });
    },
    
    // ============================================
    // HELPER: Mise à jour dynamique des champs Email selon le provider
    // ============================================
    updateEmailConfigFields(providerId, channel) {
        const container = document.getElementById('email-config-fields');
        if (!container) return;
        
        let fieldsHTML = '';
        
        if (providerId === 'aws_ses') {
            // Champs spécifiques AWS SES
            fieldsHTML = `
                <div class="form-group">
                    <label class="form-label">AWS Access Key ID</label>
                    <input type="password" id="email-api-key" class="form-input" placeholder="AKIA...">
                    <p class="form-hint text-xs">Votre clé d'accès AWS (Access Key ID)</p>
                </div>
                <div class="form-group">
                    <label class="form-label">AWS Secret Access Key</label>
                    <input type="password" id="email-secret-key" class="form-input" placeholder="wJalrXUt...">
                    <p class="form-hint text-xs">Votre clé secrète AWS</p>
                </div>
                <div class="form-group">
                    <label class="form-label">Région AWS</label>
                    <select id="email-region" class="form-input">
                        <option value="us-east-1">US East (N. Virginia) - us-east-1</option>
                        <option value="us-west-2">US West (Oregon) - us-west-2</option>
                        <option value="eu-west-1">EU (Ireland) - eu-west-1</option>
                        <option value="eu-central-1">EU (Frankfurt) - eu-central-1</option>
                        <option value="ap-southeast-1">Asia Pacific (Singapore) - ap-southeast-1</option>
                    </select>
                    <p class="form-hint text-xs">Région où votre SES est configuré</p>
                </div>
                <div class="form-group">
                    <label class="form-label">Email expediteur</label>
                    <input type="email" id="email-from" class="form-input" placeholder="noreply@expresscargo.com" value="${channel.config?.from_email || ''}">
                    <p class="form-hint text-xs">Email vérifié dans AWS SES</p>
                </div>
                <div class="form-group">
                    <label class="form-label">Nom expediteur</label>
                    <input type="text" id="email-from-name" class="form-input" placeholder="Express Cargo" value="${channel.config?.from_name || ''}">
                </div>
            `;
        } else {
            // Champs standards (SendGrid, Mailgun, SMTP)
            fieldsHTML = `
                <div class="form-group">
                    <label class="form-label">API Key</label>
                    <input type="password" id="email-api-key" class="form-input" placeholder="Votre cle API">
                </div>
                <div class="form-group">
                    <label class="form-label">Email expediteur</label>
                    <input type="email" id="email-from" class="form-input" placeholder="noreply@expresscargo.com" value="${channel.config?.from_email || ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">Nom expediteur</label>
                    <input type="text" id="email-from-name" class="form-input" placeholder="Express Cargo" value="${channel.config?.from_name || ''}">
                </div>
            `;
        }
        
        container.innerHTML = fieldsHTML;
        
        // Pré-remplir la région AWS si déjà configurée
        if (providerId === 'aws_ses' && channel.config?.region) {
            const regionSelect = document.getElementById('email-region');
            if (regionSelect) regionSelect.value = channel.config.region;
        }
        
        // Pré-remplir le secret key AWS si déjà configuré
        if (providerId === 'aws_ses' && channel.config?.aws_secret_access_key) {
            const secretKeyInput = document.getElementById('email-secret-key');
            if (secretKeyInput) secretKeyInput.value = '••••••••'; // Masqué pour sécurité
        }
    },
    
    // Note: editTemplate is implemented above; keep only one definition.
    
    // ============================================
    // ONGLET PAIEMENT EN LIGNE
    // ============================================
    async renderOnlinePaymentsTab(container) {
        container.innerHTML = Loader.page('Chargement...');
        
        this._opProviders = [];
        this._opTemplates = {};
        
        try {
            const [providers, templates] = await Promise.all([
                API.paymentProviders.getAll(),
                API.paymentProviders.getTemplates()
            ]);
            this._opProviders = Array.isArray(providers) ? providers : [];
            this._opTemplates = templates || {};
        } catch (error) {
            if (error.message && error.message.includes('non disponible')) {
                container.innerHTML = `
                    <div class="card mb-md">
                        <div class="card-body" style="text-align:center;padding:48px 24px;">
                            ${Icons.get('lock', {size:48})}
                            <h3 style="margin-top:16px;">Paiement en ligne non disponible</h3>
                            <p class="text-muted" style="margin-top:8px;">Votre plan actuel ne permet pas les paiements en ligne. Contactez le support pour upgrader.</p>
                        </div>
                    </div>
                `;
                return;
            }
            container.innerHTML = `<div class="alert alert-error">Erreur: ${error.message}</div>`;
            return;
        }
        
        const configuredCodes = this._opProviders.map(p => p.provider_code);
        const availableTemplates = Object.entries(this._opTemplates).filter(([code]) => !configuredCodes.includes(code));
        
        container.innerHTML = `
            <div class="card mb-md">
                <div class="card-header">
                    <h3 class="card-title">${Icons.get('credit-card', {size:18})} Providers de paiement</h3>
                    ${availableTemplates.length > 0 ? `
                        <button class="btn btn-sm btn-primary" id="btn-add-provider">
                            ${Icons.get('plus', {size:14})} Ajouter un provider
                        </button>
                    ` : ''}
                </div>
                <div class="card-body">
                    <p class="form-hint mb-md">Configurez vos propres cles API pour permettre a vos clients de payer leurs colis en ligne.</p>
                    <div id="op-providers-list">
                        ${this._opProviders.length > 0 ? this._renderOpProvidersList() : `
                            <div style="text-align:center;padding:32px 0;">
                                ${Icons.get('credit-card', {size:40})}
                                <p class="text-muted" style="margin-top:12px;">Aucun provider configure. Ajoutez un provider pour commencer.</p>
                            </div>
                        `}
                    </div>
                </div>
            </div>
        `;
        
        document.getElementById('btn-add-provider')?.addEventListener('click', () => this._opShowAddProvider());
    },
    
    _renderOpProvidersList() {
        return `<div class="payment-methods-grid">
            ${this._opProviders.map(p => {
                const tpl = this._opTemplates[p.provider_code] || {};
                return `
                    <div class="payment-method-item ${p.is_enabled ? 'enabled' : 'disabled'}">
                        <div class="payment-method-icon">
                            ${Icons.get('credit-card', {size:20})}
                        </div>
                        <div class="payment-method-info">
                            <span class="payment-method-name">${tpl.name || p.provider_code}</span>
                            <span class="text-sm text-muted">${p.is_test_mode ? 'Mode test' : 'Production'} ${p.has_credentials ? '' : '- Non configure'}</span>
                            ${p.total_transactions > 0 ? `<span class="text-sm text-muted">${p.total_transactions} transaction(s)</span>` : ''}
                        </div>
                        <div class="payment-method-actions">
                            <label class="toggle-label">
                                <input type="checkbox" ${p.is_enabled ? 'checked' : ''} onchange="Views.settings._opToggleProvider('${p.provider_code}')">
                                <span class="text-sm">Actif</span>
                            </label>
                            <button class="btn btn-sm btn-ghost" onclick="Views.settings._opEditProvider('${p.provider_code}')" title="Configurer">
                                ${Icons.get('edit', {size:14})}
                            </button>
                            <button class="btn btn-sm btn-ghost text-error" onclick="Views.settings._opDeleteProvider('${p.provider_code}')" title="Supprimer">
                                ${Icons.get('trash', {size:14})}
                            </button>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>`;
    },
    
    _opShowAddProvider() {
        const configuredCodes = this._opProviders.map(p => p.provider_code);
        const available = Object.entries(this._opTemplates).filter(([code]) => !configuredCodes.includes(code));
        
        if (available.length === 0) {
            Toast.info('Tous les providers sont deja configures');
            return;
        }
        
        Modal.open({
            title: 'Ajouter un provider',
            content: `
                <div class="form-group">
                    <label class="form-label">Choisir un provider</label>
                    <select id="op-new-provider" class="form-input">
                        <option value="">-- Selectionner --</option>
                        ${available.map(([code, tpl]) => `<option value="${code}">${tpl.name} - ${tpl.description || ''}</option>`).join('')}
                    </select>
                </div>
            `,
            footer: `
                <button class="btn btn-secondary" onclick="Modal.close()">Annuler</button>
                <button class="btn btn-primary" id="btn-confirm-add-provider">Configurer</button>
            `
        });
        
        document.getElementById('btn-confirm-add-provider')?.addEventListener('click', () => {
            const code = document.getElementById('op-new-provider')?.value;
            if (!code) { Toast.error('Selectionnez un provider'); return; }
            Modal.close();
            this._opEditProvider(code);
        });
    },
    
    _opEditProvider(providerCode) {
        const tpl = this._opTemplates[providerCode];
        if (!tpl) { Toast.error('Provider inconnu'); return; }
        
        const existing = this._opProviders.find(p => p.provider_code === providerCode);
        const maskedCreds = existing?.credentials_masked || {};
        const config = existing?.config || {};
        
        let credFields = '';
        for (const [key, schema] of Object.entries(tpl.credentials_schema || {})) {
            const placeholder = maskedCreds[key] || '';
            credFields += `
                <div class="form-group">
                    <label class="form-label">${schema.label || key} ${schema.required ? '<span class="text-error">*</span>' : ''}</label>
                    <input type="${schema.type === 'password' ? 'password' : 'text'}" 
                           id="op-cred-${key}" 
                           class="form-input" 
                           placeholder="${placeholder || schema.label || key}"
                           data-cred-key="${key}"
                           data-required="${schema.required || false}">
                </div>
            `;
        }
        
        let configFields = '';
        for (const [key, schema] of Object.entries(tpl.config_schema || {})) {
            if (schema.type === 'select') {
                configFields += `
                    <div class="form-group">
                        <label class="form-label">${schema.label || key}</label>
                        <select id="op-cfg-${key}" class="form-input" data-cfg-key="${key}">
                            ${(schema.options || []).map(opt => `<option value="${opt}" ${config[key] === opt ? 'selected' : ''}>${opt}</option>`).join('')}
                        </select>
                    </div>
                `;
            } else {
                configFields += `
                    <div class="form-group">
                        <label class="form-label">${schema.label || key}</label>
                        <input type="text" id="op-cfg-${key}" class="form-input" value="${config[key] || ''}" data-cfg-key="${key}">
                    </div>
                `;
            }
        }
        
        Modal.open({
            title: `Configurer ${tpl.name}`,
            size: 'large',
            content: `
                <p class="text-muted mb-md">${tpl.description || ''}</p>
                <p class="text-sm text-muted mb-md">Devises: ${(tpl.supported_currencies || []).join(', ')} | Methodes: ${(tpl.supported_methods || []).join(', ')}</p>
                
                <h4 style="margin-bottom:12px;">Identifiants API</h4>
                ${credFields}
                ${existing?.has_credentials ? '<p class="form-hint">Laissez vide pour conserver les identifiants actuels</p>' : ''}
                
                ${configFields ? `<h4 style="margin:16px 0 12px;">Configuration</h4>${configFields}` : ''}
                
                <div class="form-row" style="margin-top:16px;">
                    <div class="form-group">
                        <label class="toggle-label">
                            <input type="checkbox" id="op-test-mode" ${existing?.is_test_mode !== false ? 'checked' : ''}>
                            <span>Mode test (sandbox)</span>
                        </label>
                    </div>
                    <div class="form-group">
                        <label class="toggle-label">
                            <input type="checkbox" id="op-enabled" ${existing?.is_enabled ? 'checked' : ''}>
                            <span>Activer</span>
                        </label>
                    </div>
                </div>
            `,
            footer: `
                <button class="btn btn-secondary" onclick="Modal.close()">Annuler</button>
                <button class="btn btn-primary" id="btn-save-provider">Enregistrer</button>
            `
        });
        
        document.getElementById('btn-save-provider')?.addEventListener('click', async () => {
            const credentials = {};
            let hasNewCreds = false;
            document.querySelectorAll('[data-cred-key]').forEach(input => {
                const val = input.value.trim();
                if (val) {
                    credentials[input.dataset.credKey] = val;
                    hasNewCreds = true;
                }
            });
            
            if (!existing && !hasNewCreds) {
                Toast.error('Renseignez au moins les identifiants requis');
                return;
            }
            
            const cfgData = {};
            document.querySelectorAll('[data-cfg-key]').forEach(input => {
                cfgData[input.dataset.cfgKey] = input.value;
            });
            
            const payload = {
                is_test_mode: document.getElementById('op-test-mode')?.checked ?? true,
                is_enabled: document.getElementById('op-enabled')?.checked ?? false,
                config: cfgData
            };
            if (hasNewCreds) payload.credentials = credentials;
            
            try {
                await API.paymentProviders.configure(providerCode, payload);
                Toast.success('Provider configure');
                Modal.close();
                this.renderOnlinePaymentsTab(document.getElementById('settings-content'));
            } catch (err) {
                Toast.error(err.message);
            }
        });
    },
    
    async _opToggleProvider(providerCode) {
        try {
            const result = await API.paymentProviders.toggle(providerCode);
            Toast.success(result.message || 'Statut mis a jour');
            this.renderOnlinePaymentsTab(document.getElementById('settings-content'));
        } catch (err) {
            Toast.error(err.message);
            this.renderOnlinePaymentsTab(document.getElementById('settings-content'));
        }
    },
    
    async _opDeleteProvider(providerCode) {
        const tpl = this._opTemplates[providerCode] || {};
        if (!confirm(`Supprimer la configuration de ${tpl.name || providerCode} ?`)) return;
        
        try {
            await API.paymentProviders.delete(providerCode);
            Toast.success('Provider supprime');
            this.renderOnlinePaymentsTab(document.getElementById('settings-content'));
        } catch (err) {
            Toast.error(err.message);
        }
    },
};
