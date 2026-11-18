// Navigation display: one canvas, north-up, ship-centred. Redraws only when asked.
import { sim, toward } from './sim.js';
import { frameThrottle } from './util.js';

const RANGES = [0.5, 1, 2, 4, 8, 16];

// stage: the canvas sits inside the scaled 1920x1080 bridge stage. Sizes then come from layout (not the scaled
// rectangle), and `units` makes text and markers bigger so they read at the stage's smaller on-screen size.
export function createND(wrap, { onPick, stage = false, units = 1, contours = false } = {}) {
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

  // PLACEHOLDER seabed: smooth invented contours that scroll with the ship. Real seafloor data comes later.
  const seabed = (e, n) => Math.sin(e * 0.9 + 1.3) * Math.cos(n * 0.7 + 0.4) + 0.55 * Math.sin(e * 0.33 + n * 0.51 + 2) + 0.3 * Math.cos(e * 1.7 - n * 1.3);
  function drawContours(w, h, R) {
    const s = sim.s, nmE = s.lon * 60 * Math.cos((s.lat * Math.PI) / 180), nmN = s.lat * 60, scale = R / nd.range;
    const step = 26, cols = Math.ceil(w / step) + 1, rows = Math.ceil(h / step) + 1;
    const grid = [];
    for (let j = 0; j < rows; j++) { const row = []; for (let i = 0; i < cols; i++) row.push(seabed(nmE + (i * step - w / 2) / scale, nmN - (j * step - h / 2) / scale)); grid.push(row); }
    const levels = [-0.9, -0.35, 0.2, 0.75, 1.3];
    ctx.lineWidth = 1.3;
    levels.forEach((L, li) => {
      ctx.strokeStyle = `rgba(90,170,255,${0.16 + li * 0.07})`; ctx.beginPath();
      for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols - 1; i++) {
        const v = [grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]];
        const x0 = i * step, y0 = j * step, pts = [];
        const edge = (a, b, ax, ay, bx, by) => { if ((v[a] < L) !== (v[b] < L)) { const t = (L - v[a]) / (v[b] - v[a]); pts.push([ax + (bx - ax) * t, ay + (by - ay) * t]); } };
        edge(0, 1, x0, y0, x0 + step, y0); edge(1, 2, x0 + step, y0, x0 + step, y0 + step); edge(2, 3, x0 + step, y0 + step, x0, y0 + step); edge(3, 0, x0, y0 + step, x0, y0);
        if (pts.length >= 2) { ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(pts[1][0], pts[1][1]); }
        if (pts.length === 4) { ctx.moveTo(pts[2][0], pts[2][1]); ctx.lineTo(pts[3][0], pts[3][1]); }
      }
      ctx.stroke();
    });
  }

  nd.draw = () => {
    const { w, h } = nd, s = sim.s, cx = w / 2, cy = h / 2;
    const R = Math.min(w, h) / 2 - 24;
    if (R < 20) return; // not laid out yet (hidden)
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#03121c'; ctx.fillRect(0, 0, w, h);
    if (contours) drawContours(w, h, R);
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(100,255,218,0.25)';
    for (let i = 1; i <= 4; i++) { ctx.beginPath(); ctx.arc(cx, cy, (R * i) / 4, 0, 6.2832); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
    ctx.fillStyle = '#8fa6bd'; ctx.font = '600 14px ui-monospace, Menlo, monospace'; ctx.textAlign = 'left';
    for (let i = 1; i <= 4; i++) ctx.fillText(((nd.range * i) / 4).toFixed(nd.range < 2 ? 2 : 1) + ' nm', cx + 6, cy - (R * i) / 4 + 16);
    ctx.textAlign = 'center'; ctx.fillStyle = '#64ffda'; ctx.font = '800 18px system-ui';
    ctx.fillText('N', cx, cy - R - 6);
    // waypoint line
    if (s.wpt) {
      const p = px(s.wpt);
      ctx.setLineDash([8, 8]); ctx.strokeStyle = '#ffb020'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(p.x, p.y); ctx.stroke(); ctx.setLineDash([]);
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
