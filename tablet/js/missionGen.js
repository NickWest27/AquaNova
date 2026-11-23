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
import { fill } from './player.js';
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
export function generate(seed, { type, compulsory } = {}) {
  const g = st(), rng = mulberry(seed), s = sim.s, now = s.clock;
  type = type || pick(rng, ['contact', 'survey']);
  const id = `gen_${g.n + 1}`, vars = { captain: fill('{captain}') };
  let spot, poi = null, reason = null, urgency = 'routine', route = 0, req;
  if (type === 'contact') {
    reason = pick(rng, Object.keys(REASONS)); const R = REASONS[reason]; urgency = 'priority';
    if (R.sanctuary) { const sa = s.pois.filter((q) => q.type === 'sanctuary'); if (!sa.length) return null; poi = pick(rng, sa); const h = routeHours(poi); if (h == null || h > 7) return null; spot = { p: { lat: poi.lat + (rng() - 0.5) * 0.04, lon: poi.lon + (rng() - 0.5) * 0.04 }, hours: h }; }
    else spot = findSpot(rng, { ...R, maxH: 6 });
    if (!spot) return null; if (!poi) poi = nearPlace(spot.p);
    req = reason === 'poaching' ? 'fisheries' : reason === 'adrift' ? 'harbour' : 'oera_ops';
  } else {
    const site = findSite(rng, 9); if (!site) return null; poi = site.q; spot = { p: { lat: poi.lat, lon: poi.lon }, hours: site.hours }; req = pick(rng, ['oera_ops', 'university']);
  }
  route = spot.hours; const R = P.requesters[req], comp = compulsory != null ? compulsory : (R.compulsory && type === 'survey' ? rng() < 0.5 : R.compulsory);
  const b = toward(s, spot.p), place = type === 'contact' && reason !== 'poaching' ? (poi ? `${poi.name}` : 'open water') : poi.name;
  const expiresH = type === 'contact' ? 1 + Math.floor(rng() * 2) : 12, deadlineH = type === 'contact' ? Math.ceil((expiresH + route * 1.6 + 1) * 2) / 2 : null;
  Object.assign(vars, { place, nm: Math.round(b.nm), dir: compass(b.brg), hours: deadlineH && `${deadlineH} hours`, expires: `${expiresH} hour${expiresH > 1 ? 's' : ''}` });
  const text = [take(g, rng, `open.${req}`, vars), '',
    take(g, rng, type === 'contact' ? `situation.contact.${reason}` : 'situation.survey', vars),
    take(g, rng, type === 'contact' ? `ask.contact.${reason}` : 'ask.survey', vars), '',
    take(g, rng, deadlineH ? 'time.deadline' : 'time.soft', vars), take(g, rng, 'limit.expires', vars),
    take(g, rng, comp ? 'limit.compulsory' : 'limit.optional', vars), '', take(g, rng, `close.${req}`, vars), '', R.sign].join('\n');
  const facts = `Position: ${Math.round(b.nm)} nm, bearing ${String(Math.round(b.brg)).padStart(3, '0')}°. Travel about ${route < 1 ? Math.round(route * 60) + ' minutes' : route.toFixed(1) + ' hours'} by the planned route.`;
  const name = type === 'contact' ? { adrift: 'Vessel in trouble', lost_survey: 'Silent survey ship', poaching: 'Poachers in the closed area' }[reason] : `Survey: ${poi.name}`;
  const objectives = type === 'contact' ? [
    { id: 'go', description: `Close on the contact near ${place} (${Math.round(b.nm)} nm ${compass(b.brg)})`, required: true, triggers: [{ type: 'property_at_least', property: `${KEY}Flags.${id}.near`, value: 1 }] },
    { id: 'identify', description: 'Identify the vessel: scan it, sweep it or hail it', required: true, after: 'go', triggers: [{ type: 'property_at_least', property: `${KEY}Flags.${id}.ident`, value: 1 }],
      onComplete: [{ type: 'aria_decision', id: `${id}_d`, text: P.decisions[reason].text, options: P.decisions[reason].options.map((o) => ({ id: o.id, label: o.label, reply: o.reply, actions: [{ type: 'set_property', property: `${KEY}Flags.${id}.outcome`, value: o.outcome }] })) }] },
    { id: 'decide', description: 'Decide how to handle the vessel', required: true, after: 'identify', triggers: [{ type: 'decision_made', decisionId: `${id}_d` }] },
    { id: 'report', description: 'Send your report to the requester from Comms', required: true, after: 'decide', triggers: [{ type: 'report_sent' }] },
  ] : [
    { id: 'go', description: `Go to ${poi.name} (${Math.round(b.nm)} nm ${compass(b.brg)})`, required: true, triggers: [{ type: 'location_enter', location: poi.name.toLowerCase() }] },
    { id: 'analyse', description: 'Take a sample there and analyse it in the Science Lab', required: true, after: 'go', triggers: [{ type: 'property_at_least', property: 'mission.science.stats.analysed', value: 99999 }] },   // value set at acceptance (baseline + 1)
    { id: 'report', description: 'Send your findings from Comms', required: true, after: 'analyse', triggers: [{ type: 'report_sent' }] },
  ];
  const def = { id, name, description: facts, category: 'generated', priority: urgency === 'priority' ? 'high' : 'normal', autoStart: false, prerequisites: [], objectives, onComplete: [],
    gen: { type, reason, urgency, compulsory: comp, requester: req, faction: req === 'fisheries' || req === 'harbour' ? 'civil' : 'oera', target: spot.p, place, routeH: +route.toFixed(2), seed } };
  const offer = { id, expiresAt: now + expiresH * H, deadlineAt: deadlineH ? now + deadlineH * H : null, offeredAt: now };
  const message = { id: `offer-${id}`, from: R.from, subject: `${comp ? 'Orders' : 'Request'}: ${name}`, text: text + '\n\n' + facts + (deadlineH ? `\nAnswer by ${clockText(offer.expiresAt)}. Finish by ${clockText(offer.deadlineAt)}.` : `\nAnswer by ${clockText(offer.expiresAt)}.`), missionId: id, offer: true, compulsory: comp };
  return { def, offer, message, vessel: type === 'contact' ? makeVessel(id, reason, spot.p, rng) : null };
}

