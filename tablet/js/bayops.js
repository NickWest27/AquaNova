// The launch bay: how WSKRs and the away boat (the shuttle, Tern) leave and return, and what the bay costs the ship.
//  - A launch takes 1 minute with the doors open; so does taking a craft aboard (+10 s to cycle the shuttle's airlock).
//  - Doors open above 8 kt: the ship takes damage at a rate. Above 10 kt: the doors themselves are permanently damaged
//    (dry dock repair only, no dry dock built yet; `repairDoors()` is the hook) and slower to work.
//  - Remora uses the bay too: one minute out, then its tether keeps the doors open (speed rules apply the whole time) and blocks every other
//    launch and recovery until it is back. It needs no charge, but the science team unload its samples and re-equip it (5 min + 2 min a sample).
//  - WSKRs and the shuttle recharge while racked (2 h for a full charge, in proportion to what was used).
//  - Shuttle: 20 kt, 6 h on a full charge, airlocks 10 s. It carries crew and supplies between the ship and a dock, and away teams:
//    2 cockpit seats and 6 passenger seats. Two pilots is usual; one pilot and a radio link (ship or shore within 20 nm) is enough.
//    It has navigation and radio but no scanning gear.
import { sim, toward, wskrName, TIMESCALE, SURFACE_M, SURFACE_KT, WSKR_CHARGE_H, WSKR_LOW_PCT } from './sim.js';
import { enemyDock } from './reputation.js';
import { seafloor } from './seafloor.js';
import { planRoute } from './route.js';
import { SHUTTLE_NAME } from './topics.js';
import { research, samples } from './science.js';
import './rov.js';
import { retire } from './notify.js';

export { SHUTTLE_NAME };
export const BAY_SAFE_KT = 8, DOOR_DAMAGE_KT = 10, LAUNCH_S = 60, AIRLOCK_S = 10;
export const SHUTTLE_SEATS = 6, SHUTTLE_COCKPIT = 2, SHUTTLE_LINK_NM = 20, SHUTTLE_KT = 20, SHUTTLE_CHARGE_H = 2, MIN_LAUNCH_PCT = 20, LOW_PCT = 15;
export const TERN_SAFE_M = 800, TERN_CRUSH_M = 1000, TERN_HOLD_M = 600, TERN_STANDOFF_NM = 0.25, TERN_CRUISE_M = 20;   // the Tern is a shuttle, not a deep sea vehicle
export const O2_CREW = 8, O2_CHARGE_H = 1, REMORA_REARM_S = 300, REMORA_UNLOAD_S = 120;   // air lasts O2 hours with 8 aboard; Remora: 5 min to re-equip plus 2 min per sample unloaded
/** Shuttle battery life on a full charge: 1 h to start, research makes it 3 h then 6 h. */
export const shuttleHours = () => (research.has('shuttle-battery-6') ? 6 : research.has('shuttle-battery-3') ? 3 : 1);
/** Air supply in hours with all 8 seats taken (fewer aboard lasts longer): 8 h, 10 h after research. */
export const shuttleO2Hours = () => (research.has('shuttle-o2') ? 9 : 7);
export const aboard = (sh) => (sh.pilots == null ? SHUTTLE_COCKPIT : sh.pilots) + (sh.pax || 0);
/** Hours of air left at the present load. */
export const o2HoursLeft = (sh) => (Math.max(0, (sh.o2 == null ? 100 : sh.o2)) / 100) * shuttleO2Hours() * (O2_CREW / Math.max(1, aboard(sh)));
const HULL_PER_KT_S = 0.015, DOOR_PER_KT_S = 0.02;   // % per knot over the limit per game second

