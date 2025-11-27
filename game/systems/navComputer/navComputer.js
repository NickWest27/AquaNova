// /game/systems/navComputer/navComputer.js
// Enhanced Navigation Computer for Aqua Nova Bridge
// Properly handles canvas scaling with displayManager and virtual resolutions

import { bathymetryTileManager, TILES } from '../bathymetry/bathymetryTileManager.js';
import { drawBathymetryContours } from '../bathymetry/bathymetryRenderer.js';

// Bathymetry data cache
let bathymetryData = null;

/**
 * Get tile bounds for a specific tile name
 * @param {string} tileName - Tile name (e.g., 'n40s30w-80e-70')
 * @returns {Object|null} Tile bounds {n, s, w, e} or null if not found
 */
function getTileBounds(tileName) {
  return bathymetryTileManager.getTileBounds(tileName);
}

/**
 * Update bathymetry data based on current position and range
 * Intelligently loads/unloads tiles based on viewport visibility
 * This is called synchronously - tile manager handles debouncing
 * @param {number} lon - Current longitude
 * @param {number} lat - Current latitude
 * @param {number} range - Display range in nautical miles
 */
function updateBathymetry(lon, lat, range) {
  // Tile manager handles all debouncing and caching
  // Just call update and let it handle the async loading internally
  bathymetryTileManager.update(lon, lat, range)
    .then(data => {
      bathymetryData = data;
    })
    .catch(err => {
      console.warn('BATHYMETRY: Update failed:', err);
    });
}

// Initialize bathymetry data loading with default position
function initBathymetry() {
  const woodsHole = [-70.6709, 41.5223];
  const defaultRange = 10;
  updateBathymetry(woodsHole[0], woodsHole[1], defaultRange);
}

// Start loading bathymetry data immediately
initBathymetry();

/**
 * Get depth at a specific lat/lon position from bathymetry data
 * @param {number} lon - Longitude
 * @param {number} lat - Latitude
 * @returns {number|null} Depth in meters (negative), or null if no data
 */
export function getDepthAtPosition(lon, lat) {
  if (!bathymetryData || !bathymetryData.features) {
    return null;
  }

  // Find the nearest contour to this position
  let nearestDepth = null;
  let nearestDistance = Infinity;

  bathymetryData.features.forEach(feature => {
    if (!feature.geometry || !feature.geometry.coordinates) return;

    const depth = feature.properties?.ELEV ?? null;
    if (depth === null) return;

    // Check distance to any point in this feature
    const coords = feature.geometry.type === 'Polygon'
      ? feature.geometry.coordinates[0]
      : feature.geometry.coordinates;

    coords.forEach(([fLon, fLat]) => {
      // Simple Euclidean distance (good enough for small areas)
      const distance = Math.sqrt(
        Math.pow((fLon - lon) * Math.cos(lat * Math.PI / 180), 2) +
        Math.pow(fLat - lat, 2)
      );

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestDepth = depth;
      }
    });
  });

  return nearestDepth;
}

// Display configuration presets - adjusted for proper scaling
const DISPLAY_CONFIGS = {
  centerDisplay: {
    virtualWidth: 800,
    virtualHeight: 600,
    perspective: { enabled: false },
    navScale: 0.9
  },
  mainScreen: {
    virtualWidth: 1600,   
    virtualHeight: 900,
    perspective: { enabled: false },
    navScale: 0.6       
  },
  helmScreen: {
    virtualWidth: 1200,
    virtualHeight: 600,
    navScale: 0.7
  }
};

function toRadians(deg) {
  return (deg - 90) * Math.PI / 180;
}

export function drawNavigationDisplay(canvas, svg, state, displayType = 'centerDisplay') {
  const config = DISPLAY_CONFIGS[displayType];
  if (!config) {
    console.warn(`Unknown display type: ${displayType}, using centerDisplay`);
    return drawNavigationDisplay(canvas, svg, state, 'centerDisplay');
  }

  // Update bathymetry based on current position and range
  const [lon, lat] = state.ownshipPosition || [-70.6709, 41.5223];
  const range = state.range || 10;
  updateBathymetry(lon, lat, range);

  const ctx = canvas.getContext('2d');

  // Respect devicePixelRatio so the ND can fill the DOM area crisply
  const dpr = window.devicePixelRatio || 1;

  // Use CSS size (getBoundingClientRect) as the layout reference
  const rect = canvas.getBoundingClientRect();
  const cssWidth = Math.max(1, rect.width);
  const cssHeight = Math.max(1, rect.height);

  // Resize canvas backing store to match DPR
  if (canvas.width !== Math.round(cssWidth * dpr) || canvas.height !== Math.round(cssHeight * dpr)) {
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
  }

  // Work in CSS pixels for layout, but scale drawing by DPR
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Clear the logical CSS pixel area
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  // ND center and radius: adjust based on display mode
  const displayMode = state.displayMode || 'ARC';
  let cx, cy;

  if (displayMode === 'PLAN' || displayMode === 'ROSE') {
    // Centered for PLAN and ROSE views
    cx = cssWidth / 2;
    cy = cssHeight / 2;
  } else {
    // Bottom-biased for ARC view
    cx = cssWidth / 2;
    cy = cssHeight * 0.9;
  }

  // Make rings almost fill available area (leave margin for readouts)
  const margin = Math.max(20, Math.min(cssWidth, cssHeight) * 0.04);
  let maxRadius;

  if (displayMode === 'PLAN' || displayMode === 'ROSE') {
    // For centered 360° views, smaller margin for labels
    const labelMargin = 25; // Space for compass labels
    maxRadius = (Math.min(cssWidth, cssHeight) / 2) - labelMargin;
  } else {
    // ARC view uses more of the space since it's bottom-biased
    maxRadius = Math.min(cssWidth, cssHeight) * 0.9 - margin;
  }

  // Draw the navigation content based on display mode
  if (displayMode === 'PLAN') {
    drawPlanContent(ctx, cx, cy, maxRadius, state, cssWidth, cssHeight);
  } else if (displayMode === 'ROSE') {
    drawRoseContent(ctx, cx, cy, maxRadius, state, cssWidth, cssHeight);
  } else {
    // Default ARC view
    drawNavContent(ctx, cx, cy, maxRadius, state, cssWidth, cssHeight);
  }

  // Update SVG overlay to match
  setupSVGOverlay(svg, cx, cy, maxRadius, state, cssWidth, cssHeight);
}

