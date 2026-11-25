#!/usr/bin/env python3
"""Display > Pictures: Original / Retro swaps the room pictures and never moves a tap area.
Run from repo root:  python3 tools/pictures_test.py
"""
import os, sys, importlib.util
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
        page = browser.new_context(viewport={"width": 1180, "height": 820}, has_touch=True).new_page()
        page.on("pageerror", lambda e: errors.append(str(e)[:200]))
        page.goto(base + "?intake=0"); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=15000)
        page.tap("#board-btn"); page.wait_for_timeout(900)
        page.is_visible(".modal .btn") and page.tap(".modal .btn")
        src = lambda: page.evaluate("document.querySelector('.scene.walkway img.frame').getAttribute('src')")
        hires = lambda: page.evaluate("document.querySelector('.scene.walkway img.frame').classList.contains('hires')")
        door = lambda: page.evaluate("(()=>{const r=document.querySelector('.scene.walkway [aria-label=\"BRIDGE\"]').getBoundingClientRect();return [r.x|0,r.y|0,r.width|0,r.height|0]})()")
        page.evaluate("window.__aq.scene('walkway')"); page.wait_for_timeout(400)
        check("default is the original picture", "walkway_original" in src() and hires())
        d0 = door()
        # settings: PED button, Settings tab, Retro pixels
        page.tap("#ped-btn") if page.query_selector("#ped-btn") else page.evaluate("window.__aq.open('ped')")
        page.wait_for_timeout(500)
        page.get_by_text("Settings", exact=True).first.tap(); page.wait_for_timeout(300)
        check("settings show the Pictures card", page.get_by_text("Display: pictures").count() == 1)
        page.get_by_role("button", name="Retro pixels").tap(); page.wait_for_timeout(300)
        check("retro picture chosen", "walkway.png" in src() and not hires(), src())
        check("setting is remembered", page.evaluate("localStorage.getItem('aquaNova_pictures')") == "retro")
        check("tap area did not move", door() == d0, f"{d0} -> {door()}")
        page.get_by_role("button", name="Original (default)").tap(); page.wait_for_timeout(300)
        check("back to original", "walkway_original" in src() and hires())
        check("no page errors", not errors, str(errors))
        browser.close()
    print("\nFAILED: " + ", ".join(fails) if fails else "\nall ok"); sys.exit(1 if fails else 0)
main()
