/**
 * Vue Login - Connexion admin avec 2FA
 */

Views.login = {
    render() {
        document.getElementById('sidebar').style.display = 'none';
        document.getElementById('header').style.display = 'none';
        
        const main = document.getElementById('main-content');
        main.innerHTML = `
            <div class="login-page">
                <div class="login-card">
                    <div class="login-header">
                        <img src="assets/images/logo.svg" alt="Logo" class="login-logo">
                        <h1 class="login-title">Express Cargo</h1>
                        <p class="login-subtitle">Espace Administration</p>
                    </div>
                    
                    <form id="login-form" class="login-form">
                        <div class="form-group">
                            <label class="form-label" for="email">Email</label>
                            <input type="email" id="email" class="form-input" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="password">Mot de passe</label>
                            <input type="password" id="password" class="form-input" required>
                        </div>
                        <button type="submit" class="btn btn-primary btn-lg" style="width:100%" id="btn-login">
                            Se connecter
                        </button>
                    </form>
                    
                    <div class="login-divider">
                        <span>ou</span>
                    </div>
                    
                    <button class="btn btn-outline" style="width:100%" id="btn-login-otp">
                        ${Icons.get('lock', {size:18})} Connexion avec code OTP
                    </button>
                </div>
            </div>
        `;
        
        document.getElementById('login-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleLogin();
        });
        
        document.getElementById('btn-login-otp')?.addEventListener('click', () => {
            this.showOTPLogin();
        });
    },
    
    async handleLogin() {
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const btn = document.getElementById('btn-login');
        
        btn.disabled = true;
        btn.innerHTML = Loader.inline('sm') + ' Connexion...';
        
        try {
            const data = await API.auth.login(email, password);
            Store.login(data);
            if (window.ViewFilter) ViewFilter.invalidateCache();
            document.getElementById('sidebar').style.display = '';
            document.getElementById('header').style.display = '';
            App.updateHeaderUser();
            Router.navigate('/dashboard');
        } catch (error) {
            Toast.error(error.message || 'Echec de la connexion');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Se connecter';
        }
    },
    
    showOTPLogin() {
        const email = document.getElementById('email').value;
        
        if (!email) {
            Toast.warning('Entrez votre email d\'abord');
            document.getElementById('email').focus();
            return;
        }
        
        OTPModal.open({
            email: email,
            phone: null,
            purpose: 'login',
            title: 'Connexion sécurisée',
            onSuccess: (data) => {
                Store.login(data);
                if (window.ViewFilter) ViewFilter.invalidateCache();
                document.getElementById('sidebar').style.display = '';
                document.getElementById('header').style.display = '';
                App.updateHeaderUser();
                Toast.success('Connexion réussie');
                Router.navigate('/dashboard');
            },
            onCancel: () => {}
        });
    }
};
