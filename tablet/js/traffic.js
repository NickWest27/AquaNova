// Marine traffic. Cheap by design: no vessel is simulated until the Captain is near it.
//  - The sea is cut into cells of about 20 nm. A cell's vessels come from a seeded random generator (seed + cell), so the same sea
//    appears every time, nothing is stored but the seed, and a ship that sinks is remembered in `world.sunk`.
//  - A vessel sails back and forth along a leg, and its position is a pure function of the game clock (sleeping and time compression cost nothing).
//  - Only vessels inside the active bubble (10 nm, at most 12) are looked at each frame. Collision is tested inside 0.05 nm.
//  - Outside the Area of Operations (no chart) there is no traffic: a vessel is hidden wherever the chart has no data.
//  - Hostile vessels carry a boldness from 0 (runs) to 1 (fights). Inside 6 nm the bold ones close in and the timid ones run.
import { sim, toward } from './sim.js';
import { seafloor } from './seafloor.js';
import { gameState } from './persist.js';
import { say } from './notify.js';

const NM = 60, LON_K = 0.82;   // nm per degree of latitude; a fixed squash so cells are roughly square in the mid-latitudes
/** Gates other modules set: is the VHF mast up high enough to hear AIS? */
export const gates = { ais: () => true };
export const traffic = { cfg: null, cells: new Map(), cand: [], scripted: [], candKey: '', active: [], sunk: new Set(), known: new Map(), rand: Math.random, ready: false, stats: { active: 0, cells: 0, ms: 0 }, lastClock: null };
const mulberry = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const mix = (seed, x, y) => (Math.imul(seed ^ 0x9E3779B1, 0x85EBCA6B) ^ Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) | 0;
const pick = (rng, a) => a[Math.floor(rng() * a.length)];
const between = (rng, [lo, hi]) => lo + rng() * (hi - lo);
const flat = (a, b) => { const dy = (b.lat - a.lat) * NM, dx = (b.lon - a.lon) * NM * LON_K; return Math.hypot(dx, dy); };
const toLat = (nm) => nm / NM, toLon = (nm) => nm / (NM * LON_K);
// Sensing and movement near the ship use the same flat-earth scale as the chart and the log (cos of the ship's latitude), so bearings and fixes line up on the map. Cell building keeps the fixed scale so the sea does not depend on where you are.
let SK = LON_K;
const dist = (a, b) => { const dy = (b.lat - a.lat) * NM, dx = (b.lon - a.lon) * NM * SK; return Math.hypot(dx, dy); };
const toLonS = (nm) => nm / (NM * SK);
const seedOf = () => { let s = gameState.getProperty('world.seed'); if (s == null) { s = Math.floor(Math.random() * 2147483647); gameState.updateProperty('world.seed', s); } return s | 0; };

export async function load() {
  traffic.cfg = await (await fetch(new URL('../../data/world/traffic.json', import.meta.url))).json();
  traffic.sunk = new Set(gameState.getProperty('world.sunk') || []);
  // ships on file (identified at least once): id -> { t: last heard, lat, lon, i: 1 identified track, 0..1 probable, 0 none }. Old saves held a plain list of ids.
  const kn = gameState.getProperty('world.known');
  traffic.known = new Map(Array.isArray(kn) ? kn.map((id) => [id, { t: -1e12, lat: 0, lon: 0, i: 0 }]) : Object.entries(kn || {}));
  for (const w of gameState.getProperty('world.wrecks') || []) if (!sim.s.pois.some((p) => p.name === w.name)) sim.s.pois.push({ id: sim.s.pois.length, type: 'wreck', text: w.text, name: w.name, lat: w.lat, lon: w.lon, sunkId: w.id });
  traffic.cells.clear(); traffic.candKey = ''; traffic.ready = true;
}

