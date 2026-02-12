/**
 * OTP Modal Component - Tenant Web
 * Modal moderne pour la vérification 2FA
 */

const OTPModal = {
    isOpen: false,
    config: null,
    onSuccess: null,
    onCancel: null,
    selectedChannel: null,
    channels: [],
    countdown: 0,
    countdownInterval: null,
    
    /**
     * Ouvre le modal OTP pour login
     * Étape 1: Saisie email/téléphone → Étape 2: Choix canal → Étape 3: Code OTP
     */
    async openLogin(options) {
        this.config = {
            ...options,
            purpose: 'login',
            title: 'Connexion sécurisée'
        };
        this.onSuccess = options.onSuccess;
        this.onCancel = options.onCancel;
        this.selectedChannel = null;
        this.channels = [];
        this.isOpen = true;
        
        this.renderLoginStep();
    },
    
    renderLoginStep() {
        document.getElementById('otp-modal')?.remove();
        
        const modal = document.createElement('div');
        modal.id = 'otp-modal';
        modal.className = 'otp-modal';
        modal.innerHTML = `
            <div class="otp-modal-backdrop" id="otp-backdrop"></div>
            <div class="otp-modal-container">
                <div class="otp-modal-content">
                    <button class="otp-modal-close" id="otp-close-btn">
                        ${Icons.get('x', {size: 24})}
                    </button>
                    
                    <div class="otp-header">
                        <div class="otp-icon">
                            ${Icons.get('lock', {size: 32})}
                        </div>
                        <h2 class="otp-title">Connexion sécurisée</h2>
                        <p class="otp-subtitle">Entrez votre email ou téléphone</p>
                    </div>
                    
                    <div id="otp-step-login" class="otp-step">
                        <form id="login-identifier-form">
                            <div class="form-group">
                                <label class="form-label">Email ou téléphone</label>
                                <input type="text" id="otp-identifier" class="form-input" 
                                       placeholder="votre@email.com ou +237..." required
                                       value="${this.config.email || ''}">
                            </div>
                            <div id="otp-login-error" class="otp-error" style="display:none"></div>
                            <button type="submit" class="btn btn-primary" style="width:100%" id="otp-login-next">
                                Continuer
                            </button>
                        </form>
                    </div>
                    
                    <div id="otp-step-channels" class="otp-step" style="display:none">
                        <div class="otp-channels-loading">
                            <div class="otp-spinner"></div>
                            <p>Chargement des options...</p>
                        </div>
                    </div>
                    
                    <div id="otp-step-code" class="otp-step" style="display:none">
                        <div class="otp-sent-info">
                            <p>Code envoyé à <strong id="otp-destination"></strong></p>
                        </div>
                        
                        <div class="otp-input-container">
                            <input type="text" class="otp-input" maxlength="1" data-index="0" inputmode="numeric">
                            <input type="text" class="otp-input" maxlength="1" data-index="1" inputmode="numeric">
                            <input type="text" class="otp-input" maxlength="1" data-index="2" inputmode="numeric">
                            <input type="text" class="otp-input" maxlength="1" data-index="3" inputmode="numeric">
                            <input type="text" class="otp-input" maxlength="1" data-index="4" inputmode="numeric">
                            <input type="text" class="otp-input" maxlength="1" data-index="5" inputmode="numeric">
                        </div>
                        
                        <div id="otp-error" class="otp-error" style="display:none"></div>
                        
                        <button id="otp-verify-btn" class="btn btn-primary" style="width:100%">
                            Vérifier
                        </button>
                        
                        <div class="otp-resend">
                            <span id="otp-resend-text">Vous n'avez pas reçu le code ?</span>
                            <button id="otp-resend-btn" class="otp-btn-link">
                                Renvoyer
                            </button>
                            <span id="otp-countdown" class="otp-countdown" style="display:none"></span>
                        </div>
                        
                        <button class="otp-btn-link otp-change-method" id="otp-change-method">
                            ← Changer de méthode
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Attacher les événements
        document.getElementById('otp-close-btn').addEventListener('click', () => this.handleClose());
        document.getElementById('otp-backdrop').addEventListener('click', () => this.handleBackdropClick());
        document.getElementById('login-identifier-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.validateIdentifierAndLoadChannels();
        });
        
        // Focus sur le champ
        document.getElementById('otp-identifier')?.focus();
        
        requestAnimationFrame(() => modal.classList.add('show'));
    },
    
    async validateIdentifierAndLoadChannels() {
        const identifier = document.getElementById('otp-identifier').value.trim();
        const errorEl = document.getElementById('otp-login-error');
        const btn = document.getElementById('otp-login-next');
        
        if (!identifier) {
            errorEl.textContent = 'Veuillez entrer votre email ou téléphone';
            errorEl.style.display = 'block';
            return;
        }
        
        // Déterminer si c'est un email ou téléphone
        const isEmail = identifier.includes('@');
        
        errorEl.style.display = 'none';
        btn.disabled = true;
        btn.innerHTML = Loader.inline('sm') + ' Vérification...';
        
        // Mettre à jour la config
        if (isEmail) {
            this.config.email = identifier.toLowerCase();
            this.config.phone = null;
        } else {
            this.config.phone = identifier;
            this.config.email = null;
        }
        
        // Vérifier que l'utilisateur existe en chargeant les canaux
        try {
            const response = await API.post('/auth/otp/channels', {
                email: this.config.email,
                phone: this.config.phone,
                purpose: this.config.purpose
            });
            
            if (response.channels && response.channels.length > 0) {
                this.channels = response.channels;
                
                // Passer à l'étape des canaux
                document.getElementById('otp-step-login').style.display = 'none';
                document.getElementById('otp-step-channels').style.display = 'block';
                
                // Mettre à jour le header
                document.querySelector('.otp-subtitle').textContent = 'Choisissez comment recevoir votre code';
                
                this.renderChannels();
            } else {
                // Pas de canaux disponibles
                errorEl.textContent = 'Aucune méthode de vérification disponible pour ce compte';
                errorEl.style.display = 'block';
            }
        } catch (error) {
            // Utilisateur non trouvé ou autre erreur
            errorEl.textContent = error.message || 'Compte non trouvé';
            errorEl.style.display = 'block';
        } finally {
            btn.disabled = false;
            btn.textContent = 'Continuer';
        }
    },
    
    async open(options) {
        // Pour le login, utiliser openLogin qui demande l'identifiant
        if (options.purpose === 'login') {
            return this.openLogin(options);
        }
        
        this.config = options;
        this.onSuccess = options.onSuccess;
        this.onCancel = options.onCancel;
        this.selectedChannel = null;
        this.channels = [];
        this.isOpen = true;
        this.passwordData = null;
        
        this.render();
        await this.loadChannels();
    },
    
    /**
     * Ouvre le modal pour changement de mot de passe complet
     * Étapes: 1. Saisie mots de passe → 2. Choix canal OTP → 3. Vérification code → 4. Succès
     */
    async openPasswordChange(options) {
        this.config = {
            ...options,
            purpose: 'password_change',
            title: 'Changer le mot de passe'
        };
        this.onSuccess = options.onSuccess;
        this.onCancel = options.onCancel;
        this.selectedChannel = null;
        this.channels = [];
        this.isOpen = true;
        this.passwordData = null;
        
        this.renderPasswordStep();
    },
    
    /**
     * Ouvre le modal pour changement d'email
     * Étapes: 1. Saisie mot de passe + nouvel email → 2. Vérification code OTP sur nouvel email → 3. Succès
     */
    async openEmailChange(options) {
        this.config = {
            ...options,
            purpose: 'email_change',
            title: 'Changer l\'adresse email'
        };
        this.onSuccess = options.onSuccess;
        this.onCancel = options.onCancel;
        this.selectedChannel = null;
        this.channels = [];
        this.isOpen = true;
        this.emailData = null;
        
        this.renderEmailStep();
    },
    
    renderEmailStep() {
        document.getElementById('otp-modal')?.remove();
        
        const modal = document.createElement('div');
        modal.id = 'otp-modal';
        modal.className = 'otp-modal';
        modal.innerHTML = `
            <div class="otp-modal-backdrop" id="otp-backdrop"></div>
            <div class="otp-modal-container">
                <div class="otp-modal-content">
                    <button class="otp-modal-close" id="otp-close-btn">
                        ${Icons.get('x', {size: 24})}
                    </button>
                    
                    <div class="otp-header">
                        <div class="otp-icon">
                            ${Icons.get('mail', {size: 32})}
                        </div>
                        <h2 class="otp-title">Changer l'adresse email</h2>
                        <p class="otp-subtitle">Entrez votre mot de passe et la nouvelle adresse</p>
                    </div>
                    
                    <div id="otp-step-email" class="otp-step">
                        <form id="email-change-form">
                            <div class="form-group">
                                <label class="form-label">Mot de passe actuel</label>
                                <input type="password" id="otp-current-password" class="form-input" required>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Nouvelle adresse email</label>
                                <input type="email" id="otp-new-email" class="form-input" required>
                            </div>
                            <div id="otp-email-error" class="otp-error" style="display:none"></div>
                            <button type="submit" class="btn btn-primary" style="width:100%" id="otp-email-next">
                                Envoyer le code de vérification
                            </button>
                        </form>
                    </div>
                    
                    <div id="otp-step-code" class="otp-step" style="display:none">
                        <div class="otp-sent-info">
                            <p>Code envoyé à <strong id="otp-destination"></strong></p>
                        </div>
                        
                        <div class="otp-input-container">
                            <input type="text" class="otp-input" maxlength="1" data-index="0" inputmode="numeric">
                            <input type="text" class="otp-input" maxlength="1" data-index="1" inputmode="numeric">
                            <input type="text" class="otp-input" maxlength="1" data-index="2" inputmode="numeric">
                            <input type="text" class="otp-input" maxlength="1" data-index="3" inputmode="numeric">
                            <input type="text" class="otp-input" maxlength="1" data-index="4" inputmode="numeric">
                            <input type="text" class="otp-input" maxlength="1" data-index="5" inputmode="numeric">
                        </div>
                        
                        <div id="otp-error" class="otp-error" style="display:none"></div>
                        
                        <button id="otp-verify-btn" class="btn btn-primary" style="width:100%">
                            Vérifier et changer l'email
                        </button>
                        
                        <div class="otp-resend">
                            <span id="otp-resend-text">Vous n'avez pas reçu le code ?</span>
                            <button id="otp-resend-btn" class="otp-btn-link">
                                Renvoyer
                            </button>
                            <span id="otp-countdown" class="otp-countdown" style="display:none"></span>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Attacher les événements
        document.getElementById('otp-close-btn').addEventListener('click', () => this.handleClose());
        document.getElementById('email-change-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.validateEmailAndSendOTP();
        });
        
        // Focus sur le premier champ
        document.getElementById('otp-current-password')?.focus();
        
        requestAnimationFrame(() => modal.classList.add('show'));
    },
    
    async validateEmailAndSendOTP() {
        const password = document.getElementById('otp-current-password').value;
        const newEmail = document.getElementById('otp-new-email').value.trim().toLowerCase();
        const errorEl = document.getElementById('otp-email-error');
        const btn = document.getElementById('otp-email-next');
        
        // Validation email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(newEmail)) {
            errorEl.textContent = 'Format d\'email invalide';
            errorEl.style.display = 'block';
            return;
        }
        
        errorEl.style.display = 'none';
        btn.disabled = true;
        btn.innerHTML = Loader.inline('sm') + ' Vérification...';
        
        // Vérifier le mot de passe actuel
        try {
            await API.post('/auth/verify-password', { password });
        } catch (error) {
            errorEl.textContent = 'Mot de passe incorrect';
            errorEl.style.display = 'block';
            btn.disabled = false;
            btn.textContent = 'Envoyer le code de vérification';
            return;
        }
        
        // Envoyer l'OTP au nouvel email
        try {
            const response = await API.post('/auth/send-email-change-otp', { new_email: newEmail });
            
            if (response.success) {
                // Stocker les données pour plus tard
                this.emailData = { password, newEmail };
                
                // Passer à l'étape code
                document.getElementById('otp-step-email').style.display = 'none';
                document.getElementById('otp-step-code').style.display = 'block';
                document.getElementById('otp-destination').textContent = response.destination_masked;
                
                // Mettre à jour le header
                document.querySelector('.otp-title').textContent = 'Vérification de l\'email';
                document.querySelector('.otp-subtitle').textContent = 'Entrez le code reçu sur votre nouvelle adresse';
                document.querySelector('.otp-icon').innerHTML = Icons.get('lock', {size: 32});
                
                // Attacher les événements
                const verifyBtn = document.getElementById('otp-verify-btn');
                const resendBtn = document.getElementById('otp-resend-btn');
                
                verifyBtn.onclick = () => this.verifyEmailChangeCode();
                resendBtn.onclick = () => this.resendEmailChangeCode();
                
                this.attachInputEvents();
                this.startCountdown(60);
                
                document.querySelector('.otp-input[data-index="0"]')?.focus();
            } else {
                errorEl.textContent = response.error || 'Erreur lors de l\'envoi';
                errorEl.style.display = 'block';
            }
        } catch (error) {
            errorEl.textContent = error.message || 'Erreur de connexion';
            errorEl.style.display = 'block';
        } finally {
            btn.disabled = false;
            btn.textContent = 'Envoyer le code de vérification';
        }
    },
    
    async verifyEmailChangeCode() {
        const code = this.getCode();
        if (code.length !== 6) {
            this.showError('Veuillez entrer le code complet');
            return;
        }
        
        const btn = document.getElementById('otp-verify-btn');
        btn.disabled = true;
        btn.innerHTML = Loader.inline('sm') + ' Vérification...';
        
        try {
            const response = await API.post('/auth/change-email-verified', {
                current_password: this.emailData.password,
                new_email: this.emailData.newEmail,
                code: code
            });
            
            if (response.success) {
                // Mettre à jour le store avec le nouvel utilisateur
                if (response.user) {
                    Store.setUser(response.user);
                }
                
                // Fermer le modal
                this.isOpen = false;
                this.clearCountdown();
                const modal = document.getElementById('otp-modal');
                modal.classList.remove('show');
                
                setTimeout(() => {
                    modal.remove();
                    if (this.onSuccess) this.onSuccess(response);
                }, 300);
            } else {
                this.showError(response.error || 'Code invalide');
                this.clearInputs();
                document.querySelector('.otp-input[data-index="0"]')?.focus();
                btn.disabled = false;
                btn.textContent = 'Vérifier et changer l\'email';
            }
        } catch (error) {
            this.showError(error.message || 'Erreur de connexion');
            btn.disabled = false;
            btn.textContent = 'Vérifier et changer l\'email';
        }
    },
    
    async resendEmailChangeCode() {
        if (this.countdown > 0 || !this.emailData) return;
        
        const btn = document.getElementById('otp-resend-btn');
        btn.disabled = true;
        btn.textContent = 'Envoi...';
        
        try {
            const response = await API.post('/auth/send-email-change-otp', { 
                new_email: this.emailData.newEmail 
            });
            
            if (response.success) {
                Toast.success('Code renvoyé');
                this.startCountdown(60);
                this.clearInputs();
            } else {
                if (response.cooldown) this.startCountdown(response.cooldown);
                Toast.error(response.error || 'Erreur lors du renvoi');
            }
        } catch (error) {
            Toast.error(error.message || 'Erreur de connexion');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Renvoyer';
        }
    },
    
    renderPasswordStep() {
        document.getElementById('otp-modal')?.remove();
        
        const modal = document.createElement('div');
        modal.id = 'otp-modal';
        modal.className = 'otp-modal';
        modal.innerHTML = `
            <div class="otp-modal-backdrop" id="otp-backdrop"></div>
            <div class="otp-modal-container">
                <div class="otp-modal-content">
                    <button class="otp-modal-close" id="otp-close-btn">
                        ${Icons.get('x', {size: 24})}
                    </button>
                    
                    <div class="otp-header">
                        <div class="otp-icon">
                            ${Icons.get('key', {size: 32})}
                        </div>
                        <h2 class="otp-title">Changer le mot de passe</h2>
                        <p class="otp-subtitle">Entrez votre mot de passe actuel et le nouveau</p>
                    </div>
                    
                    <div id="otp-step-password" class="otp-step">
                        <form id="password-change-form">
                            <div class="form-group">
                                <label class="form-label">Mot de passe actuel</label>
                                <input type="password" id="otp-current-password" class="form-input" required>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Nouveau mot de passe</label>
                                <input type="password" id="otp-new-password" class="form-input" required minlength="8">
                                <p class="form-hint">Au moins 8 caractères, 1 majuscule, 1 minuscule, 1 chiffre</p>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Confirmer le nouveau</label>
                                <input type="password" id="otp-confirm-password" class="form-input" required>
                            </div>
                            <div id="otp-password-error" class="otp-error" style="display:none"></div>
                            <button type="submit" class="btn btn-primary" style="width:100%" id="otp-password-next">
                                Continuer
                            </button>
                        </form>
                    </div>
                    
                    <div id="otp-step-channels" class="otp-step" style="display:none">
                        <div class="otp-channels-loading">
                            <div class="otp-spinner"></div>
                            <p>Chargement des options...</p>
                        </div>
                    </div>
                    
                    <div id="otp-step-code" class="otp-step" style="display:none">
                        <div class="otp-sent-info">
                            <p>Code envoyé à <strong id="otp-destination"></strong></p>
                        </div>
                        
                        <div class="otp-input-container">
                            <input type="text" class="otp-input" maxlength="1" data-index="0" inputmode="numeric">
                            <input type="text" class="otp-input" maxlength="1" data-index="1" inputmode="numeric">
                            <input type="text" class="otp-input" maxlength="1" data-index="2" inputmode="numeric">
                            <input type="text" class="otp-input" maxlength="1" data-index="3" inputmode="numeric">
                            <input type="text" class="otp-input" maxlength="1" data-index="4" inputmode="numeric">
                            <input type="text" class="otp-input" maxlength="1" data-index="5" inputmode="numeric">
                        </div>
                        
                        <div id="otp-error" class="otp-error" style="display:none"></div>
                        
                        <button id="otp-verify-btn" class="btn btn-primary" style="width:100%">
                            Vérifier
                        </button>
                        
                        <div class="otp-resend">
                            <span id="otp-resend-text">Vous n'avez pas reçu le code ?</span>
                            <button id="otp-resend-btn" class="otp-btn-link">
                                Renvoyer
                            </button>
                            <span id="otp-countdown" class="otp-countdown" style="display:none"></span>
                        </div>
                        
                        <button class="otp-btn-link otp-change-method" id="otp-change-method">
                            ← Changer de méthode
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Attacher les événements
        document.getElementById('otp-close-btn').addEventListener('click', () => this.handleClose());
        document.getElementById('password-change-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.validatePasswordAndContinue();
        });
        
        // Focus sur le premier champ
        document.getElementById('otp-current-password')?.focus();
        
        requestAnimationFrame(() => modal.classList.add('show'));
    },
    
    async validatePasswordAndContinue() {
        const current = document.getElementById('otp-current-password').value;
        const newPass = document.getElementById('otp-new-password').value;
        const confirm = document.getElementById('otp-confirm-password').value;
        const errorEl = document.getElementById('otp-password-error');
        const btn = document.getElementById('otp-password-next');
        
        // Validation
        if (newPass.length < 8) {
            errorEl.textContent = 'Le mot de passe doit contenir au moins 8 caractères';
            errorEl.style.display = 'block';
            return;
        }
        if (!/[A-Z]/.test(newPass)) {
            errorEl.textContent = 'Le mot de passe doit contenir au moins une majuscule';
            errorEl.style.display = 'block';
            return;
        }
        if (!/[a-z]/.test(newPass)) {
            errorEl.textContent = 'Le mot de passe doit contenir au moins une minuscule';
            errorEl.style.display = 'block';
            return;
        }
        if (!/\d/.test(newPass)) {
            errorEl.textContent = 'Le mot de passe doit contenir au moins un chiffre';
            errorEl.style.display = 'block';
            return;
        }
        if (newPass !== confirm) {
            errorEl.textContent = 'Les mots de passe ne correspondent pas';
            errorEl.style.display = 'block';
            return;
        }
        
        errorEl.style.display = 'none';
        btn.disabled = true;
        btn.innerHTML = Loader.inline('sm') + ' Vérification...';
        
        // Vérifier le mot de passe actuel
        try {
            await API.post('/auth/verify-password', { password: current });
        } catch (error) {
            errorEl.textContent = 'Mot de passe actuel incorrect';
            errorEl.style.display = 'block';
            btn.disabled = false;
            btn.textContent = 'Continuer';
            return;
        }
        
        // Stocker les mots de passe pour plus tard
        this.passwordData = { current, newPass };
        
        btn.disabled = false;
        btn.textContent = 'Continuer';
        
        // Passer à l'étape OTP
        this.showChannelsStep();
    },
    
    async showChannelsStep() {
        document.getElementById('otp-step-password').style.display = 'none';
        document.getElementById('otp-step-channels').style.display = 'block';
        
        // Mettre à jour le header
        document.querySelector('.otp-title').textContent = 'Vérification de sécurité';
        document.querySelector('.otp-subtitle').textContent = 'Choisissez comment recevoir votre code';
        document.querySelector('.otp-icon').innerHTML = Icons.get('lock', {size: 32});
        
        await this.loadChannels();
    },
    
    close() {
        // Ne pas fermer si un code a été envoyé (sauf via le bouton X)
        this.handleClose();
    },
    
    handleClose() {
        this.isOpen = false;
        this.clearCountdown();
        const modal = document.getElementById('otp-modal');
        if (modal) {
            modal.classList.remove('show');
            setTimeout(() => modal.remove(), 300);
        }
        if (this.onCancel) this.onCancel();
    },
    
    handleBackdropClick() {
        // Ne fermer que si on n'a pas encore envoyé de code
        if (!this.selectedChannel) {
            this.handleClose();
        }
        // Sinon on ne fait rien - l'utilisateur doit utiliser le bouton X
    },
    
    render() {
        document.getElementById('otp-modal')?.remove();
        
        const purposeLabels = {
            login: 'Connexion sécurisée',
            register: 'Vérification du compte',
            password_reset: 'Réinitialisation du mot de passe',
            password_change: 'Changement de mot de passe'
        };
        
        const title = this.config.title || purposeLabels[this.config.purpose] || 'Vérification';
        
        const modal = document.createElement('div');
        modal.id = 'otp-modal';
        modal.className = 'otp-modal';
        modal.innerHTML = `
            <div class="otp-modal-backdrop" id="otp-backdrop"></div>
            <div class="otp-modal-container">
                <div class="otp-modal-content">
                    <button class="otp-modal-close" id="otp-close-btn">
                        ${Icons.get('x', {size: 24})}
                    </button>
                    
                    <div class="otp-header">
                        <div class="otp-icon">
                            ${Icons.get('lock', {size: 32})}
                        </div>
                        <h2 class="otp-title">${title}</h2>
                        <p class="otp-subtitle">Choisissez comment recevoir votre code de vérification</p>
                    </div>
                    
                    <div id="otp-step-channels" class="otp-step">
                        <div class="otp-channels-loading">
                            <div class="otp-spinner"></div>
                            <p>Chargement des options...</p>
                        </div>
                    </div>
                    
                    <div id="otp-step-code" class="otp-step" style="display:none">
                        <div class="otp-sent-info">
                            <p>Code envoyé à <strong id="otp-destination"></strong></p>
                        </div>
                        
                        <div class="otp-input-container">
                            <input type="text" class="otp-input" maxlength="1" data-index="0" inputmode="numeric">
                            <input type="text" class="otp-input" maxlength="1" data-index="1" inputmode="numeric">
                            <input type="text" class="otp-input" maxlength="1" data-index="2" inputmode="numeric">
                            <input type="text" class="otp-input" maxlength="1" data-index="3" inputmode="numeric">
                            <input type="text" class="otp-input" maxlength="1" data-index="4" inputmode="numeric">
                            <input type="text" class="otp-input" maxlength="1" data-index="5" inputmode="numeric">
                        </div>
                        
                        <div id="otp-error" class="otp-error" style="display:none"></div>
                        
                        <button id="otp-verify-btn" class="btn btn-primary" style="width:100%">
                            Vérifier
                        </button>
                        
                        <div class="otp-resend">
                            <span id="otp-resend-text">Vous n'avez pas reçu le code ?</span>
                            <button id="otp-resend-btn" class="otp-btn-link">
                                Renvoyer
                            </button>
                            <span id="otp-countdown" class="otp-countdown" style="display:none"></span>
                        </div>
                        
                        <button class="otp-btn-link otp-change-method" id="otp-change-method">
                            ← Changer de méthode
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Attacher les événements
        document.getElementById('otp-backdrop').addEventListener('click', () => this.handleBackdropClick());
        document.getElementById('otp-close-btn').addEventListener('click', () => this.handleClose());
        document.getElementById('otp-verify-btn').addEventListener('click', () => this.verifyCode());
        document.getElementById('otp-resend-btn').addEventListener('click', () => this.resendCode());
        document.getElementById('otp-change-method').addEventListener('click', () => this.showChannels());
        
        requestAnimationFrame(() => modal.classList.add('show'));
    },
    
    async loadChannels() {
        try {
            const response = await API.post('/auth/otp/channels', {
                email: this.config.email,
                phone: this.config.phone,
                purpose: this.config.purpose
            });
            
            if (response.channels && response.channels.length > 0) {
                this.channels = response.channels;
                this.renderChannels();
            } else {
                this.renderNoChannels();
            }
        } catch (error) {
            console.error('Error loading OTP channels:', error);
            this.renderError('Impossible de charger les options de vérification');
        }
    },
    
    renderChannels() {
        const container = document.getElementById('otp-step-channels');
        
        container.innerHTML = `
            <div class="otp-channels">
                ${this.channels.map(ch => `
                    <button class="otp-channel ${!ch.available ? 'disabled' : ''}" 
                            data-channel="${ch.id}"
                            ${!ch.available ? 'disabled' : ''}>
                        <div class="otp-channel-icon ${ch.id}">
                            ${Icons.get(ch.icon, {size: 24})}
                        </div>
                        <div class="otp-channel-info">
                            <span class="otp-channel-name">${ch.name}</span>
                            <span class="otp-channel-dest">${ch.destination}</span>
                        </div>
                        ${!ch.available ? '<span class="otp-channel-badge">Non configuré</span>' : ''}
                    </button>
                `).join('')}
            </div>
        `;
        
        // Attacher les événements
        container.querySelectorAll('.otp-channel:not(.disabled)').forEach(btn => {
            btn.addEventListener('click', (e) => this.selectChannel(btn.dataset.channel, e));
        });
    },
    
    renderNoChannels() {
        const container = document.getElementById('otp-step-channels');
        container.innerHTML = `
            <div class="otp-no-channels">
                ${Icons.get('alert-circle', {size: 48})}
                <p>Aucune méthode de vérification disponible</p>
                <p class="otp-hint">Configurez les notifications dans les paramètres</p>
            </div>
        `;
    },
    
    renderError(message) {
        const container = document.getElementById('otp-step-channels');
        container.innerHTML = `
            <div class="otp-error-state">
                ${Icons.get('x-circle', {size: 48})}
                <p>${message}</p>
                <button class="btn btn-secondary" onclick="OTPModal.loadChannels()">
                    Réessayer
                </button>
            </div>
        `;
    },
    
    async selectChannel(channelId, evt) {
        this.selectedChannel = this.channels.find(ch => ch.id === channelId);
        if (!this.selectedChannel) return;
        
        const btn = evt?.target?.closest('.otp-channel') || document.querySelector(`.otp-channel[data-channel="${channelId}"]`);
        if (btn) btn.classList.add('loading');
        
        try {
            // Pour password_change, utiliser l'endpoint authentifié
            const endpoint = this.config.purpose === 'password_change' 
                ? '/auth/otp/send-authenticated' 
                : '/auth/otp/send';
            
            const response = await API.post(endpoint, {
                email: this.config.email,
                phone: this.config.phone,
                channel: channelId,
                purpose: this.config.purpose,
                name: this.config.name
            });
            
            if (response.success) {
                this.showCodeStep(response.destination_masked, response.expires_in);
            } else {
                if (response.cooldown) {
                    Toast.warning(`Attendez ${response.cooldown} secondes avant de renvoyer`);
                    this.showCodeStep(this.selectedChannel.destination, 600);
                    this.startCountdown(response.cooldown);
                } else {
                    Toast.error(response.error || 'Erreur lors de l\'envoi');
                }
            }
        } catch (error) {
            Toast.error(error.message || 'Erreur de connexion');
        } finally {
            if (btn) btn.classList.remove('loading');
        }
    },
    
    showCodeStep(destination, expiresIn) {
        document.getElementById('otp-step-channels').style.display = 'none';
        document.getElementById('otp-step-code').style.display = 'block';
        document.getElementById('otp-destination').textContent = destination;
        
        const firstInput = document.querySelector('.otp-input[data-index="0"]');
        if (firstInput) firstInput.focus();
        
        this.attachInputEvents();
        
        // Attacher les événements aux boutons (nécessaire quand on vient de renderPasswordStep)
        const verifyBtn = document.getElementById('otp-verify-btn');
        const resendBtn = document.getElementById('otp-resend-btn');
        const changeMethodBtn = document.getElementById('otp-change-method');
        
        verifyBtn.onclick = () => this.verifyCode();
        resendBtn.onclick = () => this.resendCode();
        changeMethodBtn.onclick = () => this.showChannels();
        
        this.startCountdown(60);
    },
    
    showChannels() {
        document.getElementById('otp-step-code').style.display = 'none';
        document.getElementById('otp-step-channels').style.display = 'block';
        this.clearInputs();
        this.clearCountdown();
    },
    
    attachInputEvents() {
        const inputs = document.querySelectorAll('.otp-input');
        
        inputs.forEach((input, index) => {
            input.addEventListener('input', (e) => {
                e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 1);
                if (e.target.value && index < inputs.length - 1) {
                    inputs[index + 1].focus();
                }
                this.checkComplete();
            });
            
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace' && !e.target.value && index > 0) {
                    inputs[index - 1].focus();
                }
            });
            
            input.addEventListener('paste', (e) => {
                e.preventDefault();
                const pastedData = e.clipboardData.getData('text').replace(/[^0-9]/g, '').slice(0, 6);
                pastedData.split('').forEach((char, i) => {
                    if (inputs[i]) inputs[i].value = char;
                });
                const lastIndex = Math.min(pastedData.length, inputs.length) - 1;
                if (lastIndex >= 0) inputs[Math.min(lastIndex + 1, inputs.length - 1)].focus();
                this.checkComplete();
            });
        });
    },
    
    checkComplete() {
        const code = this.getCode();
        if (code.length === 6) {
            // Appeler la bonne méthode selon le purpose
            if (this.config.purpose === 'email_change') {
                setTimeout(() => this.verifyEmailChangeCode(), 300);
            } else {
                setTimeout(() => this.verifyCode(), 300);
            }
        }
    },
    
    getCode() {
        return Array.from(document.querySelectorAll('.otp-input')).map(i => i.value).join('');
    },
    
    clearInputs() {
        document.querySelectorAll('.otp-input').forEach(input => input.value = '');
        document.getElementById('otp-error').style.display = 'none';
    },
    
    async verifyCode() {
        const code = this.getCode();
        if (code.length !== 6) {
            this.showError('Veuillez entrer le code complet');
            return;
        }
        
        const btn = document.getElementById('otp-verify-btn');
        btn.disabled = true;
        btn.innerHTML = Loader.inline('sm') + ' Vérification...';
        
        try {
            // Pour password_change, utiliser l'endpoint authentifié
            const endpoint = this.config.purpose === 'password_change' 
                ? '/auth/otp/verify-authenticated' 
                : '/auth/otp/verify';
            
            const response = await API.post(endpoint, {
                email: this.config.email,
                phone: this.config.phone,
                code: code,
                purpose: this.config.purpose,
                temp_user_id: this.config.tempUserId
            });
            
            if (response.success) {
                // Si c'est un changement de mot de passe, finaliser
                if (this.config.purpose === 'password_change' && this.passwordData) {
                    btn.innerHTML = Loader.inline('sm') + ' Modification...';
                    
                    try {
                        await API.post('/auth/change-password-verified', {
                            current_password: this.passwordData.current,
                            new_password: this.passwordData.newPass,
                            verification_token: response.verification_token
                        });
                        
                        // Succès !
                        this.isOpen = false;
                        this.clearCountdown();
                        const modal = document.getElementById('otp-modal');
                        modal.classList.remove('show');
                        
                        setTimeout(() => {
                            modal.remove();
                            if (this.onSuccess) this.onSuccess(response);
                        }, 300);
                    } catch (error) {
                        this.showError(error.message || 'Erreur lors du changement');
                        btn.disabled = false;
                        btn.textContent = 'Vérifier';
                    }
                } else {
                    // Cas normal (login, etc.)
                    this.isOpen = false;
                    this.clearCountdown();
                    const modal = document.getElementById('otp-modal');
                    modal.classList.remove('show');
                    
                    setTimeout(() => {
                        modal.remove();
                        if (this.onSuccess) this.onSuccess(response);
                    }, 300);
                }
            } else {
                this.showError(response.error || 'Code invalide');
                this.clearInputs();
                document.querySelector('.otp-input[data-index="0"]')?.focus();
                btn.disabled = false;
                btn.textContent = 'Vérifier';
            }
        } catch (error) {
            this.showError(error.message || 'Erreur de connexion');
            btn.disabled = false;
            btn.textContent = 'Vérifier';
        }
    },
    
    showError(message) {
        const errorEl = document.getElementById('otp-error');
        errorEl.textContent = message;
        errorEl.style.display = 'block';
        
        const container = document.querySelector('.otp-input-container');
        container.classList.add('shake');
        setTimeout(() => container.classList.remove('shake'), 500);
    },
    
    async resendCode() {
        if (this.countdown > 0) return;
        
        const btn = document.getElementById('otp-resend-btn');
        btn.disabled = true;
        btn.textContent = 'Envoi...';
        
        try {
            // Pour password_change, utiliser l'endpoint authentifié
            const endpoint = this.config.purpose === 'password_change' 
                ? '/auth/otp/send-authenticated' 
                : '/auth/otp/send';
            
            const response = await API.post(endpoint, {
                email: this.config.email,
                phone: this.config.phone,
                channel: this.selectedChannel.id,
                purpose: this.config.purpose
            });
            
            if (response.success) {
                Toast.success('Code renvoyé');
                this.startCountdown(60);
                this.clearInputs();
            } else {
                if (response.cooldown) this.startCountdown(response.cooldown);
                Toast.error(response.error || 'Erreur lors du renvoi');
            }
        } catch (error) {
            Toast.error(error.message || 'Erreur de connexion');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Renvoyer';
        }
    },
    
    startCountdown(seconds) {
        this.clearCountdown();
        this.countdown = seconds;
        
        const resendBtn = document.getElementById('otp-resend-btn');
        const resendText = document.getElementById('otp-resend-text');
        const countdownEl = document.getElementById('otp-countdown');
        
        resendBtn.style.display = 'none';
        resendText.style.display = 'none';
        countdownEl.style.display = 'inline';
        
        const updateCountdown = () => {
            if (this.countdown > 0) {
                countdownEl.textContent = `Renvoyer dans ${this.countdown}s`;
                this.countdown--;
            } else {
                this.clearCountdown();
                resendBtn.style.display = 'inline';
                resendText.style.display = 'inline';
                countdownEl.style.display = 'none';
            }
        };
        
        updateCountdown();
        this.countdownInterval = setInterval(updateCountdown, 1000);
    },
    
    clearCountdown() {
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
        }
        this.countdown = 0;
    }
};

window.OTPModal = OTPModal;
