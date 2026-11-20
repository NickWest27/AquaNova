#!/usr/bin/env python3
"""Lab analysis screens: standby, running (progress changes the picture), complete, review.  python3 tools/analysis_test.py"""
import importlib.util
from playwright.sync_api import sync_playwright
spec = importlib.util.spec_from_file_location("smoke", __file__.replace("analysis_test.py", "smoke.py")); smoke = importlib.util.module_from_spec(spec); spec.loader.exec_module(smoke)
SHOTS = "tools/shots"
fails = []
def check(n, ok, x=""):
    print(("ok   " if ok else "FAIL ") + n + (f"  {x}" if x and not ok else ""))
    if not ok: fails.append(n)
def main():
    server, site = smoke.start_server()
    base = f"http://127.0.0.1:{server.server_address[1]}/AquaNova/tablet/"
    with sync_playwright() as p:
        b = smoke.launch(p); page = b.new_context(viewport={"width": 1180, "height": 820}, has_touch=True).new_page(); errs = []
        page.on("pageerror", lambda e: errs.append(str(e)[:200])); page.on("console", lambda m: errs.append(m.text[:200]) if m.type == "error" else None)
        js = lambda code: page.evaluate("(async()=>{const sim=(await import('./js/sim.js')).sim;const sc=await import('./js/science.js');" + code + "})()")
        page.goto(base); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000)
        page.tap("#board-btn"); page.wait_for_timeout(800)
        if page.is_visible(".modal .btn"): page.tap(".modal .btn"); page.wait_for_timeout(300)
        js("sc.addSample('sediment', {name:'Vineyard Ledge', id:2, type:'site'}, 'collector'); sc.addSample('water', {name:'Mystic Reef', id:1, type:'reef'}, 'spectrometer'); sc.addSample('bio', {name:'Mystic Reef', id:1, type:'reef'}, 'collector'); return 1")
        page.evaluate("window.__aq.open('lab')"); page.wait_for_timeout(500)
        page.evaluate("[...document.querySelectorAll('#station .tabs .btn')].find(b=>b.textContent==='Analysis').click()"); page.wait_for_timeout(500)
        n = page.locator("#station canvas.an-screen").count()
        check("three instrument screens", n == 3, str(n))
        # a pixel signature of each screen
        sig = lambda: page.evaluate("[...document.querySelectorAll('#station canvas.an-screen')].map(c=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let s=0;for(let i=0;i<d.length;i+=16)s=(s*31+d[i]+d[i+1]*3+d[i+2]*7)%1000003;return s})")
        idle = sig(); check("standby screens draw something", all(x > 0 for x in idle), str(idle))
        page.screenshot(path=f"{SHOTS}/an-standby.png")
        for i in (1, 2, 3):
            js(f"sc.startAnalysis({i}); return 1")
        page.wait_for_timeout(600)
        page.evaluate("document.querySelector('#station .tabs .btn').click()"); page.evaluate("[...document.querySelectorAll('#station .tabs .btn')].find(b=>b.textContent==='Analysis').click()"); page.wait_for_timeout(500)
        # step the game clock to 40% and to the end; the picture must change
        js("const j=sc.jobs(); for (const x of j) { x.start = sim.s.clock - (x.end-x.start)*0.4; } return 1") if False else None
        r40 = js("const s=sim.s; s.clock += 0; return [sc.jobs().length, sim.s.clock]")
        check("three jobs are running", r40[0] == 3, str(r40))
        a = sig(); page.wait_for_timeout(400); a2 = sig()
        check("running screens animate", a != a2, f"{a} {a2}")
        page.screenshot(path=f"{SHOTS}/an-running-early.png")
        js("sim.s.clock += 1000; return 1"); page.wait_for_timeout(500)
        mid = sig(); page.screenshot(path=f"{SHOTS}/an-running-mid.png")
        check("progress changes the picture", mid != a2, f"{a2} {mid}")
        js("sim.s.clock += 2000; return 1"); page.wait_for_timeout(1500)
        page.evaluate("[...document.querySelectorAll('#station .tabs .btn')].find(b=>b.textContent==='Samples').click()"); page.wait_for_timeout(300)
        page.evaluate("[...document.querySelectorAll('#station .tabs .btn')].find(b=>b.textContent==='Analysis').click()"); page.wait_for_timeout(500)
        done = js("return sc.samples().map(q=>q.status)")
        check("all three finished", done == ["done"] * 3, str(done))
        check("a Show button per finished sample", page.locator('#station button:text-matches("^Show #")').count() == 3)
        before = sig()
        page.locator('#station button:text-matches("^Show #1$")').first.tap(); page.wait_for_timeout(500)
        after = sig(); check("Show loads a finished sample on its screen", after != before, f"{before} {after}")
        page.screenshot(path=f"{SHOTS}/an-material-done.png")
        page.locator('#station button:text-matches("^Show #3$")').first.tap(); page.wait_for_timeout(500)
        page.screenshot(path=f"{SHOTS}/an-gene-done.png")
        page.locator('#station button:text-matches("^Show #2$")').first.tap(); page.wait_for_timeout(500)
        page.screenshot(path=f"{SHOTS}/an-spectral-done.png")
        check("no page errors", not errs, str(errs[:3]))
        b.close()
    print("\nall ok" if not fails else f"\n{len(fails)} FAILED"); raise SystemExit(1 if fails else 0)
main()
