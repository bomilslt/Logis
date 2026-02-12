/**
 * Utility functions for LOGi Super Admin
 */
const Utils = (() => {

    function formatDate(isoStr) {
        if (!isoStr) return '—';
        const d = new Date(isoStr);
        return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    function formatDateTime(isoStr) {
        if (!isoStr) return '—';
        const d = new Date(isoStr);
        return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    function formatMoney(amount, currency = 'XAF') {
        if (amount == null) return '—';
        const n = Number(amount);
        if (currency === 'USD') return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
        return `${n.toLocaleString('fr-FR')} ${currency}`;
    }

    function formatNumber(n) {
        if (n == null) return '—';
        if (n === -1) return '∞';
        return Number(n).toLocaleString('fr-FR');
    }

    function statusBadge(status) {
        const map = {
            active: 'success', trial: 'info', expired: 'danger',
            cancelled: 'neutral', suspended: 'warning', pending: 'warning',
            completed: 'success', failed: 'danger', refunded: 'neutral'
        };
        const cls = map[status] || 'neutral';
        return `<span class="badge badge-${cls}">${status}</span>`;
    }

    function durationLabel(months) {
        if (!months) return '—';
        if (months === 1) return '1 mois';
        if (months === 12) return '1 an';
        return `${months} mois`;
    }

    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }

    function showModal(title, bodyHtml, footerHtml = '') {
        const overlay = document.getElementById('modal-overlay');
        const content = document.getElementById('modal-content');
        content.innerHTML = `
            <div class="modal-header">
                <h3>${title}</h3>
                <button class="modal-close" onclick="Utils.closeModal()">✕</button>
            </div>
            <div class="modal-body">${bodyHtml}</div>
            ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
        `;
        overlay.classList.remove('hidden');
    }

    function closeModal() {
        document.getElementById('modal-overlay').classList.add('hidden');
    }

    function loading() {
        return '<div class="loading"><div class="spinner"></div> Chargement...</div>';
    }

    function emptyState(icon, title, desc) {
        return `<div class="empty-state"><div class="empty-icon">${icon}</div><h3>${title}</h3><p>${desc}</p></div>`;
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function debounce(fn, ms = 300) {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn(...args), ms);
        };
    }

    function paginationHtml(pagination, onPageFn) {
        if (!pagination || pagination.pages <= 1) return '';
        const { page, pages, total, per_page } = pagination;
        const start = (page - 1) * per_page + 1;
        const end = Math.min(page * per_page, total);
        let btns = '';
        btns += `<button ${page <= 1 ? 'disabled' : ''} onclick="${onPageFn}(${page - 1})">‹</button>`;
        for (let i = 1; i <= pages; i++) {
            if (pages > 7 && i > 2 && i < pages - 1 && Math.abs(i - page) > 1) {
                if (i === 3 || i === pages - 2) btns += '<button disabled>…</button>';
                continue;
            }
            btns += `<button class="${i === page ? 'active' : ''}" onclick="${onPageFn}(${i})">${i}</button>`;
        }
        btns += `<button ${page >= pages ? 'disabled' : ''} onclick="${onPageFn}(${page + 1})">›</button>`;
        return `<div class="pagination"><span class="pagination-info">${start}–${end} sur ${total}</span><div class="pagination-btns">${btns}</div></div>`;
    }

    return {
        formatDate, formatDateTime, formatMoney, formatNumber,
        statusBadge, durationLabel,
        showToast, showModal, closeModal,
        loading, emptyState, escapeHtml, debounce, paginationHtml
    };
})();
