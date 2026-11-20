#!/usr/bin/env python3
"""Air: scrubbers and the surface. (Header from away_test.)  Crew has the con (sleep with the app closed): the crew keep the course, hold at the Area of Operations limit, stop on arrival and at their time limit,
the plan survives a reload, ARIA briefs on return, and the phone PED shows an estimate.   python3 tools/away_test.py"""
import os, sys, json, importlib.util
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
    root = f"http://127.0.0.1:{server.server_address[1]}/AquaNova/"
    base = root + "tablet/"
    errors = []
    with sync_playwright() as p:
        browser = smoke.launch(p)
        ctx = browser.new_context(viewport={"width": 1180, "height": 820}, has_touch=True)
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)[:200]))
        js = lambda code: page.evaluate("(async()=>{const T=await import('./js/sim.js');const sim=T.sim;const A=await import('./js/away.js');const P=await import('./js/persist.js');" + code + "})()")
        def board():
            page.goto(base); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000)
            page.tap("#board-btn"); page.wait_for_timeout(1200)
        board()
        if page.is_visible(".modal .btn"): page.tap(".modal .btn"); page.wait_for_timeout(300)
        setup = "const s=sim.s; T.setTimeScale(1); Object.assign(s,{docked:false,at:null,wpt:null,route:[],speed:0,throttle:0,depth:100,targetDepth:100,hull:100,damage:0,battery:100,oxygen:100,cruise:false,wskrs:[]});"

        step = "sim.step(3600 / T.TIMESCALE);"
        r = js(setup + "Object.assign(s,{depth:200,targetDepth:200,oxygen:100,scrubbers:100}); T.setTimeScale(1); " + "sim.step(3600); return {sc:s.scrubbers,ox:s.oxygen}")
        check("submerged: scrubbers wear, oxygen holds", r["sc"] < 100 and r["ox"] == 100, r)
        r = js(setup + "Object.assign(s,{depth:0,targetDepth:0,oxygen:50,scrubbers:70}); sim.step(3600); return {sc:s.scrubbers,ox:s.oxygen}")
        check("surface: oxygen refills, scrubbers untouched", r["sc"] == 70 and r["ox"] > 70, r)
        r = js(setup + "Object.assign(s,{depth:200,targetDepth:200,oxygen:100,scrubbers:0}); sim.step(3600); return {sc:s.scrubbers,ox:s.oxygen}")
        check("scrubbers spent: oxygen drains", r["ox"] < 95, r)
        r = js(setup + "Object.assign(s,{depth:0,targetDepth:0,throttle:1,speed:0}); for(let i=0;i<60;i++) sim.step(10); return {kt:s.speed}")
        check("surface speed is limited to 7 knots", r["kt"] <= 7.01 and r["kt"] > 5, r)
        r = js(setup + "Object.assign(s,{lat:34.0,lon:-45.0,heading:90,targetHeading:90,speed:10,throttle:0.4,scrubbers:14}); A.armAway(8); sim.away.real = Date.now() - 2*3600*1000; const rep=A.catchUp(); return {stop: rep.away.stop && rep.away.stop.kind, td: s.targetDepth}")
        check("low scrubbers: the crew surface and hold", r["stop"] == "scrubbers" and r["td"] == 0, r)
        r = js(setup + "const B=await import('./js/bayops.js'); Object.assign(s,{lat:39.0,lon:-68.0,autoAvoid:false,depth:900,targetDepth:900}); const sh=B.shuttle(); sh.state='bay'; sh.bat=100; sh.o2=100; const x=B.launchShuttle(); return {why: x.why, ok: x.ok, scr: s.scrubbers, crush: T.CRUSH_M, peri: T.PERISCOPE_M}")
        check("the Tern will not launch below her safe depth", r["ok"] is False and r["why"] == "deep", r)
        check("crush depth is a little more than the Challenger Deep; periscope is 10 m", 10935 < r["crush"] < 11500 and r["peri"] == 10, r)
        r = js(setup + "const B=await import('./js/bayops.js'); Object.assign(s,{lat:39.0,lon:-68.0,autoAvoid:false,depth:300,targetDepth:300}); Object.assign(B.shuttle(),{state:'out',mode:'follow',dead:false,bat:100,o2:100,pilots:2,pax:0}); s.depth=1200; sim.setDepth(1200); for(let i=0;i<20;i++) sim.step(1); const sh=B.shuttle(); return {d: Math.round(s.depth), standoff: !!sh.standoff, td: sh.depth, away: +(B.shuttleRangeNm ? 0 : 0), rec: B.recoverShuttle().why}")
        check("the ship may go below 800 m with the Tern out", r["d"] > 900, r)
        check("the Tern holds off at a safe depth and cannot be recovered", r["standoff"] and r["td"] <= 600 and r["rec"] == "standoff", r)
        r = js(setup + "const B=await import('./js/bayops.js'); s.depth=300; sim.setDepth(300); for(let i=0;i<20;i++) sim.step(1); const sh=B.shuttle(); return {d: Math.round(s.depth), standoff: !!sh.standoff}")
        check("above 800 m again: she closes in", r["d"] < 800 and (not r["standoff"]), r)
        r = js(setup + "Object.assign(s,{depth:200,targetDepth:200,scrubbers:100}); sim.step(86400); return s.scrubbers")
        check("scrubbers last months: about 1% a day", 98 < r < 99.6, r)
        check("no page errors", not errors, errors)
        browser.close()
    server.shutdown()
    print("\nAll checks passed." if not fails else f"\n{len(fails)} FAILED: {fails}")
    sys.exit(1 if fails else 0)
main()
