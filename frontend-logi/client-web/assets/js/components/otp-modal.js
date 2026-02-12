/**
 * OTP Modal Component
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
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                    
                    <div class="otp-header">
                        <div class="otp-icon">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                            </svg>
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
                            <button type="submit" class="otp-btn otp-btn-primary" id="otp-login-next">
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
                            <input type="text" class="otp-input" maxlength="1" data-index="0" inputmode="numeric" pattern="[0-9]">
                            <input type="text" class="otp-input" maxlength="1" data-index="1" inputmode="numeric" pattern="[0-9]">
                            <input type="text" class="otp-input" maxlength="1" data-index="2" inputmode="numeric" pattern="[0-9]">
                            <input type="text" class="otp-input" maxlength="1" data-index="3" inputmode="numeric" pattern="[0-9]">
                            <input type="text" class="otp-input" maxlength="1" data-index="4" inputmode="numeric" pattern="[0-9]">
                            <input type="text" class="otp-input" maxlength="1" data-index="5" inputmode="numeric" pattern="[0-9]">
                        </div>
                        
                        <div id="otp-error" class="otp-error" style="display:none"></div>
                        
                        <button id="otp-verify-btn" class="otp-btn otp-btn-primary">
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
        btn.innerHTML = '<span class="otp-spinner-small"></span> Vérification...';
        
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
            const response = await API.request('POST', '/auth/otp/channels', {
                email: this.config.email,
                phone: this.config.phone,
                purpose: this.config.purpose
            }, { auth: false });
            
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
    
    /**
     * Ouvre le modal OTP (méthode générique)
     * @param {Object} options Configuration
     * @param {string} options.email Email de l'utilisateur
     * @param {string} options.phone Téléphone (optionnel)
     * @param {string} options.purpose But: login, register, password_reset, password_change
     * @param {string} options.title Titre du modal
     * @param {Function} options.onSuccess Callback en cas de succès
     * @param {Function} options.onCancel Callback en cas d'annulation
     */
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
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                    
                    <div class="otp-header">
                        <div class="otp-icon">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                                <polyline points="22,6 12,13 2,6"></polyline>
                            </svg>
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
                            <button type="submit" class="otp-btn otp-btn-primary" id="otp-email-next">
                                Envoyer le code de vérification
                            </button>
                        </form>
                    </div>
                    
                    <div id="otp-step-code" class="otp-step" style="display:none">
                        <div class="otp-sent-info">
                            <p>Code envoyé à <strong id="otp-destination"></strong></p>
                        </div>
                        
                        <div class="otp-input-container">
                            <input type="text" class="otp-input" maxlength="1" data-index="0" inputmode="numeric" pattern="[0-9]">
                            <input type="text" class="otp-input" maxlength="1" data-index="1" inputmode="numeric" pattern="[0-9]">
                            <input type="text" class="otp-input" maxlength="1" data-index="2" inputmode="numeric" pattern="[0-9]">
                            <input type="text" class="otp-input" maxlength="1" data-index="3" inputmode="numeric" pattern="[0-9]">
                            <input type="text" class="otp-input" maxlength="1" data-index="4" inputmode="numeric" pattern="[0-9]">
                            <input type="text" class="otp-input" maxlength="1" data-index="5" inputmode="numeric" pattern="[0-9]">
                        </div>
                        
                        <div id="otp-error" class="otp-error" style="display:none"></div>
                        
                        <button id="otp-verify-btn" class="otp-btn otp-btn-primary">
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
        btn.innerHTML = '<span class="otp-spinner-small"></span> Vérification...';
        
        // Vérifier le mot de passe actuel
        try {
            await API.request('POST', '/auth/verify-password', { password }, { auth: true });
        } catch (error) {
            errorEl.textContent = 'Mot de passe incorrect';
            errorEl.style.display = 'block';
            btn.disabled = false;
            btn.textContent = 'Envoyer le code de vérification';
            return;
        }
        
        // Envoyer l'OTP au nouvel email
        try {
            const response = await API.request('POST', '/auth/send-email-change-otp', { new_email: newEmail }, { auth: true });
            
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
                document.querySelector('.otp-icon').innerHTML = `
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                `;
                
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
        btn.innerHTML = '<span class="otp-spinner-small"></span> Vérification...';
        
        try {
            const response = await API.request('POST', '/auth/change-email-verified', {
                current_password: this.emailData.password,
                new_email: this.emailData.newEmail,
                code: code
            }, { auth: true });
            
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
            const response = await API.request('POST', '/auth/send-email-change-otp', { 
                new_email: this.emailData.newEmail 
            }, { auth: true });
            
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
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                    
                    <div class="otp-header">
                        <div class="otp-icon">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path>
                            </svg>
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
                            <button type="submit" class="otp-btn otp-btn-primary" id="otp-password-next">
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
                            <input type="text" class="otp-input" maxlength="1" data-index="0" inputmode="numeric" pattern="[0-9]">
                            <input type="text" class="otp-input" maxlength="1" data-index="1" inputmode="numeric" pattern="[0-9]">
                            <input type="text" class="otp-input" maxlength="1" data-index="2" inputmode="numeric" pattern="[0-9]">
                            <input type="text" class="otp-input" maxlength="1" data-index="3" inputmode="numeric" pattern="[0-9]">
                            <input type="text" class="otp-input" maxlength="1" data-index="4" inputmode="numeric" pattern="[0-9]">
                            <input type="text" class="otp-input" maxlength="1" data-index="5" inputmode="numeric" pattern="[0-9]">
                        </div>
                        
                        <div id="otp-error" class="otp-error" style="display:none"></div>
                        
                        <button id="otp-verify-btn" class="otp-btn otp-btn-primary">
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
        btn.innerHTML = '<span class="otp-spinner-small"></span> Vérification...';
        
        // Vérifier le mot de passe actuel
        try {
            await API.request('POST', '/auth/verify-password', { password: current }, { auth: true });
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
        document.querySelector('.otp-icon').innerHTML = `
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
        `;
        
        await this.loadChannels();
    },
    
    close() {
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
        // Ne jamais fermer au clic sur le backdrop une fois le modal ouvert
        // L'utilisateur doit utiliser le bouton X pour fermer
        // Cela évite les fermetures accidentelles pendant le processus OTP
    },
    
    render() {
        // Supprimer l'ancien modal s'il existe
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
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                    
                    <div class="otp-header">
                        <div class="otp-icon">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                            </svg>
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
                            <input type="text" class="otp-input" maxlength="1" data-index="0" inputmode="numeric" pattern="[0-9]">
                            <input type="text" class="otp-input" maxlength="1" data-index="1" inputmode="numeric" pattern="[0-9]">
                            <input type="text" class="otp-input" maxlength="1" data-index="2" inputmode="numeric" pattern="[0-9]">
                            <input type="text" class="otp-input" maxlength="1" data-index="3" inputmode="numeric" pattern="[0-9]">
                            <input type="text" class="otp-input" maxlength="1" data-index="4" inputmode="numeric" pattern="[0-9]">
                            <input type="text" class="otp-input" maxlength="1" data-index="5" inputmode="numeric" pattern="[0-9]">
                        </div>
                        
                        <div id="otp-error" class="otp-error" style="display:none"></div>
                        
                        <button id="otp-verify-btn" class="otp-btn otp-btn-primary">
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
        
        // Animation d'entrée
        requestAnimationFrame(() => {
            modal.classList.add('show');
        });
    },
    
    async loadChannels() {
        try {
            const response = await API.request('POST', '/auth/otp/channels', {
                email: this.config.email,
                phone: this.config.phone,
                purpose: this.config.purpose
            }, { auth: false });
            
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
        
        const channelIcons = {
            email: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                <polyline points="22,6 12,13 2,6"></polyline>
            </svg>`,
            sms: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
                <line x1="12" y1="18" x2="12.01" y2="18"></line>
            </svg>`,
            whatsapp: `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>`
        };
        
        container.innerHTML = `
            <div class="otp-channels">
                ${this.channels.map(ch => `
                    <button class="otp-channel ${!ch.available ? 'disabled' : ''}" 
                            data-channel="${ch.id}"
                            ${!ch.available ? 'disabled' : ''}>
                        <div class="otp-channel-icon ${ch.id}">
                            ${channelIcons[ch.id] || ''}
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
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <p>Aucune méthode de vérification disponible</p>
                <p class="otp-hint">Contactez l'administrateur pour configurer les notifications</p>
            </div>
        `;
    },
    
    renderError(message) {
        const container = document.getElementById('otp-step-channels');
        container.innerHTML = `
            <div class="otp-error-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="15" y1="9" x2="9" y2="15"></line>
                    <line x1="9" y1="9" x2="15" y2="15"></line>
                </svg>
                <p>${message}</p>
                <button class="otp-btn otp-btn-secondary" onclick="OTPModal.loadChannels()">
                    Réessayer
                </button>
            </div>
        `;
    },
    
    async selectChannel(channelId, evt) {
        this.selectedChannel = this.channels.find(ch => ch.id === channelId);
        if (!this.selectedChannel) return;
        
        // Afficher le loading
        const btn = evt?.target?.closest('.otp-channel') || document.querySelector(`.otp-channel[onclick*="${channelId}"]`);
        if (btn) btn.classList.add('loading');
        
        try {
            // Pour password_change, utiliser l'endpoint authentifié
            const endpoint = this.config.purpose === 'password_change' 
                ? '/auth/otp/send-authenticated' 
                : '/auth/otp/send';
            const needsAuth = this.config.purpose === 'password_change';
            
            const response = await API.request('POST', endpoint, {
                email: this.config.email,
                phone: this.config.phone,
                channel: channelId,
                purpose: this.config.purpose,
                name: this.config.name
            }, { auth: needsAuth });
            
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
            console.error('Error sending OTP:', error);
            Toast.error('Erreur de connexion');
        } finally {
            if (btn) btn.classList.remove('loading');
        }
    },
    
    showCodeStep(destination, expiresIn) {
        document.getElementById('otp-step-channels').style.display = 'none';
        document.getElementById('otp-step-code').style.display = 'block';
        document.getElementById('otp-destination').textContent = destination;
        
        // Focus sur le premier input
        const firstInput = document.querySelector('.otp-input[data-index="0"]');
        if (firstInput) firstInput.focus();
        
        // Attacher les événements aux inputs
        this.attachInputEvents();
        
        // Attacher les événements aux boutons (nécessaire quand on vient de renderPasswordStep)
        const verifyBtn = document.getElementById('otp-verify-btn');
        const resendBtn = document.getElementById('otp-resend-btn');
        const changeMethodBtn = document.getElementById('otp-change-method');
        
        // Supprimer les anciens listeners et en ajouter de nouveaux
        verifyBtn.onclick = () => this.verifyCode();
        resendBtn.onclick = () => this.resendCode();
        changeMethodBtn.onclick = () => this.showChannels();
        
        // Démarrer le countdown pour le resend
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
            // Input event
            input.addEventListener('input', (e) => {
                const value = e.target.value;
                
                // Ne garder que les chiffres
                e.target.value = value.replace(/[^0-9]/g, '').slice(0, 1);
                
                // Passer au suivant si rempli
                if (e.target.value && index < inputs.length - 1) {
                    inputs[index + 1].focus();
                }
                
                // Vérifier si tous les champs sont remplis
                this.checkComplete();
            });
            
            // Keydown pour backspace
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace' && !e.target.value && index > 0) {
                    inputs[index - 1].focus();
                }
            });
            
            // Paste event
            input.addEventListener('paste', (e) => {
                e.preventDefault();
                const pastedData = e.clipboardData.getData('text').replace(/[^0-9]/g, '').slice(0, 6);
                
                pastedData.split('').forEach((char, i) => {
                    if (inputs[i]) {
                        inputs[i].value = char;
                    }
                });
                
                // Focus sur le dernier rempli ou le suivant
                const lastIndex = Math.min(pastedData.length, inputs.length) - 1;
                if (lastIndex >= 0) {
                    inputs[Math.min(lastIndex + 1, inputs.length - 1)].focus();
                }
                
                this.checkComplete();
            });
        });
    },
    
    checkComplete() {
        const inputs = document.querySelectorAll('.otp-input');
        const code = Array.from(inputs).map(i => i.value).join('');
        
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
        const inputs = document.querySelectorAll('.otp-input');
        return Array.from(inputs).map(i => i.value).join('');
    },
    
    clearInputs() {
        document.querySelectorAll('.otp-input').forEach(input => {
            input.value = '';
        });
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
        btn.innerHTML = '<span class="otp-spinner-small"></span> Vérification...';
        
        try {
            // Pour password_change, utiliser l'endpoint authentifié
            const endpoint = this.config.purpose === 'password_change' 
                ? '/auth/otp/verify-authenticated' 
                : '/auth/otp/verify';
            const needsAuth = this.config.purpose === 'password_change';
            
            const response = await API.request('POST', endpoint, {
                email: this.config.email,
                phone: this.config.phone,
                code: code,
                purpose: this.config.purpose,
                temp_user_id: this.config.tempUserId
            }, { auth: needsAuth });
            
            if (response.success) {
                // Si c'est un changement de mot de passe, finaliser
                if (this.config.purpose === 'password_change' && this.passwordData) {
                    btn.innerHTML = '<span class="otp-spinner-small"></span> Modification...';
                    
                    try {
                        await API.request('POST', '/auth/change-password-verified', {
                            current_password: this.passwordData.current,
                            new_password: this.passwordData.newPass,
                            verification_token: response.verification_token
                        }, { auth: true });
                        
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
                        if (this.onSuccess) {
                            this.onSuccess(response);
                        }
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
            console.error('Error verifying OTP:', error);
            this.showError(error.message || 'Erreur de connexion');
            btn.disabled = false;
            btn.textContent = 'Vérifier';
        }
    },
    
    showError(message) {
        const errorEl = document.getElementById('otp-error');
        errorEl.textContent = message;
        errorEl.style.display = 'block';
        
        // Shake animation
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
            const needsAuth = this.config.purpose === 'password_change';
            
            const response = await API.request('POST', endpoint, {
                email: this.config.email,
                phone: this.config.phone,
                channel: this.selectedChannel.id,
                purpose: this.config.purpose
            }, { auth: needsAuth });
            
            if (response.success) {
                Toast.success('Code renvoyé');
                this.startCountdown(60);
                this.clearInputs();
            } else {
                if (response.cooldown) {
                    this.startCountdown(response.cooldown);
                }
                Toast.error(response.error || 'Erreur lors du renvoi');
            }
        } catch (error) {
            Toast.error('Erreur de connexion');
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

// Exposer globalement
window.OTPModal = OTPModal;
