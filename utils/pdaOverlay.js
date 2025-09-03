import gameStateInstance from '/game/state.js';
import saveManager from '/game/saveManager.js';

let pdaVisible = false;
let pdaElement = null;
let currentPDAPage = 'main';
let selectedMenuItem = 0;
let logbookBrowserIndex = 0;
let saveManagerInstance = saveManager;
let pdaData = {
  gameState: null,
  logbookStatus: 'Unknown',
  currentLocation: 'Unknown',
  systemStatus: {},
  ambientData: {
    temperature: 22,
    pressure: 1013.25,
    humidity: 45,
    oxygen: 20.9,
    nitrogen: 78.1,
    carbonDioxide: 0.04
  },
  consoleLog: []
};

export function initPDAOverlay() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      togglePDA();
    }
    
    // PDA navigation when visible
    if (pdaVisible) {
      handlePDANavigation(e);
    }
  });
  
  // Update PDA data periodically
  setInterval(updatePDAData, 5000);
  
  // Initialize console logging
  initConsoleLogging();
  
  // SaveManager singleton is already imported as saveManagerInstance
}

function initConsoleLogging() {
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  
  console.log = function(...args) {
    addToConsoleLog('LOG', args.join(' '));
    originalLog.apply(console, args);
  };
  
  console.warn = function(...args) {
    addToConsoleLog('WARN', args.join(' '));
    originalWarn.apply(console, args);
  };
  
  console.error = function(...args) {
    addToConsoleLog('ERROR', args.join(' '));
    originalError.apply(console, args);
  };
}

function addToConsoleLog(type, message) {
  const timestamp = new Date().toLocaleTimeString();
  pdaData.consoleLog.push({
    timestamp,
    type,
    message: message.substring(0, 100)
  });
  
  if (pdaData.consoleLog.length > 20) {
    pdaData.consoleLog = pdaData.consoleLog.slice(-20);
  }
  
  if (currentPDAPage === 'scanner') {
    updateConsoleDisplay();
  }
}

function togglePDA() {
  if (!pdaElement) createPDA();
  pdaVisible = !pdaVisible;
  pdaElement.style.display = pdaVisible ? 'block' : 'none';
  
  if (pdaVisible) {
    updatePDAData();
    renderCurrentPage();
  }
}

function handlePDANavigation(e) {
  switch(e.key) {
    case 'ArrowUp':
    case 'ArrowDown':
    case 'ArrowLeft':
    case 'ArrowRight':
      e.preventDefault();
      navigatePDAMenu(e.key);
      break;
    case 'Enter':
      e.preventDefault();
      activatePDASelection();
      break;
    case 'Escape':
      e.preventDefault();
      if (currentPDAPage !== 'main') {
        currentPDAPage = 'main';
        selectedMenuItem = 0;
        renderCurrentPage();
      } else {
        togglePDA();
      }
      break;
  }
}

function createPDA() {
  pdaElement = document.createElement('div');
  pdaElement.id = 'pda-overlay';
  pdaElement.innerHTML = `
    <div class="pda-frame"></div>
    <div class="pda-glass">
      <div class="pda-header">
        <div class="pda-title">Personal Data Assistant</div>
        <div class="pda-status" id="pda-status">ONLINE</div>
      </div>
      <div class="pda-content" id="pda-content">
        <!-- Content will be dynamically generated -->
      </div>
      <div class="pda-footer">
        <div class="pda-help">Tab: Close | ↑↓: Navigate | Enter: Select | Esc: Back</div>
      </div>
    </div>
  `;
  document.body.appendChild(pdaElement);
  
  // Add click event listeners with proper event delegation
  pdaElement.addEventListener('click', handlePDAClick);
  
  // Create hidden file input for logbook import
  const importInput = document.createElement('input');
  importInput.type = 'file';
  importInput.id = 'pda-logbook-import';
  importInput.accept = '.json';
  importInput.style.display = 'none';
  importInput.addEventListener('change', handlePDAImport);
  pdaElement.appendChild(importInput);
}

