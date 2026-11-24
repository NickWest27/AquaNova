// Pixel-native navigation chart for the retro bridge. Same interface as js/nd.js (createND), but it draws at art-pixel size
// (one canvas pixel = one art pixel), uses only palette colors and the AQ Pixel font.
import { sim, toward } from '../js/sim.js';
import { seafloor } from '../js/seafloor.js';
import { seen as seenShips } from '../js/traffic.js';
import { affiliation } from '../js/contactIcons.js';
import { frameThrottle } from '../js/util.js';
import { PAL } from './palette.js';

const RANGES = [0.5, 1, 2, 4, 8, 16, 32, 64, 128, 256];
const rgb = (slot) => PAL[slot];
const FILL = [[0.01, 14], [10, 25], [30, 24], [60, 23], [120, 22], [250, 21], [600, 20], [1500, 19], [3000, 18], [1e9, 17]];
const slotFor = (d) => { for (const [m, c] of FILL) if (d < m) return c; return 17; };
const AFF = { unknown: 11, friendly: 13, neutral: 14, unfriendly: 54, hostile: 15 };
let snap = null;   // palette lookup for snapping canvas pixels
function paletteSnap(data) {
  if (!snap) { snap = new Map(); }
  for (let i = 0; i < data.length; i += 4) {
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    let c = snap.get(key);
    if (c === undefined) {
      let bd = 1e9, bi = 0;
      for (let k = 0; k < PAL.length; k++) { const p = parseHex(PAL[k]); const d = (p[0] - data[i]) ** 2 + (p[1] - data[i + 1]) ** 2 + (p[2] - data[i + 2]) ** 2; if (d < bd) { bd = d; bi = k; } }
      c = parseHex(PAL[bi]); snap.set(key, c);
    }
    data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
  }
}
const hexCache = new Map();
function parseHex(h) { let v = hexCache.get(h); if (!v) { v = [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; hexCache.set(h, v); } return v; }

export function createND(wrap, { onPick, trackUp = false, rings = false } = {}) {
  const compact = rings;   // the console asks for rings on the small track-up copy
  const canvas = document.createElement('canvas'); wrap.prepend(canvas);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const nd = { range: 8, sel: null, selWskr: null, show: { ships: true, subs: true, base: true, orgs: true, labels: true }, w: 0, h: 0, canvas, pan: null };
  const ctr = () => (nd.pan ? { lat: nd.pan.lat, lon: nd.pan.lon, heading: sim.s.heading } : { lat: sim.s.lat, lon: sim.s.lon, heading: sim.s.heading });
  function resize() {
    const w = wrap.offsetWidth, h = wrap.offsetHeight; if (!w || !h) return;
    nd.w = w; nd.h = h; canvas.width = w; canvas.height = h; canvas.style.width = w + 'px'; canvas.style.height = h + 'px'; nd.draw();
  }
  const scaleOf = () => (Math.min(nd.w, nd.h) / 2 - 3) / nd.range;   // art pixels per nm
  const px = (p) => {
    const c = ctr(), t = toward(c, p), sc = scaleOf();
    let dx = t.dx, dy = t.dy;
    if (trackUp) { const h = (c.heading * Math.PI) / 180, co = Math.cos(h), si = Math.sin(h); [dx, dy] = [dx * co - dy * si, dx * si + dy * co]; }
    return { x: Math.round(nd.w / 2 + dx * sc), y: Math.round(nd.h / 2 - dy * sc), nm: t.nm, brg: t.brg };
  };
  const dot = (x, y, c) => { ctx.fillStyle = rgb(c); ctx.fillRect(x, y, 1, 1); };
  const text = (s, x, y, c, align = 'left') => { ctx.fillStyle = rgb(c); ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.fillText(s, Math.round(x), Math.round(y)); };
  const rect = (x, y, w, h, c) => { ctx.fillStyle = rgb(c); ctx.fillRect(x, y, w, h); };
  nd.draw = () => {
    const { w, h } = nd; if (!w || !h) return;
    const s = sim.s, c = ctr(), sc = scaleOf(), step = 2;
    ctx.font = '8px "AQ Pixel", monospace'; ctx.imageSmoothingEnabled = false;
    rect(0, 0, w, h, 0);
    // sea floor: a fill by depth, one 2 x 2 cell at a time
    if (seafloor.ready) {
      const hd = trackUp ? (c.heading * Math.PI) / 180 : 0, co = Math.cos(hd), si = Math.sin(hd), kx = 60 * Math.cos((c.lat * Math.PI) / 180);
      for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
        const ex = (x + 1 - w / 2) / sc, ny = (h / 2 - (y + 1)) / sc;   // nm east, north on the screen
        const e = ex * co + ny * si, n = -ex * si + ny * co;            // undo the heading turn
        const d = seafloor.depthAt(c.lat + n / 60, c.lon + e / kx);
        if (d == null) { if (((x + y) >> 1) % 3 === 0) rect(x, y, step, step, 56); else rect(x, y, step, step, 0); }
        else rect(x, y, step, step, slotFor(d));
      }
    }
    // range rings on the compact (track up) chart
    if (compact) { for (let i = 1; i <= 2; i++) { const r = ((Math.min(w, h) / 2 - 3) * i) / 2; for (let a = 0; a < 64; a++) { const t = (a / 64) * 6.2832; dot(Math.round(w / 2 + Math.cos(t) * r), Math.round(h / 2 + Math.sin(t) * r), 29); } } }
    // places
    ctx.textAlign = 'left';
    for (const poi of s.pois) {
      if (poi.type === 'dock' && !nd.show.base) continue;
      const p = px(poi); if (p.x < -6 || p.x > w + 6 || p.y < -6 || p.y > h + 6) continue;
      const isSel = nd.sel && nd.sel.id === poi.id, isW = s.wpt && s.wpt.id === poi.id;
      const col = isW ? 12 : isSel ? 10 : poi.stance === 'hostile' ? 15 : poi.stance === 'wary' ? 54 : 11;
      rect(p.x - 1, p.y - 2, 3, 5, 0); rect(p.x - 2, p.y - 1, 5, 3, 0);   // dark outline
      rect(p.x, p.y - 2, 1, 5, col); rect(p.x - 2, p.y, 5, 1, col); rect(p.x - 1, p.y - 1, 3, 3, col);   // diamond
      if (isSel || isW || (nd.range <= 32 && !compact)) { const nm = poi.name.length > 14 ? poi.name.slice(0, 13) : poi.name; const tw = nm.length * 6; rect(p.x + 4, p.y - 4, tw + 1, 8, 0); text(nm, p.x + 5, p.y + 3, isSel || isW ? 10 : 9); }
    }
    // surface contacts we know about
    if (nd.show.ships) for (const a of seenShips()) {
      if (!a.pos) continue; const p = px(a.pos); if (p.x < 0 || p.x >= w || p.y < 0 || p.y >= h) continue;
      const col = AFF[affiliation(a.v)] || 11;
      rect(p.x - 2, p.y - 2, 5, 5, col); rect(p.x - 1, p.y - 1, 3, 3, 0);
    }
    // destination line
    if (s.wpt) { const p = px(s.wpt); const n = Math.max(Math.abs(p.x - w / 2), Math.abs(p.y - h / 2)); for (let i = 0; i < n; i += 3) dot(Math.round(w / 2 + ((p.x - w / 2) * i) / n), Math.round(h / 2 + ((p.y - h / 2) * i) / n), 12); }
    // WSKRs
    for (const q of s.wskrs || []) { const p = px(q); if (p.x >= 0 && p.x < w && p.y >= 0 && p.y < h) { rect(p.x - 1, p.y - 1, 3, 3, 13); dot(p.x, p.y, 10); } }
    // the ship: a green triangle pointing along the heading (up when track up)
    const sp = px(s), a = ((trackUp ? 0 : s.heading) * Math.PI) / 180, f = (r, t) => [Math.round(sp.x + Math.sin(a) * r + Math.cos(a) * t), Math.round(sp.y - Math.cos(a) * r + Math.sin(a) * t)];
    ctx.fillStyle = rgb(31); ctx.beginPath(); const [x1, y1] = f(5, 0), [x2, y2] = f(-3, -3), [x3, y3] = f(-3, 3); ctx.moveTo(x1 + 0.5, y1 + 0.5); ctx.lineTo(x2 + 0.5, y2 + 0.5); ctx.lineTo(x3 + 0.5, y3 + 0.5); ctx.closePath(); ctx.fill();
    // scale bar and range
    const nice = [0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 50, 100].filter((v) => v * sc < w * 0.3).pop() || 0.1, len = Math.max(2, Math.round(nice * sc));
    if (!compact) { const bx = w - 4 - len, by = h - 3; rect(bx, by, len, 1, 9); rect(bx, by - 2, 1, 3, 9); rect(bx + len - 1, by - 2, 1, 3, 9); text(nice + ' NM', bx + len, by - 4, 9, 'right'); }
    else text('TRACK UP', 2, 8, 7);
    const im = ctx.getImageData(0, 0, w, h); paletteSnap(im.data); ctx.putImageData(im, 0, 0);
  };
  nd.setPan = (p) => { nd.pan = p; nd.draw(); };
  nd.setRange = (r) => { nd.range = r; nd.draw(); };
  nd.zoom = (dir) => { const i = RANGES.indexOf(nd.range); nd.setRange(RANGES[Math.max(0, Math.min(RANGES.length - 1, i + dir))]); return nd.range; };
  canvas.addEventListener('pointerdown', (e) => {
    const r = canvas.getBoundingClientRect(), x = (e.clientX - r.left) * (nd.w / r.width), y = (e.clientY - r.top) * (nd.h / r.height);
    let best = null, bd = 8;   // 8 art pixels = a finger
    for (const poi of sim.s.pois) { const p = px(poi); const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = poi; } }
    nd.sel = best; nd.draw(); onPick && onPick(best);
  });
  nd.redraw = frameThrottle(nd.draw);
  const ro = new ResizeObserver(resize); ro.observe(wrap);
  nd.destroy = () => { ro.disconnect(); canvas.remove(); };
  resize();
  return nd;
}
