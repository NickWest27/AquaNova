// game/saveManager.js
// Handles localStorage persistence, JSON import/export, and digital bookshelf logic

const STORAGE_KEY = 'aquaNovaLogbook';
const STATE_KEY = 'aquaNova_gameState';
const SCHEMA_VERSION = 1;
const INITIAL_LOGBOOK_PATH = './data/logbooks/SeaTrials.json';

export default class SaveManager {
  constructor(gameStateInstance) {
    this.gameState = gameStateInstance; // Reference to the GameState instance
    this.bookshelf = [];   // All known logbooks (localStorage + imported)
    this.currentIndex = 0; // Index in bookshelf currently displayed in UI
    this.activeLogbook = null; // Currently mounted logbook
  }

  /** --------- Initialization --------- */
  async init() {
    console.log('SaveManager initializing...');
    
    try {
      // First, try to load existing localStorage logbook
      const localLogbook = this.loadFromLocal();
      
      if (localLogbook) {
        console.log('Found existing localStorage logbook');
        localLogbook.mounted = true;
        this.bookshelf.push(localLogbook);
        this.activeLogbook = localLogbook;
        this.currentIndex = 0;
        
        // Load the most recent game state from the logbook
        if (localLogbook.entries && localLogbook.entries.length > 0) {
          const lastEntry = localLogbook.entries[localLogbook.entries.length - 1];
          if (lastEntry.gameSnapshot) {
            this.gameState.loadFromSnapshot(lastEntry.gameSnapshot);
          }
        }
      } else {
        // No existing save - initialize from bootstrap JSON
        console.log('No existing save found, initializing from bootstrap...');
        await this.initializeFromBootstrap();
      }
      
      console.log(`SaveManager initialized with ${this.bookshelf.length} logbook(s)`);
      return true;
      
    } catch (error) {
      console.error('Failed to initialize SaveManager:', error);
      return false;
    }
  }

  async initializeFromBootstrap() {
    try {
      // Try to load the initial logbook JSON
      const response = await fetch(INITIAL_LOGBOOK_PATH);
      
      if (!response.ok) {
        throw new Error(`Failed to load initial logbook: ${response.status}`);
      }
      
      const campaignData = await response.json();
      
      // Convert campaign format to logbook format
      const initialData = this.convertCampaignToLogbook(campaignData);
      
      // Validate the structure
      if (!this.validateLogbookStructure(initialData)) {
        throw new Error('Invalid initial logbook structure');
      }
      
      // Set up as the first logbook
      initialData.mounted = true;
      initialData.schemaVersion = SCHEMA_VERSION;
      initialData.lastModified = new Date().toISOString();
      
      this.bookshelf.push(initialData);
      this.activeLogbook = initialData;
      this.currentIndex = 0;
      
      // Initialize game state from the logbook's initial state
      if (initialData.entries && initialData.entries.length > 0) {
        const initialEntry = initialData.entries[0];
        if (initialEntry.gameSnapshot) {
          this.gameState.loadFromSnapshot(initialEntry.gameSnapshot);
        }
      }
      
      // Save to localStorage for future loads
      this.saveToLocal(initialData);
      
      console.log('Successfully initialized from bootstrap JSON');
      
    } catch (error) {
      console.error('Failed to initialize from bootstrap:', error);
      
      // Fallback: create a minimal empty logbook
      console.log('Creating fallback empty logbook...');
      this.createFallbackLogbook();
    }
  }

