#!/usr/bin/env python3
"""ARIA guidance: crew reports replace toasts, hints from missions, decisions put to the Captain.  python3 tools/aria_test.py"""
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
OFFER = """const M=(await import('../game/systems/missionManager.js')).default;
M.executeActions([{type:'aria_decision', id:'colonists', text:'{captain}, two things at once. A colony ship is calling for help, and pirates are closing on the supply convoy. We can reach only one. What are your orders?',
 options:[{id:'rescue', label:'Rescue the colonists', reply:'Aye, {captain}. Setting a course for the colony ship.', actions:[{type:'set_property', property:'progress.test_rescue', value:true}]},
          {id:'engage', label:'Engage the pirates', reply:'Aye, {captain}. Battle stations.', actions:[{type:'set_property', property:'progress.test_engage', value:true}]}]}]); return 1;"""
def main():
    server, site = smoke.start_server()
    base = f"http://127.0.0.1:{server.server_address[1]}/AquaNova/tablet/?locked=1"
    with sync_playwright() as p:
        browser = smoke.launch(p)
        page = browser.new_context(viewport={"width": 1180, "height": 820}, has_touch=True).new_page(); errors = []
        page.on("pageerror", lambda e: errors.append(str(e)[:200]))
        page.on("console", lambda m: errors.append(m.text[:200]) if m.type == "error" else None)
        page.goto(base); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000)
        page.tap("#board-btn"); page.wait_for_timeout(900)
        js = lambda code: page.evaluate("(async()=>{const g=(await import('./js/persist.js')).gameState;" + code + "})()")
        line = lambda: page.inner_text("#console-line")
        # locked station: ARIA explains in the console line, no toast machinery
        page.evaluate("window.__aq.open('helm')"); page.wait_for_timeout(400)
        check("ARIA explains a locked station", "ARIA" in line() and "Executive Officer" in line(), line())
        # a hint: the pin is waiting
        js("const A=await import('./js/aria.js'); const M=(await import('../game/systems/missionManager.js')).default; M.delayScale=0; A.checkHints(); await new Promise(r=>setTimeout(r,50)); A.checkHints(); return 1")
        page.wait_for_timeout(200)
        shown = js("return g.getProperty('progress.hintsShown')")
        check("a hint was spoken once and recorded", shown and any(k.startswith("meetTheCrew:") for k in shown), shown)
        check("hint is spoken by ARIA with the player's title", "ARIA" in line() and "{" not in line(), line())
        n = len(shown)
        js("(await import('./js/aria.js')).checkHints(); return 1")
        check("the same hint is not repeated", len(js("return g.getProperty('progress.hintsShown')")) == n)
        # crew report replaces the toast: course plotted is the helm
        js("const m=await import('./js/notify.js'); m.tell('helm','Course plotted to Mystic Reef.'); return 1"); page.wait_for_timeout(100)
        check("tell() speaks as the crew member", "Marcus Chen" in line() and "Course plotted" in line(), line())
        # a decision
        js(OFFER); page.wait_for_timeout(300)
        check("decision is pending and ARIA says so", js("return g.getProperty('progress.decisions.pending').length") == 1 and "ARIA" in line() and "Captain" in line() and "{" not in line(), line())
        js("g.updateProperty('progress.got_ped', true); (await import('./js/persist.js')).gameState.updateProperty('tutorial.communicator_opened', true); return 1")
        js("const M=(await import('../game/systems/missionManager.js')).default; M.forceCompleteMission('meetTheCrew'); return 1"); page.wait_for_timeout(300)
        check("the pin shows unread", "unread" in (page.get_attribute("#pin", "class") or ""))
        js(OFFER)
        check("a decision is asked only once", js("return g.getProperty('progress.decisions.pending').length") == 1)
        page.tap("#pin"); page.wait_for_timeout(500)
        check("ARIA is badged in the contact list", page.locator(".comm-badge").count() >= 1)
        page.locator(".comm-who", has_text="ARIA").tap(force=True); page.wait_for_timeout(400)
        t = page.inner_text("#comm-pop")
        check("ARIA puts the choice with both options", "colony ship" in t and "Rescue the colonists" in t and "Engage the pirates" in t, t[:300])
        page.screenshot(path=f"{SHOTS}/a-1decision.png")
        page.locator(".comm-line.decide", has_text="Rescue").tap(force=True); page.wait_for_timeout(400)
        t = page.inner_text("#comm-pop")
        check("ARIA confirms the order", "Setting a course for the colony ship" in t and "You: Rescue the colonists" in t, t[:300])
        check("the option's actions ran, the other did not", js("return g.getProperty('progress.test_rescue') === true && g.getProperty('progress.test_engage') !== true"))
        check("answer recorded, nothing pending", js("return g.getProperty('progress.decisions.made.colonists') === 'rescue' && g.getProperty('progress.decisions.pending').length === 0"))
        check("missions can wait on the answer (decision_made trigger)", js("const M=(await import('../game/systems/missionManager.js')).default; const t={type:'decision_made',decisionId:'colonists',optionId:'rescue'}; return M.checkTriggerCondition(t,{decisionId:'colonists',optionId:'rescue'}) && !M.checkTriggerCondition(t,{decisionId:'colonists',optionId:'engage'}) && M.checkTriggerCondition({type:'decision_made',decisionId:'colonists'},{decisionId:'colonists',optionId:'engage'})"))
        page.screenshot(path=f"{SHOTS}/a-2answer.png")
        # a pending decision survives a reload
        js("g.updateProperty('progress.decisions', {pending: [], made: {}}); return 1"); js(OFFER)
        page.goto(base); page.wait_for_function("!document.getElementById('board-btn').disabled", timeout=20000)
        page.tap("#board-btn"); page.wait_for_timeout(900)
        check("pending decision survives a reload", js("return g.getProperty('progress.decisions.pending').length") == 1)
        check("no page errors", not errors, errors[:3])
        browser.close()
    print("\n%d failure(s)" % len(fails)); sys.exit(1 if fails else 0)
main()
