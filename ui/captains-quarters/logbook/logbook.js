// ui/captains-quarters/logbook/logbook.js
// Complete logbook system with integrated save functionality and navigation

class LogbookSystem {
  constructor() {
    this.currentEntryId = 1;
    this.gameState = null;
    this.logbookData = null;
    this.initialize();
  }

  async initialize() {
    await this.loadGameData();
    this.updateCurrentDate();
    this.updateLocationInfo();
    this.renderExistingEntries();
    this.bindControls();
  }

  // Load data from localStorage
  async loadGameData() {
    try {
      // Load logbook data
      const storedLogbook = localStorage.getItem('aquaNova_logbook');
      if (storedLogbook) {
        this.logbookData = JSON.parse(storedLogbook);
        console.log(`Logbook loaded with ${this.logbookData.entries.length} entries`);
      } else {
        console.log('No logbook data found, creating empty logbook');
        this.logbookData = {
          entries: [],
          statistics: {
            totalEntries: 0,
            totalMissions: 0,
            firstEntry: new Date().toISOString(),
            lastEntry: new Date().toISOString()
          },
          settings: {
            autoSave: true,
            maxEntries: 1000
          }
        };
      }

      // Load current game state
      const storedGameState = localStorage.getItem('aquaNova_gameState');
      if (storedGameState) {
        this.gameState = JSON.parse(storedGameState);
        console.log('Game state loaded');
      }
      
    } catch (error) {
      console.error('Error loading game data:', error);
    }
  }

  // Save all data to localStorage, handle concurrent saves and fail gracfully
  async saveAllData() {
    if (this.saving) {
      console.log('Save operation already in progress');
      return false;
    }
    this.saving = true;
    try {
      if (this.gameState) {
        localStorage.setItem('aquaNova_gameState', JSON.stringify(this.gameState));
      }
      if (this.logbookData) {
        localStorage.setItem('aquaNova_logbook', JSON.stringify(this.logbookData));
      }
      console.log('All data saved to localStorage');
      return true;
    } catch (error) {
      console.error('Failed to save data:', error);
      return false;
    } finally {
      this.saving = false;
    }
  }
  // Add a utility to modify dates for displays to keep story
  getFutureDate(yearsOffset = 50) {
    const date = new Date();
    date.setFullYear(date.getFullYear() + yearsOffset);
    return date;
  }

  // Update the current date display, didn't I just make a getFutureDate
  updateCurrentDate() {
    const el = document.getElementById('current-date');
    if (!el) return;
    
    const currentDate = new Date();
    currentDate.setFullYear(currentDate.getFullYear() + 50);
    
    el.textContent = currentDate.toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
  }

  updateLocationInfo() {
    if (!this.gameState) return;

    const locationElements = document.querySelectorAll('.log-info p');
    
    // Update location
    if (this.gameState.navigation?.location && locationElements[0]) {
      const location = this.gameState.navigation.location;
      locationElements[0].textContent = `Location: ${location.properties.name}`;
    }

    // Update status - this need to be modified so it shows docked if location is a known dock, or underway.
    if (locationElements[1] && this.gameState.shipSystems) {
      let status = 'Unknown';
      
      if (this.gameState.shipSystems.hull?.dockingBay === 'Open') {
        status = 'Dry Dock - Systems Integration Phase';
      } else if (this.gameState.navigation.depth > 0) {
        status = `Submerged - Depth ${this.gameState.navigation.depth}M`;
      } else {
        status = 'Surface Operations';
      }
      
      locationElements[1].textContent = `Status: ${status}`;
    }
  }

