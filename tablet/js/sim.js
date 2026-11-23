// Ship simulation. Pure data, no DOM. Runs at 5 Hz and only while the page is visible.
import { clamp, norm360, angDiff } from './util.js';
import { dlog } from '../../utils/log.js';
import { planRoute } from './route.js';
import { seafloor } from './seafloor.js';

const TICK_MS = 200;
export let TIMESCALE = 1;         // 1 real second = 1 game second (real time, the default). Settings can change it (5x to 120x); everything below reads this live.
export const TIME_SCALES = [1, 5, 15, 30, 60, 120];   // 1 = real time
export const setTimeScale = (n) => { if (TIME_SCALES.includes(n)) TIMESCALE = n; return TIMESCALE; };
/** Turns, speed changes and dives happen in real seconds, so the boat answers the helm at once at any time compression. */
/** Turn rate in degrees per second: 6 when slow, 3 at full speed (14 kt), 1.5 in super cruise. */
const turnDps = (kt) => (kt <= MAX_KT ? 6 - 3 * Math.max(0, kt) / MAX_KT : 3 - 1.5 * Math.min(1, (kt - MAX_KT) / (SUPER_KT - MAX_KT)));
// Vertical speed depends on forward speed: the planes can pitch the boat about 20 degrees, so it climbs or dives at forward speed x tan(20 deg).
// Stopped, only ballast and thrusters move it, slowly. Capped at 3 m/s (10 m/s in super cruise).
const PITCH_TAN = Math.tan((20 * Math.PI) / 180), HOVER_MPS = 0.5, MAX_DIVE_MPS = 3, MAX_DIVE_CRUISE_MPS = 10, KT_MPS = 0.5144;
export const diveRate = (kt, cruise = false) => Math.min(cruise ? MAX_DIVE_CRUISE_MPS : MAX_DIVE_MPS, Math.max(HOVER_MPS, Math.abs(kt) * KT_MPS * PITCH_TAN));
const pace = () => 1;   // handling is per real second, so turns, speed changes and dives feel the same at any time compression
const MAX_KT = 14;
export const SCRUB_DAYS = 90;   // the Aqua Nova carries scrubbers for about three months submerged
export const CRUSH_M = 11000, DEEPEST_KNOWN_M = 10935, PERISCOPE_M = 10;   // crush depth: a little more than the Challenger Deep
export const SURFACE_M = 3, SURFACE_KT = 7;   // above 3 m the ship is on the surface, where she is limited to 7 knots (built for sub-sea movement)
/** Super cruise: Aqua Nova can run at 100 kt in deep water. It drops out on its own when the water ahead is shallow. WSKRs have one too (120 kt). */
export const SUPER_KT = 100, SUPER_MIN_FLOOR = 120, SUPER_LOOK_NM = [3, 6, 9], WSKR_SUPER_KT = 120, WSKR_FAR_NM = 6;
const NM_PER_DEG_LAT = 60;
const POI_RADIUS_NM = 0.3;
const KEEL = 8;             // metres the ship needs under it (hull height plus a margin)
const AO_WARN_NM = 6;       // Area of Operations: how far ahead Helm looks for the limit
const HARBOR_NM = 2;        // the dredged channel round a dock: no grounding checks inside it

export const sim = {
  s: {
    lat: 41.5223, lon: -70.6709, heading: 0, targetHeading: 0,
    throttle: 0, speed: 0, depth: 0, targetDepth: 0,
    battery: 100, oxygen: 100, hull: 100, co2: 0.04, temp: 4.1, power: 0,
    ballast: 100, comms: true, sonar: true, lights: true, pois: [], wpt: null, fixes: [], wpN: 0, route: [], routeSnapped: false, _routeFor: null, at: null,
    clock: 6 * 3600, docked: false, damage: 0, floor: null, wskrs: [], cruise: false, hug: false, wskrForm: 'loose', wskrDepth: 'auto', sweepUntil: 0,     // clock = game seconds since Day 1 00:00
  },
  listeners: new Set(),
  dirty: true,
  timer: null,
  last: 0,
};

sim.on = (fn) => { sim.listeners.add(fn); return () => sim.listeners.delete(fn); };
sim.touch = () => { sim.dirty = true; };

sim.world = { factions: {} };
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
    try {   // the wider world: factions and places (appended last so the older ids stay put)
      const [fj, pj] = await Promise.all(['factions', 'places'].map((n) => fetch(new URL(`../../data/world/${n}.json`, import.meta.url)).then((r) => r.json())));
      sim.world.factions = fj.factions;
      for (const w of pj) if (!sim.s.pois.some((q) => q.name === w.name)) sim.s.pois.push({ id: sim.s.pois.length, ...w, stance: (fj.factions[w.faction] || {}).stance });
    } catch (e) { dlog('sim: no world data'); }
    dlog('sim: loaded', sim.s.pois.length, 'POIs');
  } catch (e) { console.error('Could not load locations.json', e); }
};

/** Distance in nm and bearing in degrees from a to b. */
export function toward(a, b) {
  const dy = (b.lat - a.lat) * NM_PER_DEG_LAT;
  const dx = (b.lon - a.lon) * NM_PER_DEG_LAT * Math.cos((a.lat * Math.PI) / 180);
  return { nm: Math.hypot(dx, dy), brg: norm360((Math.atan2(dx, dy) * 180) / Math.PI), dx, dy };
}

