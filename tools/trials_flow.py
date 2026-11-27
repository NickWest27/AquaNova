#!/usr/bin/env python3
"""Missions by message: First Contact delivers the sea trials orders, the player accepts them in Comms,
and the commissioning trip follows: undock, the Trials AO, engineering, depth, speed, super cruise, surface, report.
Run from repo root:  python3 tools/trials_flow.py
"""
import os, sys, shutil, importlib.util
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location("smoke", os.path.join(ROOT, "tools", "smoke.py"))
smoke = importlib.util.module_from_spec(spec); spec.loader.exec_module(smoke)
SHOTS = os.path.join(ROOT, "tools", "shots"); os.makedirs(SHOTS, exist_ok=True)
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
        ctx = browser.new_context(viewport={"width": 1180, "height": 820}, has_touch=True, device_scale_factor=2)
        page = ctx.new_page()
        page.on("console", lambda m: errors.append(m.text[:200]) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append("uncaught " + str(e)[:200]))
        js = lambda code: page.evaluate("(async()=>{" + code + "})()")
        G = "const g=(await import('./js/persist.js')).gameState;"
        objs = lambda: js(G + "return (g.getProperty('mission.objectives')||[]).map(o=>o.id.replace('seaTrials_','')+':'+o.status)")
        fly = lambda depth, speed: js("const s=(await import('./js/sim.js')).sim.s; s.depth=s.targetDepth="+str(depth)+"; s.speed="+str(speed)+"; (await import('./js/persist.js')).liveNav();")

        page.goto(base); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=15000)
        page.tap("#board-btn"); page.wait_for_timeout(900)
        page.is_visible(".modal .btn") and page.tap(".modal .btn")
        check("no messages before First Contact", js(G + "return (g.getProperty('mission.inbox')||[]).length") == 0)
        js("const m=(await import('../game/systems/missionManager.js')).default; m.delayScale = 0.03; m.forceCompleteMission('meetTheCrew'); m.forceCompleteMission('shipTour')"); page.wait_for_timeout(400)
        check("sea trials orders are not delivered straight away", not js(G + "return (g.getProperty('mission.inbox')||[]).some(m=>m.id==='oera-sea-trials')"))
        page.wait_for_timeout(3200)
        check("First Contact delivers the sea trials orders after a delay", js(G + "return (g.getProperty('mission.inbox')||[]).some(m=>m.id==='oera-sea-trials')"))
        check("comms hotspot glows for 1 unread", "glow" in (page.locator('.hs[aria-label="COMMS"]').get_attribute("class") or ""))
        check("mission is not started until accepted", (js(G + "return (g.getProperty('mission.objectives')||[]).length")) == 0)
        page.evaluate("window.__aq.open('comms')"); page.wait_for_timeout(500)
        page.tap(".mail-row"); page.wait_for_timeout(800)
        check("message text and Accept button show after opening", page.is_visible("text=Trials AO") and page.is_visible('button:text-is("Accept mission")'))
        page.screenshot(path=f"{SHOTS}/m-1message.png")
        page.tap('button:text-is("Accept mission")'); page.wait_for_timeout(500)
        o = objs(); check("mission started with 9 objectives", len(o) == 9, o)
        check("accepted state shown", page.is_visible("text=Mission accepted"))
        page.tap("#station .st-head .btn"); page.wait_for_timeout(200)
        check("glow stops once read", "glow" not in (page.locator('.hs[aria-label="COMMS"]').get_attribute("class") or ""))

        check("ship starts docked, so undock is the first objective", "undock:active" in objs() and js("return (await import('./js/sim.js')).sim.s.docked") is True)
        page.evaluate("window.__aq.open('helm')"); page.wait_for_timeout(500)
        page.tap('#station button:text-is("Dock")'); page.wait_for_timeout(5200)
        check("undocking from the Helm completes the objective", "undock:completed" in objs(), objs())
        page.tap("#station .st-head .btn"); page.wait_for_timeout(200)
        js("const S=(await import('./js/sim.js')).sim; S.s.wpt={lat:39.9,lon:-71.0,name:'WP1'}; return 1"); page.wait_for_timeout(6000)   # a course into the AO box
        o = objs(); check("one step at a time: plot done, the passage to the AO is current, the rest wait", "plot:completed" in o and "arrive:active" in o and "speed:waiting" in o, o)
        fly(60, 6.5); page.wait_for_timeout(300)
        o = objs(); check("under way at 60 m: the trials wait for the AO", "arrive:active" in o and "speed:completed" not in o, o)
        js("const S=(await import('./js/sim.js')).sim; Object.assign(S.s,{lat:39.9,lon:-71.0}); S.step(1);"); page.wait_for_timeout(6500)
        o = objs(); check("at the Trials AO: plot and arrive complete", "plot:completed" in o and "arrive:completed" in o, o)
        check("the Welcome to the AO orders arrive", "oera-welcome-ao" in js(G + "return (g.getProperty('mission.inbox')||[]).map(m=>m.id)"))
        page.evaluate("window.__aq.open('eng')"); page.wait_for_timeout(600); page.tap("#station .st-head .btn"); page.wait_for_timeout(300)
        fly(300, 6); page.wait_for_timeout(300); fly(300, 13.5); page.wait_for_timeout(300); fly(300, 100); page.wait_for_timeout(300)
        o = objs(); check("engineering check, test depth, full speed and super cruise complete", all(k + ":completed" in o for k in ("eng", "deep", "speed", "cruise")), o)
        js("document.dispatchEvent(new CustomEvent('report-sent'))"); page.wait_for_timeout(200)
        check("report sent too early does not count", "report:completed" not in objs(), objs())
        fly(40, 2); page.wait_for_timeout(200)
        check("not surfaced at 40 m", "surface:active" in objs())
        fly(10, 1); page.wait_for_timeout(300)
        o = objs(); check("surface complete at 10 m", "surface:completed" in o and "report:active" in o, o)
        page.evaluate("window.__aq.open('comms')"); page.wait_for_timeout(500)
        page.evaluate("[...document.querySelectorAll('#station .tabs .btn')].find(b=>b.textContent.startsWith('Mail')).click()"); page.wait_for_timeout(200)
        check("link up at 10 m", page.is_visible("text=LINK UP"))
        page.screenshot(path=f"{SHOTS}/m-2link.png")
        page.tap('button:text-is("Transmit report")')
        for _ in range(80):   # the upload takes real time now (a few seconds to a minute by link); the report counts when it is out
            page.wait_for_timeout(500)
            if js(G + "return (g.getProperty('mission.outbox')||[]).length")  >= 1: break
        page.wait_for_timeout(600)
        done = js(G + "return [g.getProperty('mission.completedIds'), (g.getProperty('mission.objectives')||[]).filter(o=>o.missionId==='seaTrials').length, (g.getProperty('mission.inbox')||[]).map(m=>m.id), g.getProperty('mission.outbox').length]")
        check("report completes Sea Trials", "seaTrials" in done[0] and done[1] == 0, done)
        check("OERA reply arrives", "oera-trials-done" in done[2], done)
        check("report is in the outbox", done[3] == 1, done)
        page.screenshot(path=f"{SHOTS}/m-3done.png")
        # reload: nothing restarts, no duplicate messages
        page.goto(base); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=15000)
        page.tap("#board-btn"); page.wait_for_timeout(900)
        done = js(G + "return [g.getProperty('mission.completedIds'), (g.getProperty('mission.objectives')||[]).filter(o=>o.missionId==='seaTrials').length, (g.getProperty('mission.inbox')||[]).map(m=>m.id)]")
        check("after reload: Sea Trials stays done, nothing restarts, no duplicate messages", "seaTrials" in done[0] and done[1] == 0 and len(set(done[2])) == len(done[2]) and len(done[2]) >= 2, done)
        browser.close()
    server.shutdown(); shutil.rmtree(site, ignore_errors=True)
    check("no console errors", not errors, errors)
    print(f"\n{len(fails)} failure(s)"); sys.exit(1 if fails else 0)
if __name__ == "__main__":
    main()
