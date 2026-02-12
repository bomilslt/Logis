/**
 * Script de test pour le filtrage des vues par modules d'accès
 * À exécuter dans la console du navigateur pour validation
 */

// Test du ViewFilter
function testViewFilter() {
    console.log('--- Test du systeme de filtrage des vues par modules ---');
    
    // Test 1: Utilisateur actuel
    console.log('\n[1] Utilisateur actuel');
    const currentUser = Store.getUser();
    if (currentUser) {
        console.log(`  Email: ${currentUser.email}`);
        console.log(`  Role: ${currentUser.role}`);
        console.log(`  Modules: ${(currentUser.access_modules || []).join(', ') || 'aucun'}`);
        
        const views = ViewFilter.getAuthorizedViews();
        console.log(`  Vues autorisees (${views.length}): ${views.join(', ')}`);
    } else {
        console.log('  Aucun utilisateur connecte');
        return;
    }
    
    // Test 2: Verification d'acces aux routes
    console.log('\n[2] Verification d\'acces aux routes');
    const testRoutes = ['/dashboard', '/packages', '/staff', '/settings', '/reports', '/departures', '/announcements', '/test-webhooks'];
    
    testRoutes.forEach(route => {
        const access = ViewFilter.checkRouteAccess(route);
        const status = access.authorized ? 'OK' : 'REFUSE';
        console.log(`  ${status} ${route} (${access.reason})`);
    });
    
    // Test 3: Validation de la navigation sidebar
    console.log('\n[3] Validation de la navigation');
    const navItems = document.querySelectorAll('.nav-link[data-view]');
    let visibleCount = 0;
    let hiddenCount = 0;
    
    navItems.forEach(item => {
        const view = item.dataset.view;
        const isAuthorized = ViewFilter.isViewAuthorized(view);
        const isVisible = item.style.display !== 'none';
        
        if (isAuthorized && isVisible) visibleCount++;
        else if (!isAuthorized && isVisible) console.warn(`  WARN: visible mais non autorise: ${view}`);
        else if (isAuthorized && !isVisible) console.warn(`  WARN: autorise mais masque: ${view}`);
        else hiddenCount++;
    });
    
    console.log(`  Visibles: ${visibleCount}, Masques: ${hiddenCount}`);
    
    // Test 4: Debug info
    console.log('\n[4] Debug info');
    console.log(ViewFilter.getDebugInfo());
    
    console.log('\n--- Test termine ---');
}

// Simule un staff avec des modules specifiques
function simulateModules(modules) {
    const currentUser = Store.getUser();
    if (!currentUser) { console.error('Aucun utilisateur connecte'); return; }
    
    const original = { role: currentUser.role, modules: currentUser.access_modules };
    currentUser.role = 'staff';
    currentUser.access_modules = modules;
    Store.setUser(currentUser);
    ViewFilter.invalidateCache();
    ViewFilter.filterNavigation();
    App.updateHeaderUser();
    
    console.log(`Modules simules: [${modules.join(', ')}]`);
    console.log(`Vues: ${ViewFilter.getAuthorizedViews().join(', ')}`);
    console.log(`Pour restaurer: restoreUser()`);
    
    window._originalUser = original;
}

function restoreUser() {
    if (!window._originalUser) { console.log('Rien a restaurer'); return; }
    const user = Store.getUser();
    user.role = window._originalUser.role;
    user.access_modules = window._originalUser.modules;
    Store.setUser(user);
    ViewFilter.invalidateCache();
    ViewFilter.filterNavigation();
    App.updateHeaderUser();
    console.log('Utilisateur restaure');
}

// Export
if (typeof window !== 'undefined') {
    window.testViewFilter = testViewFilter;
    window.simulateModules = simulateModules;
    window.restoreUser = restoreUser;
    
    console.log('Fonctions de test: testViewFilter(), simulateModules(["packages","finance"]), restoreUser()');
}
