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
        r = js(setup + "const w=s.pois.find(p=>p.type==='wreck'); if(!w) return {nowreck:true}; const before=sc.samples().length; const c1=sim.rovUse('collector'); let n=0; while(s.rov.job&&n<3000){sim.step(1);n++;} Object.assign(s,{lat:w.lat,lon:w.lon}); s.rov.lat=w.lat; s.rov.lon=w.lon; const m=sim.rovUse('magnetometer'); n=0; while(s.rov.job&&n<3000){sim.step(1);n++;} return {c1, m, lab:sc.samples().length-before, cargo:s.rov.cargo.length}")
        check("a magnetometer reading goes live to the lab; a physical sample stays aboard", r.get("nowreck") or (r["m"]["ok"] and r["lab"] == 1 and r["cargo"] == 1), r)
        r = js("const s=sim.s; const lab0=sc.samples().length; const x=sim.recoverRov(false); const B=await import('./js/bayops.js'); return {x:x.cargo.length, lab:sc.samples().length-lab0, out:!!s.rov}")
        check("recovering without delivery holds the cargo until the bay unloads it", r["x"] == 1 and r["lab"] == 0 and not r["out"], r)
        r = js(setup + "s.rov.lat=s.lat+0.15; s.rov.lon=s.lon; sim.rovAuto(); const t0=s.clock; let n=0; while(s.rov && s.rov.auto && n<40000){ sim.step(5); n++; } const mins=(s.clock-t0)/60; return {mins:Math.round(mins), home:s.rov.home}")
        check("the drive home takes real time at her 2 knots (9 nm: about 4.5 h; here 9 nm north)", r["home"] and r["mins"] > 200, r)
        r = js(setup + "s.rov.lat=s.lat+0.5/60; s.rov.lon=s.lon; return 1")
        page.evaluate("window.__aq.open('remora')"); page.wait_for_timeout(600)
        r = page.evaluate("(()=>{const b=document.querySelector('#station .tether'); return b && !b.hidden ? {txt:b.innerText, w:b.querySelector('.tt-fill').style.width} : null})()")
        check("the Remora page shows how much tether is out (0.5 of 1.0 nm: half)", r and "0.50 of 1.0" in r["txt"] and r["w"] == "50%", r)
        page.evaluate("window.__aq.open('bay')"); page.wait_for_timeout(600)
        r = page.evaluate("(()=>{const b=document.querySelector('#station .tether'); return b && !b.hidden ? b.innerText : null})()")
        check("the Launch Bay page shows it on Remora's card", r and "0.50 of 1.0" in r, r)
        # tools that can take nothing at this spot are not shown; at Mystic Reef the spectrometer is
        js(setup + "s.rov.lat=s.lat; s.rov.lon=s.lon; s.rov.depth=5; return 1")
        page.evaluate("window.__aq.open('remora')"); page.wait_for_timeout(500)
        vis = lambda: page.evaluate("[...document.querySelectorAll('#station button.btn.chip')].filter(b=>!b.hidden && ['Sample collector','Core drill','Laser sampler','Spectrometer','Magnetometer'].includes(b.textContent)).map(b=>b.textContent)")
        v = vis()
        check("Remora has only a sample collector and a core drill; at the reef just the collector shows", v == ["Sample collector"], v)
        js("const s=sim.s; s.rov.lat=s.lat+0.2; s.rov.lon=s.lon; return 1"); page.wait_for_timeout(800)
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
