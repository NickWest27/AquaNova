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

sim.setThrottle = (v) => { sim.s.throttle = clamp(v, 0, 1); sim.touch(); };
sim.setHeading = (h) => { sim.s.targetHeading = norm360(h); sim.touch(); };
sim.setDepth = (d) => { sim.s.targetDepth = clamp(d, 0, 6000); sim.touch(); };
sim.setWpt = (p) => { sim.s.wpt = p; if (p) { sim.s.targetHeading = toward(sim.s, p).brg; } sim.touch(); };
sim.stop = () => { sim.s.throttle = 0; sim.s.wpt = null; sim.touch(); };
sim.dockPoi = () => sim.s.pois.find((p) => p.type === 'dock');

sim.step = (dt) => {
  const s = sim.s;
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
  s.battery = clamp(s.battery - (s.power / 100) * 0.012 * dt * TIMESCALE / 30, 0, 100);
  s.oxygen = clamp(s.oxygen - 0.0025 * dt * TIMESCALE / 30, 0, 100);
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
