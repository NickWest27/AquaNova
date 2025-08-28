// main.js - Bootstrap and splash screen functionality for Aqua Nova
// Updated version with proper GameState and SaveManager integration
import { setGlobalScale } from '/utils/scale.js';
import gameStateInstance from '/game/state.js';
import saveManager from '/game/saveManager.js';
import { initPDAOverlay } from '/utils/pdaOverlay.js';

initPDAOverlay();

class SplashScreen {
    constructor() {
        this.gameState = null;
        this.saveManager = null;
        this.eventListeners = new Map();
        this.initialized = false;
        this.currentMenu = 'main';
        this.bookshelfIndex = 0;
    }

    async initialize() {
        console.log('SplashScreen: Starting initialization');
        this.updateConsole('System initializing...');

        this.createBubbles();
        this.startBubbleGeneration();
        
        // Initialize GameState first
        this.gameState = gameStateInstance; // no "new"
        
        // Initialize SaveManager with GameState
        await this.initializeSaveManager();
        this.bindControls();
        
        console.log('SplashScreen: Initialization complete');
    }

    async initializeSaveManager() {
        try {
            this.updateConsole('Initializing save system...');
            
            // Initialize SaveManager singleton with GameState instance
            this.saveManager = saveManager;
            const success = await this.saveManager.init(this.gameState);
            
            if (!success) {
                throw new Error('SaveManager initialization failed');
            }

            this.updateConsole('Searching for previous sessions...');
            
            // Analyze the save state and update UI accordingly
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

        const bookshelf = this.saveManager.getBookshelf();
        
        if (bookshelf.length === 0) {
            this.updateConsole('No logbooks available - import required');
            this.updateMenuForNoLogbooks();
            return;
        }

        const activeLogbook = this.saveManager.getActiveLogbook();
        this.updateConsole(`${bookshelf.length} logbook(s) found`);

        if (!activeLogbook) {
            this.updateConsole('No active logbook selected');
            this.updateMenuForLogbookSelection();
            return;
        }

        // We have an active logbook - GameState should already be loaded
        const entryCount = activeLogbook.entries ? activeLogbook.entries.length : 0;
        
        this.updateConsole(`Loaded logbook: "${activeLogbook.name}" (${entryCount} entries)`);
        
        // Update display with current game state
        this.updateDisplayWithGameState();
        this.updateMenuForActiveSession();
        
        this.initialized = true;
        
        // Auto-prompt after a moment
        setTimeout(() => {
            this.updateConsole('Press ENTER to board or select menu option');
        }, 1000);
    }

    updateConsole(message) {
        const consoleElement = document.getElementById('console-info');
        if (consoleElement) {
            consoleElement.textContent = message;
            console.log('Console:', message);
        }
    }

    updateMenuForNoLogbooks() {
        // Since there's no menu in the current HTML, just update console
        this.updateConsole('No logbooks found. Import required to begin.');
    }

    updateMenuForLogbookSelection() {
        const bookCount = this.saveManager.getBookshelf().length;
        this.updateConsole(`Found ${bookCount} logbook(s). Load required to continue.`);
    }

    updateMenuForActiveSession() {
        const activeLogbook = this.saveManager.getActiveLogbook();
        if (activeLogbook) {
            const entryCount = activeLogbook.entries ? activeLogbook.entries.length : 0;
            this.updateConsole(`Active: "${activeLogbook.name}" - ${entryCount} entries. Press ENTER to board.`);
        }
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
        // Keyboard controls
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.handleEnterKey();
            } else if (e.key === 'i' || e.key === 'I') {
                this.triggerImport();
            }
        });
        
        // Click anywhere to board (if ready)
        document.addEventListener('click', (e) => {
            this.handleClick(e);
        });
    }

    handleEnterKey() {
        if (this.initialized) {
            this.startBoarding();
        } else if (this.saveManager && this.saveManager.requiresImport()) {
            this.updateConsole('Import required. Press I to import logbook file.');
        } else {
            this.updateConsole('System not ready. Please wait...');
        }
    }

    handleClick(e) {
        // Visual feedback for console prompt
        const prompt = document.getElementById('console-info');
        if (prompt) {
            prompt.style.transform = 'scale(1.1)';
            setTimeout(() => {
                prompt.style.transform = 'scale(1)';
            }, 200);
        }

        // Try to board if initialized
        if (this.initialized) {
            this.startBoarding();
        }
    }

    async triggerImport() {
        try {
            // Create a hidden file input
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.style.display = 'none';
            
            input.onchange = async (e) => {
                await this.handleImport(e);
                document.body.removeChild(input);
            };
            
            document.body.appendChild(input);
            input.click();
        } catch (error) {
            console.error('Failed to trigger import:', error);
            this.showError('Failed to open file dialog');
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
                
                // Mount the new logbook and refresh state
                const bookshelf = this.saveManager.getBookshelf();
                const newIndex = bookshelf.length - 1;
                
                if (this.saveManager.mountLogbook(newIndex)) {
                    this.updateConsole('Logbook mounted successfully');
                    
                    // Refresh the save state analysis
                    await this.analyzeSaveState();
                    
                    this.showMessage('Logbook imported and loaded successfully');
                } else {
                    this.updateConsole('Failed to mount imported logbook');
                    this.showError('Failed to activate imported logbook');
                }
            } else {
                this.updateConsole('Import failed');
                this.showError('Failed to import logbook');
            }
        } catch (error) {
            console.error('Import error:', error);
            this.updateConsole('Import error occurred');
            this.showError('Failed to import logbook file');
        }
    }

    // Update display with current game state
    updateDisplayWithGameState() {
        if (!this.gameState) return;

        const currentState = this.gameState.getState();

        // Update helm info
        const helmInfo = document.querySelector('.helm-info');
        if (helmInfo && currentState.navigation) {
            const nav = currentState.navigation;
            helmInfo.innerHTML = `
                Speed: ${nav.speed || 0} kts<br>
                Heading: ${nav.heading || 0}°M<br>
                Depth: ${nav.depth || 0} M
            `;
        }

        // Update coordinate info
        const coordInfo = document.querySelector('.coordinate-info');
        if (coordInfo && currentState.navigation?.location) {
            const location = currentState.navigation.location;
            const coords = location.geometry.coordinates;
            
            const lat = this.convertToDMS(coords[1], 'lat');
            const lon = this.convertToDMS(coords[0], 'lon');
            
            let status = 'OFFLINE';
            if (currentState.shipSystems?.hull?.dockingBay === 'Open') {
                status = 'Docked';
            } else if (currentState.navigation.depth > 0) {
                status = 'Submerged';
            }
            
            coordInfo.innerHTML = `
                Status: ${status}<br>
                Location: ${location.properties.name}<br>
                LAT: ${lat}<br>
                LON: ${lon}<br>
                Course: ${currentState.navigation.course || 0}°M
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
            this.showError('No active campaign to board. Please import a logbook first.');
            return;
        }

        if (!this.gameState) {
            this.showError('No valid game state found. System may be corrupted.');
            return;
        }

        const prompt = document.getElementById('console-info');
        
        if (prompt) {
            prompt.textContent = '... boarding Aqua Nova ...';
            prompt.classList.add('boarding');
        }
        
        this.updateConsole('Initiating boarding sequence...');
        console.log('Initiating boarding sequence...');
        
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
        // GameState and SaveManager are now properly initialized
        // The logbook page can access them via their global state
        window.location.href = 'ui/captains-quarters/logbook/logbook.html';
    }

    showMessage(message) {
        console.log('INFO:', message);
        // Simple alert for now - could be replaced with better UI
        setTimeout(() => alert(message), 100);
    }

    showError(message) {
        console.error('ERROR:', message);
        // Simple alert for now - could be replaced with better UI
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