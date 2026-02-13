/**
 * Vue Not Found - 404
 */

Views.notFound = {
    render(path = '') {
        const main = document.getElementById('main-content');
        if (!main) return;

        main.innerHTML = `
            <div class="empty-state">
                <svg class="empty-state-icon" viewBox="0 0 24 24">
                    <use href="#alert-circle"></use>
                </svg>
                <h3 class="empty-state-title">${I18n.t('not_found.title')}</h3>
                <p class="empty-state-text">${I18n.t('not_found.text').replace('{path}', Sanitize.escapeHtml(path))}</p>
                <button class="btn btn-primary" onclick="Router.navigate('/dashboard')">${I18n.t('not_found.back_home')}</button>
            </div>
        `;
    }
};
