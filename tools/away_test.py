#!/usr/bin/env python3
"""Crew has the con (sleep with the app closed): the crew keep the course, hold at the Area of Operations limit, stop on arrival and at their time limit,
the plan survives a reload, ARIA briefs on return, and the phone PED shows an estimate.   python3 tools/away_test.py"""
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
    root = f"http://127.0.0.1:{server.server_address[1]}/AquaNova/"
    base = root + "tablet/"
    errors = []
    with sync_playwright() as p:
        browser = smoke.launch(p)
        ctx = browser.new_context(viewport={"width": 1180, "height": 820}, has_touch=True)
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)[:200]))
        js = lambda code: page.evaluate("(async()=>{const T=await import('./js/sim.js');const sim=T.sim;const A=await import('./js/away.js');const P=await import('./js/persist.js');" + code + "})()")
        def board():
            page.goto(base); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000)
            page.tap("#board-btn"); page.wait_for_timeout(1200)
        board()
        if page.is_visible(".modal .btn"): page.tap(".modal .btn"); page.wait_for_timeout(300)
        setup = "const s=sim.s; T.setTimeScale(1); Object.assign(s,{docked:false,at:null,wpt:null,route:[],speed:0,throttle:0,depth:100,targetDepth:100,hull:100,damage:0,battery:100,oxygen:100,cruise:false,wskrs:[]});"

        # 1. heading for the north-east block: the crew hold short of the limit, no damage
        r = js(setup + "Object.assign(s,{lat:39.5,lon:-69.0,heading:20,targetHeading:20,speed:20,throttle:1}); A.armAway(8); sim.away.real = Date.now() - 5*3600*1000; const rep = A.catchUp(); const F=(await import('./js/seafloor.js')).seafloor; return {stop: rep && rep.away.stop, nm: rep && rep.away.nm, speed: s.speed, inside: F.inside(s.lat,s.lon), dmg: s.damage||0, lat:s.lat, lines: rep && A.briefing(rep).lines, away: !!sim.away}")
        check("the crew stop at the Area of Operations limit", r["stop"] and r["stop"]["kind"] == "limit", r)
        check("they stopped inside the limit, moving none, with no damage", r["speed"] == 0 and r["inside"] and r["dmg"] == 0, r)
        check("they covered real distance first", 10 < r["nm"] < 90, r)
        check("the briefing says so", any("Area of Operations" in l for l in r["lines"]), r["lines"])
        check("the plan is cleared after waking", r["away"] is False, r)

        # 2. arrival at a place on the course
        r = js(setup + "const d=s.pois.find(p=>p.name==='Canyon Head'); Object.assign(s,{lat:39.25,lon:-72.1,heading:330,targetHeading:330,speed:10,throttle:10/sim.maxKt(),depth:40,targetDepth:40}); sim.setCourse ? sim.setCourse(d) : (s.wpt=d); A.armAway(8); sim.away.real = Date.now() - 4*3600*1000; const rep=A.catchUp(); return {stop: rep && rep.away.stop, speed:s.speed, nm: T.toward(s,d).nm, text: rep && A.briefing(rep).lines.join(' ')}")
        check("the crew stop on arrival", r["stop"] and r["stop"]["kind"] == "arrived" and r["speed"] < 0.5, r)
        check("briefing names the place", "Canyon Head" in r["text"], r["text"])

        # 3. open sea, time limit: stand down at 4 hours
        r = js(setup + "Object.assign(s,{lat:34.0,lon:-45.0,heading:90,targetHeading:90,speed:10,throttle:10/sim.maxKt()}); A.armAway(4); sim.away.real = Date.now() - 10*3600*1000; const c0=s.clock; const rep=A.catchUp(); return {stop: rep && rep.away.stop, nm: rep && rep.away.nm, speed:s.speed, clock: s.clock-c0}")
        check("the crew stand down at their time limit", r["stop"] and r["stop"]["kind"] == "cap" and r["speed"] < 0.5, r)
        check("they covered about four hours at 10 knots", 35 < r["nm"] < 42, r)
        check("the game clock moved the whole time away", r["clock"] > 9.9 * 3600, r)

        # 4. quick check: back within a minute is nothing to report
        r = js(setup + "Object.assign(s,{lat:34.0,lon:-45.0,heading:90,speed:10,throttle:0.4}); A.armAway(8); sim.away.real = Date.now() - 20*1000; const rep=A.catchUp(); return {rep: rep, away: !!sim.away}")
        check("a very short sleep gives no briefing", r["rep"] is None and r["away"] is False, r)

        # 5. low air: the crew surface and hold
        r = js(setup + "Object.assign(s,{lat:34.0,lon:-45.0,heading:90,targetHeading:90,speed:10,throttle:0.4,oxygen:31,depth:300,targetDepth:300}); A.armAway(8); s.oxygen=29; sim.away.real = Date.now() - 2*3600*1000; const rep=A.catchUp(); return {stop: rep && rep.away.stop, td: s.targetDepth, speed: s.speed}")
        check("low air: the crew bring her up and hold", r["stop"] and r["stop"]["kind"] == "oxygen" and r["td"] == 0 and r["speed"] < 0.5, r)

        # 5b. arrived at a point of interest and still asleep an hour later: the science team take samples (no port near, so no supply run)
        r = js(setup + "const sc=await import('./js/science.js'); const n0=sc.samples().length; const d=s.pois.find(p=>p.name==='Canyon Head'); Object.assign(s,{lat:39.25,lon:-72.1,heading:330,targetHeading:330,speed:10,throttle:10/sim.maxKt(),depth:40,targetDepth:40}); sim.setCourse ? sim.setCourse(d) : (s.wpt=d); A.armAway(12); sim.away.real = Date.now() - 7*3600*1000; const rep=A.catchUp(); return {n: sc.samples().length - n0, kinds: sc.samples().slice(n0).map(x=>x.kind+'@'+x.site), log: rep.away.log.map(l=>l.t), stop: rep.away.stop && rep.away.stop.kind}")
        check("at a point of interest the science team send Remora down after an hour", r["stop"] == "arrived" and r["n"] >= 1 and any("sent remora" in l.lower() for l in r["log"]), r)
        check("no port near: no supply run", not any("away team" in l.lower() for l in r["log"]), r["log"])
        # 5c. stopped near a port with low air: after an hour an away team fetches supplies in the Tern
        r = js(setup + "Object.assign(s,{lat:41.35,lon:-70.55,heading:90,targetHeading:90,speed:8,throttle:0.4,oxygen:31,depth:0,targetDepth:0}); const sh=(await import('./js/bayops.js')).shuttle(); sh.state='bay'; sh.bat=100; A.armAway(12); s.oxygen=29; sim.away.real = Date.now() - 6*3600*1000; const rep=A.catchUp(); return {stop: rep.away.stop && rep.away.stop.kind, oxy: s.oxygen, log: rep.away.log.map(l=>l.t), lines: A.briefing(rep).lines.join(' | ')}")
        check("near a port, an away team fetches supplies (the surface refilled the air meanwhile)", r["oxy"] > 95 and any("away team left" in l.lower() for l in r["log"]) and any("back from" in l for l in r["log"]), r)
        check("the briefing tells the Captain about the supply run", "supplies" in r["lines"], r["lines"])

        # 6. a closed app: the plan survives a reload and ARIA briefs at boarding
        js(setup + "Object.assign(s,{lat:34.0,lon:-45.0,heading:90,targetHeading:90,speed:10,throttle:10/sim.maxKt()}); A.armAway(8); P.snapshotSim(); P.checkpoint(); return 1")
        page.goto(base); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000)   # leaving the page stamps the real time, as when the app closes
        js("sim.away.real -= 3*3600*1000; return 1")                                                        # ...so pretend three hours passed
        page.tap("#board-btn"); page.wait_for_timeout(1200)
        title = page.inner_text(".modal h3") if page.is_visible(".modal h3") else ""
        body = page.inner_text(".modal") if page.is_visible(".modal") else ""
        check("after a reload ARIA briefs the Captain", "while you were away" in title.lower() or "we stopped" in title.lower(), title)
        check("the briefing reports the distance (about 30 nm in 3 hours)", "nautical miles" in body, body[:200])
        r = js("return {away: !!sim.away, lon: sim.s.lon}")
        check("the ship has moved on and the plan is gone", r["away"] is False and r["lon"] > -44.6, r)
        if page.is_visible(".modal .btn"): page.tap(".modal .btn"); page.wait_for_timeout(300)

        # 7. sleep dialog offers the new choice and the 'Good night' screen
        js("const s=sim.s; Object.assign(s,{docked:false,at:null,wpt:null,speed:0,throttle:0}); return 1")
        page.evaluate("window.__aq.scene('sleep')"); page.wait_for_timeout(500)
        txt = page.inner_text(".modal")
        check("the sleep dialog offers 'Crew has the con'", "crew has the con" in txt.lower(), txt[:120])
        page.evaluate("[...document.querySelectorAll('.modal .chip')].find(b=>b.textContent==='Crew has the con').click()"); page.wait_for_timeout(300)
        page.evaluate("[...document.querySelectorAll('.modal .btn')].find(b=>b.textContent==='Sleep').click()"); page.wait_for_timeout(500)
        check("'Good night' screen appears and the plan is armed", "good night" in page.inner_text(".modal").lower() and js("return !!sim.away") is True)
        page.evaluate("[...document.querySelectorAll('.modal .btn')].find(b=>b.textContent==='Wake up now').click()"); page.wait_for_timeout(500)
        check("waking at once clears the plan", js("return !!sim.away") is False)
        if page.is_visible(".modal .btn"): page.tap(".modal .btn")

        # 8. the phone shows an estimate from the plan
        ph = ctx.new_page(); ph.on("pageerror", lambda e: errors.append("ped: " + str(e)[:200]))
        status = {"t": "2026-11-20T00:00:00.000Z", "location": "Open water", "lat": 34.0, "lon": -45.0, "clock": "Day 1 06:00", "docked": False, "depth": 100, "heading": 90, "speed": 10, "battery": 90, "oxygen": 95, "hull": 100, "destination": None, "objectives": [], "discoveries": [],
                  "away": {"t": "", "maxH": 8, "armClock": 0, "clock": 0, "from": {"name": "Open water"}, "stop": None, "nm": 0, "plan": {"pts": [[34.0, -45.0], [34.0, -44.0], [34.0, -43.0]], "kt": 10, "nm": 99.4, "stopNm": None, "why": None, "dest": "Test Point"}}}
        import datetime
        status["away"]["t"] = (datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) - datetime.timedelta(hours=3)).isoformat() + "Z"
        ph.goto(root + "ped/index.html"); ph.evaluate("(s)=>{localStorage.setItem('aquaNovaPed', JSON.stringify({id:'x',name:'t',journals:[],tasks:[],status:s,syncedAt:null}));}", status); ph.reload(); ph.wait_for_timeout(800)
        ph.evaluate("document.querySelector('[data-tab=status]').click()"); ph.wait_for_timeout(300)
        t = ph.inner_text("#view")
        check("phone shows 'Crew has the con' with an estimate", "crew has the con" in t.lower() and "estimated position" in t.lower() and "nm to go" in t, t[:300])
        check("phone estimate is about 30 nm along (3 h at 10 kt)", any(f"34.00°N 44.{d}" in t for d in "345"), t[:300])
        check("no page errors", not errors, errors)
        browser.close()
    server.shutdown()
    print("\nAll checks passed." if not fails else f"\n{len(fails)} FAILED: {fails}")
    sys.exit(1 if fails else 0)
main()
