// The bridge consoles, matched to the screens in the bridge art:
//   top     : upper display. Place, latitude/longitude, game date and time, then brief notices (or ship status).
//   main    : the large screen. Navigation map by default; the player can send the medium display's picture to it.
//   display : the medium screen in the center. Shows the page the left desk panel picks.
//   control : the bottom center screen. Controls for the picked page.
//   left    : bottom left desk panel. Picks the page: NAV, HLM, TAC, SNR, VW, SYS.
//   right   : bottom right desk panel. The view settings of the picked page (range, DSP, PAN, what to show).
// Sized in the 1920x1080 stage. Only the visible displays are updated.
import { sim, toward, gameDateText, clockText, cruiseWhy } from './sim.js';
import { createND } from './nd.js';
import { routeLength } from './route.js';
import { createDial } from './ui.js';
import { el, pad, modal, toast } from './util.js';
import { createProfile } from './profile.js';
import { openPlotDialog } from './plot.js';
import { createSynth } from './synth.js';
import { seafloor } from './seafloor.js';
import { research } from './science.js';
import { GATES_ON } from './unlocks.js';
import { tell } from './notify.js';
import { createSnrView, setSnrRange, onSnrRange } from './sonarView.js';

const KEY = 'aquaNova_bridgeDisplay';
const set = (node, v) => { if (node._v !== v) { node._v = v; node.textContent = v; } };
const deg = (v, pos, neg, w) => { const a = Math.abs(v), d = Math.floor(a), m = (a - d) * 60; return `${String(d).padStart(w, '0')}°${m.toFixed(1).padStart(4, '0')}′${v >= 0 ? pos : neg}`; };
const etaText = (nm, kt) => { if (kt < 0.5) return '—'; const mins = Math.round((nm / kt) * 60); return mins >= 60 ? `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, '0')} min` : `${mins} min`; };
let SHORT = null;   // the retro skin has room for three letters on a button: createBridgeConsole fills this in
const bbtn = (text, onclick, cls = '') => el('button', { class: `bbtn ${cls}`, text: (SHORT && SHORT[text]) || text, onclick });
const rdRow = (label, valueNode) => el('div', { class: 'rdr' }, el('small', { text: label }), valueNode);
const rd = (label, valueNode) => el('div', { class: 'rd' }, el('small', { text: label }), valueNode);
const order = ['nav', 'hlm', 'tac', 'snr', 'vw', 'sys'];   // the left desk panel's six pages
// VIEW: synthetic vision (a forward window built from the charted sea floor) or the exterior camera picture.
// With the gates on, synthetic vision comes from the research topic of that name.
const synthOk = () => !GATES_ON || research.has('synthetic-view');
const vopt = { mode: 'synth' };   // shared by the large and the medium copy
const labels = { nav: 'NAV', hlm: 'HLM', tac: 'TAC', snr: 'SNR', vw: 'VW', sys: 'SYS' };

