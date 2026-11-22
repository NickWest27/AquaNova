#!/usr/bin/env python3
"""Limits are held and the Captain is told; the Captain can override (bay doors), and the science lab hotspots open one page each.  python3 tools/limits_test.py"""
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
    with sync_playwright() as p:
        browser = smoke.launch(p)
        page = browser.new_context(viewport={"width": 1180, "height": 820}, has_touch=True).new_page(); errors = []
        page.on("pageerror", lambda e: errors.append(str(e)[:200]))
        js = lambda code: page.evaluate("(async()=>{const sim=(await import('./js/sim.js')).sim;const bo=await import('./js/bayops.js');" + code + "})()")
        page.goto(base); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000)
        page.tap("#board-btn"); page.wait_for_timeout(800)
        if page.is_visible(".modal .btn"): page.tap(".modal .btn"); page.wait_for_timeout(300)
        page.wait_for_function("(async()=>{const sf=(await import('./js/seafloor.js')).seafloor; return sf.ready})()", timeout=30000)
        setup = "Object.assign(sim.s,{docked:false,lat:39.45,lon:-72.25,at:null,depth:60,targetDepth:60,speed:0,throttle:1,battery:100,wpt:null}); sim.s.bay=null; sim.s.rov=null; window.__caps=[]; sim.on&&0;"
        r = js(setup + "sim.s.rov={lat:sim.s.lat,lon:sim.s.lon,depth:5,cmd:{thr:0,turn:0,dive:0},cargo:[]}; let said=0; const off=sim.on?sim.on('speed-cap',()=>said++):null; for(let i=0;i<900;i++) sim.step(0.1); return {kt:sim.s.speed, said:sim.s.speedCapSaid}")
        check("with the outer doors open the helm holds the speed at the limit", r["kt"] <= 8.1 and r["said"] is True, r)
        r = js("bo.setBayOverride(true); for(let i=0;i<900;i++) sim.step(0.1); return {kt:sim.s.speed, ov:bo.bay().override}")
        check("the Captain's override lets her go faster", r["kt"] > 9 and r["ov"] is True, r)
        r = js("sim.s.rov=null; sim.step(0.1); return {ov:bo.bay().override}")
        check("the override lapses when the doors close", r["ov"] is False, r)
        r = js(setup.replace("throttle:1", "throttle:1") + "for(let i=0;i<900;i++) sim.step(0.1); const x=bo.launchRemora(); return {kt:sim.s.speed, x}")
        check("a launch above the limit is refused until the Captain slows or overrides", r["kt"] > 9 and r["x"]["ok"] is False and r["x"]["why"] == "fast", r)
        # science lab hotspots
        page.evaluate("window.__aq.scene('science')"); page.wait_for_timeout(500)
        for name, want_tabs in [("lab-samples", False), ("lab-analysis", False), ("lab-research", False), ("lab", True)]:
            page.evaluate(f"window.__aq.scene('science')"); page.wait_for_timeout(300)
            hs = {"lab-samples": "SAMPLES", "lab-analysis": "ANALYSIS", "lab-research": "RESEARCH", "lab": "MAIN COMPUTER"}[name]
            page.locator(".scene.science .hs", has_text=hs).first.dispatch_event("click") if page.locator(".scene.science .hs", has_text=hs).count() else page.evaluate(f"window.__aq.open('{name}')"); page.wait_for_timeout(500)
            tabs = page.locator("#station .tabs .chip").count()
            check(f"{hs} hotspot opens {'all three pages' if want_tabs else 'only its own page'}", (tabs == 3) == want_tabs and (tabs == 0 or want_tabs), tabs)
            page.evaluate("document.querySelector('#station .back, #back')&&document.querySelector('#station .back, #back').click()"); page.wait_for_timeout(200)
        check("no page errors", not errors, errors[:3])
        browser.close()
    server.shutdown()
    print("\nAll checks passed." if not fails else f"\n{len(fails)} failed")
    sys.exit(1 if fails else 0)
main()
