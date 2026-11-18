// Saves. The sim lives in GameState (so the desktop game and the tablet share one save),
// and GameState lives in the active logbook via saveManager.
//   checkpoint = autosave, one slot, overwritten.
//   entry      = a logbook entry with a snapshot; the player can revert to it.
import gameState from '../../game/state.js';
import saveManager from '../../game/saveManager.js';
import { sim } from './sim.js';
import { dlog } from '../../utils/log.js';

export { gameState, saveManager };

export async function loadGame() {
  await saveManager.init(gameState);
  restoreSim();
}

/** Copy the sim into GameState. One batch, so observers run once. */
export function snapshotSim() {
  const s = sim.s;
  gameState.batch(() => {
    const here = s.at || { name: 'Open water', type: 'open_water', text: '' };
    gameState.updateProperty('navigation.location', {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [+s.lon.toFixed(5), +s.lat.toFixed(5)] },
      properties: { name: here.name, type: here.type, description: here.text || '' },
    });
    gameState.updateProperty('navigation.depth', Math.round(s.depth));
    gameState.updateProperty('navigation.heading', Math.round(s.heading));
    gameState.updateProperty('navigation.course', Math.round(s.targetHeading));
    gameState.updateProperty('navigation.speed', +s.speed.toFixed(1));
    gameState.updateProperty('navigation.destination', s.wpt ? s.wpt.name : null);
    gameState.updateProperty('shipSystems.vitals', { battery: +s.battery.toFixed(1), oxygen: +s.oxygen.toFixed(1) });
    gameState.updateProperty('shipSystems.hull.integrity', Math.round(s.hull));
  });
}

/** Copy GameState into the sim. The ship holds still after a load (safer than resuming at speed). */
export function restoreSim() {
  const nav = gameState.getProperty('navigation');
  if (!nav || !nav.location || !nav.location.geometry) return;
  const s = sim.s;
  const [lon, lat] = nav.location.geometry.coordinates;
  s.lon = lon; s.lat = lat;
  s.heading = nav.heading || 0; s.targetHeading = s.heading;
  s.depth = nav.depth || 0; s.targetDepth = s.depth;
  s.throttle = 0; s.speed = 0;
  const v = gameState.getProperty('shipSystems.vitals');
  s.battery = v && v.battery != null ? v.battery : 100;
  s.oxygen = v && v.oxygen != null ? v.oxygen : 100;
  const hull = gameState.getProperty('shipSystems.hull.integrity');
  s.hull = hull != null ? hull : 100;
  const name = nav.location.properties && nav.location.properties.name;
  s.at = s.pois.find((p) => p.name === name) || null;
  s.wpt = nav.destination ? s.pois.find((p) => p.name === nav.destination) || null : null;
  dlog('persist: restored sim at', s.lat, s.lon);
}

export function checkpoint() {
  try { snapshotSim(); saveManager.saveCheckpoint(); } catch (e) { console.error('Autosave failed', e); }
}

/** Add a logbook entry with a revertable snapshot. */
export function addLogEntry(content, extra = {}) {
  snapshotSim();
  return saveManager.addEntry({ type: 'personal_log', content, ...extra });
}

let lastSig = '';
export function startAutosave() {
  const sig = () => JSON.stringify([sim.s.lat.toFixed(4), sim.s.lon.toFixed(4), Math.round(sim.s.depth), Math.round(sim.s.battery), gameState.getProperty('mission.objectives'), gameState.getProperty('mission.completedIds')]);
  const maybe = () => { const n = sig(); if (n !== lastSig) { lastSig = n; checkpoint(); } };
  setInterval(() => { if (!document.hidden) maybe(); }, 20000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) maybe(); });
  window.addEventListener('pagehide', maybe);
  sim.on((t) => { if (t === 'enter' || t === 'arrived') maybe(); });
  lastSig = sig();
}
