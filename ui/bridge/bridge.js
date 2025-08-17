// Handles the bridge system for Aqua Nova

// Functions to go elsewhere on the ship
function exitToQuarters() {
    window.location.href = '../captains-quarters/quarters.html';
}

const CONFIG = {
    ringCount: 4,
    shipYFraction: 2/3,
    strokeColor: '#ffffff',
    textColor: '#ffffff',
    fontPx: 12,
};

const canvas = document.getElementById('navDisplay');
const ctx = canvas.getContext('2d');

function resize() {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const { clientWidth: w, clientHeight: h } = canvas;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
}

window.addEventListener('resize', resize, { passive: true });

function draw() {
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;

    // Clear background
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    const cx = W / 2;
    const cy = H * CONFIG.shipYFraction;
    const baseRadius = Math.min(W, H) * 0.15;

    drawRangeRings(cx, cy, baseRadius);
    drawCompassRose(cx, cy, baseRadius * 4);
    drawOwnShip(cx, cy);
}

function drawRangeRings(cx, cy, baseRadius) {
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = CONFIG.strokeColor;

    for (let i = 1; i <= CONFIG.ringCount; i++) {
        const r = i * baseRadius;

        if (i < CONFIG.ringCount) {
            ctx.setLineDash([4, 4]);
        } else {
            ctx.setLineDash([]);
            ctx.lineWidth = 2;
        }

        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
    }

    ctx.restore();
}

function drawCompassRose(cx, cy, outerRadius) {
    ctx.save();
    ctx.strokeStyle = CONFIG.strokeColor;
    ctx.fillStyle = CONFIG.textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${CONFIG.fontPx}px monospace`;

    for (let deg = 0; deg < 360; deg += 5) {
        const isMajor = deg % 10 === 0;
        const tickLength = isMajor ? 15 : 8;

        const rad = (deg * Math.PI) / 180;
        const x1 = cx + Math.sin(rad) * (outerRadius - tickLength);
        const y1 = cy - Math.cos(rad) * (outerRadius - tickLength);
        const x2 = cx + Math.sin(rad) * outerRadius;
        const y2 = cy - Math.cos(rad) * outerRadius;

        ctx.lineWidth = isMajor ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        if (deg % 10 === 0) {
            const textRadius = outerRadius + 20;
            const textX = cx + Math.sin(rad) * textRadius;
            const textY = cy - Math.cos(rad) * textRadius;
            const label = (deg / 10).toString().padStart(2, '0');
            ctx.fillText(label, textX, textY);
        }
    }

    ctx.restore();
}

function drawOwnShip(cx, cy) {
    const size = 12;
    ctx.save();
    ctx.fillStyle = CONFIG.strokeColor;
    ctx.beginPath();
    ctx.moveTo(cx, cy - size);
    ctx.lineTo(cx - size * 0.6, cy + size * 0.7);
    ctx.lineTo(cx + size * 0.6, cy + size * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

requestAnimationFrame(resize);