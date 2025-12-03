/**
 * Bathymetry Tile Manager
 * Intelligently loads and unloads tiles based on viewport visibility and zoom level
 */

import { bathymetryLoader } from './bathymetryLoader.js';

// Available tiles (10° x 10° coverage)
const TILES = [
  { name: 'n40s30w-80e-70', bounds: { n: 40, s: 30, w: -80, e: -70 } },
  { name: 'n40s30w-70e-60', bounds: { n: 40, s: 30, w: -70, e: -60 } },
  { name: 'n40s30w-60e-50', bounds: { n: 40, s: 30, w: -60, e: -50 } },
  { name: 'n40s30w-50e-40', bounds: { n: 40, s: 30, w: -50, e: -40 } },
  { name: 'n40s30w-40e-30', bounds: { n: 40, s: 30, w: -40, e: -30 } },
  { name: 'n40s30w-30e-20', bounds: { n: 40, s: 30, w: -30, e: -20 } },
  { name: 'n40s30w-20e-10', bounds: { n: 40, s: 30, w: -20, e: -10 } },
  { name: 'n40s30w-10e-00', bounds: { n: 40, s: 30, w: -10, e: -0 } },
  { name: 'n45s40w-75e-70', bounds: { n: 45, s: 40, w: -75, e: -70 } }
];

/**
 * Determine appropriate resolution based on range (LOD system)
 * @param {number} range - Display range in nautical miles
 * @returns {string} Resolution level: '10m', '100m', '500m', or '1000m'
 */
function getResolutionForRange(range) {
  if (range <= 5) {
    return '10m';   // High detail for very close zoom
  } else if (range <= 20) {
    return '100m';  // Medium detail for close zoom
  } else if (range <= 80) {
    return '500m';  // Lower detail for medium zoom
  } else {
    return '1000m'; // Lowest detail for far zoom
  }
}

/**
 * Calculate viewport bounds in lat/lon
 * @param {number} shipLon - Ship longitude
 * @param {number} shipLat - Ship latitude
 * @param {number} range - Display range in nautical miles
 * @returns {Object} Viewport bounds {n, s, w, e}
 */
function calculateViewportBounds(shipLon, shipLat, range) {
  // Convert range (nautical miles) to degrees
  // 1 NM = 1 minute of latitude = 1/60 degree
  const latRange = range / 60;

  // Longitude range depends on latitude (longitude lines converge at poles)
  const lonRange = latRange / Math.cos(shipLat * Math.PI / 180);

  // Add 10% buffer to ensure smooth loading before tiles are needed
  const buffer = 1.1;

  return {
    n: shipLat + (latRange * buffer),
    s: shipLat - (latRange * buffer),
    e: shipLon + (lonRange * buffer),
    w: shipLon - (lonRange * buffer)
  };
}

/**
 * Check if a tile intersects with the viewport
 * @param {Object} tileBounds - Tile bounds {n, s, w, e}
 * @param {Object} viewportBounds - Viewport bounds {n, s, w, e}
 * @returns {boolean} True if tile is visible in viewport
 */
function isTileVisible(tileBounds, viewportBounds) {
  // Check if rectangles overlap
  return !(
    tileBounds.e < viewportBounds.w ||  // Tile is completely to the west
    tileBounds.w > viewportBounds.e ||  // Tile is completely to the east
    tileBounds.n < viewportBounds.s ||  // Tile is completely to the south
    tileBounds.s > viewportBounds.n     // Tile is completely to the north
  );
}

/**
 * Get all tiles visible in the current viewport
 * @param {number} shipLon - Ship longitude
 * @param {number} shipLat - Ship latitude
 * @param {number} range - Display range in nautical miles
 * @returns {Array<Object>} Array of visible tiles {name, bounds}
 */
function getVisibleTiles(shipLon, shipLat, range) {
  const viewportBounds = calculateViewportBounds(shipLon, shipLat, range);

  const visibleTiles = TILES.filter(tile =>
    isTileVisible(tile.bounds, viewportBounds)
  );

  return visibleTiles;
}

/**
 * Bathymetry Tile Manager
 * Manages loading and unloading of bathymetry tiles
 */
class BathymetryTileManager {
  constructor() {
    // Map of loaded tiles: key = "tileName_resolution", value = data
    this.loadedTiles = new Map();

    // Track current state
    this.currentPosition = { lon: null, lat: null };
    this.currentRange = null;
    this.currentResolution = null;

    // Tile that contains the ship (primary tile)
    this.primaryTile = null;

    // Cache combined data to avoid regenerating it
    this.cachedCombinedData = null;
    this.dataDirty = true;
  }

