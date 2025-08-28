// ui/captains-quarters/logbook/logbook.js
// Complete logbook system with SaveManager integration

import { setGlobalScale } from '/utils/scale.js';
import gameStateInstance from '/game/state.js';
import saveManager from '/game/saveManager.js';
import { initPDAOverlay } from '/utils/pdaOverlay.js';

initPDAOverlay();

class LogbookSystem {
  constructor() {
    this.currentEntryId = 1;
    this.logbookData = null;
    // Use the singleton SaveManager directly
    this.eventListeners = new Map(); // Track listeners for cleanup
    this.saving = false;
    this.initialized = false;
  }

  async initialize() {
    // Ensure global scale is set
   // document.addEventListener('DOMContentLoaded', () => {
    //setGlobalScale();
    //console.log('Global scale set on Logbook load.');
    //});
    try {
      // Use the singleton SaveManager - this handles loading localStorage + JSON files
      await saveManager.init(gameStateInstance);

      // New logic for logbook and import checks
      if (saveManager.requiresImport()) {
        this.showNoLogbooksError();
        return;
      }

      const currentBook = saveManager.getCurrentBook();
      const hasMountedLogbook = currentBook && currentBook.mounted;

      if (!currentBook) {
        this.showNoActiveLogbookError();
        return;
      }

      // Load the active logbook
      this.logbookData = currentBook;
      console.log(`Loaded active logbook: ${this.logbookData.name} with ${this.logbookData.entries.length} entries`);

      // Update current entry ID based on existing entries
      this.updateCurrentEntryId();
      
      // Update UI
      this.updateCurrentDate();
      this.updateLocationInfo();
      this.renderExistingEntries();
      this.bindControls();
      this.updateBookshelfUI();

      this.initialized = true;
      console.log('LogbookSystem initialized successfully');
      
    } catch (error) {
      console.error('Failed to initialize LogbookSystem:', error);
      this.showError('Failed to initialize logbook system');
    }
  }

  updateCurrentEntryId() {
    if (this.logbookData?.entries && this.logbookData.entries.length > 0) {
      const maxId = Math.max(...this.logbookData.entries.map(entry => {
        const match = entry.logbook.id.match(/LOG-(\d+)$/);
        return match ? parseInt(match[1]) : 0;
      }));
      this.currentEntryId = maxId + 1;
    }
  }

  showNoLogbooksError() {
    const main = document.getElementById('log-entries');
    if (!main) return;

    main.innerHTML = `
      <div class="error-state">
        <h3>ERROR: No logbooks found</h3>
        <p>No logbooks were found in memory or the /data/logbooks folder.</p>
        <p>Please import a valid logbook file.</p>
        <button id="import-first-logbook" class="control-btn">Import Logbook</button>
      </div>
    `;

    // Bind import button
    const importBtn = document.getElementById('import-first-logbook');
    if (importBtn) {
      this.addEventListenerWithCleanup(importBtn, 'click', () => {
        document.getElementById('logbook-import').click();
      });
    }

    // Still bind basic controls for import functionality
    this.bindImportControls();
  }

  showNoActiveLogbookError() {
    const main = document.getElementById('log-entries');
    if (!main) return;

    main.innerHTML = `
      <div class="error-state">
        <h3>ERROR: No logbook loaded</h3>
        <p>Found archived logbooks but no active logbook is currently loaded.</p>
        <p>Please select a logbook to load.</p>
        <button id="load-first-logbook" class="control-btn">Browse Logbooks</button>
      </div>
    `;

    // Update the bookshelf UI so user can see available options
    this.updateBookshelfUI();
    
    // Bind basic controls
    this.bindBookshelfControls();
  }

  // Add a utility to modify dates for displays to keep story immersive
  getFutureDate(yearsOffset = 50) {
    const date = new Date();
    date.setFullYear(date.getFullYear() + yearsOffset);
    return date;
  }

  // Update the current date display
  updateCurrentDate() {
    const el = document.getElementById('current-date');
    if (!el) return;
    
    const currentDate = this.getFutureDate();
    el.textContent = currentDate.toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
  }

