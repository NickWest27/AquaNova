#!/usr/bin/env python3
"""Tablet walkthrough: boards the sub, opens every station at 3 iPad sizes, saves screenshots, fails on errors.
Run from repo root:  python3 tools/tablet_test.py
"""
import os, sys, shutil, importlib.util
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location("smoke", os.path.join(ROOT, "tools", "smoke.py"))
smoke = importlib.util.module_from_spec(spec); spec.loader.exec_module(smoke)
SHOTS = os.path.join(ROOT, "tools", "shots"); os.makedirs(SHOTS, exist_ok=True)
SIZES = {"land": (1180, 820), "old": (1024, 768), "big": (1366, 1024)}
STATIONS = ["nav", "helm", "sys", "sensors", "comms", "log", "ped"]

def main():
    server, site = smoke.start_server()
    base = f"http://127.0.0.1:{server.server_address[1]}/AquaNova/tablet/"
    issues = []
    with sync_playwright() as p:
        browser = smoke.launch(p)
        for tag, (w, h) in SIZES.items():
            ctx = browser.new_context(viewport={"width": w, "height": h}, has_touch=True, device_scale_factor=2)
            page = ctx.new_page()
            def note(msg, tag=tag): issues.append(f"[{tag}] {msg}")
            page.on("console", lambda m, note=note: note(f"console: {m.text[:200]}") if m.type == "error" else None)
            page.on("pageerror", lambda e, note=note: note(f"uncaught: {str(e)[:200]}"))
            page.on("requestfailed", lambda r, note=note: note(f"request failed: {r.url}"))
            page.on("response", lambda r, note=note: note(f"HTTP {r.status}: {r.url}") if r.status >= 400 else None)
            page.goto(base); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=15000)
            page.screenshot(path=f"{SHOTS}/t-{tag}-0splash.png")
            page.tap("#board-btn"); page.wait_for_timeout(1200)
            page.tap(".modal .btn"); page.wait_for_timeout(300)
            page.screenshot(path=f"{SHOTS}/t-{tag}-1quarters.png")
            page.evaluate("window.__aq.toggleQuarters()"); page.wait_for_timeout(500)
            page.screenshot(path=f"{SHOTS}/t-{tag}-1bridge.png")
            for st in STATIONS:
                page.evaluate(f"window.__aq.open('{st}')"); page.wait_for_timeout(700)
                if st == "nav":
                    page.mouse.click(w * 0.35, h * 0.5); page.wait_for_timeout(200)
                page.screenshot(path=f"{SHOTS}/t-{tag}-2{st}.png")
                # overflow check: nothing wider than the screen
                if page.evaluate("document.documentElement.scrollWidth > innerWidth + 1"): note(f"{st}: horizontal overflow")
                if st == "ped":
                    if not page.is_hidden("#station"): note("ped: opened as a station, not a pop-up")
                    page.tap(".ped-close")
                else:
                    page.tap("#station .st-head .btn")
                page.wait_for_timeout(200)
            # sound: started by the Board tap, and the PED switch silences it
            a = page.evaluate("import('./js/audio.js').then(m => m.audioState())")
            if not a["started"]: note("audio did not start after boarding")
            page.evaluate("window.__aq.open('ped')"); page.wait_for_timeout(300); page.tap('button.chip:text-is("Settings")'); page.tap('button:text-is("Turn sound off")'); page.wait_for_timeout(400)
            a = page.evaluate("import('./js/audio.js').then(m => m.audioState())")
            if a["master"] != 0: note(f"sound off but master gain is {a['master']}")
            page.tap('button:text-is("Turn sound on")'); page.wait_for_timeout(400)
            a = page.evaluate("import('./js/audio.js').then(m => m.audioState())")
            if a["master"] <= 0: note("sound on but master gain is 0")
            page.tap(".ped-close"); page.wait_for_timeout(200)
            # PED sits on top of a station without replacing it
            page.evaluate("window.__aq.open('nav')"); page.wait_for_timeout(500)
            page.tap('#station .st-head .btn:text-is("PED")'); page.wait_for_timeout(500)
            if page.is_hidden("#ped-pop") or page.is_hidden("#station"): note("ped over station: pop-up or station missing")
            page.screenshot(path=f"{SHOTS}/t-{tag}-3ped-over-nav.png")
            page.tap("#ped-pop", position={"x": 8, "y": 8}); page.wait_for_timeout(300)   # tap outside the panel
            if not page.is_hidden("#ped-pop") or page.is_hidden("#station"): note("ped: tapping outside did not close it, or the station closed too")
            page.tap("#station .st-head .btn"); page.wait_for_timeout(200)
            page.evaluate("window.__aq.toggleQuarters()"); page.wait_for_timeout(600)
            ctx.close()
        browser.close()
    server.shutdown(); shutil.rmtree(site, ignore_errors=True)
    for i in issues: print(i)
    print(f"{len(issues)} problem(s). Screenshots: tools/shots/t-*.png")
    sys.exit(1 if issues else 0)

if __name__ == "__main__":
    main()
