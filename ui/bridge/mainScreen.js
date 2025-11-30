// /ui/bridge/mainScreen.js
// Main Screen Three-Panel Display Renderer
// Manages left (sensors/comms), center (nav PLAN), and right (helm/engineering) panels

import { drawNavigationDisplay } from '../../game/systems/navComputer/navComputer.js';
import gameStateInstance from '../../game/state.js';
import { drawArtificialHorizon } from '../../game/systems/pfd/pfdComponents.js';

// Panel canvas and SVG references
let leftCanvas, leftSvg;
let centerCanvas, centerSvg;
let rightCanvas, rightSvg;

// Animation loop control
let lastUpdate = 0;
const UPDATE_INTERVAL = 100; // 10fps

/**
 * Initialize main screen panels
 * Sets up canvases, SVG overlays, and game state observers
 */
export function initMainScreen() {
  // Get canvas and SVG elements
  leftCanvas = document.getElementById('left-panel-canvas');
  leftSvg = document.getElementById('left-panel-overlay');
  centerCanvas = document.getElementById('center-panel-canvas');
  centerSvg = document.getElementById('center-panel-overlay');
  rightCanvas = document.getElementById('right-panel-canvas');
  rightSvg = document.getElementById('right-panel-overlay');

  if (!leftCanvas || !centerCanvas || !rightCanvas) {
    console.error('Main screen panels not found in DOM');
    return;
  }

  // Set up game state observers for reactive updates
  setupObservers();
}

/**
 * Set up game state observers to trigger panel updates
 */
function setupObservers() {
  // Left panel updates on sensor/communication changes
  gameStateInstance.addObserver('sensors', () => renderLeftPanel());

  // Center panel updates on navigation/helm changes
  gameStateInstance.addObserver('navigation', () => renderCenterPanel());
  gameStateInstance.addObserver('helm', () => renderCenterPanel());
  gameStateInstance.addObserver('displaySettings', () => renderCenterPanel());

  // Right panel updates on helm/engineering changes
  gameStateInstance.addObserver('helm', () => renderRightPanel());
  gameStateInstance.addObserver('power', () => renderRightPanel());
  gameStateInstance.addObserver('hull', () => renderRightPanel());
}

/**
 * Main update loop - called from bridge animation loop
 * Throttles updates to 10fps
 */
export function updateMainScreen(timestamp) {
  if (timestamp - lastUpdate < UPDATE_INTERVAL) {
    return;
  }
  lastUpdate = timestamp;

  renderLeftPanel();
  renderCenterPanel();
  renderRightPanel();
}

/**
 * Render left panel: Sensors and Communications summary
 */
