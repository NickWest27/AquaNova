// The Tern's orders and radio contact. Her movement lives in bayops.js; this is what the Captain can ask of her.
//   Out of the bay: orders go through Nicole (COMMS) by radio. If the Tern cannot be reached the order waits until contact.
//   In the bay: Security prepares an away team and launches her with a mission.
// The Tern is manned: out of contact she keeps to her last mission, and once an hour she surfaces and tries to check in.
import { sim, toward, SURFACE_M } from './sim.js';
import { seafloor } from './seafloor.js';
import { build as buildPattern, normalize as normPattern, clip as clipPattern, lengthNm, describe as describePattern } from './searchPattern.js';
import { SHUTTLE_NAME, SHUTTLE_KT, SHUTTLE_LINK_NM, TERN_SAFE_M, TERN_CRUISE_M, shuttle, shuttleLink, shuttleRangeNm, passable, TERN_SEARCH_KT, dockList, launchShuttle, sendShuttle, recallShuttle, setManning, bay } from './bayops.js';

const CHECKIN_S = 3600, SURF_S = 120, SURF_LINK_NM = SHUTTLE_LINK_NM * 2;
const out = (sh) => sh.state === 'out';
const pad = (n) => String(n).padStart(2, '0');
const clk = (c) => { const m = Math.floor((c % 86400) / 60); return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; };
export const ternClock = clk;

/** Can the Tern hear us right now? Alongside, in range of the ship, or in range of a dock. */
export function ternLinked(sh = shuttle()) {
  if (!out(sh) || sh.dead) return false;
  if (sh.mode === 'follow' || sh.standoff || sh.mode === 'relay') return toward(sim.s, sh).nm <= SHUTTLE_LINK_NM || sh.mode === 'follow';
  return shuttleLink(sh);
}
/** Why not: for Nicole to report. */
export function ternSilence(sh = shuttle()) {
  if (sh.dead) return 'dead';
  return sh.missed > 0 ? 'missed' : 'range';
}

// ---------- destinations ----------
const asDest = (p) => ({ id: p.id, name: p.name, lat: p.lat, lon: p.lon });
/** Places the Captain can send the Tern: docks, then the nearest points of interest, and the ship's own course. */
export function destinations() {
  const s = sim.s, list = [];
  for (const d of dockList()) list.push(asDest(d));
  const seen = new Set(list.map((d) => d.name));
  for (const p of s.pois.filter((q) => q.type !== 'dock').map((p) => ({ p, nm: toward(s, p).nm })).sort((a, b) => a.nm - b.nm).slice(0, 8)) if (!seen.has(p.p.name)) { list.push(asDest(p.p)); seen.add(p.p.name); }
  if (s.wpt && !seen.has(s.wpt.name)) list.push({ id: 'wpt', name: s.wpt.name || 'our destination', lat: s.wpt.lat, lon: s.wpt.lon });
  return list;
}
const tripNm = (from, dest) => toward(from, dest).nm + toward(dest, sim.s).nm;

