let pdaVisible = false;
let pdaElement = null;
let currentPDAPage = 'main';
let selectedMenuItem = 0;
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
}

function initConsoleLogging() {
  // Capture console.log messages
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
    message: message.substring(0, 100) // Limit message length
  });
  
  // Keep only last 20 entries
  if (pdaData.consoleLog.length > 20) {
    pdaData.consoleLog = pdaData.consoleLog.slice(-20);
  }
  
  // Update console display if currently viewing scanner
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
  
  // Add click event listeners
  pdaElement.addEventListener('click', handlePDAClick);
}

function handlePDAClick(e) {
  e.preventDefault();
  e.stopPropagation();
  
  const menuItem = e.target.closest('.pda-menu-item');
  if (menuItem) {
    const page = menuItem.getAttribute('data-page');
    if (page) {
      currentPDAPage = page;
      renderCurrentPage();
    }
    return;
  }
  
  const actionBtn = e.target.closest('.pda-action-btn');
  if (actionBtn) {
    const action = actionBtn.getAttribute('data-action');
    if (action) {
      handlePDAAction(action);
    }
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

function updatePDAData() {
  // Try to get current game state from various sources
  if (window.GameState && window.GameState.getState) {
    pdaData.gameState = window.GameState.getState();
  }
  
  // Try to get save manager data
  if (window.SaveManager || window.saveManager) {
    const sm = window.SaveManager || window.saveManager;
    if (sm.getCurrentBook) {
      const book = sm.getCurrentBook();
      pdaData.logbookStatus = book ? `Active: ${book.name}` : 'No Active Logbook';
    }
  }
  
  // Get location from various possible sources
  pdaData.currentLocation = getCurrentLocation();
  
  // Update system status
  pdaData.systemStatus = {
    hull: getSystemStatus('hull'),
    navigation: getSystemStatus('navigation'), 
    life_support: getSystemStatus('life_support'),
    communications: getSystemStatus('communications'),
    engineering: getSystemStatus('engineering'),
    power: getSystemStatus('power')
  };
  
  // Update ambient data with some variation
  updateAmbientData();
}

function updateAmbientData() {
  // Add slight variations to simulate live readings
  pdaData.ambientData = {
    temperature: 20 + Math.random() * 4, // 20-24°C
    pressure: 1010 + Math.random() * 10, // 1010-1020 hPa
    humidity: 40 + Math.random() * 20, // 40-60%
    oxygen: 20.5 + Math.random() * 1, // 20.5-21.5%
    nitrogen: 77.5 + Math.random() * 1, // 77.5-78.5%
    carbonDioxide: 0.03 + Math.random() * 0.02 // 0.03-0.05%
  };
}

function getCurrentLocation() {
  // Try different ways to get location
  if (pdaData.gameState?.navigation?.location?.properties?.name) {
    return pdaData.gameState.navigation.location.properties.name;
  }
  
  // Check if we're on splash screen
  if (window.location.pathname.includes('index.html') || window.location.pathname === '/') {
    return 'Splash Screen';
  }
  
  // Parse from URL or page title
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
  // Return mock data if no game state available
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
    { id: 'ship-status', icon: '🚢', text: 'Ship Status', desc: 'View live ship systems' },
    { id: 'tasks', icon: '📋', text: 'Tasks', desc: 'Mission objectives' },
    { id: 'contacts', icon: '👥', text: 'Contacts', desc: 'Known personnel' },
    { id: 'scanner', icon: '📡', text: 'Scanner', desc: 'Environmental readings' },
    { id: 'logbook-manager', icon: '📚', text: 'Logbook Manager', desc: 'Campaign management' },
    { id: 'settings', icon: '⚙️', text: 'Settings', desc: 'System preferences' }
  ];

  contentEl.innerHTML = `
    <div class="pda-menu">
      <div class="pda-menu-header">Main Menu</div>
      <div class="pda-menu-items">
        ${menuItems.map((item, index) => `
          <div class="pda-menu-item ${index === selectedMenuItem ? 'selected' : ''}" 
               data-page="${item.id}">
            <span class="pda-menu-icon">${item.icon}</span>
            <div class="pda-menu-content">
              <span class="pda-menu-text">${item.text}</span>
              <span class="pda-menu-desc">${item.desc}</span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderScannerPage(contentEl) {
  const ambient = pdaData.ambientData;
  const currentPageSystems = getCurrentPageSystems();
  
  contentEl.innerHTML = `
    <div class="pda-page">
      <div class="pda-page-header">Environmental Scanner</div>
      
      <div class="pda-scanner-section">
        <div class="pda-section-title">Ambient Conditions</div>
        <div class="pda-ambient-grid">
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
        <button class="pda-action-btn" data-action="refresh-scanner">Refresh Readings</button>
      </div>

      <div class="pda-scanner-section">
        <div class="pda-section-title">Local Systems Status</div>
        <div class="pda-systems-status">
          ${currentPageSystems.map(system => `
            <div class="pda-system-status-item">
              <span class="pda-system-name">${system.name}:</span>
              <span class="pda-system-state ${system.status.toLowerCase()}">${system.status}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="pda-scanner-section">
        <div class="pda-section-title">Console Log</div>
        <div class="pda-console-display" id="pda-console-display">
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
    // Default systems for other locations
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
    <div class="pda-console-entry pda-console-${entry.type.toLowerCase()}">
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
    consoleEl.scrollTop = consoleEl.scrollHeight; // Auto-scroll to bottom
  }
}

// Placeholder functions for other pages
function renderShipStatusPage(contentEl) {
  contentEl.innerHTML = `
    <div class="pda-page">
      <div class="pda-page-header">Ship Status</div>
      <div class="pda-placeholder">Ship Status page - Coming Soon</div>
    </div>
  `;
}

function renderTasksPage(contentEl) {
  contentEl.innerHTML = `
    <div class="pda-page">
      <div class="pda-page-header">Tasks</div>
      <div class="pda-placeholder">Tasks page - Coming Soon</div>
    </div>
  `;
}

function renderContactsPage(contentEl) {
  contentEl.innerHTML = `
    <div class="pda-page">
      <div class="pda-page-header">Contacts</div>
      <div class="pda-placeholder">Contacts page - Coming Soon</div>
    </div>
  `;
}

function renderLogbookManagerPage(contentEl) {
  contentEl.innerHTML = `
    <div class="pda-page">
      <div class="pda-page-header">Logbook Manager</div>
      <div class="pda-placeholder">Logbook Manager page - Coming Soon</div>
    </div>
  `;
}

function renderSettingsPage(contentEl) {
  contentEl.innerHTML = `
    <div class="pda-page">
      <div class="pda-page-header">Settings</div>
      <div class="pda-placeholder">Settings page - Coming Soon</div>
    </div>
  `;
}

function navigatePDAMenu(direction) {
  if (currentPDAPage !== 'main') return;
  
  const menuItems = document.querySelectorAll('.pda-menu-item');
  if (menuItems.length === 0) return;
  
  // Remove current selection
  menuItems[selectedMenuItem].classList.remove('selected');
  
  // Update selection based on direction
  switch(direction) {
    case 'ArrowUp':
      selectedMenuItem = (selectedMenuItem - 1 + menuItems.length) % menuItems.length;
      break;
    case 'ArrowDown':
      selectedMenuItem = (selectedMenuItem + 1) % menuItems.length;
      break;
  }
  
  // Apply new selection
  menuItems[selectedMenuItem].classList.add('selected');
}

function activatePDASelection() {
  if (currentPDAPage === 'main') {
    const selectedItem = document.querySelector('.pda-menu-item.selected');
    if (selectedItem) {
      const page = selectedItem.getAttribute('data-page');
      if (page) {
        currentPDAPage = page;
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
