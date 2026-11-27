#!/usr/bin/env python3
"""Crew pictures (owner's art in art_src/crew/<crewId>_scene.png) -> the game's files in tablet/retro/assets/crew/:
  <id>_scene_original.jpg (1024x765, the 90s dialogue screen), <id>_scene.png (320x240 palette copy),
  <id>_original.jpg (512x512 face for the crew list), <id>.png (64x64 palette copy).
FACE: the square crop of the face, in source pixels (left, top, size).   python3 tools/crew_art.py [crewId ...]
ROOM (owner, 2026-11-27: the portraits should look like they are in their rooms): the background (everything outside the figure) is shifted
toward the room picture's brightness and colour (CIE Lab mean and spread, strength BG_STRENGTH); the figure keeps its own colours.
The figure mask is art_src/crew/<id>_mask.png (white = figure), made once with rembg (isnet-general-use); a new picture needs a new mask."""
import os, sys, json
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC, OUT = os.path.join(ROOT, 'art_src', 'crew'), os.path.join(ROOT, 'tablet', 'retro', 'assets', 'crew')
FACE = { 'helm': (330, 110, 400), 'executiveOfficer': (60, 120, 720), 'science': (560, 20, 300), 'engineering': (560, 60, 380), 'security': (920, 40, 360), 'sensors': (120, 160, 420) }   # helm: the over-the-shoulder picture of 2026-11-27 (the first one is helm_scene_v1.png)
ROOM = { 'helm': 'bridge_original.png', 'sensors': 'bridge_original.png', 'engineering': 'engineering_original.jpg', 'security': 'launchbay_original.jpg' }
BG_STRENGTH = 0.7
def room_match(im, cid):
    import numpy as np
    from PIL import ImageFilter
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import even_palette as ep
    mpath = os.path.join(SRC, f'{cid}_mask.png')
    if cid not in ROOM or not os.path.exists(mpath): return im
    _, rr, ra = ep.load(os.path.join(ROOT, 'tablet', 'retro', 'assets', ROOM[cid])); rl = ep.to_lab(rr)[ra > 8]
    rgb = np.array(im).astype(float); lab = ep.to_lab(rgb)
    m = np.array(Image.open(mpath).convert('L').resize(im.size).filter(ImageFilter.GaussianBlur(1.5))).astype(float) / 255
    bg = 1 - m; sel = bg > 0.5; out = lab.copy()
    for k in range(3):   # mean and spread; the spread is not raised much (a plain backdrop would turn to noise)
        v = lab[..., k][sel]; rv = rl[:, k]; sc = min(1.25 if k == 0 else 1.0, rv.std() / max(1e-6, v.std()))
        out[..., k] = lab[..., k] + ((lab[..., k] - v.mean()) * sc + rv.mean() - lab[..., k]) * BG_STRENGTH
    res = rgb * m[..., None] + ep.to_rgb(out).astype(float) * bg[..., None]
    return Image.fromarray(res.clip(0, 255).astype(np.uint8))
# BACKDROP (owner, 2026-11-27): pictures drawn on a plain dark backdrop get a soft, out-of-focus piece of the room picture in that plain area
# (the drawn consoles and the figure stay). crop: art pixels of the room picture; flip: mirror it so its detail lands on the empty side.
BACKDROP = { 'helm': ('bridge_original.png', (590, 0, 1024, 300), False), 'sensors': ('bridge_original.png', (0, 0, 434, 300), True) }
def add_backdrop(im, cid):
    import numpy as np
    from PIL import ImageFilter
    if cid not in BACKDROP: return im
    room, crop, flip = BACKDROP[cid]
    br = Image.open(os.path.join(ROOT, 'tablet', 'retro', 'assets', room)).convert('RGBA').crop(crop)
    if flip: br = br.transpose(Image.FLIP_LEFT_RIGHT)
    sea = Image.new('RGBA', br.size, (14, 46, 72, 255)); sea.alpha_composite(br)   # window holes in the frame: dark sea
    bd = np.array(sea.convert('RGB').resize(im.size, Image.LANCZOS).filter(ImageFilter.GaussianBlur(5))).astype(float) * 0.7   # out of focus and a little dimmer, so the figure stands out
    src = Image.open(os.path.join(SRC, f'{cid}_scene.png')).convert('RGB'); rgb0 = np.array(src).astype(float)   # find the plain area on the untouched picture
    base = np.median(rgb0[:80, -200:].reshape(-1, 3), 0)
    near = Image.fromarray(((np.abs(rgb0 - base).sum(-1) < 45) * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(9)).filter(ImageFilter.MaxFilter(9))
    fig = Image.open(os.path.join(SRC, f'{cid}_mask.png')).convert('L').resize(im.size).filter(ImageFilter.MaxFilter(7))
    e = np.array(near).astype(float) / 255 * (1 - np.array(fig).astype(float) / 255)
    e = np.array(Image.fromarray((e * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(4))).astype(float) / 255
    rgb = np.array(im).astype(float)
    return Image.fromarray((rgb * (1 - e[..., None]) + bd * e[..., None]).clip(0, 255).astype(np.uint8))
def snap(img):
    d = json.load(open(os.path.join(ROOT, 'data', 'palette.json'))); c = d if isinstance(d, list) else d.get('colors', d)
    pal = [tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) for h in c]; flat = [v for p in pal for v in p]; flat += flat[:3] * (256 - len(pal))
    pi = Image.new('P', (1, 1)); pi.putpalette(flat); return img.quantize(palette=pi, dither=Image.NONE).convert('RGB')
def main():
  for cid in sys.argv[1:] or FACE:
      im = add_backdrop(room_match(Image.open(os.path.join(SRC, f'{cid}_scene.png')).convert('RGB'), cid), cid)
      im.resize((1024, 765), Image.LANCZOS).save(os.path.join(OUT, f'{cid}_scene_original.jpg'), quality=90, optimize=True)
      snap(im.resize((320, 240), Image.LANCZOS)).save(os.path.join(OUT, f'{cid}_scene.png'))
      x, y, n = FACE[cid]; face = im.crop((x, y, x + n, y + n))
      face.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, f'{cid}_original.jpg'), quality=90, optimize=True)
      snap(face.resize((64, 64), Image.LANCZOS)).save(os.path.join(OUT, f'{cid}.png'))
      print('made', cid)
if __name__ == '__main__':
    main()
