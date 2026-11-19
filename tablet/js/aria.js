// ARIA is wired into the ship. She sees what the Captain does, offers guidance, and brings the decisions that matter.
// Hints: a mission can list "hints" (objective_active_for). ARIA speaks one when the objective has waited long enough.
// Decisions: a mission action "aria_decision" puts a choice to the Captain in the communicator. The answer runs that option's actions
// and is recorded, so later missions can react to it (trigger "decision_made", or the property progress.decisions.made.<id>).
import { gameState } from './persist.js';
import { say, hush } from './notify.js';
import { fill } from './player.js';
import missionManager from '../../game/systems/missionManager.js';

// ---------- decisions ----------
const store = () => { const d = gameState.getProperty('progress.decisions') || {}; return { pending: d.pending || [], made: d.made || {} }; };
const save = (d) => gameState.updateProperty('progress.decisions', d);
const changed = () => document.dispatchEvent(new CustomEvent('inbox-change'));

export const pendingDecisions = () => store().pending;
export const decisionMade = (id) => store().made[id] || null;

/** def: { id, text, options: [{ id, label, reply, actions }] } */
export function offerDecision(def) {
  const d = store();
  if (d.made[def.id] || d.pending.some((p) => p.id === def.id)) return false;   // asked once only
  save({ ...d, pending: [...d.pending, def] });
  say('aria', def.text, 'mission', { hold: false, notice: 'ARIA NEEDS A DECISION', keep: def.text });
  changed();
  return true;
}
/** The Captain's answer. Returns ARIA's reply. */
export function decide(id, optionId) {
  const d = store(), def = d.pending.find((p) => p.id === id), opt = def && def.options.find((o) => o.id === optionId);
  if (!opt) return null;
  save({ pending: d.pending.filter((p) => p.id !== id), made: { ...d.made, [id]: optionId } });   // recorded first, so the actions can see it
  try { missionManager.executeActions(opt.actions || []); } catch (e) { console.error('Decision actions failed', e); }
  missionManager.handleTrigger('decision_made', { decisionId: id, optionId });
  changed();
  return fill(opt.reply || 'Understood, Captain.');
}

// ---------- hints ----------
const shown = () => gameState.getProperty('progress.hintsShown') || [];
const since = new Map();
export function checkHints() {
  if (hush.fn()) return;                 // no guidance until the communicator pin has been picked up
  const objs = gameState.getProperty('mission.objectives') || [], scale = missionManager.delayScale ?? 1, now = Date.now();
  for (const mid of missionManager.activeMissions) {
    const m = missionManager.missions.get(mid); if (!m || !m.hints) continue;
    m.hints.forEach((h, i) => {
      const key = `${mid}:${i}`, c = h.condition || {};
      if (shown().includes(key) || c.type !== 'objective_active_for') return;
      const oid = `${mid}_${c.objectiveId}`, entry = objs.find((o) => o.id === oid), def = m.objectives.find((o) => o.id === c.objectiveId);
      const prev = def && def.after ? objs.find((o) => o.id === `${mid}_${def.after}`) : null;
      if (!entry || entry.status === 'completed' || (def.after && !(prev && prev.status === 'completed'))) { since.delete(oid); return; }
      if (!since.has(oid)) since.set(oid, now);
      if (now - since.get(oid) >= c.seconds * 1000 * scale) {
        gameState.updateProperty('progress.hintsShown', [...shown(), key]);
        say('aria', h.message, 'mission', { hold: false });   // heard at once; not kept for later
      }
    });
  }
}
export function startAria() {
  document.addEventListener('aria-decision', (e) => offerDecision(e.detail));
  setInterval(checkHints, 5000);
}
