#!/usr/bin/env python3
"""Every display page fits the screen without scrolling (owner rule, 2026-11-25).
Screen: 1180 x 820 CSS px, an iPad Air in landscape (the size smoke.py uses). See docs/SCREENS.md.
Opens each station and each tab in a busy state (at sea, four WSKRs out, one selected) and reports any part of a page that scrolls
or is cut off. Pages that may scroll (the logbook, mail, lists): ALLOWED below.
Run from repo root:  python3 tools/fit_test.py      (screenshots: tools/shots/fit_*.png)
"""
import os, sys, importlib.util
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location("smoke", os.path.join(ROOT, "tools", "smoke.py"))
smoke = importlib.util.module_from_spec(spec); spec.loader.exec_module(smoke)
VIEW = {"width": 1180, "height": 820}
# pages that are allowed to scroll: station/tab names
ALLOWED = {"log/entries", "log/standings", "comms/mail", "comms/contacts", "ped/findings", "ped/journal", "ped/contacts", "ped/tasks", "ped/settings"}   # the PED is a small handheld screen   # the logbook and lists
fails = []
def check(name, ok, extra=""):
    print(("ok   " if ok else "FAIL ") + name + (f"  {extra}" if extra and not ok else ""))
    if not ok: fails.append(name)

# every element on screen whose content is taller (or wider) than its box: scrolling or cut off
PROBE = """(sel) => {
  const out = [], root = document.querySelector(sel);
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  for (const e of root.querySelectorAll('*')) {
    if (!vis(e)) continue;
    const cs = getComputedStyle(e), oy = cs.overflowY, ox = cs.overflowX;
    const dy = e.scrollHeight - e.clientHeight, dx = e.scrollWidth - e.clientWidth;
    if (e.tagName === 'CANVAS' || e.tagName === 'svg' || e.closest('svg')) continue;
    if (e.matches('.snr-list')) continue;   // list areas inside a page may scroll (the SONAR contact list)
    if ((oy === 'auto' || oy === 'scroll') && dy > 4) out.push({ kind: 'scrolls', el: (e.className || e.tagName) + '', px: dy });
    else if (oy === 'hidden' && dy > 6 && e.clientHeight > 40 && !e.matches('.tabs, .tabs *, button, button *')) out.push({ kind: 'cut off', el: (e.className || e.tagName) + '', px: dy });
  }
  const r = root.getBoundingClientRect(); if (r.bottom > innerHeight + 1) out.push({ kind: 'page taller than screen', el: 'station', px: Math.round(r.bottom - innerHeight) });
  if (document.scrollingElement.scrollHeight > innerHeight + 1) out.push({ kind: 'document scrolls', el: 'html', px: document.scrollingElement.scrollHeight - innerHeight });
  return out;
}"""

