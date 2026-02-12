/**
 * Calculator Component - Mini dropdown calculator
 * Supports proper operator precedence (multiplication/division before addition/subtraction)
 */

class Calculator {
    /**
     * Create a Calculator instance
     * @param {Object} options - Configuration options
     * @param {HTMLElement|string} options.trigger - Trigger element or selector
     * @param {Function} options.onResult - Callback when result is applied
     * @param {string} options.position - Dropdown position ('bottom-left', 'bottom-right')
     */
    constructor(options = {}) {
        this.options = {
            trigger: null,
            onResult: null,
            position: 'bottom-left',
            ...options
        };
        
        this.trigger = null;
        this.element = null;
        this.isOpen = false;
        
        // Expression-based state
        this.expression = '';      // Full expression string (e.g., "5+4*10")
        this.displayValue = '0';   // Current display value
        this.lastResult = null;    // Last calculated result
        this.justCalculated = false;
        
        this._boundHandleClickOutside = this.handleClickOutside.bind(this);
        this._boundHandleKeydown = this.handleKeydown.bind(this);
        
        this.init();
    }
    
    init() {
        if (typeof this.options.trigger === 'string') {
            this.trigger = document.querySelector(this.options.trigger);
        } else {
            this.trigger = this.options.trigger;
        }
        
        if (!this.trigger) {
            console.error('Calculator: Trigger element not found');
            return;
        }
        
        this.trigger.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggle();
        });
    }
    
    render() {
        this.element = document.createElement('div');
        this.element.className = `calculator-dropdown calculator-${this.options.position}`;
        
        this.element.innerHTML = `
            <div class="calculator-display">
                <div class="calculator-display-expression">${this.formatExpression(this.expression)}</div>
                <div class="calculator-display-value">${this.displayValue}</div>
            </div>
            <div class="calculator-buttons">
                <button class="calc-btn calc-btn-clear" data-action="clear">C</button>
                <button class="calc-btn calc-btn-secondary" data-action="backspace">⌫</button>
                <button class="calc-btn calc-btn-operator" data-operator="/">÷</button>
                <button class="calc-btn calc-btn-operator" data-operator="*">×</button>
                
                <button class="calc-btn calc-btn-number" data-digit="7">7</button>
                <button class="calc-btn calc-btn-number" data-digit="8">8</button>
                <button class="calc-btn calc-btn-number" data-digit="9">9</button>
                <button class="calc-btn calc-btn-operator" data-operator="-">−</button>
                
                <button class="calc-btn calc-btn-number" data-digit="4">4</button>
                <button class="calc-btn calc-btn-number" data-digit="5">5</button>
                <button class="calc-btn calc-btn-number" data-digit="6">6</button>
                <button class="calc-btn calc-btn-operator" data-operator="+">+</button>
                
                <button class="calc-btn calc-btn-number" data-digit="1">1</button>
                <button class="calc-btn calc-btn-number" data-digit="2">2</button>
                <button class="calc-btn calc-btn-number" data-digit="3">3</button>
                <button class="calc-btn calc-btn-equals" data-action="equals">=</button>
                
                <button class="calc-btn calc-btn-number calc-btn-zero" data-digit="0">0</button>
                <button class="calc-btn calc-btn-number" data-action="decimal">.</button>
                <button class="calc-btn calc-btn-apply" data-action="apply">OK</button>
            </div>
        `;
        
        // Bind button events
        this.element.querySelectorAll('.calc-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.handleButton(btn);
            });
        });
        
        return this.element;
    }
    
    handleButton(btn) {
        const digit = btn.dataset.digit;
        const operator = btn.dataset.operator;
        const action = btn.dataset.action;
        
        if (digit !== undefined) {
            this.inputDigit(digit);
        } else if (operator) {
            this.inputOperator(operator);
        } else if (action) {
            this.handleAction(action);
        }
        
        this.updateDisplay();
    }
    
    inputDigit(digit) {
        // If we just calculated, start fresh with new number
        if (this.justCalculated) {
            this.expression = digit;
            this.displayValue = digit;
            this.justCalculated = false;
        } else {
            // Append digit to expression
            this.expression += digit;
            
            // Update display value (current number being typed)
            if (this.displayValue === '0' && digit !== '0') {
                this.displayValue = digit;
            } else if (this.displayValue === '0' && digit === '0') {
                // Keep single zero
            } else if (this.isLastCharOperator()) {
                this.displayValue = digit;
            } else {
                this.displayValue += digit;
            }
        }
    }
    
    inputOperator(operator) {
        // If we just calculated, continue with the result
        if (this.justCalculated) {
            this.expression = String(this.lastResult) + operator;
            this.justCalculated = false;
        } else if (this.expression === '') {
            // Start with 0 if empty
            this.expression = '0' + operator;
        } else if (this.isLastCharOperator()) {
            // Replace last operator
            this.expression = this.expression.slice(0, -1) + operator;
        } else {
            this.expression += operator;
        }
        
        this.displayValue = '0';
    }
    
    handleAction(action) {
        switch (action) {
            case 'clear':
                this.clear();
                break;
            case 'backspace':
                this.backspace();
                break;
            case 'decimal':
                this.inputDecimal();
                break;
            case 'equals':
                this.performCalculation();
                break;
            case 'apply':
                this.applyResult();
                break;
        }
    }
    
    clear() {
        this.expression = '';
        this.displayValue = '0';
        this.lastResult = null;
        this.justCalculated = false;
    }
    
    backspace() {
        if (this.justCalculated) {
            // Clear everything after calculation
            this.clear();
            return;
        }
        
        if (this.expression.length > 0) {
            const lastChar = this.expression.slice(-1);
            this.expression = this.expression.slice(0, -1);
            
            // Update display value
            if (this.isOperator(lastChar)) {
                // Removed an operator, show the previous number
                this.displayValue = this.getLastNumber() || '0';
            } else {
                // Removed a digit
                if (this.displayValue.length > 1) {
                    this.displayValue = this.displayValue.slice(0, -1);
                } else {
                    this.displayValue = '0';
                }
            }
        }
        
        if (this.expression === '') {
            this.displayValue = '0';
        }
    }
    
    inputDecimal() {
        if (this.justCalculated) {
            this.expression = '0.';
            this.displayValue = '0.';
            this.justCalculated = false;
            return;
        }
        
        // Check if current number already has decimal
        const lastNumber = this.getLastNumber();
        if (lastNumber.includes('.')) {
            return;
        }
        
        if (this.expression === '' || this.isLastCharOperator()) {
            this.expression += '0.';
            this.displayValue = '0.';
        } else {
            this.expression += '.';
            this.displayValue += '.';
        }
    }
    
    performCalculation() {
        if (this.expression === '') return;
        
        // Remove trailing operator if any
        let expr = this.expression;
        if (this.isOperator(expr.slice(-1))) {
            expr = expr.slice(0, -1);
        }
        
        if (expr === '') return;
        
        try {
            const result = this.evaluateExpression(expr);
            this.lastResult = result;
            this.displayValue = this.formatNumber(result);
            this.expression = String(result);
            this.justCalculated = true;
        } catch (e) {
            console.error('Calculation error:', e);
            this.displayValue = 'Erreur';
        }
    }
    
    /**
     * Evaluate expression with proper operator precedence
     * Uses a simple recursive descent parser
     */
    evaluateExpression(expr) {
        // Tokenize the expression
        const tokens = this.tokenize(expr);
        
        if (tokens.length === 0) return 0;
        
        // Parse and evaluate with precedence
        let pos = { index: 0 };
        return this.parseAddSub(tokens, pos);
    }
    
    /**
     * Tokenize expression into numbers and operators
     */
    tokenize(expr) {
        const tokens = [];
        let currentNumber = '';
        
        for (let i = 0; i < expr.length; i++) {
            const char = expr[i];
            
            if (this.isOperator(char)) {
                if (currentNumber !== '') {
                    tokens.push({ type: 'number', value: parseFloat(currentNumber) });
                    currentNumber = '';
                }
                tokens.push({ type: 'operator', value: char });
            } else {
                currentNumber += char;
            }
        }
        
        if (currentNumber !== '') {
            tokens.push({ type: 'number', value: parseFloat(currentNumber) });
        }
        
        return tokens;
    }
    
    /**
     * Parse addition and subtraction (lowest precedence)
     */
    parseAddSub(tokens, pos) {
        let left = this.parseMulDiv(tokens, pos);
        
        while (pos.index < tokens.length) {
            const token = tokens[pos.index];
            
            if (token.type === 'operator' && (token.value === '+' || token.value === '-')) {
                pos.index++;
                const right = this.parseMulDiv(tokens, pos);
                
                if (token.value === '+') {
                    left = left + right;
                } else {
                    left = left - right;
                }
            } else {
                break;
            }
        }
        
        return left;
    }
    
    /**
     * Parse multiplication and division (higher precedence)
     */
    parseMulDiv(tokens, pos) {
        let left = this.parseNumber(tokens, pos);
        
        while (pos.index < tokens.length) {
            const token = tokens[pos.index];
            
            if (token.type === 'operator' && (token.value === '*' || token.value === '/')) {
                pos.index++;
                const right = this.parseNumber(tokens, pos);
                
                if (token.value === '*') {
                    left = left * right;
                } else {
                    left = right !== 0 ? left / right : 0;
                }
            } else {
                break;
            }
        }
        
        return left;
    }
    
    /**
     * Parse a number
     */
    parseNumber(tokens, pos) {
        if (pos.index >= tokens.length) return 0;
        
        const token = tokens[pos.index];
        if (token.type === 'number') {
            pos.index++;
            return token.value;
        }
        
        return 0;
    }
    
    /**
     * Check if character is an operator
     */
    isOperator(char) {
        return ['+', '-', '*', '/'].includes(char);
    }
    
    /**
     * Check if last character in expression is an operator
     */
    isLastCharOperator() {
        if (this.expression === '') return false;
        return this.isOperator(this.expression.slice(-1));
    }
    
    /**
     * Get the last number in the expression
     */
    getLastNumber() {
        const match = this.expression.match(/[\d.]+$/);
        return match ? match[0] : '';
    }
    
    /**
     * Format number for display
     */
    formatNumber(num) {
        if (isNaN(num)) return 'Erreur';
        
        // Round to avoid floating point issues
        const rounded = Math.round(num * 1000000) / 1000000;
        
        // Format with reasonable precision
        if (Number.isInteger(rounded)) {
            return String(rounded);
        } else {
            return String(rounded);
        }
    }
    
    /**
     * Format expression for display (replace operators with symbols)
     */
    formatExpression(expr) {
        return expr
            .replace(/\*/g, '×')
            .replace(/\//g, '÷')
            .replace(/-/g, '−');
    }
    
    updateDisplay() {
        const displayEl = this.element?.querySelector('.calculator-display-value');
        const expressionEl = this.element?.querySelector('.calculator-display-expression');
        
        if (displayEl) {
            displayEl.textContent = this.displayValue;
        }
        
        if (expressionEl) {
            expressionEl.textContent = this.formatExpression(this.expression);
        }
    }
    
    applyResult() {
        // Perform any pending calculation first
        if (!this.justCalculated && this.expression !== '') {
            this.performCalculation();
        }
        
        const value = parseFloat(this.displayValue);
        
        if (this.options.onResult && !isNaN(value)) {
            this.options.onResult(value);
        }
        
        this.close();
    }
    
    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }
    
    open() {
        if (this.isOpen) return;
        
        this.isOpen = true;
        this.clear();
        
        // Create and position dropdown
        this.render();
        
        // Position relative to trigger using fixed positioning
        const triggerRect = this.trigger.getBoundingClientRect();
        const calcWidth = 260; // Match CSS width
        
        // Calculate position
        let top = triggerRect.bottom + 8;
        let left = triggerRect.left;
        
        // Adjust if would go off right edge
        if (left + calcWidth > window.innerWidth - 16) {
            left = triggerRect.right - calcWidth;
        }
        
        // Adjust if would go off bottom
        if (top + 350 > window.innerHeight) {
            top = triggerRect.top - 350 - 8;
        }
        
        this.element.style.top = `${top}px`;
        this.element.style.left = `${left}px`;
        
        document.body.appendChild(this.element);
        
        // Event listeners
        document.addEventListener('click', this._boundHandleClickOutside);
        document.addEventListener('keydown', this._boundHandleKeydown);
    }
    
    close() {
        if (!this.isOpen) return;
        
        this.isOpen = false;
        
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
        
        document.removeEventListener('click', this._boundHandleClickOutside);
        document.removeEventListener('keydown', this._boundHandleKeydown);
    }
    
    handleClickOutside(e) {
        if (this.element && !this.element.contains(e.target) && !this.trigger.contains(e.target)) {
            this.close();
        }
    }
    
    handleKeydown(e) {
        if (!this.isOpen) return;
        
        // Handle keyboard input
        if (e.key >= '0' && e.key <= '9') {
            this.inputDigit(e.key);
            this.updateDisplay();
        } else if (e.key === '.') {
            this.inputDecimal();
            this.updateDisplay();
        } else if (['+', '-', '*', '/'].includes(e.key)) {
            this.inputOperator(e.key);
            this.updateDisplay();
        } else if (e.key === 'Enter' || e.key === '=') {
            e.preventDefault();
            this.performCalculation();
            this.updateDisplay();
        } else if (e.key === 'Escape') {
            this.close();
        } else if (e.key === 'Backspace') {
            this.backspace();
            this.updateDisplay();
        } else if (e.key === 'c' || e.key === 'C') {
            this.clear();
            this.updateDisplay();
        }
    }
    
    destroy() {
        this.close();
        if (this.trigger) {
            this.trigger.removeEventListener('click', this.toggle);
        }
    }
    
    /**
     * Get current calculator value
     */
    getValue() {
        return parseFloat(this.displayValue) || 0;
    }
    
    /**
     * Set calculator value
     */
    setValue(value) {
        this.expression = String(value);
        this.displayValue = String(value);
        this.updateDisplay();
    }
}
