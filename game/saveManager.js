// game/saveManager.js
// Handles localStorage persistence, JSON import/export, and digital bookshelf logic

const STORAGE_KEY = 'aquaNovaLogbook';
const STATE_KEY = 'aquaNova_gameState';
const SCHEMA_VERSION = 1;
const INITIAL_LOGBOOK_PATH = '/data/logbooks/SeaTrials.json';

class SaveManager {
  constructor() {
    this.gameState = null; // Reference to the GameState instance
    this.bookshelf = [];   // All known logbooks (localStorage + imported)
    this.currentIndex = 0; // Index in bookshelf currently displayed in UI
    this.activeLogbook = null; // Currently mounted logbook
    this.needsImport = false; // Flag to indicate if import is required
  }

  /** --------- Initialization --------- */
  async init(gameStateInstance) {
    console.log('SaveManager initializing...');
    this.gameState = gameStateInstance;
    try {
      // First, try to load existing localStorage logbook
      const localLogbook = this.loadFromLocal();
      if (localLogbook) {
        console.log('Found existing localStorage logbook');
        localLogbook.mounted = true;
        this.bookshelf.push(localLogbook);
        this.activeLogbook = localLogbook;
        this.currentIndex = 0;
        // Restore game state from the most recent logbook entry
        this.restoreGameStateFromLogbook(localLogbook);
      } else {
        // No existing save - try to initialize from bootstrap JSON
        console.log('No existing save found, attempting bootstrap initialization...');
        const bootstrapSuccess = await this.initializeFromBootstrap();
        if (!bootstrapSuccess) {
          // Bootstrap failed, mark that import is required
          this.needsImport = true;
          console.warn('Bootstrap initialization failed. User import required.');
        }
      }
      console.log(`SaveManager initialized with ${this.bookshelf.length} logbook(s)`);
      return true;
    } catch (error) {
      console.error('Failed to initialize SaveManager:', error);
      this.needsImport = true;
      return false;
    }
  }

  async initializeFromBootstrap() {
    try {
      // Try to load the initial logbook JSON
      const response = await fetch(INITIAL_LOGBOOK_PATH);
      if (!response.ok) {
        console.warn(`Bootstrap file not found: ${INITIAL_LOGBOOK_PATH}`);
        return false;
      }
      
      const campaignData = await response.json();
      // Convert campaign format to logbook format
      const initialData = this.convertCampaignToLogbook(campaignData);
      
      // Validate the structure
      if (!this.validateLogbookStructure(initialData)) {
        throw new Error('Invalid bootstrap logbook structure');
      }
      
      // Set up as the first logbook
      initialData.mounted = true;
      initialData.schemaVersion = SCHEMA_VERSION;
      initialData.lastModified = new Date().toISOString();
      
      this.bookshelf.push(initialData);
      this.activeLogbook = initialData;
      this.currentIndex = 0;
      
      // Restore game state from the bootstrap logbook
      this.restoreGameStateFromLogbook(initialData);
      
      // Save to localStorage for future loads
      this.saveToLocal(initialData);
      
      console.log('Successfully initialized from bootstrap JSON');
      return true;
    } catch (error) {
      console.error('Failed to initialize from bootstrap:', error);
      return false;
    }
  }

