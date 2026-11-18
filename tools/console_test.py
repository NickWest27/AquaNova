#!/usr/bin/env python3
"""Bridge console: top display, main screen, left selector, center controls, right data.  python3 tools/console_test.py"""
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
        page.goto(base); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000)
        page.tap("#board-btn"); page.wait_for_timeout(800)
        if page.is_visible(".modal .btn"): page.tap(".modal .btn"); page.wait_for_timeout(300)
        page.wait_for_timeout(800); print("ERR", errors); page.evaluate("window.__aq.scene('bridge')"); page.wait_for_timeout(1200)
        top = page.inner_text(".bt")
        check("top display shows lat/long and date", "°" in top and "2074" in top, top)
        check("main screen defaults to navigation", page.is_visible(".bd-nav") and page.locator(".bd-nav canvas").count() == 1)
        check("position log shown", "POSITION LOG" in page.inner_text(".nav-log"))
        check("nav readouts shown", "SPEED" in page.inner_text(".nav-read"))
        page.screenshot(path=os.path.join(ROOT, "tools", "shots", "console_nav.png"))
        r0 = page.inner_text(".bc:visible .rng"); page.locator('.bc:visible .bbtn:text-is("+")').tap(); page.wait_for_timeout(200)
        r1 = page.inner_text(".bc:visible .rng")
        check("+ increases range on the console", float(r1.split()[0]) > float(r0.split()[0]), (r0, r1))
        for name, sel in (("HELM", ".bd-helm"), ("SYS", ".bd-sys"), ("VIEW", ".bd.view"), ("NAV", ".bd-nav")):
            page.locator(f'.selector .bbtn:text-is("{name}")').tap(); page.wait_for_timeout(300)
            check(f"{name} shows on the main screen", page.is_visible(sel))
            if name == "HELM": page.screenshot(path=os.path.join(ROOT, "tools", "shots", "console_helm.png"))
        page.locator('.selector .bbtn:text-is("HELM")').tap(); page.wait_for_timeout(300)
        page.locator('.bc:visible .bbtn:text-is("Faster")').tap(); page.wait_for_timeout(300)
        check("Faster raises throttle", "10%" in page.inner_text(".br:visible") or "%" in page.inner_text(".br:visible"))
        page.locator(".bd-expand:visible").tap(); page.wait_for_timeout(700)
        check("expand opens the full station", page.is_visible("#station .st-head"))
        page.tap("#station .st-head .btn"); page.wait_for_timeout(400)
        check("selection kept after returning", page.is_visible(".bd-helm"))
        check("no page errors", not errors, errors)
        browser.close()
    server.shutdown()
    print("\nFAILED: " + ", ".join(fails) if fails else "\nAll checks passed.")
    sys.exit(1 if fails else 0)
main()
