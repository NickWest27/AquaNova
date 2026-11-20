// "Crew has the con": the Captain goes to sleep and may close the app. The ship cannot run while the app is closed, so on
// return the game works out what happened. It runs the same simulation forward for the real time that passed (1 game second per
// real second, whatever the time compression), with standing orders for the crew:
//   keep the course and speed; hold at the Area of Operations limit; stop on arrival, on a shoal, when supplies run low or a craft is lost;
//   stand down after the Captain's limit (4 to 24 hours). Then ARIA gives a briefing.
// Standing orders for a long sleep (owner, 2026-11-20): once the ship has stopped, if the Captain is still asleep an hour later,
//   at a point of interest the science team take samples; and if a port is close by, an away team goes in the Tern for supplies.
// Nothing random happens: only things the game can compute (sea floor, the limit, battery, air, hull, craft already launched).
// The plan is saved in navigation.away, so a reload or a closed app still wakes up properly, and it goes to the iPhone PED with a forecast.
import { sim, toward, clockText, wskrName, TIMESCALE } from './sim.js';
import { seafloor } from './seafloor.js';
import { gameState, checkpoint, snapshotSim } from './persist.js';
import { requestSync } from './sync.js';
import { SHUTTLE_NAME, SHUTTLE_KT, shuttle, shuttleRangeNm, shuttleHours, bay, dockList, REMORA_REARM_S, REMORA_UNLOAD_S } from './bayops.js';
import { addSample, pickKind, SAMPLE_KINDS } from './science.js';
import { REMORA_STORE } from './rov.js';

export const AWAY_CAPS = [4, 8, 12, 24];
export const AWAY_MIN_S = 90;            // away for less than this: no briefing
export const AWAY_MAX_SIM_S = 48 * 3600; // never simulate more than this
const KEEL = 8, LOOK_NM = 6, NM_LAT = 60;
const LOW = { oxygen: 30, battery: 20, hull: 60, scrubbers: 15 };
const REMORA_DELAY_S = 300, REMORA_S = 1500;   // Remora goes 5 minutes after the away team; a dive, with launch and recovery, takes under 20 minutes
const WAIT_S = 3600, SAMPLE_S = 1800, TRIP_LOAD_S = 2700, TRIP_MAX_NM = 40;   // wait an hour; sampling takes half an hour; loading at the dock three quarters of an hour

const wake = new Set();
/** Called with the briefing when the Captain comes back. */
export const onWake = (fn) => { wake.add(fn); return () => wake.delete(fn); };

export const isAway = () => !!sim.away;

// ---------- the forecast (also sent to the phone) ----------
const near = (s) => { const p = s.pois.map((q) => ({ q, nm: toward(s, q).nm })).sort((a, b) => a.nm - b.nm)[0]; return p && p.nm < 3 ? p.q.name : null; };
export const where = (s) => near(s) || `${s.lat.toFixed(2)}°N ${Math.abs(s.lon).toFixed(2)}°${s.lon < 0 ? 'W' : 'E'}`;

/** The path the ship will follow and the first place the crew would have to stop: [{lat,lon}], total nm, stop nm and why. */
export function forecast(s = sim.s) {
  const kt = Math.max(s.speed, s.throttle * sim.maxKt());
  const pts = [{ lat: s.lat, lon: s.lon }];
  if (s.wpt) { for (const q of s.route || []) pts.push({ lat: q.lat, lon: q.lon }); pts.push({ lat: s.wpt.lat, lon: s.wpt.lon }); }
  else if (kt > 0.5) { const r = (s.heading * Math.PI) / 180; for (let d = 100; d <= 800; d += 100) pts.push({ lat: s.lat + (Math.cos(r) * d) / NM_LAT, lon: s.lon + (Math.sin(r) * d) / (NM_LAT * Math.cos((s.lat * Math.PI) / 180)) }); }
  // thin the points to at most 24 so the status stays small
  const keep = pts.length <= 24 ? pts : pts.filter((_, i) => i === 0 || i === pts.length - 1 || i % Math.ceil(pts.length / 22) === 0);
  let total = 0, stopNm = null, why = null;
  if (kt > 0.5 && seafloor.ready) {
    for (let i = 1; i < pts.length && stopNm == null; i++) {
      const a = pts[i - 1], b = pts[i], leg = toward(a, b).nm, n = Math.max(1, Math.ceil(leg / 0.5));
      for (let k = 1; k <= n; k++) {
        const lat = a.lat + ((b.lat - a.lat) * k) / n, lon = a.lon + ((b.lon - a.lon) * k) / n, d = total + (leg * k) / n;
        if (!seafloor.inside(lat, lon)) { stopNm = Math.max(0, d - Math.max(LOOK_NM, (kt * 2) / 60)); why = 'limit'; break; }
        const fl = seafloor.depthAt(lat, lon); if (fl != null && fl < KEEL + 2) { stopNm = Math.max(0, d - 1); why = 'floor'; break; }
      }
      total += leg;
    }
  } else for (let i = 1; i < pts.length; i++) total += toward(pts[i - 1], pts[i]).nm;
  return { pts: keep.map((p) => [+p.lat.toFixed(4), +p.lon.toFixed(4)]), kt: +kt.toFixed(1), nm: +total.toFixed(1), stopNm: stopNm == null ? null : +stopNm.toFixed(1), why, dest: s.wpt ? s.wpt.name : null };
}

