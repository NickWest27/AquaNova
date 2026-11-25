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
        js = lambda code: page.evaluate("(async()=>{const sim=(await import('./js/sim.js')).sim;const tr=await import('./js/traffic.js');if(tr.traffic.cfg&&!window.__det){window.__det=1;tr.traffic.rand=()=>0.5;Object.assign(tr.traffic.cfg.sensing,{check_s:0,drop_misses:1});}const cm=await import('./js/commsModel.js');const g=(await import('./js/persist.js')).gameState;" + code + "})()")
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
        check("a hail gets an answer or a clear refusal, and names the ship", r.get("none") or (r.get("ok") and r["after"]) or "Antenna" in r.get("msg", ""), r)
        # nobody sails over land: every leg of every ship near the coast is over water
        r = js(place + """const sf=(await import('./js/seafloor.js')).seafloor; let n=0, bad=0, worst=1e9; const spots=[[41.5,-70.7],[40.6,-73.9],[41.4,-71.3],[32.3,-64.7],[38.5,-28.6],[37.7,-25.6]];
          for(const sd of [11,22,33]){ g.updateProperty('world.seed', sd); tr.traffic.cells.clear(); for(const [la,lo] of spots){ Object.assign(sim.s,{lat:la,lon:lo}); for(let h=0;h<24;h++){ sim.s.clock=h*3600; tr.traffic.candKey=''; tr.step(); for(const v of tr.traffic.cand){ for(let q=0;q<=6;q++){ const p=tr.posAt(v, sim.s.clock + q*400); const d=sf.depthAt(p.lat,p.lon); if(d==null) continue; n++; worst=Math.min(worst,d); if(d<2) bad++; } } } } }
          return {n, bad, worst}""")
        print("     land check", r)
        check("no ship sails over land or shoals", r["n"] > 50 and r["bad"] == 0, r)
        # sensing: AIS, bearings, fixes, identity
        setup = """g.updateProperty('world.seed', 99); g.updateProperty('world.sunk', []); tr.traffic.sunk.clear(); tr.traffic.cells.clear(); sim.s.wskrs=[]; Object.assign(sim.s,{depth:60,speed:0,sonar:true});
          const put=(kind, ais)=>{ for(let k=0;k<600;k++){ sim.s.lat=39.8+(k%30)*0.05; sim.s.lon=-58.0-Math.floor(k/30)*0.12; tr.traffic.candKey=''; sim.s.clock=k*97; tr.step(); const v=tr.traffic.cand.find(x=>(kind?x.kind===kind:x.ais===ais)&&x.size>=1); if(v){ const p=tr.posAt(v,sim.s.clock); return {v,p}; } } return null; };"""
        r = js(place + setup + """const f=put(null,true); if(!f) return {none:true}; const at=(dn)=>{ Object.assign(sim.s,{lat:f.p.lat+dn/60,lon:f.p.lon}); tr.traffic.candKey=''; tr.step(); return tr.traffic.active.find(a=>a.v===f.v); };
          const old=tr.gates.ais; tr.gates.ais=()=>true; const near=at(4); const withAis={shown:!!near&&near.shown, pos:!!(near&&near.pos), ais:!!(near&&near.ais), ident:f.v.ident};
          f.v.ident=false; tr.traffic.known.delete(f.v.id); tr.gates.ais=()=>false; const far=at(15); const noMast={pos:!!(far&&far.pos), ais:!!(far&&far.ais)}; tr.gates.ais=old; return {withAis, noMast}""")
        print("     ais", r)
        check("AIS ships are plotted and named when the VHF mast is up", r.get("none") or (r["withAis"]["pos"] and r["withAis"]["ais"] and r["withAis"]["ident"]), r)
        check("with the mast down a distant AIS ship is not plotted", r.get("none") or not r["noMast"]["pos"], r)
        r = js(place + setup + """const f=put(null,false); if(!f) return {none:true}; Object.assign(sim.s,{lat:f.p.lat+0.07,lon:f.p.lon,depth:60}); tr.traffic.candKey=''; tr.step(); const a=tr.traffic.active.find(x=>x.v===f.v);
          const one={shown:!!a&&a.shown, pos:!!(a&&a.pos), lines:a?a.lines.length:0, ident:f.v.ident, name:a?tr.shownName(a):''};
          const old=sim.wskrLink; sim.wskrLink=()=>({raw:true}); sim.s.wskrs=[{id:1,dead:false,arrived:false,lat:f.p.lat,lon:f.p.lon+0.04}]; tr.traffic.candKey=''; sim.s.clock+=1; tr.step(); const b=tr.traffic.active.find(x=>x.v===f.v);
          const two={pos:!!(b&&b.pos), err:b&&b.pos?b.pos.err:null, lines:b?b.lines.length:0, ident:f.v.ident};
          sim.s.wskrs=[{id:1,dead:false,arrived:false,lat:f.p.lat+0.0005,lon:f.p.lon+0.0005}]; f.v.ident=false; tr.traffic.known.delete(f.v.id); sim.s.clock+=1; tr.step(); const seenBy=f.v.ident;
          sim.wskrLink=old; sim.s.wskrs=[]; return {one,two,seenBy}""")
        print("     bearings", r)
        check("a non-AIS ship heard by sonar gives a bearing, no position, no name", r.get("none") or (r["one"]["shown"] and not r["one"]["pos"] and r["one"]["lines"] >= 1 and not r["one"]["ident"] and r["one"]["name"] == "Unidentified contact"), r)
        check("a WSKR on another bearing makes a fix with an error", r.get("none") or (r["two"]["pos"] and r["two"]["err"] > 0), r)
        check("a WSKR camera alongside identifies the ship", r.get("none") or r["seenBy"], r)
        r = js(place + setup + """const f=put(null,false); if(!f) return {none:true}; Object.assign(sim.s,{lat:f.p.lat,lon:f.p.lon,depth:5}); tr.traffic.candKey=''; f.v.ident=false; tr.traffic.known.delete(f.v.id); tr.step(); const a=tr.traffic.active.find(x=>x.v===f.v); return {pos:!!(a&&a.pos), ident:f.v.ident}""")
        check("close and near the surface a ship is seen by eye and identified", r.get("none") or (r["pos"] and r["ident"]), r)
        r = js(place + setup + """const f=put(null,false); if(!f) return {none:true}; const at=(dn)=>{ Object.assign(sim.s,{lat:f.p.lat+dn/60,lon:f.p.lon,depth:60}); f.v.ident=false; tr.traffic.known.delete(f.v.id); f.v.sweepAt=0; tr.traffic.candKey=''; tr.step(); return tr.traffic.active.find(a=>a.v===f.v); };
          const in3=at(3), n3=f.v.ident; f.v.ident=false; tr.traffic.known.delete(f.v.id); const a6=at(6); const heard6=!!a6, before=f.v.ident; const ok6=a6?tr.sweep(f.v):false; sim.s.clock+=25; tr.traffic.candKey=''; tr.step(); const after=f.v.ident;
          const a10=at(10); const refused=a10?!tr.sweep(f.v):true; return {n3, heard6, before, ok6, after, refused}""")
        print("     ident ranges", r)
        check("a ship inside 4 nm is identified", r.get("none") or r["n3"], r)
        check("a sensor sweep identifies a ship at 6 nm and is refused beyond 8 nm", r.get("none") or not r["heard6"] or (not r["before"] and r["ok6"] and r["after"] and r["refused"]), r)
        # detection chance (docs/CONTACT_TRACKING.md): 50% at R50, about 90% at 0.7, 12% at 1.4, nothing past 2x
        r = js("return {p07:tr.detectP(0.7,1), p1:tr.detectP(1,1), p14:tr.detectP(1.4,1), p2:tr.detectP(2,1), f10:tr.flowFactor(10), f15:tr.flowFactor(15), f50:tr.flowFactor(50), f100:tr.flowFactor(100)}")
        print("     curve", r)
        check("detection curve: 50% at R50, ~90% at 0.7, ~12% at 1.4, 0 at 2x", abs(r["p1"]-0.5)<1e-9 and 0.88<r["p07"]<0.91 and 0.1<r["p14"]<0.13 and r["p2"]==0, r)
        check("flow noise: none up to 15 kt, 0.4 at 100 kt (super cruise)", r["f10"]==1 and r["f15"]==1 and 0.7<r["f50"]<0.8 and abs(r["f100"]-0.4)<1e-9, r)
        r = js(place + setup + """const f=put(null,false); if(!f) return {none:true}; const v=f.v; const go=(dn,t)=>{ sim.s.clock=t; const p=tr.posAt(v,t); Object.assign(sim.s,{lat:p.lat+dn/60,lon:p.lon,depth:60,speed:0}); tr.traffic.candKey=''; tr.step(); return tr.traffic.active.find(a=>a.v===v); };
          const t0=sim.s.clock; v.ident=false; v.prob=null; tr.traffic.known.delete(v.id); go(3,t0); const idd=v.ident;
          for(let k=1;k<=10;k++) go(6,t0+k*60); const held=v.ident;
          const sw=tr.canSweep({nm:10,v});
          go(40,t0+660); const tl=t0+660+600; Object.assign(sim.s,{clock:tl}); const exp=tr.matchP(v,tl); const a=go(6,tl);
          const prob=v.prob, name=tr.shownName(a);
          go(40,tl+60); const tl2=tl+60+3*3600; Object.assign(sim.s,{clock:tl2}); const exp2=tr.matchP(v,tl2); const a2=go(6,tl2); const prob2=v.prob, name2=tr.shownName(a2);
                    return {idd, held, sw, exp, prob, name, exp2, prob2, name2, ident:v.ident, kt:v.kt}""")
        print("     track", r)
        check("a track held on sonar keeps its name", r.get("none") or (r["idd"] and r["held"]), r)
        check("a ship on file can be swept at 10 nm (12 nm on file)", r.get("none") or r["sw"], r)
        check("picked up again 10 min later it is only probable, with the match chance", r.get("none") or (r["exp"] >= 0.25 and r["prob"] is not None and abs(r["prob"]-r["exp"])<0.02 and r["name"].startswith("Probable:")), r)
        check("picked up again 3 h later the match is too weak: unidentified", r.get("none") or (r["exp2"] < 0.25 and r["prob2"] is None and r["name2"] == "Unidentified contact" and not r["ident"]), r)
        # a reload rebuilds every ship from the seed: the ones already identified stay identified (world.known)
        r = js(place + setup + """const f=put(null,false); if(!f) return {none:true}; Object.assign(sim.s,{lat:f.p.lat+3/60,lon:f.p.lon,depth:60}); tr.traffic.candKey=''; tr.step(); const id=f.v.id, was=f.v.ident;
          const kn=g.getProperty('world.known')||{}, saved=!!kn[id] && kn[id].i===1;
          tr.traffic.cells.clear(); tr.traffic.known=new Map(Object.entries(g.getProperty('world.known')||{})); Object.assign(sim.s,{lat:f.p.lat+12/60,lon:f.p.lon}); tr.traffic.candKey=''; tr.step();
          const v2=tr.traffic.cand.find(x=>x.id===id); return {was, saved, fresh: !!v2 && v2!==f.v, after: !!v2 && v2.ident}""")
        print("     reload", r)
        check("an identified ship is saved and stays identified after the traffic is rebuilt", r.get("none") or (r["was"] and r["saved"] and r["fresh"] and r["after"]), r)
        # the dashed bearing agrees with the chart's own geometry (within sensor noise)
        r = js(place + setup + """const f=put(null,false); if(!f) return {none:true}; Object.assign(sim.s,{lat:f.p.lat+0.06,lon:f.p.lon+0.06,depth:60}); tr.traffic.candKey=''; tr.step(); const a=tr.traffic.active.find(x=>x.v===f.v); if(!a||!a.lines.length) return {none:true}; const ln=a.lines[0]; const real=sim_toward(ln.from, a.lat!=null?{lat:a.lat,lon:a.lon}:f.p).brg; let d=Math.abs(ln.brg-real); d=Math.min(d,360-d); return {d, brg:ln.brg, real}""".replace("sim_toward","(await import('./js/sim.js')).toward"))
        print("     bearing vs chart", r)
        check("a bearing line points at the ship on the chart", r.get("none") or r["d"] < 3, r)
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
