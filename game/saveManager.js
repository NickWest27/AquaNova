// game/saveManager.js
// Pure persistence service 
// Manages logbook files and bookshelf
// Creates snapshots FROM GameState
// Restores snapshots TO GameState
// No direct state manipulation

const BOOKSHELF_KEY = 'aquaNovaBookshelf';
const SCHEMA_VERSION = 1;
const BOOTSTRAP_PATH = '/data/logbooks/SeaTrials.json';

class SaveManager {
    constructor() {
        this.gameState = null;
        this.bookshelf = [];      // Array of all available logbooks
        this.activeLogbookId = null;  // ID of currently mounted logbook (e.g, LB-SeaTrials-740816)
    }

    async init(gameStateInstance) {
        this.gameState = gameStateInstance;
        
        // Load bookshelf from localStorage
        this.loadBookshelf();
        
        // If no logbooks exist, bootstrap from SeaTrials.json
        if (this.bookshelf.length === 0) {
            await this.bootstrap();
        }
        
        // Mount the active logbook (or first available)
        await this.mountActiveLogbook();
        
        return true;
    }

    // Bookshelf management
    loadBookshelf() {
        try {
            const stored = localStorage.getItem(BOOKSHELF_KEY);
            if (stored) {
                const data = JSON.parse(stored);
                this.bookshelf = data.logbooks || [];
                this.activeLogbookId = data.activeId || null;
            }
        } catch (error) {
            console.error('Failed to load bookshelf:', error);
            this.bookshelf = [];
            this.activeLogbookId = null;
        }
    }

    saveBookshelf() {
        try {
            const data = {
                logbooks: this.bookshelf,
                activeId: this.activeLogbookId,
                lastSaved: new Date().toISOString()
            };
            localStorage.setItem(BOOKSHELF_KEY, JSON.stringify(data));
        } catch (error) {
            console.error('Failed to save bookshelf:', error);
            return false;
        }
        return true;
    }

    // Bootstrap from SeaTrials.json
    async bootstrap() {
        try {
            const response = await fetch(BOOTSTRAP_PATH);
            if (!response.ok) throw new Error('Bootstrap file not found');
            
            const logbook = await response.json();
            
            // Ensure the logbook has the correct structure and ID
            if (!logbook.id) {
                logbook.id = 'LB-SeaTrials-740816'; // Default SeaTrials ID
            }
            
            logbook.schemaVersion = SCHEMA_VERSION;
            if (!logbook.created) {
                logbook.created = new Date().toISOString();
            }
            
            this.bookshelf.push(logbook);
            this.activeLogbookId = logbook.id;
            this.saveBookshelf();
            
            console.log(`Bootstrapped from SeaTrials.json with ID: ${logbook.id}`);
            return true;
        } catch (error) {
            console.error('Bootstrap failed:', error);
            return false;
        }
    }

    // Mount logbook to GameState
    async mountActiveLogbook() {
        const logbook = this.getActiveLogbook();
        if (!logbook) {
            console.warn('No active logbook to mount');
            return false;
        }

        // Initialize contacts first
        await this.gameState.initializeContacts();
        
        // Load the most recent entry's game snapshot if available
        if (logbook.entries && logbook.entries.length > 0) {
            const lastEntry = logbook.entries[logbook.entries.length - 1];
            if (lastEntry.gameSnapshot) {
                this.gameState.loadFromSnapshot(lastEntry.gameSnapshot);
            }
        }
        
        console.log(`Mounted logbook: ${logbook.name} (${logbook.id})`);
        return true;
    }

    // Entry management - adds entries to the ACTIVE logbook
    addEntry(entryData) {
        const logbook = this.getActiveLogbook();
        if (!logbook) throw new Error('No active logbook');

        // Generate entry ID based on type and existing entries
        const entryId = entryData.id || this.generateEntryId(logbook, entryData.type);

        const entry = {
            logbook: {
                entryId: entryId,
                timestamp: entryData.timestamp || new Date().toISOString(),
                type: entryData.type || "personal_log",
                tags: entryData.tags || ["captain"],
                author: entryData.author || {
                    organization: "Aqua Nova DSV",
                    name: "Captain",
                    role: "Commanding Officer"
                },
                content: entryData.content,
                tasks: entryData.tasks || [],
                completedTasks: entryData.completedTasks || []
            },
            gameSnapshot: this.gameState.createSnapshot(),
            metadata: {
                importance: entryData.importance || "normal",
                canRevert: entryData.canRevert !== false
            }
        };

        // Add to active logbook's entries
        if (!logbook.entries) logbook.entries = [];
        logbook.entries.push(entry);
        
        this.updateLogbookStats(logbook);
        this.saveBookshelf();
        
        return entry;
    }

