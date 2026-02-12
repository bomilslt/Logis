/**
 * ExportService - Export PDF et Excel côté frontend
 * Utilise jsPDF pour les PDF et génère des CSV/Excel natifs.
 */

const ExportService = {
    defaults: {
        companyName: 'Express Cargo',
        currency: 'XAF',
        dateFormat: 'fr-FR',
        pageSize: 'a4',
        orientation: 'portrait'
    },

    isJsPDFAvailable() {
        return typeof window.jspdf !== 'undefined' || typeof window.jsPDF !== 'undefined';
    },

    getJsPDF() {
        if (window.jspdf?.jsPDF) return window.jspdf.jsPDF;
        if (window.jsPDF) return window.jsPDF;
        throw new Error('jsPDF non disponible');
    },

    formatMoney(amount, currency = null) {
        return new Intl.NumberFormat('fr-FR').format(amount || 0) + ' ' + (currency || this.defaults.currency);
    },

    formatDate(date) {
        if (!date) return '-';
        return new Date(date).toLocaleDateString(this.defaults.dateFormat);
    },

    formatDateTime(date) {
        if (!date) return '-';
        return new Date(date).toLocaleString(this.defaults.dateFormat);
    },

    async toPDF(options) {
        if (!this.isJsPDFAvailable()) {
            Toast?.error?.('Librairie PDF non disponible');
            return false;
        }
        try {
            Toast?.info?.('Génération du PDF...');
            const jsPDF = this.getJsPDF();
            const doc = new jsPDF(options.orientation || 'portrait', 'mm', 'a4');
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            let y = 15;

            y = this._addPDFHeader(doc, options, pageWidth, y);
            if (options.columns && options.data) y = this._addPDFTable(doc, options, 15, y);
            if (options.summary) y = this._addPDFSummary(doc, options.summary, 15, y, pageWidth);
            this._addPDFFooter(doc, pageWidth, pageHeight);

            doc.save(options.filename || `export_${Date.now()}.pdf`);
            Toast?.success?.('PDF téléchargé');
            return true;
        } catch (error) {
            console.error('PDF error:', error);
            Toast?.error?.('Erreur génération PDF');
            return false;
        }
    },

    _addPDFHeader(doc, options, pageWidth, y) {
        doc.setFontSize(18);
        doc.setFont(undefined, 'bold');
        doc.text(options.title || 'Export', pageWidth / 2, y, { align: 'center' });
        y += 8;
        if (options.subtitle) {
            doc.setFontSize(12);
            doc.setFont(undefined, 'normal');
            doc.text(options.subtitle, pageWidth / 2, y, { align: 'center' });
            y += 6;
        }
        doc.setFontSize(9);
        doc.setTextColor(100);
        doc.text(`Généré le ${this.formatDateTime(new Date())}`, pageWidth / 2, y, { align: 'center' });
        doc.setTextColor(0);
        y += 10;
        doc.setDrawColor(200);
        doc.line(15, y, pageWidth - 15, y);
        return y + 8;
    },

    _addPDFTable(doc, options, margin, startY) {
        const tableColumns = options.columns.map(col => ({ header: col.header, dataKey: col.key }));
        const tableData = options.data.map(row => {
            const formatted = {};
            options.columns.forEach(col => {
                let value = row[col.key];
                if (col.format === 'money') value = this.formatMoney(value, col.currency);
                else if (col.format === 'date') value = this.formatDate(value);
                else if (col.format === 'status') value = this._getStatusLabel(value);
                else if (typeof col.format === 'function') value = col.format(value, row);
                formatted[col.key] = value ?? '-';
            });
            return formatted;
        });

        doc.autoTable({
            columns: tableColumns,
            body: tableData,
            startY,
            margin: { left: margin, right: margin },
            styles: { fontSize: 9, cellPadding: 3 },
            headStyles: { fillColor: [26, 86, 219], textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [245, 247, 250] }
        });
        return doc.lastAutoTable.finalY + 10;
    },

    _addPDFSummary(doc, summary, margin, y, pageWidth) {
        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.text('Résumé', margin, y);
        y += 7;
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        Object.entries(summary).forEach(([label, value]) => {
            doc.text(label + ':', margin, y);
            doc.text(String(value), pageWidth - margin, y, { align: 'right' });
            y += 6;
        });
        return y + 5;
    },

    _addPDFFooter(doc, pageWidth, pageHeight) {
        const totalPages = doc.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text(this.defaults.companyName, 15, pageHeight - 10);
            doc.text(`Page ${i}/${totalPages}`, pageWidth - 15, pageHeight - 10, { align: 'right' });
        }
    },

    _getStatusLabel(status) {
        const labels = { pending: 'En attente', received: 'Reçu', in_transit: 'En transit', arrived_port: 'Arrivé', customs: 'Douane', out_for_delivery: 'En livraison', delivered: 'Livré', paid: 'Payé', unpaid: 'Impayé', partial: 'Partiel' };
        return labels[status] || status;
    },

    toCSV(options) {
        try {
            Toast?.info?.('Génération du fichier...');
            const separator = options.separator || ';';
            const headers = options.columns.map(col => `"${col.header}"`).join(separator);
            const rows = options.data.map(row => {
                return options.columns.map(col => {
                    let value = row[col.key];
                    if (col.format === 'money') value = (value || 0).toString();
                    else if (col.format === 'date') value = this.formatDate(value);
                    else if (col.format === 'status') value = this._getStatusLabel(value);
                    else if (typeof col.format === 'function') value = col.format(value, row);
                    return `"${String(value ?? '').replace(/"/g, '""')}"`;
                }).join(separator);
            });
            const csvContent = '\ufeff' + [headers, ...rows].join('\n');
            this._downloadBlob(new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }), options.filename || `export_${Date.now()}.csv`);
            Toast?.success?.('Fichier téléchargé');
            return true;
        } catch (error) {
            console.error('CSV error:', error);
            Toast?.error?.('Erreur export');
            return false;
        }
    },

    toExcel(options) {
        options.filename = options.filename || `export_${Date.now()}.csv`;
        if (!options.filename.endsWith('.csv')) options.filename += '.csv';
        return this.toCSV(options);
    },

    _downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    },

    exportPackages(packages, options = {}) {
        const columns = [
            { header: 'Tracking', key: 'tracking_number' },
            { header: 'Description', key: 'description' },
            { header: 'Statut', key: 'status', format: 'status' },
            { header: 'Montant', key: 'amount', format: 'money' },
            { header: 'Date', key: 'created_at', format: 'date' }
        ];
        const data = packages.map(p => ({
            tracking_number: p.tracking_number,
            description: p.description?.substring(0, 50) || '-',
            status: p.status,
            amount: p.amount || 0,
            created_at: p.created_at
        }));
        const exportOpts = { title: options.title || 'Mes Colis', columns, data, filename: options.filename || `mes_colis_${this._getDateString()}.pdf`, ...options };
        return options.format === 'csv' ? this.toCSV(exportOpts) : this.toPDF(exportOpts);
    },

    _getDateString() {
        const now = new Date();
        return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    }
};
