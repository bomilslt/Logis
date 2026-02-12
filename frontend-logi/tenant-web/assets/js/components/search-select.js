/**
 * SearchSelect - Select avec recherche
 */

class SearchSelect {
    constructor(options) {
        this.container = typeof options.container === 'string' 
            ? document.querySelector(options.container) 
            : options.container;
        this.placeholder = options.placeholder || 'Selectionner...';
        this.items = options.items || [];
        this.onSelect = options.onSelect || (() => {});
        this.dropUp = options.dropUp || false;  // Option pour ouvrir vers le haut
        this.selectedItem = null;
        this.isOpen = false;
        
        this.render();
        this.attachEvents();
    }
    
    render() {
        this.container.innerHTML = `
            <div class="search-select ${this.dropUp ? 'drop-up' : ''}">
                <div class="search-select-trigger">
                    <span class="search-select-value">${this.placeholder}</span>
                    ${Icons.get('chevron-down', { size: 16 })}
                </div>
            </div>
        `;
        
        // Creer le dropdown dans le body pour eviter les problemes de z-index/overflow
        this.dropdownEl = document.createElement('div');
        this.dropdownEl.className = 'search-select-dropdown hidden';
        this.dropdownEl.innerHTML = `
            <input type="text" class="search-select-input" placeholder="Rechercher...">
            <div class="search-select-list"></div>
        `;
        document.body.appendChild(this.dropdownEl);
        
        this.trigger = this.container.querySelector('.search-select-trigger');
        this.input = this.dropdownEl.querySelector('.search-select-input');
        this.list = this.dropdownEl.querySelector('.search-select-list');
        
        this.renderItems();
    }
    
    renderItems(filter = '') {
        const filtered = this.items.filter(item => 
            item.name.toLowerCase().includes(filter.toLowerCase())
        );
        
        this.list.innerHTML = filtered.map(item => `
            <div class="search-select-item" data-id="${item.id}">
                ${item.name}
            </div>
        `).join('') || '<div class="search-select-empty">Aucun resultat</div>';
    }
    
    attachEvents() {
        this.trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggle();
        });
        this.input.addEventListener('input', (e) => this.renderItems(e.target.value));
        this.list.addEventListener('click', (e) => {
            const item = e.target.closest('.search-select-item');
            if (item) this.select(item.dataset.id);
        });
        this.dropdownEl.addEventListener('click', (e) => e.stopPropagation());
        document.addEventListener('click', () => this.close());
        window.addEventListener('resize', () => { if (this.isOpen) this.positionDropdown(); });
        window.addEventListener('scroll', () => { if (this.isOpen) this.positionDropdown(); }, true);
    }
    
    positionDropdown() {
        const rect = this.trigger.getBoundingClientRect();
        const dropdownHeight = this.dropdownEl.offsetHeight || 250;
        const viewportHeight = window.innerHeight;
        
        this.dropdownEl.style.position = 'fixed';
        this.dropdownEl.style.left = rect.left + 'px';
        this.dropdownEl.style.minWidth = Math.max(rect.width, 200) + 'px';
        this.dropdownEl.style.maxHeight = '250px';
        
        // Déterminer si on doit ouvrir vers le haut ou le bas
        const spaceBelow = viewportHeight - rect.bottom;
        const spaceAbove = rect.top;
        const shouldDropUp = this.dropUp || (spaceBelow < dropdownHeight && spaceAbove > spaceBelow);
        
        if (shouldDropUp) {
            // Ouvrir vers le haut
            this.dropdownEl.style.bottom = (viewportHeight - rect.top + 4) + 'px';
            this.dropdownEl.style.top = 'auto';
        } else {
            // Ouvrir vers le bas
            this.dropdownEl.style.top = (rect.bottom + 4) + 'px';
            this.dropdownEl.style.bottom = 'auto';
        }
    }
    
    toggle() {
        this.isOpen ? this.close() : this.open();
    }
    
    open() {
        this.isOpen = true;
        this.positionDropdown();
        this.dropdownEl.classList.remove('hidden');
        this.input.focus();
    }
    
    close() {
        this.isOpen = false;
        this.dropdownEl.classList.add('hidden');
        this.input.value = '';
        this.renderItems();
    }
    
    select(id) {
        this.selectedItem = this.items.find(i => i.id === id);
        this.trigger.querySelector('.search-select-value').textContent = 
            this.selectedItem?.name || this.placeholder;
        this.close();
        this.onSelect(this.selectedItem);
    }
    
    getValue() {
        return this.selectedItem?.id || null;
    }
    
    setValue(id) {
        this.select(id);
    }
    
    setItems(items) {
        this.items = items;
        this.renderItems();
    }
    
    clear() {
        this.selectedItem = null;
        this.trigger.querySelector('.search-select-value').textContent = this.placeholder;
    }
    
    destroy() {
        if (this.dropdownEl && this.dropdownEl.parentNode) {
            this.dropdownEl.parentNode.removeChild(this.dropdownEl);
        }
    }
}
