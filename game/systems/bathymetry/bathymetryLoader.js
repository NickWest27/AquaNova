/**
 * Bathymetry Data Loader
 * Handles loading and caching of bathymetric contour data
 */

class BathymetryLoader {
    constructor() {
        this.cache = new Map();
        this.loadingPromises = new Map();
    }

    /**
     * Load bathymetry data for a specific region and resolution
     * @param {string} region - Region identifier (e.g., 'n40s20w-80e-20')
     * @param {string} resolution - Resolution level: '10m', '100m', '500m', or '1000m'
     * @returns {Promise<Object>} GeoJSON FeatureCollection
     */
    async loadRegion(region = 'n40s20w-80e-20', resolution = '500m') {
        const cacheKey = `${region}_${resolution}`;

        // Check cache first
        if (this.cache.has(cacheKey)) {
            console.log(`BATHYMETRY: Using cached data for ${region} at ${resolution}`);
            return this.cache.get(cacheKey);
        }

        // Check if already loading
        if (this.loadingPromises.has(cacheKey)) {
            console.log(`BATHYMETRY: Waiting for in-progress load of ${region} at ${resolution}`);
            return this.loadingPromises.get(cacheKey);
        }

        // Start new load
        console.log(`BATHYMETRY: Loading data for ${region} at ${resolution}...`);
        const loadPromise = this._fetchData(region, resolution);
        this.loadingPromises.set(cacheKey, loadPromise);

        try {
            const data = await loadPromise;
            this.cache.set(cacheKey, data);
            this.loadingPromises.delete(cacheKey);
            console.log(`BATHYMETRY: Successfully loaded ${data.features.length} contours for ${region} at ${resolution}`);
            return data;
        } catch (error) {
            this.loadingPromises.delete(cacheKey);
            console.error(`BATHYMETRY: Failed to load ${region} at ${resolution}:`, error);
            throw error;
        }
    }

    /**
     * Legacy method for backward compatibility
     * @deprecated Use loadRegion(region, resolution) instead
     */
    async loadRegionLegacy(region = 'north_atlantic') {
        // Check cache first
        if (this.cache.has(region)) {
            console.log(`BATHYMETRY: Using cached data for ${region}`);
            return this.cache.get(region);
        }

        // Check if already loading
        if (this.loadingPromises.has(region)) {
            console.log(`BATHYMETRY: Waiting for in-progress load of ${region}`);
            return this.loadingPromises.get(region);
        }

        // Start new load
        console.log(`BATHYMETRY: Loading data for ${region}...`);
        const loadPromise = this._fetchData(region);
        this.loadingPromises.set(region, loadPromise);

        try {
            const data = await loadPromise;
            this.cache.set(region, data);
            this.loadingPromises.delete(region);
            console.log(`BATHYMETRY: Successfully loaded ${data.features.length} contours for ${region}`);
            return data;
        } catch (error) {
            this.loadingPromises.delete(region);
            console.error(`BATHYMETRY: Failed to load ${region}:`, error);
            throw error;
        }
    }

    /**
     * Internal method to fetch data from server
     * @private
     */
    async _fetchData(region, resolution = '500m') {
        // New tile-based naming: regionName_resolution.geojson
        // e.g., n40s30w-80e-70_500m.geojson
        const filename = `${region}_${resolution}.geojson`;
        const path = `/data/bathymetry/${filename}`;

        try {
            const response = await fetch(path);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            // Validate data structure
            if (!data.type || data.type !== 'FeatureCollection') {
                throw new Error('Invalid GeoJSON: Expected FeatureCollection');
            }

            if (!Array.isArray(data.features)) {
                throw new Error('Invalid GeoJSON: Missing features array');
            }

            return data;
        } catch (error) {
            // If file not found, return empty dataset as fallback
            if (error.message.includes('404')) {
                console.warn(`BATHYMETRY: No data file found at ${path}, using empty dataset`);
                return this._createEmptyDataset();
            }
            throw error;
        }
    }

    /**
     * Create an empty GeoJSON FeatureCollection
     * @private
     */
    _createEmptyDataset() {
        return {
            type: 'FeatureCollection',
            features: []
        };
    }

    /**
     * Clear cached data for a region
     * @param {string} region - Region to clear, or null to clear all
     */
    clearCache(region = null) {
        if (region) {
            this.cache.delete(region);
            console.log(`BATHYMETRY: Cleared cache for ${region}`);
        } else {
            this.cache.clear();
            console.log('BATHYMETRY: Cleared all cached data');
        }
    }

    /**
     * Get cache statistics
     * @returns {Object} Cache stats
     */
    getCacheStats() {
        return {
            cachedRegions: Array.from(this.cache.keys()),
            cacheSize: this.cache.size,
            loading: Array.from(this.loadingPromises.keys())
        };
    }
}

// Export singleton instance
export const bathymetryLoader = new BathymetryLoader();
