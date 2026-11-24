#!/usr/bin/env python3
"""Check a PNG against the retro palette and size.  python3 tools/check_asset.py file.png [--size 320x240] [--fix]"""
import json, os, sys
from PIL import Image
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAL = [tuple(int(c[i:i + 2], 16) for i in (1, 3, 5)) for c in json.load(open(R + "/data/palette.json"))["colors"]]
def nearest(rgb): return min(PAL, key=lambda p: sum((a - b) ** 2 for a, b in zip(p, rgb)))
def main(a):
    fix = "--fix" in a; size = None
    if "--size" in a: size = tuple(int(x) for x in a[a.index("--size") + 1].split("x"))
    files = [x for x in a if x.lower().endswith(".png")]
    if not files: print(__doc__); return 2
    bad = 0
    for f in files:
        im = Image.open(f).convert("RGBA"); w, h = im.size; px = im.load(); stray = {}; semi = 0
        for y in range(h):
            for x in range(w):
                r, g, b, al = px[x, y]
                if al == 0: continue
                if al < 255: semi += 1
                if (r, g, b) not in PAL: stray[(r, g, b)] = stray.get((r, g, b), 0) + 1
        notes = []
        if size and (w, h) != size: notes.append(f"size {w}x{h}, wanted {size[0]}x{size[1]}")
        if stray: notes.append(f"{len(stray)} colors not in the palette ({sum(stray.values())} pixels), e.g. " + ", ".join("#%02X%02X%02X" % c for c in list(stray)[:4]))
        if semi: notes.append(f"{semi} semi-transparent pixels (use fully opaque or fully transparent)")
        print(("ok   " if not notes else "FAIL ") + f"{f}  {w}x{h}" + ("" if not notes else "  " + "; ".join(notes)))
        bad += bool(notes)
        if fix and (stray or semi):
            for y in range(h):
                for x in range(w):
                    r, g, b, al = px[x, y]
                    px[x, y] = (0, 0, 0, 0) if al < 128 else (*nearest((r, g, b)), 255)
            out = os.path.splitext(f)[0] + "_fixed.png"; im.save(out); print("     wrote " + out)
    return 1 if bad and not fix else 0
if __name__ == "__main__": sys.exit(main(sys.argv[1:]))
