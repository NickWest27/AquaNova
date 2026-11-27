#!/usr/bin/env python3
"""Launch bay cycle sounds (owner, 2026-11-27): hatches quick, the flood or pump takes most of the cycle.
Launch: hatchOpen, hatchClose, flood ... hatchOpen, (craft away) hatchClose. Recovery: hatchOpen, hatchClose, pump ... hatchOpen, hatchClose.
Uses the window.__sfxLog hook in audio.js.   python3 tools/bay_sound_test.py"""
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import smoke
from playwright.sync_api import sync_playwright
fails = []
def check(n, ok, x=""):
    print(("ok   " if ok else "FAIL ") + n + (f"  {x}" if x and not ok else "")); ok or fails.append(n)
server, site = smoke.start_server(); base = f"http://127.0.0.1:{server.server_address[1]}/AquaNova/tablet/"
with sync_playwright() as p:
    b = smoke.launch(p); pg = b.new_context(viewport={"width": 1180, "height": 820}, has_touch=True).new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(base + "?intake=0"); pg.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000)
    pg.tap("#board-btn"); pg.wait_for_timeout(900)
    r = pg.evaluate("""(async()=>{const sim=(await import('./js/sim.js')).sim, B=await import('./js/bayops.js'); const s=sim.s;
      Object.assign(s,{docked:false,speed:0,throttle:0,depth:50,targetDepth:50}); for(let i=0;i<3;i++){sim.step(1); sim.emit('tick');}
      const BAY=['hatchOpen','hatchClose','airlockFlood','airlockDrain','loop:bayFlood','loop:bayPump'], run=()=>{ const out=[]; for(let i=0;i<80;i++){ window.__sfxLog=[]; sim.step(1); sim.emit('tick'); const op=B.bay().op; for(const x of window.__sfxLog) if(BAY.includes(x)) out.push([x, op?Math.round(op.t):99]); } return out; };
      const L=B.launchRemora(); const a=run(); window.__sfxLog=[]; await new Promise(r=>setTimeout(r,3000)); const after=window.__sfxLog.slice();
      const R=B.recoverRemora(); const c=run(); return {L:L.ok, a, after, R:R.ok, c};})()""")
    seq = lambda xs: [x for x, _ in xs]
    check("launch: inner hatch open, close, flood, outer hatch open", r["L"] and seq(r["a"]) == ["hatchOpen", "hatchClose", "airlockFlood", "loop:bayFlood", "hatchOpen"], r["a"])
    check("launch: the flood runs for most of the cycle (hatches near the ends)", r["a"] and r["a"][1][1] <= 8 and r["a"][-1][1] >= 44, r["a"])
    check("launch: the outer hatch closes after the craft is away", "hatchClose" in r["after"], r["after"])
    check("recovery: outer hatch open, close, pump, inner hatch open, close", r["R"] and seq(r["c"]) == ["hatchOpen", "hatchClose", "airlockDrain", "loop:bayPump", "hatchOpen", "hatchClose"], r["c"])
    check("no page errors", not errs, errs)
    b.close()
server.shutdown()
print(f"\n{len(fails)} failure(s)"); sys.exit(1 if fails else 0)
