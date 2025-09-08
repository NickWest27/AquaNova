// utils/mfd/pages/navigationPage.js
// Navigation page for MFD - shows map with range controls and overlays

import { drawNavigationDisplay } from '/game/systems/navComputer/navComputer.js';
import gameStateInstance from '/game/state.js';

class NavigationPage {
    static init(mfd) {
        // Initialize navigation page state
        const defaultState = {
            mode: 'map', // 'map', 'overlays', 'route'
            overlaysVisible: {
                route: true,
                waypoints: true,
                contours: false,
                hazards: true,
                traffic: false
            },
            selectedOverlay: null,
            routeView: {
                selectedWaypoint: 0,
                editMode: false
            }
        };
        
        mfd.setPageState(defaultState, 'navigation');
        console.log('Navigation page initialized');
    }

    static getSoftKeys(mfd) {
        const state = mfd.getPageState('navigation');
        
        switch (state.mode) {
            case 'overlays':
                return this.getOverlaySoftKeys(mfd, state);
            case 'route':
                return this.getRouteSoftKeys(mfd, state);
            default: // 'map'
                return this.getMapSoftKeys(mfd, state);
        }
    }

    static getMapSoftKeys(mfd, state) {
        return {
            labels: ['RNG+', 'SHOW', 'ROUTE', 'MENU', 'RNG-', 'ZOOM', 'INFO', '----'],
            actions: [
                () => this.increaseRange(mfd),           // L1: RNG+
                () => this.showOverlays(mfd),            // L2: SHOW
                () => this.showRoute(mfd),               // L3: ROUTE
                () => this.showMenu(mfd),                // L4: MENU
                () => this.decreaseRange(mfd),           // R1: RNG-
                () => this.toggleZoom(mfd),              // R2: ZOOM
                () => this.showInfo(mfd),                // R3: INFO
                null                                     // R4: ----
            ]
        };
    }

    static getOverlaySoftKeys(mfd, state) {
        return {
            labels: ['ROUTE', 'WAYPTS', 'CONTOUR', 'BACK', 'HAZARDS', 'TRAFFIC', 'ALL ON', 'ALL OFF'],
            actions: [
                () => this.toggleOverlay(mfd, 'route'),     // L1: ROUTE
                () => this.toggleOverlay(mfd, 'waypoints'), // L2: WAYPTS
                () => this.toggleOverlay(mfd, 'contours'),  // L3: CONTOUR
                () => this.backToMap(mfd),                  // L4: BACK
                () => this.toggleOverlay(mfd, 'hazards'),   // R1: HAZARDS
                () => this.toggleOverlay(mfd, 'traffic'),   // R2: TRAFFIC
                () => this.allOverlaysOn(mfd),              // R3: ALL ON
                () => this.allOverlaysOff(mfd)              // R4: ALL OFF
            ]
        };
    }

    static getRouteSoftKeys(mfd, state) {
        return {
            labels: ['ADD', 'EDIT', 'DELETE', 'BACK', 'UP', 'DOWN', 'EXEC', 'DIRECT'],
            actions: [
                () => this.addWaypoint(mfd),            // L1: ADD
                () => this.editWaypoint(mfd),           // L2: EDIT
                () => this.deleteWaypoint(mfd),         // L3: DELETE
                () => this.backToMap(mfd),              // L4: BACK
                () => this.moveWaypointUp(mfd),         // R1: UP
                () => this.moveWaypointDown(mfd),       // R2: DOWN
                () => this.executeRoute(mfd),           // R3: EXEC
                () => this.directToWaypoint(mfd)        // R4: DIRECT
            ]
        };
    }

    static render(mfd) {
        const canvas = mfd.getDisplayCanvas();
        const svg = mfd.getDisplaySVG();
        const state = mfd.getPageState('navigation');
        
        if (!canvas || !svg) return;

        // Clear SVG overlays
        svg.innerHTML = '';

        // Get current navigation state from game - FIXED: Use gameStateInstance directly
        const navState = {
            range: gameStateInstance.getProperty("displaySettings.navDisplayRange") || 10,
            ownshipTrack: gameStateInstance.getProperty("navigation.course") || 0,
            selectedHeading: gameStateInstance.getProperty("navigation.heading") || 0,
            overlays: state.overlaysVisible
        };

        // Use existing nav computer to draw the display
        drawNavigationDisplay(canvas, svg, navState, 'centerDisplay');

        // Add page-specific overlays
        this.addPageOverlays(mfd, state);
    }

