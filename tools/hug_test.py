#!/usr/bin/env python3
"""Hug the floor: the helm holds 10 m off the sea floor and follows it.  python3 tools/hug_test.py"""
import importlib.util, sys
from playwright.sync_api import sync_playwright
spec = importlib.util.spec_from_file_location("smoke", __file__.replace("hug_test.py", "smoke.py")); smoke = importlib.util.module_from_spec(spec); spec.loader.exec_module(smoke)
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
        place = "const s=sim.s; const c=s.pois.find(p=>p.name==='Deep Trench Alpha'); Object.assign(s,{lat:c.lat,lon:c.lon,docked:false,at:null,wpt:null,rov:null,wskrs:[],cruise:false,hug:false,speed:0,throttle:0,depth:0,targetDepth:0}); s.floor=sf.depthAt(s.lat,s.lon); s.depth=Math.max(0,s.floor-40); s.targetDepth=s.depth;"
        r = js(place + "const ok=sim.setHug(true); return {ok:ok.ok, floor:s.floor}")
        check("hug starts in deep water", r["ok"], str(r))
        r = js(place + """sim.setHug(true); sim.setHeading(250); sim.setThrottle(0.4); s.heading=250; const alts=[]; let minAlt=1e9, maxAlt=0;
          for(let i=0;i<6000;i++){ sim.step(0.1); if(i>2500 && s.floor!=null){ const a=s.floor-s.depth; minAlt=Math.min(minAlt,a); maxAlt=Math.max(maxAlt,a);} }
          return {hug:s.hug, depth:s.depth, floor:s.floor, minAlt, maxAlt, hull:s.hull, speed:s.speed}""")
        check("still hugging after five minutes underway", r["hug"], str(r))
        check("never touched the bottom (hull intact)", r["hull"] == 100, str(r))
        check("stays about 10 m off the floor (never under 8, never over 60 once settled)", r["minAlt"] >= 8 and r["maxAlt"] <= 60, str(r))
        r = js("sim.setDepth(100); return sim.s.hug")
        check("a depth order ends it", r is False, str(r))
        # communicator order
        r = js(place + "return null")
        page.evaluate("window.__aq.scene('bridge')"); page.wait_for_timeout(300)
        page.evaluate("document.querySelector('#pin').click()"); page.wait_for_timeout(700)
        tap = lambda: page.wait_for_timeout(350)
        page.locator(".comm-who", has_text="Helm").first.tap(); tap()
        if page.locator(".comm-reply", has_text="Marcus Chen").count(): page.locator(".comm-line", has_text="I need something").first.tap(); tap()
        page.locator(".comm-line", has_text="Orders").first.tap(); tap()
        page.locator(".comm-line", has_text="Depth").first.tap(); tap()
        page.locator(".comm-line", has_text="Hug the floor").first.tap(); tap()
        check("communicator order turns it on", js("return sim.s.hug") is True)
        check("Chen answers", "floor" in page.inner_text(".comm-reply").lower(), page.inner_text(".comm-reply"))
        page.locator(".comm-line", has_text="Something else").first.tap(); tap()
        page.locator(".comm-line", has_text="Orders").first.tap(); tap()
        page.locator(".comm-line", has_text="Depth").first.tap(); tap()
        page.locator(".comm-line", has_text="Stop hugging").first.tap(); tap()
        check("stop order turns it off", js("return sim.s.hug") is False)
        r = js("sim.s.docked=true; sim.s.hug=true; sim.step(0.1); return sim.s.hug"); 
        check("docking ends it", r is False, str(r))
        r = js("const S=await import('./js/sim.js'); return [S.diveRate(0), S.diveRate(5), S.diveRate(14), S.diveRate(60), S.diveRate(100,true)]")
        check("dive rate depends on speed (0.5 stopped, about 0.9 at 5 kt, 2.6 at 14 kt, capped at 3, 10 in cruise)", abs(r[0]-0.5)<1e-6 and 0.8<r[1]<1.0 and 2.4<r[2]<2.8 and r[3]==3 and r[4]==10, str(r))
        check("no page errors", not errs, str(errs))
    server.shutdown()
    print("\nAll checks passed." if not fails else f"\n{len(fails)} failed"); sys.exit(1 if fails else 0)
main()
