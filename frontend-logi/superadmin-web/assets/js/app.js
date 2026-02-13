/**
 * LOGi Super Admin - Main Application
 */
const App = (() => {
    const views = {
        dashboard: DashboardView,
        tenants: TenantsView,
        plans: PlansView,
        subscriptions: SubscriptionsView,
        payments: PaymentsView,
        providers: ProvidersView,
        config: ConfigView,
        admins: AdminsView
    };

    const pageTitles = {
        dashboard: 'Dashboard',
        tenants: 'Tenants',
        plans: 'Plans d\'abonnement',
        subscriptions: 'Abonnements',
        payments: 'Paiements',
        providers: 'Providers de paiement',
        config: 'Configuration',
        admins: 'Administrateurs'
    };

    let currentPage = 'dashboard';

    function init() {
        // Use SA_CONFIG.API_BASE_URL (set in api.js) — do NOT override with location.origin
        API.init();

        API.setUnauthorizedHandler(() => {
            showLogin();
            Utils.showToast('Session expirée, veuillez vous reconnecter', 'warning');
        });

        // Event listeners
        document.getElementById('login-form').addEventListener('submit', handleLogin);
        document.getElementById('logout-btn').addEventListener('click', handleLogout);
        document.getElementById('sidebar-toggle').addEventListener('click', toggleSidebar);
        document.getElementById('mobile-menu-btn').addEventListener('click', toggleMobileMenu);

        // Modal close on overlay click
        document.getElementById('modal-overlay').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) Utils.closeModal();
        });

        // Navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const page = item.dataset.page;
                if (page) navigateTo(page);
            });
        });

        // Hash routing
        window.addEventListener('hashchange', () => {
            const hash = window.location.hash.replace('#', '') || 'dashboard';
            if (views[hash]) navigateTo(hash, false);
        });

        // Check auth
        if (API.isAuthenticated()) {
            checkSession();
        } else {
            showLogin();
        }
    }

    async function checkSession() {
        try {
            const me = await API.getMe();
            showApp(me);
        } catch {
            showLogin();
        }
    }

    async function handleLogin(e) {
        e.preventDefault();
        const btn = document.getElementById('login-btn');
        const errorEl = document.getElementById('login-error');
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;

        btn.disabled = true;
        btn.querySelector('.btn-text').textContent = 'Connexion...';
        errorEl.classList.add('hidden');

        try {
            const result = await API.login(email, password);
            showApp(result.admin || result);
        } catch (err) {
            errorEl.textContent = err.message || 'Identifiants invalides';
            errorEl.classList.remove('hidden');
        } finally {
            btn.disabled = false;
            btn.querySelector('.btn-text').textContent = 'Se connecter';
        }
    }

    async function handleLogout() {
        await API.logout();
        showLogin();
    }

    function showLogin() {
        document.getElementById('login-screen').classList.remove('hidden');
        document.getElementById('app').classList.add('hidden');
        document.getElementById('login-email').value = '';
        document.getElementById('login-password').value = '';
    }

    function showApp(admin) {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');

        if (admin) {
            document.getElementById('admin-name').textContent = admin.email || 'Admin';
            document.getElementById('admin-email').textContent = admin.is_primary ? 'Super Admin' : 'Admin';
        }

        // Navigate to hash or dashboard
        const hash = window.location.hash.replace('#', '') || 'dashboard';
        navigateTo(views[hash] ? hash : 'dashboard');
    }

    function navigateTo(page, updateHash = true) {
        if (!views[page]) return;
        currentPage = page;

        // Update nav
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.page === page);
        });

        // Update title
        document.getElementById('page-title').textContent = pageTitles[page] || page;

        // Update hash
        if (updateHash) window.location.hash = page;

        // Close mobile menu
        document.getElementById('sidebar').classList.remove('mobile-open');

        // Render view
        views[page].render();
    }

    function toggleSidebar() {
        document.getElementById('sidebar').classList.toggle('collapsed');
    }

    function toggleMobileMenu() {
        document.getElementById('sidebar').classList.toggle('mobile-open');
    }

    // Auto-init
    document.addEventListener('DOMContentLoaded', init);

    return { navigateTo };
})();
