// The Science ROV. Hand-piloted from the Launch Bay with touch controls. Slow, short range, and it carries
// the instruments WSKRs lack. Stays on a tether to the ship. Working name: Remora (final name still to choose).
import { sim, toward, TIMESCALE } from './sim.js';
import { seafloor } from './seafloor.js';
import { TOOLS, addSample, pickKind, research, bumpStat } from './science.js';
import { el } from './util.js';

export const ROV_NAME = 'Remora';
export const ROV_KT = 2, SITE_NM = 0.15, NM_PER_DEG = 60;
export const rovRange = () => (research.has('rov-range') ? 1.5 : 1);
const MAX_ROV_DEPTH = 600;
export const REMORA_STORE = 3;   // she is small: three samples, then she has to come home and be unloaded
export const rovCargo = () => (sim.s.rov && sim.s.rov.cargo) || [];
const HOME_NM = 0.1;

/** s.rov = null (aboard) or { lat, lon, heading, depth, cmd:{thr,turn,dive}, job:null|{tool,end,site} } */
sim.launchRov = () => {
  const s = sim.s;
  if (s.rov) return { ok: false, why: 'out' };
  if (s.docked) return { ok: false, why: 'docked' };
  s.rov = { lat: s.lat, lon: s.lon, heading: s.heading, depth: s.depth, cmd: { thr: 0, turn: 0, dive: 0 }, job: null, cargo: [], auto: false, home: false };
  bumpStat('launched'); sim.touch(); return { ok: true };
};
sim.recoverRov = () => {
  const s = sim.s; if (!s.rov) return { ok: false, why: 'aboard' };
  if (toward(s, s.rov).nm > 0.2) return { ok: false, why: 'far' };
  const cargo = s.rov.cargo || [];   // the samples she carried go to the lab now she is aboard
  for (const c of cargo) addSample(c.kind, c.site ? s.pois.find((p) => p.id === c.site) || null : null, c.tool);
  s.rov = null; sim.touch(); sim.emit('rov-recovered', { delivered: cargo.length }); return { ok: true, delivered: cargo.length };
};
/** The site the ROV is working at, or null. */
export const rovSite = () => { const r = sim.s.rov; if (!r) return null; return sim.s.pois.find((p) => p.type !== 'dock' && toward(r, p).nm < SITE_NM) || null; };
export const rovFloor = () => { const r = sim.s.rov; return r && seafloor.ready ? seafloor.depthAt(r.lat, r.lon) : null; };

/** Start a tool. Returns { ok, why }. */
sim.rovUse = (toolId) => {
  const r = sim.s.rov, t = TOOLS[toolId];
  if (!r || !t || t.remora === false) return { ok: false, why: 'none' };
  if (r.job) return { ok: false, why: 'busy' };
  if ((r.cargo || []).length >= REMORA_STORE) return { ok: false, why: 'full' };
  const fl = rovFloor(), site = rovSite(), kind = pickKind(toolId, site);
  if (!kind) return { ok: false, why: 'nothing' };
  if (t.needsFloor && kind !== 'water' && !(fl != null && fl - r.depth <= 6)) return { ok: false, why: 'floor' };   // a water sample can be taken anywhere in the water
  r.cmd = { thr: 0, turn: 0, dive: 0 }; r.auto = false; r.home = false;
  r.job = { tool: toolId, end: sim.s.clock + t.secs, site: site ? site.id : null };
  sim.touch(); return { ok: true };
};