function drawNavContent(ctx, cx, cy, maxRadius, state, canvasWidth, canvasHeight) {
  // console.log(`Drawing nav at center(${cx}, ${cy}) with radius ${maxRadius}`);

  // 1. Clear background with black (like real ND)
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // 2. Draw forward arc range rings (only front 180 degrees)
  drawRangeRings(ctx, cx, cy, maxRadius);

  // 3. Draw tile coverage borders (rotated for heading-up display)
  const rotationAngle = state.ownshipTrack || 0;
  drawTileCoverageBorders(ctx, cx, cy, maxRadius, state, rotationAngle);

  // 4. Draw bathymetry contours if enabled (rotated for heading-up display)
  console.log('NAV DRAW: overlays?', !!state.overlays, 'contours?', !!state.overlays?.contours, 'data?', !!bathymetryData, 'features?', bathymetryData?.features?.length);
  if (state.overlays && state.overlays.contours && bathymetryData) {
    const primaryTile = bathymetryTileManager.primaryTile;
    const tileBounds = primaryTile ? getTileBounds(primaryTile) : null;
    console.log('NAV DRAW: Calling drawBathymetryContours with', bathymetryData.features.length, 'features, primaryTile:', primaryTile, 'tileBounds:', tileBounds);
    drawBathymetryContours(ctx, cx, cy, maxRadius, state, bathymetryData, rotationAngle, tileBounds);
  }

  // 5. Draw compass rose on outer ring (rotates with current heading)
  drawCompassRose(ctx, cx, cy, maxRadius, state.ownshipTrack || 0);

  // 5. Draw bearing lines (every 30 degrees, forward arc only)
  drawBearingLines(ctx, cx, cy, maxRadius);

  // 6. Draw ownship symbol (white hollow triangle at bottom)
  drawOwnshipSymbol(ctx, cx, cy, state.selectedHeading || 0);

  // 7. Draw heading bug and course line
  drawHeadingAndCourse(ctx, cx, cy, maxRadius, state);

  // 8. Draw range labels
  drawRangeLabels(ctx, cx, cy, maxRadius, state.range || 10);
}

function drawRangeRings(ctx, cx, cy, maxRadius) {
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 5]); // Dashed lines like real ND
  
  // Draw only forward arc (180 degrees)
  [0.25, 0.5, 0.75, 1.0].forEach(fraction => {
    const radius = maxRadius * fraction;
    ctx.beginPath();
    // Arc from 180° to 360° (front view)
    ctx.arc(cx, cy, radius, Math.PI, Math.PI * 2);
    ctx.stroke();
  });
  
  ctx.setLineDash([]); // Reset dash pattern
}

function drawCompassRose(ctx, cx, cy, maxRadius, currentHeading) {
  const radius = maxRadius * 0.95;

  // Draw compass markings every 10 degrees
  for (let bearing = 0; bearing < 360; bearing += 10) {
    // Rotate the compass based on current heading (heading-up display)
    const rotatedBearing = bearing - currentHeading;
    const angle = toRadians(rotatedBearing);
    const isMajor = bearing % 30 === 0;
    const isCardinal = bearing % 90 === 0;

    // Only draw markings in the forward arc (roughly 120 degrees each side)
    const relativeAngle = (bearing - currentHeading + 360) % 360;
    if (relativeAngle > 120 && relativeAngle < 240) continue;

    const outerRadius = radius + (isMajor ? 8 : 4);
    const innerRadius = radius;

    const x1 = cx + outerRadius * Math.cos(angle);
    const y1 = cy + outerRadius * Math.sin(angle);
    const x2 = cx + innerRadius * Math.cos(angle);
    const y2 = cy + innerRadius * Math.sin(angle);
    
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = isMajor ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    
    // Add numbers for major headings
    if (isMajor) {
      ctx.fillStyle = "#ffffff";
      ctx.font = "12px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      
      const labelRadius = radius + 20;
      const labelX = cx + labelRadius * Math.cos(angle);
      const labelY = cy + labelRadius * Math.sin(angle);
      
      let label;
      if (isCardinal) {
        // Use cardinal letters
        const cardinals = { 0: "N", 90: "E", 180: "S", 270: "W" };
        label = cardinals[bearing];
      } else {
        // Use abbreviated numbers (03, 06, 09, etc.)
        label = String(Math.round(bearing / 10)).padStart(2, '0');
      }
      
      ctx.fillText(label, labelX, labelY);
    }
  }
}