    static addPageOverlays(mfd, state) {
        const svg = mfd.getDisplaySVG();
        
        // Add mode-specific overlays
        switch (state.mode) {
            case 'overlays':
                this.addOverlayStatusDisplay(svg, state);
                break;
            case 'route':
                this.addRouteListDisplay(svg, state);
                break;
            default:
                // Map mode - add basic status
                this.addMapStatusDisplay(svg, state);
        }
    }

    static addOverlayStatusDisplay(svg, state) {
        // Create overlay status panel
        const overlayPanel = document.createElementNS("http://www.w3.org/2000/svg", "g");
        overlayPanel.setAttribute("class", "overlay-status-panel");
        
        // Background
        const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        bg.setAttribute("x", "10");
        bg.setAttribute("y", "10");
        bg.setAttribute("width", "150");
        bg.setAttribute("height", "120");
        bg.setAttribute("fill", "rgba(0, 0, 0, 0.8)");
        bg.setAttribute("stroke", "var(--primary-cyan)");
        bg.setAttribute("stroke-width", "1");
        bg.setAttribute("rx", "4");
        overlayPanel.appendChild(bg);
        
        // Title
        const title = document.createElementNS("http://www.w3.org/2000/svg", "text");
        title.setAttribute("x", "85");
        title.setAttribute("y", "25");
        title.setAttribute("text-anchor", "middle");
        title.setAttribute("fill", "var(--primary-cyan)");
        title.setAttribute("font-family", "Courier New, monospace");
        title.setAttribute("font-size", "12");
        title.setAttribute("font-weight", "bold");
        title.textContent = "OVERLAYS";
        overlayPanel.appendChild(title);
        
        // Overlay status list
        const overlays = ['route', 'waypoints', 'contours', 'hazards', 'traffic'];
        overlays.forEach((overlay, index) => {
            const isOn = state.overlaysVisible[overlay];
            const y = 45 + (index * 15);
            
            const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
            text.setAttribute("x", "15");
            text.setAttribute("y", y);
            text.setAttribute("fill", isOn ? "var(--success-green)" : "var(--text-gray)");
            text.setAttribute("font-family", "Courier New, monospace");
            text.setAttribute("font-size", "10");
            text.textContent = `${overlay.toUpperCase()}: ${isOn ? 'ON' : 'OFF'}`;
            overlayPanel.appendChild(text);
        });
        
        svg.appendChild(overlayPanel);
    }

    static addRouteListDisplay(svg, state) {
        // Create route waypoints panel
        const routePanel = document.createElementNS("http://www.w3.org/2000/svg", "g");
        routePanel.setAttribute("class", "route-list-panel");
        
        // Background
        const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        bg.setAttribute("x", "10");
        bg.setAttribute("y", "10");
        bg.setAttribute("width", "200");
        bg.setAttribute("height", "150");
        bg.setAttribute("fill", "rgba(0, 0, 0, 0.8)");
        bg.setAttribute("stroke", "var(--primary-cyan)");
        bg.setAttribute("stroke-width", "1");
        bg.setAttribute("rx", "4");
        routePanel.appendChild(bg);
        
        // Title
        const title = document.createElementNS("http://www.w3.org/2000/svg", "text");
        title.setAttribute("x", "110");
        title.setAttribute("y", "25");
        title.setAttribute("text-anchor", "middle");
        title.setAttribute("fill", "var(--primary-cyan)");
        title.setAttribute("font-family", "Courier New, monospace");
        title.setAttribute("font-size", "12");
        title.setAttribute("font-weight", "bold");
        title.textContent = "ROUTE WAYPOINTS";
        routePanel.appendChild(title);
        
        // Mock waypoints for now - will integrate with mission computer later
        const mockWaypoints = [
            { name: 'START', distance: 0.0, eta: '--:--' },
            { name: 'WPT01', distance: 15.2, eta: '14:30' },
            { name: 'WPT02', distance: 27.8, eta: '15:45' },
            { name: 'DEST', distance: 42.1, eta: '17:20' }
        ];
        
        mockWaypoints.forEach((wpt, index) => {
            const isSelected = index === state.routeView.selectedWaypoint;
            const y = 45 + (index * 15);
            
            // Selection highlight
            if (isSelected) {
                const highlight = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                highlight.setAttribute("x", "12");
                highlight.setAttribute("y", y - 10);
                highlight.setAttribute("width", "196");
                highlight.setAttribute("height", "12");
                highlight.setAttribute("fill", "rgba(100, 255, 218, 0.2)");
                highlight.setAttribute("rx", "2");
                routePanel.appendChild(highlight);
            }
            
            // Waypoint info
            const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
            text.setAttribute("x", "15");
            text.setAttribute("y", y);
            text.setAttribute("fill", isSelected ? "var(--primary-cyan)" : "var(--text-white)");
            text.setAttribute("font-family", "Courier New, monospace");
            text.setAttribute("font-size", "10");
            text.textContent = `${index + 1}. ${wpt.name} ${wpt.distance}nm ${wpt.eta}`;
            routePanel.appendChild(text);
        });
        
        svg.appendChild(routePanel);
    }