// ---------- going to sleep ----------
export function armAway(maxH) {
  const s = sim.s;
  sim.away = { maxH, armClock: s.clock, real: Date.now(), clock: s.clock, throttle: s.throttle, speed: s.speed, cruise: !!s.cruise,
    from: { lat: +s.lat.toFixed(4), lon: +s.lon.toFixed(4), name: where(s) }, nm: 0, last: { lat: s.lat, lon: s.lon }, log: [], stop: null, plan: forecast(s), fromBat: Math.round(s.battery), fromOxy: Math.round(s.oxygen), fromHull: Math.round(s.hull) };
  sim.dirty = true; snapshotSim(); checkpoint(); requestSync(200);
}

/** The app is leaving the screen: stamp the real time and the ship's state, save, and tell the phone. */
function stamp() {
  const a = sim.away, s = sim.s; if (!a) return;
  a.real = Date.now(); a.clock = s.clock; a.throttle = s.throttle; a.speed = s.speed; a.cruise = !!s.cruise; a.plan = forecast(s);
  snapshotSim(); checkpoint(); requestSync(50);
}

// ---------- the crew's standing orders ----------
function hold(kind, surface = false) {
  const s = sim.s, a = sim.away; if (!a || a.stop) return;
  a.stop = { kind, c: s.clock };
  s.throttle = 0; s.cruise = false; sim.cancelCourse();
  if (surface && !s.docked) s.targetDepth = 0;
}
const note = (text) => { const a = sim.away; if (a && a.log.length < 40) a.log.push({ c: sim.s.clock, t: text }); };

const listener = (type, data) => {
  const a = sim.away; if (!a) return;
  if (type === 'bump') {
    if (data.kind === 'ao-near' || data.kind === 'edge') hold('limit');
    else if (data.kind === 'shoal') hold('floor');
  } else if (type === 'arrived') { hold('arrived'); if (a.stop) a.stop.name = a.plan && a.plan.dest; }
  else if (type === 'wskr-low') note(`${wskrName(data)} ran low on charge and was recalled.`);
  else if (type === 'wskr-link-lost') note(`${wskrName(data)} went out of link range.`);
  else if (type === 'wskr-surfaced') note(`${wskrName(data)} surfaced to call in.`);
  else if (type === 'wskr-dead') { note(`${wskrName(data)} lost power and is adrift.`); hold('craft'); if (a.stop) a.stop.name = wskrName(data); }
  else if (type === 'shuttle-dead' || type === 'shuttle-o2-out') { note(`${SHUTTLE_NAME} is adrift.`); hold('craft'); if (a.stop) a.stop.name = SHUTTLE_NAME; }
  else if (type === 'bay-door-damage') note('The bay doors took damage.');
};
listener.keep = true;
sim.on(listener);


