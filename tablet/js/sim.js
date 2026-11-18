// Ship simulation. Pure data, no DOM. Runs at 5 Hz and only while the page is visible.
import { clamp, norm360, angDiff } from './util.js';
import { dlog } from '../../utils/log.js';

const TICK_MS = 200;
const TIMESCALE = 30;        // 1 real second = 30 game seconds of travel
const MAX_KT = 14;
const NM_PER_DEG_LAT = 60;
const POI_RADIUS_NM = 0.3;

export const sim = {
  s: {
    lat: 41.5223, lon: -70.6709, heading: 0, targetHeading: 0,
    throttle: 0, speed: 0, depth: 0, targetDepth: 0,
    battery: 100, oxygen: 100, hull: 100, co2: 0.04, temp: 4.1, power: 0,
    ballast: 100, comms: true, sonar: true, lights: true, pois: [], wpt: null, at: null,
    clock: 6 * 3600, docked: false,     // clock = game seconds since Day 1 00:00
  },
  listeners: new Set(),
  dirty: true,
  timer: null,
  last: 0,
};

sim.on = (fn) => { sim.listeners.add(fn); return () => sim.listeners.delete(fn); };
sim.touch = () => { sim.dirty = true; };

sim.loadPois = async () => {
  try {
    const res = await fetch(new URL('../../data/locations.json', import.meta.url));
    const gj = await res.json();
    sim.s.pois = gj.features.map((f, i) => ({
      id: i, name: f.properties.name, type: f.properties.type, text: f.properties.description || '',
      lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1],
    }));
    dlog('sim: loaded', sim.s.pois.length, 'POIs');
  } catch (e) { console.error('Could not load locations.json', e); }
};

/** Distance in nm and bearing in degrees from a to b. */
export function toward(a, b) {
  const dy = (b.lat - a.lat) * NM_PER_DEG_LAT;
  const dx = (b.lon - a.lon) * NM_PER_DEG_LAT * Math.cos((a.lat * Math.PI) / 180);
  return { nm: Math.hypot(dx, dy), brg: norm360((Math.atan2(dx, dy) * 180) / Math.PI), dx, dy };
}

sim.setThrottle = (v) => { if (sim.s.docked) return; sim.s.throttle = clamp(v, 0, 1); sim.touch(); };
sim.setHeading = (h) => { sim.s.targetHeading = norm360(h); sim.touch(); };
sim.setDepth = (d) => { if (sim.s.docked) return; sim.s.targetDepth = clamp(d, 0, 6000); sim.touch(); };
sim.setWpt = (p) => { sim.s.wpt = p; if (p) { sim.s.targetHeading = toward(sim.s, p).brg; } sim.touch(); };
sim.stop = () => { sim.s.throttle = 0; sim.s.wpt = null; sim.touch(); };
sim.dockPoi = () => sim.s.pois.find((p) => p.type === 'dock');

