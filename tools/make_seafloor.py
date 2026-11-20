#!/usr/bin/env python3
"""Build the game's sea-floor data from the GEBCO contour GeoJSON files (made with QGIS + mapshaper).

  python3 tools/make_seafloor.py --src /path/to/bathymetry [--west -74.63 --east -60 --south 30 --north 42.4] [--detail W,E,S,N]

Reads  <tile>_10m / _100m / _500m / _1000m .geojson  (tile names like n45s40w-75e-70).
Writes data/seafloor/:
  index.json        bounds, grids, contour tiles
  depth.bin         DETAIL grid: Uint16 little-endian, decimetres of depth (0 = land, 65535 = no data), 0.005 degree cells, row 0 = north edge
  depth_wide.bin    WIDE grid over the whole map, same format, 0.02 degree cells, built from the 100 / 500 / 1000 m lines only
  rough.json        coastline + 100 m (shelf) + 500 m (deep) contours for the whole map
  fine/<ix>_<iy>.json  contour tiles (0.5 degree), loaded only near the ship and WSKRS: 10 m lines inside the detail box (the deep
                    canyon and the home waters), 100 m lines shallower than 500 m elsewhere
Contour lines are quantised to 1e-4 degree, delta-encoded. The tile and chart grids start at the north-west corner (west, north), so
saved games keep working when the map grows south and east.
Cells outside every tile (for example north-east of 40N, 70W today) are marked no data, and the ship treats them as the edge of the chart.
"""
import argparse, glob, json, os, re, sys, time
import numpy as np
from scipy.interpolate import griddata
from scipy.ndimage import uniform_filter

ap = argparse.ArgumentParser()
ap.add_argument('--src', required=True)
ap.add_argument('--out', default=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'seafloor'))
ap.add_argument('--west', type=float, default=-74.63); ap.add_argument('--east', type=float, default=0.0)
ap.add_argument('--south', type=float, default=30.0); ap.add_argument('--north', type=float, default=42.4)
ap.add_argument('--detail', default='-74.63,-69.0,37.0,42.4', help='W,E,S,N of the box that gets the fine grid and 10 m lines (west and north should match the map)')
ap.add_argument('--cell', type=float, default=0.005, help='detail depth grid cell, degrees')
ap.add_argument('--wide', type=float, default=0.02, help='wide depth grid cell, degrees')
ap.add_argument('--simplify', type=float, default=0.004, help='rough-line simplification outside the detail box, degrees')
ap.add_argument('--tile', type=float, default=0.5, help='contour tile size, degrees')
a = ap.parse_args()
W, E, S, N = a.west, a.east, a.south, a.north
DW, DE, DS, DN = map(float, a.detail.split(','))
Q = 1e4; NODATA = 65535
T0 = time.time()
def log(*x): print(f'[{time.time() - T0:5.0f}s]', *x, flush=True)

def tile_bounds(name):  # n45s40w-75e-70 -> (west, east, south, north)
    m = re.match(r'n(\d+)s(\d+)w-(\d+)e-(\d+)', name); n, s, w, e = map(int, m.groups())
    return -w, -e, s, n

def read(path, box):
    """-> list of (elev, [(lon, lat), ...]) clipped to box = (w, e, s, n) (lines are cut where they leave it)."""
    bw, be, bs, bn = box
    d = json.load(open(path)); out = []
    for ft in d['features']:
        g = ft['geometry']
        if not g: continue
        lines = [g['coordinates']] if g['type'] == 'LineString' else g['coordinates'] if g['type'] == 'MultiLineString' else []
        for ln in lines:
            cur = []
            for x, y in ln:
                if bw - .01 <= x <= be + .01 and bs - .01 <= y <= bn + .01: cur.append((x, y))
                elif cur:
                    if len(cur) > 1: out.append((ft['properties']['ELEV'], cur))
                    cur = []
            if len(cur) > 1: out.append((ft['properties']['ELEV'], cur))
    return out

full = (W, E, S, N); det = (DW, DE, DS, DN)
files = {}
for f in glob.glob(os.path.join(a.src, '*.geojson')):
    mt = re.match(r'(n\d+s\d+w-\d+e-\d+)_(\d+)m', os.path.basename(f))
    if mt:
        w, e, s, n = tile_bounds(mt.group(1))
        if w < E and e > W and s < N and n > S: files.setdefault(int(mt.group(2)), []).append((mt.group(1), f, (w, e, s, n)))
need = [10, 100, 500, 1000]
for m in need:
    if m not in files: sys.exit(f'No {m} m files cover the region.')
