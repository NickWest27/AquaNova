#!/usr/bin/env python3
"""Status reports from the communicator; course and speed are independent.  python3 tools/status_course_test.py"""
import importlib.util
from playwright.sync_api import sync_playwright
spec = importlib.util.spec_from_file_location("smoke", __file__.replace("status_course_test.py", "smoke.py")); smoke = importlib.util.module_from_spec(spec); spec.loader.exec_module(smoke)
fails = []
def check(n, ok, x=""):
    print(("ok   " if ok else "FAIL ") + n + (f"  {x}" if x and not ok else ""))
    if not ok: fails.append(n)
def main():
    server, site = smoke.start_server()
    base = f"http://127.0.0.1:{server.server_address[1]}/AquaNova/tablet/"
    with sync_playwright() as p:
        b = smoke.launch(p); page = b.new_context(viewport={"width": 1180, "height": 820}, has_touch=True).new_page(); errs = []
        page.on("pageerror", lambda e: errs.append(str(e)[:200]))
        js = lambda code: page.evaluate("(async()=>{const sim=(await import('./js/sim.js')).sim;" + code + "})()")
        page.goto(base); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000)
        page.tap("#board-btn"); page.wait_for_timeout(800)
        if page.is_visible(".modal .btn"): page.tap(".modal .btn"); page.wait_for_timeout(300)
        js("const m=(await import('../game/systems/missionManager.js')).default; m.forceCompleteMission('meetTheCrew'); const g=(await import('./js/persist.js')).gameState; for (const id of ['helm','communications','sensors','engineering','science','security']) g.updateProperty('contacts.crew.'+id+'.known', true); return 1")
        page.wait_for_timeout(3200)   # ARIA's "New task" line arrives after about 2.5 s; clear what is held so the menus start clean
        js("(await import('./js/notify.js')).clearHeld(); return 1")
        # course and speed are independent
        r = js("const s=sim.s; Object.assign(s,{docked:false,at:null,wpt:null}); sim.setThrottle(0.3); const p=s.pois.find(x=>x.type!=='dock')||s.pois[0]; sim.setWpt(p); const a=s.throttle; sim.setThrottle(0.8); const b=s.throttle, w=!!s.wpt; sim.stop(); const c=!!s.wpt; sim.setThrottle(0.4); sim.cancelCourse(); return {a,b,w,c,after:s.throttle,wpt:!!s.wpt}")
        check("plotting a course leaves the throttle alone", r["a"] == 0.3, str(r))
        check("changing speed keeps the plotted course", r["b"] == 0.8 and r["w"] and r["c"], str(r))
        check("cancelling the course keeps the speed", r["after"] == 0.4 and not r["wpt"], str(r))
        r = js("const m=await import('./js/sim.js'); const s=sim.s; Object.assign(s,{docked:false,at:null,depth:50}); sim.deployWskr(); const w=s.wskrs[0]; w.bat=100; w.moving=false; w.mode='escort'; return m.wskrMinutes(w)")
        check("WSKR battery minutes: 6 h at 0.8 draw is 450 min", 440 < r["empty"] < 460 and 380 < r["recall"] < 400, str(r))
        page.evaluate("window.__aq.scene('bridge')"); page.wait_for_timeout(300)
        page.evaluate("document.querySelector('#pin').click()"); page.wait_for_timeout(700)
        tap = lambda: page.wait_for_timeout(350)
        def report(who, label):
            for _ in range(2):
                if not page.locator(".comm-who", has_text=who).count(): page.evaluate("document.querySelector('#pin').click()"); page.wait_for_timeout(700)
            if not page.locator(".comm-who").count() and page.locator(".comm-line", has_text="Someone else").count(): page.locator(".comm-line", has_text="Someone else").first.tap(); tap()
            page.locator(".comm-who", has_text=who).first.tap(timeout=5000); tap()
            if page.locator(".comm-line", has_text="I need something").count(): page.locator(".comm-line", has_text="I need something").first.tap(); tap()
            page.locator(".comm-line", has_text="Give an order").first.tap(); tap()
            page.locator(".comm-line", has_text=label).first.tap(); tap()
            t = page.locator(".comm-reply").first.inner_text()
            page.evaluate("document.querySelector('.comm-line:last-child') && 0")
            return t
        t = report("ARIA", "Status Report")
        check("ARIA gives a full report", all(k in t for k in ("Battery", "Links:", "Crew are healthy")), t)
        page.evaluate("window.__aq.scene('bridge')"); page.wait_for_timeout(300)
        page.evaluate("document.querySelector('#pin').click()"); page.wait_for_timeout(700)
        for who, key in (("Helmsman", "Helm report"), ("Nicole", "Communications report"), ("Torres", "Sensors report")):
            page.evaluate("window.__aq.scene('bridge')"); page.wait_for_timeout(300)
            t = report(who, "Status report")
            check(f"{who} gives a station report", key in t, t)
        check("no page errors", not errs, str(errs[:3]))
        b.close()
    print("\nall ok" if not fails else f"\n{len(fails)} FAILED"); raise SystemExit(1 if fails else 0)
main()
