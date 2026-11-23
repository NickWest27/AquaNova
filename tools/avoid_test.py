#!/usr/bin/env python3
"""Terrain protection: a depth order never puts the ship into the floor; Chen warns and holds 10 m off.  python3 tools/avoid_test.py"""
import importlib.util
from playwright.sync_api import sync_playwright
spec = importlib.util.spec_from_file_location("smoke", __file__.replace("avoid_test.py", "smoke.py")); smoke = importlib.util.module_from_spec(spec); spec.loader.exec_module(smoke)
fails = []
def check(n, ok, x=""):
    print(("ok   " if ok else "FAIL ") + n + (f"  {x}" if x and not ok else ""))
    if not ok: fails.append(n)
def main():
    server, site = smoke.start_server()
    base = f"http://127.0.0.1:{server.server_address[1]}/AquaNova/tablet/"
    with sync_playwright() as p:
        b = smoke.launch(p); page = b.new_context(viewport={"width": 1180, "height": 820}, has_touch=True).new_page(); errs = []
        page.on("pageerror", lambda e: errs.append(str(e)[:200]))
        js = lambda code: page.evaluate("(async()=>{const sim=(await import('./js/sim.js')).sim;const sf=(await import('./js/seafloor.js')).seafloor;" + code + "})()")
        page.goto(base); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000)
        page.tap("#board-btn"); page.wait_for_timeout(800)
        if page.is_visible(".modal .btn"): page.tap(".modal .btn"); page.wait_for_timeout(300)
        js("const m=(await import('../game/systems/missionManager.js')).default; m.forceCompleteMission('meetTheCrew')")
        place = "const s=sim.s; const c=s.pois.find(p=>p.name==='Deep Trench Alpha'); Object.assign(s,{lat:c.lat,lon:c.lon,docked:false,at:null,wpt:null,rov:null,wskrs:[],cruise:false,hug:false,avoiding:false,speed:0,throttle:0,depth:0,targetDepth:0}); s.floor=sf.depthAt(s.lat,s.lon); s.depth=Math.max(0,s.floor-40); s.targetDepth=s.depth; sim.lastAvoid=0;"
        r = js(place + """window.__ev=[]; sim.on && 0; const orig=sim.emit; sim.emit=(t,d)=>{window.__ev.push(t); return orig.call(sim,t,d)};
          sim.setDepth(5000); sim.setHeading(250); sim.setThrottle(0.4); s.heading=250; let minAlt=1e9;
          for(let i=0;i<6000;i++){ sim.step(0.1); if(s.floor!=null) minAlt=Math.min(minAlt,s.floor-s.depth); }
          return {hull:s.hull, minAlt, avoiding:s.avoiding, ordered:s.targetDepth, depth:s.depth, floor:s.floor, ev:[...new Set(window.__ev)]}""")
        check("ordered 5000 m near a rising floor: hull intact", r["hull"] == 100, str(r))
        check("stayed off the floor (never under 8 m)", r["minAlt"] >= 8, str(r))
        check("the order itself is kept (5000 m)", r["ordered"] == 5000, str(r))
        check("Chen's collision alert fired", "avoid-on" in r["ev"], str(r))
        r = js(place + "sim.setDepth(200); sim.setHeading(250); sim.setThrottle(0.4); s.heading=250; for(let i=0;i<9000;i++) sim.step(0.1); return {depth:s.depth, avoiding:s.avoiding, floor:s.floor}")
        check("an order shallower than the floor is obeyed, no override", abs(r["depth"] - 200) < 3 and not r["avoiding"], str(r))
        r = js(place + "sim.setDepth(5000); for(let i=0;i<9000;i++) sim.step(0.1); return {depth:s.depth, floor:s.floor, hull:s.hull, avoiding:s.avoiding}")
        check("stopped, ordered below the floor: holds 10 m off", s_ok(r), str(r))
        r = js("const s=sim.s; const d=s.pois.find(p=>p.type==='dock'); Object.assign(s,{lat:d.lat-0.3/60,lon:d.lon,docked:false,at:null,wpt:null,rov:null,wskrs:[],cruise:false,hug:false,avoiding:false,speed:0,throttle:0,depth:0,targetDepth:0}); s.floor=sf.depthAt(s.lat,s.lon); sim.lastAvoid=0; window.__ev=[]; const o=sim.emit; sim.emit=(t,x)=>{window.__ev.push(t); return o.call(sim,t,x)}; sim.setDepth(50); for(let i=0;i<1200;i++) sim.step(0.1); return {depth:s.depth,floor:s.floor,hull:s.hull,ev:[...new Set(window.__ev)]}")
        check("inside the harbour a deep order still stops above the floor, and Chen says so", r["depth"] <= r["floor"] - 2.9 and r["hull"] == 100 and "avoid-on" in r["ev"], str(r))
        page.evaluate("window.__aq.scene('bridge')"); page.wait_for_timeout(300)
        r = js("sim.s.docked=false; const n=await import('./js/notify.js'); return typeof n.say")
        check("no page errors", not errs, str(errs[:3]))
        b.close()
    print("\nall ok" if not fails else f"\n{len(fails)} FAILED"); raise SystemExit(1 if fails else 0)
def s_ok(r): return 8 <= r["floor"] - r["depth"] <= 25 and r["hull"] == 100 and r["avoiding"]
main()
