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
        this.bookshelf = [];      // Array of all logbooks
        this.activeLogbookId = null;  // ID of currently mounted logbook
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
            logbook.id = this.generateId();
            logbook.schemaVersion = SCHEMA_VERSION;
            logbook.created = new Date().toISOString();
            
            this.bookshelf.push(logbook);
            this.activeLogbookId = logbook.id;
            this.saveBookshelf();
            
            console.log('Bootstrapped from SeaTrials.json');
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
        
        // Load the most recent entry if available
        if (logbook.entries && logbook.entries.length > 0) {
            const lastEntry = logbook.entries[logbook.entries.length - 1];
            if (lastEntry.gameSnapshot) {
                this.gameState.loadFromSnapshot(lastEntry.gameSnapshot);
            }
        }
        
        console.log(`Mounted logbook: ${logbook.name}`);
        return true;
    }

    // Entry management
    addEntry(entryData) {
        const logbook = this.getActiveLogbook();
        if (!logbook) throw new Error('No active logbook');

        const entry = {
            logbook: {
                id: entryData.id || this.generateEntryId(logbook),
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

        logbook.entries.push(entry);
        this.updateLogbookStats(logbook);
        this.saveBookshelf();
        
        return entry;
    }

    revertToEntry(entryId) {
        const logbook = this.getActiveLogbook();
        if (!logbook) throw new Error('No active logbook');

        const entryIndex = logbook.entries.findIndex(e => e.logbook.id === entryId);
        if (entryIndex === -1) throw new Error(`Entry ${entryId} not found`);

        const entry = logbook.entries[entryIndex];
        if (!entry.gameSnapshot) throw new Error('Entry has no snapshot');
        if (entry.metadata.canRevert === false) throw new Error('Entry is non-revertible');

        // Revert GameState
        this.gameState.loadFromSnapshot(entry.gameSnapshot);
        
        // Remove future entries
        logbook.entries = logbook.entries.slice(0, entryIndex + 1);
        this.updateLogbookStats(logbook);
        this.saveBookshelf();
        
        console.log(`Reverted to entry: ${entryId}`);
        return true;
    }

    // Logbook selection
    mountLogbook(logbookId) {
        const logbook = this.bookshelf.find(book => book.id === logbookId);
        if (!logbook) throw new Error('Logbook not found');

        this.activeLogbookId = logbookId;
        this.saveBookshelf();
        
        // Load into GameState
        this.mountActiveLogbook();
        
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

            // Ensure unique ID and name
            logbook.id = this.generateId();
            logbook.name = this.getUniqueName(logbook.name || 'Imported Logbook');
            logbook.imported = new Date().toISOString();
            
            this.bookshelf.push(logbook);
            this.saveBookshelf();
            
            console.log(`Imported logbook: ${logbook.name}`);
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
            const exportData = JSON.parse(JSON.stringify(logbook));
            delete exportData.id; // Remove internal ID
            exportData.exported = new Date().toISOString();

            const blob = new Blob([JSON.stringify(exportData, null, 2)], 
                { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `${logbook.name.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

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
    generateId() {
        return 'logbook_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    generateEntryId(logbook) {
        const entryCount = logbook.entries ? logbook.entries.length : 0;
        return `LOG-${String(entryCount + 1).padStart(4, '0')}`;
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
        if (!logbook.name) return false;
        if (logbook.entries && !Array.isArray(logbook.entries)) return false;
        
        return true;
    }

    // Status
    getSummary() {
        return {
            totalLogbooks: this.bookshelf.length,
            activeLogbook: this.getActiveLogbook()?.name || 'None',
            activeEntries: this.getActiveLogbook()?.entries?.length || 0,
            schemaVersion: SCHEMA_VERSION
        };
    }
}

const saveManagerInstance = new SaveManager();
export default saveManagerInstance;