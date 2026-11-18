#!/usr/bin/env python3
"""Bridge layout: comms officer (left), sensors (right), walkway hub with doors, and sensor scans.
Run from repo root:  python3 tools/bridge_test.py
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
        for tag, vw, vh in (("land", 1180, 820), ("big", 1366, 1024)):
            ctx = browser.new_context(viewport={"width": vw, "height": vh}, has_touch=True, device_scale_factor=2)
            page = ctx.new_page()
            page.on("console", lambda m: errors.append(m.text[:200]) if m.type == "error" else None)
            page.on("pageerror", lambda e: errors.append("uncaught " + str(e)[:200]))
            js = lambda code: page.evaluate("(async()=>{" + code + "})()")
            tap_hs = lambda label: page.locator(f'.hs[aria-label="{label}"]:visible').tap(force=True)
            page.goto(base); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=15000)
            page.tap("#board-btn"); page.wait_for_timeout(900)
            page.tap(".modal .btn"); page.wait_for_timeout(300)
            page.tap('.dbtn[data-st="quarters"]'); page.wait_for_timeout(500)   # quarters -> bridge
            page.screenshot(path=f"{SHOTS}/b-{tag}-1bridge.png")
            tap_hs("COMMS"); page.wait_for_timeout(500)
            check(f"{tag}: left station opens Comms", page.inner_text("#station .st-title").strip().lower() == "comms")
            page.tap("#station .st-head .btn"); page.wait_for_timeout(200)
            tap_hs("SENSORS"); page.wait_for_timeout(600)
            check(f"{tag}: right station opens Sensors", page.inner_text("#station .st-title").strip().lower() == "sensors")
            check(f"{tag}: sonar shows the dock contact", page.is_visible("text=Woods Hole Oceanographic Institute"))
            page.screenshot(path=f"{SHOTS}/b-{tag}-2sensors.png")
            page.tap('button:text-is("Scan")'); page.wait_for_timeout(500)
            n = js("const g=(await import('./js/persist.js')).gameState;return (g.getProperty('mission.discoveries')||[]).length")
            check(f"{tag}: scan files a finding", n == 1, n)
            check(f"{tag}: contact shows Scanned", page.is_visible("text=Scanned"))
            page.tap("#station .st-head .btn"); page.wait_for_timeout(200)
            tap_hs("◂ WALKWAY"); page.wait_for_timeout(400)
            check(f"{tag}: lower-left leaves the bridge for the walkway", page.is_visible(".walkway") and not page.is_visible(".hs[aria-label='COMMS']"))
            page.screenshot(path=f"{SHOTS}/b-{tag}-3walkway.png")
            page.locator('.door[aria-label="ENGINEERING"]').tap(force=True); page.wait_for_timeout(300)
            check(f"{tag}: engineering door says not built", "not built" in page.inner_text("#toasts"))
            page.locator('.door[aria-label="QUARTERS"]').tap(force=True); page.wait_for_timeout(400)
            check(f"{tag}: quarters door", not page.is_visible(".walkway") and page.is_visible(".hs[aria-label='TO WALKWAY']"))
            tap_hs("TO WALKWAY"); page.wait_for_timeout(300)
            page.locator('.door[aria-label="BRIDGE"]').tap(force=True); page.wait_for_timeout(400)
            check(f"{tag}: bridge door returns to the bridge", page.is_visible(".hs[aria-label='SENSORS']"))
            tap_hs("WALKWAY ▸"); page.wait_for_timeout(300)
            check(f"{tag}: lower-right also leaves the bridge", page.is_visible(".walkway"))
            ctx.close()
        browser.close()
    server.shutdown(); shutil.rmtree(site, ignore_errors=True)
    check("no console errors", not errors, errors)
    print(f"\n{len(fails)} failure(s)"); sys.exit(1 if fails else 0)
if __name__ == "__main__":
    main()
