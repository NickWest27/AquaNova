// utils/coordinates.js
// Coordinate conversion utilities for navigation system
// Handles conversion between decimal degrees and DMS (Degrees Minutes Seconds)
// Provides formatting and parsing for user-friendly coordinate display

/**
 * Convert decimal degrees to DMS (Degrees Minutes Seconds)
 * @param {number} decimal - Decimal degrees
 * @returns {object} {degrees, minutes, seconds}
 */
export function decimalToDMS(decimal) {
    const absolute = Math.abs(decimal);
    const degrees = Math.floor(absolute);
    const minutesDecimal = (absolute - degrees) * 60;
    const minutes = Math.floor(minutesDecimal);
    const seconds = ((minutesDecimal - minutes) * 60).toFixed(2);

    return {
        degrees,
        minutes,
        seconds: parseFloat(seconds)
    };
}

/**
 * Convert DMS to decimal degrees
 * @param {number} degrees - Degrees
 * @param {number} minutes - Minutes
 * @param {number} seconds - Seconds
 * @param {string} hemisphere - 'N', 'S', 'E', or 'W'
 * @returns {number} Decimal degrees
 */
export function dmsToDecimal(degrees, minutes, seconds, hemisphere) {
    let decimal = degrees + (minutes / 60) + (seconds / 3600);

    // Make negative for South and West
    if (hemisphere === 'S' || hemisphere === 'W') {
        decimal = -decimal;
    }

    return decimal;
}

/**
 * Format latitude in DMS with N/S hemisphere
 * @param {number} decimal - Decimal degrees latitude
 * @returns {string} Formatted string (e.g., "41°31'20.3\"N")
 */
export function formatLatitude(decimal) {
    const hemisphere = decimal >= 0 ? 'N' : 'S';
    const dms = decimalToDMS(decimal);
    return `${dms.degrees}°${dms.minutes}'${dms.seconds.toFixed(1)}"${hemisphere}`;
}

/**
 * Format longitude in DMS with E/W hemisphere
 * @param {number} decimal - Decimal degrees longitude
 * @returns {string} Formatted string (e.g., "70°40'15.2\"W")
 */
export function formatLongitude(decimal) {
    const hemisphere = decimal >= 0 ? 'E' : 'W';
    const dms = decimalToDMS(decimal);
    return `${dms.degrees}°${dms.minutes}'${dms.seconds.toFixed(1)}"${hemisphere}`;
}

/**
 * Format a coordinate pair for display
 * @param {number} lat - Latitude in decimal degrees
 * @param {number} lon - Longitude in decimal degrees
 * @returns {string} Formatted coordinate pair
 */
export function formatCoordinatePair(lat, lon) {
    return `${formatLatitude(lat)}, ${formatLongitude(lon)}`;
}

/**
 * Parse user input for coordinates
 * Supports multiple formats:
 * - DD.DDDD (decimal degrees)
 * - DD MM.MMM (degrees decimal minutes)
 * - DD MM SS.S (degrees minutes seconds)
 * @param {string} input - User input string
 * @param {string} coordinateType - 'lat' or 'lon'
 * @returns {number|null} Decimal degrees or null if invalid
 */
export function parseCoordinateInput(input, coordinateType) {
    if (!input || typeof input !== 'string') return null;

    // Remove extra whitespace and convert to uppercase
    const cleaned = input.trim().toUpperCase();

    // Extract hemisphere if present
    let hemisphere = null;
    let numericPart = cleaned;

    if (coordinateType === 'lat') {
        if (cleaned.endsWith('N')) {
            hemisphere = 'N';
            numericPart = cleaned.slice(0, -1).trim();
        } else if (cleaned.endsWith('S')) {
            hemisphere = 'S';
            numericPart = cleaned.slice(0, -1).trim();
        }
    } else if (coordinateType === 'lon') {
        if (cleaned.endsWith('E')) {
            hemisphere = 'E';
            numericPart = cleaned.slice(0, -1).trim();
        } else if (cleaned.endsWith('W')) {
            hemisphere = 'W';
            numericPart = cleaned.slice(0, -1).trim();
        }
    }

    // Split by spaces, degrees symbol, minutes symbol, or seconds symbol
    const parts = numericPart.split(/[\s°'"]+/).filter(p => p && p.length > 0);

    let decimal = null;

    if (parts.length === 1) {
        // Simple decimal degrees: "41.5223" or "-70.6709"
        decimal = parseFloat(parts[0]);
    } else if (parts.length === 2) {
        // Degrees and decimal minutes: "41 31.338"
        const degrees = parseFloat(parts[0]);
        const minutes = parseFloat(parts[1]);
        decimal = degrees + (minutes / 60);
    } else if (parts.length === 3) {
        // Degrees, minutes, seconds: "41 31 20.3"
        const degrees = parseFloat(parts[0]);
        const minutes = parseFloat(parts[1]);
        const seconds = parseFloat(parts[2]);
        decimal = degrees + (minutes / 60) + (seconds / 3600);
    }

    if (decimal === null || isNaN(decimal)) return null;

    // Apply hemisphere
    if (hemisphere === 'S' || hemisphere === 'W') {
        decimal = -Math.abs(decimal);
    } else if (hemisphere === 'N' || hemisphere === 'E') {
        decimal = Math.abs(decimal);
    }

    return decimal;
}

/**
 * Validate latitude value
 * @param {number} lat - Latitude in decimal degrees
 * @returns {boolean} True if valid
 */
export function validateLatitude(lat) {
    return typeof lat === 'number' && !isNaN(lat) && lat >= -90 && lat <= 90;
}

/**
 * Validate longitude value
 * @param {number} lon - Longitude in decimal degrees
 * @returns {boolean} True if valid
 */
export function validateLongitude(lon) {
    return typeof lon === 'number' && !isNaN(lon) && lon >= -180 && lon <= 180;
}

/**
 * Validate coordinate pair
 * @param {number} lat - Latitude in decimal degrees
 * @param {number} lon - Longitude in decimal degrees
 * @returns {object} {valid: boolean, error: string|null}
 */
export function validateCoordinates(lat, lon) {
    if (!validateLatitude(lat)) {
        return {
            valid: false,
            error: 'Invalid latitude. Must be between -90 and 90 degrees.'
        };
    }

    if (!validateLongitude(lon)) {
        return {
            valid: false,
            error: 'Invalid longitude. Must be between -180 and 180 degrees.'
        };
    }

    return { valid: true, error: null };
}

/**
 * Format coordinate for keyboard display (compact format)
 * @param {number} decimal - Decimal degrees
 * @param {string} type - 'lat' or 'lon'
 * @returns {string} Compact formatted string (e.g., "41°31.3'N")
 */
export function formatCompactCoordinate(decimal, type) {
    const hemisphere = type === 'lat'
        ? (decimal >= 0 ? 'N' : 'S')
        : (decimal >= 0 ? 'E' : 'W');

    const absolute = Math.abs(decimal);
    const degrees = Math.floor(absolute);
    const minutes = ((absolute - degrees) * 60).toFixed(1);

    return `${degrees}°${minutes}'${hemisphere}`;
}

/**
 * Get default hemisphere for coordinate type based on value
 * @param {number} decimal - Decimal degrees
 * @param {string} type - 'lat' or 'lon'
 * @returns {string} Hemisphere letter
 */
export function getHemisphere(decimal, type) {
    if (type === 'lat') {
        return decimal >= 0 ? 'N' : 'S';
    } else {
        return decimal >= 0 ? 'E' : 'W';
    }
}
