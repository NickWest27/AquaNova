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
 * @param {number} rotationAngle - Rotation angle in degrees (0 = north-up, heading for heading-up)
 * @param {Object} tileBounds - Optional tile bounds {n, s, w, e} for coastline fill closure
 */
export function drawBathymetryContours(ctx, cx, cy, maxRadius, state, bathymetryData, rotationAngle = 0, tileBounds = null) {
    if (!bathymetryData || !bathymetryData.features || bathymetryData.features.length === 0) {
        console.log('RENDER: No bathymetry data to draw');
        return;
    }

    console.log(`RENDER: Drawing ${bathymetryData.features.length} contours at rotation ${rotationAngle}°`);

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
                drawContourFeature(ctx, feature, cx, cy, shipLon, shipLat, scale, lonScale, rotationAngle, true, tileBounds);
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
            drawContourFeature(ctx, feature, cx, cy, shipLon, shipLat, scale, lonScale, rotationAngle, false, tileBounds);
        });
    });

    ctx.restore();
}

/**
 * Draw a single contour feature
 * @private
 */
function drawContourFeature(ctx, feature, cx, cy, shipLon, shipLat, scale, lonScale, rotationAngle = 0, fillOnly = false, tileBounds = null) {
    const geometry = feature.geometry;

    if (!geometry || !geometry.coordinates) {
        return;
    }

    // Get depth to identify coastlines
    const depth = feature.properties?.ELEV ?? feature.properties?.depth_min ?? feature.properties?.depth ?? 0;
    const isCoastline = depth === 0;

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

        // Convert all coordinates to screen space
        const screenCoords = ring.map(coord => {
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

            return { x, y, lon, lat };
        });

        // Draw the main path
        screenCoords.forEach((coord, i) => {
            if (i === 0) {
                ctx.moveTo(coord.x, coord.y);
            } else {
                ctx.lineTo(coord.x, coord.y);
            }
        });

        // For fill mode with LineString coastlines, extend to tile boundaries instead of closing directly
        if (fillOnly && geometry.type === 'LineString' && isCoastline && tileBounds) {
            // Get first and last points in geo coords
            const firstGeo = ring[0];
            const lastGeo = ring[ring.length - 1];

            // Helper function to convert lat/lon to screen coords
            const geoToScreen = (lon, lat) => {
                const deltaLon = (lon - shipLon) * 60;
                const deltaLat = (lat - shipLat) * 60;

                let rotatedDeltaLon, rotatedDeltaLat;
                if (rotationAngle !== 0) {
                    const rotationRad = rotationAngle * Math.PI / 180;
                    const cosRot = Math.cos(rotationRad);
                    const sinRot = Math.sin(rotationRad);
                    rotatedDeltaLon = deltaLon * cosRot - deltaLat * sinRot;
                    rotatedDeltaLat = deltaLon * sinRot + deltaLat * cosRot;
                } else {
                    rotatedDeltaLon = deltaLon;
                    rotatedDeltaLat = deltaLat;
                }

                return {
                    x: cx + (rotatedDeltaLon * lonScale),
                    y: cy - (rotatedDeltaLat * scale)
                };
            };

            // Determine which tile boundary each endpoint is on or closest to
            // Tile boundaries: north (n), south (s), west (w), east (e)
            const { n, s, w, e } = tileBounds;

            // Check if last point is on a boundary (within 0.001 degrees)
            const tolerance = 0.001;
            const [lastLon, lastLat] = lastGeo;
            const [firstLon, firstLat] = firstGeo;

            // Determine which boundaries the points are on
            const lastOnNorth = Math.abs(lastLat - n) < tolerance;
            const lastOnSouth = Math.abs(lastLat - s) < tolerance;
            const lastOnWest = Math.abs(lastLon - w) < tolerance;
            const lastOnEast = Math.abs(lastLon - e) < tolerance;

            const firstOnNorth = Math.abs(firstLat - n) < tolerance;
            const firstOnSouth = Math.abs(firstLat - s) < tolerance;
            const firstOnWest = Math.abs(firstLon - w) < tolerance;
            const firstOnEast = Math.abs(firstLon - e) < tolerance;

            // Trace along tile boundaries to connect last point to first point
            // We need to go around the tile edge clockwise or counterclockwise

            // Convert tile corners to screen coords for reference
            const nw = geoToScreen(w, n);
            const ne = geoToScreen(e, n);
            const se = geoToScreen(e, s);
            const sw = geoToScreen(w, s);

            // Trace tile boundary from last point to first point
            // Start from last point, go to nearest corner, then trace boundary to first point
            if (lastOnNorth) {
                // Last point on north boundary
                if (firstOnNorth) {
                    // Both on north - just close
                    ctx.closePath();
                } else if (firstOnEast) {
                    // Go to NE corner, then south along east boundary
                    ctx.lineTo(ne.x, ne.y);
                } else if (firstOnWest) {
                    // Go to NW corner, then south along west boundary
                    ctx.lineTo(nw.x, nw.y);
                } else {
                    // Go to nearest corner and around
                    ctx.lineTo(lastLon > (w + e) / 2 ? ne.x : nw.x, lastLon > (w + e) / 2 ? ne.y : nw.y);
                    ctx.lineTo(se.x, se.y);
                    ctx.lineTo(sw.x, sw.y);
                }
            } else if (lastOnSouth) {
                // Last point on south boundary
                if (firstOnSouth) {
                    ctx.closePath();
                } else if (firstOnEast) {
                    ctx.lineTo(se.x, se.y);
                } else if (firstOnWest) {
                    ctx.lineTo(sw.x, sw.y);
                } else {
                    ctx.lineTo(lastLon > (w + e) / 2 ? se.x : sw.x, lastLon > (w + e) / 2 ? se.y : sw.y);
                    ctx.lineTo(ne.x, ne.y);
                    ctx.lineTo(nw.x, nw.y);
                }
            } else if (lastOnWest) {
                // Last point on west boundary
                if (firstOnWest) {
                    ctx.closePath();
                } else if (firstOnNorth) {
                    ctx.lineTo(nw.x, nw.y);
                } else if (firstOnSouth) {
                    ctx.lineTo(sw.x, sw.y);
                } else {
                    ctx.lineTo(lastLat > (s + n) / 2 ? nw.x : sw.x, lastLat > (s + n) / 2 ? nw.y : sw.y);
                    ctx.lineTo(ne.x, ne.y);
                    ctx.lineTo(se.x, se.y);
                }
            } else if (lastOnEast) {
                // Last point on east boundary
                if (firstOnEast) {
                    ctx.closePath();
                } else if (firstOnNorth) {
                    ctx.lineTo(ne.x, ne.y);
                } else if (firstOnSouth) {
                    ctx.lineTo(se.x, se.y);
                } else {
                    ctx.lineTo(lastLat > (s + n) / 2 ? ne.x : se.x, lastLat > (s + n) / 2 ? ne.y : se.y);
                    ctx.lineTo(nw.x, nw.y);
                    ctx.lineTo(sw.x, sw.y);
                }
            } else {
                // Point not on boundary - just close path normally
                ctx.closePath();
            }

            ctx.fill();
        } else if (fillOnly) {
            // For Polygons or non-coastline fills, close normally
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
