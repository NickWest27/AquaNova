// Reputation. Seven groups, -100..+100. Standing never drifts back: what you do stays done.
// A mission outcome (or an accident) moves the groups it touches; related groups follow by the relation matrix, once.
// State lives in `mission.reputation` so it is saved with the game.
import { sim } from './sim.js';
import { gameState } from './persist.js';

let cfg = null;
const KEY = 'mission.reputation';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rel = (a, b) => { const r = cfg.relations; return r[`${a}|${b}`] ?? r[`${b}|${a}`] ?? 0; };

export async function loadReputation() {
  if (cfg) return cfg;
  cfg = await fetch(new URL('../../data/world/reputation.json', import.meta.url)).then((r) => r.json());
  return cfg;
}
export const config = () => cfg;
const state = () => {
  let st = gameState.getProperty(KEY);
  if (!st || !st.v) { st = { v: { ...(cfg ? cfg.start : {}) }, log: [] }; gameState.updateProperty(KEY, st); }
  return st;
};
export const names = () => Object.keys(cfg.factions);
export const label = (f) => cfg.factions[f].name;
export const rep = (f) => state().v[f] || 0;
export const all = () => names().map((f) => ({ id: f, name: label(f), value: rep(f), tier: tier(f) }));
export const tierOf = (v) => { let t = cfg.tiers[0].name; for (const x of cfg.tiers) if (v >= x.min) t = x.name; return t; };
export const tier = (f) => tierOf(rep(f));
export const history = () => state().log;

/** Move standing. `deltas` is { faction: n }. Each direct change is capped at max_per_event; related groups follow once, by delta x relation x spill. */
export function applyDeltas(deltas, why = '') {
  const st = state(), cap = cfg.max_per_event, spill = cfg.spill, direct = {}, moved = {};
  for (const [f, d] of Object.entries(deltas || {})) if (cfg.factions[f]) direct[f] = clamp(d, -cap, cap);
  for (const f of Object.keys(cfg.factions)) {
    let d = direct[f] || 0;
    if (!(f in direct)) for (const [g, dg] of Object.entries(direct)) d += dg * rel(f, g) * spill;      // spill-over from direct changes only: no chaining
    d = Math.round(d * 10) / 10;
    if (d) { const old = st.v[f] || 0; st.v[f] = clamp(Math.round((old + d) * 10) / 10, -100, 100); moved[f] = st.v[f] - old; }
  }
  st.log = [...st.log.slice(-39), { c: Math.round(sim.s.clock), why, d: moved }];
  gameState.updateProperty(KEY, st); sim.emit('reputation', { why, moved });
  return moved;
}
/** An outcome key from the outcomes table, plus any extra per-mission deltas (added on top). */
export function applyOutcome(key, extra = {}, why = key) {
  const base = { ...(cfg.outcomes[key] || {}) };
  for (const [f, d] of Object.entries(extra)) base[f] = (base[f] || 0) + d;
  return applyDeltas(base, why);
}

/** Which standing group does a world faction (traffic or dock) belong to? */
export const groupOf = (wf) => cfg.group_of[wf] || 'civil';
export const isEnemy = (group) => cfg.enemy.includes(group);
/** The Tern cannot resupply at an enemy base, colony or port. */
export const enemyDock = (poi) => !!poi && isEnemy(groupOf(poi.faction));

// Accidents cost standing with the civil community: a collision, and more if she sank.
sim.on((type, data) => {
  if (!cfg) return;
  if (type === 'bump' && data.kind === 'ship') applyOutcome('accident', {}, 'collision');
  else if (type === 'ship-sunk') applyOutcome('sunk_ship', {}, 'sunk ship');
});