// ---------- orders (applied when the Tern can hear them) ----------
function apply(sh, o) {
  const s = sim.s;
  switch (o.kind) {
    case 'home': if (sh.mode === 'follow') return 'She is already alongside.'; if (sh.mode === 'moored') { recallShuttle(); return 'The team is boarding. She is coming home.'; } sh.mode = 'returning'; sh.route = null; sh.mission = null; sh.supply = false; sh.surfUntil = 0; return 'Coming home.';
    case 'hold': sh.mode = 'station'; sh.route = null; sh.holdDepth = Math.round(sh.depth || 0); return `Holding position at ${sh.holdDepth} metres.`;
    case 'surface': sh.mode = 'station'; sh.route = null; sh.holdDepth = 0; return 'Surfacing and holding. On the surface she is limited to 7 knots.';
    case 'relay': sh.mode = 'relay'; sh.route = null; return 'Going to the surface as a relay. She will keep station with us.';
    case 'resume': {
      const m = sh.mission;
      if (!m) { sh.mode = 'returning'; sh.route = null; return 'She has no mission left to go back to, so she is coming home.'; }
      sh.route = null; sh.dest = m.dest; if (m.kind === 'search' && sh.pat) { sh.mode = 'search'; return `Back to her search pattern, waypoint ${sh.pat.k + 1} of ${sh.pat.wps.length}.`; }
      sh.mode = m.kind === 'supply' || m.kind === 'dock' ? 'going' : 'goto'; return `Back to her mission: ${m.label || (m.dest && m.dest.name) || 'her task'}.`;
    }
    case 'depth': if (o.m > TERN_SAFE_M) return `She is only rated for ${TERN_SAFE_M} metres. Order refused.`; sh.holdDepth = Math.max(0, Math.round(o.m)); if (sh.mode === 'follow' || sh.mode === 'relay') sh.mode = 'station'; return `Making her depth ${sh.holdDepth} metres.`;
    case 'heading': sh.ordHdg = ((o.deg % 360) + 360) % 360; if (sh.ordKt == null || sh.ordKt <= 0) sh.ordKt = 10; sh.mode = 'steer'; sh.route = null; return `Steering ${String(Math.round(sh.ordHdg)).padStart(3, '0')} at ${sh.ordKt} knots.`;
    case 'speed': sh.ordKt = Math.max(0, Math.min(SHUTTLE_KT, o.kt)); if (sh.ordKt === 0) { sh.mode = 'station'; sh.holdDepth = Math.round(sh.depth || 0); return 'All stop. Holding position.'; } if (sh.mode === 'station') { sh.mode = 'steer'; if (sh.ordHdg == null) sh.ordHdg = sh.heading || 0; } return `Speed ${sh.ordKt} knots${(sh.depth || 0) < SURFACE_M ? ' (7 at most while she is on the surface)' : ''}.`;
    case 'search': {
      // o.spec: a search pattern (see searchPattern.js). o.datum: where it is centred. o.depth: optional, metres.
      if (!o.datum || !Number.isFinite(o.datum.lat) || !Number.isFinite(o.datum.lon)) return 'A search needs a datum position. Order refused.';
      const spec = normPattern(o.spec), wps = clipPattern(buildPattern(spec, o.datum), (la, lo) => seafloor.inside(la, lo) && passable(la, lo));
      if (wps.length < 2) return 'There is not enough open water in that pattern. Order refused.';
      const need = lengthNm(wps, sh) / TERN_SEARCH_KT + toward(wps[wps.length - 1], s).nm / SHUTTLE_KT, have = shuttleRangeNm() / SHUTTLE_KT;
      if (need > have) return `That pattern is ${need.toFixed(1)} hours of flying with the trip home. She has ${have.toFixed(1)} hours. Order refused.`;
      if (o.depth != null) sh.holdDepth = Math.max(0, Math.min(TERN_SAFE_M, Math.round(o.depth)));
      sh.pat = { spec, lat: o.datum.lat, lon: o.datum.lon, k: 0, wps };
      sh.mission = { kind: 'search', dest: { name: o.datum.name || 'the datum', lat: o.datum.lat, lon: o.datum.lon }, label: describePattern(spec) };
      sh.mode = 'search'; sh.route = null; sh.surfUntil = 0;
      return `Starting a search. ${describePattern(spec)}. ${wps.length} waypoints, about ${lengthNm(wps, sh).toFixed(1)} nautical miles.`;
    }
    case 'goto': {
      const d = o.dest;
      if (!seafloor.inside(d.lat, d.lon)) return `${d.name} is outside our Area of Operations. Order refused.`;
      if (tripNm(sh, d) > shuttleRangeNm()) return `${d.name} is beyond her range for the trip back. Order refused.`;
      sh.mission = { kind: o.mission || 'goto', dest: d, label: o.label || d.name }; sh.dest = d; sh.mode = 'goto'; sh.route = null; sh.surfUntil = 0; return `Under way to ${d.name}, ${toward(sh, d).nm.toFixed(1)} nautical miles.`;
    }
    default: return 'Order not understood.';
  }
}