function drawBearingLines(ctx, cx, cy, maxRadius) {
  ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
  ctx.lineWidth = 1;

  // Draw lines in forward arc every 30 degrees
  // Forward arc is 270° through 0° to 90° (or -90° to +90° in screen coords)
  for (let bearing = 0; bearing < 360; bearing += 30) {
    const angle = toRadians(bearing);
    const startRadius = maxRadius * 0.1;

    const startX = cx + startRadius * Math.cos(angle);
    const startY = cy + startRadius * Math.sin(angle);
    const endX = cx + maxRadius * Math.cos(angle);
    const endY = cy + maxRadius * Math.sin(angle);

    // Draw lines in forward arc (270° to 90° in navigation bearings)
    // In navigation: 0° = North (up), angles increase clockwise
    // Forward arc: bearings from 270° through 0° to 90°
    if (bearing <= 90 || bearing >= 270) {
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
    }
  }
}

function drawOwnshipSymbol(ctx, cx, cy, heading) {
  ctx.save();
  ctx.translate(cx, cy);

  // Ownship triangle pointing up - tip at ship position
  ctx.strokeStyle = "#ffffff";
  ctx.fillStyle = "#000000"; // Black fill for hollow effect
  ctx.lineWidth = 2;

  // Ownship Triangle shape - tip at (0,0), base extends down
  const size = 12;
  ctx.beginPath();
  ctx.moveTo(0, 0);              // Tip at ship position
  ctx.lineTo(-size/2, size * 1.5); // Left base point
  ctx.lineTo(size/2, size * 1.5);  // Right base point
  ctx.closePath();

  ctx.fill();   // Fill with black first
  ctx.stroke(); // Then stroke with white

  ctx.restore();
}

function drawHeadingAndCourse(ctx, cx, cy, maxRadius, state) {
  const selectedHeading = state.selectedHeading || 0;
  const currentTrack = state.ownshipTrack || selectedHeading;

  // In heading-up displays (ARC/ROSE), the display rotates with the ship
  // So we need to draw lines relative to current heading
  const headingOffset = selectedHeading - currentTrack; // Target heading relative to current

  // Course line (current track) - always points straight up in heading-up mode
  ctx.strokeStyle = "#ffff00"; // Yellow for current course
  ctx.lineWidth = 2;
  const courseAngle = toRadians(0); // Straight up (ship's current direction)
  const courseEndX = cx + (maxRadius * 0.9) * Math.cos(courseAngle);
  const courseEndY = cy + (maxRadius * 0.9) * Math.sin(courseAngle);

  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(courseEndX, courseEndY);
  ctx.stroke();

  // Heading bug (target heading) - drawn relative to current track
  if (Math.abs(headingOffset) > 2) {
    ctx.strokeStyle = "#ff00ff"; // Magenta for target heading
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 5]);

    const headingAngle = toRadians(headingOffset);
    const headingEndX = cx + (maxRadius * 0.7) * Math.cos(headingAngle);
    const headingEndY = cy + (maxRadius * 0.7) * Math.sin(headingAngle);

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(headingEndX, headingEndY);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawRangeLabels(ctx, cx, cy, maxRadius, range) {
  ctx.fillStyle = "#ffffff";
  ctx.font = "11px Arial";
  ctx.textBaseline = "middle";

  // Label each ring at a position along the left arc so they track visually with the rings
  [0.25, 0.5, 0.75, 1.0].forEach((fraction, idx) => {
    const r = maxRadius * fraction;
    const value = Math.round((idx + 1) * range / 4);

    // left-most part of the forward arc (180 degrees)
    const angle = Math.PI;

    // compute label position slightly outside the ring
    const labelX = cx + (r + 2) * Math.cos(angle);
    const labelY = cy + (r + 2) * Math.sin(angle);

    // Draw right-aligned so text sits just left of the ring
    ctx.textAlign = 'right';
    ctx.fillText(`${value}`, labelX, labelY);
  });
}

function drawPlanRangeLabels(ctx, cx, cy, maxRadius, range) {
  ctx.fillStyle = "#ffffff";
  ctx.font = "11px Arial";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";

  // Label each ring at the top position (0 degrees / North)
  [0.25, 0.5, 0.75, 1.0].forEach((fraction, idx) => {
    const r = maxRadius * fraction;
    const value = Math.round((idx + 1) * range / 4);

    // Top of the circle (North = 0 degrees = -90 degrees in canvas coords)
    const angle = -Math.PI / 2;

    // Position label just above the ring
    const labelX = cx + r * Math.cos(angle);
    const labelY = cy + r * Math.sin(angle) - 8; // -8 pixels to sit above the ring

    // Draw with background for visibility
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    const textWidth = ctx.measureText(`${value}nm`).width;
    ctx.fillRect(labelX - textWidth/2 - 3, labelY - 8, textWidth + 6, 14);

    ctx.fillStyle = "#ffffff";
    ctx.fillText(`${value}nm`, labelX, labelY);
  });
}

