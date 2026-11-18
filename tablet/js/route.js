// Route finding around land and shoals. No imports, so it runs in Node tests too.
// planRoute(from, to, passable) -> array of turning points to steer through (the last is the goal, or the nearest
// safe water to it), [] when the straight line is already clear, or null when no safe route exists.
// passable(lat, lon) says whether that point is safe water. Obstacles are widened by one cell so the ship does
// not scrape past corners.
const NM = 60, CELL = 0.005;   // grid cell in degrees of latitude (about 0.3 nm)

export function planRoute(from, to, passable, { pad = 0.3, inflate = true, maxSnapCells = 8 } = {}) {
  const midLat = (from.lat + to.lat) / 2, kx = Math.cos((midLat * Math.PI) / 180), dLon = CELL / kx;
  const lat0 = Math.min(from.lat, to.lat) - pad, lon0 = Math.min(from.lon, to.lon) - pad / kx;
  const W = Math.min(400, Math.ceil((Math.abs(from.lon - to.lon) + (2 * pad) / kx) / dLon) + 1), H = Math.min(400, Math.ceil((Math.abs(from.lat - to.lat) + 2 * pad) / CELL) + 1);
  const cellOf = (p) => [Math.round((p.lon - lon0) / dLon), Math.round((p.lat - lat0) / CELL)];
  const at = (cx, cy) => ({ lat: lat0 + cy * CELL, lon: lon0 + cx * dLon });
  const inGrid = (cx, cy) => cx >= 0 && cy >= 0 && cx < W && cy < H;
  const [sx, sy] = cellOf(from), [gx0, gy0] = cellOf(to);
  const raw = new Int8Array(W * H).fill(-1);
  const rawOk = (cx, cy) => { if (!inGrid(cx, cy)) return false; const i = cy * W + cx; if (raw[i] < 0) { const p = at(cx, cy); raw[i] = passable(p.lat, p.lon) ? 1 : 0; } return raw[i] === 1; };
  const near = (cx, cy, ax, ay, r) => Math.abs(cx - ax) <= r && Math.abs(cy - ay) <= r;
  const ok = (cx, cy) => {
    if (near(cx, cy, sx, sy, 2)) return inGrid(cx, cy);   // we are here already: never trap ourselves
    if (!rawOk(cx, cy)) return false;
    if (inflate) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && inGrid(cx + dx, cy + dy) && !rawOk(cx + dx, cy + dy) && !near(cx + dx, cy + dy, sx, sy, 2)) return false;
    return true;
  };
  // goal: use it if it is safe, else the nearest safe cell
  let gx = gx0, gy = gy0, snapped = false;
  const goalOk = ok(gx, gy) || near(gx, gy, sx, sy, 2);
  if (!goalOk) {
    snapped = true; let best = null;
    for (let r = 1; r <= maxSnapCells && !best; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !ok(gx0 + dx, gy0 + dy)) continue;
      const d = Math.hypot(dx, dy); if (!best || d < best.d) best = { x: gx0 + dx, y: gy0 + dy, d };
    }
    if (!best) return null; gx = best.x; gy = best.y;
  }
  const endPoint = snapped ? at(gx, gy) : to;
  const los = (a, b) => {   // a straight line between two points stays in safe cells
    const [ax, ay] = cellOf(a), [bx, by] = cellOf(b), n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 2));
    for (let i = 0; i <= n; i++) { const x = Math.round(ax + ((bx - ax) * i) / n), y = Math.round(ay + ((by - ay) * i) / n); if (!ok(x, y)) return false; }
    return true;
  };
  if (!snapped && los(from, to)) return [];
  // A* over 8 neighbours
  const idx = (x, y) => y * W + x, g = new Float32Array(W * H).fill(Infinity), prev = new Int32Array(W * H).fill(-1), closed = new Uint8Array(W * H);
  const h = (x, y) => { const dx = Math.abs(x - gx), dy = Math.abs(y - gy); return Math.max(dx, dy) + 0.4142 * Math.min(dx, dy); };
  const heap = []; const push = (f, i) => { heap.push([f, i]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
  g[idx(sx, sy)] = 0; push(h(sx, sy), idx(sx, sy)); let found = false;
  while (heap.length) {
    const [, i] = pop(); if (closed[i]) continue; closed[i] = 1;
    const x = i % W, y = (i / W) | 0; if (x === gx && y === gy) { found = true; break; }
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue; const nx = x + dx, ny = y + dy; if (!ok(nx, ny) || closed[idx(nx, ny)]) continue;
      if (dx && dy && !(ok(x + dx, y) && ok(x, y + dy))) continue;   // no squeezing between two diagonal corners
      const ng = g[i] + (dx && dy ? 1.4142 : 1);
      if (ng < g[idx(nx, ny)]) { g[idx(nx, ny)] = ng; prev[idx(nx, ny)] = i; push(ng + h(nx, ny), idx(nx, ny)); }
    }
  }
  if (!found) return inflate ? planRoute(from, to, passable, { pad: pad * 2, inflate: false, maxSnapCells }) : null;
  const cells = []; for (let i = idx(gx, gy); i >= 0; i = prev[i]) cells.push(at(i % W, (i / W) | 0)); cells.reverse();
  // string pulling: keep only the turns that matter
  const pts = [from]; let a = 0;
  while (a < cells.length - 1) { let b = cells.length - 1; while (b > a + 1 && !los(a === 0 ? from : cells[a], cells[b])) b--; pts.push(cells[b]); a = b; }
  pts.pop(); pts.push(endPoint);
  const out = pts.slice(1); out.snapped = snapped; return out;
}

export const routeLength = (from, route) => { let d = 0, p = from; for (const q of route) { d += Math.hypot((q.lat - p.lat) * NM, (q.lon - p.lon) * NM * Math.cos((p.lat * Math.PI) / 180)); p = q; } return d; };