  /**
   * Update tiles based on current position and range
   * @param {number} lon - Current longitude
   * @param {number} lat - Current latitude
   * @param {number} range - Display range in nautical miles
   * @returns {Promise<Object>} Combined bathymetry data
   */
  async update(lon, lat, range) {
    const resolution = getResolutionForRange(range);

    // Check if we need to update (debounce)
    const positionChanged =
      this.currentPosition.lon === null ||
      Math.abs(this.currentPosition.lon - lon) > 0.001 ||
      Math.abs(this.currentPosition.lat - lat) > 0.001;

    const rangeChanged = this.currentRange !== range;
    const resolutionChanged = this.currentResolution !== resolution;

    // If nothing changed, return cached data
    if (!positionChanged && !rangeChanged && !resolutionChanged) {
      return this.getCombinedData();
    }

    // Get tiles that should be visible
    const visibleTiles = getVisibleTiles(lon, lat, range);

    // Find primary tile (contains ship position)
    const primaryTile = this.findTileForPosition(lon, lat);
    this.primaryTile = primaryTile ? primaryTile.name : null;

    // Determine which tiles to load
    const tilesToLoad = visibleTiles.map(tile => ({
      name: tile.name,
      bounds: tile.bounds,
      resolution: resolution,
      key: `${tile.name}_${resolution}`
    }));

    // Determine which tiles to unload (loaded but not visible)
    const keysToKeep = new Set(tilesToLoad.map(t => t.key));
    const keysToUnload = [];

    for (const key of this.loadedTiles.keys()) {
      if (!keysToKeep.has(key)) {
        keysToUnload.push(key);
      }
    }

    // Unload tiles that are no longer visible
    for (const key of keysToUnload) {
      this.loadedTiles.delete(key);
      bathymetryLoader.clearCache(key);
      this.dataDirty = true;
    }

    // Load tiles that aren't already loaded
    const loadPromises = [];
    for (const tile of tilesToLoad) {
      if (!this.loadedTiles.has(tile.key)) {
        console.log(`BATHYMETRY: Loading tile: ${tile.key}`);
        const promise = bathymetryLoader.loadRegion(tile.name, tile.resolution)
          .then(data => {
            this.loadedTiles.set(tile.key, {
              name: tile.name,
              bounds: tile.bounds,
              resolution: tile.resolution,
              data: data
            });
            this.dataDirty = true;
            return { key: tile.key, success: true };
          })
          .catch(error => {
            console.warn(`BATHYMETRY: Failed to load ${tile.key}:`, error);
            return { key: tile.key, success: false };
          });
        loadPromises.push(promise);
      }
    }

    // Wait for all loads to complete
    if (loadPromises.length > 0) {
      await Promise.all(loadPromises);
    }

    // Update current state
    this.currentPosition = { lon, lat };
    this.currentRange = range;
    this.currentResolution = resolution;

    // Log summary if tiles were loaded or unloaded
    if (loadPromises.length > 0 || keysToUnload.length > 0) {
      const stats = this.getStats();
      console.log(`BATHYMETRY: Loaded ${stats.uniqueTileCount} tiles at ${stats.currentResolution} (${stats.totalFeatures} contours, ${this.getMemoryUsage()}MB)`);
    }

    // Return combined data
    return this.getCombinedData();
  }

  /**
   * Get combined bathymetry data from all loaded tiles
   * @returns {Object} GeoJSON FeatureCollection with all features
   */
  getCombinedData() {
    // Return cached data if nothing has changed
    if (!this.dataDirty && this.cachedCombinedData) {
      return this.cachedCombinedData;
    }

    const allFeatures = [];

    for (const tile of this.loadedTiles.values()) {
      if (tile.data && tile.data.features) {
        allFeatures.push(...tile.data.features);
      }
    }

    this.cachedCombinedData = {
      type: 'FeatureCollection',
      features: allFeatures
    };

    this.dataDirty = false;
    return this.cachedCombinedData;
  }

  /**
   * Get tile bounds for a specific tile name
   * @param {string} tileName - Tile name
   * @returns {Object|null} Tile bounds {n, s, w, e} or null
   */
  getTileBounds(tileName) {
    const tile = TILES.find(t => t.name === tileName);
    return tile ? tile.bounds : null;
  }

  /**
   * Find which tile contains a given position
   * @param {number} lon - Longitude
   * @param {number} lat - Latitude
   * @returns {Object|null} Tile object or null
   */
  findTileForPosition(lon, lat) {
    for (const tile of TILES) {
      if (lat >= tile.bounds.s && lat <= tile.bounds.n &&
          lon >= tile.bounds.w && lon <= tile.bounds.e) {
        return tile;
      }
    }
    return null;
  }

  /**
   * Get statistics about loaded tiles
   * @returns {Object} Statistics
   */
  getStats() {
    const loadedTileNames = Array.from(this.loadedTiles.values()).map(t => t.name);
    const uniqueTiles = [...new Set(loadedTileNames)];
    const totalFeatures = Array.from(this.loadedTiles.values())
      .reduce((sum, tile) => sum + (tile.data?.features?.length || 0), 0);

    return {
      loadedTiles: Array.from(this.loadedTiles.keys()),
      uniqueTileCount: uniqueTiles.length,
      totalTileCount: this.loadedTiles.size,
      totalFeatures: totalFeatures,
      currentResolution: this.currentResolution,
      primaryTile: this.primaryTile
    };
  }

  /**
   * Get approximate memory usage
   * @returns {number} Size in MB
   */
  getMemoryUsage() {
    try {
      const combinedData = this.getCombinedData();
      const jsonString = JSON.stringify(combinedData);
      const bytes = new Blob([jsonString]).size;
      return (bytes / (1024 * 1024)).toFixed(1);
    } catch (e) {
      return 0;
    }
  }

  /**
   * Clear all loaded tiles
   */
  clearAll() {
    for (const key of this.loadedTiles.keys()) {
      bathymetryLoader.clearCache(key);
    }
    this.loadedTiles.clear();
    console.log('BATHYMETRY: Cleared all loaded tiles');
  }
}

// Export singleton instance
export const bathymetryTileManager = new BathymetryTileManager();

// Export utility functions for external use
export { getResolutionForRange, getVisibleTiles, TILES };