function setupSVGOverlay(svg, _cx, _cy, _maxRadius, state, width, height) {
  if (!svg) return;

  // Clear existing SVG content
  svg.innerHTML = '';

  // Set SVG dimensions to match canvas
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

  // Navigation readouts removed per user request
  // Add context-sensitive info box if relevant data exists
  drawContextInfoBox(svg, state);

  // Add right-side info box for position and depth
  drawPositionInfoBox(svg, state, width);
}

function drawNavigationReadouts(svg, cx, cy, maxRadius, state, width, height) {
  // Top readouts - modern airliner style
  const readouts = [
    { 
      label: "HDG", 
      value: String(Math.round(state.selectedHeading || 0)).padStart(3, '0') + "°", 
      x: 20, 
      y: 25 
    },
    { 
      label: "TRK", 
      value: String(Math.round(state.ownshipTrack || 0)).padStart(3, '0') + "°", 
      x: 120, 
      y: 25 
    },
    { 
      label: "RNG", 
      value: `${state.range || 10}NM`, 
      x: width - 100, 
      y: 25 
    }
  ];

  readouts.forEach(readout => {
    // Create group for each readout
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    
    // Background box
    const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("x", readout.x - 5);
    bg.setAttribute("y", readout.y - 15);
    bg.setAttribute("width", 80);
    bg.setAttribute("height", 20);
    bg.setAttribute("fill", "rgba(0, 0, 0, 0.7)");
    bg.setAttribute("stroke", "#ffffff");
    bg.setAttribute("stroke-width", "1");
    bg.setAttribute("rx", "3");
    group.appendChild(bg);
    
    // Label
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", readout.x);
    label.setAttribute("y", readout.y - 2);
    label.setAttribute("fill", "#00ffff");
    label.setAttribute("font-size", "10");
    label.setAttribute("font-family", "Arial, sans-serif");
    label.setAttribute("font-weight", "bold");
    label.textContent = readout.label;
    group.appendChild(label);

    // Value
    const value = document.createElementNS("http://www.w3.org/2000/svg", "text");
    value.setAttribute("x", readout.x + 25);
    value.setAttribute("y", readout.y - 2);
    value.setAttribute("fill", "#ffffff");
    value.setAttribute("font-size", "12");
    value.setAttribute("font-family", "Arial, sans-serif");
    value.setAttribute("font-weight", "bold");
    value.textContent = readout.value;
    group.appendChild(value);
    
    svg.appendChild(group);
  });
  
  // Add mode indicator
  const modeText = document.createElementNS("http://www.w3.org/2000/svg", "text");
  modeText.setAttribute("x", 20);
  modeText.setAttribute("y", height - 20);
  modeText.setAttribute("fill", "#00ffff");
  modeText.setAttribute("font-size", "12");
  modeText.setAttribute("font-family", "Arial, sans-serif");
  modeText.setAttribute("font-weight", "bold");
  modeText.textContent = state.displayMode || "ARC";
  svg.appendChild(modeText);
}

function drawContextInfoBox(svg, state) {
  // Context-sensitive info box in top left
  // Shows relevant information based on what's selected or active

  let title = null;
  let line1 = null;
  let line2 = null;
  let line3 = null;

  // Check for selected waypoint (if waypoint data exists in state)
  if (state.selectedWaypoint) {
    title = state.selectedWaypoint.name || "WAYPOINT";
    line1 = `BRG: ${Math.round(state.selectedWaypoint.bearing || 0)}°`;
    line2 = `DST: ${(state.selectedWaypoint.distance || 0).toFixed(1)} NM`;
    line3 = state.selectedWaypoint.type ? `TYPE: ${state.selectedWaypoint.type}` : null;
  }
  // Check for destination
  else if (state.destination) {
    title = state.destination.name || "DESTINATION";
    line1 = `BRG: ${Math.round(state.destination.bearing || 0)}°`;
    line2 = `DST: ${(state.destination.distance || 0).toFixed(1)} NM`;
    line3 = state.destination.eta ? `ETA: ${state.destination.eta}` : null;
  }
  // Check for active route
  else if (state.activeRoute) {
    title = "ACTIVE ROUTE";
    line1 = `${state.activeRoute.name || "Route"}`;
    line2 = `WPT: ${state.activeRoute.currentWaypoint || 1}/${state.activeRoute.totalWaypoints || 1}`;
    line3 = `DST: ${(state.activeRoute.remainingDistance || 0).toFixed(1)} NM`;
  }

  // Only draw if we have content
  if (!title) return;

  const x = 10;
  const y = 10;
  const boxWidth = 180;
  const lineHeight = 18;
  const lines = [line1, line2, line3].filter(l => l !== null);
  const boxHeight = 25 + (lines.length * lineHeight);

  // Create container group
  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  group.setAttribute("class", "context-info-box");

  // Background box with semi-transparent fill
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("x", x);
  bg.setAttribute("y", y);
  bg.setAttribute("width", boxWidth);
  bg.setAttribute("height", boxHeight);
  bg.setAttribute("fill", "rgba(0, 20, 40, 0.85)");
  bg.setAttribute("stroke", "#00ffff");
  bg.setAttribute("stroke-width", "2");
  bg.setAttribute("rx", "4");
  group.appendChild(bg);

  // Title text
  const titleText = document.createElementNS("http://www.w3.org/2000/svg", "text");
  titleText.setAttribute("x", x + 10);
  titleText.setAttribute("y", y + 18);
  titleText.setAttribute("fill", "#00ffff");
  titleText.setAttribute("font-size", "13");
  titleText.setAttribute("font-family", "Arial, sans-serif");
  titleText.setAttribute("font-weight", "bold");
  titleText.textContent = title;
  group.appendChild(titleText);

  // Data lines
  lines.forEach((line, index) => {
    const lineText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    lineText.setAttribute("x", x + 10);
    lineText.setAttribute("y", y + 38 + (index * lineHeight));
    lineText.setAttribute("fill", "#ffffff");
    lineText.setAttribute("font-size", "12");
    lineText.setAttribute("font-family", "Courier New, monospace");
    lineText.textContent = line;
    group.appendChild(lineText);
  });

  svg.appendChild(group);
}

