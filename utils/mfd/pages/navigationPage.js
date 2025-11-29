// utils/mfd/pages/navigationPage.js
//

import { drawNavigationDisplay } from '/game/systems/navComputer/navComputer.js';
import gameStateInstance from '/game/state.js';
import missionComputer from '/game/systems/missionComputer/missionComputer.js';
import { formatLatitude, formatLongitude, parseCoordinateInput } from '/utils/coordinates.js';

class NavigationPage {
    static init(mfd) {
        // Load persistent settings from game state
        const savedDisplayMode = gameStateInstance.getProperty('navigation.displaySettings.displayMode') || 'ARC';

        // Default overlay settings
        const defaultOverlays = {
            route: true,
            waypoints: true,
            contours: true,  // ALWAYS default to true
            hazards: true,
            traffic: false,
            latLonGrid: true
        };

        // Get saved overlays from game state
        const savedOverlays = gameStateInstance.getProperty('navigation.displaySettings.overlaysVisible');

        // Merge: use saved values if they exist, otherwise use defaults
        // Special handling: contours should default to true unless explicitly saved as false by user
        let overlaysVisible;
        if (savedOverlays) {
            overlaysVisible = { ...defaultOverlays, ...savedOverlays };
            // If this is the first load and contours wasn't explicitly set, default to true
            if (savedOverlays.contours === undefined) {
                overlaysVisible.contours = true;
            }
        } else {
            overlaysVisible = defaultOverlays;
        }

        // Initialize navigation page state with saved settings
        const defaultState = {
            mode: 'map', // 'map', 'overlays', 'route'
            displayMode: savedDisplayMode,
            overlaysVisible: overlaysVisible,
            selectedOverlay: null,
            routeView: {
                selectedWaypoint: 0,
                editMode: false
            }
        };

        mfd.setPageState(defaultState, 'navigation');
        console.log('NAV COMPUTER.....ONLINE');
        console.log('Overlays initialized:', overlaysVisible);
    }

    static getSoftKeys(mfd) {
        const state = mfd.getPageState('navigation');

        switch (state.mode) {
            case 'overlays':
                return this.getOverlaySoftKeys(mfd, state);
            case 'waypoint':
                return this.getWaypointSoftKeys(mfd, state);
            case 'route':
                return this.getRouteSoftKeys(mfd, state);
            default: // 'map'
                return this.getMapSoftKeys(mfd, state);
        }
    }

    // Main menu. Basic map controls and submenu access
    static getMapSoftKeys(mfd, state) {
    const range = gameStateInstance.getProperty("displaySettings.navDisplayRange") || 10;
    const displayMode = state.displayMode || 'ARC';
    // Get soft keys for map mode
    return {
        // L1-L5, C1-C5, R1-R5 (15 buttons)
        labels: [
            '▲',           // L1: Range up
            `${range}`,    // L2: Display range selected
            '▼',           // L3: Range down
            displayMode,   // L4: Display mode ARC/PLAN/ROSE
            'SHOW',        // L5: Overlays selection
            '', '', '', '', '',  // C1-C5: Empty for nav page
            'WYPT',        // R1: Waypoint management menu
            '', '', '', ''       // R2-R5: Empty
        ],
        actions: [ // Not sure if this is still used
            () => this.changeRange(mfd, 1),        // L1
            null,                                   // L2
            () => this.changeRange(mfd, -1),       // L3
            () => this.cycleDisplayMode(mfd),      // L4
            () => this.setMode(mfd, 'overlays'),   // L5
            null, null, null, null, null,          // C1-C5
            () => this.setMode(mfd, 'waypoint'),   // R1
            null, null, null, null                 // R2-R5
        ],
        states: [ // Not sure if this is still used
            { type: 'momentary', selected: false },  // L1: Range up arrow
            null,                                     // L2: Range display (no button state)
            { type: 'momentary', selected: false },  // L3: Range down arrow
            { type: 'momentary', selected: false },  // L4: Display mode cycle
            { type: 'momentary', selected: false },  // L5: SHOW overlays menu
            null, null, null, null, null,            // C1-C5
            { type: 'momentary', selected: false },  // R1: ROUTE menu
            null, null, null, null                   // R2-R5
        ]
    };
    }

