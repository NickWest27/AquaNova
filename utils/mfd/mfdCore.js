// utils/mfd/mfdCore.js
// Multi-Function Display Overlay System for Aqua Nova
// Pure overlay system - doesn't control display content, only provides interaction

import gameStateInstance from '/game/state.js';

class MFDCore {
    constructor(containerId, keyboardUnit = null) {
        this.container = document.getElementById(containerId);
        this.keyboardUnit = keyboardUnit;
        this.currentPage = 'navigation';
        this.pages = new Map();
        this.softKeyLabels = Array(10).fill('');  // 10 keys: L1-L5, R1-R5
        this.softKeyActions = Array(10).fill(null);  // 10 keys: L1-L5, R1-R5
        
        // Overlay elements (not display content)
        this.overlayContainer = null;
        this.softKeyElements = [];
        
        // Event listeners for cleanup
        this.eventListeners = new Map();
        
        // Page state management
        this.pendingStateChange = false;
        this.lastPageState = null;
        this.pageState = new Map();
        
        // Change detection
        this.lastRenderState = null;
        this.needsRedraw = true;
        this.renderCount = 0;
        
        this.init();
    }

    async init() {
        if (!this.container) {
            console.error('MFD Overlay: Container not found');
            return;
        }

        this.createOverlayStructure();
        this.bindEvents();
        
        await this.loadPages();
        this.setActivePage('navigation');
        
        console.log('MFD Overlay initialized');
    }

    createOverlayStructure() {
        // Create overlay container that doesn't interfere with existing content
        const overlay = document.createElement('div');
        overlay.className = 'mfd-overlay-container';
        overlay.innerHTML = `
            <!-- Left soft keys -->
            <div class="mfd-soft-keys mfd-left-keys">
                <button class="soft-key" data-key="L1" id="soft-key-L1"></button>
                <button class="soft-key" data-key="L2" id="soft-key-L2"></button>
                <button class="soft-key" data-key="L3" id="soft-key-L3"></button>
                <button class="soft-key" data-key="L4" id="soft-key-L4"></button>
                <button class="soft-key" data-key="L5" id="soft-key-L5"></button>
            </div>
            
            <!-- Right soft keys -->
            <div class="mfd-soft-keys mfd-right-keys">
                <button class="soft-key" data-key="R1" id="soft-key-R1"></button>
                <button class="soft-key" data-key="R2" id="soft-key-R2"></button>
                <button class="soft-key" data-key="R3" id="soft-key-R3"></button>
                <button class="soft-key" data-key="R4" id="soft-key-R4"></button>
                <button class="soft-key" data-key="R5" id="soft-key-R5"></button>
            </div>
            
            <!-- Page indicator -->
            <div class="mfd-page-indicator" id="mfd-page-indicator">NAV</div>
            
            <!-- Status indicator -->
            <div class="mfd-status-bar">
                <div class="mfd-status-item online" id="mfd-status">MFD</div>
            </div>
        `;

        // Append overlay to container (doesn't replace existing content)
        this.container.appendChild(overlay);
        this.overlayContainer = overlay;
        
        // Get references to overlay elements
        this.softKeyElements = overlay.querySelectorAll('.soft-key');
    }

    bindEvents() {
        // Bind soft key events
        this.softKeyElements.forEach(key => {
            this.addEventListenerWithCleanup(key, 'click', (e) => {
                this.handleSoftKey(e.target.dataset.key);
            });
        });

        // Handle container resize
        this.addEventListenerWithCleanup(window, 'resize', () => {
            this.updateOverlayPositions();
        });

        // Game state change detection
        gameStateInstance.addObserver(() => {
            this.pendingStateChange = true;
        });

        // Listen for keyboard unit data
        if (this.keyboardUnit) {
            this.addEventListenerWithCleanup(document, 'keyboard-data-sent', (e) => {
                this.handleKeyboardInput(e.detail);
            });
        }
    }

    // Update overlay positioning (called on resize)
    updateOverlayPositions() {
        // Overlay positions are handled by CSS, but trigger any needed recalculations
        console.log('MFD Overlay positions updated');
    }

    // Check if overlay needs updating
    needsUpdate() {
        return this.needsRedraw || this.hasStateChanged();
    }

    // State change detection
    hasStateChanged() {
        const gameStateChanged = this.pendingStateChange;
        const currentPageState = JSON.stringify(this.getPageState());
        const pageStateChanged = this.lastPageState !== currentPageState;
        
        return gameStateChanged || pageStateChanged;
    }

    // Update render state
    updateLastRenderState() {
        this.pendingStateChange = false;
        this.lastPageState = JSON.stringify(this.getPageState());
    }

    // Force overlay redraw
    forceRedraw() {
        this.needsRedraw = true;
        this.updateOverlay(true);
    }

    // Update overlay display (soft keys, indicators, etc.)
    updateOverlay(forceUpdate = false) {
        if (!forceUpdate && !this.needsUpdate()) {
            return;
        }

        // Update soft key labels and states
        this.updateSoftKeyLabels();
        
        // Update page indicator
        const indicator = this.overlayContainer.querySelector('#mfd-page-indicator');
        if (indicator) {
            indicator.textContent = this.currentPage.toUpperCase();
        }

        this.updateLastRenderState();
        this.needsRedraw = false;
        this.renderCount++;
        
        console.log(`MFD Overlay updated #${this.renderCount}`);
    }

    // Page Management
    registerPage(pageId, pageClass) {
        this.pages.set(pageId, pageClass);
        this.pageState.set(pageId, {});
        console.log(`MFD Page registered: ${pageId}`);
    }

