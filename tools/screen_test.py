#!/usr/bin/env python3
"""WSKR sonar screen: bearing-line stations, buzzing, extras on the outer line, auto-intercept.  python3 tools/screen_test.py"""
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
    js = lambda code: pg.evaluate("(async()=>{const sim=(await import('./js/sim.js')).sim;const T=(await import('./js/traffic.js'));const S=await import('./js/sonar.js');const W=await import('./js/sim.js');" + code + "})()")
    pg.goto(base); pg.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000); pg.tap("#board-btn"); pg.wait_for_timeout(800)
    if pg.is_visible(".modal .btn"): pg.tap(".modal .btn"); pg.wait_for_timeout(300)
    js("const s=sim.s, c=s.pois.find(p=>p.type==='dock'); Object.assign(s,{lat:c.lat-0.3,lon:c.lon-0.1,docked:false,at:null,wpt:null,fixes:[],speed:0,throttle:0,depth:20,targetDepth:20,heading:90,targetHeading:90,wskrs:[],hull:100})")
    sl = js("const f=(n,form,u)=>Array.from({length:n},(_,i)=>W.screenSlot(i,n,form,u)); return {l3:f(3,'loose',true), t3:f(3,'tight',true), l4:f(4,'loose',true), r4:f(4,'loose',false), l1:f(1,'loose',true), l2:f(2,'loose',true)}")
    check("three under way: lead dead ahead, others +/-110 on a loose screen", sl["l3"][0]["rel"] == 0 and sorted(x["rel"] for x in sl["l3"]) == [-110, 0, 110], str(sl["l3"]))
    check("a tight screen is narrow (+/-45)", sorted(x["rel"] for x in sl["t3"]) == [-45, 0, 45], str(sl["t3"]))
    check("the fourth takes the outer line, further out, between the others", sl["l4"][3]["ring"] > 1.5 and abs(sl["l4"][3]["rel"]) == 55, str(sl["l4"]))
    check("at rest they picket all round", [x["rel"] for x in sl["r4"]] == [45, 135, 225, 315] and not sl["r4"][0]["buzz"], str(sl["r4"]))
    check("one WSKR goes dead ahead; two share the bow", sl["l1"][0]["rel"] == 0 and sorted(x["rel"] for x in sl["l2"]) == [-55, 55], str((sl["l1"], sl["l2"])))
    # under way: where do they end up?
    r = js("""const s=sim.s; for(let i=0;i<3;i++) sim.deployWskr(); s.wskrs.forEach(w=>{w.mode='escort'}); s.speed=6; s.throttle=0.4; s.heading=90; s.targetHeading=90; sim.setAutopilot&&0;
      const rel=[]; for(let i=0;i<1500;i++){ s.heading=90; s.targetHeading=90; s.speed=6; sim.step(1); }
      const out=s.wskrs.map(w=>{ const t=sim.toward?0:0; const dy=(w.lat-s.lat)*60, dx=(w.lon-s.lon)*60*Math.cos(s.lat*Math.PI/180); let b=Math.atan2(dx,dy)*180/Math.PI; let r=((b-s.heading+540)%360)-180; return {n:w.n, rel:Math.round(r), nm:+Math.hypot(dx,dy).toFixed(2)}; });
      return out""")
    ahead = [x for x in r if abs(x["rel"]) < 70]
    check("under way the WSKRs sit forward of the beam, fanned across the bow", len(r) == 3 and sum(abs(x["rel"]) < 140 for x in r) >= 2 and len(ahead) >= 1 and len({round(x["rel"] / 30) for x in r}) >= 2, str(r))
    w1 = js("const s=sim.s; const seen=s.wskrs.map(()=>[]); for(let i=0;i<400;i++){ s.heading=90; s.targetHeading=90; s.speed=6; sim.step(1); if(i%20==0) s.wskrs.forEach((w,k)=>{ const dy=(w.lat-s.lat)*60, dx=(w.lon-s.lon)*60*Math.cos(s.lat*Math.PI/180); seen[k].push(Math.round(((Math.atan2(dx,dy)*180/Math.PI-s.heading+540)%360)-180)); }); } const sp=seen.map(a=>Math.max(...a)-Math.min(...a)); return {lo:0, hi:Math.max(...sp)}")
    check("a WSKR weaves along its line (buzzes), not frozen", w1["hi"] >= 3, str(w1))
    # auto-intercept
    js("const s=sim.s; s.wskrs=[]; s.speed=0; s.throttle=0; Object.assign(s,{lat:40.2,lon:-72.0,docked:false,at:null,depth:60,targetDepth:60}); T.traffic.rand=()=>0.5; Object.assign(T.traffic.cfg.sensing,{check_s:0,drop_misses:1}); const k=Math.cos(s.lat*Math.PI/180)*60; const at=(n,e)=>({lat:s.lat+n/60,lon:s.lon+e/k}); const A=at(4.6,0); T.traffic.cand=[{id:'t:9',kind:'cargo',faction:'cargo',factionName:'Merchant',stance:'neutral',label:'Container ship',size:3,kt:0,A,B:A,L:1,phase:0,boldness:0,ais:false,bias:0,name:'MV Test',mhz:156,reply:0,ident:false,alerted:true,dyn:null,hitAt:-1e9,scanFixUntil:1e12}]; T.traffic.candKey=(()=>{const c=T.traffic.cfg.cell_nm;return Math.floor(s.lon/(c/(60*0.82)))+','+Math.floor(s.lat/(c/60))})(); const p=at(0,4), q=at(0,-4); s.wskrs=[{n:1,lat:p.lat,lon:p.lon,mode:'escort',target:null,busy:0,bat:100,heading:0},{n:2,lat:q.lat,lon:q.lon,mode:'escort',target:null,busy:0,bat:100,heading:0}]; sim.setWskrAuto(false); window.__tells=[]; return 1")
    js("for(let i=0;i<30;i++) sim.step(1)")
    off = js("return sim.s.wskrs.map(w=>w.mode)")
    check("with auto-intercept off they hold the screen", all(m == "escort" for m in off), str(off))
    js("sim.setWskrAuto(true); for(let i=0;i<60;i++) sim.step(1)")
    on = js("return sim.s.wskrs.map(w=>({mode:w.mode,auto:!!w.auto}))")
    check("an unidentified contact with a fix draws exactly one WSKR; the other keeps the screen", sorted(x["mode"] for x in on) == ["escort", "trail"] and any(x["auto"] for x in on), str(on))
    far = js("const s=sim.s, w=s.wskrs.find(w=>w.mode==='trail'); const k=Math.cos(s.lat*Math.PI/180)*60; w.lat=s.lat; w.lon=s.lon+9/k; w.route=null; for(let i=0;i<12;i++) sim.step(1); return {mode:w.mode, auto:!!w.auto}")
    check("an auto-chase breaks off beyond 8 nm from the ship", far["mode"] == "escort" and not far["auto"], str(far))
    js("T.traffic.cand[0].ident=true; for(let i=0;i<30;i++) sim.step(1)")
    done = js("return sim.s.wskrs.map(w=>w.mode)")
    check("once it is identified the WSKR returns to the screen", all(m == "escort" for m in done), str(done))
    js("for(let i=0;i<60;i++) sim.step(1)")
    again = js("return sim.s.wskrs.map(w=>w.mode)")
    check("the same contact is not chased twice", all(m == "escort" for m in again), str(again))
    check("no page errors", not errs, str(errs[:3]))
    b.close()
print("FAILED: " + ", ".join(fails) if fails else "all ok"); raise SystemExit(1 if fails else 0)
