/**
 * ViewCache - Stale-While-Revalidate cache for API data
 * ======================================================
 * 
 * Pattern:
 *   1. On view render, return cached data instantly (no loader flash)
 *   2. Fetch fresh data in background
 *   3. If data changed, call the view's update callback silently
 * 
 * Usage in views:
 *   const cached = ViewCache.get('dashboard:stats');
 *   if (cached) renderWith(cached);          // instant render
 *   const fresh = await API.dashboard.getStats();
 *   ViewCache.set('dashboard:stats', fresh);
 *   if (!cached || ViewCache.hasChanged('dashboard:stats', fresh)) renderWith(fresh);
 * 
 * Or use the helper:
 *   await ViewCache.load({
 *     key: 'staff:list',
 *     fetch: () => API.staff.getAll(),
 *     render: (data) => this.renderTable(data),
 *     container: '#staff-table'   // optional: where to show mini-loader on first load
 *   });
 */

const ViewCache = {
    _mem: {},           // in-memory cache { key: { data, hash, ts } }
    _ttl: 5 * 60_000,  // 5 min default TTL for localStorage persistence
    _prefix: 'vc_',

    /**
     * Get cached data for a key (memory first, then localStorage)
     */
    get(key) {
        // Memory cache (fastest)
        if (this._mem[key]) {
            return this._mem[key].data;
        }

        // localStorage fallback
        try {
            const raw = localStorage.getItem(this._prefix + key);
            if (raw) {
                const entry = JSON.parse(raw);
                // Check TTL
                if (entry.ts && (Date.now() - entry.ts) < this._ttl) {
                    this._mem[key] = entry;
                    return entry.data;
                }
                // Expired but still return stale data for instant display
                this._mem[key] = entry;
                return entry.data;
            }
        } catch (e) {
            // Corrupted cache, ignore
        }
        return null;
    },

    /**
     * Store data in cache
     */
    set(key, data) {
        const hash = this._hash(data);
        const entry = { data, hash, ts: Date.now() };
        this._mem[key] = entry;

        // Persist to localStorage (non-blocking)
        try {
            localStorage.setItem(this._prefix + key, JSON.stringify(entry));
        } catch (e) {
            // localStorage full, clear old entries
            this._evict();
            try {
                localStorage.setItem(this._prefix + key, JSON.stringify(entry));
            } catch (e2) { /* give up */ }
        }
    },

    /**
     * Check if fresh data differs from cached
     */
    hasChanged(key, freshData) {
        const cached = this._mem[key];
        if (!cached) return true;
        return cached.hash !== this._hash(freshData);
    },

    /**
     * High-level helper: load data with stale-while-revalidate
     * 
     * @param {Object} opts
     * @param {string} opts.key - Cache key
     * @param {Function} opts.fetch - Async function returning fresh data
     * @param {Function} opts.render - Function to render data into DOM
     * @param {string} [opts.container] - Selector for container to show loader (first load only)
     * @param {boolean} [opts.forceRefresh] - Skip cache, always fetch
     */
    async load(opts) {
        const { key, fetch: fetchFn, render, container, forceRefresh = false } = opts;

        const cached = !forceRefresh ? this.get(key) : null;
        let renderedCached = false;

        // Step 1: Instant render from cache
        if (cached) {
            try {
                render(cached);
                renderedCached = true;
            } catch (e) {
                console.warn('[ViewCache] Cached render failed:', e);
            }
        } else if (container) {
            // First load ever: show a subtle loader
            const el = typeof container === 'string' ? document.querySelector(container) : container;
            if (el && !el.querySelector('.vc-loading')) {
                // Only add loader if container has the default loader or is empty
                const hasLoader = el.querySelector('.loader, .loading');
                if (!hasLoader && el.innerHTML.trim() === '') {
                    el.innerHTML = Loader.page('Chargement...');
                }
            }
        }

        // Step 2: Fetch fresh data in background
        try {
            const fresh = await fetchFn();
            this.set(key, fresh);

            // Step 3: Re-render only if data changed or no cache was shown
            if (!renderedCached || this.hasChanged(key, fresh)) {
                // Update cache hash after set
                render(fresh);
            }

            return fresh;
        } catch (error) {
            // If we had cached data, don't break the view
            if (renderedCached) {
                console.warn('[ViewCache] Background refresh failed, keeping cached data:', error.message);
                return cached;
            }
            // No cache, propagate error
            throw error;
        }
    },

    /**
     * Invalidate a specific key or pattern
     */
    invalidate(keyOrPattern) {
        if (keyOrPattern.includes('*')) {
            // Pattern match (e.g. 'packages:*')
            const prefix = keyOrPattern.replace('*', '');
            Object.keys(this._mem).forEach(k => {
                if (k.startsWith(prefix)) delete this._mem[k];
            });
            // localStorage
            for (let i = localStorage.length - 1; i >= 0; i--) {
                const lsKey = localStorage.key(i);
                if (lsKey && lsKey.startsWith(this._prefix + prefix)) {
                    localStorage.removeItem(lsKey);
                }
            }
        } else {
            delete this._mem[keyOrPattern];
            localStorage.removeItem(this._prefix + keyOrPattern);
        }
    },

    /**
     * Clear all view cache
     */
    clear() {
        this._mem = {};
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key && key.startsWith(this._prefix)) {
                localStorage.removeItem(key);
            }
        }
    },

    /**
     * Invalidate caches related to a mutation (POST/PUT/DELETE)
     * Call this after any write operation
     */
    onMutate(domain) {
        // Invalidate all keys starting with this domain
        this.invalidate(domain + ':*');

        // Also invalidate dashboard since it aggregates data
        if (domain !== 'dashboard') {
            this.invalidate('dashboard:*');
        }
    },

    // ---- Internal ----

    _hash(data) {
        const str = JSON.stringify(data);
        // Simple fast hash (djb2)
        let hash = 5381;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xFFFFFFFF;
        }
        return hash.toString(36);
    },

    _evict() {
        // Remove oldest cache entries from localStorage
        const entries = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(this._prefix)) {
                try {
                    const entry = JSON.parse(localStorage.getItem(key));
                    entries.push({ key, ts: entry.ts || 0 });
                } catch (e) {
                    localStorage.removeItem(key);
                }
            }
        }
        // Remove oldest half
        entries.sort((a, b) => a.ts - b.ts);
        const removeCount = Math.ceil(entries.length / 2);
        for (let i = 0; i < removeCount; i++) {
            localStorage.removeItem(entries[i].key);
        }
    }
};
