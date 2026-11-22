// Mission logs. A mission accepted in Comms is written to the logbook as a mission log (M.LOG-xxxx) with its
// description and task list. That entry carries a state save, so the player can revert to the moment of acceptance.
// When the mission is complete (results sent), the captain writes up the outcome in a second mission log, with
// another state save. Together they remind a returning player what was going on.
import { tell } from './notify.js';
import { gameState, saveManager, addLogEntry } from './persist.js';
import { sim, gameDateText } from './sim.js';
import { requestSync } from './sync.js';
import { toast } from './util.js';
import missionManager from '../../game/systems/missionManager.js';

const logged = () => gameState.getProperty('mission.logged') || [];
// The logbook itself is the record: a mission gets one 'accepted' and one 'complete' log, however often this is called
// (a double event, an old save that lost its flag).
const hasLog = (id, kind) => ((saveManager.getActiveLogbook() || {}).entries || []).some((e) => { const t = (e.logbook && e.logbook.tags) || []; return e.logbook && e.logbook.type === 'mission_log' && t.includes(id) && t.includes(kind); });
const tasksOf = (m) => m.objectives.filter((o) => o.required !== false).map((o) => o.description);
/** Fill {location}, {depth}, {date}, {findings} in the mission's outcome text. */
const fill = (t) => t
  .replace('{location}', sim.s.at ? sim.s.at.name : 'open water')
  .replace('{depth}', String(Math.round(sim.s.depth)))
  .replace('{date}', gameDateText())
  .replace('{findings}', String((gameState.getProperty('mission.discoveries') || []).length));

function write(content, tags, tasks, completed) {
  const entry = addLogEntry(content, { type: 'mission_log', tags, importance: 'high', tasks, completedTasks: completed });
  requestSync();
  return entry.logbook.entryId;
}

/** Call right after a mission accepted in Comms has started. */
export function logAccepted(id) {
  const m = missionManager.missions.get(id);
  if (!m || logged().includes(id) || hasLog(id, 'accepted')) return;
  gameState.updateProperty('mission.logged', [...logged(), id]);   // set first, so the saved moment knows this mission has its log
  const no = write(`Mission accepted: ${m.name}. ${m.logBriefing || m.description || ''}`.trim(), ['mission', 'accepted', id], tasksOf(m), []);
  tell('aria', `Mission log ${no} saved. You can revert to it from the logbook.`);
}

/** The captain's account of the outcome, written once the mission is complete. */
function logCompleted(id) {
  const m = missionManager.missions.get(id);
  if (!m || (!logged().includes(id) && !hasLog(id, 'accepted')) || hasLog(id, 'complete')) return;
  // A summary of what happened, not the task list again (the accepted log already has it).
  const no = write(`Mission complete: ${m.name}. ${fill(m.logOutcome || 'The orders are carried out and the results are with OERA.')}`, ['mission', 'complete', id], [], []);
  tell('aria', `Mission log ${no} saved.`);
}

export function initMissionLog() {
  // wait a moment: the mission's own completion actions (mail, unlocks) should finish first
  document.addEventListener('mission-completed', (e) => setTimeout(() => logCompleted(e.detail.id), 50));
}
