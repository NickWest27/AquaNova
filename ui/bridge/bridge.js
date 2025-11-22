// Enhanced Bridge System for Aqua Nova
// Separates navigation display from MFD overlay system
import displayManager from '/utils/displayManager.js';
import gameStateInstance from '/game/state.js';
import missionManager from '/game/systems/missionManager.js';
import { initPDAOverlay } from '/utils/pdaOverlay.js';
import { initCommunicatorOverlay } from '/utils/communicatorOverlay.js';
import KeyboardUnit from '/utils/keyboardUnit/keyboardUnit.js';
import { drawNavigationDisplay } from '/game/systems/navComputer/navComputer.js';
import MFDCore from '/utils/mfd/mfdCore.js';
import stationManager from '/utils/stationManager.js';
import { drawPFD } from '/game/systems/pfd/pfdRenderer.js';

const gameState = gameStateInstance;
let lastState = null;
let animationId = null;
let keyboardUnit = null;
let mfdSystem = null;
let navigationCanvas = null;
let navigationSVG = null;

// UI controls
const rangeSelect = document.getElementById("range-select");
const trackInput = document.getElementById("track-input");
const headingInput = document.getElementById("heading-input");

async function initializeBridge() {

  if (!missionManager.initialized) {
    console.log('Initializing mission system...');
    await missionManager.init();
  }

  // Initialize overlays
  initPDAOverlay();
  initCommunicatorOverlay();

  // Initialize Keyboard Unit
  initializeKeyboardUnit();

  // Initialize navigation display (content system)
  await initializeNavigationDisplay();

  // Initialize MFD overlay system
  await initializeMFDOverlay();

  // Initialize station management system
  initializeStationManager();

  // Set up event listeners
  setupEventListeners();

  // Initialize game state properties
  initializeGameStateProperties();

  // Start animation loop
  startAnimation();
}

function initializeGameStateProperties() {
  const initProps = [
    ['displaySettings.navDisplayRange', 10],
    ['navigation.heading', 0],
    ['navigation.course', 0]
  ];
  
  initProps.forEach(([path, defaultValue]) => {
    if (!gameStateInstance.getProperty(path)) {
      gameStateInstance.updateProperty(path, defaultValue);
    }
  });
}

async function initializeNavigationDisplay() {
  console.log('Initializing navigation display content...');
  
  // Create navigation display elements in container
  const container = document.getElementById('navigation-container');
  if (!container) {
    console.error('Navigation container not found!');
    return;
  }
  
  // Get references
  navigationCanvas = document.getElementById('navigation-canvas');
  navigationSVG = document.getElementById('navigation-overlay');
  
  // Set up proper canvas sizing
  resizeNavigationDisplay();
  
  console.log('Navigation display content initialized');
}

async function initializeMFDOverlay() {
  try {
    console.log('Initializing MFD overlay system...');

    const centerEl = document.querySelector('.right-console');
    if (centerEl) {
      if (!centerEl.id) centerEl.id = 'right-console';
      mfdSystem = new MFDCore(centerEl.id, keyboardUnit);
      console.log('MFD initialized in right-console');
      window.mfdSystem = mfdSystem;
    } else {
      console.error('right-console element not found. MFD could not initialize.');
    }

  } catch (error) {
    console.error('Failed to initialize MFD overlay system:', error);
    console.error('Error stack:', error.stack);
  }
}

function initializeStationManager() {
  console.log('Initializing station manager...');

  const centerDisplay = document.getElementById('navigation-container');

  // Initialize the station manager with MFD and center display
  stationManager.init(mfdSystem, centerDisplay);

  // Register station selector buttons
  const stationButtons = document.querySelectorAll('.station-btn');
  stationButtons.forEach(button => {
    const stationId = button.dataset.station;
    stationManager.registerStationButton(stationId, button);
  });

  // Register display renderers for each station
  stationManager.registerDisplayRenderer('navigation', () => {
    updateNavigationDisplay();
  });

  stationManager.registerDisplayRenderer('pfd', () => {
    drawPFD(centerDisplay);
  });

  // Make station manager globally accessible for debugging
  window.stationManager = stationManager;

  console.log('Station manager initialized');
}

function initializeKeyboardUnit() {
  console.log('Initializing keyboard unit...');
  
  const consoleContainer = document.getElementById('center-console');
  const keyboardContainer = document.getElementById('keyboard-unit-container');

  if (!consoleContainer || !keyboardContainer) {
    console.error('Keyboard Unit container not found in center console!');
    return;
  }
  
  try {
    keyboardUnit = new KeyboardUnit('keyboard-unit-container');
    
    // Listen for keyboard unit data (scratchpad ENTER)
    document.addEventListener('keyboard-data-sent', (e) => {
      console.log('Keyboard data event received:', e.detail);
      handleKeyboardData(e.detail);
    });
    
    console.log('Keyboard Unit initialized successfully in center console');
    
  } catch (error) {
    console.error('Failed to initialize Keyboard Unit:', error);
    console.error('Error stack:', error.stack);
  }
}

