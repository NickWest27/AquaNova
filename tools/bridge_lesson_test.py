#!/usr/bin/env python3
"""Charting a Course starts at "plot a course": plotting to Vineyard Ledge from anywhere ticks it.  python3 tools/bridge_lesson_test.py"""
import importlib.util, os, sys
from playwright.sync_api import sync_playwright
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sp = importlib.util.spec_from_file_location("smoke", R + "/tools/smoke.py"); sm = importlib.util.module_from_spec(sp); sp.loader.exec_module(sm)
srv, _ = sm.start_server(); base = f"http://127.0.0.1:{srv.server_address[1]}/AquaNova/tablet/"
fails = []
def check(n, ok):
    print(("ok   " if ok else "FAIL ") + n)
    if not ok: fails.append(n)
with sync_playwright() as p:
    b = sm.launch(p); pg = b.new_context(viewport={"width": 1180, "height": 820}, has_touch=True).new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
    pg.goto(base); pg.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000); pg.tap("#board-btn"); pg.wait_for_timeout(800)
    if pg.is_visible(".modal .btn"): pg.tap(".modal .btn"); pg.wait_for_timeout(300)
    pg.evaluate("""(async()=>{const m=(await import('../game/systems/missionManager.js')).default;for(const id of ['meetTheCrew','shipTour','seaTrials']) m.forceCompleteMission&&m.forceCompleteMission(id); m.startMission('navLesson');})()""")
    pg.evaluate("window.__aq.scene('bridge')"); pg.wait_for_timeout(500)
    st = """(async()=>{const g=(await import('./js/persist.js')).gameState;return (g.getProperty('mission.objectives')||[]).filter(x=>x.missionId==='navLesson').map(x=>x.id+':'+x.status)})()"""
    check("the lesson starts at the plot step", "navLesson_plot:active" in pg.evaluate(st) and "navLesson_open:active" not in pg.evaluate(st))
    pg.evaluate("""(async()=>{const sim=(await import('./js/sim.js')).sim;sim.s.docked=false;sim.setWpt(sim.s.pois.find(p=>p.name==='Vineyard Ledge'))})()""")
    pg.wait_for_timeout(6000)
    check("plotting to Vineyard Ledge completes the plot step", "navLesson_plot:completed" in pg.evaluate(st))
    # a WSKR scans the ledge (the ship is not there yet), then the ship arrives: the scan step still counts
    pg.evaluate("""(async()=>{const sim=(await import('./js/sim.js')).sim;const L=sim.s.pois.find(p=>p.name==='Vineyard Ledge');sim.emit('wskr-found',{wskr:{n:1},poi:L})})()""")
    pg.wait_for_timeout(500)
    pg.evaluate("(async()=>{const g=(await import('./js/persist.js')).gameState; for (const k of ['opened_sensors','wskr_out','swept']) { g.updateProperty('tutorial.'+k,true); g.updateProperty('progress.flags',{...(g.getProperty('progress.flags')||{}),[k]:true}); } })()")   # the steps before arrive (one at a time since 2026-11-27)
    pg.evaluate("""(async()=>{const sim=(await import('./js/sim.js')).sim;const L=sim.s.pois.find(p=>p.name==='Vineyard Ledge');sim.s.at=L;sim.s.lat=L.lat;sim.s.lon=L.lon})()""")
    pg.wait_for_timeout(7000)
    r = pg.evaluate(st); done = pg.evaluate("(async()=>{const m=(await import('../game/systems/missionManager.js')).default; return m.completedMissions.has('navLesson')})()")
    check("a scan filed by a WSKR completes the scan step (and with it the lesson)", "navLesson_scan:completed" in r or done)
    check("no page errors", not errs)
    b.close()
srv.shutdown(); sys.exit(1 if fails else 0)
