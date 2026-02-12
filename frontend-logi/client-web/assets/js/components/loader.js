/**
 * Loader - Indicateurs de chargement
 */

const Loader = {
    /**
     * Afficher un loader pleine page
     */
    show() {
        const existing = document.querySelector('.loader-overlay');
        if (existing) return;
        
        const overlay = document.createElement('div');
        overlay.className = 'loader-overlay';
        overlay.innerHTML = '<div class="loader loader-lg"></div>';
        document.body.appendChild(overlay);
    },
    
    /**
     * Masquer le loader pleine page
     */
    hide() {
        const overlay = document.querySelector('.loader-overlay');
        if (overlay) {
            overlay.remove();
        }
    },
    
    /**
     * Retourne le HTML d'un loader inline
     */
    inline(size = 'md') {
        const sizeClass = size === 'sm' ? 'loader-sm' : size === 'lg' ? 'loader-lg' : '';
        return `<div class="loader ${sizeClass}"></div>`;
    },
    
    /**
     * Retourne le HTML d'un loader de page
     */
    page(text = 'Chargement...') {
        return `
            <div class="page-loader">
                <div class="loader loader-lg"></div>
                <p class="page-loader-text">${text}</p>
            </div>
        `;
    },
    
    /**
     * Afficher un loader dans un element
     */
    showIn(element, text = '') {
        if (typeof element === 'string') {
            element = document.querySelector(element);
        }
        if (element) {
            element.innerHTML = this.page(text);
        }
    }
};
