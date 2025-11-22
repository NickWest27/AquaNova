// ui/captains-quarters/logbook/logbook.js
// Complete logbook system with refactored SaveManager integration
// Clean separation of concerns - UI logic only
// Uses SaveManager for all persistence operations
// Uses GameState for all state operations

import displayManager from '/utils/displayManager.js';
import gameStateInstance from '/game/state.js';
import saveManager from '/game/saveManager.js';
import { initPDAOverlay } from '/utils/pdaOverlay.js';
import { initCommunicatorOverlay } from '/utils/communicatorOverlay.js';

initPDAOverlay();
initCommunicatorOverlay(); 

class LogbookSystem {
  constructor() {
    this.currentEntryId = 1;
    this.eventListeners = new Map(); // Track listeners for cleanup
    this.initialized = false;
  }

  async initialize() {
    try {
      // Initialize display system FIRST (for proper scaling)
      await displayManager.init();

      // SaveManager handles all initialization now
      const initialized = await saveManager.init(gameStateInstance);
      
      if (!initialized) {
        this.showNoLogbooksError();
        return;
      }

      // Check if we have an active logbook
      const activeLogbook = saveManager.getActiveLogbook();
      if (!activeLogbook) {
        this.showNoActiveLogbookError();
        return;
      }

      console.log(`Loaded active logbook: ${activeLogbook.name} with ${activeLogbook.entries?.length || 0} entries`);

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
    const activeLogbook = saveManager.getActiveLogbook();
    if (activeLogbook?.entries && activeLogbook.entries.length > 0) {
      const maxId = Math.max(...activeLogbook.entries.map(entry => {
        // Handle both id and entryId fields for backwards compatibility
        const entryId = entry.logbook?.id || entry.logbook?.entryId;
        if (!entryId) return 0;
        
        const match = entryId.match(/LOG-(\d+)$/);
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
        <p>No logbooks were found in localStorage or the bootstrap file.</p>
        <p>Please import a valid logbook file to continue.</p>
        <button id="import-first-logbook" class="btn btn-selectable">Import Logbook</button>
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
        <h3>ERROR: No active logbook loaded</h3>
        <p>Logbooks found but no active logbook is currently loaded.</p>
        <p>Please select a logbook from the bookshelf below.</p>
        <button id="load-first-logbook" class="btn btn-selectable">Browse Logbooks</button>
      </div>
    `;

    // Update the bookshelf UI so user can see available options
    this.updateBookshelfUI();
    
    // Bind basic controls
    this.bindBookshelfControls();
    this.bindImportControls();
  }

  // Utility to show future dates for immersion
  getFutureDate(yearsOffset = 50) {
    const date = new Date();
    date.setFullYear(date.getFullYear() + yearsOffset);
    return date;
  }

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
    
    // Update location display
    if (gameState.navigation?.location && locationElements[0]) {
      const location = gameState.navigation.location;
      locationElements[0].textContent = `Location: ${location.properties?.name || 'Unknown'}`;
      
      // Update status based on location type
      if (location.properties?.type === 'dock') {
        if (locationElements[1]) locationElements[1].textContent = 'Status: Docked';
      } else {
        if (locationElements[1]) locationElements[1].textContent = 'Status: Underway';
      }
      
      // Show location description if available
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

    // Clear all existing entries - we'll re-render from data
    const existingEntries = main.querySelectorAll('.log-entry');
    existingEntries.forEach(entry => entry.remove());

    // Render entries from active logbook
    const activeLogbook = saveManager.getActiveLogbook();
    if (activeLogbook?.entries && activeLogbook.entries.length > 0) {
      activeLogbook.entries.forEach(entry => {
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
    
    // Render tasks if present
    let tasksHtml = '';
    if (logEntry.tasks && logEntry.tasks.length > 0) {
      tasksHtml = `
        <div class="task-list">
          <h4>Tasks:</h4>
          <ul>
            ${logEntry.tasks.map(task => {
              const isCompleted = logEntry.completedTasks && logEntry.completedTasks.includes(task);
              return `<li class="${isCompleted ? 'completed-task' : ''}">${this.escapeHtml(task)}</li>`;
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
        <p>From: ${this.escapeHtml(logEntry.author.name)}</p>
        <p>${this.escapeHtml(logEntry.author.role)}</p>
        <p>${this.escapeHtml(logEntry.author.organization || logEntry.author.company || logEntry.author.department)}</p>
      </div>
      <div class="entry-content">
        <p>${this.escapeHtml(logEntry.content)}</p>
      </div>
      ${tasksHtml}
      <div class="entry-metadata">
        <span class="timestamp">${formattedDate} ${formattedTime}</span>
        <span class="entry-id">${logEntry.entryId}</span>
      </div>
      <button class="btn btn-caution revert-btn">Revert</button>
    `;
    
    const revertBtn = section.querySelector('.revert-btn');
    this.addEventListenerWithCleanup(revertBtn, 'click', () => {
      this.revertToEntry(logEntry.entryId);
    });
    
    main.appendChild(section);
  }

  bindControls() {
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

    // Bookshelf and import controls
    this.bindBookshelfControls();
    this.bindImportControls();
    this.bindExistingRevertButtons();
  }

  bindBookshelfControls() {
    const nextBtn = document.getElementById('logbook-next');
    if (nextBtn) {
      this.addEventListenerWithCleanup(nextBtn, 'click', () => {
        this.navigateCarousel(1);
      });
    }

    const prevBtn = document.getElementById('logbook-prev');
    if (prevBtn) {
      this.addEventListenerWithCleanup(prevBtn, 'click', () => {
        this.navigateCarousel(-1);
      });
    }

    const actionBtn = document.getElementById('logbook-action');
    if (actionBtn) {
      this.addEventListenerWithCleanup(actionBtn, 'click', () => this.handleLogbookAction());
    }
  }

  navigateCarousel(direction) {
    const bookshelf = saveManager.getBookshelf();
    if (bookshelf.length <= 1) return;
    
    // Initialize carousel index if not set
    if (this.currentCarouselIndex === undefined) {
      this.currentCarouselIndex = bookshelf.findIndex(book => book.isActive);
      if (this.currentCarouselIndex === -1) this.currentCarouselIndex = 0;
    }
    
    // Navigate
    this.currentCarouselIndex = (this.currentCarouselIndex + direction + bookshelf.length) % bookshelf.length;
    
    // Update display
    this.displayCarouselLogbook(this.currentCarouselIndex);
    
    // Visual feedback
    const display = document.getElementById('logbook-display');
    if (display) {
      display.style.animation = 'none';
      setTimeout(() => {
        display.style.animation = 'fadeIn 0.2s ease-in-out';
      }, 10);
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

  // Event listener management for cleanup
  addEventListenerWithCleanup(element, event, handler) {
    if (!element) return;
    
    const key = `${element.id || Math.random()}-${event}`;
    
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

    const bookshelf = saveManager.getBookshelf();
    
    if (bookshelf.length === 0) {
      display.innerHTML = '<div class="logbook-box"><p class="logbook-name">No logbooks found</p></div>';
      if (actionBtn) actionBtn.textContent = 'Import';
      return;
    }

    // Initialize carousel to show active logbook first
    this.currentCarouselIndex = bookshelf.findIndex(book => book.isActive);
    if (this.currentCarouselIndex === -1) this.currentCarouselIndex = 0;
    
    this.displayCarouselLogbook(this.currentCarouselIndex);
  }

  displayCarouselLogbook(index) {
    const display = document.getElementById('logbook-display');
    const actionBtn = document.getElementById('logbook-action');
    const prevBtn = document.getElementById('logbook-prev');
    const nextBtn = document.getElementById('logbook-next');
    
    if (!display) return;

    const bookshelf = saveManager.getBookshelf();
    if (index < 0 || index >= bookshelf.length) return;
    
    const logbook = bookshelf[index];
    const lastEntry = logbook.lastModified || logbook.created || new Date().toISOString();
    
    // Visual status based on whether this logbook is active
    const isActive = logbook.isActive;
    const statusClass = isActive ? 'mounted' : 'archived';
    const statusText = isActive ? '<strong>ACTIVE</strong>' : '<em>Inactive</em>';
    const statusColor = isActive ? 'var(--success-green)' : 'var(--text-gray)';
    
    display.innerHTML = `
      <div class="logbook-box ${statusClass}">
        <p class="logbook-name"><strong>${this.escapeHtml(logbook.name || 'Untitled Logbook')}</strong></p>
        <p class="logbook-date">Last Entry: ${new Date(lastEntry).toLocaleString()}</p>
        <p class="logbook-count">Entries: ${logbook.entryCount}</p>
        <p class="logbook-status" style="color: ${statusColor}">${statusText}</p>
        ${!isActive ? '<p class="logbook-warning"><small>⚠️ Loading this will change your current progress</small></p>' : ''}
      </div>
      <div class="carousel-info">
        <span class="carousel-position">${index + 1} / ${bookshelf.length}</span>
        ${bookshelf.length > 1 ? '<span class="carousel-hint">Use ← → to browse</span>' : ''}
      </div>
    `;

    // Update action button
    if (actionBtn) {
      if (isActive) {
        actionBtn.textContent = 'Export Active';
        actionBtn.className = 'btn btn-selectable';
        actionBtn.title = 'Export this logbook to a file';
      } else {
        actionBtn.textContent = 'Load Logbook';
        actionBtn.className = 'btn btn-warning';
        actionBtn.title = 'Mount this logbook as active (will change current progress)';
      }
      actionBtn.dataset.logbookId = logbook.id;
    }

    // Update navigation buttons
    if (prevBtn) {
      prevBtn.disabled = bookshelf.length <= 1;
      prevBtn.title = bookshelf.length <= 1 ? 'No other logbooks' : 'Previous logbook';
    }
    if (nextBtn) {
      nextBtn.disabled = bookshelf.length <= 1;
      nextBtn.title = bookshelf.length <= 1 ? 'No other logbooks' : 'Next logbook';
    }
  }

  handleLogbookAction() {
    const actionBtn = document.getElementById('logbook-action');
    if (!actionBtn) return;
    
    const logbookId = actionBtn.dataset.logbookId;
    const bookshelf = saveManager.getBookshelf();
    const targetLogbook = bookshelf.find(book => book.id === logbookId);
    
    if (!targetLogbook) {
      this.showError('Logbook not found');
      return;
    }

    if (targetLogbook.isActive) {
      // Export the active logbook
      this.exportActiveLogbook();
    } else {
      // Load an inactive logbook (with confirmation)
      this.loadInactiveLogbook(targetLogbook);
    }
  }

  exportActiveLogbook() {
    try {
      const success = saveManager.exportLogbook();
      if (success) {
        this.showMessage('Active logbook exported successfully');
      } else {
        this.showError('Failed to export logbook');
      }
    } catch (error) {
      console.error('Export failed:', error);
      this.showError(`Export failed: ${error.message}`);
    }
  }

  loadInactiveLogbook(logbook) {
    // Show detailed confirmation dialog
    const confirmMessage = [
      `⚠️ LOAD LOGBOOK: "${logbook.name}"`,
      '',
      'This will:',
      '• Replace your current active logbook',
      '• Change ship state to this logbook\'s latest entry',
      '• Update game progress to match this logbook',
      '',
      'Your current progress will be preserved in the current logbook.',
      '',
      'Continue?'
    ].join('\n');

    const confirmed = confirm(confirmMessage);
    
    if (!confirmed) {
      this.showMessage('Load cancelled');
      return;
    }

    // Show loading state
    const actionBtn = document.getElementById('logbook-action');
    const originalText = actionBtn.textContent;
    actionBtn.textContent = 'Loading...';
    actionBtn.disabled = true;

    try {
      const success = saveManager.mountLogbook(logbook.id);
      
      if (success) {
        this.showMessage(`Loaded logbook: ${logbook.name}`);
        
        // Update the carousel to show the newly active logbook
        this.currentCarouselIndex = saveManager.getBookshelf().findIndex(book => book.isActive);
        this.displayCarouselLogbook(this.currentCarouselIndex);
        
        // Reload the page to reflect the new logbook's state
        setTimeout(() => {
          this.showMessage('Refreshing interface...');
          window.location.reload();
        }, 1500);
      } else {
        throw new Error('Mount operation failed');
      }
    } catch (error) {
      console.error('Load failed:', error);
      this.showError(`Failed to load logbook: ${error.message}`);
      
      // Restore button state
      actionBtn.textContent = originalText;
      actionBtn.disabled = false;
    }
  }

  async handleImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const logbook = await saveManager.importLogbook(file);
      if (logbook) {
        this.updateBookshelfUI();
        this.showMessage(`Logbook "${logbook.name}" imported successfully`);
        
        // If this was our first logbook, reload to initialize properly
        const bookshelf = saveManager.getBookshelf();
        if (bookshelf.length === 1) {
          setTimeout(() => window.location.reload(), 1500);
        }
      }
    } catch (error) {
      console.error('Import error:', error);
      this.showError(`Failed to import logbook: ${error.message}`);
    }

    // Clear the file input
    event.target.value = '';
  }

  createEntry() {
    if (!this.initialized) {
      this.showError('System not initialized');
      return;
    }

    const activeLogbook = saveManager.getActiveLogbook();
    if (!activeLogbook) {
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
      <button class="btn btn-activate save-btn">Save Entry</button>
      <button class="btn btn-warning cancel-btn">Cancel</button>
    `;

    main.appendChild(section);
    
    // More reliable scrolling - try multiple methods
    setTimeout(() => {
      // Method 1: scrollIntoView with more options
      try {
        section.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center',
          inline: 'nearest'
        });
      } catch (e) {
        // Fallback: scroll to bottom of page
        window.scrollTo({
          top: document.documentElement.scrollHeight,
          behavior: 'smooth'
        });
      }
    }, 100);

    // Focus on textarea
    const textarea = section.querySelector('textarea');
    const charCount = section.querySelector('.char-count');
    textarea.focus();

    // Character counter
    textarea.addEventListener('input', () => {
      const count = textarea.value.length;
      charCount.textContent = `${count} / 2000`;
    });

    // Bind buttons
    const saveBtn = section.querySelector('.save-btn');
    const cancelBtn = section.querySelector('.cancel-btn');

    saveBtn.addEventListener('click', () => {
      const content = textarea.value.trim();
      if (!content) {
        this.flashButton(saveBtn, 'Entry cannot be empty');
        textarea.classList.add('error');
        setTimeout(() => textarea.classList.remove('error'), 2000);
        return;
      }

      this.saveEntry(content, entryId, currentDate, section);
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

  async saveEntry(content, entryId, timestamp, section) {
    const saveBtn = section.querySelector('.save-btn');
    saveBtn.textContent = 'Saving...';
    saveBtn.disabled = true;
    section.classList.add('saving');

    try {
      // Create entry data
      const entryData = {
        id: entryId,
        timestamp: timestamp.toISOString(),
        type: "personal_log",
        tags: ["captain", "personal"],
        author: {
          organization: "Aqua Nova DSV",
          name: "Captain",
          role: "Commanding Officer"
        },
        content: content,
        tasks: [],
        completedTasks: []
      };

      // Use SaveManager to add the entry (it handles snapshots automatically)
      const savedEntry = saveManager.addEntry(entryData);
      
      if (savedEntry) {
        saveBtn.textContent = 'Saved!';

        setTimeout(() => {
          // Remove the editing section
          if (section.parentNode) {
            section.remove();
          }
          
          // Add the completed entry to the display
          this.renderLogEntry(savedEntry.logbook);
          this.currentEntryId++;
          
          // Update location info in case it changed
          this.updateLocationInfo();
        }, 800);
      } else {
        throw new Error('SaveManager returned null');
      }

    } catch (error) {
      console.error('Failed to save entry:', error);
      saveBtn.textContent = 'Error!';
      this.showError(`Failed to save entry: ${error.message}`);
      
      setTimeout(() => {
        saveBtn.textContent = 'Save Entry';
        saveBtn.disabled = false;
        section.classList.remove('saving');
      }, 2000);
    }
  }

  revertToEntry(entryId) {
    console.log(`Attempting to revert to entry: ${entryId}`);

    try {
      // Use SaveManager to handle ALL reverts (including first entry)
      const success = saveManager.revertToEntry(entryId);

      if (success) {
        this.showMessage(`Reverted to entry ${entryId}`);
        // Update UI to reflect the reverted state
        this.updateLocationInfo();
        this.renderExistingEntries();
        this.updateCurrentEntryId();
      }
    } catch (error) {
      console.error('Failed to revert:', error);
      this.showError(`Failed to revert: ${error.message}`);
    }
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  showMessage(message) {
    console.log('INFO:', message);
    // Create a temporary notification instead of alert
    this.showNotification(message, 'info');
  }

  showError(message) {
    console.error('ERROR:', message);
    this.showNotification(`Error: ${message}`, 'error');
  }

  showNotification(message, type = 'info') {
    // Create a simple notification system
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${type === 'error' ? '#ff6b6b' : '#51cf66'};
      color: white;
      padding: 12px 20px;
      border-radius: 4px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 10000;
      animation: slideIn 0.3s ease-out;
    `;

    document.body.appendChild(notification);

    // Remove after 3 seconds
    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease-in forwards';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 3000);
  }

  destroy() {
    this.cleanup();
  }
}

// Add CSS for carousel and visual states
const style = document.createElement('style');
style.textContent = `
@keyframes slideIn {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
@keyframes slideOut {
  from { transform: translateX(0); opacity: 1; }
  to { transform: translateX(100%); opacity: 0; }
}
@keyframes fadeIn {
  from { opacity: 0.5; transform: scale(0.98); }
  to { opacity: 1; transform: scale(1); }
}

.log-textarea.error {
  border-color: var(--error-red) !important;
  animation: shake 0.5s ease-in-out;
}
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-5px); }
  75% { transform: translateX(5px); }
}

/* Carousel-specific styles */
.logbook-box.mounted {
  border-left: 4px solid var(--success-green);
  background: rgba(76, 175, 80, 0.1);
}

.logbook-box.archived {
  border-left: 4px solid var(--text-gray);
  background: rgba(128, 128, 128, 0.05);
}

.logbook-warning {
  margin-top: 8px;
  padding: 4px 8px;
  background: rgba(255, 152, 0, 0.1);
  border-radius: 4px;
  font-style: italic;
}

.carousel-info {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  padding: 0 4px;
  font-size: 0.85em;
  color: var(--text-gray);
}

.carousel-position {
  font-weight: bold;
}

.carousel-hint {
  opacity: 0.7;
}

.action-btn.warning {
  background: var(--accent-orange);
  border-color: var(--accent-orange);
}

.action-btn.warning:hover {
  background: #ff8c00;
  border-color: #ff8c00;
}

.action-btn.export-btn {
  background: var(--success-green);
  border-color: var(--success-green);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.nav-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
`;
document.head.appendChild(style);

// Initialize the logbook system when the page loads
let logbookSystem = null;

document.addEventListener('DOMContentLoaded', async () => {
  logbookSystem = new LogbookSystem();
  await logbookSystem.initialize();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (logbookSystem) {
        logbookSystem.destroy();
    }
});

// Cleanup on navigation
window.addEventListener('pagehide', () => {
    if (logbookSystem) {
        logbookSystem.destroy();
    }
});

// Export for potential external access
export default LogbookSystem;