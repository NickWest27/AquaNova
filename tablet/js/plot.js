// "Plot a course" dialog. Three ways to name the destination:
//   Lat / Long, Place, or Place + bearing (+ distance). Used by the bridge console and the Navigation station.
import { sim, toward } from './sim.js';
import { seafloor } from './seafloor.js';
import { el, modal, pad, toast } from './util.js';
import { resolveTarget, DEFAULT_LEG_NM } from './plotmath.js';

let counter = 0;
const env = () => ({ ship: sim.s, pois: sim.s.pois, inside: seafloor.inside, floorAt: seafloor.depthAt });

/** preselect: a marker already picked on the map. onPlotted runs after the course is set. */
export function openPlotDialog({ preselect = null, onPlotted } = {}) {
  let mode = preselect ? 'place' : 'latlon';
  const lat = el('input', { type: 'text', id: 'pc-lat', placeholder: 'e.g. 39.45 or 39 27 N', autocomplete: 'off', autocapitalize: 'characters' });
  const lon = el('input', { type: 'text', id: 'pc-lon', placeholder: 'e.g. -72.25 or 72 15 W', autocomplete: 'off', autocapitalize: 'characters' });
  const place = el('select', { id: 'pc-place' }, el('option', { value: 'ship', text: 'Own ship' }), sim.s.pois.map((p) => el('option', { value: String(p.id), text: p.name })));
  place.value = preselect ? String(preselect.id) : 'ship';
  const brg = el('input', { type: 'text', id: 'pc-brg', inputmode: 'decimal', placeholder: 'optional, 0 to 360', autocomplete: 'off' });
  const dist = el('input', { type: 'text', id: 'pc-dist', inputmode: 'decimal', placeholder: `optional, default ${DEFAULT_LEG_NM} nm`, autocomplete: 'off' });
  const row = (label, node) => el('label', { class: 'pc-row' }, el('span', { text: label }), node);
  const msg = el('div', { class: 'pc-msg' });
  const llBox = el('div', { class: 'pc-box' }, row('Latitude', lat), row('Longitude', lon));
  const plBox = el('div', { class: 'pc-box' }, row('Place', place), row('Bearing °', brg), row('Distance nm', dist),
    el('p', { class: 'pc-hint', text: 'Place only: go to the place. Add a bearing: go to the point on that bearing from the place. Add a distance too: that far along the bearing.' }));
  const tabLL = el('button', { class: 'btn chip', text: 'Lat / Long', onclick: () => setMode('latlon') });
  const tabPl = el('button', { class: 'btn chip', text: 'Place / Bearing', onclick: () => setMode('place') });
  let close = () => {};
  const go = el('button', { class: 'btn primary grow', text: 'Plot course', onclick: () => {
    if (sim.s.docked) { msg.textContent = 'The ship is docked. Undock first, then plot the course.'; msg.className = 'pc-msg bad'; return; }
    const r = current(); if (!r.ok) { msg.textContent = r.error; msg.className = 'pc-msg bad'; return; }
    const wp = r.poi || { id: 'wpt', name: `Waypoint ${++counter}`, type: 'waypoint', text: 'Plotted position', lat: r.point.lat, lon: r.point.lon };
    sim.setWpt(wp); sim.setThrottle(0.5); close();
    toast(`Course plotted to ${wp.name}`);
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
  const body = el('div', { class: 'pc' }, el('div', { class: 'row' }, tabLL, tabPl), llBox, plBox, msg, el('div', { class: 'row' }, go, cancel));
  close = modal({ title: 'Plot a course', body, actions: [] });
  setMode(mode);
}
