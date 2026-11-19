// The bridge consoles, matched to the screens in the bridge art:
//   top     : upper display. Place, latitude/longitude, game date and time, then brief notices (or ship status).
//   main    : the large screen. Navigation map by default; the player can send the medium display's picture to it.
//   display : the medium screen in the center. Shows what the left mini console picks (NAV, HELM, SYS, VIEW).
//   control : the bottom center screen. Controls for the picked display.
//   left    : bottom left mini console. Picks the display.
//   right   : bottom right mini console. Extra data for the picked display.
// Sized in the 1920x1080 stage. Only the visible displays are updated.
import { sim, toward, gameDateText, clockText } from './sim.js';
import { createND } from './nd.js';
import { createDial } from './ui.js';
import { el, pad, toast } from './util.js';
import { toggleDock } from './dock.js';
import { createProfile } from './profile.js';
import { openPlotDialog } from './plot.js';
import { createSynth } from './synth.js';
import { seafloor } from './seafloor.js';
import { research } from './science.js';
import { GATES_ON } from './unlocks.js';
import { tell } from './notify.js';

const KEY = 'aquaNova_bridgeDisplay';
const set = (node, v) => { if (node._v !== v) { node._v = v; node.textContent = v; } };
const deg = (v, pos, neg, w) => { const a = Math.abs(v), d = Math.floor(a), m = (a - d) * 60; return `${String(d).padStart(w, '0')}°${m.toFixed(1).padStart(4, '0')}′${v >= 0 ? pos : neg}`; };
const etaText = (nm, kt) => { if (kt < 0.5) return '—'; const mins = Math.round((nm / kt) * 60); return mins >= 60 ? `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, '0')} min` : `${mins} min`; };
const bbtn = (text, onclick, cls = '') => el('button', { class: `bbtn ${cls}`, text, onclick });
const rdRow = (label, valueNode) => el('div', { class: 'rdr' }, el('small', { text: label }), valueNode);
const rd = (label, valueNode) => el('div', { class: 'rd' }, el('small', { text: label }), valueNode);
const order = ['nav', 'helm', 'sys', 'view'];
// VIEW: synthetic vision (a forward window built from the charted sea floor) or the exterior camera picture.
// With the gates on, synthetic vision comes from the research topic of that name.
const synthOk = () => !GATES_ON || research.has('synthetic-view');
const vopt = { mode: 'synth' };   // shared by the large and the medium copy
const labels = { nav: 'NAV', helm: 'HELM', sys: 'SYS', view: 'VIEW' };

