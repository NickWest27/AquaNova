// utils/keyboardUnit/keyboardUnit.js
// Apache-style Keyboard Unit for Aqua Nova
// Self-contained input device with scratchpad display

class KeyboardUnit {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.scratchpadContent = '';
        this.currentPrompt = '';
        this.maxInputLength = 20;
        this.isActive = false;
        this.currentContext = null; // What system requested input
        
        // Event listeners for cleanup
        this.eventListeners = new Map();
        
        // Initialize the keyboard unit
        this.init();
    }

    init() {
        if (!this.container) {
            console.error('Keyboard Unit: Container not found');
            return;
        }

        this.createKeyboardStructure();
        this.bindEvents();
        this.updateScratchpadDisplay();
        
        console.log('Keyboard Unit initialized');
    }

    createKeyboardStructure() {
        this.container.innerHTML = `
            <div class="keyboard-unit">
                <div class="scratchpad-section">
                    <div class="scratchpad-label">SCRATCHPAD</div>
                    <div class="scratchpad-display" id="scratchpad-display">
                        <span class="prompt-text" id="prompt-text"></span>
                        <span class="input-text" id="input-text"></span>
                        <span class="cursor" id="cursor">_</span>
                    </div>
                </div>
                
                <div class="keyboard-section">
                    <div class="key-row">
                        ${this.createKeyRow(['A','B','C','D','E','F','G','H','I','J'])}
                    </div>
                    <div class="key-row">
                        ${this.createKeyRow(['K','L','M','N','O','P','Q','R','S','T'])}
                    </div>
                    <div class="key-row">
                        ${this.createKeyRow(['U','V','W','X','Y','Z','SP','DEL','CLR','/'])}
                    </div>
                    <div class="key-row">
                        ${this.createKeyRow(['1','2','3','4','5','6','7','8','9','0'])}
                    </div>
                    <div class="key-row special-row">
                        ${this.createSpecialKeys()}
                    </div>
                </div>
                
                <div class="status-section">
                    <div class="unit-status" id="unit-status">READY</div>
                    <div class="data-link" id="data-link">DATA LINK: ONLINE</div>
                </div>
            </div>
        `;
    }

    createKeyRow(keys) {
        return keys.map(key => `
            <button class="kbd-key ${this.getKeyClass(key)}" 
                    data-key="${key}" 
                    title="${this.getKeyTitle(key)}">
                ${this.getKeyLabel(key)}
            </button>
        `).join('');
    }

    createSpecialKeys() {
        return `
            <button class="kbd-key special-key" data-key="." title="Decimal Point">.</button>
            <button class="kbd-key special-key" data-key="-" title="Minus/Negative">−</button>
            <button class="kbd-key special-key" data-key="+" title="Plus/Positive">+</button>
            <button class="kbd-key enter-key" data-key="ENTER" title="Send Data">ENTER</button>
        `;
    }

    getKeyClass(key) {
        if (/^[A-Z]$/.test(key)) return 'alpha-key';
        if (/^[0-9]$/.test(key)) return 'num-key';
        if (['SP', 'DEL', 'CLR', '/'].includes(key)) return 'function-key';
        return 'special-key';
    }

    getKeyLabel(key) {
        const labels = {
            'SP': 'SP',
            'DEL': 'DEL',
            'CLR': 'CLR'
        };
        return labels[key] || key;
    }

    getKeyTitle(key) {
        const titles = {
            'SP': 'Space',
            'DEL': 'Delete Last Character',
            'CLR': 'Clear All Input',
            '/': 'Forward Slash'
        };
        return titles[key] || key;
    }

    bindEvents() {
        // Bind keyboard key events
        const keys = this.container.querySelectorAll('.kbd-key');
        keys.forEach(key => {
            this.addEventListenerWithCleanup(key, 'click', (e) => {
                this.handleKeyPress(e.target.dataset.key);
            });
        });

        // Bind physical keyboard events
        this.addEventListenerWithCleanup(document, 'keydown', (e) => {
            if (this.isActive) {
                this.handlePhysicalKeyboard(e);
            }
        });

        // Start cursor blinking
        this.startCursorBlink();
    }

    handleKeyPress(key) {
        if (!this.isActive) return;

        // Visual feedback
        this.flashKey(key);

        switch (key) {
            case 'DEL':
                this.deleteLastCharacter();
                break;
            case 'CLR':
                this.clearInput();
                break;
            case 'SP':
                this.addCharacter(' ');
                break;
            case 'ENTER':
                this.processEnter();
                break;
            default:
                this.addCharacter(key);
        }

        this.updateScratchpadDisplay();
    }

    handlePhysicalKeyboard(e) {
        // Map physical keyboard to unit keys
        const keyMap = {
            'Backspace': 'DEL',
            'Delete': 'CLR',
            'Enter': 'ENTER',
            ' ': 'SP',
            '/': '/',
            '.': '.',
            '-': '-',
            '+': '+'
        };

        let mappedKey = keyMap[e.key];
        
        if (!mappedKey) {
            // Handle alphanumeric keys
            if (/^[a-zA-Z0-9]$/.test(e.key)) {
                mappedKey = e.key.toUpperCase();
            } else {
                return; // Ignore unmapped keys
            }
        }

        e.preventDefault();
        this.handleKeyPress(mappedKey);
    }

    addCharacter(char) {
        if (this.scratchpadContent.length >= this.maxInputLength) {
            this.showError('INPUT TOO LONG');
            return;
        }

        this.scratchpadContent += char;
    }

    deleteLastCharacter() {
        if (this.scratchpadContent.length > 0) {
            this.scratchpadContent = this.scratchpadContent.slice(0, -1);
        }
    }

    clearInput() {
        this.scratchpadContent = '';
    }

    processEnter() {
        if (!this.currentPrompt) {
            this.showError('NO ACTIVE PROMPT');
            return;
        }

        if (this.scratchpadContent.trim() === '') {
            this.showError('NO DATA TO SEND');
            return;
        }

        // Send data to connected system
        this.sendData();
        
        // Clear input after successful send
        this.clearInput();
        this.currentPrompt = '';
        this.currentContext = null;
        this.isActive = false;
        
        this.updateScratchpadDisplay();
        this.updateStatus('DATA SENT');
        
        // Return to ready state after a moment
        setTimeout(() => {
            this.updateStatus('READY');
        }, 2000);
    }

    sendData() {
        const data = {
            prompt: this.currentPrompt,
            input: this.scratchpadContent.trim(),
            context: this.currentContext,
            timestamp: new Date().toISOString()
        };

        console.log('Keyboard Unit sending data:', data);

        // Dispatch custom event for data transmission
        const event = new CustomEvent('keyboard-data-sent', {
            detail: data
        });
        document.dispatchEvent(event);

        // Flash data link indicator
        this.flashDataLink();
    }

    // Public API methods for external systems
    requestInput(prompt, context = null, maxLength = 20) {
        this.currentPrompt = prompt;
        this.currentContext = context;
        this.maxInputLength = maxLength;
        this.isActive = true;
        this.scratchpadContent = '';
        
        this.updateScratchpadDisplay();
        this.updateStatus('INPUT REQUESTED');
        
        console.log(`Keyboard Unit: Input requested - ${prompt}`);
    }

    setPrompt(prompt, preserveInput = false) {
        this.currentPrompt = prompt;
        if (!preserveInput) {
            this.scratchpadContent = '';
        }
        this.updateScratchpadDisplay();
    }

    cancelInput() {
        this.currentPrompt = '';
        this.currentContext = null;
        this.scratchpadContent = '';
        this.isActive = false;
        this.updateScratchpadDisplay();
        this.updateStatus('INPUT CANCELLED');
        
        setTimeout(() => {
            this.updateStatus('READY');
        }, 2000);
    }

    // Display update methods
    updateScratchpadDisplay() {
        const promptEl = document.getElementById('prompt-text');
        const inputEl = document.getElementById('input-text');
        const cursorEl = document.getElementById('cursor');

        if (promptEl) promptEl.textContent = this.currentPrompt;
        if (inputEl) inputEl.textContent = this.scratchpadContent;
        
        // Show/hide cursor based on active state
        if (cursorEl) {
            cursorEl.style.display = this.isActive ? 'inline' : 'none';
        }
    }

    updateStatus(status) {
        const statusEl = document.getElementById('unit-status');
        if (statusEl) {
            statusEl.textContent = status;
            statusEl.className = `unit-status ${status.toLowerCase().replace(' ', '-')}`;
        }
    }

    showError(message) {
        this.updateStatus(`ERROR: ${message}`);
        this.flashError();
        
        setTimeout(() => {
            this.updateStatus(this.isActive ? 'INPUT REQUESTED' : 'READY');
        }, 2000);
    }

    // Visual feedback methods
    flashKey(key) {
        const keyElement = this.container.querySelector(`[data-key="${key}"]`);
        if (keyElement) {
            keyElement.classList.add('key-pressed');
            setTimeout(() => {
                keyElement.classList.remove('key-pressed');
            }, 150);
        }
    }

    flashDataLink() {
        const dataLinkEl = document.getElementById('data-link');
        if (dataLinkEl) {
            dataLinkEl.classList.add('transmitting');
            setTimeout(() => {
                dataLinkEl.classList.remove('transmitting');
            }, 1000);
        }
    }

    flashError() {
        const scratchpadEl = document.getElementById('scratchpad-display');
        if (scratchpadEl) {
            scratchpadEl.classList.add('error-flash');
            setTimeout(() => {
                scratchpadEl.classList.remove('error-flash');
            }, 500);
        }
    }

    startCursorBlink() {
        setInterval(() => {
            const cursorEl = document.getElementById('cursor');
            if (cursorEl && this.isActive) {
                cursorEl.style.visibility = 
                    cursorEl.style.visibility === 'hidden' ? 'visible' : 'hidden';
            }
        }, 500);
    }

    // Event listener management
    addEventListenerWithCleanup(element, event, handler) {
        if (!element) return;
        
        const key = `${element.id || Math.random()}-${event}`;
        
        // Remove existing listener if present
        if (this.eventListeners.has(key)) {
            const oldHandler = this.eventListeners.get(key);
            element.removeEventListener(event, oldHandler);
        }
        
        // Add new listener
        element.addEventListener(event, handler);
        this.eventListeners.set(key, handler);
    }

    // Cleanup method
    destroy() {
        // Remove all event listeners
        this.eventListeners.forEach((handler, key) => {
            const [elementId, event] = key.split('-');
            const element = document.getElementById(elementId);
            if (element) {
                element.removeEventListener(event, handler);
            }
        });
        this.eventListeners.clear();
        
        console.log('Keyboard Unit destroyed');
    }

    // Debug methods
    getStatus() {
        return {
            isActive: this.isActive,
            currentPrompt: this.currentPrompt,
            scratchpadContent: this.scratchpadContent,
            currentContext: this.currentContext
        };
    }
}

// Export for use in other modules
export default KeyboardUnit;