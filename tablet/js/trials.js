// Pushing the jets in the Sea Trials (owner, 2026-11-26, reworked 2026-11-28). After the full-speed trial Marcus asks, through ARIA,
// to try a knot more, again and again, until the Captain says stop or something gives (light damage, shown on the engineering computer).
import { sim, MAX_KT } from './sim.js';
import { gameState } from './persist.js';
import { offerDecision, pendingDecisions } from './aria.js';
import { tell, say } from './notify.js';
import { sfx } from './audio.js';
import { eng, SYSTEMS } from './engineering.js';
import { traffic } from './traffic.js';

// The escort (owner, 2026-11-27): while Sea Trials runs, two friendly ships patrol the Trials AO on AIS, as Admiral Okafor's letter promised.
// A: one end of the patrol leg, B: the other, L: its length in nm (posAt in traffic.js walks it back and forth).
const ESCORTS = [
  { id: 'esc:seaward', name: 'OERA Seaward', kind: 'research', faction: 'oera', factionName: 'O.E.R.A.', stance: 'friendly', label: 'Support ship', size: 3, kt: 8, A: { lat: 39.82, lon: -71.17 }, B: { lat: 39.82, lon: -70.83 }, L: 15.7, phase: 0.2, boldness: 0, ais: true, bias: 0, escort: true },
  { id: 'esc:vigilant', name: 'CGC Vigilant', kind: 'patrol', faction: 'civil', factionName: 'Civil Harbour Authority', stance: 'friendly', label: 'Patrol cutter', size: 2, kt: 14, A: { lat: 40.02, lon: -70.95 }, B: { lat: 39.78, lon: -71.05 }, L: 15.4, phase: 0.7, boldness: 0, ais: true, bias: 0, escort: true },
];
const trialsRunning = () => (gameState.getProperty('mission.objectives') || []).some((o) => o.missionId === 'seaTrials');

// The jets test (owner, 2026-11-28). Depth is only a certification tick (300 m) and super cruise is not pushed. The hydro-jets are the real
// test: after the full-speed trial Marcus keeps asking to try a knot more, each step riskier, until something gives. The last speed reached
// without damage is the ship's top speed on the jets from then on (sim.jetTop). Stopping ("That will do") keeps the speed reached so far.
const STEP_KT = 1, RISK0 = 0.1, RISK_STEP = 0.12;   // 15 kt: 10%, 16 kt: 22%, 17 kt: 34% ...
export const TRIALS = {
  speed: { obj: 'seaTrials_speed', who: 'helm', name: 'Marcus', unit: 'kt', hit: ['propulsion'],
    ask: (b, t) => `{captain}, Marcus has her at ${b} knots on the hydro-jets and says she has more in her. Chief Doyle can run the jets past their rating. He asks permission to try for ${t} knots.`,
    ok: (t) => `${t} knots on the jets, Captain, and nothing gave. Chief Doyle says the jets are hot but happy. That is our new top speed.`,
    record: (t) => `Top speed on the hydro-jets: ${t} knots, found in the Sea Trials (rated ${MAX_KT}).` },
};
const DMG = [8, 18];   // light damage: this much health off one system

const st = () => gameState.getProperty('progress.trials') || {};   // { speed: { top, done }, push: { kind, target } }
const put = (v) => gameState.updateProperty('progress.trials', v);
const objDone = (id) => ((gameState.getProperty('mission.objectives') || []).find((o) => o.id === id) || {}).status === 'completed';
const trialsOn = () => (gameState.getProperty('mission.objectives') || []).some((o) => o.missionId === 'seaTrials');

/** The ship's records (logbook too). records().speed = top speed on the jets found in the trials. */
export const records = () => gameState.getProperty('progress.records') || {};
/** The jets' top speed: the trials' result, or their rating. */
export const jetTop = () => Math.max(MAX_KT, records().speed || 0);
sim.jetTop = jetTop;

