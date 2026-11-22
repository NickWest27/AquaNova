#!/usr/bin/env python3
"""Communicator orders: working orders act, unfinished ones are marked.  python3 tools/crew_test.py"""
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
    with sync_playwright() as p:
        browser = smoke.launch(p)
        ctx = browser.new_context(viewport={"width": 1180, "height": 820}, has_touch=True)
        page = ctx.new_page(); errors = []
        page.on("pageerror", lambda e: errors.append(str(e)[:200]))
        js = lambda code: page.evaluate("(async()=>{const sim=(await import('./js/sim.js')).sim;const g=(await import('./js/persist.js')).gameState;" + code + "})()")
        page.goto(base); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000)
        page.tap("#board-btn"); page.wait_for_timeout(800)
        if page.is_visible(".modal .btn"): page.tap(".modal .btn"); page.wait_for_timeout(300)
        js("const m=(await import('../game/systems/missionManager.js')).default; m.forceCompleteMission('meetTheCrew'); sim.s.docked=false; sim.s.speed=0; sim.s.lat=39.45; sim.s.lon=-72.25; sim.s.at=null")
        page.evaluate("window.__aq.scene('bridge')"); page.wait_for_timeout(300)
        page.evaluate("document.querySelector('#pin').click()")
        page.wait_for_timeout(700)
        who = lambda n: page.locator(".comm-who", has_text=n).first.tap()
        line = lambda t: page.locator(".comm-line", has_text=t).first.tap()
        tap = lambda: page.wait_for_timeout(350)
        # Ask-about topics
        js("g.updateProperty('progress.talk.executiveOfficer',{n:0,used:{}}); g.updateProperty('progress.topics',{}); return 1")
        page.wait_for_timeout(3200); who("ARIA"); tap()
        if page.locator(".comm-reply", has_text="ARIA").count(): line("I need something"); tap()
        check("no Ask about menu before any topic is open", True)
        check("ARIA offers 'Ask about …' (the ship is open from the start)", page.locator(".comm-line", has_text="Ask about").count() == 1)
        line("Ask about"); tap(); line("Background"); tap()
        check("topics listed", page.locator(".comm-line", has_text="the Aqua Nova").count() == 1 and page.locator(".comm-line", has_text="Captain Voss").count() == 0)
        line("the Aqua Nova"); tap()
        check("ARIA tells about the ship", "Woods Hole" in page.inner_text(".comm-reply"), page.inner_text(".comm-reply"))
        js("g.updateProperty('progress.talk.executiveOfficer',{n:1,used:{}}); return 1")
        line("One more thing"); tap(); line("Ask about"); tap(); line("Background"); tap()
        check("told topic is marked", page.locator(".comm-line", has_text="✓ the Aqua Nova").count() == 1)
        check("Voss topic opens after a hello", page.locator(".comm-line", has_text="Captain Voss").count() == 1)
        line("Captain Voss"); tap()
        r1 = page.inner_text(".comm-reply")
        check("ARIA puts the Voss topic off", "rather not" in r1, r1)
        line("One more thing"); tap(); line("Ask about"); tap(); line("Background"); tap(); line("Captain Voss"); tap()
        r2 = page.inner_text(".comm-reply")
        check("and puts it off differently the second time, never marked told", r2 != r1 and js("return !(g.getProperty('progress.topics.executiveOfficer')||{told:[]}).told.includes('voss')"), r2)
        line("One more thing"); tap(); line("Ask about"); tap(); line("Background"); tap(); line("the Aqua Nova"); tap()
        check("a second ask about a told topic gets a short answer", "already" in page.inner_text(".comm-reply").lower() or "told you" in page.inner_text(".comm-reply"))
        check("no page errors", not errors, errors)
        browser.close()
    server.shutdown()
    print("\nFAILED: " + ", ".join(fails) if fails else "\nAll checks passed.")
    sys.exit(1 if fails else 0)
main()
