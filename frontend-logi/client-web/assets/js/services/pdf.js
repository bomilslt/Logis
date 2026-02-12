/**
 * PDF Service - Generation de recus et factures
 * Utilise le branding configuré par le tenant (logo, couleur, footer)
 */

const PDFService = {
    /**
     * Generer un recu pour un colis
     */
    generateReceipt(pkg) {
        const content = this._buildReceiptHTML(pkg);
        this._openPrintWindow(content, `Recu-${pkg.supplier_tracking}`);
    },
    
    /**
     * Construire le HTML du recu
     */
    _buildReceiptHTML(pkg) {
        const transportLabel = ShippingService.getTransportLabel(pkg.transport_mode);
        const typeLabel = ShippingService.getTypeLabel(pkg.package_type, pkg.transport_mode);
        const warehouseLabel = ShippingService.getWarehouseLabel(
            pkg.destination?.country, 
            pkg.destination?.warehouse
        );
        const countryLabel = ShippingService.getCountryLabel(pkg.destination?.country);
        const statusLabel = CONFIG.PACKAGE_STATUSES[pkg.status]?.label || pkg.status;
        const date = new Date(pkg.created_at).toLocaleDateString('fr-FR');
        
        // Récupérer le branding du tenant
        const branding = CONFIG.BRANDING || {};
        const tenant = CONFIG.TENANT_INFO || {};
        const primaryColor = branding.primary_color || '#2563eb';
        const logo = branding.logo || '';
        const footer = branding.footer || '';
        const companyName = tenant.name || CONFIG.APP_NAME;
        const companyPhone = tenant.phone || '';
        const companyEmail = tenant.email || '';
        const companyAddress = tenant.address || '';
        
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Recu - ${pkg.supplier_tracking}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Segoe UI', Arial, sans-serif; 
            padding: 40px; 
            max-width: 800px; 
            margin: 0 auto;
            color: #333;
        }
        .header { 
            display: flex; 
            justify-content: space-between; 
            align-items: flex-start;
            border-bottom: 3px solid ${primaryColor}; 
            padding-bottom: 20px; 
            margin-bottom: 30px; 
        }
        .header-left {
            display: flex;
            align-items: center;
            gap: 15px;
        }
        .logo-img {
            max-height: 50px;
            max-width: 120px;
            object-fit: contain;
        }
        .company-info h2 {
            font-size: 22px;
            font-weight: bold;
            color: ${primaryColor};
            margin-bottom: 4px;
        }
        .company-info p {
            font-size: 11px;
            color: #666;
            margin: 1px 0;
        }
        .receipt-info { 
            text-align: right; 
            font-size: 14px;
            color: #666;
        }
        .receipt-number {
            font-size: 18px;
            font-weight: bold;
            color: ${primaryColor};
        }
        .section { 
            margin-bottom: 25px; 
        }
        .section-title { 
            font-size: 14px; 
            font-weight: 600; 
            color: #666; 
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 10px;
            padding-bottom: 5px;
            border-bottom: 1px solid #eee;
        }
        .tracking-box {
            background: #f8fafc;
            border: 2px dashed ${primaryColor};
            border-radius: 8px;
            padding: 20px;
            text-align: center;
            margin-bottom: 25px;
        }
        .tracking-label {
            font-size: 12px;
            color: #666;
            margin-bottom: 5px;
        }
        .tracking-number {
            font-size: 24px;
            font-weight: bold;
            font-family: monospace;
            color: ${primaryColor};
        }
        .grid { 
            display: grid; 
            grid-template-columns: 1fr 1fr; 
            gap: 15px; 
        }
        .field { 
            padding: 10px 0;
        }
        .field-label { 
            font-size: 12px; 
            color: #666; 
            margin-bottom: 3px;
        }
        .field-value { 
            font-size: 15px; 
            font-weight: 500;
        }
        .description {
            background: #f8fafc;
            padding: 15px;
            border-radius: 6px;
            font-size: 14px;
            line-height: 1.5;
        }
        .status-badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 13px;
            font-weight: 500;
            background: ${primaryColor}20;
            color: ${primaryColor};
        }
        .footer { 
            margin-top: 40px; 
            padding-top: 20px; 
            border-top: 1px solid #eee; 
            text-align: center;
            font-size: 12px;
            color: #999;
        }
        .footer-custom {
            background: #f8fafc;
            padding: 15px;
            border-radius: 6px;
            margin-bottom: 15px;
            font-size: 11px;
            color: #666;
            white-space: pre-line;
        }
        .estimate-box {
            background: linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}dd 100%);
            color: white;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
        }
        .estimate-label {
            font-size: 12px;
            opacity: 0.9;
        }
        .estimate-value {
            font-size: 32px;
            font-weight: bold;
        }
        @media print {
            body { padding: 20px; }
            .no-print { display: none; }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="header-left">
            ${logo ? `<img src="${logo}" alt="Logo" class="logo-img">` : ''}
            <div class="company-info">
                <h2>${companyName}</h2>
                ${companyAddress ? `<p>${companyAddress}</p>` : ''}
                ${companyPhone ? `<p>Tél: ${companyPhone}</p>` : ''}
                ${companyEmail ? `<p>${companyEmail}</p>` : ''}
            </div>
        </div>
        <div class="receipt-info">
            <div class="receipt-number">REÇU</div>
            <div>Date: ${date}</div>
        </div>
    </div>
    
    <div class="tracking-box">
        <div class="tracking-label">Numéro de suivi fournisseur</div>
        <div class="tracking-number">${pkg.supplier_tracking}</div>
    </div>
    
    <div class="section">
        <div class="section-title">Description</div>
        <div class="description">${pkg.description || 'Non renseignée'}</div>
    </div>
    
    <div class="section">
        <div class="section-title">Détails du colis</div>
        <div class="grid">
            <div class="field">
                <div class="field-label">Transport</div>
                <div class="field-value">${transportLabel}</div>
            </div>
            <div class="field">
                <div class="field-label">Type</div>
                <div class="field-value">${typeLabel}</div>
            </div>
            <div class="field">
                <div class="field-label">Statut</div>
                <div class="field-value"><span class="status-badge">${statusLabel}</span></div>
            </div>
            <div class="field">
                <div class="field-label">Valeur déclarée</div>
                <div class="field-value">${pkg.declared_value ? pkg.declared_value + ' ' + pkg.currency : 'N/A'}</div>
            </div>
            ${pkg.weight ? `
            <div class="field">
                <div class="field-label">Poids</div>
                <div class="field-value">${pkg.weight} kg</div>
            </div>
            ` : ''}
            ${pkg.cbm ? `
            <div class="field">
                <div class="field-label">Volume</div>
                <div class="field-value">${pkg.cbm} m³</div>
            </div>
            ` : ''}
            ${pkg.quantity > 1 ? `
            <div class="field">
                <div class="field-label">Quantité</div>
                <div class="field-value">${pkg.quantity} pièce(s)</div>
            </div>
            ` : ''}
        </div>
    </div>
    
    <div class="section">
        <div class="section-title">Destination</div>
        <div class="grid">
            <div class="field">
                <div class="field-label">Pays</div>
                <div class="field-value">${countryLabel}</div>
            </div>
            <div class="field">
                <div class="field-label">Point de retrait</div>
                <div class="field-value">${warehouseLabel}</div>
            </div>
        </div>
    </div>
    
    <div class="section">
        <div class="section-title">Destinataire</div>
        <div class="grid">
            <div class="field">
                <div class="field-label">Nom</div>
                <div class="field-value">${pkg.recipient?.name || 'N/A'}</div>
            </div>
            <div class="field">
                <div class="field-label">Téléphone</div>
                <div class="field-value">${pkg.recipient?.phone || 'N/A'}</div>
            </div>
        </div>
    </div>
    
    <div class="footer">
        ${footer ? `<div class="footer-custom">${footer}</div>` : ''}
        <p>${companyName} - Votre partenaire logistique</p>
        <p>Ce document est généré automatiquement et ne constitue pas une facture officielle.</p>
    </div>
    
    <script>
        window.onload = function() { window.print(); }
    </script>
</body>
</html>
        `;
    },
    
    /**
     * Ouvrir une fenetre d'impression
     */
    _openPrintWindow(content, title) {
        const printWindow = window.open('', '_blank');
        
        if (!printWindow) {
            // Popup bloqué - utiliser une alternative
            Toast.error('Popup bloqué. Autorisez les popups pour imprimer.');
            
            // Alternative: créer un iframe caché pour l'impression
            const iframe = document.createElement('iframe');
            iframe.style.position = 'fixed';
            iframe.style.right = '0';
            iframe.style.bottom = '0';
            iframe.style.width = '0';
            iframe.style.height = '0';
            iframe.style.border = 'none';
            document.body.appendChild(iframe);
            
            const iframeDoc = iframe.contentWindow || iframe.contentDocument;
            const doc = iframeDoc.document || iframeDoc;
            doc.open();
            doc.write(content);
            doc.close();
            
            // Attendre le chargement puis imprimer
            iframe.onload = () => {
                try {
                    iframe.contentWindow.print();
                } catch (e) {
                    console.error('Print error:', e);
                }
                // Supprimer l'iframe après un délai
                setTimeout(() => {
                    document.body.removeChild(iframe);
                }, 1000);
            };
            return;
        }
        
        printWindow.document.write(content);
        printWindow.document.close();
    }
};
