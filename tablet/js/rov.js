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
export const ROV_DIVE_MPS = 2;   // Remora dives and climbs at 2 m per real second (was 8: too fast)
export const REMORA_STORE = 3;   // she is small: three samples, then she has to come home and be unloaded
export const rovCargo = () => (sim.s.rov && sim.s.rov.cargo) || [];
/** Remora is tethered to the Aqua Nova: the tether carries her control and data. It parts if the ship gets further than its length from her
 *  (2% slack). Her link is then lost: no control and no telemetry. The outer door closes, the Tern can launch and fetch her (bayops fetchRemora),
 *  and once she is back aboard Engineering need TETHER_REPAIR_S (2 h) to fit a new tether before she can be used again. */
export const TETHER_SNAP = 1.02, TETHER_REPAIR_S = 2 * 3600;
export const rovLost = () => !!(sim.s.rov && sim.s.rov.lost);
export const rovTethered = () => !!(sim.s.rov && !sim.s.rov.lost);
const GO_ARRIVE_NM = 0.03;
const HOME_NM = 0.03;   // about 55 m: alongside

/** s.rov = null (aboard) or { lat, lon, heading, depth, cmd:{thr,turn,dive}, job:null|{tool,end,site} } */
sim.launchRov = () => {
  const s = sim.s;
  if (s.rov) return { ok: false, why: 'out' };
  if (s.docked) return { ok: false, why: 'docked' };
  s.rov = { lat: s.lat, lon: s.lon, heading: s.heading, depth: s.depth, cmd: { thr: 0, turn: 0, dive: 0 }, job: null, cargo: [], auto: false, home: false };
  bumpStat('launched'); sim.touch(); return { ok: true };
};
/** Hand one carried sample to the lab. */
sim.deliverSample = (c) => addSample(c.kind, c.site ? sim.s.pois.find((p) => p.id === c.site) || null : null, c.tool);
/** Bring her aboard. With deliver=false the bay keeps the cargo and unloads it sample by sample. */
sim.recoverRov = (deliver = true) => {
  const s = sim.s; if (!s.rov) return { ok: false, why: 'aboard' };
  if (toward(s, s.rov).nm > 0.2) return { ok: false, why: 'far' };
  const cargo = s.rov.cargo || [];
  if (deliver) for (const c of cargo) sim.deliverSample(c);
  s.rov = null; sim.touch(); sim.emit('rov-recovered', { delivered: deliver ? cargo.length : 0 }); return { ok: true, delivered: deliver ? cargo.length : 0, cargo: deliver ? [] : cargo };
};
/** The site the ROV is working at, or null. */
export const rovSite = () => { const r = sim.s.rov; if (!r) return null; return sim.s.pois.find((p) => p.type !== 'dock' && toward(r, p).nm < SITE_NM) || null; };
export const rovFloor = () => { const r = sim.s.rov; return r && seafloor.ready ? seafloor.depthAt(r.lat, r.lon) : null; };

/** Start a tool. Returns { ok, why }. */
sim.rovUse = (toolId) => {
  const r = sim.s.rov, t = TOOLS[toolId];
  if (!r || !t || t.remora === false) return { ok: false, why: 'none' };
  if (r.lost) return { ok: false, why: 'lost' };
  if (r.job) return { ok: false, why: 'busy' };
  const fl = rovFloor(), site = rovSite(), kind = pickKind(toolId, site);
  if (!kind) return { ok: false, why: 'nothing' };
  if (kind !== 'magnetic' && (r.cargo || []).length >= REMORA_STORE) return { ok: false, why: 'full' };   // readings go up the tether, so they need no storage
  if (t.needsFloor && kind !== 'water' && !(fl != null && fl - r.depth <= 6)) return { ok: false, why: 'floor' };   // a water sample can be taken anywhere in the water
  r.cmd = { thr: 0, turn: 0, dive: 0 }; r.auto = false; r.home = false; r.go = null; r.thrSet = 0; r.hdgTo = null; r.depTo = null;
  r.job = { tool: toolId, end: sim.s.clock + t.secs, site: site ? site.id : null };
  sim.touch(); return { ok: true };
};

