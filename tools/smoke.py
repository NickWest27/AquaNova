#!/usr/bin/env python3
"""Smoke test: load every screen at iPad size and fail on any error.

Run from the repo root:   python3 tools/smoke.py

It serves the repo under /AquaNova/ (the same subpath GitHub Pages uses),
opens each page in headless Chrome, and reports console errors, uncaught
errors, failed requests and HTTP errors. It also checks that the debug
panel opens. Screenshots go to tools/shots/ (not committed).

Needs: python3 with playwright, and Chrome (or Playwright's Chromium).
"""
import functools
import http.server
import os
import shutil
import socketserver
import sys
import tempfile
import threading

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, "tools", "shots")
VIEWPORT = {"width": 1180, "height": 820}  # iPad Air, landscape
PAGES = [
    "index.html",
    "ui/captains-quarters/quarters.html",
    "ui/captains-quarters/logbook/logbook.html",
    "ui/bridge/bridge.html",
    "tablet/index.html",
    "tablet/retro/demo.html",
    "ped/index.html",
]


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def start_server():
    site = tempfile.mkdtemp()
    os.symlink(ROOT, os.path.join(site, "AquaNova"))
    handler = functools.partial(QuietHandler, directory=site)
    server = socketserver.TCPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, site


def launch(playwright):
    for path in ("/usr/bin/google-chrome", shutil.which("google-chrome"), shutil.which("chromium")):
        if path and os.path.exists(path):
            return playwright.chromium.launch(executable_path=path, args=["--no-sandbox"])
    return playwright.chromium.launch(args=["--no-sandbox"])


def main():
    os.makedirs(SHOTS, exist_ok=True)
    server, site = start_server()
    base = f"http://127.0.0.1:{server.server_address[1]}/AquaNova/"
    problems = 0
    with sync_playwright() as p:
        browser = launch(p)
        for index, page_path in enumerate(PAGES):
            page = browser.new_page(viewport=VIEWPORT)
            issues = []
            page.on("console", lambda m: issues.append(f"console {m.type}: {m.text[:160]}") if m.type == "error" else None)
            page.on("pageerror", lambda e: issues.append(f"uncaught: {str(e)[:160]}"))
            page.on("requestfailed", lambda r: issues.append(f"request failed: {r.url}"))
            page.on("response", lambda r: issues.append(f"HTTP {r.status}: {r.url}") if r.status >= 400 else None)
            page.goto(base + page_path)
            page.wait_for_timeout(2500)

            # The debug panel must open with the backtick key.
            page.keyboard.press("`")
            opened = page.evaluate("getComputedStyle(document.getElementById('debug-panel') || document.body).display === 'flex'")
            if not opened:
                issues.append("debug panel did not open")

            page.screenshot(path=os.path.join(SHOTS, f"{index}-{os.path.basename(page_path)}.png"))
            status = "FAIL" if issues else "ok  "
            print(f"{status} {page_path}")
            for issue in issues:
                print(f"       {issue}")
            problems += len(issues)
            page.close()
        browser.close()
    server.shutdown()
    shutil.rmtree(site, ignore_errors=True)
    print(f"\n{problems} problem(s). Screenshots: tools/shots/")
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
