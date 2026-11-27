#!/usr/bin/env python3
"""Restart from the beginning (logbook, M.LOG-0001) gives a brand-new game: the arrival form in the Launch Bay, no PED, First Contact
at its first step.   python3 tools/restart_test.py"""
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
        js = lambda code: page.evaluate("(async()=>{const g=(await import('./js/persist.js')).gameState; const m=(await import('../game/systems/missionManager.js')).default;" + code + "})()")
        page.goto(base + "?intake=1"); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=15000)
        page.tap("#board-btn"); page.wait_for_timeout(1500)
        check("a new game opens the arrival form", page.is_visible(".signin"))
        # play on a little: skip the form, finish two missions, accept Sea Trials (a logbook entry)
        js("const P=await import('./js/player.js'); P.setPlayer('Test','Captain'); g.updateProperty('progress.got_ped', true); m.forceCompleteMission('meetTheCrew'); m.forceCompleteMission('shipTour'); m.startMission('seaTrials'); (await import('./js/missionLog.js')).logAccepted('seaTrials'); return 1")
        page.wait_for_timeout(800)
        page.evaluate("document.querySelector('.signin') && document.querySelector('.signin').remove()")
        page.evaluate("window.__aq.open('log')"); page.wait_for_timeout(600)
        page.evaluate("document.querySelector('#modal-root').replaceChildren()"); page.locator("#station button", has_text="Restart from the beginning").first.dispatch_event("click"); page.wait_for_timeout(300)
        page.locator(".modal .btn", has_text="Restart").last.dispatch_event("click"); page.wait_for_timeout(3000)
        page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=15000); page.tap("#board-btn"); page.wait_for_timeout(1500)
        check("after the restart: the arrival form again", page.is_visible(".signin"))
        check("in the Launch Bay", page.locator(".scene.bay:not([hidden])").count() == 1)
        r = js("return {ped:g.getProperty('progress.got_ped'), player:g.getProperty('progress.player'), objs:(g.getProperty('mission.objectives')||[]).map(o=>o.id+':'+o.status), done:[...m.completedMissions]}")
        check("no PED, no name, nothing done", not r["ped"] and not r["player"] and not r["done"], r)
        check("First Contact at its first step", "meetTheCrew_find_communicator:active" in r["objs"] and "meetTheCrew_pickup_communicator:waiting" in r["objs"], r)
        check("no page errors", not errors, str(errors[:3]))
        browser.close()
    server.shutdown()
    print(f"\n{len(fails)} failure(s)"); sys.exit(1 if fails else 0)
if __name__ == "__main__":
    main()