  createFallbackLogbook() {
    const fallbackLogbook = {
      name: "Aqua Nova Mission Log",
      created: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      schemaVersion: SCHEMA_VERSION,
      mounted: true,
      entries: [{
        logbook: {
          id: "INIT-0001",
          timestamp: new Date().toISOString(),
          type: "mission_start",
          tags: ["initialization", "mission"],
          author: {
            organization: "Aqua Nova DSV",
            department: "Command",
            name: "System",
            role: "Initialization"
          },
          content: "Mission log initialized. All systems nominal. Ready for operations.",
          tasks: [],
          completedTasks: []
        },
        gameSnapshot: this.gameState.createSnapshot(),
        metadata: {
          importance: "critical",
          tags: ["initialization"],
          canRevert: true
        }
      }],
      statistics: {
        totalEntries: 1,
        firstEntry: new Date().toISOString(),
        lastEntry: new Date().toISOString()
      }
    };

    this.bookshelf.push(fallbackLogbook);
    this.activeLogbook = fallbackLogbook;
    this.currentIndex = 0;
    this.saveToLocal(fallbackLogbook);
  }

  /** --------- Local Storage Operations --------- */
  loadFromLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;

      const logbook = JSON.parse(raw);
      
      if (logbook.schemaVersion !== SCHEMA_VERSION) {
        console.warn(`Logbook schema mismatch. Expected ${SCHEMA_VERSION}, got ${logbook.schemaVersion}`);
        // Could implement migration logic here if needed
      }
      