export const TERN_SEARCH_KT = 10;
export const passable = (lat, lon) => (seafloor.depthAt(lat, lon) ?? 0) >= 3;
export const bay = () => sim.s.bay || (sim.s.bay = { op: null, doorDmg: 0, base: 0, rearm: null, relaunch: {}, launchAll: false });
export const rack = () => sim.s.rack || (sim.s.rack = {});
export const shuttle = () => sim.s.shuttle || (sim.s.shuttle = { state: 'bay', bat: 100, mode: 'follow' });
const mannedDefaults = (sh) => { if (sh.depth == null) sh.depth = 0; if (sh.o2 == null) sh.o2 = 100; if (sh.pilots == null) sh.pilots = SHUTTLE_COCKPIT; if (sh.pax == null) sh.pax = 0; if (sh.ashore == null) sh.ashore = 0; return sh; };
/** Who rides: pilots 0 to 2, passengers 0 to 6. Only while the shuttle is in the bay. */
export function setManning(pilots, pax) { const sh = mannedDefaults(shuttle()); if (sh.state !== 'bay') return { ok: false, why: 'out' }; sh.pilots = Math.max(0, Math.min(SHUTTLE_COCKPIT, pilots)); sh.pax = Math.max(0, Math.min(SHUTTLE_SEATS, pax)); sim.touch(); return { ok: true, pilots: sh.pilots, pax: sh.pax }; }
/** Radio link for a single pilot: within range of the ship, or of a shore station at a dock. */
export const shuttleLink = (sh) => toward(sim.s, sh).nm <= SHUTTLE_LINK_NM || docks().some((p) => toward(sh, p).nm <= SHUTTLE_LINK_NM);
export const rackBat = (n) => (rack()[n] == null ? 100 : rack()[n]);
/** Game seconds a launch or recovery takes now: a damaged door is slower. */
export const opSeconds = () => LAUNCH_S * (1 + bay().doorDmg / 50);
export const busy = () => !!bay().op;
const docks = () => sim.s.pois.filter((p) => p.type === 'dock');
export const dockList = docks;
/** Range of the shuttle on its present charge, in nm, keeping the 15% reserve. */
export const shuttleRangeNm = () => { const sh = mannedDefaults(shuttle()); return SHUTTLE_KT * Math.min(shuttleHours() * Math.max(0, sh.bat - LOW_PCT) / 100, shuttleO2Hours() * (O2_CREW / Math.max(1, aboard(sh))) * Math.max(0, sh.o2 - LOW_PCT) / 100); };

function startOp(op) { const b = bay(); if (b.op) return { ok: false, why: 'busy' }; if (sim.s.speed > BAY_SAFE_KT && !b.override) return { ok: false, why: 'fast' }; if (b.doorDmg >= 100) return { ok: false, why: 'doors' }; if (sim.s.rov && op.craft !== 'rov') return { ok: false, why: 'tether' }; b.op = { t: 0, dur: opSeconds(), air: 0, ...op }; sim.touch(); sim.emit('bay-op', b.op); return { ok: true, secs: b.op.dur + b.op.air }; }

