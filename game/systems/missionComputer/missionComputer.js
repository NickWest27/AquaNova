// missionComputer.js - Mission Computer System
// Handles position integration, drift calculations, routing, and navigation computations
// Pulls data from ship state (helm), calculates position updates, passes to navComputer

import gameStateInstance from '/game/state.js';

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
}

// Create singleton instance
const missionComputer = new MissionComputer();

export default missionComputer;
