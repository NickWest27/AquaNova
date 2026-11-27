#!/usr/bin/env python3
"""Nicole's headset (owner, 2026-11-27): the headphones are cut from Alex's dialogue picture (art_src/crew/sensors_scene.png: the band and the
ear cup with their black outline), scaled to Nicole's head and put on her near ear in her dialogue picture, with a mic boom as on the bridge.
Her crew-list face is then cropped from that picture (like the other crew faces), so the two always match.
Original kept as art_src/crew/communications_scene_v1.jpg.   python3 tools/nicole_headset.py"""
import os, sys
from PIL import Image, ImageDraw, ImageFilter
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools')); from crew_art import snap
SRC, OUT = os.path.join(ROOT, 'art_src', 'crew'), os.path.join(ROOT, 'tablet', 'retro', 'assets', 'crew')

# 1. the cut-out, in Alex's picture pixels (1448 x 1086): the ear cup (an ellipse) and the band (a polygon round the stripe and its outline)
alex = Image.open(os.path.join(SRC, 'sensors_scene.png')).convert('RGBA')
CUP = (463, 360, 62, 68)   # centre x, y, radius x, y (outline included)
BAND = [(347, 115), (409, 118), (452, 145), (474, 180), (484, 205), (487, 230), (488, 265), (494, 300),
        (463, 300), (461, 265), (458, 230), (450, 210), (440, 190), (423, 160), (398, 135), (362, 128), (347, 126)]
def cut(shape):
    m = Image.new('L', alex.size, 0); dd = ImageDraw.Draw(m); shape(dd); pc = alex.copy(); pc.putalpha(m); return pc.crop(m.getbbox())
cx, cy, rx, ry = CUP
cup = cut(lambda dd: dd.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=255)); cup_box = (cx - rx, cy - ry)
band = cut(lambda dd: dd.polygon(BAND, fill=255)); band_box = (min(x for x, _ in BAND), min(y for _, y in BAND))

# 2. onto Nicole. The band keeps her head's scale (KB) so it reaches over her hair; the cup is a little smaller (KC) so it clears her eye (owner).
KB, KC = 0.77, 0.66
scene = Image.open(os.path.join(SRC, 'communications_scene_v1.jpg')).convert('RGBA')
ear = (416, 276)   # where the cup's centre goes: her near ear in the dialogue picture (1024 x 765)
cup_s = cup.resize((round(cup.width * KC), round(cup.height * KC)), Image.NEAREST)
cup_off = (round(ear[0] - (cx - cup_box[0]) * KC), round(ear[1] - (cy - cup_box[1]) * KC))
joint = (476, 300)   # in Alex's picture: where the band's slider meets the top of the cup
joint_n = (round(ear[0] + (joint[0] - cx) * KC), round(ear[1] + (joint[1] - cy) * KC))
band_s = band.resize((round(band.width * KB), round(band.height * KB)), Image.NEAREST)
band_off = (round(joint_n[0] - (joint[0] - band_box[0]) * KB), round(joint_n[1] - (joint[1] - band_box[1]) * KB))
# the mic boom first (under the cup), in Alex's headset colours, from the bottom of the cup to her mouth
d = ImageDraw.Draw(scene)
p0, p1 = (ear[0] - 12, ear[1] + 40), (318, 338)
d.line([p0, p1], fill=(8, 11, 17, 255), width=9); d.line([p0, p1], fill=(76, 92, 128, 255), width=3)
d.ellipse([p1[0] - 9, p1[1] - 8, p1[0] + 9, p1[1] + 8], fill=(8, 11, 17, 255)); d.ellipse([p1[0] - 5, p1[1] - 4, p1[0] + 5, p1[1] + 4], fill=(56, 68, 98, 255))
scene.alpha_composite(band_s, band_off); scene.alpha_composite(cup_s, cup_off)
out = scene.convert('RGB'); out.save(os.path.join(OUT, 'communications_scene_original.jpg'), quality=92)
snap(out.resize((320, 240), Image.LANCZOS)).save(os.path.join(OUT, 'communications_scene.png'))

# 3. her face for the crew list: a square crop of the dialogue picture
FACE = (178, 52, 336)   # left, top, size: hair to chin
face = out.crop((FACE[0], FACE[1], FACE[0] + FACE[2], FACE[1] + FACE[2]))
face.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, 'communications_original.jpg'), quality=90)
snap(face.resize((64, 64), Image.LANCZOS)).save(os.path.join(OUT, 'communications.png'))
print('Nicole has her headset')
