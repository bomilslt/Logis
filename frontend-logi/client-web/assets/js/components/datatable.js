/**
 * DataTable Component - Table with sorting, filtering, pagination (adapted for non-module use)
 */

class DataTable {
    constructor(options = {}) {
        this.options = {
            container: null,
            columns: [],
            data: [],
            sortable: true,
            searchable: true,
            paginated: true,
            pageSize: 15,
            pageSizeOptions: [15, 30, 50, 100],
            onRowClick: null,
            renderActions: null,
            emptyMessage: 'Aucune donnee disponible',
            ...options
        };
        
        this.container = typeof this.options.container === 'string'
            ? document.querySelector(this.options.container)
            : this.options.container;
        
        this.filteredData = [];
        this.sortColumn = null;
        this.sortDirection = 'asc';
        this.currentPage = 1;
        this.searchTerm = '';
        
        if (this.container) {
            this.init();
        }
    }
    
    init() {
        this.filteredData = [...this.options.data];
        this.render();
    }
    
    get totalPages() {
        if (this.filteredData.length === 0) return 1;
        return Math.ceil(this.filteredData.length / this.options.pageSize);
    }
    
    render() {
        this.element = document.createElement('div');
        this.element.className = 'datatable';
        
        if (this.options.searchable) {
            this.element.appendChild(this.renderToolbar());
        }
        
        this.element.appendChild(this.renderTable());
        
        if (this.options.paginated) {
            this.element.appendChild(this.renderPagination());
        }
        
        this.container.innerHTML = '';
        this.container.appendChild(this.element);
    }
    
    renderToolbar() {
        const toolbar = document.createElement('div');
        toolbar.className = 'datatable-toolbar';
        
        const searchWrapper = document.createElement('div');
        searchWrapper.className = 'datatable-search';
        searchWrapper.innerHTML = `
            <span class="datatable-search-icon">${Icons.get('search', { size: 16 })}</span>
            <input type="text" class="datatable-search-input" placeholder="Rechercher..." value="${this.searchTerm}">
        `;
        
        const input = searchWrapper.querySelector('input');
        input.addEventListener('input', (e) => {
            this.searchTerm = e.target.value;
            this.currentPage = 1;
            this.applyFilters();
        });
        
        toolbar.appendChild(searchWrapper);
        
        // Page size selector
        if (this.options.pageSizeOptions && this.options.pageSizeOptions.length > 1) {
            const pageSizeWrapper = document.createElement('div');
            pageSizeWrapper.className = 'datatable-pagesize';
            pageSizeWrapper.innerHTML = `
                <span>Afficher</span>
                <select class="datatable-pagesize-select">
                    ${this.options.pageSizeOptions.map(size => 
                        `<option value="${size}" ${size === this.options.pageSize ? 'selected' : ''}>${size}</option>`
                    ).join('')}
                </select>
            `;
            
            const select = pageSizeWrapper.querySelector('select');
            select.addEventListener('change', (e) => {
                this.options.pageSize = parseInt(e.target.value);
                this.currentPage = 1;
                this.updateTableAndPagination();
            });
            
            toolbar.appendChild(pageSizeWrapper);
        }
        
        return toolbar;
    }
    
    renderTable() {
        const wrapper = document.createElement('div');
        wrapper.className = 'datatable-wrapper';
        
        const table = document.createElement('table');
        table.className = 'datatable-table';
        
        // Header
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        
        this.options.columns.forEach(col => {
            const th = document.createElement('th');
            th.innerHTML = col.label;
            th.dataset.key = col.key;
            
            if (this.options.sortable && col.sortable !== false) {
                th.classList.add('sortable');
                if (this.sortColumn === col.key) {
                    th.classList.add(`sort-${this.sortDirection}`);
                }
                th.addEventListener('click', () => this.sort(col.key));
            }
            
            if (col.width) th.style.width = col.width;
            headerRow.appendChild(th);
        });
        
        if (this.options.renderActions) {
            const th = document.createElement('th');
            th.textContent = 'Actions';
            th.style.width = '100px';
            headerRow.appendChild(th);
        }
        
        thead.appendChild(headerRow);
        table.appendChild(thead);
        
        // Body
        const tbody = document.createElement('tbody');
        const pageData = this.getPageData();
        
        if (pageData.length === 0) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = this.options.columns.length + (this.options.renderActions ? 1 : 0);
            td.className = 'datatable-empty';
            td.textContent = this.options.emptyMessage;
            tr.appendChild(td);
            tbody.appendChild(tr);
        } else {
            pageData.forEach(row => {
                const tr = document.createElement('tr');
                
                if (this.options.onRowClick) {
                    tr.classList.add('clickable');
                    tr.addEventListener('click', (e) => {
                        if (!e.target.closest('.datatable-actions')) {
                            this.options.onRowClick(row);
                        }
                    });
                }
                
                this.options.columns.forEach(col => {
                    const td = document.createElement('td');
                    if (col.render) {
                        const content = col.render(row[col.key], row);
                        if (typeof content === 'string') {
                            td.innerHTML = content;
                        } else if (content instanceof HTMLElement) {
                            td.appendChild(content);
                        }
                    } else {
                        td.textContent = row[col.key] ?? '';
                    }
                    tr.appendChild(td);
                });
                
                if (this.options.renderActions) {
                    const td = document.createElement('td');
                    td.className = 'datatable-actions';
                    const actions = this.options.renderActions(row);
                    if (typeof actions === 'string') {
                        td.innerHTML = actions;
                    } else if (actions instanceof HTMLElement) {
                        td.appendChild(actions);
                    }
                    tr.appendChild(td);
                }
                
                tbody.appendChild(tr);
            });
        }
        
