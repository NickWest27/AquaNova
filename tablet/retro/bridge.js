// The retro bridge, 320 x 240. Top strip, a live water viewscreen, three readouts, six station buttons, a message line.
// Placeholder art: everything is drawn in code from the palette until real art arrives.
import { sim, clockText, toward } from '../js/sim.js';
import { unreadCount } from '../js/notify.js';
import { PAL } from './palette.js';
import { el, label, setText, setClass } from './ui.js';

const VW = 300, VH = 104;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/** Palette slot of the water at a depth: light at the surface, deep blue below. Slots 16 (dark) to 25 (light). */
export const waterSlot = (m) => (m < 10 ? 25 : m < 40 ? 24 : m < 100 ? 23 : m < 250 ? 22 : m < 500 ? 21 : m < 1000 ? 20 : m < 2000 ? 19 : m < 4000 ? 18 : m < 7000 ? 17 : 16);

export function createBridge(stage, { onOpen }) {
  const root = el('div', 'rabs', null, 'inset:0'); stage.append(root);
  // top strip
  const top = el('div', 'rpanel', null, 'left:0;top:0;width:320px;height:14px;border-width:0 0 1px 0'); root.append(top);
  const pos = label(root, 4, 3, '', 'rdim'), clock = label(root, 316, 3, '', '', 'transform:translateX(-100%)');
  // viewscreen
  const scr = el('div', 'rscreen', null, `left:8px;top:17px;width:${VW + 4}px;height:${VH + 4}px`); root.append(scr);
  const cv = el('canvas'); cv.width = VW; cv.height = VH; scr.append(cv);
  const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
  // readouts
  const cell = (x, text) => { const c = el('div', 'rcell', null, `left:${x}px;top:127px;width:100px`); const v = el('b'); c.append(text + ' ', v); root.append(c); return v; };
  const hdg = cell(8, 'HDG'), spd = cell(110, 'SPD'), dep = cell(212, 'DEPTH');
  // station buttons: 3 x 2
  const defs = [['HELM', 'helm'], ['NAV', 'nav'], ['SYSTEMS', 'sys'], ['COMMS', 'comms'], ['SENSORS', 'sensors'], ['WALKWAY', 'walkway']];
  const btn = {};
  defs.forEach(([t, id], i) => {
    const b = el('button', 'rdesk', null, `left:${6 + (i % 3) * 104}px;top:${146 + Math.floor(i / 3) * 29}px`); b.setAttribute('aria-label', t);
    const tt = el('span', 't', t), ss = el('span', 's', ''); b.append(tt, ss); b.onclick = () => onOpen(id); root.append(b); btn[id] = { b, s: ss };
  });
  const badge = el('div', 'rbadge', '', 'left:92px;top:176px;display:none'); root.append(badge);
  // message line (the engine writes crew messages into #console-line)
  const msg = el('div', 'rmsg'); msg.id = 'console-line'; root.append(msg);

  // ---- the water ----
  const snow = Array.from({ length: 40 }, (_, i) => ({ x: (i * 97) % VW, y: (i * 53) % VH, v: 0.2 + ((i * 31) % 10) / 20 }));
  const bubbles = [];
  let frame = 0;
  function drawWater() {
    const s = sim.s, base = waterSlot(s.depth), col = (slot) => PAL[clamp(slot, 16, 25)];
    // 8 bands, darker toward the bottom, with a checkerboard row between bands
    const bandH = VH / 8;
    for (let b = 0; b < 8; b++) {
      const y0 = Math.floor(b * bandH), y1 = Math.floor((b + 1) * bandH), slot = base - Math.floor(b / 3), next = base - Math.floor((b + 1) / 3);
      g.fillStyle = col(slot); g.fillRect(0, y0, VW, y1 - y0);
      if (next !== slot && b < 7) { g.fillStyle = col(next); for (let x = 0; x < VW; x += 2) g.fillRect(x, y1 - 1, 1, 1); for (let x = 1; x < VW; x += 2) g.fillRect(x, y1 - 2, 1, 1); }
    }
    // sunlight shafts near the surface
    if (s.depth < 60) { g.fillStyle = PAL[25]; for (let i = 0; i < 6; i++) { const x = (i * 53 + frame * 0.5) % VW | 0; for (let y = 0; y < 40; y += 2) g.fillRect(x + (y >> 3), y, 1, 1); } }
    // marine snow: drifts up when we dive, down when we rise
    const dv = clamp(s.vz != null ? -s.vz : (s.targetDepth - s.depth > 0 ? -1 : s.targetDepth - s.depth < 0 ? 1 : 0), -2, 2);
    g.fillStyle = col(base + 4);
    for (const p of snow) { p.y += (p.v * 0.5 + dv * 0.5 * p.v) - 0.2 * (s.speed > 0.5 ? 0 : 0); p.x -= s.speed * 0.06 * p.v * 4; if (p.y > VH) p.y = 0; if (p.y < 0) p.y = VH; if (p.x < 0) p.x = VW; g.fillRect(p.x | 0, p.y | 0, 1, 1); }
    // the Aqua Nova, side view, bobbing a little
    const bob = Math.round(Math.sin(frame / 14)), sx = 130, sy = 40 + bob;
    const R = (x, y, w, h, c) => { g.fillStyle = PAL[c]; g.fillRect(sx + x, sy + y, w, h); };
    if (s.lights && s.depth > 100) { g.fillStyle = PAL[55]; for (let i = 0; i < 6; i++) for (let y = 0; y < 5 + i * 2; y++) if ((y + i) % 2 === 0) g.fillRect(sx + 56 + i * 9, sy + 10 - y + 2, 1, 1); }
    R(14, 0, 12, 3, 37); R(12, 3, 16, 2, 36);                 // tower
    R(4, 5, 48, 3, 40); R(2, 8, 52, 5, 38); R(4, 13, 48, 3, 35); R(8, 16, 40, 1, 33);   // hull, light on top, shadow below
    R(0, 9, 2, 3, 36); R(54, 9, 2, 3, 38);                    // nose and tail
    R(-3, 6, 2, 9, s.speed > 0.5 ? 41 : 36);                  // prop
    R(40, 3, 8, 2, 36); R(46, 0, 2, 5, 36);                   // tail fin
    for (let i = 0; i < 4; i++) R(18 + i * 7, 10, 3, 2, s.lights ? 54 : 34);   // portholes
    // bubbles from the stern when under way
    if (s.speed > 0.5 && frame % 4 === 0) bubbles.push({ x: sx - 4, y: sy + 10, a: 0 });
    g.fillStyle = PAL[25];
    for (let i = bubbles.length - 1; i >= 0; i--) { const b = bubbles[i]; b.x -= 1.5; b.y -= 0.4; b.a++; g.fillRect(b.x | 0, b.y | 0, 1, 1); if (b.a > 40) bubbles.splice(i, 1); }
    // docked: a plain deck line
    if (s.docked) { g.fillStyle = PAL[43]; g.fillRect(0, VH - 6, VW, 6); g.fillStyle = PAL[36]; for (let x = 0; x < VW; x += 8) g.fillRect(x, VH - 6, 1, 6); }
  }

  let last = 0;
  function update(now = 0) {
    const s = sim.s;
    setText(pos, `${Math.abs(s.lat).toFixed(3)}${s.lat >= 0 ? 'N' : 'S'} ${Math.abs(s.lon).toFixed(3)}${s.lon >= 0 ? 'E' : 'W'}`);
    setText(clock, clockText() + (s.docked ? ' DOCKED' : '')); clock.style.color = s.docked ? 'var(--amber)' : '';
    setText(hdg, String(Math.round(s.heading) % 360).padStart(3, '0')); setText(spd, `${s.speed.toFixed(1)} KT`); setText(dep, `${Math.round(s.depth)} M`);
    const st = (id, text, cls = '') => { setText(btn[id].s, text); setClass(btn[id].b, 'rdesk ' + cls); };
    st('helm', s.docked ? 'DOCKED' : `${s.speed.toFixed(1)} KT`, s.docked ? 'warn' : '');
    st('nav', s.wpt ? `TO ${String(s.wpt.name || 'WAYPOINT').toUpperCase().slice(0, 12)}` : 'NO COURSE', s.wpt ? 'ok' : '');
    st('sys', `HULL ${Math.round(s.hull)}%`, s.hull < 50 ? 'bad' : s.hull < 80 ? 'warn' : 'ok');
    const un = unreadCount(); st('comms', un ? `${un} UNREAD` : 'QUIET', un ? 'warn' : '');
    st('sensors', s.sonar ? 'SONAR ON' : 'SONAR OFF', s.sonar ? 'ok' : 'bad');
    st('walkway', 'DECK A');
    badge.style.display = un ? 'block' : 'none'; setText(badge, un > 9 ? '9+' : String(un));
    if (now - last > 110) { last = now; frame++; drawWater(); }
  }
  drawWater();
  return { update, root, show: () => { root.hidden = false; }, hide: () => { root.hidden = true; } };
}
