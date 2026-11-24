#!/usr/bin/env python3
"""WSKR status page (map left, tiles right, commands below) and battery research.  python3 tools/wskr_page_test.py"""
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
def main():
    server, site = smoke.start_server()
    base = f"http://127.0.0.1:{server.server_address[1]}/AquaNova/tablet/"
    with sync_playwright() as p:
        browser = smoke.launch(p)
        page = browser.new_context(viewport={"width": 1180, "height": 820}, has_touch=True).new_page(); errors = []
        page.on("pageerror", lambda e: errors.append(str(e)[:200]))
        page.on("console", lambda m: errors.append(m.text[:200]) if m.type == "error" else None)
        js = lambda code: page.evaluate("(async()=>{const sim=(await import('./js/sim.js')).sim;const T=await import('./js/sim.js');const S=await import('./js/science.js');" + code + "})()")
        page.goto(base); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000)
        page.tap("#board-btn"); page.wait_for_timeout(800)
        if page.is_visible(".modal .btn"): page.tap(".modal .btn"); page.wait_for_timeout(300)
        # battery research
        check("battery base 6 h", js("return sim.batteryHours()") == 6)
        js("const r=S.research; const g=(await import('./js/state.js')); return 1") if False else None
        r = js("const m=await import('./js/science.js'); const t=m.TOPICS.find(x=>x.id==='wskr-battery-24'); const t12=m.TOPICS.find(x=>x.id==='wskr-battery-12'); return {t24:!!t&&t.requires, t12:!!t12&&t12.cost}")
        check("research topics exist (12 h then 24 h requires 12 h)", r["t24"] == "wskr-battery-12" and r["t12"], str(r))
        js("const m=await import('./js/science.js'); const gs=(await import('./js/gameState.js')).default||null; return 1") if False else None
        # page
        js("const s=sim.s; const c=s.pois.find(p=>p.name==='Canyon Head'); Object.assign(s,{lat:c.lat,lon:c.lon,wskrs:[],rov:null,docked:false,wpt:null,speed:6,throttle:0.4,depth:20,targetDepth:20,heading:90}); sim.deployWskr(); sim.deployWskr(); return 1")
        page.wait_for_timeout(400)
        js("window.__aq.open('sensors'); return 1"); page.wait_for_timeout(600)
        page.locator("#station .tabs .btn", has_text="WSKRs").tap(); page.wait_for_timeout(900)
        page.screenshot(path=os.path.join(SHOTS, "wskr_page_all.png"))
        n = page.locator(".wk-tile").count()
        check("four tiles, map and a command bar", n == 4 and page.locator(".wk-map canvas").count() >= 1 and page.locator(".wk-cmds").count() == 1, str(n))
        txt = page.inner_text(".wk-cmds").lower()
        check("no selection: commands are for ALL", "all wskrs" in txt and "recall all" in txt and "deploy wskr" in txt, txt[:120])
        page.locator(".wk-tile").nth(0).tap(); page.wait_for_timeout(700)
        page.screenshot(path=os.path.join(SHOTS, "wskr_page_sel.png"))
        check("tapping a tile shows the big tile", page.locator(".wk-big").count() == 1 and page.locator(".wk-tile").count() == 0)
        txt = page.inner_text(".wk-cmds").lower()
        check("selected: commands are for that WSKR", "all wskrs" not in txt and "manual control" in txt and "recall" in txt, txt[:120])
        big = page.inner_text(".wk-big")
        check("big tile has detail", all(k in big for k in ("DEPTH", "SPEED", "HEADING", "BATTERY", "LINK", "FROM AQUA NOVA")), big[:200])
        page.locator(".wk-big").tap(position={"x": 20, "y": 20}); page.wait_for_timeout(500)
        check("re-tapping the big tile deselects", page.locator(".wk-tile").count() == 4 and "all wskrs" in page.inner_text(".wk-cmds").lower())
        page.locator(".wk-tile").nth(1).tap(); page.wait_for_timeout(500)
        page.locator("#station .wk-cmds .btn", has_text="Manual control").tap(); page.wait_for_timeout(500)
        check("manual command applies to the selected WSKR only", js("return sim.s.wskrs.filter(w=>w.mode==='manual').map(w=>w.n)").__len__() == 1 and "turn left" in page.inner_text(".wk-cmds").lower())
        page.locator(".wk-big").tap(position={"x": 20, "y": 20}); page.wait_for_timeout(400)
        page.locator("#station .wk-cmds .btn", has_text="Search…").tap(); page.wait_for_timeout(400); page.locator(".pc.sp .btn", has_text="Start search").tap(); page.wait_for_timeout(400)
        check("with none selected, search applies to all (manual one too)", js("return sim.s.wskrs.filter(w=>w.mode==='search').length") >= 1)
        check("no page errors", not errors, str(errors[:3]))
        browser.close()
    server.shutdown()
    print("FAILED: " + ", ".join(fails) if fails else "all ok"); return 1 if fails else 0
if __name__ == "__main__": sys.exit(main())
