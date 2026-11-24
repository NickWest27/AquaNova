"""Turn the pixel-art bridge picture into a 320x240 palette-only PNG (tablet/retro/assets/bridge.png).
usage: python3 tools/make_retro_bridge.py SRC.jpg
The picture's black foot band is cut and the rest is stretched to fill 320x240."""
import json, sys
from PIL import Image
import numpy as np
src = sys.argv[1] if len(sys.argv) > 1 else 'bridge_src.jpg'
pal = json.load(open('data/palette.json'))
cols = pal['colors'] if isinstance(pal, dict) and 'colors' in pal else pal
rgb = np.array([[int(c['hex'][i:i+2], 16) for i in (1, 3, 5)] if isinstance(c, dict) else [int(c[i:i+2],16) for i in (1,3,5)] for c in cols], float)
im = Image.open(src).convert('RGB')
w, h = im.size
a = np.asarray(im).astype(float)
# find the black foot band: rows from the bottom that are nearly uniform dark
rows = a.mean(axis=(1, 2)); cut = h
while cut > 0 and rows[cut - 1] < 22: cut -= 1
print('art height', cut, 'of', h)
im = im.crop((0, 0, w, cut)).resize((320, 240), Image.BOX)
a = np.asarray(im).astype(float).reshape(-1, 3)
d = ((a[:, None, :] - rgb[None]) ** 2).sum(-1)
idx = d.argmin(1)
out = rgb[idx].reshape(240, 320, 3).astype('uint8')
Image.fromarray(out).save('tablet/retro/assets/bridge.png')
print('colors used', len(set(idx.tolist())))