/** Start a one-minute WSKR launch. Picks the racked WSKR with the most charge. */
export function launchWskr(want) {
  const s = sim.s; if (s.docked) return { ok: false, why: 'docked' };
  const used = new Set(s.wskrs.map((w) => w.n)); const free = [1, 2, 3, 4].filter((n) => !used.has(n));
  if (!free.length) return { ok: false, why: 'full' };
  const pick = want && free.includes(want) ? want : free.sort((a, b) => rackBat(b) - rackBat(a))[0];
  if (rackBat(pick) < MIN_LAUNCH_PCT) return { ok: false, why: 'charge', n: pick, bat: rackBat(pick) };
  const r = startOp({ kind: 'launch', craft: 'wskr', n: pick }); return r.ok ? { ...r, n: pick } : r;
}
/** Take the WSKR waiting alongside aboard even though the ship is over the safe speed (the doors will cost us). */
export function receiveWskrNow(n) { const w = sim.s.wskrs.find((q) => q.n === n && q.arrived); if (!w) return { ok: false, why: 'none' }; return startOp({ kind: 'recover', craft: 'wskr', n }); }
/** The Captain sends every WSKR out. The bay launches them one at a time (one minute each), as each has the charge. */
export function launchAllWskrs() {
  const s = sim.s, b = bay(); if (s.docked) return { ok: false, why: 'docked' };
  if (s.speed > BAY_SAFE_KT && !sim.away) return { ok: false, why: 'fast' };
  const free = [1, 2, 3, 4].filter((n) => !s.wskrs.some((w) => w.n === n));
  if (!free.length) return { ok: false, why: 'full' };
  if (free.every((n) => rackBat(n) < MIN_LAUNCH_PCT)) return { ok: false, why: 'charge' };
  b.launchAll = true; sim.touch(); return { ok: true, count: free.length };
}
/** Remora leaves through the bay: one minute, then the doors stay open for its tether until it is recovered. */
export function launchRemora() {
  const s = sim.s, b = bay(); if (s.rov) return { ok: false, why: 'out' }; if (s.docked) return { ok: false, why: 'docked' };
  if (b.rearm) return { ok: false, why: 'rearm', mins: Math.ceil((b.rearm.dur - b.rearm.t) / 60) };
  return startOp({ kind: 'launch', craft: 'rov' });
}
export function recoverRemora() { const s = sim.s; if (!s.rov) return { ok: false, why: 'aboard' }; if (toward(s, s.rov).nm > 0.2) return { ok: false, why: 'far' }; return startOp({ kind: 'recover', craft: 'rov' }); }
export const remoraRearm = () => bay().rearm;
export function launchShuttle() {
  const s = sim.s, sh = mannedDefaults(shuttle()); if (sh.state !== 'bay') return { ok: false, why: 'out' }; if (s.docked) return { ok: false, why: 'docked' };
  if (sh.pilots < 1) return { ok: false, why: 'pilot' };
  if (sh.bat < MIN_LAUNCH_PCT) return { ok: false, why: 'charge', bat: sh.bat };
  if (sh.o2 < MIN_LAUNCH_PCT) return { ok: false, why: 'o2', o2: sh.o2 };
  if (sim.s.depth > TERN_SAFE_M) return { ok: false, why: 'deep' };
  return startOp({ kind: 'launch', craft: 'shuttle' });
}
export function recoverShuttle() {
  const sh = shuttle(); if (sh.state !== 'out' || sh.mode !== 'follow') return { ok: false, why: 'away' };
  if (sh.standoff) return { ok: false, why: 'standoff' };
  if (toward(sim.s, sh).nm > 0.2) return { ok: false, why: 'far' };
  return startOp({ kind: 'recover', craft: 'shuttle', air: AIRLOCK_S });
}
/** Send the shuttle to a dock with crew and supplies: out, a 10 s airlock cycle, and home. */
export function sendShuttle(poi, stay = false) {
  if (enemyDock(poi)) return { ok: false, why: 'enemy' };   // no supplies from an enemy base, colony or port
  const sh = mannedDefaults(shuttle()); if (sh.state !== 'out' || sh.mode !== 'follow' || sh.dead) return { ok: false, why: 'away' };
  const trip = toward(sh, poi).nm + toward(poi, sim.s).nm, range = shuttleRangeNm();
  if (trip > range) return { ok: false, why: 'range', trip, range };
  Object.assign(sh, { stay: !!stay && sh.pax > 0, mode: 'going', dest: { id: poi.id, name: poi.name, lat: poi.lat, lon: poi.lon }, route: null, air: 0 }); sh.depth = Math.max(sh.depth || 0, sh.holdDepth == null ? TERN_CRUISE_M : sh.holdDepth); sh.mission = { kind: sh.supply ? 'supply' : 'dock', dest: sh.dest }; sim.touch();
  return { ok: true, nm: toward(sh, poi).nm, hours: toward(sh, poi).nm / SHUTTLE_KT };
}
export function recallShuttle() { const sh = mannedDefaults(shuttle()); if (sh.state !== 'out' || sh.mode === 'follow') return { ok: false, why: 'none' }; if (sh.mode === 'moored') { Object.assign(sh, { mode: 'exchange', boarding: true, air: 0 }); sim.touch(); return { ok: true, boarding: true }; } sh.mode = 'returning'; sh.route = null; sim.touch(); return { ok: true }; }
/** Dry dock repair (no dry dock exists yet): the doors are as new. */
export const repairDoors = () => { bay().doorDmg = 0; sim.touch(); };

