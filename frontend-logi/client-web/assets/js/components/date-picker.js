/**
 * DatePicker Component - Compact date picker (adapted for non-module use)
 */

class DatePicker {
    constructor(options = {}) {
        this.options = {
            container: null,
            placeholder: 'Selectionner...',
            value: null,
            minDate: null,
            maxDate: null,
            onChange: null,
            allowClear: true,
            ...options
        };
        
        this.container = typeof this.options.container === 'string'
            ? document.querySelector(this.options.container)
            : this.options.container;
        
        this.selectedDate = null;
        this.viewDate = new Date();
        this.isOpen = false;
        
        if (this.container) {
            this.init();
        }
    }
    
    init() {
        if (this.options.value) {
            this.selectedDate = this.parseDate(this.options.value);
            this.viewDate = new Date(this.selectedDate);
        }
        
        this.render();
        this.bindEvents();
    }
    
    parseDate(value) {
        if (!value) return null;
        if (value instanceof Date) return new Date(value);
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
            const [year, month, day] = value.split('-').map(Number);
            return new Date(year, month - 1, day);
        }
        const date = new Date(value);
        return isNaN(date.getTime()) ? null : date;
    }
    
    toISOString(date) {
        if (!date) return null;
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    
    formatDate(date) {
        if (!date) return '';
        return new Intl.DateTimeFormat('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        }).format(date);
    }
    
    render() {
        this.element = document.createElement('div');
        this.element.className = 'date-picker';
        
        this.button = document.createElement('button');
        this.button.type = 'button';
        this.button.className = 'date-picker-button';
        this.updateButtonText();
        
        this.dropdown = document.createElement('div');
        this.dropdown.className = 'date-picker-dropdown';
        
        this.element.appendChild(this.button);
        this.element.appendChild(this.dropdown);
        
        this.container.appendChild(this.element);
    }
    
    updateButtonText() {
        if (this.selectedDate) {
            this.button.innerHTML = `
                <span class="date-picker-icon">${Icons.get('calendar', { size: 16 })}</span>
                <span class="date-picker-text">${this.formatDate(this.selectedDate)}</span>
            `;
            this.button.classList.add('has-value');
        } else {
            this.button.innerHTML = `
                <span class="date-picker-icon">${Icons.get('calendar', { size: 16 })}</span>
                <span class="date-picker-text">${this.options.placeholder}</span>
            `;
            this.button.classList.remove('has-value');
        }
    }
    
    bindEvents() {
        this.button.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggle();
        });
        
        // Store bound function for cleanup
        this.boundDocumentClick = (e) => {
            if (this.element && !this.element.contains(e.target)) {
                this.close();
            }
        };
        document.addEventListener('click', this.boundDocumentClick);
    }
    
    toggle() {
        this.isOpen ? this.close() : this.open();
    }
    
    open() {
        this.isOpen = true;
        if (this.element) {
            this.element.classList.add('open');
        }
        this.renderCalendar();
    }
    
    close() {
        this.isOpen = false;
        if (this.element) {
            this.element.classList.remove('open');
        }
    }
    
    renderCalendar() {
        const year = this.viewDate.getFullYear();
        const month = this.viewDate.getMonth();
        const months = ['Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin',
                        'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre'];
        
        const header = `
            <div class="date-picker-header">
                <button type="button" class="date-picker-nav" data-action="prev">${Icons.get('chevronLeft', { size: 16 })}</button>
                <span class="date-picker-title">${months[month]} ${year}</span>
                <button type="button" class="date-picker-nav" data-action="next">${Icons.get('chevronRight', { size: 16 })}</button>
            </div>
        `;
        
        const weekdays = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'];
        const weekdayHeaders = `
            <div class="date-picker-weekdays">
                ${weekdays.map(d => `<div class="date-picker-weekday">${d}</div>`).join('')}
            </div>
        `;
        
        const days = this.getDaysInMonth(year, month);
        const daysGrid = `
            <div class="date-picker-days">
                ${days.map(day => this.renderDay(day)).join('')}
            </div>
        `;
        
        const quickActions = `
            <div class="date-picker-quick">
                <button type="button" class="date-picker-quick-btn" data-action="today">Aujourd'hui</button>
                ${this.options.allowClear ? '<button type="button" class="date-picker-quick-btn" data-action="clear">Effacer</button>' : ''}
            </div>
        `;
        
        this.dropdown.innerHTML = header + weekdayHeaders + daysGrid + quickActions;
        this.attachCalendarEvents();
    }
    
    getDaysInMonth(year, month) {
        const days = [];
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        
        let startDayOfWeek = firstDay.getDay();
        startDayOfWeek = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;
        
        const prevMonthLastDay = new Date(year, month, 0).getDate();
        for (let i = startDayOfWeek - 1; i >= 0; i--) {
            days.push({ date: new Date(year, month - 1, prevMonthLastDay - i), isCurrentMonth: false });
        }
        
        for (let day = 1; day <= lastDay.getDate(); day++) {
            days.push({ date: new Date(year, month, day), isCurrentMonth: true });
        }
        
        const remainingDays = 42 - days.length;
        for (let day = 1; day <= remainingDays; day++) {
            days.push({ date: new Date(year, month + 1, day), isCurrentMonth: false });
        }
        
        return days;
    }
    
    renderDay(dayInfo) {
        const { date, isCurrentMonth } = dayInfo;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const dateNorm = new Date(date);
        dateNorm.setHours(0, 0, 0, 0);
        
        const classes = ['date-picker-day'];
        if (!isCurrentMonth) classes.push('other-month');
        if (dateNorm.getTime() === today.getTime()) classes.push('today');
        
        if (this.selectedDate) {
            const selNorm = new Date(this.selectedDate);
            selNorm.setHours(0, 0, 0, 0);
            if (dateNorm.getTime() === selNorm.getTime()) classes.push('selected');
        }
        
        return `<button type="button" class="${classes.join(' ')}" data-date="${this.toISOString(date)}">${date.getDate()}</button>`;
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
        this.updateButtonText();
        this.close();
        
        if (this.options.onChange) {
            this.options.onChange(date, this.getValue());
        }
    }
    
    clear() {
        this.selectedDate = null;
        this.viewDate = new Date();
        this.updateButtonText();
        this.close();
        
        if (this.options.onChange) {
            this.options.onChange(null, null);
        }
    }
    
    getValue() {
        return this.selectedDate ? this.toISOString(this.selectedDate) : null;
    }
    
    setValue(value) {
        if (!value) {
            this.clear();
            return;
        }
        const date = this.parseDate(value);
        if (date) {
            this.selectedDate = date;
            this.viewDate = new Date(date);
            this.updateButtonText();
        }
    }
    
    destroy() {
        // Remove document listener
        if (this.boundDocumentClick) {
            document.removeEventListener('click', this.boundDocumentClick);
        }
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
    }
}
