#!/usr/bin/env python3
"""A save from an older build still progresses: new lesson steps are added, retired lessons are finished.  python3 tools/migrate_test.py"""
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
        js = lambda code: page.evaluate("(async()=>{const M=(await import('../game/systems/missionManager.js')).default;const g=(await import('./js/persist.js')).gameState;" + code + "})()")
        page.goto(base); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000)
        page.tap("#board-btn"); page.wait_for_timeout(800)
        if page.is_visible(".modal .btn"): page.tap(".modal .btn"); page.wait_for_timeout(300)
        o = lambda i, s, m="navLesson": {"id": f"{m}_{i}", "missionId": m, "description": i, "status": s, "required": True}
        r = js("g.updateProperty('mission.completedIds',[]); g.updateProperty('mission.objectives',[" + ",".join(
            '{id:"navLesson_%s",missionId:"navLesson",description:"x",status:"%s",required:true}' % (i, s) for i, s in [("open", "completed"), ("plot", "active"), ("arrive", "active")]) + "]); M.restoreFromState(); const ids=(g.getProperty('mission.objectives')||[]).map(x=>x.id); return {ids, active:[...M.activeMissions]}")
        check("a lesson saved before it gained steps gets the new steps", all(f"navLesson_{i}" in r["ids"] for i in ["open_sensors", "wskr", "sweep", "scan"]) and "navLesson" in r["active"], r)
        r = js("g.updateProperty('mission.completedIds',['navLesson']); g.updateProperty('mission.objectives',[{id:'sensorsLesson_sweep',missionId:'sensorsLesson',description:'x',status:'active',required:true}]); M.restoreFromState(); await new Promise(r=>setTimeout(r,300)); return {obj:(g.getProperty('mission.objectives')||[]).map(x=>x.id), done:[...M.completedMissions], stations:g.getProperty('progress.stationsUnlocked')}")
        check("a save inside the retired sensors lesson finishes the merged lesson and unlocks the lab", "navLesson" in r["done"] and not any("sensorsLesson" in i for i in r["obj"]) and "lab" in (r["stations"] or []), r)
        check("no page errors", not errors, errors[:3])
        browser.close()
    server.shutdown()
    print("\nAll checks passed." if not fails else f"\n{len(fails)} failed")
    sys.exit(1 if fails else 0)
main()
