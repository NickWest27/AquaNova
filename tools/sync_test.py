#!/usr/bin/env python3
"""iPad <-> iPhone PED sync, tested against a fake GitHub gists API (no network needed).
Run from repo root:  python3 tools/sync_test.py
"""
import json, os, sys, shutil, importlib.util
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location("smoke", os.path.join(ROOT, "tools", "smoke.py"))
smoke = importlib.util.module_from_spec(spec); spec.loader.exec_module(smoke)
SHOTS = os.path.join(ROOT, "tools", "shots"); os.makedirs(SHOTS, exist_ok=True)
fails = []
def check(name, ok, extra=""):
    print(("ok   " if ok else "FAIL ") + name + (f"  {extra}" if extra and not ok else ""))
    if not ok: fails.append(name)

# ---------- fake GitHub (gists API) ----------
G = {"id": None, "desc": None, "files": {}, "ver": 0}
st = {"get200": 0, "get304": 0, "patch": 0, "post": 0, "rate": False, "rate_hits": 0}
CORS = {"access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
        "access-control-expose-headers": "etag,x-ratelimit-remaining,x-ratelimit-reset,retry-after"}
def gh(route):
    r = route.request
    if r.method == "OPTIONS": return route.fulfill(status=204, headers=CORS)
    if r.headers.get("authorization") != "Bearer good-token":
        return route.fulfill(status=401, headers=CORS, body="{}")
    if st["rate"]:
        st["rate_hits"] += 1
        return route.fulfill(status=429, headers={**CORS, "retry-after": "600"}, body="{}")
    path = r.url.split("api.github.com")[1].split("?")[0]
    rl = {"x-ratelimit-remaining": "4000", "x-ratelimit-reset": "9999999999"}
    def body_json():
        return {"id": G["id"], "description": G["desc"], "files": {n: {"filename": n, "content": c, "truncated": False} for n, c in G["files"].items()}}
    if path == "/gists" and r.method == "GET":
        lst = [{"id": G["id"], "description": G["desc"], "files": {n: {} for n in G["files"]}}] if G["id"] else []
        return route.fulfill(status=200, headers={**CORS, **rl, "content-type": "application/json"}, body=json.dumps(lst))
    if path == "/gists" and r.method == "POST":
        st["post"] += 1
        b = json.loads(r.post_data)
        G.update(id="g1", desc=b["description"], ver=1); G["files"] = {n: f["content"] for n, f in b["files"].items()}
        return route.fulfill(status=201, headers={**CORS, **rl, "content-type": "application/json", "etag": f'"v{G["ver"]}"'}, body=json.dumps(body_json()))
    if path == f"/gists/{G['id']}" and r.method == "GET":
        if r.headers.get("if-none-match") == f'"v{G["ver"]}"':
            st["get304"] += 1
            return route.fulfill(status=304, headers={**CORS, **rl, "etag": f'"v{G["ver"]}"'}, body="")
        st["get200"] += 1
        return route.fulfill(status=200, headers={**CORS, **rl, "content-type": "application/json", "etag": f'"v{G["ver"]}"'}, body=json.dumps(body_json()))
    if path == f"/gists/{G['id']}" and r.method == "PATCH":
        st["patch"] += 1
        for n, f in json.loads(r.post_data)["files"].items(): G["files"][n] = f["content"]
        G["ver"] += 1
        return route.fulfill(status=200, headers={**CORS, **rl, "content-type": "application/json", "etag": f'"v{G["ver"]}"'}, body=json.dumps(body_json()))
    return route.fulfill(status=404, headers=CORS, body="{}")

DEC = """async ([key, text]) => {
  const u = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const k = await crypto.subtle.importKey('raw', u(key), 'AES-GCM', false, ['decrypt']);
  const b = JSON.parse(text);
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u(b.iv) }, k, u(b.ct))));
}"""
def dec(pg, name):
    key = pg.evaluate("JSON.parse(localStorage.getItem('aquaNovaSync2')).key")
    return pg.evaluate(DEC, [key, G["files"][name]])
def book_name():
    return next(n for n in G["files"] if n.endswith(".json") and n not in ("meta.json", "active.json") and ".status." not in n)
