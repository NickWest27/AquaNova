// Generated missions (phase 1: Unknown contact and Site survey). Design: project doc MISSION_GENERATOR.md.
// A recipe becomes the same JSON the mission manager already runs. This module adds what the manager lacks:
// offers (accept-by time, optional deadline), a 0-12 h timer after a report, "request new orders", decline/expire/quit with
// consequences, a route-time check (super cruise on deep legs), scripted vessels, and reputation outcomes.
// State lives in `mission.gen` (saved): { n, nextAt, offer, active, defs, vessels, mem, done }. Times are game seconds.
import { sim, toward, clockText, SUPER_KT, MAX_KT } from './sim.js';
import { seafloor } from './seafloor.js';
import { traffic } from './traffic.js';
import { gameState } from './persist.js';
import { applyOutcome, rep } from './reputation.js';
import { bestSource, canTransmit, LINKS, SOURCES } from './commsModel.js';
import { say } from './notify.js';
import { fill } from './player.js';
import { project } from './plotmath.js';
import missionManager from '../../game/systems/missionManager.js';

const KEY = 'mission.gen', H = 3600, MAX_TIMER_H = 12, SUPER_MIN_FLOOR = 120;
let P = null;
const mulberry = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (rng, a) => a[Math.floor(rng() * a.length)];
const st = () => { let g = gameState.getProperty(KEY); if (!g) { g = { n: 0, nextAt: null, offer: null, active: null, defs: {}, vessels: [], mem: {}, done: [] }; gameState.updateProperty(KEY, g); } return g; };
const save = (g) => gameState.updateProperty(KEY, g);
const prop = (id, k, v) => gameState.updateProperty(`${KEY}Flags.${id}.${k}`, v);
const flag = (id, k) => (gameState.getProperty(`${KEY}Flags.${id}`) || {})[k];

export async function loadPhrases() { if (!P) P = await fetch(new URL('../../data/gen/phrases.json', import.meta.url)).then((r) => r.json()); return P; }

// ---------- facts ----------
const DIRS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
export const compass = (b) => DIRS[Math.round(b / 45) % 8];
const nearPlace = (p) => { let best = null, bd = 1e9; for (const q of sim.s.pois) { if (q.type === 'dock') continue; const d = toward(q, p).nm; if (d < bd) { bd = d; best = q; } } return best && bd < 40 ? best : null; };
const placeName = (p, poi) => (poi ? poi.name : `the water ${Math.round(toward(sim.s, p).nm)} nm out`);

/** Hours to sail from the ship to a point: legs planned round land, super cruise (100 kt) where the floor is 120 m or more, 14 kt on the shelf. Null when no safe way exists. */
export function routeHours(to, from = sim.s) {
  const route = seafloor.ready ? sim.routeTo(to) : null; if (!route) return null;
  const pts = [{ lat: from.lat, lon: from.lon }, ...route]; if (!route.length || route[route.length - 1] !== to) pts.push({ lat: to.lat, lon: to.lon });
  let h = 0, engaged = false;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1], nm = toward(a, b).nm, n = Math.max(1, Math.ceil(nm));
    for (let k = 0; k < n; k++) {
      const f = (k + 0.5) / n, fl = seafloor.depthAt(a.lat + (b.lat - a.lat) * f, a.lon + (b.lon - a.lon) * f), fast = fl != null && fl >= SUPER_MIN_FLOOR;
      h += (nm / n) / (fast ? SUPER_KT : MAX_KT); engaged = engaged || fast;
    }
  }
  return h * 1.15 + 0.1 + (engaged ? 0.1 : 0);    // a margin, and a few minutes to engage and drop out of super cruise
}

