/**
 * Vue Profile - Profil admin avec OTP
 */

Views.profile = {
    render() {
        const main = document.getElementById('main-content');
        const user = Store.getUser() || { first_name: 'Admin', last_name: 'User', email: 'admin@example.com' };
        
        main.innerHTML = `
            <div class="profile-page">
                <div class="page-header">
                    <h1 class="page-title">Mon profil</h1>
                </div>
                
                <div class="card">
                    <div class="card-header"><h3 class="card-title">Informations personnelles</h3></div>
                    <div class="card-body">
                        <form id="profile-form">
                            <div class="form-row">
                                <div class="form-group">
                                    <label class="form-label">Prenom</label>
                                    <input type="text" id="first_name" class="form-input" value="${user.first_name || ''}">
                                </div>
                                <div class="form-group">
                                    <label class="form-label">Nom</label>
                                    <input type="text" id="last_name" class="form-input" value="${user.last_name || ''}">
                                </div>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Telephone</label>
                                <input type="tel" id="phone" class="form-input" value="${user.phone || ''}">
                            </div>
                            <div class="form-group">
                                <label class="form-label">Email</label>
                                <div class="input-with-action">
                                    <input type="email" class="form-input" value="${user.email || ''}" disabled id="current-email">
                                    <button type="button" class="btn btn-sm btn-outline" id="btn-change-email">
                                        ${Icons.get('edit-2', {size:14})} Modifier
                                    </button>
                                </div>
                            </div>
                            <button type="submit" class="btn btn-primary" id="btn-save-profile">Enregistrer</button>
                        </form>
                    </div>
                </div>
                
                <div class="card mt-md">
                    <div class="card-header"><h3 class="card-title">${Icons.get('lock', {size:18})} Securite</h3></div>
                    <div class="card-body">
                        <p class="text-muted mb-md">Pour des raisons de securite, le changement de mot de passe necessite une verification par code OTP.</p>
                        <button class="btn btn-outline" id="btn-change-password">
                            ${Icons.get('key', {size:16})} Changer le mot de passe
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        this.attachEvents();
    },
    
    attachEvents() {
        // Save profile
        document.getElementById('profile-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.saveProfile();
        });
        
        // Change password
        document.getElementById('btn-change-password')?.addEventListener('click', () => {
            this.showChangePasswordModal();
        });
        
        // Change email
        document.getElementById('btn-change-email')?.addEventListener('click', () => {
            this.showChangeEmailModal();
        });
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
            Toast.error(error.message || 'Erreur');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Enregistrer';
        }
    },
    
    showChangePasswordModal() {
        const user = Store.getUser();
        
        // Utiliser directement OTPModal avec un step de saisie de mot de passe
        OTPModal.openPasswordChange({
            email: user.email,
            phone: user.phone,
            onSuccess: () => {
                Toast.success('Mot de passe modifié avec succès');
            },
            onCancel: () => {
                // Rien
            }
        });
    },
    
    showChangeEmailModal() {
        const user = Store.getUser();
        
        OTPModal.openEmailChange({
            currentEmail: user.email,
            onSuccess: (response) => {
                // Mettre à jour l'affichage
                document.getElementById('current-email').value = response.user?.email || '';
                Toast.success('Email modifié avec succès');
            },
            onCancel: () => {
                // Rien
            }
        });
    }
};