// ---- one cell's vessels ----
function zoneOf(c, lat, lon) {
  const d = seafloor.depthAt(lat, lon), here = { lat, lon };
  let lane = 0;
  for (const L of c.lanes) for (let i = 0; i + 1 < L.pts.length; i++) {
    const a = { lat: L.pts[i][0], lon: L.pts[i][1] }, b = { lat: L.pts[i + 1][0], lon: L.pts[i + 1][1] };
    const ab = { x: (b.lon - a.lon) * LON_K, y: b.lat - a.lat }, ap = { x: (lon - a.lon) * LON_K, y: lat - a.lat };
    const t = Math.max(0, Math.min(1, (ap.x * ab.x + ap.y * ab.y) / (ab.x * ab.x + ab.y * ab.y || 1)));
    const dn = Math.hypot(ap.x - ab.x * t, ap.y - ab.y * t) * NM; lane = Math.max(lane, 1 - dn / c.density.lane_width_nm);
  }
  let port = 0; for (const p of sim.s.pois) if (p.type === 'dock' && (p.kind === 'port' || p.kind === 'base')) port = Math.max(port, 1 - flat(here, p) / c.density.port_radius_nm);
  return { shelf: d != null && d < 200, lane: Math.max(0, lane), port: Math.max(0, port) };
}
function buildCell(cx, cy) {
  const c = traffic.cfg, rng = mulberry(mix(seedOf(), cx, cy)), cellDegLat = c.cell_nm / NM, cellDegLon = toLon(c.cell_nm);
  const lat0 = cy * cellDegLat, lon0 = cx * cellDegLon, out = [], mid = { lat: lat0 + cellDegLat / 2, lon: lon0 + cellDegLon / 2 };
  if (!seafloor.ready || !seafloor.inside(mid.lat, mid.lon)) return out;   // off the chart: no traffic
  const z = zoneOf(c, mid.lat, mid.lon), dn = c.density;
  const dens = dn.open + (z.shelf ? dn.shelf : 0) + z.lane * dn.lane + z.port * dn.port;
  const n = Math.min(dn.per_cell_max, Math.floor(dens + rng()));
  const sites = sim.s.pois.filter((p) => p.kind && c.site_weights[p.kind] && flat(mid, p) < 35);
  const haven = sim.s.pois.find((p) => p.type === 'hideout'), dh = haven ? flat(mid, haven) : 1e9;
  const make = (i, kind, o = {}) => {
    const k = c.kinds[kind], fac = (sim.world.factions || {})[k.faction] || {}, group = k.faction === 'miners' && o.site ? o.site.faction : k.faction, f2 = (sim.world.factions || {})[group] || fac;
    const fish = kind === 'trawler' && z.shelf && rng() < 0.5;
    const kt = fish ? between(rng, [2, 3.5]) : between(rng, k.kt), leg0 = fish ? between(rng, [2, 6]) : between(rng, k.leg);
    // the whole leg must be over water deep enough for the ship: try other spots and headings (same seed, same answer), then shorter legs
    const minD = Math.max(6, c.draft_m[k.size] * 1.5 + 3);   // harbours are shallow on the chart: small craft need 6 m, big ships more
    let org, hdg, leg = leg0, A, B, ok = false;
    for (let tries = 0; tries < 40 && !ok; tries++) {
      org = o.at && tries < 8 ? o.at : { lat: lat0 + rng() * cellDegLat, lon: lon0 + rng() * cellDegLon }; hdg = rng() * Math.PI * 2; leg = tries < 8 ? leg0 : Math.max(0.6, leg0 * (tries < 24 ? 0.5 : 0.25));
      const half = leg / 2; A = { lat: org.lat - toLat(Math.cos(hdg) * half), lon: org.lon - toLon(Math.sin(hdg) * half) }; B = { lat: org.lat + toLat(Math.cos(hdg) * half), lon: org.lon + toLon(Math.sin(hdg) * half) };
      ok = true; for (let q = 0; q <= 12 && ok; q++) { const dd = seafloor.depthAt(A.lat + ((B.lat - A.lat) * q) / 12, A.lon + ((B.lon - A.lon) * q) / 12); ok = dd != null && dd >= minD; }
    }
    if (!ok) return null;   // no water for this ship here
    const hostile = f2.stance === 'hostile', unreg = kind === 'raider' || kind === 'poacher';
    return { id: `${cx}:${cy}:${i}`, kind, faction: group, factionName: f2.name || group, stance: f2.stance || 'neutral', label: k.label, size: k.size, kt, A, B, L: Math.max(0.5, leg), phase: rng() * 2, boldness: hostile && f2.boldness ? between(rng, f2.boldness) : 0,
      ais: k.ais !== false, bias: (rng() - 0.5) * c.sensing.bearing_noise_deg * 2, name: unreg ? (kind === 'raider' ? pick(rng, k.names) : 'Unmarked trawler') : (k.pre + ' ' + pick(rng, k.names)).trim(), mhz: +(156 + 0.025 * Math.floor(rng() * 240)).toFixed(3), reply: Math.floor(rng() * 1000), ident: false, alerted: false, dyn: null, hitAt: -1e9 };
  };
  for (let i = 0; i < n; i++) {
    const w = {};
    for (const [k, v] of Object.entries(c.zone_weights.open)) w[k] = (w[k] || 0) + v;
    if (z.shelf) for (const [k, v] of Object.entries(c.zone_weights.shelf)) w[k] = (w[k] || 0) + v;
    for (const [k, v] of Object.entries(c.zone_weights.lane)) w[k] = (w[k] || 0) + v * z.lane * 2;
    for (const [k, v] of Object.entries(c.zone_weights.port)) w[k] = (w[k] || 0) + v * z.port;
    let site = null; if (sites.length && rng() < 0.7) { site = pick(rng, sites); for (const [k, v] of Object.entries(c.site_weights[site.kind])) w[k] = (w[k] || 0) + v * 4; }
    let kind;
    if (dh < c.pirate_haven_radius_nm && rng() < c.pirate_share * (1 - dh / c.pirate_haven_radius_nm)) kind = 'raider';
    else { let tot = 0; for (const v of Object.values(w)) tot += v; let r = rng() * tot; for (const [k, v] of Object.entries(w)) { r -= v; if (r <= 0) { kind = k; break; } } kind = kind || 'cargo'; }
    if ((kind === 'tender' || kind === 'rig') && !site) kind = 'trawler';
    const sp = site ? { lat: site.lat + toLat((rng() - 0.5) * 12), lon: site.lon + toLon((rng() - 0.5) * 12) } : null;
    const vsl = make(i, kind, kind === 'tender' || kind === 'rig' ? { at: sp, site } : {}); if (vsl) out.push(vsl);
  }
  // poachers work inside the protected zones: made in the cell that holds the zone's centre
  for (const p of sim.s.pois) if (p.type === 'sanctuary' && p.lat >= lat0 && p.lat < lat0 + cellDegLat && p.lon >= lon0 && p.lon < lon0 + cellDegLon) {
    const m = 1 + Math.floor(rng() * 3);
    for (let j = 0; j < m; j++) { const a = rng() * 6.283, r = Math.sqrt(rng()) * (p.radius || 10) * 0.8; out.push(make(10 + j, 'poacher', { at: { lat: p.lat + toLat(Math.cos(a) * r), lon: p.lon + toLon(Math.sin(a) * r) } })); }
  }
  return out;
}
const cellOf = (lat, lon) => [Math.floor(lon / toLon(traffic.cfg.cell_nm)), Math.floor(lat / (traffic.cfg.cell_nm / NM))];
function cellVessels(cx, cy) {
  if (!seafloor.ready) { traffic.candKey = ''; return []; }   // the chart is still loading: build nothing and remember nothing
  const key = cx + ',' + cy; let v = traffic.cells.get(key);
  if (!v) { v = buildCell(cx, cy); traffic.cells.set(key, v); }
  return v;
}

