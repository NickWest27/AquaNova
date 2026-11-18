// Bridge and quarters scenes on the fixed 1920x1080 stage. Updates only touch text nodes that changed.
import { sim } from './sim.js';
import { el, pad } from './util.js';

const box = (cls, x, y, w, h, kids) => el('div', { class: `disp ${cls}`, style: `left:${x}px;top:${y}px;width:${w}px;height:${h}px` }, kids);

export function createScene(stage, { onOpen }) {
  const bridge = el('div', { class: 'scene' });
  const quarters = el('div', { class: 'scene', hidden: true });
  const cache = new Map();
  const txt = (key, node) => (v) => { if (cache.get(key) !== v) { cache.set(key, v); node.textContent = v; } };

  // exterior view (main window)
  const water = el('div', { class: 'water' }), dark = el('div', { class: 'dark' });
  const bubbles = el('div', { class: 'bubbles' }, [1, 2, 3, 4, 5, 6, 7, 8, 9].map(() => el('i')));
  const place = el('div', { class: 'hud-place' });
  const bSpd = el('b'), bDep = el('b'), bHdg = el('b');
  const hud = el('div', { class: 'hud-row' },
    el('div', {}, bSpd, el('small', { text: 'KNOTS' })), el('div', {}, bDep, el('small', { text: 'DEPTH M' })), el('div', {}, bHdg, el('small', { text: 'HEADING' })));
  const view = box('view', 254, 189, 1410, 364, [water, bubbles, dark, place, hud]);

  // other displays
  const top = el('div', { class: 'status-line' });
  const topT = el('span');
  top.append(topT);
  const bot = el('div', { class: 'status-line' });
  const sBat = el('span'), sO2 = el('span'), sHull = el('span');
  bot.append(sBat, sO2, sHull);
  const lMini = el('div', { class: 'mini' }, el('small', { text: 'PRESSURE' }), el('b'));
  const rMini = el('div', { class: 'mini' }, el('small', { text: 'TEMP' }), el('b'));
  const navLabel = el('div', { class: 'console-label', html: 'NAVIGATION<small>tap to open</small>' });

  const frame = el('img', { class: 'frame', src: 'assets/bridge.webp', alt: '', draggable: 'false', decoding: 'async' });
  const hs = (label, x, y, w, h, onclick, tagPos = 'top', extra = '') =>
    el('button', { class: `hs ${extra}`, style: `left:${x}px;top:${y}px;width:${w}px;height:${h}px`, 'aria-label': label, onclick },
      el('span', { class: `tag ${tagPos}`, text: label }));

  bridge.append(
    view, box('', 594, 76, 733, 94, [top]), box('', 712, 579, 499, 207, [navLabel]), box('', 637, 828, 651, 125, [bot]),
    box('', 389, 802, 271, 152, [lMini]), box('', 1276, 800, 257, 154, [rMini]), frame,
    hs('NAVIGATION', 700, 570, 523, 225, () => onOpen('nav'), 'top'),
    hs('HELM', 625, 820, 675, 140, () => onOpen('helm'), 'bottom'),
    hs('SYSTEMS', 380, 795, 290, 168, () => onOpen('sys'), 'top'),
    hs('COMMS', 1266, 793, 277, 168, () => onOpen('comms'), 'top'),
    hs('QUARTERS', 240, 515, 190, 140, () => onOpen('quarters'), 'bottom'),
    hs('LOGBOOK', 1495, 515, 190, 140, () => onOpen('log'), 'bottom'),
  );

  // quarters
  const qimg = el('img', { src: 'assets/quarters.webp', alt: '', draggable: 'false', style: 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover' });
  const pickup = el('button', { class: 'pickup', hidden: true, style: 'left:480px;top:560px;width:120px;height:180px', 'aria-label': 'Pick up communicator', onclick: () => onOpen('pickup') },
    el('img', { src: 'assets/comm-pin.webp', alt: '' }), el('span', { class: 'tag', text: 'COMMUNICATOR' }));
  quarters.append(qimg,
    hs('LOGBOOK', 210, 516, 290, 190, () => onOpen('log'), 'top'),
    hs('TO BRIDGE', 1236, 120, 560, 700, () => onOpen('bridge'), 'mid'),
    pickup);
  stage.append(bridge, quarters);

  const api = {
    inQuarters: false,
    show(which) {
      api.inQuarters = which === 'quarters';
      bridge.hidden = api.inQuarters; quarters.hidden = !api.inQuarters;
      cache.clear(); api.update();
    },
    update() {
      if (api.inQuarters) return;
      const s = sim.s;
      const set = (k, node, v) => { if (cache.get(k) !== v) { cache.set(k, v); node.textContent = v; } };
      set('spd', bSpd, s.speed.toFixed(1)); set('dep', bDep, Math.round(s.depth)); set('hdg', bHdg, pad(s.heading) + '°');
      set('place', place, s.at ? s.at.name : s.wpt ? 'En route: ' + s.wpt.name : 'Open water');
      set('top', topT, s.wpt ? `WPT ${s.wpt.name.toUpperCase()}` : s.at ? s.at.type.toUpperCase() : 'ALL STATIONS READY');
      set('bat', sBat, `BAT ${Math.round(s.battery)}%`); set('o2', sO2, `O₂ ${Math.round(s.oxygen)}%`); set('hull', sHull, `HULL ${Math.round(s.hull)}%`);
      set('p', lMini.lastChild, `${Math.round(s.depth / 10 + 1)} bar`); set('t', rMini.lastChild, `${s.temp.toFixed(1)} °C`);
      const moving = s.speed > 0.3; if (cache.get('mv') !== moving) { cache.set('mv', moving); view.classList.toggle('moving', moving); }
      const dk = Math.min(0.9, s.depth / 900).toFixed(2); if (cache.get('dk') !== dk) { cache.set('dk', dk); dark.style.opacity = dk; }
    },
    showPickup(on) { pickup.hidden = !on; },
    lock(label, on) { stage.querySelectorAll('.hs').forEach((b) => { if (b.textContent === label) b.classList.toggle('locked', on); }); },
    glow(label, on) { stage.querySelectorAll('.hs').forEach((b) => { if (b.textContent === label) b.classList.toggle('glow', on); }); },
  };
  return api;
}
