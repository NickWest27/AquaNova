#!/usr/bin/env python3
"""Draws a specimen of the pixel font straight from the glyph table (4 screen pixels per font pixel) to tools/shots/font_specimen.png."""
import os, sys
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from make_font import G, R
S = 4; text = ["ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz", "0123456789 !\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~", "The Aqua Nova dives to 3,400 m at 12.5 kt.", "Sonar: 2 contacts, bearing 045 and 270."]
w = max(len(t) for t in text) * 6 * S + 16; h = len(text) * 10 * S + 16
im = Image.new("RGB", (w, h), (0x0B, 0x0F, 0x1A)); px = im.load()
for li, t in enumerate(text):
    for ci, c in enumerate(t):
        if c not in G: continue
        first, rows = G[c][0], [r.ljust(5, '.') for r in G[c][1].split('/')]
        for ri, row in enumerate(rows):
            for x, v in enumerate(row):
                if v == '#':
                    for dy in range(S):
                        for dx in range(S): px[8 + (ci * 6 + x) * S + dx, 8 + (li * 10 + first + ri) * S + dy] = (0xD8, 0xE6, 0xF2)
os.makedirs(R + "/tools/shots", exist_ok=True); im.save(R + "/tools/shots/font_specimen.png"); print("ok")
