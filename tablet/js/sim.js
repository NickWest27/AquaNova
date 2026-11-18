// Ship simulation. Pure data, no DOM. Runs at 5 Hz and only while the page is visible.
import { clamp, norm360, angDiff } from './util.js';
import { dlog } from '../../utils/log.js';
import { planRoute } from './route.js';
import { seafloor } from './seafloor.js';

const TICK_MS = 200;
const TIMESCALE = 30;        // 1 real second = 30 game seconds of travel
const MAX_KT = 14;
const NM_PER_DEG_LAT = 60;
const POI_RADIUS_NM = 0.3;
const KEEL = 8;             // metres the ship needs under it (hull height plus a margin)
const HARBOR_NM = 2;        // the dredged channel round a dock: no grounding checks inside it

export const sim = {
  s: {
    lat: 41.5223, lon: -70.6709, heading: 0, targetHeading: 0,
    throttle: 0, speed: 0, depth: 0, targetDepth: 0,
    battery: 100, oxygen: 100, hull: 100, co2: 0.04, temp: 4.1, power: 0,
    ballast: 100, comms: true, sonar: true, lights: true, pois: [], wpt: null, route: [], routeSnapped: false, _routeFor: null, at: null,
    clock: 6 * 3600, docked: false, damage: 0, floor: null, wskrs: [], sweepUntil: 0,     // clock = game seconds since Day 1 00:00
  },
  listeners: new Set(),
  dirty: true,
  timer: null,
  last: 0,
};

sim.on = (fn) => { sim.listeners.add(fn); return () => sim.listeners.delete(fn); };
sim.touch = () => { sim.dirty = true; };

sim.loadPois = async () => {
  try {
    const res = await fetch(new URL('../../data/locations.json', import.meta.url));
    const gj = await res.json();
    sim.s.pois = gj.features.map((f, i) => ({
      id: i, name: f.properties.name, type: f.properties.type, text: f.properties.description || '',
      lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1],
    }));
    try {   // the tablet map is real, so a few sites move to real places (the desktop game keeps locations.json as it is)
      const ov = await (await fetch(new URL('../../data/seafloor/pois.json', import.meta.url))).json();
      for (const o of ov) {
        const p = sim.s.pois.find((q) => q.name === o.name);
        if (p) Object.assign(p, o); else sim.s.pois.push({ id: sim.s.pois.length, text: '', ...o });
      }
    } catch (e) { dlog('sim: no POI overrides'); }
    dlog('sim: loaded', sim.s.pois.length, 'POIs');
  } catch (e) { console.error('Could not load locations.json', e); }
};

/** Distance in nm and bearing in degrees from a to b. */
export function toward(a, b) {
  const dy = (b.lat - a.lat) * NM_PER_DEG_LAT;
  const dx = (b.lon - a.lon) * NM_PER_DEG_LAT * Math.cos((a.lat * Math.PI) / 180);
  return { nm: Math.hypot(dx, dy), brg: norm360((Math.atan2(dx, dy) * 180) / Math.PI), dx, dy };
}

sim.setThrottle = (v) => { if (sim.s.docked) return; sim.s.throttle = clamp(v, 0, 1); sim.touch(); };
sim.setHeading = (h) => { sim.s.targetHeading = norm360(h); sim.touch(); };
sim.setDepth = (d) => { if (sim.s.docked) return; sim.s.targetDepth = clamp(d, 0, 6000); sim.touch(); };
/** Is this point safe water for the ship? (Inside the dredged harbour only land stops us.) */
sim.shipPassable = (lat, lon) => {
  const fl = seafloor.depthAt(lat, lon); if (fl == null) return false;
  const dock = sim.dockPoi(); return fl >= (dock && toward({ lat, lon }, dock).nm < HARBOR_NM ? 3 : KEEL + 2);
};
/** Turning points to steer through to reach p without crossing land or shoals: [] = straight line, null = no safe route. */
sim.routeTo = (p) => (seafloor.ready ? planRoute(sim.s, p, sim.shipPassable) : []);
sim.setWpt = (p) => {
  const s = sim.s; s.wpt = p; s.route = []; s.routeSnapped = false; s._routeFor = p;
  if (p) { const r = sim.routeTo(p); s.route = r ? [...r] : []; s.routeSnapped = !!(r && r.snapped); s.targetHeading = toward(s, s.route[0] || p).brg; }
  sim.touch();
};
sim.stop = () => { sim.s.throttle = 0; sim.s.wpt = null; sim.touch(); };
/** WSKRs: autonomous remote sensors. They hold a ring formation round the ship (better readings, stereoscopic data),
 *  can be sent to investigate a site, and can be recalled. Launched only from the Sensors station. Up to 4.
 *  Each: { n, lat, lon, mode: 'escort' | 'task' | 'recall', target: poi id | null, busy: game seconds spent investigating } */
