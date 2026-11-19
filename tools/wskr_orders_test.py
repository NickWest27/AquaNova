#!/usr/bin/env python3
"""WSKR orders: manual control with link range, search pattern, relay, depth, formation, gating, save/load.  python3 tools/wskr_orders_test.py"""
import os, sys, importlib.util
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location("smoke", os.path.join(ROOT, "tools", "smoke.py"))
smoke = importlib.util.module_from_spec(spec); spec.loader.exec_module(smoke)
SHOTS = os.path.join(ROOT, "tools", "shots")
fails = []
def check(name, ok, extra=""):
    print(("ok   " if ok else "FAIL ") + name + (f"  {extra}" if extra and not ok else ""))
    if not ok: fails.append(name)
def main():
    server, site = smoke.start_server()
    for gated in (False, True):
        base = f"http://127.0.0.1:{server.server_address[1]}/AquaNova/tablet/{'?locked=1' if gated else ''}"
        with sync_playwright() as p:
            browser = smoke.launch(p)
            page = browser.new_context(viewport={"width": 1180, "height": 820}, has_touch=True).new_page(); errors = []
            page.on("pageerror", lambda e: errors.append(str(e)[:200]))
            page.on("console", lambda m: errors.append(m.text[:200]) if m.type == "error" else None)
            js = lambda code: page.evaluate("(async()=>{const sim=(await import('./js/sim.js')).sim;const T=await import('./js/sim.js');" + code + "})()")
            page.goto(base); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000)
            page.tap("#board-btn"); page.wait_for_timeout(800)
            if page.is_visible(".modal .btn"): page.tap(".modal .btn"); page.wait_for_timeout(300)
            js("const s=sim.s; const c=s.pois.find(p=>p.name==='Canyon Head'); Object.assign(s,{lat:c.lat,lon:c.lon,wskrs:[],rov:null,docked:false,wpt:null,speed:0,throttle:0,depth:20,targetDepth:20,heading:90,targetHeading:90}); sim.deployWskr(); sim.deployWskr(); for(let i=0;i<300;i++) sim.step(0.1); return 1")
            if gated: js("const g=(await import('./js/persist.js')).gameState; g.updateProperty('progress.stationsUnlocked',['sensors','wskr']); return 1")
            js("window.__aq.open('sensors'); return 1"); page.wait_for_timeout(600)
            page.locator("#station .tabs .btn", has_text="WSKRs").tap(); page.wait_for_timeout(700)
            txt = page.inner_text("#station")
            check("WSKRs tab shows the status of each WSKR", "Scout" in txt and "Lantern" in txt and "Battery" in txt and "Depth" in txt and "Link" in txt, txt[:200])
            if gated:
                check("gated: orders locked until researched", page.locator("#station .wo .btn", has_text="Manual control").is_disabled())
                js("const g=(await import('./js/persist.js')).gameState; const s=g.getProperty('mission.science')||{}; g.updateProperty('mission.science',{...s,done:[...(s.done||[]),'wskr-orders']}); return 1"); page.wait_for_timeout(1200)
                check("gated: orders unlock with the research", not page.locator("#station .wo .btn", has_text="Manual control").is_disabled())
            page.locator("#station .wsk-row", has_text="Lantern").tap(); page.wait_for_timeout(400)
            check("selecting a WSKR shows its controls", "Lantern" in page.inner_text("#station .wo") and page.locator("#station .wo .btn", has_text="Search pattern").is_visible())
            page.locator("#station .wsk-row", has_text="Scout").tap(); page.wait_for_timeout(300)
            page.locator("#station .wo .btn", has_text="Manual control").tap(); page.wait_for_timeout(500)
            check("manual helm shown", page.locator("#station .wo-helm .btn", has_text="Faster").is_visible())
            page.locator("#station .wo-helm .btn", has_text="Faster").tap(); page.locator("#station .wo-helm .btn", has_text="Faster").tap()
            r = js("const w=sim.s.wskrs[0]; return {mode:w.mode, thr:w.thr}")
            check("manual mode and throttle", r["mode"] == "manual" and r["thr"] == 0.5, r)
            r = js("const w=sim.s.wskrs[0]; const h0=w.heading, p0={lat:w.lat,lon:w.lon}; sim.wskrHelm(w.n,{turn:1}); for(let i=0;i<20;i++) sim.step(0.1); sim.wskrHelm(w.n,{turn:0}); const d=T.toward(p0,w).nm; return {turned:(((w.heading-h0)%360)+360)%360, moved:d}")
            check("manual turns and moves", r["turned"] > 30 and r["moved"] > 0.01, r)
            r = js("const w=sim.s.wskrs[0]; w.heading=0; sim.wskrHelm(w.n,{thr:1,turn:0}); for(let i=0;i<4000;i++) sim.step(0.1); const l=sim.wskrLink(w); return {nm:l.nm, limited:w.limited, blocked:w.blockedNow, thr:w.thr}")
            check("manual stops at the link limit or the shallows", r["nm"] <= 3.05 and (r["limited"] or r["blocked"]), r)
            # relay: follows the ship, sits just under the surface, carries comms and GPS when the ship is deep
            r = js("const s=sim.s; s.wskrs.forEach(w=>{w.bat=100;w.dead=false}); sim.orderWskr(1,'escort'); sim.orderWskr(2,'escort'); s.depth=300; s.targetDepth=300; const before=sim.hasGps(); const res=sim.setupRelay(); s.heading=0; s.targetHeading=0; s.speed=0; for(let i=0;i<3000;i++) sim.step(0.1); const w=s.wskrs.find(q=>q.mode==='relay'); const cm=await import('./js/commsModel.js'); return {before, ok:res.ok, near:w?T.toward(s,w).nm:null, d:w?T.wskrDepthFor(w):null, up:sim.relayUp(), gps:sim.hasGps(), ant:cm.antDepth('buoy')}")
            check("relay follows the ship and gives comms and GPS at depth", (not r["before"]) and r["ok"] and r["near"] is not None and r["near"] < 0.3 and r["d"] <= 4 and r["up"] and r["gps"] and r["ant"] == 0, r)
            r = js("const s=sim.s; const res=sim.setupRelay(); const sd=sim.standDownRelay(); return {again:res.why, sd:sd.ok, up:sim.relayUp()}")
            check("a second relay is refused; stand down works", r["again"] == "already" and r["sd"] and not r["up"], r)
            js("sim.s.depth=20; sim.s.targetDepth=20; return 1")
            # search pattern
            r = js("const s=sim.s, a=s.wskrs[0]; s.wskrs.forEach(w=>{w.bat=100;w.dead=false}); sim.orderWskr(a.n,'search'); const c={lat:a.lat,lon:a.lon}; let far=0; for(let i=0;i<30000&&a.mode==='search'&&a.bat>20;i++){ sim.step(0.1); far=Math.max(far,T.toward(c,a).nm);} return {mode:a.mode, far, k:a.pat&&a.pat.k}")
            check("search pattern spreads out then rejoins", r["far"] > 0.5 and r["mode"] in ("escort", "search", "recall"), r)
            # depth: staggered, one layer each
            r = js("const s=sim.s; s.depth=100; sim.orderWskr(1,'escort'); sim.orderWskr(2,'escort'); const out={}; for(const k of ['auto','shallow','deep']){ sim.setWskrDepth(k); out[k]=s.wskrs.map(w=>T.wskrDepthFor(w)); } sim.setWskrDepth('auto'); s.depth=20; return out")
            ok = all(len(set(v)) == len(v) for v in r.values()) and max(r["shallow"]) <= 112 and all(r["shallow"][i] <= r["auto"][i] <= r["deep"][i] + 0.5 for i in range(len(r["auto"])))
            check("depth settings stagger the WSKRs (shallow above, deep below the ship)", ok, r)
            # formation: ring overlap sets the spacing
            r = js("const s=sim.s; sim.setWskrForm('tight'); const t=T.formationRadius('tight',4); const l=T.formationRadius('loose',4); sim.setWskrForm('loose'); return {t,l, d5:T.ringSpacing(0.05), d50:T.ringSpacing(0.5)}")
            check("tight overlaps 50% of the scan ring, loose 5%", abs(r["d50"] - 0.8079) < 0.01 and r["d5"] > 1.6 and r["t"] < r["l"], r)
            r = js("const s=sim.s; s.wskrs.forEach(w=>{w.bat=100;w.dead=false}); for(const w of s.wskrs) w.mode='recall'; sim.s.wskrs.forEach(w=>sim.orderWskr(w.n,'escort')); sim.setWskrForm('tight'); for(let i=0;i<4000;i++) sim.step(0.1); const d=s.wskrs.map(w=>T.toward(s,w).nm); sim.setWskrForm('loose'); return {max:Math.max(...d), want:T.formationRadius('tight',s.wskrs.length)}")
            check("WSKRs hold the tight ring", r["max"] < r["want"] * 1.6 + 0.3, r)
            # battery: 6 hours, low charge recalls, flat battery leaves it adrift
            r = js("const s=sim.s; const w=s.wskrs[0]; w.bat=100; sim.orderWskr(w.n,'escort'); const c0=s.clock; for(let i=0;i<200;i++) sim.step(0.1); const used=100-w.bat; const hours=(100/ (used/((s.clock-c0)/3600)));  return {used, hours, clock:s.clock-c0}")
            check("battery lasts about 6 hours", 4.5 < r["hours"] < 8, r)
            r = js("const s=sim.s; const w=s.wskrs[0]; w.bat=15.1; sim.orderWskr(w.n,'escort'); for(let i=0;i<300;i++) sim.step(0.1); return {mode:w.mode, bat:w.bat}")
            check("low battery recalls the WSKR", r["mode"] == "recall", r)
            r = js("const s=sim.s; const w=s.wskrs[1]; w.bat=0.01; sim.orderWskr(w.n,'escort'); for(let i=0;i<60;i++) sim.step(0.1); const dead=w.dead; const n=s.wskrs.length; w.lat=s.lat; w.lon=s.lon; for(let i=0;i<5;i++) sim.step(0.1); return {dead, n, after:s.wskrs.length}")
            check("flat battery leaves it adrift until the ship comes alongside", r["dead"] and r["after"] == r["n"] - 1, r)
            # the communicator order
            js("const s=sim.s; s.wskrs=[]; sim.deployWskr(); sim.deployWskr(); s.depth=20; return 1")
            # save/load keeps orders
            js("sim.orderWskr(1,'relay'); sim.setWskrDepth('deep'); sim.setWskrForm('tight'); sim.s.wskrs[0].bat=42; const P=await import('./js/persist.js'); P.snapshotSim(); return 1")
            r = js("const P=await import('./js/persist.js'); const nav=P.gameState.getProperty('navigation'); return {form:nav.wskrForm, dep:nav.wskrDepth, w:(nav.wskrs||[]).map(w=>[w.n,w.mode,w.bat])}")
            check("orders, depth, formation and battery are saved", r["form"] == "tight" and r["dep"] == "deep" and r["w"][0][1] == "relay" and abs(r["w"][0][2] - 42) < 1, r)
            js("sim.setWskrForm('loose'); sim.setWskrDepth('auto'); sim.orderWskr(1,'manual'); return 1"); page.wait_for_timeout(600)
            page.screenshot(path=f"{SHOTS}/wskr-orders{'-gated' if gated else ''}.png")
            check("no page errors", not errors, errors[:3])
            browser.close()
    print("\n%d failure(s)" % len(fails)); sys.exit(1 if fails else 0)
main()