    static addMapStatusDisplay(svg, state) {
        // Add basic navigation status in corner - FIXED: Use gameStateInstance directly
        const range = gameStateInstance.getProperty("displaySettings.navDisplayRange") || 10;
        
        const statusText = document.createElementNS("http://www.w3.org/2000/svg", "text");
        statusText.setAttribute("x", svg.getAttribute("width") - 10);
        statusText.setAttribute("y", "20");
        statusText.setAttribute("text-anchor", "end");
        statusText.setAttribute("fill", "var(--primary-cyan)");
        statusText.setAttribute("font-family", "Courier New, monospace");
        statusText.setAttribute("font-size", "10");
        statusText.textContent = `RANGE: ${range}nm`;
        
        svg.appendChild(statusText);
    }

    // Soft Key Action Methods
    static increaseRange(mfd) {
        // FIXED: Use gameStateInstance directly
        const currentRange = gameStateInstance.getProperty("displaySettings.navDisplayRange") || 10;
        const ranges = [5, 10, 20, 40, 80];
        const currentIndex = ranges.indexOf(currentRange);
        const newRange = currentIndex < ranges.length - 1 ? ranges[currentIndex + 1] : ranges[ranges.length - 1];
        
        gameStateInstance.updateProperty("displaySettings.navDisplayRange", newRange);
        mfd.updateDisplay();
        console.log(`Navigation: Range increased to ${newRange}nm`);
    }

    static decreaseRange(mfd) {
        // FIXED: Use gameStateInstance directly
        const currentRange = gameStateInstance.getProperty("displaySettings.navDisplayRange") || 10;
        const ranges = [5, 10, 20, 40, 80];
        const currentIndex = ranges.indexOf(currentRange);
        const newRange = currentIndex > 0 ? ranges[currentIndex - 1] : ranges[0];
        
        gameStateInstance.updateProperty("displaySettings.navDisplayRange", newRange);
        mfd.updateDisplay();
        console.log(`Navigation: Range decreased to ${newRange}nm`);
    }

    static showOverlays(mfd) {
        const state = mfd.getPageState('navigation');
        state.mode = 'overlays';
        mfd.setPageState(state, 'navigation');
        mfd.setupPageSoftKeys('navigation');
        mfd.updateDisplay();
        console.log('Navigation: Showing overlays menu');
    }

    static showRoute(mfd) {
        const state = mfd.getPageState('navigation');
        state.mode = 'route';
        mfd.setPageState(state, 'navigation');
        mfd.setupPageSoftKeys('navigation');
        mfd.updateDisplay();
        console.log('Navigation: Showing route menu');
    }

    static showMenu(mfd) {
        // Could show main menu or switch to different MFD page
        console.log('Navigation: Main menu requested');
    }

    static toggleZoom(mfd) {
        // Toggle between different zoom levels or display modes
        console.log('Navigation: Zoom toggle');
    }

