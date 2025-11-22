// game/systems/pfd/pfdRenderer.js
// Primary Flight Display (PFD) renderer for helm station
// Aviation-style artificial horizon with speed tape, heading tape, and depth tape

import gameStateInstance from '/game/state.js';
import autopilot from '/game/systems/autopilot/autopilot.js';

export function drawPFD(container) {
    if (!container) {
        console.error('PFD: Container not found');
        return;
    }

    const canvas = container.querySelector('canvas');
    const svg = container.querySelector('svg');

    if (!canvas) {
        console.error('PFD: Canvas not found');
        return;
    }

    const ctx = canvas.getContext('2d');
    const rect = container.getBoundingClientRect();

    // Get helm state from game state
    const currentSpeed = gameStateInstance.getProperty('helm.currentSpeed') || 0;
    const targetSpeed = gameStateInstance.getProperty('helm.targetSpeed') || 0;
    const currentHeading = gameStateInstance.getProperty('helm.currentHeading') || 0;
    const targetHeading = gameStateInstance.getProperty('helm.targetHeading') || 0;
    const currentDepth = gameStateInstance.getProperty('helm.currentDepth') || 0;
    const targetDepth = gameStateInstance.getProperty('helm.targetDepth') || 0;
    const pitch = gameStateInstance.getProperty('helm.pitch') || 0;
    const roll = gameStateInstance.getProperty('helm.roll') || 0;

    // Get trend values from autopilot
    const trends = autopilot.getTrendValues();

    // Clear canvas
    ctx.fillStyle = '#001122';
    ctx.fillRect(0, 0, rect.width, rect.height);

    // Draw artificial horizon
    drawArtificialHorizon(ctx, rect.width, rect.height, pitch, roll);

    // Draw speed tape (left side)
    drawSpeedTape(ctx, rect.height, currentSpeed, targetSpeed, trends.speedTrend);

    // Draw depth tape (right side)
    drawDepthTape(ctx, rect.width, rect.height, currentDepth, targetDepth, trends.depthTrend);

    // Draw heading tape (bottom)
    drawHeadingTape(ctx, rect.width, rect.height, currentHeading, targetHeading, trends.headingTrend);

    // Clear SVG overlay
    if (svg) {
        svg.innerHTML = '';
    }
}

function drawArtificialHorizon(ctx, width, height, pitch, roll) {
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

function drawSpeedTape(ctx, height, currentSpeed, targetSpeed, trendSpeed) {
    const tapeX = 10;
    const tapeY = height / 2;
    const tapeWidth = 60;
    const tapeHeight = height * 0.6;

    // Draw tape background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(tapeX, tapeY - tapeHeight / 2, tapeWidth, tapeHeight);

    ctx.strokeStyle = '#64ffda';
    ctx.lineWidth = 2;
    ctx.strokeRect(tapeX, tapeY - tapeHeight / 2, tapeWidth, tapeHeight);

    // Draw speed scale
    ctx.strokeStyle = '#FFFFFF';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '12px "Courier New", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    const pixelsPerKnot = 3;
    const speedRange = tapeHeight / pixelsPerKnot;

    for (let speed = Math.floor(currentSpeed - speedRange / 2); speed <= currentSpeed + speedRange / 2; speed += 10) {
        const y = tapeY - (speed - currentSpeed) * pixelsPerKnot;

        if (y < tapeY - tapeHeight / 2 || y > tapeY + tapeHeight / 2) continue;

        // Tick mark
        ctx.beginPath();
        ctx.moveTo(tapeX + tapeWidth - 10, y);
        ctx.lineTo(tapeX + tapeWidth, y);
        ctx.stroke();

        // Speed label
        if (speed >= -15 && speed <= 160 && speed % 20 === 0) {
            ctx.fillText(speed.toString(), tapeX + tapeWidth - 12, y);
        }
    }

    // Draw current speed box
    ctx.fillStyle = '#000000';
    ctx.fillRect(tapeX, tapeY - 15, tapeWidth, 30);
    ctx.strokeStyle = '#64ffda';
    ctx.lineWidth = 2;
    ctx.strokeRect(tapeX, tapeY - 15, tapeWidth, 30);

    ctx.fillStyle = '#64ffda';
    ctx.font = 'bold 16px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(currentSpeed.toFixed(1), tapeX + tapeWidth / 2, tapeY);

    // Draw target speed bug
    if (targetSpeed !== currentSpeed) {
        const targetY = tapeY - (targetSpeed - currentSpeed) * pixelsPerKnot;

        if (targetY >= tapeY - tapeHeight / 2 && targetY <= tapeY + tapeHeight / 2) {
            ctx.fillStyle = '#FFD700';
            ctx.beginPath();
            ctx.moveTo(tapeX + tapeWidth, targetY);
            ctx.lineTo(tapeX + tapeWidth + 8, targetY - 5);
            ctx.lineTo(tapeX + tapeWidth + 8, targetY + 5);
            ctx.closePath();
            ctx.fill();
        }
    }

    // Draw trend vector (magenta arrow showing where speed will be in 10 seconds)
    if (trendSpeed !== undefined && Math.abs(trendSpeed - currentSpeed) > 0.5) {
        const trendY = tapeY - (trendSpeed - currentSpeed) * pixelsPerKnot;

        if (trendY >= tapeY - tapeHeight / 2 && trendY <= tapeY + tapeHeight / 2) {
            ctx.strokeStyle = '#FF00FF';  // Magenta
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(tapeX + tapeWidth + 2, tapeY);
            ctx.lineTo(tapeX + tapeWidth + 2, trendY);
            ctx.stroke();

            // Arrow head
            ctx.fillStyle = '#FF00FF';
            const arrowDir = Math.sign(trendY - tapeY);
            ctx.beginPath();
            ctx.moveTo(tapeX + tapeWidth + 2, trendY);
            ctx.lineTo(tapeX + tapeWidth - 1, trendY - arrowDir * 5);
            ctx.lineTo(tapeX + tapeWidth + 5, trendY - arrowDir * 5);
            ctx.closePath();
            ctx.fill();
        }
    }

    // Label
    ctx.fillStyle = '#64ffda';
    ctx.font = 'bold 10px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SPEED', tapeX + tapeWidth / 2, tapeY - tapeHeight / 2 - 10);
    ctx.fillText('KTS', tapeX + tapeWidth / 2, tapeY + tapeHeight / 2 + 15);
}