function makeVessel(id, reason, p, rng) {
  const R = REASONS[reason], k = traffic.cfg.kinds[R.kind], fac = (sim.world.factions || {})[k.faction] || {}, still = reason !== 'poaching';
  const off = { lat: p.lat + 0.004, lon: p.lon + 0.004 };
  return { id: `s:${id}`, scripted: true, mission: id, kind: R.kind, faction: k.faction, factionName: fac.name || k.faction, stance: reason === 'poaching' ? 'hostile' : 'neutral', label: k.label, size: k.size,
    kt: still ? 0 : 2, A: { ...p }, B: still ? { ...p } : off, L: 0.4, phase: 0, boldness: 0, ais: false, bias: (rng() - 0.5) * 2, name: reason === 'poaching' ? 'Unmarked trawler' : reason === 'adrift' ? 'F/V ' + pick(rng, ['Marion K', 'Dawn Patrol', 'Two Sisters']) : 'RV ' + pick(rng, ['Calypso II', 'Meridian Star', 'Kestrel']),
    mhz: +(156 + 0.025 * Math.floor(rng() * 240)).toFixed(3), reply: Math.floor(rng() * 1000), ident: false, alerted: false, dyn: null, hitAt: -1e9 };
}

// ---------- offers ----------
const mail = (m) => missionManager.sendMessage(m);
const activeGen = () => { const g = st(); return g.active; };
export const hasActive = () => !!activeGen();
export const pendingOffer = () => st().offer;
export const isGenerated = (id) => !!st().defs[id];

