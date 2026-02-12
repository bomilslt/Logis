/**
 * DatePicker - Selecteur de date custom
 */

class DatePicker {
    constructor(options = {}) {
        this.container = typeof options.container === 'string'
            ? document.querySelector(options.container)
            : options.container;
        
        this.placeholder = options.placeholder || 'Selectionner...';
        this.value = options.value || null;
        this.onChange = options.onChange || (() => {});
        this.allowClear = options.allowClear !== false;
        
        this.selectedDate = null;
        this.viewDate = new Date();
        this.isOpen = false;
        
        if (this.container) {
            this.init();
        }
    }
    
    init() {
        if (this.value) {
            this.selectedDate = this.parseDate(this.value);
            this.viewDate = new Date(this.selectedDate);
        }
        this.render();
        this.bindEvents();
    }
    
    parseDate(value) {
        if (!value) return null;
        if (value instanceof Date) return new Date(value);
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
            const [y, m, d] = value.split('-').map(Number);
            return new Date(y, m - 1, d);
        }
        const date = new Date(value);
        return isNaN(date.getTime()) ? null : date;
    }
    
    toISO(date) {
        if (!date) return null;
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    
    formatDate(date) {
        if (!date) return '';
        return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
    }

    render() {
        this.container.innerHTML = `
            <div class="date-picker">
                <button type="button" class="date-picker-trigger">
                    ${Icons.get('calendar', { size: 16 })}
                    <span class="date-picker-value">${this.selectedDate ? this.formatDate(this.selectedDate) : this.placeholder}</span>
                    ${Icons.get('chevron-down', { size: 14 })}
                </button>
                <div class="date-picker-dropdown hidden"></div>
            </div>
        `;
        
        this.trigger = this.container.querySelector('.date-picker-trigger');
        this.dropdown = this.container.querySelector('.date-picker-dropdown');
        this.valueEl = this.container.querySelector('.date-picker-value');
        
        if (this.selectedDate) {
            this.trigger.classList.add('has-value');
        }
    }
    
    bindEvents() {
        this.trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggle();
        });
        
        document.addEventListener('click', (e) => {
            if (!this.container.contains(e.target)) this.close();
        });
    }
    
    toggle() {
        this.isOpen ? this.close() : this.open();
    }
    
    open() {
        this.isOpen = true;
        this.dropdown.classList.remove('hidden');
        this.renderCalendar();
    }
    
    close() {
        this.isOpen = false;
        this.dropdown.classList.add('hidden');
    }
    
    renderCalendar() {
        const year = this.viewDate.getFullYear();
        const month = this.viewDate.getMonth();
        const months = ['Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin',
                        'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre'];
        
        const days = this.getDaysInMonth(year, month);
        
        this.dropdown.innerHTML = `
            <div class="date-picker-header">
                <button type="button" class="date-picker-nav" data-action="prev">${Icons.get('chevron-left', { size: 16 })}</button>
                <span class="date-picker-title">${months[month]} ${year}</span>
                <button type="button" class="date-picker-nav" data-action="next">${Icons.get('chevron-right', { size: 16 })}</button>
            </div>
            <div class="date-picker-weekdays">
                ${['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'].map(d => `<div>${d}</div>`).join('')}
            </div>
            <div class="date-picker-days">
                ${days.map(d => this.renderDay(d)).join('')}
            </div>
            <div class="date-picker-footer">
                <button type="button" class="btn btn-sm btn-ghost" data-action="today">Aujourd'hui</button>
                ${this.allowClear ? '<button type="button" class="btn btn-sm btn-ghost" data-action="clear">Effacer</button>' : ''}
            </div>
        `;
        
        this.attachCalendarEvents();
    }

    getDaysInMonth(year, month) {
        const days = [];
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        
        let startDow = firstDay.getDay();
        startDow = startDow === 0 ? 6 : startDow - 1;
        
        const prevLast = new Date(year, month, 0).getDate();
        for (let i = startDow - 1; i >= 0; i--) {
            days.push({ date: new Date(year, month - 1, prevLast - i), current: false });
        }
        
        for (let d = 1; d <= lastDay.getDate(); d++) {
            days.push({ date: new Date(year, month, d), current: true });
        }
        
        const remaining = 42 - days.length;
        for (let d = 1; d <= remaining; d++) {
            days.push({ date: new Date(year, month + 1, d), current: false });
        }
        
        return days;
    }
    
    renderDay(dayInfo) {
        const { date, current } = dayInfo;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const dateNorm = new Date(date);
        dateNorm.setHours(0, 0, 0, 0);
        
        const classes = ['date-picker-day'];
        if (!current) classes.push('other-month');
        if (dateNorm.getTime() === today.getTime()) classes.push('today');
        
        if (this.selectedDate) {
            const selNorm = new Date(this.selectedDate);
            selNorm.setHours(0, 0, 0, 0);
            if (dateNorm.getTime() === selNorm.getTime()) classes.push('selected');
        }
        
        return `<button type="button" class="${classes.join(' ')}" data-date="${this.toISO(date)}">${date.getDate()}</button>`;
    }
    
    attachCalendarEvents() {
        this.dropdown.querySelector('[data-action="prev"]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.viewDate.setMonth(this.viewDate.getMonth() - 1);
            this.renderCalendar();
        });
        
        this.dropdown.querySelector('[data-action="next"]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.viewDate.setMonth(this.viewDate.getMonth() + 1);
            this.renderCalendar();
        });
        
        this.dropdown.querySelectorAll('.date-picker-day').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.selectDate(this.parseDate(btn.dataset.date));
            });
        });
        
        this.dropdown.querySelector('[data-action="today"]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectDate(new Date());
        });
        
        this.dropdown.querySelector('[data-action="clear"]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.clear();
        });
    }
    
    selectDate(date) {
        this.selectedDate = date;
        this.viewDate = new Date(date);
        this.valueEl.textContent = this.formatDate(date);
        this.trigger.classList.add('has-value');
        this.close();
        this.onChange(date, this.getValue());
    }
    
    clear() {
        this.selectedDate = null;
        this.viewDate = new Date();
        this.valueEl.textContent = this.placeholder;
        this.trigger.classList.remove('has-value');
        this.close();
        this.onChange(null, null);
    }
    
    getValue() {
        return this.selectedDate ? this.toISO(this.selectedDate) : null;
    }
    
    setValue(value) {
        if (!value) { this.clear(); return; }
        const date = this.parseDate(value);
        if (date) {
            this.selectedDate = date;
            this.viewDate = new Date(date);
            this.valueEl.textContent = this.formatDate(date);
            this.trigger.classList.add('has-value');
        }
    }
}
