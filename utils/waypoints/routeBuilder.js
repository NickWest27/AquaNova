// utils/waypoints/routeBuilder.js
// Builder pattern for waypoint and route construction
// Provides a fluent API for creating and editing waypoints and routes

import gameStateInstance from '../../game/state.js';
import missionComputer from '../../game/systems/missionComputer/missionComputer.js';
import { parseCoordinateInput, validateCoordinates } from '../coordinates.js';

// Workflow stages (in order, per user request)
export const WORKFLOW_STAGES = {
    SELECT_CATEGORY: 'select_category',     // ADD only: Choose NAV/SCI/HAZ/POI
    SELECT_TYPE: 'select_type',              // After category: Choose type based on category
    ENTER_NAME: 'enter_name',                // ADD only: Enter waypoint name
    SELECT_METHOD: 'select_method',          // ADD only: Choose LAT/LON vs PBD
    ENTER_LOCATION: 'enter_location',        // Both ADD and EDIT: Enter coordinates or PBD
    CONFIRM: 'confirm'                       // Final confirmation before save
};

/**
 * WaypointBuilder - Manages waypoint construction workflow
 * Provides stage-based progression with validation
 */
export class WaypointBuilder {
    constructor(mode = 'add', initialData = {}) {
        this.mode = mode;  // 'add' or 'edit'
        this.stage = mode === 'edit' ? WORKFLOW_STAGES.ENTER_LOCATION : WORKFLOW_STAGES.SELECT_CATEGORY;
        this.method = mode === 'edit' ? 'latlon' : null;  // EDIT always uses LAT/LON
        this.data = { ...initialData };
        this.editingId = mode === 'edit' ? initialData.id : null;
    }

    // ========================================
    // STAGE TRANSITION METHODS
    // ========================================

    /**
     * Set waypoint category (NAV, SCI, HAZ, POI)
     */
    setCategory(category) {
        const validCategories = ['NAV', 'SCI', 'HAZ', 'POI'];
        if (!validCategories.includes(category)) {
            throw new Error(`Invalid category: ${category}`);
        }

        this.data.category = category;
        this.stage = WORKFLOW_STAGES.SELECT_TYPE;
        return this;
    }

    /**
     * Set waypoint type (based on category)
     */
    setType(type) {
        if (!this.data.category) {
            throw new Error('Category must be set before type');
        }

        const types = missionComputer.getWaypointTypes();
        const categoryTypes = types[this.data.category];

        if (!categoryTypes || !categoryTypes.includes(type)) {
            throw new Error(`Invalid type ${type} for category ${this.data.category}`);
        }

        this.data.type = type;
        this.stage = WORKFLOW_STAGES.ENTER_NAME;
        return this;
    }

    /**
     * Set waypoint name
     */
    setName(name) {
        // If no name provided, generate default
        if (!name || name.trim() === '') {
            this.data.name = this.generateDefaultName();
        } else {
            // Validate name
            const upperName = name.toUpperCase();
            if (upperName.length > 5) {
                throw new Error('Name must be 5 characters or less');
            }
            if (!/^[A-Z0-9]+$/i.test(upperName)) {
                throw new Error('Name must be alphanumeric only');
            }
            this.data.name = upperName;
        }

        this.stage = WORKFLOW_STAGES.SELECT_METHOD;
        return this;
    }

    /**
     * Select input method (latlon or pbd)
     */
    selectMethod(method) {
        if (method !== 'latlon' && method !== 'pbd') {
            throw new Error(`Invalid method: ${method}`);
        }

        this.method = method;
        this.stage = WORKFLOW_STAGES.ENTER_LOCATION;
        return this;
    }

    /**
     * Set latitude (for LAT/LON method)
     */
    setLatitude(lat) {
        if (this.method !== 'latlon') {
            throw new Error('Can only set latitude in LAT/LON mode');
        }

        const validation = validateCoordinates(lat, 0);
        if (!validation.valid) {
            throw new Error(validation.error);
        }

        this.data.lat = lat;
        return this;
    }

