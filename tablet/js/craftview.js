// The craft page: profile on the left, synthetic forward view in the middle, contour map on the right.
// Shared by Remora and the WSKRs. getCraft() returns { lat, lon, heading, depth, kt }.
import { sim } from './sim.js';
import { createProfile } from './profile.js';
import { createSynth } from './synth.js';
import { createND } from './nd.js';
import { el } from './util.js';

const RANGES = [0.25, 0.5, 1, 2, 4];

export function mountCraftView(parent, { getCraft, title, range = 0.5 }) {
  let rng = range, last = 0, sig = '';
  const prof = el('div', { class: 'cv-prof' }), synth = el('div', { class: 'cv-synth' }), map = el('div', { class: 'cv-map' });
  const row = el('div', { class: 'cv-row' }, prof, synth, map);
  const rangeLbl = el('span', { class: 'cv-range' });
  const step = (d) => { const i = RANGES.indexOf(rng); rng = RANGES[Math.max(0, Math.min(RANGES.length - 1, i + d))]; nd.setRange(rng); sig = ''; draw(); };
  const bar = el('div', { class: 'row' }, el('button', { class: 'btn chip', text: 'Range −', onclick: () => step(-1) }), el('button', { class: 'btn chip', text: 'Range +', onclick: () => step(1) }), rangeLbl);
  parent.append(row, bar);
  const pr = createProfile(prof), sy = createSynth(synth), nd = createND(map, { stage: false, units: 1, contours: true, rings: false, craft: getCraft });
  nd.range = rng;
  function draw() {
    const c = getCraft(); if (!c) return;
    const key = [typeof title === 'function' ? title() : title, c.lat.toFixed(4), c.lon.toFixed(4), Math.round(c.heading), Math.round(c.depth), rng].join();
    const now = Date.now(); if (key === sig && now - last < 1000) return; sig = key; last = now;
    pr.draw({ ...c, sonar: true }, rng);
    sy.draw(c, { rangeNm: rng, title: typeof title === 'function' ? title() : title, readout: [`DEPTH ${Math.round(c.depth)}`, `SPEED ${(c.kt || 0).toFixed(1)}`, `HDG ${String(Math.round(c.heading)).padStart(3, '0')}`] });
    nd.draw(); rangeLbl.textContent = `Range ${rng} nm`;
  }
  draw();
  return { update: draw, destroy() { nd.destroy(); } };
}
