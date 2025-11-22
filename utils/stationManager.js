// utils/stationManager.js
// Manages station switching on the bridge
// Coordinates: left-console selector, center-display content, right-console MFD pages

import gameStateInstance from '/game/state.js';

class StationManager {
    constructor() {
        this.currentStation = 'nav';  // Default station
        this.mfdSystem = null;
        this.centerDisplay = null;
        this.stationButtons = new Map();
        this.displayRenderers = new Map();

        // Station configuration
        this.stations = {
            helm: {
                id: 'helm',
                label: 'HELM',
                mfdPage: 'helm',
                displayRenderer: 'pfd'
            },
            nav: {
                id: 'nav',
                label: 'NAV',
                mfdPage: 'navigation',
                displayRenderer: 'navigation'
            },
            eng: {
                id: 'eng',
                label: 'ENG',
                mfdPage: 'engineering',
                displayRenderer: 'engineering'
            },
            comm: {
                id: 'comm',
                label: 'COMM',
                mfdPage: 'communications',
                displayRenderer: 'communications'
            },
            sensors: {
                id: 'sensors',
                label: 'SENSORS',
                mfdPage: 'sensors',
                displayRenderer: 'sensors'
            },
            science: {
                id: 'science',
                label: 'SCIENCE',
                mfdPage: 'science',
                displayRenderer: 'science'
            }
        };
    }

    init(mfdSystem, centerDisplay) {
        this.mfdSystem = mfdSystem;
        this.centerDisplay = centerDisplay;

        console.log('Station Manager initialized');
    }

    registerStationButton(stationId, buttonElement) {
        this.stationButtons.set(stationId, buttonElement);

        // Add click handler
        buttonElement.addEventListener('click', () => {
            this.switchToStation(stationId);
        });
    }

    registerDisplayRenderer(rendererId, rendererFunction) {
        this.displayRenderers.set(rendererId, rendererFunction);
        console.log(`Display renderer registered: ${rendererId}`);
    }

    switchToStation(stationId) {
        if (!this.stations[stationId]) {
            console.error(`Unknown station: ${stationId}`);
            return;
        }

        const station = this.stations[stationId];
        const previousStation = this.currentStation;

        console.log(`Switching from ${previousStation} to ${stationId}`);

        // Update current station
        this.currentStation = stationId;

        // Update station selector buttons
        this.updateStationButtons();

        // Switch MFD page
        if (this.mfdSystem && station.mfdPage) {
            this.mfdSystem.setActivePage(station.mfdPage);
        }

        // Switch center display content
        this.updateCenterDisplay();

        // Store in game state
        gameStateInstance.updateProperty('bridge.activeStation', stationId);

        console.log(`Active station: ${stationId.toUpperCase()}`);
    }

    updateStationButtons() {
        // Update button highlighting
        this.stationButtons.forEach((button, stationId) => {
            if (stationId === this.currentStation) {
                button.classList.add('selected');
            } else {
                button.classList.remove('selected');
            }
        });
    }

    updateCenterDisplay() {
        const station = this.stations[this.currentStation];

        if (!this.centerDisplay) {
            console.warn('Center display not initialized');
            return;
        }

        // Get the renderer for this station
        const renderer = this.displayRenderers.get(station.displayRenderer);

        if (renderer && typeof renderer === 'function') {
            // Call the renderer function
            renderer(this.centerDisplay);
        } else {
            console.warn(`No renderer found for: ${station.displayRenderer}`);
            this.showPlaceholderDisplay(station.label);
        }
    }

    showPlaceholderDisplay(stationLabel) {
        if (!this.centerDisplay) return;

        // Show "STATION OFFLINE" placeholder
        const canvas = this.centerDisplay.querySelector('canvas');
        const svg = this.centerDisplay.querySelector('svg');

        if (canvas) {
            const ctx = canvas.getContext('2d');
            const rect = this.centerDisplay.getBoundingClientRect();

            ctx.fillStyle = '#001122';
            ctx.fillRect(0, 0, rect.width, rect.height);

            ctx.fillStyle = '#64ffda';
            ctx.font = '20px "Courier New", monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${stationLabel} STATION`, rect.width / 2, rect.height / 2 - 20);

            ctx.fillStyle = '#9aa0a6';
            ctx.font = '14px "Courier New", monospace';
            ctx.fillText('OFFLINE', rect.width / 2, rect.height / 2 + 10);
            ctx.fillText('COMING SOON', rect.width / 2, rect.height / 2 + 30);
        }

        if (svg) {
            svg.innerHTML = '';
        }
    }

    getCurrentStation() {
        return this.currentStation;
    }

    getStationInfo(stationId) {
        return this.stations[stationId] || null;
    }

    // Debug
    getStatus() {
        return {
            currentStation: this.currentStation,
            availableStations: Object.keys(this.stations),
            mfdInitialized: !!this.mfdSystem,
            displayInitialized: !!this.centerDisplay,
            registeredButtons: Array.from(this.stationButtons.keys()),
            registeredRenderers: Array.from(this.displayRenderers.keys())
        };
    }
}

// Singleton instance
const stationManager = new StationManager();

export default stationManager;
