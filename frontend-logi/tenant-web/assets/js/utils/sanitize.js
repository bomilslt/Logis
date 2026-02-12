/**
 * Sanitize - Protection XSS
 * Utilitaires pour nettoyer les entrées utilisateur
 */

const Sanitize = {
    escapeHtml(str) {
        if (str === null || str === undefined) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },
    
    escapeObject(obj) {
        if (!obj || typeof obj !== 'object') return obj;
        const cleaned = Array.isArray(obj) ? [] : {};
        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'string') cleaned[key] = this.escapeHtml(value);
            else if (typeof value === 'object' && value !== null) cleaned[key] = this.escapeObject(value);
            else cleaned[key] = value;
        }
        return cleaned;
    },
    
    sanitizeHtml(html, allowedTags = ['b', 'i', 'em', 'strong', 'br']) {
        if (!html) return '';
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const walk = (node) => {
            Array.from(node.childNodes).forEach(child => {
                if (child.nodeType === Node.ELEMENT_NODE) {
                    if (!allowedTags.includes(child.tagName.toLowerCase())) {
                        node.replaceChild(document.createTextNode(child.textContent), child);
                    } else {
                        Array.from(child.attributes).forEach(attr => child.removeAttribute(attr.name));
                        walk(child);
                    }
                }
            });
        };
        walk(doc.body);
        return doc.body.innerHTML;
    },
    
    sanitizeUrl(url) {
        if (!url) return null;
        try {
            const parsed = new URL(url, window.location.origin);
            if (!['http:', 'https:', ''].includes(parsed.protocol)) return null;
            if (url.toLowerCase().startsWith('javascript:') || url.toLowerCase().startsWith('data:')) return null;
            return parsed.href;
        } catch { return null; }
    },

    createElement(tag, attrs = {}, content = null) {
        const el = document.createElement(tag);
        for (const [key, value] of Object.entries(attrs)) {
            if (key === 'className') el.className = value;
            else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
            else if (key.startsWith('on')) console.warn(`Inline handler ${key} ignored`);
            else if (key === 'href' || key === 'src') {
                const safeUrl = this.sanitizeUrl(value);
                if (safeUrl) el.setAttribute(key, safeUrl);
            } else el.setAttribute(key, this.escapeHtml(value));
        }
        if (content !== null) {
            if (typeof content === 'string') el.textContent = content;
            else if (content instanceof Node) el.appendChild(content);
            else if (Array.isArray(content)) content.forEach(c => { if (c instanceof Node) el.appendChild(c); });
        }
        return el;
    },
    
    html(strings, ...values) {
        return strings.reduce((result, str, i) => {
            const value = values[i - 1];
            return result + (typeof value === 'string' ? this.escapeHtml(value) : value) + str;
        });
    }
};