const WSKR_KT = 10, WSKR_RING_NM = 1.5, WSKR_INVESTIGATE_S = 90;
sim.deployWskr = () => {
  const s = sim.s;
  if (s.docked) return { ok: false, why: 'docked' };
  if (s.wskrs.length >= 4) return { ok: false, why: 'full' };
  const used = new Set(s.wskrs.map((w) => w.n)); let n = 1; while (used.has(n)) n++;
  s.wskrs.push({ n, lat: s.lat, lon: s.lon, mode: 'escort', target: null, busy: 0 }); sim.touch(); return { ok: true, n };
};
sim.taskWskr = (poi) => {
  const w = sim.s.wskrs.find((q) => q.mode === 'escort');
  if (!w) return null;
  w.mode = 'task'; w.target = poi.id; w.busy = 0; w.route = null; sim.touch(); return w;
};
sim.recallWskrs = () => { sim.s.wskrs.forEach((w) => { w.mode = 'recall'; w.target = null; w.route = null; }); sim.touch(); return sim.s.wskrs.length; };
const wskrPassable = (lat, lon) => (seafloor.depthAt(lat, lon) ?? 0) >= 3;
function stepWskrs(dt) {
  const s = sim.s; if (!s.wskrs.length) return;
  const esc = s.wskrs.filter((w) => w.mode === 'escort'), step = (WSKR_KT * dt * TIMESCALE) / 3600;
  s.wskrs = s.wskrs.filter((w) => {
    let goal = null;
    if (w.mode === 'escort') { const i = esc.indexOf(w), a = ((s.heading + (360 / esc.length) * i + 45) * Math.PI) / 180; goal = { lat: s.lat + (Math.cos(a) * WSKR_RING_NM) / NM_PER_DEG_LAT, lon: s.lon + (Math.sin(a) * WSKR_RING_NM) / (NM_PER_DEG_LAT * Math.cos((s.lat * Math.PI) / 180)) }; }
    else if (w.mode === 'task') { goal = s.pois.find((p) => p.id === w.target); if (!goal) { w.mode = 'escort'; return true; } }
    else goal = s;
    // Route round land. Replanned when the goal has moved on (escorts and recalls follow the ship) or after a failed attempt.
    if (!w.route || (w.routeGoal && toward(w.routeGoal, goal).nm > 0.6) || (w.routeRetry != null && s.clock >= w.routeRetry)) {
      const r = seafloor.ready ? planRoute(w, goal, wskrPassable) : [];
      w.route = r ? [...r] : []; w.routeSnapped = !!(r && r.snapped); w.routeGoal = { lat: goal.lat, lon: goal.lon }; w.routeRetry = r ? null : s.clock + 300;
    }
    while (w.route.length > 1 && toward(w, w.route[0]).nm < 0.12) w.route.shift();
    const end = w.route.length ? w.route[w.route.length - 1] : goal, t = toward(w, goal), te = toward(w, end);
    const onSite = w.routeSnapped ? te.nm < 0.12 : t.nm < 0.12;
    if (w.mode === 'recall' && (t.nm < 0.15 || (w.routeSnapped && te.nm < 0.15))) { sim.emit('wskr-recovered', w); return false; }
    if (w.mode === 'task' && onSite) {          // on site: investigate, then file the scan and rejoin
      w.busy += dt * TIMESCALE;
      if (w.busy >= WSKR_INVESTIGATE_S) { const p = s.pois.find((q) => q.id === w.target); w.mode = 'escort'; w.target = null; w.route = null; sim.emit('wskr-found', { wskr: w, poi: p }); }
      return true;
    }
    const aim = w.route[0] || goal, ta = toward(w, aim);
    if (ta.nm > 0.02 && !(w.mode === 'escort' && t.nm < 0.05)) {
      const f = Math.min(1, step / ta.nm), lat = w.lat + (aim.lat - w.lat) * f, lon = w.lon + (aim.lon - w.lon) * f;
      if (!seafloor.ready || wskrPassable(lat, lon)) { w.lat = lat; w.lon = lon; }   // small probes stay out of the very shallows
    }
    return true;
  });
}