    /**
     * Set longitude (for LAT/LON method)
     */
    setLongitude(lon) {
        if (this.method !== 'latlon') {
            throw new Error('Can only set longitude in LAT/LON mode');
        }

        if (this.data.lat === undefined) {
            throw new Error('Latitude must be set before longitude');
        }

        const validation = validateCoordinates(0, lon);
        if (!validation.valid) {
            throw new Error(validation.error);
        }

        this.data.lon = lon;
        return this;
    }

    /**
     * Set depth (for LAT/LON method)
     */
    setDepth(depth) {
        if (this.method !== 'latlon') {
            throw new Error('Can only set depth in LAT/LON mode');
        }

        if (depth < 0 || depth > 11000) {
            throw new Error('Depth must be between 0 and 11000 meters');
        }

        this.data.depth = depth;

        // Check if we have all LAT/LON data
        if (this.data.lat !== undefined && this.data.lon !== undefined && this.data.depth !== undefined) {
            this.stage = WORKFLOW_STAGES.CONFIRM;
        }

        return this;
    }

    /**
     * Set reference point (for PBD method)
     */
    setReferencePoint(refPointId, refName) {
        if (this.method !== 'pbd') {
            throw new Error('Can only set reference point in PBD mode');
        }

        // Special handling for PPOS (present position)
        if (refPointId === 'ppos') {
            this.data.refPointId = 'ppos';
            this.data.refName = refName || 'PPOS';
            return this;
        }

        // Validate waypoint reference point exists
        const refPoint = gameStateInstance.getWaypoint(refPointId);
        if (!refPoint) {
            throw new Error(`Reference point not found: ${refPointId}`);
        }

        this.data.refPointId = refPointId;
        this.data.refName = refName || refPoint.name;
        return this;
    }

    /**
     * Set bearing (for PBD method)
     */
    setBearing(bearing) {
        if (this.method !== 'pbd') {
            throw new Error('Can only set bearing in PBD mode');
        }

        if (!this.data.refPointId) {
            throw new Error('Reference point must be set before bearing');
        }

        if (bearing < 0 || bearing >= 360) {
            throw new Error('Bearing must be between 0 and 359 degrees');
        }

        this.data.bearing = bearing;
        return this;
    }

    /**
     * Set distance (for PBD method)
     */
    setDistance(distance) {
        if (this.method !== 'pbd') {
            throw new Error('Can only set distance in PBD mode');
        }

        if (this.data.bearing === undefined) {
            throw new Error('Bearing must be set before distance');
        }

        if (distance <= 0) {
            throw new Error('Distance must be greater than 0');
        }

        this.data.distance = distance;

        // Calculate LAT/LON from PBD
        this.calculateCoordinatesFromPBD();

        // Move to confirmation
        this.stage = WORKFLOW_STAGES.CONFIRM;

        return this;
    }

    /**
     * Calculate coordinates from PBD data
     * Uses haversine formula to compute destination point
     */
    calculateCoordinatesFromPBD() {
        if (!this.data.refPointId || this.data.bearing === undefined || this.data.distance === undefined) {
            throw new Error('PBD data incomplete');
        }

        let refLat, refLon;

        // Handle PPOS (present position) vs waypoint reference
        if (this.data.refPointId === 'ppos') {
            // Use stored PPOS coordinates from when it was selected
            refLat = this.data.refLat;
            refLon = this.data.refLon;
        } else {
            // Look up waypoint
            const refPoint = gameStateInstance.getWaypoint(this.data.refPointId);
            [refLon, refLat] = refPoint.geometry.coordinates;
        }

        // Convert to radians
        const R = 3440.065;  // Earth radius in nautical miles
        const lat1 = refLat * Math.PI / 180;
        const lon1 = refLon * Math.PI / 180;
        const bearing = this.data.bearing * Math.PI / 180;
        const d = this.data.distance;

        // Calculate new position using haversine destination formula
        const lat2 = Math.asin(
            Math.sin(lat1) * Math.cos(d / R) +
            Math.cos(lat1) * Math.sin(d / R) * Math.cos(bearing)
        );

        const lon2 = lon1 + Math.atan2(
            Math.sin(bearing) * Math.sin(d / R) * Math.cos(lat1),
            Math.cos(d / R) - Math.sin(lat1) * Math.sin(lat2)
        );

        // Convert back to degrees
        this.data.lat = lat2 * 180 / Math.PI;
        this.data.lon = lon2 * 180 / Math.PI;
        this.data.depth = refPoint.depth || 0;  // Use reference point depth
    }

