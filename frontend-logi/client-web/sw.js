/**
 * Service Worker - Express Cargo Client
 * ======================================
 * 
 * Gère le cache offline et les notifications push.
 * 
 * Stratégies de cache:
 * - Network First: API calls (données fraîches prioritaires)
 * - Cache First: Assets statiques (JS, CSS, images)
 * - Stale While Revalidate: Pages HTML
 */

const CACHE_NAME = 'express-cargo-v1';
const STATIC_CACHE = 'express-cargo-static-v1';
const API_CACHE = 'express-cargo-api-v1';

// Assets à mettre en cache immédiatement
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/assets/css/main.css',
    '/assets/js/app.js',
    '/assets/js/config.js',
    '/assets/js/store.js',
    '/assets/js/router.js',
    '/assets/js/api.js',
    '/manifest.json'
];

// URLs à toujours récupérer du réseau
const NETWORK_ONLY = [
    '/api/auth/',
    '/api/notifications/subscribe'
];

// ==================== INSTALLATION ====================

self.addEventListener('install', (event) => {
    console.log('[SW] Installation...');
    
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => {
                console.log('[SW] Mise en cache des assets statiques');
                // Cache chaque fichier individuellement pour éviter qu'un échec bloque tout
                return Promise.allSettled(
                    STATIC_ASSETS.map(url => 
                        cache.add(url).catch(err => console.warn(`[SW] Impossible de cacher ${url}:`, err.message))
                    )
                );
            })
            .then(() => {
                // Activer immédiatement sans attendre
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('[SW] Erreur installation:', error);
            })
    );
});

// ==================== ACTIVATION ====================

self.addEventListener('activate', (event) => {
    console.log('[SW] Activation...');
    
    event.waitUntil(
        // Nettoyer les anciens caches
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => {
                            return name.startsWith('express-cargo-') && 
                                   name !== CACHE_NAME && 
                                   name !== STATIC_CACHE && 
                                   name !== API_CACHE;
                        })
                        .map((name) => {
                            console.log('[SW] Suppression ancien cache:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => {
                // Prendre le contrôle immédiatement
                return self.clients.claim();
            })
    );
});

// ==================== FETCH (Interception des requêtes) ====================

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    // Ignorer les requêtes non-GET
    if (event.request.method !== 'GET') {
        return;
    }
    
    // Ignorer les requêtes cross-origin (sauf API)
    if (url.origin !== location.origin && !url.pathname.startsWith('/api')) {
        return;
    }

    // Sécurité: ne pas intercepter/cacher les appels API.
    // En mode cookies, on évite tout comportement inattendu (cookies non propagés,
    // réponses sensibles en cache, incohérences offline).
    if (url.pathname.startsWith('/api/')) {
        return;
    }
    
    // Network Only pour certaines URLs
    if (NETWORK_ONLY.some(path => url.pathname.startsWith(path))) {
        event.respondWith(fetch(event.request));
        return;
    }
    
    // Assets statiques: Cache First
    if (isStaticAsset(url.pathname)) {
        event.respondWith(cacheFirstStrategy(event.request));
        return;
    }
    
    // Pages HTML: Stale While Revalidate
    event.respondWith(staleWhileRevalidate(event.request));
});

// ==================== STRATÉGIES DE CACHE ====================

/**
 * Network First - Essaie le réseau, fallback sur le cache
 */
