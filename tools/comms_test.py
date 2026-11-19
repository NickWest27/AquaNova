#!/usr/bin/env python3
"""Comms console Links page: four links, status by antenna depth, bands, map.  python3 tools/comms_test.py"""
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
        page = browser.new_context(viewport={"width": 1180, "height": 820}, has_touch=True).new_page(); errors = []
        page.on("pageerror", lambda e: errors.append(str(e)[:200]))
        page.on("console", lambda m: errors.append(m.text[:200]) if m.type == "error" else None)
        page.goto(base); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000)
        page.tap("#board-btn"); page.wait_for_timeout(800)
        if page.is_visible(".modal .btn"): page.tap(".modal .btn"); page.wait_for_timeout(300)
        page.evaluate("window.__aq.open('comms')"); page.wait_for_timeout(700)
        check("four link cards", len(page.query_selector_all(".cl-card")) == 4)
        t = page.inner_text(".cl-grid")
        for want in ["LINK 1", "LINK 4", "NORPAC", "MCell 2318", "SIG STRENGTH", "FREQ RANGE", "UHF", "ELF", "LASER", "COMMUNICATIONS LINK ESTABLISHED"]:
            check("page shows " + want, want in t, t[:300])
        page.screenshot(path=os.path.join(ROOT, "tools", "shots", "comms_links.png"))
        page.tap(".cl-card:nth-child(4)"); page.wait_for_timeout(300)
        check("tap selects link 4", "VLF" in page.inner_text(".cl-sig") or "17.8" in page.inner_text(".cl-sig"))
        page.evaluate("(async()=>{const m=await import('./js/sim.js'); m.sim.s.docked=false; m.sim.s.depth=30; m.sim.s.targetDepth=30; m.sim.touch();})()"); page.wait_for_timeout(1500)
        st = page.inner_text(".cl-card:nth-child(1)")
        check("link 1 has no carrier at 30 m", "NO CARRIER" in st, st)
        check("link 4 (VLF) still receives at 30 m", "RX ONLY" in page.inner_text(".cl-card:nth-child(4)"), page.inner_text(".cl-card:nth-child(4)"))
        page.screenshot(path=os.path.join(ROOT, "tools", "shots", "comms_links_deep.png"))
        check("no page errors", not errors, errors[:3])
        browser.close()
    print("\n%d failure(s)" % len(fails)); sys.exit(1 if fails else 0)
main()