    // ========================================
    // VALIDATION AND HELPERS
    // ========================================

    /**
     * Check if current stage is complete and can proceed
     */
    canProceed() {
        switch (this.stage) {
            case WORKFLOW_STAGES.SELECT_CATEGORY:
                return !!this.data.category;

            case WORKFLOW_STAGES.SELECT_TYPE:
                return !!this.data.type;

            case WORKFLOW_STAGES.ENTER_NAME:
                return !!this.data.name;

            case WORKFLOW_STAGES.SELECT_METHOD:
                return !!this.method;

            case WORKFLOW_STAGES.ENTER_LOCATION:
                if (this.method === 'latlon') {
                    return this.data.lat !== undefined &&
                           this.data.lon !== undefined &&
                           this.data.depth !== undefined;
                } else if (this.method === 'pbd') {
                    return this.data.bearing !== undefined &&
                           this.data.distance !== undefined &&
                           !!this.data.refPointId;
                }
                return false;

            case WORKFLOW_STAGES.CONFIRM:
                return true;

            default:
                return false;
        }
    }

    /**
     * Get next stage in the workflow
     */
    getNextStage() {
        const stageOrder = [
            WORKFLOW_STAGES.SELECT_CATEGORY,
            WORKFLOW_STAGES.SELECT_TYPE,
            WORKFLOW_STAGES.ENTER_NAME,
            WORKFLOW_STAGES.SELECT_METHOD,
            WORKFLOW_STAGES.ENTER_LOCATION,
            WORKFLOW_STAGES.CONFIRM
        ];

        const currentIndex = stageOrder.indexOf(this.stage);
        if (currentIndex === -1 || currentIndex === stageOrder.length - 1) {
            return null;
        }

        return stageOrder[currentIndex + 1];
    }

    /**
     * Get current prompt text for user
     */
    getCurrentPrompt() {
        switch (this.stage) {
            case WORKFLOW_STAGES.SELECT_CATEGORY:
                return 'SELECT CATEGORY';

            case WORKFLOW_STAGES.SELECT_TYPE:
                return `SELECT TYPE FOR ${this.data.category}`;

            case WORKFLOW_STAGES.ENTER_NAME:
                return `NAME [${this.generateDefaultName()}]: `;

            case WORKFLOW_STAGES.SELECT_METHOD:
                return 'SELECT METHOD';

            case WORKFLOW_STAGES.ENTER_LOCATION:
                if (this.method === 'latlon') {
                    if (this.data.lat === undefined) {
                        return 'LAT: ';
                    }
                    if (this.data.lon === undefined) {
                        return 'LON: ';
                    }
                    if (this.data.depth === undefined) {
                        return 'DEPTH: ';
                    }
                } else if (this.method === 'pbd') {
                    if (!this.data.refPointId) {
                        return 'SELECT REFERENCE POINT';
                    }
                    if (this.data.bearing === undefined) {
                        return 'BRG: ';
                    }
                    if (this.data.distance === undefined) {
                        return 'DST: ';
                    }
                }
                return 'ENTER LOCATION';

            case WORKFLOW_STAGES.CONFIRM:
                return 'CONFIRM WAYPOINT';

            default:
                return '';
        }
    }

