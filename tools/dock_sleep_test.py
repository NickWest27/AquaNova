#!/usr/bin/env python3
"""Docking and sleep (time warp): dock and undock on the Helm, sleep in quarters, early wake-up.
Run from repo root:  python3 tools/dock_sleep_test.py
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
        js = lambda code: page.evaluate("(async()=>{const sim=(await import('./js/sim.js')).sim;" + code + "})()")
        tap_hs = lambda label: page.locator(f'.hs[aria-label="{label}"]:visible').tap(force=True)
        page.goto(base); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=15000)
        page.tap("#board-btn"); page.wait_for_timeout(900)
        page.is_visible(".modal .btn") and page.tap(".modal .btn")

        # --- docked at the start ---
        check("new game starts docked at the dock", js("return [sim.s.docked, sim.s.at && sim.s.at.type]") == [True, "dock"])
        check("dock status shows the clock and DOCKED", "DAY 1 06:" in page.inner_text(".dock-status").upper() and "DOCKED" in page.inner_text(".dock-status"))
        js("sim.setThrottle(1)"); check("throttle is refused while docked", js("return sim.s.throttle") == 0)

        # --- sleep while docked: time passes, shore power charges, a save comes first ---
        js("sim.s.battery = 50; sim.s.oxygen = 60")
        c0 = js("return sim.s.clock")
        tap_hs("SLEEP"); page.wait_for_timeout(400)
        check("sleep dialog opens", page.is_visible('.modal h3:text-is("Sleep")'))
        page.screenshot(path=f"{SHOTS}/d-1sleep.png")
        page.tap('.modal button:text-is("4 h")'); page.tap('.modal button:text-is("Sleep")'); page.wait_for_timeout(1500)
        c1 = js("return sim.s.clock")
        check("4 hours pass", abs((c1 - c0) - 4 * 3600) < 120, c1 - c0)
        check("shore power charged the ship while docked", js("return [sim.s.battery, sim.s.oxygen]")[0] > 90 and js("return sim.s.oxygen") > 90)
        check("wake-up message shows the new time", page.is_visible("text=You slept 4 h"))
        has = page.evaluate("import('./js/persist.js').then(m => !!m.saveManager.getActiveLogbook().checkpoint)")
        check("a save was written before sleeping", has)
        page.screenshot(path=f"{SHOTS}/d-2woke.png")
        page.tap(".modal .btn"); page.wait_for_timeout(200)

        # --- undock and dock on the Helm ---
        page.evaluate("window.__aq.open('helm')"); page.wait_for_timeout(500)
        check("helm Dock button is filled when docked", "on" in page.locator('#station button:text-is("Dock")').first.get_attribute("class").split())
        page.tap('#station button:text-is("Dock")'); page.wait_for_timeout(5200)
        check("undocked after the sequence", js("return sim.s.docked") is False and "on" not in page.locator('#station button:text-is("Dock")').first.get_attribute("class").split())
        js("sim.setThrottle(0.5)"); check("throttle works once undocked", js("return sim.s.throttle") == 0.5)
        js("sim.setThrottle(0); sim.s.speed = 0")
        page.tap('#station button:text-is("Dock")'); page.wait_for_timeout(5800)
        check("docked again at the dock", js("return sim.s.docked") is True)
        page.screenshot(path=f"{SHOTS}/d-3docked-helm.png")
        # not at a dock: refused
        page.tap('#station button:text-is("Dock")'); page.wait_for_timeout(5200)
        js("sim.s.at = null; sim.s.lat += 0.5")
        page.tap('#station button:text-is("Dock")'); page.wait_for_timeout(500)
        said = page.evaluate("(async()=>{const n=await import('./js/notify.js'); return [...(n.takeHeld('helm')||[]), ...n.transcript('helm').map(l=>l.text)].join(' ')})()")   # Marcus says why: held for his dialogue (it opens), or in his log
        check("docking away from a dock is refused", js("return sim.s.docked") is False and "dock" in said.lower(), said)
        page.tap("#station .st-head .btn"); page.wait_for_timeout(200)

        # --- early wake-up: oxygen falls below 30% during a long sleep ---
        js("sim.s.docked = false; sim.s.oxygen = 45; sim.s.scrubbers = 0; sim.s.autoAvoid = false; sim.s.depth = 200; sim.s.targetDepth = 200")
        c0 = js("return sim.s.clock")
        tap_hs("SLEEP"); page.tap('.modal button:text-is("12 h")'); page.tap('.modal button:text-is("Sleep")'); page.wait_for_timeout(2500)
        slept = (js("return sim.s.clock") - c0) / 3600
        check("crew woke the player early for low oxygen", page.is_visible("text=I woke you early") and page.is_visible("text=oxygen reserves"), slept)
        check("woke well before 12 hours", 1 < slept < 10, slept)
        page.screenshot(path=f"{SHOTS}/d-4early.png")
        page.tap(".modal .btn"); page.wait_for_timeout(200)

        # --- the ship keeps travelling while the player sleeps ---
        js("sim.s.oxygen = 100; sim.s.battery = 100; sim.s.docked = false; sim.s.lat = 40.0; sim.s.lon = -73.0; sim.s.at = null; sim.s.wpt = null; sim.s.heading = 90; sim.s.targetHeading = 90; sim.setThrottle(0.5); sim.s.speed = 7;")
        start = js("return [sim.s.lat, sim.s.lon]")
        tap_hs("SLEEP"); page.tap('.modal button:text-is("2 h")'); page.tap('.modal button:text-is("Sleep")'); page.wait_for_timeout(1500)
        moved = js("const t=(await import('./js/sim.js')).toward; return t({lat:" + str(start[0]) + ",lon:" + str(start[1]) + "}, sim.s).nm")
        check("ship covered about 14 nm in 2 hours of sleep at 7 knots", 10 < moved < 18, moved)
        page.tap(".modal .btn"); page.wait_for_timeout(200)

        # --- arrival wakes the player; the dialog offers "Until arrival" ---
        js("sim.s.docked = false; const d = sim.dockPoi(); const r = sim.s.pois.find(p => p.name === 'Mystic Reef'); r.lat = 40.9; r.lon = -71.4; sim.s.lat = r.lat - 0.6; sim.s.lon = r.lon; sim.s.at = null; sim.setWpt(r); sim.setThrottle(1); sim.s.speed = 14;")
        tap_hs("SLEEP"); page.wait_for_timeout(300)
        check("sleep dialog offers Until arrival", page.is_visible('.modal button:has-text("Until arrival")'))
        page.screenshot(path=f"{SHOTS}/d-5until-arrival.png")
        page.tap('.modal button:text-is("Sleep")'); page.wait_for_timeout(1500)
        check("crew woke the player on arrival", page.is_visible("text=we have arrived at Mystic Reef"))
        page.screenshot(path=f"{SHOTS}/d-6arrived.png")
        page.tap(".modal .btn"); page.wait_for_timeout(200)

        # --- the clock and docked flag survive a reload ---
        js("sim.s.oxygen = 100; sim.s.docked = false")
        before = js("return sim.s.clock")
        page.evaluate("import('./js/persist.js').then(m => m.checkpoint())")   # what the exit save does when the app is hidden
        page.goto(base); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=15000)
        after = js("return sim.s.clock")
        check("clock restored after reload", abs(after - before) < 60, (before, after))
        browser.close()
    server.shutdown(); shutil.rmtree(site, ignore_errors=True)
    check("no console errors", not errors, errors)
    print(f"\n{len(fails)} failure(s)"); sys.exit(1 if fails else 0)
if __name__ == "__main__":
    main()