    // Overlay managment menu for toggling different map overlays
    static getOverlaySoftKeys(mfd, state) {
        return {
            // L1-L5, C1-C5, R1-R5 (15 buttons)
            labels: [
                'ROUTE',    // L1 shows route lines and route waypoints
                'WAYPTS',   // L2 shows all navigation waypoints (Should be moved to R1)
                'CONTOUR',  // L3 shows terrain contours
                'LAT/LON',  // L4 shows lat/lon grid (for PLAN view)
                'SHOW',     // L5 back to main menu
                '', '', '', '', '',  // C1-C5: Empty
                'HAZARDS',  // R1 shows all science waypoints (move to R2 and rename)
                'TRAFFIC',  // R2 show all traffic or biological hazards (move to R3 and rename)
                '',         // R3
                'ALL ON',   // R4
                'ALL OFF'   // R5
            ],
            actions: [
                () => this.toggleOverlay(mfd, 'route'),     // L1
                () => this.toggleOverlay(mfd, 'waypoints'), // L2
                () => this.toggleOverlay(mfd, 'contours'),  // L3
                () => this.toggleOverlay(mfd, 'latLonGrid'), // L4
                () => this.backToMap(mfd),                  // L5
                null, null, null, null, null,               // C1-C5
                () => this.toggleOverlay(mfd, 'hazards'),   // R1
                () => this.toggleOverlay(mfd, 'traffic'),   // R2
                null,                                       // R3
                () => this.allOverlaysOn(mfd),              // R4
                () => this.allOverlaysOff(mfd)              // R5
            ],
            states: [
                { type: 'toggle', selected: state.overlaysVisible.route },      // L1
                { type: 'toggle', selected: state.overlaysVisible.waypoints },  // L2
                { type: 'toggle', selected: state.overlaysVisible.contours },   // L3
                { type: 'toggle', selected: state.overlaysVisible.latLonGrid }, // L4
                { type: 'momentary', selected: false },                         // L5: SHOW (back button)
                null, null, null, null, null,                                   // C1-C5
                { type: 'toggle', selected: state.overlaysVisible.hazards },    // R1
                { type: 'toggle', selected: state.overlaysVisible.traffic },    // R2
                null,                                                            // R3
                { type: 'momentary', selected: false },                         // R4: ALL ON
                { type: 'momentary', selected: false }                          // R5: ALL OFF
            ]
        };
    }

    static getWaypointSoftKeys(mfd, state) {
        const construction = gameStateInstance.getProperty('navigation.waypointConstruction');

        // If in construction mode, show context-specific soft keys
        if (construction && construction.active) {
            return this.getWaypointConstructionSoftKeys(mfd, construction);
        }

        // Default waypoint management menu
        return {
            // L1-L5, C1-C5, R1-R5 (15 buttons)
            labels: [
                'ADD',      // L1: Add new waypoint
                'EDIT',     // L2: Edit waypoint
                'DELETE',   // L3: Delete waypoint
                'LIST',     // L4: List all waypoints
                'BACK',     // L5: Back to map
                '', '', '', '', '',  // C1-C5: Empty
                '',         // R1
                '',         // R2
                '',         // R3
                '',         // R4
                ''          // R5
            ],
            actions: [
                () => this.startAddWaypoint(mfd),     // L1
                () => this.startEditWaypoint(mfd),    // L2
                () => this.startDeleteWaypoint(mfd),  // L3
                () => this.showWaypointList(mfd),     // L4
                () => this.backToMap(mfd),            // L5
                null, null, null, null, null,         // C1-C5
                null, null, null, null, null          // R1-R5
            ],
            states: [
                { type: 'momentary', selected: false },  // L1: ADD
                { type: 'momentary', selected: false },  // L2: EDIT
                { type: 'momentary', selected: false },  // L3: DELETE
                { type: 'momentary', selected: false },  // L4: LIST
                { type: 'momentary', selected: false },  // L5: BACK
                null, null, null, null, null,            // C1-C5
                null, null, null, null, null             // R1-R5
            ]
        };
    }