/** Where a vessel is at game time t. */
export function posAt(v, t) {
  if (v.dyn) return v.dyn;
  const u = (((t / 3600) * v.kt) / v.L + v.phase) % 2, s = u <= 1 ? u : 2 - u;
  return { lat: v.A.lat + (v.B.lat - v.A.lat) * s, lon: v.A.lon + (v.B.lon - v.A.lon) * s, hdg: ((Math.atan2((v.B.lon - v.A.lon) * SK, v.B.lat - v.A.lat) * 180 / Math.PI + (u <= 1 ? 0 : 180)) + 360) % 360 };
}

/** A fix from bearings: two ears (each { from, brg }) at different places whose lines cross at a good angle. The best pair wins. Null when there is none. */
export function triangulate(ears) {
  const sn = traffic.cfg.sensing; let fix = null;
  for (let i = 0; i < ears.length; i++) for (let j = i + 1; j < ears.length; j++) {
    const A = ears[i], B = ears[j], a1 = (A.brg * Math.PI) / 180, a2 = (B.brg * Math.PI) / 180, sinD = Math.sin(a1 - a2);
    if (Math.abs(sinD) < Math.sin((sn.min_cross_deg * Math.PI) / 180)) continue;
    const bx = (B.from.lon - A.from.lon) * NM * SK, by = (B.from.lat - A.from.lat) * NM;   // from A to B
    const t1 = (bx * Math.cos(a2) - by * Math.sin(a2)) / sinD, t2 = (bx * Math.cos(a1) - by * Math.sin(a1)) / sinD;
    if (t1 <= 0 || t2 <= 0) continue;
    const err = Math.max(0.05, (Math.max(t1, t2) * 0.035) / Math.abs(sinD));
    if (!fix || err < fix.err) fix = { lat: A.from.lat + (t1 * Math.cos(a1)) / NM, lon: A.from.lon + (t1 * Math.sin(a1)) / (NM * SK), err };
  }
  return fix;
}
/** Sensitivity multiplier of one listener (the ship, or a WSKR by number) for a contact on true bearing brg: 2 once its full sweep's beam has passed
 *  that bearing (the sweep turns from 000 at 10 degrees a second), and 2 more while a scan is on the contact. */
