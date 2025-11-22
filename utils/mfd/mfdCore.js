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
        this.softKeyLabels = Array(15).fill('');  // 15 keys: L1-L5, C1-C5, R1-R5
        this.softKeyActions = Array(15).fill(null);  // 15 keys: L1-L5, C1-C5, R1-R5
        this.softKeyStates = Array(15).fill(null);  // Button state metadata: {type: 'toggle'|'momentary', selected: boolean}

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

        // Store init promise for awaiting
        this.initPromise = this.init();
    }

    async init() {
        if (!this.container) {
            console.error('MFD Overlay: Container not found');
            return;
        }

        this.createOverlayStructure();
        this.bindEvents();

        await this.loadPages();

        // Don't set initial page here - let station manager control it
        // this.setActivePage('navigation');

        // console.log('MFD Overlay initialized');
    }

    createOverlayStructure() {
        // Create overlay container that doesn't interfere with existing content
        const overlay = document.createElement('div');
        overlay.className = 'mfd-overlay-container';
        overlay.innerHTML = `
            <!-- 3x5 Grid: Left column, Center column, Right column (5 rows each) -->
            <div class="mfd-button-grid">
                <button class="soft-key" data-key="L1" id="soft-key-L1"></button>
                <button class="soft-key" data-key="C1" id="soft-key-C1"></button>
                <button class="soft-key" data-key="R1" id="soft-key-R1"></button>

                <button class="soft-key" data-key="L2" id="soft-key-L2"></button>
                <button class="soft-key" data-key="C2" id="soft-key-C2"></button>
                <button class="soft-key" data-key="R2" id="soft-key-R2"></button>

                <button class="soft-key" data-key="L3" id="soft-key-L3"></button>
                <button class="soft-key" data-key="C3" id="soft-key-C3"></button>
                <button class="soft-key" data-key="R3" id="soft-key-R3"></button>

                <button class="soft-key" data-key="L4" id="soft-key-L4"></button>
                <button class="soft-key" data-key="C4" id="soft-key-C4"></button>
                <button class="soft-key" data-key="R4" id="soft-key-R4"></button>

                <button class="soft-key" data-key="L5" id="soft-key-L5"></button>
                <button class="soft-key" data-key="C5" id="soft-key-C5"></button>
                <button class="soft-key" data-key="R5" id="soft-key-R5"></button>
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
        // console.log('MFD Overlay positions updated');
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

        this.updateLastRenderState();
        this.needsRedraw = false;
        this.renderCount++;

        // Only log every 100 updates to reduce console spam
        // if (this.renderCount % 100 === 0) {
        //     console.log(`MFD Overlay updated #${this.renderCount}`);
        // }
    }

    // Page Management
    registerPage(pageId, pageClass) {
        this.pages.set(pageId, pageClass);
        this.pageState.set(pageId, {});
        // console.log(`MFD Page registered: ${pageId}`);
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
        
        // console.log(`MFD Active page: ${pageId}`);
    }

    setupPageSoftKeys(pageId) {
        const pageClass = this.pages.get(pageId);
        if (!pageClass || typeof pageClass.getSoftKeys !== 'function') {
            this.softKeyLabels.fill('');
            this.softKeyActions.fill(null);
            this.softKeyStates.fill(null);
        } else {
            const softKeyConfig = pageClass.getSoftKeys(this);
            this.softKeyLabels = [...softKeyConfig.labels];
            this.softKeyActions = [...softKeyConfig.actions];
            this.softKeyStates = softKeyConfig.states ? [...softKeyConfig.states] : Array(15).fill(null);
        }

        this.updateSoftKeyLabels();
    }

    updateSoftKeyLabels() {
        // Map labels from column-based indexing (L1-L5, C1-C5, R1-R5)
        // to DOM order (L1, C1, R1, L2, C2, R2, ...)
        const domOrderMapping = [
            0, 5, 10,   // Row 1: L1, C1, R1
            1, 6, 11,   // Row 2: L2, C2, R2
            2, 7, 12,   // Row 3: L3, C3, R3
            3, 8, 13,   // Row 4: L4, C4, R4
            4, 9, 14    // Row 5: L5, C5, R5
        ];

        this.softKeyElements.forEach((element, domIndex) => {
            const labelIndex = domOrderMapping[domIndex];
            const label = this.softKeyLabels[labelIndex] || '';
            const state = this.softKeyStates[labelIndex];

            element.textContent = label;
            element.style.visibility = label ? 'visible' : 'hidden';

            // Remove all state classes first
            element.classList.remove('selected', 'momentary', 'active');

            // Remove data attribute
            delete element.dataset.buttonType;

            // Apply button type and initial state
            if (state) {
                // Set data attribute for button type (used in click handler)
                element.dataset.buttonType = state.type;

                if (state.type === 'toggle') {
                    // Sync toggle button visual state with data state
                    if (state.selected) {
                        element.classList.add('selected');
                    }
                } else if (state.type === 'momentary') {
                    // Momentary buttons get the class for styling
                    element.classList.add('momentary');
                }
            }
        });
    }

    handleSoftKey(keyId) {
        const keyMap = {
            'L1': 0, 'L2': 1, 'L3': 2, 'L4': 3, 'L5': 4,
            'C1': 5, 'C2': 6, 'C3': 7, 'C4': 8, 'C5': 9,
            'R1': 10, 'R2': 11, 'R3': 12, 'R4': 13, 'R5': 14
        };

        const index = keyMap[keyId];
        if (index === undefined) {
            console.warn(`MFD: Unknown key ID: ${keyId}`);
            return;
        }

        const action = this.softKeyActions[index];
        if (!action) {
            // console.log(`MFD: No action for key ${keyId} (index ${index})`);
            return;
        }

        // Get button element for visual feedback
        const element = document.getElementById(`soft-key-${keyId}`);

        // Flash momentary buttons
        if (element.dataset.buttonType !== 'toggle') {
            this.flashSoftKey(keyId);
        }

        // Execute the action (this will update state)
        if (typeof action === 'function') {
            action(this);
        } else if (typeof action === 'string') {
            this.handleStringAction(action);
        }

        // Immediately regenerate soft keys to reflect new state
        // This ensures toggle buttons show their new state instantly
        this.setupPageSoftKeys(this.currentPage);
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
            // console.log(`MFD: No keyboard handler for page ${this.currentPage}`, data);
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

        // Display updates are handled by the animation loop calling stationManager.updateCenterDisplay()
        // We just need to set the needsRedraw flag so the next animation frame will update
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

            const { default: HelmPage } = await import('./pages/helmPage.js');
            this.registerPage('helm', HelmPage);

            const { default: EngineeringPage } = await import('./pages/engineeringPage.js');
            this.registerPage('engineering', EngineeringPage);

            const { default: CommunicationsPage } = await import('./pages/communicationsPage.js');
            this.registerPage('communications', CommunicationsPage);

            const { default: SensorsPage } = await import('./pages/sensorsPage.js');
            this.registerPage('sensors', SensorsPage);

            const { default: SciencePage } = await import('./pages/sciencePage.js');
            this.registerPage('science', SciencePage);

            // console.log('MFD: All pages loaded');
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
        
        // MFD system shutdown
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