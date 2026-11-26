#!/usr/bin/env python3
"""Rooms open as the story needs them; crew join the communicator when the Captain visits their room; a locked door gets ARIA's excuse;
a message from someone not yet met comes through ARIA.   python3 tools/rooms_test.py"""
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
        H = "const g=(await import('./js/persist.js')).gameState; const M=(await import('../game/systems/missionManager.js')).default; const N=await import('./js/notify.js');"
        js = lambda code: page.evaluate("(async()=>{" + H + code + "})()")
        page.goto(base + "?intake=0"); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=15000)
        page.tap("#board-btn"); page.wait_for_timeout(900)
        page.is_visible(".modal .btn") and page.tap(".modal .btn")
        js("M.forceCompleteMission('meetTheCrew'); g.updateProperty('progress.got_ped', true); g.updateProperty('tutorial.communicator_opened', true); return 1"); page.wait_for_timeout(400)
        known = lambda id: js(f"return !!g.getProperty('contacts.crew.{id}.known')")
        check("Dr. Patel and Chief Doyle are not on the communicator at the start", not known("science") and not known("engineering"))
        page.evaluate("window.__aq.scene('walkway')"); page.wait_for_timeout(300)
        page.locator('.door[aria-label="SCIENCE"]').dispatch_event("click"); page.wait_for_timeout(500)
        check("the science lab door stays shut", page.locator(".scene.science:not([hidden])").count() == 0)
        t = js("return N.transcript('executiveOfficer').map(l=>l.text).join(' | ')") or ""
        held = js("return N.unreadFor('executiveOfficer')")
        check("ARIA makes an excuse that names Dr. Patel", "Dr. Patel" in t or held > 0, t[-200:])
        page.evaluate("window.__aq.scene('walkway2')"); page.wait_for_timeout(300)
        page.locator('.door[aria-label="ENGINEERING"]').dispatch_event("click"); page.wait_for_timeout(400)
        check("Engineering stays shut before the trials", page.locator(".scene.engineering:not([hidden])").count() == 0)
        js("N.say('engineering', 'Captain, the starboard jet is running hot.', 'mission'); return 1"); page.wait_for_timeout(300)
        check("a message from Chief Doyle before meeting him comes through ARIA", js("return N.unreadFor('executiveOfficer')") > 0 and js("return N.unreadFor('engineering')") == 0 and not known("engineering"))
        js("M.executeActions([{type:'unlock_room', room:'engineering'}]); return 1"); page.wait_for_timeout(200)
        page.locator('.door[aria-label="ENGINEERING"]').dispatch_event("click"); page.wait_for_timeout(500)
        check("unlock_room opens Engineering", page.locator(".scene.engineering:not([hidden])").count() == 1)
        check("visiting Engineering puts Chief Doyle on the communicator", known("engineering"))
        page.evaluate("window.__aq.scene('bridge')"); page.wait_for_timeout(300)
        check("visiting the bridge puts Marcus, Nicole and Alex on it", known("helm") and known("communications") and known("sensors"))
        check("no page errors", not errors, str(errors[:3]))
        browser.close()
    server.shutdown()
    print(f"\n{len(fails)} failure(s)"); sys.exit(1 if fails else 0)
if __name__ == "__main__":
    main()
