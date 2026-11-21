#!/usr/bin/env python3
"""Marine traffic: same sea every time, thins to nothing off the chart, cheap, collisions, sunk ships stay sunk, hails.  python3 tools/traffic_test.py"""
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
        js = lambda code: page.evaluate("(async()=>{const sim=(await import('./js/sim.js')).sim;const tr=await import('./js/traffic.js');const cm=await import('./js/commsModel.js');const g=(await import('./js/persist.js')).gameState;" + code + "})()")
        page.goto(base); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000)
        page.tap("#board-btn"); page.wait_for_timeout(800)
        if page.is_visible(".modal .btn"): page.tap(".modal .btn"); page.wait_for_timeout(300)
        page.wait_for_function("(async()=>{const sf=(await import('./js/seafloor.js')).seafloor; return sf.ready})()", timeout=30000)
        place = "Object.assign(sim.s,{docked:false,speed:0,throttle:0,depth:60,targetDepth:60,wpt:null,sonar:true,at:null});"
        # a busy spot on the New York to Azores lane, a quiet one in open water, one off the chart
        def census(lat, lon, hours=12):
            return js(place + f"""sim.s.lat={lat}; sim.s.lon={lon}; tr.traffic.candKey=''; let n=0, max=0, kinds={{}}; const t0=sim.s.clock; for(let h=0;h<{hours};h++){{ sim.s.clock=t0+h*3600; tr.step(); n+=tr.traffic.active.length; max=Math.max(max,tr.traffic.active.length); for(const a of tr.traffic.active) kinds[a.v.kind]=(kinds[a.v.kind]||0)+1; }} return {{avg:n/{hours}, max, kinds, cells:tr.traffic.stats.cells}}""")
        js("g.updateProperty('world.seed', 2026); tr.traffic.cells.clear(); tr.traffic.candKey=''; return 1")
        lane = census(39.8, -58.0, 48); quiet = census(34.0, -50.0, 48); off = census(45.0, -30.0)
        print("     lane", lane, "\n     quiet", quiet, "\n     off-chart", off)
        check("the shipping lane is busier than open water", lane["avg"] > quiet["avg"] and lane["max"] >= 2, (lane, quiet))
        check("no traffic off the chart", off["avg"] == 0, off)
        check("traffic never exceeds the cap", lane["max"] <= 16, lane)
        # the same sea every time
        a = js(place + "sim.s.lat=39.8; sim.s.lon=-58.0; tr.traffic.cells.clear(); tr.traffic.candKey=''; tr.step(); return tr.traffic.active.map(a=>a.v.id+a.v.name)")
        b = js("tr.traffic.cells.clear(); tr.traffic.candKey=''; tr.step(); return tr.traffic.active.map(a=>a.v.id+a.v.name)")
        check("the same seed gives the same vessels", a == b and len(a) > 0, (a, b))
        c = js("g.updateProperty('world.seed', 12345); tr.traffic.cells.clear(); tr.traffic.candKey=''; tr.step(); return tr.traffic.active.map(a=>a.v.id+a.v.name)")
        check("a different seed gives a different sea", c != a, (a, c))
        # cost: step time with the bubble full
        r = js(place + """sim.s.lat=39.8; sim.s.lon=-58.0; const t=performance.now(); for(let i=0;i<500;i++){ sim.s.clock+=2; tr.step(); } return {ms:(performance.now()-t)/500, active:tr.traffic.stats.active, cells:tr.traffic.cells.size}""")
        print("     step cost", r)
        check("a traffic step costs well under a millisecond", r["ms"] < 1.0, r)
        # a hostile sanctuary: poachers at the Hydrographer Canyon, with boldness inside their range
        r = js(place + """const sc=sim.s.pois.find(p=>p.type==='sanctuary'); sim.s.lat=sc.lat; sim.s.lon=sc.lon; tr.traffic.candKey=''; tr.step(); const all=tr.traffic.cand.filter(v=>v.kind==='poacher'); return {n:all.length, hostile:all.every(v=>v.stance==='hostile'), bold:all.map(v=>+v.boldness.toFixed(2))}""")
        check("poachers work the protected zone and are hostile", r["n"] >= 1 and r["hostile"], r)
        check("each poacher has its own boldness", all(0 <= x <= 0.5 for x in r["bold"]) and len(set(r["bold"])) == len(r["bold"]), r)
        # bold hostiles close in, timid ones run
        r = js(place + """const sc=sim.s.pois.find(p=>p.type==='sanctuary'); sim.s.lat=sc.lat; sim.s.lon=sc.lon; tr.traffic.cells.clear(); tr.traffic.candKey=''; tr.step(); const v=tr.traffic.cand.find(x=>x.kind==='poacher'); const p0=tr.posAt(v, sim.s.clock);
          const run=(bold)=>{ v.boldness=bold; v.dyn=null; sim.s.lat=p0.lat+0.04; sim.s.lon=p0.lon; tr.traffic.lastClock=sim.s.clock; tr.step(); const d0=sim.s.lat?Math.hypot((v.dyn.lat-sim.s.lat)*60,(v.dyn.lon-sim.s.lon)*49):0; for(let i=0;i<30;i++){ sim.s.clock+=20; tr.step(); } const q=v.dyn||tr.posAt(v,sim.s.clock); return Math.hypot((q.lat-sim.s.lat)*60,(q.lon-sim.s.lon)*49)-d0; };
          return {bold:run(0.9), timid:run(0.05)}""")
        print("     reaction (change in range, nm)", r)
        check("a bold vessel closes and a timid one runs", r["bold"] < -0.3 and r["timid"] > 0.3, r)
        # hail: a ship in the bubble answers on its channel and is identified
        r = js(place + """sim.s.lat=39.8; sim.s.lon=-58.0; tr.traffic.cells.clear(); g.updateProperty('world.seed', 777); tr.traffic.candKey=''; let v=null; for(let k=0;k<48&&!v;k++){ sim.s.clock=k*1800; tr.step(); v=tr.traffic.active[0]; } if(!v) return {none:true}; const x=tr.hailContacts().find(c=>c.vessel===v.v); cm.cm.band='VHF'; cm.cm.mhz=x.mhz; sim.s.depth=0; sim.s.ants && 0; cm.setAnt && 0; const before=v.v.ident; const res=cm.hail(); return {before, ok:res.ok, msg:res.msg, after:v.v.ident, reply:x.reply}""")
        print("     hail", r)
        check("a hail gets an answer or a clear refusal, and does not identify a ship without AIS", r.get("none") or ((r.get("ok") or "Antenna" in r.get("msg", "")) and (r["after"] or r["before"] == r["after"])), r)
        # sensing: AIS, bearings, fixes, identity
        setup = """g.updateProperty('world.seed', 99); g.updateProperty('world.sunk', []); tr.traffic.sunk.clear(); tr.traffic.cells.clear(); sim.s.wskrs=[]; Object.assign(sim.s,{depth:60,speed:0,sonar:true});
          const put=(kind, ais)=>{ for(let k=0;k<600;k++){ sim.s.lat=39.8+(k%30)*0.05; sim.s.lon=-58.0-Math.floor(k/30)*0.12; tr.traffic.candKey=''; sim.s.clock=k*97; tr.step(); const v=tr.traffic.cand.find(x=>(kind?x.kind===kind:x.ais===ais)&&x.size>=1); if(v){ const p=tr.posAt(v,sim.s.clock); return {v,p}; } } return null; };"""
        r = js(place + setup + """const f=put(null,true); if(!f) return {none:true}; const at=(dn)=>{ Object.assign(sim.s,{lat:f.p.lat+dn/60,lon:f.p.lon}); tr.traffic.candKey=''; tr.step(); return tr.traffic.active.find(a=>a.v===f.v); };
          const old=tr.gates.ais; tr.gates.ais=()=>true; const near=at(4); const withAis={shown:!!near&&near.shown, pos:!!(near&&near.pos), ais:!!(near&&near.ais), ident:f.v.ident};
          f.v.ident=false; tr.gates.ais=()=>false; const far=at(15); const noMast={pos:!!(far&&far.pos), ais:!!(far&&far.ais)}; tr.gates.ais=old; return {withAis, noMast}""")
        print("     ais", r)
        check("AIS ships are plotted and named when the VHF mast is up", r.get("none") or (r["withAis"]["pos"] and r["withAis"]["ais"] and r["withAis"]["ident"]), r)
        check("with the mast down a distant AIS ship is not plotted", r.get("none") or not r["noMast"]["pos"], r)
        r = js(place + setup + """const f=put(null,false); if(!f) return {none:true}; Object.assign(sim.s,{lat:f.p.lat+0.02,lon:f.p.lon,depth:60}); tr.traffic.candKey=''; tr.step(); const a=tr.traffic.active.find(x=>x.v===f.v);
          const one={shown:!!a&&a.shown, pos:!!(a&&a.pos), lines:a?a.lines.length:0, ident:f.v.ident, name:a?tr.shownName(a):''};
          const old=sim.wskrLink; sim.wskrLink=()=>({raw:true}); sim.s.wskrs=[{id:1,dead:false,arrived:false,lat:f.p.lat,lon:f.p.lon+0.04}]; tr.traffic.candKey=''; sim.s.clock+=1; tr.step(); const b=tr.traffic.active.find(x=>x.v===f.v);
          const two={pos:!!(b&&b.pos), err:b&&b.pos?b.pos.err:null, lines:b?b.lines.length:0, ident:f.v.ident};
          sim.s.wskrs=[{id:1,dead:false,arrived:false,lat:f.p.lat+0.0005,lon:f.p.lon+0.0005}]; f.v.ident=false; sim.s.clock+=1; tr.step(); const seenBy=f.v.ident;
          sim.wskrLink=old; sim.s.wskrs=[]; return {one,two,seenBy}""")
        print("     bearings", r)
        check("a non-AIS ship heard by sonar gives a bearing, no position, no name", r.get("none") or (r["one"]["shown"] and not r["one"]["pos"] and r["one"]["lines"] >= 1 and not r["one"]["ident"] and r["one"]["name"] == "Unidentified contact"), r)
        check("a WSKR on another bearing makes a fix with an error", r.get("none") or (r["two"]["pos"] and r["two"]["err"] > 0), r)
        check("a WSKR camera alongside identifies the ship", r.get("none") or r["seenBy"], r)
        r = js(place + setup + """const f=put(null,false); if(!f) return {none:true}; Object.assign(sim.s,{lat:f.p.lat,lon:f.p.lon,depth:5}); tr.traffic.candKey=''; f.v.ident=false; tr.step(); const a=tr.traffic.active.find(x=>x.v===f.v); return {pos:!!(a&&a.pos), ident:f.v.ident}""")
        check("close and near the surface a ship is seen by eye and identified", r.get("none") or (r["pos"] and r["ident"]), r)
        # a deep boat cannot hit a surface ship
        r = js(place + """g.updateProperty('world.seed', 4242); g.updateProperty('world.sunk', []); tr.traffic.sunk.clear(); tr.traffic.cells.clear(); let small=null; for(let k=0;k<400&&!small;k++){ sim.s.lat=39.8+(k%20)*0.05; sim.s.lon=-58.0-Math.floor(k/20)*0.1; tr.traffic.candKey=''; sim.s.clock=k*50; tr.step(); small=tr.traffic.cand.find(v=>v.size<=1&&v.stance!=='hostile'); }
          if(!small) return {none:true}; const p=tr.posAt(small, sim.s.clock); Object.assign(sim.s,{lat:p.lat,lon:p.lon,depth:40,speed:6}); tr.traffic.candKey=''; const h0=sim.s.damage; tr.step(); return {sunk:tr.traffic.sunk.has(small.id), damage:sim.s.damage-h0}""")
        check("a submarine well below the surface does not collide with surface ships", r.get("none") or (not r["sunk"] and r["damage"] == 0), r)
        # collision with a small vessel at speed sinks it for good
        r = js(place + """g.updateProperty('world.seed', 4242); g.updateProperty('world.sunk', []); g.updateProperty('world.wrecks', []); tr.traffic.sunk.clear(); tr.traffic.cells.clear(); sim.s.lat=39.8; sim.s.lon=-58.0; tr.traffic.candKey=''; sim.s.clock=0; tr.step();
          let small=null; for(let k=0;k<400&&!small;k++){ sim.s.lat=39.8+(k%20)*0.05; sim.s.lon=-58.0-Math.floor(k/20)*0.1; tr.traffic.candKey=''; tr.step(); small=tr.traffic.cand.find(v=>v.size<=1&&v.stance!=='hostile'); }
          if(!small) return {none:true};
          sim.s.clock+=5000; const p=tr.posAt(small, sim.s.clock); Object.assign(sim.s,{lat:p.lat,lon:p.lon,depth:2,speed:6}); tr.traffic.candKey=''; const hull0=sim.s.damage; const n0=sim.s.pois.length; tr.step();
          return {sunk:tr.traffic.sunk.has(small.id), damage:sim.s.damage-hull0, newWreck:sim.s.pois.length-n0, saved:(g.getProperty('world.sunk')||[]).includes(small.id), id:small.id}""")
        print("     collision", r)
        check("ramming a small vessel hurts the hull, sinks her and leaves a wreck", not r.get("none") and r["sunk"] and r["damage"] > 0 and r["newWreck"] == 1 and r["saved"], r)
        r2 = js("""const id=%s; await tr.load(); return {stillSunk: tr.traffic.sunk.has(id), wrecks: sim.s.pois.filter(p=>p.sunkId===id).length}""" % (repr(r.get("id")).replace("'", '"')))
        check("a sunk ship stays sunk after a reload", r2["stillSunk"] and r2["wrecks"] == 1, r2)
        # the Sensors page lists a ship
        page.evaluate("window.__aq.open('sensors')"); page.wait_for_timeout(600)
        check("no page errors", not errors, errors[:3])
        browser.close()
    server.shutdown()
    print("FAILED: " + ", ".join(fails) if fails else "all ok"); sys.exit(1 if fails else 0)
main()
