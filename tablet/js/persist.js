// Saves. The sim lives in GameState (so the desktop game and the tablet share one save),
// and GameState lives in the active logbook via saveManager.
//   checkpoint = exit save, one slot, overwritten. Only on exit (and before sleep).
//   entry      = a logbook entry with a snapshot; the player can revert to it.
import gameState from '../../game/state.js';
import saveManager from '../../game/saveManager.js';
import { sim, setTimeScale, timeBase, gameNowISO } from './sim.js';
import { seafloor } from './seafloor.js';
import { dlog } from '../../utils/log.js';

export { gameState, saveManager };

export async function loadGame() {
  await saveManager.init(gameState);
  const lb = saveManager.getActiveLogbook(); if (lb && lb.epoch) timeBase.epoch = Date.parse(lb.epoch);
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
    gameState.updateProperty('navigation.charted', seafloor.chartToString());
    gameState.updateProperty('navigation.destination', s.wpt ? s.wpt.name : null);
    gameState.updateProperty('navigation.waypoint', s.wpt && s.wpt.type === 'waypoint' ? { name: s.wpt.name, lat: +s.wpt.lat.toFixed(5), lon: +s.wpt.lon.toFixed(5) } : null);
    gameState.updateProperty('navigation.docked', !!s.docked);
    gameState.updateProperty('navigation.wskrs', s.wskrs.map((w) => ({ lat: +w.lat.toFixed(5), lon: +w.lon.toFixed(5), n: w.n, name: w.name, mode: w.mode, target: w.target, bat: +(w.bat == null ? 100 : w.bat).toFixed(1), dead: w.dead || undefined, heading: w.heading == null ? undefined : Math.round(w.heading), pat: w.pat ? { lat: +w.pat.lat.toFixed(5), lon: +w.pat.lon.toFixed(5), k: w.pat.k, t: 0 } : undefined })));
    gameState.updateProperty('navigation.bay', { doorDmg: +((s.bay && s.bay.doorDmg) || 0).toFixed(2), op: s.bay && s.bay.op ? { kind: s.bay.op.kind, craft: s.bay.op.craft, n: s.bay.op.n, t: Math.round(s.bay.op.t), dur: Math.round(s.bay.op.dur), air: s.bay.op.air || 0 } : null, base: (s.bay && s.bay.base) || 0, rearm: s.bay && s.bay.rearm ? { t: Math.round(s.bay.rearm.t), dur: Math.round(s.bay.rearm.dur), load: s.bay.rearm.load } : null });
    gameState.updateProperty('navigation.rack', s.rack || {});
    gameState.updateProperty('navigation.shuttle', s.shuttle ? { state: s.shuttle.state, mode: s.shuttle.mode, bat: +s.shuttle.bat.toFixed(1), o2: +(s.shuttle.o2 == null ? 100 : s.shuttle.o2).toFixed(1), lat: s.shuttle.lat, lon: s.shuttle.lon, dest: s.shuttle.dest || null, dead: s.shuttle.dead || undefined, air: s.shuttle.air || 0, pilots: s.shuttle.pilots, pax: s.shuttle.pax, ashore: s.shuttle.ashore, stay: s.shuttle.stay || undefined, boarding: s.shuttle.boarding || undefined } : null);
    gameState.updateProperty('navigation.wskrForm', s.wskrForm);
    gameState.updateProperty('navigation.selContact', s.selContact || null);
    gameState.updateProperty('navigation.away', sim.away || null);   // "crew has the con" plan (away.js)
    gameState.updateProperty('navigation.wskrDepth', s.wskrDepth);
    gameState.updateProperty('navigation.rov', s.rov ? { lat: +s.rov.lat.toFixed(5), lon: +s.rov.lon.toFixed(5), heading: Math.round(s.rov.heading), depth: Math.round(s.rov.depth) } : null);
    gameState.updateProperty('progress.gameClock', Math.round(s.clock));
    gameState.updateProperty('shipSystems.vitals', { battery: +s.battery.toFixed(1), oxygen: +s.oxygen.toFixed(1), scrubbers: +(s.scrubbers == null ? 100 : s.scrubbers).toFixed(1) });
    gameState.updateProperty('shipSystems.hull.integrity', Math.round(s.hull));
  });
}

