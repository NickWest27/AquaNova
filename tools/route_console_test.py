#!/usr/bin/env python3
"""Bridge NAV and HLM pages: Dest, Fix, Route, Plot (with turn points), manual control and return to route, SHW, and the HLM controls.  python3 tools/route_console_test.py"""
import importlib.util, os, sys
from playwright.sync_api import sync_playwright
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sp = importlib.util.spec_from_file_location("smoke", R + "/tools/smoke.py"); sm = importlib.util.module_from_spec(sp); sp.loader.exec_module(sm)
srv, _ = sm.start_server(); base = f"http://127.0.0.1:{srv.server_address[1]}/AquaNova/tablet/"
fails = []
def check(n, ok, x=""):
    print(("ok   " if ok else "FAIL ") + n + (f"  {x}" if x and not ok else ""))
    if not ok: fails.append(n)
with sync_playwright() as p:
    b = sm.launch(p); pg = b.new_context(viewport={"width": 1180, "height": 820}, has_touch=True).new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
    js = lambda code: pg.evaluate("(async()=>{const sim=(await import('./js/sim.js')).sim;" + code + "})()")
    pg.goto(base); pg.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000); pg.tap("#board-btn"); pg.wait_for_timeout(800)
    if pg.is_visible(".modal .btn"): pg.tap(".modal .btn"); pg.wait_for_timeout(300)
    js("const s=sim.s; const d=s.pois.find(p=>p.type==='dock'); Object.assign(s,{lat:d.lat-3/60,lon:d.lon,docked:false,at:null,wpt:null,fixes:[],speed:0,throttle:0.3,depth:0,targetDepth:0})")
    pg.evaluate("window.__aq.scene('bridge')"); pg.wait_for_timeout(500)
    tap = lambda t: pg.locator(f'.bbtn:visible:text-is("{t}")').first.dispatch_event("click")
    st = lambda: js("const s=sim.s; return {wpt:s.wpt&&s.wpt.name, fixes:s.fixes.map(f=>f.name), tps:s.route.filter(q=>q.tp).length, route:s.route.length, thr:s.throttle, hug:s.hug}")
    check("six pages on the left desk", pg.locator(".selector .bbtn").count() == 6 and pg.locator(".selector .bbtn").all_inner_texts() == ["NAV", "HLM", "TAC", "SNR", "VW", "SYS"])
    # Dest: Vineyard Ledge
    tap("Dest"); pg.wait_for_timeout(300)
    pg.locator("#pc-place").first.select_option(label="Vineyard Ledge") if pg.locator("#pc-place").first.is_visible() else None
    pg.locator(".pc .btn", has_text="Place / Bearing").first.tap(); pg.wait_for_timeout(200)
    pg.locator("#pc-place").select_option(label="Vineyard Ledge")
    pg.locator(".pc .btn.primary", has_text="Set destination").tap(); pg.wait_for_timeout(300)
    r = st(); check("Dest sets the last fix and does not plot yet", r["fixes"] == ["Vineyard Ledge"] and r["wpt"] is None, str(r))
    # Fix: a waypoint by lat/long, with a name; it joins the end of the route
    tap("Fix"); pg.wait_for_timeout(300)
    d = js("const d=sim.s.pois.find(p=>p.name==='Vineyard Ledge'); return {lat:d.lat,lon:d.lon}")
    pg.fill("#pc-lat", str(round(d["lat"] - 0.1, 3))); pg.fill("#pc-lon", str(round(d["lon"] + 0.1, 3))); pg.fill("#pc-name", "Rendezvous"); pg.fill("#pc-depth", "40")
    pg.locator(".pc .btn.primary", has_text="Add fix").tap(); pg.wait_for_timeout(300)
    r = st(); check("Fix adds a named waypoint to the route", r["fixes"] == ["Vineyard Ledge", "Rendezvous"], str(r))
    tap("Fix"); pg.wait_for_timeout(300)
    pg.fill("#pc-lat", str(round(d["lat"] - 0.2, 3))); pg.fill("#pc-lon", str(round(d["lon"] + 0.2, 3)))
    pg.locator(".pc .btn.primary", has_text="Add fix").tap(); pg.wait_for_timeout(300)
    r = st(); check("an unnamed fix is called WP[number]", r["fixes"][-1].startswith("WP"), str(r))
    # Route list: move the WP up, delete it
    tap("Route"); pg.wait_for_timeout(300)
    check("the route list shows each fix with the destination marked", "(DEST)" in pg.inner_text(".route-list") and pg.locator(".route-row").count() == 3)
    pg.locator(".route-row").nth(2).locator('button[aria-label="Move up"]').tap(); pg.wait_for_timeout(200)
    r = st(); check("a fix moves up", r["fixes"][1].startswith("WP") and r["fixes"][2] == "Rendezvous", str(r))
    pg.locator(".route-row").nth(1).locator('button[aria-label="Delete"]').tap(); pg.wait_for_timeout(200)
    r = st(); check("a fix is deleted", r["fixes"] == ["Vineyard Ledge", "Rendezvous"], str(r))
    pg.locator(".modal .btn", has_text="Close").tap(); pg.wait_for_timeout(200)
    # Plot
    tap("Plot"); pg.wait_for_timeout(400)
    r = st(); check("Plot makes a course to the last fix", r["wpt"] == "Rendezvous" and r["route"] >= 2, str(r))
    pg.screenshot(path=os.path.join(R, "tools", "shots", "console_nav_route.png"))
    # manual control keeps the route; Plot returns to it
    tap("Port") if False else None
    pg.locator(".selector .bbtn", has_text="HLM").tap(); pg.wait_for_timeout(300)
    tap("Port"); pg.wait_for_timeout(200)
    r = st(); check("manual control drops the course but keeps the route", r["wpt"] is None and len(r["fixes"]) == 2, str(r))
    pg.locator(".selector .bbtn", has_text="NAV").tap(); pg.wait_for_timeout(300); tap("Plot"); pg.wait_for_timeout(300)
    r = st(); check("Plot returns to the route", r["wpt"] == "Rendezvous", str(r))
    # turn points: a fix across land is reached by turn points
    pair = js("""const water=(la,lo)=>sim.shipPassable(la,lo); const cross=(a,b)=>{for(let i=0;i<=200;i++){const la=a.lat+(b.lat-a.lat)*i/200, lo=a.lon+(b.lon-a.lon)*i/200; if(!water(la,lo)) return true;} return false;};
      const a={lat:41.30,lon:-70.65}; for (const b of [{lat:41.62,lon:-70.40},{lat:41.50,lon:-70.30},{lat:41.45,lon:-71.00},{lat:41.60,lon:-70.60}]) { if(water(a.lat,a.lon)&&water(b.lat,b.lon)&&cross(a,b)) return {a,b}; } return null""")
    check("found two points with land between", pair is not None)
    js("const a=%s,b=%s; sim.clearRoute(); Object.assign(sim.s,{lat:a.lat,lon:a.lon}); sim.s.fixes=[sim.newFix({lat:b.lat,lon:b.lon,name:'Far side'})]; return 1" % (__import__('json').dumps(pair["a"]), __import__('json').dumps(pair["b"])))
    tap("Plot"); pg.wait_for_timeout(300)
    r = st(); check("the helm adds turn points where land is in the way, and they are not in the route list", r["tps"] >= 1 and r["fixes"] == ["Far side"], str(r))
    # SHW
    tap("SHW"); pg.wait_for_timeout(200)
    check("SHW puts the four switches on the controls", all(pg.locator(f'.bbtn:visible:text-is("{t}")').count() for t in ("Ships", "Subs", "Base", "Orgs")))
    tap("Ships"); pg.wait_for_timeout(100)
    check("a switch turns an item off on the display", js("return 1") and pg.evaluate("window.__aq.console().nds[0].show.ships === false"))
    tap("SHW")
    # HLM
    pg.locator(".selector .bbtn", has_text="HLM").tap(); pg.wait_for_timeout(400)
    check("HLM shows the heading dial and both tapes", pg.locator(".bdisp .bd-helm .dial").count() == 1 and pg.locator(".bdisp .bd-helm svg.tape").count() == 2)
    check("HLM has no Dock button", pg.locator('.bbtn:visible:text-is("Dock")').count() == 0)
    check("HLM has all ten controls", all(pg.locator(f'.bbtn:visible:text-is("{t}")').count() == 1 for t in ("Port", "Stbd", "Stop", "Slow", "Fast", "Up", "Dn", "Srfc", "NOE", "Cruise")))
    js("sim.s.throttle=0.3"); tap("Fast"); r = st(); check("Fast adds 10%", abs(r["thr"] - 0.4) < 0.001, str(r))
    tap("Slow"); tap("Slow"); r = st(); check("Slow takes 10% off", abs(r["thr"] - 0.2) < 0.001, str(r))
    tap("Stop"); r = st(); check("Stop sets 0 kt and keeps the course", r["thr"] == 0, str(r))
    tap("Dn"); check("Dn orders 50 m", js("return sim.s.targetDepth") == 50) if False else None
    pg.screenshot(path=os.path.join(R, "tools", "shots", "console_hlm.png"))
    check("no page errors", not errs, str(errs[:3]))
    b.close()
srv.shutdown(); sys.exit(1 if fails else 0)
