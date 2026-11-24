#!/usr/bin/env python3
"""Search patterns: geometry, WSKR, Tern, ship Route, the picker dialog.  python3 tools/searchpattern_test.py"""
import importlib.util, os
from playwright.sync_api import sync_playwright
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sp = importlib.util.spec_from_file_location("smoke", R + "/tools/smoke.py"); sm = importlib.util.module_from_spec(sp); sp.loader.exec_module(sm)
srv, _ = sm.start_server(); base = f"http://127.0.0.1:{srv.server_address[1]}/AquaNova/tablet/"
fails = []
def check(n, ok, x=""):
    print(("ok   " if ok else "FAIL ") + n + (f"  {x}" if x and not ok else ""))
    if not ok: fails.append(n)
with sync_playwright() as p:
    b = sm.launch(p); pg = b.new_context(viewport={"width": 1180, "height": 820}, has_touch=True).new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:200])); pg.on("console", lambda m: errs.append(m.text[:200]) if m.type == "error" else None)
    js = lambda code: pg.evaluate("(async()=>{const sim=(await import('./js/sim.js')).sim;const P=await import('./js/searchPattern.js');const B=await import('./js/bayops.js');const T=await import('./js/tern.js');const D=await import('./js/searchDialog.js');" + code + "})()")
    pg.goto(base); pg.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000); pg.tap("#board-btn"); pg.wait_for_timeout(800)
    if pg.is_visible(".modal .btn"): pg.tap(".modal .btn"); pg.wait_for_timeout(300)
    js("const s=sim.s, c=s.pois.find(p=>p.type==='dock'); Object.assign(s,{lat:c.lat-0.3,lon:c.lon-0.1,docked:false,at:null,wpt:null,fixes:[],speed:0,throttle:0,depth:5,targetDepth:5,hull:100})")

    # ---- the generator (pure geometry)
    g = js("""const d={lat:40,lon:-70}, nm=(a,b)=>Math.hypot((b.lat-a.lat)*60,(b.lon-a.lon)*60*Math.cos(a.lat*Math.PI/180));
      const sq=P.build({kind:'square',brg:90,space:1,legs:6},d); const legs=sq.map((q,i)=>nm(i?sq[i-1]:d,q));
      const pa=P.build({kind:'parallel',brg:0,length:4,width:2,space:0.5},d); const gaps=[1,3,5,7].map(i=>nm(pa[i],pa[i+1])); const tl=[0,2,4,6,8].map(i=>nm(pa[i],pa[i+1]));
      const se=P.build({kind:'sector',radius:2,rounds:2},d); const cr=P.build({kind:'creeping',brg:0,length:3,width:2,space:0.5},d);
      const mid=(a,b)=>({lat:(a.lat+b.lat)/2,lon:(a.lon+b.lon)/2});
      const big=P.build({kind:'parallel',length:30,width:30,space:0.05},d);
      return {first:{dlat:(sq[0].lat-d.lat)*60,dlon:(sq[0].lon-d.lon)*60*Math.cos(d.lat*Math.PI/180)}, legs, n:{pa:pa.length,se:se.length,cr:cr.length}, gaps, tl,
        sectorEnd:nm(se[se.length-1],d), sectorR:[nm(d,se[0]),nm(se[0],se[1]),nm(se[1],se[2])], crFirst:nm(mid(cr[0],cr[1]),d), crLen:nm(cr[0],cr[1]), crStep:nm(cr[1],cr[2]),
        big:big.length, norm:P.normalize({kind:'zzz',space:99,legs:1,brg:-90,rounds:9}), text:P.describe({kind:'square',legs:8,space:0.4,brg:45})}""")
    check("expanding square: first leg goes along the chosen bearing", abs(g["first"]["dlat"]) < 0.01 and abs(g["first"]["dlon"] - 1) < 0.01, str(g["first"]))
    check("expanding square: legs grow 1,1,2,2,3,3", [round(x, 2) for x in g["legs"]] == [1, 1, 2, 2, 3, 3], str(g["legs"]))
    check("parallel track: 5 tracks of 4 nm, never more than 0.5 nm apart", g["n"]["pa"] == 10 and all(abs(x - 0.5) < 0.01 for x in g["gaps"]) and all(abs(x - 4) < 0.01 for x in g["tl"]), str((g["n"], g["gaps"], g["tl"])))
    check("sector search: three legs a round, each as long as the radius, ends on the datum", g["n"]["se"] == 6 and g["sectorEnd"] < 0.01 and all(abs(x - 2) < 0.01 for x in g["sectorR"]), str((g["n"], g["sectorR"], g["sectorEnd"])))
    check("creeping line: first track passes the datum, tracks 2 nm wide, advance 0.5 nm", g["crFirst"] < 0.01 and abs(g["crLen"] - 2) < 0.01 and abs(g["crStep"] - 0.5) < 0.01, str(g))
    check("a pattern never has more than 80 waypoints", g["big"] == 80, str(g["big"]))
    check("numbers are held inside their limits", g["norm"]["kind"] == "square" and g["norm"]["space"] == 5 and g["norm"]["legs"] == 2 and g["norm"]["brg"] == 270 and g["norm"]["rounds"] == 3, str(g["norm"]))
    check("describe gives one plain line", g["text"] == "Expanding square, 8 legs, 0.4 nm apart, first leg 045", g["text"])

    # ---- a WSKR follows a pattern
    js("sim.deployWskr(); const w=sim.s.wskrs[0]; w.lat=sim.s.lat; w.lon=sim.s.lon; w.mode='escort'; window.__done=0; window.__far=0; sim.on((t)=>{ if(t==='wskr-search-done') window.__done++; }); return 1")
    js("const s=sim.s, w=s.wskrs[0]; sim.orderWskr(w.n,'search',{spec:{kind:'parallel',brg:0,length:0.8,width:0.4,space:0.2},datum:{lat:w.lat,lon:w.lon}}); return 1")
    w0 = js("const w=sim.s.wskrs[0]; return {mode:w.mode, spec:w.pat&&w.pat.spec&&w.pat.spec.kind, n:(await import('./js/sim.js')).patternPoints(w.pat).length}")
    check("a WSKR given a pattern keeps it", w0["mode"] == "search" and w0["spec"] == "parallel" and w0["n"] == 6, str(w0))
    r = js("let far=0; const w=sim.s.wskrs[0], p=w.pat; for(let i=0;i<6000 && !window.__done;i++){ sim.s.throttle=0; sim.step(1); far=Math.max(far,Math.hypot((w.lat-p.lat)*60,(w.lon-p.lon)*60*Math.cos(p.lat*Math.PI/180))); } return {done:window.__done, mode:w.mode, far, pat:w.pat}")
    check("the WSKR runs the whole pattern and rejoins", r["done"] == 1 and r["mode"] == "escort" and r["pat"] is None and r["far"] > 0.3, str(r))
    old = js("const w=sim.s.wskrs[0]; sim.orderWskr(w.n,'search'); return {spec:w.pat.spec, n:(await import('./js/sim.js')).patternPoints(w.pat).length}")
    check("the plain Search order is still the old expanding square (14 legs)", old["spec"]["kind"] == "square" and old["n"] == 14, str(old))
    js("sim.orderWskr(sim.s.wskrs[0].n,'escort')")

    # ---- the Tern follows a pattern
    js("const sh=B.shuttle(), s=sim.s; Object.assign(sh,{state:'out',mode:'station',lat:s.lat,lon:s.lon,depth:5,holdDepth:5,pilots:2,pax:0,o2:100,bat:100,moving:false,ordKt:null,lost:0,missed:0,lastContact:s.clock,nextCheck:s.clock+3600}); window.__tdone=0; sim.on((t)=>{ if(t==='shuttle-search-done') window.__tdone++; }); return 1")
    t0 = js("const s=sim.s; return T.orderTern({kind:'search',spec:{kind:'square',brg:0,space:0.3,legs:6},datum:{lat:s.lat,lon:s.lon}})")
    check("Nicole passes a search to the Tern", t0["ok"] and "Starting a search" in t0["text"], str(t0))
    t1 = js("const sh=B.shuttle(); return {mode:sh.mode, n:sh.pat.wps.length, rep:T.ternReport()}")
    check("the Tern is searching, and her report says where", t1["mode"] == "search" and t1["n"] == 6 and "waypoint 1 of 6" in t1["rep"], str(t1))
    t2 = js("const sh=B.shuttle(); let far=0, ks=new Set(); for(let i=0;i<8000 && !window.__tdone;i++){ sim.step(1); if(sh.pat) ks.add(sh.pat.k); far=Math.max(far,Math.hypot((sh.lat-sim.s.lat)*60,(sh.lon-sim.s.lon)*60*Math.cos(sim.s.lat*Math.PI/180))); } return {done:window.__tdone, mode:sh.mode, far, ks:[...ks].length, pat:sh.pat, state:sh.state}")
    check("the Tern flies every waypoint, then holds station", t2["done"] == 1 and t2["mode"] == "station" and t2["pat"] is None and t2["ks"] >= 5 and t2["far"] > 0.5, str(t2))
    t3 = js("const s=sim.s; return T.orderTern({kind:'search',spec:{kind:'parallel',length:30,width:30,space:0.5},datum:{lat:s.lat,lon:s.lon}})")
    check("a pattern too big for her battery is refused", "refused" in t3["text"], str(t3))
    js("const sh=B.shuttle(); sh.state='bay'; sh.mode='follow'; sim.step(0.1)")

    # ---- the ship plots a pattern as its Route
    sh = js("const s=sim.s; const r=sim.plotSearch({kind:'parallel',brg:0,length:2,width:1,space:0.5},{lat:s.lat,lon:s.lon}); return {r, fixes:s.fixes.length, names:s.fixes.slice(0,2).map(f=>f.name), wpt:s.wpt&&s.wpt.name, route:s.route.length}")
    check("the ship's Route is the pattern", sh["r"]["ok"] and sh["fixes"] == sh["r"]["n"] == 6 and sh["names"] == ["SP1", "SP2"] and sh["wpt"] == "SP6" and sh["route"] >= 6, str(sh))
    js("sim.clearRoute()")
    sp1 = js("const s=sim.s; return D.splitSpec({kind:'parallel',brg:0,length:2,width:3,space:0.5},{lat:s.lat,lon:s.lon},0,3)")
    sp2 = js("const s=sim.s; return D.splitSpec({kind:'parallel',brg:0,length:2,width:3,space:0.5},{lat:s.lat,lon:s.lon},2,3)")
    check("three WSKRs share the width; each takes its own strip", abs(sp1["spec"]["width"] - 1) < 0.01 and sp1["datum"]["lon"] < sp2["datum"]["lon"], str((sp1, sp2)))
    sq = js("const s=sim.s; return [0,1,2].map(i=>D.splitSpec({kind:'square',brg:0,legs:8,space:0.5},{lat:s.lat,lon:s.lon},i,3).spec.brg)")
    check("three WSKRs on a square start 120 degrees apart", [round(x) for x in sq] == [0, 120, 240], str(sq))

    # ---- the dialog
    pg.evaluate("window.__aq.open('nav')"); pg.wait_for_timeout(700)
    pg.locator("#station .btn", has_text="Search pattern").first.tap(); pg.wait_for_timeout(400)
    check("the Navigation station opens the planner", pg.is_visible(".modal.sp, .modal .pc.sp") or pg.locator(".pc.sp").count() == 1)
    pg.locator(".pc.sp .btn.chip", has_text="Parallel track").tap(); pg.wait_for_timeout(200)
    txt = pg.inner_text(".pc.sp .pc-msg")
    check("the preview names the pattern and its length", "Parallel track" in txt and "waypoints" in txt and "nm" in txt, txt)
    pg.locator(".pc.sp .btn", has_text="Start search").tap(); pg.wait_for_timeout(500)
    ui = js("return {fixes:sim.s.fixes.length, open:document.querySelectorAll('.pc.sp').length}")
    check("Start search plots the ship's Route and closes the planner", ui["fixes"] >= 4 and ui["open"] == 0, str(ui))
    js("sim.clearRoute(); sim.deployWskr(); sim.deployWskr(); sim.s.wskrs.forEach(w=>{w.lat=sim.s.lat;w.lon=sim.s.lon;w.mode='escort'}); D.openSearchDialog({craft:'wall'})")
    pg.wait_for_timeout(300)
    pg.locator(".pc.sp .btn.chip", has_text="Expanding square").tap(); pg.wait_for_timeout(200)
    pg.locator(".pc.sp .btn", has_text="Start search").tap(); pg.wait_for_timeout(400)
    ui = js("return sim.s.wskrs.map(w=>({mode:w.mode, brg:w.pat&&w.pat.spec.brg}))")
    check("'All WSKRs' sends each one on its own bearing", all(x["mode"] == "search" for x in ui) and len({x["brg"] for x in ui}) == len(ui) >= 2, str(ui))
    check("no page errors", not errs, str(errs[:3]))
    b.close()
print("FAILED: " + ", ".join(fails) if fails else "all ok"); raise SystemExit(1 if fails else 0)
