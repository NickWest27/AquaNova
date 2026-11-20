// Science model: samples, lab analysis and research. Saved under mission.science.
// A sample comes from the Science ROV. The lab analyses it over game time and files a finding.
// Findings give research points. Research topics unlock new abilities (other modules ask research.has(id)).
import { sim } from './sim.js';
import { gameState } from './persist.js';

export const SAMPLE_KINDS = {
  water: { label: 'Water', lab: 'spectral' },
  sediment: { label: 'Sediment', lab: 'material' },
  rock: { label: 'Rock core', lab: 'material' },
  bio: { label: 'Biological', lab: 'gene' },
  magnetic: { label: 'Magnetic reading', lab: 'spectral' },
};
export const LABS = {
  material: { name: 'Material Analysis', secs: 1200 },
  spectral: { name: 'Spectral Analysis', secs: 900 },
  gene: { name: 'Gene Sequencing', secs: 1800 },
};
/** Which samples each site type can give. The ROV tool decides the pick. */
const BY_SITE = {
  reef: ['bio', 'water', 'sediment'], trench: ['rock', 'sediment', 'water'], wreck: ['sediment', 'rock', 'magnetic'],
  site: ['rock', 'sediment', 'water'], open_water: ['water'],
};
export const TOOLS = {
  collector: { name: 'Sample collector', secs: 300, needsFloor: true, pick: ['bio', 'water', 'sediment'] },
  drill: { name: 'Core drill', secs: 900, needsFloor: true, pick: ['rock'] },
  laser: { name: 'Laser sampler', secs: 240, needsFloor: false, pick: ['rock', 'sediment'] },
  spectrometer: { name: 'Spectrometer', secs: 180, needsFloor: false, pick: ['water'] },
  magnetometer: { name: 'Magnetometer', secs: 180, needsFloor: false, pick: ['magnetic'] },
};
export const TOPICS = [
  { id: 'rov-range', name: 'Longer tether', cost: 2, text: 'A better tether lets the Science ROV work 1.5 nm from the ship.' },
  { id: 'sonar-sweep', name: 'Deep sonar sweep', cost: 3, text: 'Lets the full sweep chart further. (Effect comes later.)' },
  { id: 'wskr-orders', name: 'WSKR formations and orders', cost: 4, text: 'Unlocks WSKR orders on the WSKR page: manual control, search pattern, relay, tight or loose formation, and shallow or deep running.' },
  { id: 'wskr-battery-12', name: 'WSKR long-life cells', cost: 3, text: 'WSKR battery life goes from 6 hours to 12 hours.' },
  { id: 'wskr-battery-24', name: 'WSKR deep-cycle cells', cost: 5, requires: 'wskr-battery-12', text: 'WSKR battery life goes from 12 hours to 24 hours. Needs the long-life cells first.' },
  { id: 'synthetic-view', name: 'Synthetic forward view', cost: 5, text: 'Builds a forward view on the bridge VIEW screen from charted sea floor, with known and interpolated contour lines.' },
];

const root = () => ({ samples: [], jobs: [], done: [], points: 0, seq: 0, stats: {}, bonus: {}, ...(gameState.getProperty('mission.science') || {}) });
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
/** Counters that missions watch, e.g. mission.science.stats.water_mystic_reef. */
export function bumpStat(key) { const r = root(); save({ ...r, stats: { ...r.stats, [key]: (r.stats[key] || 0) + 1 } }); }
const save = (v) => gameState.updateProperty('mission.science', v);
export const samples = () => root().samples;
export const jobs = () => root().jobs;
export const points = () => root().points;
export const research = { has: (id) => root().done.includes(id), done: () => root().done };
sim.batteryHours = () => (research.has('wskr-battery-24') ? 24 : research.has('wskr-battery-12') ? 12 : 6);   // WSKR battery life

