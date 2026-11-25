// The craft page: profile on the left, synthetic forward view in the middle, contour map on the right.
// Shared by Remora and the WSKRs. getCraft() returns { lat, lon, heading, depth, kt }.
import { sim, toward } from './sim.js';
import { createProfile } from './profile.js';
import { createSynth } from './synth.js';
import { createND } from './nd.js';
import { el } from './util.js';
import { seafloor } from './seafloor.js';
import { mapZoom } from './mapZoom.js';
import { readout } from './readout.js';

const RANGES = [0.25, 0.5, 1, 2, 4];

export function mountCraftView(parent, { getCraft, title, range = 0.5, readouts, only = null }) {
  let rng = range, last = 0, sig = '';
  const prof = el('div', { class: 'cv-prof' }), synth = el('div', { class: 'cv-synth' }), map = el('div', { class: 'cv-map' });
  const row = el('div', { class: 'cv-row' }, ...(only === 'synth' ? [synth] : [prof, synth, map]));
  // corner readouts over the synthetic view (the standard readout, readout.js): bottom left Aqua Nova, bottom right the target
  const roL = readout('l'), roR = readout('r tgt');
  if (readouts) synth.append(roL.box, roR.box);
  const fillRo = (r, c, label, p) => {   // p: { lat, lon, depth, kt } or nothing
    if (!p) { r.set(null, label); return; }
    const t = toward(c, p); r.set({ brg: t.brg, rel: t.brg - c.heading, nm: t.nm, depth: p.depth, kt: p.kt }, label);
  };
  const step = (d) => { const i = RANGES.indexOf(rng); rng = RANGES[Math.max(0, Math.min(RANGES.length - 1, i + d))]; nd.setRange(rng); sig = ''; draw(); };
  const zc = mapZoom(step), rangeLbl = zc.label;   // on the contour map; it sets the profile range too
  parent.append(row); if (!only) map.append(zc.box);
  const none = { draw() {}, setRange() {}, destroy() {} };
  const pr = only ? none : createProfile(prof), sy = createSynth(synth), nd = only ? none : createND(map, { stage: false, units: 1, contours: true, rings: false, craft: getCraft });
  nd.range = rng;
  function draw() {
    const c = getCraft(); if (!c) return;
    if (readouts) { const o = readouts() || {}; fillRo(roL, c, 'AQUA NOVA', o.ship && { lat: o.ship.lat, lon: o.ship.lon, depth: o.ship.depth, kt: o.ship.speed }); fillRo(roR, c, o.target ? o.target.name.toUpperCase() : 'TARGET', o.target); }
    const key = [typeof title === 'function' ? title() : title, c.lat.toFixed(4), c.lon.toFixed(4), Math.round(c.heading), Math.round(c.depth), rng].join();
    const now = Date.now(); if (key === sig && now - last < 1000) return; sig = key; last = now;
    pr.draw({ ...c, sonar: true }, rng);
    sy.draw({ ...c, speed: c.kt || 0 });   // a window: fixed field of view and distance (the range buttons set the profile and map)
    nd.draw(); rangeLbl.textContent = `${rng} nm`;
  }
  draw();
  return { update: draw, destroy() { nd.destroy(); } };
}
