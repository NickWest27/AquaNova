#!/usr/bin/env python3
"""Tutorial chain with the gates on (?locked=1): each lesson commissions the next system.  python3 tools/tutorial_test.py"""
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
    base = f"http://127.0.0.1:{server.server_address[1]}/AquaNova/tablet/?locked=1"
    with sync_playwright() as p:
        browser = smoke.launch(p)
        page = browser.new_context(viewport={"width": 1180, "height": 820}, has_touch=True).new_page(); errors = []
        page.on("pageerror", lambda e: errors.append(str(e)[:200]))
        page.on("console", lambda m: errors.append(m.text[:200]) if m.type == "error" else None)
        page.goto(base); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000)
        page.tap("#board-btn"); page.wait_for_timeout(800)
        if page.is_visible(".modal .btn"): page.tap(".modal .btn"); page.wait_for_timeout(300)
        js = lambda code: page.evaluate("(async()=>{const sim=(await import('./js/sim.js')).sim;const g=(await import('./js/persist.js')).gameState;const M=(await import('../game/systems/missionManager.js')).default;M.delayScale=0;" + code + "})()")
        opens = lambda n: (page.evaluate(f"window.__aq.open('{n}')"), page.wait_for_timeout(450), page.is_visible("#station"))[2]
        def close():
            if page.is_visible("#station"): page.evaluate("document.querySelector('#station .st-head .btn').click()"); page.wait_for_timeout(250)
        done = lambda: js("return [...M.completedMissions]")
        flag = lambda k: js(f"(await import('./js/persist.js')).gameState.updateProperty('tutorial.{k}', true); return 1")
        # at the start only the PED, pin and logbook work
        check("helm is locked at the start", not opens("helm"))
        check("sensors are locked at the start", not opens("sensors"))
        js("M.forceCompleteMission('meetTheCrew'); return 1"); page.wait_for_timeout(300)
        check("First Contact starts the ship tour", js("return M.activeMissions.has('shipTour')"))
        check("comms is commissioned after First Contact", opens("comms")); close()
        check("helm still locked during the tour", not opens("helm"))
        # tour: logbook, PED, walkway, bridge
        flag("opened_log"); flag("opened_ped")
        page.evaluate("window.__aq.scene('walkway')"); page.wait_for_timeout(300)
        check("walkway entry completes its step", js("return (g.getProperty('mission.objectives')||[]).find(o=>o.id==='shipTour_walkway').status") == "completed")
        page.evaluate("window.__aq.scene('bridge')"); page.wait_for_timeout(500)
        d = done(); check("tour complete", "shipTour" in d, d)
        check("helm opens after the tour", opens("helm")); close()
        check("systems opens after the tour", opens("sys")); close()
        check("sea trials orders sent", js("return (g.getProperty('mission.inbox')||[]).some(m=>m.id==='oera-sea-trials')"))
        check("navigation still locked", not opens("nav"))
        # sea trials
        js("M.startMission('seaTrials'); for (const o of ['undock','dive','speed','surface','report']) M.completeObjective('seaTrials',o); return 1"); page.wait_for_timeout(500)
        check("sea trials unlock navigation and start its lesson", js("return M.activeMissions.has('navLesson')") and opens("nav")); close()
        check("sensors still locked", not opens("sensors"))
        js("M.completeObjective('navLesson','open'); return 1"); flag("plotted"); flag("arrived"); page.wait_for_timeout(500)
        check("chart lesson unlocks sensors and starts the sensor lesson", opens("sensors") and js("return M.activeMissions.has('sensorsLesson')")); close()
        check("lab locked before the sensor lesson ends", not opens("lab"))
        flag("opened_sensors"); flag("swept"); flag("scanned"); page.wait_for_timeout(500)
        check("sensor lesson unlocks lab, remora and bay", opens("lab") and (close() or True) and opens("remora") and (close() or True) and opens("bay")); close()
        check("survey offer sent", js("return (g.getProperty('mission.inbox')||[]).some(m=>m.id==='oera-first-survey')"))
        check("WSKR page locked until after the first survey", not opens("wskr"))
        js("M.startMission('firstSurvey'); M.forceCompleteMission('firstSurvey'); return 1"); page.wait_for_timeout(400)
        check("WSKR page opens after the first survey", opens("wskr")); close()
        check("no page errors", not errors, errors[:3])
        browser.close()
    print("\n%d failure(s)" % len(fails)); sys.exit(1 if fails else 0)
main()
