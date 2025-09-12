// utils/mfd/mfdCore.js
// Multi-Function Display Core System for Aqua Nova
// Handles display area, soft keys, page management
// NOW WITH CHANGE DETECTION to prevent constant redrawing

import { drawNavigationDisplay } from '/game/systems/navComputer/navComputer.js';
import gameStateInstance from '/game/state.js';

class MFDCore {
    constructor(containerId, keyboardUnit = null) {
        this.container = document.getElementById(containerId);
        this.keyboardUnit = keyboardUnit;
        this.currentPage = 'navigation';
        this.pages = new Map();
        this.softKeyLabels = Array(8).fill('');
        this.softKeyActions = Array(8).fill(null);
        
        // Display elements
        this.displayCanvas = null;
        this.displaySVG = null;
        this.softKeyElements = [];
        
        // Event listeners for cleanup
        this.eventListeners = new Map();
        
        // Page state and data
        // Push-based change detection
        this.pendingStateChange = false;
        this.lastPageState = null;
        this.pageState = new Map();
        this.displayData = {};
        
        // ADDED: Change detection for preventing unnecessary redraws
        this.lastRenderState = null;
        this.needsRedraw = true; // Force initial draw
        this.renderCount = 0; // Debug counter
        
        this.init();
    }

    async init() {
        if (!this.container) {
            console.error('MFD Core: Container not found');
            return;
        }

        this.createMFDStructure();
        this.bindEvents();
        
        // FIXED: Await the page loading before setting active page
        await this.loadPages();
        this.setActivePage('navigation');
        
        console.log('MFD Core initialized');
    }