/** Safest course out of here: the heading with the most clear water ahead (at least KEEL + 2 m under us), preferring south/open sea.
 *  Returns { heading, clearNm } or null before the sea floor has loaded. */
sim.safeHeading = (maxNm = 10) => {
  if (!seafloor.ready) return null;
  const s = sim.s, dock = sim.dockPoi(), harbor = !!dock; let best = null;
  for (let h = 0; h < 360; h += 5) {
    const r = (h * Math.PI) / 180; let free = 0;
    for (let d = 0.1; d <= maxNm; d += 0.1) {
      const fl = seafloor.depthAt(s.lat + (d * Math.cos(r)) / NM_PER_DEG_LAT, s.lon + (d * Math.sin(r)) / (NM_PER_DEG_LAT * Math.cos((s.lat * Math.PI) / 180)));
      if (fl == null || fl < (harbor && toward(s, dock).nm < HARBOR_NM && toward({ lat: s.lat + (d * Math.cos(r)) / NM_PER_DEG_LAT, lon: s.lon + (d * Math.sin(r)) / (NM_PER_DEG_LAT * Math.cos((s.lat * Math.PI) / 180)) }, dock).nm < HARBOR_NM ? 3 : KEEL + 2)) break;   // inside the dredged harbour only land stops us
      free = d;
    }
    const pref = Math.abs(((h - 180 + 540) % 360) - 180);   // distance from due south
    if (!best || free > best.clearNm + 0.5 || (Math.abs(free - best.clearNm) <= 0.5 && pref < best.pref)) best = { heading: h, clearNm: free, pref };
  }
  return best;
};
/** Deepest depth we can safely hold here: the floor minus the keel and a 5 m margin (null if unknown). */
sim.deepest = () => { const fl = seafloor.ready ? seafloor.depthAt(sim.s.lat, sim.s.lon) : null; return fl == null ? null : Math.max(0, Math.floor(fl - KEEL - 5)); };

sim.dockPoi = () => sim.s.pois.find((p) => p.type === 'dock');

/** Autopilot speed limit (knots). The ship turns at a fixed rate, so its turning circle grows with speed
 *  (radius = knots * 0.0796 nm). Turn first at walking pace, then build speed as the nose comes round,
 *  and keep the circle small enough to fit inside the distance left. A target behind the ship is then
 *  reached in one turn and never orbited. */
export function autopilotCap(headingErrDeg, distNm) {
  const byHeading = headingErrDeg > 60 ? 1 : headingErrDeg > 25 ? 1.5 : headingErrDeg > 10 ? 3 : MAX_KT;
  const byDistance = Math.max(1, distNm * 6.3);
  return Math.min(byHeading, byDistance);
}

/** Game hours to reach the current waypoint, from a dry run of the same turn and speed rules (no sea floor checks). null if none. */
sim.etaHours = (maxHours = 96) => {
  const s = sim.s; if (!s.wpt || s.docked) return null;
  let { lat, lon, heading, speed } = s; const dt = 0.5, route = (s.route || []).map((q) => q);
  for (let t = 0; t * TIMESCALE / 3600 < maxHours; t += dt) {
    while (route.length > 1 && toward({ lat, lon }, route[0]).nm < 0.25) route.shift();
    const end = toward({ lat, lon }, route.length ? route[route.length - 1] : s.wpt);
    if (end.nm < POI_RADIUS_NM * 0.6) return (t * TIMESCALE) / 3600;
    const tw = toward({ lat, lon }, route[0] || s.wpt);
    const turn = angDiff(tw.brg, heading), rate = 6 * dt;
    heading = norm360(heading + clamp(turn, -rate, rate));
    const want = Math.min(s.throttle * MAX_KT, autopilotCap(Math.abs(turn), route.length > 1 ? Infinity : end.nm));
    speed += clamp(want - speed, -2 * dt, 1.2 * dt);
    const nm = (speed * dt * TIMESCALE) / 3600, r = (heading * Math.PI) / 180;
    lat += (nm * Math.cos(r)) / NM_PER_DEG_LAT; lon += (nm * Math.sin(r)) / (NM_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180));
  }
  return null;
};