// ---------- where: positions are given the way a real report gives them, and the Captain plots them ----------
const dm = (v, hemi) => { const a = Math.abs(v), d = Math.floor(a), m = Math.round((a - d) * 600) / 10; return `${String(m >= 60 ? d + 1 : d).padStart(hemi === 'N' || hemi === 'S' ? 2 : 3, '0')}°${(m >= 60 ? 0 : m).toFixed(1).padStart(4, '0')}'${hemi}`; };
export const fmtPos = (p) => `${dm(p.lat, p.lat >= 0 ? 'N' : 'S')} ${dm(p.lon, p.lon >= 0 ? 'E' : 'W')}`;
/** A position as lat/long, or as a bearing and distance from a known place. The target is the rounded point, so the report is exact. */
function describeLoc(rng, p, { bearing = true } = {}) {
  const ref = bearing ? sim.s.pois.filter((q) => q.type !== 'dock' && q.type !== 'hideout' && toward(q, p).nm <= 60 && toward(q, p).nm >= 4).sort((a, b) => toward(a, p).nm - toward(b, p).nm)[0] : null;
  if (ref && rng() < 0.5) {
    const t = toward(ref, p), brg = Math.round(t.brg), nm = Math.round(t.nm * 10) / 10, q = project(ref, brg, nm);
    return { p: q, text: `on a bearing of ${String(brg).padStart(3, '0')}° true, ${nm.toFixed(1)} nm from ${ref.name}`, short: `${String(brg).padStart(3, '0')}° true, ${nm.toFixed(1)} nm from ${ref.name}`, how: 'bearing' };
  }
  const q = { lat: Math.round(p.lat * 600) / 600, lon: Math.round(p.lon * 600) / 600 };
  return { p: q, text: `at ${fmtPos(q)}`, short: fmtPos(q), how: 'latlon' };
}

// ---------- briefing ----------
const take = (g, rng, pool, vars) => {
  const list = P.pools[pool]; if (!list) return '';
  const used = g.mem[pool] || [], fresh = list.map((_, i) => i).filter((i) => !used.includes(i)), i = pick(rng, fresh.length ? fresh : list.map((_, j) => j));
  g.mem[pool] = [...used, i].slice(-Math.min(10, list.length - 1 || 1));
  return list[i].replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
};

// ---------- recipes ----------
const REASONS = {
  adrift: { kind: 'trawler', ais: false, minNm: 30, maxNm: 220 },
  lost_survey: { kind: 'research', ais: false, minNm: 30, maxNm: 260 },
  poaching: { kind: 'poacher', ais: false, minNm: 20, maxNm: 260, sanctuary: true },
  sinking: { kind: 'yacht', ais: false, minNm: 40, maxNm: 300, distress: true },       // a distress call: inside 300 nm, the clock is the margin
  survivors: { kind: 'trawler', ais: false, minNm: 40, maxNm: 300, distress: true },
};
/** A free sea spot: charted, deep enough, with a safe route and a travel time that fits `maxH`. */
function findSpot(rng, { minNm, maxNm, minDepth = 40, maxH = 8 }) {
  const s = sim.s;
  for (let t = 0; t < 40; t++) {
    const d = minNm + rng() * (maxNm - minNm), a = rng() * Math.PI * 2;
    const p = { lat: s.lat + (Math.cos(a) * d) / 60, lon: s.lon + (Math.sin(a) * d) / (60 * Math.cos((s.lat * Math.PI) / 180)) };
    const fl = seafloor.depthAt(p.lat, p.lon); if (fl == null || fl < minDepth || !seafloor.inside(p.lat, p.lon)) continue;
    const h = routeHours(p); if (h == null || h > maxH) continue;
    return { p, hours: h };
  }
  return null;
}
function findSite(rng, maxH) {
  const sites = sim.s.pois.filter((q) => q.type !== 'dock' && q.type !== 'hideout' && q.type !== 'sanctuary' && toward(sim.s, q).nm > 5), order = sites.map((q) => ({ q, r: rng() })).sort((a, b) => a.r - b.r);
  for (const { q } of order.slice(0, 10)) { const h = routeHours(q); if (h != null && h <= maxH) return { q, hours: h }; }
  return null;
}