function finishOp(op) {
  const s = sim.s, b = bay(); b.op = null; sim.touch();
  retire('bay');   // "being readied, about 60 seconds" no longer applies
  if (op.craft === 'rov') {
    if (op.kind === 'launch') { const r = sim.launchRov(); b.base = samples().length; if (r.ok) sim.emit('bay-launched', { craft: 'rov' }); }
    else { const r = sim.recoverRov(false), cargo = (r.ok && r.cargo) || [], load = cargo.length; if (!r.ok) return; b.rearm = { t: 0, dur: REMORA_REARM_S + load * REMORA_UNLOAD_S, load, cargo }; sim.emit('remora-aboard', b.rearm); }
    return;
  }
  if (op.craft === 'wskr' && op.kind === 'launch') { const r = sim.deployWskr(op.n); if (r.ok) sim.emit('bay-launched', { craft: 'wskr', n: r.n }); }
  else if (op.craft === 'wskr') { const i = s.wskrs.findIndex((w) => w.n === op.n); if (i >= 0) { const w = s.wskrs[i]; s.wskrs.splice(i, 1); rack()[w.n] = w.bat == null ? 100 : w.bat; sim.emit('wskr-recovered', w); } }
  else if (op.kind === 'launch') { const sh = shuttle(); Object.assign(sh, { depth: s.depth, mission: null, holdDepth: undefined, ordKt: undefined, ordHdg: undefined, queue: [], lost: false, missed: 0, nextCheck: s.clock + 3600, lastContact: s.clock, state: 'out', mode: 'follow', lat: s.lat, lon: s.lon, dest: null, route: null, dead: false }); sim.emit('bay-launched', { craft: 'shuttle' }); }
  else { const sh = shuttle(); Object.assign(sh, { state: 'bay', mode: 'follow', dest: null, route: null }); sim.emit('shuttle-aboard', sh); }
}

/** The Captain overrides (or restores) the speed limit while the outer doors are open. It lapses when the doors close. */
export const bayDoorsOpen = () => !!(bay().op || sim.s.rov);
export function setBayOverride(on) { const b = bay(); if (!bayDoorsOpen()) return false; b.override = !!on; sim.touch(); if (on) sim.emit('speed-override', {}); return true; }
sim.speedCaps.push((s) => (bay().op || s.rov) && !bay().override ? BAY_SAFE_KT : null);

/** The doors are open for a launch or recovery, and the whole time Remora is out on its tether. */
function stepOp(g) {
  const b = bay(), op = b.op, s = sim.s, kt = s.speed;
  if (b.rearm) {
    b.rearm.t += g;
    while (b.rearm.cargo && b.rearm.cargo.length && b.rearm.t >= (b.rearm.load - b.rearm.cargo.length + 1) * REMORA_UNLOAD_S) {   // one sample reaches the lab per unload step
      const c = b.rearm.cargo.shift(); sim.deliverSample(c); sim.emit('remora-unloaded', { kind: c.kind, left: b.rearm.cargo.length });
    }
    if (b.rearm.t >= b.rearm.dur) { b.rearm = null; sim.emit('remora-ready'); } }
  if (!op && !s.rov) { b.warned = b.doorSaid = false; b.override = false; return; }
  if (kt <= BAY_SAFE_KT) b.warned = b.doorSaid = false;
  if (kt > BAY_SAFE_KT) {
    if (!b.warned) { b.warned = true; sim.emit('bay-warn', { kt }); }
    s.damage = Math.min(100, s.damage + (kt - BAY_SAFE_KT) * HULL_PER_KT_S * g);
  }
  if (kt > DOOR_DAMAGE_KT) {
    b.doorDmg = Math.min(100, b.doorDmg + (kt - DOOR_DAMAGE_KT) * DOOR_PER_KT_S * g);
    if (!b.doorSaid) { b.doorSaid = true; sim.emit('bay-door-damage', { kt, pct: b.doorDmg }); }
  }
  if (op) { op.t += g; if (op.t >= op.dur + (op.air || 0)) finishOp(op); }
}

/** WSKRs that have come alongside are taken aboard once the bay is free and the ship is slow enough. */
function receive() {
  const s = sim.s; if (bay().op) return;
  for (const w of s.wskrs) {
    if (s.rov && w.arrived) { if (!w.tethered) { w.tethered = true; sim.emit('bay-tether', w); } continue; }
    if (!w.arrived) continue;
    if (s.speed <= BAY_SAFE_KT) { startOp({ kind: 'recover', craft: 'wskr', n: w.n }); return; }
    if (sim.away) { crewSlows(); return; }   // the crew have the con: Marcus brings the ship down to bay speed
    if (!w.hinted) { w.hinted = true; sim.emit('bay-wait', w); }
  }
}

