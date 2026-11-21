// Comms model: antennas, links, aim, contacts, tuning and the EMF detector.
// The Comms station (stations/comms*.js) draws it; the sim hook below moves the antennas even when it is closed.
import { tell } from './notify.js';
import { sim } from './sim.js';
import { toast } from './util.js';
import { gameState } from './persist.js';
import { hailContacts, gates } from './traffic.js';

const RE = 6371, rad = Math.PI / 180;
export const HOME = { name: 'NAVSTA WOODS HOLE', lat: 41.5223, lon: -70.6709 };
export const CUTLER = { name: 'NAA CUTLER ME', lat: 44.645, lon: -67.281 };

// ---- antennas: ext = metres of antenna above the hull, set = where it is being sent ----
export const ANTS = {
  mast: { label: 'Mast', note: 'HF, VHF, AM, laser head', max: 6, rate: 1.5, kt: 8 },
  buoy: { label: 'Comm buoy', note: 'UHF satellite', max: 40, rate: 3, kt: 4 },
  wire: { label: 'VLF wire', note: 'VLF, ELF', max: 100, rate: 5, kt: 6 },
};
sim.s.ants = sim.s.ants || { mast: { set: 0, ext: 0 }, buoy: { set: 0, ext: 0 }, wire: { set: 0, ext: 0 } };
export const ant = (k) => sim.s.ants[k];
export const setAnt = (k, m) => { ant(k).set = Math.max(0, Math.min(ANTS[k].max, m)); };
export const antDepth = (k, s = sim.s) => (s === sim.s && sim.relayUp && sim.relayUp() ? 0 : Math.max(0, s.depth - ant(k).ext));   // a relay WSKR at the surface stands in for the antenna
sim.hooks.push((dt) => {
  for (const k in ANTS) {
    const a = ant(k), D = ANTS[k];
    if ((a.ext > 0.2 || a.set > 0) && sim.s.speed > D.kt) { if (a.set > 0 || a.ext > 0.5) tell('comms', `${D.label} pulled in: too fast (over ${D.kt} kt)`, 'warn'); a.set = 0; }
    const d = a.set - a.ext; a.ext += Math.sign(d) * Math.min(Math.abs(d), D.rate * dt);
  }
});

// ---- links ----
// max = deepest antenna depth (m) where the link works at full strength; strength falls off to 1.5 x max.
export const LINKS = [
  { n: 1, label: 'SAT-COM', band: 'UHF', fr: '243-318 MHz', max: 15, base: 46, tx: true, ant: 'buoy', mcell: 2318, code: '46-9976', rate: '128 kbps', relay: { name: 'NORPAC-3', lat: 0, lon: -100, alt: 35786 } },
  { n: 2, label: 'LASER', band: 'BLUE-GREEN', fr: '470-540 nm', max: 15, base: 50, tx: true, ant: 'mast', mcell: 7713, code: 'LC-4537', rate: '2.4 Mbps', relay: { name: 'NORPAC-L2', lat: 0, lon: -85, alt: 35786 }, tol: 4 },
  { n: 3, label: 'HF', band: 'HF', fr: '4.0-12.0 MHz', max: 5, base: 42, tx: true, ant: 'mast', mcell: 4537, code: 'HF-1102', rate: '2.4 kbps', station: HOME },
  { n: 4, label: 'VLF', band: 'VLF', fr: '17.8-24.0 kHz', max: 40, base: 38, tx: false, ant: 'wire', mcell: 9102, code: 'VL-0021', rate: '50 bps', station: CUTLER },
];
export const BANDS = [
  { id: 'ELF', fr: '3-30 Hz', max: 300, mode: 'RX', ant: 'wire' },
  { id: 'VLF', fr: '3-30 kHz', max: 40, mode: 'RX', ant: 'wire' },
  { id: 'AM', fr: '530-1700 kHz', max: 5, mode: 'RX', ant: 'mast' },
  { id: 'HF', fr: '3-30 MHz', max: 5, mode: 'TX/RX', ant: 'mast' },
  { id: 'VHF', fr: '156-162 MHz', max: 5, mode: 'TX/RX', ant: 'mast' },
  { id: 'UHF', fr: '243-318 MHz', max: 15, mode: 'TX/RX', ant: 'buoy' },
  { id: 'LASER', fr: '470-540 nm', max: 15, mode: 'TX/RX', ant: 'mast' },
];

