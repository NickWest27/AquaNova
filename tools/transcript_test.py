#!/usr/bin/env python3
"""Communicator keeps a live transcript of what a crew member says, including running notes.  python3 tools/transcript_test.py"""
import os, importlib.util
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location("smoke", os.path.join(ROOT, "tools", "smoke.py"))
smoke = importlib.util.module_from_spec(spec); spec.loader.exec_module(smoke)
fails = []
def check(n, ok, x=""):
    print(("ok   " if ok else "FAIL ") + n + (f"  {x}" if x and not ok else ""))
    if not ok: fails.append(n)
def main():
    server, site = smoke.start_server()
    base = f"http://127.0.0.1:{server.server_address[1]}/AquaNova/tablet/"
    with sync_playwright() as p:
        browser = smoke.launch(p)
        page = browser.new_context(viewport={"width": 1180, "height": 820}, has_touch=True).new_page(); errors = []
        page.on("pageerror", lambda e: errors.append(str(e)[:200]))
        page.goto(base); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000)
        page.tap("#board-btn"); page.wait_for_timeout(1500)
        if page.is_visible(".modal .btn"): page.tap(".modal .btn"); page.wait_for_timeout(300)
        page.evaluate("(async()=>{const m=(await import('../game/systems/missionManager.js')).default; m.forceCompleteMission('meetTheCrew'); window.__aq.scene('bridge')})()"); page.wait_for_timeout(600)
        page.evaluate("(async()=>{const N=await import('./js/notify.js'); N.say('helm','Test running note one'); N.say('helm','Test running note two')})()")
        page.wait_for_timeout(300)
        n = page.evaluate("import('./js/notify.js').then(N=>N.transcript('helm').map(l=>l.text))")
        check("running notes are in the helm transcript", "Test running note one" in n and "Test running note two" in n, str(n))
        page.evaluate("import('./js/notify.js').then(N=>N.logLine('helm','crew','Live line while open'))")
        n = page.evaluate("""(async()=>{const m=(await import('../game/systems/missionManager.js')).default;const L=await import('./js/missionLog.js');const P=await import('./js/persist.js');
          m.startMission('seaTrials'); L.logAccepted('seaTrials'); P.gameState.updateProperty('mission.logged', []); L.logAccepted('seaTrials');   // second call, flag lost
          m.completeMission('seaTrials'); m.completeMission('seaTrials'); await new Promise(r=>setTimeout(r,300));
          return P.saveManager.getActiveLogbook().entries.map(e=>e.logbook.entryId+':'+e.logbook.content.slice(0,16)).join('|')})()""")
        check("one accepted log and one complete log, no duplicates", n.count("Mission accepted") == 1 and n.count("Mission complete") == 1, n)
        check("no errors", not errors, str(errors))
    server.shutdown()
    print("\nAll checks passed." if not fails else f"\n{len(fails)} failed")
    sys.exit(1 if fails else 0)
import sys; main()
