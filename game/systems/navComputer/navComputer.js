// /game/systems/navComputer/navComputer.js
// Enhanced Navigation Computer for Aqua Nova Bridge
// Properly handles canvas scaling with displayManager and virtual resolutions

// Display configuration presets
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
  
  const ctx = canvas.getContext("2d");
  
  // FIXED: Use actual canvas buffer dimensions, accounting for device pixel ratio
  const canvasWidth = canvas.width / (window.devicePixelRatio || 1);
  const canvasHeight = canvas.height / (window.devicePixelRatio || 1);
  
  // Clear the entire canvas using buffer dimensions
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Work in CSS pixel coordinates (adjusted for DPR by bridge.js ctx.scale())
  const cx = canvasWidth / 2;
  const cy = canvasHeight / 2;
  const maxRadius = Math.min(canvasWidth, canvasHeight) * 0.4; // Use 40% of smallest dimension
  
  // Draw the navigation content
  drawNavContent(ctx, cx, cy, maxRadius, state, canvasWidth, canvasHeight);
  
  // Set up SVG overlay to match canvas dimensions
  setupSVGOverlay(svg, cx, cy, maxRadius, state, canvasWidth, canvasHeight);
}

function drawNavContent(ctx, cx, cy, maxRadius, state, canvasWidth, canvasHeight) {
  console.log(`Drawing nav at center(${cx}, ${cy}) with radius ${maxRadius}, canvas ${canvasWidth}x${canvasHeight}`);
  
  // 1. Clear background with dark blue (use CSS pixel dimensions)
  ctx.fillStyle = "#001122";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // 2. Range rings - bright and visible
  ctx.strokeStyle = "#00ffcc";
  ctx.lineWidth = 2;
  [0.25, 0.5, 0.75, 1.0].forEach(fraction => {
    ctx.beginPath();
    ctx.arc(cx, cy, maxRadius * fraction, 0, Math.PI * 2);
    ctx.stroke();
  });

  // 3. Bearing lines (every 30 degrees) - dimmer
  ctx.strokeStyle = "rgba(0, 255, 204, 0.3)";
  ctx.lineWidth = 1;
  for (let bearing = 0; bearing < 360; bearing += 30) {
    const angle = toRadians(bearing);
    const startX = cx + (maxRadius * 0.1) * Math.cos(angle);
    const startY = cy + (maxRadius * 0.1) * Math.sin(angle);
    const endX = cx + maxRadius * Math.cos(angle);
    const endY = cy + maxRadius * Math.sin(angle);
    
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
  };

  // 4. Cardinal direction labels
  ctx.fillStyle = "#ffffff";
  ctx.font = "14px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  
  const directions = [
    { label: "N", angle: 0 },
    { label: "E", angle: 90 },
    { label: "S", angle: 180 },
    { label: "W", angle: 270 }
  ];
  
  directions.forEach(({ label, angle }) => {
    const radian = toRadians(angle);
    const labelX = cx + (maxRadius * 0.85) * Math.cos(radian);
    const labelY = cy + (maxRadius * 0.85) * Math.sin(radian);
    ctx.fillText(label, labelX, labelY);
  });

  // 5. Ownship symbol (submarine)
  drawOwnship(ctx, cx, cy, state.selectedHeading || 0);

  // 6. Heading line
  ctx.strokeStyle = "#ffff00";
  ctx.lineWidth = 3;
  const headingAngle = toRadians(state.selectedHeading || 0);
  const headingEndX = cx + (maxRadius * 0.8) * Math.cos(headingAngle);
  const headingEndY = cy + (maxRadius * 0.8) * Math.sin(headingAngle);
  
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(headingEndX, headingEndY);
  ctx.stroke();

  // 7. Course line (if different from heading)
  if (state.ownshipTrack !== state.selectedHeading) {
    ctx.strokeStyle = "#ff8800";
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 5]);
    const courseAngle = toRadians(state.ownshipTrack);
    const courseEndX = cx + (maxRadius * 0.6) * Math.cos(courseAngle);
    const courseEndY = cy + (maxRadius * 0.6) * Math.sin(courseAngle);
    
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(courseEndX, courseEndY);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawOwnship(ctx, cx, cy, heading) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(toRadians(heading));
  
  // Submarine shape - larger and more visible
  ctx.fillStyle = "#00ffcc";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  
  // Hull (elongated ellipse)
  ctx.beginPath();
  ctx.ellipse(0, 0, 12, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  
  // Conning tower
  ctx.fillRect(-3, -8, 6, 8);
  ctx.strokeRect(-3, -8, 6, 8);
  
  // Bow indicator (small triangle pointing forward)
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(12, 0);
  ctx.lineTo(8, -3);
  ctx.lineTo(8, 3);
  ctx.closePath();
  ctx.fill();
  
  ctx.restore();
}

function setupSVGOverlay(svg, cx, cy, maxRadius, state, width, height) {
  if (!svg) return;
  
  // Clear existing SVG content
  svg.innerHTML = '';
  
  // FIXED: Set SVG dimensions to match canvas CSS dimensions
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  
  // Add range labels
  drawRangeLabels(svg, cx, cy, maxRadius, state);
  
  // Add navigation readouts
  drawNavigationReadouts(svg, cx, cy, maxRadius, state, width, height);
}

function drawRangeLabels(svg, cx, cy, maxRadius, state) {
  [0.25, 0.5, 0.75, 1.0].forEach((fraction, idx) => {
    const r = maxRadius * fraction;
    const angle = toRadians(45); // Upper right position
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    
    const value = Math.round((idx + 1) * (state.range || 10) / 4);
    
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", x);
    text.setAttribute("y", y);
    text.setAttribute("fill", "#00ffcc");
    text.setAttribute("font-size", "12");
    text.setAttribute("text-anchor", "start");
    text.setAttribute("font-family", "monospace");
    text.textContent = `${value}nm`;
    svg.appendChild(text);
  });
}

function drawNavigationReadouts(svg, cx, cy, maxRadius, state, width, height) {
  const readouts = [
    { label: "HDG", value: String(Math.round(state.selectedHeading || 0)).padStart(3, '0'), x: 20, y: 30 },
    { label: "CRS", value: String(Math.round(state.ownshipTrack || 0)).padStart(3, '0'), x: 20, y: 55 },
    { label: "RNG", value: `${state.range || 10}nm`, x: width - 80, y: 30 }
  ];

  readouts.forEach(readout => {
    // Label
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", readout.x);
    label.setAttribute("y", readout.y);
    label.setAttribute("fill", "#00ffcc");
    label.setAttribute("font-size", "12");
    label.setAttribute("font-family", "monospace");
    label.setAttribute("font-weight", "bold");
    label.textContent = readout.label;
    svg.appendChild(label);

    // Value
    const value = document.createElementNS("http://www.w3.org/2000/svg", "text");
    value.setAttribute("x", readout.x + 35);
    value.setAttribute("y", readout.y);
    value.setAttribute("fill", "#ffffff");
    value.setAttribute("font-size", "14");
    value.setAttribute("font-family", "monospace");
    value.setAttribute("font-weight", "bold");
    value.textContent = readout.value;
    svg.appendChild(value);
  });
}