    static showInfo(mfd) {
        // Show navigation information panel
        console.log('Navigation: Info panel');
    }

    static backToMap(mfd) {
        const state = mfd.getPageState('navigation');
        state.mode = 'map';
        mfd.setPageState(state, 'navigation');
        mfd.setupPageSoftKeys('navigation');
        mfd.updateDisplay();
        console.log('Navigation: Back to map view');
    }

    // Overlay Control Methods
    static toggleOverlay(mfd, overlayName) {
        const state = mfd.getPageState('navigation');
        state.overlaysVisible[overlayName] = !state.overlaysVisible[overlayName];
        mfd.setPageState(state, 'navigation');
        mfd.updateDisplay();
        console.log(`Navigation: Toggled ${overlayName} overlay ${state.overlaysVisible[overlayName] ? 'ON' : 'OFF'}`);
    }

    static allOverlaysOn(mfd) {
        const state = mfd.getPageState('navigation');
        Object.keys(state.overlaysVisible).forEach(key => {
            state.overlaysVisible[key] = true;
        });
        mfd.setPageState(state, 'navigation');
        mfd.updateDisplay();
        console.log('Navigation: All overlays ON');
    }

    static allOverlaysOff(mfd) {
        const state = mfd.getPageState('navigation');
        Object.keys(state.overlaysVisible).forEach(key => {
            state.overlaysVisible[key] = false;
        });
        mfd.setPageState(state, 'navigation');
        mfd.updateDisplay();
        console.log('Navigation: All overlays OFF');
    }

    // Route Management Methods
    static addWaypoint(mfd) {
        mfd.requestKeyboardInput('WPT NAME: ', 'waypoint_add', 8);
        console.log('Navigation: Add waypoint requested');
    }

    static editWaypoint(mfd) {
        const state = mfd.getPageState('navigation');
        const selectedIndex = state.routeView.selectedWaypoint;
        mfd.requestKeyboardInput('EDIT WPT: ', `waypoint_edit_${selectedIndex}`, 8);
        console.log('Navigation: Edit waypoint requested');
    }

    static deleteWaypoint(mfd) {
        const state = mfd.getPageState('navigation');
        const selectedIndex = state.routeView.selectedWaypoint;
        console.log(`Navigation: Delete waypoint ${selectedIndex} requested`);
        // Implementation would remove waypoint from mission computer
    }

    static moveWaypointUp(mfd) {
        const state = mfd.getPageState('navigation');
        if (state.routeView.selectedWaypoint > 0) {
            state.routeView.selectedWaypoint--;
            mfd.setPageState(state, 'navigation');
            mfd.updateDisplay();
        }
        console.log('Navigation: Move waypoint selection up');
    }

    static moveWaypointDown(mfd) {
        const state = mfd.getPageState('navigation');
        // Mock limit - would use actual waypoint count
        const maxWaypoints = 4;
        if (state.routeView.selectedWaypoint < maxWaypoints - 1) {
            state.routeView.selectedWaypoint++;
            mfd.setPageState(state, 'navigation');
            mfd.updateDisplay();
        }
        console.log('Navigation: Move waypoint selection down');
    }

    static executeRoute(mfd) {
        console.log('Navigation: Execute route requested');
        // Implementation would tell mission computer to activate route
    }

    static directToWaypoint(mfd) {
        const state = mfd.getPageState('navigation');
        const selectedIndex = state.routeView.selectedWaypoint;
        console.log(`Navigation: Direct to waypoint ${selectedIndex} requested`);
        // Implementation would set direct course to selected waypoint
    }

    // Keyboard Input Handler
    static handleKeyboardInput(mfd, data) {
        console.log('Navigation page received keyboard input:', data);
        
        if (data.context === 'waypoint_add') {
            // Add waypoint with the entered name
            console.log(`Adding waypoint: ${data.input}`);
            // Implementation would add to mission computer
        } else if (data.context.startsWith('waypoint_edit_')) {
            // Edit waypoint
            const index = data.context.split('_')[2];
            console.log(`Editing waypoint ${index}: ${data.input}`);
            // Implementation would update waypoint in mission computer
        }
    }
}

export default NavigationPage;