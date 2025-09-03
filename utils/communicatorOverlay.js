// utils/communicatorOverlay.js
// Ship communicator overlay system for crew communications
// FIXED: Dynamic contact loading - no caching of contact states

import gameStateInstance from '/game/state.js';

let communicatorVisible = false;
let communicatorElement = null;
let currentCommPage = 'crew-select';
let selectedCrewMember = null;
let selectedDialogueIndex = 0;
let selectedCrewIndex = 0;

export function initCommunicatorOverlay() {
  // Initialize keyboard controls
  document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'c') {
      e.preventDefault();
      if (hasCommunicator()) {
        toggleCommunicator();
      }
    }
    
    // Communicator navigation when visible
    if (communicatorVisible) {
      handleCommunicatorNavigation(e);
    }
  });
  
  console.log('Communicator initialized');
}

// FIXED: Always read crew data dynamically from current game state
function getCrewData() {
  try {
    const gameState = gameStateInstance?.getState();
    if (!gameState?.contacts?.crew) {
      console.warn('No crew data in game state');
      return [];
    }
    
    // Filter crew members who have communicators and are known - exclude the captain
    const crewData = Object.entries(gameState.contacts.crew)
      .filter(([key, member]) => member?.communicator && member?.known && key !== 'captain')
      .map(([key, member]) => ({ ...member, id: key }));
    
    return crewData;
  } catch (error) {
    console.error('Failed to load crew data from state:', error);
    return [];
  }
}

function hasCommunicator() {
  const gameState = gameStateInstance?.getState();
  const hasCommunicator = gameState?.contacts?.crew?.captain?.communicator;
  
  if (!hasCommunicator) {
    console.log("No communicator found in captain's contacts");
  }
  
  return hasCommunicator;
}

function toggleCommunicator() {
  if (!communicatorElement) createCommunicator();
  communicatorVisible = !communicatorVisible;
  communicatorElement.style.display = communicatorVisible ? 'block' : 'none';
  
  if (communicatorVisible) {
    // Reset to crew select when opening
    currentCommPage = 'crew-select';
    selectedCrewIndex = 0;
    selectedDialogueIndex = 0;
    renderCurrentCommPage();
  }
}

function createCommunicator() {
  communicatorElement = document.createElement('div');
  communicatorElement.id = 'communicator-overlay';
  communicatorElement.innerHTML = `
    <div class="comm-frame"></div>
    <div class="comm-glass">
      <div class="comm-header">
        <div class="comm-title">Ship Communications</div>
        <div class="comm-status" id="comm-status">ONLINE</div>
      </div>
      <div class="comm-content" id="comm-content">
        <!-- Content will be dynamically generated -->
      </div>
      <div class="comm-footer">
        <div class="comm-help">C: Close | ↑↓: Navigate | Enter: Select | Esc: Back</div>
      </div>
    </div>
  `;
  document.body.appendChild(communicatorElement);
  
  // Add click event listeners
  communicatorElement.addEventListener('click', handleCommunicatorClick);
}

function handleCommunicatorClick(e) {
  e.preventDefault();
  e.stopPropagation();
  
  // Handle crew member selection
  const crewButton = e.target.closest('.comm-crew-button');
  if (crewButton) {
    const crewId = crewButton.getAttribute('data-crew-id');
    if (crewId) {
      selectCrewMember(crewId);
    }
    return;
  }
  
  // Handle dialogue option selection
  const dialogueButton = e.target.closest('.comm-dialogue-button');
  if (dialogueButton) {
    const dialogueText = dialogueButton.getAttribute('data-dialogue');
    if (dialogueText) {
      sendMessage(dialogueText);
    }
    return;
  }
  
  // Handle back button
  const backButton = e.target.closest('.comm-back-button');
  if (backButton) {
    goBackToCrewSelect();
    return;
  }
}

function handleCommunicatorNavigation(e) {
  switch(e.key) {
    case 'ArrowUp':
    case 'ArrowDown':
      e.preventDefault();
      navigateCommMenu(e.key);
      break;
    case 'Enter':
      e.preventDefault();
      activateCommSelection();
      break;
    case 'Escape':
      e.preventDefault();
      if (currentCommPage !== 'crew-select') {
        goBackToCrewSelect();
      } else {
        toggleCommunicator();
      }
      break;
  }
}

