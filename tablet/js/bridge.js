// The bridge console: the screens built into the bridge art.
//   top    : where we are (place, latitude and longitude, game date and time)
//   main   : the big screen. Shows the display picked on the left mini console. Starts on navigation.
//   left   : picks what the main screen shows (NAV, HELM, SYS, VIEW)
//   center : the controls for whatever the main screen shows
//   right  : extra data for whatever the main screen shows
// Everything is sized in the 1920x1080 stage, so text is big. Only the open display is updated.
import { sim, toward, MAX_SPEED, gameDateText, clockText } from './sim.js';
import { createND } from './nd.js';
import { createDial } from './ui.js';
import { el, pad, toast } from './util.js';
import { toggleDock } from './dock.js';

const KEY = 'aquaNova_bridgeDisplay';
const set = (node, v) => { if (node._v !== v) { node._v = v; node.textContent = v; } };
const deg = (v, pos, neg, w) => { const a = Math.abs(v), d = Math.floor(a), m = (a - d) * 60; return `${String(d).padStart(w, '0')}°${m.toFixed(1).padStart(4, '0')}′${v >= 0 ? pos : neg}`; };
const etaText = (nm, kt) => { if (kt < 0.5) return '—'; const mins = Math.round((nm / kt) * 60); return mins >= 60 ? `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, '0')} min` : `${mins} min`; };
const bbtn = (text, onclick, cls = '') => el('button', { class: `bbtn ${cls}`, text, onclick });
const rd = (label, valueNode) => el('div', { class: 'rd' }, el('small', { text: label }), valueNode);

