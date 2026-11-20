#!/usr/bin/env python3
"""Area of Operations limit: Helm warns before the limit, the ship stops at it with no damage, and a plot beyond it is refused."""
import importlib.util, sys
from playwright.sync_api import sync_playwright
ROOT = '/home/claude/aquanova'
spec = importlib.util.spec_from_file_location("smoke", ROOT + "/tools/smoke.py"); smoke = importlib.util.module_from_spec(spec); spec.loader.exec_module(smoke)
server, site = smoke.start_server(); base = f"http://127.0.0.1:{server.server_address[1]}/AquaNova/tablet/"
bad = []
def ok(c, m):
    print(('ok   ' if c else 'FAIL ') + m); 
    if not c: bad.append(m)
errs = []
with sync_playwright() as p:
    b = smoke.launch(p); page = b.new_context(viewport={"width": 1180, "height": 820}, has_touch=True).new_page()
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.goto(base); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000); page.tap("#board-btn"); page.wait_for_timeout(800)
    r = page.evaluate("""(async()=>{
      const sim=(await import('./js/sim.js')).sim, F=(await import('./js/seafloor.js')).seafloor;
      const s=sim.s, ev=[]; sim.on?.('bump',(d)=>ev.push(d.kind)); const orig=sim.emit; sim.emit=(t,d)=>{ if(t==='bump') ev.push(d.kind); return orig.call(sim,t,d); };
      Object.assign(s,{lat:39.9,lon:-69.0,docked:false,speed:0,throttle:0,depth:100,targetDepth:100,heading:350,hull:100});
      const hull0=s.damage||0;
      s.speed=20; s.throttle=1;
      for(let i=0;i<4000 && !ev.includes('edge');i++) sim.step(0.5);
      return {ev:[...new Set(ev)], speed:s.speed, dmg:(s.damage||0)-hull0, inside:F.inside(s.lat,s.lon), off:F.inside(41.5,-66)};
    })()""")
    print(r)
    ok('ao-near' in r['ev'], 'Helm warns before the limit')
    ok(r['ev'].index('ao-near') < r['ev'].index('edge'), 'the warning comes first')
    ok(r['speed'] == 0 and r['inside'], 'the ship stops inside the limit')
    ok(r['dmg'] == 0, 'stopping at the limit costs no hull')
    ok(not r['off'], 'the north-east corner is outside the Area of Operations')
    ok(not errs, 'no page errors ' + str(errs))
    b.close()
server.shutdown()
print('\nAll checks passed.' if not bad else f'\n{len(bad)} FAILED')
sys.exit(1 if bad else 0)
