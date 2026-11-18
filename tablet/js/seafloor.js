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
seafloor.fineFor = (sources, onLoad) => {
  const ready = [];
  for (const src of sources) for (const k of seafloor.tilesNear(src.lat, src.lon, src.nm)) {
    if (!seafloor.have.has(k)) continue;
    if (seafloor.tiles.has(k)) { const t = seafloor.tiles.get(k); if (t) ready.push(t); continue; }
    seafloor.tiles.set(k, null);
    fetch(new URL(`fine/${k}.json`, base)).then((r) => r.json()).then((d) => {
      seafloor.tiles.set(k, decode(d));
      if (seafloor.tiles.size > 14) { for (const [key, v] of seafloor.tiles) { if (v && key !== k) { seafloor.tiles.delete(key); break; } } }   // keep memory small on the iPad
      onLoad && onLoad();
    }).catch(() => seafloor.tiles.delete(k));
  }
  return ready;
};
