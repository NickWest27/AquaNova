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
            js("window.__aq.open('wskr'); return 1"); page.wait_for_timeout(800)
            if gated:
                dis = page.locator("#station .wo .btn", has_text="Manual control").is_disabled()
                check("gated: orders locked until researched", dis)
                js("const sc=await import('./js/science.js'); const g=(await import('./js/persist.js')).gameState; const s=g.getProperty('mission.science')||{}; g.updateProperty('mission.science',{...s,done:[...(s.done||[]),'wskr-orders']}); return 1"); page.wait_for_timeout(1200)
                check("gated: orders unlock with the research", not page.locator("#station .wo .btn", has_text="Manual control").is_disabled())
            # manual control by touch
            page.locator("#station .wo .btn", has_text="Manual control").tap(); page.wait_for_timeout(500)
            check("manual helm shown", page.locator("#station .wo-helm .btn", has_text="Faster").is_visible())
            page.locator("#station .wo-helm .btn", has_text="Faster").tap(); page.locator("#station .wo-helm .btn", has_text="Faster").tap()
            r = js("const w=sim.s.wskrs[0]; return {mode:w.mode, thr:w.thr}")
            check("manual mode and throttle", r["mode"] == "manual" and r["thr"] == 0.5, r)
            r = js("const w=sim.s.wskrs[0]; const h0=w.heading, p0={lat:w.lat,lon:w.lon}; sim.wskrHelm(w.n,{turn:1}); for(let i=0;i<20;i++) sim.step(0.1); sim.wskrHelm(w.n,{turn:0}); const d=T.toward(p0,w).nm; return {turned:(((w.heading-h0)%360)+360)%360, moved:d}")
            check("manual turns and moves", r["turned"] > 30 and r["moved"] > 0.01, r)
            r = js("const w=sim.s.wskrs[0]; w.heading=0; sim.wskrHelm(w.n,{thr:1,turn:0}); for(let i=0;i<4000;i++) sim.step(0.1); const l=sim.wskrLink(w); return {nm:l.nm, limited:w.limited, blocked:w.blockedNow, thr:w.thr}")
            check("manual stops at the link limit or the shallows", r["nm"] <= 3.05 and (r["limited"] or r["blocked"]), r)
            # relay extends the link
            r = js("const a=sim.s.wskrs[0], b=sim.s.wskrs[1]; const before=sim.wskrLink(a,{lat:a.lat,lon:a.lon}).nm; b.lat=a.lat; b.lon=a.lon; sim.orderWskr(b.n,'relay'); const sc=sim.wskrLink(a,{lat:a.lat+0.04,lon:a.lon}); return {ok: sc.ok, nm:sc.nm, before}")
            check("relay counts as a link anchor", r["nm"] < 3.1, r)
            # search pattern
            r = js("const s=sim.s, a=s.wskrs[0]; sim.orderWskr(a.n,'search'); const c={lat:a.lat,lon:a.lon}; let far=0; for(let i=0;i<30000&&a.mode==='search';i++){ sim.step(0.1); far=Math.max(far,T.toward(c,a).nm);} return {mode:a.mode, far, k:a.pat&&a.pat.k}")
            check("search pattern spreads out then rejoins", r["far"] > 0.5 and r["mode"] in ("escort", "search"), r)
            # depth
            r = js("const w=sim.s.wskrs[0]; const f=(await import('./js/seafloor.js')).seafloor.depthAt(w.lat,w.lon); sim.setWskrDepth(w.n,'shallow'); const a=T.wskrCraft(w).depth; sim.setWskrDepth(w.n,'deep'); const b=T.wskrCraft(w).depth; sim.setWskrDepth(w.n,'auto'); const c=T.wskrCraft(w).depth; return {f,a,b,c}")
            check("shallow < auto <= deep", r["a"] < r["b"] and r["a"] <= r["c"] <= r["b"], r)
            # formation
            r = js("const s=sim.s; sim.orderWskr(1,'escort'); sim.orderWskr(2,'escort'); sim.setWskrForm('tight'); for(let i=0;i<9000;i++) sim.step(0.1); const d=s.wskrs.map(w=>T.toward(s,w).nm); sim.setWskrForm('loose'); return {max:Math.max(...d)}")
            check("tight formation stays close", r["max"] < 0.9, r)
            # save/load keeps orders
            js("sim.orderWskr(1,'relay'); sim.setWskrDepth(1,'deep'); sim.setWskrForm('tight'); const P=await import('./js/persist.js'); P.snapshotSim(); return 1")
            r = js("const P=await import('./js/persist.js'); const nav=P.gameState.getProperty('navigation'); return {form:nav.wskrForm, w:(nav.wskrs||[]).map(w=>[w.n,w.mode,w.dep])}")
            check("orders are saved", r["form"] == "tight" and ["1", "relay", "deep"] == [str(r["w"][0][0]), r["w"][0][1], r["w"][0][2]], r)
            js("sim.s.wskrForm='loose'; sim.orderWskr(1,'manual'); return 1"); page.wait_for_timeout(600)
            page.screenshot(path=f"{SHOTS}/wskr-orders{'-gated' if gated else ''}.png")
            check("no page errors", not errors, errors[:3])
            browser.close()
    print("\n%d failure(s)" % len(fails)); sys.exit(1 if fails else 0)
main()
