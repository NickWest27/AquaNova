// The Science ROV. Hand-piloted from the Launch Bay with touch controls. Slow, short range, and it carries
// the instruments WSKRs lack. Stays on a tether to the ship. Working name: Remora (final name still to choose).
import { sim, toward, TIMESCALE } from './sim.js';
import { seafloor } from './seafloor.js';
import { TOOLS, addSample, pickKind, research } from './science.js';

export const ROV_NAME = 'Remora';
export const ROV_KT = 2, SITE_NM = 0.15, NM_PER_DEG = 60;
export const rovRange = () => (research.has('rov-range') ? 1.5 : 1);
const MAX_ROV_DEPTH = 600;

/** s.rov = null (aboard) or { lat, lon, heading, depth, cmd:{thr,turn,dive}, job:null|{tool,end,site} } */
sim.launchRov = () => {
  const s = sim.s;
  if (s.rov) return { ok: false, why: 'out' };
  if (s.docked) return { ok: false, why: 'docked' };
  s.rov = { lat: s.lat, lon: s.lon, heading: s.heading, depth: s.depth, cmd: { thr: 0, turn: 0, dive: 0 }, job: null };
  sim.touch(); return { ok: true };
};
sim.recoverRov = () => {
  const s = sim.s; if (!s.rov) return { ok: false, why: 'aboard' };
  if (toward(s, s.rov).nm > 0.2) return { ok: false, why: 'far' };
  s.rov = null; sim.touch(); sim.emit('rov-recovered'); return { ok: true };
};
/** The site the ROV is working at, or null. */
export const rovSite = () => { const r = sim.s.rov; if (!r) return null; return sim.s.pois.find((p) => p.type !== 'dock' && toward(r, p).nm < SITE_NM) || null; };
export const rovFloor = () => { const r = sim.s.rov; return r && seafloor.ready ? seafloor.depthAt(r.lat, r.lon) : null; };

/** Start a tool. Returns { ok, why }. */
sim.rovUse = (toolId) => {
  const r = sim.s.rov, t = TOOLS[toolId];
  if (!r || !t) return { ok: false, why: 'none' };
  if (r.job) return { ok: false, why: 'busy' };
  const fl = rovFloor();
  if (t.needsFloor && !(fl != null && fl - r.depth <= 6)) return { ok: false, why: 'floor' };
  const site = rovSite();
  if (!pickKind(toolId, site)) return { ok: false, why: 'nothing' };
  r.cmd = { thr: 0, turn: 0, dive: 0 };
  r.job = { tool: toolId, end: sim.s.clock + t.secs, site: site ? site.id : null };
  sim.touch(); return { ok: true };
};

sim.hooks.push((dt) => {
  const s = sim.s, r = s.rov; if (!r) return;
  if (s.docked) { s.rov = null; return; }
  if (r.job) {
    if (s.clock >= r.job.end) {
      const site = s.pois.find((p) => p.id === r.job.site) || null, kind = pickKind(r.job.tool, site);
      const sm = addSample(kind, site, r.job.tool); r.job = null; sim.emit('rov-sample', sm);
    }
    return;
  }
  const c = r.cmd; if (!c.thr && !c.turn && !c.dive) return;
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
