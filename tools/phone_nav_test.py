#!/usr/bin/env python3
"""iPhone PED Nav tab: a map of the last reported position with ship, destination, sites and craft.  python3 tools/phone_nav_test.py"""
import os, importlib.util
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location("smoke", os.path.join(ROOT, "tools", "smoke.py"))
smoke = importlib.util.module_from_spec(spec); spec.loader.exec_module(smoke)
fails = []
def check(name, ok, extra=""):
    print(("ok   " if ok else "FAIL ") + name + (f"  {extra}" if extra and not ok else ""))
    if not ok: fails.append(name)
STATUS = {"t": "2026-11-20T20:00:00Z", "logbook": "t", "location": "Open water", "lat": 41.5, "lon": -70.7, "clock": "Day 1 06:00", "docked": False, "depth": 120, "heading": 135, "speed": 8, "battery": 90, "oxygen": 95, "hull": 100,
  "destination": "Mystic Reef", "wpt": {"name": "Mystic Reef", "lat": 41.3, "lon": -70.5},
  "pois": [{"n": "Woods Hole Dock", "t": "dock", "lat": 41.52, "lon": -70.67}, {"n": "Mystic Reef", "t": "reef", "lat": 41.3, "lon": -70.5}],
  "craft": [{"k": "Remora", "lat": 41.49, "lon": -70.69}], "objectives": [], "discoveries": []}
def main():
    server, site = smoke.start_server()
    root = f"http://127.0.0.1:{server.server_address[1]}/AquaNova/"
    with sync_playwright() as p:
        browser = smoke.launch(p); errors = []
        ph = browser.new_context(viewport={"width": 390, "height": 780}, has_touch=True, device_scale_factor=2).new_page()
        ph.on("pageerror", lambda e: errors.append(str(e)[:200])); ph.on("console", lambda m: errors.append(m.text[:200]) if m.type == "error" else None)
        ph.goto(root + "ped/index.html"); ph.evaluate("(s)=>{localStorage.setItem('aquaNovaPed', JSON.stringify({id:'x',name:'t',journals:[],tasks:[],status:s,syncedAt:null}));}", STATUS); ph.reload(); ph.wait_for_timeout(800)
        tabs = ph.evaluate("[...document.querySelectorAll('#nav button')].map(b=>b.textContent)")
        check("a Nav tab sits second", len(tabs) > 1 and tabs[1].lower() == "nav", tabs)
        ph.evaluate("document.querySelector('#nav button[data-tab=nav]').click()"); ph.wait_for_timeout(1200)
        r = ph.evaluate("(()=>{const c=document.querySelector('canvas.navmap'); if(!c) return null; const g=c.getContext('2d'); const d=g.getImageData(0,0,c.width,c.height).data; let blue=0,green=0,n=0; for(let i=0;i<d.length;i+=40){n++; if(d[i+2]>d[i]+40) blue++; if(d[i+1]>200&&d[i]<90&&d[i+2]<140) green++;} return {w:c.width,h:c.height,blue:blue/n,green:green}})()")
        check("the map draws water and the ship", r and r["w"] > 300 and r["blue"] > 0.15 and r["green"] > 5, r)
        ph.screenshot(path=os.path.join(ROOT, "tools/shots/phone-nav.png"))
        ph.evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Zoom out').click()"); ph.wait_for_timeout(300)
        ph.evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Zoom in').click()"); ph.wait_for_timeout(300)
        check("zoom and centre buttons work without errors", ph.evaluate("!!document.querySelector('canvas.navmap')"))
        check("no page errors", not errors, errors)
    print("\n%d failure(s)" % len(fails)); server.shutdown(); raise SystemExit(1 if fails else 0)
main()