  updateLocationInfo() {
    const gameState = gameStateInstance.getState();
    if (!gameState) return;

    const locationElements = document.querySelectorAll('.log-info p');
    
    // Update location
    if (gameState.navigation?.location && locationElements[0]) {
      const location = gameState.navigation.location;
      locationElements[0].textContent = `Location: ${location.properties?.name || 'Unknown'}`;
      // If location properties type is dock show "Status: Docked" or "Status: Underway". 
      if (location.properties?.type === 'dock') {
        if (locationElements[1]) locationElements[1].textContent = 'Status: Docked';
      } else {
        if (locationElements[1]) locationElements[1].textContent = 'Status: Underway';
      }
      // Show location propertys description if available
      if (location.properties?.description && locationElements[2]) {
        locationElements[2].textContent = location.properties.description;
      } else if (locationElements[2]) {
        locationElements[2].textContent = '';
      }  
    }
  }

  renderExistingEntries() {
    const main = document.getElementById('log-entries');
    if (!main) return;
    
    // Clear existing dynamic entries (keep the first one)
    const existingEntries = main.querySelectorAll('.log-entry');
    existingEntries.forEach(entry => {
      // Keep the first entry, remove others
      if (!entry.querySelector('.entry-id')?.textContent.includes('M.LOG-0001')) {
        entry.remove();
      }
    });
    
    // Render saved entries
    if (this.logbookData?.entries && this.logbookData.entries.length > 0) {
      this.logbookData.entries.forEach(entry => {
        if (entry.logbook) {
          this.renderLogEntry(entry.logbook);
        }
      });
    }
  }

  renderLogEntry(logEntry) {
    if (!logEntry || !logEntry.timestamp) {
      console.error('Invalid log entry data:', logEntry);
      return;
    }
    
    const main = document.getElementById('log-entries');
    if (!main) return;
    
    const section = document.createElement('section');
    section.className = 'log-entry';
    
    const date = new Date(logEntry.timestamp);
    const formattedDate = date.toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
    const formattedTime = date.toLocaleTimeString('en-US', { hour12: false });
    
    let tasksHtml = '';
    if (logEntry.tasks && logEntry.tasks.length > 0) {
      tasksHtml = `
        <div class="task-list">
          <h4>Tasks:</h4>
          <ul>
            ${logEntry.tasks.map(task => {
              const isCompleted = logEntry.completedTasks && logEntry.completedTasks.includes(task);
              return `<li class="${isCompleted ? 'completed-task' : ''}">${task}</li>`;
            }).join('')}
          </ul>
        </div>
      `;
    }
    
    // Format entry type for display
    const typeDisplay = logEntry.type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
    
    section.innerHTML = `
      <h3>${typeDisplay}</h3>
      <div class="log-info">
        <p>From: ${logEntry.author.name}</p>
        <p>${logEntry.author.role}</p>
        <p>${logEntry.author.organization || logEntry.author.company || logEntry.author.department}</p>
      </div>
      <div class="entry-content">
        <p>${logEntry.content}</p>
      </div>
      ${tasksHtml}
      <div class="entry-metadata">
        <span class="timestamp">${formattedDate} ${formattedTime}</span>
        <span class="entry-id">${logEntry.id}</span>
      </div>
      <button class="control-btn revert-btn">Revert</button>
    `;
    
    const revertBtn = section.querySelector('.revert-btn');
    this.addEventListenerWithCleanup(revertBtn, 'click', () => {
      this.revertToEntry(logEntry.id);
    });
    
    main.appendChild(section);
  }

  bindControls() {
    // Bind all controls regardless of PDA overlay visibility
    // New entry button
    const newEntryBtn = document.getElementById('new-entry');
    if (newEntryBtn) {
      this.addEventListenerWithCleanup(newEntryBtn, 'click', () => this.createEntry());
    }

    // Exit logbook button
    const exitBtn = document.getElementById('exit-logbook');
    if (exitBtn) {
      this.addEventListenerWithCleanup(exitBtn, 'click', () => {
        console.log('Exiting logbook, returning to quarters...');
        window.location.href = '../quarters.html';
      });
    }

    // Bookshelf and import controls always bound
    this.bindBookshelfControls();
    this.bindImportControls();

    // Bind revert buttons for existing entries
    this.bindExistingRevertButtons();
  }

