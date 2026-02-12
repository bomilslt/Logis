/**
 * Toast - Notifications
 */

const Toast = {
    container: null,
    
    init() {
        this.container = document.getElementById('toast-container');
    },
    
    show(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <span>${message}</span>
            <button class="toast-close">
                <svg class="icon-sm" viewBox="0 0 24 24"><use href="assets/icons/icons.svg#x"></use></svg>
            </button>
        `;
        
        toast.querySelector('.toast-close').addEventListener('click', () => {
            toast.remove();
        });
        
        this.container.appendChild(toast);
        
        setTimeout(() => toast.remove(), CONFIG.TOAST_DURATION);
    },
    
    success(message) { this.show(message, 'success'); },
    error(message) { this.show(message, 'error'); },
    warning(message) { this.show(message, 'warning'); },
    info(message) { this.show(message, 'info'); }
};