sim.step = (dt) => {
  const s = sim.s;
  s.clock += dt * TIMESCALE;
  if (s.docked) { s.throttle = 0; s.speed = 0; s.targetDepth = 0; s.wpt = null; }   // clamps hold the ship
  // heading
  let capDist = Infinity;
  if (!s.wpt) { s.route = []; s._routeFor = null; }
  else {
    if (s._routeFor !== s.wpt) { const r = sim.routeTo(s.wpt); s.route = r ? [...r] : []; s.routeSnapped = !!(r && r.snapped); s._routeFor = s.wpt; }   // after a load, or a course set elsewhere
    while (s.route.length > 1 && toward(s, s.route[0]).nm < 0.25) s.route.shift();
    const end = s.route.length ? s.route[s.route.length - 1] : s.wpt, t = toward(s, end);
    if (t.nm < POI_RADIUS_NM * 0.6) { s.wpt = null; s.route = []; s.throttle = 0; sim.emit('arrived'); }
    else { const steer = toward(s, s.route[0] || s.wpt); s.targetHeading = steer.brg; capDist = s.route.length > 1 ? Infinity : t.nm; }
  }
  const turn = angDiff(s.targetHeading, s.heading);
  const rate = 6 * dt; // deg per second
  s.heading = norm360(s.heading + clamp(turn, -rate, rate));
  // speed (smooth)
  let wantKt = s.throttle * MAX_KT * (s.battery > 0 ? 1 : 0);
  if (s.wpt) wantKt = Math.min(wantKt, autopilotCap(Math.abs(turn), capDist));
  s.speed += clamp(wantKt - s.speed, -2 * dt, 1.2 * dt);
  // depth
  const dd = s.targetDepth - s.depth;
  s.depth = clamp(s.depth + clamp(dd, -12 * dt, 12 * dt), 0, 6000);
  // move, then check the sea floor
  const prevLat = s.lat, prevLon = s.lon;
  const nm = (s.speed * dt * TIMESCALE) / 3600;
  const r = (s.heading * Math.PI) / 180;
  s.lat += (nm * Math.cos(r)) / NM_PER_DEG_LAT;
  s.lon += (nm * Math.sin(r)) / (NM_PER_DEG_LAT * Math.cos((s.lat * Math.PI) / 180));
  if (seafloor.ready && !s.docked) {
    const dock = sim.dockPoi(), harbor = dock && toward(s, dock).nm < HARBOR_NM;
    let hit = null;
    if (!seafloor.inside(s.lat, s.lon)) hit = nm > 0 ? 'edge' : null;
    else if (!harbor) {
      const fl = seafloor.depthAt(s.lat, s.lon);
      if (fl < KEEL) hit = nm > 0 ? 'shoal' : null;   // a ship that is not moving cannot run aground
      else if (s.depth > fl - KEEL) { s.depth = Math.max(0, fl - KEEL); if (!sim.onBottom) hit = 'bottom'; sim.onBottom = true; }
      else sim.onBottom = false;
    }
    if (hit === 'edge' || hit === 'shoal') {      // blocked: back to where we were, stopped
      const kt = s.speed; s.lat = prevLat; s.lon = prevLon; s.speed = 0; s.throttle = 0; s.wpt = null;
      if (hit === 'edge') sim.emit('bump', { kind: 'edge' });
      else sim.hurt(kt, 'shoal');
    } else if (hit === 'bottom') sim.hurt(s.speed, 'bottom');
    if (!seafloor.ready) sim.onBottom = false;
  }
  s.floor = seafloor.ready ? seafloor.depthAt(s.lat, s.lon) : null;
  stepWskrs(dt);
  // systems
  s.power = 8 + (s.speed / MAX_KT) * 70 + (s.lights ? 5 : 0) + (s.sonar ? 4 : 0);
  if (s.docked) { // shore power and air: about 20% battery and 30% oxygen per game hour
    const gh = (dt * TIMESCALE) / 3600;
    s.battery = clamp(s.battery + 20 * gh, 0, 100); s.oxygen = clamp(s.oxygen + 30 * gh, 0, 100);
  } else {
    s.battery = clamp(s.battery - (s.power / 100) * 0.012 * dt * TIMESCALE / 30, 0, 100);
    s.oxygen = clamp(s.oxygen - 0.0025 * dt * TIMESCALE / 30, 0, 100);
  }
  s.co2 = clamp(0.04 + (100 - s.oxygen) * 0.012, 0, 5);
  s.temp = clamp(20 - Math.sqrt(s.depth) * 0.28, 1.5, 20);
  if (s.docked) s.damage = Math.max(0, s.damage - 6 * (dt * TIMESCALE) / 3600);   // the dock crew repair about 6% an hour
  s.hull = clamp(100 - s.damage - Math.max(0, s.depth - 4500) / 30, 0, 100);
  // arrival at POI
  let here = null;
  for (const p of s.pois) if (toward(s, p).nm < POI_RADIUS_NM) { here = p; break; }
  if (here && (!s.at || s.at.id !== here.id)) {
    s.at = here;
    document.dispatchEvent(new CustomEvent('location-enter', { detail: { location: here.name.toLowerCase() } }));
    sim.emit('enter', here);
  } else if (!here && s.at) { s.at = null; }
  sim.dirty = true;
};