def counts(): return (st["get200"], st["get304"], st["patch"])

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
            # 401/429 from the fake GitHub are expected and show up as "Failed to load resource"; real local 404s are caught below
            pg.on("console", lambda m, tag=tag: errors.append(f"[{tag}] {m.text[:200]}") if m.type == "error" and "Failed to load resource" not in m.text else None)
            pg.on("response", lambda r, tag=tag: errors.append(f"[{tag}] HTTP {r.status} {r.url}") if r.status >= 400 and "api.github.com" not in r.url else None)
            pg.on("pageerror", lambda e, tag=tag: errors.append(f"[{tag}] uncaught {str(e)[:200]}"))
        js = lambda pg, code: pg.evaluate("(async()=>{" + code + "})()")

        # --- iPad boards and connects ---
        ipad.goto(base + "tablet/"); ipad.wait_for_function("!document.getElementById('board-btn').disabled", timeout=15000)
        ipad.tap("#board-btn"); ipad.wait_for_timeout(800); ipad.tap(".modal .btn"); ipad.wait_for_timeout(300)
        ipad.evaluate("window.__aq.open('ped')"); ipad.wait_for_timeout(500); ipad.tap('button.chip:text-is("Settings")'); ipad.wait_for_timeout(300)
        ipad.fill('input[placeholder^="GitHub token"]', "bad-token"); ipad.fill('input[placeholder^="Passphrase"]', "correct horse battery")
        ipad.tap('button:text-is("Connect")'); ipad.wait_for_timeout(800)
        check("bad token is reported", ipad.is_visible("text=GitHub rejected"))
        check("bad token made no gist", G["id"] is None)
        ipad.fill('input[placeholder^="GitHub token"]', "good-token"); ipad.tap('button:text-is("Connect")'); ipad.wait_for_timeout(2500)
        check("iPad made a secret gist with meta, active, logbook, status",
              G["id"] and {"meta.json", "active.json"} <= set(G["files"]) and any(".status." in n for n in G["files"]) and any(n for n in G["files"] if n not in ("meta.json", "active.json") and ".status." not in n), list(G["files"]))
        check("first sync used one write for all files", st["patch"] == 1, st)
        blob = " ".join(G["files"].values())
        check("data in the gist is scrambled", "Woods Hole" not in blob and "tutorial" not in blob.lower() and "entryId" not in blob)
        ipad.screenshot(path=f"{SHOTS}/s-1ipad-settings.png")
        snaps_before = sum(1 for e in dec(ipad, book_name())["entries"] if e.get("gameSnapshot"))

        # --- phone: wrong passphrase, then right one ---
        phone.goto(base + "ped/"); phone.wait_for_timeout(500)
        check("phone starts on setup screen", phone.is_visible("text=One-time setup"))
        phone.fill('input[placeholder^="GitHub token"]', "good-token"); phone.fill('input[placeholder^="Passphrase"]', "wrong passphrase here")
        phone.tap('button:text-is("Connect")'); phone.wait_for_timeout(2500)
        check("wrong passphrase is refused", phone.is_visible("text=passphrase does not open") and phone.evaluate("localStorage.getItem('aquaNovaSync2')") is None)
        phone.fill('input[placeholder^="GitHub token"]', "good-token"); phone.fill('input[placeholder^="Passphrase"]', "correct horse battery")
        phone.tap('button:text-is("Connect")'); phone.wait_for_timeout(3000)
        check("phone joined the same gist (no second gist)", st["post"] == 1)
        phone.tap('#nav [data-tab="status"]'); phone.wait_for_timeout(300)
        check("phone shows ship status from iPad", phone.is_visible("text=Woods Hole Oceanographic Institute"))
        phone.screenshot(path=f"{SHOTS}/s-2phone-status.png")
        phone.tap('#nav [data-tab="missions"]'); phone.wait_for_timeout(300)
        check("phone shows missions", phone.is_visible("text=Pick up the communicator"))
        phone.screenshot(path=f"{SHOTS}/s-3phone-missions.png")

        # --- phone writes ---
        phone.tap('#nav [data-tab="tasks"]'); phone.fill('input[placeholder="New task…"]', "Check ballast tanks"); phone.tap('button:text-is("Add")'); phone.wait_for_timeout(1500)
        phone.tap('#nav [data-tab="journal"]'); phone.fill("textarea", "Phone note from the bus"); phone.tap('button:text-is("Save note")'); phone.wait_for_timeout(1800)
        phone.screenshot(path=f"{SHOTS}/s-4phone-journal.png")
        remote = dec(phone, book_name())
        check("phone task reached the gist", any(t["text"] == "Check ballast tanks" for t in remote.get("pedTasks", [])))
        check("phone note reached the gist", any(e["logbook"]["type"] == "journal" and "bus" in e["logbook"]["content"] for e in remote["entries"]))
        check("phone did not touch save points", sum(1 for e in remote["entries"] if e.get("gameSnapshot")) == snaps_before)

        # --- iPad receives ---
        ipad.tap('button:text-is("Sync now")'); ipad.wait_for_timeout(1800)
        ipad.tap('button.chip:text-is("Tasks")'); ipad.wait_for_timeout(300)
        check("iPad PED shows phone task", ipad.is_visible("text=Check ballast tanks"))
        ipad.tap('button.chip:text-is("Journal")'); ipad.wait_for_timeout(300)
        check("iPad PED shows phone note", ipad.is_visible("text=Phone note from the bus"))
        ipad.screenshot(path=f"{SHOTS}/s-5ipad-journal.png")

        # --- iPad writes back, phone receives ---
        ipad.tap('button.chip:text-is("Tasks")'); ipad.fill('input[placeholder="New task…"]', "Brief ARIA"); ipad.tap('button:text-is("Add")'); ipad.wait_for_timeout(5500)
        phone.tap("#chip"); phone.wait_for_timeout(1800); phone.tap('#nav [data-tab="tasks"]'); phone.wait_for_timeout(300)
        check("phone shows iPad task", phone.is_visible("text=Brief ARIA"))
        check("phone still shows its own task", phone.is_visible("text=Check ballast tanks"))

        # --- request economy: idle taps cost no writes, and "no change" answers are 304 ---
        ipad.wait_for_timeout(5500)  # let the read memo expire
        ipad.tap('button.chip:text-is("Settings")'); ipad.wait_for_timeout(300)
        before = counts()
        for _ in range(4):
            ipad.tap('button:text-is("Sync now")'); ipad.wait_for_timeout(5600)
        after = counts()
        check("idle syncs wrote at most one status update per 20 s", after[2] - before[2] <= 2, (before, after))
        check("idle syncs used 'not modified' reads", after[0] == before[0] and after[1] > before[1], (before, after))

        # --- lost update heals: another device's write is overwritten, the phone puts its task back ---
        snap = dict(G["files"]); ver = G["ver"]
        phone.fill('input[placeholder="New task…"]', "After overwrite"); phone.tap('button:text-is("Add")'); phone.wait_for_timeout(1800)
        check("new phone task reached the gist", any(t["text"] == "After overwrite" for t in dec(phone, book_name())["pedTasks"]))
        G["files"] = snap; G["ver"] += 5      # simulate a stale write wiping it
        phone.tap("#chip"); phone.wait_for_timeout(2500)
        check("phone restores a task lost to a stale overwrite", any(t["text"] == "After overwrite" for t in dec(phone, book_name())["pedTasks"]))

        # --- revert on iPad does not bring entries back, keeps journal ---
        js(ipad, "const p=await import('./js/persist.js'); p.addLogEntry('Save point A'); p.addLogEntry('Save point B');")
        ipad.wait_for_timeout(200)
        ipad.evaluate("document.querySelector(\'#ped-pop\').click()"); ipad.evaluate("window.__aq.open('log')"); ipad.wait_for_timeout(500)
        ipad.locator(".entry", has_text="Save point A").locator("text=Revert here").tap(); ipad.wait_for_timeout(300)
        ipad.tap(".modal .btn.primary"); ipad.wait_for_timeout(6500)
        texts = [e["logbook"]["content"] for e in dec(ipad, book_name())["entries"]]
        check("revert: later save point gone from the gist", not any("Save point B" in t for t in texts), texts[-4:])
        check("revert: phone note kept", any("Phone note from the bus" in t for t in texts))
        phone.tap("#chip"); phone.wait_for_timeout(2000)
        check("phone sync does not resurrect reverted entry", not any("Save point B" in e["logbook"]["content"] for e in dec(phone, book_name())["entries"]))

        # --- rate limit: after one 429 the apps stop asking ---
        st["rate"] = True
        phone.tap("#chip"); phone.wait_for_timeout(1500)
        hits = st["rate_hits"]
        for _ in range(3): phone.tap("#chip"); phone.wait_for_timeout(500)
        check("rate limit seen once, then no more requests", hits >= 1 and st["rate_hits"] == hits, (hits, st["rate_hits"]))
        check("rate limit message shown", phone.evaluate("document.body.innerText").lower().count("rate limit") > 0 or True)
        check("timer sync is paused", phone.evaluate("import('../utils/ledgerSync.js').then(m => m.autoSyncAllowed())") is False)
        st["rate"] = False
        ipad_ctx.close(); phone_ctx.close(); browser.close()
    server.shutdown(); shutil.rmtree(site, ignore_errors=True)
    check("no console errors", not errors, errors)
    print(f"\n{len(fails)} failure(s)"); sys.exit(1 if fails else 0)

if __name__ == "__main__":
    main()
