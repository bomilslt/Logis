/**
 * DataTable - Tableau avec pagination et recherche
 */

class DataTable {
    constructor(options) {
        this.container = typeof options.container === 'string'
            ? document.querySelector(options.container)
            : options.container;
        this.columns = options.columns || [];
        this.data = options.data || [];
        this.pageSize = options.pageSize || 10;
        this.currentPage = 1;
        this.searchQuery = '';
        this.onRowClick = options.onRowClick || null;
        this.emptyMessage = options.emptyMessage || 'Aucune donnee';
        
        this.render();
    }
    
    render() {
        const filtered = this.getFilteredData();
        const paginated = this.getPaginatedData(filtered);
        const totalPages = Math.ceil(filtered.length / this.pageSize);
        
        this.container.innerHTML = `
            <div class="datatable">
                <div class="datatable-header">
                    <input type="text" class="form-input datatable-search" 
                           placeholder="Rechercher..." value="${this.searchQuery}">
                </div>
                <div class="table-wrapper">
                    <table class="table">
                        <thead>
                            <tr>
                                ${this.columns.map(col => `<th>${col.label}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${paginated.length ? paginated.map(row => `
                                <tr class="${this.onRowClick ? 'clickable' : ''}" data-id="${row.id || ''}">
                                    ${this.columns.map(col => `
                                        <td>${col.render ? col.render(row[col.key], row) : (row[col.key] || '-')}</td>
                                    `).join('')}
                                </tr>
                            `).join('') : `
                                <tr><td colspan="${this.columns.length}" class="text-center text-muted">${this.emptyMessage}</td></tr>
                            `}
                        </tbody>
                    </table>
                </div>
                ${totalPages > 1 ? `
                    <div class="datatable-footer">
                        <span class="text-sm text-muted">${filtered.length} resultat(s)</span>
                        <div class="datatable-pagination">
                            <button class="btn btn-sm btn-ghost" ${this.currentPage === 1 ? 'disabled' : ''} data-page="prev">Precedent</button>
                            <span class="text-sm">${this.currentPage} / ${totalPages}</span>
                            <button class="btn btn-sm btn-ghost" ${this.currentPage === totalPages ? 'disabled' : ''} data-page="next">Suivant</button>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
        
        this.attachEvents();
    }
    
    attachEvents() {
        this.container.querySelector('.datatable-search')?.addEventListener('input', (e) => {
            this.searchQuery = e.target.value;
            this.currentPage = 1;
            this.render();
        });
        
        this.container.querySelectorAll('[data-page]').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.dataset.page === 'prev') this.currentPage--;
                else this.currentPage++;
                this.render();
            });
        });
        
        if (this.onRowClick) {
            this.container.querySelectorAll('tbody tr.clickable').forEach(row => {
                row.addEventListener('click', () => {
                    const id = row.dataset.id;
                    const item = this.data.find(d => String(d.id) === id);
                    if (item) this.onRowClick(item);
                });
            });
        }
    }
    
    getFilteredData() {
        if (!this.searchQuery) return this.data;
        const q = this.searchQuery.toLowerCase();
        return this.data.filter(row => 
            this.columns.some(col => 
                String(row[col.key] || '').toLowerCase().includes(q)
            )
        );
    }
    
    getPaginatedData(data) {
        const start = (this.currentPage - 1) * this.pageSize;
        return data.slice(start, start + this.pageSize);
    }
    
    setData(data) {
        this.data = data;
        this.currentPage = 1;
        this.render();
    }
}
