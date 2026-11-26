#!/usr/bin/env python3
"""Pushing the trials (docs/COMMS_AND_PROGRESSION.md): after a trial in the Trials AO the department asks to push further (an ARIA decision);
a push sets a ship record; a damaged push ends the trial with damage on the engineering computer.   python3 tools/trials_push_test.py"""
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
        H = "const S=await import('./js/sim.js'); const sim=S.sim; const M=(await import('../game/systems/missionManager.js')).default; const A=await import('./js/aria.js'); const g=(await import('./js/persist.js')).gameState; const E=await import('./js/engineering.js');"
        js = lambda code: page.evaluate("(async()=>{" + H + code + "})()")
        page.goto(base + "?intake=0"); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=15000)
        page.tap("#board-btn"); page.wait_for_timeout(900)
        page.is_visible(".modal .btn") and page.tap(".modal .btn")
        js("const {seafloor}=await import('./js/seafloor.js'); await seafloor.load(); Object.assign(sim.s,{docked:false,at:null,lat:39.75,lon:-71.0,depth:300,targetDepth:300,speed:5,throttle:0.4,cruise:false}); M.startMission('seaTrials'); for (const o of ['undock','plot','dive','arrive','eng','deep']) M.completeObjective('seaTrials',o); return 1")
        page.wait_for_timeout(2500)
        r = js("return A.pendingDecisions().map(d=>d.id+'|'+d.text)")
        check("after the test depth, Commander Chen asks (through ARIA) to go deeper", any(x.startswith("trials_deep_1|") and "450" in x for x in r), r)
        js("Math.random=()=>0.99; A.decide('trials_deep_1','push'); return 1"); page.wait_for_timeout(1500)
        check("push: the ship is ordered to 450 m", js("return sim.s.targetDepth") == 450, js("return sim.s.targetDepth"))
        js("sim.s.depth=450; return 1"); page.wait_for_timeout(1800)
        r = js("return {rec:(g.getProperty('progress.records')||{}).deep, log:JSON.stringify(g.getProperty('logbook')||g.state).includes('Ship record: test dive to 450')}")
        check("reaching it sets a ship record", r["rec"] == 450, r)
        # second step, with damage
        js("g.updateProperty('progress.trials.push',{kind:'deep',level:1}); Math.random=()=>0; sim.s.lat=39.6; return 1"); page.wait_for_timeout(1500)
        js("sim.s.depth=600; return 1"); page.wait_for_timeout(1800)
        r = js("const e=E.eng(); return {b:e.health.bulkheads, ba:e.health.ballast, done:(g.getProperty('progress.trials')||{}).deep, rec:(g.getProperty('progress.records')||{}).deep}")
        check("an unlucky push damages a system, which waits for a repair team", min(r["b"], r["ba"]) < 100, r)
        check("and ends that trial", r["done"] and r["done"]["done"] is True, r)
        # speed: overdrive lets the jets go past their rating
        js("Math.random=()=>0.99; (await import('./js/trials.js')).skipWait(); M.completeObjective('seaTrials','speed'); return 1"); page.wait_for_timeout(2500)
        r = js("return A.pendingDecisions().map(d=>d.id)")
        check("after full speed, Marcus asks to push the jets", "trials_speed_1" in r, r)
        js("A.decide('trials_speed_1','push'); return 1"); page.wait_for_timeout(1500)
        r = js("return sim.maxKt()")
        check("the jets are allowed past 14 kt during the push", r > 15, r)
        js("sim.s.speed=15.5; return 1"); page.wait_for_timeout(1800)
        r = js("return {max:sim.maxKt(), rec:(g.getProperty('progress.records')||{}).speed}")
        check("record set and the jets back to their rating", r["rec"] == 15.5 and r["max"] == 14, r)
        check("no page errors", not errors, str(errors))
        browser.close()
    server.shutdown()
    print(f"\n{len(fails)} failure(s)"); sys.exit(1 if fails else 0)
if __name__ == "__main__":
    main()
