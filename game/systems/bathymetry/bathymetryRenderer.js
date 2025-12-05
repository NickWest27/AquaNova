/**
 * Bathymetry Renderer
 * Canvas rendering functions for bathymetric contours
 */

import {
    getDepthColor,
    getDepthLineWidth,
    filterContoursForDisplay,
    getDepthLabel,
    shouldShowLabel
} from './bathymetryUtils.js';

/**
 * Draw bathymetry contours on canvas
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} cx - Center X coordinate
 * @param {number} cy - Center Y coordinate
 * @param {number} maxRadius - Maximum radius of display
 * @param {Object} state - Navigation state object
 * @param {Object} bathymetryData - GeoJSON FeatureCollection
 * @param {number} rotationAngle - Rotation angle in degrees (0 = north-up, heading for heading-up)
 */
export function drawBathymetryContours(ctx, cx, cy, maxRadius, state, bathymetryData, rotationAngle = 0) {
    if (!bathymetryData || !bathymetryData.features || bathymetryData.features.length === 0) {
        return;
    }

    const range = state.range || 10;
    const [shipLon, shipLat] = state.ownshipPosition || [-70.6709, 41.5223];

    // Scale factor: pixels per nautical mile
    // 1 degree latitude = 60 nautical miles
    // 1 minute latitude = 1 nautical mile
    const scale = maxRadius / range;

    // Longitude scale correction factor (1 minute of longitude = cos(latitude) nautical miles)
    const lonScale = scale * Math.cos(shipLat * Math.PI / 180);

    // Filter contours based on LOD and viewport
    const visibleContours = filterContoursForDisplay(
        bathymetryData.features,
        shipLon,
        shipLat,
        range
    );

    if (visibleContours.length === 0) {
        return;
    }

    // Group contours by depth for batch rendering
    const contoursByDepth = groupContoursByDepth(visibleContours);

    ctx.save();

    // Fill rendering disabled - using contour lines only for cleaner nautical chart appearance
    // Previously: First pass filled depth zones with color gradients
    // This was causing issues with coastline closure algorithm filling ocean instead of land

    // Draw contour lines
    Object.entries(contoursByDepth).forEach(([depth, features]) => {
        const depthValue = parseFloat(depth);

        ctx.strokeStyle = getDepthColor(depthValue);
        ctx.lineWidth = getDepthLineWidth(depthValue);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Draw all contours of this depth
        features.forEach(feature => {
            drawContourFeature(ctx, feature, cx, cy, shipLon, shipLat, scale, lonScale, rotationAngle);
        });
    });

    // Third pass: Draw depth labels on contours
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    Object.entries(contoursByDepth).forEach(([depth, features]) => {
        const depthValue = parseFloat(depth);

        // Only label contours that should be shown at this range
        if (!shouldShowLabel(depthValue, range)) {
            return;
        }

        const label = getDepthLabel(depthValue);

        // Set label color - use depth color for consistency
        ctx.fillStyle = getDepthColor(depthValue);

        features.forEach(feature => {
            drawContourLabel(ctx, feature, label, cx, cy, shipLon, shipLat, scale, lonScale, rotationAngle);
        });
    });

    ctx.restore();
}

/**
 * Draw depth label on a contour
 * @private
 */
function drawContourLabel(ctx, feature, label, cx, cy, shipLon, shipLat, scale, lonScale, rotationAngle = 0) {
    const geometry = feature.geometry;

    if (!geometry || !geometry.coordinates) {
        return;
    }

    // Get the coordinate array (handle both LineString and Polygon)
    const coords = geometry.type === 'Polygon'
        ? geometry.coordinates[0]
        : geometry.coordinates;

    if (coords.length < 2) return;

    // Find midpoint of the contour for label placement
    const midIndex = Math.floor(coords.length / 2);
    const [lon, lat] = coords[midIndex];

    // Convert to screen coordinates
    const deltaLon = (lon - shipLon) * 60;
    const deltaLat = (lat - shipLat) * 60;

    // Pre-calculate rotation if needed
    const rotationRad = rotationAngle * Math.PI / 180;
    const cosRot = Math.cos(rotationRad);
    const sinRot = Math.sin(rotationRad);

    let rotatedDeltaLon, rotatedDeltaLat;
    if (rotationAngle !== 0) {
        rotatedDeltaLon = deltaLon * cosRot - deltaLat * sinRot;
        rotatedDeltaLat = deltaLon * sinRot + deltaLat * cosRot;
    } else {
        rotatedDeltaLon = deltaLon;
        rotatedDeltaLat = deltaLat;
    }

    const x = cx + (rotatedDeltaLon * lonScale);
    const y = cy - (rotatedDeltaLat * scale);

    // Draw label
    ctx.fillText(label, x, y);
}

/**
 * Draw a single contour feature (stroke only)
 * @private
 */
