#!/usr/bin/env python3
"""A crew member with something to say opens the dialogue (above station pages, below the PED); a tap on a crew member on the bridge
opens the line to them.   python3 tools/callin_test.py"""
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
        js = lambda code: page.evaluate("(async()=>{" + code + "})()")
        page.goto(base + "?intake=0&callin=1"); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=15000)
        page.tap("#board-btn"); page.wait_for_timeout(900)
        page.is_visible(".modal .btn") and page.tap(".modal .btn")
        js("const m=(await import('../game/systems/missionManager.js')).default; m.forceCompleteMission('meetTheCrew'); m.forceCompleteMission('shipTour'); const g=(await import('./js/persist.js')).gameState; g.updateProperty('progress.got_ped', true); g.updateProperty('tutorial.communicator_opened', true); for (const id of ['executiveOfficer','helm','sensors','engineering','communications','science']) g.updateProperty('progress.met.'+id, true);")
        page.wait_for_timeout(600)
        page.evaluate("window.__aq.scene('bridge')"); page.wait_for_timeout(400)
        if page.is_visible("#comm-pop"): page.evaluate("document.querySelector('#comm-pop').click()"); page.wait_for_timeout(300)
        page.evaluate("window.__aq.open('nav')"); page.wait_for_timeout(500)
        js("(await import('./js/notify.js')).say('engineering', 'Captain, the starboard jet is running hot.', 'mission')"); page.wait_for_timeout(800)
        check("a crew message opens the dialogue with that crew member", page.is_visible("#comm-pop") and "starboard jet" in page.inner_text("#comm-pop"), page.inner_text("#comm-pop")[:200] if page.is_visible("#comm-pop") else "closed")
        z = page.evaluate("[getComputedStyle(document.querySelector('#station')).zIndex, getComputedStyle(document.querySelector('#comm-pop')).zIndex, getComputedStyle(document.querySelector('#ped-pop')).zIndex].map(Number)")
        check("the dialogue is above a station page and below the PED", z[0] < z[1] < z[2], z)
        check("no message line at the foot of the screen for it", "starboard jet" not in (page.inner_text("#console-line") or ""))
        before = page.inner_text("#comm-pop .comm-reply")
        js("(await import('./js/notify.js')).say('engineering', 'Captain, the port jet is fine now.', 'mission')"); page.wait_for_timeout(600)
        check("a second message does not replace the one being read", page.inner_text("#comm-pop .comm-reply") == before and page.locator("#comm-pop .comm-line", has_text="Continue").count() == 1)
        page.locator("#comm-pop .comm-line", has_text="Continue").first.dispatch_event("click"); page.wait_for_timeout(300)
        check("Continue shows it", "port jet is fine" in page.inner_text("#comm-pop .comm-reply"))
        page.evaluate("document.querySelector('#comm-pop').click()"); page.wait_for_timeout(300)
        page.evaluate("document.querySelector('#station .st-head .btn') && document.querySelector('#station .st-head .btn').click()"); page.wait_for_timeout(300)
        page.evaluate("window.__aq.scene('bridge')"); page.wait_for_timeout(300)
        page.locator('.hs[aria-label="NICOLE"], .hs:has-text("NICOLE")').first.dispatch_event("click"); page.wait_for_timeout(700)
        check("a tap on Nicole on the bridge opens the line to her", page.is_visible("#comm-pop") and "NICOLE" in page.inner_text("#comm-pop").upper(), page.inner_text("#comm-pop")[:150] if page.is_visible("#comm-pop") else "closed")
        r = js("const H=await import('./js/howto.js'); return ['helm','sensors','engineering','science','executiveOfficer','communications'].map(id=>H.guidesFor(id).some(f=>/Buttons/.test(f.label)||/pages/i.test(f.label)))")
        check("every crew member explains the buttons on their pages (Ask about)", all(r), r)
        check("Marcus lists the NAV page buttons", "Dest:" in js("const H=await import('./js/howto.js'); return H.askGuide('helm','b-nav')"))
        # an ordinary report (no urgency flag) opens the dialogue too; the reply to a button press does not
        page.evaluate("document.querySelector('#comm-pop') && !document.querySelector('#comm-pop').hidden && document.querySelector('#comm-pop').click()"); page.wait_for_timeout(300)
        js("(await import('./js/notify.js')).say('helm', 'We are at Vineyard Ledge, Captain.')"); page.wait_for_timeout(700)
        check("an ordinary crew report opens the dialogue", page.is_visible("#comm-pop") and "Vineyard Ledge" in page.inner_text("#comm-pop"), page.inner_text("#comm-pop")[:120] if page.is_visible("#comm-pop") else "closed")
        page.evaluate("document.querySelector('#comm-pop').click()"); page.wait_for_timeout(300)
        js("(await import('./js/notify.js')).tell('helm', 'Course plotted, Captain.')"); page.wait_for_timeout(700)
        check("the reply to a button press stays a short line (no dialogue)", not page.is_visible("#comm-pop"))
        check("no page errors", not errors, str(errors[:3]))
        browser.close()
    server.shutdown()
    print(f"\n{len(fails)} failure(s)"); sys.exit(1 if fails else 0)
if __name__ == "__main__":
    main()
