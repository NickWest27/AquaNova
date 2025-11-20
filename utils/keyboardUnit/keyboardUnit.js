// utils/keyboardUnit/keyboardUnit.js
// Self-contained input device with scratchpad display
// Future enhancments: Press caps lock to grab from physical keyboard

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
                    <div class="scratchpad-display" id="scratchpad-display">
                        <span class="prompt-text" id="prompt-text"></span>
                        <span class="input-text" id="input-text"></span>
                        <span class="cursor" id="cursor">_</span>
                    </div>
                </div>
                
                <div class="keyboard-section">
                    <!-- Main alpha keyboard -->
                    <div class="keyboard-main">
                        <div class="key-row">
                            ${this.createKeyRow(['Q','W','E','R','T','Y','U','I','O','P','DEL'])}
                        </div>
                        <div class="key-row">
                            ${this.createKeyRow(['A','S','D','F','G','H','J','K','L','ENTER'])}
                        </div>
                        <div class="key-row">
                            ${this.createKeyRow(['','Z','X','C','V','B','N','M','CLR','',''])}
                        </div>
                        <!-- Space bar row (single key, styled wide) -->
                        <div class="key-row special-row">
                            ${this.createKeyRow(['','SPACE',''])}
                        </div>
                    </div>

                    <!-- Arrow cluster, to the left of the numpad -->
                    <div class="keyboard-arrows">
                        <div class="key-row arrow-row arrow-spacer">
                            <!-- Empty row for spacing -->
                        </div>
                        <div class="key-row arrow-row">
                            ${this.createKeyRow(['', 'ARROW_UP', ''])}
                        </div>
                        <div class="key-row arrow-row">
                            ${this.createKeyRow(['ARROW_LEFT','ARROW_DOWN','ARROW_RIGHT'])}
                        </div>
                        <div class="key-row arrow-row arrow-spacer">
                            <!-- Empty row for spacing -->
                        </div>
                    </div>

                    <!-- Numeric keypad (0-9 and decimal, plus sign toggle) -->
                    <div class="keyboard-numpad">
                        <div class="key-row">
                            ${this.createKeyRow(['7','8','9'])}
                        </div>
                        <div class="key-row">
                            ${this.createKeyRow(['4','5','6'])}
                        </div>
                        <div class="key-row">
                            ${this.createKeyRow(['1','2','3'])}
                        </div>
                        <div class="key-row">
                            ${this.createKeyRow(['0','.','SIGN'])}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    createKeyRow(keys) {
        return keys
            .filter(key => key != null)   // Only filter out null/undefined, keep empty strings
            .map(key => {
                if (key === '') {
                    // Create an invisible spacer that takes up space
                    return `<div class="kbd-key kbd-spacer" style="visibility: hidden; pointer-events: none;"></div>`;
                }
                return `
                    <button class="kbd-key ${this.getKeyClass(key)}" 
                            data-key="${key}" 
                            title="${this.getKeyTitle(key)}">
                        ${this.getKeyLabel(key)}
                    </button>
                `;
            })
            .join('');
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
        if (!key) return '';

        if (/^F[0-9]{1,2}$/.test(key)) return 'function-key';
        if (['ARROW_UP','ARROW_DOWN','ARROW_LEFT','ARROW_RIGHT'].includes(key)) return 'arrow-key';

        if (/^[A-Z]$/.test(key)) return 'alpha-key';
        if (/^[0-9]$/.test(key)) return 'num-key';

        if (key === 'SPACE') return 'special-key space-key';
        if (key === 'ENTER') return 'special-key enter-key';

        if (['DEL', 'CLR', 'SIGN', '.', '+', '-'].includes(key)) {
            return 'special-key';
        }

        return 'special-key';
    }

    getKeyLabel(key) {
        const labels = {
            'SPACE': 'SPACE',
            'DEL': 'DEL',
            'CLR': 'CLR',
            'ARROW_UP': '↑',
            'ARROW_DOWN': '↓',
            'ARROW_LEFT': '←',
            'ARROW_RIGHT': '→',
            'SIGN': '+/-',
            'ENTER': 'ENT'
        };
        return labels[key] || key;
    }

    getKeyTitle(key) {
        const titles = {
            'SPACE': 'Space',
            'DEL': 'Delete Last Character',
            'CLR': 'Clear All Input',
            'ARROW_UP': 'Cursor Up / Option Up',
            'ARROW_DOWN': 'Cursor Down / Option Down',
            'ARROW_LEFT': 'Cursor Left / Option Left',
            'ARROW_RIGHT': 'Cursor Right / Option Right',
            'SIGN': 'Toggle sign (+/-)',
            'ENTER': 'Send data'
        };

        if (/^F[0-9]{1,2}$/.test(key)) {
            return `Function Key ${key}`;
        }

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
        if (!this.isActive && !this.isGlobalKey(key)) return;

        // Visual feedback
        this.flashKey(key);

        switch (key) {
            case 'DEL':
                this.deleteLastCharacter();
                break;
            case 'CLR':
                this.clearInput();
                break;
            case 'SPACE':
                this.addCharacter(' ');
                break;
            case 'ENTER':
                this.processEnter();
                break;
            case 'SIGN':
                this.toggleSign();
                break;
            case 'ARROW_UP':
            case 'ARROW_DOWN':
            case 'ARROW_LEFT':
            case 'ARROW_RIGHT':
                this.sendNavigationKey(key);
                break;
            default:
                if (/^F[0-9]{1,2}$/.test(key)) {
                    this.sendFunctionKey(key);
                } else {
                    this.addCharacter(key);
                }
        }

        this.updateScratchpadDisplay();
    }

    handlePhysicalKeyboard(e) {
        // Map physical keyboard to unit keys
        const keyMap = {
            'Backspace': 'DEL',
            'Delete': 'CLR',
            'Enter': 'ENTER',
            ' ': 'SPACE',
            '.': '.',
            '-': '-',
            '+': '+',
            '=': '=',
            'ArrowUp': 'ARROW_UP',
            'ArrowDown': 'ARROW_DOWN',
            'ArrowLeft': 'ARROW_LEFT',
            'ArrowRight': 'ARROW_RIGHT',
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

    toggleSign() {
        if (this.scratchpadContent.startsWith('-')) {
            this.scratchpadContent = this.scratchpadContent.slice(1);
        } else {
            this.scratchpadContent = '-' + this.scratchpadContent;
        }
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

    sendFunctionKey(key) {
        const data = {
            key,
            context: this.currentContext,
            timestamp: new Date().toISOString()
        };

        const event = new CustomEvent('keyboard-function-pressed', {
            detail: data
        });
        document.dispatchEvent(event);
        this.flashDataLink();
    }

    sendNavigationKey(key) {
        const data = {
            key,
            context: this.currentContext,
            timestamp: new Date().toISOString()
        };

        const event = new CustomEvent('keyboard-nav-pressed', {
            detail: data
        });
        document.dispatchEvent(event);
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

    isGlobalKey(key) {
        return (
            /^F[0-9]{1,2}$/.test(key) ||
            ['ARROW_UP','ARROW_DOWN','ARROW_LEFT','ARROW_RIGHT'].includes(key)
        );
    }
}

// Export for use in other modules
export default KeyboardUnit;