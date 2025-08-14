// game/saveManager.js
// Handles saving/loading from logbook entries

class SaveManager {
    constructor(gameState) {
        this.gameState = gameState;
        this.storageKey = 'aquanova_save_data';
        this.initialize();
    }

    initialize() {
        console.log("SaveManager initialized");
        this.loadGameData();
    }

    // Main save/load operations
    saveGame(logEntry = null) {
        try {
            const saveData = {
                version: "1.0.0",
                timestamp: new Date().toISOString(),
                gameState: this.gameState.getState(),
                logEntryId: logEntry ? logEntry.id : null
            };

            // Save to browser storage
            this.saveToStorage(saveData);

            // Also save to the logbook.json structure if logEntry provided
            if (logEntry) {
                this.saveToLogbook(saveData, logEntry);
            }

            console.log("Game saved successfully", saveData.timestamp);
            return { success: true, timestamp: saveData.timestamp };

        } catch (error) {
            console.error("Failed to save game:", error);
            return { success: false, error: error.message };
        }
    }

    loadGame(saveId = null) {
        try {
            let saveData;

            if (saveId) {
                // Load specific save by ID from logbook
                saveData = this.loadFromLogbook(saveId);
            } else {
                // Load most recent save from storage
                saveData = this.loadFromStorage();
            }

            if (!saveData) {
                console.log("No save data found, using default state");
                return { success: false, message: "No save data found" };
            }

            // Validate save data version compatibility
            if (!this.validateSaveData(saveData)) {
                console.error("Save data validation failed");
                return { success: false, error: "Invalid save data" };
            }

            // Load the game state
            this.gameState.setState(saveData.gameState);

            console.log("Game loaded successfully from:", saveData.timestamp);
            return { success: true, timestamp: saveData.timestamp };

        } catch (error) {
            console.error("Failed to load game:", error);
            return { success: false, error: error.message };
        }
    }

    // Browser storage operations (for quick save/autosave)
    saveToStorage(saveData) {
        const storageData = {
            currentSave: saveData,
            saves: this.getAllSaves(),
            lastPlayed: new Date().toISOString()
        };

        // Keep only last 10 autosaves
        if (storageData.saves.length >= 10) {
            storageData.saves = storageData.saves.slice(-9);
        }
        
        storageData.saves.push(saveData);
        
        // Note: Using variables instead of localStorage due to artifact limitations
        // In a real environment, this would use localStorage
        window.aquaNovaGameData = JSON.stringify(storageData);
    }

    loadFromStorage() {
        try {
            // Note: In real environment, this would use localStorage
            const data = window.aquaNovaGameData;
            if (!data) return null;

            const storageData = JSON.parse(data);
            return storageData.currentSave;
        } catch (error) {
            console.error("Failed to load from storage:", error);
            return null;
        }
    }

    getAllSaves() {
        try {
            const data = window.aquaNovaGameData;
            if (!data) return [];

            const storageData = JSON.parse(data);
            return storageData.saves || [];
        } catch (error) {
            return [];
        }
    }

    // Logbook integration (save states tied to log entries)
    saveToLogbook(saveData, logEntry) {
        // This creates a comprehensive save that can be loaded via logbook
        const logbookSave = {
            entryId: logEntry.id,
            timestamp: logEntry.timestamp,
            content: logEntry.content,
            gameSnapshot: {
                navigation: saveData.gameState.navigation,
                shipSystems: saveData.gameState.shipSystems,
                crew: saveData.gameState.crew,
                mission: saveData.gameState.mission,
                environment: saveData.gameState.environment,
                progress: saveData.gameState.progress
            }
        };

        // In a real implementation, this would write to data/logbook.json
        // For now, we'll store it in memory/browser storage
        const logbookData = this.getLogbookData();
        logbookData.entries.push(logbookSave);
        this.saveLogbookData(logbookData);
    }

    loadFromLogbook(entryId) {
        const logbookData = this.getLogbookData();
        const entry = logbookData.entries.find(e => e.entryId === entryId);
        
        if (!entry) return null;

        // Convert logbook entry back to save data format
        return {
            timestamp: entry.timestamp,
            version: "1.0.0",
            gameState: entry.gameSnapshot
        };
    }

    getLogbookData() {
        try {
            const data = window.aquaNovaLogbookData;
            return data ? JSON.parse(data) : { entries: [], version: "1.0.0" };
        } catch (error) {
            return { entries: [], version: "1.0.0" };
        }
    }

    saveLogbookData(data) {
        window.aquaNovaLogbookData = JSON.stringify(data);
    }

    // Auto-save functionality
    enableAutoSave(intervalMinutes = 5) {
        this.autoSaveInterval = setInterval(() => {
            this.autoSave();
        }, intervalMinutes * 60 * 1000);
        
        console.log(`Auto-save enabled every ${intervalMinutes} minutes`);
    }

