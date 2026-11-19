#!/usr/bin/env python3
"""Report transfer: Nicole's order, timed upload, wait, reply download, stall.  python3 tools/transfer_test.py"""
import importlib.util
from playwright.sync_api import sync_playwright
spec = importlib.util.spec_from_file_location("smoke", __file__.replace("transfer_test.py", "smoke.py")); smoke = importlib.util.module_from_spec(spec); spec.loader.exec_module(smoke)
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
        js = lambda code: page.evaluate("(async()=>{const sim=(await import('./js/sim.js')).sim;const cm=(await import('./js/commsModel.js'));const tr=(await import('./js/transfer.js'));" + code + "})()")
        page.goto(base); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000)
        page.tap("#board-btn"); page.wait_for_timeout(800)
        if page.is_visible(".modal .btn"): page.tap(".modal .btn"); page.wait_for_timeout(300)
        js("const m=(await import('../game/systems/missionManager.js')).default; m.forceCompleteMission('meetTheCrew'); const g=(await import('./js/persist.js')).gameState; g.updateProperty('contacts.crew.communications.known', true); return 1")
        surf = "const s=sim.s; Object.assign(s,{docked:false,at:null,wpt:null,speed:0,throttle:0,depth:0,targetDepth:0}); cm.cm.source='laser'; "
        # 1. no link at depth: refused with a reason
        r = js("const s=sim.s; Object.assign(s,{docked:false,speed:0,depth:300,targetDepth:300}); const r=tr.startReport(); return {ok:r.ok, why:r.why}")
        check("deep: no link, refused", r["ok"] is False and r["why"] == "link", str(r))
        # 2. Nicole's order via the communicator
        js(surf + "return 1")
        page.evaluate("window.__aq.scene('bridge')"); page.wait_for_timeout(300)
        page.evaluate("document.querySelector('#pin').click()"); page.wait_for_timeout(700)
        tap = lambda: page.wait_for_timeout(350)
        page.locator(".comm-who", has_text="Nicole").first.tap(); tap()
        if page.locator(".comm-line", has_text="I need something").count(): page.locator(".comm-line", has_text="I need something").first.tap(); tap()
        page.locator(".comm-line", has_text="Give an order").first.tap(); tap()
        check("Nicole has a Transmit a report order", page.locator(".comm-line", has_text="Transmit a report").count() == 1)
        page.locator(".comm-line", has_text="Transmit a report").first.tap(); tap()
        txt = page.locator(".comm-reply").first.inner_text()
        check("Nicole says how long it will take", "seconds" in txt and "Sending it" in txt, txt)
        r = js("return {phase: tr.xfer.job && tr.xfer.job.phase, vis: !!document.querySelector('#stage .xfer'), out: (await import('./js/persist.js')).gameState.getProperty('mission.outbox')?.length||0}")
        check("bar is up in the upload phase", r["phase"] == "up" and r["vis"], str(r))
        check("report not in the outbox until the upload finishes", r["out"] == 0, str(r))
        r = js("return tr.startReport().why")
        check("a second report is refused while busy", r == "busy", str(r))
        # 3. progress rises, then wait, then download, then done
        page.wait_for_timeout(2000)
        p1 = js("return tr.xfer.job.p")
        check("upload progresses over time (not instant)", 0 < p1 < 1, str(p1))
        seen = set(); page.wait_for_function("window.__t=0, true")
        for _ in range(90):
            ph = js("return tr.xfer.job && tr.xfer.job.phase"); seen.add(ph)
            if ph in (None, "done"): break
            page.wait_for_timeout(500)
        check("went through up, wait and down", {"up", "wait", "down"} <= seen, str(seen))
        r = js("const g=(await import('./js/persist.js')).gameState; const ib=g.getProperty('mission.inbox')||[]; return {out:g.getProperty('mission.outbox').length, reply: ib.filter(m=>m.id.startsWith('report-ack')).length}")
        check("report logged in the outbox", r["out"] == 1, str(r))
        check("OERA reply arrived in the inbox", r["reply"] == 1, str(r))
        page.wait_for_timeout(4500)
        r = js("return {job: tr.xfer.job, vis: !!document.querySelector('#stage .xfer')}")
        check("bar clears afterwards", r["job"] is None and not r["vis"], str(r))
        # 4. stall when the link drops
        js(surf + "const r=tr.startReport(); return r.ok")
        page.wait_for_timeout(800)
        js("Object.assign(sim.s,{depth:300,targetDepth:300}); return 1"); page.wait_for_timeout(1200)
        r = js("return {st: tr.xfer.job.stalled, p: tr.xfer.job.p}")
        check("link lost: transfer stalls", r["st"] is True, str(r))
        page.wait_for_timeout(1500); p2 = js("return tr.xfer.job.p")
        check("no progress while stalled", abs(p2 - r["p"]) < 0.001, f"{r['p']} {p2}")
        js(surf + "return 1"); page.wait_for_timeout(1500)
        r = js("return {st: tr.xfer.job.stalled, p: tr.xfer.job.p}")
        check("resumes when the link returns", r["st"] is False and r["p"] > p2, str(r))
        # 5. weak signal is slower than strong
        js("tr.xfer.job.phase='fail'; return 1")
        page.wait_for_timeout(300)
        check("no page errors", not errs, str(errs[:3]))
        b.close()
    print("\nall ok" if not fails else f"\n{len(fails)} FAILED"); raise SystemExit(1 if fails else 0)
main()
