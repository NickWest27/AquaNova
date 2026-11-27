#!/usr/bin/env python3
"""Nicole's headset (owner, 2026-11-27: she wears one on the bridge, so her communicator pictures should too).
Draws a pixel-art headset (headband, ear cups, mic boom) onto the originals kept in art_src/crew/communications_*_v1.jpg, on each picture's
own pixel grid, and writes the game's files: communications_original.jpg (face), communications_scene_original.jpg, and the Retro copies.
   python3 tools/nicole_headset.py"""
import os, sys
from PIL import Image, ImageDraw
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools')); from crew_art import snap
SRC, OUT = os.path.join(ROOT, 'art_src', 'crew'), os.path.join(ROOT, 'tablet', 'retro', 'assets', 'crew')
# colours taken from Alex's headphones (his portrait) and the bridge frame: slate blue, a light rim, a dark inner ring
INK, BAND, BAND_HI, RIM, CUP, RING, FACE, HI = (8, 11, 17, 255), (72, 86, 120, 255), (140, 154, 190, 255), (122, 136, 172, 255), (70, 84, 118, 255), (34, 42, 64, 255), (88, 102, 138, 255), (170, 184, 216, 255)

def headset(size, cell, band, cups, mic):
    """Round padded headphones like Alex's (owner, 2026-11-27), drawn one square per art pixel, then blown up in hard pixels.
    band: (ellipse box, start and end angle, thickness in art pixels); cups: [(cx, cy, w, h)] in the picture's pixels; mic: (from, to) or None."""
    W, H = size; w, h = W // cell, H // cell
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    s = lambda v: [round(x / cell) for x in v]
    (bx0, by0, bx1, by1), a0, a1, th = band
    box = s((bx0, by0, bx1, by1))
    d.arc(box, a0, a1, fill=INK, width=th + 2)
    d.arc([box[0] + 1, box[1] + 1, box[2] - 1, box[3] - 1], a0 + 1, a1 - 1, fill=BAND, width=th)
    d.arc([box[0] + 2, box[1] + 2, box[2] - 2, box[3] - 2], a0 + 3, a1 - 3, fill=BAND_HI, width=1)
    if mic:
        (x0, y0), (x1, y1) = mic; p0, p1 = s((x0, y0)), s((x1, y1))
        d.line([*p0, *p1], fill=INK, width=3); d.line([*p0, *p1], fill=BAND, width=1)
        d.ellipse([p1[0] - 2, p1[1] - 2, p1[0] + 2, p1[1] + 2], fill=INK); d.ellipse([p1[0] - 1, p1[1] - 1, p1[0] + 1, p1[1] + 1], fill=RING)
    for (cx, cy, cw, ch) in cups:
        x0, y0, x1, y1 = s((cx - cw / 2, cy - ch / 2, cx + cw / 2, cy + ch / 2))
        d.rectangle([(x0 + x1) // 2 - 2, y0 - 3, (x0 + x1) // 2 + 2, y0 + 2], fill=INK); d.rectangle([(x0 + x1) // 2 - 1, y0 - 2, (x0 + x1) // 2 + 1, y0 + 1], fill=RIM)   # the slider into the band
        d.ellipse([x0, y0, x1, y1], fill=INK)                              # outline
        d.ellipse([x0 + 1, y0 + 1, x1 - 1, y1 - 1], fill=RIM)              # the padded rim
        d.ellipse([x0 + 2, y0 + 2, x1 - 2, y1 - 2], fill=CUP)
        ix = max(2, (x1 - x0) // 4); iy = max(2, (y1 - y0) // 4)
        d.ellipse([x0 + ix, y0 + iy, x1 - ix, y1 - iy], fill=RING)         # the dark inner ring
        d.ellipse([x0 + ix + 1, y0 + iy + 1, x1 - ix - 1, y1 - iy - 1], fill=FACE)
        d.arc([x0 + 1, y0 + 1, x1 - 1, y1 - 1], 120, 220, fill=HI, width=1)   # a highlight on the rim
    return im.resize((w * cell, h * cell), Image.NEAREST)

def apply(src, dst, cell, band, cups, mic):
    base = Image.open(os.path.join(SRC, src)).convert('RGBA')
    ov = headset(base.size, cell, band, cups, mic); base.alpha_composite(ov, (0, 0))
    out = base.convert('RGB'); out.save(os.path.join(OUT, dst), quality=92); return out

# the face (1024 x 1024, art pixels about 16 px): band over the crown, cups on both ears, the mic from her right cup toward her mouth
face = apply('communications_face_v1.jpg', 'communications_original.jpg', 8,
             ((222, 64, 802, 980), 194, 346, 4), [(262, 510, 110, 200), (762, 510, 110, 200)], ((292, 600), (430, 690)))
snap(face.resize((64, 64), Image.LANCZOS)).save(os.path.join(OUT, 'communications.png'))
# the dialogue picture (1024 x 765, art pixels about 4 px): three-quarter view, the cup on her near ear (viewer right), the band over her hair
scene = apply('communications_scene_v1.jpg', 'communications_scene_original.jpg', 4,
              ((204, 76, 432, 560), 222, 352, 4), [(410, 272, 76, 90)], ((396, 312), (318, 338)))   # the far ear is hidden behind her head: no far cup
snap(scene.resize((320, 240), Image.LANCZOS)).save(os.path.join(OUT, 'communications_scene.png'))
print('Nicole has her headset')
