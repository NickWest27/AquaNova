// missionComputer.js - Mission Computer System
// Handles position integration, drift calculations, routing, and navigation computations
// Pulls data from ship state (helm), calculates position updates, passes to navComputer

import gameStateInstance from '/game/state.js';
import { validateCoordinates } from '/utils/coordinates.js';

class MissionComputer {
    constructor() {
        this.lastUpdateTime = performance.now();
        this.initialized = false;

        // Earth constants for navigation calculations
        this.EARTH_RADIUS_NM = 3440.065; // Earth radius in nautical miles
        this.NM_PER_DEGREE_LAT = 60; // 1 degree latitude = 60 nautical miles
    }

    init() {
        console.log('Mission Computer: Initializing...');
        this.lastUpdateTime = performance.now();
        this.initialized = true;
        console.log('Mission Computer: Online');
    }

    /**
     * Main update loop - integrates position based on current speed and heading
     * Called from bridge.js game loop
     */
    update() {
        if (!this.initialized) {
            this.init();
        }

        const now = performance.now();
        const deltaTime = (now - this.lastUpdateTime) / 1000; // Convert to seconds
        this.lastUpdateTime = now;

        // Get current helm state
        const helm = gameStateInstance.getProperty('helm');
        const currentSpeed = helm.currentSpeed || 0;
        const currentHeading = helm.currentHeading || 0;

        // Only update position if moving
        if (currentSpeed !== 0) {
            this.updatePosition(currentSpeed, currentHeading, deltaTime);
        }
    }

    /**
     * Updates ship position based on speed and heading
     * @param {number} speed - Speed in knots
     * @param {number} heading - Heading in degrees (0-360, true north)
     * @param {number} deltaTime - Time elapsed in seconds
     */
    updatePosition(speed, heading, deltaTime) {
        // Get current position
        const location = gameStateInstance.getProperty('navigation.location');
        const [currentLon, currentLat] = location.geometry.coordinates;

        // Calculate distance traveled in nautical miles
        // Speed is in knots (nautical miles per HOUR)
        // deltaTime is in seconds, so convert to hours: deltaTime / 3600
        const distanceNM = speed * (deltaTime / 3600); // knots * hours = nautical miles

        // Convert heading to radians (navigation uses degrees from north, clockwise)
        const headingRad = this.degreesToRadians(heading);

        // Calculate latitude change
        // Positive heading change (0� = north, 90� = east, 180� = south, 270� = west)
        const deltaLat = distanceNM * Math.cos(headingRad) / this.NM_PER_DEGREE_LAT;

        // Calculate longitude change (corrected for latitude)
        // At higher latitudes, longitude lines converge, so we need to divide by cos(latitude)
        const latRad = this.degreesToRadians(currentLat);
        const nmPerDegreeLon = this.NM_PER_DEGREE_LAT * Math.cos(latRad);
        const deltaLon = (distanceNM * Math.sin(headingRad)) / nmPerDegreeLon;

        // Calculate new position
        let newLat = currentLat + deltaLat;
        let newLon = currentLon + deltaLon;

        // Handle coordinate wrapping and clamping
        newLat = this.clampLatitude(newLat);
        newLon = this.wrapLongitude(newLon);

        // Update position in state
        const newCoordinates = [newLon, newLat];
        gameStateInstance.updateProperty('navigation.location.geometry.coordinates', newCoordinates);

        // Update course (actual track over ground)
        // For now, course equals heading (we'll add drift/current effects later)
        gameStateInstance.updateProperty('navigation.course', heading);
    }

    /**
     * Apply environmental effects to position (currents, drift)
     * TODO: Implement when environmental system is ready
     */
    applyEnvironmentalEffects(speed, heading, deltaTime) {
        const environment = gameStateInstance.getProperty('environment');

        if (!environment || !environment.currentStrength) {
            return { speed, heading };
        }

        // Calculate current effect
        const currentSpeed = environment.currentStrength || 0; // in knots
        const currentDirection = environment.currentDirection || 0; // in degrees

        // Vector addition of ship velocity and current
        // Convert to velocity components
        const shipVelX = speed * Math.sin(this.degreesToRadians(heading));
        const shipVelY = speed * Math.cos(this.degreesToRadians(heading));

        const currentVelX = currentSpeed * Math.sin(this.degreesToRadians(currentDirection));
        const currentVelY = currentSpeed * Math.cos(this.degreesToRadians(currentDirection));

        // Add vectors
        const totalVelX = shipVelX + currentVelX;
        const totalVelY = shipVelY + currentVelY;

        // Convert back to speed and heading
        const effectiveSpeed = Math.sqrt(totalVelX * totalVelX + totalVelY * totalVelY);
        const effectiveHeading = this.radiansToDegrees(Math.atan2(totalVelX, totalVelY));

        return {
            speed: effectiveSpeed,
            heading: this.normalizeHeading(effectiveHeading)
        };
    }

