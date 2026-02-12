/**
 * Vue Login - Connexion utilisateur avec 2FA
 */

Views.login = {
    render() {
        const main = document.getElementById('main-content');
        main.innerHTML = `
            <div class="auth-container">
                <div class="auth-card">
                    <div class="auth-header">
                        <img src="assets/images/logo.svg" alt="Express Cargo" class="auth-logo">
                        <h1 class="auth-title">Connexion</h1>
                        <p class="auth-subtitle">Accedez a votre espace client</p>
                    </div>
                    
                    <form id="login-form" class="auth-form">
                        <div class="form-group">
                            <label class="form-label" for="email">Email</label>
                            <input type="email" id="email" class="form-input" 
                                   placeholder="votre@email.com" required>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label" for="password">Mot de passe</label>
                            <div class="password-input-wrapper">
                                <input type="password" id="password" class="form-input" 
                                       placeholder="Votre mot de passe" required>
                                <button type="button" class="password-toggle" id="toggle-password">
                                    <svg class="icon" viewBox="0 0 24 24">
                                        <use href="assets/icons/icons.svg#eye"></use>
                                    </svg>
                                </button>
                            </div>
                        </div>
                        
                        <button type="submit" class="btn btn-primary btn-block btn-lg" id="btn-login">
                            Se connecter
                        </button>
                    </form>
                    
                    <div class="auth-divider">
                        <span>ou</span>
                    </div>
                    
                    <button class="btn btn-outline btn-block" id="btn-login-otp">
                        <svg class="icon" viewBox="0 0 24 24" width="18" height="18">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="2"></rect>
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" fill="none" stroke="currentColor" stroke-width="2"></path>
                        </svg>
                        Connexion avec code de verification
                    </button>
                    
                    <div class="auth-links">
                        <a href="#/forgot-password" class="auth-link">Mot de passe oublie ?</a>
                    </div>
                    
                    <div class="auth-footer">
                        <p>Pas encore de compte ? <a href="#/register">Creer un compte</a></p>
                    </div>
                </div>
            </div>
        `;
        
        this.attachEvents();
    },
    
    attachEvents() {
        // Toggle password visibility
        document.getElementById('toggle-password')?.addEventListener('click', () => {
            const input = document.getElementById('password');
            const icon = document.querySelector('#toggle-password use');
            if (input.type === 'password') {
                input.type = 'text';
                icon.setAttribute('href', 'assets/icons/icons.svg#eye-off');
            } else {
                input.type = 'password';
                icon.setAttribute('href', 'assets/icons/icons.svg#eye');
            }
        });
        
        // Form submit (password login)
        document.getElementById('login-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleLogin();
        });
        
        // OTP login button
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
            console.log('[Login] Response data:', data);
            
            // Stocker les données
            Store.login(data);
            console.log('[Login] User stored:', Store.getUser());
            
            Toast.success('Connexion reussie');
            
            // Petite pause pour s'assurer que tout est bien stocké
            setTimeout(() => {
                Router.navigate('/dashboard');
            }, 100);
            
        } catch (error) {
            console.error('[Login] Error:', error);
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
        
        // Ouvrir le modal OTP
        OTPModal.open({
            email: email,
            phone: null, // Sera récupéré depuis le backend si disponible
            purpose: 'login',
            title: 'Connexion sécurisée',
            onSuccess: (data) => {
                // data contient user, access_token, refresh_token, csrf_token
                Store.login(data);
                Toast.success('Connexion réussie');
                Router.navigate('/dashboard');
            },
            onCancel: () => {
                // Rien à faire
            }
        });
    }
};