function drawDepthTape(ctx, width, height, currentDepth, targetDepth, trendDepth) {
    const tapeWidth = 70;
    const tapeX = width - tapeWidth - 10;
    const tapeY = height / 2;
    const tapeHeight = height * 0.6;

    // Draw tape background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(tapeX, tapeY - tapeHeight / 2, tapeWidth, tapeHeight);

    ctx.strokeStyle = '#64ffda';
    ctx.lineWidth = 2;
    ctx.strokeRect(tapeX, tapeY - tapeHeight / 2, tapeWidth, tapeHeight);

    // Draw depth scale
    ctx.strokeStyle = '#FFFFFF';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '12px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const pixelsPerMeter = 1;
    const depthRange = tapeHeight / pixelsPerMeter;

    for (let depth = Math.floor(currentDepth - depthRange / 2); depth <= currentDepth + depthRange / 2; depth += 50) {
        if (depth < 0) continue;

        const y = tapeY + (depth - currentDepth) * pixelsPerMeter;

        if (y < tapeY - tapeHeight / 2 || y > tapeY + tapeHeight / 2) continue;

        // Tick mark
        ctx.beginPath();
        ctx.moveTo(tapeX, y);
        ctx.lineTo(tapeX + 10, y);
        ctx.stroke();

        // Depth label
        if (depth >= 0 && depth <= 10000 && depth % 100 === 0) {
            ctx.fillText(depth.toString(), tapeX + 12, y);
        }
    }

    // Draw current depth box
    ctx.fillStyle = '#000000';
    ctx.fillRect(tapeX, tapeY - 15, tapeWidth, 30);
    ctx.strokeStyle = '#64ffda';
    ctx.lineWidth = 2;
    ctx.strokeRect(tapeX, tapeY - 15, tapeWidth, 30);

    ctx.fillStyle = '#64ffda';
    ctx.font = 'bold 16px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(currentDepth.toFixed(0), tapeX + tapeWidth / 2, tapeY);

    // Draw target depth bug
    if (targetDepth !== currentDepth) {
        const targetY = tapeY + (targetDepth - currentDepth) * pixelsPerMeter;

        if (targetY >= tapeY - tapeHeight / 2 && targetY <= tapeY + tapeHeight / 2) {
            ctx.fillStyle = '#FFD700';
            ctx.beginPath();
            ctx.moveTo(tapeX, targetY);
            ctx.lineTo(tapeX - 8, targetY - 5);
            ctx.lineTo(tapeX - 8, targetY + 5);
            ctx.closePath();
            ctx.fill();
        }
    }

    // Draw trend vector (magenta arrow showing where depth will be in 10 seconds)
    if (trendDepth !== undefined && Math.abs(trendDepth - currentDepth) > 0.5) {
        const trendY = tapeY + (trendDepth - currentDepth) * pixelsPerMeter;

        if (trendY >= tapeY - tapeHeight / 2 && trendY <= tapeY + tapeHeight / 2) {
            ctx.strokeStyle = '#FF00FF';  // Magenta
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(tapeX - 2, tapeY);
            ctx.lineTo(tapeX - 2, trendY);
            ctx.stroke();

            // Arrow head
            ctx.fillStyle = '#FF00FF';
            const arrowDir = Math.sign(trendY - tapeY);
            ctx.beginPath();
            ctx.moveTo(tapeX - 2, trendY);
            ctx.lineTo(tapeX + 1, trendY - arrowDir * 5);
            ctx.lineTo(tapeX - 5, trendY - arrowDir * 5);
            ctx.closePath();
            ctx.fill();
        }
    }

    // Label
    ctx.fillStyle = '#64ffda';
    ctx.font = 'bold 10px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('DEPTH', tapeX + tapeWidth / 2, tapeY - tapeHeight / 2 - 10);
    ctx.fillText('METERS', tapeX + tapeWidth / 2, tapeY + tapeHeight / 2 + 15);
}

