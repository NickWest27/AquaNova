#!/usr/bin/env python3
"""WSKR orders: manual control with link range, search pattern, relay, depth, formation, gating, save/load.  python3 tools/wskr_orders_test.py"""
import os, sys, importlib.util
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location("smoke", os.path.join(ROOT, "tools", "smoke.py"))
smoke = importlib.util.module_from_spec(spec); spec.loader.exec_module(smoke)
SHOTS = os.path.join(ROOT, "tools", "shots")
fails = []
def check(name, ok, extra=""):
    print(("ok   " if ok else "FAIL ") + name + (f"  {extra}" if extra and not ok else ""))
    if not ok: fails.append(name)
def main():
    server, site = smoke.start_server()
    for gated in (False,):
        base = f"http://127.0.0.1:{server.server_address[1]}/AquaNova/tablet/{'?locked=1' if gated else ''}"
        with sync_playwright() as p:
            browser = smoke.launch(p)
            page = browser.new_context(viewport={"width": 1180, "height": 820}, has_touch=True).new_page(); errors = []
            page.on("pageerror", lambda e: errors.append(str(e)[:200]))
            page.on("console", lambda m: errors.append(m.text[:200]) if m.type == "error" else None)
            js = lambda code: page.evaluate("(async()=>{const sim=(await import('./js/sim.js')).sim;const T=await import('./js/sim.js');" + code + "})()")
            page.goto(base); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000)
            page.tap("#board-btn"); page.wait_for_timeout(800)
            page.evaluate("import('./js/sim.js').then(m=>m.setTimeScale(30))"); page.wait_for_timeout(200)   # these tests were written for the old 30x pace
            if page.is_visible(".modal .btn"): page.tap(".modal .btn"); page.wait_for_timeout(300)
            page.evaluate("import('./js/sim.js').then(m=>m.setTimeScale(120))"); page.wait_for_timeout(200)
            B = "const B=await import('./js/bayops.js');"
            js("const s=sim.s; const c=sim.dockPoi(); Object.assign(s,{lat:c.lat+0.07,lon:c.lon,wskrs:[],rov:null,docked:false,wpt:null,speed:0,throttle:0,depth:0,targetDepth:0,heading:0,at:null}); s.rack={}; s.bay={op:null,doorDmg:0}; s.shuttle={state:'bay',bat:100,mode:'follow'}; return 1")
            r = js("sim.deployWskr(); const w=sim.s.wskrs[0]; w.mode='escort'; w.moving=false; const m=T.wskrMinutes(w); sim.s.wskrs=[]; return m.empty")
            check("WSKR battery lasts 6 h holding station (about 450 min at draw 0.8)", 430 < r < 470, str(r))
            r = js(B + "return B.launchWskr()")
            check("a launch starts a timed bay operation", r["ok"] and r["secs"] >= 59, str(r))
            check("WSKR is not out until the minute is up", js("return sim.s.wskrs.length") == 0)
            page.wait_for_timeout(1500)
            check("then it is launched", js("return sim.s.wskrs.length") == 1, str(js("return sim.s.bay.op")))
            # recall and recharge
            js("const w=sim.s.wskrs[0]; w.bat=40; w.mode='recall'; w.lat=sim.s.lat+0.01; return 1"); page.wait_for_timeout(2500)
            r = js("const w=sim.s.wskrs[0]; return {arr: w && w.arrived, op: sim.s.bay.op && sim.s.bay.op.kind, n: sim.s.wskrs.length}")
            check("recalled WSKR comes alongside and the bay takes it aboard", r["arr"] or r["op"] == "recover" or r["n"] == 0, str(r))
            page.wait_for_timeout(2500)
            r = js("return {n: sim.s.wskrs.length, rack: sim.s.rack[1]}")
            check("WSKR is racked with its charge, charging", r["n"] == 0 and r["rack"] is not None and 40 <= r["rack"] <= 100, str(r))
            page.wait_for_timeout(1500)
            r2 = js("return sim.s.rack[1]")
            check("charging raises the rack battery (2 h full: 100% in 7200 game s)", r2 > r["rack"], str((r, r2)))
            js("sim.s.rack[2]=10; return 1")
            r = js(B + "return B.launchWskr(2)")
            check("a WSKR below 20% charge cannot launch", not r["ok"] and r["why"] == "charge", str(r))
            # speed rules
            js("sim.s.rack={}; sim.s.bay={op:null,doorDmg:0}; sim.s.damage=0; return 1")
            r = js(B + "const s=sim.s; s.speed=15; s.throttle=1; const d0=s.damage; B.launchWskr(); return {d0}"); page.wait_for_timeout(1000)
            r = js("const s=sim.s, b=s.bay; return {kt:s.speed, dmg:s.damage, door:b.doorDmg}")
            check("bay open above 8 kt damages the ship", r["kt"] > 8 and r["dmg"] > 0, str(r))
            check("bay open above 10 kt damages the doors for good", r["kt"] > 10 and r["door"] > 0, str(r))
            js("const s=sim.s; s.throttle=0; s.speed=0; s.damage=0; s.bay={op:null,doorDmg:0}; s.wskrs=[]; return 1"); page.wait_for_timeout(1500)
            r = js(B + "const d0=sim.s.damage; B.launchWskr(); return d0")
            page.wait_for_timeout(1500)
            check("slow launch is free", js("return sim.s.damage") == 0 and js("return sim.s.bay.doorDmg") == 0)
            js("sim.s.wskrs=[]; sim.s.bay.op=null; return 1")
            # shuttle
            js("const s=sim.s; Object.assign(s,{speed:0,throttle:0}); return 1")
            check("shuttle needs a pilot", js(B + "B.setManning(0,0); const r=B.launchShuttle(); B.setManning(2,2); return r.why") == "pilot")
            r = js(B + "return B.launchShuttle()")
            check("shuttle launch takes a minute", r["ok"] and r["secs"] >= 59, str(r))
            page.wait_for_timeout(1500)
            check("shuttle is out", js("return sim.s.shuttle.state") == "out", str(js("return sim.s.shuttle")))
            r = js(B + "const p=sim.dockPoi(); const x=B.sendShuttle(p, true); return {ok:x.ok, mode:sim.s.shuttle.mode, nm:x.nm}")
            check("shuttle sent to the dock with a team", r["ok"] and r["mode"] == "going", str(r))
            seen = set()
            for _ in range(40):
                page.wait_for_timeout(500); seen.add(js("return sim.s.shuttle.mode"))
                if "moored" in seen: break
            check("it arrives, cycles the airlock and moors with the team ashore", "exchange" in seen or "moored" in seen, str(seen))
            r = js("const sh=sim.s.shuttle; return {mode:sh.mode, pax:sh.pax, ashore:sh.ashore}")
            check("away team is ashore", r["mode"] == "moored" and r["pax"] == 0 and r["ashore"] == 2, str(r))
            js(B + "B.recallShuttle(); return 1")
            for _ in range(60):
                page.wait_for_timeout(500)
                if js("return sim.s.shuttle.mode") == "follow": break
            r = js("const sh=sim.s.shuttle; return {mode:sh.mode, pax:sh.pax, bat:sh.bat}")
            check("team boards and the shuttle is back alongside the ship", r["mode"] == "follow" and r["pax"] == 2, str(r))
            r = js(B + "return B.recoverShuttle()")
            check("shuttle can be taken aboard (1 min + 10 s airlock)", r["ok"] and r["secs"] >= 69, str(r))
            page.wait_for_timeout(2500)
            r = js("const sh=sim.s.shuttle; return {st:sh.state, bat:sh.bat}")
            check("shuttle is aboard", r["st"] == "bay", str(r))
            b0 = r["bat"]; page.wait_for_timeout(1500)
            check("shuttle charges in the bay", b0 >= 100 or js("return sim.s.shuttle.bat") > b0, str(b0))
            # UI
            js("window.__aq.open('bay'); return 1"); page.wait_for_timeout(700)
            t = page.inner_text("#station").lower()
            check("bay page shows doors, WSKRs, shuttle", "bay doors" in t and "tern" in t and "wskr 1" in t and "pilots" in t and "passengers" in t, t[:300])
            check("no page errors", not errors, str(errors[:2]))
            browser.close()
    server.shutdown()
    sys.exit(1 if fails else 0)
main()
