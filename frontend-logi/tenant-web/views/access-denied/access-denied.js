/**
 * Vue Access Denied - Affichée quand l'utilisateur n'a pas les permissions
 */

Views.accessDenied = {
    accessInfo: null,
    
    render(accessInfo) {
        this.accessInfo = accessInfo;
        
        const main = document.getElementById('main-content');
        
        main.innerHTML = `
            <div class="access-denied-page">
                <div class="access-denied-container">
                    <div class="access-denied-icon">
                        ${Icons.get('lock', {size: 64, color: 'var(--color-error)'})}
                    </div>
                    
                    <h1 class="access-denied-title">${I18n.t('access_denied.title')}</h1>
                    
                    <div class="access-denied-message">
                        ${this.createAccessDeniedMessage(accessInfo)}
                    </div>
                    
                    <div class="access-denied-details">
                        <div class="detail-item">
                            <strong>${I18n.t('access_denied.your_role')}</strong> ${this.getRoleLabel(accessInfo.userRole)}
                        </div>
                        <div class="detail-item">
                            <strong>${I18n.t('access_denied.requested_page')}</strong> ${accessInfo.path}
                        </div>
                        <div class="detail-item">
                            <strong>${I18n.t('access_denied.reason')}</strong> ${this.getReasonLabel(accessInfo.reason)}
                        </div>
                        ${accessInfo.accessModules ? `<div class="detail-item">
                            <strong>${I18n.t('access_denied.active_modules')}</strong> ${accessInfo.accessModules.length > 0 ? accessInfo.accessModules.join(', ') : I18n.t('access_denied.none')}
                        </div>` : ''}
                    </div>
                    
                    <div class="access-denied-actions">
                        <button class="btn btn-primary" onclick="Views.accessDenied.goToSuggested()">
                            ${I18n.t('access_denied.go_to')} ${this.getSuggestedLabel(accessInfo.suggestedRoute)}
                        </button>
                        <button class="btn btn-secondary" onclick="Views.accessDenied.goBack()">
                            ${I18n.t('access_denied.back')}
                        </button>
                        <button class="btn btn-ghost" onclick="Views.accessDenied.goToDashboard()">
                            Dashboard
                        </button>
                    </div>
                    
                    <div class="access-denied-help">
                        <details>
                            <summary>${I18n.t('access_denied.need_help')}</summary>
                            <div class="help-content">
                                <p>${I18n.t('access_denied.help_text')}</p>
                                <div class="help-actions">
                                    <button class="btn btn-sm btn-outline" onclick="Views.accessDenied.contactAdmin()">
                                        ${I18n.t('access_denied.contact_admin')}
                                    </button>
                                    <button class="btn btn-sm btn-outline" onclick="Views.accessDenied.showDebugInfo()">
                                        ${I18n.t('access_denied.tech_info')}
                                    </button>
                                </div>
                            </div>
                        </details>
                    </div>
                </div>
            </div>
        `;
        
        // Mettre à jour le titre de la page
        document.title = I18n.t('access_denied.title') + ' - Express Cargo';
        
        // Mettre à jour la navigation
        Router.updateNav('');
        Router.updateTitle('/access-denied');
    },
    
    createAccessDeniedMessage(accessInfo) {
        const { userRole, path, suggestedRoute, accessModules } = accessInfo;
        
        const roleLabel = this.getRoleLabel(userRole);
        const suggestedLabel = this.getSuggestedLabel(suggestedRoute);
        
        let msg = `<p>${I18n.t('access_denied.page_unavailable').replace('{path}', path)}</p>`;
        
        if (userRole === 'staff' && accessModules && accessModules.length > 0) {
            const moduleLabels = accessModules.map(m => {
                const defs = window.ViewFilter?.getModuleDefinitions() || {};
                return defs[m]?.label || m;
            });
            msg += `<p>${I18n.t('access_denied.your_modules')} <strong>${moduleLabels.join(', ')}</strong></p>`;
        } else if (userRole === 'staff') {
            msg += `<p>${I18n.t('access_denied.no_modules')}</p>`;
        }
        
        msg += `<p>${I18n.t('access_denied.contact_for_access')}</p>`;
        
        return msg;
    },
    
    getRoleLabel(role) {
        const roleLabels = {
            admin: I18n.t('access_denied.role_admin'),
            staff: I18n.t('access_denied.role_staff')
        };
        
        return roleLabels[role] || role || I18n.t('access_denied.role_default');
    },
    
    getSuggestedLabel(route) {
        const labels = {
            dashboard: 'Dashboard',
            packages: I18n.t('access_denied.suggested_packages'),
            clients: I18n.t('access_denied.suggested_clients'),
            profile: I18n.t('access_denied.suggested_profile'),
            'pickups-payments': I18n.t('access_denied.suggested_pickups')
        };
        
        return labels[route] || route;
    },
    
    getReasonLabel(reason) {
        const reasons = {
            role_restricted: I18n.t('access_denied.reason_role'),
            module_restricted: I18n.t('access_denied.reason_module'),
            public: I18n.t('access_denied.reason_public'),
            authorized: I18n.t('access_denied.reason_authorized'),
            profile: I18n.t('access_denied.reason_profile')
        };
        
        return reasons[reason] || reason;
    },
    
    goToSuggested() {
        if (this.accessInfo && this.accessInfo.suggestedRoute) {
            Router.navigate(this.accessInfo.suggestedRoute);
        }
    },
    
    goBack() {
        window.history.back();
    },
    
    goToDashboard() {
        Router.navigate('/dashboard');
    },
    
    contactAdmin() {
        // Ouvre un email ou une modal de contact
        const user = Store.getUser();
        const subject = encodeURIComponent(I18n.t('access_denied.email_subject'));
        const body = encodeURIComponent(`
Bonjour,

Je souhaiterais demander l'accès à la page ${this.accessInfo?.path}.

Mes informations:
- Nom: ${user?.full_name || user?.email}
- Rôle actuel: ${this.getRoleLabel(user?.role)}
- Email: ${user?.email}

Pourriez-vous vérifier si mon rôle peut être étendu pour inclure cet accès ?

Merci d'avance.
        `);
        
        window.location.href = `mailto:support@expresscargo.com?subject=${subject}&body=${body}`;
    },
    
    showDebugInfo() {
        if (!this.accessInfo) return;
        
        const debugInfo = {
            user: Store.getUser(),
            accessInfo: this.accessInfo,
            viewFilter: window.ViewFilter?.getDebugInfo(this.accessInfo.userRole),
            timestamp: new Date().toISOString()
        };
        
        Modal.open({
            title: I18n.t('access_denied.tech_info'),
            size: 'lg',
            content: `
                <div class="debug-info">
                    <h3>${I18n.t('access_denied.debug_info')}</h3>
                    <pre class="debug-json">${JSON.stringify(debugInfo, null, 2)}</pre>
                    <div class="debug-actions">
                        <button class="btn btn-sm btn-outline" onclick="navigator.clipboard.writeText('${JSON.stringify(debugInfo, null, 2)}')">
                            ${I18n.t('access_denied.copy_clipboard')}
                        </button>
                    </div>
                </div>
            `
        });
    },
    
    destroy() {
        // Nettoyage si nécessaire
        this.accessInfo = null;
    }
};
