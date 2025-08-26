// main.js - Bootstrap and splash screen functionality for Aqua Nova
// Updated version using SaveManager and proper logbook-based saves
import SaveManager from '../../../game/saveManager.js';
import GameState from '../../../game/state.js';
import { initPDAOverlay } from '../utils/pdaOverlay.js';
initPDAOverlay();


class SplashScreen {
    constructor() {
        this.saveManager = null;
        this.logbookData = null;
        this.gameState = null;
        this.eventListeners = new Map();
        this.initialized = false;
        this.currentMenu = 'main'; // Track current menu state
        this.bookshelfIndex = 0; // Track current logbook in browser
    }

    async initialize() {
        console.log('SplashScreen: Starting initialization');
        this.updateConsole('System initializing...');
        
        this.setGlobalScale();
        this.createBubbles();
        this.startBubbleGeneration();
        
        await this.initializeSaveManager();
        this.bindControls();
        
        console.log('SplashScreen: Initialization complete');
    }

    async initializeSaveManager() {
        try {
            this.updateConsole('Initializing save system...');
            
            // Initialize SaveManager - this handles loading localStorage + JSON files
            this.saveManager = new SaveManager();
            await this.saveManager.init();

            this.updateConsole('Searching for previous sessions...');
            
            // Check what we found and update the console and menu accordingly
            await this.analyzeSaveState();
            
        } catch (error) {
            console.error('Failed to initialize SaveManager:', error);
            this.updateConsole('Error: Failed to initialize save system');
            this.showError('Failed to initialize save system');
        }
    }

    async analyzeSaveState() {
        if (this.saveManager.requiresImport()) {
            this.updateConsole('No logbooks found - import required');
            this.updateMenuForNoLogbooks();
            return;
        }

        const bookshelf = this.saveManager.bookshelf || [];
        
        if (bookshelf.length === 0) {
            this.updateConsole('No logbooks available - import required');
            this.updateMenuForNoLogbooks();
            return;
        }

        const currentBook = this.saveManager.getCurrentBook();
        this.updateConsole(`${bookshelf.length} logbook(s) found`);

        if (!currentBook) {
            this.updateConsole('No active logbook selected');
            this.updateMenuForLogbookSelection();
            return;
        }

        // We have an active logbook
        this.logbookData = currentBook;
        const entryCount = this.logbookData.entries ? this.logbookData.entries.length : 0;
        
        this.updateConsole(`Loaded logbook: "${this.logbookData.name}" (${entryCount} entries)`);
        
        // Load the game state from the latest entry
        if (entryCount > 0) {
            const latestEntry = this.logbookData.entries[entryCount - 1];
            this.gameState = latestEntry.gameSnapshot;
            console.log('Using game state from latest logbook entry');
        } else {
            this.updateConsole('Warning: Active logbook has no entries');
        }

        this.updateDisplayWithGameState();
        this.updateMenuForActiveSession();
        
        this.initialized = true;
        
        // Auto-start after a moment, or show menu if user interaction is needed
        setTimeout(() => {
            this.updateConsole('Press ENTER to board or select menu option');
        }, 1000);
    }

    updateConsole(message) {
        const consoleElement = document.getElementById('console-text');
        if (consoleElement) {
            consoleElement.textContent = message;
            console.log('Console:', message);
        }
    }

    updateMenuForNoLogbooks() {
        const resumeBtn = document.getElementById('resume-campaign');
        const loadBtn = document.getElementById('load-campaign');
        const newBtn = document.getElementById('new-campaign');
        const statusEl = document.getElementById('logbook-status');

        if (resumeBtn) resumeBtn.disabled = true;
        if (loadBtn) loadBtn.disabled = true;
        if (newBtn) newBtn.disabled = true;
        
        if (statusEl) {
            statusEl.textContent = 'No logbooks found. Import a logbook file to begin.';
        }
    }

