/**
 * Modal - Boites de dialogue
 */

const Modal = {
    container: null,
    
    init() {
        this.container = document.getElementById('modal-container');
    },
    
    /**
     * Ouvrir une modal
     * @param {Object} options - Options de la modal
     */
    open(options = {}) {
        if (!this.container) this.init();
        
        const {
            title = '',
            content = '',
            footer = '',
            size = 'md', // sm, md, lg
            closable = true,
            onClose = null
        } = options;
        
        const sizeClass = size === 'lg' ? 'style="max-width: 700px"' : 
                          size === 'sm' ? 'style="max-width: 400px"' : '';
        
        this.container.innerHTML = `
            <div class="modal-backdrop"></div>
            <div class="modal" ${sizeClass}>
                <div class="modal-header">
                    <h3 class="modal-title">${title}</h3>
                    ${closable ? `
                        <button class="modal-close" aria-label="Fermer">
                            <svg class="icon" viewBox="0 0 24 24">
                                <use href="assets/icons/icons.svg#x"></use>
                            </svg>
                        </button>
                    ` : ''}
                </div>
                <div class="modal-body">
                    ${content}
                </div>
                ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
            </div>
        `;
        
        // Fermer au clic sur backdrop ou bouton close
        if (closable) {
            this.container.querySelector('.modal-backdrop').addEventListener('click', () => {
                this.close();
                if (onClose) onClose();
            });
            
            this.container.querySelector('.modal-close')?.addEventListener('click', () => {
                this.close();
                if (onClose) onClose();
            });
        }
        
        // Fermer avec Escape
        const escHandler = (e) => {
            if (e.key === 'Escape' && closable) {
                this.close();
                if (onClose) onClose();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
        
        // Empecher le scroll du body
        document.body.style.overflow = 'hidden';
    },
    
    /**
     * Fermer la modal
     */
    close() {
        if (this.container) {
            this.container.innerHTML = '';
        }
        document.body.style.overflow = '';
    },
    
    /**
     * Modal de confirmation
     */
    confirm(options = {}) {
        return new Promise((resolve) => {
            const {
                title = 'Confirmation',
                message = 'Etes-vous sur ?',
                confirmText = 'Confirmer',
                cancelText = 'Annuler',
                confirmClass = 'btn-primary',
                danger = false
            } = options;
            
            this.open({
                title,
                content: `<p>${message}</p>`,
                footer: `
                    <button class="btn btn-secondary" id="modal-cancel">${cancelText}</button>
                    <button class="btn ${danger ? 'btn-danger' : confirmClass}" id="modal-confirm">${confirmText}</button>
                `,
                closable: true,
                onClose: () => resolve(false)
            });
            
            document.getElementById('modal-cancel').addEventListener('click', () => {
                this.close();
                resolve(false);
            });
            
            document.getElementById('modal-confirm').addEventListener('click', () => {
                this.close();
                resolve(true);
            });
        });
    },
    
    /**
     * Modal d'alerte
     */
    alert(options = {}) {
        return new Promise((resolve) => {
            const {
                title = 'Information',
                message = '',
                buttonText = 'OK'
            } = options;
            
            this.open({
                title,
                content: `<p>${message}</p>`,
                footer: `
                    <button class="btn btn-primary" id="modal-ok">${buttonText}</button>
                `,
                closable: true,
                onClose: () => resolve()
            });
            
            document.getElementById('modal-ok').addEventListener('click', () => {
                this.close();
                resolve();
            });
        });
    },
    
    /**
     * Modal de saisie (prompt)
     */
    prompt(options = {}) {
        return new Promise((resolve) => {
            const {
                title = 'Saisie',
                message = '',
                placeholder = '',
                defaultValue = '',
                confirmText = 'OK',
                cancelText = 'Annuler'
            } = options;
            
            this.open({
                title,
                content: `
                    ${message ? `<p class="mb-md">${message}</p>` : ''}
                    <input type="text" class="form-input" id="modal-input" 
                           placeholder="${placeholder}" value="${defaultValue}">
                `,
                footer: `
                    <button class="btn btn-secondary" id="modal-cancel">${cancelText}</button>
                    <button class="btn btn-primary" id="modal-confirm">${confirmText}</button>
                `,
                closable: true,
                onClose: () => resolve(null)
            });
            
            const input = document.getElementById('modal-input');
            input.focus();
            
            // Enter pour valider
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    this.close();
                    resolve(input.value.trim() || null);
                }
            });
            
            document.getElementById('modal-cancel').addEventListener('click', () => {
                this.close();
                resolve(null);
            });
            
            document.getElementById('modal-confirm').addEventListener('click', () => {
                this.close();
                resolve(input.value.trim() || null);
            });
        });
    }
};