    revertToEntry(entryId) {
        const logbook = this.getActiveLogbook();
        if (!logbook) throw new Error('No active logbook');

        const entryIndex = logbook.entries.findIndex(e => {
            const currentId = e.logbook?.entryId;
            return currentId === entryId;
        });
        
        if (entryIndex === -1) throw new Error(`Entry ${entryId} not found`);

        const entry = logbook.entries[entryIndex];
        if (!entry.gameSnapshot) throw new Error('Entry has no snapshot');
        if (entry.metadata?.canRevert === false) throw new Error('Entry is non-revertible');

        // Revert GameState to this snapshot
        this.gameState.loadFromSnapshot(entry.gameSnapshot);
        
        // Remove all entries after this one
        logbook.entries = logbook.entries.slice(0, entryIndex + 1);
        this.updateLogbookStats(logbook);
        this.saveBookshelf();
        
        console.log(`Reverted to entry: ${entryId}`);
        return true;
    }

    // Logbook selection - switches the active logbook
    mountLogbook(logbookId) {
        const logbook = this.bookshelf.find(book => book.id === logbookId);
        if (!logbook) throw new Error(`Logbook ${logbookId} not found`);

        this.activeLogbookId = logbookId;
        this.saveBookshelf();
        
        // Load the logbook's state into GameState
        this.mountActiveLogbook();
        
        console.log(`Switched to logbook: ${logbook.name} (${logbookId})`);
        return true;
    }

    // Import/Export
    async importLogbook(file) {
        try {
            const text = await file.text();
            const logbook = JSON.parse(text);
            
            if (!this.validateLogbook(logbook)) {
                throw new Error('Invalid logbook format');
            }

            // Check if logbook with this ID already exists
            if (this.bookshelf.some(book => book.id === logbook.id)) {
                // Generate a new unique ID for duplicate imports
                logbook.id = this.generateUniqueId(logbook.name || 'Imported Logbook');
                logbook.name = this.getUniqueName(logbook.name || 'Imported Logbook');
            }
            
            // Ensure required fields
            if (!logbook.created) logbook.created = new Date().toISOString();
            logbook.imported = new Date().toISOString();
            logbook.schemaVersion = SCHEMA_VERSION;
            
            this.bookshelf.push(logbook);
            this.saveBookshelf();
            
            console.log(`Imported logbook: ${logbook.name} (${logbook.id})`);
            return logbook;
        } catch (error) {
            console.error('Import failed:', error);
            throw error;
        }
    }

