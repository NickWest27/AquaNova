// /game/systems/upperDisplay/upperDisplayRenderer.js
// Upper Display Renderer - Context-sensitive information display

import gameStateInstance from '../../state.js';
import { getCurrentAlert, checkAlertConditions } from './alertManager.js';
import {
  formatDefaultDisplay,
  formatAlertDisplay,
  calculateFontSize,
  calculatePulseOpacity,
  animateEllipsis,
  Colors
} from './displayFormatters.js';

// Canvas and SVG references
let canvas, svg;
let ctx;

// Display state
let currentMode = 'default'; // 'default' or 'alert'
let fadeProgress = 1.0; // 0.0 to 1.0
let lastMode = 'default';
let transitionStartTime = 0;
const TRANSITION_DURATION = 300; // ms

// Update timing
let lastUpdate = 0;
const UPDATE_INTERVAL = 100; // 10fps for smooth animations

/**
 * Initialize upper display
 */
export function initUpperDisplay() {
  canvas = document.getElementById('upper-display-canvas');
  svg = document.getElementById('upper-display-overlay');

  if (!canvas) {
    console.error('Upper display canvas not found in DOM');
    return;
  }

  ctx = canvas.getContext('2d');

  // Set up game state observers
  setupObservers();

  console.log('UPPER DISPLAY.....ONLINE');
}

/**
 * Set up game state observers for reactive updates
 */
function setupObservers() {
  // Update display when helm changes
  gameStateInstance.addObserver('helm', () => {
    renderUpperDisplay(Date.now());
  });

  // Update display when navigation changes
  gameStateInstance.addObserver('navigation', () => {
    renderUpperDisplay(Date.now());
  });
}

/**
 * Main update loop - called from bridge animation loop
 * @param {number} timestamp - Current timestamp
 */
export function updateUpperDisplay(timestamp) {
  // Always check for alert conditions
  checkAlertConditions(timestamp);

  // Throttle display updates
  if (timestamp - lastUpdate < UPDATE_INTERVAL) {
    return;
  }
  lastUpdate = timestamp;

  renderUpperDisplay(timestamp);
}

/**
 * Render upper display
 * @param {number} timestamp - Current timestamp
 */
function renderUpperDisplay(timestamp) {
  if (!canvas || !ctx) return;

  // Setup canvas with proper DPR
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const cssWidth = Math.max(1, rect.width);
  const cssHeight = Math.max(1, rect.height);

  if (canvas.width !== Math.round(cssWidth * dpr) || canvas.height !== Math.round(cssHeight * dpr)) {
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  // Determine display mode
  const alert = getCurrentAlert();
  const targetMode = alert ? 'alert' : 'default';

  // Handle mode transitions
  if (targetMode !== currentMode) {
    if (fadeProgress >= 1.0) {
      // Start new transition
      lastMode = currentMode;
      currentMode = targetMode;
      transitionStartTime = timestamp;
      fadeProgress = 0.0;
    }
  }

  // Update fade progress
  if (fadeProgress < 1.0) {
    const elapsed = timestamp - transitionStartTime;
    fadeProgress = Math.min(1.0, elapsed / TRANSITION_DURATION);
  }

  // Render based on mode
  if (currentMode === 'alert' && alert) {
    renderAlertMode(ctx, cssWidth, cssHeight, alert, timestamp, fadeProgress);
  } else {
    renderDefaultMode(ctx, cssWidth, cssHeight, timestamp, fadeProgress);
  }
}

/**
 * Render default ship status display
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @param {number} timestamp - Current timestamp
 * @param {number} fade - Fade progress (0-1)
 */
function renderDefaultMode(ctx, width, height, timestamp, fade) {
  const displayData = formatDefaultDisplay(gameStateInstance);

  // Calculate font size based on canvas height
  const fontSize = calculateFontSize(height);
  ctx.font = `${fontSize}px 'Courier New', monospace`;
  ctx.textAlign = 'center';

  // Apply fade
  ctx.globalAlpha = fade;

  // Line 1: HDG | SPD | DEPTH (top half, centered)
  ctx.fillStyle = displayData.color;
  const line1Y = height * 0.35;
  ctx.fillText(displayData.line1, width / 2, line1Y);

  // Line 2: Region name (bottom half, centered)
  ctx.fillStyle = Colors.GRAY;
  const line2Y = height * 0.65;
  ctx.fillText(displayData.line2, width / 2, line2Y);

  ctx.globalAlpha = 1.0;
}

/**
 * Render alert display
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @param {Object} alert - Alert object
 * @param {number} timestamp - Current timestamp
 * @param {number} fade - Fade progress (0-1)
 */
function renderAlertMode(ctx, width, height, alert, timestamp, fade) {
  const displayData = formatAlertDisplay(alert);

  if (!displayData) return;

  // Calculate font size (slightly larger for alerts)
  const fontSize = calculateFontSize(height) * 1.1;
  ctx.font = `bold ${fontSize}px 'Courier New', monospace`;
  ctx.textAlign = 'center';

  // Animate ellipsis if present
  let message = displayData.message;
  if (message.includes('...')) {
    message = animateEllipsis(message, timestamp);
  }

  // Calculate opacity (pulse for critical/warning)
  let opacity = fade;
  if (displayData.pulse) {
    opacity *= calculatePulseOpacity(timestamp);
  }

  ctx.globalAlpha = opacity;

  // Draw message centered vertically and horizontally
  ctx.fillStyle = displayData.color;
  const messageY = height / 2 + fontSize / 3; // Adjust for text baseline
  ctx.fillText(message, width / 2, messageY);

  ctx.globalAlpha = 1.0;
}