    static getWaypointConstructionSoftKeys(mfd, construction) {
        // Edit/Delete selection mode
        if (construction.mode === 'edit_select' || construction.mode === 'delete_select') {
            const isEdit = construction.mode === 'edit_select';
            return {
                labels: [
                    'UP',       // L1: Previous waypoint
                    'DOWN',     // L2: Next waypoint
                    '',         // L3
                    isEdit ? 'EDIT' : 'DELETE',  // L4: Confirm action
                    'CANCEL',   // L5
                    '', '', '', '', '',
                    '', '', '', '', ''
                ],
                actions: [
                    () => this.selectPreviousWaypoint(mfd),
                    () => this.selectNextWaypoint(mfd),
                    null,
                    isEdit ? () => this.confirmEditSelection(mfd) : () => this.confirmDeleteSelection(mfd),
                    () => this.cancelWaypointConstruction(mfd),
                    null, null, null, null, null,
                    null, null, null, null, null
                ],
                states: Array(15).fill({ type: 'momentary', selected: false })
            };
        }

        // Category selection (step 4)
        if (construction.step === 4) {
            return {
                labels: [
                    'NAV',      // L1
                    'SCI',      // L2
                    'HAZ',      // L3
                    'POI',      // L4
                    'CANCEL',   // L5
                    '', '', '', '', '',
                    '', '', '', '', ''
                ],
                actions: [
                    () => this.selectCategory(mfd, 'NAV'),
                    () => this.selectCategory(mfd, 'SCI'),
                    () => this.selectCategory(mfd, 'HAZ'),
                    () => this.selectCategory(mfd, 'POI'),
                    () => this.cancelWaypointConstruction(mfd),
                    null, null, null, null, null,
                    null, null, null, null, null
                ],
                states: Array(15).fill({ type: 'momentary', selected: false })
            };
        }

        // Type selection (step 5)
        if (construction.step === 5) {
            const types = missionComputer.getWaypointTypes();
            const categoryTypes = types[construction.data.category];

            return {
                labels: [
                    categoryTypes[0] || '',
                    categoryTypes[1] || '',
                    categoryTypes[2] || '',
                    categoryTypes[3] || '',
                    'CANCEL',
                    '', '', '', '', '',
                    '', '', '', '', ''
                ],
                actions: [
                    categoryTypes[0] ? () => this.selectType(mfd, categoryTypes[0]) : null,
                    categoryTypes[1] ? () => this.selectType(mfd, categoryTypes[1]) : null,
                    categoryTypes[2] ? () => this.selectType(mfd, categoryTypes[2]) : null,
                    categoryTypes[3] ? () => this.selectType(mfd, categoryTypes[3]) : null,
                    () => this.cancelWaypointConstruction(mfd),
                    null, null, null, null, null,
                    null, null, null, null, null
                ],
                states: Array(15).fill({ type: 'momentary', selected: false })
            };
        }

        // Confirmation (step 6)
        if (construction.step === 6) {
            return {
                labels: [
                    'SAVE',     // L1
                    '',         // L2
                    '',         // L3
                    '',         // L4
                    'CANCEL',   // L5
                    '', '', '', '', '',
                    '', '', '', '', ''
                ],
                actions: [
                    () => this.saveWaypoint(mfd),
                    null, null, null,
                    () => this.cancelWaypointConstruction(mfd),
                    null, null, null, null, null,
                    null, null, null, null, null
                ],
                states: Array(15).fill({ type: 'momentary', selected: false })
            };
        }

        // Default: during keyboard input (steps 0-3)
        return {
            labels: [
                'PPOS',     // L1: Capture present position
                '',         // L2
                '',         // L3
                '',         // L4
                'CANCEL',   // L5
                '', '', '', '', '',
                '', '', '', '', ''
            ],
            actions: [
                () => this.handlePPOS(mfd),
                null, null, null,
                () => this.cancelWaypointConstruction(mfd),
                null, null, null, null, null,
                null, null, null, null, null
            ],
            states: Array(15).fill({ type: 'momentary', selected: false })
        };
    }

    static getRouteSoftKeys(mfd, state) {
        return {
            // L1-L5, C1-C5, R1-R5 (15 buttons)
            labels: [
                'ADD',      // L1
                'EDIT',     // L2
                'DELETE',   // L3
                '',         // L4
                'BACK',     // L5
                '', '', '', '', '',  // C1-C5: Empty
                'UP',       // R1
                'DOWN',     // R2
                'EXEC',     // R3
                '',         // R4
                'DIRECT'    // R5
            ],
            actions: [
                () => this.addWaypoint(mfd),         // L1
                () => this.editWaypoint(mfd),        // L2
                () => this.deleteWaypoint(mfd),      // L3
                null,                                // L4
                () => this.backToMap(mfd),           // L5
                null, null, null, null, null,        // C1-C5
                () => this.moveWaypointUp(mfd),      // R1
                () => this.moveWaypointDown(mfd),    // R2
                () => this.executeRoute(mfd),        // R3
                null,                                // R4
                () => this.directToWaypoint(mfd)     // R5
            ],
            states: [
                { type: 'momentary', selected: false },  // L1: ADD
                { type: 'momentary', selected: false },  // L2: EDIT
                { type: 'momentary', selected: false },  // L3: DELETE
                null,                                     // L4
                { type: 'momentary', selected: false },  // L5: BACK
                null, null, null, null, null,            // C1-C5
                { type: 'momentary', selected: false },  // R1: UP
                { type: 'momentary', selected: false },  // R2: DOWN
                { type: 'momentary', selected: false },  // R3: EXEC
                null,                                     // R4
                { type: 'momentary', selected: false }   // R5: DIRECT
            ]
        };
    }