sim.hooks.push((dt) => {
  const s = sim.s, r = s.rov; if (!r) return;
  if (s.docked) { s.rov = null; return; }
  if (r.job) {
    if (s.clock >= r.job.end) {
      const site = s.pois.find((p) => p.id === r.job.site) || null, kind = pickKind(r.job.tool, site);
      (r.cargo ||= []).push({ kind, site: site ? site.id : null, tool: r.job.tool }); r.job = null;
      sim.emit('rov-sample', { kind, site: site ? site.name : 'open water', stored: r.cargo.length, store: REMORA_STORE, full: r.cargo.length >= REMORA_STORE });
    }
    return;
  }
  const c = r.cmd;
  if (c.thr || c.turn || c.dive) { r.auto = false; r.home = false; }
  else if (r.auto) { autoReturn(r, dt); return; }
  else { r.home = r.home && toward(s, r).nm <= HOME_NM * 2; return; }
  r.heading = (r.heading + c.turn * 40 * dt + 360) % 360;
  const nm = (c.thr * ROV_KT * dt * TIMESCALE) / 3600, a = (r.heading * Math.PI) / 180;
  let lat = r.lat + (nm * Math.cos(a)) / NM_PER_DEG, lon = r.lon + (nm * Math.sin(a)) / (NM_PER_DEG * Math.cos((r.lat * Math.PI) / 180));
  if (seafloor.ready) { const f = seafloor.depthAt(lat, lon); if (f == null || f < 2) { lat = r.lat; lon = r.lon; } }   // no driving onto land
  const t = toward(s, { lat, lon });
  if (t.nm > Math.max(rovRange(), toward(s, r).nm)) { lat = r.lat; lon = r.lon; }   // the tether is taut
  r.lat = lat; r.lon = lon;
  let d = r.depth + c.dive * 8 * dt;   // m per real second
  const fl = rovFloor();
  d = Math.max(0, Math.min(MAX_ROV_DEPTH, d)); if (fl != null) d = Math.min(d, fl - 0.5);
  r.depth = d;
  sim.dirty = true;
});

/** Automatic return: she drives back to the ship at her own slow speed and rises to the ship's depth. Then she waits alongside to be taken aboard. */
sim.rovAuto = () => {
  const r = sim.s.rov; if (!r) return { ok: false, why: 'none' };
  if (r.job) return { ok: false, why: 'busy' };
  r.cmd = { thr: 0, turn: 0, dive: 0 }; r.auto = true; r.home = toward(sim.s, r).nm <= HOME_NM;
  sim.touch(); return { ok: true, nm: toward(sim.s, r).nm, hours: toward(sim.s, r).nm / ROV_KT };
};
function autoReturn(r, dt) {
  const s = sim.s, t = toward(r, s);
  if (t.nm <= HOME_NM) { if (!r.home) { r.home = true; r.auto = false; sim.emit('rov-home', r); } r.auto = false; return; }
  const nm = Math.min(t.nm, (ROV_KT * dt * TIMESCALE) / 3600), a = (t.brg * Math.PI) / 180;
  const lat = r.lat + (nm * Math.cos(a)) / NM_PER_DEG, lon = r.lon + (nm * Math.sin(a)) / (NM_PER_DEG * Math.cos((r.lat * Math.PI) / 180));
  if (seafloor.ready) { const f = seafloor.depthAt(lat, lon); if (f == null || f < 2) { r.auto = false; sim.emit('rov-blocked', r); return; } }   // shoal or land in the way: she stops and waits for a pilot
  r.heading = t.brg; r.lat = lat; r.lon = lon;
  const fl = rovFloor(), want = Math.min(s.depth, fl != null ? fl - 0.5 : MAX_ROV_DEPTH);
  r.depth += Math.max(-8 * dt, Math.min(8 * dt, want - r.depth));
  sim.dirty = true;
}

/** A progress bar for how much tether is out: her distance from the ship against the tether's length. Build a fresh one on each repaint, or call refresh(). */
export function tetherBar() {
  const txt = el('span'), fill = el('div', { class: 'tt-fill' });
  const box = el('div', { class: 'tether' }, el('div', { class: 'tt-head' }, el('span', { text: 'TETHER' }), txt), el('div', { class: 'tt-track' }, fill));
  box.refresh = () => {
    const r = sim.s.rov; box.hidden = !r; if (!r) return;
    const out = toward(sim.s, r).nm, max = rovRange(), f = Math.min(1, out / max);
    fill.style.width = `${Math.round(f * 100)}%`; box.className = `tether${f >= 0.98 ? ' taut' : f >= 0.8 ? ' long' : ''}`;
    txt.textContent = `${out.toFixed(2)} of ${max.toFixed(1)} nm out${f >= 0.98 ? ' · taut' : ''}`;
  };
  box.refresh(); return box;
}
