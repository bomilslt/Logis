/**
 * Pagination - Composant de pagination reutilisable
 */

class Pagination {
    constructor(options) {
        this.container = typeof options.container === 'string'
            ? document.querySelector(options.container)
            : options.container;
        this.totalItems = options.totalItems || 0;
        this.pageSize = options.pageSize || 10;
        this.currentPage = options.currentPage || 1;
        this.onChange = options.onChange || (() => {});
        this.showInfo = options.showInfo !== false;
        this.maxVisiblePages = options.maxVisiblePages || 5;
        
        this.render();
    }
    
    get totalPages() {
        return Math.ceil(this.totalItems / this.pageSize);
    }
    
    render() {
        if (!this.container) return;
        
        if (this.totalPages <= 1) {
            this.container.innerHTML = this.showInfo 
                ? `<div class="pagination-info"><span class="text-sm text-muted">${this.totalItems} element(s)</span></div>`
                : '';
            return;
        }
        
        const pages = this.getVisiblePages();
        
        this.container.innerHTML = `
            <div class="pagination">
                ${this.showInfo ? `<span class="pagination-info text-sm text-muted">${this.totalItems} element(s)</span>` : ''}
                <div class="pagination-controls">
                    <button class="btn btn-sm btn-ghost pagination-btn" data-page="first" ${this.currentPage === 1 ? 'disabled' : ''}>
                        ${Icons.get('chevrons-left', {size: 14})}
                    </button>
                    <button class="btn btn-sm btn-ghost pagination-btn" data-page="prev" ${this.currentPage === 1 ? 'disabled' : ''}>
                        ${Icons.get('chevron-left', {size: 14})}
                    </button>
                    
                    <div class="pagination-pages">
                        ${pages.map(p => {
                            if (p === '...') {
                                return '<span class="pagination-ellipsis">...</span>';
                            }
                            return `<button class="btn btn-sm ${p === this.currentPage ? 'btn-primary' : 'btn-ghost'} pagination-page" data-page="${p}">${p}</button>`;
                        }).join('')}
                    </div>
                    
                    <button class="btn btn-sm btn-ghost pagination-btn" data-page="next" ${this.currentPage === this.totalPages ? 'disabled' : ''}>
                        ${Icons.get('chevron-right', {size: 14})}
                    </button>
                    <button class="btn btn-sm btn-ghost pagination-btn" data-page="last" ${this.currentPage === this.totalPages ? 'disabled' : ''}>
                        ${Icons.get('chevrons-right', {size: 14})}
                    </button>
                </div>
            </div>
        `;
        
        this.attachEvents();
    }
    
    getVisiblePages() {
        const pages = [];
        const total = this.totalPages;
        const current = this.currentPage;
        const max = this.maxVisiblePages;
        
        if (total <= max) {
            for (let i = 1; i <= total; i++) pages.push(i);
            return pages;
        }
        
        // Toujours afficher la premiere page
        pages.push(1);
        
        // Calculer la plage autour de la page courante
        let start = Math.max(2, current - Math.floor((max - 3) / 2));
        let end = Math.min(total - 1, start + max - 4);
        
        // Ajuster si on est proche du debut
        if (current <= 3) {
            end = Math.min(total - 1, max - 1);
        }
        
        // Ajuster si on est proche de la fin
        if (current >= total - 2) {
            start = Math.max(2, total - max + 2);
        }
        
        // Ajouter ellipsis si necessaire au debut
        if (start > 2) pages.push('...');
        
        // Ajouter les pages du milieu
        for (let i = start; i <= end; i++) pages.push(i);
        
        // Ajouter ellipsis si necessaire a la fin
        if (end < total - 1) pages.push('...');
        
        // Toujours afficher la derniere page
        pages.push(total);
        
        return pages;
    }
    
    attachEvents() {
        this.container.querySelectorAll('[data-page]').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.page;
                let newPage = this.currentPage;
                
                switch (action) {
                    case 'first': newPage = 1; break;
                    case 'prev': newPage = Math.max(1, this.currentPage - 1); break;
                    case 'next': newPage = Math.min(this.totalPages, this.currentPage + 1); break;
                    case 'last': newPage = this.totalPages; break;
                    default: newPage = parseInt(action);
                }
                
                if (newPage !== this.currentPage) {
                    this.goToPage(newPage);
                }
            });
        });
    }
    
    goToPage(page) {
        this.currentPage = page;
        this.render();
        this.onChange(page, this.pageSize);
    }
    
    setTotalItems(total) {
        this.totalItems = total;
        if (this.currentPage > this.totalPages) {
            this.currentPage = Math.max(1, this.totalPages);
        }
        this.render();
    }
    
    setPageSize(size) {
        this.pageSize = size;
        this.currentPage = 1;
        this.render();
        this.onChange(this.currentPage, this.pageSize);
    }
    
    reset() {
        this.currentPage = 1;
        this.render();
    }
    
    /**
     * Utilitaire pour paginer un tableau
     */
    static paginate(array, page, pageSize) {
        const start = (page - 1) * pageSize;
        return array.slice(start, start + pageSize);
    }
}
