#!/usr/bin/env python3
"""The wider sea floor (to 60W and 30N, fine detail round the deep canyon).  python3 tools/seafloor_wide_test.py"""
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
    with sync_playwright() as p:
        browser = smoke.launch(p)
        page = browser.new_context(viewport={"width": 1180, "height": 820}, has_touch=True).new_page(); errors = []
        page.on("pageerror", lambda e: errors.append(str(e)[:200]))
        page.on("console", lambda m: errors.append(m.text[:200]) if m.type == "error" else None)
        js = lambda code: page.evaluate("(async()=>{const sim=(await import('./js/sim.js')).sim;const F=(await import('./js/seafloor.js')).seafloor;" + code + "})()")
        page.goto(base); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000)
        page.tap("#board-btn"); page.wait_for_timeout(800)
        if page.is_visible(".modal .btn"): page.tap(".modal .btn"); page.wait_for_timeout(300)
        r = js("return {n:F.grids.length, b:F.idx.bounds, d:F.idx.detail}")
        check("two grids, map 74.63W to 0W and 30N to 42.4N", r["n"] == 2 and r["b"] == [-74.63, 30, 0, 42.4], str(r))
        r = js("return [F.depthAt(35,-66), F.depthAt(32.3,-64.8), F.depthAt(31,-62)]")
        check("deep ocean to the south-east has real depths (abyssal plain over 4000 m)", r[0] and r[0] > 4000 and r[1] is not None and r[2] is not None, str(r))
        check("no-data corner (north-east of 40N, 70W) is off the chart", js("return [F.inside(41.2,-66), F.depthAt(41.2,-66), F.inside(39,-66)]") == [False, None, True])
        r = js("return [F.depthAt(33,-45), F.depthAt(35,-30), F.depthAt(37.8,-25.5), F.depthAt(38.5,-9.3), F.inside(39.8,-10), F.inside(39.5,-1)]")
        check("the whole 30-40N strip to 0W is in: abyssal plain, Azores land, Portugal coast", r[0] and r[0] > 3500 and r[1] and r[1] > 2500 and r[2] is not None and r[2] < 300 and r[3] is not None and r[4] and r[5], str(r))
        r = js("return {d:F.depthAt(37.6,-71.4), det:F.inDetail(37.6,-71.4), far:F.inDetail(34,-65)}")
        check("the canyon runs on to the abyssal plain inside the detail box", r["d"] and r["d"] > 2500 and r["det"] and not r["far"], str(r))
        r = js("let m=0; for(let lon=-74;lon<-69.5;lon+=0.05){ const a=F.depthAt(37.003,lon), b=F.depthAt(36.997,lon); if(a!=null&&b!=null) m=Math.max(m,Math.abs(a-b)); } return m")
        check("no cliff where the detail grid meets the wide grid (under 250 m)", r < 250, str(r))
        r = js("const [W,S,E,N]=F.idx.bounds; const i=F.idx.tile; return {have:F.have.has(Math.floor((-72.2-W)/i)+'_'+Math.floor((N-39.4)/i)), n:F.idx.tiles.length}")
        check("fine tiles cover Deep Trench Alpha", r["have"], str(r))
        # old saves: a chart string with no width prefix (463 columns) lands on the same cells
        r = js("const [W,S,E,N]=F.idx.bounds; F.setChart((463*10+5).toString(36)+',3'); const hit=F.isCharted(N-10.5*0.01, W+6.5*0.01), miss=F.isCharted(N-10.5*0.01, W+9.5*0.01), miss2=F.isCharted(N-11.5*0.01, W+6.5*0.01); return {hit,miss,miss2}")
        check("an older saved chart still lines up", r["hit"] and not r["miss"] and not r["miss2"], str(r))
        r = js("const s=sim.s; F.setChart(''); F.mark('t',39.6,-72.4,2); return F.chartToString().split(',')[0]")
        check("new chart text starts with its width", r == "w7463", str(r))
        r = js("F.setChart(F.chartToString()); return F.isCharted(39.6,-72.4)")
        check("new chart text reads back", r is True)
        r = js("""const nd=await import('./js/nd.js'); const box=document.createElement('div'); box.style.cssText='width:900px;height:600px;position:absolute;left:-2000px'; document.body.append(box);
          const n=nd.createND(box,{contours:true,trackUp:false}); const out={}; for(const rg of [8,64,256]){ n.range=rg; n.draw(); const t=performance.now(); for(let i=0;i<5;i++) n.draw(); out[rg]=(performance.now()-t)/5; } out.heapMB=(performance.memory?performance.memory.usedJSHeapSize:0)/1e6; box.remove(); return out""")
        print("draw ms:", {k: round(v, 1) for k, v in r.items()})
        check("chart draws at every zoom without stalling the iPad (under 120 ms here)", all(r[k] < 120 for k in ("8", "64", "256")) if all(k in r for k in ("8","64","256")) else all(r[str(k)] < 120 for k in (8, 64, 256)), str(r))
        check("no console errors", not errors, str(errors[:3]))
        browser.close()
    server.shutdown()
    print("FAILED: " + ", ".join(fails) if fails else "all ok"); return 1 if fails else 0
if __name__ == "__main__": sys.exit(main())