/** Build one offer from a seed. Returns { def, offer } or null when nothing valid was found. */
export function generate(seed, { type, compulsory, distress } = {}) {
  const g = st(), rng = mulberry(seed), s = sim.s, now = s.clock;
  type = distress ? 'contact' : (type || pick(rng, ['contact', 'survey', 'patrol']));
  const id = `gen_${g.n + 1}`, vars = { captain: fill('{captain}') };
  let spot, poi = null, reason = null, urgency = 'routine', route = 0, req;
  if (type === 'contact') {
    reason = pick(rng, Object.keys(REASONS).filter((k) => !!REASONS[k].distress === !!distress)); const R = REASONS[reason]; urgency = distress ? 'distress' : 'priority';
    if (R.sanctuary) { const sa = s.pois.filter((q) => q.type === 'sanctuary'); if (!sa.length) return null; poi = pick(rng, sa); const h = routeHours(poi); if (h == null || h > 7) return null; spot = { p: { lat: poi.lat + (rng() - 0.5) * 0.04, lon: poi.lon + (rng() - 0.5) * 0.04 }, hours: h }; }
    else spot = findSpot(rng, { ...R, maxH: distress ? 5 : 6 });
    if (!spot) return null; if (!poi) poi = nearPlace(spot.p);
    req = R.distress ? 'coastguard' : reason === 'poaching' ? 'fisheries' : reason === 'adrift' ? 'harbour' : 'oera_ops';
  } else if (type === 'patrol') {
    const sa = s.pois.filter((q) => q.type === 'sanctuary'); if (!sa.length) return null; poi = pick(rng, sa); const h = routeHours(poi); if (h == null || h > 8) return null;
    spot = { p: { lat: poi.lat, lon: poi.lon }, hours: h }; req = pick(rng, ['fisheries', 'oera_ops']); reason = 'patrol';
  } else {
    const site = findSite(rng, 9); if (!site) return null; poi = site.q; spot = { p: { lat: poi.lat, lon: poi.lon }, hours: site.hours }; req = pick(rng, ['oera_ops', 'university']);
  }
  route = spot.hours; const R = P.requesters[req], comp = compulsory != null ? compulsory : (R.compulsory && (type === 'survey' || type === 'patrol') ? rng() < 0.5 : R.compulsory);
  const loc = type === 'contact' && reason !== 'poaching' ? describeLoc(rng, spot.p) : describeLoc(rng, spot.p, { bearing: false }); if (type === 'contact' && reason !== 'poaching') spot.p = loc.p;
  const b = toward(s, spot.p), place = type === 'contact' && reason !== 'poaching' ? (poi ? `${poi.name}` : 'open water') : poi.name;
  const durH = type === 'patrol' ? pick(rng, [12, 24]) : 0, expiresH = distress ? 0.5 : type === 'patrol' ? 3 : type === 'contact' ? 1 + Math.floor(rng() * 2) : 12, deadlineH = distress ? Math.ceil((expiresH + route * 1.25 + 0.25) * 2) / 2 : type === 'contact' ? Math.ceil((expiresH + route * 1.6 + 1) * 2) / 2 : null;
  Object.assign(vars, { where: loc.text, duration: `${durH} hours`, place, nm: Math.round(b.nm), dir: compass(b.brg), hours: deadlineH && `${deadlineH} hours`, expires: expiresH < 1 ? `${expiresH * 60} minutes` : `${expiresH} hour${expiresH > 1 ? 's' : ''}` });
  const text = [take(g, rng, `open.${req}`, vars), '',
    take(g, rng, type === 'contact' ? `situation.contact.${reason}` : type === 'patrol' ? 'situation.patrol' : 'situation.survey', vars),
    take(g, rng, type === 'contact' ? `ask.contact.${reason}` : type === 'patrol' ? 'ask.patrol' : 'ask.survey', vars), '',
    take(g, rng, distress ? 'time.distress' : type === 'patrol' ? 'time.patrol' : deadlineH ? 'time.deadline' : 'time.soft', vars), take(g, rng, distress ? 'limit.distress' : 'limit.expires', vars),
    ...(distress ? [] : [take(g, rng, comp ? 'limit.compulsory' : 'limit.optional', vars)]), '', take(g, rng, `close.${req}`, vars), '', R.sign].join('\n');
  const facts = `Reported position: ${loc.short}${type === 'survey' || type === 'patrol' ? ' (centre of the area)' : ''}. ${loc.how === 'bearing' ? 'Plot it from that place with a bearing and distance on the course page' : 'Enter it as a waypoint on the course page'}, then navigate there yourself. Travel about ${route < 1 ? Math.round(route * 60) + ' minutes' : route.toFixed(1) + ' hours'} by the planned route.`;
  const name = type === 'patrol' ? `Patrol: ${poi.name}` : type === 'contact' ? { adrift: 'Vessel in trouble', lost_survey: 'Silent survey ship', poaching: 'Poachers in the closed area', patrol: `Patrol: ${poi && poi.name}`, sinking: 'MAYDAY: yacht sinking', survivors: 'MAYDAY: survivors in a raft' }[reason] : `Survey: ${poi.name}`;
  const objectives = type === 'patrol' ? [
    { id: 'arrive', description: `Enter the patrol area round ${poi.name} (${fmtPos(spot.p)})`, required: true, triggers: [{ type: 'property_at_least', property: `${KEY}Flags.${id}.inside`, value: 1 }] },
    { id: 'watch', description: 'Stay on station until the window ends', required: true, after: 'arrive', triggers: [{ type: 'property_at_least', property: `${KEY}Flags.${id}.served`, value: 1 }] },
    { id: 'contact', description: 'Identify any vessel working the area (scan, sweep or hail)', required: false, triggers: [{ type: 'property_at_least', property: `${KEY}Flags.${id}.ident`, value: 1 }],
      onComplete: [{ type: 'aria_decision', id: `${id}_d`, text: P.decisions.poaching.text, options: P.decisions.poaching.options.map((o) => ({ id: o.id, label: o.label, reply: o.reply, actions: [{ type: 'set_property', property: `${KEY}Flags.${id}.outcome`, value: o.outcome }] })) }] },
    { id: 'report', description: 'Send your patrol report from Comms', required: true, after: 'watch', triggers: [{ type: 'report_sent' }] },
  ] : type === 'contact' ? [
    { id: 'go', description: `Reach the reported position (${loc.text}) and close on the contact`, required: true, triggers: [{ type: 'property_at_least', property: `${KEY}Flags.${id}.near`, value: 1 }] },
    { id: 'identify', description: 'Identify the vessel: scan it, sweep it or hail it', required: true, after: 'go', triggers: [{ type: 'property_at_least', property: `${KEY}Flags.${id}.ident`, value: 1 }],
      onComplete: [{ type: 'aria_decision', id: `${id}_d`, text: P.decisions[reason].text, options: P.decisions[reason].options.map((o) => ({ id: o.id, label: o.label, reply: o.reply, actions: [{ type: 'set_property', property: `${KEY}Flags.${id}.outcome`, value: o.outcome }] })) }] },
    { id: 'decide', description: 'Decide how to handle the vessel', required: true, after: 'identify', triggers: [{ type: 'decision_made', decisionId: `${id}_d` }] },
    { id: 'report', description: 'Send your report to the requester from Comms', required: true, after: 'decide', triggers: [{ type: 'report_sent' }] },
  ] : [
    { id: 'go', description: `Go to ${poi.name} (${fmtPos(spot.p)})`, required: true, triggers: [{ type: 'location_enter', location: poi.name.toLowerCase() }] },
    { id: 'analyse', description: 'Take a sample there and analyse it in the Science Lab', required: true, after: 'go', triggers: [{ type: 'property_at_least', property: 'mission.science.stats.analysed', value: 99999 }] },   // value set at acceptance (baseline + 1)
    { id: 'report', description: 'Send your findings from Comms', required: true, after: 'analyse', triggers: [{ type: 'report_sent' }] },
  ];
  const def = { id, name, description: facts, category: 'generated', priority: urgency === 'priority' ? 'high' : 'normal', autoStart: false, prerequisites: [], objectives, onComplete: [],
    gen: { type, reason, urgency, compulsory: comp, requester: req, faction: req === 'fisheries' || req === 'harbour' || req === 'coastguard' ? 'civil' : 'oera', target: spot.p, place, routeH: +route.toFixed(2), seed, durH, area: type === 'patrol' ? { name: poi.name, lat: poi.lat, lon: poi.lon, radius: poi.radius || 10 } : null } };
  const offer = { id, expiresH, deadlineH, durH, routeH: route, delivered: false, offeredAt: null, expiresAt: null, deadlineAt: null };
  const message = { id: `offer-${id}`, from: R.from, subject: distress ? name : `${comp ? 'Orders' : 'Request'}: ${name}`, text: text + '\n\n' + facts, missionId: id, offer: true, compulsory: comp };
  return { def, offer, message, vessel: type === 'contact' ? makeVessel(id, reason, spot.p, rng) : null };
}

