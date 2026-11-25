#!/usr/bin/env python3
"""Remora: limited sample storage, auto return, samples reach the lab only when she is recovered.  python3 tools/remora_test.py"""
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
        js = lambda code: page.evaluate("(async()=>{const sim=(await import('./js/sim.js')).sim;const sc=await import('./js/science.js');const R=await import('./js/rov.js');" + code + "})()")
        page.goto(base); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000)
        page.tap("#board-btn"); page.wait_for_timeout(800)
        if page.is_visible(".modal .btn"): page.tap(".modal .btn"); page.wait_for_timeout(300)
        setup = "const s=sim.s; const reef=s.pois.find(p=>p.type==='reef'); Object.assign(s,{lat:reef.lat,lon:reef.lon,docked:false,speed:0,throttle:0,depth:20,targetDepth:20,wpt:null,rov:null,autoAvoid:false}); sim.launchRov(); "
        r = js(setup + "const out=[]; for (let k=0;k<4;k++){ const x=sim.rovUse('collector'); out.push(x.ok?'ok':x.why); let n=0; while(s.rov.job && n<3000){ sim.step(1); n++; } } return {out, cargo:s.rov.cargo.length, lab:sc.samples().length}")
        check("she holds three samples, the fourth is refused: storage full", r["out"] == ["ok", "ok", "ok", "full"] and r["cargo"] == 3, r)
        r = js("const s=sim.s; s.rov.lat=s.lat+0.01; s.rov.lon=s.lon+0.008; const x=sim.rovAuto(); let n=0; while(s.rov && s.rov.auto && n<20000){ sim.step(5); n++; } const home=s.rov.home; return {x, home, still: !!s.rov, auto:s.rov.auto, lab:sc.samples().length}")
        check("auto return drives her home and she waits alongside; the samples are still aboard her", r["x"]["ok"] and r["home"] and r["still"] and r["lab"] == 0, r)
        r = js("const s=sim.s; const x=sim.recoverRov(); return {x, lab:sc.samples().length, out: !!s.rov}")
        check("once taken aboard the three samples go to the lab", r["x"]["ok"] and r["x"]["delivered"] == 3 and r["lab"] == 3 and not r["out"], r)
        r = js(setup + "s.rov.lat=s.lat+0.06/60; s.rov.lon=s.lon; s.rov.depth=s.depth-8; const x=sim.rovAuto(); let n=0; while(s.rov && s.rov.auto && n<5000){ sim.step(1); n++; } return {home:s.rov.home, nm:+(Math.hypot((s.rov.lat-s.lat)*60,(s.rov.lon-s.lon)*60*Math.cos(s.lat*Math.PI/180))).toFixed(3), dd:Math.abs(s.rov.depth-Math.min(s.depth,(R.rovFloor()!=null?R.rovFloor()-0.5:1e9)))<1.5}")
        check("auto return from 0.06 nm still closes up alongside and matches depth", r["home"] and r["nm"] <= 0.03 and r["dd"], r)
        r = js(setup + "const g=sim.rovGo({lat:s.rov.lat+0.1/60,lon:s.rov.lon,name:'mark'}); s.rov.heading=200; let n=0; while(s.rov.go && n<4000){ sim.step(1); n++; } const d=Math.hypot((s.rov.lat-(s.lat+0.1/60))*60,(s.rov.lon-s.lon)*60*Math.cos(s.lat*Math.PI/180)); return {g, arrived:!s.rov.go, d:+d.toFixed(3), thr:s.rov.thrSet||0}")
        check("Go to drives her to the mark and stops there", r["g"]["ok"] and r["arrived"] and r["d"] <= 0.035, r)
        r = js(setup + "sim.rovSpeed(0.5); sim.rovYaw(90); sim.rovDepth(-10); s.rov.heading=0; const lat0=s.rov.lat, lon0=s.rov.lon, d0=s.rov.depth; for(let i=0;i<30;i++) sim.step(1); return {hdg:Math.round(s.rov.heading), moved:Math.hypot(s.rov.lat-lat0, s.rov.lon-lon0)>0, dd:Math.round(s.rov.depth-d0), thr:s.rov.thrSet}")
        check("set speed, yaw and depth: she turns to the heading, holds the speed and rises 10 m", r["hdg"] == 90 and r["moved"] and r["dd"] == -10 and r["thr"] == 0.5, r)
        r = js("const s=sim.s; sim.rovStop(); return {thr:s.rov.thrSet, h:s.rov.hdgTo, d:s.rov.depTo}")
        check("Stop clears speed, heading and depth targets", r["thr"] == 0 and r["h"] is None and r["d"] is None, r)
        r = js(setup + "const w=s.pois.find(p=>p.type==='wreck'); if(!w) return {nowreck:true}; const before=sc.samples().length; const c1=sim.rovUse('collector'); let n=0; while(s.rov.job&&n<3000){sim.step(1);n++;} Object.assign(s,{lat:w.lat,lon:w.lon}); s.rov.lat=w.lat; s.rov.lon=w.lon; const m=sim.rovUse('magnetometer'); n=0; while(s.rov.job&&n<3000){sim.step(1);n++;} return {c1, m, lab:sc.samples().length-before, cargo:s.rov.cargo.length}")
        check("a magnetometer reading goes live to the lab; a physical sample stays aboard", r.get("nowreck") or (r["m"]["ok"] and r["lab"] == 1 and r["cargo"] == 1), r)
        r = js("const s=sim.s; const lab0=sc.samples().length; const x=sim.recoverRov(false); const B=await import('./js/bayops.js'); return {x:x.cargo.length, lab:sc.samples().length-lab0, out:!!s.rov}")
        check("recovering without delivery holds the cargo until the bay unloads it", r["x"] == 1 and r["lab"] == 0 and not r["out"], r)
        r = js(setup + "s.rov.lat=s.lat+0.9/60; s.rov.lon=s.lon; sim.rovAuto(); const t0=s.clock; let n=0; while(s.rov && s.rov.auto && n<40000){ sim.step(5); n++; } const mins=(s.clock-t0)/60; return {mins:Math.round(mins), home:s.rov.home}")
        check("the drive home takes real time at her 2 knots (0.9 nm, inside the tether: about 27 min)", r["home"] and 20 <= r["mins"] <= 40, r)
        r = js(setup + "s.rov.lat=s.lat+0.5/60; s.rov.lon=s.lon; return 1")
        page.evaluate("window.__aq.open('remora')"); page.wait_for_timeout(600)
        r = page.evaluate("(()=>{const b=document.querySelector('#station .tether'); return b && !b.hidden ? {txt:b.innerText, w:b.querySelector('.tt-fill').style.width} : null})()")
        check("the Remora page shows how much tether is out (0.5 of 1.0 nm: half)", r and "0.50 of 1.0" in r["txt"] and r["w"] == "50%", r)
        page.evaluate("window.__aq.open('bay')"); page.wait_for_timeout(600)
        r = page.evaluate("(()=>{const g=[...document.querySelectorAll('#station .gz')].find(x=>x.innerText.includes('TETHER')); return g ? {txt:g.innerText, w:g.querySelector('.gz-bar i').style.width} : null})()")
        check("the Launch Bay page shows it on Remora's card (a TETHER line, half full)", r and "0.50 / 1 nm" in r["txt"] and r["w"] == "50%", r)
        # tools that can take nothing at this spot are not shown; at Mystic Reef the spectrometer is
        js(setup + "s.rov.lat=s.lat; s.rov.lon=s.lon; s.rov.depth=5; return 1")
        page.evaluate("window.__aq.open('remora')"); page.wait_for_timeout(500)
        vis = lambda: page.evaluate("[...document.querySelectorAll('#station button.btn.chip')].filter(b=>!b.hidden && ['Sample collector','Core drill','Laser sampler','Spectrometer','Magnetometer'].includes(b.textContent)).map(b=>b.textContent)")
        v = vis()
        check("Remora has only a sample collector and a core drill; at the reef just the collector shows", v == ["Sample collector"], v)
        js("const s=sim.s; s.rov.lat=s.lat+0.5/60; s.rov.lon=s.lon; return 1"); page.wait_for_timeout(800)   # open water, inside the tether (past it, the tether parts)
        v = vis()
        check("in open water the collector shows (a water sample), the drill does not", v == ["Sample collector"], v)
        # the survey mission: a sample counts when Remora brings it home
        r = js("const m=(await import('../game/systems/missionManager.js')).default; const g=(await import('./js/persist.js')).gameState; const reef=sim.s.pois.find(p=>p.type==='reef'); const s=sim.s; s.rov.lat=reef.lat; s.rov.lon=reef.lon; s.rov.depth=5; s.lat=reef.lat+0.01; s.lon=reef.lon; sim.rovUse('collector'); let n=0; while(s.rov.job&&n<999){sim.step(1);n++} const before=(g.getProperty('mission.science.stats')||{}).water_mystic_reef||0; s.rov.lat=s.lat; s.rov.lon=s.lon; sim.recoverRov(); return {before, after:(g.getProperty('mission.science.stats')||{}).water_mystic_reef||0}")
        check("a reef water sample counts for the survey once she is home", r["after"] == r["before"] + 1, r)
        check("no page errors", not errors, errors)
        browser.close()
    server.shutdown()
    print("\nAll checks passed." if not fails else f"\n{len(fails)} FAILED: {fails}")
    sys.exit(1 if fails else 0)
main()