export function createBridgeConsole({ top, main, display, center, left, right, onExpand }) {
  // ---------- top display ----------
  const tPlace = el('div', { class: 'bt-place' }), tPos = el('div', { class: 'bt-pos' }), tNote = el('div', { class: 'bt-note' }), tStack = el('div', { class: 'bt-stack' });
  top.append(tPlace, tPos, tNote, tStack);
  // Notices stack: the newest is the big bright title, the one before it drops to a body line, and so on (three at most).
  // After NOTE_HOLD ms with nothing new they all clear and the normal readout returns.
  const NOTE_HOLD = 5000, notes = []; let noteAt = 0, noteKey = '';
  document.addEventListener('notice', (e) => {
    const d = e.detail || {};
    notes.unshift({ text: String(d.text || ''), kind: d.kind || '', who: d.who || '' }); notes.length = Math.min(notes.length, 3); noteAt = Date.now();
  });
  function paintNotes() {
    const key = notes.map((n) => n.kind + n.who + n.text).join('|');
    if (key === noteKey) return; noteKey = key;
    if (!notes.length) { tStack.replaceChildren(); return; }
    const t = notes[0], size = t.text.length <= 26 ? 'big' : t.text.length <= 46 ? 'mid' : 'small';
    tStack.replaceChildren(el('div', { class: `bt-title ${size} ${t.kind}`, text: t.text }),
      ...notes.slice(1).map((n) => el('div', { class: 'bt-body', text: (n.who ? n.who + ' · ' : '') + n.text })));
  }

  const views = {};

  // ---------- NAV ----------
  views.nav = (() => {
    const nds = []; let sel = null;
    const syncSel = (p) => { sel = p; nds.forEach((n) => { n.sel = p; n.redraw(); }); refresh(); };
    const rangeTxt = el('span', { class: 'rng' });
    const make = (compact) => {
      const m = el('div', { class: 'bd bd-nav' + (compact ? ' compact' : '') });
      const wrap = el('div', { class: 'nd-stage' }); m.append(wrap);
      const nd = createND(wrap, { stage: true, units: compact ? 1.25 : 1.7, contours: !compact, rings: compact, trackUp: compact, onPick: syncSel });   // the big main screen stays north up; the medium main display is track up
      if (nds[0]) nd.setRange(nds[0].range);
      nd.sel = sel; nds.push(nd);
      if (compact) return { m, update() { nd.redraw(); } };
      const logCur = el('div'), logPlace = el('div', { class: 'nl-place' }), logDest = el('div'), logTime = el('div');
      const rSpd = el('b'), rDep = el('b'), rFlr = el('b'), rHdg = el('b');
      const prof = createProfile(el('div', { class: 'nav-prof' })); const profBox = prof.canvas.parentNode;
      profBox.prepend(el('div', { class: 'np-title', text: 'VERTICAL PROFILE' }));
      m.append(el('div', { class: 'nav-read' }, rdRow('SPEED KT', rSpd), rdRow('DEPTH M', rDep), rdRow('FLOOR M', rFlr), rdRow('HDG', rHdg)),
        el('div', { class: 'nav-log' }, el('b', { text: 'NAVIGATIONAL POSITION LOG' }), logTime, logCur, logPlace, logDest), profBox);
      return { m, update() {
        const s = sim.s;
        set(rSpd, s.speed.toFixed(1)); set(rDep, String(Math.round(s.depth))); set(rFlr, s.floor == null ? '—' : String(Math.round(s.floor))); set(rHdg, pad(s.heading) + '°');
        set(logTime, `MISSION TIME INDEX ${clockText()}`);
        set(logCur, `CURR POS ${deg(s.lat, 'N', 'S', 2)} ${deg(s.lon, 'E', 'W', 3)}`); set(logPlace, s.at ? s.at.name : 'Open water');
        if (s.wpt) { const t = toward(s, s.wpt); set(logDest, `DEST POS ${s.wpt.name}  ${t.nm.toFixed(1)} nm  ETA ${etaText(t.nm, s.speed)}`); } else set(logDest, 'DEST POS none');
        prof.draw(s, nds[0].range); profBox.dataset.warn = prof.warn;
        nd.redraw();
      } };
    };
    const zoom = (dir) => { const r = nds[0].zoom(dir); nds.forEach((n) => n.setRange(r)); refresh(); };
    const plot = bbtn('Plot a course', () => openPlotDialog({ preselect: sel, onPlotted: refresh }), 'wide');
    const clear = bbtn('Clear', () => { sel = null; nds.forEach((n) => { n.sel = null; }); sim.s.wpt = null; sim.touch(); refresh(); });
    const c = el('div', { class: 'bc' }, el('div', { class: 'rowN' },
      bbtn('−', () => zoom(-1), 'sq'), el('div', { class: 'rngbox' }, el('small', { text: 'RANGE' }), rangeTxt), bbtn('+', () => zoom(1), 'sq'), plot, clear));
    const r = el('div', { class: 'br' }); const rA = el('small'), rB = el('b'), rC = el('div'); r.append(rA, rB, rC);
    function refresh() {
      const s = sim.s;
      set(rangeTxt, nds[0] ? nds[0].range + ' nm' : '');
      if (sel) { const t = toward(s, sel); set(rA, sel.type.toUpperCase()); set(rB, sel.name); set(rC, `${t.nm.toFixed(1)} nm  BRG ${pad(t.brg)}°`); }
      else if (s.wpt) { const t = toward(s, s.wpt); set(rA, 'COURSE SET'); set(rB, s.wpt.name); set(rC, `${t.nm.toFixed(1)} nm  ETA ${etaText(t.nm, s.speed)}`); }
      else { set(rA, 'DESTINATION'); set(rB, 'None'); set(rC, 'Tap a marker'); }
    }
    return { make, c, r, expand: 'nav', side: refresh, nds };
  })();

  // ---------- HELM ----------
  views.helm = (() => {
    const make = (compact) => {
      const m = el('div', { class: 'bd bd-helm' + (compact ? ' compact' : '') });
      const hSpd = el('b'), hDep = el('b');
      const dial = createDial({ onInput: (h) => { sim.setHeading(h); sim.s.wpt = null; } });
      m.append(rd('SPEED KT', hSpd), dial.root, rd('DEPTH M', hDep));
      return { m, update() { const s = sim.s; set(hSpd, s.speed.toFixed(1)); set(hDep, String(Math.round(s.depth))); dial.update(s.heading, s.targetHeading); } };
    };
    const thr = (d) => { sim.setThrottle(Math.round(Math.min(1, Math.max(0, sim.s.throttle + d)) * 20) / 20); };
    const dep = (d) => sim.setDepth(Math.min(6000, Math.max(0, Math.round((sim.s.targetDepth + d) / 10) * 10)));
    const dockB = bbtn('Dock', () => toggleDock());
    const cruiseB = bbtn('Cruise', () => { const r = sim.setCruise(!sim.s.cruise); tell('helm', r.ok ? (sim.s.cruise ? 'Super cruise engaged, Captain.' : 'Super cruise disengaged.') : r.why === 'docked' ? 'We are docked, Captain.' : 'Not enough deep water ahead, Captain. Super cruise needs 120 m under us for the next 9 miles.', r.ok ? '' : 'error'); });
    const c = el('div', { class: 'bc' },
      el('div', { class: 'rowN' }, bbtn('◂ Port', () => { sim.setHeading(sim.s.targetHeading - 10); sim.s.wpt = null; }), bbtn('Stbd ▸', () => { sim.setHeading(sim.s.targetHeading + 10); sim.s.wpt = null; }), bbtn('Slower', () => thr(-0.1)), bbtn('Faster', () => thr(0.1)), dockB),
      el('div', { class: 'rowN' }, bbtn('Up 50 m', () => dep(-50)), bbtn('Down 50 m', () => dep(50)), bbtn('Surface', () => sim.setDepth(0)), cruiseB));
    const r = el('div', { class: 'br' }); const v1 = el('b'), v2 = el('b');
    r.append(el('small', { text: 'THROTTLE' }), v1, el('small', { text: 'ORDERED DEPTH' }), v2);
    return { make, c, r, expand: 'helm', side() {
      const s = sim.s; set(v1, Math.round(s.throttle * 100) + '%'); set(v2, Math.round(s.targetDepth) + ' m');
      dockB.classList.toggle('on', !!s.docked); cruiseB.classList.toggle('on', !!s.cruise);
    } };
  })();

  // ---------- SYS ----------
  views.sys = (() => {
    const all = [['bat', 'BATTERY'], ['pow', 'POWER'], ['o2', 'OXYGEN'], ['co2', 'CO₂'], ['hull', 'HULL'], ['pres', 'PRESSURE']];
    const sets = [];
    const make = (compact) => {
      const m = el('div', { class: 'bd bd-sys' + (compact ? ' compact' : '') }); const bars = {};
      for (const [k, l] of (compact ? all.filter((d) => ['bat', 'o2', 'hull'].includes(d[0])) : all)) { const fill = el('i'), val = el('b'); bars[k] = { fill, val }; m.append(el('div', { class: 'bar' }, el('small', { text: l }), el('div', { class: 'track' }, fill), val)); }
      sets.push(bars);
      return { m, update() { update(); } };
    };
    const fillBar = (bars, k, pct, text, bad) => { if (!bars[k]) return; bars[k].fill.style.width = Math.max(0, Math.min(100, pct)) + '%'; bars[k].fill.className = bad ? 'bad' : ''; set(bars[k].val, text); };
    function update() {
      const s = sim.s;
      for (const b of sets) {
        fillBar(b, 'bat', s.battery, Math.round(s.battery) + '%', s.battery < 25); fillBar(b, 'pow', (s.power / 60) * 100, Math.round(s.power) + ' kW', false);
        fillBar(b, 'o2', s.oxygen, Math.round(s.oxygen) + '%', s.oxygen < 25); fillBar(b, 'co2', s.co2 * 20, s.co2.toFixed(2) + '%', s.co2 > 1);
        fillBar(b, 'hull', s.hull, Math.round(s.hull) + '%', s.hull < 60); fillBar(b, 'pres', s.depth / 60, Math.round(s.depth / 10 + 1) + ' bar', s.depth > 4000);
      }
    }
    const sw = (key, label) => { const b = bbtn('', () => { sim.s[key] = !sim.s[key]; paint(); }); const paint = () => { b.classList.toggle('on', !!sim.s[key]); }; b.textContent = label; paint(); return b; };
    const banner = el('div', { class: 'sbanner ok' });
    const swL = sw('lights', 'Lights'), swS = sw('sonar', 'Sonar');
    const c = el('div', { class: 'bc' }, el('div', { class: 'rowN' }, banner, swL, swS));
    const r = el('div', { class: 'br' }); const tA = el('b'), tB = el('b');
    r.append(el('small', { text: 'WATER TEMP' }), tA, el('small', { text: 'PRESSURE' }), tB);
    return { make, c, r, expand: 'sys', side() {
      const s = sim.s, bad = s.battery < 15 || s.oxygen < 15 || s.hull < 40, warn = s.battery < 30 || s.oxygen < 30 || s.hull < 80;
      banner.className = 'sbanner ' + (bad ? 'bad' : warn ? 'warn' : 'ok'); set(banner, bad ? 'CRITICAL' : warn ? 'CAUTION' : 'NOMINAL');
      set(tA, s.temp.toFixed(1) + ' °C'); set(tB, Math.round(s.depth / 10 + 1) + ' bar');
      swL.classList.toggle('on', !!s.lights); swS.classList.toggle('on', !!s.sonar);
    } };
  })();

  // ---------- VIEW (outside camera) ----------
  views.view = (() => {
    const make = (compact) => {
      const water = el('div', { class: 'water' }), dark = el('div', { class: 'dark' });
      const bubbles = el('div', { class: 'bubbles' }, [1, 2, 3, 4, 5, 6, 7, 8, 9].map(() => el('i')));
      const place = el('div', { class: 'hud-place' }); const bSpd = el('b'), bDep = el('b'), bHdg = el('b');
      const hud = el('div', { class: 'hud-row' }, el('div', {}, bSpd, el('small', { text: 'KNOTS' })), el('div', {}, bDep, el('small', { text: 'DEPTH M' })), el('div', {}, bHdg, el('small', { text: 'HEADING' })));
      const syn = el('div', { class: 'bd-synth' }), sy = createSynth(syn);
      const m = el('div', { class: 'bd view' + (compact ? ' compact' : '') }, water, bubbles, dark, place, hud, syn);
      let last = 0;
      return { m, update() {
        const s = sim.s, on = vopt.mode === 'synth' && synthOk();
        m.classList.toggle('synth-on', on);
        if (on) {
          if (!m.offsetParent) return;                               // not on screen: do not draw it (the other copy is showing)
          if (Date.now() - last < 250) return; last = Date.now();   // a few redraws a second is plenty
          sy.draw({ lat: s.lat, lon: s.lon, heading: s.heading, depth: s.depth, speed: s.speed });   // a window: fixed field of view and distance, with horizon and speed, heading and depth tapes
          return;
        }
        set(place, s.at ? s.at.name : s.wpt ? 'En route: ' + s.wpt.name : 'Open water');
        set(bSpd, s.speed.toFixed(1)); set(bDep, String(Math.round(s.depth))); set(bHdg, pad(s.heading) + '°');
        m.classList.toggle('moving', s.speed > 0.3);
        const dk = Math.min(0.9, s.depth / 900).toFixed(2); if (dark._v !== dk) { dark._v = dk; dark.style.opacity = dk; }
      } };
    };
    const lightsB = bbtn('', () => { sim.s.lights = !sim.s.lights; paint(); }); const paint = () => { lightsB.classList.toggle('on', !!sim.s.lights); }; lightsB.textContent = 'Lights'; paint();
    const modeB = bbtn('', () => { vopt.mode = vopt.mode === 'synth' ? 'camera' : 'synth'; side(); });
    const c = el('div', { class: 'bc' }, el('div', { class: 'rowN' }, el('div', { class: 'cap', text: 'FORWARD VIEW' }), lightsB, modeB));
    const r = el('div', { class: 'br' }); const pA = el('b'), pB = el('b');
    r.append(el('small', { text: 'PRESSURE' }), pA, el('small', { text: 'WATER TEMP' }), pB);
    function side() {
      const s = sim.s, ok = synthOk();
      lightsB.classList.toggle('on', !!s.lights);
      modeB.textContent = !ok ? 'SYNTHETIC: RESEARCH NEEDED' : vopt.mode === 'synth' ? 'SHOW CAMERA' : 'SHOW SYNTHETIC'; modeB.disabled = !ok;
      set(pA, `${Math.round(s.depth / 10 + 1)} bar`); set(pB, `${s.temp.toFixed(1)} °C`);
    }
    return { make, c, r, expand: null, side };
  })();

  // ---------- build: one large and one compact copy of each ----------
  const big = {}, small = {}, sel = el('div', { class: 'selector' }), btns = {};
  for (const id of order) {
    big[id] = views[id].make(false); small[id] = views[id].make(true);
    main.append(big[id].m); display.append(small[id].m); center.append(views[id].c); right.append(views[id].r);
    btns[id] = bbtn(labels[id], () => select(id)); sel.append(btns[id]);
  }
  left.append(sel);
  const expand = el('button', { class: 'bd-expand', 'aria-label': 'Open this display full screen', text: '⤢', onclick: () => { const v = views[mainId]; if (v && v.expand) onExpand(v.expand); } });
  const promote = el('button', { class: 'bd-promote', 'aria-label': 'Send to the main screen', text: 'MAIN ▲', onclick: () => { mainId = current === 'nav' || mainId === current ? 'nav' : current; paint(); update(); } });
  main.append(expand); display.append(promote);

  let current = 'nav', mainId = 'nav';
  function paint() {
    for (const k of order) {
      small[k].m.hidden = k !== current; views[k].c.hidden = k !== current; views[k].r.hidden = k !== current;
      big[k].m.hidden = k !== mainId; btns[k].classList.toggle('on', k === current);
    }
    expand.hidden = !views[mainId].expand;
    promote.classList.toggle('on', mainId === current);
  }
  function select(id) {
    if (!views[id]) id = 'nav';
    current = id;
    try { localStorage.setItem(KEY, id); } catch (e) { /* ignore */ }
    paint(); update();
  }
  function update() {
    const s = sim.s;
    set(tPlace, s.at ? s.at.name.toUpperCase() : s.wpt ? 'EN ROUTE: ' + s.wpt.name.toUpperCase() : 'OPEN WATER');
    set(tPos, `${deg(s.lat, 'N', 'S', 2)}  ${deg(s.lon, 'E', 'W', 3)}  ·  ${gameDateText()}`);
    if (notes.length && Date.now() - noteAt > NOTE_HOLD) notes.length = 0;
    paintNotes(); top.classList.toggle('noting', notes.length > 0);
    set(tNote, `BAT ${Math.round(s.battery)}%   O₂ ${Math.round(s.oxygen)}%   HULL ${Math.round(s.hull)}%`);
    big[mainId].update(); if (current !== mainId) small[current].update(); else small[current].update();
    views[current].side();
  }

  let saved = 'nav'; try { saved = localStorage.getItem(KEY) || 'nav'; } catch (e) { /* ignore */ }
  select(saved);
  return { select, update, get current() { return current; }, get main() { return mainId; }, nds: views.nav.nds };
}
