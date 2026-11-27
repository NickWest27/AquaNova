// Navigation display: one canvas, north-up, ship-centred. Redraws only when asked.
import { sim, toward, WSKR_CODES } from './sim.js';
import { frameThrottle } from './util.js';
import { seafloor } from './seafloor.js';
import { chartShips } from './traffic.js';
import { shuttle } from './bayops.js';
import { affiliation, frameColour, drawContact, placeAffiliation } from './contactIcons.js';

const RANGES = [0.5, 1, 2, 4, 8, 16, 32, 64, 128, 256];   // the chart is about 216 nm across, so 128 and 256 show all of it

// stage: the canvas sits inside the scaled 1920x1080 bridge stage. Sizes then come from layout (not the scaled
// rectangle), and `units` makes text and markers bigger so they read at the stage's smaller on-screen size.
export function createND(wrap, { onPick, stage = false, units = 1, contours = false, rings = true, craft = null, trackUp = false, focus = null, bigWskr = false, onWskr = null, res = 1 } = {}) {   // res: canvas resolution factor (below 1 = chunky pixels, the quarters screen)   // focus: () => a point to centre on (the ship keeps its place and, with trackUp, its heading is still up); bigWskr: WSKR diamonds carry their code; onWskr(q): a tap on a WSKR   // trackUp: the ship's heading is up (the map turns); contours stay north-up, so use it without them   // craft: () => { lat, lon, heading } centres the map on a craft (Remora, a WSKR) instead of the ship
  const canvas = document.createElement('canvas');
  wrap.prepend(canvas);
  const ctx = canvas.getContext('2d');
  const ctr = () => { if (nd.pan) return { lat: nd.pan.lat, lon: nd.pan.lon, heading: sim.s.heading }; const f = focus && focus(); return f ? { lat: f.lat, lon: f.lon, heading: sim.s.heading } : (craft && craft()) || sim.s; };
  // rotate an east/north offset so the ship's heading points up (track up), or leave it north up
  const turn = (t) => { if (!trackUp) return t; const h = (ctr().heading * Math.PI) / 180, c = Math.cos(h), s = Math.sin(h); return { ...t, dx: t.dx * c - t.dy * s, dy: t.dx * s + t.dy * c }; };
  const nd = { range: 2, sel: null, selWskr: null, show: { ships: true, subs: true, base: true, orgs: true, labels: true }, w: 0, h: 0, canvas };

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * res;
    const r = wrap.getBoundingClientRect();
    const lw = wrap.offsetWidth || r.width, lh = wrap.offsetHeight || r.height;   // layout size
    const sc = lw ? r.width / lw : 1;                                               // the stage's or the page's scale
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
  // Land and shallows (owner, 2026-11-27): the coast (0 m) is a bold dark yellow; water 20 m deep or less is outlined in light yellow (from the fine
  // charts, so only where we have charted). Deeper contours stay blue.
  const LAND = '#d4a000', SHALLOW = 'rgba(255,240,165,0.8)';
  const shade = (l) => (l === 0 ? LAND : l > -100 ? 'rgba(130,215,255,0.40)' : l > -500 ? 'rgba(90,170,255,0.45)' : 'rgba(110,130,255,0.55)');
  function strokeLevels(levels, p, w, h, fine, ox = 0, oy = 0) {
    for (const lv of levels) {
      if (fine && (lv.l === 0 || !(lv.l > -200 || (lv.l > -1000 ? lv.l % 20 === 0 : lv.l > -3500 ? lv.l % 50 === 0 : lv.l % 100 === 0)))) continue;   // 10 m on the shelf, then every 20 m to 1000 m, 50 m to 3500 m and 100 m below: finer than before so the deep canyon keeps its detail
      const shallow = fine && lv.l >= -20;
      ctx.strokeStyle = shallow ? SHALLOW : fine ? (lv.l % 100 === 0 ? 'rgba(130,200,255,0.55)' : 'rgba(110,190,230,0.26)') : shade(lv.l);
      ctx.lineWidth = lv.l === 0 ? 3 : shallow ? 1.4 : fine ? 0.9 : 1.1; ctx.beginPath();
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
    // range rings at a quarter, half or the whole range setting, at most six, carried out to the corners of the screen (contacts are drawn that far too)
    const far = Math.hypot(w / 2, h / 2), farNm = (far / R) * nd.range;
    const stepNm = (nd.range / 4) * ([1, 2, 4, 8].find((m) => farNm / ((nd.range / 4) * m) <= 6) || 16), step = (stepNm / nd.range) * R, nR = Math.ceil(far / step);   // a ring always falls on the range setting
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(100,255,218,0.25)';
    for (let i = 1; i <= nR; i++) { ctx.beginPath(); ctx.arc(cx, cy, step * i, 0, 6.2832); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.stroke();
    ctx.fillStyle = '#8fa6bd'; ctx.font = '600 14px ui-monospace, Menlo, monospace'; ctx.textAlign = 'left';
    for (let i = 1; i <= nR; i++) { const x = cx + step * i * 0.7071 + 4, y = cy - step * i * 0.7071 - 4; if (x < w - 40 && y > 14) ctx.fillText(+(stepNm * i).toFixed(2) + ' nm', x, y); }   // labels on the north-east diagonal, clear of the cross
    ctx.textAlign = 'center'; ctx.fillStyle = '#64ffda'; ctx.font = '800 18px system-ui';
    if (trackUp) { const hh = (c.heading * Math.PI) / 180; ctx.fillText('N', cx - (R + 12) * Math.sin(hh), cy - (R + 12) * Math.cos(hh) + 6); } else ctx.fillText('N', cx, cy - R - 6);
    }
    { const rip = sim.rippleNm(s); if (rip != null && rip < nd.range * 1.6) {   // active sonar: the ping's ripple spreading out from the ship
      const rr = (rip / nd.range) * R; ctx.save(); ctx.globalAlpha = Math.max(0, 1 - rip / (nd.range * 1.6)); ctx.strokeStyle = '#9ff3ff'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(shipPt.x, shipPt.y, rr, 0, 6.2832); ctx.stroke(); ctx.restore(); } }
    if (trackUp) { ctx.fillStyle = '#8fa6bd'; ctx.font = '700 14px ui-monospace, Menlo, monospace'; ctx.textAlign = 'left'; ctx.fillText('TRACK UP', 10, 20); }
    // The Route: a line through the fixes (amber once plotted, with the turn points the helm will steer through; a dim straight preview until then),
    // a cross and name for each waypoint, and a small square for each turn point.
    if (!craft && (s.fixes.length || s.wpt)) {
      const plotted = !!s.wpt, pts = plotted ? s.route : s.fixes;
      ctx.setLineDash([8, 8]); ctx.strokeStyle = plotted ? '#ffb020' : 'rgba(255,176,32,0.45)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(shipPt.x, shipPt.y); for (const q of pts) { const a = px(q); ctx.lineTo(a.x, a.y); }
      if (plotted && s.routeSnapped) { const e = px(s.wpt); ctx.lineTo(e.x, e.y); }
      ctx.stroke(); ctx.setLineDash([]);
      ctx.font = '700 14px ui-monospace, Menlo, monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#ffb020';
      let n = 0;
      if (plotted) for (const q of s.route) if (q.tp) { const a = px(q); ctx.strokeRect(a.x - 5, a.y - 5, 10, 10); ctx.fillText('TP' + ++n, a.x, a.y - 11); }
      for (const f of s.fixes) {
        if (f.type !== 'waypoint') continue;
        const a = px(f); ctx.beginPath(); ctx.arc(a.x, a.y, 9, 0, 6.2832); ctx.moveTo(a.x - 14, a.y); ctx.lineTo(a.x + 14, a.y); ctx.moveTo(a.x, a.y - 14); ctx.lineTo(a.x, a.y + 14); ctx.stroke();
        ctx.fillText(f.name, a.x, a.y + 28);
      }
    }
    // WSKRs (deployed sensor probes): diamonds
    for (const q of s.wskrs || []) {
      const t = turn(toward(c, q)), scale = R / nd.range, x = w / 2 + t.dx * scale, y = h / 2 - t.dy * scale;
      if (x < -20 || x > w + 20 || y < -20 || y > h + 20) continue;
      if (bigWskr) {
        const k = 17, col = q.dead ? '#ff6b6b' : (q.mode === 'task' || q.mode === 'trail') ? '#ff9f43' : '#ffd666';
        if (nd.selWskr === q.n) { ctx.strokeStyle = '#64ffda'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, k + 9, 0, 6.2832); ctx.stroke(); }
        ctx.fillStyle = '#1d4a2c'; ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x, y - k); ctx.lineTo(x + k, y); ctx.lineTo(x, y + k); ctx.lineTo(x - k, y); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#e6f1ff'; ctx.font = '800 14px system-ui'; ctx.textAlign = 'center'; ctx.fillText(WSKR_CODES[q.n - 1] || 'W' + q.n, x, y + 5);
        continue;
      }
      ctx.fillStyle = (q.mode === 'task' || q.mode === 'trail') ? '#ff9f43' : '#ffd666'; ctx.beginPath(); ctx.moveTo(x, y - 7); ctx.lineTo(x + 6, y); ctx.lineTo(x, y + 7); ctx.lineTo(x - 6, y); ctx.fill();
      ctx.font = '700 14px system-ui'; ctx.textAlign = 'left'; ctx.fillText(WSKR_CODES[q.n - 1] || 'W' + q.n, x + 9, y + 5);
    }
    // Remora (tethered science ROV): a violet rounded square marked Rm, on a dashed tether to the ship (WSKRs are yellow or orange diamonds)
    if (s.rov && !craft) {   // tether parted (lost): no tether line, greyed, marked at the last known position
      const lost = !!s.rov.lost, scale = R / nd.range, tr = turn(toward(c, s.rov)), ts = turn(toward(c, s)), x = w / 2 + tr.dx * scale, y = h / 2 - tr.dy * scale, sx = w / 2 + ts.dx * scale, sy = h / 2 - ts.dy * scale;
      ctx.save(); ctx.strokeStyle = '#c792ff'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]); if (!lost) { ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(x, y); ctx.stroke(); } ctx.setLineDash([]);
      if (lost) ctx.globalAlpha = 0.6;
      const k = bigWskr ? 15 : 11; ctx.fillStyle = '#2b1a4d'; ctx.strokeStyle = lost ? '#ff6b6b' : '#c792ff'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.roundRect(x - k, y - k * 0.75, k * 2, k * 1.5, 5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e9d8ff'; ctx.font = `800 ${bigWskr ? 14 : 12}px system-ui`; ctx.textAlign = 'center'; ctx.fillText(lost ? 'Rm?' : 'Rm', x, y + 4.5); ctx.restore();
    }
    // Tern (the shuttle): a pink arrowhead marked Tn, pointing along her heading, while she is out of the bay
    { const sh = shuttle();
      if (sh && sh.state === 'out' && sh.lat != null && !craft) {
        const scale = R / nd.range, tt = turn(toward(c, sh)), x = w / 2 + tt.dx * scale, y = h / 2 - tt.dy * scale;
        if (x > -20 && x < w + 20 && y > -20 && y < h + 20) {
          const k = bigWskr ? 15 : 12, a = (((sh.heading || 0) - (trackUp ? c.heading : 0)) * Math.PI) / 180;
          ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillStyle = sh.dead ? '#5a2a3a' : '#4a1d38'; ctx.strokeStyle = sh.dead ? '#ff6b6b' : '#ff7eb6'; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.moveTo(0, -k * 1.2); ctx.lineTo(k, k); ctx.lineTo(0, k * 0.5); ctx.lineTo(-k, k); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
          ctx.fillStyle = '#ffd0e6'; ctx.font = `800 ${bigWskr ? 14 : 12}px system-ui`; ctx.textAlign = 'left'; ctx.fillText('Tn', x + k + 3, y + 4);
        } } }
    // Mission areas (owner, 2026-11-27): a box on the chart for each area a mission assigns (the Trials AO, a patrol area). Amber; a patrol
    // area is dashed until its window opens. The player makes a waypoint and sails into it: an area is not a destination.
    const boxes = [...(sim.missionAreas || []), ...(sim.tempAOs || []).map((ao) => { const dLat = ao.radius / 60, dLon = ao.radius / (60 * Math.cos((ao.lat * Math.PI) / 180)), open = s.clock >= ao.from && s.clock <= ao.to;
      return { name: `PATROL AREA${open ? ' · ON STATION' : ''}`, lat0: ao.lat - dLat, lat1: ao.lat + dLat, lon0: ao.lon - dLon, lon1: ao.lon + dLon, dashed: !open }; })];
    for (const b of boxes) {
      const a = px({ lat: b.lat1, lon: b.lon0 }), c = px({ lat: b.lat0, lon: b.lon1 });
      if (c.x < -20 || a.x > w + 20 || c.y < -20 || a.y > h + 20) continue;
      ctx.save(); ctx.strokeStyle = '#ffb020'; ctx.lineWidth = b.dashed ? 2 : 3; ctx.setLineDash(b.dashed ? [10, 8] : []); ctx.globalAlpha = 0.85;
      if (trackUp) { const q = [px({ lat: b.lat1, lon: b.lon0 }), px({ lat: b.lat1, lon: b.lon1 }), px({ lat: b.lat0, lon: b.lon1 }), px({ lat: b.lat0, lon: b.lon0 })]; ctx.beginPath(); q.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.stroke(); }
      else ctx.strokeRect(a.x, a.y, Math.max(6, c.x - a.x), Math.max(6, c.y - a.y));
      ctx.setLineDash([]); ctx.fillStyle = '#ffb020'; ctx.font = '700 15px system-ui'; ctx.textAlign = 'left'; ctx.fillText(b.name, Math.max(4, a.x + 4), Math.max(16, a.y - 8)); ctx.restore();
    }
    // POIs
    ctx.font = '700 17px system-ui';
    for (const poi of s.pois) {
      if (poi.type === 'dock' && !nd.show.base) continue;
      const p = px(poi);
      if (p.x < -40 || p.x > w + 40 || p.y < -40 || p.y > h + 40) continue;
      const isSel = nd.sel && nd.sel.id === poi.id, isW = s.wpt && s.wpt.id === poi.id;
      if (poi.type === 'dock') { ctx.save(); ctx.translate(p.x, p.y); drawContact(ctx, 'installation', placeAffiliation(poi), 10); ctx.restore(); if (isW) { ctx.strokeStyle = '#ffb020'; ctx.lineWidth = 3; ctx.strokeRect(p.x - 14, p.y - 14, 28, 28); } }
      else {
        ctx.fillStyle = isW ? '#ffb020' : isSel ? '#ffffff' : poi.stance === 'hostile' ? '#ff6b6b' : poi.stance === 'wary' ? '#ffb86b' : '#64ffda';
        ctx.beginPath(); ctx.moveTo(p.x, p.y - 10); ctx.lineTo(p.x + 9, p.y + 7); ctx.lineTo(p.x - 9, p.y + 7); ctx.closePath(); ctx.fill();
      }
      if (isSel) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, 18, 0, 6.2832); ctx.stroke(); }
      if (nd.range > 32 && !isSel && !isW) continue;   // zoomed far out the sites sit on top of each other: names only for the selected one and the destination
      ctx.fillStyle = '#e6f1ff'; ctx.fillText(poi.name.length > 22 ? poi.name.slice(0, 21) + '…' : poi.name, p.x, p.y + 28);
    }
    // surface traffic, drawn like a naval tactical plot: a frame for what we know (yellow clover unknown, blue circle friendly, green square neutral, amber diamond suspect, red diamond hostile), a course vector, and a label.
    // A bearing-only sonar contact is a dashed bearing line from the listener with its bearing at the end; two bearings make a fix (dashed ring = error).
    // Each bearing-only contact gets ONE line (the ship's own bearing when it hears it, else the first WSKR's), with its marker ON the line and the
    // bearing beside it. A contact heard in the last minute stays, faded, where it was (traffic.chartShips), so nothing blinks at the edge of range.
    if (!craft && nd.show.ships) for (const a of chartShips()) {
      const ik = units > 1.5 ? 0.55 : 1, kf = ik < 1 ? 0.8 : 1;   // the big main screen draws contact symbols, vectors and text smaller
      const v = a.v, aff = affiliation(v), col = frameColour(aff), r = (9 + v.size * 1.5) * ik, fade = a.stale ? 0.4 : 1;
      if (!a.pos) {
        const ln = a.lines.find((l) => l.src === 'ship') || a.lines[0]; if (!ln) continue;
        ctx.save(); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.globalAlpha = 0.75 * fade; ctx.lineWidth = 1.5; ctx.setLineDash([7, 5]); ctx.font = `700 ${12 * kf}px ui-monospace, Menlo, monospace`; ctx.textAlign = 'left';
        const o = px(ln.from), th = ((ln.brg - (trackUp ? c.heading : 0)) * Math.PI) / 180, ux = Math.sin(th), uy = -Math.cos(th), len = Math.min(w, h) / 2 - 20;
        // the marker sits on the line where it crosses 80% of the chart radius (kept inside the chart); the line runs from the listener through it
        let k = len * 0.8; const lim = (x, a0, a1) => Math.max(a0, Math.min(a1, x));
        for (const [p0, d, a0, a1] of [[o.x, ux, 18, w - 18], [o.y, uy, 18, h - 18]]) if (d) { const t = ((d > 0 ? a1 : a0) - p0) / d; if (t > 0) k = Math.min(k, t); }
        const lx = lim(o.x + ux * k, 18, w - 18), ly = lim(o.y + uy * k, 18, h - 18);
        ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(lx, ly); ctx.stroke(); ctx.setLineDash([]);
        ctx.save(); ctx.translate(lx, ly); drawContact(ctx, 'unknown', 'unknown', 8 * ik); ctx.restore();
        if (nd.show.labels) ctx.fillText(String(Math.round(ln.brg)).padStart(3, '0') + '°', lx + 12 * ik, ly + 4);
        ctx.restore(); continue;
      }
      ctx.save(); ctx.globalAlpha = fade;
      const q = px(a.pos);
      if (q.x < -20 || q.x > w + 20 || q.y < -20 || q.y > h + 20) { ctx.restore(); continue; }
      const isSel = s.selContact === 'ship:' + v.id, fixOnly = !a.ais && a.pos.err > 0.05;
      if (fixOnly) { const er = Math.max(r + 4, (a.pos.err / nd.range) * (Math.min(w, h) / 2 - 24)); ctx.save(); ctx.strokeStyle = col; ctx.globalAlpha = 0.7; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(q.x, q.y, er, 0, 6.2832); ctx.stroke(); ctx.restore(); }
      if (a.pos.hdg != null && v.kt > 0.3) {   // course vector: longer for a faster ship
        const th = ((a.pos.hdg - (trackUp ? c.heading : 0)) * Math.PI) / 180, L = r + (6 + v.kt * 1.6) * ik;
        ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(q.x + Math.sin(th) * r, q.y - Math.cos(th) * r); ctx.lineTo(q.x + Math.sin(th) * L, q.y - Math.cos(th) * L); ctx.stroke(); ctx.restore();
      }
      ctx.save(); ctx.translate(q.x, q.y); drawContact(ctx, 'surface', aff, r, { faint: fixOnly }); ctx.restore();
      if (isSel) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(q.x, q.y, r + 7 * ik, 0, 6.2832); ctx.stroke(); }
      if (nd.range <= 16 && nd.show.labels) {
        // three short lines: the name; where it is from us (BRG, range); and where it is going (CRS is its course, the same as its vector, then its speed)
        const lx = q.x + r + 6, tag = a.ais ? 'AIS ' : fixOnly ? 'FIX ' : '', t = toward(s, a.pos), pad = (n) => String(Math.round(n)).padStart(3, '0');
        ctx.fillStyle = col; ctx.font = `700 ${12 * kf}px system-ui`; ctx.textAlign = 'left'; ctx.fillText(v.ident ? v.name : 'UNKNOWN', lx, q.y - 1);
        ctx.font = `${11 * kf}px ui-monospace, Menlo, monospace`; ctx.fillStyle = '#b8c9dc';
        ctx.fillText(`${tag}BRG ${pad(t.brg)}° ${t.nm.toFixed(1)}nm`, lx, q.y + 11 * kf + 1);
        if (a.pos.hdg != null) ctx.fillText(`CRS ${pad(a.pos.hdg)}° ${Math.round(v.kt)}kt`, lx, q.y + 22 * kf + 2);
      }
      ctx.restore();   // the fade
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
    let best = null, bd = 44 / ((r.width / (wrap.offsetWidth || r.width)) * units); // a finger-sized pick radius, in canvas units
    for (const poi of sim.s.pois) { const p = px(poi); const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = poi; } }
    nd.sel = best; nd.draw(); onPick && onPick(best);
  });

  nd.redraw = frameThrottle(nd.draw);
  const ro = new ResizeObserver(resize); ro.observe(wrap);
  nd.destroy = () => { ro.disconnect(); canvas.remove(); };
  resize();
  return nd;
}
