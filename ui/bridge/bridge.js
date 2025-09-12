// Enhanced Bridge System for Aqua Nova
import displayManager from '/utils/displayManager.js';
import gameStateInstance from '/game/state.js';
import { initPDAOverlay } from '/utils/pdaOverlay.js';
import { initCommunicatorOverlay } from '/utils/communicatorOverlay.js';
import KeyboardUnit from '/utils/keyboardUnit/keyboardUnit.js';
import { drawNavigationDisplay } from '/game/systems/navComputer/navComputer.js';
import MFDCore from '/utils/mfd/mfdCore.js';

const gameState = gameStateInstance;
let lastState = null;
let animationId = null;
let keyboardUnit = null;
let mfdSystem = null;
const canvas = document.getElementById("navigation-canvas");
const svg = document.getElementById("navigation-overlay");

const rangeSelect = document.getElementById("range-select");
const trackInput = document.getElementById("track-input");
const headingInput = document.getElementById("heading-input");
const displayTypeSelect = document.getElementById("display-type-select");

async function initializeBridge() {
  // Initialize overlays
  initPDAOverlay();
  initCommunicatorOverlay();
  
  // Initialize Keyboard Unit first
  initializeKeyboardUnit();
  
  // Initialize MFD system - this handles the navigation display
  await initializeMFD();
  
  // Set up event listeners
  setupEventListeners();
  
  // Initialize game state properties for MFD
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
    
  } catch (error) {
    console.error('Failed to initialize Keyboard Unit:', error);
    console.error('Error stack:', error.stack);
  }
}