function navigateCommMenu(direction) {
  if (currentCommPage === 'crew-select') {
    const crewData = getCrewData();
    const maxIndex = crewData.length - 1;
    
    if (direction === 'ArrowUp') {
      selectedCrewIndex = Math.max(0, selectedCrewIndex - 1);
    } else if (direction === 'ArrowDown') {
      selectedCrewIndex = Math.min(maxIndex, selectedCrewIndex + 1);
    }
    
    updateCrewSelection();
  } else if (currentCommPage === 'dialogue') {
    const dialogueOptions = getDialogueOptions();
    const maxIndex = dialogueOptions.length - 1;
    
    if (direction === 'ArrowUp') {
      selectedDialogueIndex = Math.max(0, selectedDialogueIndex - 1);
    } else if (direction === 'ArrowDown') {
      selectedDialogueIndex = Math.min(maxIndex, selectedDialogueIndex + 1);
    }
    
    updateDialogueSelection();
  }
}

function activateCommSelection() {
  if (currentCommPage === 'crew-select') {
    const crewData = getCrewData();
    if (crewData[selectedCrewIndex]) {
      selectCrewMember(crewData[selectedCrewIndex].id);
    }
  } else if (currentCommPage === 'dialogue') {
    const dialogueOptions = getDialogueOptions();
    if (dialogueOptions[selectedDialogueIndex]) {
      sendMessage(dialogueOptions[selectedDialogueIndex]);
    }
  }
}

function selectCrewMember(memberId) {
  const crewData = getCrewData();
  selectedCrewMember = crewData.find(member => member.id === memberId);
  
  if (selectedCrewMember) {
    currentCommPage = 'dialogue';
    selectedDialogueIndex = 0;
    renderCurrentCommPage();
  }
}

function getDialogueOptions() {
  if (!selectedCrewMember || !selectedCrewMember.dialogueOptions) {
    return ['Hello'];
  }
  
  const options = selectedCrewMember.dialogueOptions;
  let availableOptions = [];
  
  // Add different types of dialogue options
  if (options.commands && options.commands.length > 0) {
    availableOptions = availableOptions.concat(options.commands);
  }
  
  if (options.pleasantries && options.pleasantries.length > 0) {
    availableOptions = availableOptions.concat(options.pleasantries);
  }
  
  if (options.emergency && options.emergency.length > 0) {
    availableOptions = availableOptions.concat(options.emergency);
  }
  
  // Fallback to basic options if none available
  if (availableOptions.length === 0) {
    availableOptions = ['Hello', 'Status report', 'Thank you'];
  }
  
  return availableOptions;
}

function sendMessage(message) {
  console.log(`Message sent to ${selectedCrewMember?.name || 'Unknown'}: ${message}`);
  
  // Add message to communications log in game state
  try {
    const gameState = gameStateInstance?.getState();
    if (gameState?.shipSystems?.communications?.communicator) {
      const logEntry = {
        timestamp: new Date().toISOString(),
        from: 'Captain',
        to: selectedCrewMember?.name || selectedCrewMember?.id || 'Unknown',
        message: message,
        type: 'outgoing'
      };
      
      const currentLog = gameState.shipSystems.communications.communicator.log || [];
      currentLog.push(logEntry);
      
      gameStateInstance.updateProperty('shipSystems.communications.communicator.log', currentLog);
    }
  } catch (error) {
    console.error('Failed to log communication:', error);
  }
  
  // Generate response (simple for now)
  setTimeout(() => {
    generateResponse(message);
  }, 1000 + Math.random() * 2000);
  
  // Visual feedback
  showCommMessage(`Sent: "${message}"`);
}

function generateResponse(originalMessage) {
  if (!selectedCrewMember) return;
  
  let response = '';
  
  // Simple response generation based on crew member
  switch(selectedCrewMember.id) {
    case 'executiveOfficer':
      if (originalMessage.toLowerCase().includes('status')) {
        response = 'All systems nominal, Captain. Standing by.';
      } else if (originalMessage.toLowerCase().includes('hello')) {
        response = 'Good to hear from you, Captain. How may I assist?';
      } else {
        response = 'Acknowledged, Captain. Will comply.';
      }
      break;
      
    case 'science':
      if (originalMessage.toLowerCase().includes('status')) {
        response = 'Medical bay is secure. All crew members healthy.';
      } else {
        response = 'Yes Captain, science department reporting.';
      }
      break;
      
    case 'engineering':
      if (originalMessage.toLowerCase().includes('status')) {
        response = 'Engineering systems running smoothly, Captain.';
      } else {
        response = 'Engineering here. What do you need?';
      }
      break;
      
    default:
      response = 'Message received, Captain.';
  }
  
  // Log the response
  try {
    const gameState = gameStateInstance?.getState();
    if (gameState?.shipSystems?.communications?.communicator) {
      const logEntry = {
        timestamp: new Date().toISOString(),
        from: selectedCrewMember.name || selectedCrewMember.id,
        to: 'Captain',
        message: response,
        type: 'incoming'
      };
      
      const currentLog = gameState.shipSystems.communications.communicator.log || [];
      currentLog.push(logEntry);
      
      gameStateInstance.updateProperty('shipSystems.communications.communicator.log', currentLog);
    }
  } catch (error) {
    console.error('Failed to log response:', error);
  }
  
  showCommMessage(`${selectedCrewMember.name || selectedCrewMember.id}: "${response}"`);
}

