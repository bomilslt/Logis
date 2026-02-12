/**
 * PWA Install Banner Component
 * Affiche une bannière pour proposer l'installation de l'app
 */

import { Icons } from './icons.js';

let deferredPrompt = null;
let installBanner = null;

/**
 * Initialise la bannière d'installation
 */
export function initInstallBanner() {
    // Écouter l'événement beforeinstallprompt
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        
        // Vérifier si l'utilisateur n'a pas déjà refusé
        const dismissed = localStorage.getItem('installBannerDismissed');
        if (!dismissed) {
            showInstallBanner();
        }
    });

    // Détecter si l'app est déjà installée
    window.addEventListener('appinstalled', () => {
        hideInstallBanner();
        deferredPrompt = null;
        console.log('✅ LucidFlow installé avec succès!');
    });

    // Pour iOS (pas de beforeinstallprompt)
    if (isIOS() && !isInStandaloneMode()) {
        const dismissed = localStorage.getItem('installBannerDismissed');
        if (!dismissed) {
            showIOSInstallBanner();
        }
    }
}

/**
 * Affiche la bannière d'installation (Android/Desktop)
 */
function showInstallBanner() {
    if (installBanner) return;

    installBanner = document.createElement('div');
    installBanner.className = 'install-banner';
    installBanner.innerHTML = `
        <div class="install-banner-content">
            <img src="image/logo.png" alt="LucidFlow" class="install-banner-icon">
            <div class="install-banner-text">
                <strong>Installer LucidFlow</strong>
                <span>Accès rapide et mode hors-ligne</span>
            </div>
        </div>
        <div class="install-banner-actions">
            <button class="install-banner-btn install-btn-primary" id="installBtn">
                Installer
            </button>
            <button class="install-banner-btn install-btn-dismiss" id="dismissBtn">
                Plus tard
            </button>
        </div>
    `;

    document.body.appendChild(installBanner);

    // Animation d'entrée
    requestAnimationFrame(() => {
        installBanner.classList.add('show');
    });

    // Event listeners
    document.getElementById('installBtn').addEventListener('click', handleInstall);
    document.getElementById('dismissBtn').addEventListener('click', dismissBanner);
}

/**
 * Affiche la bannière pour iOS (instructions manuelles)
 */
function showIOSInstallBanner() {
    if (installBanner) return;

    installBanner = document.createElement('div');
    installBanner.className = 'install-banner install-banner-ios';
    installBanner.innerHTML = `
        <div class="install-banner-content">
            <img src="image/logo.png" alt="LucidFlow" class="install-banner-icon">
            <div class="install-banner-text">
                <strong>Installer LucidFlow</strong>
                <span>Appuyez sur <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%232563eb' stroke-width='2'%3E%3Cpath d='M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8'/%3E%3Cpolyline points='16 6 12 2 8 6'/%3E%3Cline x1='12' y1='2' x2='12' y2='15'/%3E%3C/svg%3E" alt="partager" style="vertical-align: middle; margin: 0 4px;"> puis "Sur l'écran d'accueil"</span>
            </div>
        </div>
        <button class="install-banner-btn install-btn-dismiss" id="dismissBtn">
            ${Icons.get('close', { size: 16 })}
        </button>
    `;

    document.body.appendChild(installBanner);

    requestAnimationFrame(() => {
        installBanner.classList.add('show');
    });

    document.getElementById('dismissBtn').addEventListener('click', dismissBanner);
}

/**
 * Gère le clic sur le bouton installer
 */
async function handleInstall() {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
        console.log('✅ Installation acceptée');
    } else {
        console.log('❌ Installation refusée');
    }
    
    deferredPrompt = null;
    hideInstallBanner();
}

/**
 * Ferme la bannière et mémorise le choix
 */
function dismissBanner() {
    localStorage.setItem('installBannerDismissed', Date.now().toString());
    hideInstallBanner();
}

/**
 * Cache la bannière
 */
function hideInstallBanner() {
    if (!installBanner) return;
    
    installBanner.classList.remove('show');
    setTimeout(() => {
        installBanner?.remove();
        installBanner = null;
    }, 300);
}

/**
 * Détecte iOS
 */
function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

/**
 * Détecte si l'app tourne en mode standalone (déjà installée)
 */
function isInStandaloneMode() {
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true;
}

/**
 * Force l'affichage de la bannière (pour les settings par exemple)
 */
export function showInstallPrompt() {
    localStorage.removeItem('installBannerDismissed');
    if (deferredPrompt) {
        showInstallBanner();
    } else if (isIOS() && !isInStandaloneMode()) {
        showIOSInstallBanner();
    }
}
