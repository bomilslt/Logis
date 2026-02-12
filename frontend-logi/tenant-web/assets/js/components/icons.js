/**
 * Icons - Helper pour les icones SVG
 */

const Icons = {
    get(name, options = {}) {
        const { size = 20, className = '' } = options;
        // Utilise #name car le sprite SVG est injecte dans le DOM par App.loadSvgSprite()
        return `<svg class="icon ${className}" width="${size}" height="${size}" viewBox="0 0 24 24"><use href="#${name}"></use></svg>`;
    }
};
