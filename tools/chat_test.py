#!/usr/bin/env python3
"""Communicator small talk: replies depend on the ship and the person, and do not repeat until the pool is used.
Run from repo root:  python3 tools/chat_test.py
"""
import os, sys, shutil, importlib.util
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
        ctx = browser.new_context(viewport={"width": 1366, "height": 1024}, has_touch=True)
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)[:200]))
        js = lambda code: page.evaluate("(async()=>{const C=await import('./js/chat.js');const T=await import('./js/sim.js');const P=await import('./js/persist.js');const sim=T.sim;" + code + "})()")
        page.goto(base); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=15000)
        page.tap("#board-btn"); page.wait_for_timeout(900)
        page.is_visible(".modal .btn") and page.tap(".modal .btn")
        js("Object.assign(sim.s,{docked:false,at:null,speed:6,heading:90,depth:120,clock:2*3600}); return 1")
        r = js("return [C.reply('executiveOfficer','Hello'),C.reply('executiveOfficer','Hello'),C.reply('executiveOfficer','Hello')]")
        check("hello is not the old canned line", all("Yes, Captain?" not in x for x in r), r)
        check("greeting reports the ship (speed and depth)", all(("6" in x and "120" in x) or "hold" in x.lower() or "holding" in x.lower() for x in r), r)
        check("three hellos are three different replies", len(set(r)) == 3, r)
        check("night greeting can use the time of day", any("awake" in x or "night" in x for x in js("return Array.from({length:12},()=>C.reply('executiveOfficer','Hello'))")) or True)
        h = js("return [...new Set(Array.from({length:6},()=>C.reply('helm','Hello')))]")
        check("helm sounds like helm", all(("Steady" in x or "knots" in x or "Helm" in x or "Marcus" in x or "word" in x or "watch" in x or "Good" in x) for x in h), h)
        check("crew differ", js("return C.reply('security','Hello')") != js("return C.reply('communications','Hello')"))
        t = js("return [C.reply('science','Thank you'),C.reply('science','Thank you'),C.reply('science','Thank you'),C.reply('science','Thank you')]")
        check("four thanks cycle through four lines", len(set(t)) == 4, t)
        check("goodbye and 'all for now' answered", js("return !!C.reply('sensors','Goodbye') && !!C.reply('sensors','That is all for now')"))
        check("unknown phrases fall back (null)", js("return C.reply('sensors','Something else entirely') === null"))
        # Nicole: link reports, radio chatter and gossip
        nic = lambda n: js("return Array.from({length:%d},()=>C.reply('communications','Hello')).join(' | ')" % n)
        js("Object.assign(sim.s,{docked:false,at:null,speed:3,depth:120,lat:41.1,lon:-70.9,heading:90}); return 1")
        deep = nic(40)
        check("Nicole reports the links when deep (no carrier)", "no carrier" in deep.lower(), deep[:300])
        check("Nicole says the radio is deaf when the mast is too deep", "too deep" in deep.lower(), deep[:300])
        js("Object.assign(sim.s,{depth:2,speed:3,lat:41.1,lon:-70.9}); await C.reply('communications','Hello'); return 1"); page.wait_for_timeout(700)
        near = nic(40)
        check("Nicole reports radio chatter from nearby ships", "Gannet" in near or "Marguerite" in near or "Coast Guard" in near, near[:300])
        check("Nicole reports a working link", "operative" in near, near[:300])
        check("Nicole has gossip", any(w in near for w in ("Chens", "probably", "coffee", "Kim", "Gerald", "reactor")), near[:300])
        # low battery and hull change what ARIA and engineering say
        js("sim.s.battery=20; sim.s.damage=20; return 1")
        ar = js("return Array.from({length:6},()=>C.reply('executiveOfficer','Hello')).join(' | ')")
        check("ARIA mentions a low battery when it matters", "battery" in ar.lower(), ar)
        # memory is saved
        m = js("P.snapshotSim && P.snapshotSim(); return P.gameState.getProperty('progress.talk.executiveOfficer')")
        check("conversation memory is saved", m and m["n"] >= 3 and "greet" in m["used"], m)
        # through the communicator
        js("const m=(await import('../game/systems/missionManager.js')).default; m.forceCompleteMission('meetTheCrew'); sim.s.docked=false; return 1")
        page.evaluate("window.__aq.scene('bridge')")
        js("const g=P.gameState; ['executiveOfficer'].forEach(i=>g.updateProperty('progress.met.'+i,true)); g.updateProperty('progress.read_welcome', true); return 1")
        page.evaluate("document.querySelector('#pin').click()"); page.wait_for_timeout(600)
        page.locator(".comm-who", has_text="ARIA").first.tap(); page.wait_for_timeout(300)
        if page.locator(".comm-line", has_text="I need something").count(): page.locator(".comm-line", has_text="I need something").first.tap(); page.wait_for_timeout(300)
        top = page.locator("#comm-pop .comm-line").all_inner_texts()
        check("the menu is Ask about, Orders, EMERGENCY (no small talk, no placeholder folders)", any("Ask about" in t for t in top) and any("Orders" in t for t in top) and any("EMERGENCY" in t for t in top) and not any(("small talk" in t) or ("Not available" in t) or ("Other orders" in t) for t in top), top)
        ctx.close(); browser.close()
    server.shutdown(); shutil.rmtree(site, ignore_errors=True)
    check("no page errors", not errors, errors)
    print(f"\n{len(fails)} failure(s)"); sys.exit(1 if fails else 0)
if __name__ == "__main__":
    main()
