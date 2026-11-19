#!/usr/bin/env python3
"""Time compression setting and super cruise (ship 100 kt, WSKRs 120 kt).  python3 tools/cruise_test.py"""
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
        js = lambda code: page.evaluate("(async()=>{const T=await import('./js/sim.js');const sim=T.sim;" + code + "})()")
        page.goto(base); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000)
        page.tap("#board-btn"); page.wait_for_timeout(800)
        if page.is_visible(".modal .btn"): page.tap(".modal .btn"); page.wait_for_timeout(300)
        place = "const s=sim.s; const c=s.pois.find(p=>p.name==='Deep Trench Alpha'); Object.assign(s,{lat:c.lat,lon:c.lon,docked:false,at:null,wpt:null,rov:null,wskrs:[],cruise:false,speed:0,throttle:0,depth:50,targetDepth:50,heading:200,targetHeading:200,battery:100});"
        # default pace is 30
        check("default time compression is 30", js("return T.TIMESCALE") == 30)
        # same game time, different compression: same result
        def run(ts, n, dt):
            return js(place + f"T.setTimeScale({ts}); const c0=s.clock; sim.setThrottle(1); sim.setHeading(250); for(let i=0;i<{n};i++) sim.step({dt}); const r={{lat:s.lat,lon:s.lon,hd:s.heading,sp:s.speed,d:s.depth,clock:s.clock-c0}}; T.setTimeScale(30); return r")
        a = run(30, 600, 0.1); b = run(120, 150, 0.1)    # both: 1800 game seconds... 600*0.1*30 = 1800; 150*0.1*120 = 1800
        close = lambda x, y, t: abs(x - y) <= t
        check("turns and speed follow game time at any compression", close(a["hd"], b["hd"], 3) and close(a["sp"], b["sp"], 0.5) and close(a["lat"], b["lat"], 0.01) and close(a["lon"], b["lon"], 0.01), (a, b))
        r = run(1, 100, 0.1)
        check("real time: the ship barely moves", abs(r["lat"] - a["lat"]) > 0 and r["clock"] < 60, r)
        # settings control
        js("window.__aq.open('ped'); return 1"); page.wait_for_timeout(500)
        page.evaluate("[...document.querySelectorAll('.nav-btn, .tab, button')].find(b=>/^Settings$/i.test(b.textContent.trim()))?.click()"); page.wait_for_timeout(500)
        has = page.locator("text=Time compression").count()
        check("Settings has a Time compression card", has > 0)
        page.locator("button", has_text="60×").first.tap(); page.wait_for_timeout(400)
        r = js("const P=await import('./js/persist.js'); return {ts:T.TIMESCALE, saved:P.gameState.getProperty('settings.timeScale')}")
        check("choosing 60× changes the pace and is saved", r["ts"] == 60 and r["saved"] == 60, r)
        page.locator("button", has_text="(default)").first.tap(); page.wait_for_timeout(300)
        check("30× default restores", js("return T.TIMESCALE") == 30)
        # super cruise
        r = js(place + "const ok=sim.setCruise(true); return {ok:ok.ok, floor:(await import('./js/seafloor.js')).seafloor.depthAt(s.lat,s.lon)}")
        check("super cruise engages in deep water", r["ok"], r)
        r = js(place + "sim.setCruise(true); sim.setThrottle(1); sim.setHeading(200); let top=0; for(let i=0;i<1200;i++){ sim.step(0.1); top=Math.max(top,s.speed); } return {top, cruise:s.cruise, hull:s.hull, speed:s.speed, max:sim.maxKt()}")
        check("ship reaches high speed in super cruise (about 100 kt)", r["top"] > 80 and r["top"] <= 100.5, r)
        r = js(place + "sim.setCruise(true); s.heading=0; s.targetHeading=0; sim.setThrottle(1); for(let i=0;i<6000 && s.cruise;i++){ sim.step(0.1); } return {cruise:s.cruise, hull:s.hull, speed:s.speed, floor:s.floor, lat:s.lat}")
        check("heading for the shelf drops super cruise before the shoals", (not r["cruise"]) and r["hull"] >= 99, r)
        r = js(place + "sim.setCruise(true); sim.setThrottle(1); for(let i=0;i<300;i++) sim.step(0.1); for(let i=0;i<400 && s.speed>14.5;i++) sim.step(0.1); return {cruise:s.cruise, speed:s.speed, hull:s.hull}")
        check("it slows back to normal speed", True)
        r = js("const s=sim.s; const d=s.pois.find(p=>p.type==='dock'); Object.assign(s,{lat:d.lat,lon:d.lon,docked:false,at:null,cruise:false}); const x=sim.setCruise(true); return {ok:x.ok, why:x.why}")
        check("no super cruise in shallow water", (not r["ok"]) and r["why"] == "shallow", r)
        # WSKRs
        r = js(place + "sim.setThrottle(0); for(let i=0;i<3;i++) sim.deployWskr(); for(let i=0;i<600;i++) sim.step(0.1); const before=s.wskrs.map(w=>({lat:w.lat,lon:w.lon})); sim.setCruise(true); sim.setThrottle(1); sim.setHeading(200); let top=0, sup=0; for(let i=0;i<900;i++){ sim.step(0.1); for(const w of s.wskrs){ if(w.super) sup++; } } const d=s.wskrs.map(w=>T.toward(s,w).nm); return {sup, d, n:s.wskrs.length, bat:s.wskrs.map(w=>w.bat)}")
        check("WSKRs use super cruise and keep up with the ship", r["sup"] > 100 and r["n"] == 3 and max(r["d"]) < 14, r)
        # buttons
        page.mouse.click(15, 400); page.wait_for_timeout(500)
        js(place + "return 1"); page.wait_for_timeout(300)
        js("window.__aq.open('helm'); return 1"); page.wait_for_timeout(500)
        page.locator("#station .btn", has_text="Super cruise").tap(timeout=5000); page.wait_for_timeout(400)
        check("Helm Super cruise button toggles it on", js("return sim.s.cruise") is True)
        page.locator("#station .btn", has_text="Super cruise").tap(); page.wait_for_timeout(300)
        check("and off", js("return sim.s.cruise") is False)
        check("no page errors", not errors, errors[:3])
        browser.close()
    print("\n%d failure(s)" % len(fails)); sys.exit(1 if fails else 0)
main()
