#!/usr/bin/env python3
"""Even out the room pictures (owner, 2026-11-27): every room gets the brightness and colour cast of the Engineering picture.
The untouched originals live in art_src/rooms/ (outside the game folders, so they are not served or cached). This script reads them,
writes the matched pictures into tablet/retro/assets/ (<room>_original.*), and makes the Retro copies again (320x240, palette, no dither).
How: in CIE Lab, lightness is histogram-matched to Engineering's; the colour channels a and b are shifted and scaled to Engineering's mean
and spread. Transparent pixels (the bridge's screen holes) are left alone and are not counted.
   python3 tools/even_palette.py            (all rooms)      python3 tools/even_palette.py walkway   (one room)
A new room picture: put the owner's file in art_src/rooms/ as <room>_original.jpg (or .png), then run this."""
import os, sys, json, shutil
import numpy as np
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC, OUT = os.path.join(ROOT, 'art_src', 'rooms'), os.path.join(ROOT, 'tablet', 'retro', 'assets')
REF = 'engineering'
ROOMS = ['bridge', 'walkway', 'walkway2', 'quarters', 'science', 'launchbay', 'medbay', 'engineering']
STRENGTH = 0.85   # 1 = match Engineering exactly; a little less keeps a trace of each room's own mood

def fname(room): return f'{room}_original.png' if room == 'bridge' else f'{room}_original.jpg'

# ---- sRGB <-> Lab (D65) ----
M = np.array([[0.4124564, 0.3575761, 0.1804375], [0.2126729, 0.7151522, 0.0721750], [0.0193339, 0.1191920, 0.9503041]])
Mi = np.linalg.inv(M); WP = np.array([0.95047, 1.0, 1.08883])
def to_lab(rgb):
    c = rgb / 255.0; c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    xyz = c @ M.T / WP; f = np.where(xyz > 216 / 24389, np.cbrt(xyz), (24389 / 27 * xyz + 16) / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)
def to_rgb(lab):
    fy = (lab[..., 0] + 16) / 116; fx = fy + lab[..., 1] / 500; fz = fy - lab[..., 2] / 200
    f = np.stack([fx, fy, fz], -1); xyz = np.where(f ** 3 > 216 / 24389, f ** 3, (116 * f - 16) / (24389 / 27)) * WP
    c = xyz @ Mi.T; c = np.where(c <= 0.0031308, 12.92 * c, 1.055 * np.clip(c, 0, None) ** (1 / 2.4) - 0.055)
    return np.clip(c * 255 + 0.5, 0, 255).astype(np.uint8)

def load(path):
    im = Image.open(path); a = np.array(im.convert('RGBA')).astype(np.float64)
    return im, a[..., :3], a[..., 3]
def match(rgb, alpha, ref_lab, ref_L_sorted):
    lab = to_lab(rgb); m = alpha > 8; out = lab.copy()
    # lightness: histogram match (rank of each pixel -> the reference value at that rank)
    L = lab[..., 0][m]; order = np.argsort(L, kind='stable'); ranks = np.empty_like(order); ranks[order] = np.arange(L.size)
    target = ref_L_sorted[(ranks * (ref_L_sorted.size - 1) / max(1, L.size - 1)).astype(int)]
    out[..., 0][m] = L + (target - L) * STRENGTH
    # colour: mean and spread of a and b
    for k in (1, 2):
        v = lab[..., k][m]; rv = ref_lab[..., k]
        moved = (v - v.mean()) * (rv.std() / max(1e-6, v.std())) + rv.mean()
        out[..., k][m] = v + (moved - v) * STRENGTH
    return to_rgb(out)

def snap(img_rgb, alpha=None):
    d = json.load(open(os.path.join(ROOT, 'data', 'palette.json'))); c = d if isinstance(d, list) else d.get('colors', d)
    pal = [tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) for h in c]
    flat = [v for p in pal for v in p]; flat += flat[:3] * (256 - len(pal))
    pi = Image.new('P', (1, 1)); pi.putpalette(flat)
    q = img_rgb.quantize(palette=pi, dither=Image.NONE).convert('RGB')
    if alpha is not None: q = q.convert('RGBA'); q.putalpha(alpha)
    return q

def main():
    os.makedirs(SRC, exist_ok=True)
    for r in ROOMS:   # first run: keep the untouched originals (and the owner's bridge pixel frame)
        for f in [fname(r)] + (['bridge.png'] if r == 'bridge' else []):
            if not os.path.exists(os.path.join(SRC, f)): shutil.copy2(os.path.join(OUT, f), os.path.join(SRC, f))
    _, rrgb, ralpha = load(os.path.join(SRC, fname(REF)))
    ref_lab = to_lab(rrgb)[ralpha > 8]; ref_L = np.sort(ref_lab[:, 0])
    rooms = sys.argv[1:] or ROOMS
    for r in rooms:
        im, rgb, alpha = load(os.path.join(SRC, fname(r)))
        if r == REF: res = rgb.astype(np.uint8)
        else: res = match(rgb, alpha, ref_lab, ref_L)
        out = Image.fromarray(res, 'RGB')
        if r == 'bridge':
            o = out.convert('RGBA'); o.putalpha(Image.fromarray(alpha.astype(np.uint8))); o.save(os.path.join(OUT, fname(r)), optimize=True)
            # the Retro bridge is the owner's own 320x240 pixel frame: the same correction, then back onto the palette
            _, brgb, balpha = load(os.path.join(SRC, 'bridge.png'))
            b = Image.fromarray(match(brgb, balpha, ref_lab, ref_L), 'RGB')
            snap(b, Image.fromarray(balpha.astype(np.uint8))).save(os.path.join(OUT, 'bridge.png'))
        else:
            out.save(os.path.join(OUT, fname(r)), quality=92, optimize=True)
            snap(out.resize((320, 240), Image.LANCZOS)).save(os.path.join(OUT, f'{r}.png'))
        print('evened', r)

if __name__ == '__main__':
    main()
