#!/usr/bin/env python3
"""iPad <-> iPhone PED sync, tested against a fake GitHub contents API (no network needed).
Run from repo root:  python3 tools/sync_test.py
"""
import base64, json, os, sys, shutil, importlib.util
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location("smoke", os.path.join(ROOT, "tools", "smoke.py"))
smoke = importlib.util.module_from_spec(spec); spec.loader.exec_module(smoke)
SHOTS = os.path.join(ROOT, "tools", "shots"); os.makedirs(SHOTS, exist_ok=True)
fails = []
def check(name, ok, extra=""):
    print(("ok   " if ok else "FAIL ") + name + (f"  {extra}" if extra and not ok else ""))
    if not ok: fails.append(name)

# ---------- fake GitHub ----------
files = {}          # path -> {"text":..., "sha":...}
counter = [0]
flags = {"conflict_once": False, "puts": 0}
CORS = {"access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,PUT,OPTIONS"}
def gh(route):
    r = route.request
    if r.method == "OPTIONS": return route.fulfill(status=204, headers=CORS)
    if r.headers.get("authorization") != "Bearer good-token":
        return route.fulfill(status=401, headers=CORS, body="{}")
    path = r.url.split("/contents/")[1].split("?")[0]
    cur = files.get(path)
    if r.method == "GET":
        if not cur: return route.fulfill(status=404, headers=CORS, body="{}")
        b = base64.encodebytes(cur["text"].encode()).decode()
        return route.fulfill(status=200, headers={**CORS, "content-type": "application/json"}, body=json.dumps({"content": b, "sha": cur["sha"], "encoding": "base64"}))
    body = json.loads(r.post_data)
    flags["puts"] += 1
    if flags["conflict_once"] and path.endswith("logbook") is False and "status" not in path and "active" not in path:
        flags["conflict_once"] = False
        return route.fulfill(status=409, headers=CORS, body="{}")
    if (cur and body.get("sha") != cur["sha"]) or (not cur and body.get("sha")):
        return route.fulfill(status=409, headers=CORS, body="{}")
    counter[0] += 1
    sha = f"sha{counter[0]}"
    files[path] = {"text": base64.b64decode(body["content"]).decode(), "sha": sha}
    return route.fulfill(status=200, headers={**CORS, "content-type": "application/json"}, body=json.dumps({"content": {"sha": sha}}))

def logbook_path():
    return next(p for p in files if p.endswith(".json") and "status" not in p and "active" not in p)