export function createBridgeConsole({ top, main, center, left, right, onExpand }) {
  // ---------- top display ----------
  const tPlace = el('div', { class: 'bt-place' }), tPos = el('div', { class: 'bt-pos' });
  top.append(tPlace, tPos);

  const displays = {};
  const order = ['nav', 'helm', 'sys', 'view'];
  const labels = { nav: 'NAV', helm: 'HELM', sys: 'SYS', view: 'VIEW' };

  // ---------- NAV ----------
  displays.nav = (() => {
    const m = el('div', { class: 'bd bd-nav' });
    const wrap = el('div', { class: 'nd-stage' });
    const logCur = el('div'), logDest = el('div'), logTime = el('div');
    const log = el('div', { class: 'nav-log' }, el('b', { text: 'NAVIGATIONAL POSITION LOG' }), logTime, logCur, logDest);
    const rSpd = el('b'), rDep = el('b'), rHdg = el('b');
    const read = el('div', { class: 'nav-read' }, rd('SPEED KT', rSpd), rd('DEPTH M', rDep), rd('HDG', rHdg));
    m.append(wrap, log, read);
    let sel = null;
    const nd = createND(wrap, { stage: true, units: 1.7, contours: true, onPick: (p) => { sel = p; refresh(); } });
    const rangeTxt = el('span', { class: 'rng' });
    const plot = bbtn('Plot a course', () => {
      if (!sel) { toast('Tap a marker on the map first'); return; }
      sim.setWpt(sel); sim.setThrottle(0.5);
      toast(sim.s.docked ? `Course plotted to ${sel.name}. Undock to get underway.` : `Course plotted to ${sel.name}`); refresh();
    }, 'wide');
    const clear = bbtn('Clear', () => { sel = null; nd.sel = null; sim.s.wpt = null; sim.touch && sim.touch(); nd.draw(); refresh(); });
    const c = el('div', { class: 'bc' },
      el('div', { class: 'row3' }, bbtn('−', () => { nd.zoom(-1); refresh(); }, 'sq'), el('div', { class: 'rngbox' }, el('small', { text: 'MAP RANGE' }), rangeTxt), bbtn('+', () => { nd.zoom(1); refresh(); }, 'sq')),
      el('div', { class: 'row2' }, plot, clear));
    const r = el('div', { class: 'br' });
    const rA = el('small'), rB = el('b'), rC = el('div');
    r.append(rA, rB, rC);
    function refresh() {
      const s = sim.s;
      set(rangeTxt, nd.range + ' nm');
      plot.classList.toggle('dim', !sel);
      if (sel) { const t = toward(s, sel); set(rA, sel.type.toUpperCase()); set(rB, sel.name); set(rC, `${t.nm.toFixed(1)} nm  BRG ${pad(t.brg)}°`); }
      else if (s.wpt) { const t = toward(s, s.wpt); set(rA, 'COURSE SET'); set(rB, s.wpt.name); set(rC, `${t.nm.toFixed(1)} nm  ETA ${etaText(t.nm, s.speed)}`); }
      else { set(rA, 'DESTINATION'); set(rB, 'None'); set(rC, 'Tap a marker'); }
    }
    return { m, c, r, expand: 'nav',
      update() {
        const s = sim.s;
        set(rSpd, s.speed.toFixed(1)); set(rDep, String(Math.round(s.depth))); set(rHdg, pad(s.heading) + '°');
        set(logTime, `MISSION TIME INDEX ${clockText()}`);
        set(logCur, `CURR POS ${deg(s.lat, 'N', 'S', 2)} ${deg(s.lon, 'E', 'W', 3)}  ${s.at ? s.at.name : 'Open water'}`);
        if (s.wpt) { const t = toward(s, s.wpt); set(logDest, `DEST POS ${s.wpt.name}  ${t.nm.toFixed(1)} nm  ETA ${etaText(t.nm, s.speed)}`); } else set(logDest, 'DEST POS none');
        refresh(); nd.redraw();
      },
      get nd() { return nd; }, select(p) { sel = p; nd.sel = p; refresh(); } };
  })();

  // ---------- HELM ----------
  displays.helm = (() => {
    const m = el('div', { class: 'bd bd-helm' });
    const hSpd = el('b'), hDep = el('b');
    const dial = createDial({ onInput: (h) => { sim.setHeading(h); sim.s.wpt = null; } });
    m.append(rd('SPEED KT', hSpd), dial.root, rd('DEPTH M', hDep));
    const thr = (d) => { sim.setThrottle(Math.round(Math.min(1, Math.max(0, sim.s.throttle + d)) * 20) / 20); sim.s.wpt = null; };
    const dep = (d) => sim.setDepth(Math.min(6000, Math.max(0, Math.round((sim.s.targetDepth + d) / 10) * 10)));
    const dockB = bbtn('Dock', () => toggleDock());
    const c = el('div', { class: 'bc' },
      el('div', { class: 'row4' }, bbtn('◂ Port 10°', () => { sim.setHeading(sim.s.targetHeading - 10); sim.s.wpt = null; }), bbtn('Stbd 10° ▸', () => { sim.setHeading(sim.s.targetHeading + 10); sim.s.wpt = null; }), bbtn('Slower', () => thr(-0.1)), bbtn('Faster', () => thr(0.1))),
      el('div', { class: 'row4' }, bbtn('Up 50 m', () => dep(-50)), bbtn('Down 50 m', () => dep(50)), bbtn('Surface', () => sim.setDepth(0)), dockB));
    const r = el('div', { class: 'br' });
    const v1 = el('b'), v2 = el('b'), v3 = el('b');
    r.append(el('small', { text: 'ORDERED THROTTLE' }), v1, el('small', { text: 'ORDERED DEPTH' }), v2, el('small', { text: 'ORDERED HEADING' }), v3);
    return { m, c, r, expand: 'helm',
      update() {
        const s = sim.s;
        set(hSpd, s.speed.toFixed(1)); set(hDep, String(Math.round(s.depth)));
        dial.update(s.heading, s.targetHeading);
        set(v1, Math.round(s.throttle * 100) + '%'); set(v2, Math.round(s.targetDepth) + ' m'); set(v3, pad(s.targetHeading) + '°');
        set(dockB, s.docked ? 'Undock' : 'Dock'); dockB.classList.toggle('on', s.docked || sim.canDock());
        m.classList.toggle('docked-st', !!s.docked);
      } };
  })();

  // ---------- SYS ----------
  displays.sys = (() => {
    const m = el('div', { class: 'bd bd-sys' });
    const bars = {};
    const defs = [['bat', 'BATTERY'], ['pow', 'POWER kW'], ['o2', 'OXYGEN'], ['co2', 'CO₂'], ['hull', 'HULL'], ['pres', 'PRESSURE']];
    for (const [k, l] of defs) { const fill = el('i'), val = el('b'); bars[k] = { fill, val }; m.append(el('div', { class: 'bar' }, el('small', { text: l }), el('div', { class: 'track' }, fill), val)); }
    const banner = el('div', { class: 'sbanner ok' });
    const sw = (key, label) => { const b = bbtn(label, () => { sim.s[key] = !sim.s[key]; paint(); }); const paint = () => { b.textContent = label + (sim.s[key] ? ' ON' : ' OFF'); b.classList.toggle('on', !!sim.s[key]); }; paint(); return b; };
    const c = el('div', { class: 'bc' }, banner, el('div', { class: 'row2' }, sw('lights', 'Lights'), sw('sonar', 'Sonar')));
    const r = el('div', { class: 'br' }); const tA = el('b'), tB = el('b');
    r.append(el('small', { text: 'WATER TEMP' }), tA, el('small', { text: 'PRESSURE' }), tB);
    const fillBar = (k, pct, text, bad) => { bars[k].fill.style.width = Math.max(0, Math.min(100, pct)) + '%'; bars[k].fill.className = bad ? 'bad' : ''; set(bars[k].val, text); };
    return { m, c, r, expand: 'sys',
      update() {
        const s = sim.s;
        fillBar('bat', s.battery, Math.round(s.battery) + '%', s.battery < 25); fillBar('pow', (s.power / 60) * 100, Math.round(s.power) + ' kW', false);
        fillBar('o2', s.oxygen, Math.round(s.oxygen) + '%', s.oxygen < 25); fillBar('co2', s.co2 * 20, s.co2.toFixed(2) + '%', s.co2 > 1);
        fillBar('hull', s.hull, Math.round(s.hull) + '%', s.hull < 60); fillBar('pres', s.depth / 60, Math.round(s.depth / 10 + 1) + ' bar', s.depth > 4000);
        const bad = s.battery < 15 || s.oxygen < 15 || s.hull < 40, warn = s.battery < 30 || s.oxygen < 30 || s.hull < 80;
        banner.className = 'sbanner ' + (bad ? 'bad' : warn ? 'warn' : 'ok'); set(banner, bad ? 'CRITICAL: RETURN TO DOCK' : warn ? 'CAUTION: CHECK SYSTEMS' : 'ALL SYSTEMS NOMINAL');
        set(tA, s.temp.toFixed(1) + ' °C'); set(tB, Math.round(s.depth / 10 + 1) + ' bar');
      } };
  })();

  // ---------- VIEW (the outside camera) ----------
  displays.view = (() => {
    const water = el('div', { class: 'water' }), dark = el('div', { class: 'dark' });
    const bubbles = el('div', { class: 'bubbles' }, [1, 2, 3, 4, 5, 6, 7, 8, 9].map(() => el('i')));
    const place = el('div', { class: 'hud-place' });
    const bSpd = el('b'), bDep = el('b'), bHdg = el('b');
    const hud = el('div', { class: 'hud-row' }, el('div', {}, bSpd, el('small', { text: 'KNOTS' })), el('div', {}, bDep, el('small', { text: 'DEPTH M' })), el('div', {}, bHdg, el('small', { text: 'HEADING' })));
    const m = el('div', { class: 'bd view' }, water, bubbles, dark, place, hud);
    const lightsB = bbtn('', () => { sim.s.lights = !sim.s.lights; paint(); }); const paint = () => { lightsB.textContent = 'Lights ' + (sim.s.lights ? 'ON' : 'OFF'); lightsB.classList.toggle('on', !!sim.s.lights); }; paint();
    const c = el('div', { class: 'bc' }, el('div', { class: 'cap', text: 'EXTERIOR CAMERA' }), el('div', { class: 'row2' }, lightsB));
    const r = el('div', { class: 'br' }); const pA = el('b'), pB = el('b');
    r.append(el('small', { text: 'PRESSURE' }), pA, el('small', { text: 'WATER TEMP' }), pB);
    return { m, c, r, expand: null,
      update() {
        const s = sim.s;
        set(place, s.at ? s.at.name : s.wpt ? 'En route: ' + s.wpt.name : 'Open water');
        set(bSpd, s.speed.toFixed(1)); set(bDep, String(Math.round(s.depth))); set(bHdg, pad(s.heading) + '°');
        const moving = s.speed > 0.3; m.classList.toggle('moving', moving);
        const dk = Math.min(0.9, s.depth / 900).toFixed(2); if (dark._v !== dk) { dark._v = dk; dark.style.opacity = dk; }
        set(pA, `${Math.round(s.depth / 10 + 1)} bar`); set(pB, `${s.temp.toFixed(1)} °C`);
      } };
  })();

  // ---------- main screen, left selector, expand ----------
  const expand = el('button', { class: 'bd-expand', 'aria-label': 'Open this display full screen', text: '⤢', onclick: () => { const d = displays[current]; if (d && d.expand) onExpand(d.expand); } });
  const sel = el('div', { class: 'selector' });
  const btns = {};
  for (const id of order) { btns[id] = bbtn(labels[id], () => select(id)); sel.append(btns[id]); main.append(displays[id].m); center.append(displays[id].c); right.append(displays[id].r); }
  main.append(expand); left.append(sel);

  let current = 'nav';
  function select(id) {
    if (!displays[id]) id = 'nav';
    current = id;
    try { localStorage.setItem(KEY, id); } catch (e) { /* ignore */ }
    for (const k of order) { const on = k === id; displays[k].m.hidden = !on; displays[k].c.hidden = !on; displays[k].r.hidden = !on; btns[k].classList.toggle('on', on); }
    expand.hidden = !displays[id].expand;
    update(true);
  }

  function update() {
    const s = sim.s;
    set(tPlace, s.at ? s.at.name.toUpperCase() : s.wpt ? 'EN ROUTE: ' + s.wpt.name.toUpperCase() : 'OPEN WATER');
    set(tPos, `${deg(s.lat, 'N', 'S', 2)}  ${deg(s.lon, 'E', 'W', 3)}  ·  ${gameDateText()}`);
    displays[current].update();
  }

  let saved = 'nav'; try { saved = localStorage.getItem(KEY) || 'nav'; } catch (e) { /* ignore */ }
  select(saved);
  return { select, update, get current() { return current; }, get nd() { return displays.nav.nd; }, nav: displays.nav };
}
