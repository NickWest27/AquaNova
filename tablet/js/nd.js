// Navigation display: one canvas, north-up, ship-centred. Redraws only when asked.
import { sim, toward } from './sim.js';
import { frameThrottle } from './util.js';
import { seafloor } from './seafloor.js';

const RANGES = [0.5, 1, 2, 4, 8, 16];

// stage: the canvas sits inside the scaled 1920x1080 bridge stage. Sizes then come from layout (not the scaled
// rectangle), and `units` makes text and markers bigger so they read at the stage's smaller on-screen size.
export function createND(wrap, { onPick, stage = false, units = 1, contours = false, rings = true } = {}) {
  const canvas = document.createElement('canvas');
  wrap.prepend(canvas);
  const ctx = canvas.getContext('2d');
  const nd = { range: 2, sel: null, w: 0, h: 0, canvas };

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = wrap.getBoundingClientRect();
    const lw = stage ? wrap.offsetWidth : r.width, lh = stage ? wrap.offsetHeight : r.height;   // layout size
    const sc = stage && lw ? r.width / lw : 1;                                                    // the stage's scale
    nd.w = Math.max(1, Math.round(lw / units)); nd.h = Math.max(1, Math.round(lh / units));
    canvas.width = Math.round(lw * sc * dpr); canvas.height = Math.round(lh * sc * dpr);
    canvas.style.width = lw + 'px'; canvas.style.height = lh + 'px';
    ctx.setTransform((canvas.width / lw) * units, 0, 0, (canvas.height / lh) * units, 0, 0);
    nd.draw();
  }

  const px = (p) => {
    const t = toward(sim.s, p);
    const scale = (Math.min(nd.w, nd.h) / 2 - 24) / nd.range;
    return { x: nd.w / 2 + t.dx * scale, y: nd.h / 2 - t.dy * scale, nm: t.nm, brg: t.brg };
  };

  // Real sea floor: rough contours everywhere, 10 m contours only in a circle round the ship (and each deployed WSKR).
  const WSKR_NM = 3;
  // Sonar sets how much of the sea floor is mapped in detail: sonar on 4 nm, off 0.8 nm (echo sounder only), active sweep 8 nm.
  const fineNm = (s) => (s.clock < (s.sweepUntil || 0) ? 8 : s.sonar ? 4 : 0.8);
  const shade = (l) => (l === 0 ? 'rgba(255,214,120,0.9)' : l > -100 ? 'rgba(130,215,255,0.40)' : l > -500 ? 'rgba(90,170,255,0.45)' : 'rgba(110,130,255,0.55)');
  function strokeLevels(levels, p, w, h, fine) {
    for (const lv of levels) {
      if (fine && (lv.l === 0 || !(lv.l > -200 || (lv.l > -500 ? lv.l % 50 === 0 : lv.l % 100 === 0)))) continue;   // 10 m on the shelf, thinning out with depth so slopes stay readable
      ctx.strokeStyle = fine ? (lv.l % 100 === 0 ? 'rgba(130,200,255,0.55)' : 'rgba(110,190,230,0.26)') : shade(lv.l);
      ctx.lineWidth = lv.l === 0 ? 1.8 : fine ? 0.9 : 1.1; ctx.beginPath();
      for (const ln of lv.lines) {
        const a = ln.a, n = a.length / 2;
        if (p.x(ln.x1) < -20 || p.x(ln.x0) > w + 20 || p.y(ln.y0) < -20 || p.y(ln.y1) > h + 20) continue;   // outside the view
        ctx.moveTo(p.x(a[0]), p.y(a[1]));
        for (let i = 1; i < n; i++) ctx.lineTo(p.x(a[i * 2]), p.y(a[i * 2 + 1]));
      }
      ctx.stroke();
    }
  }
  function drawSeafloor(w, h, R) {
    if (!seafloor.ready) return;
    const s = sim.s, scale = R / nd.range, kx = 60 * Math.cos((s.lat * Math.PI) / 180) * scale, ky = 60 * scale;
    const p = { x: (lon) => w / 2 + (lon - s.lon) * kx, y: (lat) => h / 2 - (lat - s.lat) * ky };
    strokeLevels(seafloor.rough, p, w, h, false);
    if (!rings) {   // scale bar: the main screen has no range rings
      const nice = [0.1, 0.25, 0.5, 1, 2, 5, 10, 20].filter((v) => v * scale < w * 0.25).pop() || 0.1, len = nice * scale, x0 = w - 60 - len, y0 = h - 34;
      ctx.strokeStyle = '#9fd8ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0, y0 - 6); ctx.lineTo(x0, y0); ctx.lineTo(x0 + len, y0); ctx.lineTo(x0 + len, y0 - 6); ctx.stroke();
      ctx.fillStyle = '#9fd8ff'; ctx.font = '600 15px ui-monospace, Menlo, monospace'; ctx.textAlign = 'center'; ctx.fillText(nice + ' nm', x0 + len / 2, y0 - 10);
    }
    const src = [{ lat: s.lat, lon: s.lon, nm: fineNm(s) }, ...(s.wskrs || []).map((q) => ({ lat: q.lat, lon: q.lon, nm: WSKR_NM }))];
    const tiles = seafloor.fineFor(src, nd.redraw);
    if (!tiles.length) return;
    ctx.save(); ctx.beginPath();
    for (const q of src) { const cx = p.x(q.lon), cy = p.y(q.lat); ctx.moveTo(cx + q.nm * scale, cy); ctx.arc(cx, cy, q.nm * scale, 0, 6.2832); }
    ctx.clip();
    for (const t of tiles) strokeLevels(t, p, w, h, true);
    ctx.restore();
    ctx.strokeStyle = 'rgba(100,255,218,0.25)'; ctx.setLineDash([4, 6]); ctx.lineWidth = 1; ctx.beginPath();
    for (const q of src) { const cx = p.x(q.lon), cy = p.y(q.lat); ctx.moveTo(cx + q.nm * scale, cy); ctx.arc(cx, cy, q.nm * scale, 0, 6.2832); }
    ctx.stroke(); ctx.setLineDash([]);
  }

  nd.fineRadius = () => fineNm(sim.s);

  nd.draw = () => {
    const { w, h } = nd, s = sim.s, cx = w / 2, cy = h / 2;
    const R = Math.min(w, h) / 2 - 24;
    if (R < 20) return; // not laid out yet (hidden)
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#03121c'; ctx.fillRect(0, 0, w, h);
    if (contours) drawSeafloor(w, h, R);
    if (rings) {
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(100,255,218,0.25)';
    for (let i = 1; i <= 4; i++) { ctx.beginPath(); ctx.arc(cx, cy, (R * i) / 4, 0, 6.2832); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
    ctx.fillStyle = '#8fa6bd'; ctx.font = '600 14px ui-monospace, Menlo, monospace'; ctx.textAlign = 'left';
    for (let i = 1; i <= 4; i++) ctx.fillText(((nd.range * i) / 4).toFixed(nd.range < 2 ? 2 : 1) + ' nm', cx + 6, cy - (R * i) / 4 + 16);
    ctx.textAlign = 'center'; ctx.fillStyle = '#64ffda'; ctx.font = '800 18px system-ui';
    ctx.fillText('N', cx, cy - R - 6);
    }
    // waypoint line
    if (s.wpt) {
      const p = px(s.wpt), legs = [...(s.route || [])];
      ctx.setLineDash([8, 8]); ctx.strokeStyle = '#ffb020'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx, cy); for (const q of legs) { const a = px(q); ctx.lineTo(a.x, a.y); } if (!legs.length || s.routeSnapped) ctx.lineTo(p.x, p.y); ctx.stroke(); ctx.setLineDash([]);
      if (s.wpt.type === 'waypoint') { ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, 6.2832); ctx.moveTo(p.x - 14, p.y); ctx.lineTo(p.x + 14, p.y); ctx.moveTo(p.x, p.y - 14); ctx.lineTo(p.x, p.y + 14); ctx.stroke(); }
    }
    // WSKRs (deployed sensor probes): diamonds
    for (const q of s.wskrs || []) {
      const t = toward(s, q), scale = R / nd.range, x = w / 2 + t.dx * scale, y = h / 2 - t.dy * scale;
      if (x < -20 || x > w + 20 || y < -20 || y > h + 20) continue;
      ctx.fillStyle = q.mode === 'task' ? '#ff9f43' : '#ffd666'; ctx.beginPath(); ctx.moveTo(x, y - 7); ctx.lineTo(x + 6, y); ctx.lineTo(x, y + 7); ctx.lineTo(x - 6, y); ctx.fill();
      ctx.font = '700 14px system-ui'; ctx.textAlign = 'left'; ctx.fillText('W' + q.n, x + 9, y + 5);
    }
    // POIs
    ctx.font = '700 17px system-ui';
    for (const poi of s.pois) {
      const p = px(poi);
      if (p.x < -40 || p.x > w + 40 || p.y < -40 || p.y > h + 40) continue;
      const isSel = nd.sel && nd.sel.id === poi.id, isW = s.wpt && s.wpt.id === poi.id;
      ctx.fillStyle = isW ? '#ffb020' : isSel ? '#ffffff' : '#64ffda';
      ctx.beginPath();
      if (poi.type === 'dock') { ctx.rect(p.x - 8, p.y - 8, 16, 16); } else { ctx.moveTo(p.x, p.y - 10); ctx.lineTo(p.x + 9, p.y + 7); ctx.lineTo(p.x - 9, p.y + 7); ctx.closePath(); }
      ctx.fill();
      if (isSel) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, 18, 0, 6.2832); ctx.stroke(); }
      ctx.fillStyle = '#e6f1ff'; ctx.fillText(poi.name.length > 22 ? poi.name.slice(0, 21) + '…' : poi.name, p.x, p.y + 28);
    }
    // ship
    ctx.save(); ctx.translate(cx, cy); ctx.rotate((s.heading * Math.PI) / 180);
    ctx.fillStyle = '#3ddc84'; ctx.strokeStyle = '#04101f'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(11, 14); ctx.lineTo(0, 8); ctx.lineTo(-11, 14); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  };

  nd.setRange = (r) => { nd.range = r; nd.draw(); };
  nd.zoom = (dir) => {
    const i = RANGES.indexOf(nd.range);
    nd.setRange(RANGES[Math.max(0, Math.min(RANGES.length - 1, i + dir))]);
    return nd.range;
  };

  canvas.addEventListener('pointerdown', (e) => {
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) * (nd.w / r.width), y = (e.clientY - r.top) * (nd.h / r.height);   // into canvas units
    let best = null, bd = 44 / ((stage ? r.width / (wrap.offsetWidth || r.width) : 1) * units); // a finger-sized pick radius, in canvas units
    for (const poi of sim.s.pois) { const p = px(poi); const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = poi; } }
    nd.sel = best; nd.draw(); onPick && onPick(best);
  });

  nd.redraw = frameThrottle(nd.draw);
  const ro = new ResizeObserver(resize); ro.observe(wrap);
  nd.destroy = () => { ro.disconnect(); canvas.remove(); };
  resize();
  return nd;
}
