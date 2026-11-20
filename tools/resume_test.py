#!/usr/bin/env python3
"""Coming back to a game (and after an update) starts at the logbook; handling rates.
Run from repo root:  python3 tools/resume_test.py
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
        js = lambda code: page.evaluate("(async()=>{const T=await import('./js/sim.js');const sim=T.sim;" + code + "})()")
        page.goto(base); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=15000)
        page.tap("#board-btn"); page.wait_for_timeout(900)
        page.is_visible(".modal .btn") and page.tap(".modal .btn")
        check("tests start on the bridge unless they ask", page.is_visible(".st-head") is False)
        # handling: turn rate and dive rate
        r = js("const s=sim.s; Object.assign(s,{docked:false,at:null,wpt:null,route:[],speed:0,throttle:0,depth:60,targetDepth:60,heading:0,targetHeading:180,lat:40.2,lon:-72.0}); T.setTimeScale(1); sim.step(1); const slow=s.heading; s.heading=0; s.speed=14; sim.step(1); const fast=s.heading; s.depth=60; s.targetDepth=0; sim.step(1); return {slow, fast:Math.min(fast,360-fast), dive:60-s.depth}")
        check("slow turn is about 6 deg per second", 5.5 <= (r["slow"] if r["slow"] < 180 else 360 - r["slow"]) <= 6.2, r)
        check("turn at full speed is about 3 deg per second", 2.7 <= r["fast"] <= 3.3, r)
        check("dive rate is snappy (a few metres per second)", 1.5 <= r["dive"] <= 10, r)
        # resume: a game that has read the welcome and reloads starts at the logbook
        js("(await import('./js/persist.js')).gameState.updateProperty('progress.read_welcome', true); (await import('./js/persist.js')).checkpoint && 0; return 1")
        page.evaluate("window.__aq.scene('bridge')")
        js("const P=await import('./js/persist.js'); P.saveNow ? P.saveNow() : 0; return 1")
        page.goto(base + "?resume=1"); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=15000)
        page.tap("#board-btn"); page.wait_for_timeout(1500)
        page.is_visible(".modal .btn") and page.tap(".modal .btn")
        title = page.inner_text(".st-title") if page.is_visible(".st-title") else ""
        check("resuming opens the logbook", "logbook" in title.lower(), title)
        ctx.close(); browser.close()
    server.shutdown(); shutil.rmtree(site, ignore_errors=True)
    check("no page errors", not errors, errors)
    print(f"\n{len(fails)} failure(s)"); sys.exit(1 if fails else 0)
if __name__ == "__main__":
    main()
