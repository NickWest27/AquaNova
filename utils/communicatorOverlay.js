// utils/communicatorOverlay.js
// Ship communicator overlay system with hierarchical dialogue and number input

import gameStateInstance from '/game/state.js';
import missionManager from '/game/systems/missionManager.js';

let communicatorVisible = false;
let communicatorElement = null;
let currentCommPage = 'crew-select';
let selectedCrewMember = null;
let selectedDialogueIndex = 0;
let selectedCrewIndex = 0;
let currentDialogueCategory = null;
let conversationHistory = new Map();

// Number input state
let numberInputMode = false;
let currentNumberInput = '';
let inputCommandType = '';
let maxDigits = 3;

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

  // Wire up communicator icon click handler
  const commIcon = document.getElementById('comm-icon');
  if (commIcon) {
    commIcon.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (hasCommunicator()) {
        toggleCommunicator();
      }
    });
  }

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
    numberInputMode = false;
    currentNumberInput = '';
    renderCurrentCommPage();
  }
}

function createCommunicator() {
  communicatorElement = document.createElement('div');
  communicatorElement.id = 'communicator-overlay';
  communicatorElement.innerHTML = `
    <div class="comm-frame"></div>
    <div class="comm-glass">
      <div class="comm-content" id="comm-content"></div>
    </div>
  `;
  document.body.appendChild(communicatorElement);
  communicatorElement.addEventListener('click', handleCommunicatorClick);
}

function handleCommunicatorClick(e) {
  e.preventDefault();
  e.stopPropagation();
  
  // Handle number input clicks
  if (numberInputMode) {
    const numberBtn = e.target.closest('.number-btn');
    if (numberBtn) {
      const digit = numberBtn.getAttribute('data-digit');
      handleNumberInput(digit);
      return;
    }
    
    const unitBtn = e.target.closest('.unit-btn');
    if (unitBtn) {
      const unit = unitBtn.getAttribute('data-unit');
      completeNumberCommand(unit);
      return;
    }
    
    const clearBtn = e.target.closest('.clear-btn');
    if (clearBtn) {
      clearNumberInput();
      return;
    }
    
    const backBtn = e.target.closest('.back-btn');
    if (backBtn) {
      exitNumberInput();
      return;
    }
    return;
  }
  
  // Regular navigation clicks
  const crewText = e.target.closest('.comm-crew-text');
  if (crewText) {
    const crewId = crewText.getAttribute('data-crew-id');
    if (crewId) {
      selectCrewMember(crewId);
    }
    return;
  }
  
  const categoryText = e.target.closest('.comm-category-text');
  if (categoryText) {
    const category = categoryText.getAttribute('data-category');
    if (category) {
      selectDialogueCategory(category);
    }
    return;
  }
  
  const dialogueText = e.target.closest('.comm-dialogue-text');
  if (dialogueText) {
    const dialogueMessage = dialogueText.getAttribute('data-dialogue');
    if (dialogueMessage) {
      sendThought(dialogueMessage);
    }
    return;
  }
  
  const backText = e.target.closest('.comm-back-text');
  if (backText) {
    goBack();
    return;
  }
}