export function createBridgeConsole({ top, main, display, center, left, right, onExpand, retro = null }) {
  SHORT = retro ? retro.short || null : null;   // retro: { createND } swaps in the pixel chart of the retro skin
  // ---------- top display ----------
  // Two lines, centred. Line 1: the ship's state ("Arrival at ...", "Bay door opening", "Incoming message"); line 2: position, date and time.
  // Short crew lines (the reply to a button press) show here as notices; anything longer opens the crew member's dialogue.
  const tPlace = el('div', { class: 'bt-place' }), tPos = el('div', { class: 'bt-pos' });
  top.append(tPlace, tPos);
  const NOTE_HOLD = 6000; let note = null;
  document.addEventListener('notice', (e) => { const d = e.detail || {}; if (d.text) note = { text: String(d.text), kind: d.kind || '', at: Date.now() }; });

  const views = {};

  // ---------- NAV ----------
  views.nav = (() => {
    const nds = [], show = { ships: true, subs: true, base: true, orgs: true, labels: true }; let sel = null, bigNd = null, panAt = null;
    const syncSel = (p) => { sel = p; nds.forEach((n) => { n.sel = p; n.redraw(); }); refresh(); };
    const rangeTxt = el('span', { class: 'rng' });
    const make = (compact) => {
      const m = el('div', { class: 'bd bd-nav' + (compact ? ' compact' : '') });
      const wrap = el('div', { class: 'nd-stage' }); m.append(wrap);
      const nd = (retro ? retro.createND : createND)(wrap, { stage: true, units: compact ? 1.25 : 1.7, contours: !compact, rings: compact, onPick: syncSel });   // the big main screen stays north up; the medium main display is track up
      if (nds[0]) nd.setRange(nds[0].range);
      nd.sel = sel; nd.show = show; nds.push(nd); if (!compact) bigNd = nd;
      if (compact) return { m, update() { nd.redraw(); } };
      const row = (l) => { const v = el('span'); return [el('div', { class: 'nl-r' }, el('small', { text: l }), v), v]; };
      const [rT, logTime] = row('TIME'), [rP, logCur] = row('POS'), [rA, logPlace] = row('AT'), [rD, logDest] = row('DEST'), [rE, logEta] = row('');
      m.append(el('div', { class: 'nav-log' }, el('b', { text: 'NAV POSITION LOG' }), rT, rP, rA, rD, rE));
      return { m, update() {
        const s = sim.s;
        set(logTime, clockText());
        set(logCur, `${deg(s.lat, 'N', 'S', 2)} ${deg(s.lon, 'E', 'W', 3)}`); set(logPlace, s.at ? s.at.name : 'Open water');
        if (s.wpt) {   // distance along the route still to go (round the land, through the waypoints), at the speed the helm is set to (owner, 2026-11-27)
          const nm = s.route && s.route.length ? routeLength(s, s.route) : toward(s, s.wpt).nm, kt = s.throttle * sim.maxKt() > 0.5 ? s.throttle * sim.maxKt() : s.speed;
          set(logDest, s.wpt.name); set(logEta, `${nm.toFixed(1)} nm · ETA ${etaText(nm, kt)}`);
        } else { set(logDest, 'none'); set(logEta, ''); }
        nd.redraw();
      } };
    };
    // Pan moves the chart's centre (north up); panOff puts the ship back in the middle.
    const panBy = (dxNm, dyNm) => {
      if (!bigNd) return; const s0 = sim.s;
      if (!panAt) panAt = { lat: s0.lat, lon: s0.lon };
      panAt = { lat: panAt.lat + dyNm / 60, lon: panAt.lon + dxNm / (60 * Math.cos((panAt.lat * Math.PI) / 180)) }; bigNd.setPan(panAt);
    };
    const panOff = () => { panAt = null; if (bigNd) bigNd.setPan(null); };
    const zoom = (dir) => { const r = nds[0].zoom(dir); nds.forEach((n) => n.setRange(r)); set(rangeTxt, r + ' nm'); setSnrRange(r); };   // one master range: SNR follows
    // Controls. Dest, Fix and Route build the Route (s.fixes); Plot turns it into a course.
    const fixDialog = (opts) => openPlotDialog({ preselect: sel, ...opts });
    const helm = (text) => tell('helm', text);
    // Dest: the waypoint dialog; the waypoint becomes the end of the Route (owner, 2026-11-27: no Fix button, Route + adds waypoints)
    const dest = bbtn('Dest', () => fixDialog({ title: 'Destination', action: 'Done', initial: null, onFix: (f) => { const fx = sim.s.fixes; fx.length ? fx.splice(fx.length - 1, 1, f) : fx.push(f); sim.s.wpt = null; sim.touch(); refresh(); } }));
    const routeB = bbtn('Route', () => openRoute());
    const plot = bbtn('Plot', () => {
      const s = sim.s;
      if (s.docked) return helm('We are docked, Captain. Undock first, then plot.');
      const r = sim.plotRoute();
      if (!r.ok) return helm(r.why === 'empty' ? 'The route is empty, Captain. Set a destination first.' : `No safe way to ${r.fix.name}, Captain: land or shallows block every way round.`);
      const tps = r.route.filter((q) => q.tp).length;
      helm(`Course plotted through ${s.fixes.length} fix${s.fixes.length === 1 ? '' : 'es'}${tps ? `, ${tps} turn point${tps === 1 ? '' : 's'} to clear the land` : ''}. ${s.throttle > 0.01 ? 'Speed unchanged.' : 'We are not under way. Set a speed when you are ready.'}`);
      refresh();
    }, 'go');
    // The Route editor (owner, 2026-11-27): starts at the ship's present position; waypoints below it. Tap a row to select it.
    // + adds a waypoint after the selected one (the waypoint dialog), - deletes it, up and down move it, Edit changes it. Done keeps the changes, Cancel drops them.
    // Plot then plots it round the land; speed and depth do not change. Turn points are the helm's own and are not listed.
    function openRoute() {
      const work = [...sim.s.fixes]; let at = work.length - 1, close = () => {};
      const list = el('div', { class: 'route-list' });
      const draw = () => {
        let from = sim.s;
        const rows = [el('div', { class: 'route-row here' }, el('div', { class: 'grow' }, el('b', { text: '0  PRESENT POSITION' }), el('small', { text: `${deg(sim.s.lat, 'N', 'S', 2)} ${deg(sim.s.lon, 'E', 'W', 3)}` })))];
        work.forEach((f, i) => { const t = toward(from, f); from = f;
          rows.push(el('button', { class: 'route-row' + (i === at ? ' sel' : ''), onclick: () => { at = i; draw(); } },
            el('div', { class: 'grow' }, el('b', { text: `${i + 1}  ${f.name}${i === work.length - 1 ? '  (DEST)' : ''}` }), el('small', { text: `${pad(t.brg)}°  ${t.nm.toFixed(1)} nm` })))); });
        list.replaceChildren(...rows);
        minus.disabled = edit.disabled = at < 0; up.disabled = at <= 0; down.disabled = at < 0 || at >= work.length - 1;
      };
      const mv = (d) => { const j = at + d; if (at < 0 || j < 0 || j >= work.length) return; [work[at], work[j]] = [work[j], work[at]]; at = j; draw(); };
      const plus = el('button', { class: 'btn chip sym', text: '+', 'aria-label': 'Add a waypoint', onclick: () => fixDialog({ title: 'New waypoint', action: 'Done', onFix: (f) => { work.splice(at + 1, 0, f); at += 1; draw(); } }) });
      const minus = el('button', { class: 'btn chip sym', text: '−', 'aria-label': 'Delete the waypoint', onclick: () => { if (at < 0) return; work.splice(at, 1); at = Math.min(at, work.length - 1); draw(); } });
      const up = el('button', { class: 'btn chip sym', text: '▲', 'aria-label': 'Move up', onclick: () => mv(-1) });
      const down = el('button', { class: 'btn chip sym', text: '▼', 'aria-label': 'Move down', onclick: () => mv(1) });
      const edit = el('button', { class: 'btn chip', text: 'Edit', 'aria-label': 'Edit the waypoint', onclick: () => { const f = work[at]; if (!f) return; fixDialog({ title: `Edit ${f.name}`, action: 'Done', initial: f.type === 'waypoint' ? f : null, onFix: (nf) => { work[at] = f.type === 'waypoint' && nf.type === 'waypoint' ? { ...nf, id: f.id, name: f.name } : nf; draw(); } }); } });
      const done = el('button', { class: 'btn primary', text: 'Done', onclick: () => { sim.s.fixes = work; sim.s.wpt = null; sim.s.route = []; sim.touch(); close(); refresh(); } });   // a changed Route is plotted again with Plot
      const cancel = el('button', { class: 'btn', text: 'Cancel', onclick: () => close() });
      draw();
      close = modal({ title: 'Route', body: el('div', {}, list, el('div', { class: 'row route-btns' }, plus, minus, up, down, edit, done, cancel)), actions: [] });
    }
    // SHW: switches for what the NAV display draws. They replace the controls while SHW is on.
    const showSw = (key, label) => { const b = bbtn(label, () => { show[key] = !show[key]; nds.forEach((n) => n.redraw()); paint(); }); const paint = () => b.classList.toggle('on', !!show[key]); paint(); return b; };
    const showC = el('div', { class: 'bc shw' }, el('div', { class: 'rowN' }, showSw('ships', 'Ships'), showSw('subs', 'Subs'), showSw('base', 'Base'), showSw('orgs', 'Orgs'), showSw('labels', 'Labels')));
    const c = el('div', { class: 'bc' }, el('div', { class: 'rowN' }, dest, routeB, plot));
    // View settings (right desk): range and PAN here, DSP and SHW added by the console.
    const v = [bbtn('−', () => zoom(1), 'sym'), el('div', { class: 'rngbox' }, el('small', { text: 'RANGE' }), rangeTxt), bbtn('+', () => zoom(-1), 'sym')];   // the right desk is a bank of six: range first
    function refresh() { set(rangeTxt, nds[0] ? nds[0].range + ' nm' : ''); plot.classList.toggle('on', !!sim.s.wpt); }
    return { make, c, v, extra: showC, expand: 'nav', side: refresh, nds, show, zoom, rangeTxt, panBy, panOff, panStep: () => (nds[0] ? nds[0].range * 0.25 : 1) };
  })();

  // ---------- HLM ----------
  // Display: heading dial in the middle, speed tape on its left, depth tape on its right. Each tape shows the actual value in a box, an orange
  // triangle and small number at the value that is set, and a trend vector (where the value will be in TREND_S seconds, never past the set value).
  const NSV = 'http://www.w3.org/2000/svg', sv = (t, a = {}, text) => { const n = document.createElementNS(NSV, t); for (const k in a) n.setAttribute(k, a[k]); if (text != null) n.textContent = text; return n; };
  const TAPE_W = 140, TAPE_H = 300, MID = TAPE_H / 2, TREND_S = 3;   // trend vectors look this many seconds ahead
  /** A vertical tape. mirror: the tape sits on the left edge (the depth tape, with the dial on its left). up: bigger values are higher on the tape. */
  function createTape({ mirror, up }) {
    const svg = sv('svg', { viewBox: `0 0 ${TAPE_W} ${TAPE_H}`, class: 'tape' }), g = sv('g');
    svg.append(g);
    const X = (x) => (mirror ? TAPE_W - x : x), anchor = (a) => (mirror ? (a === 'end' ? 'start' : 'end') : a);
    const mono = { 'font-family': 'ui-monospace, Menlo, monospace', 'font-weight': 700 };
    return {
      svg,
      update({ cur, set, rate, ground = null, span, step, major, fmt = (v) => String(Math.round(v)), unit = '' }) {   // rate: change per second
        const k = TAPE_H / span, Y = (v) => MID + (up ? -1 : 1) * (v - cur) * k, kids = [];
        const band = [X(70), X(128)].sort((a, b) => a - b);
        kids.push(sv('rect', { x: band[0], y: 0, width: band[1] - band[0], height: TAPE_H, fill: 'rgba(6,21,35,0.85)', stroke: '#2b4a63', 'stroke-width': 2 }));
        const lo = cur - span / 2, hi = cur + span / 2;
        for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
          if (v < 0 && up) continue;
          const y = Y(v), big = Math.round(v / step) % (major / step) === 0;
          kids.push(sv('line', { x1: X(128), y1: y, x2: X(big ? 112 : 119), y2: y, stroke: big ? '#64ffda' : '#4c6a85', 'stroke-width': 2 }));
          if (big) kids.push(sv('text', { x: X(106), y: y + 6, 'text-anchor': anchor('end'), fill: '#8fa6bd', 'font-size': 17, ...mono }, fmt(v)));
        }
        if (ground != null) { const y = Y(ground); if (y < TAPE_H) { kids.push(sv('rect', { x: band[0], y: Math.max(0, y), width: band[1] - band[0], height: TAPE_H - Math.max(0, y), fill: 'rgba(255,77,77,0.28)' })); if (y > 0) kids.push(sv('line', { x1: band[0], y1: y, x2: band[1], y2: y, stroke: '#ff4d4d', 'stroke-width': 4 })); } }
        const sy = Math.max(8, Math.min(TAPE_H - 8, Y(set)));   // the set marker stays on the tape even when its value is off the scale
        kids.push(sv('polygon', { points: `${X(62)},${sy - 9} ${X(62)},${sy + 9} ${X(74)},${sy}`, fill: '#ffb020' }), sv('text', { x: X(54), y: sy + 6, 'text-anchor': anchor('end'), fill: '#ffb020', 'font-size': 15, ...mono }, fmt(set)));
        let ahead = rate * TREND_S; if ((set - cur) * ahead > 0 && Math.abs(ahead) > Math.abs(set - cur)) ahead = set - cur;   // where the value will be in a moment, never past the set value
        const dv = Math.max(-110, Math.min(110, (up ? -1 : 1) * ahead * k));
        if (Math.abs(dv) > 2) kids.push(sv('line', { x1: X(14), y1: MID, x2: X(14), y2: MID + dv, stroke: '#3ddc84', 'stroke-width': 5 }), sv('polygon', { points: `${X(14) - 7},${MID + dv - Math.sign(dv) * 1} ${X(14) + 7},${MID + dv - Math.sign(dv) * 1} ${X(14)},${MID + dv + Math.sign(dv) * 12}`, fill: '#3ddc84' }));
        kids.push(sv('line', { x1: X(6), y1: MID, x2: X(22), y2: MID, stroke: '#4c6a85', 'stroke-width': 2 }));
        kids.push(sv('rect', { x: band[0] - 4, y: MID - 19, width: band[1] - band[0] + 8, height: 38, fill: '#031018', stroke: '#64ffda', 'stroke-width': 3 }), sv('text', { x: (band[0] + band[1]) / 2, y: MID + 9, 'text-anchor': 'middle', fill: '#fff', 'font-size': 28, ...mono }, fmt(cur)));
        if (unit) kids.push(sv('text', { x: (band[0] + band[1]) / 2, y: 14, 'text-anchor': 'middle', fill: '#8fa6bd', 'font-size': 13, ...mono }, unit));
        g.replaceChildren(...kids);
      },
    };
  }
  views.hlm = (() => {
    const make = (compact) => {
      const m = el('div', { class: 'bd bd-helm' + (compact ? ' compact' : '') });
      const dial = createDial({ onInput: (h) => { sim.setHeading(h); sim.cancelCourse(); } });
      const spd = createTape({ mirror: false, up: true }), dep = createTape({ mirror: true, up: false });
      const rt = retro ? el('div', { class: 'rhelm' }) : null;   // retro: three text lines instead of the dial and tapes (the art is too small for them)
      if (rt) m.append(rt); else m.append(spd.svg, dial.root, dep.svg);
      let last = null, vs = 0, as = 0;   // smoothed rates of change: speed (kt/s) and depth (m/s)
      return { m, update() {
        const s = sim.s, now = Date.now();
        if (last && now - last.t > 50) { const dt = (now - last.t) / 1000; as = as * 0.8 + 0.2 * ((s.speed - last.speed) / dt); vs = vs * 0.8 + 0.2 * ((s.depth - last.depth) / dt); last = { t: now, speed: s.speed, depth: s.depth }; }
        else if (!last) last = { t: now, speed: s.speed, depth: s.depth };
        if (rt) { set(rt, `HDG ${pad(s.heading)} > ${pad(s.targetHeading)}\nSPD ${s.speed.toFixed(1)} > ${(s.throttle * sim.maxKt()).toFixed(1)}\nDEP ${Math.round(s.depth)} > ${Math.round(s.targetDepth)}`); return; }
        dial.update(s.heading, s.targetHeading);
        spd.update({ cur: s.speed, set: s.throttle * sim.maxKt(), rate: as, span: s.cruise ? 80 : 20, step: s.cruise ? 5 : 1, major: s.cruise ? 20 : 5, fmt: (v) => (Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1)), unit: 'KT' });
        dep.update({ cur: s.depth, set: s.targetDepth, rate: vs, ground: s.floor, span: 120, step: 10, major: 20, unit: 'M' });
      } };
    };
    // Controls. Every button does one thing; Dock is a spoken order now.
    const thr = (d) => sim.setThrottle(Math.round(Math.min(1, Math.max(0, sim.s.throttle + d)) * 20) / 20);
    const dep = (d) => sim.setDepth(Math.min(6000, Math.max(0, Math.round((sim.s.targetDepth + d) / 10) * 10)));
    const turn = (d) => { sim.setHeading(sim.s.targetHeading + d); sim.cancelCourse(); };   // steering by hand: the Route is kept, Plot on NAV returns to it
    const noeB = bbtn('NOE', () => {
      if (sim.s.hug) { sim.setHug(false); return tell('helm', `Leaving the floor, Captain. Holding ${Math.round(sim.s.depth)} metres.`); }
      const r = sim.setHug(true);
      tell('helm', r.ok ? 'Nap of the earth, Captain. Ten metres off the bottom.' : r.why === 'docked' ? 'We are docked, Captain.' : 'Not enough water here to follow the floor, Captain.');
    });
    const cruiseB = bbtn('Cruise', () => { const r = sim.setCruise(!sim.s.cruise); tell('helm', r.ok ? (sim.s.cruise ? 'Spooling up the drive, Captain.' : 'Out of super cruise. Easing back.') : cruiseWhy(r.why)); });
    // the bridge desk pads are one row each (bridge frame of 2026-11-27): steering on the centre pad, depth and cruise on the right pad
    const c = el('div', { class: 'bc' },
      el('div', { class: 'rowN' }, bbtn('Port', () => turn(-10)), bbtn('Stbd', () => turn(10)), bbtn('Stop', () => sim.stop(), 'stop'), bbtn('Slow', () => thr(-0.1)), bbtn('Fast', () => thr(0.1))));
    const v = [bbtn('Up', () => dep(-50)), bbtn('Dn', () => dep(50)), bbtn('Srfc', () => sim.setDepth(0)), noeB, cruiseB];
    return { make, c, v, expand: 'helm', side() { noeB.classList.toggle('on', !!sim.s.hug); cruiseB.classList.toggle('on', !!sim.s.cruise); } };
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
    return { make, c, v: [], expand: 'sys', side() {
      const s = sim.s, bad = s.battery < 15 || s.oxygen < 15 || s.hull < 40, warn = s.battery < 30 || s.oxygen < 30 || s.hull < 80;
      banner.className = 'sbanner ' + (bad ? 'bad' : warn ? 'warn' : 'ok'); set(banner, bad ? 'CRITICAL' : warn ? 'CAUTION' : 'NOMINAL');
      swL.classList.toggle('on', !!s.lights); swS.classList.toggle('on', !!s.sonar);
    } };
  })();

  // ---------- VIEW (outside camera) ----------
  views.vw = (() => {
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
    function side() {
      const s = sim.s, ok = synthOk();
      lightsB.classList.toggle('on', !!s.lights);
      modeB.textContent = !ok ? 'SYNTHETIC: RESEARCH NEEDED' : vopt.mode === 'synth' ? 'SHOW CAMERA' : 'SHOW SYNTHETIC'; modeB.disabled = !ok;
    }
    return { make, c, v: [], expand: null, side };
  })();

  // ---------- TAC: named on the left desk panel and not built yet (SNR is in sonarView.js) ----------
  const stub = (title) => ({ make: () => ({ m: el('div', { class: 'bd bd-stub' }, el('b', { text: title }), el('small', { text: 'NOT INSTALLED' })), update() {} }), c: el('div', { class: 'bc' }, el('div', { class: 'cap', text: 'NO CONTROLS' })), v: [], expand: null, side() {} });
  views.tac = stub('TACTICAL');
  views.snr = createSnrView({ bbtn });   // passive sonar: sonarView.js
  onSnrRange((r) => { views.nav.nds.forEach((n) => n.setRange(r)); views.nav.side(); });   // and the SNR range buttons move NAV too

  // ---------- build: one large and one compact copy of each ----------
  // Info Left and Info Right are always on, either side of the main screen.
  const ilVals = {}, il = el('div', { class: 'bm-info il' }), ir = el('div', { class: 'bm-info ir' }), viewWrap = el('div', { class: 'bm-view' });
  for (const [k, l] of [['spd', 'SPEED KT'], ['dep', 'DEPTH M'], ['flr', 'FLOOR M'], ['hdg', 'HEADING']]) { ilVals[k] = el('b'); il.append(el('div', { class: 'ilr' }, el('small', { text: l }), ilVals[k])); }
  const irBars = {}, irWrap = el('div', { class: 'ir-bars' });
  const prof = createProfile(el('div', { class: 'nav-prof' }), { w: 196, h: 250 }), profBox = prof.canvas.parentNode;   // Info Right shows this on the NAV page
  profBox.prepend(el('div', { class: 'np-title', text: 'VERTICAL PROFILE' }));
  for (const [k, l] of [['pres', 'PRESSURE'], ['temp', 'TEMP'], ['bat', 'ENERGY'], ['o2', 'O₂'], ['co2', 'CO₂'], ['hull', 'HULL']]) { const fill = el('i'), val = el('b'); irBars[k] = { fill, val }; irWrap.append(el('div', { class: 'bar' }, el('small', { text: l }), el('div', { class: 'track' }, fill), val)); }
  ir.append(irWrap, profBox);
  main.append(il, viewWrap, ir);
  const big = {}, small = {}, sel = el('div', { class: 'selector' }), btns = {};
  for (const id of order) {
    big[id] = views[id].make(false); small[id] = views[id].make(true);
    viewWrap.append(big[id].m); display.append(small[id].m); center.append(views[id].c);
    btns[id] = bbtn(labels[id], () => select(id)); sel.append(btns[id]);
  }
  views.nav.nds.forEach((n) => n.setRange(8)); setSnrRange(8);   // the master range starts at 8 nm on every page
  left.append(sel);
  // Right desk: the view settings of the page that is up. DSP is on every page (the main screen shows that page, or the nav map).
  // NAV also has PAN (arrows replace the controls) and SHW (switches replace the controls).
  const dspBs = [], panBs = [], shwBs = [];
  const mkBtn = (label, list, toggle) => { const b = bbtn(label, toggle); list.push(b); return b; };
  const flip = (which) => { if (which === 'dsp') dspOn = !dspOn; else if (which === 'pan') { panOn = !panOn; shwOn = false; if (!panOn) views.nav.panOff(); } else { shwOn = !shwOn; panOn = false; views.nav.panOff(); } paint(); update(); };
  const BANK = 6;   // the right desk is a bank of six slots in one row; a page with fewer buttons leaves blank place holders
  const blank = () => Object.assign(bbtn('', () => {}, 'blank'), { disabled: true, tabIndex: -1 });
  for (const id of order) {
    const items = [...views[id].v, mkBtn('DSP', dspBs, () => flip('dsp')), ...(id === 'nav' ? [mkBtn('PAN', panBs, () => flip('pan')), mkBtn('SHW', shwBs, () => flip('shw'))] : [])];
    while (items.length < BANK) items.push(blank());
    views[id].vc = el('div', { class: 'bc msc' }, el('div', { class: 'rowN' }, ...items.slice(0, BANK)));   // one row of six: the desk pads are wide and short
    right.append(views[id].vc);
  }
  // Pan arrows replace the controls on the centre desk while PAN is on
  const arrow = (t, dx, dy, label) => el('button', { class: 'bbtn sq', text: t, 'aria-label': label, onclick: () => { const k = views.nav.panStep(); views.nav.panBy(dx * k, dy * k); } });
  const panC = el('div', { class: 'bc pan' }, el('div', { class: 'rowN' }, arrow('◀', -1, 0, 'Pan west'), arrow('▲', 0, 1, 'Pan north'), arrow('▼', 0, -1, 'Pan south'), arrow('▶', 1, 0, 'Pan east')));
  center.append(panC, views.nav.extra);

  let current = 'nav', mainId = 'nav', dspOn = false, panOn = false, shwOn = false;
  function paint() {
    mainId = dspOn ? current : 'nav';
    const onNav = current === 'nav';
    for (const k of order) {
      small[k].m.hidden = k !== current; views[k].c.hidden = k !== current || (onNav && (panOn || shwOn)); views[k].vc.hidden = k !== current;
      big[k].m.hidden = k !== mainId; btns[k].classList.toggle('on', k === current);
    }
    panC.hidden = !(onNav && panOn); views.nav.extra.hidden = !(onNav && shwOn);
    dspBs.forEach((b) => b.classList.toggle('on', dspOn)); panBs.forEach((b) => b.classList.toggle('on', panOn)); shwBs.forEach((b) => b.classList.toggle('on', shwOn));
  }
  function select(id) {
    if (!views[id]) id = 'nav';
    current = id;
    try { localStorage.setItem(KEY, id); } catch (e) { /* ignore */ }
    paint(); update();
  }
  function update() {
    const s = sim.s;
    if (note && Date.now() - note.at > NOTE_HOLD) note = null;
    set(tPlace, note ? note.text : s.docked ? 'DOCKED' + (s.at ? ' · ' + s.at.name.toUpperCase() : '') : s.at ? s.at.name.toUpperCase() : s.wpt ? 'EN ROUTE: ' + s.wpt.name.toUpperCase() : 'OPEN WATER');
    const cls = 'bt-place' + (note ? ' note' : '') + (note && note.kind ? ' ' + note.kind : ''); if (tPlace.className !== cls) tPlace.className = cls;   // a notice wraps onto two lines and takes the whole panel
    set(tPos, `${deg(s.lat, 'N', 'S', 2)}  ${deg(s.lon, 'E', 'W', 3)}  ·  ${gameDateText()}`);
    big[mainId].update(); if (current !== mainId) small[current].update(); else small[current].update();
    views[current].side();
    const showProf = mainId === 'nav' && !retro; irWrap.hidden = showProf; profBox.hidden = !showProf;
    if (showProf) { prof.draw(s, views.nav.nds[0].range); profBox.dataset.warn = prof.warn; }
    set(ilVals.spd, s.speed.toFixed(1)); set(ilVals.dep, String(Math.round(s.depth))); set(ilVals.flr, s.floor == null ? '—' : String(Math.round(s.floor))); set(ilVals.hdg, pad(s.heading) + '°');
    const bar = (k, pct, text, bad) => { irBars[k].fill.style.width = Math.max(0, Math.min(100, pct)) + '%'; irBars[k].fill.className = bad ? 'bad' : ''; set(irBars[k].val, text); };
    bar('pres', (s.depth / 6000) * 100, Math.round(s.depth / 10 + 1) + ' bar', s.depth > 4800); bar('temp', (s.temp / 20) * 100, s.temp.toFixed(1) + '°C', false);
    bar('bat', s.battery, Math.round(s.battery) + '%', s.battery < 25); bar('o2', s.oxygen, Math.round(s.oxygen) + '%', s.oxygen < 30);
    bar('co2', (s.co2 / 5) * 100, s.co2.toFixed(2) + '%', s.co2 > 1); bar('hull', s.hull, Math.round(s.hull) + '%', s.hull < 50);
  }

  let saved = 'nav'; try { saved = localStorage.getItem(KEY) || 'nav'; } catch (e) { /* ignore */ }
  select(saved);
  return { select, update, get current() { return current; }, get main() { return mainId; }, nds: views.nav.nds };
}
