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
                        <p class="login-subtitle">${I18n.t('login.admin_area')}</p>
                    </div>
                    
                    <form id="login-form" class="login-form">
                        <div class="form-group">
                            <label class="form-label" for="email">${I18n.t('login.email')}</label>
                            <input type="email" id="email" class="form-input" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="password">${I18n.t('login.password')}</label>
                            <input type="password" id="password" class="form-input" required>
                        </div>
                        <button type="submit" class="btn btn-primary btn-lg" style="width:100%" id="btn-login">
                            ${I18n.t('login.submit')}
                        </button>
                    </form>
                    
                    <div class="login-divider">
                        <span>${I18n.t('login.or')}</span>
                    </div>
                    
                    <button class="btn btn-outline" style="width:100%" id="btn-login-otp">
                        ${Icons.get('lock', {size:18})} ${I18n.t('login.otp_login')}
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
        btn.innerHTML = Loader.inline('sm') + ` ${I18n.t('login.logging_in')}`;
        
        try {
            const data = await API.auth.login(email, password);
            Store.login(data);
            if (window.ViewFilter) ViewFilter.invalidateCache();
            document.getElementById('sidebar').style.display = '';
            document.getElementById('header').style.display = '';
            App.updateHeaderUser();
            Router.navigate('/dashboard');
        } catch (error) {
            Toast.error(error.message || I18n.t('login.login_failed'));
        } finally {
            btn.disabled = false;
            btn.textContent = I18n.t('login.submit');
        }
    },
    
    showOTPLogin() {
        const email = document.getElementById('email').value;
        
        if (!email) {
            Toast.warning(I18n.t('login.enter_email_first'));
            document.getElementById('email').focus();
            return;
        }
        
        OTPModal.open({
            email: email,
            phone: null,
            purpose: 'login',
            title: I18n.t('login.secure_login'),
            onSuccess: (data) => {
                Store.login(data);
                if (window.ViewFilter) ViewFilter.invalidateCache();
                document.getElementById('sidebar').style.display = '';
                document.getElementById('header').style.display = '';
                App.updateHeaderUser();
                Toast.success(I18n.t('login.login_success'));
                Router.navigate('/dashboard');
            },
            onCancel: () => {}
        });
    }
};