    /**
     * Clamp latitude to valid range [-90, 90]
     */
    clampLatitude(lat) {
        if (lat > 90) return 90;
        if (lat < -90) return -90;
        return lat;
    }

    /**
     * Wrap longitude to valid range [-180, 180]
     */
    wrapLongitude(lon) {
        while (lon > 180) lon -= 360;
        while (lon < -180) lon += 360;
        return lon;
    }

    /**
     * Normalize heading to [0, 360)
     */
    normalizeHeading(heading) {
        while (heading < 0) heading += 360;
        while (heading >= 360) heading -= 360;
        return heading;
    }

    /**
     * Convert degrees to radians
     */
    degreesToRadians(degrees) {
        return degrees * Math.PI / 180;
    }

    /**
     * Convert radians to degrees
     */
    radiansToDegrees(radians) {
        return radians * 180 / Math.PI;
    }

    /**
     * Calculate distance between two coordinates (Great Circle distance)
     * @param {number} lon1 - Longitude of first point
     * @param {number} lat1 - Latitude of first point
     * @param {number} lon2 - Longitude of second point
     * @param {number} lat2 - Latitude of second point
     * @returns {number} Distance in nautical miles
     */
    calculateDistance(lon1, lat1, lon2, lat2) {
        const lat1Rad = this.degreesToRadians(lat1);
        const lat2Rad = this.degreesToRadians(lat2);
        const deltaLat = this.degreesToRadians(lat2 - lat1);
        const deltaLon = this.degreesToRadians(lon2 - lon1);

        const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
                  Math.cos(lat1Rad) * Math.cos(lat2Rad) *
                  Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return this.EARTH_RADIUS_NM * c;
    }

    /**
     * Calculate bearing from one coordinate to another
     * @param {number} lon1 - Longitude of first point
     * @param {number} lat1 - Latitude of first point
     * @param {number} lon2 - Longitude of second point
     * @param {number} lat2 - Latitude of second point
     * @returns {number} Bearing in degrees (0-360)
     */
    calculateBearing(lon1, lat1, lon2, lat2) {
        const lat1Rad = this.degreesToRadians(lat1);
        const lat2Rad = this.degreesToRadians(lat2);
        const deltaLon = this.degreesToRadians(lon2 - lon1);

        const y = Math.sin(deltaLon) * Math.cos(lat2Rad);
        const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
                  Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(deltaLon);

        const bearing = this.radiansToDegrees(Math.atan2(y, x));

        return this.normalizeHeading(bearing);
    }

    /**
     * Calculate ETA to a waypoint
     * @param {number} targetLon - Target longitude
     * @param {number} targetLat - Target latitude
     * @returns {object} {distance: NM, bearing: degrees, eta: seconds}
     */
    calculateETA(targetLon, targetLat) {
        const location = gameStateInstance.getProperty('navigation.location');
        const [currentLon, currentLat] = location.geometry.coordinates;
        const helm = gameStateInstance.getProperty('helm');
        const currentSpeed = helm.currentSpeed || 0;

        const distance = this.calculateDistance(currentLon, currentLat, targetLon, targetLat);
        const bearing = this.calculateBearing(currentLon, currentLat, targetLon, targetLat);

        let eta = null;
        if (currentSpeed > 0) {
            eta = (distance / currentSpeed) * 3600; // Convert hours to seconds
        }

        return {
            distance,
            bearing,
            eta
        };
    }

    // ========================================
    // WAYPOINT MANAGEMENT METHODS
    // ========================================

    /**
     * Waypoint type definitions by category
     */
    getWaypointTypes() {
        return {
            NAV: ['HARBOUR', 'ANCHORAGE', 'CHANNEL', 'TURNING_POINT'],
            SCI: ['SAMPLE_SITE', 'RESEARCH_AREA', 'SURVEY_POINT', 'WRECK'],
            HAZ: ['ROCK', 'SHALLOW', 'OBSTRUCTION', 'RESTRICTED_AREA'],
            POI: ['LANDMARK', 'REFERENCE', 'CUSTOM']
        };
    }