    setActivePage(pageId) {
        if (!this.pages.has(pageId)) {
            console.error(`MFD Page not found: ${pageId}`);
            return;
        }

        this.currentPage = pageId;
        
        // Initialize page if needed
        const pageClass = this.pages.get(pageId);
        if (typeof pageClass.init === 'function') {
            pageClass.init(this);
        }

        // Setup soft keys for this page
        this.setupPageSoftKeys(pageId);
        
        // Force overlay update
        this.needsRedraw = true;
        this.updateOverlay(true);
        
        console.log(`MFD Active page: ${pageId}`);
    }

    setupPageSoftKeys(pageId) {
        const pageClass = this.pages.get(pageId);
        if (!pageClass || typeof pageClass.getSoftKeys !== 'function') {
            this.softKeyLabels.fill('');
            this.softKeyActions.fill(null);
        } else {
            const softKeyConfig = pageClass.getSoftKeys(this);
            this.softKeyLabels = [...softKeyConfig.labels];
            this.softKeyActions = [...softKeyConfig.actions];
        }

        this.updateSoftKeyLabels();
    }

    updateSoftKeyLabels() {
        this.softKeyElements.forEach((element, index) => {
            const label = this.softKeyLabels[index] || '';
            element.textContent = label;
            element.style.visibility = label ? 'visible' : 'hidden';
            
            if (label) {
                element.classList.add('active');
            } else {
                element.classList.remove('active');
            }
        });
    }

    handleSoftKey(keyId) {
        const keyMap = {
            'L1': 0, 'L2': 1, 'L3': 2, 'L4': 3, 'L5': 4, 
            'R1': 5, 'R2': 6, 'R3': 7, 'R4': 8, 'R5': 9
        };

        const index = keyMap[keyId];
        if (index === undefined) return;

        const action = this.softKeyActions[index];
        if (!action) return;

        console.log(`MFD Soft key pressed: ${keyId} (${this.softKeyLabels[index]})`);

        this.flashSoftKey(keyId);

        if (typeof action === 'function') {
            action(this);
        } else if (typeof action === 'string') {
            this.handleStringAction(action);
        }
    }

    handleStringAction(action) {
        switch (action) {
            case 'page:navigation':
                this.setActivePage('navigation');
                break;
            case 'page:engineering':
                this.setActivePage('engineering');
                break;
            case 'page:communications':
                this.setActivePage('communications');
                break;
            case 'page:sensors':
                this.setActivePage('sensors');
                break;
            default:
                console.warn(`Unknown MFD action: ${action}`);
        }
    }

    flashSoftKey(keyId) {
        const element = document.getElementById(`soft-key-${keyId}`);
        if (element) {
            element.classList.add('pressed');
            setTimeout(() => {
                element.classList.remove('pressed');
            }, 150);
        }
    }

    // Keyboard Input Handling
    handleKeyboardInput(data) {
        const pageClass = this.pages.get(this.currentPage);
        if (pageClass && typeof pageClass.handleKeyboardInput === 'function') {
            pageClass.handleKeyboardInput(this, data);
        } else {
            console.log(`MFD: No keyboard handler for page ${this.currentPage}`, data);
        }
    }

    // Page State Management
    getPageState(pageId = null) {
        const targetPage = pageId || this.currentPage;
        return this.pageState.get(targetPage) || {};
    }

    setPageState(newState, pageId = null) {
        const targetPage = pageId || this.currentPage;
        const currentState = this.pageState.get(targetPage) || {};
        this.pageState.set(targetPage, { ...currentState, ...newState });
        
        this.needsRedraw = true;
    }

    // Utility Methods
    requestKeyboardInput(prompt, context, maxLength = 20) {
        if (this.keyboardUnit) {
            this.keyboardUnit.requestInput(prompt, context, maxLength);
        } else {
            console.warn('MFD: No keyboard unit available for input');
        }
    }

    // Get display elements (canvas/svg) from container
    getDisplayCanvas() {
        return this.container.querySelector('canvas');
    }

    getDisplaySVG() {
        return this.container.querySelector('svg');
    }

    getCurrentPage() {
        return this.currentPage;
    }

    // Load default pages
    async loadPages() {
        try {
            const { default: NavigationPage } = await import('./pages/navigationPage.js');
            this.registerPage('navigation', NavigationPage);
            
            console.log('MFD: Default pages loaded');
        } catch (error) {
            console.error('MFD: Failed to load pages:', error);
        }
    }

    // Event listener management
    addEventListenerWithCleanup(element, event, handler) {
        if (!element) return;
        
        const key = `${element.id || Math.random()}-${event}`;
        
        if (this.eventListeners.has(key)) {
            const oldHandler = this.eventListeners.get(key);
            element.removeEventListener(event, oldHandler);
        }
        
        element.addEventListener(event, handler);
        this.eventListeners.set(key, handler);
    }

    // Cleanup
    destroy() {
        this.eventListeners.forEach((handler, key) => {
            const [elementId, event] = key.split('-');
            const element = document.getElementById(elementId);
            if (element) {
                element.removeEventListener(event, handler);
            }
        });
        this.eventListeners.clear();
        
        // Remove overlay from container
        if (this.overlayContainer && this.overlayContainer.parentNode) {
            this.overlayContainer.parentNode.removeChild(this.overlayContainer);
        }
        
        console.log('MFD Overlay destroyed');
    }

    // Debug methods
    getStatus() {
        return {
            currentPage: this.currentPage,
            availablePages: Array.from(this.pages.keys()),
            softKeyLabels: this.softKeyLabels,
            renderCount: this.renderCount,
            needsRedraw: this.needsRedraw,
            overlayActive: !!this.overlayContainer
        };
    }
}

export default MFDCore;