function handleCommunicatorNavigation(e) {
  if (numberInputMode) {
    switch(e.key) {
      case '0': case '1': case '2': case '3': case '4':
      case '5': case '6': case '7': case '8': case '9':
        e.preventDefault();
        handleNumberInput(e.key);
        break;
      case 'Backspace':
        e.preventDefault();
        clearNumberInput();
        break;
      case 'Escape':
        e.preventDefault();
        exitNumberInput();
        break;
      case 'Enter':
        e.preventDefault();
        const defaultUnit = inputCommandType === 'speed' ? 'kts' : 
                          inputCommandType === 'heading' ? 'degrees' : 'meters';
        completeNumberCommand(defaultUnit);
        break;
    }
    return;
  }
  
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

function handleNumberInput(digit) {
  if (currentNumberInput.length < maxDigits) {
    currentNumberInput += digit;
    renderCurrentCommPage();
  }
}

function clearNumberInput() {
  currentNumberInput = '';
  renderCurrentCommPage();
}

function exitNumberInput() {
  numberInputMode = false;
  currentNumberInput = '';
  inputCommandType = '';
  currentCommPage = 'dialogue-options';
  renderCurrentCommPage();
}

function completeNumberCommand(unit) {
  if (currentNumberInput === '') return;
  
  let value = parseInt(currentNumberInput);
  let commandText = '';

  // Range checks for each command type
  if (inputCommandType === 'speed') {
    if (value > 160) {
      executeHelmCommand('speed', 160);
      logCommand("Unable sir, setting 160 knots.");
      showThought('You order: "Unable sir, setting 160 knots."');
      exitNumberInput();
      setTimeout(() => {
        generateHelmResponse('speed', 160);
      }, 800);
      return;
    }
    commandText = `Make your speed ${value} ${unit}`;
    executeHelmCommand('speed', value);
  } else if (inputCommandType === 'heading') {
    if (value > 359) {
      executeHelmCommand('heading', 359);
      logCommand("Unable sir, setting 359 degrees.");
      showThought('You order: "Unable sir, setting 359 degrees."');
      exitNumberInput();
      setTimeout(() => {
        generateHelmResponse('heading', 359);
      }, 800);
      return;
    }
    commandText = `Make your heading ${value} ${unit}`;
    executeHelmCommand('heading', value);
  } else if (inputCommandType === 'depth') {
    if (value > 9000) {
      executeHelmCommand('depth', 9000);
      logCommand("Unable sir, setting 9000 meters.");
      showThought('You order: "Unable sir, setting 9000 meters."');
      exitNumberInput();
      setTimeout(() => {
        generateHelmResponse('depth', 9000);
      }, 800);
      return;
    }
    commandText = `Make your depth ${value} meters`;
    executeHelmCommand('depth', value);
  }
  
  logCommand(commandText);
  showThought(`You order: "${commandText}"`);
  
  exitNumberInput();
  
  setTimeout(() => {
    generateHelmResponse(inputCommandType, value);
  }, 800);
}

function executeHelmCommand(type, value) {
  if (type === 'speed') {
    gameStateInstance.updateProperty('navigation.speed', value);
    gameStateInstance.updateProperty('shipSystems.helm.lastSpeedCommand', {
      timestamp: new Date().toISOString(),
      value: value
    });
  } else if (type === 'heading') {
    gameStateInstance.updateProperty('navigation.heading', value);
    gameStateInstance.updateProperty('navigation.course', value);
    gameStateInstance.updateProperty('shipSystems.helm.lastHeadingCommand', {
      timestamp: new Date().toISOString(),
      value: value
    });
  } else if (type === 'depth') {
    gameStateInstance.updateProperty('navigation.depth', value);
    gameStateInstance.updateProperty('shipSystems.helm.lastDepthCommand', {
      timestamp: new Date().toISOString(),
      value: value
    });
  }
}

function generateHelmResponse(commandType, value) {
  let response = '';
  
  if (commandType === 'speed') {
    response = value === 0 ? "Aye Captain, all stop." : `Aye Captain, making ${value} knots.`;
  } else if (commandType === 'heading') {
    response = `Aye Captain, coming to ${value} degrees.`;
  } else if (commandType === 'depth') {
    response = value === 0 ? "Aye Captain, surfacing." : `Aye Captain, making depth ${value} meters.`;
  }
  
  logResponse(response);
  showThought(`${selectedCrewMember.name} responds: "${response}"`);
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
  
  categories.push({ id: 'pleasantries', name: 'Casual Chat' });
  
  const contextual = selectedCrewMember.contextual || [];
  if (contextual.length > 0) {
    categories.push({ id: 'contextual', name: 'Follow Up' });
  }
  
  const commands = selectedCrewMember.dialogueOptions?.commands || [];
  if (commands.length > 0) {
    categories.push({ id: 'commands', name: 'Orders' });
  }
  
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
  if (history.length === 0) {
    return ["Hello there", "Good to finally connect", "How are you settling in?"];
  } else {
    return ["How are you doing?", "What's on your mind?", "Just checking in...", "How's everything going?"];
  }
}

function goBack() {
  if (currentCommPage === 'dialogue-options') {
    currentCommPage = 'dialogue-categories';
    currentDialogueCategory = null;
    selectedDialogueIndex = 0;
    renderCurrentCommPage();
  } else if (currentCommPage === 'dialogue-categories') {
    goBackToCrewSelect();
  } else if (currentCommPage === 'crew-select') {
    toggleCommunicator();
  }
}

function sendThought(message) {
  console.log(`Message sent to ${selectedCrewMember?.name || 'Unknown'}: ${message}`);
  
  // Check for helm number input commands
  if (selectedCrewMember?.id === 'helm') {
    if (message.includes('Make your speed') || message.includes('Make you speed')) {
      enterNumberInputMode('speed');
      return;
    } else if (message.includes('Make your heading')) {
      enterNumberInputMode('heading');
      return;
    } else if (message.includes('Make your depth')) {
      enterNumberInputMode('depth');
      return;
    } else if (handleDirectHelmCommands(message)) {
      return;
    }
  }
  
  // Regular message processing
  const history = conversationHistory.get(selectedCrewMember.id) || [];
  history.push({
    timestamp: new Date().toISOString(),
    from: 'Captain',
    message: message,
    type: 'outgoing'
  });
  conversationHistory.set(selectedCrewMember.id, history);
  
  logCommunication('Captain', selectedCrewMember?.name || selectedCrewMember?.id, message, 'outgoing');
  
  // Mission triggers
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
  
  const delay = Math.random() < 0.3 ? 800 : 2000 + Math.random() * 3000;
  setTimeout(() => {
    generatePersonalizedResponse(message);
  }, delay);
  
  showThought(`You reach out: "${message}"`);
}

function enterNumberInputMode(commandType) {
  numberInputMode = true;
  currentNumberInput = '';
  inputCommandType = commandType;
  currentCommPage = 'number-input';
  
  if (commandType === 'speed') {
    maxDigits = 2; // 0-25 kts
  } else if (commandType === 'heading') {
    maxDigits = 3; // 0-359 degrees
  } else if (commandType === 'depth') {
    maxDigits = 4; // 0-1000 meters
  }
  
  renderCurrentCommPage();
}

function handleDirectHelmCommands(message) {
  const msg = message.toLowerCase();
  
  if (msg.includes('all stop')) {
    executeHelmCommand('speed', 0);
    logCommand(message);
    showThought(`You order: "${message}"`);
    setTimeout(() => generateHelmResponse('speed', 0), 800);
    return true;
  } else if (msg.includes('all ahead flank')) {
    executeHelmCommand('speed', 25);
    logCommand(message);
    showThought(`You order: "${message}"`);
    setTimeout(() => generateHelmResponse('speed', 25), 800);
    return true;
  } else if (msg.includes('come left')) {
    const currentHeading = gameStateInstance.getProperty('navigation.heading') || 0;
    const newHeading = (currentHeading - 10 + 360) % 360;
    executeHelmCommand('heading', newHeading);
    logCommand(message);
    showThought(`You order: "${message}"`);
    setTimeout(() => generateHelmResponse('heading', newHeading), 800);
    return true;
  } else if (msg.includes('come right')) {
    const currentHeading = gameStateInstance.getProperty('navigation.heading') || 0;
    const newHeading = (currentHeading + 10) % 360;
    executeHelmCommand('heading', newHeading);
    logCommand(message);
    showThought(`You order: "${message}"`);
    setTimeout(() => generateHelmResponse('heading', newHeading), 800);
    return true;
  }
  
  return false;
}

function logCommand(message) {
  const history = conversationHistory.get(selectedCrewMember.id) || [];
  history.push({
    timestamp: new Date().toISOString(),
    from: 'Captain',
    message: message,
    type: 'outgoing'
  });
  conversationHistory.set(selectedCrewMember.id, history);
  
  logCommunication('Captain', selectedCrewMember?.name || selectedCrewMember?.id, message, 'command');
}

function logResponse(message) {
  const history = conversationHistory.get(selectedCrewMember.id) || [];
  history.push({
    timestamp: new Date().toISOString(),
    from: selectedCrewMember.name || selectedCrewMember.id,
    message: message,
    type: 'incoming'
  });
  conversationHistory.set(selectedCrewMember.id, history);
  
  logCommunication(selectedCrewMember.name || selectedCrewMember.id, 'Captain', message, 'response');
}

function generatePersonalizedResponse(originalMessage) {
  if (!selectedCrewMember) return;
  
  const history = conversationHistory.get(selectedCrewMember.id) || [];
  const messageCount = history.filter(msg => msg.type === 'outgoing').length;
  
  let response = '';

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
  };
  
  const memberResponses = responses[selectedCrewMember.id] || {
    greetings: ["Good to hear from you.", "How can I help?"],
    status: ["All good here.", "Everything's running smoothly."],
    commands: ["Roger that.", "Will do.", "Understood."],
    casual: ["Sure thing.", "No problem.", "Got it."]
  };
  
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
  
  const updatedHistory = conversationHistory.get(selectedCrewMember.id) || [];
  updatedHistory.push({
    timestamp: new Date().toISOString(),
    from: selectedCrewMember.name || selectedCrewMember.id,
    message: response,
    type: 'incoming'
  });
  conversationHistory.set(selectedCrewMember.id, updatedHistory);
  
  logCommunication(selectedCrewMember.name || selectedCrewMember.id, 'Captain', response, 'incoming');
  
  showThought(`${selectedCrewMember.name} responds: "${response}"`);
}