// ---- user settings of the console ----
export const SOURCES = [{ id: 'sat', label: 'Satellite', link: 1 }, { id: 'laser', label: 'Laser', link: 2 }, { id: 'radio', label: 'Radio (HF)', link: 3 }];
export const cm = { source: 'sat', auto: true, aim: { 1: 0, 2: 0 }, band: 'HF', mhz: 8.145, secure: false, log: [], found: [], emf: true, contacts: null };
export const activeLink = () => LINKS[SOURCES.find((x) => x.id === cm.source).link - 1];

// ---- geometry ----
export const central = (a, b) => { const p1 = a.lat * rad, p2 = b.lat * rad, dl = (b.lon - a.lon) * rad; return Math.acos(Math.min(1, Math.max(-1, Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dl)))); };
export const bearing = (a, b) => { const p1 = a.lat * rad, p2 = b.lat * rad, dl = (b.lon - a.lon) * rad; return ((Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) / rad) + 360) % 360; };
export const distNm = (a, b) => central(a, b) * RE / 1.852;
const angDiff = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

export function linkState(L, s = sim.s) {
  const eff = antDepth(L.ant, s), far = eff / L.max;
  const tgt = L.relay || L.station, g = central(s, tgt), brg = bearing(s, tgt);
  let dist, elev = null;
  if (L.relay) { const r = RE + L.relay.alt; dist = Math.sqrt(RE * RE + r * r - 2 * RE * r * Math.cos(g)); elev = Math.atan2(Math.cos(g) - RE / r, Math.sin(g)) / rad; } else dist = g * RE;
  const aim = L.relay ? (cm.auto ? brg : cm.aim[L.n]) : null, off = L.relay ? angDiff(aim, brg) : 0, tol = L.tol || 15;
  const pen = L.relay && off > tol ? Math.min(40, (off - tol) * 0.8) : 0;
  const wob = Math.sin(s.clock / 37 + L.n * 2.1) * 1.6;
  const dB = far > 1.5 ? null : Math.round(L.base - 24 * far + wob - pen);
  const status = far > 1.5 ? 'NO CARRIER' : pen > 20 ? 'NO LOCK' : far > 1 || pen > 8 ? 'FADING' : L.tx ? 'OPERATIVE' : 'RX ONLY';
  const up = status === 'OPERATIVE' || status === 'RX ONLY';
  return { up, fading: status === 'FADING', dB, status, tgt, brg, dist, elev, g, eff, aim, off, tol };
}
export const canTransmit = () => { const L = activeLink(), st = linkState(L); return { L, st, ok: st.up && L.tx }; };
export const bestSource = () => {
  let best = null;
  for (const x of SOURCES) { const st = linkState(LINKS[x.link - 1]); if (st.dB != null && st.up && (!best || st.dB > best.dB)) best = { id: x.id, dB: st.dB }; }
  return best;
};

// ---- contacts and tuning ----
export const DIAL = {   // per band: tuning range, coarse and fine steps (MHz)
  HF: { min: 3, max: 30, coarse: 0.5, fine: 0.005 },
  VHF: { min: 156, max: 162, coarse: 0.5, fine: 0.025 },
  UHF: { min: 243, max: 318, coarse: 5, fine: 0.1 },
};
export async function loadContacts() {
  if (cm.contacts) return cm.contacts;
  try {
    cm.contacts = await (await fetch(new URL('../../data/commsContacts.json', import.meta.url))).json();
    // every inhabited place answers on its own VHF channel; the reply comes from the place or, failing that, its faction
    for (const p of sim.s.pois) {
      if (!p.mhz) continue;
      const f = (sim.world.factions || {})[p.faction] || {};
      cm.contacts.push({ id: 'place-' + p.id, kind: p.kind === 'port' || p.kind === 'base' ? 'base' : 'org', name: p.name, band: 'VHF', mhz: p.mhz, lat: p.lat, lon: p.lon, range: 60, faction: p.faction,
        reply: p.reply || `${p.name}. ${f.name ? f.name + ' here. ' : ''}We read you, Aqua Nova.` });
    }
  } catch (e) { console.warn('comms contacts not loaded', e); cm.contacts = []; }
  return cm.contacts;
}
export const activated = () => gameState.getProperty('mission.comms.active') || [];
export const hailed = () => gameState.getProperty('mission.comms.hailed') || [];
export const isActive = (c) => !c.hidden || activated().includes(c.id);
export const authCode = (id) => { let h = 7; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 9000; return `${String(h + 1000).slice(0, 2)}-${String(h + 1000).slice(2)}`; };
export const tune = (band, mhz) => { const d = DIAL[band]; cm.band = band; cm.mhz = +Math.max(d.min, Math.min(d.max, mhz)).toFixed(3); };
const bandOpen = (id) => { const b = BANDS.find((x) => x.id === id); return antDepth(b.ant) <= b.max; };
gates.ais = () => bandOpen('VHF');   // AIS is heard on the VHF mast
const sig = (c, s = sim.s) => Math.max(1, Math.round(44 - 16 * Math.log10(1 + distNm(s, c) / 5)));

