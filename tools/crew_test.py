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
        who("Helm") if page.locator(".comm-who", has_text="Helm").count() else None; tap()
        line("Give an order"); tap()
        check("working order is not marked", "stub" not in (page.locator(".comm-line", has_text="Come left").first.get_attribute("class") or ""))
        line("Make your depth"); tap(); line("100 m"); tap()
        check("depth order sets target depth", js("return sim.s.targetDepth") == 100, js("return sim.s.targetDepth"))
        line("One more thing"); tap(); line("Give an order"); tap()
        h0 = js("return sim.s.targetHeading"); line("Come right"); tap(); line("45°"); tap()
        h1 = js("return sim.s.targetHeading"); check("Come right 45 turns the ship", round((h1 - h0) % 360) == 45, (h0, h1))
        line("One more thing"); tap(); line("Give an order"); tap()
        line("Make your speed"); tap(); line("60%"); tap()
        check("speed order sets throttle", abs(js("return sim.s.throttle") - 0.6) < 0.01)
        line("One more thing"); tap(); line("Give an order"); tap()
        js("sim.s.docked=true; sim.s.at=sim.dockPoi(); sim.s.speed=0")
        line("Undock"); page.wait_for_timeout(5500)
        check("Undock order undocks the ship", js("return sim.s.docked") is False)
        page.screenshot(path=os.path.join(ROOT, "tools", "shots", "crew_reply.png"))
        check("no page errors", not errors, errors)
        browser.close()
    server.shutdown()
    print("\nFAILED: " + ", ".join(fails) if fails else "\nAll checks passed.")
    sys.exit(1 if fails else 0)
main()