function drawPositionInfoBox(svg, state, width) {
  // Right-side info box for present position and depth
  // Always shows current position and depth under keel

  const [lon, lat] = state.ownshipPosition || [-70.6709, 41.5223];
  const depth = getDepthAtPosition(lon, lat);

  // Get tile manager stats
  const stats = bathymetryTileManager.getStats();
  const cacheSizeMB = bathymetryTileManager.getMemoryUsage();

  const line1 = `PPOS: ${formatLatitude(lat)}`;
  const line2 = `      ${formatLongitude(lon)}`;
  const line3 = depth !== null ? `DPTH: ${Math.abs(depth)}m` : "DPTH: ---";
  const line4 = `CACHE: ${cacheSizeMB}MB`;
  const line5 = stats.primaryTile ? `TILE: ${stats.primaryTile}` : "TILE: ---";
  const line6 = stats.currentResolution ? `RES: ${stats.currentResolution}` : "RES: ---";
  const line7 = `TILES: ${stats.uniqueTileCount} loaded`;

  const boxWidth = 90;
  const lineHeight = 10;
  const lines = [line1, line2, line3, line4, line5, line6, line7];
  const boxHeight = 8 + (lines.length * lineHeight);

  const x = width - boxWidth - 5; // 5px from right edge
  const y = 5;

  // Create container group
  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  group.setAttribute("class", "position-info-box");

  // Background box with semi-transparent fill
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("x", x);
  bg.setAttribute("y", y);
  bg.setAttribute("width", boxWidth);
  bg.setAttribute("height", boxHeight);
  bg.setAttribute("fill", "rgba(0, 20, 40, 0.85)");
  bg.setAttribute("stroke", "#00ffff");
  bg.setAttribute("stroke-width", "2");
  bg.setAttribute("rx", "4");
  group.appendChild(bg);

  // Data lines (no title)
  lines.forEach((line, index) => {
    const lineText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    lineText.setAttribute("x", x + 5);
    lineText.setAttribute("y", y + 10 + (index * lineHeight));
    lineText.setAttribute("fill", "#ffffff");
    lineText.setAttribute("font-size", "8");
    lineText.setAttribute("font-family", "Courier New, monospace");
    lineText.textContent = line;
    group.appendChild(lineText);
  });

  svg.appendChild(group);
}

// ============================================================================
// HELPER FUNCTIONS FOR 360° DISPLAYS (PLAN AND ROSE VIEWS)
// ============================================================================

function drawFullRangeRings(ctx, cx, cy, maxRadius) {
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 5]);

  [0.25, 0.5, 0.75, 1.0].forEach(fraction => {
    const radius = maxRadius * fraction;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);  // Full circle
    ctx.stroke();
  });

  ctx.setLineDash([]);
}

function drawFullCompassRose(ctx, cx, cy, maxRadius) {
  const radius = maxRadius * 0.95;

  // Draw all compass markings (0-360)
  for (let bearing = 0; bearing < 360; bearing += 10) {
    const angle = toRadians(bearing);
    const isMajor = bearing % 30 === 0;
    const isCardinal = bearing % 90 === 0;

    const outerRadius = radius + (isMajor ? 8 : 4);
    const innerRadius = radius;

    const x1 = cx + outerRadius * Math.cos(angle);
    const y1 = cy + outerRadius * Math.sin(angle);
    const x2 = cx + innerRadius * Math.cos(angle);
    const y2 = cy + innerRadius * Math.sin(angle);

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = isMajor ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Labels for major headings
    if (isMajor) {
      ctx.fillStyle = "#ffffff";
      ctx.font = "12px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const labelRadius = radius + 20;
      const labelX = cx + labelRadius * Math.cos(angle);
      const labelY = cy + labelRadius * Math.sin(angle);

      let label;
      if (isCardinal) {
        const cardinals = { 0: "N", 90: "E", 180: "S", 270: "W" };
        label = cardinals[bearing];
      } else {
        label = String(Math.round(bearing / 10)).padStart(2, '0');
      }

      ctx.fillText(label, labelX, labelY);
    }
  }
}