/** An impact costs hull: 2% plus 1.5% per knot (at most once every 30 game seconds). */
let lastHurt = -1e9;
sim.hurt = (kt, kind) => {
  const now = sim.s.clock; if (now - lastHurt < 30) return; lastHurt = now;   // game seconds
  const d = 2 + 1.5 * kt; sim.s.damage = Math.min(100, sim.s.damage + d);
  sim.emit('bump', { kind, damage: d });
};

/** Docking needs a dock marker, low speed and the surface. */
sim.canDock = () => { const s = sim.s; return !s.docked && !!s.at && s.at.type === 'dock' && s.speed <= 1.5 && s.depth <= 5; };

/** "Game clock" text, e.g. "Day 2 06:30". */
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
/** The game's calendar date and time, for example "16 AUG 2074  06:00:12". The story starts on 16 August 2074. */
export const gameDateText = (secs = sim.s.clock) => {
  const d = new Date(Date.UTC(2074, 7, 16) + secs * 1000), p2 = (n) => String(n).padStart(2, '0');
  return `${p2(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}  ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}`;
};
export const clockText = (secs = sim.s.clock) => `Day ${Math.floor(secs / 86400) + 1} ${String(Math.floor(secs / 3600) % 24).padStart(2, '0')}:${String(Math.floor(secs / 60) % 60).padStart(2, '0')}`;

/** Sleep: jump the game forward. The ship keeps its course, speed and destination, so a long
 *  transit takes less of the player's time. The crew wake the player early for an emergency, or on arrival.
 *  Returns { hours, reason, arrived }: reason is an emergency text, arrived is the destination name. */
sim.warp = (hours) => {
  const s = sim.s, total = hours * 3600, stepGame = 15;   // 15 game seconds per step
  const startWpt = s.wpt;
  let done = 0, reason = null, arrived = null, sinceCheck = 0;
  while (done < total) {
    sim.step(stepGame / TIMESCALE); done += stepGame; sinceCheck += stepGame;
    if (startWpt && !s.wpt) { arrived = startWpt.name; break; }
    if (sinceCheck >= 60) {
      sinceCheck = 0;
      if (s.oxygen < 30 && !s.docked) reason = `oxygen reserves are down to ${Math.round(s.oxygen)}%`;
      else if (s.battery < 20 && !s.docked) reason = `battery is down to ${Math.round(s.battery)}%`;
      else if (s.hull < 60) reason = `hull integrity has dropped to ${Math.round(s.hull)}%`;
      if (reason) break;
    }
  }
  sim.dirty = true; sim.emit('tick');
  return { hours: done / 3600, reason, arrived };
};

sim.emit = (type, data) => sim.listeners.forEach((fn) => { try { fn(type, data); } catch (e) { console.error(e); } });

sim.start = () => {
  if (sim.timer) return;
  sim.last = performance.now();
  sim.timer = setInterval(() => {
    const now = performance.now();
    const dt = Math.min(0.5, (now - sim.last) / 1000);
    sim.last = now;
    sim.step(dt);
    if (sim.dirty) { sim.dirty = false; sim.emit('tick'); }
  }, TICK_MS);
};
sim.pause = () => { clearInterval(sim.timer); sim.timer = null; };

document.addEventListener('visibilitychange', () => { if (document.hidden) sim.pause(); else if (sim.wanted) sim.start(); });
const _start = sim.start;
sim.start = () => { sim.wanted = true; _start(); };

export const MAX_SPEED = MAX_KT;
