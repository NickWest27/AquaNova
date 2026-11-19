// Synthetic vision: a 3D forward view built from the mapped sea floor, like looking out of a window in front of a craft.
// Draws only charted ground (the fog of war stays). A fixed field of view, viewing distance and (mild) height stretch, no labels or legends.
// Hidden lines are removed with a floating horizon: strips are drawn near to far, and a line is only drawn where it rises above
// the highest nearer ground in that screen column, so anything behind a ridge or the curve of a slope is not shown.
// Used by the Remora and WSKR pages and the bridge VIEW screen.
// Contour lines lie on the floor. SOLID = a contour that is in the survey data (real 10 m lines where the fine tile is loaded,
// otherwise only the 100 m and 500 m lines). DASHED = interpolated: a level halfway between known ones, estimated from the surface.
import { sim, toward } from './sim.js';
import { seafloor } from './seafloor.js';
import { SITE_NM } from './rov.js';

const NM_PER_DEG = 60, M_PER_NM = 1852, W = 640, H = 360, SCALE = 2, COLS = 72, ROWS = 44;
export const FOV = 70, VIEW_NM = 1, EXAG = 5;   // a window: 70 degrees across, 1 nm of sight. EXAG stretches height only, so gentle slopes read (1 = true scale, which looks flat).
// Is the fine (10 m) contour tile for this spot in memory? Then every 10 m line there is real data.
const fineLoaded = (lat, lon) => { const { bounds: [Wd, , , Nd], tile } = seafloor.idx; return !!seafloor.tiles.get(`${Math.floor((lon - Wd) / tile)}_${Math.floor((Nd - lat) / tile)}`); };
// Contour levels crossing a cell whose floor runs lo..hi metres: [level, known]. Spacing thins with depth so slopes stay readable.
function levelsFor(lo, hi, loaded) {
  const mid = (lo + hi) / 2, S = mid < 200 ? 10 : mid < 500 ? 50 : 100, K = loaded ? S : (mid < 500 ? 100 : 500), step = K / 2, out = [];
  for (let L = Math.ceil(lo / step) * step; L <= hi; L += step) if (L > 0) out.push([L, Math.abs(L % K) < 1e-6, mid]);
  return out;
}