function drawFullCompassRoseTrackUp(ctx, cx, cy, maxRadius, currentTrack) {
  const radius = maxRadius * 0.95;

  // Draw all compass markings (0-360) track-up like ARC view
  for (let bearing = 0; bearing < 360; bearing += 10) {
    // Rotate the compass based on current track (track-up display)
    const rotatedBearing = bearing - currentTrack;
    const angle = toRadians(rotatedBearing);
    const isMajor = bearing % 30 === 0;
    const isCardinal = bearing % 90 === 0;

    const outerRadius = radius + (isMajor ? 8 : 4);
    const innerRadius = radius;

    const x1 = cx + outerRadius * Math.cos(angle);
    const y1 = cy + outerRadius * Math.sin(angle);
    const x2 = cx + innerRadius * Math.cos(angle);
    const y2 = cy + innerRadius * Math.sin(angle);

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = isMajor ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Labels for major headings
    if (isMajor) {
      ctx.fillStyle = "#ffffff";
      ctx.font = "12px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const labelRadius = radius + 20;
      const labelX = cx + labelRadius * Math.cos(angle);
      const labelY = cy + labelRadius * Math.sin(angle);

      let label;
      if (isCardinal) {
        const cardinals = { 0: "N", 90: "E", 180: "S", 270: "W" };
        label = cardinals[bearing];
      } else {
        label = String(Math.round(bearing / 10)).padStart(2, '0');
      }

      ctx.fillText(label, labelX, labelY);
    }
  }
}

function drawFullBearingLines(ctx, cx, cy, maxRadius) {
  ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
  ctx.lineWidth = 1;

  // Draw radial lines every 30 degrees (full circle)
  for (let bearing = 0; bearing < 360; bearing += 30) {
    const angle = toRadians(bearing);
    const startRadius = maxRadius * 0.1;

    const startX = cx + startRadius * Math.cos(angle);
    const startY = cy + startRadius * Math.sin(angle);
    const endX = cx + maxRadius * Math.cos(angle);
    const endY = cy + maxRadius * Math.sin(angle);

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
  }
}

function drawOwnshipSymbolRotated(ctx, cx, cy, heading) {
  ctx.save();
  ctx.translate(cx, cy);

  // Convert heading to radians for canvas rotation
  // Heading 0° = North (up), 90° = East (right), etc.
  // Canvas rotation: 0° = right, need to rotate by (heading - 90) to align
  const rotationRad = (heading - 90) * Math.PI / 180;
  ctx.rotate(rotationRad);

  // White hollow triangle - tip at ship position (same geometry as ARC/ROSE mode)
  // Triangle tip at (0,0), base extends to the left in canvas coords, then rotated
  ctx.strokeStyle = "#ffffff";
  ctx.fillStyle = "#000000";
  ctx.lineWidth = 2;

  const size = 12;
  ctx.beginPath();
  ctx.moveTo(0, 0);                   // Tip at ship position (center)
  ctx.lineTo(-size * 1.5, -size/2);  // Top base point (pointing left before rotation)
  ctx.lineTo(-size * 1.5, size/2);   // Bottom base point
  ctx.closePath();

  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

function drawTrackIndicator(ctx, cx, cy, maxRadius, state) {
  // Draw yellow track arrow/line for PLAN view
  if (state.ownshipTrack !== undefined) {
    ctx.strokeStyle = "#ffff00";
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 5]);

    const trackAngle = toRadians(state.ownshipTrack);
    const lineLength = maxRadius * 0.3;
    const endX = cx + lineLength * Math.cos(trackAngle);
    const endY = cy + lineLength * Math.sin(trackAngle);

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Arrow head
    const arrowSize = 8;
    ctx.save();
    ctx.translate(endX, endY);
    ctx.rotate(trackAngle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-arrowSize, -arrowSize/2);
    ctx.lineTo(-arrowSize, arrowSize/2);
    ctx.closePath();
    ctx.fillStyle = "#ffff00";
    ctx.fill();
    ctx.restore();
  }
}

// ============================================================================
// LAT/LON GRID FOR PLAN VIEW
// ============================================================================