tiles = sorted({t for v in files.values() for t, _, _ in v}); tb = [tile_bounds(t) for t in tiles]
print('tiles used:', tiles)
def covered(x, y):
    """True where some source tile has data."""
    out = np.zeros(np.broadcast(x, y).shape, bool)
    for w, e, s, n in tb: out |= (x >= w - 1e-9) & (x <= e + 1e-9) & (y >= s - 1e-9) & (y <= n + 1e-9)
    return out
lat_x, lat_y = np.meshgrid(np.arange(W, E, .1), np.arange(S, N, .1))
miss = ~covered(lat_x, lat_y)
if miss.any(): print(f'NOTE: {miss.sum()} of {miss.size} 0.1-degree lattice points have no tile (they become no-data cells).')

data = {}
for m in need:
    lines = []
    for t, f, tbx in files[m]:
        if m == 10:
            if not (tbx[0] < DE and tbx[1] > DW and tbx[2] < DN and tbx[3] > DS): continue
            lines += read(f, det)
        else: lines += read(f, full)
        log('read', os.path.basename(f), len(lines))
    data[m] = lines
for m in need: log(f'{m} m: {len(data[m])} lines, {sum(len(l) for _, l in data[m])} points')

def points(levels, box, margin=0.0, lattice=0.0015):
    bw, be, bs, bn = box; P, V = [], []
    for m in levels:
        for el, ln in data[m]:
            for x, y in ln:
                if bw - margin <= x <= be + margin and bs - margin <= y <= bn + margin: P.append((x, y)); V.append(-el)
    P = np.array(P); V = np.array(V, float)
    # thin dense points: one per lattice cell (0.0015 degrees for the detail grid, a third of a cell for the wide grid)
    key = np.round(P / lattice).astype(np.int64); _, u = np.unique(key, axis=0, return_index=True)
    return P[u], V[u]

def make_grid(box, cell, levels, margin, name, lattice=0.0015):
    bw, be, bs, bn = box
    nx = int(round((be - bw) / cell)) + 1; ny = int(round((bn - bs) / cell)) + 1
    gx = bw + np.arange(nx) * cell; gy = bn - np.arange(ny) * cell
    P, V = points(levels, box, margin, lattice); log(f'{name}: grid {nx} x {ny}, {len(P)} points')
    X, Y = np.meshgrid(gx, gy)
    z = griddata(P, V, (X, Y), method='linear')
    bad = np.isnan(z)
    if bad.any(): z[bad] = griddata(P, V, (X[bad], Y[bad]), method='nearest')
    z = uniform_filter(z, 3, mode='nearest'); z = np.clip(z, 0, 6553)
    g = np.round(z * 10).astype('<u2'); g[~covered(X, Y)] = NODATA
    log(f'{name}: max {z.max():.0f} m, {np.mean(z < 1) * 100:.1f}% land, {np.mean(g == NODATA) * 100:.1f}% no data')
    return g, nx, ny

os.makedirs(os.path.join(a.out, 'fine'), exist_ok=True)
for f in glob.glob(os.path.join(a.out, 'fine', '*.json')): os.remove(f)
wide, wnx, wny = make_grid(full, a.wide, [100, 500, 1000], 0.1, 'wide', a.wide / 3)
wide.tofile(os.path.join(a.out, 'depth_wide.bin'))
det_g, dnx, dny = make_grid(det, a.cell, need, 0.1, 'detail')
det_g.tofile(os.path.join(a.out, 'depth.bin'))
maxd = max(float(wide[wide != NODATA].max()), float(det_g[det_g != NODATA].max())) / 10

# --- contour files ---
def enc(ln):
    xs = [round(x * Q) for x, _ in ln]; ys = [round(y * Q) for _, y in ln]
    out = [xs[0], ys[0]]
    for i in range(1, len(xs)): out += [xs[i] - xs[i - 1], ys[i] - ys[i - 1]]
    return out
def group(lines, keep):
    by = {}
    for el, ln in lines:
        if keep(el): by.setdefault(el, []).append(enc(ln))
    return [{'l': el, 'p': by[el]} for el in sorted(by, reverse=True)]
