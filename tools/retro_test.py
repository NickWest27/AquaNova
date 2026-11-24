#!/usr/bin/env python3
"""Retro foundation: whole-number scale, stage position, palette-only pixels, the pixel font.  python3 tools/retro_test.py"""
import importlib.util, io, json, os, re
from PIL import Image
from playwright.sync_api import sync_playwright
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sp = importlib.util.spec_from_file_location("smoke", R + "/tools/smoke.py"); sm = importlib.util.module_from_spec(sp); sp.loader.exec_module(sm)
srv, _ = sm.start_server(); base = f"http://127.0.0.1:{srv.server_address[1]}/AquaNova/tablet/retro/"
fails = []
def check(n, ok, x=""):
    print(("ok   " if ok else "FAIL ") + n + (f"  {x}" if x and not ok else ""))
    if not ok: fails.append(n)
PAL = {tuple(int(c[i:i + 2], 16) for i in (1, 3, 5)) for c in json.load(open(R + "/data/palette.json"))["colors"]}
# the css may only name palette colors
css = open(R + "/tablet/retro/retro.css").read() + open(R + "/tablet/retro/palette.css").read()
hexes = {h.upper() for h in re.findall(r"#[0-9a-fA-F]{6}\b", css)}
check("palette.css holds exactly the 64 colors", len(re.findall(r"--c\d\d:", css)) == 64 and all(tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) in PAL for h in hexes))
check("retro.css has no color of its own", not re.findall(r"#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(", open(R + "/tablet/retro/retro.css").read()))
with sync_playwright() as p:
    b = sm.launch(p)
    for name, vw, vh, dpr, want in [("iPad Air 11 landscape", 1180, 820, 2, 6), ("iPad Pro 12.9 landscape", 1366, 1024, 2, 8), ("iPad mini landscape", 1133, 744, 2, 6), ("desktop 1080p", 1920, 1080, 1, 4), ("tiny", 300, 200, 1, 1)]:
        ctx = b.new_context(viewport={"width": vw, "height": vh}, device_scale_factor=dpr, has_touch=True); pg = ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:200])); pg.on("console", lambda m: errs.append(m.text[:200]) if m.type == "error" else None)
        pg.goto(base + "demo.html"); pg.wait_for_function("document.fonts.status==='loaded'"); pg.wait_for_timeout(300)
        r = pg.evaluate("(()=>{const b=document.getElementById('retro-stage').getBoundingClientRect(); return {s:document.getElementById('root').dataset.scale, w:b.width, h:b.height, x:b.left, y:b.top}})()")
        k = want / dpr
        check(f"{name}: whole-number scale {want}", r["s"] == str(want) and abs(r["w"] - 320 * k) < 0.01 and abs(r["h"] - 240 * k) < 0.01, str(r))
        check(f"{name}: stage sits on the screen pixel grid", abs(r["x"] * dpr - round(r["x"] * dpr)) < 0.01 and abs(r["y"] * dpr - round(r["y"] * dpr)) < 0.01, str(r))
        if name.startswith("iPad Air"):
            check("iPad Air 11: the stage is 960 x 720 points, centred", abs(r["w"] - 960) < 0.01 and abs(r["x"] - 110) < 0.01, str(r))
            im = Image.open(io.BytesIO(pg.screenshot())).convert("RGB"); px = im.load(); W, H = im.size
            bad = {}
            for y in range(H):
                for x in range(W):
                    c = px[x, y]
                    if c not in PAL: bad[c] = bad.get(c, 0) + 1
            check("iPad Air 11: every pixel on screen is a palette color (no anti-aliasing)", not bad, f"{sum(bad.values())} pixels, {len(bad)} colors, e.g. {list(bad.items())[:3]}")
            # the art pixel grid: each 6 x 6 block of screen pixels is one color
            ox, oy = int(r["x"] * dpr), int(r["y"] * dpr); blocks = 0
            for ay in range(0, 240, 3):
                for ax in range(0, 320, 3):
                    c0 = px[ox + ax * 6, oy + ay * 6]
                    if any(px[ox + ax * 6 + dx, oy + ay * 6 + dy] != c0 for dx in (0, 5) for dy in (0, 5)): blocks += 1
            check("iPad Air 11: art pixels are solid 6 x 6 blocks", blocks == 0, f"{blocks} blocks differ")
            pg.screenshot(path=R + "/tools/shots/retro_demo.png")
            pg.tap("button.rbtn:not(.on)"); pg.wait_for_timeout(200)
            check("a tap on a retro button works", "taps: 1" in pg.inner_text("#retro-stage"))
            bb = pg.evaluate("(()=>{const e=document.querySelector('button.rbtn').getBoundingClientRect(); return [e.width,e.height]})()")
            check("a retro button is at least 44 points tall on the iPad", bb[1] >= 44, str(bb))
        check(f"{name}: no page errors", not errs, str(errs[:2]))
        ctx.close()
    b.close()
print("FAILED: " + ", ".join(fails) if fails else "all ok"); raise SystemExit(1 if fails else 0)