  renderExistingEntries() {
    const main = document.getElementById('log-entries');
    if (!main) return;
    
    // Clear existing entries (except the hardcoded first one if present)
    const existingEntries = main.querySelectorAll('.log-entry');
    existingEntries.forEach(entry => {
      // Keep the first hardcoded entry, remove others
      if (!entry.querySelector('.entry-id')?.textContent.includes('M.LOG-0001')) {
        entry.remove();
      }
    });
    
    // Don't create duplicates if entries already exist
    if (this.logbookData?.entries && this.logbookData.entries.length > 0) {
      // Find the highest existing ID number
      const maxId = Math.max(...this.logbookData.entries.map(entry => {
        const match = entry.logbook.id.match(/(\d+)$/);
        return match ? parseInt(match[1]) : 0;
      }));
      this.currentEntryId = maxId + 1;
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
    revertBtn.addEventListener('click', () => {
      this.revertToEntry(logEntry.id);
    });
    
    main.appendChild(section);
  }

  bindControls() {
    // I need to add cleanup to prevent memory leaks from listners.
    // New entry button
    const newEntryBtn = document.getElementById('new-entry');
    if (newEntryBtn) {
      newEntryBtn.addEventListener('click', () => this.createEntry());
    }

    // Exit logbook button - updated to navigate back to quarters
    const exitBtn = document.getElementById('exit-logbook');
    if (exitBtn) {
      exitBtn.addEventListener('click', () => {
        console.log('Exiting logbook, returning to quarters...');
        // Navigate back to the quarters
        window.location.href = '../quarters.html';
      });
    }

    // Bind revert buttons for existing entries (like the hardcoded first entry)
    const existingRevertBtns = document.querySelectorAll('.revert-btn');
    existingRevertBtns.forEach(btn => {
      if (!btn.dataset.bound) {
        btn.addEventListener('click', (e) => {
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
  // Create a new log entry
  createEntry() {
    const main = document.getElementById('log-entries');
    if (!main) return;
    
    const entryId = `LOG-${String(this.currentEntryId).padStart(4, '0')}`;

    const section = document.createElement('section');
    section.className = 'log-entry';
    section.innerHTML = `
      <h3>Personal Log Entry (Pending)</h3>
      <div class="entry-content">
        <textarea class="log-textarea" placeholder="Enter your log entry..."></textarea>
      </div>
      <div class="entry-metadata">
        <span class="timestamp"></span>
        <span class="entry-id">${entryId}</span>
      </div>
      <button class="control-btn save-btn">Save Entry</button>
    `;

    main.appendChild(section);
    section.scrollIntoView({ behavior: 'smooth' });

    // Set timestamp
    const timestampSpan = section.querySelector('.timestamp');
    const currentDate = new Date();
    currentDate.setFullYear(currentDate.getFullYear() + 50);
    timestampSpan.textContent = `${currentDate.toLocaleDateString('en-US')} ${currentDate.toLocaleTimeString('en-US', { hour12: false })}`;

    // Focus on textarea
    const textarea = section.querySelector('textarea');
    textarea.focus();

    // Bind save button
    const saveBtn = section.querySelector('.save-btn');
    saveBtn.addEventListener('click', () => {
      const content = textarea.value.trim();
      if (!content) {
        alert('Log entry cannot be empty.');
        return;
      }

      this.saveEntryAndUpdateFiles(content, entryId, currentDate, section, main);
    });
  }

  async saveEntryAndUpdateFiles(content, entryId, timestamp, section, main) {
    const saveBtn = section.querySelector('.save-btn');
    saveBtn.textContent = 'Saving...';
    saveBtn.disabled = true;

    // Create and save the new entry
    this.saveNewEntry(content, entryId, timestamp);

    // Save to localStorage
    this.saveAllData();

    saveBtn.textContent = 'Done!';

    setTimeout(() => {
      // Remove the editing section
      if (section.parentNode) {
        main.removeChild(section);
      }
      
      // Add the completed entry
      this.appendSavedEntry(content, entryId, timestamp);
      this.currentEntryId++;
    }, 800);
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
  }

  createGameSnapshot() {
    if (!this.gameState) return null;

    return {
      navigation: { ...this.gameState.navigation },
      shipSystems: JSON.parse(JSON.stringify(this.gameState.shipSystems || {})),
      crew: { ...this.gameState.crew },
      mission: { ...this.gameState.mission },
      environment: { ...this.gameState.environment },
      progress: {
        stationsUnlocked: ["captains-quarters"],
        areasExplored: ["woods_hole"],
        achievementsUnlocked: ["first_boot"]
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
        <p>${content}</p>
      </div>
      <div class="entry-metadata">
        <span class="timestamp">${formattedDate} ${formattedTime}</span>
        <span class="entry-id">${entryId}</span>
      </div>
      <button class="control-btn revert-btn">Revert</button>
    `;
    
    const revertBtn = section.querySelector('.revert-btn');
    revertBtn.addEventListener('click', () => {
      this.revertToEntry(entryId);
    });
    
    main.appendChild(section);
    section.scrollIntoView({ behavior: 'smooth' });
  }

  revertToEntry(entryId) {
    console.log(`Attempting to revert to entry: ${entryId}`);
    
    // Handle the hardcoded first entry
    if (entryId === 'M.LOG-0001') {
      console.log('Reverting to initial mission state');
      // You could implement a reset to initial state here
      alert('Reverted to mission start state (functionality to be implemented)');
      return;
    }
    
    // Find the entry in the logbook data
    const entry = this.logbookData.entries.find(e => e.logbook.id === entryId);
    
    if (!entry) {
      console.warn(`Entry ${entryId} not found`);
      alert('Entry not found for revert operation');
      return;
    }
    
    if (!entry.gameSnapshot) {
      console.warn(`Entry ${entryId} has no game snapshot`);
      alert('This entry has no saved game state');
      return;
    }
    
    // Revert the game state
    this.gameState = { ...entry.gameSnapshot };
    
    // Update display
    this.updateLocationInfo();
    
    // Save reverted state
    this.saveAllData();
    
    console.log(`Reverted to entry ${entryId} from ${entry.logbook.timestamp}`);
    alert(`Game state reverted to: ${new Date(entry.logbook.timestamp).toLocaleDateString()}`);
  }

  // Future: Export/Import functionality
  exportLogbook() {
    const exportData = {
      type: "AquaNova_Logbook",
      version: "1.0.0",
      exported: new Date().toISOString(),
      campaignName: "Custom Campaign",
      logbook: this.logbookData,
      currentGameState: this.gameState
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json'
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aquanova_logbook_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  importLogbook(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importData = JSON.parse(e.target.result);
        
        if (importData.type !== "AquaNova_Logbook") {
          alert('Invalid logbook file');
          return;
        }
        
        // Load the imported data
        this.logbookData = importData.logbook;
        this.gameState = importData.currentGameState;
        
        // Save and refresh display
        this.saveAllData();
        this.updateLocationInfo();
        this.renderExistingEntries();
        
        console.log('Logbook imported successfully');
        alert('Logbook imported successfully');
        
      } catch (error) {
        console.error('Failed to import logbook:', error);
        alert('Failed to import logbook file');
      }
    };
    
    reader.readAsText(file);
  }
}

// Initialize the logbook system when the page loads
document.addEventListener('DOMContentLoaded', () => {
  new LogbookSystem();
});