async function initializeMFD() {
    try {
        console.log('Initializing MFD System...');
        
        // Create MFD instance
        mfdSystem = new MFDCore('navigation-container', keyboardUnit);
        
        console.log('MFD System initialized successfully');
        
        // Make MFD accessible globally for debugging
        window.mfdSystem = mfdSystem;
        
    } catch (error) {
        console.error('Failed to initialize MFD System:', error);
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
      // Could update game state or navigation here
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
  // Range selector
  if (rangeSelect) {
    rangeSelect.addEventListener('change', (e) => {
      const newRange = parseInt(e.target.value);
      gameState.updateProperty('displaySettings.navDisplayRange', newRange);
    });
  }

  // Track/Course input
  if (trackInput) {
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

  // Display type selector (if you add one)
  if (displayTypeSelect) {
    displayTypeSelect.addEventListener("change", (e) => {
      const displayType = e.target.value;
      // Store the display preference
      localStorage.setItem('aquaNova_displayType', displayType);
      resizeCanvas();
    });
  }

  // Canvas resize handling
  window.addEventListener('resize', () => {
    resizeCanvas();
    if (mfdSystem) {
      mfdSystem.resizeDisplay();
    }
  });

  // Track input is display-only: disable it
  if (trackInput) {
    trackInput.disabled = true;
  }

  // Redraw whenever state changes
  gameState.addObserver(() => {
    // MFD will handle its own updates
    if (mfdSystem) {
      mfdSystem.updateDisplay();
    }
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
  if (rangeSelect) {
    rangeSelect.value = range;
  }
}

// Function to properly size the canvas
function resizeCanvas() {
  const container = document.getElementById("navigation-container");
  if (!container || !canvas) return;

  // Get the actual rendered size of the container
  const rect = container.getBoundingClientRect();
  
  // Set canvas display size (CSS)
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  
  // Set canvas buffer size (actual pixels) - account for device pixel ratio
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  
  // Scale canvas context to account for device pixel ratio
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  
  // Update SVG viewBox to match the CSS size (not pixel size)
  if (svg) {
    svg.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
    svg.style.width = '100%';
    svg.style.height = '100%';
  }
  
  console.log(`Canvas resized: CSS(${rect.width}x${rect.height}) Buffer(${canvas.width}x${canvas.height}) DPR(${dpr})`);
}

// Initial setup
function initializeDisplay() {
  console.log('Initializing display...');
  
  // Get canvas and SVG elements
  const canvas = document.getElementById("navigation-canvas");
  const svg = document.getElementById("navigation-overlay");
  
  if (!canvas || !svg) {
    console.error('Navigation display elements not found');
    return;
  }

  // Set up proper canvas sizing
  resizeCanvas();
  
  // Initialize state properties if they don't exist
  const initProps = [
    ['displaySettings.navDisplayRange', 10],
    ['navigation.heading', 0],
    ['navigation.course', 0]
  ];
  
  initProps.forEach(([path, defaultValue]) => {
    if (!gameState.getProperty(path)) {
      gameState.updateProperty(path, defaultValue);
    }
  });

  console.log('Navigation display initialized');
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
  if (!container) return 'centerDisplay';
  
  const rect = container.getBoundingClientRect();
  const ratio = rect.width / rect.height;
  
  if (ratio > 2.5) return 'mainScreen';      // Very wide
  if (ratio > 2.0) return 'helmScreen';      // Wide
  return 'centerDisplay';                     // Default
}

function startAnimation() {
    function animate() {
        try {
            if (mfdSystem) {
                // Only update if MFD needs it
                if (mfdSystem.needsUpdate()) {
                    mfdSystem.updateDisplay();
                }
            }
        } catch (error) {
            console.error('Animation error:', error);
        }
        
        animationId = requestAnimationFrame(animate); // Keep the loop going
    }
    
    animate();
}

// Add a function to force a redraw when needed
window.forceNavRedraw = function() {
  lastState = null; // This will force a redraw on next frame
  if (mfdSystem) {
    mfdSystem.updateDisplay();
  }
};

function debugCanvasInfo() {
  const container = document.getElementById("navigation-container");
  const canvas = document.getElementById("navigation-canvas");
  
  if (container && canvas) {
    const containerRect = container.getBoundingClientRect();
    console.log('=== Canvas Debug Info ===');
    console.log('Container size:', containerRect.width, 'x', containerRect.height);
    console.log('Canvas buffer size:', canvas.width, 'x', canvas.height);
    console.log('Canvas CSS size:', canvas.style.width, 'x', canvas.style.height);
    console.log('Device pixel ratio:', window.devicePixelRatio);
    console.log('========================');
  }
}

// Make debug function available globally for testing
window.debugCanvasInfo = debugCanvasInfo;

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
  // Clean up MFD system
  if (mfdSystem) {
    mfdSystem.destroy();
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
    keyboardUnit.requestInput('LAT: N ', 'latitude_input', 15);
    console.log('Latitude input requested...');
  }
};

window.testLonInput = function() {
  if (keyboardUnit) {
    keyboardUnit.requestInput('LON: W ', 'longitude_input', 15);
    console.log('Longitude input requested...');
  }
};

window.testWptInput = function() {
  if (keyboardUnit) {
    keyboardUnit.requestInput('WPT: ', 'waypoint_name', 8);
    console.log('Waypoint input requested...');
  }
};

window.testSpdInput = function() {
  if (keyboardUnit) {
    keyboardUnit.requestInput('SPD: ', 'speed_input', 6);
    console.log('Speed input requested...');
  }
};

window.cancelInput = function() {
  if (keyboardUnit) {
    keyboardUnit.cancelInput();
    console.log('Input cancelled...');
  }
};

// MFD test functions
window.testMFDRange = function() {
  if (mfdSystem) {
    console.log('MFD Status:', mfdSystem.getStatus());
    console.log('Testing range increase...');
    // Simulate soft key press for range increase (L1)
    mfdSystem.handleSoftKey('L1');
  } else {
    console.log('MFD System not available');
  }
};

window.testMFDOverlays = function() {
  if (mfdSystem) {
    console.log('Testing overlays menu...');
    // Simulate soft key press for overlays (L2)
    mfdSystem.handleSoftKey('L2');
  } else {
    console.log('MFD System not available');
  }
};

window.testMFDRoute = function() {
  if (mfdSystem) {
    console.log('Testing route menu...');
    // Simulate soft key press for route (L3)
    mfdSystem.handleSoftKey('L3');
  } else {
    console.log('MFD System not available');
  }
};

window.testMFDBack = function() {
  if (mfdSystem) {
    console.log('Testing back to map...');
    // Simulate soft key press for back (L4)
    mfdSystem.handleSoftKey('L4');
  } else {
    console.log('MFD System not available');
  }
};

// Make keyboardUnit accessible globally for debugging
window.debugBridge = {
  keyboardUnit: keyboardUnit,
  mfdSystem: mfdSystem,
  gameState: gameState,
  forceRedraw: () => window.forceNavRedraw()
};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM loaded, initializing bridge...');
    await initializeBridge();
    
    // Make systems accessible for debugging after initialization
    setTimeout(() => {
        window.debugBridge.keyboardUnit = keyboardUnit;
        window.debugBridge.mfdSystem = mfdSystem;
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