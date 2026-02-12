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
                <h3 class="empty-state-title">Page introuvable</h3>
                <p class="empty-state-text">La page "${Sanitize.escapeHtml(path)}" n'existe pas.</p>
                <button class="btn btn-primary" onclick="Router.navigate('/dashboard')">Retour au tableau de bord</button>
            </div>
        `;
    }
};
