// The engineering model (docs/ENGINEERING.md): ten systems on four power relays, damage, fire, flooding and repairs.
// Rule: with every system healthy and on, the ship behaves exactly as before. State: sim.s.eng (saved as navigation.eng).
import { sim, MAX_KT, TIMESCALE } from './sim.js';

export const SYSTEMS = [
  { id: 'relays', name: 'Power relays', comp: 'mid', relay: null },
  { id: 'propulsion', name: 'Propulsion', comp: 'aft', relay: 'A' },
  { id: 'scrubbers', name: 'CO2 scrubbers', comp: 'mid', relay: 'B' },
  { id: 'o2', name: 'O2', comp: 'mid', relay: 'B' },
  { id: 'water', name: 'Water', comp: 'fwd', relay: 'D' },
  { id: 'hvac', name: 'Heating/cooling', comp: 'fwd', relay: 'D' },
  { id: 'fire', name: 'Fire suppression', comp: 'mid', relay: 'C' },
  { id: 'bulkheads', name: 'Bulkheads', comp: 'mid', relay: 'C' },
  { id: 'ballast', name: 'Ballast', comp: 'aft', relay: 'A' },
  { id: 'air', name: 'Air charge', comp: 'aft', relay: 'A' },
];
export const RELAYS = { A: 'Propulsion', B: 'Life support', C: 'Sensors and comms', D: 'Hotel' };
export const COMPS = { fwd: 'Forward', mid: 'Midships', aft: 'Aft' };
export const AUTO_CLOSE_S = 60, TEAMS = 2, REPAIR_PER_H = 25, DOCK_REPAIR_PER_H = 100, FIRE_AUTO_S = 20, FIRE_AGENT = 25, BLOW_AIR = 60;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/** The components drawn on each system's flow diagram (true = running / open). A system works only when its chain is complete. */
export const PARTS = {
  'prop.coolant': true, 'prop.intake': true, 'prop.port': true, 'prop.stbd': true,
  'scrub.fan': true, 'scrub.a': true, 'scrub.b': false,
  'o2.feed': true, 'o2.cell': true, 'o2.tank': true,
  'water.intake': true, 'water.hp': true, 'water.dist': true,
  'hvac.sea': true, 'hvac.comp': true, 'hvac.fan': true,
  'fire.main': true,
  'bulk.pump.fwd': true, 'bulk.pump.aft': true,
  'air.intake': true, 'air.comp': true, 'air.bank': true,
};
export const part = (k) => !!eng().parts[k];
export function setPart(k, v) { if (!(k in PARTS)) return { ok: false }; eng().parts[k] = !!v; syncScrub(); sim.touch(); sim.emit('eng-part', { k, v: !!v }); return { ok: true }; }
export const togglePart = (k) => setPart(k, !part(k));
// what each chain gives
const scrubFromParts = () => (!part('scrub.fan') ? 'off' : part('scrub.a') && part('scrub.b') ? 'boost' : part('scrub.a') || part('scrub.b') ? 'normal' : 'off');
function syncScrub() { eng().scrubMode = scrubFromParts(); }
export const o2Making = () => working('o2') && part('o2.feed') && part('o2.cell');
export const desalMaking = () => working('water') && part('water.intake') && part('water.hp');
export const hvacRunning = () => working('hvac') && part('hvac.sea') && part('hvac.comp') && part('hvac.fan');
export const airCharging = () => working('air') && part('air.intake') && part('air.comp') && sim.s.depth < 20;
export function eng() {
  const s = sim.s;
  if (!s.eng) s.eng = {};
  const e = s.eng;
  e.health ||= Object.fromEntries(SYSTEMS.map((x) => [x.id, 100]));
  for (const x of SYSTEMS) if (e.health[x.id] == null) e.health[x.id] = 100;
  e.relays ||= { A: true, B: true, C: true, D: true };
  e.on ||= { o2: true, water: true, hvac: true, fusion: true, compressor: true };
  e.scrubMode ||= 'normal';
  e.parts ||= {}; for (const [k, v] of Object.entries(PARTS)) if (e.parts[k] == null) e.parts[k] = v;   // pumps, valves, fans: all on/open in a healthy ship
  if (e.water == null) e.water = 100; if (e.o2tank == null) e.o2tank = 100; if (e.air == null) e.air = 100; if (e.agent == null) e.agent = 100;
  if (e.cabin == null) e.cabin = 21; if (e.set == null) e.set = 21; if (e.co2x == null) e.co2x = 0;
  if (e.armed == null) e.armed = true;
  e.bulk ||= { fwd: true, aft: true };   // true = open
  e.flood ||= { fwd: 0, aft: 0 };        // 0-100 in each compartment
  e.leak ||= { fwd: false, aft: false };
  e.repairs ||= [];                      // [{ id }]: a team on a system
  if (e.next == null) e.next = 0;        // whose turn it is to take damage
  return e;
}
export const hp = (id) => eng().health[id];
/** A system works when its relay is closed, the relay system itself is alive, and it has health left. */
export const powered = (id) => { const e = eng(), x = SYSTEMS.find((q) => q.id === id); return !x.relay || (e.relays[x.relay] && e.health.relays > 0); };
export const working = (id) => powered(id) && eng().health[id] > 0;
export const status = (id) => { const e = eng(), h = e.health[id], x = SYSTEMS.find((q) => q.id === id); if (e.fire && e.fire.comp === x.comp) return 'fire'; if (!powered(id) || h <= 0) return 'offline'; return h < 50 ? 'degraded' : 'ok'; };
export const fusionOk = () => working('propulsion') && eng().on.fusion && eng().health.propulsion >= 25 && part('prop.coolant');   // the coolant pump keeps the drive alive
/** Top speed from the hydro-jets: full at 50 health or more, falling to half as they are hurt; nothing without relay A. */
export const jetFactor = () => (!working('propulsion') || !part('prop.intake') ? 0 : clamp(0.5 + eng().health.propulsion / 100, 0.5, 1) * ((part('prop.port') ? 0.5 : 0) + (part('prop.stbd') ? 0.5 : 0)));   // each hydro-jet is half the thrust
export const busyTeams = () => eng().repairs.length;

