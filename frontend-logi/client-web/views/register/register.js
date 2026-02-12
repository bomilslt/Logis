/**
 * Vue Register - Inscription utilisateur avec vérification OTP
 */

Views.register = {
    formData: null,
    verificationToken: null,
    
    render() {
        const main = document.getElementById('main-content');
        main.innerHTML = `
            <div class="auth-container">
                <div class="auth-card">
                    <div class="auth-header">
                        <img src="assets/images/logo.svg" alt="Express Cargo" class="auth-logo">
                        <h1 class="auth-title">Creer un compte</h1>
                        <p class="auth-subtitle">Rejoignez Express Cargo</p>
                    </div>
                    
                    <form id="register-form" class="auth-form">
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label" for="first_name">Prenom</label>
                                <input type="text" id="first_name" class="form-input" 
                                       placeholder="Jean" required>
                            </div>
                            <div class="form-group">
                                <label class="form-label" for="last_name">Nom</label>
                                <input type="text" id="last_name" class="form-input" 
                                       placeholder="Dupont" required>
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label" for="email">Email</label>
                            <input type="email" id="email" class="form-input" 
                                   placeholder="votre@email.com" required>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label" for="phone">Telephone</label>
                            <input type="tel" id="phone" class="form-input" 
                                   placeholder="+237 6XX XXX XXX">
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label" for="password">Mot de passe</label>
                            <input type="password" id="password" class="form-input" 
                                   placeholder="Minimum 8 caracteres" required minlength="8">
                            <p class="form-hint">Au moins 8 caractères, 1 majuscule, 1 minuscule, 1 chiffre</p>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label" for="password_confirm">Confirmer</label>
                            <input type="password" id="password_confirm" class="form-input" 
                                   placeholder="Confirmez le mot de passe" required>
                        </div>
                        
                        <button type="submit" class="btn btn-primary btn-block btn-lg" id="btn-register">
                            Creer mon compte
                        </button>
                    </form>
                    
                    <div class="auth-footer">
                        <p>Deja un compte ? <a href="#/login">Se connecter</a></p>
                    </div>
                </div>
            </div>
        `;
        
        this.attachEvents();
    },
    
    attachEvents() {
        document.getElementById('register-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleRegister();
        });
    },
    
    validatePassword(password) {
        if (password.length < 8) {
            return 'Le mot de passe doit contenir au moins 8 caractères';
        }
        if (!/[A-Z]/.test(password)) {
            return 'Le mot de passe doit contenir au moins une majuscule';
        }
        if (!/[a-z]/.test(password)) {
            return 'Le mot de passe doit contenir au moins une minuscule';
        }
        if (!/\d/.test(password)) {
            return 'Le mot de passe doit contenir au moins un chiffre';
        }
        return null;
    },
    
    async handleRegister() {
        const password = document.getElementById('password').value;
        const passwordConfirm = document.getElementById('password_confirm').value;
        
        // Validation mot de passe
        const passwordError = this.validatePassword(password);
        if (passwordError) {
            Toast.error(passwordError);
            return;
        }
        
        if (password !== passwordConfirm) {
            Toast.error('Les mots de passe ne correspondent pas');
            return;
        }
        
        // Stocker les données du formulaire
        this.formData = {
            first_name: document.getElementById('first_name').value.trim(),
            last_name: document.getElementById('last_name').value.trim(),
            email: document.getElementById('email').value.trim().toLowerCase(),
            phone: document.getElementById('phone').value.trim(),
            password: password
        };
        
        const btn = document.getElementById('btn-register');
        btn.disabled = true;
        btn.innerHTML = Loader.inline('sm') + ' Verification...';
        
        // Ouvrir le modal OTP pour vérifier l'email
        OTPModal.open({
            email: this.formData.email,
            phone: this.formData.phone || null,
            purpose: 'register',
            name: this.formData.first_name,
            title: 'Vérification de votre email',
            onSuccess: async (data) => {
                // Email vérifié, créer le compte
                this.verificationToken = data.verification_token;
                await this.createAccount();
            },
            onCancel: () => {
                btn.disabled = false;
                btn.textContent = 'Creer mon compte';
            }
        });
        
        btn.disabled = false;
        btn.textContent = 'Creer mon compte';
    },
    
    async createAccount() {
        const btn = document.getElementById('btn-register');
        btn.disabled = true;
        btn.innerHTML = Loader.inline('sm') + ' Creation du compte...';
        
        try {
            const data = await API.auth.registerVerified({
                ...this.formData,
                verification_token: this.verificationToken
            });
            
            Store.login(data);
            Toast.success('Compte créé avec succès !');
            Router.navigate('/dashboard');
        } catch (error) {
            Toast.error(error.message || 'Echec de l\'inscription');
            btn.disabled = false;
            btn.textContent = 'Creer mon compte';
        }
    }
};