function makeVessel(id, reason, p, rng) {
  const R = REASONS[reason], k = traffic.cfg.kinds[R.kind], fac = (sim.world.factions || {})[k.faction] || {}, still = reason !== 'poaching';
  const off = { lat: p.lat + 0.004, lon: p.lon + 0.004 };
  return { id: `s:${id}`, scripted: true, mission: id, kind: R.kind, faction: k.faction, factionName: fac.name || k.faction, stance: reason === 'poaching' ? 'hostile' : 'neutral', label: k.label, size: k.size,
    kt: still ? 0 : 2, A: { ...p }, B: still ? { ...p } : off, L: 0.4, phase: 0, boldness: 0, ais: false, bias: (rng() - 0.5) * 2, name: reason === 'poaching' ? 'Unmarked trawler' : reason === 'sinking' ? 'MY ' + pick(rng, ['Second Wind', 'Reverie', 'Idle Hours']) : reason === 'survivors' ? 'Life raft' : reason === 'adrift' ? 'F/V ' + pick(rng, ['Marion K', 'Dawn Patrol', 'Two Sisters']) : 'RV ' + pick(rng, ['Calypso II', 'Meridian Star', 'Kestrel']),
    mhz: +(156 + 0.025 * Math.floor(rng() * 240)).toFixed(3), reply: Math.floor(rng() * 1000), ident: false, alerted: false, dyn: null, hitAt: -1e9 };
}

