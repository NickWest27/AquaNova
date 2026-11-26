#!/usr/bin/env python3
"""Custom depth: touch keypad from the communicator and the Helm station.  python3 tools/depthpad_test.py"""
import importlib.util, sys
from playwright.sync_api import sync_playwright
spec = importlib.util.spec_from_file_location("smoke", __file__.replace("depthpad_test.py", "smoke.py")); smoke = importlib.util.module_from_spec(spec); spec.loader.exec_module(smoke)
fails = []
def check(n, ok, x=""):
    print(("ok   " if ok else "FAIL ") + n + (f"  {x}" if x and not ok else ""))
    if not ok: fails.append(n)
def main():
    server, site = smoke.start_server()
    base = f"http://127.0.0.1:{server.server_address[1]}/AquaNova/tablet/"
    with sync_playwright() as p:
        b = smoke.launch(p); page = b.new_context(viewport={"width": 1180, "height": 820}, has_touch=True).new_page(); errs = []
        page.on("pageerror", lambda e: errs.append(str(e)[:200]))
        js = lambda code: page.evaluate("(async()=>{const sim=(await import('./js/sim.js')).sim;" + code + "})()")
        page.goto(base); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000)
        page.tap("#board-btn"); page.wait_for_timeout(800)
        if page.is_visible(".modal .btn"): page.tap(".modal .btn"); page.wait_for_timeout(300)
        js("const m=(await import('../game/systems/missionManager.js')).default; m.forceCompleteMission('meetTheCrew'); sim.s.docked=false; sim.s.speed=0; sim.s.lat=39.45; sim.s.lon=-72.25; sim.s.at=null")
        page.evaluate("window.__aq.scene('bridge')"); page.wait_for_timeout(300)
        page.evaluate("document.querySelector('#pin').click()"); page.wait_for_timeout(700)
        tap = lambda: page.wait_for_timeout(350)
        page.locator(".comm-who", has_text="Helm").first.tap(); tap()
        if page.locator(".comm-reply", has_text="Marcus Chen").count(): page.locator(".comm-line", has_text="I need something").first.tap(); tap()
        for t in ["Orders", "Take us to", "Custom depth"]: page.locator(".comm-line", has_text=t).first.tap(); tap()
        for k in ["1", "2", "0"]: page.locator(".dp-key", has_text=k).first.tap()
        check("keypad shows what was typed", "120" in page.inner_text(".dp-read"), page.inner_text(".dp-read"))
        page.locator(".dp-key", has_text="⌫").tap(); page.locator(".dp-key", has_text="5").tap()
        check("backspace works", "125" in page.inner_text(".dp-read"), page.inner_text(".dp-read"))
        page.locator(".modal .btn.primary").tap(); tap()
        check("communicator order sets the depth", js("return sim.s.targetDepth") == 125, str(js("return sim.s.targetDepth")))
        check("Marcus answers in the reply", "125" in page.inner_text(".comm-reply") or "metres" in page.inner_text(".comm-reply"), page.inner_text(".comm-reply"))
        page.mouse.click(40, 600); page.wait_for_timeout(300)
        page.evaluate("window.__aq.open('helm')"); page.wait_for_timeout(500)
        page.locator(".btn.chip", has_text="Set depth").first.tap(); page.wait_for_timeout(300)
        for k in ["2", "0", "0"]: page.locator(".dp-key", has_text=k).first.tap()
        page.locator(".modal .btn.primary").tap(); page.wait_for_timeout(300)
        check("helm station sets the depth", js("return sim.s.targetDepth") == 200, str(js("return sim.s.targetDepth")))
        check("no page errors", not errs, str(errs))
    server.shutdown()
    print("\nAll checks passed." if not fails else f"\n{len(fails)} failed"); sys.exit(1 if fails else 0)
main()
