// Pushing the trials (owner, 2026-11-26). In the Trials AO, after each trial (test depth, full speed, super cruise) the department head
// reports how she is doing and, through ARIA, asks to push a little further. Each step that works sets a ship record (logbook).
// Each step risks light damage to a system, which then shows on the engineering computer for repair. Two steps per trial; damage ends it.
import { sim, MAX_KT, SUPER_KT } from './sim.js';
import { gameState, addLogEntry } from './persist.js';
import { offerDecision, pendingDecisions } from './aria.js';
import { tell } from './notify.js';
import { eng, SYSTEMS } from './engineering.js';

export const TRIALS = {
  deep: { obj: 'seaTrials_deep', who: 'engineering', name: 'Chief Doyle', base: 300, unit: 'm', levels: [450, 600], risk: [0.2, 0.45], hit: ['bulkheads', 'ballast'],
    ask: (b, t) => `{captain}, Chief Doyle reports she is holding well at ${b} metres. Hull strain is low and the seals are dry. He asks permission to take her down to ${t} metres.`,
    ok: (t) => `${t} metres, Captain. The hull is groaning a little, which is what hulls do. Nothing is leaking. That is the deepest the Aqua Nova has ever been.`,
    record: (t) => `Ship record: test dive to ${t} metres in the Trials AO, ${t - 300} metres past the rated test depth.` },
  speed: { obj: 'seaTrials_speed', who: 'helm', name: 'Marcus', base: MAX_KT, unit: 'kt', levels: [15.5, 17], risk: [0.2, 0.45], hit: ['propulsion'],
    ask: (b, t) => `{captain}, Marcus has her at ${b} knots on the hydro-jets and says she has more in her. Chief Doyle can run the jets past their rating. He asks permission to try for ${t} knots.`,
    ok: (t) => `${t} knots on the jets, Captain. Faster than the models said. The jets are hot but happy.`,
    record: (t) => `Ship record: ${t} knots on the hydro-jets alone, past their rated ${MAX_KT} knots.` },
  cruise: { obj: 'seaTrials_cruise', who: 'helm', name: 'Marcus', base: SUPER_KT, unit: 'kt', levels: [110, 120], risk: [0.2, 0.45], hit: ['propulsion', 'relays'],
    ask: (b, t) => `{captain}, ${b} knots in super cruise and the hull skin is holding the cavity clean. Marcus and Chief Doyle ask permission to push her to ${t} knots.`,
    ok: (t) => `${t} knots, Captain! The fastest a crewed submarine has ever gone, as far as anyone knows. Easing back now.`,
    record: (t) => `Ship record: ${t} knots in super cruise in the Trials AO.` },
};
const DMG = [8, 18];   // light damage: this much health off one system

const st = () => gameState.getProperty('progress.trials') || {};   // { deep: { level, done }, ..., push: { kind, level } }
const put = (v) => gameState.updateProperty('progress.trials', v);
const objDone = (id) => ((gameState.getProperty('mission.objectives') || []).find((o) => o.id === id) || {}).status === 'completed';
const trialsOn = () => (gameState.getProperty('mission.objectives') || []).some((o) => o.missionId === 'seaTrials');

/** The ship's records (logbook too). */
export const records = () => gameState.getProperty('progress.records') || {};

function offer(kind, level) {
  if (level >= TRIALS[kind].levels.length) return false;
  const T = TRIALS[kind], from = level ? T.levels[level - 1] : T.base, to = T.levels[level];
  return offerDecision({ id: `trials_${kind}_${level + 1}`, text: T.ask(from, to), options: [
    { id: 'push', label: `Push her to ${to} ${T.unit}`, reply: `Aye, {captain}. ${T.name} is on it.`, actions: [{ type: 'set_property', property: 'progress.trials.push', value: { kind, level } }] },
    { id: 'hold', label: 'That will do', reply: 'Understood, {captain}. We will leave it there.', actions: [{ type: 'set_property', property: `progress.trials.${kind}`, value: { level, done: true } }] },
  ] });
}

let saidShallow = false, waitUntil = 0;
function check() {
  const s = sim.s, t = st();
  // a push in progress: drive the ship there, then see what happened
  if (t.push) {
    const { kind, level } = t.push, T = TRIALS[kind], target = T.levels[level];
    if (kind === 'deep') {
      const max = sim.deepest();
      if (max != null && max < target) { if (!saidShallow) { saidShallow = true; tell('engineering', `Not enough water under us for ${target} metres, Captain. Head south over deeper water and I will take her down.`); } return; }
      if (s.targetDepth < target) sim.setDepth(target);
    } else {
      s.overdrive = { kind, f: target / T.base };
      if (kind === 'cruise' && !s.cruise) return;   // waits until super cruise is engaged
      if (kind === 'speed' && s.cruise) return;     // the jets alone: not in super cruise
      s.throttle = 1;
    }
    const v = kind === 'deep' ? s.depth : s.speed;
    if (v < target - (kind === 'deep' ? 3 : 0.3)) return;
    // reached
    s.overdrive = null; saidShallow = false;
    const hurt = Math.random() < T.risk[level];
    const rec = { ...records() }, key = kind; if (!(rec[key] >= target)) { rec[key] = target; gameState.updateProperty('progress.records', rec); addLogEntry(T.record(target), { type: 'discovery_log', tags: ['record', 'trials'], canRevert: false }); }
    if (hurt) {
      const e = eng(), id = T.hit[Math.floor(Math.random() * T.hit.length)], d = Math.round(DMG[0] + Math.random() * (DMG[1] - DMG[0]));
      e.health[id] = Math.max(0, e.health[id] - d);
      const name = SYSTEMS.find((x) => x.id === id).name;
      tell('engineering', `We made ${target} ${T.unit}, Captain, but we paid for it. ${name} took ${d}% damage. It is on the engineering computer for a repair team. I would not push her any further today.`, 'error');
      put({ ...t, push: null, [kind]: { level: level + 1, done: true } });
    } else {
      tell(T.who, T.ok(target), 'mission');
      const next = level + 1, more = next < T.levels.length;
      put({ ...t, push: null, [kind]: { level: next, done: !more } });
      if (more) waitUntil = Date.now() + 20000;   // a breather before they ask again
    }
    return;
  }
  if (!trialsOn() || Date.now() < waitUntil) return;
  if (pendingDecisions().some((d) => d.id.startsWith('trials_'))) return;   // one offer at a time
  // a finished trial with a step still to offer (asking again is harmless: a decision is asked once only)
  for (const kind of Object.keys(TRIALS)) {
    if (!objDone(TRIALS[kind].obj) || (t[kind] && t[kind].done)) continue;
    if (!t[kind]) put({ ...t, [kind]: { level: 0, done: false } });
    if (offer(kind, t[kind] ? t[kind].level : 0)) return;
  }
}
/** Tests: skip the breather between offers. */
export const skipWait = () => { waitUntil = 0; };
let acc = 0;
sim.hooks.push((dt) => { acc += dt; if (acc < 1) return; acc = 0; try { check(); } catch (e) { console.warn('trials', e); } });