// ---------- offers ----------
const mail = (m) => missionManager.sendMessage(m);
const activeGen = () => { const g = st(); return g.active; };
export const hasActive = () => !!activeGen();
export const activeDef = () => { const g = st(); return g.active ? g.defs[g.active] : null; };
export const pendingOffer = () => st().offer;
export const isGenerated = (id) => !!st().defs[id];

export function makeOffer(opts = {}) {
  const g = st(); if (g.offer || (g.active && !opts.distress)) return null;   // a distress call can arrive during a mission
  for (let tries = 0; tries < 8; tries++) {
    const r = generate((Math.floor(Math.random() * 2e9) ^ (g.n * 7919)) >>> 0, opts); if (!r) continue;
    if (opts.distress) r.def.gen.distress = true;
    g.n++; g.defs[r.def.id] = r.def; g.offer = r.offer; g.held = r.message; g.nextAt = null; if (r.vessel) g.pendingVessel = r.vessel;
    missionManager.missions.set(r.def.id, r.def);
    if (opts.distress) {   // a distress call is heard on any band: Nicole tells the Captain, and the offer arrives without a link
      r.offer.distress = true;
      say('comms', `Captain, I am picking up a distress call. I recommend we re-establish communications.`, 'mission', { notice: 'DISTRESS CALL' });
      deliver(g);
    } else save(g);
    return r;
  }
  g.nextAt = sim.s.clock + 1800; save(g);   // nothing valid here: try again in half an hour of game time
  return null;
}
/** Accept the pending offer: place the contact, set the survey baseline, start the mission. */
export function acceptOffer(id) {
  const g = st(); if (!g.offer || g.offer.id !== id || !g.offer.delivered) return false;
  if (g.active) { if (!g.defs[id].gen.distress) return false; finish(g.active, 'quit', { forced: true, key: 'quit_distress' }); }   // a distress call outranks any mission: break away, no penalty
  const def = g.defs[id];
  if (def.gen.type === 'survey') { const base = Number(gameState.getProperty('mission.science.stats.analysed')) || 0; def.objectives.find((o) => o.id === 'analyse').triggers[0].value = base + 1; }
  if (g.pendingVessel) { g.vessels = [...g.vessels, g.pendingVessel]; traffic.scripted = g.vessels; delete g.pendingVessel; traffic.candKey = ''; }
  if (def.gen.type === 'patrol') {
    const o = g.offer, a = def.gen.area; g.patrol = { id, name: a.name, lat: a.lat, lon: a.lon, radius: a.radius, from: o.startAt, to: o.endAt, inside: 0, last: null, spawnAt: o.startAt + (1 + Math.random() * 2) * H, spawned: false };
    def.objectives.find((x) => x.id === 'watch').description = `Stay on station in ${a.name} from ${clockText(o.startAt)} until ${clockText(o.endAt)}`;
    def.objectives.find((x) => x.id === 'arrive').description = `Enter the patrol area (${a.radius} nm round ${a.name}) before ${clockText(o.startAt)}`;
    sim.tempAOs = [{ id, name: a.name, lat: a.lat, lon: a.lon, radius: a.radius, from: o.startAt, to: o.endAt }];
  }
  g.active = id; g.offerAccepted = { ...g.offer, acceptedAt: sim.s.clock }; g.offer = null; save(g);
  missionManager.missions.set(id, def);
  return missionManager.startMission(id);
}
export function declineOffer(id, why = 'declined') {
  const g = st(); if (!g.offer || g.offer.id !== id) return false;
  const def = g.defs[id]; g.offer = null; delete g.pendingVessel; g.done = [...g.done, { id, outcome: why, c: sim.s.clock }].slice(-40); scheduleNext(g); save(g);
  if (def.gen.compulsory) applyOutcome(why === 'expired' ? 'expired' : 'declined', {}, `${why}: ${def.name}`);
  return true;
}
const LATENCY_GS = { 1: 3, 2: 2, 3: 4 }, DOWN_GS = { 1: 8, 2: 3, 3: 20 };
/** The offer reaches the Captain: its clocks start now, and the mail lands in the inbox. */
function deliver(g) {
  const o = g.offer, now = sim.s.clock; if (!o || o.delivered) return;
  o.delivered = true; o.offeredAt = now; o.expiresAt = now + o.expiresH * H; o.deadlineAt = o.deadlineH ? now + o.deadlineH * H : null;
  const m = g.held; g.held = null;
  if (o.durH) { o.startAt = Math.ceil((now + (o.expiresH + o.routeH * 1.3 + 0.5) * H) / H) * H; o.endAt = o.startAt + o.durH * H; m.text += `\nOn station from ${clockText(o.startAt)} to ${clockText(o.endAt)} (${o.durH} hours) inside the marked area.`; }
  m.text += (o.deadlineAt ? `\nAnswer by ${clockText(o.expiresAt)}. Finish by ${clockText(o.deadlineAt)}.` : `\nAnswer by ${clockText(o.expiresAt)}.`);
  save(g); mail(m);
  const def = g.defs[o.id]; sim.emit('mission-offer', { id: o.id, name: def.name, compulsory: def.gen.compulsory });
}
/** Mail arrives only over a working link, and a weak signal is slow. Returns true when a link carries it. */
function carry(g) {
  const o = g.offer, best = bestSource(); if (!best) { o.carryAt = null; return false; }
  if (o.carryAt == null) { const L = LINKS[SOURCES.find((x) => x.id === best.id).link - 1], f = Math.max(0.3, Math.min(1.15, best.dB / L.base)); o.carryAt = sim.s.clock + (LATENCY_GS[L.n] || 3) + (DOWN_GS[L.n] || 8) / f; }
  return sim.s.clock >= o.carryAt;
}
function scheduleNext(g, h = null) { g.nextAt = sim.s.clock + (h == null ? Math.random() * MAX_TIMER_H : h) * H; }