export function makeOffer(opts = {}) {
  const g = st(); if (g.offer || g.active) return null;
  for (let tries = 0; tries < 8; tries++) {
    const r = generate((Math.floor(Math.random() * 2e9) ^ (g.n * 7919)) >>> 0, opts); if (!r) continue;
    g.n++; g.defs[r.def.id] = r.def; g.offer = r.offer; g.nextAt = null; if (r.vessel) g.pendingVessel = r.vessel;
    missionManager.missions.set(r.def.id, r.def); save(g); mail(r.message);
    sim.emit('mission-offer', { id: r.def.id, name: r.def.name, compulsory: r.def.gen.compulsory });
    return r;
  }
  g.nextAt = sim.s.clock + 1800; save(g);   // nothing valid here: try again in half an hour of game time
  return null;
}
/** Accept the pending offer: place the contact, set the survey baseline, start the mission. */
export function acceptOffer(id) {
  const g = st(); if (!g.offer || g.offer.id !== id || g.active) return false;
  const def = g.defs[id];
  if (def.gen.type === 'survey') { const base = Number(gameState.getProperty('mission.science.stats.analysed')) || 0; def.objectives.find((o) => o.id === 'analyse').triggers[0].value = base + 1; }
  if (g.pendingVessel) { g.vessels = [...g.vessels, g.pendingVessel]; traffic.scripted = g.vessels; delete g.pendingVessel; traffic.candKey = ''; }
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
function scheduleNext(g, h = null) { g.nextAt = sim.s.clock + (h == null ? Math.random() * MAX_TIMER_H : h) * H; }

// ---------- ending ----------
function removeScripted(g, id) { g.vessels = g.vessels.filter((v) => v.mission !== id); traffic.scripted = g.vessels; traffic.candKey = ''; }
const FACTION_EXTRA = { poaching: { warn_off: { poachers: -2 } } };
function finish(id, outcome, { forced = false, key = null } = {}) {
  const g = st(), def = g.defs[id]; if (!def || g.active !== id) return;
  const O = outcome, extra = (FACTION_EXTRA[def.gen.reason] || {})[O] || {};
  applyOutcome(key || O, extra, `${def.name}: ${O}`);
  if (forced) {   // the manager did not finish it (quit or too late): take it down by hand
    missionManager.activeMissions.delete(id); missionManager.completedMissions.add(id);
    const done = gameState.getProperty('mission.completedIds') || []; if (!done.includes(id)) gameState.updateProperty('mission.completedIds', [...done, id]);
    gameState.updateProperty('mission.objectives', (gameState.getProperty('mission.objectives') || []).filter((o) => o.missionId !== id));
  }
  removeScripted(g, id); g.active = null; g.done = [...g.done, { id, outcome: O, c: sim.s.clock }].slice(-40); scheduleNext(g); save(g);
  const lines = P.debrief[O] || P.debrief.document, rng = mulberry(def.gen.seed + 1);
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
  const g = st(); if (g.active) return { ok: false, why: 'active' }; if (g.offer) return { ok: false, why: 'offer' }; if (g.nextAt && g.nextAt - sim.s.clock < 600) return { ok: true, soon: true };
  const oera = rep('oera');
  g.nextAt = sim.s.clock + (oera >= 30 ? 120 : 600); save(g); return { ok: true };
}

// ---------- the clock ----------
let last = 0;
function tick() {
  if (!P) return; const g = st(), now = sim.s.clock; if (now - last < 5) return; last = now;
  if (g.offer && now >= g.offer.expiresAt) { declineOffer(g.offer.id, 'expired'); return; }
  if (!g.offer && !g.active && g.nextAt != null && now >= g.nextAt) { makeOffer(); return; }
  const id = g.active; if (!id) return; const def = g.defs[id], v = g.vessels.find((x) => x.mission === id);
  if (def.gen.type === 'contact' && v) {
    const p = { lat: v.A.lat, lon: v.A.lon };   // scripted contacts stay put (or nearly), so the start point is good enough for "near"
    if (!flag(id, 'near') && toward(sim.s, p).nm <= 3) prop(id, 'near', 1);
    if (flag(id, 'near') && v.ident && !flag(id, 'ident')) prop(id, 'ident', 1);
  }
  const dl = g.offerAccepted && g.offerAccepted.deadlineAt;
  if (dl && now > dl && !flag(id, 'outcome')) finish(id, 'too_late', { forced: true });
}
function onEnd(e) {   // the manager completed a generated mission: record the outcome the decision set
  const id = e.detail.id, g = st(); if (g.active !== id) return;
  const def = g.defs[id]; finish(id, flag(id, 'outcome') || (def.gen.type === 'survey' ? 'survey' : 'document'));
}

/** Call once after the mission manager and the reputation module are loaded. */
export async function initGenerator() {
  await loadPhrases(); const g = st();
  for (const def of Object.values(g.defs)) missionManager.missions.set(def.id, def);
  traffic.scripted = g.vessels || []; missionManager.restoreFromState();
  document.addEventListener('mission-completed', onEnd);
  sim.afterStep.push(tick);
  // the first generated offer follows the first survey; after that, every report starts the timer
  document.addEventListener('mission-completed', (e) => { const g2 = st(); if (!g2.active && !g2.offer && g2.nextAt == null && e.detail.id === 'firstSurvey') { scheduleNext(g2); save(g2); } });
}