  restoreGameStateFromLogbook(logbook) {
    if (!this.gameState) {
      console.error('SaveManager: No GameState instance provided');
      return false;
    }

    if (!logbook.entries || logbook.entries.length === 0) {
      console.log('No logbook entries found, using default game state');
      return true;
    }

    try {
      // Get the most recent entry
      const lastEntry = logbook.entries[logbook.entries.length - 1];
      
      if (lastEntry.gameSnapshot) {
        // Use loadFromSnapshot if it exists, otherwise fall back to setState
        if (typeof this.gameState.loadFromSnapshot === 'function') {
          const success = this.gameState.loadFromSnapshot(lastEntry.gameSnapshot);
          if (success) {
            console.log(`Game state restored from logbook entry: ${lastEntry.logbook.id}`);
          } else {
            console.warn('Failed to restore from snapshot, using default state');
          }
        } else if (typeof this.gameState.setState === 'function') {
          // Fallback: merge the snapshot into current state
          this.gameState.setState(lastEntry.gameSnapshot);
          console.log(`Game state merged from logbook entry: ${lastEntry.logbook.id}`);
        } else {
          console.error('GameState instance has no loadFromSnapshot or setState method');
          return false;
        }
      } else {
        console.warn('Last logbook entry has no game snapshot');
      }
      
      return true;
    } catch (error) {
      console.error('Failed to restore game state from logbook:', error);
      return false;
    }
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

    if (!this.gameState) {
      throw new Error('No GameState instance available for snapshot');
    }

    // Create the complete entry with game snapshot
    const newEntry = {
      logbook: {
        id: entryData.id || this.getNextEntryId(),
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
      gameSnapshot: this.createGameSnapshot(),
      metadata: {
        importance: entryData.importance || "normal",
        tags: entryData.tags || ["personal"],
        canRevert: entryData.canRevert !== false // Default to true unless explicitly false
      }
    };

    // Add to active logbook
    this.activeLogbook.entries.push(newEntry);
    
    // Update statistics
    if (!this.activeLogbook.statistics) {
      this.activeLogbook.statistics = {};
    }
    this.activeLogbook.statistics.totalEntries = this.activeLogbook.entries.length;
    this.activeLogbook.statistics.lastEntry = newEntry.logbook.timestamp;
    
    // Save to localStorage
    this.saveToLocal(this.activeLogbook);
    
    console.log(`Added new entry: ${newEntry.logbook.id}`);
    return newEntry;
  }

  createGameSnapshot() {
    if (!this.gameState) {
      console.error('No GameState instance available for snapshot creation');
      return null;
    }

    try {
      // Use createSnapshot if available, otherwise getState
      if (typeof this.gameState.createSnapshot === 'function') {
        return this.gameState.createSnapshot();
      } else if (typeof this.gameState.getState === 'function') {
        const state = this.gameState.getState();
        return {
          timestamp: new Date().toISOString(),
          navigation: state.navigation,
          shipSystems: state.shipSystems,
          crew: state.crew,
          mission: state.mission,
          environment: state.environment,
          progress: state.progress
        };
      } else {
        console.error('GameState has no createSnapshot or getState method');
        return null;
      }
    } catch (error) {
      console.error('Failed to create game snapshot:', error);
      return null;
    }
  }

  /** --------- Revert Functionality --------- */
  revertToEntry(entryId) {
    if (!this.activeLogbook) {
      throw new Error('No active logbook for revert operation');
    }

    if (!this.gameState) {
      throw new Error('No GameState instance available for revert');
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
      const success = this.gameState.loadFromSnapshot 
        ? this.gameState.loadFromSnapshot(targetEntry.gameSnapshot)
        : this.gameState.setState(targetEntry.gameSnapshot);
        
      if (!success && typeof success === 'boolean') {
        throw new Error('Failed to load snapshot into GameState');
      }
      
      // Remove all entries after this one
      this.activeLogbook.entries = this.activeLogbook.entries.slice(0, entryIndex + 1);
      
      // Update statistics
      if (!this.activeLogbook.statistics) {
        this.activeLogbook.statistics = {};
      }
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

      // Clear the needs import flag
      this.needsImport = false;

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
      
      // Restore game state from the newly mounted logbook
      this.restoreGameStateFromLogbook(targetLogbook);
      
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
      entries: (campaignData.entries || []).map(entry => ({
        logbook: entry.logbook || {
          id: "LOG-0001",
          timestamp: new Date().toISOString(),
          type: "personal_log",
          content: "Bootstrap entry"
        },
        gameSnapshot: {
          navigation: entry.navigation || {},
          shipSystems: entry.shipSystems || {},
          crew: entry.crew || {},
          mission: entry.mission || {},
          environment: entry.environment || {}
        },
        metadata: {
          importance: "critical",
          tags: entry.logbook?.tags || ["mission"],
          canRevert: true
        }
      })),
      // Generate statistics
      statistics: {
        totalEntries: campaignData.statistics?.totalEntries || (campaignData.entries ? campaignData.entries.length : 0),
        firstEntry: campaignData.statistics?.firstEntry || (campaignData.entries && campaignData.entries[0]?.logbook?.timestamp) || new Date().toISOString(),
        lastEntry: campaignData.statistics?.lastEntry || (campaignData.entries && campaignData.entries[campaignData.entries.length - 1]?.logbook?.timestamp) || new Date().toISOString()
      }
    };
    return logbook;
  }

  /** --------- Utility Methods --------- */

  requiresImport() {
    return this.needsImport === true || this.bookshelf.length === 0;
  }

  validateLogbookStructure(logbook) {
    if (!logbook || typeof logbook !== 'object') {
      return false;
    }

    // Check required top-level properties
    const requiredProps = ['name'];
    for (const prop of requiredProps) {
      if (!logbook.hasOwnProperty(prop)) {
        console.error(`Missing required property: ${prop}`);
        return false;
      }
    }

    // Validate entries array (can be empty)
    if (logbook.entries && !Array.isArray(logbook.entries)) {
      console.error('Entries must be an array');
      return false;
    }

    // Validate each entry structure if entries exist
    if (logbook.entries) {
      for (const entry of logbook.entries) {
        if (!entry.logbook || !entry.logbook.id || !entry.logbook.timestamp) {
          console.error('Invalid entry structure');
          return false;
        }
      }
    }

    // Validate statistics (create default if missing)
    if (!logbook.statistics) {
      logbook.statistics = {
        totalEntries: logbook.entries ? logbook.entries.length : 0,
        firstEntry: new Date().toISOString(),
        lastEntry: new Date().toISOString()
      };
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
      schemaVersion: SCHEMA_VERSION,
      needsImport: this.needsImport
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

const saveManagerInstance = new SaveManager();
export default saveManagerInstance;