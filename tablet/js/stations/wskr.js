// WSKR page (the Sensors console's WSKRs tab), laid out like the show's WSKR STATUS screen:
//  left: a navigation chart with Aqua Nova track up (north turns with her heading); right: a tile for each of the four WSKRs.
//  Tap a tile (or a diamond on the chart) to select it: the chart centres on that WSKR (Aqua Nova still track up) and the right side
//  becomes one big tile with more detail and the craft's synthetic view. Tap the big tile again to deselect.
//  Along the bottom: commands. With nothing selected they act on every WSKR; with one selected they act on it.
import { tell } from '../notify.js';
import { sim, wskrMinutes, wskrName, wskrCraft, wskrDepthFor, WSKR_PERKS, WSKR_DEPTHS, WSKR_LINK_NM, WSKR_LOST_MIN, WSKR_LOW_PCT, toward, wskrBatteryHours } from '../sim.js';
import { selectedContact } from '../contacts.js';
import { launchWskr, launchText, rackBat, busy, MIN_LAUNCH_PCT } from '../bayops.js';
import { WSKR_CHARGE_H } from '../sim.js';
import { mountCraftView } from '../craftview.js';
import { mapZoom } from '../mapZoom.js';
import { createND } from '../nd.js';
import { GATES_ON } from '../unlocks.js';
import { research } from '../science.js';
import { el } from '../util.js';
import { openSearchDialog } from '../searchDialog.js';