/** While the crew have the con a bay job waits on speed, Marcus holds the ship at bay speed until it is done. The standing speed comes back after. */
const crewSlows = () => { bay().slow = true; };
sim.speedCaps.push(() => (bay().slow ? BAY_SAFE_KT : null));
/** WSKRs that go out by themselves: the ones recalled for low charge, once they are full again, and all of them after "launch all". */
function pumpLaunches() {
  const s = sim.s, b = bay(); b.relaunch = b.relaunch || {};
  for (const w of s.wskrs) if (w.low) { b.relaunch[w.n] = true; delete w.low; }   // recalled for low charge: remember it for when it is aboard
  const free = [1, 2, 3, 4].filter((n) => !s.wskrs.some((w) => w.n === n));
  for (const n of Object.keys(b.relaunch)) if (s.wskrs.some((w) => w.n === +n && w.mode !== 'recall')) delete b.relaunch[n];   // the Captain sent it out again by hand
  if (b.launchAll && !free.length) b.launchAll = false;
  const ready = b.launchAll ? free : free.filter((n) => b.relaunch[n] && rackBat(n) >= 99.9);
  if (!ready.length || b.op || s.rov || s.docked) return;
  if (s.speed > BAY_SAFE_KT) { if (sim.away) crewSlows(); else if (!b.waitSaid) { b.waitSaid = true; sim.emit('wskr-relaunch-wait', { n: ready[0] }); } return; }
  b.waitSaid = false;
  const r = launchWskr(b.launchAll ? undefined : ready[0]);
  if (!r.ok) { if (b.launchAll) { b.launchAll = false; sim.emit('wskr-launchall-stop', { why: r.why }); } return; }
  if (b.relaunch[r.n]) { delete b.relaunch[r.n]; sim.emit('wskr-relaunch', { n: r.n }); }
}

function chargeRack(g) { const r = rack(); for (const k of Object.keys(r)) if (r[k] < 100) r[k] = Math.min(100, r[k] + (100 / (WSKR_CHARGE_H * 3600)) * g); }

