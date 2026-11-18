#!/usr/bin/env python3
"""Science lab: ROV, samples, analysis, research, stations.  python3 tools/science_test.py"""
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
        js = lambda code: page.evaluate("(async()=>{const sim=(await import('./js/sim.js')).sim;const sc=await import('./js/science.js');" + code + "})()")
        page.goto(base); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000)
        page.tap("#board-btn"); page.wait_for_timeout(800)
        if page.is_visible(".modal .btn"): page.tap(".modal .btn"); page.wait_for_timeout(300)
        # put the ship at sea, over a reef, undocked
        r = js("""const s=sim.s; const reef=s.pois.find(p=>p.type==='reef'); Object.assign(s,{lat:reef.lat,lon:reef.lon,docked:false,speed:0,throttle:0,depth:20,targetDepth:20,wpt:null,rov:null});
          const a=sim.launchRov(); const again=sim.launchRov(); return {a,again,reef:reef.name,floor:null}""")
        check("ROV launches once", r["a"]["ok"] and not r["again"]["ok"], r)
        r = js("""const s=sim.s; const x=sim.rovUse('spectrometer'); return x""")
        check("tool works at a site", r["ok"], r)
        r = js("""const s=sim.s; let n=0; while(s.rov.job && n<2000){ sim.step(0.1); n++; } return {left:!!s.rov.job, n, count:sc.samples().length, first:sc.samples()[0]}""")
        check("a sample is made", not r["left"] and r["count"] == 1, r)
        # tether: drive away and check range cap
        r = js("""const s=sim.s; s.rov.cmd={thr:1,turn:0,dive:0}; s.rov.heading=0; for(let i=0;i<3000;i++) sim.step(0.1); const d=Math.hypot((s.rov.lat-s.lat)*60,(s.rov.lon-s.lon)*60*Math.cos(s.lat*Math.PI/180)); s.rov.cmd={thr:0,turn:0,dive:0}; return d""")
        check("tether holds the ROV within 1 nm", r <= 1.001, r)
        r = js("""const s=sim.s; s.rov.lat=s.lat; s.rov.lon=s.lon; return sim.recoverRov()""")
        check("ROV is recovered near the ship", r["ok"], r)
        # analysis and research
        r = js("""const id=sc.samples()[0].id; const ok=sc.startAnalysis(id); const dup=sc.startAnalysis(id); sim.s.clock+=5000; const done=sc.tickLab(); return {ok,dup,done:done.length,pts:sc.points(),disc:(await import('./js/findings.js')).findings().filter(f=>f.type==='sample').length}""")
        check("analysis runs and files a finding", r["ok"] and not r["dup"] and r["done"] == 1 and r["pts"] == 1 and r["disc"] == 1, r)
        r = js("""sc.addSample('rock',null,'drill'); sc.addSample('bio',null,'collector'); for (const q of sc.samples()) sc.startAnalysis(q.id); sim.s.clock+=9000; sc.tickLab(); sc.tickLab(); sim.s.clock+=9000; sc.tickLab(); return {pts:sc.points(), left:sc.jobs().length}""")
        check("points collect", r["pts"] >= 3, r)
        r = js("""const ok=sc.startTopic('rov-range'); return {ok, has:sc.research.has('rov-range')}""")
        check("research unlocks a topic", r["ok"] and r["has"], r)
        # rooms and stations through touch
        tap = lambda label: page.evaluate("(l)=>{const b=[...document.querySelectorAll('button')].find(x=>x.getAttribute('aria-label')===l && x.offsetParent); if(!b) return false; b.click(); return true}", label)
        check("to walkway", tap("TO WALKWAY") or tap("◂ WALKWAY")); page.wait_for_timeout(300)
        check("walkway to science", tap("SCIENCE / MEDICAL")); page.wait_for_timeout(500)
        page.screenshot(path=os.path.join(ROOT, "tools", "shots", "science_room.png"))
        for label, text in [("SAMPLES", "Samples"), ("ANALYSIS", "Analysis"), ("RESEARCH", "Research"), ("LAUNCH BAY", "Launch Bay")]:
            check("open " + label, tap(label)); page.wait_for_timeout(600)
            check(label + " station shows", page.is_visible("#station") and text.lower() in page.inner_text("#station").lower(), page.inner_text("#station")[:80])
            page.screenshot(path=os.path.join(ROOT, "tools", "shots", "science_" + label.lower().replace(" ", "_") + ".png"))
            page.evaluate("document.querySelector('#station .st-head .btn').click()"); page.wait_for_timeout(300)
        check("no page errors", not errors, errors[:3])
        browser.close()
    server.shutdown()
    print("FAILED: " + ", ".join(fails) if fails else "all ok"); sys.exit(1 if fails else 0)
main()
