// Real sea floor for the game map (built by tools/make_seafloor.py from GEBCO contours).
//   depthAt(lat, lon)  metres of water under that point (0 = land), or null outside the charted area
//   rough              contour lines for the whole map (coast, 100 m shelf lines, 500 m deep lines)
//   fine tiles         10 m contours, loaded only near the ship (and WSKRS), drawn clipped to a circle around them
// Paths are relative to this file, so they work under /AquaNova/.
import { dlog } from '../../utils/log.js';

const base = new URL('../../data/seafloor/', import.meta.url);
const NM_PER_DEG = 60;

export const seafloor = {
  ready: false, idx: null, grid: null, rough: null,
  tiles: new Map(),      // "ix_iy" -> decoded tile, or null while loading / missing
};

/** Decode delta-encoded lines to { l: level, lines: [{ a: Float32Array lon/lat pairs, x0, y0, x1, y1 }] }. */
function decode(doc) {
  const q = doc.q;
  return doc.levels.map((lv) => ({ l: lv.l, lines: lv.p.map((p) => {
    const n = p.length / 2, a = new Float32Array(p.length); let x = 0, y = 0, x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let i = 0; i < n; i++) { x += p[i * 2]; y += p[i * 2 + 1]; const lo = x / q, la = y / q; a[i * 2] = lo; a[i * 2 + 1] = la; if (lo < x0) x0 = lo; if (lo > x1) x1 = lo; if (la < y0) y0 = la; if (la > y1) y1 = la; }
    return { a, x0, y0, x1, y1 };
  }) }));
}

seafloor.load = async () => {
  if (seafloor.ready) return true;
  try {
    const idx = await (await fetch(new URL('index.json', base))).json();
    const [buf, rough] = await Promise.all([
      fetch(new URL(idx.depth, base)).then((r) => r.arrayBuffer()),
      fetch(new URL(idx.rough, base)).then((r) => r.json()),
    ]);
    seafloor.idx = idx; seafloor.grid = new Uint16Array(buf); seafloor.rough = decode(rough);
    seafloor.have = new Set(idx.tiles.map(([i, j]) => `${i}_${j}`));
    seafloor.ready = true;
    dlog('seafloor: loaded', idx.nx, 'x', idx.ny, 'grid');
    return true;
  } catch (e) { console.warn('Sea floor data not available', e); return false; }
};

/** True when the point is inside the charted square. */
seafloor.inside = (lat, lon) => { const [W, S, E, N] = seafloor.idx.bounds; return lon >= W && lon <= E && lat >= S && lat <= N; };

/** Water depth in metres (bilinear), 0 on land, null outside the chart or before the data has loaded. */
seafloor.depthAt = (lat, lon) => {
  if (!seafloor.ready || !seafloor.inside(lat, lon)) return null;
  const { bounds: [W, , , N], cell, nx, ny } = seafloor.idx, g = seafloor.grid;
  const fx = (lon - W) / cell, fy = (N - lat) / cell, i = Math.min(nx - 2, Math.floor(fx)), j = Math.min(ny - 2, Math.floor(fy)), tx = fx - i, ty = fy - j;
  const v = (a, b) => g[b * nx + a];
  return ((v(i, j) * (1 - tx) + v(i + 1, j) * tx) * (1 - ty) + (v(i, j + 1) * (1 - tx) + v(i + 1, j + 1) * tx) * ty) / 10;
};

/** Fine tiles that touch a circle (centre lat/lon, radius in nm). */
seafloor.tilesNear = (lat, lon, nm) => {
  if (!seafloor.ready) return [];
  const { bounds: [W, , , N], tile } = seafloor.idx, dLat = nm / NM_PER_DEG, dLon = nm / (NM_PER_DEG * Math.cos((lat * Math.PI) / 180));
  const i0 = Math.floor((lon - dLon - W) / tile), i1 = Math.floor((lon + dLon - W) / tile), j0 = Math.floor((N - lat - dLat) / tile), j1 = Math.floor((N - lat + dLat) / tile), out = [];
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) out.push(`${i}_${j}`);
  return out;
};

/** Start loading any fine tiles near these points ({ lat, lon, nm }); returns the decoded ones that are ready now. */
seafloor.fineFor = (sources, onLoad) => seafloor.loadTiles(sources.flatMap((src) => seafloor.tilesNear(src.lat, src.lon, src.nm)), onLoad);

/** Start loading these fine tiles (keys like "3_2"); returns the decoded ones that are ready now. */
seafloor.loadTiles = (keys, onLoad) => {
  const ready = [];
  for (const k of new Set(keys)) {
    if (!seafloor.have.has(k)) continue;
    if (seafloor.tiles.has(k)) { const t = seafloor.tiles.get(k); if (t) ready.push(t); continue; }
    seafloor.tiles.set(k, null);
    fetch(new URL(`fine/${k}.json`, base)).then((r) => r.json()).then((d) => {
      seafloor.tiles.set(k, decode(d));
      if (seafloor.tiles.size > 40) { for (const [key, v] of seafloor.tiles) { if (v && key !== k) { seafloor.tiles.delete(key); break; } } }   // keep memory small on the iPad
      onLoad && onLoad();
    }).catch(() => seafloor.tiles.delete(k));
  }
  return ready;
};


