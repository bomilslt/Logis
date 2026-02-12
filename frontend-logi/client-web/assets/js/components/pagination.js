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
                        <svg class="icon-sm" viewBox="0 0 24 24"><use href="assets/icons/icons.svg#chevrons-left"></use></svg>
                    </button>
                    <button class="btn btn-sm btn-ghost pagination-btn" data-page="prev" ${this.currentPage === 1 ? 'disabled' : ''}>
                        <svg class="icon-sm" viewBox="0 0 24 24"><use href="assets/icons/icons.svg#chevron-left"></use></svg>
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
                        <svg class="icon-sm" viewBox="0 0 24 24"><use href="assets/icons/icons.svg#chevron-right"></use></svg>
                    </button>
                    <button class="btn btn-sm btn-ghost pagination-btn" data-page="last" ${this.currentPage === this.totalPages ? 'disabled' : ''}>
                        <svg class="icon-sm" viewBox="0 0 24 24"><use href="assets/icons/icons.svg#chevrons-right"></use></svg>
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
        
        pages.push(1);
        
        let start = Math.max(2, current - Math.floor((max - 3) / 2));
        let end = Math.min(total - 1, start + max - 4);
        
        if (current <= 3) {
            end = Math.min(total - 1, max - 1);
        }
        
        if (current >= total - 2) {
            start = Math.max(2, total - max + 2);
        }
        
        if (start > 2) pages.push('...');
        
        for (let i = start; i <= end; i++) pages.push(i);
        
        if (end < total - 1) pages.push('...');
        
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
    
    static paginate(array, page, pageSize) {
        const start = (page - 1) * pageSize;
        return array.slice(start, start + pageSize);
    }
}