  bindBookshelfControls() {
    const nextBtn = document.getElementById('logbook-next');
    if (nextBtn) {
      this.addEventListenerWithCleanup(nextBtn, 'click', () => {
        saveManager.nextBook();
        this.updateBookshelfUI();
      });
    }

    const prevBtn = document.getElementById('logbook-prev');
    if (prevBtn) {
      this.addEventListenerWithCleanup(prevBtn, 'click', () => {
        saveManager.prevBook();
        this.updateBookshelfUI();
      });
    }

    const actionBtn = document.getElementById('logbook-action');
    if (actionBtn) {
      this.addEventListenerWithCleanup(actionBtn, 'click', () => this.handleLogbookAction());
    }
  }

  bindImportControls() {
    const importInput = document.getElementById('logbook-import');
    if (importInput) {
      this.addEventListenerWithCleanup(importInput, 'change', (event) => this.handleImport(event));
    }

    const importBtn = document.getElementById('logbook-import-btn');
    if (importBtn) {
      this.addEventListenerWithCleanup(importBtn, 'click', () => {
        document.getElementById('logbook-import').click();
      });
    }
  }

  bindExistingRevertButtons() {
    const existingRevertBtns = document.querySelectorAll('.revert-btn');
    existingRevertBtns.forEach(btn => {
      if (!btn.dataset.bound) {
        this.addEventListenerWithCleanup(btn, 'click', (e) => {
          const entrySection = e.target.closest('.log-entry');
          const entryId = entrySection?.querySelector('.entry-id')?.textContent;
          if (entryId) {
            this.revertToEntry(entryId);
          }
        });
        btn.dataset.bound = 'true';
      }
    });
  }

  // Event listener management to prevent memory leaks
  addEventListenerWithCleanup(element, event, handler) {
    if (!element) return;
    
    const key = `${element.id || 'anonymous'}-${event}`;
    
    // Remove existing listener if present
    if (this.eventListeners.has(key)) {
      const oldHandler = this.eventListeners.get(key);
      element.removeEventListener(event, oldHandler);
    }
    
    // Add new listener
    element.addEventListener(event, handler);
    this.eventListeners.set(key, handler);
  }

  cleanup() {
    // Remove all event listeners
    this.eventListeners.forEach((handler, key) => {
      const [elementId, event] = key.split('-');
      const element = document.getElementById(elementId);
      if (element) {
        element.removeEventListener(event, handler);
      }
    });
    this.eventListeners.clear();
  }

  updateBookshelfUI() {
    const display = document.getElementById('logbook-display');
    const actionBtn = document.getElementById('logbook-action');
    
    if (!display) return;

    const currentBook = saveManager.getCurrentBook();
    
    if (!currentBook) {
      display.innerHTML = '<div class="logbook-box"><p class="logbook-name">No logbooks found</p></div>';
      if (actionBtn) actionBtn.textContent = 'N/A';
      return;
    }

    const lastEntry = currentBook.lastModified || currentBook.created || new Date().toISOString();
    const entryCount = currentBook.entries ? currentBook.entries.length : 0;
    
    display.innerHTML = `
      <div class="logbook-box ${currentBook.mounted ? 'mounted' : 'archived'}">
        <p class="logbook-name"><strong>${currentBook.name || 'Untitled Logbook'}</strong></p>
        <p class="logbook-date">Last Entry: ${new Date(lastEntry).toLocaleString()}</p>
        <p class="logbook-count">Entries: ${entryCount}</p>
        <p class="logbook-status">${currentBook.mounted ? '<strong>Loaded</strong>' : 'Archived'}</p>
      </div>
    `;

    if (actionBtn) {
      actionBtn.textContent = currentBook.mounted ? 'Export' : 'Load';
    }
  }

  handleLogbookAction() {
    const currentBook = saveManager.getCurrentBook();
    if (!currentBook) return;

    if (currentBook.mounted) {
      // Export current logbook
      saveManager.exportLogbook(currentBook);
      this.showMessage('Logbook exported successfully');
    } else {
      // Load archived logbook
      const confirmLoad = confirm(
        'Loading this logbook will replace your current progress. Continue?'
      );
      if (confirmLoad) {
        const success = saveManager.mountLogbook(saveManager.currentIndex);
        if (success) {
          this.showMessage('Logbook loaded successfully');
          // Reload the page to refresh the UI with new data
          window.location.reload();
        } else {
          this.showError('Failed to load logbook');
        }
      }
    }
  }