    static render(mfd, currentGameState) {
        const canvas = mfd.getDisplayCanvas();
        const svg = mfd.getDisplaySVG();
        const state = mfd.getPageState('navigation');
        
        if (!canvas || !svg) return;

        // Clear SVG overlays
        svg.innerHTML = '';

        // Use passed game state (push-based, no pulling from gameStateInstance)
        const navState = {
            range: currentGameState.range,
            ownshipTrack: currentGameState.course,
            selectedHeading: currentGameState.heading,
            ownshipPosition: currentGameState.location?.geometry?.coordinates || [-70.6709, 41.5223],
            overlays: state.overlaysVisible,
            displayMode: state.displayMode || 'ARC'
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

    static changeRange(mfd, direction) {
        const currentRange = gameStateInstance.getProperty("displaySettings.navDisplayRange") || 10;
        // Range sequence: Each step doubles the previous (5, 10, 20, 40, 80, 160, 320, 640, 1280, 2560)
        const ranges = [5, 10, 20, 40, 80, 160, 320, 640, 1280, 2560];
        const currentIndex = ranges.indexOf(currentRange);

        let newIndex;
        if (direction > 0) {
            // Increase range
            newIndex = currentIndex < ranges.length - 1 ? currentIndex + 1 : ranges.length - 1;
        } else {
            // Decrease range
            newIndex = currentIndex > 0 ? currentIndex - 1 : 0;
        }

        const newRange = ranges[newIndex];
        gameStateInstance.updateProperty("displaySettings.navDisplayRange", newRange);
        mfd.needsRedraw = true; // Force redraw
        console.log(`NAV RANGE: ${newRange} NM`);
    }

    static setMode(mfd, newMode) {
        const state = mfd.getPageState('navigation');
        state.mode = newMode;
        mfd.setPageState(state, 'navigation');
        mfd.setupPageSoftKeys('navigation');
        mfd.needsRedraw = true; // Force redraw
        // Mode switched
    }

    static cycleDisplayMode(mfd) {
        const state = mfd.getPageState('navigation');
        const modes = ['ARC', 'PLAN', 'ROSE'];
        const currentIndex = modes.indexOf(state.displayMode || 'ARC');
        const nextIndex = (currentIndex + 1) % modes.length;

        state.displayMode = modes[nextIndex];
        mfd.setPageState(state, 'navigation');

        // Save to game state for persistence
        gameStateInstance.updateProperty(
            'navigation.displaySettings.displayMode',
            state.displayMode
        );

        mfd.setupPageSoftKeys('navigation');  // Update button labels
        mfd.needsRedraw = true;  // Force redraw
        console.log(`NAV DISPLAY: ${state.displayMode} MODE`);
    }

    static showOverlays(mfd) {
        const state = mfd.getPageState('navigation');
        state.mode = 'overlays';
        mfd.setPageState(state, 'navigation');
        mfd.setupPageSoftKeys('navigation');
        // Display updates are handled by station manager
    }

    static showRoute(mfd) {
        const state = mfd.getPageState('navigation');
        state.mode = 'route';
        mfd.setPageState(state, 'navigation');
        mfd.setupPageSoftKeys('navigation');
        // Display updates are handled by station manager
    }

    static showMenu(mfd) {
        // Could show main menu or switch to different MFD page
    }

    static toggleZoom(mfd) {
        // Toggle between different zoom levels or display modes
    }

    static showInfo(mfd) {
        // Show navigation information panel
    }

    static backToMap(mfd) {
        const state = mfd.getPageState('navigation');
        state.mode = 'map';
        mfd.setPageState(state, 'navigation');
        mfd.setupPageSoftKeys('navigation');
        // Display updates are handled by station manager
    }

    // Overlay Control Methods
    static toggleOverlay(mfd, overlayName) {
        const state = mfd.getPageState('navigation');
        state.overlaysVisible[overlayName] = !state.overlaysVisible[overlayName];
        mfd.setPageState(state, 'navigation');

        // Save to game state for persistence
        gameStateInstance.updateProperty(
            `navigation.displaySettings.overlaysVisible.${overlayName}`,
            state.overlaysVisible[overlayName]
        );

        // Display updates are handled by station manager
        console.log(`OVERLAY [${overlayName.toUpperCase()}]: ${state.overlaysVisible[overlayName] ? 'ENABLED' : 'DISABLED'}`);
    }

    static allOverlaysOn(mfd) {
        const state = mfd.getPageState('navigation');
        Object.keys(state.overlaysVisible).forEach(key => {
            state.overlaysVisible[key] = true;
        });
        mfd.setPageState(state, 'navigation');

        // Save to game state for persistence
        gameStateInstance.updateProperty(
            'navigation.displaySettings.overlaysVisible',
            state.overlaysVisible
        );

        // Display updates are handled by station manager
        console.log('ALL OVERLAYS: ENABLED');
    }

    static allOverlaysOff(mfd) {
        const state = mfd.getPageState('navigation');
        Object.keys(state.overlaysVisible).forEach(key => {
            state.overlaysVisible[key] = false;
        });
        mfd.setPageState(state, 'navigation');

        // Save to game state for persistence
        gameStateInstance.updateProperty(
            'navigation.displaySettings.overlaysVisible',
            state.overlaysVisible
        );

        // Display updates are handled by station manager
        console.log('ALL OVERLAYS: DISABLED');
    }

    // ========================================
    // WAYPOINT MANAGEMENT METHODS
    // ========================================

    /**
     * Start the ADD waypoint workflow
     * Step 1: Request waypoint name
     */
    static startAddWaypoint(mfd) {
        // Get current position as defaults
        const currentPos = missionComputer.getCurrentPosition();

        // Initialize waypoint construction state
        gameStateInstance.updateProperty('navigation.waypointConstruction', {
            active: true,
            mode: 'add',
            step: 0,
            data: {
                lat: currentPos.lat,
                lon: currentPos.lon,
                depth: currentPos.depth,
                category: 'NAV',
                type: 'HARBOUR'
            }
        });

        // Request name input
        mfd.requestKeyboardInput('WPT NAME: ', 'waypoint_construct_name', 5);
        mfd.needsRedraw = true;
    }

    /**
     * Start EDIT waypoint workflow
     */
    static startEditWaypoint(mfd) {
        const waypoints = gameStateInstance.getAllWaypoints();

        if (waypoints.length === 0) {
            console.log('NO WAYPOINTS TO EDIT');
            return;
        }

        // Initialize edit selection state
        gameStateInstance.updateProperty('navigation.waypointConstruction', {
            active: true,
            mode: 'edit_select',
            step: 0,
            editingId: null,
            data: {
                selectedIndex: 0,
                waypoints: waypoints
            }
        });

        mfd.setupPageSoftKeys('navigation');
        mfd.needsRedraw = true;
    }

    /**
     * Start DELETE waypoint workflow
     */
    static startDeleteWaypoint(mfd) {
        const waypoints = gameStateInstance.getAllWaypoints();

        if (waypoints.length === 0) {
            console.log('NO WAYPOINTS TO DELETE');
            return;
        }

        // Initialize delete selection state
        gameStateInstance.updateProperty('navigation.waypointConstruction', {
            active: true,
            mode: 'delete_select',
            step: 0,
            data: {
                selectedIndex: 0,
                waypoints: waypoints
            }
        });

        mfd.setupPageSoftKeys('navigation');
        mfd.needsRedraw = true;
    }

    /**
     * Show list of all waypoints
     */
    static showWaypointList(mfd) {
        const waypoints = missionComputer.getAllWaypointsWithNavData();

        if (waypoints.length === 0) {
            console.log('NO WAYPOINTS');
            return;
        }

        // Sort by distance
        waypoints.sort((a, b) => a.distance - b.distance);

        console.log('=== WAYPOINTS ===');
        waypoints.forEach((wpt, index) => {
            const dist = wpt.distance.toFixed(1);
            const brg = Math.round(wpt.bearing);
            console.log(`${index + 1}. ${wpt.name} - ${wpt.category}/${wpt.type} - ${dist}NM @ ${brg}°`);
        });
    }

    /**
     * Navigate waypoint list selection
     */
    static selectNextWaypoint(mfd) {
        const construction = gameStateInstance.getProperty('navigation.waypointConstruction');
        if (!construction || !construction.data.waypoints) return;

        const maxIndex = construction.data.waypoints.length - 1;
        if (construction.data.selectedIndex < maxIndex) {
            construction.data.selectedIndex++;
            gameStateInstance.updateProperty('navigation.waypointConstruction', construction);
            mfd.needsRedraw = true;
        }
    }

    static selectPreviousWaypoint(mfd) {
        const construction = gameStateInstance.getProperty('navigation.waypointConstruction');
        if (!construction || !construction.data.waypoints) return;

        if (construction.data.selectedIndex > 0) {
            construction.data.selectedIndex--;
            gameStateInstance.updateProperty('navigation.waypointConstruction', construction);
            mfd.needsRedraw = true;
        }
    }

    /**
     * Confirm edit waypoint selection
     */
    static confirmEditSelection(mfd) {
        const construction = gameStateInstance.getProperty('navigation.waypointConstruction');
        const waypoint = construction.data.waypoints[construction.data.selectedIndex];

        // Set up edit mode with current waypoint data
        construction.mode = 'edit';
        construction.step = 0;
        construction.editingId = waypoint.id;
        construction.data = {
            name: waypoint.name,
            lat: waypoint.geometry.coordinates[1],
            lon: waypoint.geometry.coordinates[0],
            depth: waypoint.depth,
            category: waypoint.category,
            type: waypoint.type
        };

        gameStateInstance.updateProperty('navigation.waypointConstruction', construction);

        // Start edit workflow with name input
        mfd.requestKeyboardInput(`NAME [${waypoint.name}]: `, 'waypoint_construct_name', 5);
        mfd.needsRedraw = true;
    }

    /**
     * Confirm delete waypoint selection
     */
    static confirmDeleteSelection(mfd) {
        const construction = gameStateInstance.getProperty('navigation.waypointConstruction');
        const waypoint = construction.data.waypoints[construction.data.selectedIndex];

        // Check if this is a system waypoint
        if (waypoint.source !== 'user') {
            console.log('ERROR: Cannot delete system waypoint');
            return;
        }

        const result = missionComputer.deleteWaypoint(waypoint.id);

        if (result.success) {
            console.log(`WAYPOINT DELETED: ${waypoint.name}`);

            // Clear construction state
            gameStateInstance.updateProperty('navigation.waypointConstruction', {
                active: false,
                mode: null,
                step: 0,
                data: {}
            });

            // Return to waypoint menu
            this.setMode(mfd, 'waypoint');
        } else {
            console.log(`ERROR: ${result.error}`);
        }
    }

    /**
     * Handle PPOS button press during waypoint construction
     */
    static handlePPOS(mfd) {
        const construction = gameStateInstance.getProperty('navigation.waypointConstruction');

        if (!construction || !construction.active) {
            console.log('PPOS: No active waypoint construction');
            return;
        }

        // Capture current position
        const currentPos = missionComputer.getCurrentPosition();
        construction.data.lat = currentPos.lat;
        construction.data.lon = currentPos.lon;
        construction.data.depth = currentPos.depth;

        gameStateInstance.updateProperty('navigation.waypointConstruction', construction);

        console.log(`PPOS CAPTURED: ${formatLatitude(currentPos.lat)}, ${formatLongitude(currentPos.lon)}, ${currentPos.depth}m`);
        mfd.needsRedraw = true;
    }

    /**
     * Handle keyboard input for waypoint construction
     */
    static handleKeyboardInput(mfd, data) {
        const construction = gameStateInstance.getProperty('navigation.waypointConstruction');

        if (!construction || !construction.active) return;

        switch (data.context) {
            case 'waypoint_construct_name':
                this.handleNameInput(mfd, data.input);
                break;
            case 'waypoint_construct_lat':
                this.handleLatitudeInput(mfd, data.input);
                break;
            case 'waypoint_construct_lon':
                this.handleLongitudeInput(mfd, data.input);
                break;
            case 'waypoint_construct_depth':
                this.handleDepthInput(mfd, data.input);
                break;
        }
    }

    /**
     * Handle name input (Step 1)
     */
    static handleNameInput(mfd, name) {
        const construction = gameStateInstance.getProperty('navigation.waypointConstruction');

        if (!name || name.trim() === '') {
            console.log('ERROR: Name cannot be empty');
            return;
        }

        if (name.length > 5) {
            console.log('ERROR: Name must be 5 characters or less');
            return;
        }

        construction.data.name = name.toUpperCase();
        construction.step = 1;
        gameStateInstance.updateProperty('navigation.waypointConstruction', construction);

        // Move to latitude input
        const latStr = formatLatitude(construction.data.lat);
        mfd.requestKeyboardInput(`LAT [${latStr}]: `, 'waypoint_construct_lat', 15);
        mfd.needsRedraw = true;
    }

    /**
     * Handle latitude input (Step 2)
     */
    static handleLatitudeInput(mfd, input) {
        const construction = gameStateInstance.getProperty('navigation.waypointConstruction');

        // If empty, keep current value
        if (!input || input.trim() === '') {
            construction.step = 2;
            gameStateInstance.updateProperty('navigation.waypointConstruction', construction);

            const lonStr = formatLongitude(construction.data.lon);
            mfd.requestKeyboardInput(`LON [${lonStr}]: `, 'waypoint_construct_lon', 15);
            mfd.needsRedraw = true;
            return;
        }

        // Parse input
        const lat = parseCoordinateInput(input, 'lat');
        if (lat === null) {
            console.log('ERROR: Invalid latitude format');
            return;
        }

        if (lat < -90 || lat > 90) {
            console.log('ERROR: Latitude must be between -90 and 90');
            return;
        }

        construction.data.lat = lat;
        construction.step = 2;
        gameStateInstance.updateProperty('navigation.waypointConstruction', construction);

        // Move to longitude input
        const lonStr = formatLongitude(construction.data.lon);
        mfd.requestKeyboardInput(`LON [${lonStr}]: `, 'waypoint_construct_lon', 15);
        mfd.needsRedraw = true;
    }

    /**
     * Handle longitude input (Step 3)
     */
    static handleLongitudeInput(mfd, input) {
        const construction = gameStateInstance.getProperty('navigation.waypointConstruction');

        // If empty, keep current value
        if (!input || input.trim() === '') {
            construction.step = 3;
            gameStateInstance.updateProperty('navigation.waypointConstruction', construction);

            mfd.requestKeyboardInput(`DEPTH [${construction.data.depth}m]: `, 'waypoint_construct_depth', 6);
            mfd.needsRedraw = true;
            return;
        }

        // Parse input
        const lon = parseCoordinateInput(input, 'lon');
        if (lon === null) {
            console.log('ERROR: Invalid longitude format');
            return;
        }

        if (lon < -180 || lon > 180) {
            console.log('ERROR: Longitude must be between -180 and 180');
            return;
        }

        construction.data.lon = lon;
        construction.step = 3;
        gameStateInstance.updateProperty('navigation.waypointConstruction', construction);

        // Move to depth input
        mfd.requestKeyboardInput(`DEPTH [${construction.data.depth}m]: `, 'waypoint_construct_depth', 6);
        mfd.needsRedraw = true;
    }

    /**
     * Handle depth input (Step 4)
     */
    static handleDepthInput(mfd, input) {
        const construction = gameStateInstance.getProperty('navigation.waypointConstruction');

        // If empty, keep current value
        if (!input || input.trim() === '') {
            construction.step = 4;
            gameStateInstance.updateProperty('navigation.waypointConstruction', construction);
            this.showCategorySelection(mfd);
            return;
        }

        const depth = parseFloat(input);
        if (isNaN(depth)) {
            console.log('ERROR: Invalid depth value');
            return;
        }

        if (depth < 0 || depth > 11000) {
            console.log('ERROR: Depth must be between 0 and 11000 meters');
            return;
        }

        construction.data.depth = depth;
        construction.step = 4;
        gameStateInstance.updateProperty('navigation.waypointConstruction', construction);

        // Move to category selection
        this.showCategorySelection(mfd);
    }

    /**
     * Show category selection (Step 5)
     */
    static showCategorySelection(mfd) {
        const construction = gameStateInstance.getProperty('navigation.waypointConstruction');
        construction.step = 4;
        gameStateInstance.updateProperty('navigation.waypointConstruction', construction);

        // Update soft keys to show category options
        mfd.setupPageSoftKeys('navigation');
        mfd.needsRedraw = true;
        console.log('SELECT CATEGORY: NAV/SCI/HAZ/POI');
    }

    /**
     * Select waypoint category
     */
    static selectCategory(mfd, category) {
        const construction = gameStateInstance.getProperty('navigation.waypointConstruction');
        construction.data.category = category;

        // Set default type for category
        const types = missionComputer.getWaypointTypes();
        construction.data.type = types[category][0];

        construction.step = 5;
        gameStateInstance.updateProperty('navigation.waypointConstruction', construction);

        // Show type selection
        this.showTypeSelection(mfd);
    }

    /**
     * Show type selection (Step 6)
     */
    static showTypeSelection(mfd) {
        mfd.setupPageSoftKeys('navigation');
        mfd.needsRedraw = true;
        console.log('SELECT TYPE');
    }

    /**
     * Select waypoint type
     */
    static selectType(mfd, type) {
        const construction = gameStateInstance.getProperty('navigation.waypointConstruction');
        construction.data.type = type;
        construction.step = 6;
        gameStateInstance.updateProperty('navigation.waypointConstruction', construction);

        // Show confirmation
        this.showWaypointConfirmation(mfd);
    }

    /**
     * Show confirmation (Step 7)
     */
    static showWaypointConfirmation(mfd) {
        mfd.setupPageSoftKeys('navigation');
        mfd.needsRedraw = true;
        console.log('CONFIRM WAYPOINT');
    }

    /**
     * Save the waypoint (handles both add and edit)
     */
    static saveWaypoint(mfd) {
        const construction = gameStateInstance.getProperty('navigation.waypointConstruction');

        let result;
        if (construction.mode === 'edit' && construction.editingId) {
            // Update existing waypoint
            result = missionComputer.updateWaypoint(construction.editingId, construction.data);

            if (result.success) {
                const waypoint = gameStateInstance.getWaypoint(construction.editingId);
                console.log(`WAYPOINT UPDATED: ${waypoint.name}`);
            }
        } else {
            // Create new waypoint
            result = missionComputer.createWaypoint(construction.data);

            if (result.success) {
                console.log(`WAYPOINT CREATED: ${result.waypoint.name}`);
            }
        }

        if (result.success) {
            // Clear construction state
            gameStateInstance.updateProperty('navigation.waypointConstruction', {
                active: false,
                mode: null,
                step: 0,
                data: {}
            });

            // Return to waypoint menu
            this.setMode(mfd, 'waypoint');
        } else {
            console.log(`ERROR: ${result.error}`);
        }
    }

    /**
     * Cancel waypoint construction
     */
    static cancelWaypointConstruction(mfd) {
        gameStateInstance.updateProperty('navigation.waypointConstruction', {
            active: false,
            mode: null,
            step: 0,
            data: {}
        });

        this.setMode(mfd, 'waypoint');
        console.log('WAYPOINT CONSTRUCTION: CANCELLED');
    }

    // ========================================
    // ROUTE MANAGEMENT METHODS (Legacy - for routes feature)
    // ========================================

    static addWaypoint(mfd) {
        mfd.requestKeyboardInput('WPT NAME: ', 'waypoint_add', 8);
    }

    static editWaypoint(mfd) {
        const state = mfd.getPageState('navigation');
        const selectedIndex = state.routeView.selectedWaypoint;
        mfd.requestKeyboardInput('EDIT WPT: ', `waypoint_edit_${selectedIndex}`, 8);
    }

    static deleteWaypoint(mfd) {
        const state = mfd.getPageState('navigation');
        const selectedIndex = state.routeView.selectedWaypoint;
        console.log(`WAYPOINT ${selectedIndex + 1}: DELETED`);
    }

    static moveWaypointUp(mfd) {
        const state = mfd.getPageState('navigation');
        if (state.routeView.selectedWaypoint > 0) {
            state.routeView.selectedWaypoint--;
            mfd.setPageState(state, 'navigation');
        }
    }

    static moveWaypointDown(mfd) {
        const state = mfd.getPageState('navigation');
        const maxWaypoints = 4;
        if (state.routeView.selectedWaypoint < maxWaypoints - 1) {
            state.routeView.selectedWaypoint++;
            mfd.setPageState(state, 'navigation');
        }
    }

    static executeRoute(mfd) {
        console.log('ROUTE: EXECUTING');
    }

    static directToWaypoint(mfd) {
        const state = mfd.getPageState('navigation');
        const selectedIndex = state.routeView.selectedWaypoint;
        console.log(`DIRECT TO: WAYPOINT ${selectedIndex + 1}`);
    }
}

export default NavigationPage;