def main():
    server, site = smoke.start_server()
    base = f"http://127.0.0.1:{server.server_address[1]}/AquaNova/"
    errors = []
    with sync_playwright() as p:
        browser = smoke.launch(p)
        ipad_ctx = browser.new_context(viewport={"width": 1180, "height": 820}, has_touch=True, device_scale_factor=2)
        phone_ctx = browser.new_context(viewport={"width": 390, "height": 844}, has_touch=True, device_scale_factor=3, is_mobile=True)
        for c in (ipad_ctx, phone_ctx): c.route("https://api.github.com/**", gh)
        ipad, phone = ipad_ctx.new_page(), phone_ctx.new_page()
        for pg, tag in ((ipad, "ipad"), (phone, "phone")):
            # 401/404/409 from the fake GitHub are expected and show up as "Failed to load resource"; real local 404s are caught below
            pg.on("console", lambda m, tag=tag: errors.append(f"[{tag}] {m.text[:200]}") if m.type == "error" and "Failed to load resource" not in m.text else None)
            pg.on("response", lambda r, tag=tag: errors.append(f"[{tag}] HTTP {r.status} {r.url}") if r.status >= 400 and "api.github.com" not in r.url else None)
            pg.on("pageerror", lambda e, tag=tag: errors.append(f"[{tag}] uncaught {str(e)[:200]}"))
        js = lambda pg, code: pg.evaluate("(async()=>{" + code + "})()")

        # --- iPad boards and connects ---
        ipad.goto(base + "tablet/"); ipad.wait_for_function("!document.getElementById('board-btn').disabled", timeout=15000)
        ipad.tap("#board-btn"); ipad.wait_for_timeout(800); ipad.tap(".modal .btn"); ipad.wait_for_timeout(300)
        ipad.tap('.dbtn[data-st="ped"]'); ipad.wait_for_timeout(500); ipad.tap('button.chip:text-is("Settings")'); ipad.wait_for_timeout(300)
        ipad.fill('input[placeholder="GitHub user name"]', "tester"); ipad.fill('input[placeholder="Saves repo name"]', "aquanova-saves")
        ipad.fill('input[placeholder^="Token"]', "bad-token"); ipad.tap('button:text-is("Connect")'); ipad.wait_for_timeout(800)
        check("bad token is reported", ipad.is_visible("text=Token rejected"))
        ipad.fill('input[placeholder^="Token"]', "good-token"); ipad.tap('button:text-is("Save and sync")'); ipad.wait_for_timeout(1200)
        check("iPad pushed active, logbook and status", "saves/active.json" in files and len([f for f in files if f.endswith(".status.json")]) == 1 and any(f.endswith(".json") and "status" not in f and "active" not in f for f in files), list(files))
        ipad.screenshot(path=f"{SHOTS}/s-1ipad-settings.png")
        book_id = json.loads(files["saves/active.json"]["text"])["activeId"]
        snaps_before = sum(1 for e in json.loads(files[logbook_path()]["text"])["entries"] if e.get("gameSnapshot"))

        # --- phone connects ---
        phone.goto(base + "ped/"); phone.wait_for_timeout(500)
        check("phone starts on setup screen", phone.is_visible("text=One-time setup"))
        phone.fill('input[placeholder="GitHub user name"]', "tester"); phone.fill('input[placeholder="Saves repo name"]', "aquanova-saves"); phone.fill('input[placeholder^="Token"]', "good-token")
        phone.tap('button:text-is("Connect")'); phone.wait_for_timeout(1200)
        phone.tap('#nav [data-tab="status"]'); phone.wait_for_timeout(300)
        check("phone shows ship status from iPad", phone.is_visible("text=Woods Hole Oceanographic Institute"))
        phone.screenshot(path=f"{SHOTS}/s-2phone-status.png")
        phone.tap('#nav [data-tab="missions"]'); phone.wait_for_timeout(300)
        check("phone shows missions", phone.is_visible("text=Pick up the communicator"))
        phone.screenshot(path=f"{SHOTS}/s-3phone-missions.png")

        # --- phone writes ---
        phone.tap('#nav [data-tab="tasks"]'); phone.fill('input[placeholder="New task…"]', "Check ballast tanks"); phone.tap('button:text-is("Add")'); phone.wait_for_timeout(1000)
        phone.tap('#nav [data-tab="journal"]'); phone.fill("textarea", "Phone note from the bus"); phone.tap('button:text-is("Save note")'); phone.wait_for_timeout(1200)
        phone.screenshot(path=f"{SHOTS}/s-4phone-journal.png")
        remote = json.loads(files[logbook_path()]["text"])
        check("phone task reached GitHub", any(t["text"] == "Check ballast tanks" for t in remote.get("pedTasks", [])))
        check("phone note reached GitHub", any(e["logbook"]["type"] == "journal" and "bus" in e["logbook"]["content"] for e in remote["entries"]))
        snaps_after = sum(1 for e in remote["entries"] if e.get("gameSnapshot"))
        check("phone did not touch save points", snaps_after == snaps_before, (snaps_before, snaps_after))

        # --- iPad receives ---
        ipad.tap('button:text-is("Sync now")'); ipad.wait_for_timeout(1500)
        ipad.tap('button.chip:text-is("Tasks")'); ipad.wait_for_timeout(300)
        check("iPad PED shows phone task", ipad.is_visible("text=Check ballast tanks"))
        ipad.tap('button.chip:text-is("Journal")'); ipad.wait_for_timeout(300)
        check("iPad PED shows phone note", ipad.is_visible("text=Phone note from the bus"))
        ipad.screenshot(path=f"{SHOTS}/s-5ipad-journal.png")

        # --- iPad writes back, phone receives ---
        ipad.tap('button.chip:text-is("Tasks")'); ipad.fill('input[placeholder="New task…"]', "Brief ARIA"); ipad.tap('button:text-is("Add")'); ipad.wait_for_timeout(4500)
        phone.tap("#chip"); phone.wait_for_timeout(1500); phone.tap('#nav [data-tab="tasks"]'); phone.wait_for_timeout(300)
        check("phone shows iPad task", phone.is_visible("text=Brief ARIA"))
        check("phone still shows its own task", phone.is_visible("text=Check ballast tanks"))

        # --- conflict retry ---
        flags["conflict_once"] = True
        phone.fill('input[placeholder="New task…"]', "After conflict"); phone.tap('button:text-is("Add")'); phone.wait_for_timeout(1500)
        remote = json.loads(files[logbook_path()]["text"])
        check("write survives a 409 conflict", any(t["text"] == "After conflict" for t in remote["pedTasks"]))

        # --- revert on iPad does not bring entries back, keeps journal ---
        js(ipad, "const p=await import('./js/persist.js'); p.addLogEntry('Save point A'); p.addLogEntry('Save point B');")
        ipad.tap('button:text-is("Sync now")') if ipad.is_visible('button:text-is("Sync now")') else None
        ipad.wait_for_timeout(200)
        ipad.tap("#station .st-head .btn"); ipad.tap('.dbtn[data-st="log"]'); ipad.wait_for_timeout(500)
        ipad.locator(".entry", has_text="Save point A").locator("text=Revert here").tap(); ipad.wait_for_timeout(300)
        ipad.tap(".modal .btn.primary"); ipad.wait_for_timeout(5000)
        remote = json.loads(files[logbook_path()]["text"])
        texts = [e["logbook"]["content"] for e in remote["entries"]]
        check("revert: later save point gone from GitHub", not any("Save point B" in t for t in texts), texts[-4:])
        check("revert: phone note kept", any("Phone note from the bus" in t for t in texts))
        phone.tap("#chip"); phone.wait_for_timeout(1500)
        remote = json.loads(files[logbook_path()]["text"])
        check("phone sync does not resurrect reverted entry", not any("Save point B" in e["logbook"]["content"] for e in remote["entries"]))
        ipad.tap("text=Revert here") if False else None
        ipad_ctx.close(); phone_ctx.close(); browser.close()
    server.shutdown(); shutil.rmtree(site, ignore_errors=True)
    check("no console errors", not errors, errors)
    print(f"\n{len(fails)} failure(s)"); sys.exit(1 if fails else 0)

if __name__ == "__main__":
    main()