function handleKeyboardData(data) {
  console.log('Bridge received keyboard data:', data);
  
  // Route to MFD system first if available
  if (mfdSystem) {
    mfdSystem.handleKeyboardInput(data);
  }
  
  // Handle bridge-specific contexts
  const { prompt, input, context } = data;
  
  switch (context) {
    case 'latitude':
    case 'latitude_input':
      console.log(`Latitude entered: ${input}`);
      break;
    case 'longitude':
    case 'longitude_input':
      console.log(`Longitude entered: ${input}`);
      break;
    case 'waypoint':
    case 'waypoint_name':
      console.log(`Waypoint name entered: ${input}`);
      break;
    case 'speed':
    case 'speed_input':
      console.log(`Speed entered: ${input}`);
      if (!isNaN(parseFloat(input))) {
        gameState.updateProperty("navigation.speed", parseFloat(input));
      }
      break;
    default:
      console.log(`Unknown input context: ${context}, data: ${input}`);
  }
}

function setupEventListeners() {
  // Range selector
  if (rangeSelect) {
    rangeSelect.addEventListener('change', (e) => {
      const newRange = parseInt(e.target.value);
      gameState.updateProperty('displaySettings.navDisplayRange', newRange);
    });
  }

  // Track/Course input (display only)
  if (trackInput) {
    trackInput.disabled = true;
    trackInput.addEventListener('change', (e) => {
      const newCourse = parseInt(e.target.value);
      gameState.updateProperty('navigation.course', newCourse);
    });
  }

  // Heading input
  if (headingInput) {
    headingInput.addEventListener('change', (e) => {
      const newHeading = parseInt(e.target.value);
      gameState.updateProperty('navigation.heading', newHeading);
    });
  }

  // Resize handling
  window.addEventListener('resize', () => {
    resizeNavigationDisplay();
    if (mfdSystem) {
      mfdSystem.updateOverlayPositions();
    }
  });

  // Game state observer - updates both navigation content and MFD overlay
  gameState.addObserver(() => {
    // Update navigation display
    updateNavigationDisplay();
    
    // Update MFD overlay
    if (mfdSystem) {
      mfdSystem.updateOverlay();
    }
  });

  // Keyboard shortcuts for quick range changes
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === 'INPUT') return;
    
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
  if (rangeSelect) {
    rangeSelect.value = range;
  }
}

// Navigation display content management (separate from MFD)
function resizeNavigationDisplay() {
  const container = document.getElementById("navigation-container");
  if (!container || !navigationCanvas || !navigationSVG) return;

  // Get the actual rendered size of the container
  const rect = container.getBoundingClientRect();
  
  // Set canvas display size (CSS)
  navigationCanvas.style.width = '100%';
  navigationCanvas.style.height = '100%';
  
  // Set canvas buffer size (actual pixels) - account for device pixel ratio
  const dpr = window.devicePixelRatio || 1;
  navigationCanvas.width = rect.width * dpr;
  navigationCanvas.height = rect.height * dpr;
  
  // Scale canvas context to account for device pixel ratio
  const ctx = navigationCanvas.getContext('2d');
  ctx.scale(dpr, dpr);
  
  // Update SVG viewBox to match the CSS size (not pixel size)
  navigationSVG.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
  navigationSVG.style.width = '100%';
  navigationSVG.style.height = '100%';
  
  console.log(`Navigation display resized: CSS(${rect.width}x${rect.height}) Buffer(${navigationCanvas.width}x${navigationCanvas.height}) DPR(${dpr})`);
  
  // Redraw navigation content
  updateNavigationDisplay();
}

function updateNavigationDisplay() {
  if (!navigationCanvas || !navigationSVG) return;

  // Get display mode from MFD page state
  const displayMode = mfdSystem?.getPageState('navigation')?.displayMode || 'ARC';

  // Get overlay settings from MFD page state
  const overlays = mfdSystem?.getPageState('navigation')?.overlaysVisible || {
    route: true,
    waypoints: true,
    contours: false,
    hazards: true,
    traffic: false
  };

  // Get current navigation state from game state
  const location = gameState.getProperty("navigation.location");
  const navState = {
    range: gameState.getProperty("displaySettings.navDisplayRange") || 10,
    ownshipTrack: gameState.getProperty("navigation.course") || 0,
    selectedHeading: gameState.getProperty("navigation.heading") || 0,
    displayMode: displayMode,
    overlays: overlays,
    ownshipPosition: location?.geometry?.coordinates || [-70.6709, 41.5223] // [lon, lat]
  };

  // Draw navigation content using navComputer
  drawNavigationDisplay(navigationCanvas, navigationSVG, navState, getCurrentDisplayType());
}

