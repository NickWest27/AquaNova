#!/usr/bin/env python3
"""Build the game's sea-floor data from the GEBCO contour GeoJSON files (made with QGIS + mapshaper).

  python3 tools/make_seafloor.py --src /path/to/bathymetry [--west -74.63 --east -70.0 --south 38.8 --north 42.4]

Reads  <tile>_10m / _100m / _500m / _1000m .geojson  (tile names like n45s40w-75e-70).
Writes data/seafloor/:
  index.json        bounds, grid, contour tiles, levels
  depth.bin         Uint16 little-endian grid, decimetres of depth (0 = land or surface), row 0 = north edge
  rough.json        coastline + 100 m (shelf) + 500 m (deep) contours for the whole map
  fine/<ix>_<iy>.json  10 m contours in 0.5 degree tiles (loaded only near the ship and WSKRS)
Contour lines are quantised to 1e-4 degree, delta-encoded.
"""
import argparse, glob, json, os, re, sys
import numpy as np
from scipy.interpolate import griddata
from scipy.ndimage import uniform_filter

ap = argparse.ArgumentParser()
ap.add_argument('--src', required=True)
ap.add_argument('--out', default=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'seafloor'))
ap.add_argument('--west', type=float, default=-74.63); ap.add_argument('--east', type=float, default=-70.0)
ap.add_argument('--south', type=float, default=38.8); ap.add_argument('--north', type=float, default=42.4)
ap.add_argument('--cell', type=float, default=0.005, help='depth grid cell, degrees')
ap.add_argument('--tile', type=float, default=0.5, help='fine contour tile size, degrees')
a = ap.parse_args()
W, E, S, N = a.west, a.east, a.south, a.north
Q = 1e4

def tile_bounds(name):  # n45s40w-75e-70 -> (west, east, south, north)
    m = re.match(r'n(\d+)s(\d+)w-(\d+)e-(\d+)', name); n, s, w, e = map(int, m.groups())
    return -w, -e, s, n

def read(path):
    """-> list of (elev, [(lon, lat), ...]) clipped to the region (lines are cut where they leave it)."""
    d = json.load(open(path)); out = []
    for ft in d['features']:
        g = ft['geometry']
        if not g: continue
        lines = [g['coordinates']] if g['type'] == 'LineString' else g['coordinates'] if g['type'] == 'MultiLineString' else []
        for ln in lines:
            cur = []
            for x, y in ln:
                if W - .01 <= x <= E + .01 and S - .01 <= y <= N + .01: cur.append((x, y))
                elif cur:
                    if len(cur) > 1: out.append((ft['properties']['ELEV'], cur))
                    cur = []
            if len(cur) > 1: out.append((ft['properties']['ELEV'], cur))
    return out

files = {}
for f in glob.glob(os.path.join(a.src, '*.geojson')):
    mt = re.match(r'(n\d+s\d+w-\d+e-\d+)_(\d+)m', os.path.basename(f))
    if mt:
        w, e, s, n = tile_bounds(mt.group(1))
        if w < E and e > W and s < N and n > S: files.setdefault(int(mt.group(2)), []).append((mt.group(1), f))
need = [10, 100, 500, 1000]
for m in need:
    if m not in files: sys.exit(f'No {m} m files cover the region.')
tiles = sorted({t for v in files.values() for t, _ in v})
print('tiles used:', tiles)
# coverage check on a 0.1 degree lattice
miss = [(x, y) for x in np.arange(W, E, .1) for y in np.arange(S, N, .1)
        if not any(tile_bounds(t)[0] <= x < tile_bounds(t)[1] and tile_bounds(t)[2] <= y < tile_bounds(t)[3] or (tile_bounds(t)[0] <= x <= tile_bounds(t)[1] and tile_bounds(t)[2] <= y <= tile_bounds(t)[3]) for t in tiles)]
if miss: print(f'WARNING: {len(miss)} lattice points are not covered by any tile, for example {miss[:3]}')

data = {m: [ln for _, f in files[m] for ln in read(f)] for m in need}
for m in need: print(f'{m} m: {len(data[m])} lines, {sum(len(l) for _, l in data[m])} points')