    /**
     * Get current ship position and depth
     * @returns {object} {lat, lon, depth}
     */
    getCurrentPosition() {
        const location = gameStateInstance.getProperty('navigation.location');
        const [lon, lat] = location.geometry.coordinates;
        const depth = gameStateInstance.getProperty('navigation.depth');

        return { lat, lon, depth };
    }

    /**
     * Create a new waypoint
     * @param {object} waypointData - Waypoint data
     * @returns {object} {success: boolean, waypoint: object|null, error: string|null}
     */
    createWaypoint(waypointData) {
        // Validate required fields
        if (!waypointData.name || waypointData.name.trim() === '') {
            return { success: false, waypoint: null, error: 'Waypoint name is required' };
        }

        // Validate name length (5 characters max)
        if (waypointData.name.length > 5) {
            return { success: false, waypoint: null, error: 'Name must be 5 characters or less' };
        }

        // Validate name is alphanumeric
        if (!/^[A-Z0-9]+$/i.test(waypointData.name)) {
            return { success: false, waypoint: null, error: 'Name must be alphanumeric only' };
        }

        // Check for duplicate names
        const existingWaypoints = gameStateInstance.getAllWaypoints();
        if (existingWaypoints.some(wpt => wpt.name.toUpperCase() === waypointData.name.toUpperCase())) {
            return { success: false, waypoint: null, error: 'Waypoint name already exists' };
        }

        // Validate coordinates
        const validation = validateCoordinates(waypointData.lat, waypointData.lon);
        if (!validation.valid) {
            return { success: false, waypoint: null, error: validation.error };
        }

        // Validate category
        const validCategories = ['NAV', 'SCI', 'HAZ', 'POI'];
        if (!validCategories.includes(waypointData.category)) {
            return { success: false, waypoint: null, error: 'Invalid category' };
        }

        // Validate type within category
        const types = this.getWaypointTypes();
        if (!types[waypointData.category].includes(waypointData.type)) {
            return { success: false, waypoint: null, error: 'Invalid type for category' };
        }

        // Validate depth (reasonable range for submarine: 0 to 11000 meters)
        const depth = waypointData.depth || 0;
        if (depth < 0 || depth > 11000) {
            return { success: false, waypoint: null, error: 'Depth must be between 0 and 11000 meters' };
        }

        // Create waypoint object
        const waypoint = {
            id: `wpt-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
            name: waypointData.name.toUpperCase(),
            category: waypointData.category,
            type: waypointData.type,
            geometry: {
                type: "Point",
                coordinates: [waypointData.lon, waypointData.lat]
            },
            depth: depth,
            notes: waypointData.notes || '',
            created: new Date().toISOString(),
            source: 'user'
        };

        // Add to state
        gameStateInstance.addWaypoint(waypoint);

        console.log(`Mission Computer: Waypoint created - ${waypoint.name} at ${waypoint.geometry.coordinates}`);

        return { success: true, waypoint, error: null };
    }

    /**
     * Update an existing waypoint
     * @param {string} id - Waypoint ID
     * @param {object} updates - Fields to update
     * @returns {object} {success: boolean, error: string|null}
     */
    updateWaypoint(id, updates) {
        const waypoint = gameStateInstance.getWaypoint(id);
        if (!waypoint) {
            return { success: false, error: 'Waypoint not found' };
        }

        // Validate updates
        if (updates.name !== undefined) {
            if (updates.name.length > 5) {
                return { success: false, error: 'Name must be 5 characters or less' };
            }
            if (!/^[A-Z0-9]+$/i.test(updates.name)) {
                return { success: false, error: 'Name must be alphanumeric only' };
            }

            // Check for duplicate names (excluding current waypoint)
            const existingWaypoints = gameStateInstance.getAllWaypoints();
            if (existingWaypoints.some(wpt => wpt.id !== id && wpt.name.toUpperCase() === updates.name.toUpperCase())) {
                return { success: false, error: 'Waypoint name already exists' };
            }

            updates.name = updates.name.toUpperCase();
        }

        if (updates.lat !== undefined || updates.lon !== undefined) {
            const lat = updates.lat !== undefined ? updates.lat : waypoint.geometry.coordinates[1];
            const lon = updates.lon !== undefined ? updates.lon : waypoint.geometry.coordinates[0];

            const validation = validateCoordinates(lat, lon);
            if (!validation.valid) {
                return { success: false, error: validation.error };
            }

            updates.geometry = {
                type: "Point",
                coordinates: [lon, lat]
            };
            delete updates.lat;
            delete updates.lon;
        }

        if (updates.depth !== undefined) {
            if (updates.depth < 0 || updates.depth > 11000) {
                return { success: false, error: 'Depth must be between 0 and 11000 meters' };
            }
        }

        if (updates.category !== undefined) {
            const validCategories = ['NAV', 'SCI', 'HAZ', 'POI'];
            if (!validCategories.includes(updates.category)) {
                return { success: false, error: 'Invalid category' };
            }
        }

        if (updates.type !== undefined) {
            const category = updates.category || waypoint.category;
            const types = this.getWaypointTypes();
            if (!types[category].includes(updates.type)) {
                return { success: false, error: 'Invalid type for category' };
            }
        }

        // Apply updates
        gameStateInstance.updateWaypoint(id, updates);

        console.log(`Mission Computer: Waypoint updated - ${id}`);

        return { success: true, error: null };
    }

    /**
     * Delete a waypoint
     * @param {string} id - Waypoint ID
     * @returns {object} {success: boolean, error: string|null}
     */
    deleteWaypoint(id) {
        const waypoint = gameStateInstance.getWaypoint(id);
        if (!waypoint) {
            return { success: false, error: 'Waypoint not found' };
        }

        // Prevent deletion of location.json waypoints
        if (waypoint.source !== 'user') {
            return { success: false, error: 'Cannot delete system waypoint' };
        }

        gameStateInstance.deleteWaypoint(id);

        console.log(`Mission Computer: Waypoint deleted - ${waypoint.name}`);

        return { success: true, error: null };
    }

    /**
     * Get waypoint with calculated navigation data
     * @param {string} id - Waypoint ID
     * @returns {object|null} Waypoint with bearing, distance, eta
     */
    getWaypointWithNavData(id) {
        const waypoint = gameStateInstance.getWaypoint(id);
        if (!waypoint) return null;

        const [lon, lat] = waypoint.geometry.coordinates;
        const navData = this.calculateETA(lon, lat);

        return {
            ...waypoint,
            bearing: navData.bearing,
            distance: navData.distance,
            eta: navData.eta
        };
    }

    /**
     * Get all waypoints with calculated navigation data
     * @returns {array} Array of waypoints with nav data
     */
    getAllWaypointsWithNavData() {
        const waypoints = gameStateInstance.getAllWaypoints();
        return waypoints.map(wpt => {
            const [lon, lat] = wpt.geometry.coordinates;
            const navData = this.calculateETA(lon, lat);
            return {
                ...wpt,
                bearing: navData.bearing,
                distance: navData.distance,
                eta: navData.eta
            };
        });
    }

    /**
     * Load waypoints from locations.json
     * @param {array} locations - Array of location features
     */
    loadLocationsAsWaypoints(locations) {
        if (!locations || !Array.isArray(locations)) return;

        locations.forEach(location => {
            if (location.type !== 'Feature' || !location.geometry || !location.properties) return;

            const waypoint = {
                id: `loc-${location.properties.name.toLowerCase().replace(/\s+/g, '-')}`,
                name: location.properties.name.substring(0, 5).toUpperCase(),
                category: this.mapLocationTypeToCategory(location.properties.type),
                type: this.mapLocationTypeToWaypointType(location.properties.type),
                geometry: location.geometry,
                depth: 0,
                notes: location.properties.description || '',
                created: new Date().toISOString(),
                source: 'location'
            };

            // Check if already exists (by ID)
            if (!gameStateInstance.getWaypoint(waypoint.id)) {
                gameStateInstance.addWaypoint(waypoint);
            }
        });

        console.log(`Mission Computer: Loaded ${locations.length} locations as waypoints`);
    }

    /**
     * Map location type to waypoint category
     */
    mapLocationTypeToCategory(locationType) {
        const mapping = {
            'dock': 'NAV',
            'research': 'SCI',
            'hazard': 'HAZ',
            'landmark': 'POI'
        };
        return mapping[locationType] || 'POI';
    }

    /**
     * Map location type to waypoint type
     */
    mapLocationTypeToWaypointType(locationType) {
        const mapping = {
            'dock': 'HARBOUR',
            'research': 'RESEARCH_AREA',
            'hazard': 'OBSTRUCTION',
            'landmark': 'LANDMARK'
        };
        return mapping[locationType] || 'CUSTOM';
    }
}

// Create singleton instance
const missionComputer = new MissionComputer();

export default missionComputer;