sim.speedCaps = [];   // functions (s) => fastest allowed speed (kt) or null (the bay doors while open, unless the Captain overrides)
sim.depthCaps = [];   // functions (s) => deepest allowed depth or null (the Tern's limit while she is out)
sim.maxKt = () => (sim.s.cruise ? SUPER_KT : MAX_KT);
/** Engage or drop super cruise. Needs deep water under and ahead of the ship, and not docked. */
sim.setCruise = (on) => {
  const s = sim.s;
  if (!on) { if (s.cruise) { s.cruise = false; sim.touch(); } return { ok: true }; }
  if (s.docked) return { ok: false, why: 'docked' };
  if (s.battery <= 0) return { ok: false, why: 'power' };
  if (!superWaterAhead()) return { ok: false, why: 'shallow' };
  s.cruise = true; sim.touch(); return { ok: true };
};
/** Is there deep water under the ship and along the heading (3, 6 and 9 nm ahead)? */
function superWaterAhead() {
  const s = sim.s; if (!seafloor.ready) return false;
  const pts = [[0, 0], ...SUPER_LOOK_NM.map((d) => [d, 0])];
  for (const [d] of pts) {
    const r = (s.heading * Math.PI) / 180, lat = s.lat + (Math.cos(r) * d) / NM_PER_DEG_LAT, lon = s.lon + (Math.sin(r) * d) / (NM_PER_DEG_LAT * Math.cos((s.lat * Math.PI) / 180));
    if (!seafloor.inside(lat, lon)) return d === 0;
    const fl = seafloor.depthAt(lat, lon); if (fl == null || fl < SUPER_MIN_FLOOR) return false;
  }
  return true;
}
sim.setThrottle = (v) => { if (sim.s.docked) return; sim.s.throttle = clamp(v, 0, 1); sim.touch(); };
sim.setHeading = (h) => { sim.s.targetHeading = norm360(h); sim.touch(); };
sim.setDepth = (d) => { if (sim.s.docked) return; sim.s.hug = false; sim.s.avoiding = false; sim.s.targetDepth = clamp(d, 0, 6000); sim.touch(); };   // a depth order ends "hug the floor"
/** "Hug the floor": the helm keeps the ship HUG_ALT metres above the sea floor, looking ahead along the course so it climbs before a rise. */
export const HUG_ALT = 10, HUG_MIN_FLOOR = KEEL + HUG_ALT + 2;
sim.setHug = (on) => {
  const s = sim.s;
  if (!on) { if (s.hug) { s.hug = false; s.targetDepth = Math.round(s.depth); sim.touch(); } return { ok: true }; }
  if (s.docked) return { ok: false, why: 'docked' };
  if (!seafloor.ready || s.floor == null || s.floor < HUG_MIN_FLOOR) return { ok: false, why: 'shallow' };
  s.hug = true; sim.touch(); return { ok: true };
};
const HARBOR_CLEAR = 3;     // metres under the ship the dredged channel guarantees
const hugTarget = (alt = HUG_ALT) => {
  const s = sim.s, ahead = clamp((s.speed / 3600) * 60, 0.08, 4), r = (s.heading * Math.PI) / 180;
  let low = seafloor.depthAt(s.lat, s.lon);
  for (let d = 0.05; d <= ahead + 1e-6; d += 0.05) {
    const f = seafloor.depthAt(s.lat + (d * Math.cos(r)) / NM_PER_DEG_LAT, s.lon + (d * Math.sin(r)) / (NM_PER_DEG_LAT * Math.cos((s.lat * Math.PI) / 180)));
    if (f != null && (low == null || f < low)) low = f;
  }
  return low == null ? null : Math.max(0, low - alt);
};
/** Hug mode: hold HUG_ALT above the floor under the ship. The ship only looks ahead as far as it needs to: it may wait to climb until the rise is
 *  within what it can still climb before reaching it. Also returns the steepest floor gradient (m per m) just ahead, to cap speed on slopes the helm cannot follow. */
const hugHold = () => {
  const s = sim.s, r = (s.heading * Math.PI) / 180, here = seafloor.depthAt(s.lat, s.lon), v = Math.max(s.speed, 0.5) * KT_MPS, climb = 0.9 * diveRate(s.speed, s.cruise);
  if (here == null) return null;
  let t = here - HUG_ALT, g = 0;
  for (let d = 0.02; d <= 4 + 1e-6; d += d < 0.2 ? 0.02 : 0.1) {
    const f = seafloor.depthAt(s.lat + (d * Math.cos(r)) / NM_PER_DEG_LAT, s.lon + (d * Math.sin(r)) / (NM_PER_DEG_LAT * Math.cos((s.lat * Math.PI) / 180)));
    if (f == null) continue;
    const secs = (d * 1852) / v;
    t = Math.min(t, f - HUG_ALT + climb * secs);
    if (d <= 0.6 && d >= 0.1) g = Math.max(g, Math.abs(f - here) / (d * 1852));
    if (secs > 600) break;
  }
  return { t: Math.max(0, t), g };
};
/** Radius (nm) the ship charts in fine detail: sonar on 4, off 0.8 (echo sounder only), active sweep 8. */
sim.fineNm = (s = sim.s) => (s.clock < (s.sweepUntil || 0) ? 8 : s.sonar ? 4 : 0.8);
export const WSKR_CHART_NM = 3;
/** Record what the ship and the WSKRs can see as charted (the fog of war lifts for good). */
function chartSurroundings() {
  const s = sim.s; if (!seafloor.ready) return;
  seafloor.mark('ship', s.lat, s.lon, sim.fineNm(s));
  for (const w of s.wskrs) if (!w.dead) seafloor.mark('w' + w.n, w.lat, w.lon, WSKR_CHART_NM + (wskrPerk(w).chart || 0));
}

/** Is this point safe water for the ship? (Inside the dredged harbour only land stops us.) */
sim.shipPassable = (lat, lon) => {
  const fl = seafloor.depthAt(lat, lon); if (fl == null) return false;
  const dock = sim.dockPoi(); return fl >= (dock && toward({ lat, lon }, dock).nm < HARBOR_NM ? 3 : KEEL + 2);
};
/** Turning points to steer through to reach p without crossing land or shoals: [] = straight line, null = no safe route. */
sim.routeTo = (p) => (seafloor.ready ? planRoute(sim.s, p, sim.shipPassable) : []);
// ---------- the Route ----------
// s.fixes is the Route: an ordered list of fixes from the ship to the destination. A fix is a charted place or a waypoint (WP1, WP2, ...).
// Plotting turns it into s.route, which is what the helm steers through: the fixes themselves, plus turn points (tp) added where the
// straight line between two fixes crosses land or shoals. s.wpt is the destination: the last fix, set only while a course is plotted.
// Taking manual control clears s.wpt but keeps the fixes, so plotting again returns to the route from wherever the ship is.
sim.newFix = ({ lat, lon, depth = null, name = '' }) => { const n = ++sim.s.wpN; return { id: 'wp' + n, type: 'waypoint', text: 'Plotted position', name: name.trim() || 'WP' + n, lat, lon, depth }; };
/** Steering points for s.fixes from the ship: { ok, route, snapped } or { ok: false, why: 'empty' | 'blocked', fix }. */
sim.legsFor = (fixes, from = sim.s) => {
  if (!fixes.length) return { ok: false, why: 'empty' };
  const route = []; let snapped = false;
  for (const f of fixes) {
    const r = seafloor.ready ? planRoute(from, f, sim.shipPassable) : [];
    if (r === null) return { ok: false, why: 'blocked', fix: f };
    for (const q of r.slice(0, -1)) route.push({ lat: q.lat, lon: q.lon, tp: true });
    const end = r.length ? r[r.length - 1] : f; snapped = snapped || !!r.snapped;
    route.push({ lat: end.lat, lon: end.lon, fix: f.id }); from = end;
  }
  return { ok: true, route, snapped };
};
/** Plot a course along the Route from where the ship is now. */
sim.plotRoute = () => {
  const s = sim.s, r = sim.legsFor(s.fixes); if (!r.ok) return r;
  s.wpt = s.fixes[s.fixes.length - 1]; s.route = r.route; s.routeSnapped = r.snapped; s._routeFor = s.wpt; s.targetHeading = toward(s, s.route[0]).brg;
  sim.touch(); return r;
};
/** Replace the Route with one destination and plot it (missions, orders and the Navigation station use this). */
sim.setWpt = (p) => { sim.s.fixes = p ? [p] : []; if (p) sim.plotRoute(); else { sim.s.wpt = null; sim.s.route = []; sim.touch(); } };
sim.clearRoute = () => { const s = sim.s; s.fixes = []; s.wpt = null; s.route = []; sim.touch(); };
sim.stop = () => { sim.s.throttle = 0; sim.touch(); };   // speed only: a plotted course stays
sim.cancelCourse = () => { sim.s.wpt = null; sim.touch(); };   // steering by hand: speed stays and the Route is kept
/** WSKRs: autonomous remote sensors. They hold a ring formation round the ship (better readings, stereoscopic data),
 *  can be sent to investigate a site, and can be recalled. Launched only from the Sensors station. Up to 4.
 *  Each: { n, lat, lon, mode: 'escort' | 'task' | 'recall', target: poi id | null, busy: game seconds spent investigating } */
