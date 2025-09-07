// Enhanced Bridge System for Aqua Nova
import displayManager from '/utils/displayManager.js';
import gameStateInstance from '/game/state.js';
import { initPDAOverlay } from '/utils/pdaOverlay.js';
import { initCommunicatorOverlay } from '/utils/communicatorOverlay.js';
import KeyboardUnit from '/utils/keyboardUnit/keyboardUnit.js';
import { drawNavigationDisplay } from '/game/systems/navComputer/navComputer.js';

const gameState = gameStateInstance;
let animationId;
let keyboardUnit; // Add this variable
const canvas = document.getElementById("navigation-canvas");
const svg = document.getElementById("navigation-overlay");

const rangeSelect = document.getElementById("range-select");
const trackInput = document.getElementById("track-input");
const headingInput = document.getElementById("heading-input");
const displayTypeSelect = document.getElementById("display-type-select");

function initializeBridge() {
  
  // Initialize overlays
  initPDAOverlay();
  initCommunicatorOverlay();
  
  // Initialize Keyboard Unit
  initializeKeyboardUnit();
  
  // Set up event listeners
  setupEventListeners();
  
  // Initialize display
  initializeDisplay();
  
  // Start animation loop for radar sweep
  startAnimation();
}

function initializeKeyboardUnit() {
  console.log('initializeKeyboardUnit called');
  
  // Check if container exists
  const container = document.getElementById('keyboard-unit-container');
  console.log('Keyboard container found:', container);
  
  if (!container) {
    console.error('Keyboard Unit container not found!');
    return;
  }
  
  console.log('Container innerHTML before:', container.innerHTML);
  
  try {
    console.log('Creating KeyboardUnit...');
    keyboardUnit = new KeyboardUnit('keyboard-unit-container');
    console.log('KeyboardUnit created successfully:', keyboardUnit);
    
    // Listen for keyboard unit data
    document.addEventListener('keyboard-data-sent', (e) => {
      console.log('Keyboard data event received:', e.detail);
      handleKeyboardData(e.detail);
    });
    
    console.log('Keyboard Unit initialized successfully');
    
    // Check container content after initialization
    setTimeout(() => {
      console.log('Container innerHTML after:', container.innerHTML);
    }, 100);
    
  } catch (error) {
    console.error('Failed to initialize Keyboard Unit:', error);
    console.error('Error stack:', error.stack);
  }
}

function handleKeyboardInput(data) {
  const { prompt, input, context } = data;
  
  switch (context) {
    case 'latitude':
      // Handle latitude input
      console.log(`Latitude entered: ${input}`);
      // You could update game state or navigation here
      break;
    case 'longitude':
      // Handle longitude input
      console.log(`Longitude entered: ${input}`);
      break;
    case 'waypoint':
      // Handle waypoint name input
      console.log(`Waypoint name entered: ${input}`);
      break;
    case 'speed':
      // Handle speed input
      console.log(`Speed entered: ${input}`);
      // Update game state
      if (!isNaN(parseFloat(input))) {
        gameState.updateProperty("navigation.speed", parseFloat(input));
      }
      break;
    default:
      console.log(`Unknown input context: ${context}, data: ${input}`);
  }
}

function setupEventListeners() {
  rangeSelect.addEventListener("change", (e) => {
    const newRange = Number(e.target.value);
    gameState.updateProperty("displaySettings.navDisplayRange", newRange);
  });

  headingInput.addEventListener("input", (e) => {
    const newHeading = Number(e.target.value);
    gameState.updateProperty("navigation.heading", newHeading);
  });

  // Display type selector (if you add one)
  if (displayTypeSelect) {
    displayTypeSelect.addEventListener("change", (e) => {
      const displayType = e.target.value;
      // Store the display preference
      localStorage.setItem('aquaNova_displayType', displayType);
      resizeCanvas();
    });
  }

  // Handle window resize
  window.addEventListener("resize", resizeCanvas);

  // Track input is display-only: disable it
  trackInput.disabled = true;

  // Redraw whenever state changes
  gameState.addObserver(() => {
    // Don't need to redraw here since animation loop handles it
  });

  // Keyboard shortcuts for quick range changes
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === 'INPUT') return; // Don't interfere with input fields
    
    switch(e.key) {
      case '1': setRange(5); break;
      case '2': setRange(10); break;
      case '3': setRange(20); break;
      case '4': setRange(40); break;
      case '5': setRange(80); break;
    }
  });
}

