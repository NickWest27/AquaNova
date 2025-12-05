/**
 * Bathymetry Utilities
 * Helper functions for bathymetric contour rendering
 */

/**
 * Get fill color for depth zones (semi-transparent for layering)
 * @param {number} depth - Depth in meters (negative values)
 * @returns {string|null} RGBA color string or null if no fill
 */
export function getDepthFillColor(depth) {
    const absDepth = Math.abs(depth);

    if (depth === 0) {
        // Coastline/Land - yellow transparent
        return 'rgba(249, 220, 31, 0.9)';
    } else if (absDepth <= 10) {
        // Very shallow (0-10m) - very light blue
        return 'rgba(200, 230, 255, 0.4)';
    } else if (absDepth <= 50) {
        // Shallow (10-50m) - light blue
        return 'rgba(170, 215, 255, 0.35)';
    } else if (absDepth <= 100) {
        // Shallow shelf (50-100m) - light-medium blue
        return 'rgba(140, 200, 250, 0.3)';
    } else if (absDepth <= 200) {
        // Shelf (100-200m) - medium blue
        return 'rgba(110, 180, 240, 0.25)';
    } else if (absDepth <= 500) {
        // Shelf break (200-500m) - medium blue
        return 'rgba(80, 160, 230, 0.2)';
    } else if (absDepth <= 1000) {
        // Continental slope (500-1000m) - deeper blue
        return 'rgba(60, 140, 210, 0.15)';
    } else if (absDepth <= 2000) {
        // Upper slope (1000-2000m) - deeper blue
        return 'rgba(45, 120, 190, 0.15)';
    } else {
        // Deep water (>2000m) - very dark blue
        return 'rgba(25, 80, 150, 0.1)';
    }
}

/**
 * Get color based on depth (bright colors optimized for black background)
 * @param {number} depth - Depth in meters (negative values)
 * @returns {string} RGBA color string
 */
export function getDepthColor(depth) {
    const absDepth = Math.abs(depth);

    if (depth === 0) {
        // Coastline - tan/beige for land boundary
        return 'rgba(222, 184, 135, 1.0)'; // Burlywood - highly visible on black
    } else if (absDepth <= 10) {
        // Very shallow (0-10m) - bright cyan
        return 'rgba(0, 255, 255, 1.0)';
    } else if (absDepth <= 50) {
        // Shallow (10-50m) - bright aqua
        return 'rgba(64, 224, 208, 1.0)';
    } else if (absDepth <= 100) {
        // Shallow shelf (50-100m) - turquoise
        return 'rgba(64, 190, 224, 1.0)';
    } else if (absDepth <= 200) {
        // Shelf (100-200m) - light blue
        return 'rgba(100, 160, 255, 1.0)';
    } else if (absDepth <= 500) {
        // Shelf break (200-500m) - medium blue
        return 'rgba(80, 140, 255, 1.0)';
    } else if (absDepth <= 1000) {
        // Continental slope (500-1000m) - royal blue
        return 'rgba(65, 105, 225, 1.0)';
    } else if (absDepth <= 2000) {
        // Upper slope (1000-2000m) - cornflower blue
        return 'rgba(100, 149, 237, 1.0)';
    } else if (absDepth <= 3000) {
        // Mid slope (2000-3000m) - dodger blue
        return 'rgba(30, 144, 255, 1.0)';
    } else if (absDepth <= 4000) {
        // Lower slope (3000-4000m) - deep sky blue
        return 'rgba(0, 191, 255, 1.0)';
    } else if (absDepth <= 5000) {
        // Abyssal plain (4000-5000m) - light sky blue
        return 'rgba(135, 206, 250, 1.0)';
    } else if (absDepth <= 6000) {
        // Deep abyssal (5000-6000m) - steel blue
        return 'rgba(70, 130, 180, 1.0)';
    } else if (absDepth <= 8000) {
        // Deep ocean (6000-8000m) - powder blue
        return 'rgba(176, 224, 230, 1.0)';
    } else if (absDepth <= 10000) {
        // Deep trenches (8000-10000m) - light cyan
        return 'rgba(224, 255, 255, 1.0)';
    } else {
        // Extreme depths (10000m+) - white
        return 'rgba(255, 255, 255, 1.0)';
    }
}

/**
 * Get line width based on depth
 * @param {number} depth - Depth in meters (negative values)
 * @returns {number} Line width in pixels
 */
export function getDepthLineWidth(depth) {
    const absDepth = Math.abs(depth);

    // Coastline is thickest
    if (depth === 0) return 3;

    // Major deep contours (every 1000m) are thick
    if (absDepth >= 1000 && absDepth % 1000 === 0) return 2.5;

    // Important shallow contours (100m, 500m) are medium-thick
    if (absDepth === 100 || absDepth === 500) return 2;

    // Intermediate contours (50m, 200m) are medium
    if (absDepth === 50 || absDepth === 200) return 1.5;

    // Minor contours (10m, 20m, 30m, etc.) are thin
    return 1;
}

/**
 * Determine if a contour should be drawn based on zoom level (LOD)
 * @param {number} depth - Depth in meters (negative values)
 * @param {number} range - Display range in nautical miles
 * @returns {boolean} True if contour should be drawn
 */