// ---------- ending ----------
function removeScripted(g, id) { g.vessels = g.vessels.filter((v) => v.mission !== id); traffic.scripted = g.vessels; traffic.candKey = ''; }
const OUTCOME_WORD = { assist: 'helped', document: 'documented', warn_off: 'warned off', withdraw: 'withdrew', too_late: 'too late', quit: 'abandoned', survey: 'surveyed', assist_rescue: 'rescued', patrol: 'patrolled', patrol_partial: 'patrolled in part' };
const FACTION_EXTRA = { poaching: { warn_off: { poachers: -2 } } };
function finish(id, outcome, { forced = false, key = null } = {}) {
  const g = st(), def = g.defs[id]; if (!def || g.active !== id) return;
  const O = outcome, extra = (FACTION_EXTRA[def.gen.reason] || {})[O] || {};
  applyOutcome(key || O, extra, `${def.name}, ${OUTCOME_WORD[O] || O}`);
  if (forced) {   // the manager did not finish it (quit or too late): take it down by hand
    missionManager.activeMissions.delete(id); missionManager.completedMissions.add(id);
    const done = gameState.getProperty('mission.completedIds') || []; if (!done.includes(id)) gameState.updateProperty('mission.completedIds', [...done, id]);
    gameState.updateProperty('mission.objectives', (gameState.getProperty('mission.objectives') || []).filter((o) => o.missionId !== id));
  }
  removeScripted(g, id); g.patrol = null; sim.tempAOs = []; g.active = null; g.done = [...g.done, { id, outcome: O, c: sim.s.clock }].slice(-40); scheduleNext(g); save(g);
  const lines = P.debrief[key || O] || P.debrief[O] || P.debrief.document, rng = mulberry(def.gen.seed + 1);
  mail({ id: `debrief-${id}`, from: P.requesters[def.gen.requester].from, subject: `Re: ${def.name}`, text: `${fill('{captain}')},\n\n${pick(rng, lines)}\n\n${P.requesters[def.gen.requester].sign}` });
  sim.emit('mission-ended', { id, outcome: O });
}
/** The Captain quits an accepted mission. Compulsory costs more; a started rescue costs the most. */
export function quitMission(id = activeGen()) {
  const g = st(); if (!id || g.active !== id) return false;
  const def = g.defs[id], started = def.gen.type === 'contact' && flag(id, 'near');
  finish(id, 'quit', { forced: true, key: def.gen.compulsory ? 'quit' : started ? 'quit_rescue' : 'quit_optional' });
  return true;
}

