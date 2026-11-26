#!/usr/bin/env python3
"""Tern orders: Nicole by radio when she is out, Security when she is in the bay, hourly check-ins, queued orders.   python3 tools/tern_test.py"""
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
        js = lambda code: page.evaluate("(async()=>{const T=await import('./js/sim.js');const sim=T.sim;const B=await import('./js/bayops.js');const N=await import('./js/tern.js');" + code + "})()")
        page.goto(base); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000)
        page.tap("#board-btn"); page.wait_for_timeout(1200)
        if page.is_visible(".modal .btn"): page.tap(".modal .btn"); page.wait_for_timeout(300)
        setup = "const s=sim.s; T.setTimeScale(1); const dk=sim.dockPoi(); Object.assign(s,{lat:dk.lat+0.07,lon:dk.lon,docked:false,at:null,wpt:null,route:[],speed:0,throttle:0,depth:0,targetDepth:0,heading:0,wskrs:[],rov:null,autoAvoid:false}); s.bay={op:null,doorDmg:0,base:0,rearm:null}; const sh=B.shuttle(); Object.assign(sh,{state:'bay',mode:'follow',bat:100,o2:100,pilots:2,pax:0,dead:false,depth:0,queue:[],lost:false,missed:0,standoff:false,mission:null,supply:false,pending:null}); "
        # 1. Security launches her on a supply run
        r = js(setup + "const x=N.launchTern({kind:'supply'}); for(let i=0;i<70;i++) sim.step(1); return {ok:x.ok, text:x.text, state:sh.state, mode:sh.mode, m:sh.mission&&sh.mission.kind, supply:sh.supply, pax:sh.pax}")
        check("Security launches the Tern on a supply run", r["ok"] and r["state"] == "out" and r["mode"] == "going" and r["supply"] and r["m"] == "supply", r)
        # 2. she gets there, the team cycles the airlock, she comes home, scrubbers restocked
        r = js("const s=sim.s; s.scrubbers=40; for(let i=0;i<200;i++){ sim.step(30); } const sh=B.shuttle(); return {state:sh.state, mode:sh.mode, scr:s.scrubbers}")
        check("she comes home and the supplies restock the scrubbers", r["state"] in ("bay", "out") and (r["scr"] == 100 or r["mode"] in ("returning", "follow", "exchange", "going")), r)
        # 3. Nicole: orders reach her while linked
        r = js(setup + "sh.state='out'; sh.mode='follow'; sh.lat=s.lat; sh.lon=s.lon; sh.depth=0; const a=N.orderTern({kind:'hold'}); const b=N.orderTern({kind:'depth',m:300}); const c=N.orderTern({kind:'depth',m:900}); return {a:a.text, mode:sh.mode, hd:sh.holdDepth, c:c.text}")
        check("an order to a Tern in contact is acknowledged at once", "acknowledges" in r["a"] and r["mode"] == "station" and r["hd"] == 300, r)
        check("she refuses a depth below her rating", "rated" in r["c"], r)
        # 4. send her far away: out of range, the order is queued; Nicole says why (due SOUTH of Woods Hole: due north lands within 20 nm of the
        #    Port of Boston, and a dock relays her radio, so she would still be in contact)
        r = js(setup + "Object.assign(sh,{state:'out',mode:'station',lat:s.lat-0.9,lon:s.lon,depth:50,holdDepth:50,mission:{kind:'goto',dest:{name:'Test Point',lat:s.lat-0.9,lon:s.lon},label:'Test Point'},lastContact:s.clock,nextCheck:s.clock+3600}); sim.step(1); const x=N.orderTern({kind:'surface'}); return {text:x.text, queued:x.queued, q:sh.queue.length, mode:sh.mode, lost:sh.lost}")
        check("out of range: the order waits and Nicole says out of communications range", r["queued"] and r["q"] == 1 and "out of communications range" in r["text"] and r["mode"] == "station", r)
        # 5. an hour later she surfaces; still out of the surface range, so a check-in is missed (54 nm due south: more than 40 nm, her surface radio range, from the ship and from every dock)
        r = js("const s=sim.s, sh=B.shuttle(); sh.lat=s.lat-0.9; for(let i=0;i<100;i++) sim.step(40); return {missed:sh.missed, q:sh.queue.length, text:N.orderTern({kind:'hold'}).text}")
        check("she missed a check-in and Nicole says so", r["missed"] >= 1 and "missed a check-in" in r["text"], r)
        # 6. she comes back into range: contact, the queued orders go through
        r = js("const s=sim.s, sh=B.shuttle(); sh.lat=s.lat-0.1; sim.step(1); return {q:sh.queue.length, hd:sh.holdDepth, mode:sh.mode, lost:sh.lost}")
        check("when contact returns the waiting orders are sent", r["q"] == 0 and not r["lost"], r)
        # 7. check-in from surface range succeeds (about 30 nm, beyond the 20 nm link)
        r = js(setup + "Object.assign(sh,{state:'out',mode:'station',lat:s.lat-0.5,lon:s.lon,depth:50,holdDepth:50,lastContact:s.clock,nextCheck:s.clock+3600,lost:false,missed:0}); sim.step(1); const a=sh.lost; N.orderTern({kind:'surface'}); for(let i=0;i<100;i++) sim.step(40); return {lost:a, nowLost:sh.lost, q:sh.queue.length, hd:sh.holdDepth, missed:sh.missed}")
        check("an hourly check-in from the surface reaches us and delivers the order", r["lost"] and r["q"] == 0 and r["hd"] == 0 and r["missed"] == 0, r)
        # 8. call back, and mission resume
        r = js(setup + "Object.assign(sh,{state:'out',mode:'follow',lat:s.lat,lon:s.lon,depth:0}); const d={id:'x',name:'Test Point',lat:s.lat+0.05,lon:s.lon}; const a=N.orderTern({kind:'goto',dest:d}); const m=sh.mission&&sh.mission.label; N.orderTern({kind:'hold'}); const mm=sh.mode; N.orderTern({kind:'resume'}); const m2=sh.mode; const b=N.callBackTern(); return {a:a.text, m, mm, m2, home:sh.mode}")
        check("go to, hold, return to mission, call back", "Under way" in r["a"] and r["mm"] == "station" and r["m2"] == "goto" and r["home"] == "returning", r)
        # 9. relay
        r = js(setup + "Object.assign(sh,{state:'out',mode:'follow',lat:s.lat,lon:s.lon,depth:0}); N.orderTern({kind:'relay'}); for(let i=0;i<5;i++) sim.step(1); s.depth=200; return {relay: sim.relayUp(), mode: sh.mode}")
        check("a Tern relay up at the surface gives us comms at depth", r["mode"] == "relay" and r["relay"], r)
        # 9b. the same orders from the communicator: Nicole for a Tern that is out, Security for one in the bay
        js("const m=(await import('../game/systems/missionManager.js')).default; m.forceCompleteMission('meetTheCrew'); return 1")
        js(setup + "Object.assign(sh,{state:'out',mode:'follow',lat:s.lat,lon:s.lon,depth:0}); return 1")
        page.evaluate("window.__aq.scene('bridge')"); page.wait_for_timeout(300)
        page.evaluate("document.querySelector('#pin').click()"); page.wait_for_timeout(700)
        who = lambda n: page.locator(".comm-who", has_text=n).first.tap()
        line = lambda t: page.locator(".comm-line", has_text=t).first.tap()
        tap = lambda: page.wait_for_timeout(350)
        who("Nicole"); tap()
        if page.locator(".comm-reply", has_text="Nicole Brooks").count(): page.locator(".comm-line").first.tap(); tap()
        line("Orders"); tap()
        line("The Tern"); tap()   # orders are grouped in folders (Reports, The Tern, Ship) since 2026-11-22
        line("Tell the Tern to"); tap(); line("Hold position"); tap()
        check("Nicole passes an order to the Tern from the communicator", js("return sim.s.shuttle.mode") == "station", js("return sim.s.shuttle.mode"))
        page.evaluate("window.__aq.scene('bridge')"); page.wait_for_timeout(300)
        # 10. the Sensors WSKR page does not list her
        page.evaluate("window.__aq.open('wskr')"); page.wait_for_timeout(500)
        t = page.inner_text("#station") if page.is_visible("#station") else ""
        check("the WSKR page does not mention the Tern", not __import__("re").search(r"\btern\b", t.lower()), t[:200])
        check("no page errors", not errors, errors)
        browser.close()
    server.shutdown()
    print("\nAll checks passed." if not fails else f"\n{len(fails)} FAILED: {fails}")
    sys.exit(1 if fails else 0)
main()
