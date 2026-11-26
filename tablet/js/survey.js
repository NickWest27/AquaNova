// Site survey (owner, 2026-11-26): the ship holds station at a site and surveys it for 30 game minutes. Done, the sea floor round the site is
// charted in fine detail out to SURVEY_CHART_NM, a survey finding is filed (PED → Findings) and the site's survey count goes up
// (mission.surveyed.p<id>: generated "Seabed survey" missions wait on it). Moving off station or speeding up stops the survey.
// State: sim.s.survey = { id, name, start, end } (saved with the ship). Started from the SONAR controls (Survey site).
import { sim, toward } from './sim.js';
import { seafloor } from './seafloor.js';
import { gameState } from './persist.js';
import { findings } from './findings.js';

export const SURVEY_S = 1800, SURVEY_NM = 0.5, SURVEY_KT = 2, SURVEY_CHART_NM = 3;

/** The site the ship is holding station at (a point of interest, not a dock), or null. */
export const surveySite = () => { const s = sim.s, a = s.at; return a && a.type !== 'dock' && toward(s, a).nm <= SURVEY_NM ? a : null; };
export const surveying = () => sim.s.survey || null;
export const surveyCount = (p) => Number(gameState.getProperty(`mission.surveyed.p${p.id}`)) || 0;
/** Why a survey cannot start now (or null). */
export function surveyBlock() {
  const s = sim.s; if (s.survey) return 'running'; if (s.docked) return 'docked';
  if (!surveySite()) return 'site'; if (s.speed > SURVEY_KT) return 'fast'; return null;
}
export function startSurvey() {
  const why = surveyBlock(); if (why) return { ok: false, why };
  const p = surveySite(), s = sim.s; s.survey = { id: p.id, name: p.name, start: s.clock, end: s.clock + SURVEY_S }; sim.touch(); sim.emit('survey-start', s.survey);
  return { ok: true, mins: SURVEY_S / 60 };
}
export function stopSurvey(why = 'stopped') { const s = sim.s, v = s.survey; if (!v) return; s.survey = null; sim.touch(); sim.emit('survey-stopped', { ...v, why }); }

function finish(v) {
  const s = sim.s, p = s.pois.find((q) => q.id === v.id); s.survey = null; if (!p) return;
  seafloor.mark('survey-' + p.id, p.lat, p.lon, SURVEY_CHART_NM);   // the detailed chart
  if (!findings().some((f) => f.id === `survey-${p.id}`)) gameState.updateProperty('mission.discoveries', [...findings(), { id: `survey-${p.id}`, name: `Survey: ${p.name}`, description: `A 30 minute survey of ${p.name}: the sea floor charted in detail for ${SURVEY_CHART_NM} nm round it.`, type: 'survey', scannedAt: new Date().toISOString() }]);
  gameState.updateProperty(`mission.surveyed.p${p.id}`, surveyCount(p) + 1);
  sim.touch(); sim.emit('survey-done', { id: p.id, name: p.name });
}

sim.hooks.push(() => {
  const s = sim.s, v = s.survey; if (!v) return;
  const p = s.pois.find((q) => q.id === v.id);
  if (!p || s.docked) return stopSurvey('gone');
  if (toward(s, p).nm > SURVEY_NM) return stopSurvey('moved');
  if (s.speed > SURVEY_KT + 1) return stopSurvey('fast');
  if (s.clock >= v.end) finish(v);
});
