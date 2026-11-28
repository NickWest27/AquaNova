#!/usr/bin/env python3
"""Pushing the jets (Sea Trials): after full speed Marcus asks for a knot more, again and again; each safe step is the new top speed;
damage ends it and keeps the last safe speed.   python3 tools/trials_push_test.py"""
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
        js("const {seafloor}=await import('./js/seafloor.js'); await seafloor.load(); Object.assign(sim.s,{docked:false,at:null,lat:39.75,lon:-71.0,depth:300,targetDepth:300,speed:5,throttle:0.4,cruise:false}); M.startMission('seaTrials'); for (const o of ['undock','plot','arrive','eng','deep']) M.completeObjective('seaTrials',o); return 1")
        page.wait_for_timeout(2500)
        r = js("return A.pendingDecisions().map(d=>d.id)")
        check("the 300 m tick asks nothing (no depth pushes)", not any(x.startswith("trials_") for x in r), r)
        js("Math.random=()=>0.99; M.completeObjective('seaTrials','speed'); return 1"); page.wait_for_timeout(2500)
        r = js("return A.pendingDecisions().map(d=>d.id+'|'+d.text)")
        check("after full speed, Marcus asks to try for 15 kt", any(x.startswith("trials_speed_15|") for x in r), r)
        js("A.decide('trials_speed_15','push'); return 1"); page.wait_for_timeout(1500)
        check("the jets are allowed past 14 kt during the push", js("return sim.maxKt()") >= 15, js("return sim.maxKt()"))
        js("sim.s.speed=15; return 1"); page.wait_for_timeout(1800)
        r = js("return {max:sim.maxKt(), rec:(g.getProperty('progress.records')||{}).speed}")
        check("15 kt with no damage: the new top speed", r["rec"] == 15 and r["max"] == 15, r)
        js("(await import('./js/trials.js')).skipWait(); return 1"); page.wait_for_timeout(2000)
        r = js("return A.pendingDecisions().map(d=>d.id)")
        check("and he asks again, for 16 kt", "trials_speed_16" in r, r)
        js("A.decide('trials_speed_16','push'); Math.random=()=>0; return 1"); page.wait_for_timeout(1500)
        js("sim.s.speed=16; return 1"); page.wait_for_timeout(1800)
        r = js("const e=E.eng(); return {p:e.health.propulsion, t:g.getProperty('progress.trials'), rec:(g.getProperty('progress.records')||{}).speed, max:sim.maxKt()}")
        check("16 kt breaks something: propulsion damaged", r["p"] < 100, r)
        check("the top speed stays at the last safe 15 kt", r["rec"] == 15 and r["max"] == 15, r)
        check("and the trials end", r["t"]["speed"]["done"] is True and not r["t"].get("push"), r)
        js("Math.random=()=>0.99; (await import('./js/trials.js')).skipWait(); return 1"); page.wait_for_timeout(2000)
        check("no more questions after damage", not any(x.startswith("trials_") for x in js("return A.pendingDecisions().map(d=>d.id)")))
        check("no page errors", not errors, str(errors))
        browser.close()
    server.shutdown()
    print(f"\n{len(fails)} failure(s)"); sys.exit(1 if fails else 0)
if __name__ == "__main__":
    main()