function drawHeadingTape(ctx, width, height, currentHeading, targetHeading, trendHeading) {
    const tapeHeight = 40;
    const tapeY = height - tapeHeight - 10;
    const tapeX = width / 2;
    const tapeWidth = width * 0.6;

    // Draw tape background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(tapeX - tapeWidth / 2, tapeY, tapeWidth, tapeHeight);

    ctx.strokeStyle = '#64ffda';
    ctx.lineWidth = 2;
    ctx.strokeRect(tapeX - tapeWidth / 2, tapeY, tapeWidth, tapeHeight);

    // Draw heading scale
    ctx.strokeStyle = '#FFFFFF';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '12px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const pixelsPerDegree = 2;
    const headingRange = tapeWidth / pixelsPerDegree;

    for (let heading = Math.floor(currentHeading - headingRange / 2); heading <= currentHeading + headingRange / 2; heading += 10) {
        let wrappedHeading = heading % 360;
        if (wrappedHeading < 0) wrappedHeading += 360;

        const x = tapeX + (heading - currentHeading) * pixelsPerDegree;

        if (x < tapeX - tapeWidth / 2 || x > tapeX + tapeWidth / 2) continue;

        // Tick mark
        ctx.beginPath();
        ctx.moveTo(x, tapeY);
        ctx.lineTo(x, tapeY + (wrappedHeading % 30 === 0 ? 12 : 8));
        ctx.stroke();

        // Heading label (every 30 degrees)
        if (wrappedHeading % 30 === 0) {
            const label = wrappedHeading === 0 ? 'N' :
                         wrappedHeading === 90 ? 'E' :
                         wrappedHeading === 180 ? 'S' :
                         wrappedHeading === 270 ? 'W' :
                         wrappedHeading.toString();
            ctx.fillText(label, x, tapeY + 14);
        }
    }

    // Draw current heading box
    ctx.fillStyle = '#000000';
    ctx.fillRect(tapeX - 30, tapeY - 5, 60, 25);
    ctx.strokeStyle = '#64ffda';
    ctx.lineWidth = 2;
    ctx.strokeRect(tapeX - 30, tapeY - 5, 60, 25);

    ctx.fillStyle = '#64ffda';
    ctx.font = 'bold 16px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(Math.round(currentHeading).toString().padStart(3, '0') + '°', tapeX, tapeY + 7);

    // Draw target heading bug
    if (targetHeading !== currentHeading) {
        let headingDiff = targetHeading - currentHeading;
        // Normalize to shortest path
        if (headingDiff > 180) headingDiff -= 360;
        if (headingDiff < -180) headingDiff += 360;

        const targetX = tapeX + headingDiff * pixelsPerDegree;

        if (targetX >= tapeX - tapeWidth / 2 && targetX <= tapeX + tapeWidth / 2) {
            ctx.fillStyle = '#FFD700';
            ctx.beginPath();
            ctx.moveTo(targetX, tapeY);
            ctx.lineTo(targetX - 5, tapeY - 8);
            ctx.lineTo(targetX + 5, tapeY - 8);
            ctx.closePath();
            ctx.fill();
        }
    }

    // Draw trend vector (magenta arrow showing where heading will be in 10 seconds)
    if (trendHeading !== undefined) {
        let trendDiff = trendHeading - currentHeading;
        // Normalize to shortest path
        if (trendDiff > 180) trendDiff -= 360;
        if (trendDiff < -180) trendDiff += 360;

        if (Math.abs(trendDiff) > 0.5) {
            const trendX = tapeX + trendDiff * pixelsPerDegree;

            if (trendX >= tapeX - tapeWidth / 2 && trendX <= tapeX + tapeWidth / 2) {
                ctx.strokeStyle = '#FF00FF';  // Magenta
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(tapeX, tapeY - 2);
                ctx.lineTo(trendX, tapeY - 2);
                ctx.stroke();

                // Arrow head
                ctx.fillStyle = '#FF00FF';
                const arrowDir = Math.sign(trendX - tapeX);
                ctx.beginPath();
                ctx.moveTo(trendX, tapeY - 2);
                ctx.lineTo(trendX - arrowDir * 5, tapeY + 1);
                ctx.lineTo(trendX - arrowDir * 5, tapeY - 5);
                ctx.closePath();
                ctx.fill();
            }
        }
    }

    // Label
    ctx.fillStyle = '#64ffda';
    ctx.font = 'bold 10px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('HEADING', tapeX - tapeWidth / 2 + 5, tapeY + tapeHeight / 2);
}
