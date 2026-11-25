#!/usr/bin/env python3
"""Make the Retro copy of an original room picture: 320x240, nearest palette color, no dither.
   python3 tools/snap_picture.py original.jpg out.png
The original stays as it is (Display > Pictures > Original uses it)."""
import sys, json, os
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src, dst = sys.argv[1], sys.argv[2]
d = json.load(open(os.path.join(ROOT, 'data', 'palette.json'))); c = d if isinstance(d, list) else d.get('colors', d)
pal = [tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) for h in c]
flat = [v for p in pal for v in p]; flat += flat[:3] * (256 - len(pal))   # pad with palette colors, never black
pi = Image.new('P', (1, 1)); pi.putpalette(flat)
im = Image.open(src).convert('RGB').resize((320, 240), Image.LANCZOS)
im.quantize(palette=pi, dither=Image.NONE).convert('RGB').save(dst)
print('wrote', dst)
