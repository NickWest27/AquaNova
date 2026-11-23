#!/usr/bin/env python3
"""Mission generator: offers, accept/decline/expire/quit, route time, contact mission end to end, timer after report.  python3 tools/missiongen_test.py"""
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
    js = lambda code: pg.evaluate("(async()=>{const sim=(await import('./js/sim.js')).sim;const G=await import('./js/missionGen.js');const Rp=await import('./js/reputation.js');const {gameState}=await import('./js/persist.js');const MM=(await import('../game/systems/missionManager.js')).default;" + code + "})()")
    pg.goto(base); pg.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000); pg.tap("#board-btn"); pg.wait_for_timeout(800)
    if pg.is_visible(".modal .btn"): pg.tap(".modal .btn"); pg.wait_for_timeout(300)
    js("const s=sim.s, c=s.pois.find(p=>p.type==='dock'); Object.assign(s,{lat:c.lat-0.3,lon:c.lon-0.1,docked:false,at:null,wpt:null,fixes:[],speed:0,throttle:0,depth:20,targetDepth:20,hull:100})")
    h = js("const s=sim.s; const p={lat:s.lat+1,lon:s.lon}; return [G.routeHours(p), G.routeHours({lat:s.lat+0.05,lon:s.lon})]")
    check("route time is a number for open water", h[0] is None or h[0] > 0, str(h))
    # make three offers by seed, look at what comes out
    r = js("const out=[]; for(const t of ['contact','survey']) for(let i=1;i<=6;i++){ const x=G.generate(1000+i*37,{type:t}); if(x) out.push({t, reason:x.def.gen.reason, h:x.def.gen.routeH, place:x.def.gen.place, text:x.message.text.length, dl:x.offer.deadlineAt&&(x.offer.deadlineAt-x.offer.offeredAt)/3600, vessel:!!x.vessel}); } return out")
    check("generator produces both types", {x["t"] for x in r} == {"contact", "survey"}, str(r[:3]))
    check("contact offers have a deadline longer than the route", all(x["dl"] > x["h"] for x in r if x["t"] == "contact"), str(r))
    check("no briefing is empty", all(x["text"] > 200 for x in r))
    # a contact mission, start to end
    js("const g=gameState.getProperty('mission.gen'); if(g){g.offer=null;g.active=null;} ")
    o = js("const r=G.makeOffer({type:'contact',compulsory:false}); return r&&{id:r.def.id,reason:r.def.gen.reason,text:r.message.text}")
    check("an offer arrives in the inbox", o and any(m["id"] == f"offer-{o['id']}" for m in js("return gameState.getProperty('mission.inbox')")), str(o))
    if o:
        print(o["text"])
        check("accept starts the mission", js(f"return G.acceptOffer('{o['id']}')") is True)
        v = js("return gameState.getProperty('mission.gen').vessels[0]")
        check("the contact exists as a scripted vessel", v and v["mission"] == o["id"], str(v))
        # fly to it
        js(f"const v=gameState.getProperty('mission.gen').vessels[0]; sim.s.lat=v.A.lat+0.02; sim.s.lon=v.A.lon; sim.step(6); sim.step(6);")
        check("closing on the contact completes 'go'", js("return (gameState.getProperty('mission.objectives')||[]).find(o=>o.id.endsWith('_go')).status") == "completed")
        js("const v=gameState.getProperty('mission.gen').vessels[0]; sim.s.lat=v.A.lat+0.01; sim.step(6); sim.step(6); sim.step(6);")
        st = js("return (gameState.getProperty('mission.objectives')||[]).map(o=>o.id+':'+o.status)")
        check("identification completes and a decision is put to the Captain", any(x.endswith("identify:completed") for x in st) and js("return (gameState.getProperty('progress.decisions')||{pending:[]}).pending.length") >= 1, str(st))
        before = js("return Rp.rep('civil')")
        opt = js("const d=gameState.getProperty('progress.decisions').pending[0]; const a=await import('./js/aria.js'); a.decide(d.id, d.options[0].id); return d.options[0].id")
        js("document.dispatchEvent(new CustomEvent('report-sent'))")
        js("sim.step(6)")
        end = js("const g=gameState.getProperty('mission.gen'); return {active:g.active, done:g.done.slice(-1)[0], next:g.nextAt, clock:sim.s.clock, vessels:g.vessels.length}")
        check("the report ends the mission with the Captain's outcome", end["active"] is None and end["done"] and end["done"]["outcome"] == opt or (end["done"] and end["done"]["outcome"] in ("assist", "warn_off")), str(end))
        check("the timer for the next mission is 0 to 12 h", end["next"] is not None and 0 <= end["next"] - end["clock"] <= 12 * 3600 + 5, str(end))
        check("the scripted vessel is gone", end["vessels"] == 0)
    # expiry and decline
    js("const g=gameState.getProperty('mission.gen'); g.nextAt=null; g.offer=null; g.active=null;")
    o2 = js("const r=G.makeOffer({type:'survey',compulsory:false}); return r&&{id:r.def.id}")
    if o2:
        js("sim.step(3*3600/60); sim.s.clock += 13*3600; sim.step(6); sim.step(6);")
        check("an unanswered offer expires", js("return gameState.getProperty('mission.gen').offer") is None)
    js("const g=gameState.getProperty('mission.gen'); g.nextAt=null; g.offer=null; g.active=null;")
    o3 = js("const r=G.makeOffer({type:'survey',compulsory:false}); return r&&{id:r.def.id}")
    if o3:
        js(f"G.acceptOffer('{o3['id']}')"); before = js("return Rp.rep('oera')")
        js("G.quitMission()"); after = js("return Rp.rep('oera')")
        check("quitting an optional mission costs a little", after < before and before - after <= 2, f"{before} {after}")
        check("quit frees the mission slot", js("return G.hasActive()") is False)
    check("request orders refuses while a mission is active", js("const g=gameState.getProperty('mission.gen'); g.active='x'; const r=G.requestOrders(); g.active=null; return r.why") == "active")
    check("no page errors", not errs, str(errs[:3]))
    b.close()
print("FAILED: " + ", ".join(fails) if fails else "all ok"); raise SystemExit(1 if fails else 0)