/** What the crew do once the ship has stopped and the Captain is still asleep an hour later. Only while catching up (the end of the sleep is known). */
function rules(a, s) {
  const st = a.stop; if (!st || st.kind === 'cap' || !a.endClock || s.clock - st.c < WAIT_S) return;
  a.did = a.did || {};
  if (!a.did.trip) {      // a port is close by: an away team takes the Tern for supplies (she leaves first: Remora's tether holds the bay doors open)
    a.did.trip = true;
    const sh = shuttle(), docks = dockList().map((d) => ({ d, nm: toward(s, d).nm })).sort((x, y) => x.nm - y.nm), near = docks[0];
    if (near && !s.docked && sh.state === 'bay' && !s.rov && !bay().op && near.nm > 0.5 && near.nm <= TRIP_MAX_NM && shuttleRangeNm() >= near.nm * 2) {
      const secs = (near.nm / SHUTTLE_KT) * 3600 * 2 + TRIP_LOAD_S + 2 * 60;
      if (a.endClock - s.clock >= secs) { a.trip = { dock: near.d.name, nm: +near.nm.toFixed(1), done: s.clock + secs }; note(`An away team left in ${SHUTTLE_NAME} for ${near.d.name}, ${Math.round(near.nm)} miles away, to fetch supplies: food, science equipment, mail and CO2 scrubbers.`); }
    }
  }
  if (!a.did.samples && s.clock - st.c >= WAIT_S + REMORA_DELAY_S) {   // five minutes after the away team: the science team send Remora down at the point of interest we stopped at
    a.did.samples = true;
    const poi = st.kind === 'arrived' && s.pois.find((p) => p.name === st.name), b = bay();
    if (poi && poi.type !== 'dock' && !s.docked && a.endClock - s.clock >= REMORA_S) {
      const free = !s.rov && !b.op && !b.rearm, tools = ['collector', 'drill'], got = [];
      for (const tool of (free ? tools : ['spectrometer', 'laser', ...(poi.type === 'wreck' ? ['magnetometer'] : [])]).slice(0, free ? REMORA_STORE : 9)) { const k = pickKind(tool, poi); if (k && !got.includes(k)) { addSample(k, poi, tool); got.push(k); } }
      if (got.length) {
        const what = `${got.length === 1 ? 'a' : got.length} ${got.map((k) => SAMPLE_KINDS[k].label.toLowerCase()).join(' and ')} sample${got.length > 1 ? 's' : ''}`;
        if (free) { b.rearm = { t: 0, dur: REMORA_REARM_S + got.length * REMORA_UNLOAD_S, load: got.length }; note(`The science team sent Remora down at ${poi.name} and brought back ${what}. They are in the lab, waiting for analysis.`); }
        else note(`The bay was busy, so the science team took ${what} at ${poi.name} with the ship's own gear. They are in the lab, waiting for analysis.`);
      }
    }
  }
  if (a.trip && !a.trip.fin && s.clock >= a.trip.done) {
    a.trip.fin = true; s.scrubbers = 100;   // fresh scrubber canisters
    const sh = shuttle(); sh.bat = Math.max(20, (sh.bat == null ? 100 : sh.bat) - (a.trip.nm / SHUTTLE_KT / shuttleHours()) * 100);
    note(`The away team is back from ${a.trip.dock} with supplies: food, science equipment, mail and fresh CO2 scrubbers. ${SHUTTLE_NAME} is on charge.`);
  }
}

let lastCheck = 0;
sim.hooks.push(() => {
  const a = sim.away, s = sim.s; if (!a) return;
  const d = toward(a.last, s).nm; if (d > 0 && d < 5) a.nm += d; a.last = { lat: s.lat, lon: s.lon };   // distance covered
  if (s.clock - lastCheck < 60 && s.clock >= lastCheck) return;
  lastCheck = s.clock;
  if (a.stop) { rules(a, s); return; }
  if (!s.docked) {
    if (s.scrubbers != null && s.scrubbers < LOW.scrubbers && s.depth >= 3) { note(`The CO2 scrubbers are down to ${Math.round(s.scrubbers)}%.`); hold('scrubbers', true); }
    else if (s.oxygen < LOW.oxygen) { note(`Oxygen fell to ${Math.round(s.oxygen)}%.`); hold('oxygen', true); }
    else if (s.battery < LOW.battery) { note(`Battery fell to ${Math.round(s.battery)}%.`); hold('battery', true); }
    else if (s.hull < LOW.hull) { note(`Hull integrity fell to ${Math.round(s.hull)}%.`); hold('hull'); }
  }
  if (s.clock - a.armClock >= a.maxH * 3600) hold('cap');
});

// ---------- coming back ----------
/** Work out what happened while the app was closed. Returns the briefing, or null when there was nothing to report. */
export function catchUp() {
  const a = sim.away; if (!a) return null;
  const s = sim.s, elapsed = Math.min(AWAY_MAX_SIM_S, Math.max(0, (Date.now() - a.real) / 1000));
  if (elapsed < AWAY_MIN_S) return finish(elapsed);
  s.throttle = a.throttle; s.speed = a.speed; s.cruise = !!a.cruise;   // a reload holds the ship still: put the standing orders back
  a.last = { lat: s.lat, lon: s.lon }; lastCheck = s.clock; a.endClock = s.clock + elapsed;
  sim.muted = true;
  let done = 0;
  try {
    while (done < elapsed) {
      const g = a.stop ? 60 : s.cruise ? 6 : 15;
      sim.step(g / TIMESCALE); done += g;
    }
  } finally { sim.muted = false; }
  sim.dirty = true; sim.emit('tick');
  return finish(elapsed);
}

