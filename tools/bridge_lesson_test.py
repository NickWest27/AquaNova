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
    check("no page errors", not errs)
    b.close()
srv.shutdown(); sys.exit(1 if fails else 0)