function logCommunication(from, to, message, type) {
  try {
    const gameState = gameStateInstance?.getState();
    if (gameState?.shipSystems?.communications?.communicator) {
      const logEntry = {
        timestamp: new Date().toISOString(),
        from: from,
        to: to,
        message: message,
        type: type
      };
      
      const currentLog = gameState.shipSystems.communications.communicator.log || [];
      currentLog.push(logEntry);
      
      gameStateInstance.updateProperty('shipSystems.communications.communicator.log', currentLog);
    }
  } catch (error) {
    console.error('Failed to log communication:', error);
  }
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
    case 'number-input':
      renderNumberInputPage(contentEl);
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
        <div class="comm-no-crew">No one else seems to be available right now...</div>
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

function renderNumberInputPage(contentEl) {
  const commandTitle = inputCommandType.charAt(0).toUpperCase() + inputCommandType.slice(1);
  const units = inputCommandType === 'speed' ? ['kts'] : 
               inputCommandType === 'heading' ? ['degrees'] : 
               ['meters'];
  
  contentEl.innerHTML = `
    <div class="comm-page">
      <div class="comm-page-header">${commandTitle} Input</div>
      <div class="number-input-display">
        <div class="current-input">${currentNumberInput || '_'}</div>
      </div>
      <div class="number-pad">
        <div class="number-row">
          <button class="number-btn" data-digit="1">1</button>
          <button class="number-btn" data-digit="2">2</button>
          <button class="number-btn" data-digit="3">3</button>
        </div>
        <div class="number-row">
          <button class="number-btn" data-digit="4">4</button>
          <button class="number-btn" data-digit="5">5</button>
          <button class="number-btn" data-digit="6">6</button>
        </div>
        <div class="number-row">
          <button class="number-btn" data-digit="7">7</button>
          <button class="number-btn" data-digit="8">8</button>
          <button class="number-btn" data-digit="9">9</button>
        </div>
        <div class="number-row">
          <button class="clear-btn">CLEAR</button>
          <button class="number-btn" data-digit="0">0</button>
          <button class="back-btn">BACK</button>
        </div>
      </div>
      <div class="unit-buttons">
        ${units.map(unit => `
          <button class="unit-btn" data-unit="${unit}">${unit.toUpperCase()}</button>
        `).join('')}
      </div>
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