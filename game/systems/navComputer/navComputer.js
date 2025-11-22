// /game/systems/navComputer/navComputer.js
// Enhanced Navigation Computer for Aqua Nova Bridge
// Properly handles canvas scaling with displayManager and virtual resolutions

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
  console.log(`Drawing nav at center(${cx}, ${cy}) with radius ${maxRadius}`);
  
  // 1. Clear background with black (like real ND)
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // 2. Draw forward arc range rings (only front 180 degrees)
  drawRangeRings(ctx, cx, cy, maxRadius);

  // 3. Draw compass rose on outer ring
  drawCompassRose(ctx, cx, cy, maxRadius, state.selectedHeading || 0);

  // 4. Draw bearing lines (every 30 degrees, forward arc only)
  drawBearingLines(ctx, cx, cy, maxRadius);

  // 5. Draw ownship symbol (white hollow triangle at bottom)
  drawOwnshipSymbol(ctx, cx, cy, state.selectedHeading || 0);

  // 6. Draw heading bug and course line
  drawHeadingAndCourse(ctx, cx, cy, maxRadius, state);

  // 7. Draw range labels
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
    const angle = toRadians(bearing);
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
  
  // Only draw lines in forward arc, every 30 degrees
  for (let bearing = 0; bearing < 360; bearing += 30) {
    const angle = toRadians(bearing);
    const startRadius = maxRadius * 0.1;
    
    const startX = cx + startRadius * Math.cos(angle);
    const startY = cy + startRadius * Math.sin(angle);
    const endX = cx + maxRadius * Math.cos(angle);
    const endY = cy + maxRadius * Math.sin(angle);
    
    // Only draw if in forward view
    if (angle >= Math.PI && angle <= Math.PI * 2) {
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

  // Add small white dot at tip (ship position)
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(0, 0, 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawHeadingAndCourse(ctx, cx, cy, maxRadius, state) {
  const selectedHeading = state.selectedHeading || 0;
  const currentTrack = state.ownshipTrack || selectedHeading;
  
  // Heading bug (yellow/cyan line)
  ctx.strokeStyle = "#00ffff";
  ctx.lineWidth = 2;
  const headingAngle = toRadians(selectedHeading);
  const headingEndX = cx + (maxRadius * 0.9) * Math.cos(headingAngle);
  const headingEndY = cy + (maxRadius * 0.9) * Math.sin(headingAngle);
  
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(headingEndX, headingEndY);
  ctx.stroke();
  
  // Course line (if different from heading)
  if (Math.abs(currentTrack - selectedHeading) > 2) {
    ctx.strokeStyle = "#ffff00";
    ctx.lineWidth = 1;
    ctx.setLineDash([10, 5]);
    
    const courseAngle = toRadians(currentTrack);
    const courseEndX = cx + (maxRadius * 0.7) * Math.cos(courseAngle);
    const courseEndY = cy + (maxRadius * 0.7) * Math.sin(courseAngle);
    
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(courseEndX, courseEndY);
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

function setupSVGOverlay(svg, cx, cy, maxRadius, state, width, height) {
  if (!svg) return;
  
  // Clear existing SVG content
  svg.innerHTML = '';
  
  // Set SVG dimensions to match canvas
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  
  // Add navigation readouts in corners
  drawNavigationReadouts(svg, cx, cy, maxRadius, state, width, height);
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
    // Calculate angle relative to track (same logic as ARC view compass)
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
  ctx.rotate(toRadians(heading));  // Rotate to heading

  // White hollow triangle - tip at (0,0), base extends down
  ctx.strokeStyle = "#ffffff";
  ctx.fillStyle = "#000000";
  ctx.lineWidth = 2;

  const size = 12;
  ctx.beginPath();
  ctx.moveTo(0, 0);              // Tip at ship position
  ctx.lineTo(-size/2, size * 1.5); // Left base point
  ctx.lineTo(size/2, size * 1.5);  // Right base point
  ctx.closePath();

  ctx.fill();
  ctx.stroke();

  // Center dot at tip (ship position)
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(0, 0, 2, 0, Math.PI * 2);
  ctx.fill();

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
  // Grid intervals in minutes (1 minute = 1 nautical mile latitude)
  let gridInterval;
  if (range <= 5) {
    gridInterval = 1;  // 1 minute grid
  } else if (range <= 10) {
    gridInterval = 2;  // 2 minute grid
  } else if (range <= 20) {
    gridInterval = 5;  // 5 minute grid
  } else if (range <= 40) {
    gridInterval = 10; // 10 minute grid
  } else {
    gridInterval = 15; // 15 minute grid
  }

  // Scale factor: pixels per nautical mile
  const scale = maxRadius / range;

  // Convert lat/lon to minutes
  const shipLatMinutes = shipLat * 60;  // Latitude in minutes
  const shipLonMinutes = shipLon * 60;  // Longitude in minutes

  // Calculate grid start positions (round to nearest grid interval)
  const latGridStart = Math.floor(shipLatMinutes / gridInterval) * gridInterval;
  const lonGridStart = Math.floor(shipLonMinutes / gridInterval) * gridInterval;

  // Draw grid lines
  ctx.strokeStyle = "rgba(0, 255, 255, 0.3)"; // Cyan with transparency
  ctx.lineWidth = 1;

  // Calculate grid bounds (in nautical miles from center)
  const gridRange = range * 1.2; // Slightly larger than display range

  // Vertical lines (longitude lines - run north-south)
  for (let offset = -gridRange; offset <= gridRange; offset += gridInterval) {
    const lonMinutes = lonGridStart + offset;
    const deltaMinutes = lonMinutes - shipLonMinutes;
    const x = cx + (deltaMinutes * scale);

    // Only draw if within canvas bounds
    if (x >= 0 && x <= ctx.canvas.width) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, ctx.canvas.height);
      ctx.stroke();

      // Label with actual longitude
      const lonDegrees = lonMinutes / 60;
      const lonLabel = formatLongitude(lonDegrees);
      ctx.fillStyle = "rgba(0, 255, 255, 0.6)";
      ctx.font = "10px Arial";
      ctx.textAlign = "center";
      ctx.fillText(lonLabel, x, 15);
    }
  }

  // Horizontal lines (latitude lines - run east-west)
  for (let offset = -gridRange; offset <= gridRange; offset += gridInterval) {
    const latMinutes = latGridStart + offset;
    const deltaMinutes = latMinutes - shipLatMinutes;
    const y = cy - (deltaMinutes * scale); // Subtract because canvas Y increases downward

    // Only draw if within canvas bounds
    if (y >= 0 && y <= ctx.canvas.height) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(ctx.canvas.width, y);
      ctx.stroke();

      // Label with actual latitude
      const latDegrees = latMinutes / 60;
      const latLabel = formatLatitude(latDegrees);
      ctx.fillStyle = "rgba(0, 255, 255, 0.6)";
      ctx.font = "10px Arial";
      ctx.textAlign = "left";
      ctx.fillText(latLabel, 5, y - 3);
    }
  }

  // Draw center crosshair
  ctx.strokeStyle = "rgba(0, 255, 255, 0.8)";
  ctx.lineWidth = 2;
  const crosshairSize = 20;

  // Vertical center line
  ctx.beginPath();
  ctx.moveTo(cx, cy - crosshairSize);
  ctx.lineTo(cx, cy + crosshairSize);
  ctx.stroke();

  // Horizontal center line
  ctx.beginPath();
  ctx.moveTo(cx - crosshairSize, cy);
  ctx.lineTo(cx + crosshairSize, cy);
  ctx.stroke();

  // Center label with ship position
  ctx.fillStyle = "#00ffff";
  ctx.font = "12px Arial";
  ctx.textAlign = "center";
  const shipPosLabel = `${formatLatitude(shipLat)} ${formatLongitude(shipLon)}`;
  ctx.fillText(shipPosLabel, cx, cy - 25);
}

// Helper functions to format lat/lon
function formatLatitude(lat) {
  const degrees = Math.floor(Math.abs(lat));
  const minutes = Math.abs((lat - Math.floor(lat)) * 60);
  const dir = lat >= 0 ? 'N' : 'S';
  return `${degrees}°${minutes.toFixed(1)}'${dir}`;
}

function formatLongitude(lon) {
  const degrees = Math.floor(Math.abs(lon));
  const minutes = Math.abs((lon - Math.floor(lon)) * 60);
  const dir = lon >= 0 ? 'E' : 'W';
  return `${degrees}°${minutes.toFixed(1)}'${dir}`;
}

// ============================================================================
// PLAN VIEW RENDERER (North up, ownship centered, 360° view)
// ============================================================================

function drawPlanContent(ctx, cx, cy, maxRadius, state, canvasWidth, canvasHeight) {
  console.log(`Drawing PLAN view at center(${cx}, ${cy}) with radius ${maxRadius}`);
  console.log('PLAN view overlays:', state.overlays);

  // 1. Clear background with black
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // 2. Draw lat/lon grid if enabled
  if (state.overlays && state.overlays.latLonGrid) {
    console.log('Drawing lat/lon grid...');
    drawLatLonGrid(ctx, cx, cy, maxRadius, state);
  } else {
    console.log('Lat/lon grid NOT drawing - overlays:', state.overlays);
  }

  // 3. Ownship at center, rotated to heading
  drawOwnshipSymbolRotated(ctx, cx, cy, state.selectedHeading || 0);

  // 4. Track direction indicator (yellow arrow)
  drawTrackIndicator(ctx, cx, cy, maxRadius, state);
}

// ============================================================================
// ROSE VIEW RENDERER (Track up, ownship centered, rotating compass)
// ============================================================================

function drawRoseContent(ctx, cx, cy, maxRadius, state, canvasWidth, canvasHeight) {
  console.log(`Drawing ROSE view at center(${cx}, ${cy}) with radius ${maxRadius}`);

  // 1. Clear background with black
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  const track = state.ownshipTrack || 0;
  const heading = state.selectedHeading || 0;

  // 2. Draw full 360° compass rose and range rings (track-up, same as ARC but 360°)
  drawFullCompassRoseTrackUp(ctx, cx, cy, maxRadius, track);
  drawFullRangeRings(ctx, cx, cy, maxRadius);
  drawFullBearingLines(ctx, cx, cy, maxRadius);

  // 3. Ownship at center pointing up (same as ARC view - no rotation)
  drawOwnshipSymbol(ctx, cx, cy, heading);

  // 4. Draw heading line (cyan) and course line (yellow) like ARC view
  drawHeadingAndCourse(ctx, cx, cy, maxRadius, state);

  // 5. Range labels
  drawRangeLabels(ctx, cx, cy, maxRadius, state.range || 10);
}