function showCommMessage(message) {
  const messageEl = document.createElement('div');
  messageEl.className = 'comm-message';
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
    max-width: 80%;
    text-align: center;
    animation: commMessageFade 4s ease-out forwards;
  `;
  
  // Add animation styles if not already present
  if (!document.getElementById('comm-message-styles')) {
    const style = document.createElement('style');
    style.id = 'comm-message-styles';
    style.textContent = `
      @keyframes commMessageFade {
        0% { opacity: 1; transform: translateX(-50%) translateY(0); }
        75% { opacity: 1; transform: translateX(-50%) translateY(0); }
        100% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
      }
    `;
    document.head.appendChild(style);
  }
  
  communicatorElement.appendChild(messageEl);
  setTimeout(() => {
    if (messageEl.parentNode) {
      messageEl.remove();
    }
  }, 4000);
}

function goBackToCrewSelect() {
  currentCommPage = 'crew-select';
  selectedCrewMember = null;
  selectedCrewIndex = 0;
  selectedDialogueIndex = 0;
  renderCurrentCommPage();
}

function renderCurrentCommPage() {
  const contentEl = document.getElementById('comm-content');
  if (!contentEl) return;
  
  switch(currentCommPage) {
    case 'crew-select':
      renderCrewSelectPage(contentEl);
      break;
    case 'dialogue':
      renderDialoguePage(contentEl);
      break;
    default:
      renderCrewSelectPage(contentEl);
  }
}

function renderCrewSelectPage(contentEl) {
  const crewData = getCrewData();
  
  if (crewData.length === 0) {
    contentEl.innerHTML = `
      <div class="comm-page">
        <div class="comm-page-header">No Crew Available</div>
        <div class="comm-no-crew">
          No crew members with communicators are currently known to you.
        </div>
      </div>
    `;
    return;
  }
  
  contentEl.innerHTML = `
    <div class="comm-page">
      <div class="comm-page-header">Select Crew Member</div>
      <div class="comm-crew-list">
        ${crewData.map((member, index) => `
            <button class="btn btn-selectable comm-crew-button ${index === selectedCrewIndex ? 'selected' : ''}" ...>
                  data-crew-id="${member.id}">
            <div class="comm-crew-info">
              <div class="comm-crew-name">${member.name || member.id}</div>
              <div class="comm-crew-role">${member.role || 'Crew Member'}</div>
            </div>
          </button>
        `).join('')}
      </div>
      <div class="comm-instructions">
        Select a crew member to communicate with
      </div>
    </div>
  `;
}

function renderDialoguePage(contentEl) {
  if (!selectedCrewMember) {
    goBackToCrewSelect();
    return;
  }
  
  const dialogueOptions = getDialogueOptions();
  
  contentEl.innerHTML = `
    <div class="comm-page">
      <div class="comm-page-header">
        <div class="comm-contact-info">
          <div class="comm-contact-name">${selectedCrewMember.name || selectedCrewMember.id}</div>
          <div class="comm-contact-role">${selectedCrewMember.role || 'Crew Member'}</div>
        </div>
      </div>
      <div class="comm-dialogue-list">
        ${dialogueOptions.map((option, index) => `
          <button class="btn btn-selectable comm-dialogue-button ${index === selectedDialogueIndex ? 'selected' : ''}" ...>
                  data-dialogue="${option}">
            ${option}
          </button>
        `).join('')}
      </div>
      <div class="comm-controls">
        <button class="btn btn-caution comm-back-button">← Back to Crew List</button>
      </div>
    </div>
  `;
}

function updateCrewSelection() {
  const buttons = document.querySelectorAll('.comm-crew-button');
  buttons.forEach((button, index) => {
    button.classList.toggle('selected', index === selectedCrewIndex);
  });
}

function updateDialogueSelection() {
  const buttons = document.querySelectorAll('.comm-dialogue-button');
  buttons.forEach((button, index) => {
    button.classList.toggle('selected', index === selectedDialogueIndex);
  });
}

// Export functions that might be needed elsewhere
export { hasCommunicator, toggleCommunicator };