function handlePDAClick(e) {
  e.preventDefault();
  e.stopPropagation();
  
  // Handle menu buttons (main menu navigation)
  const menuButton = e.target.closest('.pda-menu-button');
  if (menuButton) {
    const page = menuButton.getAttribute('data-page');
    if (page) {
      currentPDAPage = page;
      selectedMenuItem = 0; // Reset selection
      renderCurrentPage();
    }
    return;
  }
  
  // Handle action buttons
  const actionBtn = e.target.closest('.pda-action-btn');
  if (actionBtn) {
    const action = actionBtn.getAttribute('data-action');
    if (action) {
      handlePDAAction(action);
    }
    return;
  }
  
  // Handle logbook browser buttons
  const logbookBtn = e.target.closest('.pda-logbook-btn');
  if (logbookBtn) {
    const action = logbookBtn.getAttribute('data-action');
    if (action) {
      handleLogbookAction(action);
    }
    return;
  }
}

function handlePDAAction(action) {
  switch(action) {
    case 'navigate-logbook':
      window.location.href = 'ui/captains-quarters/logbook/logbook.html';
      break;
    case 'navigate-quarters':
      window.location.href = 'ui/captains-quarters/quarters.html';
      break;
    case 'return-splash':
      window.location.href = 'index.html';
      break;
    case 'refresh-scanner':
      updateAmbientData();
      renderCurrentPage();
      break;
  }
}

function handleLogbookAction(action) {
  if (!saveManagerInstance) {
    showPDAMessage('Error: SaveManager not available');
    return;
  }

  switch(action) {
    case 'prev':
      if (logbookBrowserIndex > 0) {
        logbookBrowserIndex--;
        updateLogbookDisplay();
      }
      break;
    case 'next':
      const bookshelf = saveManagerInstance.getBookshelf();
      if (logbookBrowserIndex < bookshelf.length - 1) {
        logbookBrowserIndex++;
        updateLogbookDisplay();
      }
      break;
    case 'load':
      loadSelectedLogbook();
      break;
    case 'export':
      exportCurrentLogbook();
      break;
    case 'import':
      document.getElementById('pda-logbook-import').click();
      break;
    case 'back':
      currentPDAPage = 'main';
      selectedMenuItem = 0;
      renderCurrentPage();
      break;
  }
}

function loadSelectedLogbook() {
  if (!saveManagerInstance) {
    showPDAMessage('Error: SaveManager not available');
    return;
  }

  const bookshelf = saveManagerInstance.getBookshelf();
  const selectedLogbook = bookshelf[logbookBrowserIndex];
  
  if (!selectedLogbook) {
    showPDAMessage('No logbook selected');
    return;
  }

  if (selectedLogbook.mounted) {
    showPDAMessage('Logbook already loaded');
    return;
  }

  const confirmLoad = confirm(
    `Load "${selectedLogbook.name}"? This will replace your current session.`
  );
  
  if (confirmLoad) {
    try {
      const success = saveManagerInstance.mountLogbook(logbookBrowserIndex);
      if (success) {
        showPDAMessage('Logbook loaded successfully');
        setTimeout(() => window.location.reload(), 1500);
      } else {
        showPDAMessage('Failed to load logbook');
      }
    } catch (error) {
      console.error('Failed to load logbook:', error);
      showPDAMessage('Failed to load logbook');
    }
  }
}

function exportCurrentLogbook() {
  if (!saveManagerInstance) {
    showPDAMessage('Error: SaveManager not available');
    return;
  }

  try {
    const success = saveManagerInstance.exportLogbook();
    if (success) {
      showPDAMessage('Logbook exported successfully');
    } else {
      showPDAMessage('Failed to export logbook');
    }
  } catch (error) {
    console.error('Export error:', error);
    showPDAMessage('Failed to export logbook');
  }
}

