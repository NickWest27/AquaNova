// Synthetic vision: a 3D forward view built from the mapped sea floor, like a window in front of a craft.
// Draws only charted ground (the fog of war stays). Wireframe, far to near, each strip hiding what lies behind it.
// Vertical relief is exaggerated so gentle slopes read. Used by the Remora and WSKR pages (and later the main VIEW screen).
import { sim, toward } from './sim.js';
import { seafloor } from './seafloor.js';
import { SITE_NM } from './rov.js';

const NM_PER_DEG = 60, M_PER_NM = 1852, W = 640, H = 360, SCALE = 2, COLS = 36, ROWS = 24, FOV = 80;

export function createSynth(parent) {
  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE; canvas.height = H * SCALE; canvas.className = 'synth-canvas';
  parent.append(canvas);
  const g = canvas.getContext('2d');
  const api = { canvas, draw(craft, { rangeNm = 0.5, title = '', exag = 4, readout = [] } = {}) {
    g.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    const cx = W / 2, cy = H * 0.4, F = (W / 2) / Math.tan((FOV / 2) * Math.PI / 180);
    const grad = g.createLinearGradient(0, 0, 0, H); grad.addColorStop(0, '#0a0a52'); grad.addColorStop(cy / H, '#2a2ab0'); grad.addColorStop(1, '#0a0a52');
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    const kx = NM_PER_DEG * Math.cos((craft.lat * Math.PI) / 180);
    // grid of sea floor points in craft-relative space (polar: bearing across the view, distance ahead)
    const pts = []; let seen = 0, total = 0;
    for (let j = 0; j < ROWS; j++) {
      const d = rangeNm * ((j + 1) / ROWS) ** 1.35, row = [];
      for (let i = 0; i <= COLS; i++) {
        const a = (-FOV / 2 + (FOV * i) / COLS) * Math.PI / 180, b = (craft.heading * Math.PI) / 180 + a;
        const lat = craft.lat + (d * Math.cos(b)) / NM_PER_DEG, lon = craft.lon + (d * Math.sin(b)) / kx;
        total++;
        const fl = seafloor.ready && seafloor.isCharted(lat, lon) ? seafloor.depthAt(lat, lon) : null;
        const fwd = d * Math.cos(a) * M_PER_NM;
        if (fl == null || fl <= 0 || fwd < 15) { row.push(null); continue; }
        seen++;
        row.push({ x: cx + F * Math.tan(a), y: cy + (F * exag * (fl - craft.depth)) / fwd, d });
      }
      pts.push(row);
    }
    // reference lines: distance rings across the floor at tidy distances, labelled
    const niceStep = [0.02, 0.05, 0.1, 0.25, 0.5, 1, 2].find((v) => rangeNm / v <= 5) || 2;
    const ringRows = new Map();
    for (let m = 1; m * niceStep <= rangeNm * 1.001; m++) {
      let best = 0, bd = 9; for (let j = 0; j < ROWS; j++) { const dd = Math.abs(rangeNm * ((j + 1) / ROWS) ** 1.35 - m * niceStep); if (dd < bd) { bd = dd; best = j; } }
      if (bd < (rangeNm / ROWS) * 1.5) ringRows.set(best, m * niceStep);
    }
    // painter: far strip first; each nearer strip hides the lines behind it
    g.lineJoin = 'round';
    for (let j = ROWS - 1; j >= 1; j--) {
      for (let i = 0; i < COLS; i++) {
        const q = [pts[j][i], pts[j][i + 1], pts[j - 1][i + 1], pts[j - 1][i]];
        if (q.some((v) => !v)) continue;
        const fade = 1 - Math.min(1, q[0].d / rangeNm) * 0.7;
        g.beginPath(); g.moveTo(q[0].x, q[0].y); for (let k = 1; k < 4; k++) g.lineTo(q[k].x, q[k].y); g.closePath();
        g.fillStyle = '#0c0a3e'; g.fill();
        g.strokeStyle = `rgba(150,170,255,${(0.35 + 0.6 * fade).toFixed(2)})`; g.lineWidth = 1; g.stroke();
        if (ringRows.has(j)) { g.strokeStyle = 'rgba(90,240,255,0.95)'; g.lineWidth = 2; g.beginPath(); g.moveTo(q[0].x, q[0].y); g.lineTo(q[1].x, q[1].y); g.stroke(); }
      }
    }
    if (total && seen / total < 0.35) { g.fillStyle = 'rgba(255,200,90,.9)'; g.font = '700 16px monospace'; g.textAlign = 'center'; g.fillText('UNCHARTED GROUND AHEAD', cx, cy + 60); }
    // things in view: points of interest (with a ring showing sampling reach), the ship
    const ch = (craft.heading * Math.PI) / 180, sinH = Math.sin(ch), cosH = Math.cos(ch);
    const P = (lat, lon, depth) => { const t = toward(craft, { lat, lon }), fwd = t.dy * cosH + t.dx * sinH, lat_ = t.dx * cosH - t.dy * sinH; const f = fwd * M_PER_NM; if (f < 15) return null; return { x: cx + (F * lat_ * M_PER_NM) / f, y: cy + (F * exag * (depth - craft.depth)) / f, fwd, brg: t.brg, nm: t.nm }; };
    const onScreen = (p) => p && p.x > -40 && p.x < W + 40;
    const mark = (p, label, col, depth) => {
      const q = P(p.lat, p.lon, depth); if (!onScreen(q) || q.nm > rangeNm * 1.3) return;
      g.fillStyle = col; g.beginPath(); g.moveTo(q.x, q.y - 12); g.lineTo(q.x + 7, q.y); g.lineTo(q.x - 7, q.y); g.closePath(); g.fill();
      g.font = '700 12px monospace'; g.textAlign = 'center'; g.fillText(label, q.x, q.y - 17);
    };
    // sampling reach: a ring on the floor round each site (tools work inside it)
    for (const p of sim.s.pois) {
      if (p.type === 'dock') continue; const fl = seafloor.depthAt(p.lat, p.lon); if (fl == null || toward(craft, p).nm > rangeNm * 1.3) continue;
      g.strokeStyle = 'rgba(255,225,74,0.9)'; g.lineWidth = 2; g.setLineDash([5, 4]); g.beginPath(); let st = false;
      for (let k = 0; k <= 32; k++) { const a = (k / 32) * 6.2832, lat = p.lat + (SITE_NM * Math.cos(a)) / NM_PER_DEG, lon = p.lon + (SITE_NM * Math.sin(a)) / (NM_PER_DEG * Math.cos((p.lat * Math.PI) / 180));
        const dd = seafloor.depthAt(lat, lon), q = dd == null ? null : P(lat, lon, dd); if (!q || q.x < -200 || q.x > W + 200) { st = false; continue; } if (!st) { g.moveTo(q.x, q.y); st = true; } else g.lineTo(q.x, q.y); }
      g.stroke(); g.setLineDash([]);
    }
    for (const p of sim.s.pois) if (p.type !== 'dock') mark(p, p.name.length > 18 ? p.name.slice(0, 17) + '…' : p.name, '#ffe14a', seafloor.depthAt(p.lat, p.lon) || 0);
    mark(sim.s, 'AQUA NOVA', '#3ddc84', sim.s.depth);
    // distance ring labels
    g.font = '700 11px monospace'; g.textAlign = 'left'; g.fillStyle = '#5af0ff';
    for (const [j, dist] of ringRows) { const v = pts[j].find((q, i) => q && i >= COLS / 2 - 1); if (v) g.fillText(`${+dist.toFixed(2)} nm`, Math.min(W - 60, Math.max(10, v.x + 6)), v.y - 3); }
    // target: the nearest site, with a bearing pointer
    let tgt = null; for (const p of sim.s.pois) { if (p.type === 'dock') continue; const t = toward(craft, p); if (t.nm < 3 && (!tgt || t.nm < tgt.t.nm)) tgt = { p, t }; }
    g.textAlign = 'center';
    if (tgt) {
      const rel = ((tgt.t.brg - craft.heading + 540) % 360) - 180, on = tgt.t.nm < SITE_NM;
      g.font = '800 14px monospace'; g.fillStyle = on ? '#6bff9e' : '#ffe14a';
      g.fillText(`TARGET ${tgt.p.name.toUpperCase()}`, cx, 22);
      g.font = '700 13px monospace';
      g.fillText(on ? 'ON SITE · tools ready' : `${tgt.t.nm.toFixed(2)} nm · BRG ${String(Math.round(tgt.t.brg)).padStart(3, '0')} · ${Math.abs(rel) < 3 ? 'AHEAD' : rel < 0 ? `◂ ${Math.round(-rel)}° left` : `${Math.round(rel)}° right ▸`}`, cx, 40);
      if (Math.abs(rel) > FOV / 2) { const left = rel < 0; g.fillStyle = '#ffe14a'; g.beginPath(); const ex = left ? 14 : W - 14, ey = H * 0.45; g.moveTo(ex, ey); g.lineTo(ex + (left ? 22 : -22), ey - 16); g.lineTo(ex + (left ? 22 : -22), ey + 16); g.closePath(); g.fill(); }
      api.target = { name: tgt.p.name, nm: tgt.t.nm, rel, on };
    } else { g.font = '700 13px monospace'; g.fillStyle = '#8fa0ff'; g.fillText('NO SITE WITHIN 3 nm', cx, 22); api.target = null; }
    // HUD: source, readouts, heading tape
    g.textAlign = 'left'; g.fillStyle = '#e8f0ff'; g.font = '800 20px monospace'; g.fillText('SOURCE:', 14, 26); g.fillText(title.toUpperCase(), 14, 48);
    g.font = '700 14px monospace'; g.fillStyle = '#ffe14a'; g.textAlign = 'right';
    readout.forEach((t, k) => g.fillText(t, W - 14, 24 + k * 18));
    g.textAlign = 'left'; g.fillStyle = '#8fa0ff'; g.font = '600 11px monospace'; g.fillText(`VERT ×${exag}  RANGE ${rangeNm} nm`, 14, H - 30);
    const ty = H - 14; g.strokeStyle = '#e8f0ff'; g.lineWidth = 2; g.beginPath(); g.moveTo(10, ty); g.lineTo(W - 10, ty); g.stroke();
    g.font = '600 11px monospace'; g.textAlign = 'center'; g.fillStyle = '#e8f0ff';
    for (let deg = -FOV / 2; deg <= FOV / 2; deg += 1) {
      const b = Math.round(craft.heading + deg + 360) % 360; if (b % 5) continue;
      const x = cx + F * Math.tan((deg * Math.PI) / 180), big = b % 15 === 0;
      g.beginPath(); g.moveTo(x, ty); g.lineTo(x, ty + (big ? 9 : 5)); g.stroke();
      if (big) g.fillText(String(b).padStart(3, '0'), x, ty - 4);
    }
    if (api.target) { const r = Math.max(-FOV / 2 + 2, Math.min(FOV / 2 - 2, api.target.rel)), x = cx + F * Math.tan((r * Math.PI) / 180); g.fillStyle = api.target.on ? '#6bff9e' : '#ff7a3c'; g.beginPath(); g.moveTo(x, ty + 2); g.lineTo(x + 7, ty + 14); g.lineTo(x - 7, ty + 14); g.closePath(); g.fill(); }
    g.fillStyle = '#ffe14a'; g.beginPath(); g.moveTo(cx, ty - 14); g.lineTo(cx + 6, ty - 3); g.lineTo(cx - 6, ty - 3); g.closePath(); g.fill();
  } };
  return api;
}
