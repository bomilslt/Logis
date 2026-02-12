/**
 * Toast - Notifications temporaires
 */

const Toast = {
    container: null,
    
    init() {
        this.container = document.getElementById('toast-container');
    },
    
    /**
     * Afficher un toast
     * @param {string} message - Message a afficher
     * @param {string} type - Type: success, error, warning, info
     * @param {string} title - Titre optionnel
     */
    show(message, type = 'info', title = '') {
        if (!this.container) this.init();
        
        const icons = {
            success: 'check-circle',
            error: 'alert-circle',
            warning: 'alert-triangle',
            info: 'info'
        };
        
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <svg class="toast-icon" viewBox="0 0 24 24">
                <use href="assets/icons/icons.svg#${icons[type]}"></use>
            </svg>
            <div class="toast-content">
                ${title ? `<div class="toast-title">${title}</div>` : ''}
                <div class="toast-message">${message}</div>
            </div>
            <button class="toast-close" aria-label="Fermer">
                <svg class="icon-sm" viewBox="0 0 24 24">
                    <use href="assets/icons/icons.svg#x"></use>
                </svg>
            </button>
        `;
        
        // Fermer au clic
        toast.querySelector('.toast-close').addEventListener('click', () => {
            this.remove(toast);
        });
        
        this.container.appendChild(toast);
        
        // Auto-remove
        setTimeout(() => {
            this.remove(toast);
        }, CONFIG.TOAST_DURATION);
    },
    
    remove(toast) {
        toast.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => {
            toast.remove();
        }, 300);
    },
    
    success(message, title = '') {
        this.show(message, 'success', title);
    },
    
    error(message, title = '') {
        this.show(message, 'error', title);
    },
    
    warning(message, title = '') {
        this.show(message, 'warning', title);
    },
    
    info(message, title = '') {
        this.show(message, 'info', title);
    }
};
