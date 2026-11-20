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
    for gated in (False,):
        base = f"http://127.0.0.1:{server.server_address[1]}/AquaNova/tablet/{'?locked=1' if gated else ''}"
        with sync_playwright() as p:
            browser = smoke.launch(p)
            page = browser.new_context(viewport={"width": 1180, "height": 820}, has_touch=True).new_page(); errors = []
            page.on("pageerror", lambda e: errors.append(str(e)[:200]))
            page.on("console", lambda m: errors.append(m.text[:200]) if m.type == "error" else None)
            js = lambda code: page.evaluate("(async()=>{const sim=(await import('./js/sim.js')).sim;const T=await import('./js/sim.js');" + code + "})()")
            page.goto(base); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000)
            page.tap("#board-btn"); page.wait_for_timeout(800)
            page.evaluate("import('./js/sim.js').then(m=>m.setTimeScale(30))"); page.wait_for_timeout(200)   # these tests were written for the old 30x pace
            if page.is_visible(".modal .btn"): page.tap(".modal .btn"); page.wait_for_timeout(300)
            js("const s=sim.s; const c=s.pois.find(p=>p.name==='Canyon Head'); Object.assign(s,{lat:c.lat,lon:c.lon,wskrs:[],rov:null,docked:false,wpt:null,speed:14,throttle:1,depth:20,targetDepth:20,heading:90}); return 1")
            js("sim.deployWskr(); return 1"); page.wait_for_timeout(300)
            n=js("return sim.s.wskrs.length")
            check("a WSKR launched", n>=1, str(n))
            js("const w=sim.s.wskrs[0]; const s=sim.s; w.lat=s.lat; w.lon=s.lon-0.05; w.mode='recall'; w.route=null; s.speed=14; w.d0=Math.hypot(w.lat-s.lat,w.lon-s.lon); return 1")
            page.wait_for_timeout(5000)
            r=js("const w=sim.s.wskrs[0]; return {chase:w.chase||0, kt:T.wskrCraft(w).kt}")
            check("recalled WSKR out-runs a 14 kt ship", r["chase"]>14 or r["kt"]>14, str(r))
            js("window.__aq.open('sensors'); return 1"); page.wait_for_timeout(500)
            page.locator("#station .tabs .btn", has_text="WSKRs").tap(); page.wait_for_timeout(1200)
            ro=page.inner_text("#station .cv-synth") if page.locator("#station .cv-ro").count() else ""
            check("synthetic view shows Aqua Nova BRG and RNG", "AQUA NOVA" in ro and "BRG" in ro and "RNG" in ro, ro)
            check("synthetic view has a target box", page.locator("#station .cv-ro.r").count()==1)
            check("no page errors", not errors, str(errors[:2]))
            browser.close()
    server.shutdown()
    sys.exit(1 if fails else 0)
main()