/** Add a raw sample. Returns it. */
export function addSample(kind, site, tool) {
  const r = root(), id = r.seq + 1;
  const sm = { id, kind, site: site ? site.name : 'Open water', tool, at: sim.s.clock, status: 'raw' };
  const k = `${kind}_${slug(sm.site)}`;
  save({ ...r, seq: id, samples: [...r.samples, sm], stats: { ...r.stats, samples: (r.stats.samples || 0) + 1, [k]: (r.stats[k] || 0) + 1 } });
  return sm;
}
/** Pick a sample kind for a tool at a site. */
export function pickKind(toolId, site) {
  const tool = TOOLS[toolId], ok = BY_SITE[site ? site.type : 'open_water'] || BY_SITE.open_water;
  const m = tool.pick.filter((k) => ok.includes(k));
  if (!m.length) return null;
  return m[(site ? site.id : 0) % m.length];
}
export function startAnalysis(sampleId) {
  const r = root(), sm = r.samples.find((q) => q.id === sampleId);
  if (!sm || sm.status !== 'raw') return false;
  const lab = LABS[SAMPLE_KINDS[sm.kind].lab];
  if (r.jobs.some((j) => j.lab === SAMPLE_KINDS[sm.kind].lab)) return false;   // each instrument runs one job
  save({ ...r, samples: r.samples.map((q) => q.id === sampleId ? { ...q, status: 'running' } : q),
    jobs: [...r.jobs, { sample: sampleId, lab: SAMPLE_KINDS[sm.kind].lab, start: sim.s.clock, end: sim.s.clock + lab.secs }] });
  return true;
}
const RESULT = {
  water: ['Dissolved gases and trace minerals are within normal range.', 'Odd mineral traces in the water. Something is venting nearby.'],
  sediment: ['Fine silt with traces of metal.', 'Layered sediment. It records old slides down the slope.'],
  rock: ['Basalt with a thin mineral crust.', 'Rock with unusual crystal growth. Worth a closer look.'],
  bio: ['Microbe colony. Its genes differ from the control strand.', 'Tissue from a deep-water species with no match in the library.'],
  magnetic: ['Weak field, as expected.', 'Strong local field. Something metal lies close by.'],
};
/** Finish jobs that are due. Returns finished samples (the caller announces them). */
export function tickLab() {
  const r = root(); if (!r.jobs.length) return [];
  const due = r.jobs.filter((j) => sim.s.clock >= j.end); if (!due.length) return [];
  let pts = r.points; const out = [], found = [];
  const smp = r.samples.map((q) => {
    const j = due.find((d) => d.sample === q.id); if (!j) return q;
    const res = RESULT[q.kind][(q.id + (q.at | 0)) % 2];
    pts += 1; const n = { ...q, status: 'done', result: res }; out.push(n);
    found.push({ id: `sample-${q.id}`, name: `${SAMPLE_KINDS[q.kind].label} sample, ${q.site}`, description: res, type: 'sample', scannedAt: new Date().toISOString() });
    return n;
  });
  save({ ...r, samples: smp, jobs: r.jobs.filter((j) => !due.includes(j)), points: pts, stats: { ...r.stats, analysed: (r.stats.analysed || 0) + out.length } });
  const d = gameState.getProperty('mission.discoveries') || [];
  gameState.updateProperty('mission.discoveries', [...d, ...found]);
  return out;
}
export function startTopic(id) {
  const r = root(), t = TOPICS.find((q) => q.id === id);
  if (!t || r.done.includes(id) || r.points < t.cost || (t.requires && !r.done.includes(t.requires))) return false;
  save({ ...r, points: r.points - t.cost, done: [...r.done, id] });
  return true;
}

/** A finished survey pays a research budget, once. Returns the points granted (0 if none due). */
export function awardSurveyBonus() {
  const r = root(); if (r.bonus.firstSurvey || !gameState.getProperty('progress.firstSurveyComplete')) return 0;
  save({ ...r, points: r.points + 3, bonus: { ...r.bonus, firstSurvey: true } }); return 3;
}
