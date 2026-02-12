/**
 * Loader - Indicateurs de chargement
 */

const Loader = {
    page(text = 'Chargement...') {
        return `
            <div class="loader">
                <div class="spinner"></div>
                <p>${text}</p>
            </div>
        `;
    },
    
    inline(size = 'md') {
        const sizes = { sm: 16, md: 24, lg: 32 };
        const s = sizes[size] || 24;
        return `<div class="spinner" style="width:${s}px;height:${s}px;border-width:2px;"></div>`;
    },

    button(btn, loading, options = {}) {
        if (!btn) return;

        if (loading) {
            if (!btn.dataset.originalHtml) {
                btn.dataset.originalHtml = btn.innerHTML;
            }

            const text = typeof options.text === 'string'
                ? options.text
                : (btn.textContent || '').trim();

            btn.disabled = true;
            btn.classList.add('btn-loading');
            btn.innerHTML = `
                <span class="btn-spinner" aria-hidden="true"></span>
                ${text ? `<span class="btn-loading-text">${text}</span>` : ''}
            `;
        } else {
            if (btn.dataset.originalHtml) {
                btn.innerHTML = btn.dataset.originalHtml;
                delete btn.dataset.originalHtml;
            }
            btn.disabled = false;
            btn.classList.remove('btn-loading');
        }
    }
};
