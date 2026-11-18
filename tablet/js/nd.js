// Navigation display: one canvas, north-up, ship-centred. Redraws only when asked.
import { sim, toward } from './sim.js';
import { frameThrottle } from './util.js';

const RANGES = [0.5, 1, 2, 4, 8, 16];

export function createND(wrap, { onPick } = {}) {
  const canvas = document.createElement('canvas');
  wrap.prepend(canvas);
  const ctx = canvas.getContext('2d');
  const nd = { range: 2, sel: null, w: 0, h: 0, canvas };

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = wrap.getBoundingClientRect();
    nd.w = Math.max(1, Math.round(r.width)); nd.h = Math.max(1, Math.round(r.height));
    canvas.width = nd.w * dpr; canvas.height = nd.h * dpr;
    canvas.style.width = nd.w + 'px'; canvas.style.height = nd.h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    nd.draw();
  }

  const px = (p) => {
    const t = toward(sim.s, p);
    const scale = (Math.min(nd.w, nd.h) / 2 - 24) / nd.range;
    return { x: nd.w / 2 + t.dx * scale, y: nd.h / 2 - t.dy * scale, nm: t.nm, brg: t.brg };
  };

  nd.draw = () => {
    const { w, h } = nd, s = sim.s, cx = w / 2, cy = h / 2;
    const R = Math.min(w, h) / 2 - 24;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#03121c'; ctx.fillRect(0, 0, w, h);
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
    const x = e.clientX - r.left, y = e.clientY - r.top;
    let best = null, bd = 44; // 44 px finger-sized pick radius
    for (const poi of sim.s.pois) { const p = px(poi); const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = poi; } }
    nd.sel = best; nd.draw(); onPick && onPick(best);
  });

  nd.redraw = frameThrottle(nd.draw);
  const ro = new ResizeObserver(resize); ro.observe(wrap);
  nd.destroy = () => { ro.disconnect(); canvas.remove(); };
  resize();
  return nd;
}
