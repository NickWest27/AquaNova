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
export const traffic = { cfg: null, cells: new Map(), cand: [], candKey: '', active: [], sunk: new Set(), ready: false, stats: { active: 0, cells: 0, ms: 0 }, lastClock: null };
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
    const kt = fish ? between(rng, [2, 3.5]) : between(rng, k.kt), leg = fish ? between(rng, [2, 6]) : between(rng, k.leg), hdg = rng() * Math.PI * 2;
    const org = o.at || { lat: lat0 + rng() * cellDegLat, lon: lon0 + rng() * cellDegLon };
    const half = leg / 2, A = { lat: org.lat - toLat(Math.cos(hdg) * half), lon: org.lon - toLon(Math.sin(hdg) * half) }, B = { lat: org.lat + toLat(Math.cos(hdg) * half), lon: org.lon + toLon(Math.sin(hdg) * half) };
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
    out.push(make(i, kind, kind === 'tender' || kind === 'rig' ? { at: sp, site } : {}));
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
const sonarNm = (s) => (s.clock < (s.sweepUntil || 0) ? 8 : s.sonar ? 4 : 1);

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
  for (const v of traffic.cand) {
    if (traffic.sunk.has(v.id)) continue;
    let p = posAt(v, now), d = dist(s, p);
    if (v.dyn) {   // a reacting vessel is moved a step at a time; far away it goes back to its leg
      if (d > 14) { v.dyn = null; p = posAt(v, now); d = dist(s, p); }
      else if (dt > 0 && dt < 120) {
        const toS = Math.atan2((s.lon - p.lon) * SK, s.lat - p.lat), a = v.boldness >= 0.5 ? toS : toS + Math.PI, nm = (v.kt * 1.2 * dt) / 3600;
        v.dyn = { lat: p.lat + toLat(Math.cos(a) * nm), lon: p.lon + toLonS(Math.sin(a) * nm), hdg: ((a * 180) / Math.PI + 360) % 360 }; p = v.dyn; d = dist(s, p);
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
    const hostile = v.stance === 'hostile';
    if (hostile && !v.dyn && d < 6) v.dyn = { lat: p.lat, lon: p.lon, hdg: p.hdg };
    // 1. AIS: friendly and commercial traffic tells us who and where it is, if the VHF mast is up
    const ais = v.ais && aisUp && d <= c.ais_nm;
    // 2. sonar: a bearing only, from the ship and from each WSKR in range; bigger and faster vessels are heard from further
    const loud = sn.sonar_size_factor[v.size] * (0.8 + Math.min(v.kt, 20) / 50);
    const ears = [];
    const noise = (k) => (v.bias * (k ? -0.7 : 1) + 0.8 * Math.sin(now / (37 + 16 * k) + v.phase * 3)) * Math.PI / 180;
    const bearingFrom = (o, k) => { const dy = (p.lat - o.lat) * NM, dx = (p.lon - o.lon) * NM * SK; return { from: { lat: o.lat, lon: o.lon }, brg: ((Math.atan2(dx, dy) + noise(k)) * 180 / Math.PI + 360) % 360, nm: Math.hypot(dx, dy) }; };
    if (d <= sonarNm(s) * loud) ears.push(bearingFrom(s, 0));
    obs.forEach((w, i) => { if (dist(w, p) <= sn.wskr_sonar_nm * loud) ears.push(bearingFrom(w, i + 1)); });
    // 3. a fix: two bearings from different places that cross at a good angle
    let fix = null;
    if (!ais) for (let i = 0; i < ears.length; i++) for (let j = i + 1; j < ears.length; j++) {
      const A = ears[i], B = ears[j], a1 = (A.brg * Math.PI) / 180, a2 = (B.brg * Math.PI) / 180, sinD = Math.sin(a1 - a2);
      if (Math.abs(sinD) < Math.sin((sn.min_cross_deg * Math.PI) / 180)) continue;
      const bx = (B.from.lon - A.from.lon) * NM * SK, by = (B.from.lat - A.from.lat) * NM;   // from A to B
      const t1 = (bx * Math.cos(a2) - by * Math.sin(a2)) / sinD, t2 = (bx * Math.cos(a1) - by * Math.sin(a1)) / sinD;
      if (t1 <= 0 || t2 <= 0) continue;
      const err = Math.max(0.05, (Math.max(t1, t2) * 0.035) / Math.abs(sinD));
      if (!fix || err < fix.err) fix = { lat: A.from.lat + (t1 * Math.cos(a1)) / NM, lon: A.from.lon + (t1 * Math.sin(a1)) / (NM * SK), err };
    }
    // 4. identity: AIS, inside 4 nm, a WSKR within 2 nm, a hail answered on VHF, or a sensor sweep (started from Sensors, ship inside 8 nm)
    const vis = s.depth <= sn.visual_max_depth_m && d <= sn.visual_nm[v.size];
    if (v.sweepAt && now >= v.sweepAt) { if (d <= sn.sweep_nm) v.ident = true; v.sweepAt = 0; }
    if (ais || d <= sn.ident_nm || obs.some((w) => dist(w, p) <= sn.wskr_camera_nm)) v.ident = true;
    const b = toward(s, p), heard = ears.length > 0 || vis;
    const pos = ais ? { lat: p.lat, lon: p.lon, err: 0, hdg: p.hdg } : fix ? { lat: fix.lat, lon: fix.lon, err: fix.err } : vis ? { lat: p.lat, lon: p.lon, err: 0.05, hdg: p.hdg } : null;
    out.push({ v, lat: p.lat, lon: p.lon, hdg: p.hdg, nm: d, brg: b.brg, shown: ais || heard, ais, pos, lines: ears.map((e) => ({ from: e.from, brg: e.brg })), ear: ears.length ? ears[0].brg : null });
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
  traffic.sunk.add(v.id); gameState.updateProperty('world.sunk', [...traffic.sunk]);
  const w = { id: v.id, name: `Wreck of ${v.name}`, lat: +p.lat.toFixed(4), lon: +p.lon.toFixed(4), text: `The ${v.label.toLowerCase()} ${v.name}, sunk in a collision with the Aqua Nova.` };
  gameState.updateProperty('world.wrecks', [...(gameState.getProperty('world.wrecks') || []), w]);
  sim.s.pois.push({ id: sim.s.pois.length, type: 'wreck', name: w.name, text: w.text, lat: w.lat, lon: w.lon, sunkId: v.id });
  sim.touch();
  setTimeout(() => say('aria', `For the record, Captain: that is a ship lost with her crew's mercy, not the Aqua Nova's. The Directorate will ask about this.`, 'mission'), 3000);
}

// ---- what the rest of the game sees ----
/** Start a sensor sweep on a ship inside the sweep range. It identifies the ship a few seconds later. */
export function sweep(v) { const sn = traffic.cfg.sensing, a = traffic.active.find((x) => x.v === v); if (!a || a.nm > sn.sweep_nm) return false; v.sweepAt = sim.s.clock + sn.sweep_s; return true; }
export const canSweep = (a) => a.nm <= traffic.cfg.sensing.sweep_nm;
export const seen = () => traffic.active.filter((a) => a.shown);
/** Contacts with a position the player may use (AIS, a fix, or seen by eye). */
export const plotted = () => traffic.active.filter((a) => a.shown && a.pos);
export const shownName = (a) => (a.v.ident ? a.v.name : 'Unidentified contact');
/** Vessels in the bubble that can be hailed on VHF (for the Comms scan and hail). */
export const hailContacts = () => traffic.active.map((a) => ({ id: 'ship-' + a.v.id, kind: 'ship', name: a.v.name, band: 'VHF', mhz: a.v.mhz, lat: a.lat, lon: a.lon, range: 30, reply: replyOf(a.v), vessel: a.v }));
export function replyOf(v) {
  const h = traffic.cfg.hail, name = v.name;
  const list = v.kind === 'raider' ? h[v.boldness >= 0.5 ? 'raider_bold' : 'raider_timid'] : v.kind === 'poacher' ? h[v.boldness >= 0.25 ? 'poacher_bold' : 'poacher_timid'] : h[v.kind] || ['{name}. Copy, Aqua Nova.'];
  return list[v.reply % list.length].replace('{name}', name);
}
sim.afterStep = sim.afterStep || []; sim.afterStep.push(step);
sim.traffic = traffic;
