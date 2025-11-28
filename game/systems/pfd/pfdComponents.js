// /game/systems/pfd/pfdComponents.js
// Shared PFD Components - Reusable visualization functions
// Can be used by both PFD renderer and main screen displays

/**
 * Draw pitch ladder on artificial horizon
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} radius - Horizon radius
 * @param {number} pitchOffset - Pitch offset in pixels
 * @param {number} currentPitch - Current pitch angle
 */
function drawPitchLadder(ctx, radius, pitchOffset, currentPitch) {
    ctx.strokeStyle = '#FFFFFF';
    ctx.fillStyle = '#FFFFFF';
    ctx.lineWidth = 1;
    ctx.font = '10px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Draw pitch lines every 10 degrees
    for (let pitch = -90; pitch <= 90; pitch += 10) {
        if (pitch === 0) continue;  // Skip horizon line

        const y = pitchOffset - (pitch * 2);  // 2 pixels per degree

        // Only draw if visible within radius
        if (Math.abs(y) > radius * 1.5) continue;

        const lineWidth = pitch % 20 === 0 ? 40 : 25;

        ctx.beginPath();
        ctx.moveTo(-lineWidth, y);
        ctx.lineTo(lineWidth, y);
        ctx.stroke();

        // Draw pitch angle text for major lines
        if (pitch % 20 === 0) {
            ctx.fillText(Math.abs(pitch).toString(), -lineWidth - 15, y);
            ctx.fillText(Math.abs(pitch).toString(), lineWidth + 15, y);
        }
    }
}

/**
 * Draw aircraft symbol (fixed in center of horizon)
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} centerX - Center X coordinate
 * @param {number} centerY - Center Y coordinate
 */
function drawAircraftSymbol(ctx, centerX, centerY) {
    ctx.strokeStyle = '#FFD700';  // Gold color
    ctx.fillStyle = '#FFD700';
    ctx.lineWidth = 3;

    // Center dot
    ctx.beginPath();
    ctx.arc(centerX, centerY, 3, 0, Math.PI * 2);
    ctx.fill();

    // Left wing
    ctx.beginPath();
    ctx.moveTo(centerX - 3, centerY);
    ctx.lineTo(centerX - 30, centerY);
    ctx.lineTo(centerX - 35, centerY + 10);
    ctx.stroke();

    // Right wing
    ctx.beginPath();
    ctx.moveTo(centerX + 3, centerY);
    ctx.lineTo(centerX + 30, centerY);
    ctx.lineTo(centerX + 35, centerY + 10);
    ctx.stroke();
}

/**
 * Draw roll indicator (arc and pointer at top of horizon)
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} centerX - Center X coordinate
 * @param {number} centerY - Center Y coordinate
 * @param {number} radius - Horizon radius
 * @param {number} roll - Current roll angle
 */
function drawRollIndicator(ctx, centerX, centerY, radius, roll) {
    ctx.save();
    ctx.translate(centerX, centerY);

    // Draw roll scale arc (top of horizon)
    ctx.strokeStyle = '#64ffda';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, radius + 10, -Math.PI * 0.75, -Math.PI * 0.25, false);
    ctx.stroke();

    // Draw roll tick marks
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1;
    const rollMarks = [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60];
    rollMarks.forEach(angle => {
        const rad = -angle * Math.PI / 180;
        const r1 = radius + 10;
        const r2 = angle % 30 === 0 ? radius + 18 : radius + 14;

        ctx.beginPath();
        ctx.moveTo(Math.sin(rad) * r1, -Math.cos(rad) * r1);
        ctx.lineTo(Math.sin(rad) * r2, -Math.cos(rad) * r2);
        ctx.stroke();
    });

    // Draw roll pointer (triangle) that rotates with aircraft
    ctx.rotate(-roll * Math.PI / 180);
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.moveTo(0, -(radius + 20));
    ctx.lineTo(-5, -(radius + 10));
    ctx.lineTo(5, -(radius + 10));
    ctx.closePath();
    ctx.fill();

    ctx.restore();
}

/**
 * Draw artificial horizon display
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} width - Display width
 * @param {number} height - Display height
 * @param {number} pitch - Current pitch angle in degrees
 * @param {number} roll - Current roll angle in degrees
 */
export function drawArtificialHorizon(ctx, width, height, pitch, roll) {
    const centerX = width / 2;
    const centerY = height / 2;

    ctx.save();

    // Create circular clipping region for horizon
    const horizonRadius = Math.min(width, height) * 0.35;
    ctx.beginPath();
    ctx.arc(centerX, centerY, horizonRadius, 0, Math.PI * 2);
    ctx.clip();

    // Apply roll rotation
    ctx.translate(centerX, centerY);
    ctx.rotate(-roll * Math.PI / 180);

    // Apply pitch offset (pixels per degree)
    const pitchOffset = pitch * 2;

    // Draw sky (blue)
    ctx.fillStyle = '#4A90E2';
    ctx.fillRect(-horizonRadius * 2, -horizonRadius * 2 + pitchOffset, horizonRadius * 4, horizonRadius * 2);

    // Draw ground (brown)
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(-horizonRadius * 2, pitchOffset, horizonRadius * 4, horizonRadius * 2);

    // Draw horizon line
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-horizonRadius * 2, pitchOffset);
    ctx.lineTo(horizonRadius * 2, pitchOffset);
    ctx.stroke();

    // Draw pitch ladder
    drawPitchLadder(ctx, horizonRadius, pitchOffset, pitch);

    ctx.restore();

    // Draw horizon circle outline
    ctx.strokeStyle = '#64ffda';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, horizonRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Draw aircraft symbol (fixed in center)
    drawAircraftSymbol(ctx, centerX, centerY);

    // Draw roll indicator
    drawRollIndicator(ctx, centerX, centerY, horizonRadius, roll);
}
