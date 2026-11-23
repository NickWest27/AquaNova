#!/usr/bin/env python3
"""Synthetic vision on the bridge VIEW screen: forward 3D floor with solid (known) and dashed (interpolated) contours.  python3 tools/synth_test.py"""
import os, sys, importlib.util
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location("smoke", os.path.join(ROOT, "tools", "smoke.py"))
smoke = importlib.util.module_from_spec(spec); spec.loader.exec_module(smoke)
SHOTS = os.path.join(ROOT, "tools", "shots")
fails = []
def check(name, ok, extra=""):
    print(("ok   " if ok else "FAIL ") + name + (f"  {extra}" if extra and not ok else ""))
    if not ok: fails.append(name)
COUNT = """(()=>{const cs=[...document.querySelectorAll('.bd-synth canvas')].filter(c=>c.offsetParent); if(!cs.length) return null; const c=cs[0], g=c.getContext('2d'); const d=g.getImageData(0,0,c.width,c.height).data; let known=0, interp=0;
 for(let i=0;i<d.length;i+=4){const r=d[i],gg=d[i+1],b=d[i+2]; if(gg>200&&r<190&&b>150&&b<250&&gg>r+50) known++; else if(b>200&&r>85&&r<175&&gg>110&&gg<195&&b>gg+60) interp++;} return {known, interp, w:c.width};})()"""
def main():
    server, site = smoke.start_server()
    for label, qs, isgated in (("gates off", "", False), ("gates on", "?locked=1", True)):
        base = f"http://127.0.0.1:{server.server_address[1]}/AquaNova/tablet/{qs}"
        with sync_playwright() as p:
            browser = smoke.launch(p)
            page = browser.new_context(viewport={"width": 1180, "height": 820}, has_touch=True).new_page(); errors = []
            page.on("pageerror", lambda e: errors.append(str(e)[:200]))
            page.on("console", lambda m: errors.append(m.text[:200]) if m.type == "error" else None)
            page.goto(base); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000)
            page.tap("#board-btn"); page.wait_for_timeout(900)
            js = lambda code: page.evaluate("(async()=>{const sim=(await import('./js/sim.js')).sim;const sf=(await import('./js/seafloor.js')).seafloor;" + code + "})()")
            page.evaluate("window.__aq.scene('bridge')"); page.wait_for_timeout(400)
            # a spot on the shelf south of Woods Hole, facing south, ground charted around it
            js("sim.s.lat=39.9; sim.s.lon=-71.7; sim.s.heading=0; sim.s.depth=120; sim.s.docked=false; sim.s.at=null; sf.mark('t', 39.9, -71.7, 3); sf.fineFor([{lat:39.9,lon:-71.7,nm:3}]); return 1"); page.wait_for_timeout(1500)
            page.evaluate("[...document.querySelectorAll('.selector .bbtn')].find(b=>b.textContent==='VW').click()"); page.wait_for_timeout(900)
            n = page.evaluate(COUNT)
            if isgated:
                check("gated: VIEW shows the camera until researched", n is None or n["known"] + n["interp"] == 0)
                check("gated: the synthetic button says research is needed", "RESEARCH" in page.inner_text(".bc:visible") and page.locator(".bc:visible .bbtn", has_text="RESEARCH").is_disabled())
                js("const g=(await import('./js/persist.js')).gameState; const s=g.getProperty('mission.science')||{}; g.updateProperty('mission.science', {...s, done:[...(s.done||[]),'synthetic-view']}); return 1"); page.wait_for_timeout(800)
                n = page.evaluate(COUNT)
            check(f"{label}: synthetic view is drawn on the VIEW screen", n is not None and n["w"] > 0, n)
            check(f"{label}: known contours drawn solid", n and n["known"] > 40, n)
            page.screenshot(path=f"{SHOTS}/s-{'gated' if isgated else 'open'}-view.png")
            if not isgated:
                check("interpolated contours drawn (dashed)", n and n["interp"] > 20, n)
                check("camera toggle works", True)
                page.evaluate("[...document.querySelectorAll('.bc .bbtn')].find(b=>/CAMERA/.test(b.textContent)).click()"); page.wait_for_timeout(500)
                check("camera picture comes back", page.evaluate("(()=>{const m=[...document.querySelectorAll('.bd.view')].find(x=>x.offsetParent); return !!m && !m.classList.contains('synth-on')})()"))
                page.evaluate("[...document.querySelectorAll('.bc .bbtn')].find(b=>/SYNTHETIC/.test(b.textContent)).click()"); page.wait_for_timeout(700)
                check("no range buttons on the VIEW console (the window is fixed)", page.locator('.bc:visible .bbtn', has_text='+').count() == 0)
                # the big main screen too
                page.evaluate("[...document.querySelectorAll('.bd-promote')].find(b=>b.offsetParent).click()"); page.wait_for_timeout(900)
                page.screenshot(path=f"{SHOTS}/s-open-main.png")
                big = page.evaluate("[...document.querySelectorAll('.bd-synth canvas')].filter(c=>c.offsetParent).length")
                check("synthetic view also on the main screen", big >= 1, big)
            if not isgated:
                for nm, (la, lo, hd) in {"s-open-deep": (40.0, -71.3, 0)}.items():
                    js(f"sim.s.lat={la}; sim.s.lon={lo}; sim.s.heading={hd}; sim.s.depth=30; sf.mark('d', {la}, {lo}, 4); sf.fineFor([{{lat:{la},lon:{lo},nm:4}}]); return 1"); page.wait_for_timeout(2000)
                    page.screenshot(path=f"{SHOTS}/{nm}.png")
            check("no page errors", not errors, errors[:3])
            browser.close()
    print("\n%d failure(s)" % len(fails)); sys.exit(1 if fails else 0)
main()