// ---------- Charted area (fog of war) ----------
// The map starts dark. Anywhere the ship's sonar, or a WSKR, has looked stays charted in fine detail for good.
// One bit per 0.01 degree cell (about 0.6 nm). Saved as a run-length string under navigation.charted.
const CC = 0.01;
const chart = seafloor.chart = { nx: 0, ny: 0, bits: null, last: new Map(), pending: null, version: 0 };
function initChart() {
  const [W, S, E, N] = seafloor.idx.bounds;
  chart.nx = Math.ceil((E - W) / CC); chart.ny = Math.ceil((N - S) / CC); chart.bits = new Uint8Array(chart.nx * chart.ny); chart.last.clear();
  if (chart.pending != null) { const s = chart.pending; chart.pending = null; seafloor.setChart(s); }
}
const baseLoad = seafloor.load;
seafloor.load = async () => { const ok = await baseLoad(); if (ok && !chart.bits) initChart(); return ok; };

/** Mark everything within nm of a point as charted. key names the source (ship, a WSKR) so a source that has not moved costs nothing. */
seafloor.mark = (key, lat, lon, nm) => {
  if (!chart.bits) return;
  const m = chart.last.get(key);
  if (m && nm <= m.nm && Math.abs(lat - m.lat) < 0.002 && Math.abs(lon - m.lon) < 0.002) return;
  chart.last.set(key, { lat, lon, nm });
  const [W, , , N] = seafloor.idx.bounds, kx = Math.cos((lat * Math.PI) / 180), dLat = nm / NM_PER_DEG, dLon = dLat / kx;
  const i0 = Math.max(0, Math.floor((lon - dLon - W) / CC)), i1 = Math.min(chart.nx - 1, Math.floor((lon + dLon - W) / CC));
  const j0 = Math.max(0, Math.floor((N - lat - dLat) / CC)), j1 = Math.min(chart.ny - 1, Math.floor((N - lat + dLat) / CC));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const cl = N - (j + 0.5) * CC, co = W + (i + 0.5) * CC;
    if (Math.hypot((cl - lat) * NM_PER_DEG, (co - lon) * NM_PER_DEG * kx) <= nm + 0.15 && !chart.bits[j * chart.nx + i]) { chart.bits[j * chart.nx + i] = 1; chart.version++; }
  }
};
seafloor.clearChart = () => { if (chart.bits) { chart.bits.fill(0); chart.last.clear(); chart.version++; } };
seafloor.chartedCount = () => { let n = 0; if (chart.bits) for (let i = 0; i < chart.bits.length; i++) n += chart.bits[i]; return n; };
seafloor.isCharted = (lat, lon) => { if (!chart.bits || !seafloor.inside(lat, lon)) return false; const [W, , , N] = seafloor.idx.bounds; return chart.bits[Math.min(chart.ny - 1, Math.floor((N - lat) / CC)) * chart.nx + Math.min(chart.nx - 1, Math.floor((lon - W) / CC))] === 1; };

/** Charted cells inside a view box, as horizontal runs { lat0, lat1, lon0, lon1 }, plus the fine tile keys they need. */
seafloor.chartView = (latMin, latMax, lonMin, lonMax) => {
  const runs = [], keys = new Set();
  if (!chart.bits) return { runs, keys: [] };
  const [W, , , N] = seafloor.idx.bounds, tile = seafloor.idx.tile;
  const i0 = Math.max(0, Math.floor((lonMin - W) / CC)), i1 = Math.min(chart.nx - 1, Math.floor((lonMax - W) / CC));
  const j0 = Math.max(0, Math.floor((N - latMax) / CC)), j1 = Math.min(chart.ny - 1, Math.floor((N - latMin) / CC));
  for (let j = j0; j <= j1; j++) {
    let start = -1;
    for (let i = i0; i <= i1 + 1; i++) {
      const on = i <= i1 && chart.bits[j * chart.nx + i] === 1;
      if (on && start < 0) start = i;
      if (!on && start >= 0) {
        runs.push({ lat1: N - j * CC, lat0: N - (j + 1) * CC, lon0: W + start * CC, lon1: W + i * CC });
        for (let q = start; q < i; q++) keys.add(`${Math.floor((W + (q + 0.5) * CC - W) / tile)}_${Math.floor(((j + 0.5) * CC) / tile)}`);
        start = -1;
      }
    }
  }
  return { runs, keys: [...keys] };
};

/** Run-length text: alternating lengths of clear and charted cells, base 36. */
seafloor.chartToString = () => {
  if (!chart.bits || !seafloor.chartedCount()) return '';
  const out = []; let cur = 0, n = 0;
  for (let i = 0; i < chart.bits.length; i++) { if (chart.bits[i] === cur) n++; else { out.push(n.toString(36)); cur = chart.bits[i]; n = 1; } }
  out.push(n.toString(36)); return out.join(',');
};
seafloor.setChart = (str) => {
  if (!chart.bits) { chart.pending = str || ''; return; }
  chart.bits.fill(0); chart.last.clear(); chart.version++;
  if (!str) return;
  let pos = 0, cur = 0;
  for (const part of String(str).split(',')) { const n = parseInt(part, 36); if (!(n >= 0)) break; if (cur) chart.bits.fill(1, pos, Math.min(chart.bits.length, pos + n)); pos += n; cur ^= 1; if (pos >= chart.bits.length) break; }
};
