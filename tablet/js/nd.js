// Navigation display: one canvas, north-up, ship-centred. Redraws only when asked.
import { sim, toward, WSKR_CODES } from './sim.js';
import { frameThrottle } from './util.js';
import { seafloor } from './seafloor.js';

const RANGES = [0.5, 1, 2, 4, 8, 16, 32, 64, 128, 256];   // the chart is about 216 nm across, so 128 and 256 show all of it

// stage: the canvas sits inside the scaled 1920x1080 bridge stage. Sizes then come from layout (not the scaled
// rectangle), and `units` makes text and markers bigger so they read at the stage's smaller on-screen size.
export function createND(wrap, { onPick, stage = false, units = 1, contours = false, rings = true, craft = null, trackUp = false, focus = null, bigWskr = false, onWskr = null } = {}) {   // focus: () => a point to centre on (the ship keeps its place and, with trackUp, its heading is still up); bigWskr: WSKR diamonds carry their code; onWskr(q): a tap on a WSKR   // trackUp: the ship's heading is up (the map turns); contours stay north-up, so use it without them   // craft: () => { lat, lon, heading } centres the map on a craft (Remora, a WSKR) instead of the ship
  const canvas = document.createElement('canvas');
  wrap.prepend(canvas);
  const ctx = canvas.getContext('2d');
  const ctr = () => { if (nd.pan) return { lat: nd.pan.lat, lon: nd.pan.lon, heading: sim.s.heading }; const f = focus && focus(); return f ? { lat: f.lat, lon: f.lon, heading: sim.s.heading } : (craft && craft()) || sim.s; };
  // rotate an east/north offset so the ship's heading points up (track up), or leave it north up
  const turn = (t) => { if (!trackUp) return t; const h = (ctr().heading * Math.PI) / 180, c = Math.cos(h), s = Math.sin(h); return { ...t, dx: t.dx * c - t.dy * s, dy: t.dx * s + t.dy * c }; };
  const nd = { range: 2, sel: null, selWskr: null, w: 0, h: 0, canvas };

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
    const t = turn(toward(ctr(), p));
    const scale = (Math.min(nd.w, nd.h) / 2 - 24) / nd.range;
    return { x: nd.w / 2 + t.dx * scale, y: nd.h / 2 - t.dy * scale, nm: t.nm, brg: t.brg };
  };

  // Real sea floor: rough contours everywhere, 10 m contours only in a circle round the ship (and each deployed WSKR).
  const WSKR_NM = 3;
  // Sonar sets how much of the sea floor is mapped in detail: sonar on 4 nm, off 0.8 nm (echo sounder only), active sweep 8 nm.
  const fineNm = (s) => sim.fineNm(s);
  const shade = (l) => (l === 0 ? 'rgba(255,214,120,0.9)' : l > -100 ? 'rgba(130,215,255,0.40)' : l > -500 ? 'rgba(90,170,255,0.45)' : 'rgba(110,130,255,0.55)');
  function strokeLevels(levels, p, w, h, fine, ox = 0, oy = 0) {
    for (const lv of levels) {
      if (fine && (lv.l === 0 || !(lv.l > -200 || (lv.l > -1000 ? lv.l % 20 === 0 : lv.l > -3500 ? lv.l % 50 === 0 : lv.l % 100 === 0)))) continue;   // 10 m on the shelf, then every 20 m to 1000 m, 50 m to 3500 m and 100 m below: finer than before so the deep canyon keeps its detail
      ctx.strokeStyle = fine ? (lv.l % 100 === 0 ? 'rgba(130,200,255,0.55)' : 'rgba(110,190,230,0.26)') : shade(lv.l);
      ctx.lineWidth = lv.l === 0 ? 1.8 : fine ? 0.9 : 1.1; ctx.beginPath();
      for (const ln of lv.lines) {
        const a = ln.a, n = a.length / 2;
        if (p.x(ln.x1) < -20 - ox || p.x(ln.x0) > w + 20 + ox || p.y(ln.y0) < -20 - oy || p.y(ln.y1) > h + 20 + oy) continue;   // outside the view
        ctx.moveTo(p.x(a[0]), p.y(a[1]));
        for (let i = 1; i < n; i++) ctx.lineTo(p.x(a[i * 2]), p.y(a[i * 2 + 1]));
      }
      ctx.stroke();
    }
  }
  // Area of Operations: everything outside the charted area is a no-transgression zone, hatched red with a dashed limit line.
  function drawLimit(w, h, p, s, kx, ky, ox, oy) {
    const st = 12, x0 = -ox, y0 = -oy, nx = Math.ceil((w + 2 * ox) / st) + 1, ny = Math.ceil((h + 2 * oy) / st) + 1;
    const out = new Uint8Array(nx * ny); let any = false;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const lon = s.lon + (x0 + i * st - w / 2) / kx, lat = s.lat - (y0 + j * st - h / 2) / ky;
      if (!seafloor.inside(lat, lon)) { out[j * nx + i] = 1; any = true; }
    }
    if (!any) return;
    const zone = new Path2D(), edge = new Path2D(), o = (i, j) => (i < 0 || j < 0 || i >= nx || j >= ny ? 0 : out[j * nx + i]);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if (!out[j * nx + i]) continue;
      const x = x0 + i * st - st / 2, y = y0 + j * st - st / 2;
      zone.rect(x, y, st, st);
      if (!o(i - 1, j) && i > 0) { edge.moveTo(x, y); edge.lineTo(x, y + st); }
      if (!o(i + 1, j) && i < nx - 1) { edge.moveTo(x + st, y); edge.lineTo(x + st, y + st); }
      if (!o(i, j - 1) && j > 0) { edge.moveTo(x, y); edge.lineTo(x + st, y); }
      if (!o(i, j + 1) && j < ny - 1) { edge.moveTo(x, y + st); edge.lineTo(x + st, y + st); }
    }
    ctx.save(); ctx.clip(zone);
    ctx.fillStyle = 'rgba(120,10,20,0.35)'; ctx.fillRect(x0, y0, w + 2 * ox, h + 2 * oy);
    ctx.strokeStyle = 'rgba(255,70,80,0.38)'; ctx.lineWidth = 2; ctx.beginPath();
    const span = (w + 2 * ox) + (h + 2 * oy);
    for (let d = 0; d < span; d += 18) { ctx.moveTo(x0 + d, y0); ctx.lineTo(x0 + d - (h + 2 * oy), y0 + h + 2 * oy); }
    ctx.stroke(); ctx.restore();
    ctx.save(); ctx.strokeStyle = 'rgba(255,90,100,0.95)'; ctx.lineWidth = 2.5; ctx.setLineDash([10, 6]); ctx.stroke(edge); ctx.restore();
  }
  function drawSeafloor(w, h, R) {
    if (!seafloor.ready) return;
    const s = ctr(), sh = sim.s, scale = R / nd.range, kx = 60 * Math.cos((s.lat * Math.PI) / 180) * scale, ky = 60 * scale;
    const p = { x: (lon) => w / 2 + (lon - s.lon) * kx, y: (lat) => h / 2 - (lat - s.lat) * ky };
    const D = trackUp ? Math.hypot(w, h) : 0, ox = trackUp ? (D - w) / 2 : 0, oy = trackUp ? (D - h) / 2 : 0;   // track up turns the chart, so its corners reach further
    strokeLevels(seafloor.rough, p, w, h, false, ox, oy);
    drawLimit(w, h, p, s, kx, ky, ox, oy);
    const src = [{ lat: sh.lat, lon: sh.lon, nm: fineNm(sh) }, ...(sh.wskrs || []).map((q) => ({ lat: q.lat, lon: q.lon, nm: WSKR_NM }))];
    // Fine contours show wherever we have charted (fog of war) plus what the sonar and WSKRs see right now. At very wide ranges they would only clutter.
    const dLonV = (D || w) / 2 / kx, dLatV = (D || h) / 2 / ky;
    const view = nd.range <= 16 ? seafloor.chartView(s.lat - dLatV, s.lat + dLatV, s.lon - dLonV, s.lon + dLonV) : { runs: [], keys: [] };
    const tiles = nd.range <= 16 ? seafloor.loadTiles([...view.keys, ...src.flatMap((q) => seafloor.tilesNear(q.lat, q.lon, q.nm))], nd.redraw) : [];
    if (tiles.length) {
      ctx.save(); const clip = new Path2D();
      for (const r of view.runs) clip.rect(p.x(r.lon0), p.y(r.lat1), (r.lon1 - r.lon0) * kx, (r.lat1 - r.lat0) * ky);
      for (const q of src) { const cx = p.x(q.lon), cy = p.y(q.lat); clip.moveTo(cx + q.nm * scale, cy); clip.arc(cx, cy, q.nm * scale, 0, 6.2832); }
      ctx.clip(clip);
      for (const t of tiles) strokeLevels(t, p, w, h, true, ox, oy);
      ctx.restore();
    }
    ctx.strokeStyle = 'rgba(100,255,218,0.25)'; ctx.setLineDash([4, 6]); ctx.lineWidth = 1; ctx.beginPath();
    for (const q of src) { const cx = p.x(q.lon), cy = p.y(q.lat); ctx.moveTo(cx + q.nm * scale, cy); ctx.arc(cx, cy, q.nm * scale, 0, 6.2832); }
    ctx.stroke(); ctx.setLineDash([]);
  }

  function drawScale(w, h, R) {   // scale bar: the main screen has no range rings
    const scale = R / nd.range, nice = [0.1, 0.25, 0.5, 1, 2, 5, 10, 20].filter((v) => v * scale < w * 0.25).pop() || 0.1, len = nice * scale, x0 = w - 60 - len, y0 = h - 34;
    ctx.strokeStyle = '#9fd8ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0, y0 - 6); ctx.lineTo(x0, y0); ctx.lineTo(x0 + len, y0); ctx.lineTo(x0 + len, y0 - 6); ctx.stroke();
    ctx.fillStyle = '#9fd8ff'; ctx.font = '600 15px ui-monospace, Menlo, monospace'; ctx.textAlign = 'center'; ctx.fillText(nice + ' nm', x0 + len / 2, y0 - 10);
  }
  nd.fineRadius = () => fineNm(sim.s);

  nd.draw = () => {
    const { w, h } = nd, s = sim.s, c = ctr(), cx = w / 2, cy = h / 2;
    const R = Math.min(w, h) / 2 - 24;
    if (R < 20) return; // not laid out yet (hidden)
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#03121c'; ctx.fillRect(0, 0, w, h);
    const hd = (c.heading * Math.PI) / 180;
    if (contours) { if (trackUp) { ctx.save(); ctx.translate(cx, cy); ctx.rotate(-hd); ctx.translate(-cx, -cy); } drawSeafloor(w, h, R); if (trackUp) ctx.restore(); if (!rings) drawScale(w, h, R); }
    const shipPt = (() => { const t = turn(toward(c, s)), sc = R / nd.range; return { x: cx + t.dx * sc, y: cy - t.dy * sc }; })();   // where Aqua Nova is on this chart
    if (rings) {
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(100,255,218,0.25)';
    for (let i = 1; i <= 4; i++) { ctx.beginPath(); ctx.arc(cx, cy, (R * i) / 4, 0, 6.2832); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
    ctx.fillStyle = '#8fa6bd'; ctx.font = '600 14px ui-monospace, Menlo, monospace'; ctx.textAlign = 'left';
    for (let i = 1; i <= 4; i++) ctx.fillText(((nd.range * i) / 4).toFixed(nd.range < 2 ? 2 : 1) + ' nm', cx + 6, cy - (R * i) / 4 + 16);
    ctx.textAlign = 'center'; ctx.fillStyle = '#64ffda'; ctx.font = '800 18px system-ui';
    if (trackUp) { const hh = (c.heading * Math.PI) / 180; ctx.fillText('N', cx - (R + 12) * Math.sin(hh), cy - (R + 12) * Math.cos(hh) + 6); } else ctx.fillText('N', cx, cy - R - 6);
    }
    if (trackUp) { ctx.fillStyle = '#8fa6bd'; ctx.font = '700 14px ui-monospace, Menlo, monospace'; ctx.textAlign = 'left'; ctx.fillText('TRACK UP', 10, 20); }
    // waypoint line
    if (s.wpt && !craft) {
      const p = px(s.wpt), legs = [...(s.route || [])];
      ctx.setLineDash([8, 8]); ctx.strokeStyle = '#ffb020'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(shipPt.x, shipPt.y); for (const q of legs) { const a = px(q); ctx.lineTo(a.x, a.y); } if (!legs.length || s.routeSnapped) ctx.lineTo(p.x, p.y); ctx.stroke(); ctx.setLineDash([]);
      if (s.wpt.type === 'waypoint') { ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, 6.2832); ctx.moveTo(p.x - 14, p.y); ctx.lineTo(p.x + 14, p.y); ctx.moveTo(p.x, p.y - 14); ctx.lineTo(p.x, p.y + 14); ctx.stroke(); }
    }
    // WSKRs (deployed sensor probes): diamonds
    for (const q of s.wskrs || []) {
      const t = turn(toward(c, q)), scale = R / nd.range, x = w / 2 + t.dx * scale, y = h / 2 - t.dy * scale;
      if (x < -20 || x > w + 20 || y < -20 || y > h + 20) continue;
      if (bigWskr) {
        const k = 17, col = q.dead ? '#ff6b6b' : q.mode === 'task' ? '#ff9f43' : '#ffd666';
        if (nd.selWskr === q.n) { ctx.strokeStyle = '#64ffda'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, k + 9, 0, 6.2832); ctx.stroke(); }
        ctx.fillStyle = '#1d4a2c'; ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x, y - k); ctx.lineTo(x + k, y); ctx.lineTo(x, y + k); ctx.lineTo(x - k, y); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#e6f1ff'; ctx.font = '800 14px system-ui'; ctx.textAlign = 'center'; ctx.fillText(WSKR_CODES[q.n - 1] || 'W' + q.n, x, y + 5);
        continue;
      }
      ctx.fillStyle = q.mode === 'task' ? '#ff9f43' : '#ffd666'; ctx.beginPath(); ctx.moveTo(x, y - 7); ctx.lineTo(x + 6, y); ctx.lineTo(x, y + 7); ctx.lineTo(x - 6, y); ctx.fill();
      ctx.font = '700 14px system-ui'; ctx.textAlign = 'left'; ctx.fillText(WSKR_CODES[q.n - 1] || 'W' + q.n, x + 9, y + 5);
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
      if (nd.range > 32 && !isSel && !isW) continue;   // zoomed far out the sites sit on top of each other: names only for the selected one and the destination
      ctx.fillStyle = '#e6f1ff'; ctx.fillText(poi.name.length > 22 ? poi.name.slice(0, 21) + '…' : poi.name, p.x, p.y + 28);
    }
    // ship (centre), or in craft mode the craft at the centre and the ship where it is
    const mark = (x, y, hd, col, big) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate((hd * Math.PI) / 180);
      ctx.fillStyle = col; ctx.strokeStyle = '#04101f'; ctx.lineWidth = 2;
      const k = big ? 1 : 0.7;
      ctx.beginPath(); ctx.moveTo(0, -16 * k); ctx.lineTo(11 * k, 14 * k); ctx.lineTo(0, 8 * k); ctx.lineTo(-11 * k, 14 * k); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    };
    if (craft) {
      const t = toward(c, s), scale = R / nd.range; mark(w / 2 + t.dx * scale, h / 2 - t.dy * scale, s.heading, '#3ddc84', false);
      mark(cx, cy, c.heading, '#ffb020', true);
    } else mark(shipPt.x, shipPt.y, trackUp ? 0 : s.heading, '#3ddc84', true);
    // where we will be in an hour at the present speed: a light dashed vector from the ship
    if (!craft && s.speed > 0.2) {
      const nm = s.speed, a = ((trackUp ? 0 : s.heading) * Math.PI) / 180, scale = R / nd.range, ex = shipPt.x + Math.sin(a) * nm * scale, ey = shipPt.y - Math.cos(a) * nm * scale;
      ctx.save(); ctx.strokeStyle = 'rgba(190,235,255,0.65)'; ctx.lineWidth = 1.5; ctx.setLineDash([7, 7]); ctx.beginPath(); ctx.moveTo(shipPt.x + Math.sin(a) * 18, shipPt.y - Math.cos(a) * 18); ctx.lineTo(ex, ey); ctx.stroke(); ctx.setLineDash([]);
      if (ex > 0 && ex < w && ey > 0 && ey < h) { ctx.beginPath(); ctx.arc(ex, ey, 4, 0, 6.2832); ctx.stroke(); ctx.fillStyle = 'rgba(190,235,255,0.85)'; ctx.font = '600 13px ui-monospace, Menlo, monospace'; ctx.textAlign = 'left'; ctx.fillText(`1 h · ${nm.toFixed(1)} nm`, ex + 8, ey - 6); }
      ctx.restore();
    }
  };

  nd.setPan = (p) => { nd.pan = p; nd.draw(); };   // centre the chart on a point (null = back on the ship)
  nd.setRange = (r) => { nd.range = r; nd.draw(); };
  nd.zoom = (dir) => {
    const i = RANGES.indexOf(nd.range);
    nd.setRange(RANGES[Math.max(0, Math.min(RANGES.length - 1, i + dir))]);
    return nd.range;
  };

  canvas.addEventListener('pointerdown', (e) => {
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) * (nd.w / r.width), y = (e.clientY - r.top) * (nd.h / r.height);   // into canvas units
    if (onWskr) { let bw = null, dw = 40; for (const q of sim.s.wskrs || []) { const t = toward(ctr(), q), tt = turn(t), sc = (Math.min(nd.w, nd.h) / 2 - 24) / nd.range, d = Math.hypot(nd.w / 2 + tt.dx * sc - x, nd.h / 2 - tt.dy * sc - y); if (d < dw) { dw = d; bw = q; } } if (bw) { onWskr(bw); return; } }
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