/** The Captain tells Nicole to radio the Tern. Returns { text }: what Nicole says. */
export function orderTern(o) {
  const sh = shuttle();
  if (!out(sh)) return { ok: false, text: `${SHUTTLE_NAME} is aboard, Captain. If you want her launched, ask Security.` };
  if (sh.dead) return { ok: false, text: `${SHUTTLE_NAME} is not answering, Captain. She is adrift with no power. We have to go to her.` };
  if (!ternLinked(sh)) {
    sh.queue = (sh.queue || []).filter((q) => !(q.kind === o.kind && o.kind !== 'goto')); sh.queue.push(o); if (sh.queue.length > 6) sh.queue.shift(); sim.touch();
    const why = ternSilence(sh), nm = toward(sim.s, sh).nm;
    return { ok: true, queued: true, text: `${why === 'missed' ? `${SHUTTLE_NAME} has missed a check-in. Last contact was at ${clk(sh.lastContact || 0)}` : `${SHUTTLE_NAME} is out of communications range, ${nm.toFixed(0)} miles away`}, Captain. I will pass the order when we have contact. She is keeping to her last mission${sh.mission ? ': ' + (sh.mission.label || sh.mission.dest.name) : ''}.` };
  }
  const text = apply(sh, o); sim.touch();
  return { ok: true, text: `${SHUTTLE_NAME} acknowledges. ${text}` };
}
export const callBackTern = () => orderTern({ kind: 'home' });

/** Nicole's report on the Tern. */
export function ternReport() {
  const sh = shuttle();
  if (!out(sh)) return `${SHUTTLE_NAME} is aboard.`;
  const w = { follow: 'alongside', going: 'under way to a dock', goto: 'under way to a position', search: sh.pat ? `searching, waypoint ${Math.min(sh.pat.k + 1, sh.pat.wps.length)} of ${sh.pat.wps.length}` : 'searching', station: 'holding position', steer: 'on a heading', relay: 'up as a relay', returning: 'coming home', exchange: 'at the dock', moored: 'at the dock' }[sh.mode] || sh.mode;
  const link = sh.dead ? 'She is adrift and silent.' : ternLinked(sh) ? 'We have contact.' : sh.missed > 0 ? `She has missed ${sh.missed} check-in${sh.missed > 1 ? 's' : ''}. Last contact ${clk(sh.lastContact || 0)}.` : `She is out of range, ${toward(sim.s, sh).nm.toFixed(0)} miles away. Last contact ${clk(sh.lastContact || 0)}.`;
  return `${SHUTTLE_NAME} is ${w}${sh.mission ? ` (${sh.mission.label || sh.mission.dest.name})` : ''}, ${Math.round(sh.depth || 0)} metres, battery ${Math.round(sh.bat)}%, air ${Math.round(sh.o2)}%. ${link}${sh.queue && sh.queue.length ? ` ${sh.queue.length} order${sh.queue.length > 1 ? 's' : ''} waiting to be sent.` : ''}`;
}

// ---------- Security: launch her with a mission ----------
/** spec: { kind: 'supply' } | { kind: 'sar' } | { kind: 'goto', dest }. Returns { ok, text } for Security. */
export function launchTern(spec) {
  const sh = shuttle(), s = sim.s;
  if (sh.state !== 'bay') return { ok: false, text: `${SHUTTLE_NAME} is already out, Captain. Ask Nicole to radio her.` };
  if (s.docked) return { ok: false, text: 'We are docked, Captain. The away team can walk.' };
  if (s.depth > TERN_SAFE_M) return { ok: false, why: 'deep', text: `Captain, Engineering will not clear a launch below ${TERN_SAFE_M} metres. Bring us up and I will have the team ready.` };
  let dest, label, mission = spec.kind;
  if (spec.kind === 'supply') {
    const near = dockList().map((d) => ({ d, nm: toward(s, d).nm })).sort((a, b) => a.nm - b.nm)[0];
    if (!near) return { ok: false, text: 'There is no dock on the charts, Captain.' };
    dest = asDest(near.d); label = `supply run to ${dest.name}`;
  } else if (spec.kind === 'sar') {
    const dead = (s.wskrs || []).filter((w) => w.dead).sort((a, b) => toward(s, a).nm - toward(s, b).nm)[0];
    if (dead) { dest = { id: 'sar', name: 'the stricken craft', lat: dead.lat, lon: dead.lon }; }
    else if (s.wpt) dest = { id: 'sar', name: s.wpt.name || 'the search position', lat: s.wpt.lat, lon: s.wpt.lon };
    else return { ok: false, text: 'Search and rescue needs a position, Captain. Plot a course to the last known position first, or send me somewhere.' };
    label = `search and rescue at ${dest.name}`;
  } else { dest = spec.dest; label = dest.name; mission = 'goto'; }
  if (!seafloor.inside(dest.lat, dest.lon)) return { ok: false, text: `${dest.name} is outside our Area of Operations, Captain. We are not cleared.` };
  if (tripNm(s, dest) > shuttleRangeNm()) return { ok: false, text: `${dest.name} is too far for the Tern and back, Captain. Her range is ${shuttleRangeNm().toFixed(0)} miles.` };
  setManning(2, spec.kind === 'supply' ? 2 : 1);
  const r = launchShuttle();
  if (!r.ok) return { ok: false, why: r.why, text: { busy: 'The bay is busy', doors: 'The bay doors are too damaged to open', charge: 'She needs more charge', o2: 'She needs more air', tether: "Remora's tether is holding the doors open", out: 'She is already out' }[r.why] || 'Cannot launch now' };
  sh.pending = { kind: mission, dest, label };
  return { ok: true, text: `Aye, Captain. The ${spec.kind === 'supply' ? 'away team is' : 'team is'} mustering for ${label}. About ${Math.round(r.secs)} seconds to launch.` };
}