/** Captain's controls. Each returns { ok, why }. */
export function setRelay(r, on) { const e = eng(); e.relays[r] = !!on; sim.touch(); sim.emit('eng-relay', { r, on: !!on }); return { ok: true }; }
const ON_PART = { o2: 'o2.cell', water: 'water.hp', hvac: 'hvac.comp', compressor: 'air.comp' };
export function setOn(k, on) { if (ON_PART[k]) return setPart(ON_PART[k], on); eng().on[k] = !!on; sim.touch(); return { ok: true }; }
export function setScrub(mode) { if (!['normal', 'boost', 'off'].includes(mode)) return { ok: false }; const p = eng().parts; p['scrub.fan'] = mode !== 'off'; if (mode !== 'off') { p['scrub.a'] = true; p['scrub.b'] = mode === 'boost'; } syncScrub(); sim.touch(); return { ok: true }; }
export function setCabin(t) { eng().set = clamp(Math.round(t), 18, 24); sim.touch(); return { ok: true }; }
export function setArmed(on) { eng().armed = !!on; sim.touch(); return { ok: true }; }
export function setBulkhead(c, open) { eng().bulk[c] = !!open; sim.touch(); sim.emit('eng-bulkhead', { c, open: !!open }); return { ok: true }; }
export function discharge() {
  const e = eng(); if (!e.fire) return { ok: false, why: 'nofire' }; if (e.agent < FIRE_AGENT) return { ok: false, why: 'agent' }; if (!working('fire')) return { ok: false, why: 'offline' }; if (!part('fire.main')) return { ok: false, why: 'valve' };
  e.agent -= FIRE_AGENT; const comp = e.fire.comp; e.fire = null; sim.touch(); sim.emit('eng-fire-out', { comp }); return { ok: true };
}
export function blow() {
  const e = eng(), s = sim.s; if (e.air < BLOW_AIR) return { ok: false, why: 'air' }; if (!working('ballast')) return { ok: false, why: 'offline' }; if (!part('air.bank')) return { ok: false, why: 'valve' }; if (s.depth < 1) return { ok: false, why: 'surface' };
  e.air -= BLOW_AIR; e.blowing = true; s.targetDepth = 0; sim.touch(); sim.emit('eng-blow', {}); return { ok: true };
}
export function repair(id) {
  const e = eng(); if (e.health[id] >= 100) return { ok: false, why: 'full' }; if (e.repairs.some((r) => r.id === id)) return { ok: false, why: 'already' };
  if (e.repairs.length >= TEAMS) return { ok: false, why: 'teams' };
  e.repairs.push({ id }); sim.touch(); return { ok: true };
}
export function standDown(id) { const e = eng(); e.repairs = e.repairs.filter((r) => r.id !== id); sim.touch(); }

