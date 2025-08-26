let pdaVisible = false;
let pdaElement = null;
let currentPDAPage = 'main';
let pdaData = {
  gameState: null,
  logbookStatus: 'Unknown',
  currentLocation: 'Unknown',
  systemStatus: {}
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
    communications: getSystemStatus('communications')
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
  return { status: 'Offline', power: 0, efficiency: 0 };
}

function renderCurrentPage() {
  const contentEl = document.getElementById('pda-content');
  if (!contentEl) return;
  
  switch(currentPDAPage) {
    case 'main':
      renderMainPage(contentEl);
      break;
    case 'status':
      renderStatusPage(contentEl);
      break;
    case 'navigation':
      renderNavigationPage(contentEl);
      break;
    case 'logbook':
      renderLogbookPage(contentEl);
      break;
    case 'systems':
      renderSystemsPage(contentEl);
      break;
    default:
      renderMainPage(contentEl);
  }
}

function renderMainPage(contentEl) {
  contentEl.innerHTML = `
    <div class="pda-menu">
      <div class="pda-menu-header">Main Menu</div>
      <div class="pda-menu-items">
        <div class="pda-menu-item selected" data-page="status">
          <span class="pda-menu-icon">📊</span>
          <span class="pda-menu-text">Status Report</span>
        </div>
        <div class="pda-menu-item" data-page="navigation">
          <span class="pda-menu-icon">🧭</span>
          <span class="pda-menu-text">Navigation</span>
        </div>
        <div class="pda-menu-item" data-page="logbook">
          <span class="pda-menu-icon">📖</span>
          <span class="pda-menu-text">Logbook Status</span>
        </div>
        <div class="pda-menu-item" data-page="systems">
          <span class="pda-menu-icon">⚙️</span>
          <span class="pda-menu-text">Ship Systems</span>
        </div>
      </div>
    </div>
  `;
}

function renderStatusPage(contentEl) {
  const coords = getCoordinateString();
  const depth = pdaData.gameState?.navigation?.depth || 0;
  const status = depth > 0 ? 'Submerged' : 'Surface';
  
  contentEl.innerHTML = `
    <div class="pda-page">
      <div class="pda-page-header">Status Report</div>
      <div class="pda-status-grid">
        <div class="pda-status-item">
          <div class="pda-status-label">Location:</div>
          <div class="pda-status-value">${pdaData.currentLocation}</div>
        </div>
        <div class="pda-status-item">
          <div class="pda-status-label">Coordinates:</div>
          <div class="pda-status-value">${coords}</div>
        </div>
        <div class="pda-status-item">
          <div class="pda-status-label">Depth:</div>
          <div class="pda-status-value">${depth}M</div>
        </div>
        <div class="pda-status-item">
          <div class="pda-status-label">Status:</div>
          <div class="pda-status-value">${status}</div>
        </div>
        <div class="pda-status-item">
          <div class="pda-status-label">Logbook:</div>
          <div class="pda-status-value">${pdaData.logbookStatus}</div>
        </div>
      </div>
    </div>
  `;
}

function renderNavigationPage(contentEl) {
  const nav = pdaData.gameState?.navigation || {};
  
  contentEl.innerHTML = `
    <div class="pda-page">
      <div class="pda-page-header">Navigation</div>
      <div class="pda-nav-display">
        <div class="pda-nav-item">
          <span class="pda-nav-label">Speed:</span>
          <span class="pda-nav-value">${nav.speed || 0} kts</span>
        </div>
        <div class="pda-nav-item">
          <span class="pda-nav-label">Heading:</span>
          <span class="pda-nav-value">${nav.heading || 0}°M</span>
        </div>
        <div class="pda-nav-item">
          <span class="pda-nav-label">Course:</span>
          <span class="pda-nav-value">${nav.course || 0}°M</span>
        </div>
        <div class="pda-nav-item">
          <span class="pda-nav-label">Depth:</span>
          <span class="pda-nav-value">${nav.depth || 0}M</span>
        </div>
      </div>
      ${renderQuickNav()}
    </div>
  `;
}

function renderQuickNav() {
  return `
    <div class="pda-quick-nav">
      <div class="pda-quick-nav-title">Quick Actions:</div>
      <div class="pda-quick-actions">
        <button class="pda-action-btn" onclick="navigateToPage('logbook')">Open Logbook</button>
        <button class="pda-action-btn" onclick="navigateToPage('quarters')">Captain's Quarters</button>
      </div>
    </div>
  `;
}

function renderLogbookPage(contentEl) {
  contentEl.innerHTML = `
    <div class="pda-page">
      <div class="pda-page-header">Logbook Status</div>
      <div class="pda-logbook-info">
        <div class="pda-info-item">
          <div class="pda-info-label">Current Logbook:</div>
          <div class="pda-info-value">${pdaData.logbookStatus}</div>
        </div>
        <div class="pda-logbook-actions">
          <button class="pda-action-btn" onclick="openLogbook()">Open Logbook Interface</button>
          <button class="pda-action-btn" onclick="returnToSplash()">Return to Main Menu</button>
        </div>
      </div>
    </div>
  `;
}

function renderSystemsPage(contentEl) {
  const systems = pdaData.systemStatus;
  
  contentEl.innerHTML = `
    <div class="pda-page">
      <div class="pda-page-header">Ship Systems</div>
      <div class="pda-systems-grid">
        ${Object.entries(systems).map(([name, system]) => `
          <div class="pda-system-item">
            <div class="pda-system-name">${name.replace('_', ' ').toUpperCase()}</div>
            <div class="pda-system-status ${system.status.toLowerCase()}">${system.status}</div>
            <div class="pda-system-details">
              Power: ${system.power}% | Efficiency: ${system.efficiency}%
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

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

let selectedMenuItem = 0;
function navigatePDAMenu(direction) {
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

export { updatePDAData, getCurrentLocation };