def main():
    server, site = smoke.start_server()
    base = f"http://127.0.0.1:{server.server_address[1]}/AquaNova/tablet/"
    errors = []
    with sync_playwright() as p:
        browser = smoke.launch(p)
        page = browser.new_context(viewport=VIEW, has_touch=True).new_page()
        page.on("pageerror", lambda e: errors.append(str(e)[:200]))
        js = lambda code: page.evaluate("(async()=>{const sim=(await import('./js/sim.js')).sim;" + code + "})()")
        page.goto(base + "?intake=0"); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=15000)
        page.tap("#board-btn"); page.wait_for_timeout(900)
        page.is_visible(".modal .btn") and page.tap(".modal .btn")
        # busy state: at sea offshore, four WSKRs out, every station open
        js("""const s=sim.s; Object.assign(s,{docked:false,at:null,lat:40.2,lon:-72.0,depth:60,targetDepth:60,speed:6,throttle:0.4,sonar:true});
          s.wskrs=[1,2,3,4].map(n=>({n,lat:s.lat+0.02*Math.cos(n*1.6),lon:s.lon+0.02*Math.sin(n*1.6),mode:'escort',target:null,busy:0,bat:80+n,heading:n*80}));
          const U=await import('./js/unlocks.js'); if(U.commissionAll) U.commissionAll(); for(let i=0;i<5;i++) sim.step(1); return 1""")
        def probe(name, root="#station"):
            page.wait_for_timeout(500)
            out = page.evaluate(PROBE, root)
            page.screenshot(path=os.path.join(ROOT, "tools", "shots", "fit_" + name.replace("/", "_").replace(" ", "").replace("(", "").replace(")", "") + ".png"))
            bad = [] if name in ALLOWED else out
            check(f"{name} fits the screen", not bad, "; ".join(f"{o['kind']} {o['el'][:40]} +{o['px']}px" for o in bad[:4]))
        def stations(names):
          for st in names:
              page.evaluate(f"window.__aq.open('{st}')"); page.wait_for_timeout(700)
              scope = "#ped-pop " if st == "ped" else "#station "
              tabs = page.locator(scope + ".tabs:visible > .btn")
              n = tabs.count()
              if not n: probe(st, "#ped-pop" if st == "ped" else "#station")
              for i in range(n):
                  t = page.locator(scope + ".tabs:visible > .btn").nth(i); label = t.inner_text().strip().split(" (")[0].lower()
                  t.dispatch_event("click"); page.wait_for_timeout(400)
                  probe(f"{st}/{label}", "#ped-pop" if st == "ped" else "#station")
                  if st == "sensors" and label == "wskrs":   # and with a WSKR selected
                      tile = page.locator(".wk-tile").first
                      if tile.count(): tile.dispatch_event("click"); probe("sensors/wskrs selected"); page.locator(".wk-big").first.dispatch_event("click") if page.locator(".wk-big").count() else None
        stations(["nav", "helm", "sys", "sensors", "comms", "log", "lab", "remora", "bay"])
        # harder states: a WSKR in manual control (more buttons), Remora out, the shuttle alongside (a Send button per dock)
        page.evaluate("window.__aq.open('sensors')"); page.wait_for_timeout(600)
        page.locator("#station .tabs > .btn").nth(1).dispatch_event("click"); page.wait_for_timeout(300)
        js("sim.s.wskrs[0].mode='manual'; sim.s.wskrs[0].thr=0; return 1")
        page.locator(".wk-tile").first.dispatch_event("click"); probe("sensors/wskrs manual")
        js("const s=sim.s; s.rov={lat:s.lat+0.003,lon:s.lon,heading:0,depth:60,cmd:{thr:0,turn:0,dive:0},job:null,cargo:[],auto:false,home:false}; s.speed=0; s.shuttle={...s.shuttle,state:'out',mode:'follow',bat:90,o2:90,lat:s.lat,lon:s.lon+0.002,pilots:2,pax:0}; for(let i=0;i<3;i++) sim.step(1); return 1")
        for st in ["remora", "bay"]:
            page.evaluate(f"window.__aq.open('{st}')"); page.wait_for_timeout(700); probe(st + " (craft out)")
        stations(["ped"])   # the PED is a pop-up over the rest: last
        # the page is 4:3 and scales with the screen: the same layout on a bigger iPad (1366 x 1024) and a 16:9 screen
        for vw, vh in ((1366, 1024), (1280, 720)):
            page.set_viewport_size({"width": vw, "height": vh}); page.keyboard.press("Escape"); page.wait_for_timeout(300)
            page.evaluate("window.__aq.open('sensors')"); page.wait_for_timeout(700)
            r = page.evaluate("(()=>{const r=document.querySelector('#station').getBoundingClientRect(); return {w:r.width,h:r.height,x:r.left,y:r.top}})()")
            k = min(vw / 1024, vh / 768)
            check(f"at {vw}x{vh} the page is the largest 4:3 box, centred", abs(r["w"] - 1024 * k) < 2 and abs(r["h"] - 768 * k) < 2 and abs(r["x"] - (vw - r["w"]) / 2) < 2 and abs(r["y"] - (vh - r["h"]) / 2) < 2, r)
            probe(f"sensors/sonar at {vw}x{vh}")
        check("no page errors", not errors, str(errors))
        browser.close()
    server.shutdown()
    print(f"\n{len(fails)} failure(s)"); sys.exit(1 if fails else 0)
if __name__ == "__main__":
    main()