  async handleImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
    const logbook = await saveManager.importLogbook(file);
    if (logbook) {
      this.updateBookshelfUI();
      this.showMessage('Logbook imported successfully');
      
      // If this was our first logbook, reload to initialize properly
      if (saveManager.bookshelf.length === 1) {
        setTimeout(() => window.location.reload(), 1500);
      }
    } else {
      this.showError('Failed to import logbook');
    }
    } catch (error) {
      console.error('Import error:', error);
      this.showError('Failed to import logbook file');
    }

    // Clear the file input
    event.target.value = '';
  }

  // Create a new log entry
  createEntry() {
    if (!this.initialized || !this.logbookData) {
      this.showError('No active logbook to add entries to');
      return;
    }

    const main = document.getElementById('log-entries');
    if (!main) return;
    
    const entryId = `LOG-${String(this.currentEntryId).padStart(4, '0')}`;
    const currentDate = this.getFutureDate();

    const section = document.createElement('section');
    section.className = 'log-entry';
    section.innerHTML = `
      <h3>Personal Log Entry (Pending)</h3>
      <div class="entry-content">
        <textarea class="log-textarea" placeholder="Enter your log entry..." maxlength="2000"></textarea>
        <div class="char-count">0 / 2000</div>
      </div>
      <div class="entry-metadata">
        <span class="timestamp">${currentDate.toLocaleDateString('en-US')} ${currentDate.toLocaleTimeString('en-US', { hour12: false })}</span>
        <span class="entry-id">${entryId}</span>
      </div>
      <button class="control-btn save-btn">Save Entry</button>
      <button class="control-btn cancel-btn">Cancel</button>
    `;

    main.appendChild(section);
    section.scrollIntoView({ behavior: 'smooth' });

    // Focus on textarea
    const textarea = section.querySelector('textarea');
    const charCount = section.querySelector('.char-count');
    textarea.focus();

    // Character counter
    textarea.addEventListener('input', () => {
      const count = textarea.value.length;
      charCount.textContent = `${count} / 2000`;
      
      if (count > 1900) {
        charCount.style.color = 'var(--error-red)';
      } else if (count > 1500) {
        charCount.style.color = 'var(--accent-orange)';
      } else {
        charCount.style.color = 'var(--text-gray)';
      }
    });

    // Bind buttons
    const saveBtn = section.querySelector('.save-btn');
    const cancelBtn = section.querySelector('.cancel-btn');

    saveBtn.addEventListener('click', () => {
      const content = textarea.value.trim();
      if (!content) {
        this.flashButton(cancelBtn, 'Entry cannot be empty');
        textarea.classList.add('error');
        setTimeout(() => textarea.classList.remove('error'), 2000);
        return;
      }

      this.saveEntryAndUpdateFiles(content, entryId, currentDate, section, main);
    });

    cancelBtn.addEventListener('click', () => {
      section.remove();
    });
  }

  flashButton(button, message) {
    const originalText = button.textContent;
    button.textContent = message;
    button.style.animation = 'pulse 0.5s ease-in-out';
    
    setTimeout(() => {
      button.textContent = originalText;
      button.style.animation = '';
    }, 1500);
  }

  async saveEntryAndUpdateFiles(content, entryId, timestamp, section, main) {
    const saveBtn = section.querySelector('.save-btn');
    saveBtn.textContent = 'Saving...';
    saveBtn.disabled = true;
    section.classList.add('saving');

    try {
      // Create the new entry and add via saveManager
      const newEntry = this.saveNewEntry(content, entryId, timestamp);
      saveManager.addEntry(newEntry);

      saveBtn.textContent = 'Saved!';

      setTimeout(() => {
        // Remove the editing section
        if (section.parentNode) {
          section.remove();
        }
        
        // Add the completed entry
        this.appendSavedEntry(content, entryId, timestamp);
        this.currentEntryId++;
      }, 800);

    } catch (error) {
      console.error('Failed to save entry:', error);
      saveBtn.textContent = 'Error!';
      this.showError('Failed to save entry');
      
      setTimeout(() => {
        saveBtn.textContent = 'Save Entry';
        saveBtn.disabled = false;
        section.classList.remove('saving');
      }, 2000);
    }
  }

  saveNewEntry(content, entryId, timestamp) {
    const newEntry = {
      logbook: {
        id: entryId,
        timestamp: timestamp.toISOString(),
        type: "personal_log",
        tags: ["captain", "personal"],
        author: {
          organization: "Aqua Nova DSV",
          department: "Command",
          name: "Captain",
          role: "Commanding Officer"
        },
        content: content,
        tasks: [],
        completedTasks: []
      },
      gameSnapshot: this.createGameSnapshot(),
      metadata: {
        importance: "normal",
        tags: ["personal", "captain"],
        canRevert: true
      }
    };
    this.logbookData.entries.push(newEntry);
    this.logbookData.statistics.totalEntries++;
    this.logbookData.statistics.lastEntry = timestamp.toISOString();
    this.logbookData.lastModified = timestamp.toISOString();
    return newEntry;
  }

  createGameSnapshot() {
    // Get current game state from game/state.js
    const gameState = gameStateInstance.getState();
    if (!gameState) return null;

    return {
      navigation: { ...gameState.navigation },
      shipSystems: JSON.parse(JSON.stringify(gameState.shipSystems || {})),
      crew: { ...gameState.crew },
      mission: { ...gameState.mission },
      environment: { ...gameState.environment },
      progress: {
        stationsUnlocked: gameState.progress?.stationsUnlocked || ["captains-quarters"],
        areasExplored: gameState.progress?.areasExplored || ["woods_hole"],
        achievementsUnlocked: gameState.progress?.achievementsUnlocked || ["first_boot"]
      }
    };
  }

  appendSavedEntry(content, entryId, timestamp) {
    const main = document.getElementById('log-entries');
    if (!main) return;

    const section = document.createElement('section');
    section.className = 'log-entry';
    
    const formattedDate = timestamp.toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
    const formattedTime = timestamp.toLocaleTimeString('en-US', { hour12: false });
    
    section.innerHTML = `
      <h3>Personal Log</h3>
      <div class="log-info">
        <p>From: Captain</p>
        <p>Commanding Officer</p>
        <p>Aqua Nova DSV</p>
      </div>
      <div class="entry-content">
        <p>${this.escapeHtml(content)}</p>
      </div>
      <div class="entry-metadata">
        <span class="timestamp">${formattedDate} ${formattedTime}</span>
        <span class="entry-id">${entryId}</span>
      </div>
      <button class="control-btn revert-btn">Revert</button>
    `;
    
    const revertBtn = section.querySelector('.revert-btn');
    this.addEventListenerWithCleanup(revertBtn, 'click', () => {
      this.revertToEntry(entryId);
    });
    
    main.appendChild(section);
    section.scrollIntoView({ behavior: 'smooth' });
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  revertToEntry(entryId) {
    console.log(`Attempting to revert to entry: ${entryId}`);
    
    // Handle the hardcoded first entry
    if (entryId === 'M.LOG-0001') {
      console.log('Reverting to initial mission state');
      const confirmRevert = confirm('This will reset the game to the initial mission state. Continue?');
      if (confirmRevert) {
        // Use gameStateInstance to reset to initial state
        gameStateInstance.reset();
        this.showMessage('Game reset to initial mission state');
        // Reload to reflect changes
        setTimeout(() => window.location.reload(), 1000);
      }
      return;
    }
    
    try {
      saveManager.revertToEntry(entryId);
      this.updateLocationInfo();
      this.renderExistingEntries();
      this.updateCurrentEntryId();
    } catch (error) {
      console.error('Failed to revert:', error);
      this.showError('Failed to revert game state');
    }
  }

  showMessage(message) {
    console.log('INFO:', message);
    // Temporary alert - replace with better UI later
    setTimeout(() => alert(message), 100);
  }

  showError(message) {
    console.error('ERROR:', message);
    // Temporary alert - replace with better UI later  
    setTimeout(() => alert(`Error: ${message}`), 100);
  }

  // Cleanup when page unloads
  destroy() {
    this.cleanup();
  }
}

// Initialize the logbook system when the page loads
let logbookSystem = null;

document.addEventListener('DOMContentLoaded', async () => {
  logbookSystem = new LogbookSystem();
  await logbookSystem.initialize();
  // Ensure controls are always bound, even if PDA overlay is hidden
  logbookSystem.bindControls();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (logbookSystem) {
    logbookSystem.destroy();
  }
});

// Export for potential external access
export default LogbookSystem;