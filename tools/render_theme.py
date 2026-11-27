#!/usr/bin/env python3
"""Render the main title (tablet/js/theme.js) to docs/audio/aqua_nova_theme.mp3 (WAV from the browser's offline audio engine, then ffmpeg).
python3 tools/render_theme.py"""
import os, sys, base64, importlib.util
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location("smoke", os.path.join(ROOT, "tools", "smoke.py"))
smoke = importlib.util.module_from_spec(spec); spec.loader.exec_module(smoke)
server, site = smoke.start_server()
base = f"http://127.0.0.1:{server.server_address[1]}/AquaNova/tablet/"
with sync_playwright() as p:
    b = smoke.launch(p); pg = b.new_page(); pg.goto(base + "?intake=0"); pg.wait_for_timeout(1500)
    b64 = pg.evaluate("""(async()=>{const T=await import('./js/theme.js'); const sr=44100, ctx=new OfflineAudioContext(2, sr*110, sr);
      const len=T.scheduleTheme(ctx, ctx.destination, 0.05); const buf=await ctx.startRendering(); const n=Math.min(buf.length, Math.ceil((len+0.1)*sr));
      const L=buf.getChannelData(0), R=buf.getChannelData(1); let peak=0; for(let i=0;i<n;i++) peak=Math.max(peak,Math.abs(L[i]),Math.abs(R[i]));
      const k=peak>0? 0.89/peak : 1, out=new DataView(new ArrayBuffer(44+n*4)); const w=(o,s)=>{for(let i=0;i<s.length;i++) out.setUint8(o+i,s.charCodeAt(i));};
      w(0,'RIFF'); out.setUint32(4,36+n*4,true); w(8,'WAVE'); w(12,'fmt '); out.setUint32(16,16,true); out.setUint16(20,1,true); out.setUint16(22,2,true); out.setUint32(24,sr,true); out.setUint32(28,sr*4,true); out.setUint16(32,4,true); out.setUint16(34,16,true); w(36,'data'); out.setUint32(40,n*4,true);
      for(let i=0;i<n;i++){ out.setInt16(44+i*4, Math.max(-1,Math.min(1,L[i]*k))*32767, true); out.setInt16(46+i*4, Math.max(-1,Math.min(1,R[i]*k))*32767, true); }
      let s=''; const bytes=new Uint8Array(out.buffer); for(let i=0;i<bytes.length;i+=0x8000) s+=String.fromCharCode.apply(null, bytes.subarray(i,i+0x8000)); return {b64:btoa(s), len, peak};})()""")
    b.close()
server.shutdown()
path = os.path.join(ROOT, "docs", "audio", "aqua_nova_theme.wav")
open(path, "wb").write(base64.b64decode(b64["b64"]))
mp3 = path[:-4] + ".mp3"
os.system(f'ffmpeg -loglevel error -y -i "{path}" -codec:a libmp3lame -b:a 160k "{mp3}"'); os.remove(path)
print(f"wrote {mp3}: {b64['len']:.1f} s, peak before normalising {b64['peak']:.2f}")
