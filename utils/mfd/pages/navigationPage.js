// utils/mfd/pages/navigationPage.js
//

import gameStateInstance from '/game/state.js';
import missionComputer from '/game/systems/missionComputer/missionComputer.js';
import { formatLatitude, formatLongitude, parseCoordinateInput } from '/utils/coordinates.js';
import { WaypointBuilder, RouteBuilder, WORKFLOW_STAGES } from '/utils/waypoints/routeBuilder.js';

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
            traffic: true,
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
            'ROUTE',       // R2: Route management menu
            '', '', ''       // R3-R5: Empty
        ],
        actions: [ // Not sure if this is still used
            () => this.changeRange(mfd, 1),        // L1
            null,                                   // L2
            () => this.changeRange(mfd, -1),       // L3
            () => this.cycleDisplayMode(mfd),      // L4
            () => this.setMode(mfd, 'overlays'),   // L5
            null, null, null, null, null,          // C1-C5
            () => this.setMode(mfd, 'waypoint'),   // R1
            () => this.setMode(mfd, 'route'),      // R2
            null, null, null                 // R3-R5
        ],
        states: [ // Not sure if this is still used
            { type: 'momentary', selected: false },  // L1: Range up arrow
            null,                                     // L2: Range display (no button state)
            { type: 'momentary', selected: false },  // L3: Range down arrow
            { type: 'momentary', selected: false },  // L4: Display mode cycle
            { type: 'momentary', selected: false },  // L5: SHOW overlays menu
            null, null, null, null, null,            // C1-C5
            { type: 'momentary', selected: false },  // R1: Waypoint menu
            { type: 'momentary', selected: false },  // R2: Route menu
            null, null, null                   // R3-R5
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
                '',         // L5 
                '', '', '', '', '',  // C1-C5: Empty
                '',         // R1
                '',         // R2
                '',         // R3
                '',         // R4
                'BACK'      // R5 Back to map
            ],
            actions: [
                () => this.startAddWaypoint(mfd),     // L1
                () => this.startEditWaypoint(mfd),    // L2
                () => this.startDeleteWaypoint(mfd),  // L3
                () => this.showWaypointList(mfd),     // L4
                null,                                 // L5
                null, null, null, null, null,         // C1-C5
                null, null, null, null,               // R1-R4    
                () => this.backToMap(mfd)            // R5
            ],
            states: [
                { type: 'momentary', selected: false },  // L1: ADD
                { type: 'momentary', selected: false },  // L2: EDIT
                { type: 'momentary', selected: false },  // L3: DELETE
                { type: 'momentary', selected: false },  // L4: LIST
                null,                                    // L5
                null, null, null, null, null,            // C1-C5
                null, null, null, null,                  // R1-R4
                { type: 'momentary', selected: false }   // R5: BACK
            ]
        };
    }

    static getWaypointConstructionSoftKeys(mfd, construction) {
        // List mode - show all waypoints with pagination
        if (construction.mode === 'list') {
            const waypoints = construction.data.waypoints || [];
            const offset = construction.data.listOffset || 0;
            const pageSize = construction.data.listPageSize || 10;
            const hasMore = (offset + pageSize) < waypoints.length;
            const hasPrevious = offset > 0;

            return {
                labels: [
                    hasPrevious ? 'UP' : '', '', '', '', '',
                    '', '', '', '', '',
                    '', '', '', '', hasMore ? 'DOWN' : 'CLOSE'
                ],
                actions: [
                    hasPrevious ? () => this.listPageUp(mfd) : null,
                    null, null, null, null,
                    null, null, null, null, null,
                    null, null, null, null,
                    hasMore ? () => this.listPageDown(mfd) : () => this.cancelWaypointConstruction(mfd)
                ],
                states: Array(15).fill({ type: 'momentary', selected: false })
            };
        }

        // Edit/Delete selection mode
        if (construction.mode === 'edit_select' || construction.mode === 'delete_select') {
            const isEdit = construction.mode === 'edit_select';
            return {
                labels: [
                    'UP', 'DOWN', '', isEdit ? 'EDIT' : 'DELETE', '',
                    '', '', '', '', '',
                    '', '', '', '', 'CANCEL'  // R5
                ],
                actions: [
                    () => this.selectPreviousWaypoint(mfd),
                    () => this.selectNextWaypoint(mfd),
                    null,
                    isEdit ? () => this.confirmEditSelection(mfd) : () => this.confirmDeleteSelection(mfd),
                    null,
                    null, null, null, null, null,
                    null, null, null, null,
                    () => this.cancelWaypointConstruction(mfd)  // R5
                ],
                states: Array(15).fill({ type: 'momentary', selected: false })
            };
        }

        // Get builder to determine current stage
        const builder = WaypointBuilder.deserialize(construction.builder);
        const stage = builder.stage;

        // SELECT_CATEGORY stage
        if (stage === WORKFLOW_STAGES.SELECT_CATEGORY) {
            return {
                labels: [
                    'NAV', 'SCIENCE', 'HAZARD', 'POI', '',
                    '', '', '', '', '',
                    '', '', '', '', 'CANCEL'  // R5
                ],
                actions: [
                    () => this.selectCategory(mfd, 'NAV'),
                    () => this.selectCategory(mfd, 'SCI'),
                    () => this.selectCategory(mfd, 'HAZ'),
                    () => this.selectCategory(mfd, 'POI'),
                    null,
                    null, null, null, null, null,
                    null, null, null, null,
                    () => this.cancelWaypointConstruction(mfd)  // R5
                ],
                states: Array(15).fill({ type: 'momentary', selected: false })
            };
        }

        // SELECT_TYPE stage
        if (stage === WORKFLOW_STAGES.SELECT_TYPE) {
            const types = missionComputer.getWaypointTypes();
            const category = builder.data.category || 'NAV';
            const categoryTypes = types[category] || types['NAV'] || ['WAYPOINT', 'MARKER', 'POINT', 'OTHER'];

            return {
                labels: [
                    categoryTypes[0] || '', categoryTypes[1] || '',
                    categoryTypes[2] || '', categoryTypes[3] || '', '',
                    '', '', '', '', '',
                    '', '', '', '', 'CANCEL'  // R5
                ],
                actions: [
                    categoryTypes[0] ? () => this.selectType(mfd, categoryTypes[0]) : null,
                    categoryTypes[1] ? () => this.selectType(mfd, categoryTypes[1]) : null,
                    categoryTypes[2] ? () => this.selectType(mfd, categoryTypes[2]) : null,
                    categoryTypes[3] ? () => this.selectType(mfd, categoryTypes[3]) : null,
                    null,
                    null, null, null, null, null,
                    null, null, null, null,
                    () => this.cancelWaypointConstruction(mfd)  // R5
                ],
                states: Array(15).fill({ type: 'momentary', selected: false })
            };
        }

        // SELECT_METHOD stage
        if (stage === WORKFLOW_STAGES.SELECT_METHOD) {
            return {
                labels: [
                    'LAT/LON', 'PBD', '', '', '',
                    '', '', '', '', '',
                    '', '', '', '', 'CANCEL'  // R5
                ],
                actions: [
                    () => this.selectMethod(mfd, 'latlon'),
                    () => this.selectMethod(mfd, 'pbd'),
                    null, null, null,
                    null, null, null, null, null,
                    null, null, null, null,
                    () => this.cancelWaypointConstruction(mfd)  // R5
                ],
                states: Array(15).fill({ type: 'momentary', selected: false })
            };
        }

        // ENTER_LOCATION stage with PBD method - show place picker
        if (stage === WORKFLOW_STAGES.ENTER_LOCATION && builder.method === 'pbd' && !builder.data.refPointId) {
            return this.getPBDPlaceSelectionSoftKeys(mfd, construction);
        }

        // CONFIRM stage
        if (stage === WORKFLOW_STAGES.CONFIRM) {
            return {
                labels: [
                    'SAVE', '', '', '', '',
                    '', '', '', '', '',
                    '', '', '', '', 'CANCEL'  // R5
                ],
                actions: [
                    () => this.saveWaypoint(mfd),
                    null, null, null, null,
                    null, null, null, null, null,
                    null, null, null, null,
                    () => this.cancelWaypointConstruction(mfd)  // R5
                ],
                states: Array(15).fill({ type: 'momentary', selected: false })
            };
        }

        // Default: during keyboard input (name, coordinates, bearing, distance)
        return {
            labels: [
                '', '', '', '', '',
                '', '', '', '', '',
                '', '', '', '', 'CANCEL'  // R5
            ],
            actions: [
                null, null, null, null, null,
                null, null, null, null, null,
                null, null, null, null,
                () => this.cancelWaypointConstruction(mfd)  // R5
            ],
            states: Array(15).fill({ type: 'momentary', selected: false })
        };
    }

    /**
     * Get soft keys for PBD place selection (waypoint picker)
     */
    static getPBDPlaceSelectionSoftKeys(mfd, construction) {
        const currentPos = missionComputer.getCurrentPosition();
        const nearbyWaypoints = missionComputer.getNearbyWaypoints(
            currentPos.lat,
            currentPos.lon,
            construction.pickerPageSize + construction.pickerOffset
        ).slice(construction.pickerOffset);

        const labels = Array(15).fill('');
        const actions = Array(15).fill(null);

        // L1: PPOS (always available)
        labels[0] = 'PPOS';
        actions[0] = () => this.selectPBDPlace(mfd, 'ppos', null);

        // L2-L4: Waypoints (up to 3)
        nearbyWaypoints.slice(0, 3).forEach((wpt, index) => {
            const btnIndex = index + 1;  // L2=1, L3=2, L4=3
            labels[btnIndex] = wpt.name;
            actions[btnIndex] = () => this.selectPBDPlace(mfd, 'waypoint', wpt.id);
        });

        // L5/R5: Navigation
        const totalWaypoints = gameStateInstance.getAllWaypoints().length;
        const hasMore = (construction.pickerOffset + construction.pickerPageSize) < totalWaypoints;
        const hasPrevious = construction.pickerOffset > 0;

        if (hasPrevious) {
            labels[4] = 'UP';  // L5
            actions[4] = () => this.pickerPageUp(mfd);
        }

        if (hasMore) {
            labels[14] = 'DOWN';  // R5
            actions[14] = () => this.pickerPageDown(mfd);
        } else {
            labels[14] = 'CANCEL';  // R5
            actions[14] = () => this.cancelWaypointConstruction(mfd);
        }

        return {
            labels,
            actions,
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
                'DIRECT',     // L5
                '', '', '', '', '',  // C1-C5: Empty
                'UP',       // R1
                'DOWN',     // R2
                'EXEC',     // R3
                '',         // R4
                'BACK'    // R5
            ],
            actions: [
                () => this.addWaypoint(mfd),         // L1
                () => this.editWaypoint(mfd),        // L2
                () => this.deleteWaypoint(mfd),      // L3
                null,                                // L4
                () => this.directToWaypoint(mfd),    // L5
                null, null, null, null, null,        // C1-C5
                () => this.moveWaypointUp(mfd),      // R1
                () => this.moveWaypointDown(mfd),    // R2
                () => this.executeRoute(mfd),        // R3
                null,                                // R4
                () => this.backToMap(mfd)           // R5
            ],
            states: [
                { type: 'momentary', selected: false },  // L1: ADD
                { type: 'momentary', selected: false },  // L2: EDIT
                { type: 'momentary', selected: false },  // L3: DELETE
                null,                                     // L4
                { type: 'momentary', selected: false },  // L5: DIRECT
                null, null, null, null, null,            // C1-C5
                { type: 'momentary', selected: false },  // R1: UP
                { type: 'momentary', selected: false },  // R2: DOWN
                { type: 'momentary', selected: false },  // R3: EXEC
                null,                                     // R4
                { type: 'momentary', selected: false }   // R5: BACK
            ]
        };
    }

    static addPageOverlays(svg, state) {
        // SVG is now passed directly instead of getting it from MFD
        // This is because the navigation overlays belong to the center display,
        // not the MFD's right-console display

        // Check for waypoint modes
        const construction = gameStateInstance.getProperty('navigation.waypointConstruction');
        if (construction && construction.active) {
            if (construction.mode === 'list') {
                this.addWaypointListDisplay(svg, construction);
                return;
            }
            if (construction.mode === 'edit_select' || construction.mode === 'delete_select') {
                this.addWaypointSelectionDisplay(svg, construction);
                return;
            }
        }

        // Add mode-specific overlays
        switch (state.mode) {
            case 'overlays':
                this.addOverlayStatusDisplay(svg, state);
                break;
            case 'route':
                this.addRouteListDisplay(svg, state);
                break;
            case 'waypoint':
                // Waypoint mode without active construction - no special overlay needed
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

    static addWaypointSelectionDisplay(svg, construction) {
        const isEdit = construction.mode === 'edit_select';
        const waypoints = construction.data.waypoints || [];
        const selectedIndex = construction.data.selectedIndex || 0;

        if (waypoints.length === 0) return;

        const selectedWaypoint = waypoints[selectedIndex];

        // Create selection panel
        const panel = document.createElementNS("http://www.w3.org/2000/svg", "g");
        panel.setAttribute("id", "waypoint-selection-panel");

        // Background
        const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        bg.setAttribute("x", "10");
        bg.setAttribute("y", "10");
        bg.setAttribute("width", "280");
        bg.setAttribute("height", "120");
        bg.setAttribute("fill", "rgba(0, 0, 0, 0.85)");
        bg.setAttribute("stroke", "var(--primary-cyan)");
        bg.setAttribute("stroke-width", "2");
        bg.setAttribute("rx", "4");
        panel.appendChild(bg);

        // Title
        const title = document.createElementNS("http://www.w3.org/2000/svg", "text");
        title.setAttribute("x", "150");
        title.setAttribute("y", "30");
        title.setAttribute("text-anchor", "middle");
        title.setAttribute("fill", "var(--primary-cyan)");
        title.setAttribute("font-family", "Courier New, monospace");
        title.setAttribute("font-size", "14");
        title.setAttribute("font-weight", "bold");
        title.textContent = isEdit ? "SELECT WAYPOINT TO EDIT" : "SELECT WAYPOINT TO DELETE";
        panel.appendChild(title);

        // Counter
        const counter = document.createElementNS("http://www.w3.org/2000/svg", "text");
        counter.setAttribute("x", "150");
        counter.setAttribute("y", "50");
        counter.setAttribute("text-anchor", "middle");
        counter.setAttribute("fill", "var(--text-white)");
        counter.setAttribute("font-family", "Courier New, monospace");
        counter.setAttribute("font-size", "11");
        counter.textContent = `${selectedIndex + 1} / ${waypoints.length}`;
        panel.appendChild(counter);

        // Waypoint details
        const [lon, lat] = selectedWaypoint.geometry.coordinates;
        const details = [
            `NAME: ${selectedWaypoint.name}`,
            `TYPE: ${selectedWaypoint.category}/${selectedWaypoint.type}`,
            `LAT:  ${formatLatitude(lat)}`,
            `LON:  ${formatLongitude(lon)}`
        ];

        details.forEach((line, index) => {
            const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
            text.setAttribute("x", "20");
            text.setAttribute("y", 70 + (index * 14));
            text.setAttribute("fill", "var(--primary-cyan)");
            text.setAttribute("font-family", "Courier New, monospace");
            text.setAttribute("font-size", "11");
            text.textContent = line;
            panel.appendChild(text);
        });

        svg.appendChild(panel);
    }

    static addWaypointListDisplay(svg, construction) {
        const waypoints = construction.data.waypoints || [];
        const offset = construction.data.listOffset || 0;
        const pageSize = construction.data.listPageSize || 10;
        const displayWaypoints = waypoints.slice(offset, offset + pageSize);

        if (waypoints.length === 0) return;

        // Create list panel
        const panel = document.createElementNS("http://www.w3.org/2000/svg", "g");
        panel.setAttribute("id", "waypoint-list-panel");

        // Background
        const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        bg.setAttribute("x", "10");
        bg.setAttribute("y", "10");
        bg.setAttribute("width", "380");
        bg.setAttribute("height", "280");
        bg.setAttribute("fill", "rgba(0, 0, 0, 0.9)");
        bg.setAttribute("stroke", "var(--primary-cyan)");
        bg.setAttribute("stroke-width", "2");
        bg.setAttribute("rx", "4");
        panel.appendChild(bg);

        // Title
        const title = document.createElementNS("http://www.w3.org/2000/svg", "text");
        title.setAttribute("x", "200");
        title.setAttribute("y", "30");
        title.setAttribute("text-anchor", "middle");
        title.setAttribute("fill", "var(--primary-cyan)");
        title.setAttribute("font-family", "Courier New, monospace");
        title.setAttribute("font-size", "14");
        title.setAttribute("font-weight", "bold");
        title.textContent = `WAYPOINTS (${waypoints.length} TOTAL)`;
        panel.appendChild(title);

        // Counter
        const counter = document.createElementNS("http://www.w3.org/2000/svg", "text");
        counter.setAttribute("x", "200");
        counter.setAttribute("y", "50");
        counter.setAttribute("text-anchor", "middle");
        counter.setAttribute("fill", "var(--text-white)");
        counter.setAttribute("font-family", "Courier New, monospace");
        counter.setAttribute("font-size", "10");
        counter.textContent = `Showing ${offset + 1}-${Math.min(offset + pageSize, waypoints.length)} of ${waypoints.length}`;
        panel.appendChild(counter);

        // Waypoint list
        displayWaypoints.forEach((wpt, index) => {
            const y = 70 + (index * 20);
            const dist = wpt.distance.toFixed(1);
            const brg = Math.round(wpt.bearing);

            const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
            text.setAttribute("x", "20");
            text.setAttribute("y", y);
            text.setAttribute("fill", "var(--primary-cyan)");
            text.setAttribute("font-family", "Courier New, monospace");
            text.setAttribute("font-size", "10");
            text.textContent = `${offset + index + 1}. ${wpt.name} - ${wpt.category}/${wpt.type} - ${dist}NM @ ${brg}°`;
            panel.appendChild(text);
        });

        svg.appendChild(panel);
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
        // Range sequence: 1, 2, 5, then doubles (10, 20, 40, 80, 160, 320, 640, 1280, 2560)
        const ranges = [1, 2, 5, 10, 20, 40, 80, 160, 320, 640, 1280, 2560];
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

        // Force redraw
        mfd.needsRedraw = true;

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

        // Force redraw
        mfd.needsRedraw = true;

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

        // Force redraw
        mfd.needsRedraw = true;

        console.log('ALL OVERLAYS: DISABLED');
    }

    // ========================================
    // WAYPOINT MANAGEMENT METHODS
    // ========================================

    /**
     * Start the ADD waypoint workflow
     * Creates new WaypointBuilder and begins at SELECT_CATEGORY stage
     */
    static startAddWaypoint(mfd) {
        // Get current position as defaults
        const currentPos = missionComputer.getCurrentPosition();

        // Create new builder
        const builder = new WaypointBuilder('add', {
            lat: currentPos.lat,
            lon: currentPos.lon,
            depth: currentPos.depth
        });

        // Save builder state
        gameStateInstance.updateProperty('navigation.waypointConstruction', {
            active: true,
            builder: builder.serialize(),
            // For waypoint picker (PBD mode)
            pickerOffset: 0,
            pickerPageSize: 3
        });

        // Show category selection
        mfd.setupPageSoftKeys('navigation');
        mfd.needsRedraw = true;
        console.log('SELECT CATEGORY: NAV/SCI/HAZ/POI');
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

        // Set up list mode with pagination
        gameStateInstance.updateProperty('navigation.waypointConstruction', {
            active: true,
            mode: 'list',
            step: 0,
            data: {
                waypoints: waypoints,
                listOffset: 0,
                listPageSize: 10
            }
        });

        mfd.setupPageSoftKeys('navigation');
        mfd.needsRedraw = true;
        console.log(`SHOWING ${waypoints.length} WAYPOINTS`);
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

        // Create builder for editing existing waypoint
        const builder = WaypointBuilder.forEdit(waypoint);

        // Save builder state
        construction.builder = builder.serialize();
        construction.mode = 'edit';  // Keep mode for backward compatibility
        gameStateInstance.updateProperty('navigation.waypointConstruction', construction);

        // Start edit workflow with latitude input (show current value)
        const latStr = formatLatitude(builder.data.lat);
        mfd.requestKeyboardInput(`LAT [${latStr}]: `, 'waypoint_construct_lat', 15);
        mfd.needsRedraw = true;
        console.log(`EDITING: ${waypoint.name}`);
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
            case 'waypoint_construct_bearing':
                this.handleBearingInput(mfd, data.input);
                break;
            case 'waypoint_construct_distance':
                this.handleDistanceInput(mfd, data.input);
                break;
        }
    }

    /**
     * Handle name input (Step 1)
     */
    static handleNameInput(mfd, name) {
        const construction = gameStateInstance.getProperty('navigation.waypointConstruction');
        const builder = WaypointBuilder.deserialize(construction.builder);

        try {
            // Set name (auto-generates if empty)
            builder.setName(name);

            // Save builder state
            construction.builder = builder.serialize();
            gameStateInstance.updateProperty('navigation.waypointConstruction', construction);

            // Show method selection (LAT/LON vs PBD)
            mfd.setupPageSoftKeys('navigation');
            mfd.needsRedraw = true;
            console.log(`NAME: ${builder.data.name} - SELECT METHOD`);
        } catch (error) {
            console.log(`ERROR: ${error.message}`);
        }
    }

    /**
     * Handle latitude input
     */
    static handleLatitudeInput(mfd, input) {
        const construction = gameStateInstance.getProperty('navigation.waypointConstruction');
        const builder = WaypointBuilder.deserialize(construction.builder);

        // If empty, keep current value and move to next field
        if (!input || input.trim() === '') {
            const lonStr = formatLongitude(builder.data.lon);
            mfd.requestKeyboardInput(`LON [${lonStr}]: `, 'waypoint_construct_lon', 15);
            mfd.needsRedraw = true;
            return;
        }

        // Parse and validate input
        const lat = parseCoordinateInput(input, 'lat');
        if (lat === null) {
            console.log('ERROR: Invalid latitude format');
            return;
        }

        try {
            builder.setLatitude(lat);

            // Save builder state
            construction.builder = builder.serialize();
            gameStateInstance.updateProperty('navigation.waypointConstruction', construction);

            // Move to longitude input
            const lonStr = formatLongitude(builder.data.lon);
            mfd.requestKeyboardInput(`LON [${lonStr}]: `, 'waypoint_construct_lon', 15);
            mfd.needsRedraw = true;
            console.log(`LAT: ${formatLatitude(lat)}`);
        } catch (error) {
            console.log(`ERROR: ${error.message}`);
        }
    }

    /**
     * Handle longitude input
     */
    static handleLongitudeInput(mfd, input) {
        const construction = gameStateInstance.getProperty('navigation.waypointConstruction');
        const builder = WaypointBuilder.deserialize(construction.builder);

        // If empty, keep current value and move to next field
        if (!input || input.trim() === '') {
            mfd.requestKeyboardInput(`DEPTH [${builder.data.depth}m]: `, 'waypoint_construct_depth', 6);
            mfd.needsRedraw = true;
            return;
        }

        // Parse and validate input
        const lon = parseCoordinateInput(input, 'lon');
        if (lon === null) {
            console.log('ERROR: Invalid longitude format');
            return;
        }

        try {
            builder.setLongitude(lon);

            // Save builder state
            construction.builder = builder.serialize();
            gameStateInstance.updateProperty('navigation.waypointConstruction', construction);

            // Move to depth input
            mfd.requestKeyboardInput(`DEPTH [${builder.data.depth}m]: `, 'waypoint_construct_depth', 6);
            mfd.needsRedraw = true;
            console.log(`LON: ${formatLongitude(lon)}`);
        } catch (error) {
            console.log(`ERROR: ${error.message}`);
        }
    }

    /**
     * Handle depth input
     */
    static handleDepthInput(mfd, input) {
        const construction = gameStateInstance.getProperty('navigation.waypointConstruction');
        const builder = WaypointBuilder.deserialize(construction.builder);

        // If empty, keep current value
        const depth = (!input || input.trim() === '') ? builder.data.depth : parseFloat(input);

        if (isNaN(depth)) {
            console.log('ERROR: Invalid depth value');
            return;
        }

        try {
            builder.setDepth(depth);

            // Save builder state (builder automatically moves to CONFIRM stage)
            construction.builder = builder.serialize();
            gameStateInstance.updateProperty('navigation.waypointConstruction', construction);

            // Show confirmation
            mfd.setupPageSoftKeys('navigation');
            mfd.needsRedraw = true;
            console.log(`DEPTH: ${depth}m - READY TO SAVE`);
        } catch (error) {
            console.log(`ERROR: ${error.message}`);
        }
    }

    /**
     * Select waypoint category
     */
    static selectCategory(mfd, category) {
        const construction = gameStateInstance.getProperty('navigation.waypointConstruction');
        const builder = WaypointBuilder.deserialize(construction.builder);

        // Set category and advance to SELECT_TYPE
        builder.setCategory(category);

        // Save builder state
        construction.builder = builder.serialize();
        gameStateInstance.updateProperty('navigation.waypointConstruction', construction);

        // Show type selection
        mfd.setupPageSoftKeys('navigation');
        mfd.needsRedraw = true;
        console.log(`CATEGORY: ${category} - SELECT TYPE`);
    }

    /**
     * Select waypoint type
     */
    static selectType(mfd, type) {
        const construction = gameStateInstance.getProperty('navigation.waypointConstruction');
        const builder = WaypointBuilder.deserialize(construction.builder);

        // Set type and advance to ENTER_NAME
        builder.setType(type);

        // Save builder state
        construction.builder = builder.serialize();
        gameStateInstance.updateProperty('navigation.waypointConstruction', construction);

        // Request name input
        const defaultName = builder.generateDefaultName();
        mfd.requestKeyboardInput(`NAME [${defaultName}]: `, 'waypoint_construct_name', 5);
        mfd.needsRedraw = true;
        console.log(`TYPE: ${type} - ENTER NAME`);
    }

    /**
     * Show confirmation stage
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
        const builder = WaypointBuilder.deserialize(construction.builder);

        // Build final waypoint data
        const waypointData = builder.build();

        let result;
        if (builder.mode === 'edit' && builder.editingId) {
            // Update existing waypoint
            result = missionComputer.updateWaypoint(builder.editingId, waypointData);

            if (result.success) {
                const waypoint = gameStateInstance.getWaypoint(builder.editingId);
                console.log(`WAYPOINT UPDATED: ${waypoint.name}`);
            }
        } else {
            // Create new waypoint
            result = missionComputer.createWaypoint(waypointData);

            if (result.success) {
                console.log(`WAYPOINT CREATED: ${result.waypoint.name}`);
            }
        }

        if (result.success) {
            // Clear construction state
            gameStateInstance.updateProperty('navigation.waypointConstruction', {
                active: false
            });

            // Return to waypoint menu
            this.setMode(mfd, 'waypoint');

            // Force redraw to show new waypoint on map
            mfd.needsRedraw = true;
        } else {
            console.log(`ERROR: ${result.error}`);
        }
    }

    /**
     * Select input method (LAT/LON or PBD)
     */
    static selectMethod(mfd, method) {
        const construction = gameStateInstance.getProperty('navigation.waypointConstruction');
        const builder = WaypointBuilder.deserialize(construction.builder);

        // Set method and advance to ENTER_LOCATION
        builder.selectMethod(method);

        // Save builder state
        construction.builder = builder.serialize();
        gameStateInstance.updateProperty('navigation.waypointConstruction', construction);

        if (method === 'latlon') {
            // LAT/LON: Request latitude input
            const latStr = formatLatitude(builder.data.lat);
            mfd.requestKeyboardInput(`LAT [${latStr}]: `, 'waypoint_construct_lat', 15);
            mfd.needsRedraw = true;
            console.log('METHOD: LAT/LON - ENTER LATITUDE');
        } else if (method === 'pbd') {
            // PBD: Show waypoint picker for reference point
            mfd.setupPageSoftKeys('navigation');
            mfd.needsRedraw = true;
            console.log('METHOD: PBD - SELECT PLACE');
        }
    }

    /**
     * Select place for PBD (PPOS or waypoint)
     */
    static selectPBDPlace(mfd, refType, refId) {
        const construction = gameStateInstance.getProperty('navigation.waypointConstruction');
        const builder = WaypointBuilder.deserialize(construction.builder);

        try {
            if (refType === 'ppos') {
                const currentPos = missionComputer.getCurrentPosition();
                builder.setReferencePoint('ppos', 'PPOS');
                // Store position for later use
                builder.data.refLat = currentPos.lat;
                builder.data.refLon = currentPos.lon;
                builder.data.refDepth = currentPos.depth;
                console.log('PLACE: PPOS');
            } else if (refType === 'waypoint') {
                const waypoint = gameStateInstance.getWaypoint(refId);
                builder.setReferencePoint(refId, waypoint.name);
                console.log(`PLACE: ${waypoint.name}`);
            }

            // Save builder state
            construction.builder = builder.serialize();
            gameStateInstance.updateProperty('navigation.waypointConstruction', construction);

            // Request bearing input
            mfd.requestKeyboardInput('BRG: ', 'waypoint_construct_bearing', 3);
            mfd.needsRedraw = true;
        } catch (error) {
            console.log(`ERROR: ${error.message}`);
        }
    }

    /**
     * Handle bearing input for PBD
     */
    static handleBearingInput(mfd, input) {
        const construction = gameStateInstance.getProperty('navigation.waypointConstruction');
        const builder = WaypointBuilder.deserialize(construction.builder);

        if (!input || input.trim() === '') {
            console.log('ERROR: Bearing required');
            return;
        }

        const bearing = parseFloat(input);
        if (isNaN(bearing)) {
            console.log('ERROR: Invalid bearing');
            return;
        }

        try {
            builder.setBearing(bearing);

            // Save builder state
            construction.builder = builder.serialize();
            gameStateInstance.updateProperty('navigation.waypointConstruction', construction);

            // Request distance input
            mfd.requestKeyboardInput('DST (NM): ', 'waypoint_construct_distance', 6);
            mfd.needsRedraw = true;
            console.log(`BRG: ${Math.round(bearing)}°`);
        } catch (error) {
            console.log(`ERROR: ${error.message}`);
        }
    }

    /**
     * Handle distance input for PBD - calculate final position
     */
    static handleDistanceInput(mfd, input) {
        const construction = gameStateInstance.getProperty('navigation.waypointConstruction');
        const builder = WaypointBuilder.deserialize(construction.builder);

        if (!input || input.trim() === '') {
            console.log('ERROR: Distance required');
            return;
        }

        const distance = parseFloat(input);
        if (isNaN(distance)) {
            console.log('ERROR: Invalid distance');
            return;
        }

        try {
            // Set distance (builder calculates coordinates automatically)
            builder.setDistance(distance);

            // Save builder state (now at CONFIRM stage)
            construction.builder = builder.serialize();
            gameStateInstance.updateProperty('navigation.waypointConstruction', construction);

            // Show confirmation
            mfd.setupPageSoftKeys('navigation');
            mfd.needsRedraw = true;
            console.log(`DST: ${distance.toFixed(1)} NM`);
            console.log(`Calculated: ${formatLatitude(builder.data.lat)}, ${formatLongitude(builder.data.lon)}`);
            console.log('READY TO SAVE');
        } catch (error) {
            console.log(`ERROR: ${error.message}`);
        }
    }

    /**
     * Waypoint picker pagination - previous page
     */
    static pickerPageUp(mfd) {
        const construction = gameStateInstance.getProperty('navigation.waypointConstruction');
        construction.pickerOffset = Math.max(0, construction.pickerOffset - construction.pickerPageSize);
        gameStateInstance.updateProperty('navigation.waypointConstruction', construction);
        mfd.setupPageSoftKeys('navigation');
        mfd.needsRedraw = true;
    }

    /**
     * Waypoint picker pagination - next page
     */
    static pickerPageDown(mfd) {
        const construction = gameStateInstance.getProperty('navigation.waypointConstruction');
        const totalWaypoints = gameStateInstance.getAllWaypoints().length;
        const maxOffset = Math.max(0, totalWaypoints - construction.pickerPageSize);
        construction.pickerOffset = Math.min(maxOffset, construction.pickerOffset + construction.pickerPageSize);
        gameStateInstance.updateProperty('navigation.waypointConstruction', construction);
        mfd.setupPageSoftKeys('navigation');
        mfd.needsRedraw = true;
    }

    /**
     * List pagination - previous page
     */
    static listPageUp(mfd) {
        const construction = gameStateInstance.getProperty('navigation.waypointConstruction');
        construction.data.listOffset = Math.max(0, construction.data.listOffset - construction.data.listPageSize);
        gameStateInstance.updateProperty('navigation.waypointConstruction', construction);
        mfd.setupPageSoftKeys('navigation');
        mfd.needsRedraw = true;
    }

    /**
     * List pagination - next page
     */
    static listPageDown(mfd) {
        const construction = gameStateInstance.getProperty('navigation.waypointConstruction');
        const totalWaypoints = construction.data.waypoints.length;
        const maxOffset = Math.max(0, totalWaypoints - construction.data.listPageSize);
        construction.data.listOffset = Math.min(maxOffset, construction.data.listOffset + construction.data.listPageSize);
        gameStateInstance.updateProperty('navigation.waypointConstruction', construction);
        mfd.setupPageSoftKeys('navigation');
        mfd.needsRedraw = true;
    }

    /**
     * Cancel waypoint construction
     */
    static cancelWaypointConstruction(mfd) {
        gameStateInstance.updateProperty('navigation.waypointConstruction', {
            active: false,
            mode: null,
            method: null,
            step: 0,
            data: {},
            pickerOffset: 0,
            pickerPageSize: 3
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