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
                    
                    <h1 class="access-denied-title">Accès refusé</h1>
                    
                    <div class="access-denied-message">
                        ${this.createAccessDeniedMessage(accessInfo)}
                    </div>
                    
                    <div class="access-denied-details">
                        <div class="detail-item">
                            <strong>Votre rôle:</strong> ${this.getRoleLabel(accessInfo.userRole)}
                        </div>
                        <div class="detail-item">
                            <strong>Page demandée:</strong> ${accessInfo.path}
                        </div>
                        <div class="detail-item">
                            <strong>Raison:</strong> ${this.getReasonLabel(accessInfo.reason)}
                        </div>
                        ${accessInfo.accessModules ? `<div class="detail-item">
                            <strong>Modules actifs:</strong> ${accessInfo.accessModules.length > 0 ? accessInfo.accessModules.join(', ') : 'Aucun'}
                        </div>` : ''}
                    </div>
                    
                    <div class="access-denied-actions">
                        <button class="btn btn-primary" onclick="Views.accessDenied.goToSuggested()">
                            Aller vers ${this.getSuggestedLabel(accessInfo.suggestedRoute)}
                        </button>
                        <button class="btn btn-secondary" onclick="Views.accessDenied.goBack()">
                            Retour
                        </button>
                        <button class="btn btn-ghost" onclick="Views.accessDenied.goToDashboard()">
                            Dashboard
                        </button>
                    </div>
                    
                    <div class="access-denied-help">
                        <details>
                            <summary>Besoin d'aide ?</summary>
                            <div class="help-content">
                                <p>Si vous pensez que vous devriez avoir accès à cette page, contactez votre administrateur.</p>
                                <div class="help-actions">
                                    <button class="btn btn-sm btn-outline" onclick="Views.accessDenied.contactAdmin()">
                                        Contacter l'administrateur
                                    </button>
                                    <button class="btn btn-sm btn-outline" onclick="Views.accessDenied.showDebugInfo()">
                                        Informations techniques
                                    </button>
                                </div>
                            </div>
                        </details>
                    </div>
                </div>
            </div>
        `;
        
        // Mettre à jour le titre de la page
        document.title = 'Accès refusé - Express Cargo';
        
        // Mettre à jour la navigation
        Router.updateNav('');
        Router.updateTitle('/access-denied');
    },
    
    createAccessDeniedMessage(accessInfo) {
        const { userRole, path, suggestedRoute, accessModules } = accessInfo;
        
        const roleLabel = this.getRoleLabel(userRole);
        const suggestedLabel = this.getSuggestedLabel(suggestedRoute);
        
        let msg = `<p>La page <strong>"${path}"</strong> n'est pas disponible avec vos droits actuels.</p>`;
        
        if (userRole === 'staff' && accessModules && accessModules.length > 0) {
            const moduleLabels = accessModules.map(m => {
                const defs = window.ViewFilter?.getModuleDefinitions() || {};
                return defs[m]?.label || m;
            });
            msg += `<p>Vos modules d'accès : <strong>${moduleLabels.join(', ')}</strong></p>`;
        } else if (userRole === 'staff') {
            msg += `<p>Aucun module d'accès ne vous a été attribué.</p>`;
        }
        
        msg += `<p>Contactez votre administrateur pour obtenir l'accès à cette fonctionnalité.</p>`;
        
        return msg;
    },
    
    getRoleLabel(role) {
        const roleLabels = {
            admin: 'Administrateur',
            staff: 'Agent'
        };
        
        return roleLabels[role] || role || 'Utilisateur';
    },
    
    getSuggestedLabel(route) {
        const labels = {
            dashboard: 'Dashboard',
            packages: 'Colis',
            clients: 'Clients',
            profile: 'Mon profil',
            'pickups-payments': 'Retraits et Paiements'
        };
        
        return labels[route] || route;
    },
    
    getReasonLabel(reason) {
        const reasons = {
            role_restricted: 'Permissions insuffisantes',
            module_restricted: 'Module d\'accès non attribué',
            public: 'Page publique',
            authorized: 'Autorisé',
            profile: 'Profil utilisateur'
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
        const subject = encodeURIComponent('Demande d\'accès - Express Cargo');
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
            title: 'Informations techniques',
            size: 'lg',
            content: `
                <div class="debug-info">
                    <h3>Informations de débogage</h3>
                    <pre class="debug-json">${JSON.stringify(debugInfo, null, 2)}</pre>
                    <div class="debug-actions">
                        <button class="btn btn-sm btn-outline" onclick="navigator.clipboard.writeText('${JSON.stringify(debugInfo, null, 2)}')">
                            Copier dans le presse-papiers
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
