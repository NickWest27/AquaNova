// utils/communicatorOverlay.js
// Ship communicator overlay system for crew communications
// Updated with hierarchical dialogue menu system

import gameStateInstance from '/game/state.js';
import missionManager from '/game/systems/missionManager.js';

let communicatorVisible = false;
let communicatorElement = null;
let currentCommPage = 'crew-select';
let selectedCrewMember = null;
let selectedDialogueIndex = 0;
let selectedCrewIndex = 0;
let currentDialogueCategory = null; // Track which submenu we're in
let conversationHistory = new Map();

export function initCommunicatorOverlay() {
  document.addEventListener('keydown', (e) => {
    const active = document.activeElement;
    if (active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) {
      return;
    }

    if (e.key.toLowerCase() === 'c') {
      e.preventDefault();
      if (hasCommunicator()) {
        toggleCommunicator();
      }
    }

    if (communicatorVisible) {
      handleCommunicatorNavigation(e);
    }
  });
  
  console.log('Communicator initialized');
}

function getCrewData() {
  try {
    const gameState = gameStateInstance?.getState();
    if (!gameState?.contacts?.crew) {
      console.warn('No crew data in game state');
      return [];
    }
    
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
  return gameState?.contacts?.crew?.captain?.communicator || false;
}

function toggleCommunicator() {
  if (!communicatorElement) createCommunicator();
  communicatorVisible = !communicatorVisible;
  communicatorElement.style.display = communicatorVisible ? 'block' : 'none';
  
  if (communicatorVisible) {
    currentCommPage = 'crew-select';
    selectedCrewIndex = 0;
    selectedDialogueIndex = 0;
    currentDialogueCategory = null;
    renderCurrentCommPage();
  }
}

function createCommunicator() {
  communicatorElement = document.createElement('div');
  communicatorElement.id = 'communicator-overlay';
  communicatorElement.innerHTML = `
    <div class="comm-frame"></div>
    <div class="comm-glass">
      <div class="comm-content" id="comm-content">
        <!-- Content will be dynamically generated -->
      </div>
    </div>
  `;
  document.body.appendChild(communicatorElement);
  
  communicatorElement.addEventListener('click', handleCommunicatorClick);
}

function handleCommunicatorClick(e) {
  e.preventDefault();
  e.stopPropagation();
  
  // Handle crew member selection
  const crewText = e.target.closest('.comm-crew-text');
  if (crewText) {
    const crewId = crewText.getAttribute('data-crew-id');
    if (crewId) {
      selectCrewMember(crewId);
    }
    return;
  }
  
  // Handle category selection
  const categoryText = e.target.closest('.comm-category-text');
  if (categoryText) {
    const category = categoryText.getAttribute('data-category');
    if (category) {
      selectDialogueCategory(category);
    }
    return;
  }
  
  // Handle dialogue option selection
  const dialogueText = e.target.closest('.comm-dialogue-text');
  if (dialogueText) {
    const dialogueMessage = dialogueText.getAttribute('data-dialogue');
    if (dialogueMessage) {
      sendThought(dialogueMessage);
    }
    return;
  }
  
  // Handle back text
  const backText = e.target.closest('.comm-back-text');
  if (backText) {
    goBack();
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
      goBack();
      break;
  }
}

function navigateCommMenu(direction) {
  let maxIndex = 0;
  
  if (currentCommPage === 'crew-select') {
    const crewData = getCrewData();
    maxIndex = crewData.length - 1;
    
    if (direction === 'ArrowUp') {
      selectedCrewIndex = Math.max(0, selectedCrewIndex - 1);
    } else if (direction === 'ArrowDown') {
      selectedCrewIndex = Math.min(maxIndex, selectedCrewIndex + 1);
    }
    updateCrewSelection();
    
  } else if (currentCommPage === 'dialogue-categories') {
    const categories = getDialogueCategories();
    maxIndex = categories.length - 1;
    
    if (direction === 'ArrowUp') {
      selectedDialogueIndex = Math.max(0, selectedDialogueIndex - 1);
    } else if (direction === 'ArrowDown') {
      selectedDialogueIndex = Math.min(maxIndex, selectedDialogueIndex + 1);
    }
    updateCategorySelection();
    
  } else if (currentCommPage === 'dialogue-options') {
    const options = getDialogueOptionsForCategory(currentDialogueCategory);
    maxIndex = options.length - 1;
    
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
  } else if (currentCommPage === 'dialogue-categories') {
    const categories = getDialogueCategories();
    if (categories[selectedDialogueIndex]) {
      selectDialogueCategory(categories[selectedDialogueIndex].id);
    }
  } else if (currentCommPage === 'dialogue-options') {
    const options = getDialogueOptionsForCategory(currentDialogueCategory);
    if (options[selectedDialogueIndex]) {
      sendThought(options[selectedDialogueIndex]);
    }
  }
}

function selectCrewMember(memberId) {
  const crewData = getCrewData();
  selectedCrewMember = crewData.find(member => member.id === memberId);
  
  if (selectedCrewMember) {
    currentCommPage = 'dialogue-categories';
    selectedDialogueIndex = 0;
    currentDialogueCategory = null;
    renderCurrentCommPage();
  }
}

function selectDialogueCategory(category) {
  currentDialogueCategory = category;
  currentCommPage = 'dialogue-options';
  selectedDialogueIndex = 0;
  renderCurrentCommPage();
}

function getDialogueCategories() {
  if (!selectedCrewMember) return [];
  
  const categories = [];
  
  // Always include pleasantries
  categories.push({ id: 'pleasantries', name: 'Casual Chat' });
  
  // Add contextual if available
  const contextual = selectedCrewMember.contextual || [];
  if (contextual.length > 0) {
    categories.push({ id: 'contextual', name: 'Follow Up' });
  }
  
  // Add commands if available
  const commands = selectedCrewMember.dialogueOptions?.commands || [];
  if (commands.length > 0) {
    categories.push({ id: 'commands', name: 'Orders' });
  }
  
  // Add emergency if available
  const emergency = selectedCrewMember.dialogueOptions?.emergency || [];
  if (emergency.length > 0) {
    categories.push({ id: 'emergency', name: 'Emergency' });
  }
  
  return categories;
}

function getDialogueOptionsForCategory(category) {
  if (!selectedCrewMember || !category) return [];
  
  const history = conversationHistory.get(selectedCrewMember.id) || [];
  
  switch(category) {
    case 'pleasantries':
      return selectedCrewMember.dialogueOptions?.pleasantries || generatePersonalizedPleasantries(history);
      
    case 'contextual':
      return selectedCrewMember.contextual || [];
      
    case 'commands':
      return selectedCrewMember.dialogueOptions?.commands || [];
      
    case 'emergency':
      return selectedCrewMember.dialogueOptions?.emergency || [];
      
    default:
      return [];
  }
}

function generatePersonalizedPleasantries(history) {
  // Fallback if no pleasantries defined in contacts.json
  if (history.length === 0) {
    return ["Hello there", "Good to finally connect", "How are you settling in?"];
  } else {
    return ["How are you doing?", "What's on your mind?", "Just checking in...", "How's everything going?"];
  }
}

function goBack() {
  if (currentCommPage === 'dialogue-options') {
    // Go back to categories
    currentCommPage = 'dialogue-categories';
    currentDialogueCategory = null;
    selectedDialogueIndex = 0;
    renderCurrentCommPage();
  } else if (currentCommPage === 'dialogue-categories') {
    // Go back to crew select
    goBackToCrewSelect();
  } else if (currentCommPage === 'crew-select') {
    // Close communicator
    toggleCommunicator();
  }
}

function sendThought(message) {
  console.log(`Message sent to ${selectedCrewMember?.name || 'Unknown'}: ${message}`);
  
  // Add to conversation history
  const history = conversationHistory.get(selectedCrewMember.id) || [];
  history.push({
    timestamp: new Date().toISOString(),
    from: 'Captain',
    message: message,
    type: 'outgoing'
  });
  conversationHistory.set(selectedCrewMember.id, history);
  
  // Log in game state
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
  
  // Check for mission triggers
  if (selectedCrewMember.id === 'executiveOfficer') {
    const previousMessages = history.filter(msg => msg.type === 'outgoing').length;
    
    if (previousMessages === 1) {
      const event = new CustomEvent('dialogue-complete', {
        detail: { 
          characterId: 'executiveOfficer',
          dialogueId: 'first_contact'
        }
      });
      document.dispatchEvent(event);
      console.log('First contact with AREA completed - mission event fired');
    }
  }
  
  // Generate response
  const delay = Math.random() < 0.3 ? 800 : 2000 + Math.random() * 3000;
  setTimeout(() => {
    generatePersonalizedResponse(message);
  }, delay);
  
  showThought(`You reach out: "${message}"`);
}

function generatePersonalizedResponse(originalMessage) {
  if (!selectedCrewMember) return;
  
  const history = conversationHistory.get(selectedCrewMember.id) || [];
  const messageCount = history.filter(msg => msg.type === 'outgoing').length;
  
  let response = '';

  // Use role-specific responses
  const responses = {
    executiveOfficer: {
      greetings: ["Good to connect with you, Captain.", "Always here when you need me.", "Captain, I've been waiting for your contact."],
      status: ["Everything's running smoothly up here.", "The crew's doing well.", "All systems nominal."],
      commands: ["Understood, Captain.", "Right away, sir.", "Consider it done."],
      casual: ["Of course, Captain.", "I'll take care of it.", "Understood."]
    },
    science: {
      greetings: ["Captain! How are you feeling?", "Hope you're taking care of yourself.", "Good to hear from you."],
      status: ["Everyone's healthy and accounted for.", "Medical bay is peaceful today.", "No concerns from my end."],
      commands: ["I'll get right on it.", "Medical protocols engaged.", "Understood, Captain."],
      casual: ["Interesting question...", "I've been thinking about that too.", "Let me know if you need anything."]
    }
    // Add other crew members as needed
  };
  
  const memberResponses = responses[selectedCrewMember.id] || {
    greetings: ["Good to hear from you.", "How can I help?"],
    status: ["All good here.", "Everything's running smoothly."],
    commands: ["Roger that.", "Will do.", "Understood."],
    casual: ["Sure thing.", "No problem.", "Got it."]
  };
  
  // Choose response based on message and context
  const msg = originalMessage.toLowerCase();
  
  if (msg.includes('hello') || msg.includes('connect') || messageCount === 1) {
    response = memberResponses.greetings[Math.floor(Math.random() * memberResponses.greetings.length)];
  } else if (msg.includes('status') || msg.includes('how are')) {
    response = memberResponses.status[Math.floor(Math.random() * memberResponses.status.length)];
  } else if (currentDialogueCategory === 'commands') {
    response = memberResponses.commands[Math.floor(Math.random() * memberResponses.commands.length)];
  } else {
    response = memberResponses.casual[Math.floor(Math.random() * memberResponses.casual.length)];
  }
  
  // Add to conversation history
  const updatedHistory = conversationHistory.get(selectedCrewMember.id) || [];
  updatedHistory.push({
    timestamp: new Date().toISOString(),
    from: selectedCrewMember.name || selectedCrewMember.id,
    message: response,
    type: 'incoming'
  });
  conversationHistory.set(selectedCrewMember.id, updatedHistory);
  
  // Log response in game state
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
  
  showThought(`${selectedCrewMember.name} responds: "${response}"`);
}

function showThought(message, duration = 5000) {
  const thoughtEl = document.createElement('div');
  thoughtEl.className = 'comm-thought';
  thoughtEl.textContent = message;
  thoughtEl.style.cssText = `
    position: absolute;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: radial-gradient(ellipse at center, rgba(255, 255, 255, 0.15) 30%, transparent 70%);
    color: rgba(255, 255, 255, 0.95);
    padding: 12px 24px;
    border-radius: 20px;
    font-size: 0.9rem;
    z-index: 1001;
    max-width: 70%;
    text-align: center;
    backdrop-filter: blur(4px);
    font-style: italic;
    animation: thoughtBubble 0.5s ease-out;
  `;
  
  if (!document.getElementById('thought-styles')) {
    const style = document.createElement('style');
    style.id = 'thought-styles';
    style.textContent = `
      @keyframes thoughtBubble {
        0% { opacity: 0; transform: translateX(-50%) scale(0.9); }
        100% { opacity: 1; transform: translateX(-50%) scale(1); }
      }
      .comm-thought {
        animation: thoughtBubble 0.5s ease-out, thoughtFade 5s ease-out forwards;
      }
      @keyframes thoughtFade {
        0%, 70% { opacity: 1; }
        100% { opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }
  
  communicatorElement.appendChild(thoughtEl);
  setTimeout(() => {
    if (thoughtEl.parentNode) {
      thoughtEl.remove();
    }
  }, duration);
}

function goBackToCrewSelect() {
  currentCommPage = 'crew-select';
  selectedCrewMember = null;
  selectedCrewIndex = 0;
  selectedDialogueIndex = 0;
  currentDialogueCategory = null;
  renderCurrentCommPage();
}

function renderCurrentCommPage() {
  const contentEl = document.getElementById('comm-content');
  if (!contentEl) return;
  
  switch(currentCommPage) {
    case 'crew-select':
      renderCrewSelectPage(contentEl);
      break;
    case 'dialogue-categories':
      renderCategoriesPage(contentEl);
      break;
    case 'dialogue-options':
      renderDialogueOptionsPage(contentEl);
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
        <div class="comm-no-crew">
          No one else seems to be available right now...
        </div>
      </div>
    `;
    return;
  }
  
  contentEl.innerHTML = `
    <div class="comm-page">
      <div class="comm-page-header">Who would you like to reach out to?</div>
      <div class="comm-crew-list">
        ${crewData.map((member, index) => `
          <div class="comm-crew-text ${index === selectedCrewIndex ? 'selected' : ''}" 
               data-crew-id="${member.id}">
            <div class="comm-crew-info">
              <div class="comm-crew-name">${member.name || member.id}</div>
              <div class="comm-crew-role">${member.role || 'Crew Member'}</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderCategoriesPage(contentEl) {
  if (!selectedCrewMember) {
    goBackToCrewSelect();
    return;
  }
  
  const categories = getDialogueCategories();
  
  contentEl.innerHTML = `
    <div class="comm-page">
      <div class="comm-page-header">What type of message for ${selectedCrewMember?.name}?</div>
      <div class="comm-category-list">
        ${categories.map((category, index) => `
          <div class="comm-category-text ${index === selectedDialogueIndex ? 'selected' : ''}" 
               data-category="${category.id}">
            <span class="comm-category-name">${category.name}</span>
          </div>
        `).join('')}
      </div>
      <div class="comm-back-text">Someone else ...</div>
    </div>
  `;
}

function renderDialogueOptionsPage(contentEl) {
  if (!selectedCrewMember || !currentDialogueCategory) {
    goBack();
    return;
  }
  
  const options = getDialogueOptionsForCategory(currentDialogueCategory);
  const categoryName = getDialogueCategories().find(cat => cat.id === currentDialogueCategory)?.name || currentDialogueCategory;
  
  contentEl.innerHTML = `
    <div class="comm-page">
      <div class="comm-page-header">${categoryName} with ${selectedCrewMember?.name}</div>
      <div class="comm-dialogue-list">
        ${options.map((option, index) => `
          <div class="comm-dialogue-text ${index === selectedDialogueIndex ? 'selected' : ''}" 
               data-dialogue="${option}">
            ${option}
          </div>
        `).join('')}
      </div>
      <div class="comm-back-text">Something else ...</div>
    </div>
  `;
}

function updateCrewSelection() {
  const textElements = document.querySelectorAll('.comm-crew-text');
  textElements.forEach((element, index) => {
    element.classList.toggle('selected', index === selectedCrewIndex);
  });
}

function updateCategorySelection() {
  const textElements = document.querySelectorAll('.comm-category-text');
  textElements.forEach((element, index) => {
    element.classList.toggle('selected', index === selectedDialogueIndex);
  });
}

function updateDialogueSelection() {
  const textElements = document.querySelectorAll('.comm-dialogue-text');
  textElements.forEach((element, index) => {
    element.classList.toggle('selected', index === selectedDialogueIndex);
  });
}

export { hasCommunicator, toggleCommunicator };