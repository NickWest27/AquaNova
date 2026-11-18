#!/usr/bin/env python3
"""Offline play: load the game once, cut the network, reload, and play.  python3 tools/offline_test.py"""
import importlib.util, os, shutil, sys
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
    base = f"http://127.0.0.1:{server.server_address[1]}/AquaNova/"
    errors = []
    with sync_playwright() as p:
        browser = smoke.launch(p)
        ctx = browser.new_context(viewport={"width": 1180, "height": 820}, has_touch=True)
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)[:200]))
        page.goto(base + "tablet/"); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=15000)
        page.wait_for_function("navigator.serviceWorker.ready.then(() => true)", timeout=10000)
        page.wait_for_function("caches.keys().then(async k => { for (const n of k) { if ((await (await caches.open(n)).keys()).length > 30) return true } return false })", timeout=15000)
        check("service worker installed and cache filled", True)
        page.goto(base + "ped/"); page.wait_for_timeout(1500)   # the phone app is cached too
        ctx.set_offline(True)
        page.goto(base + "tablet/"); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=15000)
        check("tablet loads with no network", True)
        page.tap("#board-btn"); page.wait_for_timeout(1000)
        if page.is_visible(".modal .btn"): page.tap(".modal .btn")
        page.tap('.dbtn[data-st="quarters"]'); page.wait_for_timeout(400)
        page.tap('.dbtn[data-st="nav"]'); page.wait_for_timeout(700)
        check("a station opens offline", page.is_visible("#station .st-head"))
        page.tap("#station .st-head .btn"); page.tap('.dbtn[data-st="ped"]'); page.wait_for_timeout(500)
        check("PED opens offline", page.is_visible("#ped-pop .ped-panel"))
        page.goto(base + "ped/"); page.wait_for_timeout(1200)
        check("phone app loads with no network", page.is_visible("#nav"))
        ctx.close(); browser.close()
    server.shutdown(); shutil.rmtree(site, ignore_errors=True)
    check("no uncaught errors", not errors, errors)
    print(f"\n{len(fails)} failure(s)"); sys.exit(1 if fails else 0)
if __name__ == "__main__":
    main()
