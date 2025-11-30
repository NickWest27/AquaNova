// utils/waypoints/waypointBuilder.js
// Builder pattern for waypoint construction
// Provides a fluent API for creating and editing waypoints

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

        // Validate reference point exists
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

        const refPoint = gameStateInstance.getWaypoint(this.data.refPointId);
        const [refLon, refLat] = refPoint.geometry.coordinates;

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

export default WaypointBuilder;