export function snrGain(src, scanUntil = 0, brg = null) {
  const s = sim.s, w = s.snr && s.snr.sweep, passed = w && w.src === src && (brg == null || w.az >= 360 || ((brg % 360) + 360) % 360 <= w.az);
  return (passed ? 2 : 1) * (scanUntil > s.clock ? 2 : 1);
}
/** How far the ship's passive sonar hears a vessel of loudness 1: sonar powered 12 nm, off 1 nm. (A full sweep doubles it bearing by bearing: snrGain.) */
export const sonarNm = (s) => (s.sonar ? traffic.cfg.sensing.sonar_nm : 1);

// ---- detection chance and tracks (docs/CONTACT_TRACKING.md) ----
/** Own flow noise: 1 up to flow_quiet_kt, falling in a straight line to flow_min at flow_top_kt (super cruise). */
export function flowFactor(kt) { const sn = traffic.cfg.sensing; return 1 - (1 - sn.flow_min) * Math.max(0, Math.min(1, (kt - sn.flow_quiet_kt) / (sn.flow_top_kt - sn.flow_quiet_kt))); }
/** Chance that a listener hears a ship at distance d when its 50% range is r50. */
export function detectP(d, r50) { const sn = traffic.cfg.sensing; return r50 <= 0 || d >= sn.cutoff_ratio * r50 ? 0 : 1 / (1 + (d / r50) ** sn.detect_exp); }
/** One listener on one ship: a check every check_s; heard until drop_misses checks in a row miss (beyond the cut-off: dropped at once). */
function hears(v, src, d, r50, now) {
  const sn = traffic.cfg.sensing, P = detectP(d, r50), det = v.det || (v.det = {}), st = det[src] || (det[src] = { at: -1e12, ok: false, miss: 0 });
  if (P === 0) { st.ok = false; st.miss = 0; st.at = now; return false; }
  const jump = r50 > (st.r50 || 0) * 1.4; st.r50 = r50;   // the sweep beam just passed (sensitivity doubled): check now, not at the next 5 s mark
  if (jump || now - st.at >= sn.check_s || now < st.at) {
    st.at = now;
    if (traffic.rand() < P) { st.ok = true; st.miss = 0; } else if (st.ok && ++st.miss < sn.drop_misses) { /* one miss: still held */ } else { st.ok = false; st.miss = 0; }
  }
  return st.ok;
}
/** Chance that a ship heard again after its track was lost is the one on file: the circle it could be in grows with time; same-size ships inside it confuse the match. */
export function matchP(v, now) {
  const sn = traffic.cfg.sensing, hrs = Math.max(0, now - v.heardAt) / 3600, R = sn.match_r0_nm + v.kt * 1.2 * hrs;
  const others = traffic.active.filter((a) => a.shown && a.v !== v && a.v.size === v.size && v.heardPos && dist(a, v.heardPos) <= R).length;
  return (v.ident ? 1 : v.prob || 0) / (1 + (R / sn.match_ok_nm) ** 2) / (1 + others);
}
export const onFile = (v) => traffic.known.has(v.id);
const sweepNm = (v) => (onFile(v) ? traffic.cfg.sensing.sweep_nm_known : traffic.cfg.sensing.sweep_nm);
let knownWrite = -1e12;
function fileTrack(v, now, p) {   // keep the ship's entry up to date; write the save at most every 10 game seconds unless the identity changed
  const k = { t: now, lat: +p.lat.toFixed(4), lon: +p.lon.toFixed(4), i: v.ident ? 1 : +(v.prob || 0).toFixed(3) };
  const old = traffic.known.get(v.id); traffic.known.set(v.id, k);
  if (!old || old.i !== k.i || now - knownWrite >= 10 || now < knownWrite) { knownWrite = now; gameState.updateProperty('world.known', Object.fromEntries(traffic.known)); }
}

