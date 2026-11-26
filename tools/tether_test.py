#!/usr/bin/env python3
"""Remora's tether parts if the ship drags it past its length (owner, 2026-11-25): she is lost (no control, no telemetry), the bay doors close,
Engineering splice a new tether (2 h), and the Tern fetches her home.
Run from repo root:  python3 tools/tether_test.py
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
        js = lambda code: page.evaluate("(async()=>{const sim=(await import('./js/sim.js')).sim;const B=await import('./js/bayops.js');const R=await import('./js/rov.js');" + code + "})()")
        page.goto(base + "?intake=0"); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=15000)
        page.tap("#board-btn"); page.wait_for_timeout(900)
        page.is_visible(".modal .btn") and page.tap(".modal .btn")
        # Remora out on her tether, a sample aboard; the ship 0.9 nm away
        js("""const s=sim.s; Object.assign(s,{docked:false,at:null,lat:40.2,lon:-72.0,depth:60,targetDepth:60,speed:0,throttle:0,heading:0}); s.bay={op:null,doorDmg:0,tubes:{}};
          s.rov={lat:s.lat-0.9/60,lon:s.lon,heading:0,depth:60,cmd:{thr:0,turn:0,dive:0},job:null,cargo:[{kind:'water',site:null,tool:'collector'}],auto:false,home:false}; sim.step(1); return 1""")
        check("inside the tether's length she stays tethered", js("return R.rovTethered() && B.bayDoorsOpen()"))
        # the ship moves on: 1.2 nm from her
        r = js("const s=sim.s; s.lat=s.rov.lat+1.2/60; sim.step(1); return {lost:!!(s.rov&&s.rov.lost), doors:B.bayDoorsOpen(), fix:!!s.bay.tetherFix}")
        check("past the tether's length it parts: she is lost", r["lost"], r)
        check("the bay doors are no longer held open", not r["doors"], r)
        check("Engineering start splicing a new tether", r["fix"], r)
        r = js("return {auto:sim.rovAuto().why, tool:sim.rovUse('collector').why, rec:B.recoverRemora().why, launch:B.launchRemora().why, speed:sim.rovSpeed(0.5)}")
        check("no control: auto return, tools, recover and speed are refused", r["auto"] == "lost" and r["tool"] == "lost" and r["rec"] == "lost" and r["speed"] is None, r)
        r = js("const r=sim.s.rov, a=[r.lat,r.lon]; for(let i=0;i<30;i++) sim.step(1); return Math.abs(r.lat-a[0])+Math.abs(r.lon-a[1])")
        check("she stays where she was", r < 1e-9, r)
        # the Tern can launch now (no tether in the doors), then fetches her
        r = js("const s=sim.s; s.shuttle={state:'bay',bat:100,o2:100,mode:'follow',pilots:2,pax:0}; return B.launchShuttle()")
        check("the Tern can launch (the tether no longer holds the doors)", r["ok"], r)
        js("for(let i=0;i<70;i++) sim.step(1); return 1")
        r = js("return B.fetchRemora()")
        check("Fetch Remora is accepted", r["ok"], r)
        r = js("const s=sim.s; for(let i=0;i<900&&s.rov;i++) sim.step(1); return {rov:!!s.rov, carry:!!s.shuttle.carry, mode:s.shuttle.mode}")
        check("the Tern reaches her and takes her aboard", not r["rov"] and r["carry"] and r["mode"] in ("returning", "follow"), r)
        r = js("const s=sim.s; for(let i=0;i<900&&s.shuttle.mode!=='follow';i++) sim.step(1); const x=B.recoverShuttle(); for(let i=0;i<90;i++) sim.step(1); return {x, state:s.shuttle.state, rearm:s.bay.rearm&&s.bay.rearm.load, carry:!!s.shuttle.carry}")
        check("back alongside, the Tern comes aboard with Remora and her sample", r["x"]["ok"] and r["state"] == "bay" and r["rearm"] == 1 and not r["carry"], r)
        r = js("return B.launchRemora().why")
        check("Remora cannot go out while the tether is being spliced (or she is unloading)", r in ("tetherfix", "rearm"), r)
        r = js("const s=sim.s; s.bay.rearm=null; s.bay.tetherFix.t=s.bay.tetherFix.dur; sim.step(1); return {fix:!!s.bay.tetherFix, launch:B.launchRemora().ok}")
        check("once the new tether is in, she can launch again", not r["fix"] and r["launch"], r)
        # the crew have the con with Remora out and the ship under way: the XO holds the ship, brings her home, then carries on
        r = js("""const s=sim.s, A=await import('./js/away.js'); s.bay={op:null,doorDmg:0,tubes:{}}; s.shuttle={state:'bay',bat:100,o2:100,mode:'follow',pilots:2,pax:0};
          Object.assign(s,{lat:40.2,lon:-72.0,heading:0,speed:6,throttle:0.5,depth:60,targetDepth:60,cruise:false});
          s.rov={lat:s.lat-0.6/60,lon:s.lon,heading:0,depth:60,cmd:{thr:0,turn:0,dive:0},job:null,cargo:[],auto:false,home:false}; A.armAway(8);
          let maxNm=0, held=false; for(let i=0;i<4000&&s.rov;i++){ sim.step(1); if(s.rov) maxNm=Math.max(maxNm, toward(s,s.rov).nm); if(s.speed<0.5) held=true; }
          const aboard=!s.rov; for(let i=0;i<200;i++) sim.step(1); const sp=s.speed, log=(sim.away&&sim.away.log||[]).map(e=>e.t); return {aboard, held, maxNm, sp, log, stop:sim.away&&sim.away.stop}""".replace("toward(", "(await import('./js/sim.js')).toward("))
        check("XO: with Remora out the ship holds, she comes home and aboard, the tether never parts", r["aboard"] and r["held"] and r["maxNm"] < 1.0 and not r["stop"], r)
        check("XO: then the ship carries on under way", r["sp"] > 2, r)
        r = js("""const s=sim.s; s.rov={lat:s.lat-1.5/60,lon:s.lon,heading:0,depth:60,cmd:{thr:0,turn:0,dive:0},job:null,cargo:[],auto:false,home:false}; for(let i=0;i<5;i++) sim.step(1);
          const st=sim.away&&sim.away.stop; const A=await import('./js/away.js'); A.wakeNow(); return st""")
        check("XO: if the tether parts anyway the crew stop for the lost craft", r and r["kind"] == "craft" and r.get("name") == "Remora", r)
        check("no page errors", not errors, str(errors))
        browser.close()
    server.shutdown()
    print(f"\n{len(fails)} failure(s)"); sys.exit(1 if fails else 0)
if __name__ == "__main__":
    main()
