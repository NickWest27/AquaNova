// utils/communicatorOverlay.js
// Ship communicator overlay system for crew communications
// Redesigned for thought-like, personal interactions

import gameStateInstance from '/game/state.js';
import missionManager from '/game/systems/missionManager.js';

let communicatorVisible = false;
let communicatorElement = null;
let currentCommPage = 'crew-select';
let selectedCrewMember = null;
let selectedDialogueIndex = 0;
let selectedCrewIndex = 0;
let conversationHistory = new Map(); // Track conversations with each crew member

export function initCommunicatorOverlay() {
  // Initialize keyboard controls
  document.addEventListener('keydown', (e) => {
    const active = document.activeElement;
    if (active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) {
      return; // ignore typing
    }

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

// Always read crew data dynamically from current game state
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
      <div class="comm-content" id="comm-content">
        <!-- Content will be dynamically generated -->
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
  const crewText = e.target.closest('.comm-crew-text');
  if (crewText) {
    const crewId = crewText.getAttribute('data-crew-id');
    if (crewId) {
      selectCrewMember(crewId);
    }
    return;
  }
  
  // Handle dialogue option selection
  const dialogueText = e.target.closest('.comm-dialogue-text');
  if (dialogueText) {
    const dialogueMessage = dialogueText.getAttribute('data-dialogue');
    if (dialogueMessage) {
      if (dialogueMessage === "Something else...") {
        goBackToCrewSelect();
      } else {
        sendThought(dialogueMessage);
      }
    }
    return;
  }
  
  // Handle back text
  const backText = e.target.closest('.comm-back-text');
  if (backText) {
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
    const selectedOption = dialogueOptions[selectedDialogueIndex];
    if (selectedOption) {
      if (selectedOption === "Something else...") {
        goBackToCrewSelect();
      } else {
        sendThought(selectedOption);
      }
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
  if (!selectedCrewMember) {
    return ["Something else..."];
  }
  
  // Get conversation history for context
  const history = conversationHistory.get(selectedCrewMember.id) || [];
  const recentTopics = history.slice(-3).map(msg => msg.message.toLowerCase());
  
  let options = [];
  
  // Context-sensitive greetings
  if (history.length === 0) {
    options.push("Hello there", "Good to finally connect", "How are you settling in?");
  } else {
    options.push("How are you doing?", "What's on your mind?", "Just checking in...");
  }
  
  // Role-specific options
  switch(selectedCrewMember.id) {
    case 'executiveOfficer':
      options.push("How's the crew doing?", "Any concerns I should know about?", "Status update?");
      break;
    case 'science':
      options.push("How's everyone's health?", "Any medical concerns?", "Any new discoveries?");
      break;
    case 'engineering':
      options.push("How are the systems running?", "Everything working smoothly?", "Any maintenance needed?");
      break;
    case 'sensors':
      options.push("Anything interesting on sensors?", "All quiet out there?", "What are you seeing?");
      break;
    case 'security':
      options.push("Everything secure?", "All quiet on your watch?", "Any concerns?");
      break;
    case 'communications':
      options.push("Any messages coming in?", "Comms working well?", "Signal strength good?");
      break;
    default:
      options.push("Everything okay over there?", "Wanted to hear your voice");
  }
  
  // Add contextual options based on recent conversation
  if (!recentTopics.includes("personal")) {
    options.push("How are you personally?");
  }
  
  // Always include back option
  options.push("Something else...");
  
  // Shuffle middle options for variety, keep first few and last one
  const firstOptions = options.slice(0, 2);
  const middleOptions = options.slice(2, -1);
  const lastOption = options.slice(-1);
  
  // Simple shuffle for middle options
  for (let i = middleOptions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [middleOptions[i], middleOptions[j]] = [middleOptions[j], middleOptions[i]];
  }
  
  return [...firstOptions, ...middleOptions.slice(0, 4), ...lastOption];
}

function sendThought(message) {
  console.log(`Thought sent to ${selectedCrewMember?.name || 'Unknown'}: ${message}`);
  
  // Add to conversation history
  const history = conversationHistory.get(selectedCrewMember.id) || [];
  history.push({
    timestamp: new Date().toISOString(),
    from: 'Captain',
    message: message,
    type: 'outgoing'
  });
  conversationHistory.set(selectedCrewMember.id, history);
  
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
    if (selectedCrewMember.id === 'executiveOfficer') {
    // Check if this is their first conversation
    const previousMessages = history.filter(msg => msg.type === 'outgoing').length;
    
    if (previousMessages === 1) { // First message to AREA
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
  
  // Generate response with natural delay
  const delay = Math.random() < 0.3 ? 800 : 2000 + Math.random() * 3000;
  setTimeout(() => {
    generatePersonalizedResponse(message);
  }, delay);
  
  // Show sent thought
  showThought(`You reach out: "${message}"`);
}

function generatePersonalizedResponse(originalMessage) {
  if (!selectedCrewMember) return;
  
  const history = conversationHistory.get(selectedCrewMember.id) || [];
  const messageCount = history.filter(msg => msg.type === 'outgoing').length;
  
  let response = '';

  // Personality-based responses
  const responses = {
    executiveOfficer: {
      greetings: ["Good to connect with you, Captain.", "Always here when you need me.", "Captain, I've been waiting for your contact.", "Glad you found your communicator, sir."],
      status: ["Everything's running smoothly up here.", "The crew's doing well.", "All systems nominal."],
      personal: ["I appreciate you checking in.", "It's good to have moments like this.", "Thanks for reaching out."],
      casual: ["Of course, Captain.", "I'll take care of it.", "Understood."]
    },
    science: {
      greetings: ["Captain! How are you feeling?", "Hope you're taking care of yourself.", "Good to hear from you."],
      status: ["Everyone's healthy and accounted for.", "Medical bay is peaceful today.", "No concerns from my end.", "Facinating creatures down here!"],
      personal: ["I'm doing well, thanks for asking.", "Still getting used to ship life, but I like it.", "The crew's been welcoming."],
      casual: ["Interesting question...", "I've been thinking about that too.", "Let me know if you need anything."]
    },
    engineering: {
      greetings: ["Hey Captain!", "Good to hear from you.", "What's up?"],
      status: ["Engines are purring like kittens.", "All systems green down here.", "Just finished some routine maintenance."],
      personal: ["Living the dream down here with my machines.", "Can't complain, love what I do.", "Ship's treating me well."],
      casual: ["You got it, Captain.", "Consider it done.", "On it."]
    },
    sensors: {
      greetings: ["Captain, good to connect.", "Hey there.", "What can I do for you?"],
      status: ["All quiet on the scope.", "Sensors are clear.", "Nothing unusual out there."],
      personal: ["Doing well, thanks. Enjoying the peace and quiet.", "The ocean's fascinating from this perspective.", "All good here."],
      casual: ["Roger that.", "I'll keep an eye on it.", "Sounds good."]
    },
    security: {
      greetings: ["Captain.", "Good to hear from you.", "Sir."],
      status: ["All secure.", "No threats detected.", "Perimeter is clear."],
      personal: ["I'm well, thank you.", "Keeping busy, staying alert.", "All good on my end."],
      casual: ["Understood.", "Will do.", "Copy that."]
    },
    communications: {
      greetings: ["Hi Captain!", "Good to connect.", "How's your day going?"],
      status: ["Comms are clear.", "Signal strength is good.", "All channels open."],
      personal: ["Doing great! Love keeping everyone connected.", "Really enjoying the work.", "Happy to be here."],
      casual: ["Absolutely.", "I'll handle it.", "No problem."]
    }
  };
  
  const memberResponses = responses[selectedCrewMember.id] || responses.casual;
  
    // Choose response type based on message content
    const msg = originalMessage.toLowerCase();

    if (msg.includes('hello') || msg.includes('connect') || messageCount === 1) {
        response = memberResponses.greetings[Math.floor(Math.random() * memberResponses.greetings.length)];
    } else if (msg.includes('status') || msg.includes('how are') || msg.includes('doing')) {
        response = memberResponses.status[Math.floor(Math.random() * memberResponses.status.length)];
    } else if (msg.includes('personal') || msg.includes('you personally') || msg.includes('settling')) {
        response = memberResponses.personal[Math.floor(Math.random() * memberResponses.personal.length)];
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
  
  // Log the response in game state
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
  
  // Add animation styles if not already present
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

function renderDialoguePage(contentEl) {
  if (!selectedCrewMember) {
    goBackToCrewSelect();
    return;
  }
  
  const dialogueOptions = getDialogueOptions();
  
  contentEl.innerHTML = `
    <div class="comm-page">
      <div class="comm-page-header">What would you like to say to ${selectedCrewMember?.name}?</div>
      <div class="comm-dialogue-list">
        ${dialogueOptions.map((option, index) => `
          <div class="comm-dialogue-text ${index === selectedDialogueIndex ? 'selected' : ''}" 
               data-dialogue="${option}">
            ${option}
          </div>
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

function updateDialogueSelection() {
  const textElements = document.querySelectorAll('.comm-dialogue-text');
  textElements.forEach((element, index) => {
    element.classList.toggle('selected', index === selectedDialogueIndex);
  });
}

// Export functions that might be needed elsewhere
export { hasCommunicator, toggleCommunicator };