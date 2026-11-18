// Vertical profile, like the terrain display of an airliner: a side view along the ship's heading.
// Left edge = the ship now. Right edge = the look-ahead range. The terrain fills from the sea floor down;
// the ship sits at its own depth. Terrain turns amber when it is close under the keel and red when it reaches the keel.
import { seafloor } from './seafloor.js';

const NM_PER_DEG = 60, KEEL = 8, WARN_M = 40, N = 72, W = 360, H = 216, SCALE = 2;

export function profileSamples(s, rangeNm) {
  const r = (s.heading * Math.PI) / 180, kx = NM_PER_DEG * Math.cos((s.lat * Math.PI) / 180), out = [];
  for (let i = 0; i <= N; i++) {
    const d = (rangeNm * i) / N;
    out.push(seafloor.ready ? seafloor.depthAt(s.lat + (d * Math.cos(r)) / NM_PER_DEG, s.lon + (d * Math.sin(r)) / kx) : null);
  }
  return out;
}

export function createProfile(parent) {
  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE; canvas.height = H * SCALE; canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  canvas.className = 'prof-canvas';
  parent.append(canvas);
  const ctx = canvas.getContext('2d'); let last = 0, sig = '';
  const api = { canvas, warn: 'ok', draw(s, rangeNm) {
    const key = [s.lat.toFixed(4), s.lon.toFixed(4), Math.round(s.heading), Math.round(s.depth), rangeNm, s.sonar ? 1 : 0].join();
    const now = Date.now(); if (key === sig && now - last < 1000) return; sig = key; last = now;
    const pts = profileSamples(s, rangeNm);
    // Y axis: auto. From the surface down to whichever is deeper, the terrain in view or the ship, rounded to a tidy number.
    const known = pts.filter((v) => v != null), maxFloor = known.length ? Math.max(...known) : 0;
    const need = Math.max(maxFloor, s.depth + KEEL + 10, 30) * 1.05, mag = 10 ** Math.floor(Math.log10(need)), top = 0;
    const bot = [1, 1.5, 2, 3, 5, 10].map((k) => k * mag).find((v) => v >= need);
    const L = 8, R = W - 52, T = 8, B = H - 24, px = (i) => L + ((R - L) * i) / N, py = (m) => T + ((B - T) * (m - top)) / (bot - top);
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    ctx.fillStyle = '#04202e'; ctx.fillRect(0, 0, W, H);
    // depth scale on the right
    const step = [10, 20, 50, 100, 200, 500, 1000, 2000].find((v) => (bot - top) / v <= 5) || 2000;
    ctx.font = '13px monospace'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.strokeStyle = 'rgba(120,200,220,.25)'; ctx.lineWidth = 1; ctx.fillStyle = '#7fb6c6';
    for (let m = Math.ceil(top / step) * step; m < bot; m += step) { const y = py(m); ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(R, y); ctx.stroke(); ctx.fillText(String(m), R + 6, y); }
    // terrain
    let worst = 'ok';
    ctx.beginPath(); let started = false;
    const gap = (v) => (v == null ? null : v - s.depth);
    for (let i = 0; i <= N; i++) {
      const v = pts[i]; if (v == null) { started = false; continue; }
      const y = Math.min(B, py(Math.max(v, 0)));
      if (!started) { ctx.moveTo(px(i), B); ctx.lineTo(px(i), y); started = true; } else ctx.lineTo(px(i), y);
      if (i === N || pts[i + 1] == null) ctx.lineTo(px(i), B);
    }
    ctx.fillStyle = '#6b5a3c'; ctx.fill();
    ctx.beginPath(); started = false;
    for (let i = 0; i <= N; i++) { const v = pts[i]; if (v == null) { started = false; continue; } const y = Math.min(B, py(Math.max(v, 0))); if (!started) { ctx.moveTo(px(i), y); started = true; } else ctx.lineTo(px(i), y); }
    ctx.strokeStyle = '#d9c28f'; ctx.lineWidth = 2; ctx.stroke();
    // hazard shading: the part of the terrain close to the ship's depth
    for (let i = 0; i <= N; i++) {
      const g = gap(pts[i]); if (g == null) continue;
      const lvl = g < KEEL ? 'bad' : g < KEEL + WARN_M ? 'warn' : 'ok';
      if (lvl === 'ok') continue;
      if (lvl === 'bad') worst = 'bad'; else if (worst === 'ok') worst = 'warn';
      ctx.fillStyle = lvl === 'bad' ? 'rgba(255,60,60,.75)' : 'rgba(255,190,60,.55)';
      const y = Math.min(B, py(Math.max(pts[i], 0))); ctx.fillRect(px(i) - 2, y, 4, Math.min(10, B - y));
    }
    // ship path line and ship
    const ys = py(s.depth);
    ctx.setLineDash([6, 5]); ctx.strokeStyle = worst === 'bad' ? '#ff5a5a' : worst === 'warn' ? '#ffbe3c' : '#64ffda'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(L + 18, ys); ctx.lineTo(R, ys); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#e8fbff'; ctx.beginPath(); ctx.moveTo(L + 18, ys); ctx.lineTo(L, ys - 6); ctx.lineTo(L + 3, ys); ctx.lineTo(L, ys + 6); ctx.closePath(); ctx.fill();
    // distance ticks
    ctx.textBaseline = 'top'; ctx.textAlign = 'center'; ctx.fillStyle = '#7fb6c6'; ctx.font = '12px monospace';
    for (let k = 0; k <= 2; k++) { const x = L + ((R - L) * k) / 2; ctx.fillText(k === 0 ? 'NOW' : (rangeNm * k / 2).toFixed(rangeNm < 4 ? 1 : 0) + ' nm', Math.min(Math.max(x, 22), R - 12), B + 4); }
    api.warn = worst;
  } };
  return api;
}