    exportLogbook(logbookId = null) {
        const logbook = logbookId ? 
            this.bookshelf.find(book => book.id === logbookId) : 
            this.getActiveLogbook();
            
        if (!logbook) throw new Error('No logbook to export');

        try {
            // Create export data with new ID based on current date
            const exportData = JSON.parse(JSON.stringify(logbook));
            const campaignName = this.extractCampaignName(logbook.name);
            const futureDate = this.getFutureDate();
            const dateString = this.formatDateForId(futureDate);
            
            // Generate new ID for export: LB-CampaignName-YYMMDD
            exportData.id = `LB-${campaignName}-${dateString}`;
            exportData.exported = new Date().toISOString();
            exportData.originalId = logbook.id; // Keep reference to original
            
            const blob = new Blob([JSON.stringify(exportData, null, 2)], 
                { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `${campaignName}_${dateString}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            console.log(`Exported logbook: ${exportData.id}`);
            return true;
        } catch (error) {
            console.error('Export failed:', error);
            return false;
        }
    }

    // Getters
    getActiveLogbook() {
        return this.bookshelf.find(book => book.id === this.activeLogbookId);
    }

    getBookshelf() {
        return this.bookshelf.map(book => ({
            id: book.id,
            name: book.name,
            description: book.description,
            created: book.created,
            lastModified: book.lastModified,
            entryCount: book.entries ? book.entries.length : 0,
            isActive: book.id === this.activeLogbookId
        }));
    }

    // Utility methods
    generateUniqueId(baseName) {
        const campaignName = this.sanitizeCampaignName(baseName);
        const futureDate = this.getFutureDate();
        const dateString = this.formatDateForId(futureDate);
        const timeString = this.formatTimeForId(futureDate);
        
        return `LB-${campaignName}-${dateString}-${timeString}`;
    }

    generateEntryId(logbook, entryType = 'personal_log') {
        if (!logbook.entries) logbook.entries = [];
        
        if (entryType === 'mission_log') {
            // Count existing mission logs (M.LOG-)
            const missionLogs = logbook.entries.filter(e => 
                e.logbook.entryId.startsWith('M.LOG-')
            ).length;
            return `M.LOG-${String(missionLogs + 1).padStart(4, '0')}`;
        } else {
            // Count existing personal logs (LOG-), excluding mission logs
            const personalLogs = logbook.entries.filter(e => 
                e.logbook.entryId.startsWith('LOG-') && !e.logbook.entryId.startsWith('M.LOG-')
            ).length;
            return `LOG-${String(personalLogs + 1).padStart(4, '0')}`;
        }
    }

    extractCampaignName(logbookName) {
        // Extract campaign name from logbook name, default to sanitized version
        return this.sanitizeCampaignName(logbookName || 'Campaign');
    }

    sanitizeCampaignName(name) {
        // Clean name for use in IDs - remove special chars, limit length
        return name.replace(/[^a-zA-Z0-9]/g, '').substring(0, 15) || 'Campaign';
    }

    getFutureDate() {
        // Get current date + 50 years for the game world
        const date = new Date();
        date.setFullYear(date.getFullYear() + 50);
        return date;
    }

    formatDateForId(date) {
        // Format as YYMMDD
        const yy = date.getFullYear().toString().slice(-2);
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        return `${yy}${mm}${dd}`;
    }

    formatTimeForId(date) {
        // Format as HHMM for uniqueness
        const hh = String(date.getHours()).padStart(2, '0');
        const mm = String(date.getMinutes()).padStart(2, '0');
        return `${hh}${mm}`;
    }

    getUniqueName(baseName) {
        let name = baseName;
        let counter = 1;
        
        while (this.bookshelf.some(book => book.name === name)) {
            name = `${baseName} (${counter})`;
            counter++;
        }
        
        return name;
    }

    updateLogbookStats(logbook) {
        if (!logbook.statistics) logbook.statistics = {};
        
        logbook.statistics.totalEntries = logbook.entries ? logbook.entries.length : 0;
        logbook.lastModified = new Date().toISOString();
        
        if (logbook.entries && logbook.entries.length > 0) {
            logbook.statistics.firstEntry = logbook.entries[0].logbook.timestamp;
            logbook.statistics.lastEntry = logbook.entries[logbook.entries.length - 1].logbook.timestamp;
        }
    }

    validateLogbook(logbook) {
        if (!logbook || typeof logbook !== 'object') return false;
        if (!logbook.name || typeof logbook.name !== 'string') return false;
        if (logbook.entries && !Array.isArray(logbook.entries)) return false;
        
        // Validate entries structure if they exist
        if (logbook.entries) {
            for (const entry of logbook.entries) {
                if (!entry.logbook) return false;
                // Normalize old 'id' to 'entryId' if present
                if (entry.logbook.id && !entry.logbook.entryId) {
                    entry.logbook.entryId = entry.logbook.id;
                    delete entry.logbook.id;
                }
                if (!entry.logbook.entryId || !entry.logbook.timestamp) {
                    return false;
                }
            }
        }
        
        return true;
    }

    // Status and debug
    getSummary() {
        const activeLogbook = this.getActiveLogbook();
        return {
            totalLogbooks: this.bookshelf.length,
            activeLogbook: activeLogbook?.name || 'None',
            activeLogbookId: this.activeLogbookId,
            activeEntries: activeLogbook?.entries?.length || 0,
            schemaVersion: SCHEMA_VERSION
        };
    }

    // Debug method to list all logbooks
    listLogbooks() {
        console.log('=== BOOKSHELF ===');
        this.bookshelf.forEach(book => {
            const status = book.id === this.activeLogbookId ? '[ACTIVE]' : '[ARCHIVED]';
            console.log(`${status} ${book.name} (${book.id}) - ${book.entries?.length || 0} entries`);
        });
    }
}

const saveManagerInstance = new SaveManager();
export default saveManagerInstance;