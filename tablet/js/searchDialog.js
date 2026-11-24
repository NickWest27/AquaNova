// "Search pattern" dialog: one planner for the Aqua Nova, the WSKRs and the Tern.
//   1. Pick the craft. 2. Pick the datum (here, lat/long, or a place with a bearing). 3. Pick the pattern and its numbers.
// The pattern itself comes from searchPattern.js. The craft follow it their own way: the ship plots it as its Route,
// a WSKR follows it as its search order, and the Tern gets it by radio from Nicole.
import { tell } from './notify.js';
import { sim } from './sim.js';
import { seafloor } from './seafloor.js';
import { el, modal } from './util.js';
import { resolveTarget } from './plotmath.js';
import { shuttle } from './bayops.js';
import { orderTern } from './tern.js';
import { KINDS, DEFAULTS, normalize, build, project, lengthNm, describe } from './searchPattern.js';

const LABEL = { space: 'Track spacing nm', legs: 'Legs', radius: 'Radius nm', rounds: 'Rounds (1 to 3)', length: 'Length nm (along bearing)', width: 'Width nm (across bearing)' };
const env = () => ({ ship: sim.s, pois: sim.s.pois, inside: seafloor.inside, floorAt: seafloor.depthAt });

/** The craft a pattern can be given to now: [{ id, name }]. */
export function craftChoices() {
  const s = sim.s, live = s.wskrs.filter((w) => !w.dead), out = [{ id: 'ship', name: 'Aqua Nova' }];
  for (const w of live) out.push({ id: 'w' + w.n, name: `WSKR ${w.n}` });
  if (live.length > 1) out.push({ id: 'wall', name: 'All WSKRs' });
  const sh = shuttle(); if (sh && sh.state === 'out') out.push({ id: 'tern', name: 'The Tern' });
  return out;
}
/** Split one pattern among several WSKRs so they do not search the same water. Squares and sectors turn; tracks share the width. */
export function splitSpec(spec, datum, i, n) {
  const o = normalize(spec);
  if (n < 2) return { spec: o, datum };
  if (o.kind === 'square' || o.kind === 'sector') return { spec: { ...o, brg: (o.brg + (360 / n) * i) % 360 }, datum };
  const w = o.width / n, off = (i - (n - 1) / 2) * w;
  return { spec: { ...o, width: w }, datum: project(datum, o.brg + 90, off) };
}
/** Give a pattern to a craft. craft: 'ship' | 'w<n>' | 'wall' | 'tern'. Returns { ok, text }. */
export function assignPattern(craft, spec, datum) {
  const o = normalize(spec);
  if (craft === 'ship') {
    if (sim.s.docked) return { ok: false, text: 'The ship is docked. Undock first, then plot the search.' };
    const r = sim.plotSearch(o, datum);
    if (!r.ok) return { ok: false, text: r.why === 'blocked' ? 'No safe route round land to those points.' : 'Not enough open water in that pattern.' };
    return { ok: true, text: `Search plotted: ${describe(o)}. ${r.n} waypoints, ${r.nm.toFixed(1)} nm. ${sim.s.throttle > 0.01 ? 'Speed unchanged.' : 'We are not under way. Set a speed when you are ready.'}` };
  }
  if (craft === 'tern') { const r = orderTern({ kind: 'search', spec: o, datum }); return { ok: r.ok, text: r.text }; }
  const live = sim.s.wskrs.filter((w) => !w.dead), list = craft === 'wall' ? live : live.filter((w) => 'w' + w.n === craft);
  if (!list.length) return { ok: false, text: 'That WSKR is not out.' };
  list.forEach((w, i) => { const p = splitSpec(o, datum, i, list.length); sim.orderWskr(w.n, 'search', p); });
  return { ok: true, text: `${list.length > 1 ? 'All WSKRs' : `WSKR ${list[0].n}`} starting a search. ${describe(o)}.` };
}

