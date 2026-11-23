// "Plot a course" dialog. Three ways to name the destination:
//   Lat / Long, Place, or Place + bearing (+ distance). Used by the Navigation station (one destination, plotted at once) and by the
//   bridge NAV page (onFix: the dialog only makes a fix, with an optional name and depth, and the page adds it to the Route).
import { tell } from './notify.js';
import { sim, toward } from './sim.js';
import { seafloor } from './seafloor.js';
import { el, modal, pad, toast } from './util.js';
import { resolveTarget, DEFAULT_LEG_NM } from './plotmath.js';

const env = () => ({ ship: sim.s, pois: sim.s.pois, inside: seafloor.inside, floorAt: seafloor.depthAt });

/** preselect: a marker already picked on the map. onPlotted runs after the course is set.
 *  onFix(fix): make a fix instead of plotting. title and action name the dialog and its button; initial is a waypoint being edited. */
export function openPlotDialog({ preselect = null, onPlotted, onFix = null, title = 'Plot a course', action = 'Plot course', initial = null } = {}) {
  let mode = preselect ? 'place' : 'latlon';
  const lat = el('input', { type: 'text', id: 'pc-lat', placeholder: 'e.g. 39.45 or 39 27 N', autocomplete: 'off', autocapitalize: 'characters' });
  const lon = el('input', { type: 'text', id: 'pc-lon', placeholder: 'e.g. -72.25 or 72 15 W', autocomplete: 'off', autocapitalize: 'characters' });
  const place = el('select', { id: 'pc-place' }, el('option', { value: 'ship', text: 'Own ship' }), sim.s.pois.map((p) => el('option', { value: String(p.id), text: p.name })));
  place.value = preselect ? String(preselect.id) : 'ship';
  const brg = el('input', { type: 'text', id: 'pc-brg', inputmode: 'decimal', placeholder: 'optional, 0 to 360', autocomplete: 'off' });
  const dist = el('input', { type: 'text', id: 'pc-dist', inputmode: 'decimal', placeholder: `optional, default ${DEFAULT_LEG_NM} nm`, autocomplete: 'off' });
  const fixName = el('input', { type: 'text', id: 'pc-name', placeholder: 'optional, e.g. Rendezvous', autocomplete: 'off' });
  const fixDepth = el('input', { type: 'text', id: 'pc-depth', inputmode: 'decimal', placeholder: 'optional, metres', autocomplete: 'off' });
  if (initial) { lat.value = String(+initial.lat.toFixed(4)); lon.value = String(+initial.lon.toFixed(4)); fixName.value = initial.name; if (initial.depth != null) fixDepth.value = String(initial.depth); }
  const row = (label, node) => el('label', { class: 'pc-row' }, el('span', { text: label }), node);
  const msg = el('div', { class: 'pc-msg' });
  const llBox = el('div', { class: 'pc-box' }, row('Latitude', lat), row('Longitude', lon));
  const plBox = el('div', { class: 'pc-box' }, row('Place', place), row('Bearing °', brg), row('Distance nm', dist),
    el('p', { class: 'pc-hint', text: 'Place only: go to the place. Add a bearing: go to the point on that bearing from the place. Add a distance too: that far along the bearing.' }));
  const tabLL = el('button', { class: 'btn chip', text: 'Lat / Long', onclick: () => setMode('latlon') });
  const tabPl = el('button', { class: 'btn chip', text: 'Place / Bearing', onclick: () => setMode('place') });
  let close = () => {};
  const fail = (text) => { msg.textContent = text; msg.className = 'pc-msg bad'; };
  // A fix for the Route: the place itself when nothing is added to it, otherwise a waypoint.
  function makeFix(r) {
    const poi = r.poi && r.poi !== sim.s ? r.poi : null;
    const depth = fixDepth.value.trim() === '' ? null : Number(fixDepth.value), name = fixName.value.trim();
    if (depth !== null && !(depth >= 0)) return { error: 'Depth must be a number of metres, 0 or more.' };
    if (initial) return { fix: { ...initial, lat: r.point.lat, lon: r.point.lon, depth, name: name || initial.name } };
    if (poi && !name && depth === null) return { fix: poi };
    return { fix: sim.newFix({ lat: r.point.lat, lon: r.point.lon, depth, name: name || (poi ? poi.name : '') }) };
  }
  const go = el('button', { class: 'btn primary grow', text: action, onclick: () => {
    const r = current(); if (!r.ok) return fail(r.error);
    if (onFix) { const f = makeFix(r); if (f.error) return fail(f.error); close(); onFix(f.fix); return; }
    if (sim.s.docked) return fail('The ship is docked. Undock first, then plot the course.');
    const wp = (r.poi !== sim.s && r.poi) || sim.newFix({ lat: r.point.lat, lon: r.point.lon });
    const route = sim.routeTo(wp);
    if (route === null) return fail('No safe route there: land or shallows block every way round.');
    sim.setWpt(wp); close();   // plotting a course steers only; speed stays as the Helm has it
    const legs = route.length ? `, round land in ${route.length} leg${route.length === 1 ? '' : 's'}` : '';
    tell('helm', `Course plotted to ${wp.name}${legs}. ${sim.s.throttle > 0.01 ? 'Speed unchanged.' : 'We are not under way. Set a speed when you are ready.'}`);
    onPlotted && onPlotted(wp);
  } });
  const cancel = el('button', { class: 'btn', text: 'Cancel', onclick: () => close() });
  const input = () => (mode === 'latlon' ? { mode, lat: lat.value, lon: lon.value } : { mode, place: place.value, bearing: brg.value, distance: dist.value });
  const current = () => resolveTarget(input(), env());
  function preview() {
    const empty = mode === 'latlon' ? !lat.value.trim() && !lon.value.trim() : false;
    const r = current();
    if (empty) { msg.textContent = ''; msg.className = 'pc-msg'; return; }
    if (r.ok) { const t = toward(sim.s, r.point); msg.textContent = `From the ship: bearing ${pad(t.brg)}°, ${t.nm.toFixed(1)} nm`; msg.className = 'pc-msg ok'; }
    else { msg.textContent = r.error; msg.className = 'pc-msg bad'; }
  }
  function setMode(m) { mode = m; llBox.hidden = m !== 'latlon'; plBox.hidden = m !== 'place'; tabLL.classList.toggle('on', m === 'latlon'); tabPl.classList.toggle('on', m === 'place'); preview(); }
  for (const n of [lat, lon, brg, dist, place]) { n.addEventListener('input', preview); n.addEventListener('change', preview); }
  const fixBox = onFix ? el('div', { class: 'pc-box' }, row('Name', fixName), row('Depth m', fixDepth)) : null;
  const body = el('div', { class: 'pc' }, el('div', { class: 'row' }, tabLL, tabPl), llBox, plBox, ...(fixBox ? [fixBox] : []), msg, el('div', { class: 'row' }, go, cancel));
  close = modal({ title, body, actions: [] });
  setMode(mode);
}