sim.step = (dt) => {
  const s = sim.s;
  s.clock += dt * TIMESCALE;
  if (s.docked) { s.throttle = 0; s.speed = 0; s.targetDepth = 0; s.wpt = null; }   // clamps hold the ship
  // heading
  if (s.wpt) {
    const t = toward(s, s.wpt);
    if (t.nm < POI_RADIUS_NM * 0.6) { s.wpt = null; s.throttle = 0; sim.emit('arrived'); }
    else s.targetHeading = t.brg;
  }
  const turn = angDiff(s.targetHeading, s.heading);
  const rate = 6 * dt; // deg per second
  s.heading = norm360(s.heading + clamp(turn, -rate, rate));
  // speed (smooth)
  const wantKt = s.throttle * MAX_KT * (s.battery > 0 ? 1 : 0);
  s.speed += clamp(wantKt - s.speed, -2 * dt, 1.2 * dt);
  // depth
  const dd = s.targetDepth - s.depth;
  s.depth = clamp(s.depth + clamp(dd, -12 * dt, 12 * dt), 0, 6000);
  // move
  const nm = (s.speed * dt * TIMESCALE) / 3600;
  const r = (s.heading * Math.PI) / 180;
  s.lat += (nm * Math.cos(r)) / NM_PER_DEG_LAT;
  s.lon += (nm * Math.sin(r)) / (NM_PER_DEG_LAT * Math.cos((s.lat * Math.PI) / 180));
  // systems
  s.power = 8 + (s.speed / MAX_KT) * 70 + (s.lights ? 5 : 0) + (s.sonar ? 4 : 0);
  if (s.docked) { // shore power and air: about 20% battery and 30% oxygen per game hour
    const gh = (dt * TIMESCALE) / 3600;
    s.battery = clamp(s.battery + 20 * gh, 0, 100); s.oxygen = clamp(s.oxygen + 30 * gh, 0, 100);
  } else {
    s.battery = clamp(s.battery - (s.power / 100) * 0.012 * dt * TIMESCALE / 30, 0, 100);
    s.oxygen = clamp(s.oxygen - 0.0025 * dt * TIMESCALE / 30, 0, 100);
  }
  s.co2 = clamp(0.04 + (100 - s.oxygen) * 0.012, 0, 5);
  s.temp = clamp(20 - Math.sqrt(s.depth) * 0.28, 1.5, 20);
  s.hull = clamp(100 - Math.max(0, s.depth - 4500) / 30, 0, 100);
  // arrival at POI
  let here = null;
  for (const p of s.pois) if (toward(s, p).nm < POI_RADIUS_NM) { here = p; break; }
  if (here && (!s.at || s.at.id !== here.id)) {
    s.at = here;
    document.dispatchEvent(new CustomEvent('location-enter', { detail: { location: here.name.toLowerCase() } }));
    sim.emit('enter', here);
  } else if (!here && s.at) { s.at = null; }
  sim.dirty = true;
};

/** Docking needs a dock marker, low speed and the surface. */
sim.canDock = () => { const s = sim.s; return !s.docked && !!s.at && s.at.type === 'dock' && s.speed <= 1.5 && s.depth <= 5; };

/** "Game clock" text, e.g. "Day 2 06:30". */
export const clockText = (secs = sim.s.clock) => `Day ${Math.floor(secs / 86400) + 1} ${String(Math.floor(secs / 3600) % 24).padStart(2, '0')}:${String(Math.floor(secs / 60) % 60).padStart(2, '0')}`;

/** Sleep: jump the game forward. The ship keeps its course, speed and destination, so a long
 *  transit takes less of the player's time. The crew wake the player early for an emergency, or on arrival.
 *  Returns { hours, reason, arrived }: reason is an emergency text, arrived is the destination name. */
sim.warp = (hours) => {
  const s = sim.s, total = hours * 3600, stepGame = 15;   // 15 game seconds per step
  const startWpt = s.wpt;
  let done = 0, reason = null, arrived = null, sinceCheck = 0;
  while (done < total) {
    sim.step(stepGame / TIMESCALE); done += stepGame; sinceCheck += stepGame;
    if (startWpt && !s.wpt) { arrived = startWpt.name; break; }
    if (sinceCheck >= 60) {
      sinceCheck = 0;
      if (s.oxygen < 30 && !s.docked) reason = `oxygen reserves are down to ${Math.round(s.oxygen)}%`;
      else if (s.battery < 20 && !s.docked) reason = `battery is down to ${Math.round(s.battery)}%`;
      else if (s.hull < 60) reason = `hull integrity has dropped to ${Math.round(s.hull)}%`;
      if (reason) break;
    }
  }
  sim.dirty = true; sim.emit('tick');
  return { hours: done / 3600, reason, arrived };
};

sim.emit = (type, data) => sim.listeners.forEach((fn) => { try { fn(type, data); } catch (e) { console.error(e); } });

sim.start = () => {
  if (sim.timer) return;
  sim.last = performance.now();
  sim.timer = setInterval(() => {
    const now = performance.now();
    const dt = Math.min(0.5, (now - sim.last) / 1000);
    sim.last = now;
    sim.step(dt);
    if (sim.dirty) { sim.dirty = false; sim.emit('tick'); }
  }, TICK_MS);
};
sim.pause = () => { clearInterval(sim.timer); sim.timer = null; };

document.addEventListener('visibilitychange', () => { if (document.hidden) sim.pause(); else if (sim.wanted) sim.start(); });
const _start = sim.start;
sim.start = () => { sim.wanted = true; _start(); };

export const MAX_SPEED = MAX_KT;
