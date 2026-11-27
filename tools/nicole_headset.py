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
INK, BAND, BAND_HI, CUP, CUP_HI, PAD = (8, 11, 17, 255), (44, 52, 68, 255), (92, 104, 128, 255), (52, 61, 80, 255), (110, 124, 150, 255), (26, 30, 40, 255)

def headset(size, cell, band, cups, mic):
    """Draw on a small canvas (one square per art pixel), then blow it up in hard pixels. band: ellipse box and angle range of the arc;
    cups: [(cx, cy, w, h)]; mic: (from, to). Coordinates are in the picture's pixels."""
    W, H = size; w, h = W // cell, H // cell
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    s = lambda v: [round(x / cell) for x in v]
    (bx0, by0, bx1, by1), a0, a1, th = band
    box = s((bx0, by0, bx1, by1))
    d.arc(box, a0, a1, fill=INK, width=th + 2)
    d.arc([box[0] + 1, box[1] + 1, box[2] - 1, box[3] - 1], a0 + 1, a1 - 1, fill=BAND, width=th)
    d.arc([box[0] + 1, box[1] + 1, box[2] - 1, box[3] - 1], a0 + 4, a1 - 4, fill=BAND_HI, width=1)
    if mic:
        (x0, y0), (x1, y1) = mic; p0, p1 = s((x0, y0)), s((x1, y1))
        d.line([*p0, *p1], fill=INK, width=3); d.line([*p0, *p1], fill=BAND, width=1)
        d.ellipse([p1[0] - 2, p1[1] - 2, p1[0] + 2, p1[1] + 2], fill=INK); d.ellipse([p1[0] - 1, p1[1] - 1, p1[0] + 1, p1[1] + 1], fill=PAD)
    for (cx, cy, cw, ch) in cups:
        x0, y0, x1, y1 = s((cx - cw / 2, cy - ch / 2, cx + cw / 2, cy + ch / 2))
        d.rounded_rectangle([x0, y0, x1, y1], radius=max(1, (x1 - x0) // 3), fill=INK)
        d.rounded_rectangle([x0 + 1, y0 + 1, x1 - 1, y1 - 1], radius=max(1, (x1 - x0) // 3 - 1), fill=CUP)
        d.line([x0 + 2, y0 + 2, x0 + 2, y1 - 2], fill=CUP_HI)
    return im.resize((w * cell, h * cell), Image.NEAREST)

def apply(src, dst, cell, band, cups, mic):
    base = Image.open(os.path.join(SRC, src)).convert('RGBA')
    ov = headset(base.size, cell, band, cups, mic); base.alpha_composite(ov, (0, 0))
    out = base.convert('RGB'); out.save(os.path.join(OUT, dst), quality=92); return out

# the face (1024 x 1024, art pixels about 16 px): band over the crown, cups on both ears, the mic from her right cup toward her mouth
face = apply('communications_face_v1.jpg', 'communications_original.jpg', 8,
             ((228, 70, 796, 980), 196, 344, 3), [(262, 505, 84, 150), (762, 505, 84, 150)], ((300, 590), (430, 690)))
snap(face.resize((64, 64), Image.LANCZOS)).save(os.path.join(OUT, 'communications.png'))
# the dialogue picture (1024 x 765, art pixels about 4 px): three-quarter view, the cup on her near ear (viewer right), the band over her hair
scene = apply('communications_scene_v1.jpg', 'communications_scene_original.jpg', 4,
              ((206, 78, 430, 560), 222, 352, 3), [(410, 275, 40, 66)], ((404, 306), (318, 336)))   # the far ear is hidden behind her head: no far cup
snap(scene.resize((320, 240), Image.LANCZOS)).save(os.path.join(OUT, 'communications_scene.png'))
print('Nicole has her headset')