      return logbook;
    } catch (error) {
      console.error('Failed to parse local logbook:', error);
      return null;
    }
  }

  saveToLocal(logbook) {
    try {
      logbook.schemaVersion = SCHEMA_VERSION;
      logbook.lastModified = new Date().toISOString();
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(logbook, null, 2));
      console.log('Logbook saved to localStorage');
      
      return true;
    } catch (error) {
      console.error('Failed to save logbook to localStorage:', error);
      return false;
    }
  }

  /** --------- Logbook Entry Management --------- */
  addEntry(entryData) {
    if (!this.activeLogbook) {
      throw new Error('No active logbook to add entry to');
    }

    // Create the complete entry with game snapshot
    const newEntry = {
      logbook: {
        id: entryData.id,
        timestamp: entryData.timestamp || new Date().toISOString(),
        type: entryData.type || "personal_log",
        tags: entryData.tags || ["captain", "personal"],
        author: entryData.author || {
          organization: "Aqua Nova DSV",
          department: "Command",
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
        tags: entryData.tags || ["personal"],
        canRevert: entryData.canRevert !== false // Default to true unless explicitly false
      }
    };

    // Add to active logbook
    this.activeLogbook.entries.push(newEntry);
    
    // Update statistics
    this.activeLogbook.statistics.totalEntries = this.activeLogbook.entries.length;
    this.activeLogbook.statistics.lastEntry = newEntry.logbook.timestamp;
    
    // Save to localStorage
    this.saveToLocal(this.activeLogbook);
    
    console.log(`Added new entry: ${newEntry.logbook.id}`);
    return newEntry;
  }

  /** --------- Revert Functionality --------- */
  revertToEntry(entryId) {
    if (!this.activeLogbook) {
      throw new Error('No active logbook for revert operation');
    }

    // Find the target entry
    const entryIndex = this.activeLogbook.entries.findIndex(e => e.logbook.id === entryId);
    
    if (entryIndex === -1) {
      throw new Error(`Entry ${entryId} not found in active logbook`);
    }

    const targetEntry = this.activeLogbook.entries[entryIndex];
    
    if (!targetEntry.gameSnapshot) {
      throw new Error(`Entry ${entryId} has no game snapshot for revert`);
    }

    if (targetEntry.metadata.canRevert === false) {
      throw new Error(`Entry ${entryId} is marked as non-revertible`);
    }

    try {
      // Revert game state
      this.gameState.loadFromSnapshot(targetEntry.gameSnapshot);
      
      // Remove all entries after this one
      this.activeLogbook.entries = this.activeLogbook.entries.slice(0, entryIndex + 1);
      
      // Update statistics
      this.activeLogbook.statistics.totalEntries = this.activeLogbook.entries.length;
      this.activeLogbook.statistics.lastEntry = targetEntry.logbook.timestamp;
      
      // Save the reverted state
      this.saveToLocal(this.activeLogbook);
      
      console.log(`Successfully reverted to entry ${entryId} at ${targetEntry.logbook.timestamp}`);
      return true;
      
    } catch (error) {
      console.error('Failed to revert to entry:', error);
      throw error;
    }
  }

  /** --------- Export Functionality --------- */
  exportLogbook(logbook = null) {
    const targetLogbook = logbook || this.activeLogbook;
    
    if (!targetLogbook) {
      throw new Error('No logbook to export');
    }

    try {
      // Create a clean copy for export (remove mounted flag, update timestamps)
      const exportData = JSON.parse(JSON.stringify(targetLogbook));
      delete exportData.mounted; // Don't export mount status
      exportData.exported = new Date().toISOString();
      exportData.schemaVersion = SCHEMA_VERSION;

      const dataStr = JSON.stringify(exportData, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `${targetLogbook.name || 'AquaNova_Logbook'}_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      console.log('Logbook exported successfully');
      return true;
      
    } catch (error) {
      console.error('Failed to export logbook:', error);
      return false;
    }
  }

  /** --------- Import Functionality --------- */
  async importLogbook(file) {
    try {
      const text = await file.text();
      const importedLogbook = JSON.parse(text);

      if (!this.validateLogbookStructure(importedLogbook)) {
        throw new Error('Invalid logbook structure');
      }

      if (importedLogbook.schemaVersion !== SCHEMA_VERSION) {
        console.warn(`Imported logbook schema mismatch. Expected ${SCHEMA_VERSION}, got ${importedLogbook.schemaVersion}`);
        // Could implement migration logic here
      }

      // Prepare for bookshelf
      importedLogbook.mounted = false;
      importedLogbook.imported = new Date().toISOString();
      delete importedLogbook.exported; // Clean up export timestamp
      
      // Ensure it has a unique name if there's a conflict
      let baseName = importedLogbook.name || 'Imported Logbook';
      let finalName = baseName;
      let counter = 1;
      
      while (this.bookshelf.some(book => book.name === finalName)) {
        finalName = `${baseName} (${counter})`;
        counter++;
      }
      
      importedLogbook.name = finalName;

      // Add to bookshelf
      this.bookshelf.push(importedLogbook);
      this.currentIndex = this.bookshelf.length - 1;

      console.log(`Successfully imported logbook: ${finalName}`);
      return importedLogbook;
      
    } catch (error) {
      console.error('Failed to import logbook:', error);
      throw error;
    }
  }

  /** --------- Mount/Load Operations --------- */
  mountLogbook(index) {
    if (index < 0 || index >= this.bookshelf.length) {
      throw new Error('Invalid logbook index');
    }

    const targetLogbook = this.bookshelf[index];
    
    if (!targetLogbook) {
      throw new Error('Logbook not found at index');
    }

    try {
      // Unmount current logbook
      if (this.activeLogbook) {
        this.activeLogbook.mounted = false;
      }
      
      // Mount new logbook
      targetLogbook.mounted = true;
      this.activeLogbook = targetLogbook;
      this.currentIndex = index;
      
      // Load the most recent game state from the logbook
      if (targetLogbook.entries && targetLogbook.entries.length > 0) {
        const lastEntry = targetLogbook.entries[targetLogbook.entries.length - 1];
        if (lastEntry.gameSnapshot) {
          this.gameState.loadFromSnapshot(lastEntry.gameSnapshot);
        }
      }
      
      // Save the newly mounted logbook to localStorage
      this.saveToLocal(targetLogbook);
      
      console.log(`Mounted logbook: ${targetLogbook.name}`);
      return true;
      
    } catch (error) {
      console.error('Failed to mount logbook:', error);
      return false;
    }
  }

  /** --------- Bookshelf Navigation --------- */
  nextBook() {
    if (this.bookshelf.length === 0) return;
    this.currentIndex = (this.currentIndex + 1) % this.bookshelf.length;
  }

  prevBook() {
    if (this.bookshelf.length === 0) return;
    this.currentIndex = (this.currentIndex - 1 + this.bookshelf.length) % this.bookshelf.length;
  }

  getCurrentBook() {
    if (this.bookshelf.length === 0) return null;
    return this.bookshelf[this.currentIndex];
  }

  getActiveLogbook() {
    return this.activeLogbook;
  }

  getBookshelf() {
    return [...this.bookshelf]; // Return a copy
  }

  /** --------- Campaign Conversion --------- */
  convertCampaignToLogbook(campaignData) {
    // Handle both campaign and metadata-based formats
    const meta = campaignData.Metadata || campaignData;
    const logbook = {
      name: meta.campaignTitle || meta.logbookId || "Untitled Campaign",
      created: meta.createdAt || new Date().toISOString(),
      lastModified: meta.lastPlayed || meta.createdAt || new Date().toISOString(),
      schemaVersion: SCHEMA_VERSION,
      // Convert entries format
      entries: campaignData.entries.map(entry => ({
        logbook: entry.logbook,
        gameSnapshot: {
          navigation: entry.navigation,
          shipSystems: entry.shipSystems,
          crew: entry.crew,
          mission: entry.mission,
          environment: entry.environment
        },
        metadata: {
          importance: "critical",
          tags: entry.logbook?.tags || ["mission"],
          canRevert: true
        }
      })),
      // Generate statistics
      statistics: {
        totalEntries: campaignData.statistics?.totalEntries || campaignData.entries.length,
        firstEntry: campaignData.statistics?.firstEntry || campaignData.entries[0]?.logbook?.timestamp || new Date().toISOString(),
        lastEntry: campaignData.statistics?.lastEntry || campaignData.entries[campaignData.entries.length - 1]?.logbook?.timestamp || new Date().toISOString()
      }
    };
    return logbook;
  }

  /** --------- Utility Methods --------- */
  validateLogbookStructure(logbook) {
    if (!logbook || typeof logbook !== 'object') {
      return false;
    }

    // Check required top-level properties
    const requiredProps = ['name', 'entries', 'statistics'];
    for (const prop of requiredProps) {
      if (!logbook.hasOwnProperty(prop)) {
        console.error(`Missing required property: ${prop}`);
        return false;
      }
    }

    // Validate entries array
    if (!Array.isArray(logbook.entries)) {
      console.error('Entries must be an array');
      return false;
    }

    // Validate each entry structure
    for (const entry of logbook.entries) {
      if (!entry.logbook || !entry.logbook.id || !entry.logbook.timestamp) {
        console.error('Invalid entry structure');
        return false;
      }
    }

    // Validate statistics
    if (!logbook.statistics || typeof logbook.statistics.totalEntries !== 'number') {
      console.error('Invalid statistics structure');
      return false;
    }

    return true;
  }

  getNextEntryId() {
    if (!this.activeLogbook || !this.activeLogbook.entries) {
      return 'LOG-0001';
    }

    // Find the highest numeric ID
    let maxId = 0;
    for (const entry of this.activeLogbook.entries) {
      const match = entry.logbook.id.match(/LOG-(\d+)$/);
      if (match) {
        const num = parseInt(match[1]);
        if (num > maxId) {
          maxId = num;
        }
      }
    }

    return `LOG-${String(maxId + 1).padStart(4, '0')}`;
  }

  // Get summary information for debugging/display
  getSummary() {
    return {
      totalLogbooks: this.bookshelf.length,
      activeLogbook: this.activeLogbook?.name || 'None',
      currentIndex: this.currentIndex,
      activeEntries: this.activeLogbook?.entries?.length || 0,
      schemaVersion: SCHEMA_VERSION
    };
  }

  /** --------- Cleanup --------- */
  destroy() {
    // Clean up any resources if needed
    this.gameState = null;
    this.activeLogbook = null;
    this.bookshelf = [];
  }
}