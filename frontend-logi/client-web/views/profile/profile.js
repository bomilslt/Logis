/**
 * Vue Profile - Profil utilisateur
 */

Views.profile = {
    async render() {
        const main = document.getElementById('main-content');
        const user = Store.getUser();
        const currentTheme = localStorage.getItem('theme') || 'light';
        
        main.innerHTML = `
            <div class="profile-view">
                <div class="profile-header">
                    <div class="avatar avatar-lg">${user?.first_name?.[0] || ''}${user?.last_name?.[0] || ''}</div>
                    <div class="profile-info">
                        <h1 class="profile-name">${user?.full_name || 'Utilisateur'}</h1>
                        <p class="profile-email">${user?.email || ''}</p>
                    </div>
                </div>
                
                <div class="profile-sections">
                    <div class="profile-section">
                        <h3 class="section-title">Informations personnelles</h3>
                        <form id="profile-form" class="profile-form">
                            <div class="form-row">
                                <div class="form-group">
                                    <label class="form-label" for="first_name">Prenom</label>
                                    <input type="text" id="first_name" class="form-input" 
                                           value="${user?.first_name || ''}" required>
                                </div>
                                <div class="form-group">
                                    <label class="form-label" for="last_name">Nom</label>
                                    <input type="text" id="last_name" class="form-input" 
                                           value="${user?.last_name || ''}" required>
                                </div>
                            </div>
                            <div class="form-group">
                                <label class="form-label" for="phone">Telephone</label>
                                <input type="tel" id="phone" class="form-input" 
                                       value="${user?.phone || ''}">
                            </div>
                            <div class="form-group">
                                <label class="form-label" for="email">Email</label>
                                <div class="input-with-action">
                                    <input type="email" id="current-email" class="form-input" 
                                           value="${user?.email || ''}" disabled>
                                    <button type="button" class="btn btn-sm btn-outline" id="btn-change-email">
                                        Modifier
                                    </button>
                                </div>
                            </div>
                            <button type="submit" class="btn btn-primary" id="btn-save-profile">
                                Enregistrer
                            </button>
                        </form>
                    </div>
                    
                    <div class="profile-section">
                        <h3 class="section-title">Apparence</h3>
                        <div class="settings-list">
                            <div class="setting-item">
                                <div class="setting-info">
                                    <span class="setting-label">Mode sombre</span>
                                    <span class="setting-desc">Activer le theme sombre</span>
                                </div>
                                <label class="toggle">
                                    <input type="checkbox" id="theme_toggle" ${currentTheme === 'dark' ? 'checked' : ''}>
                                    <span class="toggle-slider"></span>
                                </label>
                            </div>
                        </div>
                    </div>
                    
                    <div class="profile-section">
                        <h3 class="section-title">Notifications</h3>
                        <div class="settings-list">
                            <div class="setting-item">
                                <div class="setting-info">
                                    <span class="setting-label">Notifications email</span>
                                    <span class="setting-desc">Recevoir les mises a jour par email</span>
                                </div>
                                <label class="toggle">
                                    <input type="checkbox" id="notify_email" ${user?.notify_email ? 'checked' : ''}>
                                    <span class="toggle-slider"></span>
                                </label>
                            </div>
                            <div class="setting-item">
                                <div class="setting-info">
                                    <span class="setting-label">Notifications SMS</span>
                                    <span class="setting-desc">Recevoir les alertes par SMS</span>
                                </div>
                                <label class="toggle">
                                    <input type="checkbox" id="notify_sms" ${user?.notify_sms ? 'checked' : ''}>
                                    <span class="toggle-slider"></span>
                                </label>
                            </div>
                            <div class="setting-item">
                                <div class="setting-info">
                                    <span class="setting-label">Notifications push</span>
                                    <span class="setting-desc">Recevoir les notifications dans l'app</span>
                                </div>
                                <label class="toggle">
                                    <input type="checkbox" id="notify_push" ${user?.notify_push ? 'checked' : ''}>
                                    <span class="toggle-slider"></span>
                                </label>
                            </div>
                        </div>
                    </div>
                    
                    <div class="profile-section">
                        <h3 class="section-title">Securite</h3>
                        <button class="btn btn-outline btn-block" id="btn-change-password">
                            <svg class="icon" viewBox="0 0 24 24">
                                <use href="assets/icons/icons.svg#settings"></use>
                            </svg>
                            Changer le mot de passe
                        </button>
                    </div>
                    
                    <div class="profile-section">
                        <button class="btn btn-ghost btn-block text-error" id="btn-logout">
                            <svg class="icon" viewBox="0 0 24 24">
                                <use href="assets/icons/icons.svg#log-out"></use>
                            </svg>
                            Se deconnecter
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        this.attachEvents();
    },
    
    attachEvents() {
        // Theme toggle
        document.getElementById('theme_toggle')?.addEventListener('change', (e) => {
            this.toggleTheme(e.target.checked);
        });
        
        // Save profile
        document.getElementById('profile-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.saveProfile();
        });
        
        // Notification toggles
        ['notify_email', 'notify_sms', 'notify_push'].forEach(id => {
            document.getElementById(id)?.addEventListener('change', async (e) => {
                await this.updateNotificationSetting(id, e.target.checked);
            });
        });
        
        // Change password
        document.getElementById('btn-change-password')?.addEventListener('click', () => {
            this.showChangePasswordModal();
        });
        
        // Change email
        document.getElementById('btn-change-email')?.addEventListener('click', () => {
            this.showChangeEmailModal();
        });
        
        // Logout
        document.getElementById('btn-logout')?.addEventListener('click', async () => {
            const confirmed = await Modal.confirm({
                title: 'Deconnexion',
                message: 'Voulez-vous vraiment vous deconnecter ?',
                confirmText: 'Se deconnecter'
            });
            
            if (confirmed) {
                Store.logout();
                Router.navigate('/login');
                Toast.info('Vous avez ete deconnecte');
            }
        });
    },
    
    toggleTheme(isDark) {
        const theme = isDark ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        Toast.success(isDark ? 'Mode sombre active' : 'Mode clair active');
    },
    
    async saveProfile() {
        const btn = document.getElementById('btn-save-profile');
        btn.disabled = true;
        btn.innerHTML = Loader.inline('sm') + ' Enregistrement...';
        
        try {
            const data = await API.auth.updateProfile({
                first_name: document.getElementById('first_name').value,
                last_name: document.getElementById('last_name').value,
                phone: document.getElementById('phone').value
            });
            
            Store.setUser(data.user);
            Toast.success('Profil mis a jour');
        } catch (error) {
            Toast.error(error.message);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Enregistrer';
        }
    },
    
    async updateNotificationSetting(setting, value) {
        try {
            await API.client.updateNotificationSettings({ [setting]: value });
            const user = Store.getUser();
            user[setting] = value;
            Store.setUser(user);
        } catch (error) {
            Toast.error(error.message);
        }
    },
    
    showChangePasswordModal() {
        const user = Store.getUser();
        
        OTPModal.openPasswordChange({
            email: user.email,
            phone: user.phone,
            onSuccess: () => {
                Toast.success('Mot de passe modifié avec succès');
            },
            onCancel: () => {}
        });
    },
    
    showChangeEmailModal() {
        const user = Store.getUser();
        
        OTPModal.openEmailChange({
            currentEmail: user.email,
            onSuccess: (response) => {
                // Mettre à jour l'affichage
                document.getElementById('current-email').value = response.user?.email || '';
                document.querySelector('.profile-email').textContent = response.user?.email || '';
                Toast.success('Email modifié avec succès');
            },
            onCancel: () => {}
        });
    }
};
