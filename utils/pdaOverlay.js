import gameStateInstance from '/game/state.js';
import saveManager from '/game/saveManager.js';

// =============================================================================
// CORE STATE AND CONFIGURATION
// =============================================================================

let pdaVisible = false;
let pdaElement = null;
let currentPage = 'main';
let selectedMenuItem = 0;
let logbookBrowserIndex = 0;
let selectedContact = null;

// =============================================================================
// INITIALIZATION AND MAIN CONTROL
// =============================================================================

export function initPDAOverlay() {
  document.addEventListener('keydown', handleGlobalKeydown);
}

function handleGlobalKeydown(e) {
  if (e.key === 'Tab') {
    e.preventDefault();
    togglePDA();
  }
  
  if (pdaVisible) {
    handlePDAKeydown(e);
  }
}

function togglePDA() {
  if (!pdaElement) createPDA();
  
  pdaVisible = !pdaVisible;
  pdaElement.style.display = pdaVisible ? 'block' : 'none';
  
  if (pdaVisible) {
    renderCurrentPage();
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
        <div class="pda-status">ONLINE</div>
      </div>
      <div class="pda-content" id="pda-content"></div>
      <div class="pda-footer">
        <div class="pda-help">Tab: Close | ←→↑↓: Navigate | Enter: Select | Esc: Back</div>
      </div>
    </div>
  `;
  
  document.body.appendChild(pdaElement);
  pdaElement.addEventListener('click', handlePDAClick);
  
  // Hidden file input for logbook import
  const importInput = document.createElement('input');
  importInput.type = 'file';
  importInput.id = 'pda-logbook-import';
  importInput.accept = '.json';
  importInput.style.display = 'none';
  importInput.addEventListener('change', handleLogbookImport);
  pdaElement.appendChild(importInput);
}

// =============================================================================
// EVENT HANDLING
// =============================================================================

function handlePDAKeydown(e) {
  switch(e.key) {
    case 'ArrowUp':
    case 'ArrowDown':
      e.preventDefault();
      navigateMenu(e.key);
      break;
    case 'Enter':
      e.preventDefault();
      selectMenuItem();
      break;
    case 'Escape':
      e.preventDefault();
      goBack();
      break;
  }
}

function handlePDAClick(e) {
  e.preventDefault();
  e.stopPropagation();

  // Menu navigation
  const menuButton = e.target.closest('.pda-menu-button');
  if (menuButton) {
    const page = menuButton.getAttribute('data-page');
    navigateToPage(page);
    return;
  }

  // Action buttons
  const actionBtn = e.target.closest('.pda-action-btn');
  if (actionBtn) {
    const action = actionBtn.getAttribute('data-action');
    handleAction(action);
    return;
  }

  // Contact cards
  const contactCard = e.target.closest('.pda-contact-card');
  if (contactCard) {
    const contactId = contactCard.getAttribute('data-contact-id');
    showContactDetail(contactId);
    return;
  }

  // Back buttons
  const backBtn = e.target.closest('.pda-back-btn');
  if (backBtn) {
    goBack();
    return;
  }
}

function navigateMenu(direction) {
  if (currentPage !== 'main') return;
  
  const menuButtons = document.querySelectorAll('.pda-menu-button');
  if (menuButtons.length === 0) return;
  
  menuButtons[selectedMenuItem]?.classList.remove('selected');
  
  if (direction === 'ArrowUp') {
    selectedMenuItem = (selectedMenuItem - 1 + menuButtons.length) % menuButtons.length;
  } else {
    selectedMenuItem = (selectedMenuItem + 1) % menuButtons.length;
  }
  
  menuButtons[selectedMenuItem]?.classList.add('selected');
}

function selectMenuItem() {
  if (currentPage === 'main') {
    const selectedButton = document.querySelector('.pda-menu-button.selected');
    if (selectedButton) {
      const page = selectedButton.getAttribute('data-page');
      navigateToPage(page);
    }
  }
}

function navigateToPage(page) {
  currentPage = page;
  selectedMenuItem = 0;
  selectedContact = null;
  renderCurrentPage();
}

function goBack() {
  if (currentPage === 'contact-detail') {
    currentPage = 'contacts';
    selectedContact = null;
  } else if (currentPage !== 'main') {
    currentPage = 'main';
    selectedMenuItem = 0;
  } else {
    togglePDA();
  }
  renderCurrentPage();
}

function showContactDetail(contactId) {
  const contact = findContact(contactId);
  if (contact) {
    selectedContact = contact;
    currentPage = 'contact-detail';
    renderCurrentPage();
  }
}

// =============================================================================
// ACTION HANDLERS
// =============================================================================

function handleAction(action) {
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
      renderCurrentPage(); // Just re-render to show new data
      break;
    case 'logbook-prev':
      logbookBrowserIndex = Math.max(0, logbookBrowserIndex - 1);
      renderCurrentPage();
      break;
    case 'logbook-next':
      const bookshelf = getBookshelf();
      logbookBrowserIndex = Math.min(bookshelf.length - 1, logbookBrowserIndex + 1);
      renderCurrentPage();
      break;
    case 'logbook-load':
      loadLogbook();
      break;
    case 'logbook-export':
      exportLogbook();
      break;
    case 'logbook-import':
      document.getElementById('pda-logbook-import').click();
      break;
  }
}

function loadLogbook() {
  if (!saveManager) return showMessage('SaveManager not available');
  
  const bookshelf = getBookshelf();
  const selectedLogbook = bookshelf[logbookBrowserIndex];
  
  if (!selectedLogbook) return showMessage('No logbook selected');
  if (selectedLogbook.mounted) return showMessage('Logbook already loaded');

  const confirmLoad = confirm(`Load "${selectedLogbook.name}"? This will replace your current session.`);
  
  if (confirmLoad) {
    try {
      const success = saveManager.mountLogbook(logbookBrowserIndex);
      if (success) {
        showMessage('Logbook loaded successfully');
        setTimeout(() => window.location.reload(), 1500);
      } else {
        showMessage('Failed to load logbook');
      }
    } catch (error) {
      console.error('Failed to load logbook:', error);
      showMessage('Failed to load logbook');
    }
  }
}

function exportLogbook() {
  if (!saveManager) return showMessage('SaveManager not available');
  
  try {
    const success = saveManager.exportLogbook();
    showMessage(success ? 'Logbook exported successfully' : 'Failed to export logbook');
  } catch (error) {
    console.error('Export error:', error);
    showMessage('Failed to export logbook');
  }
}

async function handleLogbookImport(event) {
  const file = event.target.files[0];
  if (!file || !saveManager) return;

  try {
    const logbook = await saveManager.importLogbook(file);
    if (logbook) {
      showMessage('Logbook imported successfully');
      const bookshelf = getBookshelf();
      logbookBrowserIndex = bookshelf.length - 1;
      renderCurrentPage();
    } else {
      showMessage('Failed to import logbook');
    }
  } catch (error) {
    console.error('Import error:', error);
    showMessage('Failed to import logbook file');
  }
  
  event.target.value = '';
}

// =============================================================================
// DATA GETTERS (READ-ONLY)
// =============================================================================

function getGameState() {
  return gameStateInstance?.getState?.() || {};
}

function getLocation() {
  const state = getGameState();
  return state.navigation?.location?.properties?.name || getCurrentPageFromURL();
}

function getCurrentPageFromURL() {
  if (window.location.pathname.includes('index.html') || window.location.pathname === '/') {
    return 'Splash Screen';
  }
  
  const pathParts = window.location.pathname.split('/');
  const lastPart = pathParts[pathParts.length - 1].replace('.html', '');
  return lastPart.charAt(0).toUpperCase() + lastPart.slice(1).replace('-', ' ');
}

function getSystemStatus() {
  const state = getGameState();
  return state.shipSystems || {};
}

function getContacts() {
  const state = getGameState();
  const crew = Object.values(state.contacts?.crew || {});
  const external = Object.values(state.contacts?.external || {});
  return { crew, external };
}

function findContact(contactId) {
  const state = getGameState();
  const contacts = state.contacts || {};
  
  // Search in crew
  if (contacts.crew && contacts.crew[contactId]) {
    return contacts.crew[contactId];
  }
  
  // Search in external
  if (contacts.external && contacts.external[contactId]) {
    return contacts.external[contactId];
  }
  
  // Fallback search by ID
  const allContacts = [
    ...Object.values(contacts.crew || {}),
    ...Object.values(contacts.external || {})
  ];
  
  return allContacts.find(c => String(c.id) === String(contactId));
}

function getBookshelf() {
  return saveManager?.getBookshelf?.() || [];
}

function getActiveLogbook() {
  return saveManager?.getActiveLogbook?.() || null;
}

function getAmbientData() {
  // Generate mock ambient data (or get from state if available)
  return {
    temperature: 20 + Math.random() * 4,
    pressure: 1010 + Math.random() * 10,
    humidity: 40 + Math.random() * 20,
    oxygen: 20.5 + Math.random() * 1,
    nitrogen: 77.5 + Math.random() * 1,
    carbonDioxide: 0.03 + Math.random() * 0.02
  };
}

// =============================================================================
// PAGE RENDERING
// =============================================================================

function renderCurrentPage() {
  const contentEl = document.getElementById('pda-content');
  if (!contentEl) return;
  
  switch(currentPage) {
    case 'main':
      renderMainPage(contentEl);
      break;
    case 'ship-status':
      renderShipStatusPage(contentEl);
      break;
    case 'contacts':
      renderContactsPage(contentEl);
      break;
    case 'contact-detail':
      renderContactDetailPage(contentEl);
      break;
    case 'scanner':
      renderScannerPage(contentEl);
      break;
    case 'logbook-manager':
      renderLogbookManagerPage(contentEl);
      break;
    default:
      renderPlaceholderPage(contentEl, currentPage);
  }
}

function renderMainPage(contentEl) {
  const menuItems = [
    { id: 'ship-status', text: 'Ship Status' },
    { id: 'contacts', text: 'Contacts' },
    { id: 'scanner', text: 'Scanner' },
    { id: 'logbook-manager', text: 'Logbook Manager' }
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

function renderShipStatusPage(contentEl) {
  const systems = getSystemStatus();
  const location = getLocation();
  
  contentEl.innerHTML = `
    <div class="pda-page">
      <div class="pda-page-header">Ship Status</div>
      <div class="pda-status-section">
        <div class="pda-section-title">Location</div>
        <div class="pda-status-item">${location}</div>
        
        <div class="pda-section-title">Hull Systems</div>
        <div class="pda-status-item">Integrity: ${systems.hull?.integrity || 0}%</div>
        <div class="pda-status-item">Docking Bay: ${systems.hull?.dockingBay || 'Unknown'}</div>
        
        <div class="pda-section-title">Life Support</div>
        <div class="pda-status-item">Oxygen: ${systems.lifeSupport?.oxygenTankQuantity || 0}%</div>
        <div class="pda-status-item">Temperature: ${systems.lifeSupport?.airTemperature || 0}°C</div>
        
        <div class="pda-section-title">Power</div>
        <div class="pda-status-item">Left Reactor: ${systems.power?.leftReactorHealth || 0}%</div>
        <div class="pda-status-item">Right Reactor: ${systems.power?.rightReactorHealth || 0}%</div>
      </div>
      <button class="pda-back-btn">← Back to Main Menu</button>
    </div>
  `;
}

function renderContactsPage(contentEl) {
  const { crew, external } = getContacts();
  
  contentEl.innerHTML = `
    <div class="pda-page">
      <div class="pda-page-header">Contacts</div>
      <div class="pda-contacts-content">
        ${renderContactsList('Crew', crew)}
        ${renderContactsList('External Contacts', external)}
      </div>
      <button class="pda-back-btn">← Back to Main Menu</button>
    </div>
  `;
}

function renderContactsList(title, contacts) {
  if (!contacts || contacts.length === 0) {
    return `<div class="pda-section-title">${title}</div><div class="pda-placeholder">No ${title.toLowerCase()} found.</div>`;
  }

  return `
    <div class="pda-section-title">${title}</div>
    <div class="pda-contacts-list">
      ${contacts.map(contact => renderContactCard(contact)).join('')}
    </div>
  `;
}

function renderContactCard(contact) {
  const name = contact.name || 'Unknown';
  const role = contact.role || contact.title || 'Contact';
  const id = contact.id || '';
  
  let avatar = '';
  if (contact.avatarUrl) {
    avatar = `<img src="${contact.avatarUrl}" class="pda-contact-avatar" alt="${name}">`;
  } else {
    const initials = name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
    avatar = `<div class="pda-contact-avatar pda-contact-initials">${initials}</div>`;
  }
  
  return `
    <div class="pda-contact-card" data-contact-id="${id}">
      ${avatar}
      <div class="pda-contact-info">
        <div class="pda-contact-name">${name}</div>
        <div class="pda-contact-role">${role}</div>
      </div>
    </div>
  `;
}

function renderContactDetailPage(contentEl) {
  if (!selectedContact) {
    contentEl.innerHTML = `
      <div class="pda-page">
        <div class="pda-page-header">Contact Detail</div>
        <div class="pda-error">No contact selected.</div>
        <button class="pda-back-btn">← Back to Contacts</button>
      </div>
    `;
    return;
  }
  
  const contact = selectedContact;
  const name = contact.name || 'Unknown';
  const role = contact.role || contact.title || 'Contact';
  const bio = contact.bio || contact.notes || 'No biographical information available.';
  
  let avatar = '';
  if (contact.avatarUrl) {
    avatar = `<img src="${contact.avatarUrl}" class="pda-contact-detail-avatar" alt="${name}">`;
  } else {
    const initials = name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
    avatar = `<div class="pda-contact-detail-avatar pda-contact-initials">${initials}</div>`;
  }
  
  contentEl.innerHTML = `
    <div class="pda-page">
      <div class="pda-page-header">Contact Detail</div>
      <div class="pda-contact-detail">
        ${avatar}
        <div class="pda-contact-detail-info">
          <div class="pda-contact-detail-name">${name}</div>
          <div class="pda-contact-detail-role">${role}</div>
          <div class="pda-contact-detail-bio">${bio}</div>
        </div>
      </div>
      <button class="pda-back-btn">← Back to Contacts</button>
    </div>
  `;
}

function renderScannerPage(contentEl) {
  const ambient = getAmbientData();
  
  contentEl.innerHTML = `
    <div class="pda-page">
      <div class="pda-page-header">Environmental Scanner</div>
      <div class="pda-scanner-section">
        <div class="pda-section-title">Ambient Conditions</div>
        <div class="pda-ambient-grid">
          <div class="pda-ambient-item">
            <span>Temperature:</span>
            <span>${ambient.temperature.toFixed(1)}°C</span>
          </div>
          <div class="pda-ambient-item">
            <span>Pressure:</span>
            <span>${ambient.pressure.toFixed(2)} hPa</span>
          </div>
          <div class="pda-ambient-item">
            <span>Humidity:</span>
            <span>${ambient.humidity.toFixed(1)}%</span>
          </div>
          <div class="pda-ambient-item">
            <span>Oxygen:</span>
            <span>${ambient.oxygen.toFixed(2)}%</span>
          </div>
          <div class="pda-ambient-item">
            <span>Nitrogen:</span>
            <span>${ambient.nitrogen.toFixed(2)}%</span>
          </div>
          <div class="pda-ambient-item">
            <span>CO₂:</span>
            <span>${ambient.carbonDioxide.toFixed(3)}%</span>
          </div>
        </div>
        <button class="pda-action-btn" data-action="refresh-scanner">Refresh Readings</button>
      </div>
      <button class="pda-back-btn">← Back to Main Menu</button>
    </div>
  `;
}

function renderLogbookManagerPage(contentEl) {
  const bookshelf = getBookshelf();
  const activeLogbook = getActiveLogbook();
  
  if (bookshelf.length === 0) {
    contentEl.innerHTML = `
      <div class="pda-page">
        <div class="pda-page-header">Logbook Manager</div>
        <div class="pda-placeholder">No logbooks available</div>
        <div class="pda-logbook-actions">
          <button class="pda-action-btn" data-action="logbook-import">Import Logbook</button>
        </div>
        <button class="pda-back-btn">← Back to Main Menu</button>
      </div>
    `;
    return;
  }
  
  const currentLogbook = bookshelf[logbookBrowserIndex];
  const isActive = currentLogbook?.mounted || false;
  const entryCount = currentLogbook?.entries?.length || 0;
  const lastPlayed = currentLogbook?.lastModified ? 
    new Date(currentLogbook.lastModified).toLocaleString() : 'Never';
    
  contentEl.innerHTML = `
    <div class="pda-page">
      <div class="pda-page-header">Logbook Manager</div>
      <div class="pda-logbook-browser">
        <div class="pda-logbook-display">
          <div class="pda-logbook-info">
            <div><strong>Campaign:</strong> ${currentLogbook?.name || 'Untitled'}</div>
            <div><strong>Description:</strong> ${currentLogbook?.description || `Mission log with ${entryCount} entries`}</div>
            <div><strong>Last Played:</strong> ${lastPlayed}</div>
            <div><strong>Status:</strong> <span class="${isActive ? 'pda-status-online' : 'pda-status-offline'}">${isActive ? 'ACTIVE' : 'INACTIVE'}</span></div>
            <div><strong>Entries:</strong> ${entryCount}</div>
            <div><strong>Position:</strong> ${logbookBrowserIndex + 1} of ${bookshelf.length}</div>
          </div>
        </div>
        
        <div class="pda-logbook-controls">
          <button class="pda-action-btn" data-action="logbook-prev">◀ Previous</button>
          <button class="pda-action-btn ${isActive ? 'disabled' : ''}" data-action="logbook-load">${isActive ? 'LOADED' : 'Load Campaign'}</button>
          <button class="pda-action-btn" data-action="logbook-next">Next ▶</button>
        </div>
        
        <div class="pda-logbook-actions">
          <button class="pda-action-btn" data-action="logbook-export">Export Logbook</button>
          <button class="pda-action-btn" data-action="logbook-import">Import Logbook</button>
        </div>
      </div>
      <button class="pda-back-btn">← Back to Main Menu</button>
    </div>
  `;
}

function renderPlaceholderPage(contentEl, pageName) {
  const title = pageName.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase());
  
  contentEl.innerHTML = `
    <div class="pda-page">
      <div class="pda-page-header">${title}</div>
      <div class="pda-placeholder">This page is under development.</div>
      <button class="pda-back-btn">← Back to Main Menu</button>
    </div>
  `;
}

// =============================================================================
// UI UTILITIES
// =============================================================================

function showMessage(message) {
  console.log('PDA Message:', message);
  
  // Create temporary message element
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
  
  // Add animation styles if not already present
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
  setTimeout(() => messageEl.remove(), 3000);
}

// =============================================================================
// EXPORTS
// =============================================================================

export { getLocation };