function finish(elapsedS) {
  const a = sim.away, s = sim.s;
  const rep = { elapsedS, away: a, now: { lat: s.lat, lon: s.lon, name: where(s), battery: Math.round(s.battery), oxygen: Math.round(s.oxygen), hull: Math.round(s.hull), moving: s.speed > 0.5 || s.throttle > 0.02, docked: !!s.docked, clock: clockText() } };
  sim.away = null; lastCheck = 0;
  snapshotSim(); checkpoint(); requestSync(50);
  return elapsedS < AWAY_MIN_S && !(a && a.log && a.log.length) && !(a && a.stop) ? null : rep;
}

/** Wake up without leaving: report what the crew did while the screen was open. */
export function wakeNow() { const a = sim.away; if (!a) return null; return finish(Math.max(0, sim.s.clock - a.armClock)); }

// ---------- ARIA's briefing ----------
const dur = (sec) => { const m = Math.round(sec / 60); return m < 90 ? `${m} minutes` : `${Math.round(m / 6) / 10} hours`; };
const clk = (c) => clockText(c).replace(/^Day \d+ /, '');
export function briefing(rep) {
  const a = rep.away, n = rep.now, lines = [];
  const slept = rep.elapsedS || 0;
  lines.push(`You were away ${dur(Math.max(slept, 60))}. The crew had the con.`);
  const nm = Math.round(a.nm * 10) / 10;
  if (nm < 0.2) lines.push(`We held position at ${a.from.name}.`);
  else lines.push(`We left ${a.from.name} and are now at ${n.name}. We covered ${nm} nautical miles.`);
  for (const e of a.log.slice(0, 8)) lines.push(`${clk(e.c)}: ${e.t}`);
  const st = a.stop, t = st ? clk(st.c) : null;
  if (st && st.kind === 'arrived') lines.push(`${t}: we arrived at ${st.name || n.name}. Helm brought her to a stop and the crew held there.`);
  else if (st && st.kind === 'limit') lines.push(`${t}: Helm stopped us short of the Area of Operations limit. We are not cleared to go further, so we held position.`);
  else if (st && st.kind === 'floor') lines.push(`${t}: Helm stopped the ship. The sea floor ahead was too shallow for us.`);
  else if (st && st.kind === 'scrubbers') lines.push(`${t}: the CO2 scrubbers were nearly used up, so the crew brought her to the surface and held. Nothing is used up on the surface.`);
  else if (st && st.kind === 'oxygen') lines.push(`${t}: air reserves were low, so the crew brought her up and held.`);
  else if (st && st.kind === 'battery') lines.push(`${t}: the battery was low, so the crew brought her up and held.`);
  else if (st && st.kind === 'hull') lines.push(`${t}: the hull was weakened, so the crew held the ship.`);
  else if (st && st.kind === 'craft') lines.push(`${t}: we lost ${st.name || 'a craft'}. The crew held the ship and waited for you.`);
  else if (st && st.kind === 'cap') lines.push(`${t}: your limit of ${a.maxH} hours was reached, so the crew held position.`);
  else if (n.moving) lines.push('We are still under way on your course.');
  const bits = [`battery ${n.battery}%`, `oxygen ${n.oxygen}%`, `hull ${n.hull}%`];
  lines.push(`Status: ${bits.join(', ')}.${n.hull < a.fromHull ? ` Hull is down ${a.fromHull - n.hull} points.` : ''}`);
  lines.push(st ? 'Your orders, Captain?' : n.moving ? 'The ship is yours again, Captain.' : 'Quiet watch, Captain. The ship is yours again.');
  return { title: st && st.kind !== 'cap' && st.kind !== 'arrived' ? 'ARIA: we stopped' : 'ARIA: while you were away', lines };
}

// ---------- hooks into the page ----------
document.addEventListener('visibilitychange', () => {
  if (!sim.away) return;
  if (document.hidden) { stamp(); return; }
  if (!sim.away.real) return;
  const wasRunning = !!sim.timer; sim.pause();
  const rep = catchUp();
  if (sim.wanted || wasRunning) sim.start();
  if (rep) for (const fn of wake) { try { fn(rep); } catch (e) { console.error(e); } }
});
window.addEventListener('pagehide', () => { if (sim.away) stamp(); });