/** Called every frame from the sim. Finds the vessels in the bubble, moves the reacting ones, tests collisions, raises alerts. */
export function step() {
  if (!traffic.ready || !sim.s.pois.length) return;
  const t0 = performance.now(), s = sim.s, c = traffic.cfg, now = s.clock;
  SK = Math.cos((s.lat * Math.PI) / 180);
  const dt = traffic.lastClock == null ? 0 : now - traffic.lastClock; traffic.lastClock = now;
  const [cx, cy] = cellOf(s.lat, s.lon), key = cx + ',' + cy;
  if (key !== traffic.candKey) {   // the ship changed cell: rebuild the candidate list (a few cells round it)
    const reach = Math.ceil((c.bubble_nm + c.leg_max_nm / 2) / c.cell_nm); traffic.cand = [];
    for (let x = cx - reach; x <= cx + reach; x++) for (let y = cy - reach; y <= cy + reach; y++) traffic.cand.push(...cellVessels(x, y));
    traffic.candKey = key; traffic.stats.cells = (2 * reach + 1) ** 2;
  }
  const near = [];
  for (const v of traffic.scripted.length ? traffic.cand.concat(traffic.scripted) : traffic.cand) {   // scripted: vessels a generated mission placed
    if (traffic.sunk.has(v.id)) continue;
    let p = posAt(v, now), d = dist(s, p);
    if (v.dyn) {   // a reacting vessel is moved a step at a time; far away it goes back to its leg
      if (d > 14) { v.dyn = null; p = posAt(v, now); d = dist(s, p); }
      else if (dt > 0 && dt < 120) {
        const toS = Math.atan2((s.lon - p.lon) * SK, s.lat - p.lat), a = v.boldness >= 0.5 ? toS : toS + Math.PI, nm = (v.kt * 1.2 * dt) / 3600;
        const np = { lat: p.lat + toLat(Math.cos(a) * nm), lon: p.lon + toLonS(Math.sin(a) * nm) }, wd = seafloor.depthAt(np.lat, np.lon);
        if (wd != null && wd >= 6) v.dyn = { ...np, hdg: ((a * 180) / Math.PI + 360) % 360 }; else v.dyn = { lat: p.lat, lon: p.lon, hdg: ((a * 180) / Math.PI + 360) % 360 };   // a ship does not sail onto land
        p = v.dyn; d = dist(s, p);
      }
    }
    if (d > c.bubble_nm) continue;
    if (!seafloor.inside(p.lat, p.lon)) continue;   // beyond the chart edge nothing is there
    near.push({ v, p, d });
  }
  near.sort((a, b) => a.d - b.d); near.length = Math.min(near.length, c.cap);
  const sn = c.sensing, aisUp = gates.ais(), out = [];
  const obs = s.wskrs.filter((w) => !w.dead && !w.arrived && w.lat != null && sim.wskrLink(w).raw);   // WSKRs the control link reaches add their own ears
  for (const { v, p, d } of near) {
    if (v.kr == null) { v.kr = 1; const k = traffic.known.get(v.id); if (k) { v.heardAt = k.t; v.heardPos = { lat: k.lat, lon: k.lon }; if (k.i === 1) v.ident = true; else if (k.i > 0) v.prob = k.i; } }   // a ship rebuilt after a reload picks up its saved track
    const hostile = v.stance === 'hostile';
    if (hostile && !v.dyn && d < 6) v.dyn = { lat: p.lat, lon: p.lon, hdg: p.hdg };
    // 1. AIS: friendly and commercial traffic tells us who and where it is, if the VHF mast is up
    const ais = v.ais && aisUp && d <= c.ais_nm;
    // 2. sonar: a bearing only, from the ship and from each WSKR in range; bigger and faster vessels are heard from further
    const loud = sn.sonar_size_factor[v.size] * (0.8 + Math.min(v.kt, 20) / 50);
    const ears = [];
    const noise = (k) => (v.bias * (k ? -0.7 : 1) + 0.8 * Math.sin(now / (37 + 16 * k) + v.phase * 3)) * Math.PI / 180;
    const bearingFrom = (o, k, src) => { const dy = (p.lat - o.lat) * NM, dx = (p.lon - o.lon) * NM * SK; return { src, from: { lat: o.lat, lon: o.lon }, brg: ((Math.atan2(dx, dy) + noise(k)) * 180 / Math.PI + 360) % 360, nm: Math.hypot(dx, dy) }; };
    const brgOf = (o) => ((Math.atan2((p.lon - o.lon) * SK, p.lat - o.lat) * 180) / Math.PI + 360) % 360;
    const gain = (src, o) => snrGain(src, v.scanUntil, brgOf(o));   // the SNR page: a full sweep (once its beam has passed the bearing) or a scan doubles the sensitivity
    if (hears(v, 'ship', d, sonarNm(s) * loud * gain('ship', s) * flowFactor(s.speed), now)) ears.push(bearingFrom(s, 0, 'ship'));
    obs.forEach((w, i) => { if (hears(v, w.n, dist(w, p), sn.wskr_sonar_nm * loud * gain(w.n, w) * (w.super ? sn.flow_min : 1), now)) ears.push(bearingFrom(w, i + 1, w.n)); });
    // 3. a fix: two bearings from different places that cross at a good angle
    const fix = ais ? null : triangulate(ears);
    // 4. identity: AIS, inside 4 nm, a WSKR within 2 nm, a hail answered on VHF, or a sensor sweep (started from Sensors, ship inside 8 nm)
    const vis = s.depth <= sn.visual_max_depth_m && d <= sn.visual_nm[v.size];
    const b = toward(s, p), heard = ears.length > 0 || vis, shown = ais || heard;
    // the name belongs to the track: picked up again after track_hold_s without contact, it is only a probable match
    if (shown && v.heardAt != null && now - v.heardAt > sn.track_hold_s && (v.ident || v.prob)) { const m = matchP(v, now); v.ident = false; v.prob = m >= sn.match_min ? m : null; }
    if (v.sweepAt && now >= v.sweepAt) { if (d <= sweepNm(v)) v.ident = true; v.sweepAt = 0; }
    if (ais || d <= sn.ident_nm || obs.some((w) => dist(w, p) <= sn.wskr_camera_nm)) v.ident = true;
    if (v.ident) v.prob = null;   // a certain identification (also a scan in sonar.js or a hail in commsModel.js) clears "probable"
    if (shown) { v.heardAt = now; v.heardPos = { lat: p.lat, lon: p.lon }; }
    { const k = traffic.known.get(v.id), i = v.ident ? 1 : v.prob || 0;   // keep the file: a live track while it is heard; the identity state whenever it changes
      if ((i > 0 && (shown || !k)) || (k && k.i !== +i.toFixed(3))) fileTrack(v, v.heardAt != null ? v.heardAt : now, v.heardPos || p); }
    const pos = ais ? { lat: p.lat, lon: p.lon, err: 0, hdg: p.hdg } : v.scanFixUntil > now ? { lat: p.lat, lon: p.lon, err: 0.1, hdg: p.hdg } : fix ? { lat: fix.lat, lon: fix.lon, err: fix.err } : vis ? { lat: p.lat, lon: p.lon, err: 0.05, hdg: p.hdg } : null;
    out.push({ v, lat: p.lat, lon: p.lon, hdg: p.hdg, nm: d, brg: b.brg, shown, ais, pos, lines: ears.map((e) => ({ src: e.src, from: e.from, brg: e.brg })), ear: ears.length ? ears[0].brg : null });
    if ((ais || heard) && (hostile || v.size >= 2 && d < 1) && !v.alerted && (hostile || v.ident)) {
      v.alerted = true; const bb = String(Math.round(ears.length ? ears[0].brg : b.brg)).padStart(3, '0');
      say('sensors', hostile ? `Captain, sonar contact bearing ${bb}. ${v.ident ? `${v.label}, ${v.factionName}. Hostile.` : 'Unidentified, no range yet, moving fast. I do not like it.'}` : `Captain, ${v.label.toLowerCase()} bearing ${bb}. Watch the traffic.`, hostile ? 'mission' : '', { notice: hostile ? 'HOSTILE CONTACT' : 'SURFACE TRAFFIC' });
    }
    if (d < 0.05 && s.depth < c.draft_m[v.size] + c.collide_margin_m && now - v.hitAt > 60) collide(v, p, d);   // only on or just below the surface
  }
  traffic.active = out; traffic.stats.active = out.length; traffic.stats.ms = performance.now() - t0;
}