sim.on((type, data) => {
  const sh = shuttle();
  if (type === 'bay-launched' && data && data.craft === 'shuttle' && sh.pending) {
    const p = sh.pending; sh.pending = null;
    if (p.kind === 'supply') { sh.supply = true; const r = sendShuttle(p.dest); if (!r.ok) { sh.supply = false; sim.emit('shuttle-mission-fail', { ...sh, why: r.why }); } else sh.mission = { kind: 'supply', dest: p.dest, label: p.label }; }
    else { const t = apply(sh, { kind: 'goto', dest: p.dest, mission: p.kind, label: p.label }); if (/refused/.test(t)) sim.emit('shuttle-mission-fail', sh); }
  }
  if (type === 'shuttle-aboard') {
    if (sh.supply) { sh.supply = false; sim.s.scrubbers = 100; sim.emit('supplies-delivered', sh); }
    sh.mission = null; sh.queue = []; sh.lost = false; sh.missed = 0; sh.surfUntil = 0; sh.holdDepth = undefined; sh.ordKt = undefined; sh.ordHdg = undefined;
  }
});

// ---------- the radio and the hourly check-in ----------
function flush(sh) {
  if (!sh.queue || !sh.queue.length) return;
  const q = sh.queue; sh.queue = [];
  const lines = q.map((o) => apply(sh, o)); sim.touch();
  sim.emit('shuttle-orders-sent', { sh, lines });
}
sim.hooks.push(() => {
  const sh = shuttle(), s = sim.s;
  if (!out(sh) || sh.dead) return;
  if (ternLinked(sh)) {
    if (sh.lost) { sh.lost = false; sh.missed = 0; sim.emit('shuttle-contact', sh); }
    sh.lastContact = s.clock; sh.nextCheck = s.clock + CHECKIN_S; sh.attempt = false; flush(sh); return;
  }
  if (!sh.lost) { sh.lost = true; sim.emit('shuttle-lostlink', sh); if (sh.nextCheck == null || sh.nextCheck < s.clock) sh.nextCheck = s.clock + CHECKIN_S; }
  if (!sh.attempt && s.clock >= sh.nextCheck) { sh.attempt = true; sh.surfUntil = s.clock + SURF_S; sh.nextCheck = s.clock + CHECKIN_S; }   // she comes up to the surface and tries the radio
  if (sh.attempt && s.clock >= sh.surfUntil) {
    sh.attempt = false;
    const ok = toward(s, sh).nm <= SURF_LINK_NM || dockList().some((d) => toward(sh, d).nm <= SURF_LINK_NM);
    if (ok) { sh.lost = false; sh.missed = 0; sh.lastContact = s.clock; sim.emit('shuttle-checkin', sh); flush(sh); }
    else { sh.missed = (sh.missed || 0) + 1; sim.emit('shuttle-missed', sh); }
  }
});