function drawLatLonGrid(ctx, cx, cy, maxRadius, state) {
  const range = state.range || 10; // Nautical miles
  const [shipLon, shipLat] = state.ownshipPosition || [-70.6709, 41.5223];

  // Calculate appropriate grid spacing based on range
  // Grid intervals in minutes - aligned to degree/half-degree boundaries
  let gridInterval;
  if (range <= 10) {
    gridInterval = 30;   // 30 minute grid (0.5 degree / 30 NM)
  } else if (range <= 40) {
    gridInterval = 30;   // 30 minute grid (0.5 degree / 30 NM)
  } else if (range <= 80) {
    gridInterval = 60;   // 1 degree grid (60 NM)
  } else if (range <= 160) {
    gridInterval = 60;   // 1 degree grid (60 NM)
  } else if (range <= 320) {
    gridInterval = 120;  // 2 degree grid (120 NM)
  } else if (range <= 640) {
    gridInterval = 300;  // 5 degree grid (300 NM)
  } else {
    gridInterval = 600;  // 10 degree grid (600 NM)
  }

  // Scale factor: pixels per nautical mile
  const scale = maxRadius / range;

  // Longitude scale correction factor (1 minute of longitude = cos(latitude) nautical miles)
  const lonScale = scale * Math.cos(shipLat * Math.PI / 180);

  // Convert lat/lon to minutes
  const shipLatMinutes = shipLat * 60;  // Latitude in minutes
  const shipLonMinutes = shipLon * 60;  // Longitude in minutes

  // Calculate grid start positions - align to grid interval boundaries
  // This ensures grid lines fall on degree or half-degree boundaries
  const latGridStart = Math.floor(shipLatMinutes / gridInterval) * gridInterval;
  const lonGridStart = Math.floor(shipLonMinutes / gridInterval) * gridInterval;

  // Draw grid lines - thin and light grey
  ctx.strokeStyle = "rgba(150, 150, 150, 0.25)"; // Light grey with low opacity
  ctx.lineWidth = 0.5; // Thin lines

  // Calculate grid bounds based on canvas dimensions, not circular range
  // This ensures we fill the entire rectangular canvas appropriately
  const canvasWidth = ctx.canvas.width;
  const canvasHeight = ctx.canvas.height;

  // Calculate how many NM from center to edge in each direction
  // Since cx/cy might not be centered, use the larger of left/right, top/bottom
  const nmToLeft = cx / scale;
  const nmToRight = (canvasWidth - cx) / scale;
  const nmToTop = cy / scale;
  const nmToBottom = (canvasHeight - cy) / scale;

  // For longitude, we need to account for the longitude scale correction
  const nmToLeftLon = cx / lonScale;
  const nmToRightLon = (canvasWidth - cx) / lonScale;

  // Add 20% buffer to ensure we cover the edges
  const latRangeMinutes = Math.max(nmToTop, nmToBottom) * 1.2;
  const lonRangeMinutes = Math.max(nmToLeftLon, nmToRightLon) * 1.2;

  // Vertical lines (longitude lines - run north-south)
  for (let offset = -lonRangeMinutes; offset <= lonRangeMinutes; offset += gridInterval) {
    const lonMinutes = lonGridStart + offset;
    const deltaMinutes = lonMinutes - shipLonMinutes;
    // Use longitude-corrected scale for horizontal positioning
    const x = cx + (deltaMinutes * lonScale);

    // Only draw if within canvas bounds
    if (x >= 0 && x <= canvasWidth) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvasHeight);
      ctx.stroke();

      // Label with actual longitude
      const lonDegrees = lonMinutes / 60;
      const lonLabel = formatLongitude(lonDegrees);
      ctx.fillStyle = "rgba(150, 150, 150, 0.6)"; // Light grey labels
      ctx.font = "10px Arial";
      ctx.textAlign = "center";
      ctx.fillText(lonLabel, x, 15);
    }
  }

  // Horizontal lines (latitude lines - run east-west)
  for (let offset = -latRangeMinutes; offset <= latRangeMinutes; offset += gridInterval) {
    const latMinutes = latGridStart + offset;
    const deltaMinutes = latMinutes - shipLatMinutes;
    // Use regular scale for vertical positioning (1 minute lat = 1 NM)
    const y = cy - (deltaMinutes * scale); // Subtract because canvas Y increases downward

    // Only draw if within canvas bounds
    if (y >= 0 && y <= canvasHeight) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvasWidth, y);
      ctx.stroke();

      // Label with actual latitude
      const latDegrees = latMinutes / 60;
      const latLabel = formatLatitude(latDegrees);
      ctx.fillStyle = "rgba(150, 150, 150, 0.6)"; // Light grey labels
      ctx.font = "10px Arial";
      ctx.textAlign = "left";
      ctx.fillText(latLabel, 5, y - 3);
    }
  }
}

// Helper functions to format lat/lon
export function formatLatitude(lat) {
  const degrees = Math.floor(Math.abs(lat));
  const minutes = Math.abs((lat - Math.floor(lat)) * 60);
  const dir = lat >= 0 ? 'N' : 'S';
  return `${degrees}°${minutes.toFixed(1)}'${dir}`;
}

export function formatLongitude(lon) {
  const degrees = Math.floor(Math.abs(lon));
  const minutes = Math.abs((lon - Math.floor(lon)) * 60);
  const dir = lon >= 0 ? 'E' : 'W';
  return `${degrees}°${minutes.toFixed(1)}'${dir}`;
}

/**
 * Draw tile coverage borders to show charted vs uncharted areas
 */
