#!/usr/bin/env python3
"""Mission logs: accepting a mission in Comms writes an M.LOG entry with a state save; completing it writes the captain's outcome entry with another; reverting works.  python3 tools/missionlog_test.py"""
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
        page.goto(base); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000)
        page.tap("#board-btn"); page.wait_for_timeout(800)
        if page.is_visible(".modal .btn"): page.tap(".modal .btn"); page.wait_for_timeout(300)
        js = lambda code: page.evaluate("(async()=>{const sim=(await import('./js/sim.js')).sim;const P=await import('./js/persist.js');const g=P.gameState;const M=(await import('../game/systems/missionManager.js')).default;M.delayScale=0;" + code + "})()")
        entries = lambda: js("return (P.saveManager.getActiveLogbook().entries||[]).map(e=>({id:e.logbook.entryId,type:e.logbook.type,text:e.logbook.content,tasks:e.logbook.tasks,done:e.logbook.completedTasks,snap:!!e.gameSnapshot,rev:e.metadata.canRevert!==false}))")
        n0 = len(entries())
        js("M.forceCompleteMission('meetTheCrew'); M.forceCompleteMission('shipTour'); return 1"); page.wait_for_timeout(500)
        check("tutorial lessons write no mission logs", len(entries()) == n0, entries()[n0:])
        # accept Sea Trials from the mail window
        page.evaluate("window.__aq.open('comms')"); page.wait_for_timeout(500)
        page.evaluate("[...document.querySelectorAll('#station .tabs .btn')].find(b=>b.textContent.startsWith('Mail')).click()"); page.wait_for_timeout(300)
        page.evaluate("document.querySelector('#station .mail-row, #station .row-msg, #station [class*=mail-row]').click()"); page.wait_for_timeout(1500)
        page.evaluate("[...document.querySelectorAll('#station button')].find(b=>b.textContent==='Accept mission').click()"); page.wait_for_timeout(500)
        e = entries(); new = e[n0:]
        check("accepting writes one mission log", len(new) == 1 and new[0]["type"] == "mission_log" and new[0]["id"].startswith("M.LOG-"), new)
        a = new[0] if new else {}
        check("entry has the mission name, briefing and task list", "Sea Trials" in a.get("text", "") and "dive below 30 metres" in a.get("text", "") and len(a.get("tasks", [])) == 5 and a.get("done") == [], a)
        check("entry is a revert point with a snapshot", a.get("snap") and a.get("rev"), a)
        check("mission is active", js("return M.activeMissions.has('seaTrials')"))
        # fly the trials and report
        js("for (const o of ['undock','dive','speed','surface']) M.completeObjective('seaTrials',o); return 1"); page.wait_for_timeout(300)
        check("no outcome entry before the report", len(entries()) == n0 + 1)
        js("M.completeObjective('seaTrials','report'); return 1"); page.wait_for_timeout(900)
        e = entries(); new = e[n0:]
        check("completion writes the second mission log", len(new) == 2 and new[1]["type"] == "mission_log", [x["id"] for x in new])
        b = new[1] if len(new) > 1 else {}
        check("outcome is the captain's account as a summary, without the task list again", "Mission complete: Sea Trials" in b.get("text", "") and "passed the Aqua Nova" in b.get("text", "") and b.get("tasks", []) == [] and b.get("snap"), b)
        check("log numbers rise", a.get("id") != b.get("id"))
        # the logbook shows both
        page.evaluate("window.__aq.open('log')"); page.wait_for_timeout(500)
        check("no task is crossed out in the logbook", page.locator("#station .entry li.done").count() == 0 and page.evaluate("[...document.querySelectorAll('#station .entry li')].every(x=>getComputedStyle(x).textDecorationLine==='none')"))
        t = page.inner_text("#station"); check("logbook lists the mission logs", t.upper().count("MISSION LOG") >= 2 and "Mission accepted: Sea Trials" in t, t[:200])
        # revert to the acceptance entry: mission is active again, the outcome entry is gone
        js(f"P.saveManager.revertToEntry('{a['id']}'); P.restoreSim(); M.restoreFromState(); return 1"); page.wait_for_timeout(300)
        check("revert returns to the accepted moment", js("return M.activeMissions.has('seaTrials') && !M.completedMissions.has('seaTrials')") and len(entries()) == n0 + 1)
        check("no page errors", not errors, errors[:3])
        browser.close()
    print("\n%d failure(s)" % len(fails)); sys.exit(1 if fails else 0)
main()