    updateMenuForLogbookSelection() {
        const resumeBtn = document.getElementById('resume-campaign');
        const loadBtn = document.getElementById('load-campaign');
        const newBtn = document.getElementById('new-campaign');
        const statusEl = document.getElementById('logbook-status');

        if (resumeBtn) resumeBtn.disabled = true;
        if (loadBtn) loadBtn.disabled = false;
        if (newBtn) newBtn.disabled = false;
        
        const bookCount = this.saveManager.bookshelf.length;
        if (statusEl) {
            statusEl.textContent = `Found ${bookCount} logbook(s). Select an option to continue.`;
        }
    }

    updateMenuForActiveSession() {
        const resumeBtn = document.getElementById('resume-campaign');
        const loadBtn = document.getElementById('load-campaign');
        const newBtn = document.getElementById('new-campaign');
        const statusEl = document.getElementById('logbook-status');

        if (resumeBtn) resumeBtn.disabled = false;
        if (loadBtn) loadBtn.disabled = false;
        if (newBtn) newBtn.disabled = false;
        
        if (statusEl && this.logbookData) {
            const entryCount = this.logbookData.entries ? this.logbookData.entries.length : 0;
            statusEl.textContent = `Active: "${this.logbookData.name}" - ${entryCount} entries`;
        }
    }

    showMenu() {
        // Menu is always visible now, no need to show/hide
        this.updateConsole('Menu ready for selection');
    }

    hideMenu() {
        // Menu is always visible now, no need to show/hide
    }

    setGlobalScale() {
        const baseWidth = 1920;
        const baseHeight = 1080;
        const scaleX = window.innerWidth / baseWidth;
        const scaleY = window.innerHeight / baseHeight;
        const scale = Math.min(scaleX, scaleY);
        document.documentElement.style.setProperty('--scale', scale);
        console.log(`Global scale set to: ${scale}`);
    }

    createBubble() {
        const bubble = document.createElement('div');
        bubble.className = 'bubble';
        
        const size = Math.random() * 15 + 5;
        bubble.style.width = size + 'px';
        bubble.style.height = size + 'px';
        bubble.style.left = Math.random() * 100 + '%';
        bubble.style.animationDuration = (Math.random() * 10 + 10) + 's';
        bubble.style.animationDelay = Math.random() * 5 + 's';
        
        document.getElementById('particles').appendChild(bubble);
        
        setTimeout(() => {
            if (bubble.parentNode) {
                bubble.remove();
            }
        }, 20000);
    }

    createBubbles() {
        for(let i = 0; i < 10; i++) {
            setTimeout(() => this.createBubble(), i * 200);
        }
    }

    startBubbleGeneration() {
        setInterval(() => this.createBubble(), 800);
    }

