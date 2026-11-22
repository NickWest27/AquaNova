#!/usr/bin/env python3
"""First Survey mission end to end: offer by mail, Remora samples, analysis, report, bonus.  python3 tools/survey_test.py"""
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
        js = lambda code: page.evaluate("(async()=>{const sim=(await import('./js/sim.js')).sim;const sc=await import('./js/science.js');const g=(await import('./js/persist.js')).gameState;const M=(await import('../game/systems/missionManager.js')).default;" + code + "})()")
        page.goto(base); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000)
        page.tap("#board-btn"); page.wait_for_timeout(800)
        page.evaluate("import('./js/sim.js').then(m=>m.setTimeScale(30))"); page.wait_for_timeout(200)   # these tests were written for the old 30x pace
        if page.is_visible(".modal .btn"): page.tap(".modal .btn"); page.wait_for_timeout(300)
        # the offer arrives after Sea Trials finish
        r = js("""M.delayScale=0; M.startMission('seaTrials'); for (const o of ['undock','dive','speed','surface','report']) M.completeObjective('seaTrials',o); await new Promise(r=>setTimeout(r,300)); for (const o of ['open','plot','open_sensors','wskr','sweep','arrive','scan']) M.completeObjective('navLesson',o); await new Promise(r=>setTimeout(r,300)); const m=(g.getProperty('mission.inbox')||[]).find(x=>x.id==='oera-first-survey'); return {done:M.completedMissions.has('seaTrials'), msg:!!m, mid:m&&m.missionId}""")
        check("Sea Trials completes and the survey offer arrives", r["done"] and r["msg"] and r["mid"] == "firstSurvey", r)
        js("M.startMission('firstSurvey'); return 1")
        st = lambda: js("return (g.getProperty('mission.objectives')||[]).filter(o=>o.missionId==='firstSurvey').map(o=>o.status)")
        # launch at Mystic Reef, water sample
        js("""const s=sim.s; const reef=s.pois.find(p=>p.name==='Mystic Reef'); Object.assign(s,{lat:reef.lat,lon:reef.lon,docked:false,depth:5,targetDepth:5,rov:null,wskrs:[]}); sim.launchRov(); const x=sim.rovUse('collector'); let n=0; while(s.rov.job&&n<6000){sim.step(0.1);n++;} s.rov.lat=s.lat; s.rov.lon=s.lon; sim.recoverRov(); return x""")
        page.wait_for_timeout(1500)
        r = js("return {stats:sc.samples().length, s:(g.getProperty('mission.science')||{}).stats}")
        check("water sample at Mystic Reef is counted", r["s"].get("water_mystic_reef") == 1 and r["s"].get("launched") == 1, r)
        check("launch and reef objectives complete", st()[:2] == ["completed", "completed"], st())
        # rock core at Vineyard Ledge
        r = js("""const s=sim.s; const l=s.pois.find(p=>p.name==='Vineyard Ledge'); if(!l) return {err:'no ledge'}; Object.assign(s,{lat:l.lat,lon:l.lon}); sim.launchRov(); const f=(await import('./js/seafloor.js')).seafloor.depthAt(l.lat,l.lon); s.rov.depth=f-3; const x=sim.rovUse('drill'); let n=0; while(s.rov.job&&n<12000){sim.step(0.1);n++;} s.rov.lat=s.lat; s.rov.lon=s.lon; sim.recoverRov(); return {x,f}""")
        check("Vineyard Ledge exists and drilling works", "err" not in r and r["x"]["ok"], r)
        page.wait_for_timeout(1500)
        check("ledge objective complete", st()[:3] == ["completed"] * 3, st())
        # analysis
        js("""for (const q of sc.samples()) sc.startAnalysis(q.id); sim.s.clock+=9000; sc.tickLab(); sim.s.clock+=9000; sc.tickLab(); return 1""")
        page.wait_for_timeout(1500)
        check("analysis objective complete", st()[:4] == ["completed"] * 4, st())
        # report
        page.evaluate("document.dispatchEvent(new CustomEvent('report-sent'))"); page.wait_for_timeout(1500)
        r = js("return {done:M.completedMissions.has('firstSurvey'), flag:g.getProperty('progress.firstSurveyComplete'), pts:sc.points(), mail:!!(g.getProperty('mission.inbox')||[]).find(x=>x.id==='oera-survey-done')}")
        check("mission completes and OERA writes back", r["done"] and r["flag"] and r["mail"], r)
        check("research budget granted once", r["pts"] >= 3 and js("return sc.awardSurveyBonus()") == 0, r)
        check("no page errors", not errors, errors[:3])
        browser.close()
    server.shutdown()
    print("FAILED: " + ", ".join(fails) if fails else "all ok"); sys.exit(1 if fails else 0)
main()