export const ordersOk = () => !GATES_ON || research.has('wskr-orders');
const CODES = ['Sc', 'La', 'Dr', 'Sp'];
const hm = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${Math.round(m % 60)} min` : `${Math.max(0, Math.round(m))} min`);
const lat = (v) => `${Math.abs(v).toFixed(3)}°${v >= 0 ? 'N' : 'S'}`, lon = (v) => `${Math.abs(v).toFixed(3)}°${v >= 0 ? 'E' : 'W'}`;
const SAY = { escort: 'Holding formation', manual: 'Manual control', search: 'Search pattern', relay: 'Relay', recall: 'Returning to the bay', task: 'Investigating a contact', trail: 'Investigating a sonar contact' };
const RANGES = [1, 2, 4, 8, 16];

export function mountWskrPanel(body) {
  body.style.flexDirection = 'column';
  let sel = null, sig = '', drawKey = '', drawAt = 0, range = 4;
  const out = (n) => sim.s.wskrs.find((q) => q.n === n);
  const cur = () => (sel ? out(sel) : null);
  const mapBox = el('div', { class: 'wk-map' }), side = el('div', { class: 'wk-side' }), cmds = el('div', { class: 'wk-cmds' });
  body.append(el('div', { class: 'wk' }, mapBox, side, cmds));
  const nd = createND(mapBox, { trackUp: true, contours: true, rings: false, bigWskr: true, focus: () => cur(), onWskr: (q) => toggle(q.n) });
  nd.range = range;
  const zoom = (d) => { const i = RANGES.indexOf(range); range = RANGES[Math.max(0, Math.min(RANGES.length - 1, i + d))]; nd.setRange(range); drawKey = ''; update(); };
  const zc = mapZoom(zoom), rangeLbl = zc.label; mapBox.append(zc.box);
  const viewBox = el('div', { class: 'wk-view' });
  const cv = mountCraftView(viewBox, { only: 'synth', title: () => { const w = cur(); return w ? wskrName(w) : 'WSKR'; }, range: 2, readouts: () => { const c = selectedContact(); return { ship: sim.s, target: c && { name: c.label, lat: c.lat, lon: c.lon } }; }, getCraft: () => { const w = cur(); return w ? wskrCraft(w) : null; } });
  const say = (t) => tell('sensors', t);
  const toggle = (n) => { sel = sel === n ? null : n; sig = ''; drawKey = ''; update(); };
  const act = (text, on, fn, disabled) => el('button', { class: 'btn chip' + (on ? ' on' : ''), text, disabled: !!disabled, onclick: () => { fn(); sig = ''; update(); } });
  const hold = (label, fn) => {
    const b = el('button', { class: 'btn chip', text: label, 'aria-label': label });
    const down = (e) => { e.preventDefault(); fn(true); b.classList.add('on'); }, up = () => { fn(false); b.classList.remove('on'); };
    b.addEventListener('pointerdown', down); ['pointerup', 'pointercancel', 'pointerleave'].forEach((n) => b.addEventListener(n, up));
    return b;
  };
  const dia = (n, dead) => el('span', { class: 'wk-dia' + (dead ? ' dead' : '') }, el('i'), el('b', { text: CODES[n - 1] || 'W' + n }));
  const linkText = (w) => { const l = sim.wskrLink(w); return l.raw ? `Link up (${l.nm.toFixed(1)} of ${l.max} nm)` : l.surfaced ? `Surfaced: surface link (${l.nm.toFixed(1)} nm out)` : w.lostAt != null ? `Out of link range (${l.nm.toFixed(1)} of ${l.max} nm). Surfaces in ${Math.max(1, Math.ceil((WSKR_LOST_MIN * 60 - (sim.s.clock - w.lostAt)) / 60))} min` : `Out of link range (${l.nm.toFixed(1)} of ${l.max} nm)`; };
  const orderText = (w) => { const poi = w.target != null ? sim.s.pois.find((p) => p.id === w.target) : null; return w.dead ? 'ADRIFT: no power' : w.arrived ? 'Alongside, waiting to be taken aboard' : w.mode === 'task' ? `Investigating ${poi ? poi.name : 'a contact'}` : SAY[w.mode] || w.mode; };
  const bayText = (n) => { const b = rackBat(n); return b >= 99.5 ? 'In the bay, fully charged' : `In the bay, charging ${Math.round(b)}%, full in ${hm(((100 - b) / 100) * WSKR_CHARGE_H * 60)}`; };

  // ---- the right side: tiles, or one big tile ----
  const tile = (n) => {
    const q = out(n), t = el('button', { class: 'wk-tile' + (n === sel ? ' sel' : ''), 'data-n': n, onclick: () => toggle(n) });
    t.append(dia(n, q && q.dead), el('div', { class: 'wk-tx' }, el('b', { class: 'wk-h' }), el('span', { class: 'wk-l1' }), el('span', { class: 'wk-l2' }), el('span', { class: 'wk-l3' }), el('span', { class: 'wk-l4' })));
    return t;
  };
  const fillTile = (t, n) => {
    const q = out(n), set = (c, v, cls = '') => { const e = t.querySelector('.' + c); e.textContent = v; e.className = c + ' ' + cls; };
    set('wk-h', `WSKR #${n}: ${wskrName(q || { n }).toUpperCase()}`);
    if (!q) { set('wk-l1', bayText(n)); set('wk-l2', WSKR_PERKS[n].text); set('wk-l3', ''); set('wk-l4', ''); return; }
    const m = wskrMinutes(q), bat = Math.round(q.bat == null ? 100 : q.bat);
    set('wk-l1', `PSN: ${lat(q.lat)}  ${lon(q.lon)}`); set('wk-l2', orderText(q));
    set('wk-l3', `BAT ${bat}% · ${hm(m.empty)} left`, bat <= WSKR_LOW_PCT ? 'bad' : ''); set('wk-l4', linkText(q), sim.wskrLink(q).raw ? '' : 'warn');
  };
  const big = () => {
    const n = sel, q = out(n), t = el('button', { class: 'wk-big', onclick: () => toggle(n) });
    t.append(el('div', { class: 'wk-bh' }, dia(n, q && q.dead), el('div', {}, el('b', { class: 'wk-h', text: `WSKR #${n}: ${wskrName(q || { n }).toUpperCase()}` }), el('span', { class: 'wk-perk', text: WSKR_PERKS[n].text }))),
      q ? viewBox : el('div', { class: 'wk-bay', text: bayText(n) }), el('div', { class: 'wk-grid' }), el('div', { class: 'wk-note' }));
    return t;
  };
  const fillBig = (t) => {
    const q = out(sel); if (!q) return;
    const m = wskrMinutes(q), c = wskrCraft(q), tw = toward(sim.s, q), bat = Math.round(q.bat == null ? 100 : q.bat), l = sim.wskrLink(q);
    const rows = [['PSN LAT', lat(q.lat)], ['PSN LNG', lon(q.lon)], ['FROM AQUA NOVA', `BRG ${String(Math.round(tw.brg) % 360).padStart(3, '0')}° · ${tw.nm.toFixed(1)} nm`], ['ORDER', orderText(q)],
      ['DEPTH', `${Math.round(c.depth)} m`], ['SPEED', `${c.kt.toFixed(1)} kt${q.super ? ' (super cruise)' : q.kt > (WSKR_PERKS[q.n].kt || 16) ? ' (boost)' : ''}`], ['HEADING', `${String(Math.round(c.heading)).padStart(3, '0')}°`], ['LINK', linkText(q)],
      ['BATTERY', `${bat}% · ${hm(m.empty)} left`], ['RECALLS ITSELF', `in about ${hm(m.recall)} (at ${WSKR_LOW_PCT}%)`], ['CELL LIFE', `${wskrBatteryHours()} h at base speed`]];
    t.querySelector('.wk-grid').replaceChildren(...rows.flatMap(([k, v]) => [el('span', { class: 'k', text: k }), el('span', { class: 'v' + (k === 'BATTERY' && bat <= WSKR_LOW_PCT ? ' bad' : k === 'LINK' && !l.raw ? ' warn' : ''), text: v })]));
    const poi = q.target != null ? sim.s.pois.find((p) => p.id === q.target) : null;
    t.querySelector('.wk-note').textContent = !l.raw && q.mode !== 'manual' ? `Beyond the ${l.max} nm control link. It keeps to its order. ${l.surfaced ? 'It has surfaced and is talking over the surface link.' : `After ${WSKR_LOST_MIN} minutes without a link it surfaces to get comms back.`}`
      : q.mode === 'manual' ? `Manual: hold the turn buttons below. ${q.limited ? 'At the link limit: bring a relay out or turn back. ' : ''}${q.blockedNow ? 'Shallows ahead. ' : ''}Link reaches ${WSKR_LINK_NM} nm from the ship or a relay.`
      : q.mode === 'relay' ? (sim.relayUp() ? 'Relay up: comms and GPS work at any depth.' : 'Moving up to the surface to relay.') : q.mode === 'task' && poi ? `Going to investigate ${poi.name}.` : '';
  };

  // ---- commands along the bottom: all WSKRs, or the selected one ----
  const buildCmds = () => {
    const s = sim.s, ok = ordersOk(), w = cur(), c = selectedContact();
    const label = el('span', { class: 'wk-for', text: sel ? `WSKR #${sel} ${wskrName(w || { n: sel }).toUpperCase()}` : 'ALL WSKRS' });
    let list;
    if (!sel) {
      const live = s.wskrs.filter((q) => !q.dead);
      list = [act('Deploy WSKR', false, () => say(launchText(launchWskr())), s.docked || s.wskrs.length >= 4 || busy()),
        act('Recall all', false, () => { sim.recallWskrs(); say('WSKRs recalled'); }, !s.wskrs.length),
        act(live.length && live.every((q) => q.mode === 'escort') ? 'In formation' : 'Rejoin formation', live.length > 0 && live.every((q) => q.mode === 'escort'), () => { live.forEach((q) => sim.orderWskr(q.n, 'escort')); say('All WSKRs rejoining formation'); }, !ok || !live.length || live.every((q) => q.mode === 'escort')),
        act('Search…', false, () => openSearchDialog({ craft: 'wall' }), !ok || !live.length),
        act('Set up a relay', false, () => { const r = sim.setupRelay(); say(r.ok ? `${wskrName(r.wskr)} going up as a relay` : r.why === 'already' ? 'A relay is already up' : r.why === 'none' ? 'No WSKRs are out' : 'Every WSKR is busy'); }, !ok || !s.wskrs.length),
        act(s.wskrAuto === false ? 'Auto-intercept: off' : 'Auto-intercept: on', s.wskrAuto !== false, () => { sim.setWskrAuto(s.wskrAuto === false); say(sim.s.wskrAuto ? 'Screen will intercept unidentified contacts' : 'Auto-intercept off'); }, !ok),
        el('span', { class: 'wk-sep', text: 'Screen' }), act('Wide', s.wskrForm !== 'tight', () => { sim.setWskrForm('loose'); say('Formation loose'); }, !ok), act('Narrow', s.wskrForm === 'tight', () => { sim.setWskrForm('tight'); say('Formation tight'); }, !ok),
        el('span', { class: 'wk-sep', text: 'Depth' }), ...Object.entries(WSKR_DEPTHS).map(([k, t]) => act(t, s.wskrDepth === k, () => { sim.setWskrDepth(k); say(`WSKR depth: ${t.toLowerCase()}`); }, !ok))];
    } else if (!w) {
      const b = rackBat(sel);
      list = [act('Launch', false, () => say(launchText(launchWskr(sel))), s.docked || s.wskrs.length >= 4 || busy() || b < MIN_LAUNCH_PCT)];
    } else {
      const poi = c && c.poi && c.poi.type !== 'dock' ? c.poi : null, off = !ok || w.dead || w.arrived;
      list = [act(w.mode === 'escort' ? 'In formation' : 'Rejoin formation', w.mode === 'escort', () => { sim.orderWskr(w.n, 'escort'); say(`${wskrName(w)} rejoining formation`); }, off || w.mode === 'escort'),
        act('Manual control', w.mode === 'manual', () => { sim.orderWskr(w.n, 'manual'); say(`${wskrName(w)} is yours, Captain`); }, off),
        act('Search…', w.mode === 'search', () => openSearchDialog({ craft: 'w' + w.n }), off),
        act('Relay', w.mode === 'relay', () => { sim.orderWskr(w.n, 'relay'); say(`${wskrName(w)} going up as a relay`); }, off),
        act(poi ? `Investigate ${c.label}` : 'Investigate (select a contact)', w.mode === 'task' && poi && w.target === poi.id, () => { sim.taskWskr(poi, w.n); say(`${wskrName(w)} sent to ${poi.name}`); }, off || !poi),
        act('Recall', w.mode === 'recall', () => { sim.recallWskr(w.n); say(`${wskrName(w)} recalled`); }, w.dead || w.arrived)];
      if (w.mode === 'manual') list.push(el('span', { class: 'wk-sep', text: 'Helm' }), hold('Turn left', (d) => sim.wskrHelm(w.n, { turn: d ? -1 : 0 })), hold('Turn right', (d) => sim.wskrHelm(w.n, { turn: d ? 1 : 0 })),
        el('button', { class: 'btn chip', text: 'Slower', onclick: () => sim.wskrHelm(w.n, { thr: (cur().thr || 0) - 0.25 }) }), el('button', { class: 'btn chip', text: 'Faster', onclick: () => sim.wskrHelm(w.n, { thr: (cur().thr || 0) + 0.25 }) }),
        el('button', { class: 'btn chip', text: 'Stop', onclick: () => sim.wskrHelm(w.n, { thr: 0 }) }), act('Super cruise', !!w.cruise, () => { w.cruise = !w.cruise; say(`${wskrName(w)} super cruise ${w.cruise ? 'on' : 'off'}`); }));
    }
    cmds.replaceChildren(label, ...list);
  };

  function update() {
    const s = sim.s, c = selectedContact();
    const next = JSON.stringify([sel, ordersOk(), s.wskrForm, s.wskrDepth, s.docked, busy(), s.wskrs.map((q) => [q.n, q.mode, q.target, !!q.dead, !!q.arrived]), c && c.id, Math.round(rackBat(sel || 1) / 20)]);
    if (next !== sig) {
      sig = next;
      const w = cur(), outCount = s.wskrs.length;
      const head = el('div', { class: 'wk-title' }, el('b', { text: 'WSKR STATUS' }), el('span', { text: `${outCount} of 4 out` }), el('span', { class: sim.hasGps() ? 'ok' : 'bad', text: sim.hasGps() ? 'GPS fix' : 'No GPS fix (dead reckoning)' }));
      if (sel) { side.replaceChildren(head, big()); } else { side.replaceChildren(head, ...[1, 2, 3, 4].map(tile)); }
      buildCmds();
    }
    if (sel) { const t = side.querySelector('.wk-big'); if (t) fillBig(t); } else for (const t of side.querySelectorAll('.wk-tile')) fillTile(t, +t.dataset.n);
    if (sel && cur()) cv.update();
    const w = cur(), key = [sel, w ? w.lat.toFixed(4) + w.lon.toFixed(4) : '', s.lat.toFixed(4), s.lon.toFixed(4), Math.round(s.heading), range, s.wskrs.map((q) => q.lat.toFixed(3) + q.lon.toFixed(3)).join()].join('|'), now = Date.now();
    nd.selWskr = sel; rangeLbl.textContent = `${range} nm`;
    if (key !== drawKey || now - drawAt > 1500) { drawKey = key; drawAt = now; nd.draw(); }
  }
  update();
  return { update, destroy() { cv.destroy(); nd.destroy(); } };
}

// The WSKR page is part of the Sensors console; this keeps the old scene name working.
export function mount(body) { return mountWskrPanel(body); }
