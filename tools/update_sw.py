#!/usr/bin/env python3
"""Rebuilds the file list and version inside sw.js.
Run from the repo root after adding or renaming game files:  python3 tools/update_sw.py
It opens the iPad game and the phone PED in headless Chrome, visits every station, and records every
same-origin file they load. Those files are cached for offline play.
"""
import hashlib, importlib.util, json, os, re, sys
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location("smoke", os.path.join(ROOT, "tools", "smoke.py"))
smoke = importlib.util.module_from_spec(spec); spec.loader.exec_module(smoke)

def main():
    server, site = smoke.start_server()
    base = f"http://127.0.0.1:{server.server_address[1]}/AquaNova/"
    seen = set()
    with sync_playwright() as p:
        browser = smoke.launch(p)
        ctx = browser.new_context(viewport={"width": 1180, "height": 820}, has_touch=True, service_workers="block")
        ctx.on("response", lambda r: seen.add(urlparse(r.url).path[len("/AquaNova/"):]) if r.url.startswith(base) and r.ok else None)
        page = ctx.new_page()
        page.goto(base + "tablet/"); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=15000)
        page.tap("#board-btn"); page.wait_for_timeout(1200)
        if page.is_visible(".modal .btn"): page.tap(".modal .btn")
        page.evaluate("window.__aq.toggleQuarters()"); page.wait_for_timeout(500)
        for st in ("nav", "helm", "sys", "comms", "log"):
            page.evaluate(f"window.__aq.open('{st}')"); page.wait_for_timeout(500); page.tap("#station .st-head .btn")
        page.evaluate("window.__aq.open('ped')"); page.wait_for_timeout(500); page.evaluate("document.querySelector(\'#ped-pop\').click()")
        page.goto(base + "ped/"); page.wait_for_timeout(800)
        browser.close()
    server.shutdown()
    # also everything inside the tablet and phone folders and the data folder, even if no station loaded it this run
    for folder in ("tablet", "ped", "data"):
        for dp, _, fns in os.walk(os.path.join(ROOT, folder)):
            for fn in fns: seen.add(os.path.relpath(os.path.join(dp, fn), ROOT).replace(os.sep, "/"))
    files = sorted(f for f in seen if f and not f.endswith("sw.js") and "/shots/" not in f)
    files = ["tablet/", "ped/"] + [f for f in files if f not in ("tablet/", "ped/")]
    h = hashlib.sha1()
    for f in files:
        path = os.path.join(ROOT, f if not f.endswith("/") else f + "index.html")
        if os.path.isfile(path): h.update(open(path, "rb").read())
    version = h.hexdigest()[:10]
    sw_path = os.path.join(ROOT, "sw.js"); sw = open(sw_path).read()
    sw = re.sub(r"const VERSION = '[^']*';", f"const VERSION = '{version}';", sw)
    sw = re.sub(r"const ASSETS = \[.*?\];", "const ASSETS = " + json.dumps(files, indent=1) + ";", sw, flags=re.S)
    open(sw_path, "w").write(sw)
    total = sum(os.path.getsize(os.path.join(ROOT, f)) for f in files if os.path.isfile(os.path.join(ROOT, f)))
    print(f"sw.js: {len(files)} files, {total/1024:.0f} KB, version {version}")

if __name__ == "__main__":
    main()
