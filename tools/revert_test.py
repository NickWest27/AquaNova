#!/usr/bin/env python3
"""Revert to a middle logbook entry: state returns, later entries go, earlier ones stay.  python3 tools/revert_test.py"""
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
        # three save points in three different places, one journal note in between
        for name, depth, lat, hull, hrs in [("Alpha", 50, 39.30, 90, 8), ("Bravo", 120, 39.35, 80, 10), ("Charlie", 300, 39.50, 60, 12)]:
            js(f"sim.s.docked=false; sim.s.depth={depth}; sim.s.targetDepth={depth}; sim.s.lat={lat}; sim.s.lon=-72.2; sim.s.battery={hull}; sim.s.clock={hrs}*3600; P.addLogEntry('Entry {name}');")
            if name == "Bravo": js("P.saveManager.addEntry({type:'journal', content:'note after Bravo'})")
        ids = js("return P.saveManager.getActiveLogbook().entries.map(e=>e.logbook.entryId+':'+(e.logbook.content||'').slice(0,13))")
        check("setup: M.LOG-0001 plus three entries and a note", len(ids) == 5, ids)
        page.evaluate("window.__aq.open('log')"); page.wait_for_timeout(600)
        page.locator(".entry", has_text="Entry Bravo").locator("text=Revert here").tap(); page.wait_for_timeout(300)
        page.tap('.modal button:text-is("Revert")'); page.wait_for_timeout(800)
        r = js("const lb=P.saveManager.getActiveLogbook(); const s=sim.s; return {texts: lb.entries.map(e=>e.logbook.content||''), depth: Math.round(s.depth), lat: +s.lat.toFixed(2), bat: Math.round(s.battery), hrs: Math.round(s.clock/3600), cp: !!lb.checkpoint, rev: lb.revision}")
        t = " | ".join(r["texts"])
        check("earlier entries kept (M.LOG-0001 and Alpha)", "Welcome onboard" in t and "Entry Alpha" in t, t[:200])
        check("the entry reverted to is kept", "Entry Bravo" in t)
        check("later entry removed (Charlie)", "Entry Charlie" not in t)
        check("journal note kept (notes are not save points)", "note after Bravo" in t)
        check("ship state is Bravo's (depth 120, lat 39.35, battery about 80, 10:00)", (r["depth"], r["lat"], r["hrs"]) == (120, 39.35, 10) and abs(r["bat"] - 80) <= 2, r)
        check("exit save cleared and revision raised", r["cp"] is False and r["rev"] >= 1, r)
        page.evaluate("window.__aq.open('log')") if page.is_hidden(".entry") else None
        page.wait_for_timeout(400)
        check("Logbook screen no longer lists Charlie", not page.is_visible("text=Entry Charlie"))
        # reload: the reverted state is what loads, not the old Charlie state
        js("P.checkpoint()"); page.reload(); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000)
        page.tap("#board-btn"); page.wait_for_timeout(800)
        r2 = js("return [Math.round(sim.s.depth), Math.round(sim.s.battery), P.saveManager.getActiveLogbook().entries.some(e=>(e.logbook.content||'').includes('Charlie'))]")
        check("after reload still at Bravo, Charlie gone", r2[0] == 120 and abs(r2[1] - 80) <= 2 and r2[2] is False, r2)
        check("no page errors", not errors, errors)
        browser.close()
    server.shutdown()
    print("\nFAILED: " + ", ".join(fails) if fails else "\nAll checks passed.")
    sys.exit(1 if fails else 0)
main()