sim.hooks.push((dt) => {
  const s = sim.s, r = s.rov; if (!r) return;
  if (r.lost) return;   // tether parted: she sits where she was, out of contact, until the Tern fetches her
  if (s.docked) { s.rov = null; return; }
  if (toward(s, r).nm > rovRange() * TETHER_SNAP) {   // the ship has dragged the tether past its length: it parts
    Object.assign(r, { lost: true, lostAt: s.clock, job: null, go: null, auto: false, home: false, thrSet: 0, hdgTo: null, depTo: null, cmd: { thr: 0, turn: 0, dive: 0 } });
    const b = s.bay || (s.bay = {}); b.tetherBroken = true; b.override = false;   // the repair starts when she is back aboard
    sim.emit('rov-snapped', { lat: r.lat, lon: r.lon, nm: toward(s, r).nm }); sim.touch(); return;
  }
  if (r.job) {
    if (s.clock >= r.job.end) {
      const site = s.pois.find((p) => p.id === r.job.site) || null, kind = pickKind(r.job.tool, site);
      if (kind === 'magnetic') {   // a live reading: straight up the tether to the lab
        sim.deliverSample({ kind, site: site ? site.id : null, tool: r.job.tool }); r.job = null;
        sim.emit('rov-reading', { kind, site: site ? site.name : 'open water' }); return;
      }
      (r.cargo ||= []).push({ kind, site: site ? site.id : null, tool: r.job.tool }); r.job = null;
      sim.emit('rov-sample', { kind, site: site ? site.name : 'open water', stored: r.cargo.length, store: REMORA_STORE, full: r.cargo.length >= REMORA_STORE });
    }
    return;
  }
  const c = r.cmd, manual = c.thr || c.turn || c.dive;
  if (manual) { r.auto = false; r.home = false; r.go = null; if (c.turn) r.hdgTo = null; if (c.dive) r.depTo = null; }
  else if (r.go) { r.auto = false; r.home = false; }
  else if (r.auto) { autoReturn(r, dt); return; }
  // set-and-go: a target site, or a set speed, heading and depth that she holds until told otherwise
  let thr = c.thr || r.thrSet || 0;
  if (!manual && r.go) {
    const g = toward(r, r.go);
    if (g.nm <= GO_ARRIVE_NM) { const name = r.go.name; r.go = null; r.thrSet = 0; r.hdgTo = null; sim.emit('rov-arrived', { name }); thr = 0; }
    else { r.hdgTo = g.brg; thr = 1; }
  }
  const idle = !thr && !c.turn && !c.dive && r.hdgTo == null && r.depTo == null;
  if (idle) { r.home = r.home && toward(s, r).nm <= HOME_NM * 2; return; }
  if (!c.turn && r.hdgTo != null) {   // turn toward the set heading at 40 degrees a second
    const diff = ((r.hdgTo - r.heading + 540) % 360) - 180, step = 40 * dt;
    if (Math.abs(diff) <= step) { r.heading = (r.hdgTo + 360) % 360; if (!r.go) r.hdgTo = null; } else r.heading = (r.heading + Math.sign(diff) * step + 360) % 360;
  } else r.heading = (r.heading + c.turn * 40 * dt + 360) % 360;
  const turning = r.hdgTo != null && Math.abs(((r.hdgTo - r.heading + 540) % 360) - 180) > 20;   // she does not drive far off line while still swinging round
  const nm = (turning ? 0 : thr * ROV_KT * dt * TIMESCALE) / 3600, a = (r.heading * Math.PI) / 180;
  let lat = r.lat + (nm * Math.cos(a)) / NM_PER_DEG, lon = r.lon + (nm * Math.sin(a)) / (NM_PER_DEG * Math.cos((r.lat * Math.PI) / 180));
  let blocked = false;
  if (seafloor.ready) { const f = seafloor.depthAt(lat, lon); if (f == null || f < 2) { lat = r.lat; lon = r.lon; blocked = nm > 0; } }   // no driving onto land
  const t = toward(s, { lat, lon });
  if (t.nm > Math.max(rovRange(), toward(s, r).nm)) { lat = r.lat; lon = r.lon; blocked = nm > 0; }   // the tether is taut
  if (blocked && (r.go || r.thrSet)) { r.go = null; r.thrSet = 0; r.hdgTo = null; sim.emit('rov-blocked', r); }
  r.lat = lat; r.lon = lon;
  let d = r.depth;
  if (!c.dive && r.depTo != null) { const step = ROV_DIVE_MPS * dt; if (Math.abs(r.depTo - d) <= step) { d = r.depTo; r.depTo = null; } else d += Math.sign(r.depTo - d) * step; }
  else d += c.dive * ROV_DIVE_MPS * dt;   // m per real second
  const fl = rovFloor();
  d = Math.max(0, Math.min(MAX_ROV_DEPTH, d)); if (fl != null) d = Math.min(d, fl - 0.5);
  r.depth = d;
  sim.dirty = true;
});

