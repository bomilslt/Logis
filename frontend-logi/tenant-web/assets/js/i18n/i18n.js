/**
 * I18n - Internationalization Service
 * Lightweight i18n with data-i18n attribute support for static HTML
 * and I18n.t('key') for dynamic JS content.
 */

const I18n = {
    _langs: {},
    _current: 'fr',
    _fallback: 'fr',
    _listeners: [],

    /**
     * Register a language pack
     */
    register(code, translations) {
        this._langs[code] = translations;
    },

    /**
     * Initialize: load saved preference or default
     */
    init() {
        const saved = localStorage.getItem('app_lang');
        if (saved && this._langs[saved]) {
            this._current = saved;
        }
        this.translateDOM();
    },

    /**
     * Get current language code
     */
    get locale() {
        return this._current;
    },

    /**
     * Get available languages
     */
    get available() {
        return Object.keys(this._langs);
    },

    /**
     * Switch language
     */
    setLocale(code) {
        if (!this._langs[code] || code === this._current) return;
        this._current = code;
        localStorage.setItem('app_lang', code);
        document.documentElement.setAttribute('lang', code);
        this.translateDOM();
        this._listeners.forEach(fn => fn(code));
    },

    /**
     * Subscribe to language changes
     */
    onChange(fn) {
        this._listeners.push(fn);
    },

    /**
     * Translate a key: I18n.t('nav.dashboard') => 'Dashboard'
     * Supports nested dot notation and optional fallback.
     */
    t(key, fallback) {
        const val = this._resolve(key, this._langs[this._current]);
        if (val !== undefined) return val;
        // Try fallback language
        if (this._current !== this._fallback) {
            const fbVal = this._resolve(key, this._langs[this._fallback]);
            if (fbVal !== undefined) return fbVal;
        }
        return fallback !== undefined ? fallback : key;
    },

    /**
     * Resolve a dotted key path in an object
     */
    _resolve(key, obj) {
        if (!obj) return undefined;
        const parts = key.split('.');
        let current = obj;
        for (const part of parts) {
            if (current == null || typeof current !== 'object') return undefined;
            current = current[part];
        }
        return typeof current === 'string' ? current : undefined;
    },

    /**
     * Translate all elements with data-i18n attribute in the DOM
     * Usage: <span data-i18n="nav.dashboard">Dashboard</span>
     * Also supports: data-i18n-title, data-i18n-placeholder
     */
    translateDOM(root) {
        const container = root || document;

        // Text content
        container.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const val = this.t(key);
            if (val && val !== key) el.textContent = val;
        });

        // Title attribute
        container.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key = el.getAttribute('data-i18n-title');
            const val = this.t(key);
            if (val && val !== key) el.setAttribute('title', val);
        });

        // Placeholder attribute
        container.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            const val = this.t(key);
            if (val && val !== key) el.setAttribute('placeholder', val);
        });
    }
};