function drawContourFeature(ctx, feature, cx, cy, shipLon, shipLat, scale, lonScale, rotationAngle = 0) {
    const geometry = feature.geometry;

    if (!geometry || !geometry.coordinates) {
        return;
    }

    // Handle both LineString and Polygon geometries
    const rings = geometry.type === 'Polygon'
        ? geometry.coordinates
        : [geometry.coordinates];

    // Pre-calculate rotation if needed
    const rotationRad = rotationAngle * Math.PI / 180;
    const cosRot = Math.cos(rotationRad);
    const sinRot = Math.sin(rotationRad);

    rings.forEach(ring => {
        if (ring.length < 2) return;

        ctx.beginPath();

        // Draw the contour path
        ring.forEach((coord, i) => {
            const [lon, lat] = coord;

            // Convert lon/lat to nautical miles from ship position
            const deltaLon = (lon - shipLon) * 60; // degrees to minutes
            const deltaLat = (lat - shipLat) * 60;

            // Apply rotation if needed (for heading-up displays)
            let rotatedDeltaLon, rotatedDeltaLat;
            if (rotationAngle !== 0) {
                rotatedDeltaLon = deltaLon * cosRot - deltaLat * sinRot;
                rotatedDeltaLat = deltaLon * sinRot + deltaLat * cosRot;
            } else {
                rotatedDeltaLon = deltaLon;
                rotatedDeltaLat = deltaLat;
            }

            // Convert to pixels with longitude correction
            const x = cx + (rotatedDeltaLon * lonScale);
            const y = cy - (rotatedDeltaLat * scale);

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });

        // Close Polygons, leave LineStrings open
        if (geometry.type === 'Polygon') {
            ctx.closePath();
        }

        ctx.stroke();
    });
}

/**
 * Group contours by depth for efficient batch rendering
 * @private
 */
function groupContoursByDepth(features) {
    const groups = {};

    features.forEach(feature => {
        // Support multiple property names: ELEV (GEBCO), depth_min, depth
        const depth = feature.properties?.ELEV ?? feature.properties?.depth_min ?? feature.properties?.depth ?? 0;
        const depthKey = depth.toString();

        if (!groups[depthKey]) {
            groups[depthKey] = [];
        }

        groups[depthKey].push(feature);
    });

    return groups;
}

/**
 * Draw bathymetry with caching for better performance
 * Creates an off-screen canvas that only updates when needed
 */
export class CachedBathymetryRenderer {
    constructor() {
        this.cacheCanvas = null;
        this.cacheCtx = null;
        this.cachedState = null;
        this.cacheDirty = true;
    }

    /**
     * Draw bathymetry using cache
     */
    draw(ctx, cx, cy, maxRadius, state, bathymetryData) {
        if (!bathymetryData || !bathymetryData.features || bathymetryData.features.length === 0) {
            return;
        }

        // Check if cache needs update
        if (this.shouldUpdateCache(state)) {
            this.updateCache(cx, cy, maxRadius, state, bathymetryData);
        }

        // Draw cached layer to main canvas
        if (this.cacheCanvas) {
            ctx.drawImage(this.cacheCanvas, 0, 0);
        }
    }

    /**
     * Check if cache needs to be updated
     */
    shouldUpdateCache(state) {
        if (this.cacheDirty || !this.cachedState) {
            return true;
        }

        const [oldLon, oldLat] = this.cachedState.position;
        const [newLon, newLat] = state.ownshipPosition || [-70.6709, 41.5223];

        // Update if ship moved significantly or range changed
        const positionChanged = Math.abs(oldLon - newLon) > 0.001 || Math.abs(oldLat - newLat) > 0.001;
        const rangeChanged = this.cachedState.range !== state.range;

        return positionChanged || rangeChanged;
    }

    /**
     * Update the cache canvas
     */
    updateCache(cx, cy, maxRadius, state, bathymetryData) {
        // Create cache canvas if needed
        if (!this.cacheCanvas) {
            this.cacheCanvas = document.createElement('canvas');
            this.cacheCtx = this.cacheCanvas.getContext('2d');
        }

        // Ensure canvas size matches display
        const displayCanvas = this.cacheCtx.canvas;
        const width = cx * 2;
        const height = cy * 2;

        if (displayCanvas.width !== width || displayCanvas.height !== height) {
            displayCanvas.width = width;
            displayCanvas.height = height;
        }

        // Clear cache
        this.cacheCtx.clearRect(0, 0, width, height);

        // Render bathymetry to cache (now includes longitude correction)
        drawBathymetryContours(this.cacheCtx, cx, cy, maxRadius, state, bathymetryData);

        // Update cached state
        this.cachedState = {
            position: [...(state.ownshipPosition || [-70.6709, 41.5223])],
            range: state.range
        };

        this.cacheDirty = false;
    }

    /**
     * Mark cache as dirty (needs update)
     */
    invalidate() {
        this.cacheDirty = true;
    }

    /**
     * Clear the cache
     */
    clear() {
        this.cacheDirty = true;
        this.cachedState = null;
        if (this.cacheCtx) {
            this.cacheCtx.clearRect(0, 0, this.cacheCanvas.width, this.cacheCanvas.height);
        }
    }
}
