/**
 * Vue Forgot Password - Reinitialisation du mot de passe avec OTP
 */

Views.forgotPassword = {
    step: 'email', // email | reset | success
    email: '',
    verificationToken: null,
    
    render() {
        const main = document.getElementById('main-content');
        
        main.innerHTML = `
            <div class="auth-page">
                <div class="auth-card">
                    <div class="auth-header">
                        <a href="#/login" class="auth-back">
                            <svg class="icon" viewBox="0 0 24 24"><use href="assets/icons/icons.svg#arrow-left"></use></svg>
                            Retour
                        </a>
                        <h1 class="auth-title">Mot de passe oublie</h1>
                    </div>
                    
                    <div id="forgot-content">
                        ${this.renderStep()}
                    </div>
                </div>
            </div>
        `;
        
        this.attachEvents();
    },
    
    renderStep() {
        switch (this.step) {
            case 'email':
                return `
                    <p class="auth-subtitle">Entrez votre adresse email pour recevoir un code de verification.</p>
                    <form id="email-form" class="auth-form">
                        <div class="form-group">
                            <label class="form-label" for="email">Email</label>
                            <input type="email" id="email" class="form-input" placeholder="votre@email.com" required value="${this.email}">
                        </div>
                        <button type="submit" class="btn btn-primary btn-block" id="btn-send">
                            Recevoir le code
                        </button>
                    </form>
                `;
            
            case 'reset':
                return `
                    <p class="auth-subtitle">Choisissez votre nouveau mot de passe.</p>
                    <form id="reset-form" class="auth-form">
                        <div class="form-group">
                            <label class="form-label" for="password">Nouveau mot de passe</label>
                            <input type="password" id="password" class="form-input" placeholder="Min. 8 caracteres" required minlength="8">
                            <p class="form-hint">Au moins 8 caractères, 1 majuscule, 1 minuscule, 1 chiffre</p>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="confirm">Confirmer</label>
                            <input type="password" id="confirm" class="form-input" placeholder="Confirmez le mot de passe" required>
                        </div>
                        <button type="submit" class="btn btn-primary btn-block" id="btn-reset">
                            Reinitialiser
                        </button>
                    </form>
                `;
            
            case 'success':
                return `
                    <div class="auth-success">
                        <div class="success-icon">
                            <svg class="icon" viewBox="0 0 24 24"><use href="assets/icons/icons.svg#check-circle"></use></svg>
                        </div>
                        <h2>Mot de passe modifie</h2>
                        <p>Votre mot de passe a ete reinitialise avec succes.</p>
                        <a href="#/login" class="btn btn-primary btn-block">Se connecter</a>
                    </div>
                `;
        }
    },
    
    updateContent() {
        document.getElementById('forgot-content').innerHTML = this.renderStep();
        this.attachEvents();
    },
    
    attachEvents() {
        // Step: Email
        document.getElementById('email-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.startReset();
        });
        
        // Step: Reset
        document.getElementById('reset-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.resetPassword();
        });
    },
    
    async startReset() {
        const emailInput = document.getElementById('email');
        const btn = document.getElementById('btn-send');
        
        this.email = emailInput?.value.trim();
        
        if (!this.email) {
            Toast.error('Entrez votre email');
            return;
        }
        
        btn.disabled = true;
        btn.innerHTML = Loader.inline('sm') + ' Verification...';
        
        // Ouvrir le modal OTP
        OTPModal.open({
            email: this.email,
            phone: null,
            purpose: 'password_reset',
            title: 'Réinitialisation du mot de passe',
            onSuccess: (data) => {
                // Stocker le token de vérification
                this.verificationToken = data.verification_token;
                this.step = 'reset';
                this.updateContent();
            },
            onCancel: () => {
                btn.disabled = false;
                btn.textContent = 'Recevoir le code';
            }
        });
        
        btn.disabled = false;
        btn.textContent = 'Recevoir le code';
    },
    
    async resetPassword() {
        const password = document.getElementById('password').value;
        const confirm = document.getElementById('confirm').value;
        const btn = document.getElementById('btn-reset');
        
        if (password.length < 8) {
            Toast.error('Le mot de passe doit contenir au moins 8 caracteres');
            return;
        }
        
        if (!/[A-Z]/.test(password)) {
            Toast.error('Le mot de passe doit contenir au moins une majuscule');
            return;
        }
        
        if (!/[a-z]/.test(password)) {
            Toast.error('Le mot de passe doit contenir au moins une minuscule');
            return;
        }
        
        if (!/\d/.test(password)) {
            Toast.error('Le mot de passe doit contenir au moins un chiffre');
            return;
        }
        
        if (password !== confirm) {
            Toast.error('Les mots de passe ne correspondent pas');
            return;
        }
        
        btn.disabled = true;
        btn.innerHTML = Loader.inline('sm') + ' Reinitialisation...';
        
        try {
            await API.auth.resetPassword(this.email, password, this.verificationToken);
            this.step = 'success';
            this.updateContent();
        } catch (error) {
            Toast.error(error.message || 'Erreur lors de la réinitialisation');
            btn.disabled = false;
            btn.textContent = 'Reinitialiser';
        }
    }
};
