#!/usr/bin/env python3
"""Game calendar starts 50 years after the first play; logbook entries stay in order; old logbooks are migrated.  python3 tools/calendar_test.py"""
import importlib.util, json, sys, datetime
from playwright.sync_api import sync_playwright
spec = importlib.util.spec_from_file_location("smoke", __file__.replace("calendar_test.py", "smoke.py")); smoke = importlib.util.module_from_spec(spec); spec.loader.exec_module(smoke)
fails = []
def check(n, ok, x=""):
    print(("ok   " if ok else "FAIL ") + n + (f"  {x}" if x and not ok else ""))
    if not ok: fails.append(n)
Q = """(async()=>{const P=await import('./js/persist.js');const S=await import('./js/sim.js');const lb=P.saveManager.getActiveLogbook();
 return {epoch:lb.epoch, text:S.gameDateText(), ts:lb.entries.map(e=>e.logbook.timestamp)}})()"""
def boot(page, base):
    page.goto(base); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000)
    page.tap("#board-btn"); page.wait_for_timeout(1500)
    if page.is_visible(".modal .btn"): page.tap(".modal .btn"); page.wait_for_timeout(300)
def main():
    server, site = smoke.start_server()
    base = f"http://127.0.0.1:{server.server_address[1]}/AquaNova/tablet/"
    with sync_playwright() as p:
        b = smoke.launch(p); page = b.new_context(viewport={"width": 1180, "height": 820}, has_touch=True).new_page(); errs = []
        page.on("pageerror", lambda e: errs.append(str(e)[:200]))
        boot(page, base)
        page.evaluate("import('./js/persist.js').then(P=>{P.addLogEntry('one');P.addLogEntry('two')})"); page.wait_for_timeout(300)
        r = page.evaluate(Q); yr = datetime.datetime.utcnow().year + 50
        check("epoch is 50 years after today", r["epoch"].startswith(str(yr)), r["epoch"])
        check("game date shows that year", str(yr) in r["text"], r["text"])
        check("entries in order, all on the game calendar", r["ts"] == sorted(r["ts"]) and all(t.startswith(str(yr)) for t in r["ts"]), str(r["ts"]))
        # an old logbook: no epoch, M.LOG-0001 in 2074, later entries on the real calendar
        page.evaluate("""(()=>{const k='aquanova_bookshelf'; const key=Object.keys(localStorage).find(x=>/bookshelf/i.test(x)); const d=JSON.parse(localStorage[key]); const lb=d.logbooks.find(l=>l.id===d.activeId)||d.logbooks[0];
          delete lb.epoch; lb.entries[0].logbook.timestamp='2074-08-16T14:30:00.000Z'; lb.entries.slice(1).forEach((e,i)=>e.logbook.timestamp=new Date(Date.now()+i*5000).toISOString()); localStorage[key]=JSON.stringify(d)})()""")
        page.reload(); boot(page, base)
        r = page.evaluate(Q)
        check("old logbook gets an epoch", bool(r["epoch"]) and r["epoch"].startswith(str(yr)), str(r["epoch"]))
        check("old logbook entries are back in order", r["ts"] == sorted(r["ts"]) and all(t.startswith(str(yr)) for t in r["ts"]), str(r["ts"]))
        check("no page errors", not errs, str(errs))
    server.shutdown()
    print("\nAll checks passed." if not fails else f"\n{len(fails)} failed"); sys.exit(1 if fails else 0)
main()