/** Missions watch depth and speed, so keep those two current. Cheap: writes only when a rounded value changed. */
export function liveNav() {
  const s = sim.s, depth = Math.round(s.depth), speed = +s.speed.toFixed(1), docked = !!s.docked;
  if (gameState.getProperty('navigation.depth') === depth && gameState.getProperty('navigation.speed') === speed && gameState.getProperty('navigation.docked') === docked) return;
  gameState.batch(() => { gameState.updateProperty('navigation.depth', depth); gameState.updateProperty('navigation.speed', speed); gameState.updateProperty('navigation.docked', docked); });
}

/** Copy GameState into the sim. The ship holds still after a load (safer than resuming at speed). */
export function restoreSim() {
  { const ts = gameState.getProperty('settings.timeScale'); setTimeScale(typeof ts === "number" ? ts : 1); }
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
  s.scrubbers = v && v.scrubbers != null ? v.scrubbers : 100;
  const hull = gameState.getProperty('shipSystems.hull.integrity');
  s.hull = hull != null ? hull : 100; s.damage = 100 - s.hull;
  const name = nav.location.properties && nav.location.properties.name;
  s.at = s.pois.find((p) => p.name === name) || null;
  s.docked = (nav.docked == null ? (nav.depth || 0) === 0 : !!nav.docked) && !!s.at && s.at.type === 'dock';   // saves from before docking existed: parked at the dock counts as docked
  seafloor.setChart(nav.charted || '');
  s.wskrs = Array.isArray(nav.wskrs) ? nav.wskrs.map((w) => ({ busy: 0, mode: 'escort', target: null, bat: 100, ...w })) : [];
  s.wskrForm = nav.wskrForm === 'tight' ? 'tight' : 'loose';
  s.bay = { doorDmg: (nav.bay && nav.bay.doorDmg) || 0, op: nav.bay && nav.bay.op ? { t: 0, ...nav.bay.op } : null, base: (nav.bay && nav.bay.base) || 0, rearm: nav.bay && nav.bay.rearm ? { ...nav.bay.rearm } : null };
  s.rack = nav.rack && typeof nav.rack === 'object' ? { ...nav.rack } : {};
  s.shuttle = nav.shuttle && nav.shuttle.state ? { state: 'bay', mode: 'follow', bat: 100, ...nav.shuttle } : { state: 'bay', mode: 'follow', bat: 100 };
  s.selContact = typeof nav.selContact === 'string' ? nav.selContact : null;
  sim.away = nav.away && typeof nav.away === 'object' && nav.away.maxH ? JSON.parse(JSON.stringify(nav.away)) : null;
  s.wskrDepth = ['shallow', 'deep'].includes(nav.wskrDepth) ? nav.wskrDepth : 'auto';
  s.rov = nav.rov ? { cmd: { thr: 0, turn: 0, dive: 0 }, job: null, ...nav.rov } : null;
  const clk = gameState.getProperty('progress.gameClock'); if (typeof clk === 'number') s.clock = clk;
  s.wpt = nav.destination ? s.pois.find((p) => p.name === nav.destination) || null : null;
  if (!s.wpt && nav.destination && nav.waypoint && nav.waypoint.name === nav.destination) s.wpt = { id: 'wpt', type: 'waypoint', text: 'Plotted position', ...nav.waypoint };
  dlog('persist: restored sim at', s.lat, s.lon);
}

let frozen = false;   // set while the game restarts, so the exit save cannot write the old moment back
export function checkpoint() {
  if (frozen) return;
  try { snapshotSim(); saveManager.saveCheckpoint(); } catch (e) { console.error('Autosave failed', e); }
}

/** Add a logbook entry with a revertable snapshot. */
export function addLogEntry(content, extra = {}) {
  snapshotSim();
  return saveManager.addEntry({ type: 'personal_log', content, timestamp: gameNowISO(), ...extra });
}

/** Saves only happen two ways: a logbook entry (the player's save point), and
 *  this exit save, which keeps the current moment if the app is closed or hidden.
 *  There is no timed autosave, so a bad decision stays a bad decision. */
export function startExitSave() {
  const onExit = () => { if (document.visibilityState === 'hidden' || document.hidden) checkpoint(); };
  document.addEventListener('visibilitychange', onExit);
  window.addEventListener('pagehide', () => checkpoint());
}

/** Call before any big jump in time (sleep) so the player can return to this moment. */
export function saveBeforeSleep() { checkpoint(); }

/** Start again from M.LOG-0001, then reload the game so everything starts clean. */
export function restartGame() {
  frozen = true;
  try { saveManager.resetToStart(); } catch (e) { frozen = false; throw e; }
  location.reload();
}
