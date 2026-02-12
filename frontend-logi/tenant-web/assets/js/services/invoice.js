/**
 * InvoiceService - Service centralisé pour la génération de factures et reçus
 * Utilise les paramètres configurés (logo, en-tête, pied de page, couleur)
 */

const InvoiceService = {
    // Cache des paramètres de facture
    settings: null,
    
    /**
     * Charger les paramètres de facture depuis le cache local ou l'API (pour PDFs uniquement)
     */
    async loadSettings() {
        // Vérifier le cache local d'abord
        const cached = localStorage.getItem('pdf_settings');
        const cacheTimestamp = localStorage.getItem('pdf_settings_timestamp');
        const now = Date.now();
        const cacheAge = cacheTimestamp ? now - parseInt(cacheTimestamp) : Infinity;

        // Utiliser le cache si < 5 minutes
        if (cached && cacheAge < 5 * 60 * 1000) {
            this.settings = JSON.parse(cached);
            return this.settings;
        }

        // Charger depuis l'API
        try {
            const data = await API.settings.get();
            this.settings = {
                logo: data.config?.config_data?.invoice?.logo || '',
                header: data.config?.config_data?.invoice?.header || '',
                footer: data.config?.config_data?.invoice?.footer || '',
                primaryColor: data.config?.config_data?.invoice?.primary_color || '#2563eb',
                company: {
                    name: data.tenant?.name || 'Express Cargo',
                    email: data.tenant?.email || '',
                    phone: data.tenant?.phone || '',
                    address: data.tenant?.address || ''
                }
            };

            // Mettre à jour le cache local
            localStorage.setItem('pdf_settings', JSON.stringify(this.settings));
            localStorage.setItem('pdf_settings_timestamp', now.toString());

        } catch (error) {
            console.error('Erreur chargement paramètres PDF:', error);
            // Utiliser le cache même s'il est vieux en cas d'erreur
            if (cached) {
                this.settings = JSON.parse(cached);
            } else {
                this.settings = {
                    logo: '',
                    header: '',
                    footer: '',
                    primaryColor: '#2563eb',
                    company: { name: 'Express Cargo', email: '', phone: '', address: '' }
                };
            }
        }

        return this.settings;
    },
    
    /**
     * Invalider le cache (après modification des paramètres)
     */
    clearCache() {
        this.settings = null;
        localStorage.removeItem('pdf_settings');
        localStorage.removeItem('pdf_settings_timestamp');
    },
    
    /**
     * Formater un montant en devise
     */
    formatCurrency(amount, currency = 'XAF') {
        // S'assurer que amount est un nombre
        const numAmount = typeof amount === 'string' ? parseFloat(amount.replace(/[^\d.-]/g, '')) : Number(amount);

        if (isNaN(numAmount)) {
            return '0 ' + currency;
        }

        return new Intl.NumberFormat('fr-FR', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        }).format(numAmount) + ' ' + currency;
    },
    
    /**
     * Générer une facture professionnelle (format A4)
     */
    async generateInvoice(data) {
        const settings = await this.loadSettings();
        
        const {
            invoice_number,
            date,
            due_date,
            client,
            items,
            subtotal,
            tax = 0,
            total,
            paid = 0,
            balance,
            notes,
            currency = 'XAF'
        } = data;
        
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Facture ${invoice_number}</title>
                <style>
                    ${this.getInvoiceStyles(settings.primaryColor)}
                </style>
            </head>
            <body>
                <div class="invoice-document">
                    <!-- Header -->
                    <div class="invoice-header">
                        <div class="invoice-brand">
                            ${settings.logo ? `<img src="${settings.logo}" alt="Logo" class="invoice-logo">` : ''}
                            <div class="invoice-company">
                                <h2>${settings.company.name}</h2>
                                ${settings.company.address ? `<p>${settings.company.address}</p>` : ''}
                                ${settings.company.phone ? `<p>Tél: ${settings.company.phone}</p>` : ''}
                                ${settings.company.email ? `<p>${settings.company.email}</p>` : ''}
                            </div>
                        </div>
                        <div class="invoice-title">
                            <h1>FACTURE</h1>
                            <p class="invoice-number">${invoice_number}</p>
                            <p class="invoice-date">Date: ${date}</p>
                            ${due_date ? `<p class="invoice-due">Échéance: ${due_date}</p>` : ''}
                        </div>
                    </div>
                    
                    ${settings.header ? `<div class="invoice-message">${settings.header}</div>` : ''}
                    
                    <!-- Client Info -->
                    <div class="invoice-client">
                        <h3>Facturé à:</h3>
                        <p class="client-name">${client.name}</p>
                        ${client.phone ? `<p>${client.phone}</p>` : ''}
                        ${client.email ? `<p>${client.email}</p>` : ''}
                        ${client.address ? `<p>${client.address}</p>` : ''}
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
                                    <td class="text-right">${this.formatCurrency(item.unit_price || item.price, currency)}</td>
                                    <td class="text-right">${this.formatCurrency(item.total || item.price, currency)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    
                    <!-- Totals -->
                    <div class="invoice-totals">
                        <div class="invoice-total-row">
                            <span>Sous-total</span>
                            <span>${this.formatCurrency(subtotal, currency)}</span>
                        </div>
                        ${tax > 0 ? `
                            <div class="invoice-total-row">
                                <span>TVA</span>
                                <span>${this.formatCurrency(tax, currency)}</span>
                            </div>
                        ` : ''}
                        <div class="invoice-total-row total">
                            <span>Total</span>
                            <span>${this.formatCurrency(total, currency)}</span>
                        </div>
                        ${paid > 0 ? `
                            <div class="invoice-total-row paid">
                                <span>Déjà payé</span>
                                <span>- ${this.formatCurrency(paid, currency)}</span>
                            </div>
                            <div class="invoice-total-row balance">
                                <span>Reste à payer</span>
                                <span>${this.formatCurrency(balance, currency)}</span>
                            </div>
                        ` : ''}
                    </div>
                    
                    ${notes ? `<div class="invoice-notes"><strong>Notes:</strong> ${notes}</div>` : ''}
                    
                    <!-- Footer -->
                    ${settings.footer ? `<div class="invoice-footer-text">${settings.footer}</div>` : ''}
                    
                    <div class="invoice-thank-you">
                        Merci pour votre confiance!
                    </div>
                </div>
                <script>window.onload = () => { window.print(); }</script>
            </body>
            </html>
        `;
        
        this._openPrintWindow(html);
    },
    
    /**
     * Générer un reçu de paiement (format ticket 80mm)
     */
    async generateReceipt(data) {
        const settings = await this.loadSettings();
        
        const {
            receipt_number,
            date,
            client,
            client_name,
            client_phone,
            items = [],
            amount,
            method,
            reference,
            currency = 'XAF',
            created_at
        } = data;
        
        // Support both nested client object and flat client_name/client_phone properties
        const clientName = client?.name || client_name || 'N/A';
        const clientPhone = client?.phone || client_phone || '';
        
        // Format date from created_at if date not provided
        const displayDate = date || (created_at ? new Date(created_at).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR'));
        
        // Format method for display
        const methodLabels = {
            'cash': 'Espèces',
            'mobile_money': 'Mobile Money',
            'bank_transfer': 'Virement',
            'bank': 'Virement'
        };
        const displayMethod = methodLabels[method] || method || 'N/A';
        
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Reçu ${receipt_number || reference || ''}</title>
                <style>
                    ${this.getReceiptStyles(settings.primaryColor)}
                </style>
            </head>
            <body>
                <div class="receipt">
                    <div class="receipt-header">
                        ${settings.logo ? `<img src="${settings.logo}" alt="Logo" class="receipt-logo">` : ''}
                        <div class="receipt-company">${settings.company.name}</div>
                        ${settings.company.phone ? `<div class="receipt-contact">${settings.company.phone}</div>` : ''}
                        <div class="receipt-title">REÇU DE PAIEMENT</div>
                    </div>
                    
                    <div class="receipt-ref">${receipt_number || reference || ''}</div>
                    
                    <div class="receipt-body">
                        <div class="receipt-row">
                            <span class="receipt-label">Date</span>
                            <span class="receipt-value">${displayDate}</span>
                        </div>
                        <div class="receipt-row">
                            <span class="receipt-label">Client</span>
                            <span class="receipt-value">${clientName}</span>
                        </div>
                        ${clientPhone ? `
                            <div class="receipt-row">
                                <span class="receipt-label">Téléphone</span>
                                <span class="receipt-value">${clientPhone}</span>
                            </div>
                        ` : ''}
                        <div class="receipt-row">
                            <span class="receipt-label">Méthode</span>
                            <span class="receipt-value">${displayMethod}</span>
                        </div>
                    </div>
                    
                    ${items.length > 0 ? `
                        <div class="receipt-items">
                            <div class="receipt-items-title">Détails</div>
                            ${items.map(item => `
                                <div class="receipt-item">
                                    <span>${item.description || item.tracking}</span>
                                    ${item.amount ? `<span>${this.formatCurrency(item.amount, currency)}</span>` : ''}
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                    
                    <div class="receipt-total">
                        <span>TOTAL</span>
                        <span>${this.formatCurrency(amount, currency)}</span>
                    </div>
                    
                    <div class="receipt-footer">
                        ${settings.footer ? `<div class="receipt-footer-text">${settings.footer}</div>` : ''}
                        <div class="receipt-thanks">Merci pour votre confiance!</div>
                        <div class="receipt-datetime">${new Date().toLocaleString('fr-FR')}</div>
                    </div>
                </div>
                <script>window.onload = () => { window.print(); }</script>
            </body>
            </html>
        `;
        
        this._openPrintWindow(html);
    },
    
    /**
     * Ouvrir une fenêtre d'impression avec fallback iframe si popup bloqué
     */
    _openPrintWindow(html) {
        const printWindow = window.open('', '_blank');
        
        if (printWindow) {
            printWindow.document.write(html);
            printWindow.document.close();
        } else {
            // Fallback: utiliser un iframe si popup bloqué
            console.warn('[InvoiceService] Popup bloqué, utilisation du fallback iframe');
            
            let iframe = document.getElementById('print-iframe');
            if (!iframe) {
                iframe = document.createElement('iframe');
                iframe.id = 'print-iframe';
                iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
                document.body.appendChild(iframe);
            }
            
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            iframeDoc.open();
            iframeDoc.write(html.replace('<script>window.onload = () => { window.print(); }</script>', ''));
            iframeDoc.close();
            
            setTimeout(() => {
                iframe.contentWindow.focus();
                iframe.contentWindow.print();
            }, 300);
        }
    },
    
    /**
     * Générer un reçu de retrait (pickup)
     */
    async generatePickupReceipt(data) {
        const settings = await this.loadSettings();
        
        const {
            pickup_number,
            date,
            client,
            packages = [],
            total_amount,
            payment_method,
            delivered_by,
            signature,
            photo,
            currency = 'XAF'
        } = data;
        
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Reçu de retrait ${pickup_number}</title>
                <style>
                    ${this.getReceiptStyles(settings.primaryColor)}
                    .pickup-packages { margin: 10px 0; padding: 10px 0; border-top: 1px dashed #ccc; border-bottom: 1px dashed #ccc; }
                    .pickup-package { display: flex; justify-content: space-between; padding: 3px 0; font-size: 11px; }
                    .pickup-signature { margin-top: 15px; text-align: center; }
                    .pickup-signature img { max-width: 150px; max-height: 60px; border: 1px solid #ddd; }
                    .pickup-signature-label { font-size: 10px; color: #666; margin-top: 5px; }
                </style>
            </head>
            <body>
                <div class="receipt">
                    <div class="receipt-header">
                        ${settings.logo ? `<img src="${settings.logo}" alt="Logo" class="receipt-logo">` : ''}
                        <div class="receipt-company">${settings.company.name}</div>
                        ${settings.company.phone ? `<div class="receipt-contact">${settings.company.phone}</div>` : ''}
                        <div class="receipt-title">REÇU DE RETRAIT</div>
                    </div>
                    
                    <div class="receipt-ref">${pickup_number}</div>
                    
                    <div class="receipt-body">
                        <div class="receipt-row">
                            <span class="receipt-label">Date</span>
                            <span class="receipt-value">${date}</span>
                        </div>
                        <div class="receipt-row">
                            <span class="receipt-label">Client</span>
                            <span class="receipt-value">${client.name}</span>
                        </div>
                        ${client.phone ? `
                            <div class="receipt-row">
                                <span class="receipt-label">Téléphone</span>
                                <span class="receipt-value">${client.phone}</span>
                            </div>
                        ` : ''}
                        ${delivered_by ? `
                            <div class="receipt-row">
                                <span class="receipt-label">Remis par</span>
                                <span class="receipt-value">${delivered_by}</span>
                            </div>
                        ` : ''}
                    </div>
                    
                    <div class="pickup-packages">
                        <div style="font-weight:bold; margin-bottom:5px;">Colis retirés (${packages.length})</div>
                        ${packages.map(pkg => `
                            <div class="pickup-package">
                                <span>${pkg.tracking}</span>
                                <span>${pkg.weight ? pkg.weight + ' kg' : ''}</span>
                            </div>
                        `).join('')}
                    </div>
                    
                    <div class="receipt-row">
                        <span class="receipt-label">Paiement</span>
                        <span class="receipt-value">${payment_method}</span>
                    </div>
                    
                    <div class="receipt-total">
                        <span>TOTAL PAYÉ</span>
                        <span>${this.formatCurrency(total_amount, currency)}</span>
                    </div>
                    
                    ${signature ? `
                        <div class="pickup-signature">
                            <img src="${signature}" alt="Signature">
                            <div class="pickup-signature-label">Signature du client</div>
                        </div>
                    ` : ''}
                    
                    <div class="receipt-footer">
                        ${settings.footer ? `<div class="receipt-footer-text">${settings.footer}</div>` : ''}
                        <div class="receipt-thanks">Merci pour votre confiance!</div>
                        <div class="receipt-datetime">${new Date().toLocaleString('fr-FR')}</div>
                    </div>
                </div>
                <script>window.onload = () => { window.print(); }</script>
            </body>
            </html>
        `;
        
        this._openPrintWindow(html);
    },

    /**
     * Styles CSS pour les factures A4
     */
    getInvoiceStyles(primaryColor) {
        return `
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #333; padding: 20px; background: #f5f5f5; }
            .invoice-document { background: white; max-width: 800px; margin: 0 auto; padding: 40px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .invoice-header { display: flex; justify-content: space-between; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 3px solid ${primaryColor}; }
            .invoice-brand { display: flex; align-items: flex-start; gap: 15px; }
            .invoice-logo { max-height: 60px; max-width: 150px; object-fit: contain; }
            .invoice-company h2 { font-size: 18px; color: ${primaryColor}; margin: 0 0 8px 0; }
            .invoice-company p { margin: 2px 0; font-size: 11px; color: #666; }
            .invoice-title { text-align: right; }
            .invoice-title h1 { font-size: 32px; color: ${primaryColor}; margin: 0; letter-spacing: 3px; font-weight: 700; }
            .invoice-number { font-size: 14px; font-weight: 600; margin-top: 8px; }
            .invoice-date, .invoice-due { color: #666; font-size: 12px; }
            .invoice-message { background: #f8fafc; padding: 15px 20px; border-radius: 8px; margin-bottom: 25px; font-style: italic; color: #555; border-left: 4px solid ${primaryColor}; }
            .invoice-client { margin-bottom: 30px; }
            .invoice-client h3 { font-size: 11px; text-transform: uppercase; color: #888; margin: 0 0 8px 0; letter-spacing: 1px; }
            .invoice-client .client-name { font-size: 16px; font-weight: 600; margin: 0 0 4px 0; }
            .invoice-client p { margin: 2px 0; color: #555; }
            .invoice-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            .invoice-table th { background: ${primaryColor}; color: white; padding: 12px 15px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
            .invoice-table th:first-child { border-radius: 8px 0 0 0; }
            .invoice-table th:last-child { border-radius: 0 8px 0 0; }
            .invoice-table td { padding: 14px 15px; border-bottom: 1px solid #eee; }
            .invoice-table tr:nth-child(even) { background: #f8fafc; }
            .invoice-table .text-right { text-align: right; }
            .invoice-totals { margin-left: auto; width: 300px; }
            .invoice-total-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
            .invoice-total-row.total { font-size: 18px; font-weight: 700; color: ${primaryColor}; border-bottom: 3px solid ${primaryColor}; padding: 15px 0; }
            .invoice-total-row.paid { color: #22c55e; }
            .invoice-total-row.balance { font-weight: 600; background: #fef3c7; padding: 12px; border-radius: 6px; margin-top: 10px; border: none; }
            .invoice-notes { margin-top: 30px; padding: 15px; background: #f8fafc; border-radius: 8px; font-size: 12px; }
            .invoice-footer-text { margin-top: 30px; padding: 20px; background: #f1f5f9; border-radius: 8px; font-size: 11px; color: #666; white-space: pre-line; line-height: 1.6; }
            .invoice-thank-you { text-align: center; margin-top: 30px; font-size: 16px; color: ${primaryColor}; font-weight: 500; }
            @media print { 
                body { padding: 0; background: white; } 
                .invoice-document { box-shadow: none; max-width: 100%; padding: 20px; }
            }
        `;
    },
    
    /**
     * Styles CSS pour les reçus ticket (80mm)
     */
    getReceiptStyles(primaryColor) {
        return `
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Courier New', monospace; font-size: 12px; color: #000; background: #f5f5f5; }
            .receipt { width: 80mm; margin: 0 auto; padding: 5mm; background: white; }
            .receipt-header { text-align: center; padding-bottom: 10px; border-bottom: 2px solid ${primaryColor}; margin-bottom: 10px; }
            .receipt-logo { max-height: 40px; max-width: 60mm; margin-bottom: 5px; }
            .receipt-company { font-size: 16px; font-weight: bold; color: ${primaryColor}; }
            .receipt-contact { font-size: 10px; color: #666; }
            .receipt-title { font-size: 14px; font-weight: bold; margin-top: 8px; letter-spacing: 1px; }
            .receipt-ref { text-align: center; font-family: monospace; font-size: 11px; padding: 8px 0; background: #f5f5f5; margin: 10px 0; border-radius: 4px; }
            .receipt-body { padding: 10px 0; }
            .receipt-row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dotted #ccc; }
            .receipt-row:last-child { border-bottom: none; }
            .receipt-label { color: #666; font-size: 11px; }
            .receipt-value { font-weight: 500; text-align: right; font-size: 11px; }
            .receipt-items { padding: 10px 0; border-top: 1px dashed #000; border-bottom: 1px dashed #000; margin: 10px 0; }
            .receipt-items-title { font-weight: bold; font-size: 11px; margin-bottom: 5px; }
            .receipt-item { display: flex; justify-content: space-between; font-size: 10px; padding: 2px 0; }
            .receipt-total { display: flex; justify-content: space-between; font-size: 18px; font-weight: bold; padding: 15px 0; margin: 10px 0; border-top: 2px solid ${primaryColor}; border-bottom: 2px solid ${primaryColor}; color: ${primaryColor}; }
            .receipt-footer { text-align: center; padding-top: 10px; border-top: 1px dashed #000; margin-top: 10px; }
            .receipt-footer-text { font-size: 9px; color: #666; margin-bottom: 8px; white-space: pre-line; }
            .receipt-thanks { font-size: 11px; font-weight: bold; color: ${primaryColor}; }
            .receipt-datetime { font-size: 9px; color: #888; margin-top: 5px; }
            @media print {
                body { background: white; }
                .receipt { width: 100%; max-width: 80mm; }
            }
        `;
    },
    
    // ==================== GESTION FORMAT PAR DÉFAUT ====================
    
    PRINT_FORMATS: {
        'quick': { label: 'Impression rapide (Ticket)', icon: 'printer' },
        'pdf_a4': { label: 'PDF A4', icon: 'file-text' },
        'pdf_ticket': { label: 'PDF Ticket (80mm)', icon: 'receipt' }
    },
    
    /**
     * Récupérer le format d'impression par défaut
     */
    getDefaultPrintFormat() {
        return localStorage.getItem('print_format') || 'quick';
    },
    
    /**
     * Définir le format d'impression par défaut
     */
    setDefaultPrintFormat(format) {
        localStorage.setItem('print_format', format);
    },
    
    /**
     * Exécuter l'impression selon le format
     */
    async executePrint(format, type, id, data) {
        try {
            switch (format) {
                case 'quick':
                    if (type === 'payment' && data) {
                        this.generateReceipt(data);
                    } else if (type === 'pickup' && data) {
                        this.generatePickupReceipt(data);
                    } else if (type === 'invoice' && data) {
                        this.generateInvoice(data);
                    }
                    break;
                    
                case 'pdf_a4':
                    if (!data) {
                        // Charger les données si nécessaire
                        try {
                            if (type === 'payment') {
                                const response = await API.payments.getById(id);
                                data = response.payment;
                            } else if (type === 'pickup') {
                                const response = await API.pickups.getById(id);
                                data = response.pickup;
                            } else if (type === 'invoice') {
                                const response = await API.invoices.getById(id);
                                data = response.invoice;
                            }
                        } catch (loadError) {
                            Toast.error('Impossible de charger les données pour le PDF');
                            return;
                        }
                    }

                    if (type === 'payment') {
                        await this.generatePaymentReceiptPDF(data);
                    } else if (type === 'pickup') {
                        await this.generatePickupReceiptPDF(data);
                    } else if (type === 'invoice') {
                        await this.generateInvoicePDF(data);
                    }
                    break;

                case 'pdf_ticket':
                    if (!data) {
                        // Charger les données si nécessaire
                        try {
                            if (type === 'payment') {
                                const response = await API.payments.getById(id);
                                data = response.payment;
                            } else if (type === 'pickup') {
                                const response = await API.pickups.getById(id);
                                data = response.pickup;
                            }
                        } catch (loadError) {
                            Toast.error('Impossible de charger les données pour le ticket PDF');
                            return;
                        }
                    }

                    if (type === 'payment') {
                        await this.generatePaymentTicketPDF(data);
                    } else if (type === 'pickup') {
                        await this.generatePickupTicketPDF(data);
                    }
                    break;
            }
        } catch (error) {
            console.error('Erreur impression:', error);
            
            // Vérifier si c'est une erreur réseau/CORS
            if (error.message && error.message.includes('Failed to fetch')) {
                Toast.error('Erreur de connexion au serveur. Vérifiez votre connexion.');
                return;
            }
            
            // Fallback automatique vers impression rapide seulement pour certaines erreurs
            if ((format === 'pdf_a4' || format === 'pdf_ticket') && 
                (error.message?.includes('404') || error.message?.includes('not found'))) {
                Toast.warning('Export PDF indisponible. Utilisation de l\'impression rapide...');
                
                // Si on n'a pas les données, essayer de les charger
                if (!data) {
                    try {
                        if (type === 'payment') {
                            const response = await API.payments.getById(id);
                            data = response.payment;
                        }
                    } catch (loadError) {
                        Toast.error('Impossible de charger les données pour l\'impression');
                        return;
                    }
                }
                
                // Utiliser l'impression HTML à la place
                if (type === 'payment' && data) {
                    this.generateReceipt(data);
                } else if (type === 'pickup' && data) {
                    this.generatePickupReceipt(data);
                }
            } else {
                Toast.error('Erreur lors de l\'impression');
            }
        }
    },
    
    /**
     * Imprimer avec le format par défaut (ou afficher le menu si demandé)
     * @param {Object} options - Options
     * @param {string} options.type - Type de document ('payment', 'pickup')
     * @param {string} options.id - ID du document
     * @param {Object} options.data - Données pour impression HTML
     * @param {boolean} options.showMenu - Forcer l'affichage du menu de choix
     */
    async print(options) {
        const { type, id, data, showMenu = false } = options;
        const defaultFormat = this.getDefaultPrintFormat();
        
        console.log('[InvoiceService] Print called:', { type, id, defaultFormat, showMenu });
        
        if (showMenu) {
            this.showPrintMenu(options);
            return;
        }
        
        // Utiliser le format par défaut
        await this.executePrint(defaultFormat, type, id, data);
    },
    
    /**
     * Générer un PDF de facture (format A4)
     */
    async generateInvoicePDF(data) {
        const settings = await this.loadSettings();
        const { jsPDF } = window.jspdf;

        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 25;
        let yPosition = margin;

        // Couleurs
        const primaryColor = settings.primaryColor || '#2563eb';
        const primaryRgb = this.hexToRgb(primaryColor) || [37, 99, 235];
        const grayColor = [100, 100, 100];
        const lightGrayColor = [240, 240, 240];

        // Header layout: Logo + Header text à gauche, Infos entreprise à droite
        let leftY = yPosition;
        let rightY = yPosition;

        // Logo en haut à gauche
        if (settings.logo) {
            try {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                    img.src = settings.logo;
                });

                const logoWidth = 40;
                const logoHeight = (img.height / img.width) * logoWidth;
                doc.addImage(img, 'PNG', margin, leftY, logoWidth, logoHeight);
                leftY += logoHeight + 5;
            } catch (error) {
                console.warn('Erreur chargement logo:', error);
            }
        }

        // Texte d'en-tête en haut à gauche (sous le logo)
        if (settings.header) {
            doc.setFontSize(10);
            doc.setTextColor(0, 0, 0);
            doc.setFont('helvetica', 'normal');
            const headerLines = doc.splitTextToSize(settings.header, pageWidth / 2 - margin - 10);
            doc.text(headerLines, margin, leftY);
            leftY += headerLines.length * 5 + 5;
        }

        // Informations de l'entreprise en haut à droite
        doc.setFontSize(14);
        doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
        doc.setFont('helvetica', 'bold');
        doc.text(settings.company.name, pageWidth - margin, rightY, { align: 'right' });
        rightY += 6;

        doc.setFontSize(9);
        doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
        doc.setFont('helvetica', 'normal');

        if (settings.company.address) {
            doc.text(settings.company.address, pageWidth - margin, rightY, { align: 'right' });
            rightY += 4;
        }

        if (settings.company.phone) {
            doc.text(`Tél: ${settings.company.phone}`, pageWidth - margin, rightY, { align: 'right' });
            rightY += 4;
        }

        if (settings.company.email) {
            doc.text(settings.company.email, pageWidth - margin, rightY, { align: 'right' });
            rightY += 4;
        }

        // Ajuster la position Y pour le contenu suivant
        yPosition = Math.max(leftY, rightY) + 10;

        // Titre FACTURE
        doc.setFontSize(20);
        doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
        doc.setFont('helvetica', 'bold');
        doc.text('FACTURE', pageWidth / 2, yPosition, { align: 'center' });
        yPosition += 15;

        // Numéro de facture
        doc.setFontSize(12);
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'normal');
        doc.text(`N° ${data.invoice_number}`, pageWidth / 2, yPosition, { align: 'center' });
        yPosition += 8;

        // Date et échéance
        doc.setFontSize(10);
        doc.text(`Date: ${data.date}`, margin, yPosition);
        if (data.due_date) {
            doc.text(`Échéance: ${data.due_date}`, pageWidth - margin, yPosition, { align: 'right' });
        }
        yPosition += 15;

        // Informations client
        doc.setFontSize(11);
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'bold');
        doc.text('Facturé à:', margin, yPosition);
        yPosition += 8;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text(data.client.name, margin + 10, yPosition);
        yPosition += 5;

        if (data.client.phone) {
            doc.text(data.client.phone, margin + 10, yPosition);
            yPosition += 4;
        }

        if (data.client.email) {
            doc.text(data.client.email, margin + 10, yPosition);
            yPosition += 4;
        }

        if (data.client.address) {
            doc.text(data.client.address, margin + 10, yPosition);
            yPosition += 4;
        }

        yPosition += 10;

        // Tableau des articles
        if (data.items && data.items.length > 0) {
            const tableStartY = yPosition;
            const colWidths = [80, 15, 30, 30]; // Description, Qté, Prix unit., Montant
            const colPositions = [margin];
            for (let i = 1; i < colWidths.length; i++) {
                colPositions.push(colPositions[i-1] + colWidths[i-1]);
            }

            // En-têtes du tableau
            doc.setFillColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
            doc.rect(margin, yPosition - 2, pageWidth - 2 * margin, 8, 'F');

            doc.setFontSize(9);
            doc.setTextColor(255, 255, 255);
            doc.setFont('helvetica', 'bold');
            doc.text('Description', colPositions[0] + 2, yPosition + 3);
            doc.text('Qté', colPositions[1] + 2, yPosition + 3);
            doc.text('Prix unit.', colPositions[2] + 2, yPosition + 3);
            doc.text('Montant', colPositions[3] + 2, yPosition + 3);

            yPosition += 10;

            // Lignes du tableau
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(0, 0, 0);

            let alternateRow = false;
            data.items.forEach(item => {
                if (alternateRow) {
                    doc.setFillColor(248, 250, 252);
                    doc.rect(margin, yPosition - 2, pageWidth - 2 * margin, 8, 'F');
                }

                const quantity = item.quantity || 1;
                const unitPrice = item.unit_price || item.price || 0;
                const amount = item.amount || (quantity * unitPrice);

                // Description
                const descLines = doc.splitTextToSize(item.description || item.name || 'Article', colWidths[0] - 4);
                doc.text(descLines, colPositions[0] + 2, yPosition + 3);

                // Quantité
                doc.text(quantity.toString(), colPositions[1] + 2, yPosition + 3);

                // Prix unitaire
                doc.text(this.formatCurrency(unitPrice, data.currency), colPositions[2] + 2, yPosition + 3);

                // Montant
                doc.text(this.formatCurrency(amount, data.currency), colPositions[3] + 2, yPosition + 3);

                yPosition += Math.max(descLines.length * 4, 8);
                alternateRow = !alternateRow;
            });

            yPosition += 5;
        }

        // Totaux
        const totalsX = pageWidth - margin - 60;

        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'normal');

        if (data.subtotal !== undefined) {
            doc.text('Sous-total:', totalsX, yPosition);
            doc.text(this.formatCurrency(data.subtotal, data.currency), pageWidth - margin, yPosition, { align: 'right' });
            yPosition += 6;
        }

        if (data.tax && data.tax > 0) {
            doc.text('TVA:', totalsX, yPosition);
            doc.text(this.formatCurrency(data.tax, data.currency), pageWidth - margin, yPosition, { align: 'right' });
            yPosition += 6;
        }

        // Ligne de séparation avant le total
        doc.setDrawColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
        doc.setLineWidth(0.5);
        doc.line(totalsX, yPosition, pageWidth - margin, yPosition);
        yPosition += 5;

        // Total
        doc.setFontSize(14);
        doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
        doc.setFont('helvetica', 'bold');
        doc.text('TOTAL', totalsX, yPosition);
        doc.text(this.formatCurrency(data.total, data.currency), pageWidth - margin, yPosition, { align: 'right' });

        // Ligne sous le total
        yPosition += 3;
        doc.line(totalsX, yPosition, pageWidth - margin, yPosition);
        yPosition += 15;

        // Notes
        if (data.notes) {
            doc.setFontSize(9);
            doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
            doc.setFont('helvetica', 'normal');
            const notesLines = doc.splitTextToSize(data.notes, pageWidth - 2 * margin);
            doc.text(notesLines, margin, yPosition);
            yPosition += notesLines.length * 4 + 10;
        }

        // Footer text au centre
        if (settings.footer) {
            doc.setFontSize(9);
            doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
            doc.setFont('helvetica', 'normal');
            const footerLines = doc.splitTextToSize(settings.footer, pageWidth - 2 * margin);
            doc.text(footerLines, pageWidth / 2, yPosition, { align: 'center' });
        }

        // Générer le nom du fichier
        const filename = `facture-${data.invoice_number}.pdf`;

        // Télécharger
        doc.save(filename);
        Toast.success('PDF Facture téléchargé');
    },

    /**
     * Convertir couleur hex en RGB
     */
    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? [
            parseInt(result[1], 16),
            parseInt(result[2], 16),
            parseInt(result[3], 16)
        ] : null;
    },

    /**
     * Générer un PDF de reçu de paiement (format A4)
     */
    async generatePaymentReceiptPDF(data) {
        const settings = await this.loadSettings();
        const { jsPDF } = window.jspdf;

        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 25;
        let yPosition = margin;

        // Couleurs
        const primaryColor = settings.primaryColor || '#2563eb';
        const primaryRgb = this.hexToRgb(primaryColor) || [37, 99, 235];
        const grayColor = [100, 100, 100];
        const lightGrayColor = [240, 240, 240];

        // Header layout: Logo + Header text à gauche, Infos entreprise à droite
        let leftY = yPosition;
        let rightY = yPosition;

        // Logo en haut à gauche
        if (settings.logo) {
            try {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                    img.src = settings.logo;
                });

                const logoWidth = 40;
                const logoHeight = (img.height / img.width) * logoWidth;
                doc.addImage(img, 'PNG', margin, leftY, logoWidth, logoHeight);
                leftY += logoHeight + 5;
            } catch (error) {
                console.warn('Erreur chargement logo:', error);
            }
        }

        // Texte d'en-tête en haut à gauche (sous le logo)
        if (settings.header) {
            doc.setFontSize(10);
            doc.setTextColor(0, 0, 0);
            doc.setFont('helvetica', 'normal');
            const headerLines = doc.splitTextToSize(settings.header, pageWidth / 2 - margin - 10);
            doc.text(headerLines, margin, leftY);
            leftY += headerLines.length * 5 + 5;
        }

        // Informations de l'entreprise en haut à droite
        doc.setFontSize(14);
        doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
        doc.setFont('helvetica', 'bold');
        doc.text(settings.company.name, pageWidth - margin, rightY, { align: 'right' });
        rightY += 6;

        doc.setFontSize(9);
        doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
        doc.setFont('helvetica', 'normal');

        if (settings.company.address) {
            doc.text(settings.company.address, pageWidth - margin, rightY, { align: 'right' });
            rightY += 4;
        }

        if (settings.company.phone) {
            doc.text(`Tél: ${settings.company.phone}`, pageWidth - margin, rightY, { align: 'right' });
            rightY += 4;
        }

        if (settings.company.email) {
            doc.text(settings.company.email, pageWidth - margin, rightY, { align: 'right' });
            rightY += 4;
        }

        // Ajuster la position Y pour le contenu suivant
        yPosition = Math.max(leftY, rightY) + 10;

        // Titre du document
        doc.setFontSize(18);
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.setFont('helvetica', 'bold');
        doc.text('REÇU DE PAIEMENT', pageWidth / 2, yPosition, { align: 'center' });
        yPosition += 20;

        // Numéro de reçu dans une boîte
        if (data.receipt_number || data.reference) {
            doc.setFillColor(lightGrayColor[0], lightGrayColor[1], lightGrayColor[2]);
            doc.rect(margin, yPosition - 5, pageWidth - 2 * margin, 12, 'F');

            doc.setFontSize(12);
            doc.setTextColor(0, 0, 0);
            doc.setFont('helvetica', 'normal');
            doc.text(`N° ${data.receipt_number || data.reference}`, pageWidth / 2, yPosition + 2, { align: 'center' });
            yPosition += 20;
        }

        // Informations du client
        const clientName = data.client?.name || data.client_name || 'N/A';
        const clientPhone = data.client?.phone || data.client_phone || '';
        const displayDate = data.date || (data.created_at ? new Date(data.created_at).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR'));

        const methodLabels = {
            'cash': 'Espèces',
            'mobile_money': 'Mobile Money',
            'bank_transfer': 'Virement',
            'bank': 'Virement'
        };
        const displayMethod = methodLabels[data.method] || data.method || 'N/A';

        doc.setFontSize(11);
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'normal');

        // Ligne: Date
        doc.text('Date:', margin, yPosition);
        doc.text(displayDate, pageWidth - margin, yPosition, { align: 'right' });
        yPosition += 8;

        // Ligne: Client
        doc.text('Client:', margin, yPosition);
        doc.text(clientName, pageWidth - margin, yPosition, { align: 'right' });
        yPosition += 8;

        // Ligne: Téléphone (si disponible)
        if (clientPhone) {
            doc.text('Téléphone:', margin, yPosition);
            doc.text(clientPhone, pageWidth - margin, yPosition, { align: 'right' });
            yPosition += 8;
        }

        // Ligne: Méthode de paiement
        doc.text('Méthode:', margin, yPosition);
        doc.text(displayMethod, pageWidth - margin, yPosition, { align: 'right' });
        yPosition += 20;

        // Détails des items
        if (data.items && data.items.length > 0) {
            doc.setFontSize(12);
            doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
            doc.setFont('helvetica', 'bold');
            doc.text('Détails du paiement:', margin, yPosition);
            yPosition += 12;

            doc.setFontSize(10);
            doc.setTextColor(0, 0, 0);
            doc.setFont('helvetica', 'normal');

            data.items.forEach(item => {
                const description = item.description || item.tracking || 'N/A';
                const amount = item.amount ? this.formatCurrency(item.amount, data.currency) : '';

                doc.text(description, margin + 10, yPosition);
                if (amount) {
                    doc.text(amount, pageWidth - margin - 10, yPosition, { align: 'right' });
                }
                yPosition += 7;
            });

            yPosition += 10;
        }

        // Ligne de séparation avant le total
        doc.setDrawColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
        doc.setLineWidth(0.5);
        doc.line(margin, yPosition, pageWidth - margin, yPosition);
        yPosition += 10;

        // Total
        doc.setFontSize(16);
        doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
        doc.setFont('helvetica', 'bold');
        doc.text('TOTAL', margin, yPosition);
        doc.text(this.formatCurrency(data.amount, data.currency || 'XAF'), pageWidth - margin, yPosition, { align: 'right' });

        // Ligne sous le total
        yPosition += 5;
        doc.line(margin, yPosition, pageWidth - margin, yPosition);
        yPosition += 20;

        // Footer text au centre
        if (settings.footer) {
            doc.setFontSize(9);
            doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
            doc.setFont('helvetica', 'normal');
            const footerLines = doc.splitTextToSize(settings.footer, pageWidth - 2 * margin);
            doc.text(footerLines, pageWidth / 2, yPosition, { align: 'center' });
            yPosition += footerLines.length * 5 + 10;
        }

        // Générer le nom du fichier
        const filename = `recu-${data.receipt_number || data.reference || 'paiement'}.pdf`;

        // Télécharger
        doc.save(filename);
        Toast.success('PDF A4 téléchargé');
    },

    /**
     * Générer un PDF de reçu de retrait (format A4)
     */
    async generatePickupReceiptPDF(data) {
        const settings = await this.loadSettings();
        const { jsPDF } = window.jspdf;

        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 25;
        let yPosition = margin;

        // Couleurs
        const primaryColor = settings.primaryColor || '#2563eb';
        const primaryRgb = this.hexToRgb(primaryColor) || [37, 99, 235];
        const grayColor = [100, 100, 100];
        const lightGrayColor = [240, 240, 240];

        // Header layout: Logo + Header text à gauche, Infos entreprise à droite
        let leftY = yPosition;
        let rightY = yPosition;

        // Logo en haut à gauche
        if (settings.logo) {
            try {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                    img.src = settings.logo;
                });

                const logoWidth = 40;
                const logoHeight = (img.height / img.width) * logoWidth;
                doc.addImage(img, 'PNG', margin, leftY, logoWidth, logoHeight);
                leftY += logoHeight + 5;
            } catch (error) {
                console.warn('Erreur chargement logo:', error);
            }
        }

        // Texte d'en-tête en haut à gauche (sous le logo)
        if (settings.header) {
            doc.setFontSize(10);
            doc.setTextColor(0, 0, 0);
            doc.setFont('helvetica', 'normal');
            const headerLines = doc.splitTextToSize(settings.header, pageWidth / 2 - margin - 10);
            doc.text(headerLines, margin, leftY);
            leftY += headerLines.length * 5 + 5;
        }

        // Informations de l'entreprise en haut à droite
        doc.setFontSize(14);
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.setFont('helvetica', 'bold');
        doc.text(settings.company.name, pageWidth - margin, rightY, { align: 'right' });
        rightY += 6;

        doc.setFontSize(9);
        doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
        doc.setFont('helvetica', 'normal');

        if (settings.company.address) {
            doc.text(settings.company.address, pageWidth - margin, rightY, { align: 'right' });
            rightY += 4;
        }

        if (settings.company.phone) {
            doc.text(`Tél: ${settings.company.phone}`, pageWidth - margin, rightY, { align: 'right' });
            rightY += 4;
        }

        if (settings.company.email) {
            doc.text(settings.company.email, pageWidth - margin, rightY, { align: 'right' });
            rightY += 4;
        }

        // Ajuster la position Y pour le contenu suivant
        yPosition = Math.max(leftY, rightY) + 10;

        // Titre du document
        doc.setFontSize(18);
        doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
        doc.setFont('helvetica', 'bold');
        doc.text('REÇU DE RETRAIT', pageWidth / 2, yPosition, { align: 'center' });
        yPosition += 20;

        // Numéro de retrait dans une boîte
        if (data.pickup_number) {
            doc.setFillColor(lightGrayColor[0], lightGrayColor[1], lightGrayColor[2]);
            doc.rect(margin, yPosition - 5, pageWidth - 2 * margin, 12, 'F');

            doc.setFontSize(12);
            doc.setTextColor(0, 0, 0);
            doc.setFont('helvetica', 'normal');
            doc.text(`N° ${data.pickup_number}`, pageWidth / 2, yPosition + 2, { align: 'center' });
            yPosition += 20;
        }

        // Informations du client
        doc.setFontSize(11);
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'normal');

        // Ligne: Date
        doc.text('Date:', margin, yPosition);
        const pickupDate = data.picked_up_at ? new Date(data.picked_up_at).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR');
        doc.text(pickupDate, pageWidth - margin, yPosition, { align: 'right' });
        yPosition += 8;

        // Ligne: Client
        doc.text('Client:', margin, yPosition);
        doc.text(data.client?.name || 'N/A', pageWidth - margin, yPosition, { align: 'right' });
        yPosition += 8;

        // Ligne: Téléphone (si disponible)
        if (data.client?.phone) {
            doc.text('Téléphone:', margin, yPosition);
            doc.text(data.client.phone, pageWidth - margin, yPosition, { align: 'right' });
            yPosition += 8;
        }

        // Ligne: Remis par
        if (data.proxy_name) {
            doc.text('Remis par:', margin, yPosition);
            doc.text(data.proxy_name, pageWidth - margin, yPosition, { align: 'right' });
            yPosition += 20;
        }

        // Colis retiré
        if (data.package) {
            doc.setFontSize(12);
            doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
            doc.setFont('helvetica', 'bold');
            doc.text('Colis retiré:', margin, yPosition);
            yPosition += 12;

            doc.setFontSize(10);
            doc.setTextColor(0, 0, 0);
            doc.setFont('helvetica', 'normal');

            const tracking = data.package.tracking_number || 'N/A';
            const description = data.package.description || '';
            doc.text(`• ${tracking}`, margin + 10, yPosition);
            if (description) {
                yPosition += 5;
                doc.setFontSize(9);
                doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
                doc.text(description, margin + 15, yPosition);
                doc.setFontSize(10);
                doc.setTextColor(0, 0, 0);
            }
            yPosition += 10;
        }

        // Ligne de séparation avant le total
        if (data.payment_collected && data.payment_collected > 0) {
            doc.setDrawColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
            doc.setLineWidth(0.5);
            doc.line(margin, yPosition, pageWidth - margin, yPosition);
            yPosition += 10;

            // Total
            doc.setFontSize(16);
            doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
            doc.setFont('helvetica', 'bold');
            doc.text('TOTAL', margin, yPosition);
            doc.text(this.formatCurrency(data.payment_collected, data.currency || 'XAF'), pageWidth - margin, yPosition, { align: 'right' });

            // Ligne sous le total
            yPosition += 5;
            doc.line(margin, yPosition, pageWidth - margin, yPosition);
            yPosition += 20;
        }

        // Footer text au centre
        if (settings.footer) {
            doc.setFontSize(9);
            doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
            doc.setFont('helvetica', 'normal');
            const footerLines = doc.splitTextToSize(settings.footer, pageWidth - 2 * margin);
            doc.text(footerLines, pageWidth / 2, yPosition, { align: 'center' });
            yPosition += footerLines.length * 5 + 10;
        }

        // Générer le nom du fichier
        const filename = `retrait-${data.pickup_number || 'retrait'}.pdf`;

        // Télécharger
        doc.save(filename);
        Toast.success('PDF A4 téléchargé');
    },

    /**
     * Générer un PDF ticket (format thermique 80mm)
     */
    async generatePaymentTicketPDF(data) {
        const settings = await this.loadSettings();
        const { jsPDF } = window.jspdf;

        // Format ticket: 80mm width
        const doc = new jsPDF('p', 'mm', [80, 297]); // 80mm width, auto height
        const pageWidth = 80;
        let yPosition = 5;

        // Couleurs
        const primaryColor = [37, 99, 235]; // #2563eb in RGB
        const grayColor = [100, 100, 100];

        // Header compact pour ticket
        if (settings.logo) {
            try {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                    img.src = settings.logo;
                });

                const logoWidth = 25;
                const logoHeight = (img.height / img.width) * logoWidth;
                if (logoHeight < 12) {
                    doc.addImage(img, 'PNG', 2, yPosition, logoWidth, logoHeight);
                    // Nom de l'entreprise à droite du logo
                    doc.setFontSize(10);
                    doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
                    doc.setFont('helvetica', 'bold');
                    doc.text(settings.company.name, pageWidth - 2, yPosition + 3, { align: 'right' });
                    yPosition += Math.max(logoHeight, 8) + 2;
                } else {
                    // Logo trop grand, mettre en haut centré
                    doc.addImage(img, 'PNG', (pageWidth - logoWidth) / 2, yPosition, logoWidth, logoHeight);
                    yPosition += logoHeight + 3;

                    doc.setFontSize(10);
                    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
                    doc.setFont('helvetica', 'bold');
                    doc.text(settings.company.name, pageWidth / 2, yPosition, { align: 'center' });
                    yPosition += 4;
                }
            } catch (error) {
                console.warn('Erreur chargement logo:', error);
                // Nom de l'entreprise centré si pas de logo
                doc.setFontSize(10);
                doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
                doc.setFont('helvetica', 'bold');
                doc.text(settings.company.name, pageWidth / 2, yPosition, { align: 'center' });
                yPosition += 4;
            }
        } else {
            // Nom de l'entreprise centré si pas de logo
            doc.setFontSize(10);
            doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
            doc.setFont('helvetica', 'bold');
            doc.text(settings.company.name, pageWidth / 2, yPosition, { align: 'center' });
            yPosition += 4;
        }

        // Contact
        if (settings.company.phone) {
            doc.setFontSize(7);
            doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
            doc.setFont('helvetica', 'normal');
            doc.text(settings.company.phone, pageWidth / 2, yPosition, { align: 'center' });
            yPosition += 3;
        }

        // Titre
        doc.setFontSize(10);
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.setFont('helvetica', 'bold');
        doc.text('REÇU DE PAIEMENT', pageWidth / 2, yPosition, { align: 'center' });
        yPosition += 6;

        // Numéro dans une boîte
        if (data.receipt_number || data.reference) {
            doc.setFillColor(245, 245, 245);
            doc.rect(2, yPosition - 2, pageWidth - 4, 6, 'F');

            doc.setFontSize(9);
            doc.setTextColor(0, 0, 0);
            doc.setFont('helvetica', 'normal');
            doc.text(`${data.receipt_number || data.reference}`, pageWidth / 2, yPosition + 1, { align: 'center' });
            yPosition += 8;
        }

        // Informations
        doc.setFontSize(8);
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'normal');

        const clientName = data.client?.name || data.client_name || 'N/A';
        doc.text(`Client:`, 2, yPosition);
        doc.text(clientName, pageWidth - 2, yPosition, { align: 'right' });
        yPosition += 3;

        const displayDate = data.date || (data.created_at ? new Date(data.created_at).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR'));
        doc.text(`Date:`, 2, yPosition);
        doc.text(displayDate, pageWidth - 2, yPosition, { align: 'right' });
        yPosition += 3;

        const methodLabels = {
            'cash': 'Espèces',
            'mobile_money': 'Mobile Money',
            'bank_transfer': 'Virement',
            'bank': 'Virement'
        };
        const displayMethod = methodLabels[data.method] || data.method || 'N/A';
        doc.text(`Méthode:`, 2, yPosition);
        doc.text(displayMethod, pageWidth - 2, yPosition, { align: 'right' });
        yPosition += 5;

        // Ligne de séparation
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.2);
        doc.line(2, yPosition, pageWidth - 2, yPosition);
        yPosition += 3;

        // Items
        if (data.items && data.items.length > 0) {
            doc.setFontSize(8);
            data.items.forEach(item => {
                const description = item.description || item.tracking || 'N/A';
                const amount = item.amount ? this.formatCurrency(item.amount, data.currency) : '';

                // Description
                const descLines = doc.splitTextToSize(description, pageWidth - 4);
                doc.text(descLines, 2, yPosition);
                yPosition += descLines.length * 3;

                if (amount) {
                    doc.text(amount, pageWidth - 2, yPosition - 3, { align: 'right' });
                }
            });
            yPosition += 2;
        }

        // Ligne de séparation avant total
        doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.setLineWidth(0.5);
        doc.line(2, yPosition, pageWidth - 2, yPosition);
        yPosition += 4;

        // Total
        doc.setFontSize(12);
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.setFont('helvetica', 'bold');
        doc.text('TOTAL', 2, yPosition);
        doc.text(this.formatCurrency(data.amount, data.currency || 'XAF'), pageWidth - 2, yPosition, { align: 'right' });
        yPosition += 6;

        // Footer text au centre
        if (settings.footer) {
            doc.setFontSize(7);
            doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
            doc.setFont('helvetica', 'normal');
            const footerLines = doc.splitTextToSize(settings.footer, pageWidth - 4);
            doc.text(footerLines, pageWidth / 2, yPosition, { align: 'center' });
            yPosition += footerLines.length * 3 + 3;
        }

        // Générer le nom du fichier
        const filename = `ticket-${data.receipt_number || data.reference || 'paiement'}.pdf`;

        // Télécharger
        doc.save(filename);
        Toast.success('Ticket PDF téléchargé');
    },

    /**
     * Générer un PDF ticket de retrait (format thermique 80mm)
     */
    async generatePickupTicketPDF(data) {
        const settings = await this.loadSettings();
        const { jsPDF } = window.jspdf;

        // Format ticket: 80mm width
        const doc = new jsPDF('p', 'mm', [80, 297]); // 80mm width, auto height
        const pageWidth = 80;
        let yPosition = 5;

        // Couleurs
        const primaryColor = [37, 99, 235]; // #2563eb in RGB
        const grayColor = [100, 100, 100];

        // Header compact pour ticket
        if (settings.logo) {
            try {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                    img.src = settings.logo;
                });

                const logoWidth = 25;
                const logoHeight = (img.height / img.width) * logoWidth;
                if (logoHeight < 12) {
                    doc.addImage(img, 'PNG', 2, yPosition, logoWidth, logoHeight);
                    // Nom de l'entreprise à droite du logo
                    doc.setFontSize(10);
                    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
                    doc.setFont('helvetica', 'bold');
                    doc.text(settings.company.name, pageWidth - 2, yPosition + 3, { align: 'right' });
                    yPosition += Math.max(logoHeight, 8) + 2;
                } else {
                    // Logo trop grand, mettre en haut centré
                    doc.addImage(img, 'PNG', (pageWidth - logoWidth) / 2, yPosition, logoWidth, logoHeight);
                    yPosition += logoHeight + 3;

                    doc.setFontSize(10);
                    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
                    doc.setFont('helvetica', 'bold');
                    doc.text(settings.company.name, pageWidth / 2, yPosition, { align: 'center' });
                    yPosition += 4;
                }
            } catch (error) {
                console.warn('Erreur chargement logo:', error);
                // Nom de l'entreprise centré si pas de logo
                doc.setFontSize(10);
                doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
                doc.setFont('helvetica', 'bold');
                doc.text(settings.company.name, pageWidth / 2, yPosition, { align: 'center' });
                yPosition += 4;
            }
        } else {
            // Nom de l'entreprise centré si pas de logo
            doc.setFontSize(10);
            doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
            doc.setFont('helvetica', 'bold');
            doc.text(settings.company.name, pageWidth / 2, yPosition, { align: 'center' });
            yPosition += 4;
        }

        // Contact
        if (settings.company.phone) {
            doc.setFontSize(7);
            doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
            doc.setFont('helvetica', 'normal');
            doc.text(settings.company.phone, pageWidth / 2, yPosition, { align: 'center' });
            yPosition += 3;
        }

        // Titre
        doc.setFontSize(10);
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.setFont('helvetica', 'bold');
        doc.text('REÇU DE RETRAIT', pageWidth / 2, yPosition, { align: 'center' });
        yPosition += 6;

        // Numéro dans une boîte
        if (data.pickup_number) {
            doc.setFillColor(245, 245, 245);
            doc.rect(2, yPosition - 2, pageWidth - 4, 6, 'F');

            doc.setFontSize(9);
            doc.setTextColor(0, 0, 0);
            doc.setFont('helvetica', 'normal');
            doc.text(`${data.pickup_number}`, pageWidth / 2, yPosition + 1, { align: 'center' });
            yPosition += 8;
        }

        // Informations
        doc.setFontSize(8);
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'normal');

        doc.text(`Client:`, 2, yPosition);
        doc.text(data.client?.name || 'N/A', pageWidth - 2, yPosition, { align: 'right' });
        yPosition += 3;

        doc.text(`Date:`, 2, yPosition);
        const pickupDate = data.picked_up_at ? new Date(data.picked_up_at).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR');
        doc.text(pickupDate, pageWidth - 2, yPosition, { align: 'right' });
        yPosition += 3;

        if (data.proxy_name) {
            doc.text(`Remis par:`, 2, yPosition);
            doc.text(data.proxy_name, pageWidth - 2, yPosition, { align: 'right' });
            yPosition += 5;
        }

        // Ligne de séparation
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.2);
        doc.line(2, yPosition, pageWidth - 2, yPosition);
        yPosition += 3;

        // Colis
        if (data.package) {
            doc.text('Colis retiré:', 2, yPosition);
            yPosition += 4;

            const tracking = data.package.tracking_number || 'N/A';
            const trackingLines = doc.splitTextToSize(`• ${tracking}`, pageWidth - 6);
            doc.text(trackingLines, 4, yPosition);
            yPosition += trackingLines.length * 3;

            if (data.package.description) {
                doc.setFontSize(7);
                doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
                const descLines = doc.splitTextToSize(data.package.description, pageWidth - 8);
                doc.text(descLines, 6, yPosition);
                yPosition += descLines.length * 2.5;
                doc.setFontSize(8);
                doc.setTextColor(0, 0, 0);
            }
            yPosition += 2;
        }

        // Ligne de séparation avant total
        if (data.payment_collected && data.payment_collected > 0) {
            doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
            doc.setLineWidth(0.5);
            doc.line(2, yPosition, pageWidth - 2, yPosition);
            yPosition += 4;

            // Total
            doc.setFontSize(12);
            doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
            doc.setFont('helvetica', 'bold');
            doc.text('TOTAL', 2, yPosition);
            doc.text(this.formatCurrency(data.payment_collected, data.currency || 'XAF'), pageWidth - 2, yPosition, { align: 'right' });
            yPosition += 6;
        }

        // Footer text au centre
        if (settings.footer) {
            doc.setFontSize(7);
            doc.setTextColor(grayColor[0], grayColor[1], grayColor[2]);
            doc.setFont('helvetica', 'normal');
            const footerLines = doc.splitTextToSize(settings.footer, pageWidth - 4);
            doc.text(footerLines, pageWidth / 2, yPosition, { align: 'center' });
            yPosition += footerLines.length * 3 + 3;
        }

        // Générer le nom du fichier
        const filename = `ticket-retrait-${data.pickup_number || 'retrait'}.pdf`;

        // Télécharger
        doc.save(filename);
        Toast.success('Ticket PDF téléchargé');
    },

    /**
     * Afficher le menu de choix de format d'impression
     */
    showPrintMenu(options) {
        const { type, id, data } = options;
        const currentFormat = this.getDefaultPrintFormat();
        
        const formats = [
            { key: 'quick', icon: 'printer', label: 'Impression rapide', desc: 'Ticket HTML (imprimante thermique)' },
            { key: 'pdf_a4', icon: 'file-text', label: 'PDF A4', desc: 'Document complet format A4' },
            { key: 'pdf_ticket', icon: 'receipt', label: 'PDF Ticket', desc: 'PDF format 80mm thermique' }
        ];
        
        Modal.open({
            title: 'Format d\'impression',
            size: 'small',
            content: `
                <div class="print-format-selector">
                    ${formats.map(f => `
                        <label class="print-format-option ${f.key === currentFormat ? 'selected' : ''}" data-format="${f.key}">
                            <input type="radio" name="print_format" value="${f.key}" ${f.key === currentFormat ? 'checked' : ''}>
                            <div class="print-format-icon">${Icons.get(f.icon, {size: 20})}</div>
                            <div class="print-format-info">
                                <span class="print-format-label">${f.label}</span>
                                <span class="print-format-desc">${f.desc}</span>
                            </div>
                            ${f.key === currentFormat ? `<span class="print-format-default">Par défaut</span>` : ''}
                        </label>
                    `).join('')}
                    
                    <div class="print-format-remember">
                        <label class="toggle-label">
                            <input type="checkbox" id="rememberFormat" checked>
                            <span>Mémoriser ce choix</span>
                        </label>
                    </div>
                </div>
                <style>
                    .print-format-selector { display: flex; flex-direction: column; gap: 8px; }
                    .print-format-option { display: flex; align-items: center; gap: 12px; padding: 12px; border: 2px solid var(--color-gray-200); border-radius: var(--radius-md); cursor: pointer; transition: all 0.15s; }
                    .print-format-option:hover { border-color: var(--color-primary-300); background: var(--color-primary-50); }
                    .print-format-option.selected { border-color: var(--color-primary); background: var(--color-primary-50); }
                    .print-format-option input { display: none; }
                    .print-format-icon { width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; background: var(--color-gray-100); border-radius: var(--radius-md); color: var(--color-gray-600); }
                    .print-format-option.selected .print-format-icon { background: var(--color-primary-100); color: var(--color-primary); }
                    .print-format-info { flex: 1; }
                    .print-format-label { display: block; font-weight: 500; color: var(--color-gray-900); }
                    .print-format-desc { display: block; font-size: 11px; color: var(--color-gray-500); margin-top: 2px; }
                    .print-format-default { font-size: 10px; padding: 2px 6px; background: var(--color-primary-100); color: var(--color-primary-700); border-radius: var(--radius-sm); }
                    .print-format-remember { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--color-gray-200); }
                    .print-format-remember .toggle-label { font-size: 13px; }
                    [data-theme="dark"] .print-format-option { border-color: var(--color-gray-700); }
                    [data-theme="dark"] .print-format-option:hover { background: var(--color-gray-800); }
                    [data-theme="dark"] .print-format-option.selected { background: var(--color-gray-800); }
                    [data-theme="dark"] .print-format-icon { background: var(--color-gray-700); }
                    [data-theme="dark"] .print-format-label { color: var(--color-gray-100); }
                    [data-theme="dark"] .print-format-remember { border-color: var(--color-gray-700); }
                </style>
            `,
            footer: `
                <button class="btn btn-secondary" onclick="Modal.close()">Annuler</button>
                <button class="btn btn-primary" id="btnPrintNow">${Icons.get('printer', {size:16})} Imprimer</button>
            `
        });
        
        // Attacher les événements
        setTimeout(() => {
            // Sélection du format
            document.querySelectorAll('.print-format-option').forEach(opt => {
                opt.addEventListener('click', () => {
                    document.querySelectorAll('.print-format-option').forEach(o => o.classList.remove('selected'));
                    opt.classList.add('selected');
                    opt.querySelector('input').checked = true;
                });
            });
            
            // Bouton imprimer
            document.getElementById('btnPrintNow')?.addEventListener('click', async () => {
                const selectedFormat = document.querySelector('input[name="print_format"]:checked')?.value || 'quick';
                const remember = document.getElementById('rememberFormat')?.checked;
                
                if (remember) {
                    this.setDefaultPrintFormat(selectedFormat);
                }
                
                Modal.close();
                await this.executePrint(selectedFormat, type, id, data);
            });
        }, 100);
    }
};
