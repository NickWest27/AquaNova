// main.js - Bootstrap and splash screen functionality for Aqua Nova
// Simplified version using only localStorage and logbook-based saves

class SplashScreen {
    constructor() {
        this.gameState = null;
        this.logbookData = null;
        this.initialize();
    }

    initialize() {
        this.setGlobalScale();
        this.createBubbles();
        this.bindControls();
        this.startBubbleGeneration();
    }

    setGlobalScale() {
        const baseWidth = 1920;
        const baseHeight = 1080;
        const scaleX = window.innerWidth / baseWidth;
        const scaleY = window.innerHeight / baseHeight;
        const scale = Math.min(scaleX, scaleY); // maintain aspect ratio
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
        document.addEventListener('keydown', (e) => {
            if(e.key === 'Enter') {
                this.startBoarding();
            }
        });
        
        document.addEventListener('click', () => {
            const prompt = document.getElementById('start-prompt');
            prompt.style.transform = 'scale(1.1)';
            setTimeout(() => {
                prompt.style.transform = 'scale(1)';
            }, 200);
        });
    }

    // Get the default boot state
    getDefaultBootState() {
        return {
            "navigation": {
                "location": {
                    "type": "Feature",
                    "geometry": {
                        "type": "Point",
                        "coordinates": [-70.6709, 41.5223]
                    },
                    "properties": {
                        "name": "Woods Hole Oceanographic Institute",
                        "type": "dock",
                        "description": "Primary research dock and submarine base."
                    }
                },
                "depth": 0,
                "heading": 0,
                "course": 0,
                "speed": 0,
                "destination": null
            },
            "shipSystems": {
                "hull": { "integrity": 100, "dockingBay": "Open" },
                "power": { "leftReactorHealth": 100, "rightReactorHealth": 100 },
                "lifeSupport": { "oxygenTankQuantity": 98, "airTemperature": 22 },
                "helm": { "leftThrust": 0, "rightThrust": 0 },
                "sensors": { "shipSonar": 100 },
                "communications": { "commHealth": 100 }
            },
            "crew": { "totalCrew": 8 },
            "mission": { "currentMission": null, "objectives": [] },
            "environment": { "weather": "calm", "seaState": 1 }
        };
    }

    // Get the default first logbook entry
    getDefaultLogbookEntry() {
        return {
            "id": "M.LOG-0001",
            "timestamp": "2074-08-09T14:30:00.000Z",
            "type": "mission_log",
            "tags": ["OERA", "dry_dock", "mission", "tasks"],
            "author": {
                "organization": "O.E.R.A - Oceanic Exploration and Research Alliance",
                "department": "Operations Command",
                "name": "Admiral Elena Vasquez",
                "role": "Director of Operations"
            },
            "content": "Welcome onboard Captain. I trust you have settling in well. This is your digital logbook where you can record your mission progress, discoveries, and any important notes. Please ensure to keep it updated regularly. I must apologize for the haste, but it is of utmost importance that you get Aqua Nova out of dry dock and underway for sea trials. You and the crew need to get yourselves familiarized with the ships operation and systems under various conditions.",
            "tasks": [
                "Familiarize yourself with the Aqua Nova", 
                "Unpack and look around your personal quarters", 
                "Meet 'AREA' the Executive Officer", 
                "Find yourway to the Bridge"
            ],
            "completedTasks": []
        };
    }

    // Initialize logbook data structure
    getDefaultLogbook() {
        const firstEntry = this.getDefaultLogbookEntry();
        const defaultState = this.getDefaultBootState();
        
        return {
            "entries": [{
                "logbook": firstEntry,
                "gameSnapshot": defaultState,
                "metadata": {
                    "importance": "high",
                    "tags": ["mission", "startup"],
                    "canRevert": true
                }
            }],
            "statistics": {
                "totalEntries": 1,
                "totalMissions": 1,
                "firstEntry": firstEntry.timestamp,
                "lastEntry": firstEntry.timestamp
            },
            "settings": {
                "autoSave": true,
                "maxEntries": 1000
            }
        };
    }

    // Load data from localStorage or use defaults
    async loadGameData() {
        try {
            // Check for cached logbook data
            const cachedLogbook = localStorage.getItem('aquaNova_logbook');
            const cachedGameState = localStorage.getItem('aquaNova_gameState');

            if (cachedLogbook) {
                this.logbookData = JSON.parse(cachedLogbook);
                console.log(`Loaded logbook with ${this.logbookData.entries.length} entries`);
                
                // Use the latest logbook entry's game state
                if (this.logbookData.entries.length > 0) {
                    const latestEntry = this.logbookData.entries[this.logbookData.entries.length - 1];
                    this.gameState = latestEntry.gameSnapshot;
                    console.log('Using game state from latest logbook entry');
                    return { hasExistingData: true, source: 'logbook' };
                }
            }

            if (cachedGameState) {
                this.gameState = JSON.parse(cachedGameState);
                console.log('Loaded cached game state');
            }

            // If we have some data, return it
            if (this.gameState || this.logbookData) {
                return { hasExistingData: true, source: 'cache' };
            }

            // No cached data found, use defaults
            console.log('No cached data found, using defaults');
            this.logbookData = this.getDefaultLogbook();
            this.gameState = this.getDefaultBootState();
            
            return { hasExistingData: false, source: 'default' };

        } catch (error) {
            console.error('Error loading cached data:', error);
            // Fall back to defaults on any error
            this.logbookData = this.getDefaultLogbook();
            this.gameState = this.getDefaultBootState();
            return { hasExistingData: false, source: 'error_fallback' };
        }
    }

    // Save current state to localStorage
    saveToCache() {
        try {
            if (this.gameState) {
                localStorage.setItem('aquaNova_gameState', JSON.stringify(this.gameState));
            }
            if (this.logbookData) {
                localStorage.setItem('aquaNova_logbook', JSON.stringify(this.logbookData));
            }
            console.log('Data cached successfully');
        } catch (error) {
            console.error('Failed to cache data:', error);
        }
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
        const prompt = document.getElementById('start-prompt');
        
        prompt.textContent = '... boarding Aqua Nova ...';
        prompt.classList.add('boarding');
        
        console.log('Initiating boarding sequence...');
        
        // Load game data
        const loadResult = await this.loadGameData();
        
        if (loadResult.hasExistingData) {
            if (loadResult.source === 'logbook') {
                prompt.textContent = '... reverting to last known position ...';
                console.log('Loading from existing logbook entries');
            } else {
                prompt.textContent = '... loading cached data ...';
                console.log('Loading from cached game state');
            }
        } else {
            prompt.textContent = '... boarding for the first time ...';
            console.log('First boot - using default state');
        }
        
        // Save current state to cache
        this.saveToCache();
        
        // Update display
        this.updateDisplayWithGameState();
        
        // Navigate to logbook
        setTimeout(() => {
            this.navigateToLogbook();
        }, 2000);
    }

    navigateToLogbook() {
        // Data is already cached in localStorage, logbook will pick it up
        window.location.href = 'ui/captains-quarters/logbook/logbook.html';
    }
}

// Initialize the splash screen when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new SplashScreen();
});