# --- depth grid: interpolate from every contour point ---
pts, val = [], []
for m in need:
    for el, ln in data[m]:
        step = 1 if m <= 100 else 1
        for x, y in ln[::step]: pts.append((x, y)); val.append(-el)
pts = np.array(pts); val = np.array(val, float)
nx = int(round((E - W) / a.cell)) + 1; ny = int(round((N - S) / a.cell)) + 1
gx = W + np.arange(nx) * a.cell; gy = N - np.arange(ny) * a.cell
print('grid', nx, 'x', ny, 'points', len(pts))
# drop duplicates, then linear interpolation (nearest fills the rim)
_, u = np.unique(np.round(pts * Q).astype(np.int64), axis=0, return_index=True); pts, val = pts[u], val[u]
X, Y = np.meshgrid(gx, gy)
z = griddata(pts, val, (X, Y), method='linear')
bad = np.isnan(z)
if bad.any(): z[bad] = griddata(pts, val, (X[bad], Y[bad]), method='nearest')
z = uniform_filter(z, 3, mode='nearest'); z = np.clip(z, 0, 6553)
os.makedirs(os.path.join(a.out, 'fine'), exist_ok=True)
(np.round(z * 10).astype('<u2')).tofile(os.path.join(a.out, 'depth.bin'))
print(f'depth: max {z.max():.0f} m, median {np.median(z):.0f} m, {np.mean(z < 1) * 100:.1f}% land/zero')

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
coast = [(el, ln) for el, ln in data[1000] if el == 0]
# one spacing everywhere (the 100 m files hold finer levels in some tiles, which would show as a seam at the tile edge)
rough_lines = coast + [(el, ln) for el, ln in data[100] if -500 < el < 0 and el % 100 == 0] + [(el, ln) for el, ln in data[500] if el <= -500 and el % 500 == 0]
rough = group(rough_lines, lambda e: True)
json.dump({'q': Q, 'levels': rough}, open(os.path.join(a.out, 'rough.json'), 'w'), separators=(',', ':'))
t = a.tile; fine = {}
for el, ln in data[10]:
    if el >= 0: continue
    # cut the line into runs by 0.5 degree tile; each run repeats the first point of the next so lines join across tiles
    tk = lambda x, y: (int((x - W) // t), int((N - y) // t))
    run = [ln[0]]; k0 = tk(*ln[0])
    for p0, p1 in zip(ln, ln[1:]):
        k1 = tk(*p1)
        if k1 != k0:
            run.append(p1); fine.setdefault(k0, {}).setdefault(el, []).append(enc(run))
            run = [p0]; k0 = k1
        run.append(p1)
    if len(run) > 1: fine.setdefault(k0, {}).setdefault(el, []).append(enc(run))
idx = {'bounds': [W, S, E, N], 'cell': a.cell, 'nx': nx, 'ny': ny, 'q': Q, 'tile': t, 'tiles': [], 'rough': 'rough.json', 'depth': 'depth.bin', 'maxDepth': float(z.max()), 'sources': tiles}
total = os.path.getsize(os.path.join(a.out, 'rough.json')) + os.path.getsize(os.path.join(a.out, 'depth.bin'))
for (ix, iy), lv in sorted(fine.items()):
    fn = f'fine/{ix}_{iy}.json'
    json.dump({'q': Q, 'levels': [{'l': el, 'p': lv[el]} for el in sorted(lv, reverse=True)]}, open(os.path.join(a.out, fn), 'w'), separators=(',', ':'))
    total += os.path.getsize(os.path.join(a.out, fn)); idx['tiles'].append([ix, iy])
json.dump(idx, open(os.path.join(a.out, 'index.json'), 'w'), separators=(',', ':'))
sizes = [os.path.getsize(os.path.join(a.out, 'fine', f'{ix}_{iy}.json')) for ix, iy in idx['tiles']]
print(f"rough.json {os.path.getsize(os.path.join(a.out, 'rough.json')) // 1024} KB; depth.bin {os.path.getsize(os.path.join(a.out, 'depth.bin')) // 1024} KB; {len(sizes)} fine tiles, largest {max(sizes) // 1024} KB; total {total // 1024} KB")
