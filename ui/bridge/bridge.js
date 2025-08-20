// Enhanced Bridge System for Aqua Nova
import { drawNavigationDisplay, animateNavigationDisplay } from "../../utils/navComputer/navComputer.js";
import GameState from "../../game/state.js";

const state = new GameState();
let animationId;
const canvas = document.getElementById("navigation-canvas");
const svg = document.getElementById("navigation-overlay");

const rangeSelect = document.getElementById("range-select");
const trackInput = document.getElementById("track-input");
const headingInput = document.getElementById("heading-input");
const displayTypeSelect = document.getElementById("display-type-select");

function initializeBridge() {
  
  // Set up event listeners
  setupEventListeners();
  
  // Initialize display
  initializeDisplay();
  
  // Start animation loop for radar sweep
  startAnimation();
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