/** Damage a system (in turn round the list): twice the hull damage. Big hits start a fire; bigger ones open a leak. */
function onHit(d) {
  const e = eng(), x = SYSTEMS[e.next % SYSTEMS.length]; e.next++;
  e.health[x.id] = clamp(e.health[x.id] - d * 2, 0, 100);
  sim.emit('eng-damage', { id: x.id, name: x.name, hp: Math.round(e.health[x.id]) });
  if (d >= 15 && !e.fire) { e.fire = { comp: x.comp, t: 0 }; sim.emit('eng-fire', { comp: x.comp }); }
  if (d >= 20) { const c = x.comp === 'fwd' ? 'fwd' : 'aft'; if (!e.leak[c]) { e.leak[c] = true; e.health.bulkheads = Math.min(e.health.bulkheads, 60); sim.emit('eng-leak', { comp: c }); } }   // a leak damages Bulkheads: repairing it seals the leak
}
sim.on((type, data) => { if (type === 'bump' && data && data.damage) onHit(data.damage); });

// speed and super cruise follow the hydro-jets and the fusion drive
sim.speedCaps.push(() => { const f = jetFactor(); return f >= 1 ? null : MAX_KT * f; });
sim.cruiseGate = sim.cruiseGate || [];
sim.cruiseGate.push(() => (fusionOk() ? null : 'fusion'));

