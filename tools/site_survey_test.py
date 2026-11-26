#!/usr/bin/env python3
"""Site survey (owner, 2026-11-26): hold station at a site for 30 game minutes: a detailed chart, a survey finding, and the
"Seabed survey" generated mission that waits on it.   python3 tools/site_survey_test.py"""
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
        js = lambda code: page.evaluate("(async()=>{const sim=(await import('./js/sim.js')).sim;const V=await import('./js/survey.js');const g=(await import('./js/persist.js')).gameState;const G=await import('./js/missionGen.js');const sf=(await import('./js/seafloor.js')).seafloor;" + code + "})()")
        page.goto(base + "?intake=0"); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=15000)
        page.tap("#board-btn"); page.wait_for_timeout(900)
        page.is_visible(".modal .btn") and page.tap(".modal .btn")
        # at a site, holding station
        place = "const s=sim.s, p=s.pois.find(q=>q.type!=='dock'&&q.type!=='sanctuary'&&q.type!=='hideout'); Object.assign(s,{docked:false,lat:p.lat,lon:p.lon,speed:0,throttle:0,depth:20,targetDepth:20}); s.at=p; window.__p=p;"
        r = js(place + "return {name:window.__p.name, block:V.surveyBlock(), before:V.surveyCount(window.__p), chart:sf.isCharted(window.__p.lat+2/60, window.__p.lon)}")
        check("at a site, holding station, a survey can start", r["block"] is None, r)
        # the SONAR page offers it
        page.evaluate("window.__aq.open('sensors')"); page.wait_for_timeout(1200)
        btn = page.locator('#station .bc:visible button:text-is("Survey site")')
        check("the SONAR page shows Survey site", btn.count() > 0 and btn.first.is_visible())
        if btn.count(): btn.first.tap(); page.wait_for_timeout(400)
        r = js("const v=V.surveying(); return v && {mins:(v.end-v.start)/60}")
        check("Survey site starts a 30 minute survey", r and r["mins"] == 30, r)
        r = js("const s=sim.s; for(let i=0;i<1700;i++) sim.step(1); const mid=!!V.surveying(); for(let i=0;i<200;i++) sim.step(1); const p=window.__p; return {mid, done:!V.surveying(), count:V.surveyCount(p), finding:(g.getProperty('mission.discoveries')||[]).some(f=>f.id==='survey-'+p.id), chart:sf.isCharted(p.lat+2/60, p.lon)}")
        check("it runs the full half hour", r["mid"], r)
        check("then the site is surveyed: count up, finding filed", r["done"] and r["count"] >= 1 and r["finding"], r)
        check("and the sea floor round it is charted in detail (2 nm out)", r["chart"], r)
        # moving off station breaks it off
        r = js(place + "V.startSurvey(); sim.s.lat+=1/60; for(let i=0;i<3;i++) sim.step(1); return {running:!!V.surveying()}")
        check("moving off station breaks the survey off", not r["running"], r)
        r = js(place + "sim.s.speed=6; return V.surveyBlock()")
        check("over 2 kt a survey will not start", r == "fast", r)
        # the generated mission
        r = js("const out=[]; for(let i=1;i<=8;i++){ const x=G.generate(3000+i*41,{type:'mapping'}); if(x) out.push({name:x.def.name, obj:x.def.objectives.map(o=>o.id), text:x.message.text}); } return out")
        check("the generator makes Seabed survey missions (go, survey, report)", r and all(x["name"].startswith("Seabed survey: ") and x["obj"] == ["go", "survey", "report"] for x in r), r[:2])
        check("the briefing asks for a survey", r and all("survey" in x["text"].lower() for x in r), r[:1])
        r = js("const out=new Set(); for(let i=1;i<=40;i++){ const x=G.generate(5000+i*13,{}); if(x) out.add(x.def.gen.type); } return [...out]")
        check("Seabed survey is among the random mission types", "mapping" in r, r)
        # accept one: it needs a fresh survey at its site
        r = js("""const gs=g.getProperty('mission.gen'); if(gs){gs.offer=null;gs.active=null;} const x=G.makeOffer({type:'mapping',compulsory:false}); if(!x) return null; for(let i=0;i<8;i++) sim.step(6);
          const id=x.def.id, ok=G.acceptOffer(id); const ob=(g.getProperty('mission.objectives')||[]).find(o=>o.id===id+'_survey'); const prop=g.getProperty('mission.gen').defs[id].objectives.find(o=>o.id==='survey').triggers[0]; return {ok, status:ob&&ob.status, need:prop.value, prop:prop.property}""")
        check("accepting a Seabed survey asks for a fresh survey (count + 1)", r and r["ok"] and r["status"] != "completed" and r["need"] >= 1, r)
        if r and r["ok"]:
            pid = r["prop"].split(".p")[-1]
            r2 = js(f"""const s=sim.s, p=s.pois.find(q=>String(q.id)==='{pid}'); s.at=null; Object.assign(s,{{docked:false,lat:p.lat+1/60,lon:p.lon,speed:0,throttle:0}}); for(let i=0;i<3;i++) sim.step(6); s.lat=p.lat; s.lon=p.lon; for(let i=0;i<5;i++) sim.step(6); const arrived=s.at&&s.at.id;
              const st=V.startSurvey(); for(let i=0;i<1900;i++) sim.step(1); for(let i=0;i<3;i++) sim.step(6); return {{st, arrived, objs:(g.getProperty('mission.objectives')||[]).filter(o=>o.id.startsWith('gen_')).map(o=>o.id+':'+o.status)}}""")
            check("surveying the mission's site completes its survey objective", r2["st"]["ok"] and any(o.endswith("_survey:completed") for o in r2["objs"]), r2)
        check("no page errors", not errors, str(errors))
        browser.close()
    server.shutdown()
    print(f"\n{len(fails)} failure(s)"); sys.exit(1 if fails else 0)
if __name__ == "__main__":
    main()