function renderLeftPanel() {
  if (!leftCanvas) return;

  const ctx = leftCanvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;

  // Set up canvas with proper DPR
  const rect = leftCanvas.getBoundingClientRect();
  const cssWidth = Math.max(1, rect.width);
  const cssHeight = Math.max(1, rect.height);

  if (leftCanvas.width !== Math.round(cssWidth * dpr) || leftCanvas.height !== Math.round(cssHeight * dpr)) {
    leftCanvas.width = Math.round(cssWidth * dpr);
    leftCanvas.height = Math.round(cssHeight * dpr);
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  // Get sensor data from game state
  const sensors = gameStateInstance.getProperty('sensors') || {};
  const shipSonar = sensors.shipSonar || {};
  const wskrs = {
    triton: sensors.triton || {},
    thalassa: sensors.thalassa || {},
    oceanus: sensors.oceanus || {}
  };

  // Draw panel header
  ctx.fillStyle = '#64ffda';
  ctx.font = 'bold 14px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('SENSORS & COMMS', cssWidth / 2, 20);

  // Draw divider line
  ctx.strokeStyle = 'rgba(100, 255, 218, 0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(10, 30);
  ctx.lineTo(cssWidth - 10, 30);
  ctx.stroke();

  // Draw sonar status
  ctx.font = '12px "Courier New", monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#8892b0';
  ctx.fillText('SONAR:', 10, 50);

  const sonarHealth = shipSonar.health || 100;
  ctx.fillStyle = sonarHealth > 80 ? '#00ff00' : sonarHealth > 50 ? '#ffa500' : '#ff4444';
  ctx.fillText(`${Math.round(sonarHealth)}%`, cssWidth - 40, 50);

  // Draw WSKR status
  let y = 70;
  ctx.fillStyle = '#8892b0';
  ctx.fillText('WSKR STATUS:', 10, y);

  y += 20;
  Object.entries(wskrs).forEach(([name, wskr]) => {
    const status = wskr.status || 'offline';
    const linkQuality = wskr.linkQuality || 0;

    ctx.fillStyle = '#64ffda';
    ctx.fillText(name.toUpperCase().substring(0, 8), 15, y);

    // Status indicator
    ctx.fillStyle = status === 'active' ? '#00ff00' : status === 'standby' ? '#ffa500' : '#ff4444';
    ctx.fillText(status.toUpperCase().substring(0, 7), 100, y);

    // Link quality bar if active
    if (status === 'active') {
      const barWidth = 40;
      const barHeight = 8;
      const barX = cssWidth - barWidth - 10;
      const barY = y - 8;

      ctx.strokeStyle = 'rgba(100, 255, 218, 0.3)';
      ctx.strokeRect(barX, barY, barWidth, barHeight);

      ctx.fillStyle = linkQuality > 70 ? '#00ff00' : linkQuality > 40 ? '#ffa500' : '#ff4444';
      ctx.fillRect(barX, barY, barWidth * (linkQuality / 100), barHeight);
    }

    y += 18;
  });

  // Draw communications status
  y += 10;
  ctx.fillStyle = '#8892b0';
  ctx.fillText('COMMUNICATIONS:', 10, y);

  y += 20;
  ctx.fillStyle = '#64ffda';
  ctx.fillText('Radio', 15, y);
  ctx.fillStyle = '#00ff00';
  ctx.fillText('READY', cssWidth - 50, y);

  y += 18;
  ctx.fillStyle = '#64ffda';
  ctx.fillText('ULF', 15, y);
  ctx.fillStyle = '#00ff00';
  ctx.fillText('READY', cssWidth - 50, y);
}

/**
 * Render center panel: Navigation PLAN view
 */
function renderCenterPanel() {
  if (!centerCanvas) return;

  // Get navigation state
  const location = gameStateInstance.getProperty('navigation.location');
  const heading = gameStateInstance.getProperty('helm.currentHeading') || 0;
  const speed = gameStateInstance.getProperty('helm.currentSpeed') || 0;
  const depth = gameStateInstance.getProperty('helm.currentDepth') || 0;
  const range = gameStateInstance.getProperty('displaySettings.navDisplayRange') || 10;

  if (!location || !location.geometry) {
    return;
  }

  // Get overlay settings from game state (set by MFD navigation page)
  const savedOverlays = gameStateInstance.getProperty('navigation.displaySettings.overlaysVisible');
  const overlays = savedOverlays || {
    route: true,
    waypoints: true,
    contours: true,
    hazards: true,
    traffic: true,
    latLonGrid: false
  };

  // Build navigation state for display
  const navState = {
    ownshipPosition: location.geometry.coordinates,
    ownshipTrack: heading, // Use ownshipTrack for rotation (heading-up display)
    selectedHeading: gameStateInstance.getProperty('helm.targetHeading') || heading,
    range: range,
    displayMode: 'PLAN', // Force PLAN mode for main screen
    overlays: overlays
  };

  // Use existing navigation display renderer with 'mainScreen' config
  drawNavigationDisplay(centerCanvas, centerSvg, navState, 'mainScreen');
}

/**
 * Render right panel: Helm and Engineering summary
 */
function renderRightPanel() {
  if (!rightCanvas) return;

  const ctx = rightCanvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;

  // Set up canvas with proper DPR
  const rect = rightCanvas.getBoundingClientRect();
  const cssWidth = Math.max(1, rect.width);
  const cssHeight = Math.max(1, rect.height);

  if (rightCanvas.width !== Math.round(cssWidth * dpr) || rightCanvas.height !== Math.round(cssHeight * dpr)) {
    rightCanvas.width = Math.round(cssWidth * dpr);
    rightCanvas.height = Math.round(cssHeight * dpr);
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  // Get helm and engineering data
  const helm = gameStateInstance.getProperty('helm') || {};
  const power = gameStateInstance.getProperty('power') || {};
  const hull = gameStateInstance.getProperty('hull') || {};

  const speed = helm.currentSpeed || 0;
  const heading = helm.currentHeading || 0;
  const depth = helm.currentDepth || 0;
  const pitch = helm.pitch || 0;
  const roll = helm.roll || 0;

  // === MAIN SECTION: Artificial Horizon with Readouts (65% of height) ===
  const horizonSectionHeight = cssHeight * 0.65;
  const horizonCenterY = horizonSectionHeight / 2;

  // Draw artificial horizon (scaled smaller to fit with readouts)
  ctx.save();
  ctx.translate(0, 0);
  drawArtificialHorizon(ctx, cssWidth, horizonSectionHeight, pitch, roll);
  ctx.restore();

  // Speed readout (left side of horizon)
  ctx.textAlign = 'center';
  ctx.font = 'bold 8px "Courier New", monospace';
  ctx.fillStyle = '#8892b0';
  ctx.fillText('SPD', cssWidth * 0.15, horizonCenterY - 20);

  ctx.font = 'bold 11px "Courier New", monospace';
  ctx.fillStyle = '#64ffda';
  ctx.fillText(Math.abs(Math.round(speed)).toString().padStart(3, '0'), cssWidth * 0.15, horizonCenterY - 5);

  ctx.font = '7px "Courier New", monospace';
  ctx.fillStyle = '#8892b0';
  ctx.fillText('KTS', cssWidth * 0.15, horizonCenterY + 8);

  // Depth readout (right side of horizon)
  ctx.textAlign = 'center';
  ctx.font = 'bold 8px "Courier New", monospace';
  ctx.fillStyle = '#8892b0';
  ctx.fillText('DEP', cssWidth * 0.85, horizonCenterY - 20);

  ctx.font = 'bold 11px "Courier New", monospace';
  ctx.fillStyle = '#64ffda';
  ctx.fillText(Math.round(depth).toString(), cssWidth * 0.85, horizonCenterY - 5);

  ctx.font = '7px "Courier New", monospace';
  ctx.fillStyle = '#8892b0';
  ctx.fillText('M', cssWidth * 0.85, horizonCenterY + 8);

  // Heading readout (below horizon)
  ctx.textAlign = 'center';
  ctx.font = 'bold 8px "Courier New", monospace';
  ctx.fillStyle = '#8892b0';
  ctx.fillText('HDG', cssWidth / 2, horizonSectionHeight - 20);

  ctx.font = 'bold 11px "Courier New", monospace';
  ctx.fillStyle = '#64ffda';
  ctx.fillText(Math.round(heading).toString().padStart(3, '0') + '°', cssWidth / 2, horizonSectionHeight - 7);

  // === BOTTOM SECTION: Engineering Status (35% of height) ===
  const engY = horizonSectionHeight;

  ctx.font = '8px "Courier New", monospace';
  ctx.textAlign = 'left';

  let y = engY + 12;
  ctx.fillStyle = '#8892b0';
  ctx.fillText('ENGINEERING', 10, y);

  // Hull integrity
  y += 12;
  ctx.fillStyle = '#64ffda';
  ctx.font = '8px "Courier New", monospace';
  ctx.fillText('Hull', 10, y);
  drawStatusBar(ctx, cssWidth - 50, y - 5, 40, 5, hull.integrity || 100);

  // Reactor status
  y += 11;
  ctx.fillStyle = '#64ffda';
  ctx.fillText('P.Rct', 10, y);
  drawStatusBar(ctx, cssWidth - 50, y - 5, 40, 5, power.leftReactorHealth || 100);

  y += 11;
  ctx.fillStyle = '#64ffda';
  ctx.fillText('S.Rct', 10, y);
  drawStatusBar(ctx, cssWidth - 50, y - 5, 40, 5, power.rightReactorHealth || 100);

  // Drivetrain status
  y += 11;
  ctx.fillStyle = '#64ffda';
  ctx.fillText('P.Drv', 10, y);
  drawStatusBar(ctx, cssWidth - 50, y - 5, 40, 5, helm.leftDrivetrainHealth || 100);

  y += 11;
  ctx.fillStyle = '#64ffda';
  ctx.fillText('S.Drv', 10, y);
  drawStatusBar(ctx, cssWidth - 50, y - 5, 40, 5, helm.rightDrivetrainHealth || 100);
}

/**
 * Draw a status bar with color-coded health
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} width - Bar width
 * @param {number} height - Bar height
 * @param {number} value - Health value (0-100)
 */
function drawStatusBar(ctx, x, y, width, height, value) {
  // Background
  ctx.strokeStyle = 'rgba(100, 255, 218, 0.3)';
  ctx.strokeRect(x, y, width, height);

  // Fill based on value
  const fillWidth = width * (value / 100);
  ctx.fillStyle = value > 80 ? '#00ff00' : value > 50 ? '#ffa500' : '#ff4444';
  ctx.fillRect(x, y, fillWidth, height);
}
