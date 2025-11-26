/**
 * Bathymetry Renderer
 * Canvas rendering functions for bathymetric contours
 */

import {
    getDepthColor,
    getDepthFillColor,
    getDepthLineWidth,
    filterContoursForDisplay
} from './bathymetryUtils.js';

/**
 * Draw bathymetry contours on canvas
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} cx - Center X coordinate
 * @param {number} cy - Center Y coordinate
 * @param {number} maxRadius - Maximum radius of display
 * @param {Object} state - Navigation state object
 * @param {Object} bathymetryData - GeoJSON FeatureCollection
 */
export function drawBathymetryContours(ctx, cx, cy, maxRadius, state, bathymetryData) {
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

    // First pass: Fill depth zones with color gradients
    // Sort depths from deepest to shallowest for proper layering
    const depths = Object.keys(contoursByDepth).map(d => parseFloat(d)).sort((a, b) => a - b);

    depths.forEach(depthValue => {
        const features = contoursByDepth[depthValue.toString()];

        // Get fill color for this depth zone
        const fillColor = getDepthFillColor(depthValue);
        if (fillColor) {
            ctx.fillStyle = fillColor;

            // Fill all features at this depth
            features.forEach(feature => {
                drawContourFeature(ctx, feature, cx, cy, shipLon, shipLat, scale, lonScale, true);
            });
        }
    });

    // Second pass: Draw contour lines on top
    Object.entries(contoursByDepth).forEach(([depth, features]) => {
        const depthValue = parseFloat(depth);

        ctx.strokeStyle = getDepthColor(depthValue);
        ctx.lineWidth = getDepthLineWidth(depthValue);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Draw all contours of this depth
        features.forEach(feature => {
            drawContourFeature(ctx, feature, cx, cy, shipLon, shipLat, scale, lonScale, false);
        });
    });

    ctx.restore();
}

/**
 * Draw a single contour feature
 * @private
 */
function drawContourFeature(ctx, feature, cx, cy, shipLon, shipLat, scale, lonScale, fillOnly = false) {
    const geometry = feature.geometry;

    if (!geometry || !geometry.coordinates) {
        return;
    }

    // Handle both LineString and Polygon geometries
    const rings = geometry.type === 'Polygon'
        ? geometry.coordinates
        : [geometry.coordinates];

    rings.forEach(ring => {
        if (ring.length < 2) return;

        ctx.beginPath();

        ring.forEach((coord, i) => {
            const [lon, lat] = coord;

            // Convert lon/lat to nautical miles from ship position
            // Then to pixels with longitude correction
            const deltaLon = (lon - shipLon) * 60; // degrees to minutes
            const deltaLat = (lat - shipLat) * 60;

            // Use longitude-corrected scale for horizontal positioning
            const x = cx + (deltaLon * lonScale);
            // Use regular scale for vertical positioning (1 minute lat = 1 NM)
            const y = cy - (deltaLat * scale); // Invert Y axis

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });

        // For fill mode, always close the path to create a filled area
        // This works for both Polygons and LineStrings
        if (fillOnly) {
            ctx.closePath();
            ctx.fill();
        } else {
            // For stroke mode, only close Polygons
            if (geometry.type === 'Polygon') {
                ctx.closePath();
            }
            ctx.stroke();
        }
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
