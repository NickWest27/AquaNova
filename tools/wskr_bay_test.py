#!/usr/bin/env python3
"""WSKR bay automation: launch all by order, low-battery relaunch after a full charge, and Marcus slowing the ship when the crew have the con.  python3 tools/wskr_bay_test.py"""
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
    js = lambda code: pg.evaluate("(async()=>{const sim=(await import('./js/sim.js')).sim;const B=await import('./js/bayops.js');" + code + "})()")
    pg.goto(base); pg.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000); pg.tap("#board-btn"); pg.wait_for_timeout(800)
    if pg.is_visible(".modal .btn"): pg.tap(".modal .btn"); pg.wait_for_timeout(300)
    pg.evaluate("import('./js/sim.js').then(m=>m.setTimeScale(1))"); pg.wait_for_timeout(200)
    setup = "const s=sim.s; const c=sim.dockPoi(); Object.assign(s,{lat:c.lat-0.3,lon:c.lon-0.1,wskrs:[],rov:null,docked:false,wpt:null,fixes:[],speed:0,throttle:0,depth:20,targetDepth:20,heading:0,at:null,hull:100,damage:0}); s.rack={}; s.bay={op:null,doorDmg:0,relaunch:{},launchAll:false}; sim.away=null; return 1"
    run = lambda secs: js(f"for(let i=0;i<{int(secs)};i++) sim.step(1); return 1")
    # launch all
    js(setup)
    r = js("return B.launchAllWskrs()"); check("Launch all is accepted with four free slots", r["ok"] and r["count"] == 4, str(r))
    run(60 * 4 + 30)
    check("the bay launches them one after another until all four are out", js("return sim.s.wskrs.length") == 4)
    check("Launch all is finished once they are out", js("return sim.s.bay.launchAll") is False)
    r = js("return B.launchAllWskrs()"); check("Launch all with all out says so", not r["ok"] and r["why"] == "full", str(r))
    js("sim.s.speed=14; return 1"); js("sim.s.wskrs=[]; return 1")
    r = js("return B.launchAllWskrs()"); check("Launch all is refused over bay speed", not r["ok"] and r["why"] == "fast", str(r))
    # low battery relaunch
    js(setup); js("sim.deployWskr(1); sim.s.wskrs[0].bat=15.2; return 1")
    run(90); check("a WSKR that runs low is recalled", js("return sim.s.wskrs.length ? sim.s.wskrs[0].mode : 'aboard'") in ("recall", "aboard"))
    run(60 * 6); check("and taken aboard", js("return sim.s.wskrs.length") == 0)
    check("the bay remembers it should go back out", js("return !!sim.s.bay.relaunch[1]"))
    js("sim.s.rack[1]=60; return 1"); run(60 * 5)
    check("it stays in the rack while it is still charging", js("return sim.s.wskrs.length") == 0)
    run(3600 * 1.3); run(120)
    check("when it is fully charged it goes out again by itself", js("return sim.s.wskrs.some(w=>w.n===1)"))
    # crew have the con: Marcus slows for the bay
    js(setup); js("sim.deployWskr(2); const w=sim.s.wskrs[0]; w.arrived=true; w.mode='recall'; Object.assign(sim.s,{speed:14,throttle:1}); (await import('./js/away.js')).armAway(8); return 1")
    run(40)
    check("with the crew in charge the ship is slowed to bay speed", js("return sim.s.speed") <= 8.6, str(js("return sim.s.speed")))
    run(60 * 3)
    check("the WSKR is taken aboard", js("return sim.s.wskrs.length") == 0)
    run(90)
    check("the standing speed comes back after", js("return sim.s.speed") > 8.6, str(js("return sim.s.speed")))
    # with the Captain awake the ship is not slowed for it
    js(setup); js("sim.deployWskr(2); const w=sim.s.wskrs[0]; w.arrived=true; w.mode='recall'; Object.assign(sim.s,{speed:14,throttle:1}); return 1")
    run(40); r = js("return {sp:sim.s.speed, n:sim.s.wskrs.length}"); check("with the Captain at the con the ship keeps its speed and the WSKR waits", r["sp"] > 10 and r["n"] == 1, str(r))
    check("no page errors", not errs, str(errs[:3]))
    b.close()
srv.shutdown(); sys.exit(1 if fails else 0)
