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
        r = js("""const s=sim.s; const x=sim.rovUse('collector'); return x""")
        check("tool works at a site", r["ok"], r)
        r = js("""const s=sim.s; let n=0; while(s.rov.job && n<6000){ sim.step(0.1); n++; } return {left:!!s.rov.job, n, count:sc.samples().length, cargo:s.rov.cargo.length, first:s.rov.cargo[0]}""")
        check("a sample is made and carried in her storage, not yet in the lab", not r["left"] and r["cargo"] == 1 and r["count"] == 0, r)
        # tether: drive away and check range cap
        r = js("""const s=sim.s; s.rov.cmd={thr:1,turn:0,dive:0}; s.rov.heading=0; for(let i=0;i<3000;i++) sim.step(0.1); const d=Math.hypot((s.rov.lat-s.lat)*60,(s.rov.lon-s.lon)*60*Math.cos(s.lat*Math.PI/180)); s.rov.cmd={thr:0,turn:0,dive:0}; return d""")
        check("tether holds the ROV within 1 nm", r <= 1.001, r)
        r = js("""const s=sim.s; s.rov.lat=s.lat; s.rov.lon=s.lon; return sim.recoverRov()""")
        check("ROV is recovered near the ship", r["ok"], r)
        r = js("return sc.samples().length")
        check("the sample reaches the lab once she is aboard", r == 1, r)
        # analysis and research
        r = js("""const id=sc.samples()[0].id; const ok=sc.startAnalysis(id); const dup=sc.startAnalysis(id); sim.s.clock+=5000; const done=sc.tickLab(); return {ok,dup,done:done.length,pts:sc.points(),disc:(await import('./js/findings.js')).findings().filter(f=>f.type==='sample').length}""")
        check("analysis runs and files a finding", r["ok"] and not r["dup"] and r["done"] == 1 and r["pts"] == 1 and r["disc"] == 1, r)
        r = js("""sc.addSample('rock',null,'drill'); sc.addSample('bio',null,'collector'); for (const q of sc.samples()) sc.startAnalysis(q.id); sim.s.clock+=9000; sc.tickLab(); sc.tickLab(); sim.s.clock+=9000; sc.tickLab(); return {pts:sc.points(), left:sc.jobs().length}""")
        check("points collect", r["pts"] >= 3, r)
        r = js("""const ok=sc.startTopic('rov-range'); return {ok, has:sc.research.has('rov-range')}""")
        check("research unlocks a topic", r["ok"] and r["has"], r)
        # WSKR perks: Lantern leads, Drifter swings wide, Sprat is quicker, Scout charts further
        r = js("""const s=sim.s; const reef=s.pois.find(p=>p.name==='Canyon Head'); Object.assign(s,{lat:reef.lat,lon:reef.lon,docked:false,rov:null,wskrs:[],wpt:null,speed:0,throttle:0,heading:90,targetHeading:90});
          for(let i=0;i<4;i++) sim.deployWskr();
          const T=await import('./js/sim.js'); let maxD=0, minD=9, lead=null; 
          for(let i=0;i<4000;i++){ sim.step(0.1); s.clock+=0; const d=s.wskrs.find(w=>w.n===3); const dd=T.toward(s,d).nm; if(i>1500){maxD=Math.max(maxD,dd);minD=Math.min(minD,dd);} }
          const l=s.wskrs.find(w=>w.n===2); const b=T.toward(s,l).brg;
          return {brg:b, maxD, minD, names:s.wskrs.map(w=>T.wskrName(w)), scout:T.wskrPerk({n:1}).chart, sprat:T.wskrPerk({n:4}).kt}""")
        check("WSKR names are Scout, Lantern, Drifter, Sprat", r["names"] == ["Scout", "Lantern", "Drifter", "Sprat"], r)
        check("Lantern leads (ahead of the ship)", abs(((r["brg"] - 90 + 180) % 360) - 180) < 25, r)
        check("Drifter swings wide", r["maxD"] - r["minD"] > 0.3, r)
        check("Scout charts further, Sprat is quicker", r["scout"] > 0 and r["sprat"] > 10, r)
        # WSKR page and craft views draw without errors
        r = js("""const s=sim.s; const c=s.pois.find(p=>p.name==='Canyon Head'); Object.assign(s,{lat:c.lat,lon:c.lon,wskrs:[],rov:null,docked:false}); sim.deployWskr(); sim.deployWskr(); for(let i=0;i<200;i++) sim.step(0.1); window.__aq.open('wskr'); return s.wskrs.length""")
        page.wait_for_timeout(800)
        js("window.__aq.open('sensors'); return 1"); page.wait_for_timeout(500)
        page.locator("#station .tabs .btn", has_text="WSKRs").tap(); page.wait_for_timeout(700)
        txt = page.inner_text("#station").lower()
        check("WSKR page shows WSKR names", "scout" in txt and "lantern" in txt, txt[:100])
        page.locator("#station .wk-tile").first.tap(); page.wait_for_timeout(600)
        check("selected WSKR shows its synthetic view", page.is_visible("#station .synth-canvas"))
        page.evaluate("document.querySelector('#station .st-head .btn').click()"); page.wait_for_timeout(200)
        r = js("""const s=sim.s; s.wskrs=[]; sim.launchRov(); s.rov.depth=20; window.__aq.open('remora'); return 1""")
        page.wait_for_timeout(800)
        check("Remora page shows the synthetic view", page.is_visible("#station .synth-canvas") and page.is_visible("#station .cv-map canvas"))
        page.evaluate("document.querySelector('#station .st-head .btn').click()"); page.wait_for_timeout(200); js("sim.s.rov=null; return 1")
        # a WSKR on land is put back in water, and a WSKR never ends a step on land
        r = js("""const s=sim.s; const sf=(await import('./js/seafloor.js')).seafloor; Object.assign(s,{lat:41.52,lon:-70.67,docked:false,wskrs:[],rov:null}); sim.deployWskr(); const w=s.wskrs[0]; let found=null; for(let dy=-0.03;dy<=0.03&&!found;dy+=0.004) for(let dx=-0.03;dx<=0.03&&!found;dx+=0.004){ const d=sf.depthAt(41.52+dy,-70.67+dx); if(d!=null&&d===0) found={lat:41.52+dy,lon:-70.67+dx}; } w.lat=found.lat; w.lon=found.lon; const before=sf.depthAt(w.lat,w.lon); sim.step(0.1); return {before, after:sf.depthAt(w.lat,w.lon)}""")
        check("a WSKR left on land is moved back into water", r["before"] is not None and r["before"] < 3 and r["after"] >= 3, r)
        # rooms and stations through touch
        tap = lambda label: page.evaluate("(l)=>{const b=[...document.querySelectorAll('button')].find(x=>x.getAttribute('aria-label')===l && x.offsetParent); if(!b) return false; b.click(); return true}", label)
        check("to walkway", tap("TO WALKWAY") or tap("WALKWAY")); page.wait_for_timeout(300)
        check("walkway to science", tap("SCIENCE")); page.wait_for_timeout(500)
        page.screenshot(path=os.path.join(ROOT, "tools", "shots", "science_room.png"))
        for label, text in [("SAMPLES", "Samples"), ("ANALYSIS", "Analysis"), ("RESEARCH", "Research"), ("ROV STATION", "Remora")]:
            check("open " + label, tap(label)); page.wait_for_timeout(600)
            check(label + " station shows", page.is_visible("#station") and text.lower() in page.inner_text("#station").lower(), page.inner_text("#station")[:80])
            page.screenshot(path=os.path.join(ROOT, "tools", "shots", "science_" + label.lower().replace(" ", "_") + ".png"))
            page.evaluate("document.querySelector('#station .st-head .btn').click()"); page.wait_for_timeout(300)
        check("science to walkway", tap("WALKWAY ▸")); page.wait_for_timeout(300)
        check("walkway to AN-1", tap("AN-1 DECK ▼")); page.wait_for_timeout(300)
        check("AN-1 to launch bay", tap("LAUNCH BAY")); page.wait_for_timeout(500)
        check("open BAY CONTROL", tap("BAY CONTROL")); page.wait_for_timeout(600)
        txt = page.inner_text("#station").lower()
        check("bay shows Remora, WSKR names and the shuttle", "remora" in txt and "scout" in txt and "tern" in txt, txt[:120])
        js("sim.s.wskrs=[]; sim.s.rov=null; return 1")
        page.wait_for_timeout(400)
        n0 = js("return sim.s.wskrs.length")
        page.evaluate("[...document.querySelectorAll('#station button')].filter(b=>b.textContent==='Launch'&&!b.disabled)[1].click()"); page.wait_for_timeout(300)
        page.evaluate("import('./js/sim.js').then(m=>m.setTimeScale(120))"); page.wait_for_timeout(1500)
        check("bay launches a WSKR (a minute later)", js("return sim.s.wskrs.length") == n0 + 1)
        page.evaluate("[...document.querySelectorAll('#station button')].find(b=>b.textContent==='Launch'&&!b.disabled).click()"); page.wait_for_timeout(1800)
        check("bay launches Remora (a minute later)", js("return !!sim.s.rov"))
        page.screenshot(path=os.path.join(ROOT, "tools", "shots", "launch_bay.png"))
        check("no page errors", not errors, errors[:3])
        browser.close()
    server.shutdown()
    print("FAILED: " + ", ".join(fails) if fails else "all ok"); sys.exit(1 if fails else 0)
main()