        table.appendChild(tbody);
        wrapper.appendChild(table);
        return wrapper;
    }
    
    renderPagination() {
        const pagination = document.createElement('div');
        pagination.className = 'datatable-pagination';
        
        const totalPages = this.totalPages;
        const start = this.filteredData.length > 0 
            ? (this.currentPage - 1) * this.options.pageSize + 1 
            : 0;
        const end = Math.min(this.currentPage * this.options.pageSize, this.filteredData.length);
        
        const info = document.createElement('span');
        info.className = 'datatable-pagination-info';
        info.textContent = this.filteredData.length > 0 
            ? `${start}-${end} sur ${this.filteredData.length}`
            : '0 resultat';
        
        const pageIndicator = document.createElement('span');
        pageIndicator.className = 'datatable-page-indicator';
        pageIndicator.textContent = `Page ${this.currentPage} sur ${totalPages}`;
        
        const buttons = document.createElement('div');
        buttons.className = 'datatable-pagination-buttons';
        
        const prevBtn = document.createElement('button');
        prevBtn.className = 'btn btn-secondary btn-sm';
        prevBtn.innerHTML = Icons.get('chevronLeft', { size: 16 });
        prevBtn.disabled = this.currentPage <= 1;
        prevBtn.addEventListener('click', () => this.goToPage(this.currentPage - 1));
        
        const nextBtn = document.createElement('button');
        nextBtn.className = 'btn btn-secondary btn-sm';
        nextBtn.innerHTML = Icons.get('chevronRight', { size: 16 });
        nextBtn.disabled = this.currentPage >= totalPages;
        nextBtn.addEventListener('click', () => this.goToPage(this.currentPage + 1));
        
        buttons.appendChild(prevBtn);
        buttons.appendChild(nextBtn);
        
        pagination.appendChild(info);
        pagination.appendChild(pageIndicator);
        pagination.appendChild(buttons);
        
        return pagination;
    }
    
    applyFilters() {
        let data = [...this.options.data];
        
        if (this.searchTerm) {
            const term = this.searchTerm.toLowerCase();
            data = data.filter(row => {
                return this.options.columns.some(col => {
                    const value = row[col.key];
                    if (value == null) return false;
                    return String(value).toLowerCase().includes(term);
                });
            });
        }
        
        if (this.sortColumn) {
            data.sort((a, b) => {
                const aVal = a[this.sortColumn] ?? '';
                const bVal = b[this.sortColumn] ?? '';
                
                let comparison = 0;
                if (typeof aVal === 'number' && typeof bVal === 'number') {
                    comparison = aVal - bVal;
                } else {
                    comparison = String(aVal).localeCompare(String(bVal));
                }
                
                return this.sortDirection === 'asc' ? comparison : -comparison;
            });
        }
        
        this.filteredData = data;
        
        const totalPages = this.totalPages;
        if (this.currentPage > totalPages) {
            this.currentPage = Math.max(1, totalPages);
        }
        
        this.updateTableAndPagination();
    }
    
    updateTableAndPagination() {
        if (!this.element) {
            this.render();
            return;
        }
        
        const searchInput = this.element.querySelector('.datatable-search-input');
        const wasSearchFocused = searchInput && document.activeElement === searchInput;
        const selectionStart = searchInput?.selectionStart;
        const selectionEnd = searchInput?.selectionEnd;
        
        const tableWrapper = this.element.querySelector('.datatable-wrapper');
        if (tableWrapper) {
            tableWrapper.replaceWith(this.renderTable());
        }
        
        if (this.options.paginated) {
            const pagination = this.element.querySelector('.datatable-pagination');
            const newPagination = this.renderPagination();
            if (pagination) {
                pagination.replaceWith(newPagination);
            } else {
                this.element.appendChild(newPagination);
            }
        }
        
        if (wasSearchFocused && searchInput) {
            const newInput = this.element.querySelector('.datatable-search-input');
            if (newInput) {
                newInput.focus();
                if (selectionStart !== undefined) {
                    newInput.setSelectionRange(selectionStart, selectionEnd);
                }
            }
        }
    }
    
    sort(column) {
        if (this.sortColumn === column) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortColumn = column;
            this.sortDirection = 'asc';
        }
        this.applyFilters();
    }
    
    getPageData() {
        if (!this.options.paginated) return this.filteredData;
        const start = (this.currentPage - 1) * this.options.pageSize;
        return this.filteredData.slice(start, start + this.options.pageSize);
    }
    
    goToPage(page) {
        const totalPages = this.totalPages;
        if (page < 1 || page > totalPages) return;
        this.currentPage = Math.max(1, Math.min(page, totalPages));
        this.updateTableAndPagination();
    }
    
    setData(data) {
        this.options.data = data;
        this.currentPage = 1;
        this.applyFilters();
    }
    
    refresh() {
        this.applyFilters();
    }
    
    destroy() {
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
    }
}
