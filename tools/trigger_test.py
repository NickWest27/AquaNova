#!/usr/bin/env python3
"""Tutorial triggers: ARIA's first greeting only, steps in order, things done earlier still count, and tutorial steps are announced by the PED not by ARIA.  python3 tools/trigger_test.py"""
import os, sys, importlib.util
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location("smoke", os.path.join(ROOT, "tools", "smoke.py")); smoke = importlib.util.module_from_spec(spec); spec.loader.exec_module(smoke)
fails = []
def check(name, ok, extra=""):
    print(("ok   " if ok else "FAIL ") + name + (f"  {extra}" if extra and not ok else ""))
    if not ok: fails.append(name)
def main():
    server, site = smoke.start_server(); base = f"http://127.0.0.1:{server.server_address[1]}/AquaNova/tablet/?locked=1"
    with sync_playwright() as p:
        b = smoke.launch(p); page = b.new_context(viewport={"width": 1180, "height": 820}, has_touch=True).new_page(); errors = []
        page.on("pageerror", lambda e: errors.append(str(e)[:200]))
        page.goto(base); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000); page.tap("#board-btn"); page.wait_for_timeout(800)
        if page.is_visible(".modal .btn"): page.tap(".modal .btn"); page.wait_for_timeout(300)
        js = lambda code: page.evaluate("(async()=>{const g=(await import('./js/persist.js')).gameState;const M=(await import('../game/systems/missionManager.js')).default;" + code + "})()")
        st = lambda i: js(f"return ((g.getProperty('mission.objectives')||[]).find(o=>o.id==='{i}')||{{}}).status")
        fire = lambda ev, d: js(f"document.dispatchEvent(new CustomEvent('{ev}',{{detail:{d}}})); return 1"); page.wait_for_timeout(100)
        js("window.__notes=[]; document.addEventListener('mission-notify',e=>window.__notes.push(e.detail)); return 1")
        check("First Contact is a tutorial mission", js("return !!M.missions.get('meetTheCrew').tutorial"))
        check("only the first step is open at the start (quarters)", st("meetTheCrew_find_communicator") == "completed" and st("meetTheCrew_pickup_communicator") == "active")
        # an ARIA reply before the pin is picked up and the communicator opened does not finish the mission early
        fire("dialogue-complete", "{characterId:'executiveOfficer',dialogueId:'first_contact'}")
        check("ARIA talking too early does not complete 'contact ARIA'", st("meetTheCrew_contact_area") == "active")
        # a different crew member's chat does not count, and the right one only counts in order
        fire("item-pickup", "{itemId:'communicator'}"); js("g.updateProperty('tutorial.communicator_opened', true); return 1"); page.wait_for_timeout(200)
        check("steps complete in order", st("meetTheCrew_pickup_communicator") == "completed" and st("meetTheCrew_learn_communicator") == "completed", [st("meetTheCrew_pickup_communicator"), st("meetTheCrew_learn_communicator")])
        check("an unrelated dialogue id does not count", (fire("dialogue-complete", "{characterId:'executiveOfficer',dialogueId:'something_else'}"), st("meetTheCrew_contact_area"))[1] == "active")
        # go to the walkway before the tour exists: it still counts when the tour starts
        fire("location-enter", "{location:'walkway'}"); fire("location-enter", "{location:'bridge'}")
        fire("dialogue-complete", "{characterId:'executiveOfficer',dialogueId:'first_contact'}"); page.wait_for_timeout(1500)
        check("First Contact completes with ARIA's greeting", js("return M.completedMissions.has('meetTheCrew')"))
        check("the tour starts and counts the walkway already visited", st("shipTour_walkway") == "completed", st("shipTour_walkway"))
        js("g.updateProperty('tutorial.opened_log', true); g.updateProperty('tutorial.opened_ped', true); return 1"); page.wait_for_timeout(1500)
        check("and the bridge, in order", js("return M.completedMissions.has('shipTour')"))
        check("tutorial notices are flagged so ARIA stays quiet", js("return window.__notes.length>3 && window.__notes.every(n=>n.tutorial)"), page.evaluate("window.__notes"))
        check("ARIA did not announce them", page.evaluate("!document.body.innerText.includes('Objective complete')"))
        check("no page errors", not errors, errors[:2]); b.close()
    server.shutdown(); print("all ok" if not fails else "FAILED: " + ", ".join(fails)); sys.exit(1 if fails else 0)
main()