const topNow = (t) => (t.speed && t.speed.top) || MAX_KT;
function offer(top) {
  const to = top + STEP_KT;
  return offerDecision({ id: `trials_speed_${to}`, text: TRIALS.speed.ask(top, to), options: [
    { id: 'push', label: `Push her to ${to} kt`, reply: 'Aye, {captain}. Marcus is on it.', actions: [{ type: 'set_property', property: 'progress.trials.push', value: { kind: 'speed', target: to } }] },
    { id: 'hold', label: 'That will do', reply: `Understood, {captain}. ${top} knots it is.`, actions: [{ type: 'set_property', property: 'progress.trials.speed', value: { top, done: true } }] },
  ] });
}
function setTop(kt) {
  const rec = { ...records(), speed: kt }; gameState.updateProperty('progress.records', rec);
  const fs = (gameState.getProperty('mission.discoveries') || []).filter((f) => f.id !== 'record-speed');
  gameState.updateProperty('mission.discoveries', [...fs, { id: 'record-speed', name: 'Top speed', description: TRIALS.speed.record(kt), type: 'record' }]);   // in PED Findings
}

let waitUntil = 0;
const said = { start: null, wait: null };
function check() {
  const s = sim.s, t = st();
  if (t.push) {   // a push in progress: Marcus runs the jets up, then we see what happened
    const T = TRIALS.speed, target = t.push.target, top = topNow(t), pk = 'speed' + target;
    if (said.start !== pk) { said.start = pk; said.wait = null; tell(T.who, `Opening up the jets, Captain. Going for ${target} knots. I will tell you when we make it.`, 'mission'); }
    if (s.cruise) { if (said.wait !== pk) { said.wait = pk; tell(T.who, `Take us out of super cruise, Captain. This one is on the hydro-jets alone. Then I will open them up to ${target} knots.`, 'mission'); } return; }
    s.overdrive = { kind: 'speed', f: target / MAX_KT }; s.throttle = 1;
    if (s.speed < target - 0.3) return;
    s.overdrive = null;
    const step = Math.round((target - MAX_KT) / STEP_KT), risk = Math.min(0.95, RISK0 + RISK_STEP * (step - 1));
    if (Math.random() < risk) {   // something gave: the last safe speed is her top speed
      const e = eng(), id = T.hit[Math.floor(Math.random() * T.hit.length)], d = Math.round(DMG[0] + Math.random() * (DMG[1] - DMG[0]));
      e.health[id] = Math.max(0, e.health[id] - d);
      const name = SYSTEMS.find((x) => x.id === id).name;
      sfx('impact');
      say('engineering', `We touched ${target} knots, Captain, but we paid for it. ${name} took ${d}% damage. It is on the engineering computer for a repair team. ${top} knots is her safe top speed. I would not push her past it.`, 'error', { notice: `DAMAGE: ${name.toUpperCase()} ${d}%` });
      setTop(top); put({ ...t, push: null, speed: { top, done: true } });
    } else {
      tell(T.who, T.ok(target), 'mission');
      setTop(target); put({ ...t, push: null, speed: { top: target, done: false } });
      waitUntil = Date.now() + 20000;   // a breather before he asks again
    }
    return;
  }
  if (!trialsOn() || Date.now() < waitUntil) return;
  if (pendingDecisions().some((d) => d.id.startsWith('trials_'))) return;   // one question at a time
  if (!objDone(TRIALS.speed.obj) || (t.speed && t.speed.done)) return;
  if (!t.speed) put({ ...t, speed: { top: MAX_KT, done: false } });
  offer(topNow(st()));
}
/** Tests: skip the breather between offers. */
export const skipWait = () => { waitUntil = 0; };
let acc = 0;
sim.hooks.push((dt) => { acc += dt; if (acc < 1) return; acc = 0; try { traffic.escorts = trialsRunning() ? ESCORTS : []; check(); } catch (e) { console.warn('trials', e); } });