/** craft: which craft is picked at first ('ship', 'w1', 'wall', 'tern'). */
export function openSearchDialog({ craft = 'ship', spec = null } = {}) {
  const choices = craftChoices(); let who = choices.some((c) => c.id === craft) ? craft : choices[0].id, kind = (spec && spec.kind) || 'square', dMode = 'here';
  const val = { ...DEFAULTS, ...(spec || {}) }, ins = {};
  const row = (label, node) => el('label', { class: 'pc-row' }, el('span', { text: label }), node);
  const num = (k, v) => (ins[k] = el('input', { type: 'text', inputmode: 'decimal', value: String(v), autocomplete: 'off' }));
  for (const k of ['space', 'legs', 'radius', 'rounds', 'length', 'width']) num(k, val[k]);
  num('brg', val.brg);
  const sideSel = el('select', {}, el('option', { value: 'right', text: 'Starboard (right)' }), el('option', { value: 'left', text: 'Port (left)' })); sideSel.value = val.side;
  const lat = el('input', { type: 'text', placeholder: 'e.g. 39.45 or 39 27 N', autocomplete: 'off', autocapitalize: 'characters' });
  const lon = el('input', { type: 'text', placeholder: 'e.g. -72.25 or 72 15 W', autocomplete: 'off', autocapitalize: 'characters' });
  const place = el('select', {}, el('option', { value: 'ship', text: 'Own ship' }), sim.s.pois.map((p) => el('option', { value: String(p.id), text: p.name })));
  const pBrg = el('input', { type: 'text', inputmode: 'decimal', placeholder: 'optional, 0 to 360', autocomplete: 'off' });
  const pDist = el('input', { type: 'text', inputmode: 'decimal', placeholder: 'optional, nm', autocomplete: 'off' });
  const msg = el('div', { class: 'pc-msg' });
  const whoRow = el('div', { class: 'row sp-chips' }), kindRow = el('div', { class: 'row sp-chips' }), dRow = el('div', { class: 'row sp-chips' });
  const hint = el('p', { class: 'pc-hint' }), fields = el('div', { class: 'pc-box' });
  const llBox = el('div', { class: 'pc-box' }, row('Latitude', lat), row('Longitude', lon));
  const plBox = el('div', { class: 'pc-box' }, row('Place', place), row('Bearing °', pBrg), row('Distance nm', pDist));
  const chip = (text, on, fn, id) => el('button', { class: 'btn chip' + (on ? ' on' : ''), text, 'data-id': id, onclick: fn });

  const hereOf = () => { if (who === 'tern') { const sh = shuttle(); return { lat: sh.lat, lon: sh.lon }; } if (who[0] === 'w' && who !== 'wall') { const w = sim.s.wskrs.find((q) => 'w' + q.n === who); if (w) return { lat: w.lat, lon: w.lon }; } return { lat: sim.s.lat, lon: sim.s.lon }; };
  const datum = () => {
    if (dMode === 'here') return { ok: true, point: hereOf() };
    return resolveTarget(dMode === 'latlon' ? { mode: 'latlon', lat: lat.value, lon: lon.value } : { mode: 'place', place: place.value, bearing: pBrg.value, distance: pDist.value }, env());
  };
  const specNow = () => ({ kind, brg: ins.brg.value, side: sideSel.value, ...Object.fromEntries(KINDS[kind].fields.map((k) => [k, ins[k].value])) });
  function preview() {
    const d = datum();
    if (!d.ok) { msg.textContent = d.error; msg.className = 'pc-msg bad'; return null; }
    const sp = normalize(specNow()), w = build(sp, d.point);
    if (w.length < 2) { msg.textContent = 'That pattern has no points.'; msg.className = 'pc-msg bad'; return null; }
    msg.textContent = `${describe(sp)}. ${w.length} waypoints, ${lengthNm(w, d.point).toFixed(1)} nm.`; msg.className = 'pc-msg ok';
    return { spec: sp, point: d.point };
  }
  function paint() {
    whoRow.replaceChildren(...choices.map((c) => chip(c.name, c.id === who, () => { who = c.id; paint(); }, c.id)));
    kindRow.replaceChildren(...Object.entries(KINDS).map(([k, v]) => chip(v.name, k === kind, () => { kind = k; paint(); }, k)));
    dRow.replaceChildren(chip('Here', dMode === 'here', () => { dMode = 'here'; paint(); }), chip('Lat / Long', dMode === 'latlon', () => { dMode = 'latlon'; paint(); }), chip('Place / Bearing', dMode === 'place', () => { dMode = 'place'; paint(); }));
    llBox.hidden = dMode !== 'latlon'; plBox.hidden = dMode !== 'place';
    hint.textContent = KINDS[kind].use;
    fields.replaceChildren(...KINDS[kind].fields.map((k) => row(LABEL[k], ins[k])), row(kind === 'square' || kind === 'sector' ? 'First leg °' : 'Bearing °', ins.brg), row('Turns', sideSel));
    preview();
  }
  for (const n of [...Object.values(ins), sideSel, lat, lon, place, pBrg, pDist]) { n.addEventListener('input', preview); n.addEventListener('change', preview); }
  let close = () => {};
  const go = el('button', { class: 'btn primary grow', text: 'Start search', onclick: () => {
    const p = preview(); if (!p) return;
    const r = assignPattern(who, p.spec, p.point);
    if (!r.ok) { msg.textContent = r.text; msg.className = 'pc-msg bad'; return; }
    close(); tell(who === 'ship' ? 'helm' : who === 'tern' ? 'comms' : 'sensors', r.text);
  } });
  const body = el('div', { class: 'pc sp' },
    el('div', { class: 'sp-scroll' }, el('div', { class: 'lbl', text: 'Craft' }), whoRow, el('div', { class: 'lbl', text: 'Pattern' }), kindRow, hint, fields, el('div', { class: 'lbl', text: 'Datum (the centre)' }), dRow, llBox, plBox),
    el('div', { class: 'sp-foot' }, msg, el('div', { class: 'row' }, go, el('button', { class: 'btn', text: 'Cancel', onclick: () => close() }))));
  close = modal({ title: 'Search pattern', body, actions: [] });
  paint();
}