async function networkFirstStrategy(request) {
    try {
        const networkResponse = await fetch(request);
        
        // Mettre en cache si succès
        if (networkResponse.ok) {
            const cache = await caches.open(API_CACHE);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.log('[SW] Network failed, trying cache:', request.url);
        
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        
        // Retourner une réponse d'erreur offline
        return new Response(
            JSON.stringify({ error: 'Vous êtes hors ligne', offline: true }),
            { 
                status: 503,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }
}

/**
 * Cache First - Essaie le cache, fallback sur le réseau
 */
async function cacheFirstStrategy(request) {
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
        return cachedResponse;
    }
    
    try {
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok) {
            const cache = await caches.open(STATIC_CACHE);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.error('[SW] Cache et network failed:', request.url);
        return new Response('Ressource non disponible', { status: 404 });
    }
}

/**
 * Stale While Revalidate - Retourne le cache immédiatement, met à jour en arrière-plan
 */
async function staleWhileRevalidate(request) {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);
    
    // Fetch en arrière-plan
    const fetchPromise = fetch(request)
        .then((networkResponse) => {
            if (networkResponse.ok) {
                cache.put(request, networkResponse.clone());
            }
            return networkResponse;
        })
        .catch(() => null);
    
    // Retourner le cache si disponible, sinon attendre le réseau
    return cachedResponse || fetchPromise;
}

/**
 * Vérifie si c'est un asset statique
 */
function isStaticAsset(pathname) {
    const staticExtensions = ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.woff', '.woff2', '.ttf'];
    return staticExtensions.some(ext => pathname.endsWith(ext));
}

// ==================== PUSH NOTIFICATIONS ====================

self.addEventListener('push', (event) => {
    console.log('[SW] Push reçu');
    
    let data = {
        title: 'Express Cargo',
        body: 'Nouvelle notification',
        icon: '/assets/images/icon-192.png',
        badge: '/assets/images/badge-72.png',
        tag: 'default'
    };
    
    if (event.data) {
        try {
            const payload = event.data.json();
            data = { ...data, ...payload };
        } catch (e) {
            data.body = event.data.text();
        }
    }
    
    const options = {
        body: data.body,
        icon: data.icon,
        badge: data.badge,
        tag: data.tag,
        data: data.data || {},
        vibrate: [200, 100, 200],
        actions: data.actions || [],
        requireInteraction: data.requireInteraction || false
    };
    
    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// ==================== NOTIFICATION CLICK ====================

self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification cliquée:', event.notification.tag);
    
    event.notification.close();
    
    const data = event.notification.data || {};
    let url = '/';
    
    // Déterminer l'URL selon le type de notification
    if (data.type === 'package_update' && data.package_id) {
        url = `/packages/${data.package_id}`;
    } else if (data.type === 'invoice' && data.invoice_id) {
        url = `/invoices/${data.invoice_id}`;
    } else if (data.url) {
        url = data.url;
    }
    
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                // Chercher une fenêtre existante
                for (const client of clientList) {
                    if (client.url.includes(location.origin) && 'focus' in client) {
                        client.postMessage({ type: 'NOTIFICATION_CLICK', data });
                        return client.focus();
                    }
                }
                // Ouvrir une nouvelle fenêtre
                if (clients.openWindow) {
                    return clients.openWindow(url);
                }
            })
    );
});

// ==================== MESSAGES ====================

self.addEventListener('message', (event) => {
    console.log('[SW] Message reçu:', event.data);
    
    if (event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.keys().then((names) => {
                return Promise.all(names.map(name => caches.delete(name)));
            })
        );
    }
    
    if (event.data.type === 'CACHE_URLS') {
        const urls = event.data.urls || [];
        event.waitUntil(
            caches.open(CACHE_NAME).then((cache) => {
                return cache.addAll(urls);
            })
        );
    }
});

// ==================== SYNC (Background Sync) ====================

self.addEventListener('sync', (event) => {
    console.log('[SW] Sync:', event.tag);
    
    if (event.tag === 'sync-packages') {
        event.waitUntil(syncPackages());
    }
    
    if (event.tag === 'sync-notifications') {
        event.waitUntil(syncNotifications());
    }
});

async function syncPackages() {
    // Récupérer les actions en attente depuis IndexedDB
    // et les envoyer au serveur
    console.log('[SW] Synchronisation des colis...');
}

async function syncNotifications() {
    console.log('[SW] Synchronisation des notifications...');
}

console.log('[SW] Service Worker chargé');