    disableAutoSave() {
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
            this.autoSaveInterval = null;
            console.log("Auto-save disabled");
        }
    }

    autoSave() {
        const result = this.saveGame();
        if (result.success) {
            console.log("Auto-save completed:", result.timestamp);
        }
    }

    // Save data validation
    validateSaveData(saveData) {
        if (!saveData || typeof saveData !== 'object') return false;
        if (!saveData.version || !saveData.timestamp) return false;
        if (!saveData.gameState) return false;

        // Check for required game state properties
        const required = ['navigation', 'shipSystems', 'crew', 'logbook'];
        return required.every(prop => saveData.gameState.hasOwnProperty(prop));
    }

    // Export/Import functionality for sharing saves
    exportSave(entryId = null) {
        const saveData = entryId ? this.loadFromLogbook(entryId) : this.loadFromStorage();
        if (!saveData) return null;

        return {
            type: "AquaNova_Save",
            version: "1.0.0",
            exported: new Date().toISOString(),
            data: saveData
        };
    }

    importSave(exportData) {
        try {
            if (!exportData || exportData.type !== "AquaNova_Save") {
                throw new Error("Invalid export data");
            }

            if (!this.validateSaveData(exportData.data)) {
                throw new Error("Invalid save data in export");
            }

            // Load the imported save
            this.gameState.setState(exportData.data.gameState);
            this.saveGame(); // Save to current storage

            return { success: true, timestamp: exportData.data.timestamp };
        } catch (error) {
            console.error("Failed to import save:", error);
            return { success: false, error: error.message };
        }
    }

    // Utility methods
    getGameData() {
        return this.gameState.getState();
    }

    loadGameData() {
        // Try to load existing save on startup
        const result = this.loadGame();
        if (!result.success) {
            console.log("No existing save found, starting with default state");
        }
    }

    // Quick save/load for debugging
    quickSave() {
        return this.saveGame();
    }

    quickLoad() {
        return this.loadGame();
    }

    // Get save file info
    getSaveInfo() {
        const gameState = this.gameState.getState();
        return {
            location: gameState.navigation.location,
            depth: gameState.navigation.depth,
            status: this.gameState.getOverallStatus(),
            lastSaved: gameState.gameInfo.lastSaved,
            playTime: gameState.gameInfo.playTime,
            logEntries: gameState.logbook.totalEntries
        };
    }

    /**
     * Adds a new entry to the logbook.
     * Handles prefixes "M.LOG-" and "LOG-" for the entry type.
     * @param {string} type - The type of log entry (e.g., "M.LOG" for mission logs or "LOG" for personal logs).
     * @param {string} content - The textual content of the log entry.
     * @param {object} snapshot - The game state snapshot associated with this entry.
     * @param {Array<string>} tags - Optional tags for filtering and categorization.
     * @returns {object} The created log entry object.
     */
    addEntry(type, content, snapshot, tags = []) {
        const logbookData = this.getLogbookData();

        // Normalize type prefix
        let normalizedType = type;
        if (type.startsWith("M.LOG-")) {
            normalizedType = type.substring(6);
        } else if (type.startsWith("LOG-")) {
            normalizedType = type.substring(4);
        }

        const newEntry = {
            id: `entry_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            type: normalizedType,
            content,
            timestamp: new Date().toISOString(),
            gameSnapshot: snapshot,
            tags
        };

        logbookData.entries.push(newEntry);
        this.saveLogbookData(logbookData);

        return newEntry;
    }

    /**
     * Retrieves logbook entries, optionally filtered by type and/or tags.
     * @param {object} filter - Optional filter object with keys 'type' and/or 'tags'.
     * @returns {Array<object>} Array of log entries matching the filter.
     */
    getEntries(filter = {}) {
        const { type, tags } = filter;
        const logbookData = this.getLogbookData();
        let entries = logbookData.entries.slice();

        if (type) {
            // Handle prefix normalization for filtering
            let filterType = type;
            if (type.startsWith("M.LOG-")) {
                filterType = type.substring(6);
            } else if (type.startsWith("LOG-")) {
                filterType = type.substring(4);
            }
            entries = entries.filter(e => e.type === filterType);
        }

        if (tags && Array.isArray(tags) && tags.length > 0) {
            entries = entries.filter(e => {
                if (!e.tags || !Array.isArray(e.tags)) return false;
                return tags.every(tag => e.tags.includes(tag));
            });
        }

        return entries;
    }

    /**
     * Reverts the game state to the snapshot stored in the specified logbook entry.
     * Loads the snapshot into the main game state.
     * @param {string} entryId - The ID of the logbook entry to revert to.
     * @returns {boolean} True if revert successful, false if entry not found.
     */
    revertToEntry(entryId) {
        const logbookData = this.getLogbookData();
        const entry = logbookData.entries.find(e => e.id === entryId);
        if (!entry) {
            console.warn(`Logbook entry with ID ${entryId} not found for revert.`);
            return false;
        }
        if (!entry.gameSnapshot) {
            console.warn(`Logbook entry with ID ${entryId} does not contain a game snapshot.`);
            return false;
        }

        // Load the snapshot into the game state
        this.gameState.setState(entry.gameSnapshot);

        // Optionally save the reverted state as current save
        this.saveGame(entry);

        console.log(`Reverted game state to logbook entry ID: ${entryId}`);
        return true;
    }
}

// Export for use in other modules
window.SaveManager = SaveManager;