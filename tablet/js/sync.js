// Keeps this iPad in step with the iPhone PED through the private saves repo (see utils/ledgerSync.js).
// Nothing here is a save. Saves are logbook entries and the exit save only.
import { getConfig, syncLogbook, publishActive, pushStatus } from '../../utils/ledgerSync.js';
import { saveManager, gameState, restoreSim } from './persist.js';
import { sim } from './sim.js';
import { dlog } from '../../utils/log.js';

export const syncState = { status: getConfig() ? 'idle' : 'off', at: null, error: null };
const listeners = new Set();
export const onSyncChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const set = (status, error = null) => { syncState.status = status; syncState.error = error; if (status === 'ok') syncState.at = new Date(); listeners.forEach((fn) => fn(syncState)); };

export function buildStatus() {
  const s = sim.s, lb = saveManager.getActiveLogbook();
  return {
    t: new Date().toISOString(), logbook: lb ? lb.name : '',
    location: s.at ? s.at.name : 'Open water', lat: +s.lat.toFixed(4), lon: +s.lon.toFixed(4),
    depth: Math.round(s.depth), heading: Math.round(s.heading), speed: +s.speed.toFixed(1),
    battery: Math.round(s.battery), oxygen: Math.round(s.oxygen), hull: Math.round(s.hull),
    destination: s.wpt ? s.wpt.name : null,
    objectives: (gameState.getProperty('mission.objectives') || []).map((o) => ({ text: o.description, done: o.status === 'completed' })),
    discoveries: gameState.getProperty('mission.discoveries') || [],
  };
}

let busy = false, again = false;
export async function syncNow({ remount = false } = {}) {
  if (!getConfig()) { set('off'); return false; }
  if (busy) { again = true; return false; }
  busy = true; set('syncing');
  try {
    const lb = saveManager.getActiveLogbook();
    if (!lb) throw new Error('No logbook');
    const beforeCheckpoint = lb.checkpoint && lb.checkpoint.timestamp;
    const merged = await syncLogbook(lb);
    Object.assign(lb, merged);
    saveManager.saveBookshelf();
    if (remount && merged.checkpoint && merged.checkpoint.timestamp !== beforeCheckpoint) { await saveManager.mountActiveLogbook(); restoreSim(); dlog('sync: loaded newer exit save'); }
    await publishActive(lb.id);
    await pushStatus(lb.id, buildStatus());
    set('ok');
    return true;
  } catch (e) {
    console.warn('Sync failed:', e.message);
    set('error', e.message);
    return false;
  } finally { busy = false; if (again) { again = false; requestSync(1500); } }
}

let timer = null;
/** Sync soon. Several requests inside the delay become one. */
export function requestSync(delay = 2500) { clearTimeout(timer); timer = setTimeout(() => syncNow(), delay); }

export function startSync() {
  setInterval(() => { if (!document.hidden && getConfig()) syncNow(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (getConfig()) syncNow(); });
}

/** At boot: wait for the first sync, but never longer than a few seconds (offline play must stay fast). */
export async function syncAtBoot() {
  if (!getConfig()) return;
  await Promise.race([syncNow({ remount: true }), new Promise((r) => setTimeout(r, 6000))]);
}