/** Set-and-go controls. Each cancels auto return and a trip, as a hand on the stick would. */
const rv = () => { const r = sim.s.rov; if (!r || r.job || r.lost) return null; r.auto = false; r.home = false; return r; };
sim.rovSpeed = (delta) => { const r = rv(); if (!r) return null; r.go = null; r.thrSet = Math.max(0, Math.min(1, Math.round(((r.thrSet || 0) + delta) * 4) / 4)); sim.touch(); return r.thrSet; };
sim.rovStop = () => { const r = sim.s.rov; if (!r) return; r.thrSet = 0; r.go = null; r.hdgTo = null; r.depTo = null; r.auto = false; sim.touch(); };
sim.rovYaw = (deg) => { const r = rv(); if (!r) return null; r.go = null; const from = r.hdgTo != null ? r.hdgTo : r.heading; r.hdgTo = (from + deg + 360) % 360; sim.touch(); return r.hdgTo; };
sim.rovDepth = (deg) => { const r = rv(); if (!r) return null; const from = r.depTo != null ? r.depTo : r.depth; r.depTo = Math.max(0, Math.min(MAX_ROV_DEPTH, from + deg)); sim.touch(); return r.depTo; };
sim.rovToFloor = () => { const r = rv(), fl = rovFloor(); if (!r || fl == null) return null; r.depTo = Math.max(0, fl - 3); sim.touch(); return r.depTo; };   // 3 m off the bottom: inside the 6 m the tools need
/** Drive to a point and stop there. */
sim.rovGo = (poi) => { const r = rv(); if (!r) return { ok: false, why: 'none' }; const nm = toward(r, poi).nm; r.go = { lat: poi.lat, lon: poi.lon, name: poi.name || 'the mark' }; r.thrSet = 0; sim.touch(); return { ok: true, nm, minutes: nm / ROV_KT * 60 }; };
/** Automatic return: she drives back to the ship at her own slow speed and rises to the ship's depth. Then she waits alongside to be taken aboard. */
sim.rovAuto = () => {
  const r = sim.s.rov; if (!r) return { ok: false, why: 'none' }; if (r.lost) return { ok: false, why: 'lost' };
  if (r.job) return { ok: false, why: 'busy' };
  r.cmd = { thr: 0, turn: 0, dive: 0 }; r.auto = true; r.home = false; r.go = null; r.thrSet = 0; r.hdgTo = null; r.depTo = null;
  sim.touch(); return { ok: true, nm: toward(sim.s, r).nm, hours: toward(sim.s, r).nm / ROV_KT };
};
function autoReturn(r, dt) {
  const s = sim.s, t = toward(r, s);
  const fl = rovFloor(), want = Math.min(s.depth, fl != null ? fl - 0.5 : MAX_ROV_DEPTH);
  if (t.nm > HOME_NM) {
    const nm = Math.min(t.nm, (ROV_KT * dt * TIMESCALE) / 3600), a = (t.brg * Math.PI) / 180;
    const lat = r.lat + (nm * Math.cos(a)) / NM_PER_DEG, lon = r.lon + (nm * Math.sin(a)) / (NM_PER_DEG * Math.cos((r.lat * Math.PI) / 180));
    if (seafloor.ready) { const f = seafloor.depthAt(lat, lon); if (f == null || f < 2) { r.auto = false; sim.emit('rov-blocked', r); return; } }   // shoal or land in the way: she stops and waits for a pilot
    r.heading = t.brg; r.lat = lat; r.lon = lon;
  }
  r.depth += Math.max(-ROV_DIVE_MPS * dt, Math.min(ROV_DIVE_MPS * dt, want - r.depth));
  if (t.nm <= HOME_NM && Math.abs(want - r.depth) < 1) { r.home = true; r.auto = false; sim.emit('rov-home', r); }   // alongside, at the ship's depth
  sim.dirty = true;
}

/** A progress bar for how much tether is out: her distance from the ship against the tether's length. Build a fresh one on each repaint, or call refresh(). */
export function tetherBar() {
  const txt = el('span'), fill = el('div', { class: 'tt-fill' });
  const box = el('div', { class: 'tether' }, el('div', { class: 'tt-head' }, el('span', { text: 'TETHER' }), txt), el('div', { class: 'tt-track' }, fill));
  box.refresh = () => {
    const r = sim.s.rov; box.hidden = !r || !!r.lost; if (!r || r.lost) return;   // no tether: it parted
    const out = toward(sim.s, r).nm, max = rovRange(), f = Math.min(1, out / max);
    fill.style.width = `${Math.round(f * 100)}%`; box.className = `tether${f >= 0.98 ? ' taut' : f >= 0.8 ? ' long' : ''}`;
    txt.textContent = `${out.toFixed(2)} of ${max.toFixed(1)} nm out${f >= 0.98 ? ' · taut' : ''}`;
  };
  box.refresh(); return box;
}
