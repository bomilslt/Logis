/**
 * API Client for LOGi Super Admin
 * Handles authentication, CSRF, and API calls
 * 
 * Configuration:
 *   - En dev: utilise http://localhost:5000 automatiquement
 *   - En prod: surchargez via window.SUPERADMIN_CONFIG = { API_BASE_URL: 'https://logis-production.up.railway.app' }
 *     ou injectez dans index.html avant ce script
 */

const SA_CONFIG = (() => {
    const injected = window.SUPERADMIN_CONFIG || {};
    const isProd = location.hostname !== 'localhost' && location.hostname !== '127.0.0.1';
    return {
        API_BASE_URL: injected.API_BASE_URL || (isProd ? 'https://logis-production.up.railway.app' : `http://${location.hostname}:5000`),
    };
})();

let baseUrl = SA_CONFIG.API_BASE_URL;
const API = (() => {
    let csrfToken = '';
    let accessToken = '';
    let refreshToken = '';
    let onUnauthorized = null;

    function init(url) {
        if (url) baseUrl = url.replace(/\/$/, '');
        accessToken = localStorage.getItem('sa_access_token') || '';
        refreshToken = localStorage.getItem('sa_refresh_token') || '';
        csrfToken = localStorage.getItem('sa_csrf_token') || '';
    }

    function setTokens(access, refresh, csrf) {
        accessToken = access || '';
        refreshToken = refresh || '';
        csrfToken = csrf || '';
        if (access) localStorage.setItem('sa_access_token', access);
        else localStorage.removeItem('sa_access_token');
        if (refresh) localStorage.setItem('sa_refresh_token', refresh);
        else localStorage.removeItem('sa_refresh_token');
        if (csrf) localStorage.setItem('sa_csrf_token', csrf);
        else localStorage.removeItem('sa_csrf_token');
    }

    function clearTokens() {
        setTokens('', '', '');
    }

    function isAuthenticated() {
        return !!accessToken;
    }

    function setUnauthorizedHandler(handler) {
        onUnauthorized = handler;
    }

    async function request(method, path, data = null, options = {}) {
        const url = `${baseUrl}${path}`;
        const headers = {
            'Content-Type': 'application/json',
            'X-App-Channel': 'web_superadmin'
        };

        if (accessToken) {
            headers['Authorization'] = `Bearer ${accessToken}`;
        }

        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && csrfToken) {
            headers['X-CSRF-Token'] = csrfToken;
        }

        const config = {
            method,
            headers,
            credentials: 'include'
        };

        if (data && method !== 'GET') {
            config.body = JSON.stringify(data);
        }

        try {
            let response = await fetch(url, config);

            // If 401, try refresh
            if (response.status === 401 && refreshToken && !options._isRetry) {
                const refreshed = await tryRefresh();
                if (refreshed) {
                    headers['Authorization'] = `Bearer ${accessToken}`;
                    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
                    config.headers = headers;
                    response = await fetch(url, { ...config, _isRetry: true });
                } else {
                    if (onUnauthorized) onUnauthorized();
                    throw new Error('Session expirée');
                }
            }

            const json = await response.json().catch(() => ({}));

            if (!response.ok) {
                const error = new Error(json.error || json.message || `Erreur ${response.status}`);
                error.status = response.status;
                error.data = json;
                throw error;
            }

            return json;
        } catch (err) {
            if (err.name === 'TypeError' && err.message.includes('fetch')) {
                throw new Error('Impossible de contacter le serveur');
            }
            throw err;
        }
    }

    async function tryRefresh() {
        try {
            const response = await fetch(`${baseUrl}/api/superadmin/auth/refresh`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${refreshToken}`,
                    'X-CSRF-Token': csrfToken,
                    'X-App-Channel': 'web_superadmin'
                },
                credentials: 'include'
            });

            if (!response.ok) return false;

            const json = await response.json();
            if (json.access_token) {
                accessToken = json.access_token;
                localStorage.setItem('sa_access_token', accessToken);
            }
            if (json.csrf_token) {
                csrfToken = json.csrf_token;
                localStorage.setItem('sa_csrf_token', csrfToken);
            }
            return true;
        } catch {
            return false;
        }
    }

    // Convenience methods
    const get = (path) => request('GET', path);
    const post = (path, data) => request('POST', path, data);
    const put = (path, data) => request('PUT', path, data);
    const del = (path, data) => request('DELETE', path, data);

    // Auth
    async function login(email, password) {
        const json = await request('POST', '/api/superadmin/auth/login', { email, password });
        setTokens(json.access_token, json.refresh_token, json.csrf_token);
        return json;
    }

    async function logout() {
        try {
            await post('/api/superadmin/auth/logout');
        } catch { /* ignore */ }
        clearTokens();
    }

    async function getMe() {
        return get('/api/superadmin/auth/me');
    }

    return {
        init, login, logout, getMe,
        get, post, put, del,
        isAuthenticated, setUnauthorizedHandler,
        clearTokens, setTokens
    };
})();