function collide(v, p) {
  const s = sim.s, kt = Math.max(s.speed, 1); v.hitAt = s.clock;
  sim.hurt(kt, 'ship');
  const sinks = v.size <= 1 && s.speed >= 3;
  say('helm', sinks ? `Collision! We have struck ${v.name}, Captain. She is going down.` : `Collision, Captain! We have hit ${v.name}. Checking the hull.`, 'error', { notice: 'COLLISION' });
  if (sinks) sink(v, p);
}
function sink(v, p) {
  traffic.sunk.add(v.id); gameState.updateProperty('world.sunk', [...traffic.sunk]); sim.emit('ship-sunk', { id: v.id, name: v.name });
  const w = { id: v.id, name: `Wreck of ${v.name}`, lat: +p.lat.toFixed(4), lon: +p.lon.toFixed(4), text: `The ${v.label.toLowerCase()} ${v.name}, sunk in a collision with the Aqua Nova.` };
  gameState.updateProperty('world.wrecks', [...(gameState.getProperty('world.wrecks') || []), w]);
  sim.s.pois.push({ id: sim.s.pois.length, type: 'wreck', name: w.name, text: w.text, lat: w.lat, lon: w.lon, sunkId: v.id });
  sim.touch();
  setTimeout(() => say('aria', `For the record, Captain: that is a ship lost with her crew's mercy, not the Aqua Nova's. The Directorate will ask about this.`, 'mission'), 3000);
}

