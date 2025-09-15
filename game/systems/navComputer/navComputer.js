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

  // ND center and radius: move center up so arcs fill upward area
  const cx = cssWidth / 2;
  const cy = cssHeight * 0.9; // lift center so forward arcs occupy most of the display

  // Make rings almost fill available area (leave margin for readouts)
  const margin = Math.max(20, Math.min(cssWidth, cssHeight) * 0.04);
  const maxRadius = Math.min(cssWidth, cssHeight) * 0.9 - margin;

  // Draw the navigation content in CSS pixel coordinates
  drawNavContent(ctx, cx, cy, maxRadius, state, cssWidth, cssHeight);

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
    
    const outerRadius = radius;
    const innerRadius = radius - (isMajor ? 15 : 8);
    
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
      
      const labelRadius = radius - 25;
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
  
  // White hollow triangle pointing up (north-oriented)
  ctx.strokeStyle = "#ffffff";
  ctx.fillStyle = "#000000"; // Black fill for hollow effect
  ctx.lineWidth = 2;
  
  // Triangle shape (pointing up when heading = 0)
  const size = 12;
  ctx.beginPath();
  ctx.moveTo(0, -size);      // Top point
  ctx.lineTo(-size/2, size/2); // Bottom left
  ctx.lineTo(size/2, size/2);   // Bottom right
  ctx.closePath();
  
  ctx.fill();   // Fill with black first
  ctx.stroke(); // Then stroke with white
  
  // Add small white dot in center
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
  ctx.lineWidth = 3;
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
    ctx.lineWidth = 2;
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
    const labelX = cx + (r + 8) * Math.cos(angle);
    const labelY = cy + (r + 8) * Math.sin(angle);

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
  modeText.textContent = "ARC";
  svg.appendChild(modeText);
}