#!/usr/bin/env python3
"""Charting a Course is not stuck when the Captain is already at Mystic Reef.  python3 tools/lesson_test.py"""
import importlib.util,json,os,sys
from playwright.sync_api import sync_playwright
R=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sp=importlib.util.spec_from_file_location("smoke",R+"/tools/smoke.py");sm=importlib.util.module_from_spec(sp);sp.loader.exec_module(sm)
srv,_=sm.start_server();base=f"http://127.0.0.1:{srv.server_address[1]}/AquaNova/tablet/"
with sync_playwright() as p:
    b=sm.launch(p);pg=b.new_context(viewport={"width":1180,"height":820},has_touch=True).new_page()
    pg.on("pageerror",lambda e:print("ERR",e)); pg.on("console",lambda m:print("C",m.text[:150]) if m.type in("error","warning") else None)
    pg.goto(base);pg.wait_for_function("!document.getElementById('board-btn').disabled",timeout=20000);pg.tap("#board-btn");pg.wait_for_timeout(800)
    if pg.is_visible(".modal .btn"):pg.tap(".modal .btn");pg.wait_for_timeout(300)
    st="""(async()=>{const m=(await import('../game/systems/missionManager.js')).default;const g=(await import('./js/persist.js')).gameState;
      const o=g.getProperty('mission.objectives')||[];return {active:[...m.activeMissions],done:[...(g.getProperty('mission.completed')||[])],obj:o.filter(x=>/nav|ship|meet/i.test(x.id)).map(x=>x.id+':'+x.status),flags:g.getProperty('progress.flags')}})()"""
    pg.evaluate("""(async()=>{const m=(await import('../game/systems/missionManager.js')).default;for(const id of ['meetTheCrew','shipTour','seaTrials']) m.forceCompleteMission&&m.forceCompleteMission(id); m.startMission('navLesson'); const {sim}=await import('./js/sim.js'); sim.s.docked=false; sim.s.at=sim.s.pois.find(p=>p.name==='Vineyard Ledge'); sim.s.lat=sim.s.at.lat; sim.s.lon=sim.s.at.lon})()""");pg.wait_for_timeout(1500)
    pg.evaluate("window.__aq.scene('bridge')");pg.wait_for_timeout(300);pg.evaluate("window.__aq.open('nav')");pg.wait_for_timeout(6000)
    r=pg.evaluate(st); ok='navLesson_arrive:completed' in r['obj'] and r['flags'].get('arrived_ledge'); print(('ok   ' if ok else 'FAIL ')+'Charting a Course counts a ship that is already at Vineyard Ledge as plotted and arrived', '' if ok else r)
    b.close()
srv.shutdown(); sys.exit(0 if ok else 1)