    bindControls() {
        // Main menu button handlers - initial bind
        this.bindMainMenuControls();
        
        // Import input handler
        const importInput = document.getElementById('logbook-import-input');
        if (importInput) {
            this.addEventListenerWithCleanup(importInput, 'change', (e) => this.handleImport(e));
        }

        // Keyboard controls
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                // Check if resume is available and use it
                if (this.currentMenu === 'main') {
                    const resumeBtn = document.getElementById('resume-campaign');
                    if (resumeBtn && !resumeBtn.disabled) {
                        this.resumeCampaign();
                    }
                }
            } else if (e.key === 'Escape') {
                // Return to main menu from any submenu
                if (this.currentMenu !== 'main') {
                    this.showMainMenu();
                }
            }
        });
        
        // Click anywhere for visual feedback
        document.addEventListener('click', (e) => {
            // Don't trigger on menu clicks
            if (e.target.closest('#main-menu')) return;
            
            // Visual feedback for console prompt
            const prompt = document.getElementById('console-info');
            if (prompt) {
                prompt.style.transform = 'scale(1.1)';
                setTimeout(() => {
                    prompt.style.transform = 'scale(1)';
                }, 200);
            }
        });
    }

    resumeCampaign() {
        if (!this.initialized) {
            this.showError('No session to resume');
            return;
        }
        
        this.updateConsole('Resuming from last known position...');
        this.startBoarding();
    }

    loadCampaign() {
        this.updateConsole('Opening logbook browser...');
        this.showLogbookBrowser();
    }

    showLogbookBrowser() {
        this.currentMenu = 'load';
        this.bookshelfIndex = 0;
        
        // Update menu title
        const menuTitle = document.querySelector('.menu-title');
        if (menuTitle) {
            menuTitle.innerHTML = 'Mission Control<br><span style="font-size: 0.8em; color: var(--text-gray);">Load Campaign</span>';
        }
        
        // Update menu content
        const menuButtons = document.querySelector('.menu-buttons');
        const menuInfo = document.querySelector('.menu-info');
        
        if (menuButtons) {
            menuButtons.innerHTML = `
                <div class="logbook-browser">
                    <div class="logbook-display-box" id="logbook-display-box">
                        <div class="logbook-metadata" id="logbook-metadata">
                            Loading...
                        </div>
                    </div>
                    <div class="logbook-controls">
                        <button id="logbook-prev" class="menu-btn browser-btn">◀ Previous</button>
                        <button id="logbook-load" class="menu-btn browser-btn">Load Campaign</button>
                        <button id="logbook-next" class="menu-btn browser-btn">Next ▶</button>
                    </div>
                    <button id="back-to-main" class="menu-btn browser-btn">◀ Back to Main Menu</button>
                </div>
            `;
        }
        
        // Bind new controls
        this.bindLogbookBrowserControls();
        this.updateLogbookDisplay();
    }

    bindLogbookBrowserControls() {
        const prevBtn = document.getElementById('logbook-prev');
        const nextBtn = document.getElementById('logbook-next');
        const loadBtn = document.getElementById('logbook-load');
        const backBtn = document.getElementById('back-to-main');

        if (prevBtn) {
            this.addEventListenerWithCleanup(prevBtn, 'click', () => {
                if (this.bookshelfIndex > 0) {
                    this.bookshelfIndex--;
                    this.updateLogbookDisplay();
                }
            });
        }

        if (nextBtn) {
            this.addEventListenerWithCleanup(nextBtn, 'click', () => {
                if (this.bookshelfIndex < this.saveManager.bookshelf.length - 1) {
                    this.bookshelfIndex++;
                    this.updateLogbookDisplay();
                }
            });
        }

        if (loadBtn) {
            this.addEventListenerWithCleanup(loadBtn, 'click', () => {
                this.loadSelectedLogbook();
            });
        }

        if (backBtn) {
            this.addEventListenerWithCleanup(backBtn, 'click', () => {
                this.showMainMenu();
            });
        }
    }

    updateLogbookDisplay() {
        const metadataEl = document.getElementById('logbook-metadata');
        const prevBtn = document.getElementById('logbook-prev');
        const nextBtn = document.getElementById('logbook-next');
        const loadBtn = document.getElementById('logbook-load');

        if (!this.saveManager.bookshelf || this.saveManager.bookshelf.length === 0) {
            if (metadataEl) {
                metadataEl.innerHTML = '<p style="color: var(--error-red);">No logbooks available</p>';
            }
            if (loadBtn) loadBtn.disabled = true;
            if (prevBtn) prevBtn.disabled = true;
            if (nextBtn) nextBtn.disabled = true;
            return;
        }

        const currentLogbook = this.saveManager.bookshelf[this.bookshelfIndex];
        const isActive = currentLogbook && currentLogbook.mounted;
        const entryCount = currentLogbook.entries ? currentLogbook.entries.length : 0;
        
        if (metadataEl && currentLogbook) {
            const lastPlayed = currentLogbook.lastModified ? 
                new Date(currentLogbook.lastModified).toLocaleString() : 
                'Never';
                
            metadataEl.innerHTML = `
                <div class="logbook-info">
                    <p><strong>Campaign:</strong> ${currentLogbook.name || 'Untitled'}</p>
                    <p><strong>Description:</strong> ${currentLogbook.description || `Mission log with ${entryCount} entries`}</p>
                    <p><strong>Last Played:</strong> ${lastPlayed}</p>
                    <p><strong>Status:</strong> <span style="color: ${isActive ? 'var(--success-green)' : 'var(--text-gray)'};">${isActive ? 'Active' : 'Inactive'}</span></p>
                    <p><strong>Entries:</strong> ${entryCount}</p>
                </div>
            `;
        }

        // Update button states
        if (prevBtn) prevBtn.disabled = this.bookshelfIndex <= 0;
        if (nextBtn) nextBtn.disabled = this.bookshelfIndex >= this.saveManager.bookshelf.length - 1;
        if (loadBtn) loadBtn.disabled = isActive;

        // Update status text
        this.updateConsole(`Browsing logbook ${this.bookshelfIndex + 1} of ${this.saveManager.bookshelf.length}`);
    }

    loadSelectedLogbook() {
        const selectedLogbook = this.saveManager.bookshelf[this.bookshelfIndex];
        if (!selectedLogbook) return;

        const confirmLoad = confirm(
            `Load "${selectedLogbook.name}"? This will replace your current session.`
        );
        
        if (confirmLoad) {
            this.updateConsole('Loading selected campaign...');
            
            try {
                const success = this.saveManager.mountLogbook(this.bookshelfIndex);
                if (success) {
                    this.updateConsole('Campaign loaded successfully');
                    // Reload to refresh with new data
                    setTimeout(() => window.location.reload(), 1000);
                } else {
                    this.showError('Failed to load campaign');
                }
            } catch (error) {
                console.error('Failed to load logbook:', error);
                this.showError('Failed to load campaign');
            }
        }
    }

    showMainMenu() {
        this.currentMenu = 'main';
        
        // Reset menu title
        const menuTitle = document.querySelector('.menu-title');
        if (menuTitle) {
            menuTitle.textContent = 'Mission Control';
        }
        
        // Restore main menu buttons
        const menuButtons = document.querySelector('.menu-buttons');
        if (menuButtons) {
            menuButtons.innerHTML = `
                <button id="resume-campaign" class="menu-btn" disabled>
                    <span class="btn-text">Resume Last Session</span>
                    <span class="btn-subtitle">Continue from last known position</span>
                </button>
                <button id="load-campaign" class="menu-btn" disabled>
                    <span class="btn-text">Load Campaign</span>
                    <span class="btn-subtitle">Select from available logbooks</span>
                </button>
                <button id="new-campaign" class="menu-btn" disabled>
                    <span class="btn-text">New Mission</span>
                    <span class="btn-subtitle">Start from mission briefing</span>
                </button>
                <button id="import-logbook" class="menu-btn">
                    <span class="btn-text">Import Logbook</span>
                    <span class="btn-subtitle">Load logbook from file</span>
                </button>
                <button id="settings" class="menu-btn">
                    <span class="btn-text">Settings</span>
                    <span class="btn-subtitle">Configure system preferences</span>
                </button>
            `;
        }
        
        // Re-bind main menu controls
        this.bindMainMenuControls();
        
        // Update menu state based on current save state
        if (this.initialized) {
            this.updateMenuForActiveSession();
        } else if (this.saveManager && this.saveManager.bookshelf.length > 0) {
            this.updateMenuForLogbookSelection();
        } else {
            this.updateMenuForNoLogbooks();
        }
        
        this.updateConsole('Returned to main menu');
    }

    bindMainMenuControls() {
        const resumeBtn = document.getElementById('resume-campaign');
        const loadBtn = document.getElementById('load-campaign');
        const newBtn = document.getElementById('new-campaign');
        const importBtn = document.getElementById('import-logbook');
        const settingsBtn = document.getElementById('settings');

        if (resumeBtn) {
            this.addEventListenerWithCleanup(resumeBtn, 'click', () => this.resumeCampaign());
        }

        if (loadBtn) {
            this.addEventListenerWithCleanup(loadBtn, 'click', () => this.loadCampaign());
        }

        if (newBtn) {
            this.addEventListenerWithCleanup(newBtn, 'click', () => this.newCampaign());
        }

        if (importBtn) {
            this.addEventListenerWithCleanup(importBtn, 'click', () => {
                const importInput = document.getElementById('logbook-import-input');
                if (importInput) importInput.click();
            });
        }

        if (settingsBtn) {
            this.addEventListenerWithCleanup(settingsBtn, 'click', () => this.showSettings());
        }
    }

    newCampaign() {
        // Remove the default logbook creation - require user to import
        this.showError('New mission creation not yet implemented. Please import a logbook to begin.');
    }

    createNewCampaign() {
        this.updateConsole('Initializing new mission...');
        
        // Reset to default state
        this.gameState = this.getDefaultBootState();
        this.logbookData = this.getDefaultLogbook();
        
        // Save the new state
        if (this.saveManager) {
            try {
                // Create a new logbook with default entry
                const newLogbook = {
                    name: `Mission Log - ${new Date().toLocaleDateString()}`,
                    created: new Date().toISOString(),
                    lastModified: new Date().toISOString(),
                    entries: [{
                        logbook: this.getDefaultLogbookEntry(),
                        gameSnapshot: this.gameState,
                        metadata: {
                            importance: "high",
                            tags: ["mission", "startup"],
                            canRevert: true
                        }
                    }],
                    mounted: true
                };
                
                // Add to saveManager
                this.saveManager.addLogbook(newLogbook);
                this.saveManager.mountLogbook(this.saveManager.bookshelf.length - 1);
                
                this.updateConsole('New mission initialized');
                this.initialized = true;
                
                setTimeout(() => this.startBoarding(), 1000);
                
            } catch (error) {
                console.error('Failed to create new campaign:', error);
                this.showError('Failed to create new mission');
            }
        }
    }

    async handleImport(event) {
        const file = event.target.files[0];
        if (!file) return;

        this.updateConsole('Importing logbook...');

        try {
            const logbook = await this.saveManager.importLogbook(file);
            if (logbook) {
                this.updateConsole(`Imported: "${logbook.name}"`);
                
                // Refresh the save state analysis
                await this.analyzeSaveState();
                
                // If we're in the load browser, refresh it
                if (this.currentMenu === 'load') {
                    this.updateLogbookDisplay();
                } else {
                    // Return to main menu and refresh
                    this.showMainMenu();
                }
                
                this.showMessage('Logbook imported successfully');
            } else {
                this.updateConsole('Import failed');
                this.showError('Failed to import logbook');
            }
        } catch (error) {
            console.error('Import error:', error);
            this.updateConsole('Import error occurred');
            this.showError('Failed to import logbook file');
        }

        // Clear the file input
        event.target.value = '';
    }

    showSettings() {
        this.currentMenu = 'settings';
        
        // Update menu title
        const menuTitle = document.querySelector('.menu-title');
        if (menuTitle) {
            menuTitle.innerHTML = 'Mission Control<br><span style="font-size: 0.8em; color: var(--text-gray);">Settings</span>';
        }
        
        // Update menu content
        const menuButtons = document.querySelector('.menu-buttons');
        if (menuButtons) {
            menuButtons.innerHTML = `
                <div class="settings-menu">
                    <p style="color: var(--text-gray); margin-bottom: 15px;">Settings menu not yet implemented.</p>
                    <button id="back-to-main" class="menu-btn browser-btn">◀ Back to Main Menu</button>
                </div>
            `;
        }
        
        // Bind back button
        const backBtn = document.getElementById('back-to-main');
        if (backBtn) {
            this.addEventListenerWithCleanup(backBtn, 'click', () => {
                this.showMainMenu();
            });
        }
        
        this.updateConsole('Settings menu opened');
    }

    // Update display with current game state
    updateDisplayWithGameState() {
        if (!this.gameState) return;

        // Update helm info
        const helmInfo = document.querySelector('.helm-info');
        if (helmInfo && this.gameState.navigation) {
            const nav = this.gameState.navigation;
            helmInfo.innerHTML = `
                Speed: ${nav.speed || 0} kts<br>
                Heading: ${nav.heading || 0}°M<br>
                Depth: ${nav.depth || 0} M
            `;
        }

        // Update coordinate info
        const coordInfo = document.querySelector('.coordinate-info');
        if (coordInfo && this.gameState.navigation?.location) {
            const location = this.gameState.navigation.location;
            const coords = location.geometry.coordinates;
            
            const lat = this.convertToDMS(coords[1], 'lat');
            const lon = this.convertToDMS(coords[0], 'lon');
            
            let status = 'OFFLINE';
            if (this.gameState.shipSystems?.hull?.dockingBay === 'Open') {
                status = 'Docked';
            } else if (this.gameState.navigation.depth > 0) {
                status = 'Submerged';
            }
            
            coordInfo.innerHTML = `
                Status: ${status}<br>
                Location: ${location.properties.name}<br>
                LAT: ${lat}<br>
                LON: ${lon}<br>
                Course: ${this.gameState.navigation.course || 0}°M
            `;
        }
    }

    convertToDMS(decimal, type) {
        const absolute = Math.abs(decimal);
        const degrees = Math.floor(absolute);
        const minutesFloat = (absolute - degrees) * 60;
        const minutes = Math.floor(minutesFloat);
        const seconds = Math.floor((minutesFloat - minutes) * 60);
        
        const direction = type === 'lat' 
            ? (decimal >= 0 ? 'N' : 'S') 
            : (decimal >= 0 ? 'E' : 'W');
            
        return `${direction} ${degrees}°${minutes.toString().padStart(2, '0')}'${seconds.toString().padStart(2, '0')}"`;
    }

    async startBoarding() {
        if (!this.initialized) {
            this.showError('No active campaign to board. Please load a campaign first.');
            return;
        }

        if (!this.gameState) {
            this.showError('No valid game state found. Campaign may be corrupted.');
            return;
        }

        const prompt = document.getElementById('console-info');
        
        if (prompt) {
            prompt.textContent = '... boarding Aqua Nova ...';
            prompt.classList.add('boarding');
        }
        
        this.updateConsole('Initiating boarding sequence...');
        console.log('Initiating boarding sequence...');
        
        // Update GameState with current state
        GameState.setState(this.gameState);
        
        // Show boarding progress
        setTimeout(() => {
            this.updateConsole('Accessing ship systems...');
        }, 1000);
        
        setTimeout(() => {
            this.updateConsole('Loading captain\'s quarters...');
        }, 2000);
        
        // Navigate to logbook
        setTimeout(() => {
            this.navigateToLogbook();
        }, 3000);
    }

    navigateToLogbook() {
        // Data is already managed by SaveManager, logbook will pick it up
        window.location.href = 'ui/captains-quarters/logbook/logbook.html';
    }

    // Event listener management to prevent memory leaks
    addEventListenerWithCleanup(element, event, handler) {
        if (!element) return;
        
        const key = `${element.id || 'anonymous'}-${event}`;
        
        // Remove existing listener if present
        if (this.eventListeners.has(key)) {
            const oldHandler = this.eventListeners.get(key);
            element.removeEventListener(event, oldHandler);
        }
        
        // Add new listener
        element.addEventListener(event, handler);
        this.eventListeners.set(key, handler);
    }

    showMessage(message) {
        console.log('INFO:', message);
        // You could implement a better toast notification here
        setTimeout(() => alert(message), 100);
    }

    showError(message) {
        console.error('ERROR:', message);
        // You could implement a better error notification here
        setTimeout(() => alert(`Error: ${message}`), 100);
    }

    // Cleanup when page unloads
    cleanup() {
        this.eventListeners.forEach((handler, key) => {
            const [elementId, event] = key.split('-');
            const element = document.getElementById(elementId);
            if (element) {
                element.removeEventListener(event, handler);
            }
        });
        this.eventListeners.clear();
    }
}

// Initialize the splash screen when the page loads
let splashScreen = null;

document.addEventListener('DOMContentLoaded', async () => {
    splashScreen = new SplashScreen();
    await splashScreen.initialize();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (splashScreen) {
        splashScreen.cleanup();
    }
});

export default SplashScreen;