    /**
     * Generate default waypoint name
     */
    generateDefaultName() {
        return missionComputer.generateWaypointName();
    }

    /**
     * Get validation error message (if any)
     */
    getValidationError() {
        // This would be populated by failed set operations
        return this.validationError || null;
    }

    // ========================================
    // BUILD AND PERSISTENCE
    // ========================================

    /**
     * Build final waypoint data object for missionComputer
     */
    build() {
        if (this.stage !== WORKFLOW_STAGES.CONFIRM) {
            throw new Error('Cannot build waypoint - construction incomplete');
        }

        // Validate all required fields
        if (!this.data.name || !this.data.category || !this.data.type) {
            throw new Error('Missing required fields: name, category, or type');
        }

        if (this.data.lat === undefined || this.data.lon === undefined) {
            throw new Error('Missing coordinates');
        }

        // Return data in format expected by missionComputer.createWaypoint()
        return {
            name: this.data.name,
            category: this.data.category,
            type: this.data.type,
            lat: this.data.lat,
            lon: this.data.lon,
            depth: this.data.depth !== undefined ? this.data.depth : 0,
            notes: this.data.notes || '',
            // Add PBD metadata if applicable
            ...(this.method === 'pbd' && {
                metadata: {
                    method: 'pbd',
                    refPoint: this.data.refName,
                    bearing: this.data.bearing,
                    distance: this.data.distance
                }
            })
        };
    }

    /**
     * Serialize for game state persistence
     */
    serialize() {
        return {
            mode: this.mode,
            stage: this.stage,
            method: this.method,
            data: this.data,
            editingId: this.editingId
        };
    }

    /**
     * Restore builder from serialized state
     */
    static deserialize(saved) {
        if (!saved) {
            throw new Error('Cannot deserialize null or undefined state');
        }

        const builder = new WaypointBuilder(saved.mode, saved.data);
        builder.stage = saved.stage;
        builder.method = saved.method;
        builder.editingId = saved.editingId;
        return builder;
    }

    /**
     * Create builder for editing existing waypoint
     */
    static forEdit(waypoint) {
        const [lon, lat] = waypoint.geometry.coordinates;

        const builder = new WaypointBuilder('edit', {
            id: waypoint.id,
            name: waypoint.name,
            category: waypoint.category,
            type: waypoint.type,
            lat: lat,
            lon: lon,
            depth: waypoint.depth
        });

        return builder;
    }
}

// ========================================
// ROUTE BUILDER
// ========================================

/**
 * RouteBuilder - Manages route construction and waypoint sequencing
 * A route is an ordered collection of waypoints
 */
export class RouteBuilder {
    constructor(name = '', waypoints = []) {
        this.name = name || this.generateDefaultName();
        this.waypoints = [...waypoints]; // Array of waypoint IDs
        this.active = false;
    }

    /**
     * Generate default route name
     */
    generateDefaultName() {
        const routes = gameStateInstance.getProperty('navigation.routes') || [];
        return `RTE${(routes.length + 1).toString().padStart(2, '0')}`;
    }

    /**
     * Set route name
     */
    setName(name) {
        if (!name || name.trim() === '') {
            throw new Error('Route name cannot be empty');
        }

        const upperName = name.toUpperCase();
        if (upperName.length > 10) {
            throw new Error('Route name must be 10 characters or less');
        }

        this.name = upperName;
        return this;
    }

    /**
     * Add waypoint to route
     */
    addWaypoint(waypointId) {
        // Validate waypoint exists
        const waypoint = gameStateInstance.getWaypoint(waypointId);
        if (!waypoint) {
            throw new Error(`Waypoint not found: ${waypointId}`);
        }

        // Check if already in route
        if (this.waypoints.includes(waypointId)) {
            throw new Error(`Waypoint ${waypoint.name} already in route`);
        }

        this.waypoints.push(waypointId);
        return this;
    }