// ---------- orders ----------
export function requestOrders() {
  const g = st(); if (!g.active && !g.offer && !canTransmit().ok) return { ok: false, why: 'link' }; if (g.active) return { ok: false, why: 'active' }; if (g.offer) return { ok: false, why: 'offer' }; if (g.nextAt && g.nextAt - sim.s.clock < 600) return { ok: true, soon: true };
  const oera = rep('oera');
  g.nextAt = sim.s.clock + (oera >= 30 ? 120 : 600); save(g); return { ok: true };
}

// ---------- the clock ----------
let last = 0;
function tick() {
  if (!P) return; const g = st(), now = sim.s.clock; if (now - last < 5) return; last = now;
  if (!g.offer && g.distressAt != null && now >= g.distressAt) { g.distressAt = now + (10 + Math.random() * 30) * H; save(g); makeOffer({ distress: true }); return; }
  if (g.offer && !g.offer.delivered) {   // waiting for a link
    if (carry(g)) deliver(g);
    else if (!g.offer.told && !sim.away) { g.offer.told = true; say('comms', 'Captain, OERA has traffic waiting for us, but we have no link. Bring an antenna up and I will pull it down.', 'mission'); save(g); }
    return;
  }
  if (g.offer && now >= g.offer.expiresAt) { declineOffer(g.offer.id, 'expired'); return; }
  if (!g.offer && !g.active && g.nextAt != null && now >= g.nextAt) { makeOffer(); return; }
  const id = g.active; if (!id) return; const def = g.defs[id], v = g.vessels.find((x) => x.mission === id);
  if (def.gen.type === 'contact' && v) {
    const p = { lat: v.A.lat, lon: v.A.lon };   // scripted contacts stay put (or nearly), so the start point is good enough for "near"
    if (!flag(id, 'near') && toward(sim.s, p).nm <= 3) prop(id, 'near', 1);
    if (flag(id, 'near') && v.ident && !flag(id, 'ident')) prop(id, 'ident', 1);
  }
  if (def.gen.type === 'patrol' && g.patrol) patrolTick(g, id, now);
  const dl = g.offerAccepted && g.offerAccepted.deadlineAt;
  const rescue = def.gen.distress, onScene = def.gen.type === 'contact' && flag(id, 'near');
  if (dl && now > dl && !flag(id, 'outcome') && !onScene) finish(id, 'too_late', { forced: true, key: rescue ? 'too_late_rescue' : null });
}
/** On station: time inside the area counts only inside the window. Poachers show up an hour or two in. 80% coverage serves the patrol. */
function patrolTick(g, id, now) {
  const p = g.patrol, dt = p.last == null ? 0 : now - p.last; p.last = now;
  const inside = toward(sim.s, p).nm <= p.radius;
  if (inside && !flag(id, 'inside')) prop(id, 'inside', 1);
  if (inside && now >= p.from && now <= p.to) p.inside += Math.min(dt, 120);
  if (!p.spawned && now >= p.spawnAt && now < p.to) {
    p.spawned = true; const rng = mulberry(g.defs[id].gen.seed + 7), n = 1 + Math.floor(rng() * 2);
    for (let i = 0; i < n; i++) {
      let at = null; for (let t = 0; t < 12 && !at; t++) { const a = rng() * 6.283, r = Math.sqrt(rng()) * p.radius * 0.7, q = { lat: p.lat + (Math.cos(a) * r) / 60, lon: p.lon + (Math.sin(a) * r) / (60 * Math.cos(p.lat * Math.PI / 180)) }; const fl = seafloor.depthAt(q.lat, q.lon); if (fl != null && fl >= 25) at = q; }
      if (!at) continue; const v = makeVessel(id, 'poaching', at, rng); v.id = `s:${id}:${i}`; g.vessels = [...g.vessels, v];
    }
    traffic.scripted = g.vessels; traffic.candKey = '';
  }
  if (!flag(id, 'ident') && g.vessels.some((v) => v.mission === id && v.ident)) prop(id, 'ident', 1);
  if (now >= p.to && !flag(id, 'served')) {
    if (p.inside >= 0.8 * (p.to - p.from)) prop(id, 'served', 1); else finish(id, 'patrol_partial', { forced: true });
  }
}
function onEnd(e) {   // the manager completed a generated mission: record the outcome the decision set
  const id = e.detail.id, g = st(); if (g.active !== id) return;
  const def = g.defs[id]; finish(id, flag(id, 'outcome') || (def.gen.type === 'survey' ? 'survey' : def.gen.type === 'patrol' ? 'patrol' : 'document'));
}

/** Call once after the mission manager and the reputation module are loaded. */
export async function initGenerator() {
  await loadPhrases(); const g = st();
  for (const def of Object.values(g.defs)) missionManager.missions.set(def.id, def);
  traffic.scripted = g.vessels || []; sim.tempAOs = g.patrol ? [{ id: g.patrol.id, name: g.patrol.name, lat: g.patrol.lat, lon: g.patrol.lon, radius: g.patrol.radius, from: g.patrol.from, to: g.patrol.to }] : []; missionManager.restoreFromState();
  document.addEventListener('mission-completed', onEnd);
  sim.afterStep.push(tick);
  // the first generated offer follows the first survey; after that, every report starts the timer
  document.addEventListener('mission-completed', (e) => { const g2 = st(); if (!g2.active && !g2.offer && g2.nextAt == null && e.detail.id === 'firstSurvey') { scheduleNext(g2); g2.distressAt = sim.s.clock + (6 + Math.random() * 30) * H; save(g2); } });
}
