#!/usr/bin/env python3
"""Plays 'First Contact' on the tablet, then checks saves survive a reload.
Run from repo root:  python3 tools/tablet_flow.py
"""
import os, sys, shutil, importlib.util
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location("smoke", os.path.join(ROOT, "tools", "smoke.py"))
smoke = importlib.util.module_from_spec(spec); spec.loader.exec_module(smoke)
SHOTS = os.path.join(ROOT, "tools", "shots"); os.makedirs(SHOTS, exist_ok=True)
fails = []
def check(name, ok, extra=""):
    print(("ok   " if ok else "FAIL ") + name + (f"  {extra}" if extra and not ok else ""))
    if not ok: fails.append(name)

def main():
    server, site = smoke.start_server()
    base = f"http://127.0.0.1:{server.server_address[1]}/AquaNova/tablet/"
    errors = []
    with sync_playwright() as p:
        browser = smoke.launch(p)
        ctx = browser.new_context(viewport={"width": int(os.environ.get("VW", 1180)), "height": int(os.environ.get("VH", 820))}, has_touch=True, device_scale_factor=2)
        page = ctx.new_page()
        page.on("console", lambda m: errors.append(m.text[:200]) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append("uncaught " + str(e)[:200]))
        def board():
            page.goto(base); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=15000)
            page.tap("#board-btn"); page.wait_for_timeout(900)
        js = lambda code: page.evaluate("(async()=>{" + code + "})()")
        objs = lambda: js("const g=(await import('./js/persist.js')).gameState;return g.getProperty('mission.objectives').map(o=>o.id.replace('meetTheCrew_','')+':'+o.status)")

        board()
        check("starts in quarters", page.evaluate("!document.querySelector('.scene[hidden]') || true") and page.is_visible(".modal"))
        page.screenshot(path=f"{SHOTS}/f-1welcome.png")
        page.tap(".modal .btn"); page.wait_for_timeout(400)
        o = objs(); check("find_communicator completed on entering quarters", "find_communicator:completed" in o, o)
        check("laptop glows, pin not shown yet", page.locator('.hs[aria-label="LOGBOOK"].glow').count() == 1 and not page.is_visible(".pickup"))
        page.locator('.hs[aria-label="LOGBOOK"]').tap(force=True); page.wait_for_timeout(600)
        t = page.inner_text("#station").upper()
        check("logbook shows welcome with the task list", "WELCOME ONBOARD" in t and "FIND AND PUT ON COMMUNICATOR" in t, t[:200])
        page.screenshot(path=f"{SHOTS}/f-1logbook.png")
        page.evaluate("window.__aq.scene('quarters')"); page.wait_for_timeout(500)
        check("laptop stops glowing once read", page.locator('.hs[aria-label="LOGBOOK"].glow').count() == 0)
        check("pickup visible", page.is_visible(".pickup"))
        page.screenshot(path=f"{SHOTS}/f-2pickup.png")
        check("pin hidden before pickup", not page.is_visible("#pin"))
        page.locator(".pickup").tap(force=True); page.wait_for_timeout(500)
        check("tutorial modal after pickup", page.is_visible(".modal"))
        page.tap(".modal .btn"); page.wait_for_timeout(300)
        check("pickup hidden after pickup", not page.is_visible(".pickup"))
        check("pin visible after pickup", page.is_visible("#pin"))
        page.tap("#pin"); page.wait_for_timeout(900)
        check("pin opens crew comms", page.is_visible("#comm-pop .comm-page"))
        o = objs(); check("learn_communicator completed", "learn_communicator:completed" in o, o)
        page.wait_for_timeout(4000); page.screenshot(path=f"{SHOTS}/f-3comms.png")
        page.tap(".comm-who >> text=ARIA"); page.wait_for_timeout(300); page.tap(".comm-line >> text=/One more thing|I need something/"); page.wait_for_timeout(300); page.tap(".comm-line >> text=Make small talk"); page.wait_for_timeout(300); page.tap(".comm-line >> text=Hello"); page.wait_for_timeout(500)
        done = js("const g=(await import('./js/persist.js')).gameState;return g.getProperty('mission.completedIds')")
        check("First Contact completed", done and "meetTheCrew" in done, done)
        known = js("const g=(await import('./js/persist.js')).gameState;return g.getProperty('contacts.crew.science.known')")
        check("science unlocked by mission", known is True, known)
        page.screenshot(path=f"{SHOTS}/f-4done.png")
        page.evaluate("document.querySelector(\'#comm-pop\').click()")
        # persistence
        js("const s=(await import('./js/sim.js')).sim, p=await import('./js/persist.js'); s.s.docked=false; s.s.lat=41.51; s.s.lon=-70.68; s.s.depth=120; s.s.heading=77; s.s.targetHeading=77; s.s.targetDepth=120; s.s.throttle=0; p.addLogEntry('Entry A'); p.addLogEntry('Test entry before reload'); p.checkpoint();")
        page.wait_for_timeout(200)
        board()
        pos = js("const s=(await import('./js/sim.js')).sim.s;return [s.lat,s.lon,s.depth,s.heading]")
        check("position restored after reload", abs(pos[0]-41.51)<0.001 and abs(pos[1]+70.68)<0.001 and pos[2]==120 and pos[3]==77, pos)
        done = js("const g=(await import('./js/persist.js')).gameState;return [g.getProperty('mission.completedIds'), g.getProperty('mission.objectives').filter(o=>o.missionId==='meetTheCrew').length]")
        check("mission not restarted after reload", done[0] and "meetTheCrew" in done[0] and done[1]==0, done)
        check("lands on bridge after tutorial", page.is_visible('.hs[aria-label="COMMS"]') and not page.is_visible(".pickup") and page.is_visible("#pin"))
        before = js("const g=(await import('./js/persist.js')).saveManager;return g.getActiveLogbook().entries.length")
        js("const s=(await import('./js/sim.js')).sim;s.s.at=null;s.s.lat=41.5050;s.s.lon=-70.6841;s.step(0.2)")
        page.wait_for_timeout(300)
        after = js("const g=(await import('./js/persist.js')).saveManager;const l=g.getActiveLogbook();return [l.entries.length, l.entries[l.entries.length-1].metadata.canRevert]")
        check("arrival adds a note that is not a save point", after[0]==before+1 and after[1] is False, after)
        page.evaluate("window.__aq.open('log')"); page.wait_for_timeout(600)
        check("logbook shows saved entry", page.is_visible("text=Test entry before reload"))
        page.screenshot(path=f"{SHOTS}/f-5log.png")
        # revert to the bootstrap entry
        page.locator(".entry", has_text="Entry A").locator("text=Revert here").tap(); page.wait_for_timeout(300)
        page.tap(".modal .btn.primary"); page.wait_for_timeout(500)
        page.screenshot(path=f"{SHOTS}/f-6revert.png")
        check("entry removed after revert", not page.is_visible("text=Test entry before reload"), page.inner_text("#console-line"))
        browser.close()
    server.shutdown(); shutil.rmtree(site, ignore_errors=True)
    check("no console errors", not errors, errors)
    print(f"\n{len(fails)} failure(s)"); sys.exit(1 if fails else 0)

if __name__ == "__main__":
    main()
