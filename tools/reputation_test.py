#!/usr/bin/env python3
"""Reputation: deltas, spill-over once, cap, no drift, tiers, accident -> civil, Tern refuses an enemy dock.  python3 tools/reputation_test.py"""
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
    js = lambda code: pg.evaluate("(async()=>{const sim=(await import('./js/sim.js')).sim;const Rp=await import('./js/reputation.js');const B=await import('./js/bayops.js');" + code + "})()")
    pg.goto(base); pg.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000); pg.tap("#board-btn"); pg.wait_for_timeout(800)
    if pg.is_visible(".modal .btn"): pg.tap(".modal .btn"); pg.wait_for_timeout(300)
    r = js("return Rp.all().map(x=>[x.id,x.value,x.tier])")
    check("seven groups at their start values", len(r) == 7 and dict((a, v) for a, v, _ in r)["oera"] == 10, str(r))
    m = js("const a=Rp.rep('pirates'),h=Rp.rep('hostile_navy'),n=Rp.rep('allied_navy'),o=Rp.rep('oera'); const mv=Rp.applyDeltas({pirates:-8},'test'); return {mv, d:{p:Rp.rep('pirates')-a,h:Rp.rep('hostile_navy')-h,n:Rp.rep('allied_navy')-n,o:Rp.rep('oera')-o}}")
    check("direct change applies", abs(m["d"]["p"] + 8) < 0.01, str(m))
    check("spill-over: allied navy rises when pirates fall (-8 x -0.5 x 0.4 = +1.6)", abs(m["d"]["n"] - 1.6) < 0.11, str(m))
    check("spill-over is not chained (hostile navy moves 8x0.1x0.4=-0.3 at most)", abs(m["d"]["h"]) <= 0.4, str(m))
    c = js("const a=Rp.rep('science'); Rp.applyDeltas({science:50}); return Rp.rep('science')-a")
    check("one event is capped at 10", abs(c - 10) < 0.01, str(c))
    d = js("const a=Rp.rep('civil'); sim.step(3600*20); return Rp.rep('civil')-a")
    check("no drift back with time", d == 0, str(d))
    t = js("Rp.applyDeltas({civil:-10});Rp.applyDeltas({civil:-10});Rp.applyDeltas({civil:-10});Rp.applyDeltas({civil:-10});Rp.applyDeltas({civil:-10});Rp.applyDeltas({civil:-10}); return [Rp.rep('civil'),Rp.tier('civil')]")
    check("tier follows the number (Cold below -50 is not reached at -60? it is Cold)", t[1] in ("Cold", "Hostile"), str(t))
    a = js("const a=Rp.rep('civil'); sim.emit('bump',{kind:'ship',damage:3}); return Rp.rep('civil')-a")
    check("a collision costs civil standing", a < 0, str(a))
    e = js("const d=sim.s.pois.filter(p=>p.type==='dock'); const f=d.find(p=>p.faction==='foreign'), c=d.find(p=>p.faction==='civil'); return {foreign:!!f&&Rp.enemyDock(f), civil:!Rp.enemyDock(c), refuse: f?B.sendShuttle(f).why:null}")
    check("enemy dock is refused, civil dock is not", e["foreign"] and e["civil"] and e["refuse"] == "enemy", str(e))
    s = js("const {gameState}=await import('./js/persist.js'); return gameState.getProperty('mission.reputation').v.pirates")
    check("saved in mission.reputation", s is not None, str(s))
    check("no page errors", not errs, str(errs))
    b.close()
print("FAILED: " + ", ".join(fails) if fails else "all ok"); raise SystemExit(1 if fails else 0)