// ---- what the rest of the game sees ----
/** Start a sensor sweep on a ship inside the sweep range. It identifies the ship a few seconds later. */
export function sweep(v) { const sn = traffic.cfg.sensing, a = traffic.active.find((x) => x.v === v); if (!a || a.nm > sweepNm(v)) return false; v.sweepAt = sim.s.clock + sn.sweep_s; return true; }
export const canSweep = (a) => a.nm <= sweepNm(a.v);
export const seen = () => traffic.active.filter((a) => a.shown);
/** Contacts with a position the player may use (AIS, a fix, or seen by eye). */
export const plotted = () => traffic.active.filter((a) => a.shown && a.pos);
export const probName = (v) => `Probable: ${v.name} (${Math.round(v.prob * 100)}%)`;
export const shownName = (a) => (a.v.ident ? a.v.name : a.v.prob ? probName(a.v) : 'Unidentified contact');
/** Vessels in the bubble that can be hailed on VHF (for the Comms scan and hail). */
export const hailContacts = () => traffic.active.map((a) => ({ id: 'ship-' + a.v.id, kind: 'ship', name: a.v.name, band: 'VHF', mhz: a.v.mhz, lat: a.lat, lon: a.lon, range: 30, reply: replyOf(a.v), vessel: a.v }));
export function replyOf(v) {
  const h = traffic.cfg.hail, name = v.name;
  const list = v.kind === 'raider' ? h[v.boldness >= 0.5 ? 'raider_bold' : 'raider_timid'] : v.kind === 'poacher' ? h[v.boldness >= 0.25 ? 'poacher_bold' : 'poacher_timid'] : h[v.kind] || ['{name}. Copy, Aqua Nova.'];
  return list[v.reply % list.length].replace('{name}', name);
}
sim.afterStep = sim.afterStep || []; sim.afterStep.push(step);
sim.traffic = traffic;