function getCurrentDisplayType() {
  const urlParams = new URLSearchParams(window.location.search);
  const urlDisplayType = urlParams.get('display');
  if (urlDisplayType) return urlDisplayType;
  
  const storedType = localStorage.getItem('aquaNova_displayType');
  if (storedType) return storedType;
  
  // Auto-detect based on container size
  const container = document.getElementById("navigation-container");
  if (!container) return 'centerDisplay';
  
  const rect = container.getBoundingClientRect();
  const ratio = rect.width / rect.height;
  
  if (ratio > 2.5) return 'mainScreen';
  if (ratio > 2.0) return 'helmScreen';
  return 'centerDisplay';
}

function startAnimation() {
  function animate() {
    try {
      // Get current active station
      const activeStation = stationManager.getCurrentStation();

      // Update display based on active station
      const currentState = JSON.stringify({
        station: activeStation,
        range: gameState.getProperty("displaySettings.navDisplayRange"),
        course: gameState.getProperty("navigation.course"),
        heading: gameState.getProperty("navigation.heading"),
        displayMode: mfdSystem?.getPageState('navigation')?.displayMode,
        overlays: mfdSystem?.getPageState('navigation')?.overlaysVisible,
        helmSpeed: gameState.getProperty("helm.currentSpeed"),
        helmHeading: gameState.getProperty("helm.currentHeading"),
        helmDepth: gameState.getProperty("helm.currentDepth"),
        helmTargetSpeed: gameState.getProperty("helm.targetSpeed"),
        helmTargetHeading: gameState.getProperty("helm.targetHeading"),
        helmTargetDepth: gameState.getProperty("helm.targetDepth"),
        helmPitch: gameState.getProperty("helm.pitch"),
        helmRoll: gameState.getProperty("helm.roll")
      });

      if (currentState !== lastState) {
        // Update the current station's display
        stationManager.updateCenterDisplay();
        lastState = currentState;
      }

      // Update MFD overlay if needed
      if (mfdSystem && mfdSystem.needsUpdate()) {
        mfdSystem.updateOverlay();
      }
    } catch (error) {
      console.error('Animation error:', error);
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

// Force redraw function
window.forceNavRedraw = function() {
  lastState = null;
  updateNavigationDisplay();
  if (mfdSystem) {
    mfdSystem.forceRedraw();
  }
};

// Debug functions
function debugCanvasInfo() {
  const container = document.getElementById("navigation-container");
  
  if (container && navigationCanvas) {
    const containerRect = container.getBoundingClientRect();
    console.log('=== Navigation Display Debug Info ===');
    console.log('Container size:', containerRect.width, 'x', containerRect.height);
    console.log('Canvas buffer size:', navigationCanvas.width, 'x', navigationCanvas.height);
    console.log('Canvas CSS size:', navigationCanvas.style.width, 'x', navigationCanvas.style.height);
    console.log('Device pixel ratio:', window.devicePixelRatio);
    console.log('MFD System:', mfdSystem ? 'Active' : 'Not initialized');
    console.log('====================================');
  }
}

window.debugCanvasInfo = debugCanvasInfo;

// Page visibility handling
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopAnimation();
  } else {
    startAnimation();
  }
});

// Navigation functions
window.exitToQuarters = function exitToQuarters() {
  stopAnimation();
  if (keyboardUnit) {
    keyboardUnit.destroy();
  }
  if (mfdSystem) {
    mfdSystem.destroy();
  }
  window.location.href = "../captains-quarters/quarters.html";
};

// Display switching functions
window.switchToMainDisplay = function() {
  window.location.href = window.location.pathname + "?display=mainScreen";
};

window.switchToHelmDisplay = function() {
  window.location.href = window.location.pathname + "?display=helmScreen";
};

window.switchToCenterDisplay = function() {
  window.location.href = window.location.pathname + "?display=centerDisplay";
};

// Debug object
window.debugBridge = {
  keyboardUnit: keyboardUnit,
  mfdSystem: mfdSystem,
  gameState: gameState,
  navigationCanvas: navigationCanvas,
  navigationSVG: navigationSVG,
  forceRedraw: () => window.forceNavRedraw(),
  updateDisplay: updateNavigationDisplay,
  resizeDisplay: resizeNavigationDisplay
};

document.addEventListener('keyboard-function-pressed', (e) => {
  console.log('Function key pressed:', e.detail);
  // if (mfdSystem && typeof mfdSystem.handleFunctionKey === 'function') {
  //   mfdSystem.handleFunctionKey(e.detail);
  // }
});

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOM loaded, initializing bridge...');
  await initializeBridge();
  
  // Update debug object after initialization
  setTimeout(() => {
    window.debugBridge.keyboardUnit = keyboardUnit;
    window.debugBridge.mfdSystem = mfdSystem;
    window.debugBridge.navigationCanvas = navigationCanvas;
    window.debugBridge.navigationSVG = navigationSVG;
    console.log('Bridge initialization complete');
  }, 100);
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (keyboardUnit) {
    keyboardUnit.destroy();
  }
  if (mfdSystem) {
    mfdSystem.destroy();
  }
});