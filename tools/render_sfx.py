#!/usr/bin/env python3
"""Render every sound in tablet/js/sfx.js to docs/audio/sfx/<name>.mp3, plus docs/audio/sfx_reel.mp3 (all of them in a row, the
loops for 6 s each) and docs/audio/sfx_reel.txt (what plays when).   python3 tools/render_sfx.py"""
import os, base64, importlib.util, json, subprocess
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location("smoke", os.path.join(ROOT, "tools", "smoke.py"))
smoke = importlib.util.module_from_spec(spec); spec.loader.exec_module(smoke)
OUT = os.path.join(ROOT, "docs", "audio", "sfx"); os.makedirs(OUT, exist_ok=True)
JS = """async ([name, secs]) => { const S=await import('./js/sfx.js'); const sr=44100, ctx=new OfflineAudioContext(2, Math.ceil(sr*secs), sr);
  let len; if (S.isLoop(name)) { S.loopSfx(ctx, ctx.destination, name, {vol:1}); len=secs; } else len=S.playSfx(ctx, ctx.destination, name, {t:0.05});
  const buf=await ctx.startRendering(); const n=Math.min(buf.length, Math.ceil((len+0.2)*sr)); const L=buf.getChannelData(0), R=buf.getChannelData(1);
  let peak=0; for(let i=0;i<n;i++) peak=Math.max(peak,Math.abs(L[i]),Math.abs(R[i])); const k=peak>0?0.85/peak:1;
  const out=new DataView(new ArrayBuffer(44+n*4)), w=(o,s)=>{for(let i=0;i<s.length;i++) out.setUint8(o+i,s.charCodeAt(i));};
  w(0,'RIFF'); out.setUint32(4,36+n*4,true); w(8,'WAVE'); w(12,'fmt '); out.setUint32(16,16,true); out.setUint16(20,1,true); out.setUint16(22,2,true); out.setUint32(24,sr,true); out.setUint32(28,sr*4,true); out.setUint16(32,4,true); out.setUint16(34,16,true); w(36,'data'); out.setUint32(40,n*4,true);
  for(let i=0;i<n;i++){ out.setInt16(44+i*4,Math.max(-1,Math.min(1,L[i]*k))*32767,true); out.setInt16(46+i*4,Math.max(-1,Math.min(1,R[i]*k))*32767,true); }
  let s=''; const b=new Uint8Array(out.buffer); for(let i=0;i<b.length;i+=0x8000) s+=String.fromCharCode.apply(null,b.subarray(i,i+0x8000)); return {b64:btoa(s), len, peak}; }"""
server, site = smoke.start_server(); base = f"http://127.0.0.1:{server.server_address[1]}/AquaNova/tablet/"
with sync_playwright() as p:
    b = smoke.launch(p); pg = b.new_page(); pg.goto(base + "?intake=0"); pg.wait_for_timeout(1500)
    names = pg.evaluate("(async()=>{const S=await import('./js/sfx.js'); return Object.entries(S.SFX_LIST)})()")
    wavs, reel_txt, t = [], [], 0.0
    for name, desc in names:
        r = pg.evaluate(JS, [name, 6.0 if desc.startswith('LOOP') else 8.0])
        wav = os.path.join(OUT, name + ".wav"); open(wav, "wb").write(base64.b64decode(r["b64"])); wavs.append(wav)
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", wav, "-codec:a", "libmp3lame", "-b:a", "128k", wav[:-4] + ".mp3"], check=True)
        reel_txt.append(f"{int(t // 60)}:{t % 60:04.1f}  {name:16s} {desc}"); t += r["len"] + 0.2 + 1.0
        print(f"{name:16s} {r['len']:4.1f} s  peak {r['peak']:.2f}")
    b.close()
server.shutdown()
# the reel: every sound with a second of silence between
lst = os.path.join(OUT, "list.txt"); sil = os.path.join(OUT, "silence.wav")
subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", "1", "-c:a", "pcm_s16le", sil], check=True)
open(lst, "w").write("".join(f"file '{w}'\nfile '{sil}'\n" for w in wavs))
subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-codec:a", "libmp3lame", "-b:a", "128k", os.path.join(ROOT, "docs", "audio", "sfx_reel.mp3")], check=True)
open(os.path.join(ROOT, "docs", "audio", "sfx_reel.txt"), "w").write("Aqua Nova sound effects reel (tablet/js/sfx.js)\n\n" + "\n".join(reel_txt) + "\n")
for w in wavs + [sil, lst]: os.remove(w)
print("reel:", os.path.join(ROOT, "docs", "audio", "sfx_reel.mp3"))