function drawTileCoverageBorders(ctx, cx, cy, maxRadius, state, rotationAngle = 0) {
  const range = state.range || 10;
  const [shipLon, shipLat] = state.ownshipPosition || [-70.6709, 41.5223];

  // Scale factor: pixels per nautical mile
  const scale = maxRadius / range;
  const lonScale = scale * Math.cos(shipLat * Math.PI / 180);

  // Pre-calculate rotation if needed
  const rotationRad = rotationAngle * Math.PI / 180;
  const cosRot = Math.cos(rotationRad);
  const sinRot = Math.sin(rotationRad);

  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 100, 0.6)"; // Light yellow
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]); // Dashed line

  TILES.forEach(tile => {
    const { n, s, w, e } = tile.bounds;

    // Convert tile corners to canvas coordinates
    const corners = [
      { lat: n, lon: w }, // NW
      { lat: n, lon: e }, // NE
      { lat: s, lon: e }, // SE
      { lat: s, lon: w }  // SW
    ];

    ctx.beginPath();
    corners.forEach((corner, i) => {
      // Convert lat/lon to minutes from ship position
      const deltaLon = (corner.lon - shipLon) * 60;
      const deltaLat = (corner.lat - shipLat) * 60;

      // Apply rotation if needed (for heading-up displays)
      let rotatedDeltaLon, rotatedDeltaLat;
      if (rotationAngle !== 0) {
        rotatedDeltaLon = deltaLon * cosRot - deltaLat * sinRot;
        rotatedDeltaLat = deltaLon * sinRot + deltaLat * cosRot;
      } else {
        rotatedDeltaLon = deltaLon;
        rotatedDeltaLat = deltaLat;
      }

      // Convert to canvas coordinates with longitude correction
      const x = cx + (rotatedDeltaLon * lonScale);
      const y = cy - (rotatedDeltaLat * scale);

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.closePath();
    ctx.stroke();
  });

  ctx.restore();
}

// ============================================================================
// PLAN VIEW RENDERER (North up, ownship centered, 360° view)
// ============================================================================

function drawPlanContent(ctx, cx, cy, maxRadius, state, canvasWidth, canvasHeight) {
  // console.log(`Drawing PLAN view at center(${cx}, ${cy}) with radius ${maxRadius}`);
  // console.log('PLAN view overlays:', state.overlays);

  // 1. Clear background with black
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // 2. Draw tile coverage borders
  drawTileCoverageBorders(ctx, cx, cy, maxRadius, state);

  // 3. Draw bathymetry contours if enabled (north-up, no rotation)
  if (state.overlays && state.overlays.contours && bathymetryData) {
    const primaryTile = bathymetryTileManager.primaryTile;
    const tileBounds = primaryTile ? getTileBounds(primaryTile) : null;
    drawBathymetryContours(ctx, cx, cy, maxRadius, state, bathymetryData, 0, tileBounds);
  }

  // 4. Draw lat/lon grid if enabled
  if (state.overlays && state.overlays.latLonGrid) {
    drawLatLonGrid(ctx, cx, cy, maxRadius, state);
  }

  // 4. Ownship at center, rotated to current heading
  drawOwnshipSymbolRotated(ctx, cx, cy, state.ownshipTrack || 0);

  // 5. Track direction indicator (yellow arrow)
  drawTrackIndicator(ctx, cx, cy, maxRadius, state);
}

// ============================================================================
// ROSE VIEW RENDERER (Track up, ownship centered, rotating compass)
// ============================================================================

function drawRoseContent(ctx, cx, cy, maxRadius, state, canvasWidth, canvasHeight) {
  // console.log(`Drawing ROSE view at center(${cx}, ${cy}) with radius ${maxRadius}`);

  // 1. Clear background with black
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  const track = state.ownshipTrack || 0;
  const heading = state.selectedHeading || 0;

  // 2. Draw full 360° compass rose and range rings (track-up, same as ARC but 360°)
  drawFullCompassRoseTrackUp(ctx, cx, cy, maxRadius, track);
  drawFullRangeRings(ctx, cx, cy, maxRadius);
  drawFullBearingLines(ctx, cx, cy, maxRadius);

  // 3. Draw tile coverage borders (rotated for track-up display)
  const rotationAngle = track || 0;
  drawTileCoverageBorders(ctx, cx, cy, maxRadius, state, rotationAngle);

  // 4. Draw bathymetry contours if enabled (rotated for track-up display)
  if (state.overlays && state.overlays.contours && bathymetryData) {
    const primaryTile = bathymetryTileManager.primaryTile;
    const tileBounds = primaryTile ? getTileBounds(primaryTile) : null;
    drawBathymetryContours(ctx, cx, cy, maxRadius, state, bathymetryData, rotationAngle, tileBounds);
  }

  // 4. Ownship at center pointing up (same as ARC view - no rotation)
  drawOwnshipSymbol(ctx, cx, cy, heading);

  // 5. Draw heading line (cyan) and course line (yellow) like ARC view
  drawHeadingAndCourse(ctx, cx, cy, maxRadius, state);

  // 6. Range labels
  drawRangeLabels(ctx, cx, cy, maxRadius, state.range || 10);
}

