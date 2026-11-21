#!/usr/bin/env python3
"""World places: factions, markers, comms contacts, sea-floor under each site.  python3 tools/world_test.py"""
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
        js = lambda code: page.evaluate("(async()=>{const sim=(await import('./js/sim.js')).sim;const cmod=await import('./js/commsModel.js');const sf=(await import('./js/seafloor.js')).seafloor;" + code + "})()")
        page.goto(base); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000)
        page.tap("#board-btn"); page.wait_for_timeout(800)
        if page.is_visible(".modal .btn"): page.tap(".modal .btn"); page.wait_for_timeout(300)
        r = js("return {n: sim.s.pois.length, first: sim.s.pois.slice(0,10).map(p=>p.name), ids: sim.s.pois.every((p,i)=>p.id===i), fac: Object.keys(sim.world.factions).length}")
        check("older places keep their ids and the new ones are added", r["n"] >= 33 and r["ids"] and r["first"][0].startswith("Woods Hole"), r)
        check("factions loaded", r["fac"] >= 10, r)
        r = js("""const c=await cmod.loadContacts(); const pl=sim.s.pois.filter(p=>p.mhz); const seen=new Set(); let dup=0; for(const x of c){ const k=x.band+x.mhz; if(seen.has(k)) dup++; seen.add(k);} return {n:c.length, places:pl.length, withContact:pl.filter(p=>c.some(x=>x.id==='place-'+p.id)).length, dup}""")
        check("every inhabited place has a comms contact", r["places"] >= 10 and r["places"] == r["withContact"], r)
        check("no two contacts share a frequency", r["dup"] == 0, r)
        # Titanic and Andrea Doria sit in the known hole in the chart (40-45N, 70-65W) until that tile is exported
        r = js("return sim.s.pois.filter(p=>{ if(p.lat>42.4||p.lat<30||p.lon>0||p.lon<-74.63) return false; const d=sf.depthAt(p.lat,p.lon); return p.type!=='dock' && (d==null || d<=0)}).map(p=>p.name+':'+sf.depthAt(p.lat,p.lon))")
        check("sites inside the chart sit over water", set(x.split(':')[0] for x in r) <= {'Titanic Wreck Site', 'Andrea Doria'}, r)
        page.evaluate("window.__aq.open('nav')"); page.wait_for_timeout(600)
        page.screenshot(path=os.path.join(ROOT, "tools", "shots", "world_nav.png"))
        check("no page errors", not errors, errors[:3])
        browser.close()
    server.shutdown()
    print("FAILED: " + ", ".join(fails) if fails else "all ok"); sys.exit(1 if fails else 0)
main()
