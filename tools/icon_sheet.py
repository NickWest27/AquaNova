#!/usr/bin/env python3
"""Render every contact symbol to tools/shots/icons.png.  python3 tools/icon_sheet.py"""
import os, importlib.util
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location("smoke", os.path.join(ROOT, "tools", "smoke.py")); smoke = importlib.util.module_from_spec(spec); spec.loader.exec_module(smoke)
server, site = smoke.start_server(); base = f"http://127.0.0.1:{server.server_address[1]}/AquaNova/tablet/"
with sync_playwright() as p:
    b = smoke.launch(p); page = b.new_context(viewport={"width": 640, "height": 330}).new_page(); page.goto(base + "index.html"); page.wait_for_timeout(500)
    page.evaluate("""(async()=>{const m=await import('./js/contactIcons.js'); document.body.innerHTML='<canvas id=c width=640 height=330 style="position:fixed;left:0;top:0;background:#04101f;z-index:99999"></canvas>'; const ctx=document.getElementById('c').getContext('2d');
      const sides=['friendly','neutral','unfriendly','hostile','unknown'], types=['surface','sub','installation','unknown']; ctx.fillStyle='#b8c9dc'; ctx.font='13px system-ui';
      sides.forEach((a,i)=>ctx.fillText(a,120+i*100,22)); types.forEach((t,j)=>{ctx.fillText(t,10,90+j*70); sides.forEach((a,i)=>{ctx.save();ctx.translate(150+i*100,80+j*70);m.drawContact(ctx,t,a,22);ctx.restore();});}); })()""")
    page.wait_for_timeout(300); page.screenshot(path=os.path.join(ROOT, "tools", "shots", "icons.png")); b.close()
server.shutdown()