export function scan() {
  const s = sim.s;
  if (!bandOpen(cm.band)) { cm.found = []; return { ok: false, msg: `Antenna too deep for ${cm.band}.` }; }
  cm.found = [...(cm.contacts || []), ...hailContacts()].filter((c) => isActive(c) && c.band === cm.band && distNm(s, c) <= c.range)
    .map((c) => ({ id: c.id, mhz: c.mhz, dB: sig(c, s), brg: Math.round(bearing(s, c)), name: hailed().includes(c.id) || (c.vessel && c.vessel.ident) ? c.name : null, distress: !!c.distress }));
  return { ok: true, msg: cm.found.length ? `${cm.found.length} carrier${cm.found.length === 1 ? '' : 's'} found on ${cm.band}.` : `No carriers on ${cm.band}.` };
}
export function hail() {
  const s = sim.s;
  if (!bandOpen(cm.band)) return { ok: false, msg: `Antenna too deep for ${cm.band}. Raise it.` };
  const step = DIAL[cm.band].fine;
  const c = [...(cm.contacts || []), ...hailContacts()].find((x) => isActive(x) && x.band === cm.band && Math.abs(x.mhz - cm.mhz) < step * 0.6);
  if (!c) return { ok: false, msg: 'Only static. Nobody answers on this frequency.' };
  if (distNm(s, c) > c.range) return { ok: false, msg: `A faint carrier, but too far to answer (${Math.round(distNm(s, c))} nm).` };
  const entry = { at: s.clock, id: c.id, name: c.name, text: c.reply, secure: cm.secure, band: c.band, mhz: c.mhz, route: c.band === 'UHF' ? 'NORPAC CH 26-H' : `${c.band} DIRECT`, dist: Math.round(distNm(s, c)), distress: !!c.distress };
  cm.log = [entry, ...cm.log].slice(0, 6);
  if (!c.vessel && !hailed().includes(c.id)) gameState.updateProperty('mission.comms.hailed', [...hailed(), c.id]);
  document.dispatchEvent(new CustomEvent('comms-hail', { detail: { id: c.id, name: c.name, secure: cm.secure } }));
  return { ok: true, msg: `${c.name} answers.`, entry };
}

// ---- EMF detector: ferrous masses and power cables disturb the field (wrecks, docks) ----
export function emf(s = sim.s) {
  const t = Date.now() / 700;
  let uT = 38 + 2 * Math.sin(t) + 1.5 * Math.sin(t * 2.3), best = null;
  for (const p of s.pois || []) {
    const amp = p.type === 'wreck' ? 900 : p.type === 'dock' ? 400 : 0;
    if (!amp) continue;
    const d = distNm(s, p); if (d > 4) continue;
    const add = amp / (1 + (d / 0.35) ** 2); uT += add;
    if (!best || add > best.add) best = { add, d, p };
  }
  return { uT: Math.round(uT), brg: best ? Math.round(bearing(s, best.p)) : null, d: best ? best.d : null,
    what: best ? (best.p.type === 'wreck' ? 'Large metal mass' : 'Power cable') : null, name: best && best.d < 0.4 ? best.p.name : null };
}
