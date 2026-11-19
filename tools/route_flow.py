#!/usr/bin/env python3
"""Ship and WSKR courses go round land, on the real sea floor.  python3 tools/route_flow.py"""
import os, sys, json, importlib.util
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
        js = lambda code: page.evaluate("(async()=>{const sim=(await import('./js/sim.js')).sim;const sf=(await import('./js/seafloor.js')).seafloor;" + code + "})()")
        page.goto(base); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000)
        page.tap("#board-btn"); page.wait_for_timeout(800)
        page.evaluate("import('./js/sim.js').then(m=>m.setTimeScale(30))"); page.wait_for_timeout(200)   # written for the old 30x pace
        if page.is_visible(".modal .btn"): page.tap(".modal .btn"); page.wait_for_timeout(300)
        # find a pair of water points whose straight line crosses land but which a route can join
        pair = js("""
          const water=(la,lo)=>sim.shipPassable(la,lo); const cross=(a,b)=>{for(let i=0;i<=200;i++){const la=a.lat+(b.lat-a.lat)*i/200, lo=a.lon+(b.lon-a.lon)*i/200; if(!water(la,lo)) return true;} return false;};
          const a={lat:41.30,lon:-70.65};  // south of Martha's Vineyard / Nantucket, open water
          for (const b of [{lat:41.62,lon:-70.40},{lat:41.50,lon:-70.30},{lat:41.45,lon:-71.00},{lat:41.60,lon:-70.60}]) { if(water(a.lat,a.lon)&&water(b.lat,b.lon)&&cross(a,b)) { return {a,b}; } }
          return null""")
        check("found a pair of points with land between", pair is not None, pair)
        if pair:
            r = js("""const a=%s,b=%s; const s=sim.s; Object.assign(s,{lat:a.lat,lon:a.lon,docked:false,speed:0,throttle:0,depth:0,targetDepth:0,damage:0,hull:100,heading:0,targetHeading:0,wskrs:[],sonar:true});
              const route=sim.routeTo({id:'t',name:'T',type:'waypoint',lat:b.lat,lon:b.lon}); return route?route.length:null""" % (json.dumps(pair["a"]), json.dumps(pair["b"])))
            check("a route with turning points exists", r is not None and r >= 1, r)
            out = js("""const b=%s; const s=sim.s; const wp={id:'t',name:'T',type:'waypoint',lat:b.lat,lon:b.lon}; sim.setWpt(wp); sim.setThrottle(0.6); s.speed=0;
              let steps=0; let min=1e9; while(s.wpt && steps<60000){ sim.step(0.1); steps++; const f=sf.depthAt(s.lat,s.lon); if(f!=null) min=Math.min(min,f); }
              return {arrived:!s.wpt, steps, damage:s.damage, hull:s.hull, minFloor:min}""" % json.dumps(pair["b"]))
            check("ship arrives round the land", out["arrived"], out)
            check("ship never touches the shallows", out["damage"] == 0 and out["minFloor"] >= 8, out)
            # WSKR sent across the land
            w = js("""const a=%s,b=%s; const s=sim.s; Object.assign(s,{lat:a.lat,lon:a.lon,wpt:null,speed:0,throttle:0,wskrs:[]});
              const poi={id:9999,name:'Far buoy',type:'wreck',text:'',lat:b.lat,lon:b.lon}; s.pois.push(poi);
              sim.deployWskr(); sim.taskWskr(poi); let steps=0, min=1e9; let found=false; sim.on((t)=>{ if(t==='wskr-found') found=true; });
              while(!found && steps<200000){ sim.step(0.1); steps++; for(const q of s.wskrs){ const f=sf.depthAt(q.lat,q.lon); if(f!=null) min=Math.min(min,f);} }
              return {found, steps, minFloor:min, mode:s.wskrs[0]&&s.wskrs[0].mode}""" % (json.dumps(pair["a"]), json.dumps(pair["b"])))
            check("WSKR reaches a site across the land", w["found"], w)
            check("WSKR stays in water on the way", w["minFloor"] >= 3, w)
        check("no page errors", not errors, errors)
        browser.close()
    server.shutdown()
    print("\nFAILED: " + ", ".join(fails) if fails else "\nAll checks passed.")
    sys.exit(1 if fails else 0)
main()