const WSKR_KT = 16, WSKR_BOOST = 1.25, WSKR_RING_NM = 1.5, WSKR_INVESTIGATE_S = 90;
export const WSKR_LINK_NM = 10, SEARCH_LEG_NM = 0.45, SEARCH_LEGS = 14, WSKR_TURN_DPS = 30;
/** Orders: escort (hold formation), manual (touch control, link range 3 nm from the ship or a relay), search (expanding square),
 *  relay (follows the ship just below the surface and carries comms and a GPS fix when Aqua Nova is deep), task, recall.
 *  Depth is one fleet setting, staggered so no two WSKRs share a layer: auto (the whole water column in equal layers),
 *  shallow (the surface down to just below Aqua Nova), deep (from just above Aqua Nova to the floor).
 *  Formation is one fleet setting, set by how much each WSKR's scan ring overlaps Aqua Nova's: loose 5%, tight 50%; the WSKRs space themselves evenly round the ship.
 *  Battery: 6 hours at normal draw (base speed), 12 and 24 with research; a full recharge in the bay takes 2 hours, in proportion to what was used (`WSKR_BATTERY_H`; research can change it later). */
/** Battery draw factor for a WSKR right now (1 = normal). */
export const wskrDraw = (w) => {
  const base = (WSKR_PERKS[w.n] && WSKR_PERKS[w.n].kt) || WSKR_KT, fast = w.moving && !w.super && w.mode !== 'manual' && w.kt ? (w.kt / base) ** 2 : 1;   // draw rises with the square of speed: 20 kt on a 16 kt craft draws 1.56
  return (w.mode === 'relay' ? 0.6 : w.mode === 'manual' ? 0.7 + 0.6 * (w.thr || 0) : w.moving ? 1 : 0.8) * (w.moving && w.super ? 2.2 : 1) * fast;
};
/** Game minutes of battery left at the current draw (to 0%), and to the 15% auto-recall. */
export const wskrMinutes = (w) => { const per = (100 / (wskrBatteryHours() * 3600)) * wskrDraw(w); const b = w.bat == null ? 100 : w.bat; return { empty: Math.max(0, b / per / 60), recall: Math.max(0, (b - WSKR_LOW_PCT) / per / 60) }; };
export const WSKR_BATTERY_H = 6, WSKR_CHARGE_H = 2, WSKR_LOW_PCT = 15, WSKR_STAGGER_M = 10, WSKR_RELAY_DEPTH = 4;
/** 6 hours; research raises it to 12 and then 24 (science.js sets `sim.batteryHours`). */
export const wskrBatteryHours = () => (sim.batteryHours ? sim.batteryHours() : WSKR_BATTERY_H);
export const WSKR_OVERLAP = { loose: 0.05, tight: 0.5 };
/** Distance between two scan-ring centres (nm) at which the rings overlap by `frac` of the SMALLER ring's area. */
export function ringDistance(r1, r2, frac) {
  const lens = (d) => {
    if (d >= r1 + r2) return 0; if (d <= Math.abs(r1 - r2)) return 1;
    const a = r1 * r1 * Math.acos((d * d + r1 * r1 - r2 * r2) / (2 * d * r1)), b = r2 * r2 * Math.acos((d * d + r2 * r2 - r1 * r1) / (2 * d * r2)), c = 0.5 * Math.sqrt((-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2));
    return (a + b - c) / (Math.PI * Math.min(r1, r2) ** 2);
  };
  let lo = Math.abs(r1 - r2), hi = r1 + r2; for (let k = 0; k < 50; k++) { const m = (lo + hi) / 2; if (lens(m) > frac) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
export const wskrRingNm = (w) => WSKR_CHART_NM + (wskrPerk(w).chart || 0);
/** How far from Aqua Nova a WSKR holds: its scan ring overlaps the SHIP's scan ring (sonar: 4 nm on, 0.8 off, 8 sweep) by 5% (loose) or 50% (tight).
 *  The WSKRs then space themselves evenly round the ship. */
export const formationRadius = (form, w) => ringDistance(sim.fineNm(sim.s), wskrRingNm(w), WSKR_OVERLAP[form] ?? WSKR_OVERLAP.loose);
export const WSKR_DEPTHS = { auto: 'Auto', shallow: 'Shallow', deep: 'Deep' };
export const WSKR_NAMES = ['Scout', 'Lantern', 'Drifter', 'Sprat'];
export const WSKR_CODES = ['Sc', 'La', 'Dr', 'Sp'];   // two-letter labels on the navigation display   // placeholders, our own names
/** Each WSKR has a small edge that fits its name. Sizes are small on purpose. */
export const WSKR_PERKS = {
  1: { text: 'Scout charts the sea floor further out (+0.6 nm).', chart: 0.6 },
  2: { text: 'Lantern holds the lead, ahead of the ship.', lead: true },
  3: { text: 'Drifter swings wide, drifting in and out of the loose formation.', drift: true },
  4: { text: 'Sprat is quicker (19 kt) and finishes a site in 70 s.', kt: 19, investigate: 70 },
};
/** A WSKR as a craft for the craft page: position, heading, depth (about 12 m above the floor, at most 40 m) and speed. */
/** Depth of a WSKR: relays sit just under the surface; the rest are staggered through their band. */
export function wskrDepthFor(w) {
  if (w.surfaced) return 1;   // up at the surface, trying to get comms back
  const st = sim.s, fl = seafloor.ready ? seafloor.depthAt(w.lat, w.lon) : null; if (fl == null) return 10;
  const bot = Math.max(2, fl - 3);
  if (w.mode === 'relay') return Math.min(WSKR_RELAY_DEPTH, bot);
  const list = st.wskrs.filter((q) => q.mode !== 'relay').sort((a, b) => a.n - b.n), N = list.length || 1, i = Math.max(0, list.indexOf(w));
  let lo = 2, hi = bot;
  if (st.wskrDepth === 'shallow') hi = Math.min(bot, Math.max(lo + 4, st.depth + WSKR_STAGGER_M));
  else if (st.wskrDepth === 'deep') lo = Math.min(bot, Math.max(2, st.depth - WSKR_STAGGER_M));
  return Math.max(2, Math.min(bot, Math.round(lo + ((hi - lo) * (i + 0.5)) / N)));
}
export const wskrCraft = (w) => ({ lat: w.lat, lon: w.lon, heading: w.heading == null ? sim.s.heading : w.heading, depth: wskrDepthFor(w), kt: w.moving ? (w.super ? WSKR_SUPER_KT * ((wskrPerk(w).kt || WSKR_KT) / WSKR_KT) : w.kt || wskrPerk(w).kt || WSKR_KT) : 0 });
sim.recallWskr = (n) => { const w = sim.s.wskrs.find((q) => q.n === n); if (!w) return false; w.mode = 'recall'; w.target = null; w.route = null; sim.touch(); return true; };
/** Give an order to one WSKR. order: 'escort' | 'manual' | 'search' | 'relay'. Returns false if there is no such WSKR. */
sim.orderWskr = (n, order) => {
  const w = sim.s.wskrs.find((q) => q.n === n); if (!w || !['escort', 'manual', 'search', 'relay'].includes(order)) return false;
  w.mode = order; w.target = null; w.route = null; w.thr = 0; w.turn = 0; w.limited = false; w.cruise = false;
  if (w.heading == null) w.heading = sim.s.heading;
  if (order === 'search') w.pat = { lat: w.lat, lon: w.lon, k: 1, t: 0 };
  sim.touch(); return true;
};
sim.setWskrDepth = (dep) => { if (!WSKR_DEPTHS[dep]) return false; sim.s.wskrDepth = dep; sim.touch(); return true; };
sim.setWskrForm = (f) => { if (f !== 'loose' && f !== 'tight') return false; sim.s.wskrForm = f; sim.s.wskrs.forEach((w) => { if (w.mode === 'escort') w.route = null; }); sim.touch(); return true; };
/** Manual helm: turn -1/0/1 (held), thr 0..1 (share of top speed). */
sim.wskrHelm = (n, { turn, thr } = {}) => { const w = sim.s.wskrs.find((q) => q.n === n); if (!w || w.mode !== 'manual') return false; if (turn != null) w.turn = turn; if (thr != null) w.thr = Math.max(0, Math.min(1, thr)); return true; };
/** Control link: distance to the nearest of the ship and any relay WSKR (not itself). */
/** Control link to a WSKR. `raw` = within range of the ship or a relay. A WSKR that has surfaced after losing the link for WSKR_LOST_MIN game minutes talks over the surface link, so `ok` holds until it is back in range. */
export const WSKR_LOST_MIN = 10;
sim.wskrLink = (w, at = w) => { const s = sim.s; let nm = toward(s, at).nm; for (const r of s.wskrs) if (r !== w && r.mode === 'relay' && !r.dead) nm = Math.min(nm, toward(r, at).nm); const raw = nm <= WSKR_LINK_NM; return { nm, max: WSKR_LINK_NM, raw, ok: raw || !!w.surfaced, surfaced: !!w.surfaced }; };
/** A relay WSKR following within link range lets the ship use its antennas as if it were at the surface (comms) and gives a GPS fix. */
sim.relayUp = () => { const s = sim.s, t = s.shuttle; return s.depth <= 2000 && (s.wskrs.some((w) => w.mode === 'relay' && !w.dead && toward(s, w).nm <= WSKR_LINK_NM) || !!(t && t.state === 'out' && t.mode === 'relay' && !t.dead && (t.depth || 0) < 3 && toward(s, t).nm <= WSKR_LINK_NM)); };   // a relay WSKR, or the Tern up at the surface as a relay
sim.hasGps = () => sim.s.depth <= 15 || sim.relayUp();
/** Set up a relay for the Captain: the nearest WSKR holding formation (or none). Returns { ok, why, wskr }. */
sim.setupRelay = () => {
  const s = sim.s; if (s.wskrs.some((w) => w.mode === 'relay' && !w.dead)) return { ok: false, why: 'already' };
  if (!s.wskrs.length) return { ok: false, why: 'none' };
  const free = s.wskrs.filter((w) => (w.mode === 'escort' || w.mode === 'search') && !w.dead).sort((a, b) => toward(s, a).nm - toward(s, b).nm)[0];
  if (!free) return { ok: false, why: 'busy' };
  sim.orderWskr(free.n, 'relay'); return { ok: true, wskr: free };
};
sim.standDownRelay = () => { const w = sim.s.wskrs.find((q) => q.mode === 'relay'); if (!w) return { ok: false }; sim.orderWskr(w.n, 'escort'); return { ok: true, wskr: w }; };
function searchPoint(p, k) {
  let x = 0, y = 0; const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  for (let i = 0; i < k; i++) { const len = SEARCH_LEG_NM * (Math.floor(i / 2) + 1), d = dirs[i % 4]; x += d[0] * len; y += d[1] * len; }
  return { lat: p.lat + y / NM_PER_DEG_LAT, lon: p.lon + x / (NM_PER_DEG_LAT * Math.cos((p.lat * Math.PI) / 180)) };
}
export const wskrPerk = (w) => WSKR_PERKS[w.n] || {};
export const wskrName = (w) => w.name || WSKR_NAMES[w.n - 1] || `WSKR ${w.n}`;
/** Put a WSKR in the water at once (the bay's one-minute launch ends here). It takes the charge its rack slot has reached. */
sim.deployWskr = (want) => {
  const s = sim.s;
  if (s.docked) return { ok: false, why: 'docked' };
  if (s.wskrs.length >= 4) return { ok: false, why: 'full' };
  const used = new Set(s.wskrs.map((w) => w.n)); let n = want && !used.has(want) ? want : 1; while (used.has(n)) n++;
  const rack = s.rack || (s.rack = {}), bat = rack[n] == null ? 100 : rack[n]; delete rack[n];
  s.wskrs.push({ n, lat: s.lat, lon: s.lon, mode: 'escort', target: null, busy: 0, bat }); sim.touch(); return { ok: true, n };
};
sim.taskWskr = (poi, n) => {
  const w = sim.s.wskrs.find((q) => (n ? q.n === n && !q.dead && q.mode !== 'recall' && !q.arrived : q.mode === 'escort'));
  if (!w) return null;
  w.mode = 'task'; w.target = poi.id; w.busy = 0; w.route = null; sim.touch(); return w;
};
/** Send a WSKR to investigate a sonar contact (ref { kind: 'ship' | 'inst', id }). It closes to WSKR_TRAIL_NM (inside camera range, so it can identify), then stays with the contact
 *  until it is released (sim.orderWskr, recall, or another task), or until the contact has been out of sight for 2 minutes. n: a particular WSKR, else the nearest free one. */
sim.trailWskr = (ref, n) => {
  const s = sim.s, free = s.wskrs.filter((q) => !q.dead && !q.arrived && (n ? q.n === n && q.mode !== 'recall' : q.mode === 'escort')).sort((a, b) => toward(s, a).nm - toward(s, b).nm);
  const w = free[0]; if (!w) return null;
  w.mode = 'trail'; w.trail = { kind: ref.kind, id: String(ref.id), last: null, seen: s.clock, said: false }; w.target = null; w.route = null; sim.touch(); return w;
};
const WSKR_TRAIL_NM = 1.0;   // how close a WSKR stands off a contact it investigates
/** Where the contact a WSKR is trailing is now (it hears it, so it knows); the last place for 2 minutes after it is lost, then null. */
function trailPoint(w) {
  const s = sim.s, tr = w.trail; if (!tr) return null;
  const p = tr.kind === 'ship' ? ((sim.traffic && sim.traffic.active) || []).find((a) => String(a.v.id) === tr.id) : s.pois.find((q) => String(q.id) === tr.id);
  if (p) { tr.last = { lat: p.lat, lon: p.lon }; tr.seen = s.clock; return tr.last; }
  return s.clock - tr.seen < 120 ? tr.last : null;
}
sim.trailing = (kind, id) => sim.s.wskrs.filter((w) => w.mode === 'trail' && w.trail && w.trail.kind === kind && w.trail.id === String(id));
sim.recallWskrs = () => { sim.s.wskrs.forEach((w) => { w.mode = 'recall'; w.target = null; w.route = null; }); sim.touch(); return sim.s.wskrs.length; };
const wskrPassable = (lat, lon) => (seafloor.depthAt(lat, lon) ?? 0) >= 3;
/** Nearest point of water (at least 3 m deep) within about 1.5 nm, searching outward in rings. */
function nearestWater(lat, lon) {
  for (let r = 0.02; r <= 1.5; r += 0.02) for (let a = 0; a < 360; a += 20) {
    const y = lat + (r * Math.cos((a * Math.PI) / 180)) / NM_PER_DEG_LAT, x = lon + (r * Math.sin((a * Math.PI) / 180)) / (NM_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180));
    if (wskrPassable(y, x)) return { lat: y, lon: x };
  }
  return null;
}
function stepWskrs(dt) {
  const s = sim.s; if (!s.wskrs.length) return;
  const esc = s.wskrs.filter((w) => w.mode === 'escort').sort((a, b) => (wskrPerk(b).lead ? 1 : 0) - (wskrPerk(a).lead ? 1 : 0));
  s.wskrs = s.wskrs.filter((w) => {
    w.moving = false;
    if (w.bat == null) w.bat = 100;
    if (w.arrived) { w.lat = s.lat; w.lon = s.lon; return true; }   // alongside the bay, waiting to be taken aboard (bayops.js)
    if (w.dead) { if (toward(s, w).nm < 0.15) w.arrived = true; return true; }   // adrift: the ship must come to it
    if (seafloor.ready && !wskrPassable(w.lat, w.lon)) { const sp = nearestWater(w.lat, w.lon); if (sp) { w.lat = sp.lat; w.lon = sp.lon; w.route = null; } }   // never sit on land (after a load, a ship move, or a thin spit)
    let goal = null; const perk = wskrPerk(w), kf = (perk.kt || WSKR_KT) / WSKR_KT; let step = (((perk.kt || WSKR_KT) * dt) * TIMESCALE) / 3600;
    const ring = formationRadius(s.wskrForm, w) * (perk.drift && s.wskrForm !== 'tight' ? 1 + 0.35 * (0.5 + 0.5 * Math.sin((s.clock / 3600) * 2 * Math.PI)) : 1);
    { // battery: 6 h at normal draw; holding station and relaying draw less, hard running draws more
      const draw = wskrDraw(w);
      w.bat = Math.max(0, w.bat - (100 / (wskrBatteryHours() * 3600)) * draw * dt * TIMESCALE);
      if (w.bat <= 0) { w.dead = true; w.mode = 'recall'; w.route = null; sim.emit('wskr-dead', w); return true; }
      if (w.bat <= WSKR_LOW_PCT && w.mode !== 'recall') { w.mode = 'recall'; w.target = null; w.route = null; w.thr = 0; w.low = true; sim.emit('wskr-low', w); }   // low: the bay sends it out again once it is charged
    }
    { // control link: 10 game minutes out of range and the WSKR surfaces to get comms back; back in range, it dives again
      const lk = sim.wskrLink(w);
      if (lk.raw) { w.lostAt = null; if (w.surfaced) { w.surfaced = false; sim.emit('wskr-link-back', w); } }
      else if (w.lostAt == null) { w.lostAt = s.clock; sim.emit('wskr-link-lost', w); }
      else if (!w.surfaced && s.clock - w.lostAt >= WSKR_LOST_MIN * 60) { w.surfaced = true; sim.emit('wskr-surfaced', w); }
    }
    if (w.mode === 'manual') {
      w.super = !!w.cruise; const kt = (w.cruise ? WSKR_SUPER_KT * kf : (perk.kt || WSKR_KT)) * (w.thr || 0), nm = (kt * dt * TIMESCALE) / 3600;
      w.heading = (((w.heading == null ? s.heading : w.heading) + (w.turn || 0) * WSKR_TURN_DPS * dt * pace()) % 360 + 360) % 360;
      if (nm > 0 && seafloor.ready) {
        w.limited = false;
        const a = (w.heading * Math.PI) / 180, lat = w.lat + (Math.cos(a) * nm) / NM_PER_DEG_LAT, lon = w.lon + (Math.sin(a) * nm) / (NM_PER_DEG_LAT * Math.cos((w.lat * Math.PI) / 180));
        let clear = true, nl; const pieces = Math.max(1, Math.ceil(nm / 0.02));
        for (let k = 1; clear && k <= pieces; k++) clear = wskrPassable(w.lat + ((lat - w.lat) * k) / pieces, w.lon + ((lon - w.lon) * k) / pieces);
        if (!clear) { w.thr = 0; w.blockedNow = true; }
        else if (!(nl = sim.wskrLink(w, { lat, lon })).ok && nl.nm > sim.wskrLink(w).nm) { w.thr = 0; w.limited = true; }
        else { w.lat = lat; w.lon = lon; w.moving = true; w.blockedNow = false; }
      }
      return true;
    }
    if (w.mode === 'escort') { const i = esc.indexOf(w), a = ((s.heading + (360 / esc.length) * i + (wskrPerk(esc[0]).lead ? 0 : 45)) * Math.PI) / 180; goal = { lat: s.lat + (Math.cos(a) * ring) / NM_PER_DEG_LAT, lon: s.lon + (Math.sin(a) * ring) / (NM_PER_DEG_LAT * Math.cos((s.lat * Math.PI) / 180)) }; }
    else if (w.mode === 'search') goal = searchPoint(w.pat || (w.pat = { lat: w.lat, lon: w.lon, k: 1, t: 0 }), w.pat.k);
    else if (w.mode === 'relay') goal = s;                          // follows the ship, just under the surface
    else if (w.mode === 'trail') { goal = trailPoint(w); if (!goal) { w.mode = 'escort'; w.trail = null; w.route = null; sim.emit('wskr-trail-lost', w); return true; } }
    else if (w.mode === 'task') { goal = s.pois.find((p) => p.id === w.target); if (!goal) { w.mode = 'escort'; return true; } }
    else goal = s;
    w.super = !!s.cruise || toward(w, goal).nm > WSKR_FAR_NM;      // far to go, or the ship is in super cruise: super cruise too
    w.kt = perk.kt || WSKR_KT;
    if (w.super) step = (WSKR_SUPER_KT * kf * dt * TIMESCALE) / 3600;
    else {
      // Base speed 16 kt (Sprat 19). A recall boosts it to 1.25 times (20 kt). Escorts and relays that fall behind a fast ship boost too, up to ship speed + 4.
      const boost = w.kt * WSKR_BOOST, far = toward(w, goal).nm > 0.3;
      if (w.mode === 'recall') w.kt = boost;
      else if ((w.mode === 'escort' || w.mode === 'relay') && far && s.speed > w.kt - 3) w.kt = Math.min(boost, Math.max(w.kt, s.speed + 4));
      step = (w.kt * dt * TIMESCALE) / 3600;
    }
    w.chase = w.kt > (perk.kt || WSKR_KT) ? w.kt : 0;
    // Route round land. Replanned when the goal has moved on (escorts and recalls follow the ship) or after a failed attempt.
    if (!w.route || (w.routeGoal && toward(w.routeGoal, goal).nm > 0.6) || (w.routeRetry != null && s.clock >= w.routeRetry)) {
      const r = seafloor.ready ? planRoute(w, goal, wskrPassable) : [];
      w.route = r ? [...r] : []; w.routeSnapped = !!(r && r.snapped); w.routeGoal = { lat: goal.lat, lon: goal.lon }; w.routeRetry = r ? null : s.clock + 300;
    }
    while (w.route.length > 1 && toward(w, w.route[0]).nm < 0.12) w.route.shift();
    const end = w.route.length ? w.route[w.route.length - 1] : goal, t = toward(w, goal), te = toward(w, end);
    const onSite = w.routeSnapped ? te.nm < 0.12 : t.nm < 0.12;
    if (w.mode === 'recall' && (t.nm < 0.15 || (w.routeSnapped && te.nm < 0.15))) { w.arrived = true; w.moving = false; return true; }
    if (w.mode === 'task' && onSite) {          // on site: investigate, then file the scan and rejoin
      w.busy += dt * TIMESCALE;
      if (w.busy >= (perk.investigate || WSKR_INVESTIGATE_S)) { const p = s.pois.find((q) => q.id === w.target); w.mode = 'escort'; w.target = null; w.route = null; sim.emit('wskr-found', { wskr: w, poi: p }); }
      return true;
    }
    if (w.mode === 'search') {                  // expanding square: next corner when this one is reached (or after 30 game minutes)
      w.pat.t += dt * TIMESCALE;
      if (onSite || w.pat.t > 1800) { w.pat.k++; w.pat.t = 0; w.route = null; if (w.pat.k > SEARCH_LEGS) { w.mode = 'escort'; w.pat = null; sim.emit('wskr-search-done', w); } return true; }
    }
    const aim = w.route[0] || goal, ta = toward(w, aim);
    if (ta.nm > 0.02 && !(w.mode === 'escort' && t.nm < 0.05) && !(w.mode === 'relay' && t.nm < 0.1) && !(w.mode === 'trail' && t.nm < WSKR_TRAIL_NM)) {
      const f = Math.min(1, step / ta.nm), lat = w.lat + (aim.lat - w.lat) * f, lon = w.lon + (aim.lon - w.lon) * f;
      // walk the step in small pieces so a thin strip of land cannot be jumped; no data yet means hold still
      let clear = seafloor.ready; const pieces = Math.max(1, Math.ceil(Math.min(step, ta.nm) / 0.02));
      for (let k = 1; clear && k <= pieces; k++) clear = wskrPassable(w.lat + ((lat - w.lat) * k) / pieces, w.lon + ((lon - w.lon) * k) / pieces);
      if (clear) { w.heading = toward(w, { lat, lon }).brg; w.moving = true; w.lat = lat; w.lon = lon; w.blocked = 0; }
      else if ((w.blocked = (w.blocked || 0) + 1) > 8) { w.route = null; w.blocked = 0; }   // boxed in: plan again   // small probes stay out of the very shallows
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
  const byHeading = headingErrDeg > 60 ? 1 : headingErrDeg > 25 ? 1.5 : headingErrDeg > 10 ? 3 : sim.maxKt();
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
    const turn = angDiff(tw.brg, heading), rate = turnDps(speed) * dt * pace();
    heading = norm360(heading + clamp(turn, -rate, rate));
    const want = Math.min(s.throttle * sim.maxKt(), autopilotCap(Math.abs(turn), route.length > 1 ? Infinity : end.nm));
    speed += clamp(want - speed, -(s.cruise ? 6 : 2) * dt * pace(), (s.cruise ? 3 : 1.2) * dt * pace());
    const nm = (speed * dt * TIMESCALE) / 3600, r = (heading * Math.PI) / 180;
    lat += (nm * Math.cos(r)) / NM_PER_DEG_LAT; lon += (nm * Math.sin(r)) / (NM_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180));
  }
  return null;
};

sim.hooks = [];   // extra per-step work added by other modules (the Science ROV)
const stepOnce = (dt) => {
  const s = sim.s;
  s.clock += dt * TIMESCALE;
  if (s.cruise) {                                // super cruise drops out when it is no longer safe
    const why = s.docked ? 'docked' : s.battery <= 0 ? 'power' : !superWaterAhead() ? 'shallow' : null;
    if (why) { s.cruise = false; sim.emit('cruise-off', { why }); }
  }
  if (s.docked) { s.throttle = 0; s.speed = 0; s.targetDepth = 0; s.wpt = null; }   // clamps hold the ship
  // heading
  let capDist = Infinity;
  if (!s.wpt) { s.route = []; s._routeFor = null; }
  else {
    if (s._routeFor !== s.wpt) { if (s.fixes[s.fixes.length - 1] !== s.wpt) s.fixes = [s.wpt]; if (!sim.plotRoute().ok) s.wpt = null; }   // the destination is always the last fix; after a load the steering points are rebuilt from the Route
    while (s.route.length > 1 && toward(s, s.route[0]).nm < 0.25) { const q = s.route.shift(); if (q.fix) s.fixes = s.fixes.filter((f) => f.id !== q.fix); }   // a fix we have passed leaves the Route
    const end = s.route.length ? s.route[s.route.length - 1] : s.wpt, t = toward(s, end);
    if (t.nm < POI_RADIUS_NM * 0.6) { s.wpt = null; s.route = []; s.fixes = []; s.throttle = 0; sim.emit('arrived'); }
    else { const steer = toward(s, s.route[0] || s.wpt); s.targetHeading = steer.brg; capDist = s.route.length > 1 ? Infinity : t.nm; }
  }
  const turn = angDiff(s.targetHeading, s.heading);
  const rate = turnDps(s.speed) * dt * pace();
  s.heading = norm360(s.heading + clamp(turn, -rate, rate));
  // speed (smooth)
  let wantKt = s.throttle * sim.maxKt() * (s.battery > 0 ? 1 : 0);
  if (s.depth < SURFACE_M) wantKt = Math.min(wantKt, SURFACE_KT);
  { let held = false; for (const f of sim.speedCaps) { const c = f(s); if (c != null && wantKt > c) { wantKt = c; held = true; if (!s.speedCapSaid) { s.speedCapSaid = true; sim.emit('speed-cap', { kt: c }); } } } if (!held) s.speedCapSaid = false; }   // a limit is held and the Captain told, unless overridden
  // hugging a steep floor: slow down until the climb or dive needed to follow it is one the ship can make
  if (s.hug && s.hugG > 0.05 && (s.hugG > 0.85 * PITCH_TAN || s.hugG * KT_MPS * s.speed > 0.85 * MAX_DIVE_MPS)) wantKt = Math.min(wantKt, Math.max(1, (0.85 * (s.hugG > 0.85 * PITCH_TAN ? HOVER_MPS : MAX_DIVE_MPS)) / (s.hugG * KT_MPS)));
  if (s.wpt) wantKt = Math.min(wantKt, autopilotCap(Math.abs(turn), capDist));
  s.speed += clamp(wantKt - s.speed, -(s.speed > MAX_KT ? 6 : 2) * dt * pace(), (s.cruise ? 3 : 1.2) * dt * pace());
  // depth
  if (s.hug) {
    const hold = s.docked || !seafloor.ready ? null : hugHold(), t = hold ? hold.t : null;
    s.hugG = hold ? hold.g : 0;
    if (t == null || (s.floor != null && s.floor < HUG_MIN_FLOOR)) { s.hug = false; sim.emit('hug-off', { why: s.docked ? 'docked' : 'shallow' }); }
    else s.targetDepth = Math.round(t);
  }
  // Terrain protection: the helm never lets a depth order put the ship into the floor. If the ground within a minute
  // of travel is shallower than the ordered depth, it holds HUG_ALT above it; when the ground falls away it goes back
  // to the ordered depth (never deeper). s.targetDepth stays the Captain's order.
  let want = s.targetDepth;
  if (!s.hug && !s.docked && s.autoAvoid !== false && seafloor.ready && seafloor.inside(s.lat, s.lon)) {
    const dock = sim.dockPoi(), harbor = dock && toward(s, dock).nm < HARBOR_NM, lim = hugTarget(harbor ? HARBOR_CLEAR : HUG_ALT);   // in the harbour a shallower margin, but never into the floor
    if (lim != null && lim < s.targetDepth) {
      want = lim;
      if (!s.avoiding) { s.avoiding = true; const now = Date.now(); if (now - (sim.lastAvoid || 0) > 20000) { sim.lastAvoid = now; sim.emit('avoid-on', { margin: harbor ? HARBOR_CLEAR : HUG_ALT, hold: Math.round(lim), ordered: Math.round(s.targetDepth), ahead: s.speed > 0.5 }); } }
    } else if (s.avoiding) { s.avoiding = false; if (Date.now() - (sim.lastAvoid || 0) > 3000) sim.emit('avoid-off', { ordered: Math.round(s.targetDepth) }); }
  } else s.avoiding = false;
  for (const f of sim.depthCaps) { const c = f(s); if (c != null && want > c) { want = c; if (!s.capSaid) { s.capSaid = true; sim.emit('depth-cap', { depth: c }); } } }
  if (want <= 0 || s.depth < 5) s.capSaid = false;
  const dd = want - s.depth;
  const vz = diveRate(s.speed, s.cruise) * dt * pace();
  s.depth = clamp(s.depth + clamp(dd, -vz, vz), 0, 6000);
  // move, then check the sea floor
  const prevLat = s.lat, prevLon = s.lon;
  const nm = (s.speed * dt * TIMESCALE) / 3600;
  const r = (s.heading * Math.PI) / 180;
  s.lat += (nm * Math.cos(r)) / NM_PER_DEG_LAT;
  s.lon += (nm * Math.sin(r)) / (NM_PER_DEG_LAT * Math.cos((s.lat * Math.PI) / 180));
  if (seafloor.ready && !s.docked) {
    const dock = sim.dockPoi(), harbor = dock && toward(s, dock).nm < HARBOR_NM;
    let hit = null;
    if (nm > 0) {   // Area of Operations: warn once when the limit is about to be reached (six nautical miles ahead, or two minutes at this speed)
      const look = Math.max(AO_WARN_NM, (s.speed * 2) / 60);
      const out = !seafloor.inside(s.lat + (Math.cos(r) * look) / NM_PER_DEG_LAT, s.lon + (Math.sin(r) * look) / (NM_PER_DEG_LAT * Math.cos((s.lat * Math.PI) / 180)));
      if (out && !sim.aoNear) sim.emit('bump', { kind: 'ao-near', nm: look });
      sim.aoNear = out;
    }
    if (!seafloor.inside(s.lat, s.lon)) hit = nm > 0 ? 'edge' : null;
    else {
      const fl = seafloor.depthAt(s.lat, s.lon), keel = harbor ? HARBOR_CLEAR : KEEL;
      if (!harbor && fl < KEEL) hit = nm > 0 ? 'shoal' : null;   // a ship that is not moving cannot run aground
      else if (s.depth > fl - keel) { s.depth = Math.max(0, fl - keel); if (!sim.onBottom) hit = 'bottom'; sim.onBottom = true; }
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
  for (const h of sim.hooks) h(dt);
  chartSurroundings();
  // systems
  s.power = Math.min(100, 8 + (Math.min(s.speed, MAX_KT) / MAX_KT) * 70 + (s.lights ? 5 : 0) + (s.sonar ? 4 : 0) + Math.max(0, s.speed - MAX_KT) / (SUPER_KT - MAX_KT) * 18);
  if (s.docked) { // shore power and air: about 20% battery and 30% oxygen per game hour
    const gh = (dt * TIMESCALE) / 3600;
    s.battery = clamp(s.battery + 20 * gh, 0, 100); s.oxygen = clamp(s.oxygen + 30 * gh, 0, 100);
    s.scrubbers = clamp((s.scrubbers == null ? 100 : s.scrubbers) + 50 * gh, 0, 100);   // fresh scrubber canisters come aboard
  } else {
    s.battery = clamp(s.battery - (s.power / 100) * (1 + Math.max(0, s.speed - MAX_KT) / (SUPER_KT - MAX_KT) * 2) * 0.012 * dt * TIMESCALE / 30, 0, 100);
    if (s.scrubbers == null) s.scrubbers = 100;
    const gs = dt * TIMESCALE;
    if (s.depth < SURFACE_M) s.oxygen = clamp(s.oxygen + 30 * gs / 3600, 0, 100);   // on the surface: fresh air, and the scrubbers are not used
    else if (s.scrubbers > 0) s.scrubbers = clamp(s.scrubbers - 100 * gs / (SCRUB_DAYS * 86400), 0, 100);   // submerged: single-use CO2 scrubbers wear out (months)
    else s.oxygen = clamp(s.oxygen - 100 * gs / (12 * 3600), 0, 100);   // scrubbers spent: the air goes bad in about 12 hours
  }
  s.co2 = clamp(0.04 + (100 - (s.scrubbers == null ? 100 : s.scrubbers)) * 0.012 + (100 - s.oxygen) * 0.012, 0, 5);
  s.temp = clamp(20 - Math.sqrt(s.depth) * 0.28, 1.5, 20);
  if (s.docked) s.damage = Math.max(0, s.damage - 6 * (dt * TIMESCALE) / 3600);   // the dock crew repair about 6% an hour
  s.hull = clamp(100 - s.damage - Math.max(0, s.depth - CRUSH_M * 0.8) / 30, 0, 100);   // pressure strain starts at 80% of crush depth
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
/** The game's calendar date and time, for example "16 AUG 2076  06:00:12". */
/** Day 1 of the game is 50 years after the day the game was first started. The date is kept with the logbook (`epoch`);
 *  this default only holds until the logbook is loaded. */
export const timeBase = { epoch: Date.UTC(2074, 7, 16) };
export const gameNowISO = (secs = sim.s.clock) => new Date(timeBase.epoch + secs * 1000).toISOString();
export const gameDateText = (secs = sim.s.clock) => {
  const d = new Date(timeBase.epoch + secs * 1000), p2 = (n) => String(n).padStart(2, '0');
  return `${p2(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}  ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}`;
};
export const clockText = (secs = sim.s.clock) => `Day ${Math.floor(secs / 86400) + 1} ${String(Math.floor(secs / 3600) % 24).padStart(2, '0')}:${String(Math.floor(secs / 60) % 60).padStart(2, '0')}`;

/** One update. A long step is cut into pieces of about 8 game seconds or less, so fast ships and high time compression stay safe. */
sim.afterStep = [];   // functions run once after each update (traffic)
sim.step = (dt) => { const n = Math.max(1, Math.ceil((dt * TIMESCALE) / 8)); for (let i = 0; i < n; i++) stepOnce(dt / n); for (const f of sim.afterStep) f(dt); };

/** Sleep: jump the game forward. The ship keeps its course, speed and destination, so a long
 *  transit takes less of the player's time. The crew wake the player early for an emergency, or on arrival.
 *  Returns { hours, reason, arrived }: reason is an emergency text, arrived is the destination name. */
sim.warp = (hours) => {
  const s = sim.s, total = hours * 3600, stepGame = s.cruise ? 6 : 15;   // 15 game seconds per step
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

sim.emit = (type, data) => sim.listeners.forEach((fn) => { if (sim.muted && !fn.keep) return; try { fn(type, data); } catch (e) { console.error(e); } });   // muted: the crew catching up while the app was closed (away.js) do not chatter at the screen

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
