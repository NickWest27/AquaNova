#!/usr/bin/env python3
"""Hotspot labels hidden until a long press; quarters items do not glow before the logbook is read; no bottom bar in stations.
Run from repo root:  python3 tools/labels_test.py
"""
import os, sys, shutil, importlib.util
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location("smoke", os.path.join(ROOT, "tools", "smoke.py"))
smoke = importlib.util.module_from_spec(spec); spec.loader.exec_module(smoke)
fails = []
def check(name, ok, extra=""):
    print(("ok   " if ok else "FAIL ") + name + (f"  {extra}" if extra and not ok else ""))
    if not ok: fails.append(name)

def main():
    server, site = smoke.start_server()
    base = f"http://127.0.0.1:{server.server_address[1]}/AquaNova/tablet/"
    errors = []
    with sync_playwright() as p:
        browser = smoke.launch(p)
        ctx = browser.new_context(viewport={"width": 1366, "height": 1024}, has_touch=True)
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)[:200]))
        js = lambda code: page.evaluate("(async()=>{" + code + "})()")
        page.goto(base + "?intake=0"); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=15000)
        page.tap("#board-btn"); page.wait_for_timeout(900)
        page.is_visible(".modal .btn") and page.tap(".modal .btn")
        op = lambda sel: float(page.evaluate(f"getComputedStyle(document.querySelector('{sel}')).opacity"))
        # the bridge has labelled hotspots
        page.evaluate("window.__aq.scene('bridge')"); page.wait_for_timeout(400)
        check("bridge labels hidden", op(".hs[aria-label=\"COMMS\"] .tag") == 0)
        box = page.locator("#stage").bounding_box()
        page.mouse.move(box["x"] + 40, box["y"] + 40); page.mouse.down(); page.wait_for_timeout(800)
        check("long press shows labels", page.evaluate("document.body.classList.contains('show-labels')") and op(".hs[aria-label=\"COMMS\"] .tag") > 0.9)
        page.mouse.up(); page.wait_for_timeout(3200)
        check("labels hide again after release", not page.evaluate("document.body.classList.contains('show-labels')"))
        # quarters: pickups do not glow before the logbook is read
        js("const m=(await import('./js/persist.js')).gameState; m.updateProperty('progress.read_welcome', false); return 1")
        page.evaluate("window.__aq.scene('quarters')"); page.wait_for_timeout(500)
        n = page.locator(".pickup.glow").count()
        check("PED and pin do not glow before the logbook is read", n == 0, n)
        js("(await import('./js/persist.js')).gameState.updateProperty('progress.read_welcome', true); return 1"); page.wait_for_timeout(600)
        vis = page.locator(".pickup:visible").count()
        check("after reading, visible pickups glow", vis == 0 or page.locator(".pickup.glow:visible").count() == vis, vis)
        # a station fills the screen: no bottom bar
        page.evaluate("window.__aq.open('nav')"); page.wait_for_timeout(700)
        sb = page.locator("#station").bounding_box(); vp = page.evaluate("document.querySelector('#stage') ? document.querySelector('#stage').getBoundingClientRect().height : innerHeight")
        check("station fills the screen to the bottom", abs((sb["y"] + sb["height"]) - 1024) < 3, sb)
        check("no console bar is showing", not page.is_visible("#console-line"))
        ctx.close(); browser.close()
    server.shutdown(); shutil.rmtree(site, ignore_errors=True)
    check("no page errors", not errors, errors)
    print(f"\n{len(fails)} failure(s)"); sys.exit(1 if fails else 0)
if __name__ == "__main__":
    main()