async function handlePDAImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (!saveManagerInstance) {
    showPDAMessage('Error: SaveManager not available');
    return;
  }

  try {
    const logbook = await saveManagerInstance.importLogbook(file);
    if (logbook) {
      showPDAMessage('Logbook imported successfully');
      const bookshelf = saveManagerInstance.getBookshelf();
      logbookBrowserIndex = bookshelf.length - 1;
      updateLogbookDisplay();
    } else {
      showPDAMessage('Failed to import logbook');
    }
  } catch (error) {
    console.error('Import error:', error);
    showPDAMessage('Failed to import logbook file');
  }

  event.target.value = '';
}

function showPDAMessage(message) {
  console.log('PDA Message:', message);
  const messageEl = document.createElement('div');
  messageEl.className = 'pda-message';
  messageEl.textContent = message;
  messageEl.style.cssText = `
    position: absolute;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(100, 255, 218, 0.9);
    color: var(--primary-blue);
    padding: 8px 16px;
    border-radius: 4px;
    font-size: 0.8rem;
    z-index: 1000;
    animation: pdaMessageFade 3s ease-out forwards;
  `;
  
  if (!document.getElementById('pda-message-styles')) {
    const style = document.createElement('style');
    style.id = 'pda-message-styles';
    style.textContent = `
      @keyframes pdaMessageFade {
        0% { opacity: 1; transform: translateX(-50%) translateY(0); }
        70% { opacity: 1; transform: translateX(-50%) translateY(0); }
        100% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
      }
    `;
    document.head.appendChild(style);
  }
  
  pdaElement.appendChild(messageEl);
  setTimeout(() => {
    if (messageEl.parentNode) {
      messageEl.remove();
    }
  }, 3000);
}

function updatePDAData() {
  if (gameStateInstance && gameStateInstance.getState) {
    pdaData.gameState = gameStateInstance.getState();
  }
  
  if (saveManagerInstance) {
    const currentBook = saveManagerInstance.getActiveLogbook();
    pdaData.logbookStatus = currentBook ? `Active: ${currentBook.name}` : 'No Active Logbook';
  }
  
  pdaData.currentLocation = getCurrentLocation();
  
  pdaData.systemStatus = {
    hull: getSystemStatus('hull'),
    navigation: getSystemStatus('navigation'), 
    life_support: getSystemStatus('life_support'),
    communications: getSystemStatus('communications'),
    engineering: getSystemStatus('engineering'),
    power: getSystemStatus('power')
  };
  
  updateAmbientData();
}

function updateAmbientData() {
  pdaData.ambientData = {
    temperature: 20 + Math.random() * 4,
    pressure: 1010 + Math.random() * 10,
    humidity: 40 + Math.random() * 20,
    oxygen: 20.5 + Math.random() * 1,
    nitrogen: 77.5 + Math.random() * 1,
    carbonDioxide: 0.03 + Math.random() * 0.02
  };
}

function getCurrentLocation() {
  if (pdaData.gameState?.navigation?.location?.properties?.name) {
    return pdaData.gameState.navigation.location.properties.name;
  }
  
  if (window.location.pathname.includes('index.html') || window.location.pathname === '/') {
    return 'Splash Screen';
  }
  
  const pathParts = window.location.pathname.split('/');
  const lastPart = pathParts[pathParts.length - 1].replace('.html', '');
  return lastPart.charAt(0).toUpperCase() + lastPart.slice(1).replace('-', ' ');
}

function getSystemStatus(systemName) {
  if (pdaData.gameState?.shipSystems?.[systemName]) {
    const system = pdaData.gameState.shipSystems[systemName];
    return {
      status: system.status || 'Unknown',
      power: system.power || 0,
      efficiency: system.efficiency || 0
    };
  }
  const mockStatuses = ['Online', 'Offline', 'Maintenance', 'Error'];
  return { 
    status: mockStatuses[Math.floor(Math.random() * mockStatuses.length)], 
    power: Math.floor(Math.random() * 100), 
    efficiency: Math.floor(Math.random() * 100) 
  };
}

