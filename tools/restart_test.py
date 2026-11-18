#!/usr/bin/env python3
"""Restart from M.LOG-0001: entries, notes, tasks and ship state go back to the start.  python3 tools/restart_test.py"""
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
        def board():
            page.goto(base); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000)
            page.tap("#board-btn"); page.wait_for_timeout(800)
            if page.is_visible(".modal .btn"): page.tap(".modal .btn"); page.wait_for_timeout(300)
        board()
        # make a mess: a log entry, a journal note, a moved and damaged ship
        js("P.addLogEntry('Test entry one'); P.addLogEntry('Test entry two'); P.saveManager.addEntry({type:'journal', content:'phone note'}); sim.s.docked=false; sim.s.depth=200; sim.s.lat=41.6; sim.s.hull=70; sim.s.clock=9*3600; P.checkpoint();")
        n = js("return P.saveManager.getActiveLogbook().entries.length")
        check("test setup made entries", n >= 4, n)
        page.tap('.dbtn[data-st="log"]'); page.wait_for_timeout(600)
        check("M.LOG-0001 offers Restart from the beginning", page.is_visible('button:text-is("Restart from the beginning")'))
        page.screenshot(path=os.path.join(ROOT, "tools", "shots", "r-1log.png"))
        page.tap('button:text-is("Restart from the beginning")'); page.wait_for_timeout(300)
        page.tap('.modal button:text-is("Restart")')
        page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000); page.wait_for_timeout(500)
        page.tap("#board-btn"); page.wait_for_timeout(800)
        r = js("const lb=P.saveManager.getActiveLogbook(); const s=sim.s; return [lb.entries.length, lb.entries[0].logbook.entryId, lb.entries.some(e=>e.logbook.type==='journal'), !!lb.resetAt, s.docked, Math.round(s.depth), Math.round(s.hull), Math.round(s.clock/3600), !!lb.checkpoint]")
        check("one entry left: M.LOG-0001", r[0] == 1 and r[1] == "M.LOG-0001", r)
        check("journal notes removed", r[2] is False, r)
        check("restart time recorded for sync", r[3] is True, r)
        check("ship back at the dock, docked, full hull", r[4] is True and r[5] == 0 and r[6] == 100, r)
        check("clock back to 06:00", r[7] == 6, r)
        check("no page errors", not errors, errors)
        browser.close()
    server.shutdown()
    print("\nFAILED: " + ", ".join(fails) if fails else "\nAll checks passed.")
    sys.exit(1 if fails else 0)
main()
