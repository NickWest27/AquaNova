#!/usr/bin/env python3
"""Hug the floor keeps its height off the floor on a steep slope, climbing and diving.  python3 tools/hug_hold_test.py"""
import os, sys, importlib.util
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location("smoke", os.path.join(ROOT, "tools", "smoke.py")); smoke = importlib.util.module_from_spec(spec); spec.loader.exec_module(smoke)
fails = []
def check(name, ok, extra=""):
    print(("ok   " if ok else "FAIL ") + name + (f"  {extra}" if extra and not ok else ""))
    if not ok: fails.append(name)
RUN = """async([lat, lon, hdg])=>{const sim=(await import('./js/sim.js')).sim;const sf=(await import('./js/seafloor.js')).seafloor; const s=sim.s;
  const f0=sf.depthAt(lat,lon); Object.assign(s,{docked:false,lat,lon,heading:hdg,targetHeading:hdg,throttle:0.6,wpt:null,route:[],depth:Math.max(5,f0-40),targetDepth:Math.max(5,f0-40),autoAvoid:true,cruise:false,speed:8});
  sim.step(1); const ok=sim.setHug(true).ok; let worst=0, n=0, lo=999, drop=0; const f1=f0;
  for(let i=0;i<1500;i++){ sim.step(1); if(!s.hug) break; const f=sf.depthAt(s.lat,s.lon); const alt=f-s.depth; if(i>120){ n++; worst=Math.max(worst,Math.abs(alt-10)); lo=Math.min(lo,alt); } }
  return {ok, worst, lo, n, floorChange: Math.abs(sf.depthAt(s.lat,s.lon)-f1), hug:s.hug}}"""
def main():
    server, site = smoke.start_server(); base = f"http://127.0.0.1:{server.server_address[1]}/AquaNova/tablet/"
    with sync_playwright() as p:
        b = smoke.launch(p); page = b.new_context(viewport={"width": 1180, "height": 820}, has_touch=True).new_page(); errors = []
        page.on("pageerror", lambda e: errors.append(str(e)[:200]))
        page.goto(base); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000); page.tap("#board-btn"); page.wait_for_timeout(800)
        if page.is_visible(".modal .btn"): page.tap(".modal .btn"); page.wait_for_timeout(300)
        page.wait_for_function("(async()=>{const sf=(await import('./js/seafloor.js')).seafloor; return sf.ready})()", timeout=30000)
        for name, args in (("climbing a slope", [39, -61.2, 90]), ("diving off a slope", [39, -61.0, 270])):
            r = page.evaluate(RUN, args); print("    ", name, r)
            check(f"hug: {name}: starts", r["ok"] and r["n"] > 100, r)
            check(f"hug: {name}: height off the floor stays near 10 m (never under 7, never over 22, even on a cliff steeper than the ship can climb)", r["worst"] <= 12 and r["lo"] >= 7, r)
            check(f"hug: {name}: the floor really changed", r["floorChange"] > 150, r)
        check("no page errors", not errors, errors[:2]); b.close()
    server.shutdown(); print("all ok" if not fails else "FAILED: " + ", ".join(fails)); sys.exit(1 if fails else 0)
main()