    createMFDStructure() {
        this.container.innerHTML = `
            <div class="mfd-display-container">
                <!-- left soft keys -->
                <div class="soft-keys top-keys">
                    <button class="soft-key" data-key="L1" id="soft-key-L1"></button>
                    <button class="soft-key" data-key="L2" id="soft-key-L2"></button>
                    <button class="soft-key" data-key="L3" id="soft-key-L3"></button>
                    <button class="soft-key" data-key="L4" id="soft-key-L4"></button>
                </div>
                
                <!-- Main display area -->
                <div class="mfd-display-area" id="mfd-display-area">
                    <canvas id="mfd-canvas"></canvas>
                    <svg id="mfd-overlay"></svg>
                    
                    <!-- Page indicator -->
                    <div class="page-indicator" id="page-indicator">NAV</div>
                </div>
                
                <!-- Bottom soft keys -->
                <div class="soft-keys bottom-keys">
                    <button class="soft-key" data-key="R1" id="soft-key-R1"></button>
                    <button class="soft-key" data-key="R2" id="soft-key-R2"></button>
                    <button class="soft-key" data-key="R3" id="soft-key-R3"></button>
                    <button class="soft-key" data-key="R4" id="soft-key-R4"></button>
                </div>
            </div>
        `;

        // Get references to display elements
        this.displayCanvas = document.getElementById('mfd-canvas');
        this.displaySVG = document.getElementById('mfd-overlay');
        this.softKeyElements = this.container.querySelectorAll('.soft-key');

        // Set up display canvas
        this.resizeDisplay();
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
            this.resizeDisplay();
        });

        // Push-based: game state tells MFD when it changes
        gameStateInstance.addObserver(() => {
            this.pendingStateChange = true; // Set flag, don't pull data
            // Animation loop will handle the actual update
        });

        // Listen for keyboard unit data
        if (this.keyboardUnit) {
            this.addEventListenerWithCleanup(document, 'keyboard-data-sent', (e) => {
                this.handleKeyboardInput(e.detail);
            });
        }
    }

    // MODIFIED: Add change detection to updateDisplay
    updateDisplay(forceRedraw = false) {
        if (!this.displayCanvas || !this.displaySVG) return;
        
        if (!forceRedraw && !this.needsRedraw && !this.hasStateChanged()) {
            return;
        }
        
        // Pull current values only when actually rendering
        const currentGameState = {
            range: gameStateInstance.getProperty("displaySettings.navDisplayRange") || 10,
            course: gameStateInstance.getProperty("navigation.course") || 0,
            heading: gameStateInstance.getProperty("navigation.heading") || 0
        };
        
        // Pass current state to page renderer
        const pageClass = this.pages.get(this.currentPage);
        if (pageClass && typeof pageClass.render === 'function') {
            pageClass.render(this, currentGameState);
            this.updateLastRenderState();
            this.needsRedraw = false;
        }

        this.renderCount++;
        console.log(`MFD Render #${this.renderCount} - State changed or forced redraw`);
    }

    // Simplified change detection
    hasStateChanged() {
        // Check if game state pushed a change
        const gameStateChanged = this.pendingStateChange;
        
        // Check if page-specific state changed
        const currentPageState = JSON.stringify(this.getPageState());
        const pageStateChanged = this.lastPageState !== currentPageState;
        
        return gameStateChanged || pageStateChanged;
    }

    // Update the render state
    updateLastRenderState() {
        this.pendingStateChange = false; // Clear the flag
        this.lastPageState = JSON.stringify(this.getPageState());
    }

    // ADDED: Public method to check if redraw is needed (for animation loop)
    needsUpdate() {
        return this.needsRedraw || this.hasStateChanged();
    }

    // ADDED: Public method to force redraw
    forceRedraw() {
        this.needsRedraw = true;
        this.updateDisplay(true);
    }

    resizeDisplay() {
        const displayArea = document.getElementById('mfd-display-area');
        const rect = displayArea.getBoundingClientRect();
        
        // Set canvas size to match display area
        this.displayCanvas.width = rect.width;
        this.displayCanvas.height = rect.height;
        
        // Update SVG dimensions
        this.displaySVG.setAttribute('width', rect.width);
        this.displaySVG.setAttribute('height', rect.height);
        
        console.log('MFD Display resized:', rect.width, 'x', rect.height);
        
        // MODIFIED: Force redraw on resize
        this.needsRedraw = true;
        this.updateDisplay(true);
    }

    // Page Management
    registerPage(pageId, pageClass) {
        this.pages.set(pageId, pageClass);
        this.pageState.set(pageId, {});
        console.log(`MFD Page registered: ${pageId}`);
    }

    // MODIFIED: Force redraw on page changes
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

        // Update page indicator
        const indicator = document.getElementById('page-indicator');
        if (indicator) {
            indicator.textContent = pageId.toUpperCase();
        }

        // Setup soft keys for this page
        this.setupPageSoftKeys(pageId);
        
        // MODIFIED: Force redraw on page change
        this.needsRedraw = true;
        this.updateDisplay(true);
        
        console.log(`MFD Active page: ${pageId}`);
    }

    setupPageSoftKeys(pageId) {
        const pageClass = this.pages.get(pageId);
        if (!pageClass || typeof pageClass.getSoftKeys !== 'function') {
            // Clear all soft keys
            this.softKeyLabels.fill('');
            this.softKeyActions.fill(null);
        } else {
            const softKeyConfig = pageClass.getSoftKeys(this);
            this.softKeyLabels = [...softKeyConfig.labels];
            this.softKeyActions = [...softKeyConfig.actions];
        }

        // Update soft key visual labels
        this.updateSoftKeyLabels();
    }

    updateSoftKeyLabels() {
        this.softKeyElements.forEach((element, index) => {
            const label = this.softKeyLabels[index] || '';
            element.textContent = label;
            element.style.visibility = label ? 'visible' : 'hidden';
            
            // Add/remove active class based on state
            if (label) {
                element.classList.add('active');
            } else {
                element.classList.remove('active');
            }
        });
    }

    handleSoftKey(keyId) {
        // Map key IDs to indices
        const keyMap = {
            'L1': 0, 'L2': 1, 'L3': 2, 'L4': 3,
            'R1': 4, 'R2': 5, 'R3': 6, 'R4': 7
        };

        const index = keyMap[keyId];
        if (index === undefined) return;

        const action = this.softKeyActions[index];
        if (!action) return;

        console.log(`MFD Soft key pressed: ${keyId} (${this.softKeyLabels[index]})`);

        // Visual feedback
        this.flashSoftKey(keyId);

        // Execute action
        if (typeof action === 'function') {
            action(this);
        } else if (typeof action === 'string') {
            this.handleStringAction(action);
        }
    }

    handleStringAction(action) {
        // Handle common string actions
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

    // MODIFIED: Force redraw on page state changes
    setPageState(newState, pageId = null) {
        const targetPage = pageId || this.currentPage;
        const currentState = this.pageState.get(targetPage) || {};
        this.pageState.set(targetPage, { ...currentState, ...newState });
        
        // ADDED: Mark for redraw when page state changes
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

    getDisplayCanvas() {
        return this.displayCanvas;
    }

    getDisplaySVG() {
        return this.displaySVG;
    }

    getCurrentPage() {
        return this.currentPage;
    }

    // Load default pages
    async loadPages() {
        try {
            // Import and register navigation page
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
        
        // Remove existing listener if present
        if (this.eventListeners.has(key)) {
            const oldHandler = this.eventListeners.get(key);
            element.removeEventListener(event, oldHandler);
        }
        
        // Add new listener
        element.addEventListener(event, handler);
        this.eventListeners.set(key, handler);
    }

    // Cleanup
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
        
        console.log('MFD Core destroyed');
    }

    // Debug methods
    getStatus() {
        return {
            currentPage: this.currentPage,
            availablePages: Array.from(this.pages.keys()),
            softKeyLabels: this.softKeyLabels,
            displaySize: {
                width: this.displayCanvas?.width || 0,
                height: this.displayCanvas?.height || 0
            },
            renderCount: this.renderCount,
            needsRedraw: this.needsRedraw,
            lastRenderState: this.lastRenderState
        };
    }
}

export default MFDCore;