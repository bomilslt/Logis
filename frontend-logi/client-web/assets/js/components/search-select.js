/**
 * SearchSelect Component - Searchable dropdown (adapted for non-module use)
 */

class SearchSelect {
    constructor(options = {}) {
        this.container = typeof options.container === 'string' 
            ? document.querySelector(options.container) 
            : options.container;
        
        this.options = {
            placeholder: options.placeholder || 'Rechercher...',
            items: options.items || [],
            labelKey: options.labelKey || 'name',
            valueKey: options.valueKey || 'id',
            onSelect: options.onSelect || (() => {}),
            allowClear: options.allowClear !== false,
            noResultsText: options.noResultsText || 'Aucun resultat'
        };
        
        this.selectedValue = null;
        this.selectedItem = null;
        this.isOpen = false;
        this.filteredItems = [];
        this.highlightedIndex = -1;
        this.boundDocumentClick = null;
        
        if (this.container) {
            this.init();
        }
    }
    
    init() {
        this.render();
        this.bindEvents();
    }
    
    render() {
        this.container.innerHTML = `
            <div class="search-select">
                <div class="search-select-trigger">
                    <input type="text" 
                           class="search-select-input" 
                           placeholder="${this.options.placeholder}"
                           autocomplete="off">
                    <span class="search-select-arrow">
                        ${Icons.get('chevronDown', { size: 16 })}
                    </span>
                </div>
                <div class="search-select-dropdown">
                    <ul class="search-select-list"></ul>
                </div>
            </div>
        `;
        
        this.wrapper = this.container.querySelector('.search-select');
        this.input = this.container.querySelector('.search-select-input');
        this.dropdown = this.container.querySelector('.search-select-dropdown');
        this.list = this.container.querySelector('.search-select-list');
    }
    
    bindEvents() {
        this.input.addEventListener('focus', () => this.open());
        this.input.addEventListener('input', (e) => this.filter(e.target.value));
        this.input.addEventListener('keydown', (e) => this.handleKeydown(e));
        
        // Store bound function for cleanup
        this.boundDocumentClick = (e) => {
            if (this.wrapper && !this.wrapper.contains(e.target)) {
                this.close();
            }
        };
        document.addEventListener('click', this.boundDocumentClick);
    }
    
    filter(query) {
        const q = query.toLowerCase().trim();
        
        if (!q) {
            this.filteredItems = this.options.items;
        } else {
            this.filteredItems = this.options.items.filter(item => {
                const label = String(item[this.options.labelKey]).toLowerCase();
                return label.includes(q);
            });
        }
        
        this.renderList();
        this.highlightedIndex = -1;
    }
    
    renderList() {
        if (this.filteredItems.length === 0) {
            this.list.innerHTML = `
                <li class="search-select-empty">${this.options.noResultsText}</li>
            `;
            return;
        }
        
        this.list.innerHTML = this.filteredItems.map((item, index) => `
            <li class="search-select-item ${index === this.highlightedIndex ? 'highlighted' : ''}" 
                data-value="${item[this.options.valueKey]}"
                data-index="${index}">
                ${item[this.options.labelKey]}
            </li>
        `).join('');
        
        this.list.querySelectorAll('.search-select-item').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                this.select(el.dataset.value);
            });
            el.addEventListener('mouseenter', () => {
                this.highlightedIndex = parseInt(el.dataset.index);
                this.updateHighlight();
            });
        });
    }
    
    handleKeydown(e) {
        switch(e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this.highlightedIndex = Math.min(this.highlightedIndex + 1, this.filteredItems.length - 1);
                this.updateHighlight();
                break;
            case 'ArrowUp':
                e.preventDefault();
                this.highlightedIndex = Math.max(this.highlightedIndex - 1, 0);
                this.updateHighlight();
                break;
            case 'Enter':
                e.preventDefault();
                if (this.highlightedIndex >= 0 && this.filteredItems[this.highlightedIndex]) {
                    this.select(this.filteredItems[this.highlightedIndex][this.options.valueKey]);
                }
                break;
            case 'Escape':
                this.close();
                break;
        }
    }
    
    updateHighlight() {
        this.list.querySelectorAll('.search-select-item').forEach((el, index) => {
            el.classList.toggle('highlighted', index === this.highlightedIndex);
        });
        
        const highlighted = this.list.querySelector('.search-select-item.highlighted');
        if (highlighted) {
            highlighted.scrollIntoView({ block: 'nearest' });
        }
    }
    
    select(value) {
        const item = this.options.items.find(d => String(d[this.options.valueKey]) === String(value));
        if (item) {
            this.selectedValue = value;
            this.selectedItem = item;
            this.input.value = item[this.options.labelKey];
            this.close();
            this.options.onSelect(item, value);
        }
    }
    
    open() {
        this.isOpen = true;
        this.wrapper.classList.add('open');
        this.filteredItems = this.options.items;
        this.renderList();
    }
    
    close() {
        this.isOpen = false;
        if (this.wrapper) {
            this.wrapper.classList.remove('open');
        }
        this.highlightedIndex = -1;
    }
    
    getValue() {
        return this.selectedValue;
    }
    
    setValue(value) {
        if (value === null || value === undefined) {
            this.clear();
            return;
        }
        // Chercher l'item correspondant
        const item = this.options.items.find(d => String(d[this.options.valueKey]) === String(value));
        if (item) {
            this.selectedValue = value;
            this.selectedItem = item;
            this.input.value = item[this.options.labelKey];
        }
    }
    
    setItems(items) {
        this.options.items = items;
        this.filteredItems = items;
        if (this.isOpen) {
            this.renderList();
        }
    }
    
    clear() {
        this.selectedValue = null;
        this.selectedItem = null;
        if (this.input) {
            this.input.value = '';
        }
    }
    
    destroy() {
        // Remove document listener
        if (this.boundDocumentClick) {
            document.removeEventListener('click', this.boundDocumentClick);
        }
        if (this.container) {
            this.container.innerHTML = '';
        }
    }
}