    /**
     * Remove waypoint from route by index
     */
    removeWaypoint(index) {
        if (index < 0 || index >= this.waypoints.length) {
            throw new Error('Invalid waypoint index');
        }

        this.waypoints.splice(index, 1);
        return this;
    }

    /**
     * Remove waypoint from route by ID
     */
    removeWaypointById(waypointId) {
        const index = this.waypoints.indexOf(waypointId);
        if (index === -1) {
            throw new Error('Waypoint not found in route');
        }

        return this.removeWaypoint(index);
    }

    /**
     * Move waypoint up in sequence (towards start)
     */
    moveWaypointUp(index) {
        if (index <= 0 || index >= this.waypoints.length) {
            throw new Error('Cannot move waypoint up');
        }

        [this.waypoints[index - 1], this.waypoints[index]] =
        [this.waypoints[index], this.waypoints[index - 1]];

        return this;
    }

    /**
     * Move waypoint down in sequence (towards end)
     */
    moveWaypointDown(index) {
        if (index < 0 || index >= this.waypoints.length - 1) {
            throw new Error('Cannot move waypoint down');
        }

        [this.waypoints[index], this.waypoints[index + 1]] =
        [this.waypoints[index + 1], this.waypoints[index]];

        return this;
    }

    /**
     * Insert waypoint at specific position
     */
    insertWaypoint(waypointId, index) {
        const waypoint = gameStateInstance.getWaypoint(waypointId);
        if (!waypoint) {
            throw new Error(`Waypoint not found: ${waypointId}`);
        }

        if (index < 0 || index > this.waypoints.length) {
            throw new Error('Invalid insert position');
        }

        this.waypoints.splice(index, 0, waypointId);
        return this;
    }

    /**
     * Clear all waypoints from route
     */
    clearWaypoints() {
        this.waypoints = [];
        return this;
    }

    /**
     * Get route waypoints with full data
     */
    getWaypointsWithData() {
        return this.waypoints.map(id => gameStateInstance.getWaypoint(id)).filter(wpt => wpt !== null);
    }

    /**
     * Calculate total route distance
     */
    getTotalDistance() {
        if (this.waypoints.length < 2) return 0;

        let totalDistance = 0;
        const waypointData = this.getWaypointsWithData();

        for (let i = 0; i < waypointData.length - 1; i++) {
            const wpt1 = waypointData[i];
            const wpt2 = waypointData[i + 1];

            const [lon1, lat1] = wpt1.geometry.coordinates;
            const [lon2, lat2] = wpt2.geometry.coordinates;

            totalDistance += this.calculateDistance(lat1, lon1, lat2, lon2);
        }

        return totalDistance;
    }

    /**
     * Calculate distance between two points (haversine formula)
     */
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 3440.065; // Earth radius in nautical miles
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;

        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    /**
     * Validate route (has at least 2 waypoints)
     */
    isValid() {
        return this.waypoints.length >= 2;
    }

    /**
     * Build route object for saving
     */
    build() {
        if (!this.isValid()) {
            throw new Error('Route must have at least 2 waypoints');
        }

        return {
            id: `route-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
            name: this.name,
            waypoints: [...this.waypoints],
            totalDistance: this.getTotalDistance(),
            created: new Date().toISOString(),
            active: this.active
        };
    }

    /**
     * Serialize for persistence
     */
    serialize() {
        return {
            name: this.name,
            waypoints: [...this.waypoints],
            active: this.active
        };
    }

    /**
     * Restore from serialized state
     */
    static deserialize(saved) {
        if (!saved) {
            throw new Error('Cannot deserialize null or undefined route');
        }

        const builder = new RouteBuilder(saved.name, saved.waypoints);
        builder.active = saved.active || false;
        return builder;
    }

    /**
     * Create builder from existing route
     */
    static fromRoute(route) {
        const builder = new RouteBuilder(route.name, route.waypoints);
        builder.active = route.active || false;
        return builder;
    }
}

export default WaypointBuilder;
