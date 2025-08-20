// Enhanced Navigation Computer for Aqua Nova Bridge
// Supports multiple display types and 3D perspective

// Display configuration presets
const DISPLAY_CONFIGS = {
  centerDisplay: {
    virtualWidth: 900,    // 9:4 ratio for your center display (356x158)
    virtualHeight: 400,
    perspective: { enabled: false },
    radarScale: 0.8       // Use 80% of display for radar
  },
  mainScreen: {
    virtualWidth: 1600,   // Wide main screen
    virtualHeight: 900,
    perspective: { enabled: false },
    radarScale: 0.6       // Smaller radar on big screen
  },
  helmScreen: {
    virtualWidth: 1200,
    virtualHeight: 600,
    perspective: { 
      enabled: true,
      tiltX: 15,          // Degrees of X tilt (pitch)
      tiltY: -3           // Degrees of Y tilt (yaw)
    },
    radarScale: 0.7
  },
  // Add more configs as you create new displays
  engineeringDisplay: {
    virtualWidth: 800,
    virtualHeight: 600,
    perspective: { enabled: false },
    radarScale: 0.9
  }
};

// Utility: convert degrees to radians (rotated so 0Â° is up)
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
  
  // Calculate scale to fit virtual resolution into actual canvas
  const scaleX = canvas.width / config.virtualWidth;
  const scaleY = canvas.height / config.virtualHeight;
  const scale = Math.min(scaleX, scaleY); // Maintain aspect ratio
  
  // Calculate offset to center the scaled content
  const offsetX = (canvas.width - (config.virtualWidth * scale)) / 2;
  const offsetY = (canvas.height - (config.virtualHeight * scale)) / 2;
  
  // Clear and set up transforms
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);
  
  // Calculate display center and radar size
  const cx = config.virtualWidth / 2;
  const cy = config.virtualHeight / 2;
  const maxRadius = Math.min(config.virtualWidth, config.virtualHeight) * config.radarScale * 0.4;
  
  // Draw the radar display
  drawRadarContent(ctx, cx, cy, maxRadius, state, config);
  
  ctx.restore();
  
  // Set up SVG overlay
  setupSVGOverlay(svg, cx, cy, maxRadius, state, config, canvas);
}

function drawRadarContent(ctx, cx, cy, maxRadius, state, config) {
  // 1. Range rings
  ctx.strokeStyle = "rgba(0, 255, 200, 0.4)"; // Cyan-ish for submarine feel
  ctx.lineWidth = 1;
  [0.25, 0.5, 0.75, 1.0].forEach(fraction => {
    ctx.beginPath();
    ctx.arc(cx, cy, maxRadius * fraction, 0, Math.PI * 2);
    ctx.stroke();
  });

  // 2. Crosshairs
  ctx.strokeStyle = "rgba(0, 255, 200, 0.3)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  // Vertical line
  ctx.moveTo(cx, cy - maxRadius);
  ctx.lineTo(cx, cy + maxRadius);
  // Horizontal line
  ctx.moveTo(cx - maxRadius, cy);
  ctx.lineTo(cx + maxRadius, cy);
  ctx.stroke();

  // 3. Ownship track line (current course)
  ctx.strokeStyle = "#00ff88"; // Bright green
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  const trackEndX = cx + maxRadius * 0.9 * Math.cos(toRadians(state.ownshipTrack));
  const trackEndY = cy + maxRadius * 0.9 * Math.sin(toRadians(state.ownshipTrack));
  ctx.lineTo(trackEndX, trackEndY);
  ctx.stroke();

  // 4. Ownship symbol (submarine shape)
  const shipSize = Math.max(4, maxRadius * 0.025);
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#00ff88";
  ctx.lineWidth = 2;
  
  // Draw submarine shape
  ctx.beginPath();
  ctx.ellipse(cx, cy, shipSize * 1.5, shipSize * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  
  // Conning tower
  ctx.fillRect(cx - shipSize * 0.3, cy - shipSize, shipSize * 0.6, shipSize * 0.5);

  // 5. Selected heading line (desired course)
  ctx.setLineDash([8, 4]);
  ctx.strokeStyle = "#ff00ff"; // Magenta
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  const headingEndX = cx + maxRadius * 1.05 * Math.cos(toRadians(state.selectedHeading));
  const headingEndY = cy + maxRadius * 1.05 * Math.sin(toRadians(state.selectedHeading));
  ctx.lineTo(headingEndX, headingEndY);
  ctx.stroke();
  ctx.setLineDash([]);

  // 6. Sweep line (rotating radar sweep)
  drawRadarSweep(ctx, cx, cy, maxRadius);
}

function drawRadarSweep(ctx, cx, cy, maxRadius) {
  const sweepAngle = (Date.now() / 20) % 360; // 18 second rotation
  const sweepRad = toRadians(sweepAngle);
  
  // Create gradient for sweep effect
  const gradient = ctx.createLinearGradient(
    cx, cy,
    cx + maxRadius * Math.cos(sweepRad),
    cy + maxRadius * Math.sin(sweepRad)
  );
  gradient.addColorStop(0, "rgba(0, 255, 200, 0.3)");
  gradient.addColorStop(0.7, "rgba(0, 255, 200, 0.1)");
  gradient.addColorStop(1, "rgba(0, 255, 200, 0)");
  
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(
    cx + maxRadius * Math.cos(sweepRad),
    cy + maxRadius * Math.sin(sweepRad)
  );
  ctx.stroke();
}

function setupSVGOverlay(svg, cx, cy, maxRadius, state, config, canvas) {
  svg.innerHTML = "";
  
  // Apply perspective CSS if enabled
  if (config.perspective.enabled) {
    svg.style.transformOrigin = 'center center';
    svg.style.transform = `
      perspective(1000px) 
      rotateX(${config.perspective.tiltX}deg)
      rotateY(${config.perspective.tiltY}deg)
    `;
  } else {
    svg.style.transform = '';
  }
  
  svg.setAttribute("viewBox", `0 0 ${config.virtualWidth} ${config.virtualHeight}`);
  svg.style.width = canvas.width + 'px';
  svg.style.height = canvas.height + 'px';

  // Compass rose
  drawCompassRose(svg, cx, cy, maxRadius, config);
  
  // Range labels
  drawRangeLabels(svg, cx, cy, maxRadius, state, config);
  
  // Course and heading readouts
  drawNavigationReadouts(svg, cx, cy, maxRadius, state, config);
}

function drawCompassRose(svg, cx, cy, maxRadius, config) {
  const compassRadius = maxRadius + 15;
  
  for (let i = 0; i < 360; i += 5) {
    const angle = toRadians(i);
    const is10 = i % 10 === 0;
    const is30 = i % 30 === 0;
    
    const innerRadius = compassRadius - (is30 ? 12 : (is10 ? 8 : 4));
    const outerRadius = compassRadius;

    const x1 = cx + innerRadius * Math.cos(angle);
    const y1 = cy + innerRadius * Math.sin(angle);
    const x2 = cx + outerRadius * Math.cos(angle);
    const y2 = cy + outerRadius * Math.sin(angle);

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", x1);
    line.setAttribute("y1", y1);
    line.setAttribute("x2", x2);
    line.setAttribute("y2", y2);
    line.setAttribute("stroke", "#00ff88");
    line.setAttribute("stroke-width", is30 ? 2 : (is10 ? 1.5 : 1));
    svg.appendChild(line);

    // Major compass labels
    if (is30) {
      const labelRadius = compassRadius + 20;
      const lx = cx + labelRadius * Math.cos(angle);
      const ly = cy + labelRadius * Math.sin(angle);
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", lx);
      text.setAttribute("y", ly);
      text.setAttribute("fill", "#00ff88");
      text.setAttribute("font-size", Math.max(10, maxRadius * 0.06));
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "middle");
      text.setAttribute("font-family", "monospace");
      text.setAttribute("font-weight", "bold");
      text.textContent = i === 0 ? "000" : String(i).padStart(3,"0");
      svg.appendChild(text);
    }
  }
}

