#!/usr/bin/env python3
"""The engineering computer (docs/ENGINEERING.md): healthy = unchanged ship; relays, scrubbers, O2, fusion drive, fire, flooding,
bulkheads, repairs, emergency blow, and the page.   python3 tools/eng_test.py"""
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
    errors = []
    with sync_playwright() as p:
        browser = smoke.launch(p)
        page = browser.new_context(viewport={"width": 1180, "height": 820}, has_touch=True).new_page()
        page.on("pageerror", lambda e: errors.append(str(e)[:200]))
        js = lambda code: page.evaluate("(async()=>{const S=await import('./js/sim.js'); const sim=S.sim; const E=await import('./js/engineering.js');" + code + "})()")
        page.goto(base + "?intake=0"); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=15000)
        page.tap("#board-btn"); page.wait_for_timeout(900)
        page.is_visible(".modal .btn") and page.tap(".modal .btn")
        fresh = "const s=sim.s; s.eng=null; S.setTimeScale(1); Object.assign(s,{docked:false,at:null,lat:40.2,lon:-72.0,depth:100,targetDepth:100,speed:0,throttle:0,heading:0,cruise:false,damage:0,oxygen:100,scrubbers:100,battery:100,sonar:true,lights:true,wskrs:[],rov:null}); E.eng();"
        run = lambda secs: js(f"for(let i=0;i<{int(secs/60)};i++) sim.step(60); return 1")
        # healthy: nothing changes
        js(fresh); run(3600)
        r = js("const s=sim.s, e=E.eng(); return {co2x:e.co2x, tank:e.o2tank, o2:s.oxygen, water:e.water, cabin:e.cabin}")
        check("healthy and on: no extra CO2, O2 tank and air full, water full, cabin at 21 C", r["co2x"] == 0 and r["tank"] == 100 and r["o2"] > 99 and r["water"] == 100 and abs(r["cabin"] - 21) < 0.5, r)
        # relays
        r = js(fresh + "E.setRelay('C', false); sim.step(1); const sonar=s.sonar; E.setRelay('C', true); E.setRelay('A', false); s.throttle=1; for(let i=0;i<30;i++) sim.step(1); const sp=s.speed; E.setRelay('A', true); for(let i=0;i<30;i++) sim.step(1); return {sonar, sp, sp2:s.speed}")
        check("relay C open: the sonar goes off", r["sonar"] is False, r)
        check("relay A open: no propulsion; closed again: she moves", r["sp"] < 0.5 and r["sp2"] > 1, r)
        # scrubbers and O2
        r = js(fresh + "const c0=s.co2; E.setScrub('off'); for(let i=0;i<60;i++) sim.step(60); const c1=s.co2; E.setScrub('boost'); for(let i=0;i<60;i++) sim.step(60); return {c0, c1, c2:s.co2}")
        check("scrubbers off submerged: CO2 climbs about 0.5% an hour; boost clears it", r["c1"] - r["c0"] > 0.4 and r["c2"] < r["c1"] - 0.3, r)
        r = js(fresh + "E.setOn('o2', false); for(let i=0;i<120;i++) sim.step(60); const t=E.eng().o2tank, o=s.oxygen; return {t, o}")
        check("O2 generator off submerged: the O2 tank goes down first", r["t"] < 90 and r["o"] > 99, r)
        # fusion drive
        r = js(fresh + "E.setOn('fusion', false); const x=sim.setCruise(true); return {why:x.why}")
        check("fusion drive on standby: super cruise refused", r["why"] == "fusion", r)
        # fire
        r = js(fresh + "sim.hurt(10,'test'); sim.step(1); const fire=!!E.eng().fire; for(let i=0;i<25;i++) sim.step(1); return {fire, after:!!E.eng().fire, agent:E.eng().agent}")
        check("a hard hit starts a fire; armed suppression puts it out (agent used)", r["fire"] and not r["after"] and r["agent"] == 75, r)
        r = js(fresh + "for(let i=0;i<31;i++) sim.step(1); E.setArmed(false); sim.hurt(10,'test'); for(let i=0;i<60;i++) sim.step(1); const burning=!!E.eng().fire; const x=E.discharge(); return {burning, ok:x.ok, out:!E.eng().fire}")
        check("disarmed: the fire burns until the Captain discharges", r["burning"] and r["ok"] and r["out"], r)
        # flooding and bulkheads
        r = js(fresh + "for(let i=0;i<31;i++) sim.step(1); E.setArmed(true); sim.hurt(14,'test'); for(let i=0;i<30;i++) sim.step(1); const e=E.eng(), c=e.leak.fwd?'fwd':'aft'; const d0=s.damage; for(let i=0;i<20;i++) sim.step(1); const d1=s.damage; for(let i=0;i<45;i++) sim.step(1); const auto=!e.bulk[c]; const d2=s.damage; for(let i=0;i<3;i++) sim.step(60); const d3=s.damage; return {leak:e.leak[c], c, d0, d1, d2, d3, auto, bh:e.health.bulkheads}")
        check("a very hard hit opens a leak; with the bulkhead open the hull suffers", r["leak"] and r["d1"] > r["d0"], r)
        check("left open, the damage-control crew close the bulkhead after a minute", r["auto"], r)
        check("closed, the flooding is contained (no more hull loss)", abs(r["d3"] - r["d2"]) < 0.01, r)
        r = js("const e=E.eng(); const x=E.repair('bulkheads'); for(let i=0;i<120;i++) sim.step(60); return {ok:x.ok, leak:e.leak.fwd||e.leak.aft, flood:Math.max(e.flood.fwd,e.flood.aft), hp:e.health.bulkheads}")
        check("repairing Bulkheads seals the leak and the pumps clear the water", r["ok"] and not r["leak"] and r["flood"] == 0 and r["hp"] == 100, r)
        # repairs: two teams, 25 an hour
        r = js(fresh + "const e=E.eng(); e.health.water=50; e.health.hvac=50; e.health.air=50; const a=E.repair('water'), b=E.repair('hvac'), c=E.repair('air'); for(let i=0;i<60;i++) sim.step(60); return {a:a.ok, b:b.ok, c:c.why, w:e.health.water}")
        check("two damage-control teams; a third job waits", r["a"] and r["b"] and r["c"] == "teams", r)
        check("a team restores about 25 health an hour", 73 <= r["w"] <= 77, r)
        # emergency blow
        r = js(fresh + "const x=E.blow(); return {ok:x.ok, tgt:s.targetDepth, air:E.eng().air}")
        check("emergency blow: surfaces and uses 60% of the air charge", r["ok"] and r["tgt"] == 0 and r["air"] == 40, r)
        # the page
        js(fresh + "return 1")
        page.evaluate("window.__aq.scene('engineering')"); page.wait_for_timeout(300)
        page.locator('.scene.engineering .hs', has_text='ENGINEERING CONSOLE').dispatch_event('click'); page.wait_for_timeout(700)
        t = page.inner_text("#station")
        check("the Engineering console opens the engineering computer with all ten systems", "QUANTUM FUSION DRIVE" in t and all(k in t for k in ("POWER RELAYS", "PROPULSION", "CO2 SCRUBBERS", "O2", "WATER", "HEATING/COOLING", "FIRE SUPPRESSION", "BULKHEADS", "BALLAST", "AIR CHARGE")), t[:200])
        page.locator('.eng-sys', has_text='CO2 SCRUBBERS').first.tap(); page.wait_for_timeout(300)
        page.locator('#station .btn', has_text='BOOST').first.tap(); page.wait_for_timeout(300)
        check("tapping a system shows its controls; BOOST sets the scrubbers", js("return E.eng().scrubMode") == "boost")
        check("no page errors", not errors, str(errors))
        browser.close()
    server.shutdown()
    print(f"\n{len(fails)} failure(s)"); sys.exit(1 if fails else 0)
if __name__ == "__main__":
    main()
