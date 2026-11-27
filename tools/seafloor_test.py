#!/usr/bin/env python3
"""Sea floor: depth lookup, grounding damage, map edge, nav map with contours.  python3 tools/seafloor_test.py"""
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
        ctx = browser.new_context(viewport={"width": 1180, "height": 820}, has_touch=True)
        page = ctx.new_page(); errors = []
        page.on("pageerror", lambda e: errors.append(str(e)[:200]))
        page.on("console", lambda m: errors.append(m.text[:200]) if m.type == "error" else None)
        js = lambda code: page.evaluate("(async()=>{const sim=(await import('./js/sim.js')).sim;const sf=(await import('./js/seafloor.js')).seafloor;sim.s.autoAvoid=false;(await import('./js/sim.js')).setTimeScale(30);" + code + "})()")
        page.goto(base); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000)
        page.tap("#board-btn"); page.wait_for_timeout(1500)
        if page.is_visible(".modal .btn"): page.tap(".modal .btn"); page.wait_for_timeout(300)
        check("sea floor loaded", js("return sf.ready"))
        d = js("return sf.depthAt(41.5223,-70.6709)")
        check("dock is in shallow water", d is not None and 2 < d < 30, d)
        c = js("return sf.depthAt(39.40,-72.20)")
        check("Hudson Canyon is deep", c is not None and c > 500, c)
        check("outside the chart is null", js("return sf.depthAt(10,10)") is None)
        check("Deep Trench Alpha moved to the canyon", js("const p=sim.s.pois.find(q=>q.name==='Deep Trench Alpha');return Math.abs(p.lat-39.4)<0.01"))
        # diving into the bottom: depth is held above the floor, one hit
        r = js("""const s=sim.s; s.docked=false; s.at=null; s.lat=41.2; s.lon=-70.7; s.hull=100; s.damage=0; s.depth=0; s.targetDepth=500; s.speed=0; s.throttle=0;
          for(let i=0;i<400;i++) sim.step(0.2); return {depth:s.depth, floor:sf.depthAt(s.lat,s.lon), hull:s.hull};""")
        check("ship cannot dive through the floor", r["depth"] <= r["floor"] - 7.9, r)
        check("touching bottom costs hull", r["hull"] < 100, r)
        # driving into the shore
        r = js("""const s=sim.s; let lat=41.0; while(sf.depthAt(lat,-70.75) >= 20 && lat<42) lat+=0.005;
          s.damage=0; s.hull=100; s.lat=lat-0.06; s.lon=-70.75; s.depth=0; s.targetDepth=0; s.heading=0; s.targetHeading=0; s.speed=8; s.throttle=0.6; s.wpt=null;
          for(let i=0;i<600;i++) sim.step(0.2); return {lat:s.lat, shore:lat, speed:s.speed, hull:s.hull, depth:sf.depthAt(s.lat,s.lon)};""")
        check("ship stopped in the last water before the shore", r["depth"] < 12 and r["speed"] == 0, r)
        check("grounding costs hull", r["hull"] < 95, r)
        # map edge
        r = js("""const s=sim.s; s.damage=0; s.hull=100; s.lat=40.5; s.lon=-70.01; s.depth=0; s.heading=90; s.targetHeading=90; s.speed=8; s.throttle=0.6;
          for(let i=0;i<100;i++) sim.step(0.2); return {lon:s.lon, hull:s.hull, speed:s.speed};""")
        check("ship stops at the map edge, no damage", r["lon"] <= -70.0 and r["hull"] == 100 and r["speed"] == 0, r)
        # docked repairs
        r = js("""const s=sim.s; const d=sim.dockPoi(); s.lat=d.lat; s.lon=d.lon; s.docked=true; s.damage=20; for(let i=0;i<600;i++) sim.step(0.2); return s.damage;""")
        check("dock crew repair the hull", r < 20, r)
        # WSKRs
        r = js("const s=sim.s; s.wskrs=[]; s.docked=false; s.lat=39.45; s.lon=-72.25; const a=sim.deployWskr(); s.lat=39.6; const b=sim.deployWskr(); return [a.ok, b.n, s.wskrs.length]")
        check("two WSKRs deployed", r == [True, 2, 2], r)
        # nav map with contours at the canyon
        js("const s=sim.s; s.docked=false; s.damage=0; s.lat=39.45; s.lon=-72.25; s.depth=100; s.targetDepth=100; s.speed=0; s.throttle=0; s.heading=0; s.targetHeading=0")
        page.evaluate("window.__aq.scene('bridge')"); page.wait_for_timeout(1500)
        page.locator('.hs[aria-label="RANGE +"]').dispatch_event("click"); page.wait_for_timeout(800)   # the yellow desk key
        page.screenshot(path=os.path.join(ROOT, "tools", "shots", "seafloor_nav.png"))
        check("fine tile loaded near the ship", js("return [...sf.tiles.values()].some(Boolean)"))
        # fog of war: charted areas stay charted
        r = js("""const s=sim.s; sf.clearChart(); s.docked=false; s.sonar=true; s.sweepUntil=0; s.wskrs=[]; s.lat=39.45; s.lon=-72.25; sim.step(0.1);
          const here=sf.isCharted(39.45,-72.25), n1=sf.chartedCount();
          s.lat=39.9; s.lon=-72.25; sim.step(0.1);
          return {here, stillHere: sf.isCharted(39.45,-72.25), far: sf.isCharted(39.9,-72.25), unseen: sf.isCharted(39.6,-72.25), n1, n2: sf.chartedCount()}""")
        check("ship charts its surroundings", r["here"] and r["far"] and r["n1"] > 20, r)
        check("charted area stays after the ship leaves", r["stillHere"] and r["n2"] > r["n1"], r)
        check("uncharted water stays dark", not r["unseen"], r)
        r = js("""const txt=sf.chartToString(); const n=sf.chartedCount(); sf.clearChart(); const empty=sf.chartedCount(); sf.setChart(txt); return {len:txt.length, n, empty, back: sf.chartedCount(), here: sf.isCharted(39.45,-72.25)}""")
        check("chart saves and restores exactly", r["empty"] == 0 and r["back"] == r["n"] and r["here"], r)
        check("saved chart text is small", r["len"] < 8000, r)
        s0 = js("return sf.chartedCount()")
        js("sim.s.sonar=false; sim.s.lat=40.2; sim.s.lon=-72.0; sim.step(0.1)")
        s1 = js("return sf.chartedCount()")
        js("sim.s.sonar=true; sim.s.lat=40.5; sim.s.lon=-72.0; sim.step(0.1)")
        s2 = js("return sf.chartedCount()")
        check("mapping uses the survey sensors, not the sonar: the same patch with the sonar off or on (owner, 2026-11-27)", s1 - s0 > 0 and abs((s1 - s0) - (s2 - s1)) <= 0.1 * (s2 - s1), (s0, s1, s2))
        check("no console errors", not errors, errors)
        browser.close()
    server.shutdown()
    print("\nFAILED: " + ", ".join(fails) if fails else "\nAll checks passed.")
    sys.exit(1 if fails else 0)
main()