function drawRangeLabels(svg, cx, cy, maxRadius, state, config) {
  [0.25, 0.5, 0.75, 1.0].forEach((fraction, idx) => {
    const r = maxRadius * fraction;
    const positions = [
      { angle: 135, align: 'end' },    // Upper left
      { angle: 45, align: 'start' },   // Upper right
    ];

    positions.forEach(pos => {
      const angle = toRadians(pos.angle);
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      
      const value = Math.round((idx + 1) * state.range / 4);
      
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", x);
      text.setAttribute("y", y);
      text.setAttribute("fill", "#00ffcc");
      text.setAttribute("font-size", Math.max(8, maxRadius * 0.04));
      text.setAttribute("text-anchor", pos.align);
      text.setAttribute("dominant-baseline", "middle");
      text.setAttribute("font-family", "monospace");
      text.textContent = `${value}nm`;
      svg.appendChild(text);
    });
  });
}

function drawNavigationReadouts(svg, cx, cy, maxRadius, state, config) {
  const readouts = [
    { label: "HDG", value: String(Math.round(state.selectedHeading)).padStart(3, '0'), x: cx - maxRadius - 40, y: cy - maxRadius + 20 },
    { label: "CRS", value: String(Math.round(state.ownshipTrack)).padStart(3, '0'), x: cx - maxRadius - 40, y: cy - maxRadius + 40 },
    { label: "RNG", value: `${state.range}nm`, x: cx + maxRadius + 20, y: cy - maxRadius + 20 }
  ];

  readouts.forEach(readout => {
    // Label
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", readout.x);
    label.setAttribute("y", readout.y);
    label.setAttribute("fill", "#00ffcc");
    label.setAttribute("font-size", Math.max(10, maxRadius * 0.05));
    label.setAttribute("font-family", "monospace");
    label.setAttribute("font-weight", "bold");
    label.textContent = readout.label;
    svg.appendChild(label);

    // Value
    const value = document.createElementNS("http://www.w3.org/2000/svg", "text");
    value.setAttribute("x", readout.x + 40);
    value.setAttribute("y", readout.y);
    value.setAttribute("fill", "#ffffff");
    value.setAttribute("font-size", Math.max(12, maxRadius * 0.06));
    value.setAttribute("font-family", "monospace");
    value.setAttribute("font-weight", "bold");
    value.textContent = readout.value;
    svg.appendChild(value);
  });
}

// Animation function for radar sweep
export function animateNavigationDisplay(canvas, svg, state, displayType = 'centerDisplay') {
  drawNavigationDisplay(canvas, svg, state, displayType);
  requestAnimationFrame(() => animateNavigationDisplay(canvas, svg, state, displayType));
}