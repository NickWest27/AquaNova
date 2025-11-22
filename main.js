// main.js - Bootstrap and splash screen for Aqua Nova
// Orchestrates initialization
// Connects GameState ↔ SaveManager
// Handles UI bootstrap

import gameStateInstance from '/game/state.js';
import saveManagerInstance from '/game/saveManager.js';
import displayManager from '/utils/displayManager.js';
import { initPDAOverlay } from '/utils/pdaOverlay.js';
import { initCommunicatorOverlay } from '/utils/communicatorOverlay.js';
import missionManager from '/game/systems/missionManager.js';
import interactiveElementManager from '/utils/interactiveElements.js';


class SplashScreen {
    constructor() {
        this.initialized = false;
        this.currentBookIndex = 0;
    }

    async initialize() {
        console.log('Initializing Aqua Nova...');
        this.updateConsole('⚡ Power systems online...');

        // Initialize display system FIRST
        await displayManager.init();
        await this.delay(400);

        this.updateConsole('🖥️ Display systems calibrated...');
        this.createBubbles();
        this.startBubbleGeneration();
        await this.delay(400);

        // Initialize systems
        this.updateConsole('📊 Loading ship systems...');
        await this.initializeSystems();
        await this.delay(400);

        this.updateConsole('🎮 Initializing control systems...');
        this.bindControls();
        await this.delay(400);

        // Initialize overlays
        this.updateConsole('📱 PDA systems online...');
        initPDAOverlay();
        initCommunicatorOverlay();
        await this.delay(400);

        // Initialize mission system
        this.updateConsole('🎯 Mission protocols loading...');
        await missionManager.init();
        console.log('Mission system initialized');
        await this.delay(400);

        // Interactive elements are auto-initialized
        console.log('Interactive elements ready');

        this.updateConsole('✅ All systems operational');
        this.initialized = true;
        await this.delay(800);
        this.updateConsole('Press ENTER to board or I to import logbook');
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async initializeSystems() {
        try {
            this.updateConsole('Initializing game systems...');
            
            // Initialize SaveManager with GameState
            const success = await saveManagerInstance.init(gameStateInstance);
            if (!success) throw new Error('System initialization failed');
            
            // Update display with current state
            this.updateDisplay();
            
            const summary = saveManagerInstance.getSummary();
            this.updateConsole(`Loaded: ${summary.activeLogbook} (${summary.activeEntries} entries)`);
            
        } catch (error) {
            console.error('Initialization error:', error);
            this.updateConsole('Error: System initialization failed');
            this.showError('Failed to initialize game systems');
        }
    }

    updateConsole(message) {
        const consoleElement = document.getElementById('console-info');
        if (consoleElement) {
            consoleElement.textContent = message;
        }
        console.log('Console:', message);
    }

    updateDisplay() {
        const state = gameStateInstance.getState();
        this.updateHelmInfo(state);
        this.updateLocationInfo(state);
    }

    updateHelmInfo(state) {
        const helmInfo = document.querySelector('.helm-info');
        if (helmInfo && state.navigation) {
            helmInfo.innerHTML = `
                Speed: ${state.navigation.speed} kts<br>
                Heading: ${state.navigation.heading}°M<br>
                Depth: ${state.navigation.depth} M
            `;
        }
    }

    updateLocationInfo(state) {
        const coordInfo = document.querySelector('.coordinate-info');
        if (coordInfo && state.navigation?.location) {
            const location = state.navigation.location;
            const coords = location.geometry.coordinates;

            let status = 'READY';
            if (state.shipSystems?.hull?.dockingBay === 'Open') {
                status = 'DOCKED';
            } else if (state.navigation?.depth > 0) {
                status = 'SUBMERGED';
            } else if (state.navigation?.depth === 0) {
                status = 'SURFACED';
            }

            coordInfo.innerHTML = `
                Status: ${status}<br>
                Location: ${location.properties.name}<br>
                LAT: ${this.convertToDMS(coords[1], 'lat')}<br>
                LON: ${this.convertToDMS(coords[0], 'lon')}<br>
                Course: ${state.navigation.course}°M
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

    bindControls() {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.handleBoard();
            } else if (e.key === 'i' || e.key === 'I') {
                this.handleImport();
            } else if (e.key === 'ArrowLeft') {
                this.switchLogbook(-1);
            } else if (e.key === 'ArrowRight') {
                this.switchLogbook(1);
            }
        });
        
        document.addEventListener('click', () => {
            if (this.initialized) this.handleBoard();
        });
    }

    handleBoard() {
        if (!this.initialized) {
            this.updateConsole('System not ready. Please wait...');
            return;
        }

        this.updateConsole('... boarding Aqua Nova ...');
        
        setTimeout(() => {
            this.updateConsole('Accessing ship systems...');
        }, 1000);
        
        setTimeout(() => {
            this.updateConsole('Loading captain\'s quarters...');
        }, 2000);
        
        setTimeout(() => {
            window.location.href = 'ui/captains-quarters/logbook/logbook.html';
        }, 3000);
    }

    async handleImport() {
        try {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.style.display = 'none';
            
            input.onchange = async (e) => {
                await this.importLogbook(e);
                document.body.removeChild(input);
            };
            
            document.body.appendChild(input);
            input.click();
        } catch (error) {
            this.showError('Failed to open file dialog');
        }
    }

    async importLogbook(event) {
        const file = event.target.files[0];
        if (!file) return;

        this.updateConsole('Importing logbook...');

        try {
            const logbook = await saveManagerInstance.importLogbook(file);
            this.updateConsole(`Imported: "${logbook.name}"`);
            
            // Optionally auto-mount the new logbook
            const mount = confirm(`Mount "${logbook.name}" as active logbook?`);
            if (mount) {
                saveManagerInstance.mountLogbook(logbook.id);
                this.updateDisplay();
                this.updateConsole(`Active: ${logbook.name}`);
            }
            
        } catch (error) {
            console.error('Import error:', error);
            this.updateConsole('Import failed');
            this.showError('Failed to import logbook file');
        }
    }

    switchLogbook(direction) {
        const bookshelf = saveManagerInstance.getBookshelf();
        if (bookshelf.length <= 1) return;
        
        this.currentBookIndex = (this.currentBookIndex + direction + bookshelf.length) % bookshelf.length;
        const book = bookshelf[this.currentBookIndex];
        
        this.updateConsole(`Available: ${book.name} (${book.entryCount} entries) - Arrow keys to browse`);
        
        // Mount after a moment if user doesn't keep switching
        clearTimeout(this.mountTimer);
        this.mountTimer = setTimeout(() => {
            if (confirm(`Switch to "${book.name}"?`)) {
                try {
                    saveManagerInstance.mountLogbook(book.id);
                    this.updateDisplay();
                    this.updateConsole(`Active: ${book.name} - ENTER to board`);
                } catch (error) {
                    console.error('Failed to switch logbook:', error);
                    this.updateConsole('Failed to switch logbook');
                }
            }
        }, 1000);
    }

    showError(message) {
        console.error('ERROR:', message);
        alert(`Error: ${message}`);
    }

    // Bubble effects
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
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', async () => {
    const splash = new SplashScreen();
    await splash.initialize();
});

export default SplashScreen;