#!/usr/bin/env python3
"""Inbox rows, the 8-frame zoom into a full message and back out.  python3 tools/mail_test.py"""
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
        page.goto(base); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000)
        page.tap("#board-btn"); page.wait_for_timeout(800)
        if page.is_visible(".modal .btn"): page.tap(".modal .btn"); page.wait_for_timeout(300)
        page.evaluate("""(async()=>{const m=(await import('../game/systems/missionManager.js')).default; m.sendMessage({id:'t1',from:'OERA Operations',subject:'Sea Trials Order',missionId:'seaTrials',text:'Line one.\\n\\nLine two.'}); window.__aq.open('comms');})()""")
        page.wait_for_timeout(700)
        page.evaluate("[...document.querySelectorAll('#station .tabs .btn')].find(b=>b.textContent.startsWith('Mail')).click()"); page.wait_for_timeout(200)
        row = page.query_selector(".mail-row")
        check("inbox row shows sender and subject", row is not None and "OERA Operations" in row.inner_text() and "Sea Trials Order" in row.inner_text(), row and row.inner_text())
        page.evaluate("window.__fr=[]; new MutationObserver(()=>{const f=document.querySelector('.mail-zoom'); if(f) window.__fr.push(f.style.cssText)}).observe(document.getElementById('station'),{subtree:true,attributes:true,childList:true}); document.querySelector('.mail-row').click()")
        page.wait_for_timeout(120)
        check("zoom frame appears first", page.query_selector(".mail-zoom") is not None)
        page.wait_for_timeout(500)
        check("zoom frame is gone after 4 frames", page.query_selector(".mail-zoom") is None)
        txt = page.inner_text(".mail-win")
        for want in ["From:", "O.E.R.A. - Oceanic Exploration and Research Alliance", "To:", "Captain of the Aqua Nova", "Date:", "Subject:", "Sea Trials Order", "Line two."]:
            check("message shows " + want, want in txt, txt[:200])
        check("window is visible", page.is_visible(".mail-win"))
        wr = page.evaluate("(()=>{const r=document.querySelector('.mail-win').getBoundingClientRect(); return [r.width,r.height]})()")
        check("window is large", wr[0] > 700 and wr[1] > 450, wr)
        fr = page.evaluate("window.__fr"); import re
        last = [float(x) for x in re.findall(r"[\d.]+", fr[-1])] if fr else [0]
        check("open zoom grows toward the large window (last frame is large)", last[2] > 600, fr[-1] if fr else fr)
        page.screenshot(path=os.path.join(ROOT, "tools", "shots", "mail_open.png"))
        page.mouse.click(8, 400); page.wait_for_timeout(100)
        check("zoom frame runs back out", page.query_selector(".mail-zoom") is not None)
        page.wait_for_timeout(600)
        check("window is gone after closing", page.query_selector(".mail-win") is None and page.query_selector(".mail-back") is None)
        check("message is marked read", page.evaluate("(async()=>{const g=(await import('./js/persist.js')).gameState; return g.getProperty('mission.inbox').find(m=>m.id==='t1').read})()"))
        check("message has a game date", page.evaluate("(async()=>{const g=(await import('./js/persist.js')).gameState; return g.getProperty('mission.inbox').find(m=>m.id==='t1').gameClock!=null})()"))
        check("no page errors", not errors, errors[:3])
        browser.close()
    server.shutdown()
    print("FAILED: " + ", ".join(fails) if fails else "all ok"); sys.exit(1 if fails else 0)
main()
