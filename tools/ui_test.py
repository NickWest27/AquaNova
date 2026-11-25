#!/usr/bin/env python3
"""No station bar; back button names the room you came from; PED button; map range buttons.  python3 tools/ui_test.py"""
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
        js = lambda code: page.evaluate("(async()=>{const sim=(await import('./js/sim.js')).sim;const P=await import('./js/persist.js');" + code + "})()")
        page.goto(base); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000)
        page.tap("#board-btn"); page.wait_for_timeout(800)
        if page.is_visible(".modal .btn"): page.tap(".modal .btn"); page.wait_for_timeout(300)
        js("const m=(await import('../game/systems/missionManager.js')).default; m.forceCompleteMission('meetTheCrew')"); page.wait_for_timeout(300)
        check("no station button bar", page.locator(".dbtn, .dock-buttons").count() == 0)
        # quarters: the logbook opens from the laptop hotspot, and Back says Quarters
        page.evaluate("window.__aq.scene('quarters')"); page.wait_for_timeout(400)
        page.locator('.hs[aria-label="LOGBOOK"]:visible').tap(force=True); page.wait_for_timeout(600)
        check("logbook opens from its hotspot", page.is_visible("#station .st-head"))
        check("back button says Quarters", page.inner_text("#station .st-head .btn").strip().lower() == "‹ quarters", page.inner_text("#station .st-head .btn"))
        check("round PED button hidden inside a station", not page.is_visible("#ped-btn"))
        page.tap("#station .st-head .btn"); page.wait_for_timeout(300)
        check("back returns to the quarters", page.is_visible('.hs[aria-label="SLEEP"]'))
        # bridge: nav opens from its hotspot, Back says Bridge
        page.evaluate("window.__aq.scene('bridge')"); page.wait_for_timeout(400)
        check("PED button visible on the bridge", page.is_visible("#ped-btn"))
        page.tap("#ped-btn"); page.wait_for_timeout(500)
        check("PED button opens the PED", page.is_visible("#ped-pop .ped-panel"))
        page.evaluate("document.querySelector(\'#ped-pop\').click()"); page.wait_for_timeout(300)
        # Main Screen Control: PAN shows arrows on the centre strip; they move the chart; PAN off puts the ship back in the middle
        page.locator('.msc button:text-is("PAN")').tap(force=True); page.wait_for_timeout(200)
        check("PAN shows the arrows", page.is_visible('button[aria-label="Pan north"]'))
        page.locator('button[aria-label="Pan north"]').tap(force=True); page.wait_for_timeout(300)
        panned = page.evaluate("window.__aq.console().nds[0].pan !== null && window.__aq.console().nds[0].pan !== undefined")
        check("an arrow moves the chart", panned)
        page.locator('.msc button:text-is("PAN")').tap(force=True); page.wait_for_timeout(200)
        check("PAN off centres on the ship", page.evaluate("!window.__aq.console().nds[0].pan") and not page.is_visible('button[aria-label="Pan north"]'))
        page.locator('.msc:visible button:text-is("DSP")').tap(force=True); page.wait_for_timeout(200)
        check("DSP shows the centre display on the main screen", page.evaluate("window.__aq.console().main === window.__aq.console().current"))
        page.locator('.msc:visible button:text-is("DSP")').tap(force=True)
        page.evaluate("window.__aq.open('nav')"); page.wait_for_timeout(700)
        check("back button says Bridge", page.inner_text("#station .st-head .btn").strip().lower() == "‹ bridge", page.inner_text("#station .st-head .btn"))
        txt = lambda: page.locator(".readouts .num").last.inner_text().strip()
        a = txt(); page.tap('.map-zoom button[aria-label="Zoom in"]'); page.wait_for_timeout(200); b = txt()
        page.tap('.map-zoom button[aria-label="Zoom out"]'); page.wait_for_timeout(200); c = txt()
        num = lambda t: float(t.split()[0])
        check("+ zooms in (shorter range)", num(b) < num(a), (a, b))
        check("- zooms out (longer range)", num(c) > num(b), (b, c))
        check("range shows on the map too", page.inner_text(".nd-wrap .map-range").strip() == c, page.inner_text(".nd-wrap .map-range"))
        check("no page errors", not errors, errors)
        browser.close()
    server.shutdown()
    print("\nFAILED: " + ", ".join(fails) if fails else "\nAll checks passed.")
    sys.exit(1 if fails else 0)
main()