in_rough = lambda el: (-500 < el < 0 and el % 100 == 0) or (el <= -500 and el % 500 == 0)
coast = [(el, ln) for el, ln in data[1000] if el == 0]
# one spacing everywhere (the 100 m files hold finer levels in some tiles, which would show as a seam at the tile edge)
rough_lines = coast + [(el, ln) for el, ln in data[100] if -500 < el < 0 and el % 100 == 0] + [(el, ln) for el, ln in data[500] if el <= -500 and el % 500 == 0]
def rdp(ln, tol):
    """Douglas-Peucker (iterative): keep the points that bend the line by more than tol degrees."""
    P = np.asarray(ln, float); n = len(P)
    if n < 3: return ln
    keep = np.zeros(n, bool); keep[0] = keep[-1] = True; st = [(0, n - 1)]
    while st:
        i, j = st.pop()
        if j <= i + 1: continue
        a_, b_ = P[i], P[j]; d = b_ - a_; L = np.hypot(*d)
        q = P[i + 1:j] - a_
        dist = np.hypot(q[:, 0], q[:, 1]) if L == 0 else np.abs(d[0] * q[:, 1] - d[1] * q[:, 0]) / L
        k = int(np.argmax(dist))
        if dist[k] > tol: m = i + 1 + k; keep[m] = True; st += [(i, m), (m, j)]
    return [tuple(p) for p in P[keep]]
def slim(lines):
    """Outside the detail box the rough lines are simplified (0.004 degrees, about 0.25 nm) and tiny loops dropped: the chart only shows them from far away."""
    out = []
    for el, ln in lines:
        if inside(ln[0]): out.append((el, ln)); continue
        xs = [p[0] for p in ln]; ys = [p[1] for p in ln]
        if len(ln) < 12 and max(max(xs) - min(xs), max(ys) - min(ys)) < 0.05: continue
        r = rdp(ln, a.simplify)
        if len(r) > 1: out.append((el, r))
    return out
inside = lambda p: DW <= p[0] <= DE and DS <= p[1] <= DN
rough_lines = slim(rough_lines)
log('rough lines', len(rough_lines), 'points', sum(len(l) for _, l in rough_lines))
rough = group(rough_lines, lambda e: True)
json.dump({'q': Q, 'levels': rough}, open(os.path.join(a.out, 'rough.json'), 'w'), separators=(',', ':'))
t = a.tile; fine = {}
def add_fine(el, ln):
    # cut the line into runs by contour tile; each run repeats the first point of the next so lines join across tiles
    tk = lambda x, y: (int((x - W) // t), int((N - y) // t))
    run = [ln[0]]; k0 = tk(*ln[0])
    for p0, p1 in zip(ln, ln[1:]):
        k1 = tk(*p1)
        if k1 != k0:
            run.append(p1); fine.setdefault(k0, {}).setdefault(el, []).append(enc(run))
            run = [p0]; k0 = k1
        run.append(p1)
    if len(run) > 1: fine.setdefault(k0, {}).setdefault(el, []).append(enc(run))
inside = lambda p: DW <= p[0] <= DE and DS <= p[1] <= DN
for el, ln in data[10]:
    if el < 0: add_fine(el, ln)
for el, ln in data[100]:   # outside the detail box: the 100 m file's own levels, minus what the rough layer already draws
    if -500 < el < 0 and not in_rough(el) and not inside(ln[0]): add_fine(el, ln)   # below 500 m the deep ocean outside the detail box keeps only the 500 m lines
log('fine tiles:', len(fine))
idx = {'bounds': [W, S, E, N], 'tile': t, 'tiles': [], 'rough': 'rough.json', 'maxDepth': maxd, 'sources': tiles, 'nodata': NODATA,
       'grids': [{'file': 'depth.bin', 'bounds': [DW, DS, DE, DN], 'cell': a.cell, 'nx': dnx, 'ny': dny}, {'file': 'depth_wide.bin', 'bounds': [W, S, E, N], 'cell': a.wide, 'nx': wnx, 'ny': wny}],
       'detail': [DW, DS, DE, DN], 'q': Q}
total = sum(os.path.getsize(os.path.join(a.out, f)) for f in ('rough.json', 'depth.bin', 'depth_wide.bin'))
for (ix, iy), lv in sorted(fine.items()):
    fn = f'fine/{ix}_{iy}.json'
    json.dump({'q': Q, 'levels': [{'l': el, 'p': lv[el]} for el in sorted(lv, reverse=True)]}, open(os.path.join(a.out, fn), 'w'), separators=(',', ':'))
    total += os.path.getsize(os.path.join(a.out, fn)); idx['tiles'].append([ix, iy])
json.dump(idx, open(os.path.join(a.out, 'index.json'), 'w'), separators=(',', ':'))
sizes = [os.path.getsize(os.path.join(a.out, 'fine', f'{ix}_{iy}.json')) for ix, iy in idx['tiles']]
log(f"rough {os.path.getsize(os.path.join(a.out, 'rough.json')) // 1024} KB; depth {os.path.getsize(os.path.join(a.out, 'depth.bin')) // 1024} KB; wide {os.path.getsize(os.path.join(a.out, 'depth_wide.bin')) // 1024} KB; {len(sizes)} fine tiles, largest {max(sizes) // 1024} KB, fine total {sum(sizes) // 1024} KB; total {total // 1024} KB")
