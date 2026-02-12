/**
 * ExportService - Export PDF et Excel
 * Style professionnel et sobre
 */

const ExportService = {
    defaults: {
        companyName: 'Express Cargo',
        currency: 'XAF',
        dateFormat: 'fr-FR'
    },
    
    _settings: null,
    
    async loadSettings() {
        if (this._settings) return this._settings;
        
        try {
            if (typeof API !== 'undefined' && API.settings) {
                const data = await API.settings.get();
                this._settings = {
                    logo: data.config?.config_data?.invoice?.logo || '',
                    companyName: data.tenant?.name || this.defaults.companyName,
                    companyPhone: data.tenant?.phone || '',
                    companyEmail: data.tenant?.email || '',
                    companyAddress: data.tenant?.address || '',
                    primaryColor: data.config?.config_data?.invoice?.primary_color || '#1a56db',
                    exportFooter: data.config?.config_data?.export?.footer || '',
                    invoiceHeader: data.config?.config_data?.invoice?.header || '',
                    invoiceFooter: data.config?.config_data?.invoice?.footer || ''
                };
            } else {
                this._settings = this._getDefaultSettings();
            }
        } catch (error) {
            console.error('Erreur chargement settings:', error);
            this._settings = this._getDefaultSettings();
        }
        return this._settings;
    },
    
    _getDefaultSettings() {
        return {
            logo: '', companyName: this.defaults.companyName,
            companyPhone: '', companyEmail: '', companyAddress: '',
            primaryColor: '#1a56db', exportFooter: '', invoiceHeader: '', invoiceFooter: ''
        };
    },
    
    clearCache() { this._settings = null; },

    isJsPDFAvailable() {
        return typeof window.jspdf !== 'undefined' || typeof window.jsPDF !== 'undefined';
    },
 
    getJsPDF() {
        if (window.jspdf?.jsPDF) return window.jspdf.jsPDF;
        if (window.jsPDF) return window.jsPDF;
        throw new Error('jsPDF non disponible');
    },
 
    isExcelJSAvailable() {
        return typeof window.ExcelJS !== 'undefined';
    },
 
    getExcelJS() {
        if (window.ExcelJS) return window.ExcelJS;
        throw new Error('ExcelJS non disponible');
    },

    // ========== FORMATAGE ==========
    
    formatMoney(amount, currency) {
        const num = parseFloat(amount) || 0;
        const parts = Math.round(num).toString().split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
        return parts.join(',') + ' ' + (currency || this.defaults.currency);
    },

    formatNumber(num) {
        const n = parseFloat(num) || 0;
        return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    },

    formatDate(date) {
        if (!date) return '-';
        try {
            const d = new Date(date);
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear();
            return `${day}/${month}/${year}`;
        } catch (e) { return '-'; }
    },

    formatDateTime(date) {
        if (!date) return '-';
        try {
            const d = new Date(date);
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear();
            const hours = String(d.getHours()).padStart(2, '0');
            const mins = String(d.getMinutes()).padStart(2, '0');
            return `${day}/${month}/${year} ${hours}:${mins}`;
        } catch (e) { return '-'; }
    },

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)] : [26, 86, 219];
    },

    _getStatusLabel(status) {
        const labels = {
            pending: 'En attente', received: 'Recu', in_transit: 'En transit',
            arrived_port: 'Arrive', customs: 'Douane', out_for_delivery: 'En livraison',
            delivered: 'Livre', paid: 'Paye', unpaid: 'Impaye', partial: 'Partiel',
            active: 'Actif', inactive: 'Inactif', scheduled: 'Programme',
            departed: 'Parti', arrived: 'Arrive', cancelled: 'Annule'
        };
        return labels[status] || status || '-';
    },

    _getPaymentMethodLabel(method) {
        const labels = { cash: 'Especes', mobile_money: 'Mobile Money', bank_transfer: 'Virement', bank: 'Virement', card: 'Carte' };
        return labels[method] || method || '-';
    },

    _getTransportLabel(mode) {
        const labels = { sea: 'Maritime', air_normal: 'Aerien Normal', air_express: 'Aerien Express' };
        return labels[mode] || mode || '-';
    },

    _getCountryLabel(code) {
        if (typeof RatesService !== 'undefined') {
            const originLabel = RatesService.getOriginLabel(code);
            if (originLabel && originLabel !== code && originLabel !== 'N/A') return originLabel;
            const destLabel = RatesService.getDestinationLabel(code);
            if (destLabel && destLabel !== code && destLabel !== 'N/A') return destLabel;
        }
        const countries = {
            'China': 'Chine', 'CN': 'Chine', 'cn': 'Chine',
            'Cameroon': 'Cameroun', 'CM': 'Cameroun', 'cmr': 'Cameroun', 'CMR': 'Cameroun',
            'Dubai': 'Dubai', 'AE': 'Dubai', 'UAE': 'Dubai',
            'Turkey': 'Turquie', 'TR': 'Turquie',
            'Gabon': 'Gabon', 'GA': 'Gabon',
            'Congo': 'Congo', 'CG': 'Congo',
            'DRC': 'RD Congo', 'CD': 'RD Congo', 'RDC': 'RD Congo',
            'Nigeria': 'Nigeria', 'NG': 'Nigeria',
            'Senegal': 'Senegal', 'SN': 'Senegal'
        };
        return countries[code] || code || '-';
    },

    _getDateString() {
        const now = new Date();
        return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    },


    // ========== PDF HEADER/FOOTER ==========
    
    async _addHeader(doc, title, subtitle, settings) {
        const pageWidth = doc.internal.pageSize.getWidth();
        const primaryColor = this.hexToRgb(settings?.primaryColor || '#1a56db');
        let y = 15;
        
        // Logo a gauche
        if (settings?.logo?.startsWith('data:image')) {
            try { doc.addImage(settings.logo, 'PNG', 15, y, 35, 18); } catch (e) {}
        }
        
        // Infos entreprise a droite
        let infoY = y;
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.text(settings?.companyName || 'Express Cargo', pageWidth - 15, infoY, { align: 'right' });
        infoY += 5;
        
        doc.setFontSize(8);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(80);
        
        if (settings?.companyAddress) {
            doc.text(settings.companyAddress, pageWidth - 15, infoY, { align: 'right' });
            infoY += 4;
        }
        if (settings?.companyPhone) {
            doc.text('Tel: ' + settings.companyPhone, pageWidth - 15, infoY, { align: 'right' });
            infoY += 4;
        }
        if (settings?.companyEmail) {
            doc.text('Email: ' + settings.companyEmail, pageWidth - 15, infoY, { align: 'right' });
            infoY += 4;
        }
        
        y = Math.max(y + 22, infoY + 5);
        
        // Ligne separatrice
        doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.setLineWidth(0.5);
        doc.line(15, y, pageWidth - 15, y);
        y += 10;
        
        // Titre
        doc.setFontSize(16);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(30);
        doc.text(title, pageWidth / 2, y, { align: 'center' });
        y += 7;
        
        if (subtitle) {
            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
            doc.setTextColor(80);
            doc.text(subtitle, pageWidth / 2, y, { align: 'center' });
            y += 5;
        }
        
        doc.setFontSize(8);
        doc.setTextColor(120);
        doc.text('Genere le ' + this.formatDateTime(new Date()), pageWidth / 2, y, { align: 'center' });
        
        return y + 10;
    },

    _addFooter(doc, settings) {
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const totalPages = doc.internal.getNumberOfPages();
        const primaryColor = this.hexToRgb(settings?.primaryColor || '#1a56db');
        
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setDrawColor(200);
            doc.setLineWidth(0.2);
            doc.line(15, pageHeight - 15, pageWidth - 15, pageHeight - 15);
            
            doc.setFontSize(8);
            doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
            doc.text(settings?.companyName || 'Express Cargo', 15, pageHeight - 10);
            
            doc.setTextColor(100);
            if (settings?.exportFooter) {
                doc.text(settings.exportFooter, pageWidth / 2, pageHeight - 10, { align: 'center' });
            }
            doc.text('Page ' + i + '/' + totalPages, pageWidth - 15, pageHeight - 10, { align: 'right' });
        }
    },

    // ========== EXPORT PDF GENERIQUE ==========
    
    async toPDF(options) {
        const { title, subtitle, columns, data, filename, totals } = options;
        
        if (!this.isJsPDFAvailable()) throw new Error('jsPDF non disponible');
        
        const settings = await this.loadSettings();
        const jsPDF = this.getJsPDF();
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        
        let y = await this._addHeader(doc, title, subtitle, settings);
        
        const tableWidth = pageWidth - 30;
        const colCount = columns.length;
        const colWidths = columns.map(c => c.width || (tableWidth / colCount));
        
        // En-tete tableau
        doc.setFillColor(245, 245, 245);
        doc.rect(15, y, tableWidth, 8, 'F');
        doc.setFontSize(9);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(50);
        
        let x = 15;
        columns.forEach((col, i) => {
            doc.text(col.header, x + 2, y + 5.5);
            x += colWidths[i];
        });
        y += 10;
        
        // Lignes de donnees
        doc.setFont(undefined, 'normal');
        doc.setFontSize(8);
        
        data.forEach((row, rowIndex) => {
            if (y > 270) { doc.addPage(); y = 20; }
            
            if (rowIndex % 2 === 0) {
                doc.setFillColor(252, 252, 252);
                doc.rect(15, y - 3, tableWidth, 7, 'F');
            }
            
            x = 15;
            doc.setTextColor(60);
            columns.forEach((col, i) => {
                let value = row[col.key];
                if (col.format === 'money') value = this.formatMoney(value);
                else if (col.format === 'number') value = this.formatNumber(value);
                else if (col.format === 'date') value = this.formatDate(value);
                else if (col.format === 'status') value = this._getStatusLabel(value);
                else if (col.format === 'transport') value = this._getTransportLabel(value);
                else if (col.format === 'country') value = this._getCountryLabel(value);
                doc.text(String(value || '-'), x + 2, y + 1);
                x += colWidths[i];
            });
            y += 7;
        });
        
        if (totals && totals.length > 0) {
            y += 5;
            doc.setDrawColor(200);
            doc.line(15, y, pageWidth - 15, y);
            y += 5;
            doc.setFont(undefined, 'bold');
            doc.setFontSize(9);
            totals.forEach(t => {
                doc.setTextColor(50);
                doc.text(t.label, 15, y);
                doc.text(t.value, pageWidth - 15, y, { align: 'right' });
                y += 6;
            });
        }
        
        this._addFooter(doc, settings);
        doc.save(filename || 'export.pdf');
    },


    // ========== EXPORT CSV ==========
     
    toCSV(options) {
        const { columns, data, filename } = options;
         
        let csv = columns.map(c => '"' + c.header + '"').join(';') + '\n';
         
        data.forEach(row => {
            csv += columns.map(col => {
                let value = row[col.key];
                if (col.format === 'money' || col.format === 'number') {
                    value = parseFloat(value) || 0;
                } else if (col.format === 'date') {
                    value = this.formatDate(value);
                } else if (col.format === 'country') {
                    value = this._getCountryLabel(value);
                }
                if (typeof value === 'string') value = value.replace(/"/g, '""');
                return '"' + (value ?? '') + '"';
            }).join(';') + '\n';
        });
         
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename || 'export.csv';
        link.click();
        URL.revokeObjectURL(link.href);
    },
 
    // ========== EXPORT EXCEL ==========
     
    async toExcel(options) {
        const { columns, data, filename, sheetName } = options;
         
        if (!this.isExcelJSAvailable()) throw new Error('ExcelJS non disponible');
         
        const ExcelJS = this.getExcelJS();
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet(sheetName || 'Export');
         
        // Style d'en-tete
        const headerStyle = {
            font: { bold: true, color: { argb: 'FFFFFFFF' } },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } },
            alignment: { horizontal: 'center', vertical: 'middle' }
        };
         
        // Style de donnees
        const dataStyle = {
            alignment: { horizontal: 'left', vertical: 'middle' }
        };
         
        // En-tete
        const headerRow = worksheet.addRow(columns.map(c => c.header));
        headerRow.eachCell((cell, colNumber) => {
            cell.style = headerStyle;
            worksheet.getColumn(colNumber).width = c.width || 15;
        });
         
        // Donnees
        data.forEach(row => {
            const values = columns.map(col => {
                let value = row[col.key];
                if (col.format === 'money') value = this.formatMoney(value);
                else if (col.format === 'number') value = this.formatNumber(value);
                else if (col.format === 'date') value = this.formatDate(value);
                else if (col.format === 'status') value = this._getStatusLabel(value);
                else if (col.format === 'transport') value = this._getTransportLabel(value);
                else if (col.format === 'country') value = this._getCountryLabel(value);
                return value || '-';
            });
            const dataRow = worksheet.addRow(values);
            dataRow.eachCell(cell => { cell.style = dataStyle; });
        });
         
        // Generer le fichier
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename || 'export.xlsx';
        link.click();
        URL.revokeObjectURL(link.href);
    },

    // ========== RAPPORT STATISTIQUES ==========
     
    async exportStatisticsReport(stats, options = {}) {
        try {
            if (!this.isJsPDFAvailable()) throw new Error('jsPDF non disponible');
             
            const settings = await this.loadSettings();
            const jsPDF = this.getJsPDF();
            const doc = new jsPDF('p', 'mm', 'a4');
             
            const period = options.period || 'Periode';
            let y = await this._addHeader(doc, 'Rapport Statistiques', period, settings);
             
            // Section KPIs
            y += 5;
            doc.setFontSize(11);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(50);
            doc.text('Indicateurs cles', 15, y);
            y += 8;
             
            const kpis = [
                { label: 'Chiffre d\'affaires', value: this.formatMoney(stats.revenue || 0) },
                { label: 'Colis traites', value: this.formatNumber(stats.packages_count || 0) },
                { label: 'Nouveaux clients', value: this.formatNumber(stats.new_clients || 0) },
                { label: 'Taux de livraison', value: (stats.delivery_rate || 0) + '%' },
                { label: 'Impayes', value: this.formatMoney(stats.unpaid || 0) }
            ];
             
            doc.setFontSize(9);
            doc.setFont(undefined, 'normal');
            kpis.forEach(kpi => {
                doc.setTextColor(80);
                doc.text(kpi.label + ':', 20, y);
                doc.setTextColor(30);
                doc.setFont(undefined, 'bold');
                doc.text(kpi.value, 80, y);
                doc.setFont(undefined, 'normal');
                y += 6;
            });
             
            // Section par transport
            if (stats.by_transport && Object.keys(stats.by_transport).length > 0) {
                y += 10;
                doc.setFontSize(11);
                doc.setFont(undefined, 'bold');
                doc.setTextColor(50);
                doc.text('Repartition par transport', 15, y);
                y += 8;
                 
                doc.setFontSize(9);
                doc.setFont(undefined, 'normal');
                for (const [mode, data] of Object.entries(stats.by_transport)) {
                    const label = this._getTransportLabel(mode);
                    doc.setTextColor(80);
                    doc.text(label + ':', 20, y);
                    doc.setTextColor(30);
                    doc.text(this.formatNumber(data.count || 0) + ' colis - ' + this.formatMoney(data.amount || 0), 70, y);
                    y += 6;
                }
            }
             
            this._addFooter(doc, settings);
            doc.save(options.filename || 'rapport_statistiques.pdf');
             
        } catch (error) {
            console.error('Export statistics error:', error);
            throw error;
        }
    },
 
    // ========== EXPORT CLIENTS ==========
     
    exportClients(clients, options = {}) {
        const { format, filename } = options;
        const columns = [
            { key: 'name', header: 'Nom', width: 30 },
            { key: 'email', header: 'Email', width: 25 },
            { key: 'phone', header: 'Telephone', width: 20 },
            { key: 'packages_count', header: 'Colis', width: 15, format: 'number' },
            { key: 'balance', header: 'Solde', width: 20, format: 'money' },
            { key: 'created_at', header: 'Inscription', width: 20, format: 'date' }
        ];
         
        const data = clients.map(c => ({
            name: c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Client',
            email: c.email || '-',
            phone: c.phone || '-',
            packages_count: c.packages_count || c.stats?.packages_count || 0,
            balance: c.balance || c.stats?.balance || 0,
            created_at: c.created_at
        }));
         
        if (format === 'pdf') {
            return this.toPDF({
                title: options.title || 'Liste des Clients',
                columns,
                data,
                filename: filename || 'clients_export.pdf'
            });
        } else if (format === 'excel') {
            return this.toExcel({
                columns,
                data,
                filename: filename || 'clients_export.xlsx',
                sheetName: 'Clients'
            });
        } else {
            return this.toCSV({
                columns,
                data,
                filename: filename || 'clients_export.csv'
            });
        }
    },


    // ========== RAPPORT DEPARTS ==========
    
    async exportDeparturesReport(data, options = {}) {
        try {
            if (!this.isJsPDFAvailable()) throw new Error('jsPDF non disponible');
            
            const settings = await this.loadSettings();
            const jsPDF = this.getJsPDF();
            const doc = new jsPDF('l', 'mm', 'a4'); // Paysage
            const pageWidth = doc.internal.pageSize.getWidth();
            
            const period = options.period || 'Periode';
            let y = await this._addHeader(doc, 'Rapport des Departs', period, settings);
            
            // Resume
            y += 5;
            doc.setFontSize(10);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(50);
            doc.text('Resume:', 15, y);
            y += 6;
            
            doc.setFontSize(9);
            doc.setFont(undefined, 'normal');
            const totalGain = (data.total_revenue || 0) - (data.total_expenses || 0);
            const summaryItems = [
                { label: 'Departs', value: (data.departures || []).length },
                { label: 'Colis', value: this.formatNumber(data.total_packages || 0) },
                { label: 'Revenus', value: this.formatMoney(data.total_revenue || 0) },
                { label: 'Depenses', value: this.formatMoney(data.total_expenses || 0) },
                { label: 'Gain', value: this.formatMoney(totalGain) }
            ];
            
            let sx = 15;
            summaryItems.forEach(item => {
                doc.setTextColor(80);
                doc.text(item.label + ': ', sx, y);
                doc.setTextColor(30);
                doc.setFont(undefined, 'bold');
                doc.text(String(item.value), sx + doc.getTextWidth(item.label + ': '), y);
                doc.setFont(undefined, 'normal');
                sx += 55;
            });
            y += 12;
            
            // Tableau des departs
            if (data.departures && data.departures.length > 0) {
                const colWidths = [25, 30, 45, 35, 25, 30, 30, 30];
                const headers = ['Date', 'Reference', 'Route', 'Transport', 'Colis', 'Revenus', 'Depenses', 'Gain'];
                
                doc.setFillColor(245, 245, 245);
                doc.rect(15, y, pageWidth - 30, 8, 'F');
                doc.setFontSize(8);
                doc.setFont(undefined, 'bold');
                doc.setTextColor(50);
                
                let x = 15;
                headers.forEach((h, i) => {
                    doc.text(h, x + 2, y + 5.5);
                    x += colWidths[i];
                });
                y += 10;
                
                doc.setFont(undefined, 'normal');
                data.departures.forEach((dep, idx) => {
                    if (y > 190) { doc.addPage(); y = 20; }
                    
                    if (idx % 2 === 0) {
                        doc.setFillColor(252, 252, 252);
                        doc.rect(15, y - 3, pageWidth - 30, 7, 'F');
                    }
                    
                    const gain = (dep.revenue || 0) - (dep.expenses_total || 0);
                    const originLabel = this._getCountryLabel(dep.origin);
                    const destLabel = this._getCountryLabel(dep.destination);
                    const route = originLabel + ' -> ' + destLabel;
                    
                    const row = [
                        this.formatDate(dep.departure_date),
                        dep.reference || '-',
                        route,
                        this._getTransportLabel(dep.transport_mode),
                        String(dep.packages_count || 0),
                        this.formatMoney(dep.revenue || 0),
                        this.formatMoney(dep.expenses_total || 0),
                        this.formatMoney(gain)
                    ];
                    
                    x = 15;
                    doc.setTextColor(60);
                    row.forEach((cell, i) => {
                        let text = String(cell);
                        const maxWidth = colWidths[i] - 4;
                        while (doc.getTextWidth(text) > maxWidth && text.length > 3) {
                            text = text.slice(0, -4) + '...';
                        }
                        doc.text(text, x + 2, y + 1);
                        x += colWidths[i];
                    });
                    y += 7;
                });
            } else {
                doc.setFontSize(10);
                doc.setTextColor(120);
                doc.text('Aucun depart sur cette periode', pageWidth / 2, y + 10, { align: 'center' });
            }
            
            this._addFooter(doc, settings);
            doc.save(options.filename || 'rapport_departs.pdf');
            
        } catch (error) {
            console.error('Export departures error:', error);
            throw error;
        }
    },


    // ========== RAPPORT COMPTABILITE ==========
    
    async exportAccountingReport(data, options = {}) {
        try {
            if (!this.isJsPDFAvailable()) throw new Error('jsPDF non disponible');
            
            const settings = await this.loadSettings();
            const jsPDF = this.getJsPDF();
            const doc = new jsPDF('p', 'mm', 'a4');
            const pageWidth = doc.internal.pageSize.getWidth();
            
            const period = options.period || 'Periode';
            let y = await this._addHeader(doc, 'Rapport Comptable', period, settings);
            
            const revenue = data.revenue?.total || 0;
            const expDepartures = data.expenses?.departures || 0;
            const expSalaries = data.expenses?.salaries || 0;
            const expCharges = data.expenses?.charges || 0;
            const totalExpenses = expDepartures + expSalaries + expCharges;
            const netProfit = revenue - totalExpenses;
            const margin = revenue > 0 ? ((netProfit / revenue) * 100).toFixed(1) : 0;
            
            // Bilan
            y += 5;
            doc.setFontSize(11);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(50);
            doc.text('Bilan de la periode', 15, y);
            y += 10;
            
            const bilanData = [
                { label: 'Total Recettes', value: this.formatMoney(revenue), color: [16, 185, 129] },
                { label: 'Total Depenses', value: this.formatMoney(totalExpenses), color: [239, 68, 68] },
                { label: 'Resultat Net', value: (netProfit >= 0 ? '+' : '') + this.formatMoney(netProfit), color: netProfit >= 0 ? [16, 185, 129] : [239, 68, 68] },
                { label: 'Marge Nette', value: margin + '%', color: [100, 100, 100] }
            ];
            
            doc.setFontSize(10);
            bilanData.forEach(item => {
                doc.setFont(undefined, 'normal');
                doc.setTextColor(80);
                doc.text(item.label, 20, y);
                doc.setFont(undefined, 'bold');
                doc.setTextColor(item.color[0], item.color[1], item.color[2]);
                doc.text(item.value, pageWidth - 20, y, { align: 'right' });
                y += 8;
            });
            
            // Detail recettes
            y += 10;
            doc.setFontSize(11);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(50);
            doc.text('Detail des Recettes', 15, y);
            y += 8;
            
            doc.setFontSize(9);
            doc.setFont(undefined, 'normal');
            
            // Afficher les paiements par méthode
            if (data.revenue?.by_method && Object.keys(data.revenue.by_method).length > 0) {
                for (const [method, amount] of Object.entries(data.revenue.by_method)) {
                    doc.setTextColor(80);
                    doc.text(this._getPaymentMethodLabel(method) + ':', 25, y);
                    doc.setTextColor(16, 185, 129);
                    doc.text('+' + this.formatMoney(amount), pageWidth - 20, y, { align: 'right' });
                    y += 6;
                }
            } else if (revenue > 0) {
                doc.setTextColor(80);
                doc.text('Paiements clients:', 25, y);
                doc.setTextColor(16, 185, 129);
                doc.text('+' + this.formatMoney(revenue), pageWidth - 20, y, { align: 'right' });
                y += 6;
            } else {
                doc.setTextColor(120);
                doc.text('Aucune recette enregistree', 25, y);
                y += 6;
            }
            
            // Detail depenses
            y += 10;
            doc.setFontSize(11);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(50);
            doc.text('Detail des Depenses', 15, y);
            y += 8;
            
            doc.setFontSize(9);
            doc.setFont(undefined, 'normal');
            
            const expenseItems = [
                { label: 'Depenses departs', value: expDepartures },
                { label: 'Salaires', value: expSalaries },
                { label: 'Charges diverses', value: expCharges }
            ];
            
            let hasExpenses = false;
            expenseItems.forEach(item => {
                if (item.value > 0) {
                    hasExpenses = true;
                    doc.setTextColor(80);
                    doc.text(item.label + ':', 25, y);
                    doc.setTextColor(239, 68, 68);
                    doc.text('-' + this.formatMoney(item.value), pageWidth - 20, y, { align: 'right' });
                    y += 6;
                }
            });
            
            if (!hasExpenses) {
                doc.setTextColor(120);
                doc.text('Aucune depense enregistree', 25, y);
                y += 6;
            }
            
            // Details des salaires si disponibles
            if (data.expensesDetails?.salaries && data.expensesDetails.salaries.length > 0) {
                y += 8;
                doc.setFontSize(10);
                doc.setFont(undefined, 'bold');
                doc.setTextColor(70);
                doc.text('Detail Salaires:', 20, y);
                y += 6;
                
                doc.setFontSize(8);
                doc.setFont(undefined, 'normal');
                data.expensesDetails.salaries.slice(0, 10).forEach(s => {
                    if (y > 270) { doc.addPage(); y = 20; }
                    doc.setTextColor(100);
                    doc.text(this.formatDate(s.date) + ' - ' + (s.employee || s.description || 'Salaire'), 30, y);
                    doc.setTextColor(239, 68, 68);
                    doc.text('-' + this.formatMoney(s.amount), pageWidth - 20, y, { align: 'right' });
                    y += 5;
                });
            }
            
            // Details des charges si disponibles
            if (data.expensesDetails?.charges && data.expensesDetails.charges.length > 0) {
                y += 8;
                doc.setFontSize(10);
                doc.setFont(undefined, 'bold');
                doc.setTextColor(70);
                doc.text('Detail Charges:', 20, y);
                y += 6;
                
                doc.setFontSize(8);
                doc.setFont(undefined, 'normal');
                data.expensesDetails.charges.slice(0, 10).forEach(c => {
                    if (y > 270) { doc.addPage(); y = 20; }
                    doc.setTextColor(100);
                    doc.text(this.formatDate(c.date) + ' - ' + (c.description || c.category || 'Charge'), 30, y);
                    doc.setTextColor(239, 68, 68);
                    doc.text('-' + this.formatMoney(c.amount), pageWidth - 20, y, { align: 'right' });
                    y += 5;
                });
            }
            
            // Impayes
            if (data.unpaid > 0) {
                y += 10;
                doc.setFontSize(11);
                doc.setFont(undefined, 'bold');
                doc.setTextColor(50);
                doc.text('Creances clients', 15, y);
                y += 8;
                
                doc.setFontSize(9);
                doc.setFont(undefined, 'normal');
                doc.setTextColor(80);
                doc.text('Montant impaye:', 25, y);
                doc.setTextColor(245, 158, 11);
                doc.text(this.formatMoney(data.unpaid), pageWidth - 20, y, { align: 'right' });
            }
            
            this._addFooter(doc, settings);
            doc.save(options.filename || 'rapport_comptable.pdf');
            
        } catch (error) {
            console.error('Export accounting error:', error);
            throw error;
        }
    },

    // ========== EXPORTS LISTES ==========
    
    async exportPackages(packages, options = {}) {
        await this.toPDF({
            title: options.title || 'Liste des Colis',
            subtitle: options.subtitle,
            columns: [
                { header: 'Tracking', key: 'tracking_number', width: 30 },
                { header: 'Client', key: 'sender_name', width: 35 },
                { header: 'Destinataire', key: 'recipient_name', width: 35 },
                { header: 'Destination', key: 'dest_country', width: 25, format: 'country' },
                { header: 'Poids', key: 'weight', width: 15 },
                { header: 'Montant', key: 'total_amount', width: 25, format: 'money' },
                { header: 'Statut', key: 'status', width: 20, format: 'status' }
            ],
            data: packages,
            filename: options.filename || 'colis.pdf',
            totals: options.totals
        });
    },

    async exportClients(clients, options = {}) {
        await this.toPDF({
            title: options.title || 'Liste des Clients',
            subtitle: options.subtitle,
            columns: [
                { header: 'Nom', key: 'name', width: 40 },
                { header: 'Telephone', key: 'phone', width: 30 },
                { header: 'Email', key: 'email', width: 45 },
                { header: 'Colis', key: 'packages_count', width: 20, format: 'number' },
                { header: 'CA Total', key: 'total_revenue', width: 30, format: 'money' }
            ],
            data: clients,
            filename: options.filename || 'clients.pdf',
            totals: options.totals
        });
    },

    async exportPayments(payments, options = {}) {
        await this.toPDF({
            title: options.title || 'Liste des Paiements',
            subtitle: options.subtitle,
            columns: [
                { header: 'Date', key: 'created_at', width: 25, format: 'date' },
                { header: 'Reference', key: 'reference', width: 30 },
                { header: 'Client', key: 'client_name', width: 40 },
                { header: 'Methode', key: 'method', width: 25 },
                { header: 'Montant', key: 'amount', width: 30, format: 'money' },
                { header: 'Statut', key: 'status', width: 20, format: 'status' }
            ],
            data: payments,
            filename: options.filename || 'paiements.pdf',
            totals: options.totals
        });
    }
};

// Export global
window.ExportService = ExportService;