sim.hooks.push((dt) => {
  const s = sim.s, e = eng(), g = dt * TIMESCALE, h = g / 3600, sub = s.depth >= 3 && !s.docked;
  // relays: what loses power stops
  if (!working('fire') && e.armed && !powered('fire')) { /* stays armed, but cannot act */ }
  if (!e.relays.C || e.health.relays <= 0) s.sonar = false;
  if (!e.relays.D || e.health.relays <= 0) s.lights = false;
  if (s.cruise && !fusionOk()) { s.cruise = false; sim.emit('eng-cruise-lost', {}); }
  // CO2: scrubbers off or out (submerged) and it climbs; on, it settles back. Boost uses the canisters twice as fast and clears it quickly.
  syncScrub(); const scrub = working('scrubbers') && e.scrubMode !== 'off';
  if (sub && !scrub) e.co2x = clamp(e.co2x + 0.5 * h, 0, 4);
  else e.co2x = clamp(e.co2x - (e.scrubMode === 'boost' ? 3 : 1) * h, 0, 4);
  if (sub && scrub && e.scrubMode === 'boost' && s.scrubbers > 0) s.scrubbers = clamp(s.scrubbers - 100 * g / (90 * 86400), 0, 100);   // the second half of boost's use
  // O2: the generator keeps the air; without it (submerged) the tank goes first, then the air
  if (sub && !o2Making()) { if (e.o2tank > 0 && part('o2.tank')) e.o2tank = clamp(e.o2tank - 8 * h, 0, 100); else s.oxygen = clamp(s.oxygen - 8 * h, 0, 100); }   // the tank only helps with its valve open
  else if (e.o2tank < 100 && o2Making() && part('o2.tank')) e.o2tank = clamp(e.o2tank + 5 * h, 0, 100);
  if (s.docked) e.o2tank = clamp(e.o2tank + 50 * h, 0, 100);
  // water
  if (desalMaking()) e.water = clamp(e.water + 1 * h, 0, 100); else if (part('water.dist')) e.water = clamp(e.water - 2 * h, 0, 100);   // distribution pump off: nobody draws water
  if (s.docked) e.water = clamp(e.water + 50 * h, 0, 100);
  // cabin temperature: held at the set point, or drifting toward the sea
  const want = hvacRunning() ? e.set : s.temp;
  e.cabin = e.cabin + (want - e.cabin) * clamp(h * (want === e.set ? 4 : 0.5), 0, 1);
  // air charge: the compressor recharges near the surface
  if (airCharging()) e.air = clamp(e.air + 30 * h, 0, 100);
  if (e.blowing && s.depth < 1) e.blowing = false;
  // fire
  if (e.fire) {
    e.fire.t += g;
    for (const x of SYSTEMS) if (x.comp === e.fire.comp) e.health[x.id] = clamp(e.health[x.id] - 2 * g / 60, 0, 100);
    if (e.armed && working('fire') && part('fire.main') && e.fire.t >= FIRE_AUTO_S && e.agent >= FIRE_AGENT) { e.agent -= FIRE_AGENT; const comp = e.fire.comp; e.fire = null; sim.emit('eng-fire-out', { comp, auto: true }); }
  }
  // flooding: a leak floods its compartment; with the bulkhead open it costs hull, closed it is contained and the pumps clear it
  for (const c of ['fwd', 'aft']) {
    if (e.leak[c] && !s.docked) {
      e.flood[c] = clamp(e.flood[c] + 10 * g / 60, 0, 100); if (e.bulk[c]) s.damage = Math.min(100, s.damage + 1 * g / 60);
      e.leakT ||= {}; e.leakT[c] = (e.leakT[c] || 0) + g;   // the damage-control crew close a flooding compartment themselves after a minute
      if (e.bulk[c] && e.leakT[c] >= AUTO_CLOSE_S && !e.autoClosed?.[c]) { e.bulk[c] = false; (e.autoClosed ||= {})[c] = true; sim.emit('eng-bulkhead-auto', { c }); }
    } else {
      if (e.leakT) { e.leakT[c] = 0; if (e.autoClosed) e.autoClosed[c] = false; }
      if (e.flood[c] > 0 && part('bulk.pump.' + c)) e.flood[c] = clamp(e.flood[c] - (100 / 10) * g / 60, 0, 100);   // sealed: its bilge pump clears it in 10 minutes
    }
    if (e.leak[c] && !e.bulk[c] && e.flood[c] >= 100) e.flood[c] = 100;
  }
  if (s.docked) { e.leak.fwd = e.leak.aft = false; }
  // repairs
  const rate = (s.docked ? DOCK_REPAIR_PER_H : REPAIR_PER_H) * h;
  for (const r of e.repairs) {
    e.health[r.id] = clamp(e.health[r.id] + rate, 0, 100);
    if (r.id === 'bulkheads' && e.health.bulkheads >= 100) { e.leak.fwd = e.leak.aft = false; }
  }
  const done = e.repairs.filter((r) => e.health[r.id] >= 100); if (done.length) { e.repairs = e.repairs.filter((r) => e.health[r.id] < 100); done.forEach((r) => sim.emit('eng-repaired', { id: r.id, name: SYSTEMS.find((x) => x.id === r.id).name })); }
});