export function createSynth(parent) {
  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE; canvas.height = H * SCALE; canvas.className = 'synth-canvas';
  parent.append(canvas);
  const g = canvas.getContext('2d');
  const api = { canvas, target: null, draw(craft) {
    g.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    const cx = W / 2, cy = H * 0.42, F = (W / 2) / Math.tan((FOV / 2) * Math.PI / 180), range = VIEW_NM;
    const grad = g.createLinearGradient(0, 0, 0, H); grad.addColorStop(0, '#0a0a52'); grad.addColorStop(cy / H, '#2a2ab0'); grad.addColorStop(1, '#0a0a52');
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    const kx = NM_PER_DEG * Math.cos((craft.lat * Math.PI) / 180);
    if (seafloor.ready) seafloor.fineFor([{ lat: craft.lat, lon: craft.lon, nm: range + 0.3 }]);   // start loading the real 10 m lines around us
    // grid of sea floor points in craft-relative space (polar: bearing across the view, distance ahead)
    const pts = [], rowD = [];
    for (let j = 0; j < ROWS; j++) {
      const d = range * ((j + 1) / ROWS) ** 1.35, row = []; rowD.push(d);
      for (let i = 0; i <= COLS; i++) {
        const a = (-FOV / 2 + (FOV * i) / COLS) * Math.PI / 180, b = (craft.heading * Math.PI) / 180 + a;
        const lat = craft.lat + (d * Math.cos(b)) / NM_PER_DEG, lon = craft.lon + (d * Math.sin(b)) / kx;
        const fl = seafloor.ready && seafloor.isCharted(lat, lon) ? seafloor.depthAt(lat, lon) : null;
        const fwd = d * Math.cos(a) * M_PER_NM;
        if (fl == null || fl <= 0 || fwd < 15) { row.push(null); continue; }
        row.push({ x: cx + F * Math.tan(a), y: cy + (F * EXAG * (fl - craft.depth)) / fwd, d, fl, lat, lon });
      }
      pts.push(row);
    }
    // floating horizon: hz[x] is the highest point on screen (smallest y) of the nearer ground in column x. Below it, things are hidden.
    const hz = new Float32Array(W + 2).fill(Infinity), snap = [];
    // a line from (x1,y1) to (x2,y2), drawn only where it is above the horizon; dashed when asked (dash pattern runs along the visible line)
    const seg = (x1, y1, x2, y2, dash) => {
      const n = Math.max(1, Math.ceil(Math.max(Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 4))), len = Math.hypot(x2 - x1, y2 - y1) / n;
      let open = false;
      for (let k = 0; k < n; k++) {
        const t0 = k / n, t1 = (k + 1) / n, ax = x1 + (x2 - x1) * t0, ay = y1 + (y2 - y1) * t0, bx = x1 + (x2 - x1) * t1, by = y1 + (y2 - y1) * t1;
        const mx = (ax + bx) / 2, my = (ay + by) / 2, col = Math.round(mx);
        const vis = col >= 0 && col <= W && my < hz[col] + 0.6 && !(dash && ((k * len) % 13) >= 7);
        if (vis) { if (!open) { g.moveTo(ax, ay); open = true; } g.lineTo(bx, by); } else open = false;
      }
    };
    g.lineJoin = 'round'; g.lineCap = 'butt';
    // near to far, one strip of cells at a time
    for (let j = 1; j < ROWS; j++) {
      snap[j] = hz.slice();                                       // what the nearer ground hides, for markers at this distance
      const fade = 1 - (rowD[j] / range) * 0.65;
      const cells = [];
      for (let i = 0; i < COLS; i++) {
        const q = [pts[j - 1][i], pts[j - 1][i + 1], pts[j][i + 1], pts[j][i]];   // near-left, near-right, far-right, far-left
        if (q.some((v) => !v)) continue;
        cells.push(q);
        // the faint mesh: the far edge and the left side of each cell
        g.beginPath(); g.strokeStyle = `rgba(150,170,255,${(0.07 + 0.13 * fade).toFixed(2)})`; g.lineWidth = 1;
        seg(q[3].x, q[3].y, q[2].x, q[2].y); seg(q[0].x, q[0].y, q[3].x, q[3].y); g.stroke();
        // contour lines on the floor: marching squares on the cell, solid when known, dashed when interpolated
        const v = q.map((p) => p.fl), lo = Math.min(...v), hi = Math.max(...v); if (hi - lo < 0.01) continue;
        for (const [L, known, mid] of levelsFor(lo, hi, seafloor.ready && fineLoaded(q[0].lat, q[0].lon))) {
          const hit = [];
          for (let k = 0; k < 4; k++) { const a = q[k], b = q[(k + 1) % 4]; if ((a.fl < L) !== (b.fl < L)) { const t = (L - a.fl) / (b.fl - a.fl); hit.push([a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t]); } }
          if (hit.length < 2) continue;
          const major = known && L % (mid < 200 ? 50 : 100) === 0, al = (0.55 + 0.45 * fade).toFixed(2);
          g.beginPath(); g.lineWidth = known ? (major ? 2.4 : 1.6) : 1.3;
          g.strokeStyle = known ? (major ? `rgba(150,255,225,${al})` : `rgba(100,235,190,${al})`) : `rgba(130,170,255,${(0.85 * al).toFixed(2)})`;
          seg(hit[0][0], hit[0][1], hit[1][0], hit[1][1], !known); if (hit.length === 4) seg(hit[2][0], hit[2][1], hit[3][0], hit[3][1], !known);
          g.stroke();
        }
      }
      // this strip now hides what lies behind it: raise the horizon along its near and far edges
      for (const q of cells) {
        for (const [A, B] of [[q[0], q[1]], [q[3], q[2]]]) {
          const lx = Math.min(A.x, B.x), rx = Math.max(A.x, B.x); if (rx - lx < 1e-6) continue;
          for (let x = Math.max(0, Math.ceil(lx)); x <= Math.min(W, Math.floor(rx)); x++) { const y = A.y + ((B.y - A.y) * (x - A.x)) / (B.x - A.x); if (y < hz[x]) hz[x] = y; }
        }
      }
    }
    // things in view: points of interest, with a ring showing sampling reach. No names. Hidden ones are not drawn.
    const ch = (craft.heading * Math.PI) / 180, sinH = Math.sin(ch), cosH = Math.cos(ch);
    const P = (lat, lon, depth) => { const t = toward(craft, { lat, lon }), fwd = t.dy * cosH + t.dx * sinH, side = t.dx * cosH - t.dy * sinH; const f = fwd * M_PER_NM; if (f < 15) return null; return { x: cx + (F * side * M_PER_NM) / f, y: cy + (F * EXAG * (depth - craft.depth)) / f, nm: t.nm }; };
    const shown = (q) => { if (!q || q.x < -40 || q.x > W + 40 || q.nm > range * 1.05) return false; let j = rowD.findIndex((d) => d >= q.nm); if (j < 1) j = 1; if (j >= ROWS) j = ROWS - 1; const col = Math.round(q.x); return col < 0 || col > W || q.y < snap[j][col] + 0.6; };
    for (const p of sim.s.pois) {
      if (p.type === 'dock') continue; const fl = seafloor.depthAt(p.lat, p.lon); if (fl == null || toward(craft, p).nm > range * 1.1) continue;
      g.strokeStyle = 'rgba(255,225,74,0.9)'; g.lineWidth = 2; g.setLineDash([5, 4]); g.beginPath(); let st = false;
      for (let k = 0; k <= 32; k++) { const a = (k / 32) * 6.2832, lat = p.lat + (SITE_NM * Math.cos(a)) / NM_PER_DEG, lon = p.lon + (SITE_NM * Math.sin(a)) / (NM_PER_DEG * Math.cos((p.lat * Math.PI) / 180));
        const dd = seafloor.depthAt(lat, lon), q = dd == null ? null : P(lat, lon, dd); if (!q || !shown(q)) { st = false; continue; } if (!st) { g.moveTo(q.x, q.y); st = true; } else g.lineTo(q.x, q.y); }
      g.stroke(); g.setLineDash([]);
    }
    const mark = (p, col, depth) => {
      const q = P(p.lat, p.lon, depth); if (!shown(q)) return;
      g.fillStyle = col; g.beginPath(); g.moveTo(q.x, q.y - 12); g.lineTo(q.x + 7, q.y); g.lineTo(q.x - 7, q.y); g.closePath(); g.fill();
    };
    for (const p of sim.s.pois) if (p.type !== 'dock') mark(p, '#ffe14a', seafloor.depthAt(p.lat, p.lon) || 0);
    mark(sim.s, '#3ddc84', sim.s.depth);
  } };
  return api;
}
