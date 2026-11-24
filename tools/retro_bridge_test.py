#!/usr/bin/env python3
"""Retro bridge: boots the engine, shows live readouts, station buttons, messages, palette-only pixels.  python3 tools/retro_bridge_test.py"""
import importlib.util, io, json, os
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
with sync_playwright() as p:
    b = sm.launch(p); ctx = b.new_context(viewport={"width": 1180, "height": 820}, device_scale_factor=2, has_touch=True); pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:200])); pg.on("console", lambda m: errs.append(m.text[:200]) if m.type == "error" else None)
    pg.goto(base + "index.html"); pg.wait_for_function("!document.querySelector('.rsplash .rbtn').disabled", timeout=20000)
    check("the splash shows a Board button", "BOARD" in pg.inner_text(".rsplash"))
    pg.tap(".rsplash .rbtn"); pg.wait_for_timeout(1200)
    check("the splash is gone and the bridge is up", pg.locator(".rsplash").count() == 0 and pg.locator(".rdesk").count() == 6)
    js = lambda code: pg.evaluate("(async()=>{const {sim}=await import('../js/sim.js');" + code + "})()")
    js("const s=sim.s; s.docked=false; s.at=null; s.speed=7.3; s.depth=640; s.targetDepth=640; s.heading=123; s.throttle=0.5; sim.step(0.1)"); pg.wait_for_timeout(500)
    t = pg.inner_text("#retro-stage")
    import re
    hd = int(re.search(r"HDG (\d+)", t).group(1)); sd = float(re.search(r"SPD ([\d.]+) KT", t).group(1)); dp = re.search(r"DEPTH (\d+) M", t)
    check("readouts follow the ship (heading, speed, depth)", 115 <= hd <= 130 and 5 <= sd <= 9 and dp is not None, t[:200])
    js("sim.s.damage=60; sim.step(0.1)"); pg.wait_for_timeout(300)
    check("a damaged hull shows red on the Systems button", pg.evaluate("getComputedStyle(document.querySelector('.rdesk[aria-label=SYSTEMS] .s')).color") == "rgb(255, 0, 77)")
    js("const n=await import('../js/notify.js'); n.say('helm','Captain, we have a contact bearing 045.','')"); pg.wait_for_timeout(300)
    check("a crew message appears in the message line", "contact bearing 045" in pg.inner_text("#console-line"))
    pg.tap(".rdesk[aria-label=COMMS]"); pg.wait_for_timeout(300)
    check("a station button opens its page", pg.locator(".rstub").count() == 1 and "COMMS" in pg.inner_text(".rstub .head"))
    pg.tap(".rstub .rbtn"); pg.wait_for_timeout(300)
    check("Back returns to the bridge", pg.locator(".rstub").count() == 0)
    bb = pg.evaluate("[...document.querySelectorAll('.rdesk')].map(e=>e.getBoundingClientRect().height)")
    check("station buttons are at least 44 points tall", min(bb) >= 44, str(bb))
    pg.wait_for_timeout(300); im = Image.open(io.BytesIO(pg.screenshot())).convert("RGB"); px = im.load(); W, H = im.size; bad = {}
    for y in range(H):
        for x in range(W):
            c = px[x, y]
            if c not in PAL: bad[c] = bad.get(c, 0) + 1
    check("every pixel on the bridge is a palette color", not bad, f"{sum(bad.values())} pixels, e.g. {list(bad.items())[:3]}")
    pg.screenshot(path=R + "/tools/shots/retro_bridge.png")
    check("no page errors", not errs, str(errs[:3]))
    b.close()
print("FAILED: " + ", ".join(fails) if fails else "all ok"); raise SystemExit(1 if fails else 0)