export function shouldDrawContour(depth, range) {
    const absDepth = Math.abs(depth);

    // Always show coastline
    if (depth === 0) return true;

    // High zoom (≤ 5nm) - Show fine detail
    if (range <= 5) {
        return true; // Show all available contours
    }

    // Medium zoom (5-20nm) - Show moderate detail
    if (range <= 20) {
        // Show all shallow contours (0-50m) for better water depth visualization
        if (absDepth <= 50) return true;
        // Skip very fine deeper contours
        if (absDepth >= 100 && absDepth < 500 && absDepth % 100 !== 0) return false;
        return true;
    }

    // Low zoom (20-40nm) - Show major features only
    if (range <= 40) {
        // Show important shallow contours
        if (absDepth <= 50) return true;
        // Only major contours for deeper water
        if (absDepth < 500 && absDepth % 100 !== 0) return false;
        if (absDepth >= 500 && absDepth < 1000 && absDepth % 500 !== 0) return false;
        if (absDepth >= 1000 && absDepth % 1000 !== 0) return false;
        return true;
    }

    // Very low zoom (> 40nm) - Show only major depth features
    if (absDepth <= 50) return true; // Always show shallow water
    if (absDepth < 1000) return absDepth === 500; // Only 500m line for mid-depth
    return absDepth % 1000 === 0; // Only 1000m increments for deep
}

/**
 * Calculate bounding box of a GeoJSON feature
 * @param {Object} geometry - GeoJSON geometry object
 * @returns {Object} Bounds {minLon, maxLon, minLat, maxLat}
 */
export function getFeatureBounds(geometry) {
    if (!geometry || !geometry.coordinates) {
        return null;
    }

    let minLon = Infinity;
    let maxLon = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;

    // Handle LineString or Polygon
    const coords = geometry.type === 'Polygon'
        ? geometry.coordinates[0]
        : geometry.coordinates;

    coords.forEach(([lon, lat]) => {
        minLon = Math.min(minLon, lon);
        maxLon = Math.max(maxLon, lon);
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
    });

    return { minLon, maxLon, minLat, maxLat };
}

/**
 * Check if a feature is visible in the current viewport
 * @param {Object} feature - GeoJSON feature
 * @param {number} shipLon - Ship longitude
 * @param {number} shipLat - Ship latitude
 * @param {number} range - Display range in nautical miles
 * @returns {boolean} True if feature intersects viewport
 */
export function isContourVisible(feature, shipLon, shipLat, range) {
    const bounds = getFeatureBounds(feature.geometry);
    if (!bounds) return false;

    // Calculate viewport bounds with extra buffer for better coverage
    // Range is in nautical miles, convert to degrees (approximate)
    // 1 degree latitude ≈ 60 nautical miles
    // Add 50% buffer to ensure we don't cull features near viewport edges
    const rangeDegrees = (range * 1.5) / 60;

    const viewMinLon = shipLon - rangeDegrees;
    const viewMaxLon = shipLon + rangeDegrees;
    const viewMinLat = shipLat - rangeDegrees;
    const viewMaxLat = shipLat + rangeDegrees;

    // Check for intersection
    if (bounds.maxLon < viewMinLon) return false;
    if (bounds.minLon > viewMaxLon) return false;
    if (bounds.maxLat < viewMinLat) return false;
    if (bounds.minLat > viewMaxLat) return false;

    return true;
}

/**
 * Get depth label text
 * @param {number} depth - Depth in meters (negative values)
 * @returns {string} Formatted depth label (as positive number)
 */
export function getDepthLabel(depth) {
    if (depth === 0) return '0m';
    return `${Math.abs(depth)}m`;
}

/**
 * Determine if a depth label should be shown
 * @param {number} depth - Depth in meters (negative values)
 * @param {number} range - Display range in nautical miles
 * @returns {boolean} True if label should be shown
 */
export function shouldShowLabel(depth, range) {
    const absDepth = Math.abs(depth);

    // Don't show labels at very low zoom
    if (range > 40) {
        return absDepth >= 1000 && absDepth % 1000 === 0;
    }

    // Show labels for major contours
    if (depth === 0) return true;
    if (absDepth <= 100) return absDepth % 50 === 0;
    if (absDepth <= 1000) return absDepth % 100 === 0;
    return absDepth % 1000 === 0;
}

/**
 * Filter contours for rendering based on LOD and viewport
 * @param {Array} features - Array of GeoJSON features
 * @param {number} shipLon - Ship longitude
 * @param {number} shipLat - Ship latitude
 * @param {number} range - Display range in nautical miles
 * @returns {Array} Filtered features
 */
export function filterContoursForDisplay(features, shipLon, shipLat, range) {
    return features.filter(feature => {
        // Support multiple property names: ELEV (GEBCO), depth_min, depth
        const depth = feature.properties?.ELEV ?? feature.properties?.depth_min ?? feature.properties?.depth ?? 0;

        // LOD filtering
        if (!shouldDrawContour(depth, range)) {
            return false;
        }

        // Viewport culling
        if (!isContourVisible(feature, shipLon, shipLat, range)) {
            return false;
        }

        return true;
    });
}
