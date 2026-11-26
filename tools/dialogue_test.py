#!/usr/bin/env python3
"""Dialogue stays current (stale messages are dropped, only read ones are filed), how-to pages under Ask, relevant orders only.  python3 tools/dialogue_test.py"""
import os, sys, importlib.util
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location("smoke", os.path.join(ROOT, "tools", "smoke.py")); smoke = importlib.util.module_from_spec(spec); spec.loader.exec_module(smoke)
fails = []
def check(name, ok, extra=""):
    print(("ok   " if ok else "FAIL ") + name + (f"  {extra}" if extra and not ok else ""))
    if not ok: fails.append(name)
def main():
    server, site = smoke.start_server(); base = f"http://127.0.0.1:{server.server_address[1]}/AquaNova/tablet/"
    with sync_playwright() as p:
        b = smoke.launch(p); page = b.new_context(viewport={"width": 1180, "height": 820}, has_touch=True).new_page(); errors = []
        page.on("pageerror", lambda e: errors.append(str(e)[:200]))
        page.goto(base); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000); page.tap("#board-btn"); page.wait_for_timeout(800)
        if page.is_visible(".modal .btn"): page.tap(".modal .btn"); page.wait_for_timeout(300)
        js = lambda code: page.evaluate("(async()=>{const sim=(await import('./js/sim.js')).sim;const g=(await import('./js/persist.js')).gameState;const N=await import('./js/notify.js');" + code + "})()")
        js("const m=(await import('../game/systems/missionManager.js')).default; m.forceCompleteMission('meetTheCrew'); sim.s.docked=false; sim.s.lat=39.45; sim.s.lon=-72.25; sim.s.at=null; sim.s.speed=0; sim.s.depth=50; sim.s.targetDepth=50; for (const id of ['communications','helm','science']) g.updateProperty('contacts.crew.'+id+'.known', true); return 1"); page.wait_for_timeout(300)
        # --- staleness ---
        js("N.say('science','Remora is being readied. About 60 seconds.','mission',{key:'bay'}); return 1")
        check("a held message is unread", js("return N.unreadFor('science')") == 1)
        check("and is not in the past conversation yet", js("return N.transcript('science').length") == 0)
        js("N.retire('bay'); return 1")
        check("when the bay job ends, it is dropped", js("return N.unreadFor('science')") == 0)
        js("let ok=true; N.say('science','Valid for a moment','mission',{valid:()=>ok}); window.__ok=()=>{ok=false}; return 1")
        check("a message with a validity test is unread while it applies", js("return N.unreadFor('science')") == 1)
        js("window.__ok(); return 1")
        check("and is dropped once it stops applying", js("return N.unreadFor('science')===0 && N.takeHeld('science').length===0"))
        check("a dropped message never reached the transcript", js("return N.transcript('science').every(l => !/Valid for a moment|readied/.test(l.text))"))
        js("N.say('science','Sample 3 is ready for analysis.','mission'); return 1")
        check("a plain held message is read and then filed", js("const t=N.takeHeld('science'); return t.length===1 && N.transcript('science').some(l=>/Sample 3/.test(l.text))"))
        # --- the real launch message goes stale ---
        js("sim.s.docked=false; sim.s.depth=30; sim.s.targetDepth=30; sim.s.speed=0; return 1")
        page.evaluate("window.__aq.scene('bridge')"); page.wait_for_timeout(300)
        js("N.say('science','Remora is being readied in the bay. About 60 seconds.','mission',{key:'bay'}); return 1")
        js("const b=await import('./js/bayops.js'); sim.s.bay = sim.s.bay || {}; return 1")
        # --- how-to pages under Ask ---
        page.evaluate("document.querySelector('#pin').click()"); page.wait_for_timeout(700)
        line = lambda t: page.locator(".comm-line", has_text=t).first.tap(); tap = lambda: page.wait_for_timeout(350)
        page.locator(".comm-who", has_text="Nicole").first.tap(); tap()
        if page.locator(".comm-reply", has_text="Nicole Brooks").count(): line("I need something"); tap()
        line("Ask about"); tap()
        check("Nicole offers the Comms pages under Ask", page.locator(".comm-line", has_text="The Comms pages").count() == 1)
        line("The Comms pages"); tap(); line("Contacts page"); tap()
        txt = page.inner_text(".comm-reply")
        check("the page guide gives numbered steps for the real buttons", "1. Open the Comms station." in txt and "Hail" in txt and "Scan band" in txt, txt[:200])
        line("Something else"); tap(); line("Ask about"); tap(); line("Comms tasks"); tap(); line("Send a report"); tap()
        check("task guide: send a report", "Transmit report" in page.inner_text(".comm-reply"))
        # --- relevant orders only ---
        page.locator(".comm-line", has_text="Call another station").first.tap(); tap(); page.locator(".comm-who", has_text="Marcus").first.tap(); tap()
        if page.locator(".comm-reply", has_text="Marcus Chen").count(): line("I need something"); tap()
        line("Orders"); tap()
        folders = [t.strip() for t in page.locator(".comm-line").all_inner_texts()]
        check("helm order folders are grouped", any(t.startswith("Depth") for t in folders) and any(t.startswith("Speed") for t in folders) and any(t.startswith("Heading") for t in folders), folders)
        check("Docking is not offered when we are at sea and not at a dock", not any(t.startswith("Docking") for t in folders), folders)
        check("no errors", not errors, errors[:2]); b.close()
    server.shutdown(); print("all ok" if not fails else "FAILED: " + ", ".join(fails)); sys.exit(1 if fails else 0)
main()