function setRange(range) {
  gameState.updateProperty("displaySettings.navDisplayRange", range);
  rangeSelect.value = range;
}

// Function to properly size the canvas
function resizeCanvas() {
  const container = document.getElementById("navigation-container");
  const rect = container.getBoundingClientRect();
  
  console.log("Container dimensions:", rect.width, rect.height);
  
  // Set canvas size to match container's actual rendered size
  canvas.width = rect.width;
  canvas.height = rect.height;
  
  console.log("Canvas dimensions after:", canvas.width, canvas.height);
  
  // Update SVG dimensions to match
  svg.setAttribute("width", canvas.width);
  svg.setAttribute("height", canvas.height);
}

// Initial setup
function initializeDisplay() {
  requestAnimationFrame(() => {
    resizeCanvas();
  });
}

function getCurrentDisplayType() {
  // You can determine display type based on:
  // 1. URL parameter: ?display=mainScreen
  // 2. Container size
  // 3. User preference stored in localStorage
  // 4. Current page/context
  
  const urlParams = new URLSearchParams(window.location.search);
  const urlDisplayType = urlParams.get('display');
  if (urlDisplayType) return urlDisplayType;
  
  const storedType = localStorage.getItem('aquaNova_displayType');
  if (storedType) return storedType;
  
  // Auto-detect based on container size
  const container = document.getElementById("navigation-container");
  const rect = container.getBoundingClientRect();
  const ratio = rect.width / rect.height;
  
  if (ratio > 2.5) return 'mainScreen';      // Very wide
  if (ratio > 2.0) return 'helmScreen';      // Wide
  return 'centerDisplay';                     // Default
}

function startAnimation() {
  function animate() {
    if (canvas.width > 0 && canvas.height > 0 && gameState) {
      const displayType = getCurrentDisplayType();
      
      const state = {
        range: gameState.getProperty("displaySettings.navDisplayRange"),
        ownshipTrack: gameState.getProperty("navigation.course"),
        selectedHeading: gameState.getProperty("navigation.heading"),
      };
      
      drawNavigationDisplay(canvas, svg, state, displayType);
      
      // Keep UI in sync
      rangeSelect.value = state.range;
      headingInput.value = state.selectedHeading;
      trackInput.value = state.ownshipTrack;
    }
    
    animationId = requestAnimationFrame(animate);
  }
  
  animate();
}

function stopAnimation() {
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
}

// Page visibility handling to pause animation when tab is not active
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopAnimation();
  } else {
    startAnimation();
  }
});

// Exit button
window.exitToQuarters = function exitToQuarters() {
  stopAnimation();
  // Clean up keyboard unit
  if (keyboardUnit) {
    keyboardUnit.destroy();
  }
  window.location.href = "../captains-quarters/quarters.html";
};

// Utility functions for other parts of the game
window.switchToMainDisplay = function() {
  window.location.href = window.location.pathname + "?display=mainScreen";
};

window.switchToHelmDisplay = function() {
  window.location.href = window.location.pathname + "?display=helmScreen";
};

window.switchToCenterDisplay = function() {
  window.location.href = window.location.pathname + "?display=centerDisplay";
};

// Test functions for the keyboard unit
window.testLatInput = function() {
  if (keyboardUnit) {
    keyboardUnit.requestInput('LAT>', 'latitude', 15);
  }
};

window.testLonInput = function() {
  if (keyboardUnit) {
    keyboardUnit.requestInput('LON>', 'longitude', 15);
  }
};

window.testWptInput = function() {
  if (keyboardUnit) {
    keyboardUnit.requestInput('WPT>', 'waypoint', 8);
  }
};

window.testSpdInput = function() {
  if (keyboardUnit) {
    keyboardUnit.requestInput('SPD>', 'speed', 6);
  }
};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  initializeBridge();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (keyboardUnit) {
    keyboardUnit.destroy();
  }
});