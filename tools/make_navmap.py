#!/usr/bin/env python3
"""Draw ped/navmap.png: the whole chart (30-42.4 N, 74.63 W to 0) shaded by depth, land grey-green, no data dark.
Used by the iPhone PED Nav tab. Run again if data/seafloor/depth_wide.bin changes.  python3 tools/make_navmap.py"""
import json, os, numpy as np
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
idx = json.load(open(os.path.join(ROOT, 'data/seafloor/index.json')))
edges = np.array([0, 10, 20, 30, 40, 50, 60, 80, 100, 130, 160, 200, 250, 300, 400, 500, 650, 800, 1000, 1250, 1500, 1800, 2100, 2500, 2900, 3300, 3700, 4100, 4500, 5000, 5500, 6000, 1e9])
n = len(edges) - 1
pal = [(0x4a, 0x9a, 0xc6), (0x08, 0x1c, 0x34)]
colors = [tuple(int(pal[0][c] + (pal[1][c] - pal[0][c]) * (i / (n - 1)) ** 0.7) for c in range(3)) for i in range(n)]
for file, out in (('depth_wide.bin', 'navmap.png'), ('depth.bin', 'navmap_fine.png')):
    g = [x for x in idx['grids'] if x['file'] == file][0]
    a = np.fromfile(os.path.join(ROOT, 'data/seafloor', g['file']), dtype='<u2').reshape(g['ny'], g['nx'])
    nodata = a == idx['nodata']; d = a.astype(np.float32) / 10.0   # metres
    land = (d <= 0) & ~nodata
    band = np.clip(np.digitize(d, edges[1:-1]), 0, n - 1)
    rgb = np.zeros((*d.shape, 3), np.uint8)
    for i, c in enumerate(colors): rgb[band == i] = c
    rgb[land] = (0x4b, 0x5e, 0x45); rgb[nodata] = (0x04, 0x0b, 0x12)
    im = Image.fromarray(rgb).quantize(colors=64, method=Image.Quantize.MEDIANCUT)
    path = os.path.join(ROOT, 'ped', out); im.save(path, optimize=True)
    print(path, os.path.getsize(path) // 1024, 'KB', im.size, 'bounds', g['bounds'], 'cell', g['cell'])
