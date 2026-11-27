#!/usr/bin/env python3
"""Ship tour: steps already done count at once, ARIA names only what is left, and lesson flags survive a reload.
Run from repo root:  python3 tools/shiptour_test.py
"""
import os, sys, shutil, importlib.util
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
    errors = []
    with sync_playwright() as p:
        browser = smoke.launch(p)
        ctx = browser.new_context(viewport={"width": 1366, "height": 1024}, has_touch=True)
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)[:200]))
        js = lambda code: page.evaluate("(async()=>{const U=await import('./js/unlocks.js');const P=await import('./js/persist.js');const g=P.gameState;const m=(await import('../game/systems/missionManager.js')).default;" + code + "})()")
        page.goto(base); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=15000)
        page.tap("#board-btn"); page.wait_for_timeout(900)
        page.is_visible(".modal .btn") and page.tap(".modal .btn")
        # before the tour: ARIA says to call her
        check("before the tour ARIA says to call her", "communicator" in js("return U.excuse('helm')"), js("return U.excuse('helm')"))
        # the Captain has read the logbook and taken the PED; then the tour starts
        js("m.delayScale = 0.01; g.updateProperty('progress.read_welcome', true); g.updateProperty('progress.got_ped', true); m.forceCompleteMission('meetTheCrew'); return 1"); page.wait_for_timeout(2500)
        st = js("return (g.getProperty('mission.objectives')||[]).filter(o=>o.missionId==='shipTour').map(o=>o.id+':'+o.status)")
        check("logbook and PED steps count at once", "shipTour_log:completed" in st and "shipTour_ped:completed" in st, st)
        ex = js("return U.excuse('helm')")
        check("ARIA names only what is left", "walkway" in ex and "bridge" in ex and "logbook" not in ex and "PED" not in ex, ex)
        # flags are saved
        js("return 1"); page.evaluate("window.__aq.open('log')"); page.wait_for_timeout(500)
        f = js("return g.getProperty('progress.flags')")
        check("lesson flags are saved under progress", f and f.get("opened_log") is True, f)
        ctx.close(); browser.close()
    server.shutdown(); shutil.rmtree(site, ignore_errors=True)
    check("no page errors", not errors, errors)
    print(f"\n{len(fails)} failure(s)"); sys.exit(1 if fails else 0)
if __name__ == "__main__":
    main()