function renderCurrentPage() {
  const contentEl = document.getElementById('pda-content');
  if (!contentEl) return;
  
  switch(currentPDAPage) {
    case 'main':
      renderMainPage(contentEl);
      break;
    case 'ship-status':
      renderShipStatusPage(contentEl);
      break;
    case 'tasks':
      renderTasksPage(contentEl);
      break;
    case 'contacts':
      renderContactsPage(contentEl);
      break;
    case 'scanner':
      renderScannerPage(contentEl);
      break;
    case 'logbook-manager':
      renderLogbookManagerPage(contentEl);
      break;
    case 'settings':
      renderSettingsPage(contentEl);
      break;
    default:
      renderMainPage(contentEl);
  }
}

function renderMainPage(contentEl) {
  const menuItems = [
    { id: 'ship-status', text: 'Ship Status' },
    { id: 'tasks', text: 'Tasks' },
    { id: 'contacts', text: 'Contacts' },
    { id: 'scanner', text: 'Scanner' },
    { id: 'logbook-manager', text: 'Logbook Manager' },
    { id: 'settings', text: 'Settings' }
  ];

  contentEl.innerHTML = `
    <div class="pda-page">
      <div class="pda-page-header">Main Menu</div>
      <div class="pda-menu-grid">
        ${menuItems.map((item, index) => `
          <button class="pda-menu-button ${index === selectedMenuItem ? 'selected' : ''}"
                  data-page="${item.id}">
            ${item.text}
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

function renderLogbookManagerPage(contentEl) {
  if (saveManagerInstance) {
    const activeLogbook = saveManagerInstance.getActiveLogbook();
    const bookshelf = saveManagerInstance.getBookshelf();
    
    if (activeLogbook) {
      const activeIndex = bookshelf.findIndex(book => book.mounted);
      if (activeIndex !== -1) {
        logbookBrowserIndex = activeIndex;
      }
    }
  }

  contentEl.innerHTML = `
    <div class="pda-page">
      <div class="pda-page-header">Logbook Manager<br><span style="font-size: 0.8em; color: var(--text-gray);">Campaign Management</span></div>
      
      <div class="pda-logbook-browser">
        <div class="pda-logbook-display-box logbook-display-box" id="pda-logbook-display-box">
          <div class="pda-logbook-metadata" id="pda-logbook-metadata">
            Loading...
          </div>
        </div>
        
        <div class="pda-logbook-controls" style="display: flex; gap: 8px; justify-content: center; margin: 10px 0;">
          <button class="btn btn-selectable pda-logbook-btn" data-action="prev">◀ Previous</button>
          <button class="btn btn-activate pda-logbook-btn" data-action="load" id="pda-logbook-load-btn">Load Campaign</button>
          <button class="btn btn-selectable pda-logbook-btn" data-action="next">Next ▶</button>
        </div>
        
        <div class="pda-logbook-actions" style="display: flex; gap: 8px; justify-content: center; margin: 10px 0;">
          <button class="btn btn-selectable pda-logbook-btn" data-action="export">Export Logbook</button>
          <button class="btn btn-selectable pda-logbook-btn" data-action="import">Import Logbook</button>
        </div>
        
        <div style="text-align: center; margin-top: 20px;">
          <button class="btn btn-caution pda-logbook-btn" data-action="back">◀ Back to Main Menu</button>
        </div>
      </div>
    </div>
  `;

  updateLogbookDisplay();
}

function updateLogbookDisplay() {
  const metadataEl = document.getElementById('pda-logbook-metadata');
  const loadBtn = document.getElementById('pda-logbook-load-btn');
  
  if (!metadataEl) return;

  if (!saveManagerInstance) {
    metadataEl.innerHTML = '<p style="color: var(--error-red);">SaveManager not available</p>';
    if (loadBtn) loadBtn.disabled = true;
    return;
  }

  const bookshelf = saveManagerInstance.getBookshelf();
  
  if (!bookshelf || bookshelf.length === 0) {
    metadataEl.innerHTML = '<p style="color: var(--error-red);">No logbooks available</p>';
    if (loadBtn) {
      loadBtn.textContent = 'N/A';
      loadBtn.disabled = true;
    }
    return;
  }

  const currentLogbook = bookshelf[logbookBrowserIndex];
  if (!currentLogbook) {
    metadataEl.innerHTML = '<p style="color: var(--error-red);">Invalid logbook index</p>';
    return;
  }

  const isActive = currentLogbook.mounted;
  const entryCount = currentLogbook.entries ? currentLogbook.entries.length : 0;
  const lastPlayed = currentLogbook.lastModified ? 
    new Date(currentLogbook.lastModified).toLocaleString() : 
    'Never';
    
  metadataEl.innerHTML = `
    <div class="pda-logbook-info" style="padding: 10px; font-size: 0.85em; line-height: 1.4;">
      <p><strong>Campaign:</strong> ${currentLogbook.name || 'Untitled'}</p>
      <p><strong>Description:</strong> ${currentLogbook.description || `Mission log with ${entryCount} entries`}</p>
      <p><strong>Last Played:</strong> ${lastPlayed}</p>
      <p><strong>Status:</strong> <span style="color: ${isActive ? 'var(--success-green)' : 'var(--text-gray)'};">${isActive ? 'Active' : 'Inactive'}</span></p>
      <p><strong>Entries:</strong> ${entryCount}</p>
      <p><strong>Position:</strong> ${logbookBrowserIndex + 1} of ${bookshelf.length}</p>
    </div>
  `;

  if (loadBtn) {
    loadBtn.textContent = isActive ? 'Currently Loaded' : 'Load Campaign';
    loadBtn.disabled = isActive;
  }
}

function renderScannerPage(contentEl) {
  const ambient = pdaData.ambientData;
  const currentPageSystems = getCurrentPageSystems();
  
  contentEl.innerHTML = `
    <div class="pda-page">
      <div class="pda-page-header">Environmental Scanner</div>
      
      <div class="pda-scanner-section" style="margin-bottom: 20px;">
        <div class="pda-section-title">Ambient Conditions</div>
        <div class="pda-ambient-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px; font-size: 0.8em;">
          <div class="pda-ambient-item">
            <span class="pda-ambient-label">Temperature:</span>
            <span class="pda-ambient-value">${ambient.temperature.toFixed(1)}°C</span>
          </div>
          <div class="pda-ambient-item">
            <span class="pda-ambient-label">Pressure:</span>
            <span class="pda-ambient-value">${ambient.pressure.toFixed(2)} hPa</span>
          </div>
          <div class="pda-ambient-item">
            <span class="pda-ambient-label">Humidity:</span>
            <span class="pda-ambient-value">${ambient.humidity.toFixed(1)}%</span>
          </div>
          <div class="pda-ambient-item">
            <span class="pda-ambient-label">Oxygen:</span>
            <span class="pda-ambient-value">${ambient.oxygen.toFixed(2)}%</span>
          </div>
          <div class="pda-ambient-item">
            <span class="pda-ambient-label">Nitrogen:</span>
            <span class="pda-ambient-value">${ambient.nitrogen.toFixed(2)}%</span>
          </div>
          <div class="pda-ambient-item">
            <span class="pda-ambient-label">CO₂:</span>
            <span class="pda-ambient-value">${ambient.carbonDioxide.toFixed(3)}%</span>
          </div>
        </div>
        <div style="text-align: center; margin-top: 10px;">
          <button class="btn btn-selectable" data-action="refresh-scanner">Refresh Readings</button>
        </div>
      </div>

      <div class="pda-scanner-section" style="margin-bottom: 20px;">
        <div class="pda-section-title">Local Systems Status</div>
        <div class="pda-systems-status" style="font-size: 0.85em;">
          ${currentPageSystems.map(system => `
            <div class="pda-system-status-item" style="display: flex; justify-content: space-between; padding: 2px 0;">
              <span class="pda-system-name">${system.name}:</span>
              <span class="pda-system-state ${system.status.toLowerCase()}" style="color: ${system.status === 'Online' ? 'var(--success-green)' : 'var(--error-red)'};">${system.status}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="pda-scanner-section">
        <div class="pda-section-title">Console Log</div>
        <div class="pda-console-display" id="pda-console-display" style="max-height: 150px; overflow-y: auto; font-size: 0.75em; font-family: monospace;">
          ${renderConsoleLog()}
        </div>
      </div>
    </div>
  `;
}

function getCurrentPageSystems() {
  const location = getCurrentLocation().toLowerCase();
  let relevantSystems = [];
  
  if (location.includes('engineering') || location.includes('engine')) {
    relevantSystems = [
      { name: 'Power Core', status: pdaData.systemStatus.power?.status || 'Unknown' },
      { name: 'Engineering', status: pdaData.systemStatus.engineering?.status || 'Unknown' },
      { name: 'Life Support', status: pdaData.systemStatus.life_support?.status || 'Unknown' }
    ];
  } else if (location.includes('bridge') || location.includes('navigation')) {
    relevantSystems = [
      { name: 'Navigation', status: pdaData.systemStatus.navigation?.status || 'Unknown' },
      { name: 'Communications', status: pdaData.systemStatus.communications?.status || 'Unknown' },
      { name: 'Hull', status: pdaData.systemStatus.hull?.status || 'Unknown' }
    ];
  } else {
    relevantSystems = [
      { name: 'Hull Integrity', status: pdaData.systemStatus.hull?.status || 'Unknown' },
      { name: 'Life Support', status: pdaData.systemStatus.life_support?.status || 'Unknown' },
      { name: 'Power Systems', status: pdaData.systemStatus.power?.status || 'Unknown' }
    ];
  }
  
  return relevantSystems;
}

function renderConsoleLog() {
  if (pdaData.consoleLog.length === 0) {
    return '<div class="pda-console-empty">No console output available</div>';
  }
  
  return pdaData.consoleLog.map(entry => `
    <div class="pda-console-entry pda-console-${entry.type.toLowerCase()}" style="margin: 2px 0; color: ${entry.type === 'ERROR' ? 'var(--error-red)' : entry.type === 'WARN' ? 'var(--accent-orange)' : 'var(--primary-cyan)'};">
      <span class="pda-console-time">[${entry.timestamp}]</span>
      <span class="pda-console-type">${entry.type}:</span>
      <span class="pda-console-message">${entry.message}</span>
    </div>
  `).join('');
}

function updateConsoleDisplay() {
  const consoleEl = document.getElementById('pda-console-display');
  if (consoleEl) {
    consoleEl.innerHTML = renderConsoleLog();
    consoleEl.scrollTop = consoleEl.scrollHeight;
  }
}

// Placeholder functions for other pages
function renderShipStatusPage(contentEl) {
  contentEl.innerHTML = `
    <div class="pda-page">
      <div class="pda-page-header">Ship Status</div>
      <div class="pda-placeholder" style="padding: 20px; text-align: center; color: var(--text-gray);">
        Ship Status page - Coming Soon
      </div>
      <div style="text-align: center; margin-top: 20px;">
        <button class="btn btn-caution" onclick="currentPDAPage='main'; selectedMenuItem=0; renderCurrentPage();">◀ Back to Main Menu</button>
      </div>
    </div>
  `;
}

function renderTasksPage(contentEl) {
  contentEl.innerHTML = `
    <div class="pda-page">
      <div class="pda-page-header">Tasks</div>
      <div class="pda-placeholder" style="padding: 20px; text-align: center; color: var(--text-gray);">
        Tasks page - Coming Soon
      </div>
      <div style="text-align: center; margin-top: 20px;">
        <button class="btn btn-caution" onclick="currentPDAPage='main'; selectedMenuItem=0; renderCurrentPage();">◀ Back to Main Menu</button>
      </div>
    </div>
  `;
}

function renderContactsPage(contentEl) {
  contentEl.innerHTML = `
    <div class="pda-page">
      <div class="pda-page-header">Contacts</div>
      <div class="pda-placeholder" style="padding: 20px; text-align: center; color: var(--text-gray);">
        Contacts page - Coming Soon
      </div>
      <div style="text-align: center; margin-top: 20px;">
        <button class="btn btn-caution" onclick="currentPDAPage='main'; selectedMenuItem=0; renderCurrentPage();">◀ Back to Main Menu</button>
      </div>
    </div>
  `;
}

function renderSettingsPage(contentEl) {
  contentEl.innerHTML = `
    <div class="pda-page">
      <div class="pda-page-header">Settings</div>
      <div class="pda-placeholder" style="padding: 20px; text-align: center; color: var(--text-gray);">
        Settings page - Coming Soon
      </div>
      <div style="text-align: center; margin-top: 20px;">
        <button class="btn btn-caution" onclick="currentPDAPage='main'; selectedMenuItem=0; renderCurrentPage();">◀ Back to Main Menu</button>
      </div>
    </div>
  `;
}

function navigatePDAMenu(direction) {
  if (currentPDAPage !== 'main') return;
  
  const menuButtons = document.querySelectorAll('.pda-menu-button');
  if (menuButtons.length === 0) return;
  
  // Remove current selection
  menuButtons[selectedMenuItem]?.classList.remove('selected');
  
  // Update selection based on direction
  switch(direction) {
    case 'ArrowUp':
      selectedMenuItem = (selectedMenuItem - 1 + menuButtons.length) % menuButtons.length;
      break;
    case 'ArrowDown':
      selectedMenuItem = (selectedMenuItem + 1) % menuButtons.length;
      break;
  }
  
  // Apply new selection
  menuButtons[selectedMenuItem]?.classList.add('selected');
}

function activatePDASelection() {
  if (currentPDAPage === 'main') {
    const selectedButton = document.querySelector('.pda-menu-button.selected');
    if (selectedButton) {
      const page = selectedButton.getAttribute('data-page');
      if (page) {
        currentPDAPage = page;
        selectedMenuItem = 0; // Reset selection for sub-pages
        renderCurrentPage();
      }
    }
  }
}

export { updatePDAData, getCurrentLocation };

function getCoordinateString() {
  if (pdaData.gameState?.navigation?.location?.geometry?.coordinates) {
    const coords = pdaData.gameState.navigation.location.geometry.coordinates;
    const lat = convertToDMS(coords[1], 'lat');
    const lon = convertToDMS(coords[0], 'lon');
    return `${lat}, ${lon}`;
  }
  return 'Unknown';
}

function convertToDMS(decimal, type) {
  const absolute = Math.abs(decimal);
  const degrees = Math.floor(absolute);
  const minutesFloat = (absolute - degrees) * 60;
  const minutes = Math.floor(minutesFloat);
  const seconds = Math.floor((minutesFloat - minutes) * 60);
  
  const direction = type === 'lat' 
    ? (decimal >= 0 ? 'N' : 'S') 
    : (decimal >= 0 ? 'E' : 'W');
    
  return `${direction} ${degrees}°${minutes.toString().padStart(2, '0')}'${seconds.toString().padStart(2, '0')}"`;
}

// Global functions for PDA actions
window.navigateToPage = function(page) {
  switch(page) {
    case 'logbook':
      window.location.href = 'ui/captains-quarters/logbook/logbook.html';
      break;
    case 'quarters':
      window.location.href = 'ui/captains-quarters/quarters.html';
      break;
  }
};

window.openLogbook = function() {
  window.location.href = 'ui/captains-quarters/logbook/logbook.html';
};

window.returnToSplash = function() {
  window.location.href = 'index.html';
};