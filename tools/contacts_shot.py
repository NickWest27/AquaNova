#!/usr/bin/env python3
"""Screenshot the nav plot with traffic: AIS ship, unknown bearing line, a fix.  python3 tools/contacts_shot.py"""
import os, sys, importlib.util
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location("smoke", os.path.join(ROOT, "tools", "smoke.py")); smoke = importlib.util.module_from_spec(spec); spec.loader.exec_module(smoke)
server, site = smoke.start_server(); base = f"http://127.0.0.1:{server.server_address[1]}/AquaNova/tablet/"
with sync_playwright() as p:
    b = smoke.launch(p); page = b.new_context(viewport={"width": 1366, "height": 1024}, has_touch=True).new_page()
    page.goto(base); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000); page.tap("#board-btn"); page.wait_for_timeout(800)
    if page.is_visible(".modal .btn"): page.tap(".modal .btn"); page.wait_for_timeout(300)
    page.wait_for_function("(async()=>{const sf=(await import('./js/seafloor.js')).seafloor; return sf.ready})()", timeout=30000)
    page.evaluate("""(async()=>{const sim=(await import('./js/sim.js')).sim;const tr=await import('./js/traffic.js');const g=(await import('./js/persist.js')).gameState;
      g.updateProperty('world.seed',99); tr.traffic.cells.clear(); Object.assign(sim.s,{docked:false,speed:0,depth:60,sonar:true,at:null,wskrs:[]});
      let a=null,n=null;
      for(let k=0;k<900&&!(a&&n);k++){ sim.s.lat=39.8+(k%30)*0.05; sim.s.lon=-58-Math.floor(k/30)*0.12; tr.traffic.candKey=''; sim.s.clock=k*97; tr.step();
        a=a||tr.traffic.cand.find(x=>x.ais&&x.size>=1); n=n||tr.traffic.cand.find(x=>!x.ais&&x.size>=1); if(a&&n){ const pa=tr.posAt(a,sim.s.clock), pn=tr.posAt(n,sim.s.clock); if(Math.hypot((pa.lat-pn.lat)*60,(pa.lon-pn.lon)*46)>12){ if(!window.__keep) window.__keep=1; else {} } } }
      tr.gates.ais=()=>true; const pa=tr.posAt(a,sim.s.clock); Object.assign(sim.s,{lat:pa.lat-0.04,lon:pa.lon-0.03,heading:0});
      // put the unknown ship 3 nm from us and a WSKR 2 nm away from it so the pair make a fix
      n.dyn={lat:sim.s.lat+0.03,lon:sim.s.lon+0.05,hdg:75}; sim.wskrLink=()=>({raw:true}); sim.s.wskrs=[{id:1,n:1,dead:false,arrived:false,lat:sim.s.lat+0.07,lon:sim.s.lon-0.02}];
      tr.traffic.candKey=''; tr.step(); window.__t=tr.traffic.active.map(x=>[x.v.name,!!x.pos,x.ais,x.lines.length]); })()""")
    page.evaluate("window.__aq.open('nav')"); page.wait_for_timeout(600)
    for _ in range(2): page.locator('button:text-is("+"):visible').first.tap(timeout=3000)
    page.wait_for_timeout(1200); print(page.evaluate('window.__t')); page.screenshot(path=os.path.join(ROOT, "tools", "shots", "contacts.png"))
    b.close()
server.shutdown()
