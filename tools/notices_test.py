#!/usr/bin/env python3
"""Notices on the upper display, crew calls elsewhere, safe course out, WSKRs, sonar detail.  python3 tools/notices_test.py"""
import os, re, sys, importlib.util
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
        ctx = browser.new_context(viewport={"width": 1180, "height": 820}, has_touch=True)
        page = ctx.new_page(); errors = []
        page.on("pageerror", lambda e: errors.append(str(e)[:200]))
        page.on("console", lambda m: errors.append(m.text[:200]) if m.type == "error" else None)
        js = lambda code: page.evaluate("(async()=>{const sim=(await import('./js/sim.js')).sim;const sf=(await import('./js/seafloor.js')).seafloor;const N=await import('./js/notify.js');const g=(await import('./js/persist.js')).gameState;" + code + "})()")
        page.goto(base); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000)
        page.tap("#board-btn"); page.wait_for_timeout(1500)
        if page.is_visible(".modal .btn"): page.tap(".modal .btn"); page.wait_for_timeout(300)
        js("const m=(await import('../game/systems/missionManager.js')).default; m.forceCompleteMission('meetTheCrew')")
        page.evaluate("window.__aq.scene('bridge')"); page.wait_for_timeout(500)

        # 1. bridge: upper display only
        shown0 = page.evaluate("window.__aq.notify.shown")
        js("N.say('helm', 'Test notice one'); (await import('./js/util.js')).toast('Test toast two')"); page.wait_for_timeout(700)
        check("notice shows on the upper display", "TEST TOAST TWO" in page.inner_text(".bt-note").upper() or "TEST NOTICE ONE" in page.inner_text(".bt-note").upper(), page.inner_text(".bt-note"))
        check("no pop-up toast on the bridge", page.locator("#console-line .toast").count() == 0)
        check("no crew card on the bridge", page.evaluate("window.__aq.notify.shown") == shown0)
        # undock with no modal
        js("sim.s.docked = true; sim.s.at = sim.dockPoi(); (await import('./js/dock.js')).toggleDock()"); page.wait_for_timeout(1500)
        check("undock sequence shows no modal", page.locator(".modal").count() == 0)
        page.wait_for_timeout(3500)
        check("undocked", js("return sim.s.docked") is False)

        # 2. in a station: chirp message, coalesced
        page.evaluate("window.__aq.open('helm')"); page.wait_for_timeout(500)
        c0 = page.evaluate("window.__aq.notify.chirps")
        js("N.say('helm', 'One'); N.say('helm', 'Two'); N.say('sensors', 'Three'); N.say('engineering', 'Four'); N.say('aria', 'Five')"); page.wait_for_timeout(400)
        check("crew message shows on the docked console line", "ARIA" in page.inner_text("#console-line") or "Commander" in page.inner_text("#console-line"), page.inner_text("#console-line"))
        check("no floating crew cards", page.locator(".crew-card, .toast").count() == 0)
        check("one chirp for a burst of messages", page.evaluate("window.__aq.notify.chirps") - c0 <= 1, page.evaluate("window.__aq.notify.chirps") - c0)
        page.tap("#station .st-head .btn"); page.wait_for_timeout(300)

        # 3. safe course out of the harbour
        r = js("""const s=sim.s; const d=sim.dockPoi(); s.lat=d.lat; s.lon=d.lon; s.at=d; s.docked=true; s.depth=0; s.targetDepth=0; s.speed=0; s.throttle=0; s.damage=0;
          const c=sim.safeHeading(); return c;""")
        check("a safe heading exists from the dock", r and r["clearNm"] >= 1, r)
        page.evaluate("document.querySelector('#pin').click()"); page.wait_for_timeout(600)
        page.locator(".comm-who", has_text="ARIA").first.tap(); page.wait_for_timeout(300)
        if page.locator(".comm-line", has_text="Give an order").count() == 0: page.locator(".comm-line", has_text=re.compile("One more thing|I need something")).first.tap(); page.wait_for_timeout(300)
        page.locator(".comm-line", has_text="Give an order").first.tap(); page.wait_for_timeout(300)
        page.locator(".comm-line", has_text="take her to sea").first.tap(); page.wait_for_timeout(5500)
        r = js("const s=sim.s; return {docked:s.docked, thr:s.throttle, td:s.targetDepth, hdg:s.targetHeading}")
        check("take her to sea: undocked, surface, slow", r["docked"] is False and r["thr"] <= 0.35 and r["td"] == 0, r)
        r2 = js("""const s=sim.s; const h=sim.s.targetHeading*Math.PI/180; let min=1e9; for(let d=0.1; d<=1; d+=0.1){ const f=sf.depthAt(s.lat+d*Math.cos(h)/60, s.lon+d*Math.sin(h)/(60*Math.cos(s.lat*Math.PI/180))); min=Math.min(min,f);} return min""")
        check("course stays in water for a mile", r2 >= 3, r2)
        # dive clamp
        r = js("""const s=sim.s; s.docked=false; s.lat=41.2; s.lon=-70.7; s.at=null; s.speed=0; s.depth=0; s.targetDepth=0; return sim.deepest()""")
        page.locator(".comm-line", has_text="Someone else").first.tap(); page.wait_for_timeout(300)
        page.locator(".comm-who").filter(has_text="Marcus").first.tap() if page.locator(".comm-who", has_text="Marcus").count() else None
        page.wait_for_timeout(300)
        page.locator(".comm-line", has_text="Give an order").first.tap(); page.wait_for_timeout(300)
        page.locator(".comm-line", has_text="Make your depth").first.tap(); page.wait_for_timeout(300)
        page.locator(".comm-line", has_text="1000 m").first.tap(); page.wait_for_timeout(400)
        td = js("return sim.s.targetDepth")
        check("depth order is held above the floor", r is not None and td <= r, (td, r))
        page.locator(".comm-line", has_text="That's all").first.tap(); page.wait_for_timeout(400)
        check("That's all. Out. closes the communicator", not page.is_visible("#comm-pop .comm-page"))

        # 3b. held messages: a missed message waits in the communicator
        page.evaluate("window.__aq.scene('bridge')"); page.wait_for_timeout(300)
        js("N.clearHeld && N.clearHeld(); N.say('comms', 'Captain, sorry to interrupt, but we have an incoming message.', 'mission', { notice: 'INCOMING MESSAGE', keep: 'We have an incoming message from Test. It is waiting at the Comms station.' })"); page.wait_for_timeout(500)
        check("upper display says Incoming message", "INCOMING MESSAGE" in page.inner_text(".bt-note").upper(), page.inner_text(".bt-note"))
        page.wait_for_timeout(6500)
        check("pin glows while a message is unread", "unread" in page.get_attribute("#pin", "class"))
        page.evaluate("document.querySelector('#pin').click()"); page.wait_for_timeout(600)
        check("communicator says messages are waiting", "waiting" in page.inner_text("#comm-pop"), page.inner_text("#comm-pop"))
        check("badge on the Comms officer", page.locator(".comm-badge").count() == 1, (page.locator(".comm-badge").count(), js("return Object.values(g.getProperty('contacts.crew')).map(c=>c.id+':'+c.known).join()")))
        page.locator(".comm-who").filter(has=page.locator(".comm-badge")).first.tap(); page.wait_for_timeout(400)
        check("held message shown in the dialogue area", "incoming message from Test" in page.inner_text(".comm-reply"), page.inner_text(".comm-reply"))
        check("pin stops glowing once read", "unread" not in page.get_attribute("#pin", "class"))
        check("first line offers I need something", page.locator(".comm-line", has_text="I need something").count() == 1)
        check("Someone else label", page.locator(".comm-line", has_text="Someone else").count() == 1 and page.locator(".comm-line", has_text="Put me through").count() == 0)
        page.mouse.click(8, 8); page.wait_for_timeout(400)
        check("tap outside closes the communicator", not page.is_visible("#comm-pop .comm-page"))

        # 3c. objectives are not held in the communicator
        n0 = js("return N.unreadCount()")
        page.evaluate("document.dispatchEvent(new CustomEvent('mission-notify', { detail: { title: 'Test objective', subtitle: 'New Objective' } }))"); page.wait_for_timeout(300)
        check("mission objectives are not held for the communicator", js("return N.unreadCount()") == n0)

        # 4. sonar sets map detail
        page.evaluate("window.__aq.scene('bridge')"); page.wait_for_timeout(500)
        rad = lambda: page.evaluate("window.__aq.console().nds[0].fineRadius()")
        js("sim.s.sonar=true; sim.s.sweepUntil=0"); on = rad()
        js("sim.s.sonar=false"); off = rad()
        js("sim.s.sonar=true; sim.s.sweepUntil=sim.s.clock+1800"); sweep = rad()
        js("sim.s.sweepUntil=0")
        check("sonar on charts 4 nm, off 0.8 nm, sweep 8 nm", (on, off, sweep) == (4, 0.8, 8), (on, off, sweep))
        # 5. WSKRs
        r = js("""const s=sim.s; s.docked=false; s.lat=39.45; s.lon=-72.25; s.at=null; s.speed=0; s.throttle=0; s.depth=0; s.targetDepth=0; s.wskrs=[]; s.sonar=true;
          for (let i=0;i<3;i++) sim.deployWskr(); for(let i=0;i<400;i++) sim.step(0.2);
          const t=(await import('./js/sim.js')).toward; return s.wskrs.map(w=>+t(s,w).nm.toFixed(2))""")
        check("three WSKRs hold a ring round the ship", len(r) == 3 and all(1.0 < d < 2.0 for d in r), r)
        r = js("""const s=sim.s; const p=s.pois.find(q=>q.name==='Deep Trench Alpha'); const w=sim.taskWskr(p); const n=w.n; for(let i=0;i<900;i++) sim.step(0.2);
          const fd=(await import('./js/findings.js')); return {scanned:fd.scanned(p), mode:s.wskrs.find(q=>q.n===n).mode}""")
        check("a tasked WSKR investigates, files the scan and rejoins", r["scanned"] and r["mode"] == "escort", r)
        r = js("sim.recallWskrs(); for(let i=0;i<600;i++) sim.step(0.2); return sim.s.wskrs.length")
        check("recalled WSKRs come home", r == 0, r)
        page.evaluate("window.__aq.open('sensors')"); page.wait_for_timeout(500)
        check("Sensors station offers Deploy WSKR", page.is_visible('#station button:text-is("Deploy WSKR")'))
        page.screenshot(path=os.path.join(ROOT, "tools", "shots", "sensors_wskr.png"))
        check("no console errors", not errors, errors)
        browser.close()
    server.shutdown()
    print("\nFAILED: " + ", ".join(fails) if fails else "\nAll checks passed.")
    sys.exit(1 if fails else 0)
main()
