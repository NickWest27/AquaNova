#!/usr/bin/env python3
"""Commissioning gates: off by default; with ?locked=1 a station refuses until a mission unlocks it.  python3 tools/unlock_test.py"""
import os, sys, importlib.util
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location("smoke", os.path.join(ROOT, "tools", "smoke.py"))
smoke = importlib.util.module_from_spec(spec); spec.loader.exec_module(smoke)
fails = []
def check(name, ok, extra=""):
    print(("ok   " if ok else "FAIL ") + name + (f"  {extra}" if extra and not ok else ""))
    if not ok: fails.append(name)
def boot(browser, url):
    page = browser.new_context(viewport={"width": 1180, "height": 820}, has_touch=True).new_page(); errors = []
    page.on("pageerror", lambda e: errors.append(str(e)[:200]))
    page.on("console", lambda m: errors.append(m.text[:200]) if m.type == "error" else None)
    page.goto(url); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000)
    page.tap("#board-btn"); page.wait_for_timeout(800)
    if page.is_visible(".modal .btn"): page.tap(".modal .btn"); page.wait_for_timeout(300)
    return page, errors
def main():
    server, site = smoke.start_server()
    base = f"http://127.0.0.1:{server.server_address[1]}/AquaNova/tablet/"
    with sync_playwright() as p:
        browser = smoke.launch(p)
        page, errors = boot(browser, base)
        page.evaluate("window.__aq.open('wskr')"); page.wait_for_timeout(500)
        check("everything is open in development", page.is_visible("#station") and "WSKR" in page.inner_text("#station"))
        page, errors = boot(browser, base + "?locked=1")
        page.evaluate("window.__aq.open('wskr')"); page.wait_for_timeout(500)
        check("locked: WSKR page stays closed", not page.is_visible("#station"))
        check("locked: excuse is shown", "not been commissioned" in page.inner_text("#console-line"), page.inner_text("#console-line"))
        page.evaluate("window.__aq.open('nav')"); page.wait_for_timeout(500)
        check("locked: navigation is always open", page.is_visible("#station"))
        page.evaluate("(async()=>{const m=(await import('../game/systems/missionManager.js')).default; m.executeActions([{type:'unlock_station',station:'wskr'}]);})()")
        page.evaluate("window.__aq.open('wskr')"); page.wait_for_timeout(600)
        check("after the unlock action the page opens", "WSKR" in page.inner_text("#station"))
        check("no page errors", not errors, errors[:3])
        browser.close()
    print("\n%d failure(s)" % len(fails)); sys.exit(1 if fails else 0)
main()
