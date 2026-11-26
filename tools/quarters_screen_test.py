#!/usr/bin/env python3
"""The wall screen in the Captain's quarters cycles NAV, synthetic vision, sonar, WSKRs and ship status; a tap shows the next page.
python3 tools/quarters_screen_test.py   (screenshots: tools/shots/qs_<page>.png)"""
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
        page.on("console", lambda m: errors.append(m.text[:200]) if m.type == "error" else None)
        page.goto(base + "?intake=0"); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=15000)
        page.tap("#board-btn"); page.wait_for_timeout(900)
        page.is_visible(".modal .btn") and page.tap(".modal .btn")
        page.evaluate("(async()=>{const S=(await import('./js/sim.js')).sim; Object.assign(S.s,{docked:false,at:null,lat:41.3,lon:-70.7,depth:40,targetDepth:40,speed:6,sonar:true}); S.deployWskr && S.deployWskr(); for(let i=0;i<3;i++) S.step(1);})()")
        page.evaluate("window.__aq.scene('quarters')"); page.wait_for_timeout(1200)
        title = lambda: page.inner_text(".qs-title")
        check("the screen shows a page when the Captain walks in", title() == "NAVIGATION", title())
        seen = [title()]
        for _ in range(4):
            page.locator(".qs-tap").tap(); page.wait_for_timeout(900)
            seen.append(title()); page.screenshot(path=os.path.join(ROOT, "tools", "shots", "qs_" + title().split()[0].lower() + ".png"))
        check("a tap shows the next page: all five pages", seen == ["NAVIGATION", "SYNTHETIC VISION", "SONAR", "WSKRS", "SHIP STATUS"], seen)
        page.locator(".qs-tap").tap(); page.wait_for_timeout(500)
        check("and round again", title() == "NAVIGATION", title())
        page.wait_for_timeout(10800)
        check("it moves on by itself after 10 s", title() == "SYNTHETIC VISION", title())
        b = page.evaluate("(()=>{const r=document.querySelector('.disp.qscreen').getBoundingClientRect(); return {w:r.width,h:r.height}})()")
        check("the screen sits on the wall screen in the picture", b["w"] > 300 and b["h"] > 100, b)
        check("no page errors", not errors, str(errors[:3]))
        browser.close()
    server.shutdown()
    print(f"\n{len(fails)} failure(s)"); sys.exit(1 if fails else 0)
if __name__ == "__main__":
    main()