const atDock = (sh) => docks().some((p) => toward(sh, p).nm < 0.15);
function aim(sh, goal) {
  if (!sh.route || (sh.routeGoal && toward(sh.routeGoal, goal).nm > 0.6)) {
    const r = seafloor.ready ? planRoute(sh, goal, passable) : [];
    sh.route = r ? [...r] : []; sh.routeSnapped = !!(r && r.snapped); sh.routeGoal = { lat: goal.lat, lon: goal.lon };
  }
  while (sh.route.length > 1 && toward(sh, sh.route[0]).nm < 0.12) sh.route.shift();
  return sh.route[0] || goal;
}
/** Her speed: what the Captain ordered, never more than 7 knots while she is on the surface. */
const spd = (sh) => Math.min(sh.ordKt == null ? (sh.mode === 'search' ? TERN_SEARCH_KT : SHUTTLE_KT) : sh.ordKt, (sh.depth || 0) < SURFACE_M ? SURFACE_KT : SHUTTLE_KT);
/** Where she wants to be: ordered depth, the surface for a relay, the dock, or a check-in. 3 m a second. */
function tickDepth(sh, g) {
  if (sh.mode === 'follow' && !sh.standoff) { sh.depth = sim.s.depth; return; }
  if (sh.standoff) return;
  const s = sim.s;
  const want = sh.surfUntil && s.clock < sh.surfUntil ? 0 : (sh.mode === 'moored' || sh.mode === 'exchange' || sh.mode === 'relay') ? 0 : sh.mode === 'station' ? (sh.holdDepth || 0) : (sh.holdDepth == null ? TERN_CRUISE_M : sh.holdDepth);
  const d = want - sh.depth; sh.depth += Math.max(-3 * g, Math.min(3 * g, d));
}
/** Free steering: she holds a heading and speed until blocked by land or the edge of the Area of Operations. */
function steer(sh, g) {
  const kt = spd(sh); if (kt <= 0) { sh.mode = 'station'; return; }
  const nm = (kt * g) / 3600, r = ((sh.ordHdg == null ? sh.heading : sh.ordHdg) * Math.PI) / 180;
  const lat = sh.lat + (nm * Math.cos(r)) / 60, lon = sh.lon + (nm * Math.sin(r)) / (60 * Math.cos((sh.lat * Math.PI) / 180));
  if (!passable(lat, lon) || !seafloor.inside(lat, lon)) { sh.mode = 'station'; sim.emit('shuttle-blocked', sh); return; }
  sh.heading = sh.ordHdg == null ? sh.heading : sh.ordHdg; sh.lat = lat; sh.lon = lon; sh.moving = true;
}
function stepShuttle(g) {
  const s = sim.s, sh = shuttle();
  if (sh.state === 'bay') { mannedDefaults(sh); if (sh.bat < 100) sh.bat = Math.min(100, sh.bat + (100 / (SHUTTLE_CHARGE_H * 3600)) * g); if (sh.o2 < 100) sh.o2 = Math.min(100, sh.o2 + (100 / (O2_CHARGE_H * 3600)) * g); return; }
  sh.moving = false;
  if (sh.dead) { if (toward(s, sh).nm < 0.15) { sh.lat = s.lat; sh.lon = s.lon; sh.mode = 'follow'; } return; }   // adrift: the ship must come to it
  mannedDefaults(sh);
  if (sh.pilots < 2 && sh.mode === 'going' && !shuttleLink(sh)) { sh.mode = 'returning'; sh.route = null; sim.emit('shuttle-nolink', sh); }   // one pilot needs a radio link
  let goal = null;
  if (sh.mode === 'search') { goal = sh.pat && sh.pat.wps[sh.pat.k]; if (!goal) { sh.mode = 'station'; sh.pat = null; sh.route = null; sim.emit('shuttle-search-done', sh); } }
  else if (sh.mode === 'going' || sh.mode === 'goto') goal = sh.dest; else if (sh.mode === 'returning' || sh.mode === 'follow' || sh.mode === 'relay') goal = s;
  tickDepth(sh, g);
  // The ship is below the Tern's safe depth (800 m): she formates at a safe distance and depth, and hails the ship, until it is safe to dock.
  if (!sh.dead && (sh.mode === 'follow' || sh.mode === 'returning')) {
    if (s.depth > TERN_SAFE_M && !sh.standoff) { sh.standoff = true; sh.mode = 'follow'; sim.emit('shuttle-standoff', sh); }
    else if (s.depth <= TERN_SAFE_M && sh.standoff) { sh.standoff = false; sim.emit('shuttle-clear', sh); }
  }
  if (sh.standoff) { sh.mode = 'follow'; goal = null; sh.lat = s.lat + TERN_STANDOFF_NM / 60; sh.lon = s.lon; sh.depth = Math.min(TERN_HOLD_M, s.depth); }
  else if (sh.mode === 'follow' && toward(sh, s).nm < 0.3) { sh.lat = s.lat; sh.lon = s.lon; goal = null; sh.depth = s.depth; }   // alongside: rides with the ship
  else if (sh.mode === 'relay' && toward(sh, s).nm < 0.3) { sh.lat = s.lat; sh.lon = s.lon; goal = null; }   // a relay rides at the surface with the ship
  else if (sh.mode === 'follow') sh.mode = 'returning';
  if (sh.mode === 'station') goal = null;
  if (sh.mode === 'steer') { goal = null; steer(sh, g); }
  if (sh.mode === 'exchange') {
    sh.air = (sh.air || 0) + g;
    if (sh.air >= AIRLOCK_S) {
      if (sh.stay && !sh.boarding) { sh.ashore += sh.pax; sh.pax = 0; sh.stay = false; sh.mode = 'moored'; sim.emit('shuttle-landed', sh); }   // the away team steps off and the shuttle waits at the dock on charge
      else { if (sh.boarding) { sh.pax += sh.ashore; sh.ashore = 0; sh.boarding = false; } sh.mode = 'returning'; sh.route = null; sim.emit('shuttle-exchanged', sh); }
    }
  } else if (sh.mode === 'moored') { /* waiting at the dock for the team; charging below */ } else if (goal) {
    const t = toward(sh, goal), end = sh.route && sh.route.length ? sh.route[sh.route.length - 1] : goal;
    const arrived = t.nm < (sh.mode === 'going' ? 0.1 : sh.mode === 'search' ? 0.05 : 0.15) || (sh.routeSnapped && toward(sh, end).nm < 0.12);
    if (arrived) {
      if (sh.mode === 'going') { sh.mode = 'exchange'; sh.air = 0; sim.emit('shuttle-arrived', sh); }
      else if (sh.mode === 'goto') { sh.mode = 'station'; sh.route = null; sim.emit('shuttle-onstation', sh); }
      else if (sh.mode === 'search') { sh.pat.k++; sh.route = null; if (sh.pat.k >= sh.pat.wps.length) { sh.mode = 'station'; sh.holdDepth = Math.round(sh.depth || 0); sim.emit('shuttle-search-done', sh); sh.pat = null; } }
      else if (sh.mode === 'relay') { /* stays up with the ship */ }
      else { sh.mode = 'follow'; sh.lat = s.lat; sh.lon = s.lon; sh.route = null; if (s.depth <= TERN_SAFE_M) sim.emit('shuttle-alongside', sh); }
    } else {
      const a = aim(sh, goal), ta = toward(sh, a), f = Math.min(1, ((spd(sh) * g) / 3600) / Math.max(0.001, ta.nm));
      if (ta.nm > 0.01) { sh.heading = ta.brg; sh.lat += (a.lat - sh.lat) * f; sh.lon += (a.lon - sh.lon) * f; sh.moving = true; }
    }
  }
  // battery: 1 h at 20 kt to start (research: 3 h, 6 h); light draw at rest; topped up when it is at a dock (so is the air, in 1 h)
  if (!sh.moving && atDock(sh)) { sh.bat = Math.min(100, sh.bat + (100 / (SHUTTLE_CHARGE_H * 3600)) * g); sh.o2 = Math.min(100, sh.o2 + (100 / (O2_CHARGE_H * 3600)) * g); }
  else {
    sh.bat = Math.max(0, sh.bat - (100 / (shuttleHours() * 3600)) * (sh.moving ? 1 : 0.3) * g);
    // the Tern's air is her single-use scrubber stock: it is only used while she is submerged (not riding on the surface alongside a surfaced ship), and by whoever is aboard
    const surfaced = (sh.mode === 'follow' ? sim.s.depth : sh.depth) < SURFACE_M;
    if (!surfaced) sh.o2 = Math.max(0, sh.o2 - (100 / (shuttleO2Hours() * 3600)) * (aboard(sh) / O2_CREW) * g);
  }
  if (sh.bat <= 0) { sh.dead = true; sim.emit('shuttle-dead', sh); }
  else if (sh.o2 <= 0) { sh.dead = true; sim.emit('shuttle-o2-out', sh); }
  else if ((sh.bat <= LOW_PCT || sh.o2 <= LOW_PCT) && (sh.mode === 'going' || sh.mode === 'search')) { sh.mode = 'returning'; sh.route = null; sim.emit(sh.o2 <= LOW_PCT ? 'shuttle-o2-low' : 'shuttle-low', sh); }
}

sim.hooks.push((dt) => {
  const g = dt * TIMESCALE, b = bay(), held = b.slow;
  b.slow = false; stepOp(g); receive(); pumpLaunches(); chargeRack(g); stepShuttle(g);
  if (b.slow && !held) sim.emit('bay-slowing', { kt: BAY_SAFE_KT });   // Marcus slows us for the bay
});

/** What to tell the Captain about the result of launchWskr(). */
export const launchText = (r) => r.ok ? `${wskrName({ n: r.n })} is being readied in the bay. About ${Math.round(r.secs)} seconds.` : ({ docked: 'Undock first', fast: 'Slow below 8 kt first', full: 'All four WSKRs are out', busy: 'The bay is busy with another craft', doors: 'The bay doors are too damaged to open: dry dock needed', tether: "Remora's tether is holding the bay doors open. Recover it first", charge: `${wskrName({ n: r.n })} is only at ${Math.round(r.bat || 0)} percent charge. It needs 20 percent` })[r.why] || 'Cannot launch now';

