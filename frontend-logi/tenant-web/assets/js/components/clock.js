/**
 * Clock Component - Real-time clock display
 * Style matching the calculator component
 */

class Clock {
    constructor(container) {
        this.container = typeof container === 'string' 
            ? document.querySelector(container) 
            : container;
        this.intervalId = null;
        
        if (this.container) {
            this.render();
            this.start();
        }
    }
    
    render() {
        this.element = document.createElement('div');
        this.element.className = 'header-clock';
        this.element.innerHTML = `
            <span class="clock-time">00:00:00</span>
        `;
        this.container.appendChild(this.element);
        this.timeEl = this.element.querySelector('.clock-time');
    }
    
    start() {
        this.update();
        this.intervalId = setInterval(() => this.update(), 1000);
    }
    
    update() {
        if (!this.timeEl) return;
        
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        
        this.timeEl.textContent = `${hours}:${minutes}:${seconds}`;
    }
    
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }
    
    destroy() {
        this.stop();
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
    }
}
