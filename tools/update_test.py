#!/usr/bin/env python3
"""PED → Settings → Update now re-fetches every game file, then restarts.  python3 tools/update_test.py"""
import os, sys, importlib.util
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location("smoke", os.path.join(ROOT, "tools", "smoke.py"))
smoke = importlib.util.module_from_spec(spec); spec.loader.exec_module(smoke)
def main():
    server, site = smoke.start_server()
    base = f"http://127.0.0.1:{server.server_address[1]}/AquaNova/tablet/"
    ok = True
    with sync_playwright() as p:
        browser = smoke.launch(p)
        page = browser.new_context(viewport={"width": 1180, "height": 820}, has_touch=True).new_page(); reqs = []
        page.goto(base); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000)
        page.tap("#board-btn"); page.wait_for_timeout(800)
        if page.is_visible(".modal .btn"): page.tap(".modal .btn"); page.wait_for_timeout(300)
        page.evaluate("document.querySelector('#ped-btn').click()"); page.wait_for_timeout(500)
        page.evaluate("[...document.querySelectorAll('.btn.chip')].find(b=>b.textContent==='Settings').click()"); page.wait_for_timeout(300)
        page.on("request", lambda r: reqs.append(r.url))
        page.evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Update now').click()")
        page.wait_for_function("location.search.includes('v=')", timeout=30000); page.wait_for_timeout(500)
        n = len([u for u in reqs if "/js/" in u or "/data/" in u])
        print(("ok   " if n > 100 else "FAIL ") + f"files re-fetched on update: {n}")
        ok = n > 100
        browser.close()
    server.shutdown(); sys.exit(0 if ok else 1)
main()
