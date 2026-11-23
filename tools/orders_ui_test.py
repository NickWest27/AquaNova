#!/usr/bin/env python3
"""Comms Orders card: request orders, offer in the inbox with Accept/Decline, Quit with confirmation, Standing card.  python3 tools/orders_ui_test.py"""
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
    pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
    js = lambda code: pg.evaluate("(async()=>{const sim=(await import('./js/sim.js')).sim;const G=await import('./js/missionGen.js');const {gameState}=await import('./js/persist.js');" + code + "})()")
    pg.goto(base); pg.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000); pg.tap("#board-btn"); pg.wait_for_timeout(800)
    if pg.is_visible(".modal .btn"): pg.tap(".modal .btn"); pg.wait_for_timeout(300)
    js("const s=sim.s, c=s.pois.find(p=>p.type==='dock'); Object.assign(s,{lat:c.lat-0.3,lon:c.lon-0.1,docked:false,at:null,wpt:null,speed:0,throttle:0,depth:5,targetDepth:5,hull:100}); const g=gameState.getProperty('mission.gen'); if(g){g.offer=null;g.active=null;g.nextAt=null}")
    pg.evaluate("window.__aq.open('comms')"); pg.wait_for_timeout(500)
    pg.locator(".tabs .btn:text-matches('Mail')").first.tap(); pg.wait_for_timeout(300)
    check("Orders and Standing cards are on the mail tab", pg.get_by_text("Orders", exact=True).count() >= 1 and pg.get_by_text("Standing", exact=True).count() >= 1)
    pg.get_by_text("Request new orders").tap(); pg.wait_for_timeout(300)
    check("request sets the offer timer", js("return gameState.getProperty('mission.gen').nextAt") is not None)
    js("for(let i=0;i<400;i++) sim.step(6)"); pg.wait_for_timeout(500)
    st = js("const g=gameState.getProperty('mission.gen'); return {offer:!!g.offer, delivered:g.offer&&g.offer.delivered}")
    check("an offer arrives after the request", st["offer"] and st["delivered"], str(st))
    pg.wait_for_timeout(300); pg.locator(".mail-row").first.tap(); pg.wait_for_timeout(900)
    check("the offer shows Accept and Decline", pg.get_by_text("Accept mission").count() == 1 and pg.locator(".mail-tail .btn:text-matches('Decline')").count() == 1)
    pg.screenshot(path=os.path.join(R, "tools/shots/orders_offer.png"))
    pg.locator(".mail-tail .btn:text-matches('Decline')").tap(); pg.wait_for_timeout(300)
    check("decline closes the offer", js("return gameState.getProperty('mission.gen').offer") is None)
    js("const g=gameState.getProperty('mission.gen'); g.nextAt=null"); js("G.makeOffer({type:'survey',compulsory:false}); for(let i=0;i<10;i++) sim.step(6)")
    pg.locator('.mail-back').click(position={'x':5,'y':5}); pg.wait_for_timeout(700)
    js("const g=gameState.getProperty('mission.gen'); G.acceptOffer(g.offer.id)"); pg.wait_for_timeout(1500)
    check("the card shows the active mission and Quit", pg.get_by_text("Quit mission").count() == 1)
    pg.get_by_text("Quit mission").tap(); pg.wait_for_timeout(200)
    check("quit asks for a second tap", pg.get_by_text("Tap again to quit").count() == 1)
    pg.screenshot(path=os.path.join(R, "tools/shots/orders_quit.png"))
    pg.get_by_text("Tap again to quit").tap(); pg.wait_for_timeout(500)
    check("second tap quits", js("return G.hasActive()") is False)
    check("no page errors", not errs, str(errs[:3]))
    b.close()
print("FAILED: " + ", ".join(fails) if fails else "all ok"); raise SystemExit(1 if fails else 0)
