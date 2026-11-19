// Autopilot: a target behind or beside a moving ship must be reached in one turn, with no orbiting.
globalThis.document = { addEventListener() {}, hidden: false };
globalThis.localStorage = { getItem() { return null; }, setItem() {} };
const { sim, toward, setTimeScale } = await import('../tablet/js/sim.js');
setTimeScale(30);   // the test was written for the 30x pace
let fails = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : '  ' + extra)); if (!ok) fails++; };
function run(name, bearingDeg, distNm, startKt, throttle) {
  const s = sim.s, r = (bearingDeg * Math.PI) / 180, lat0 = 39.4, lon0 = -72.2;
  Object.assign(s, { lat: lat0, lon: lon0, heading: 0, targetHeading: 0, speed: startKt, throttle, depth: 50, targetDepth: 50, docked: false, wpt: null, battery: 100, oxygen: 100 });
  const wp = { id: 'w', name: 'T', type: 'waypoint', lat: lat0 + (distNm * Math.cos(r)) / 60, lon: lon0 + (distNm * Math.sin(r)) / (60 * Math.cos((lat0 * Math.PI) / 180)) };
  sim.setWpt(wp);
  let arrived = false, far = 0, steps = 0, minSpeedWhileTurning = 99;
    for (; steps < 20000 && s.wpt; steps++) {
    sim.step(0.1);
    const d = toward(s, wp).nm; far = Math.max(far, d);
    if (Math.abs(((s.targetHeading - s.heading + 540) % 360) - 180) > 60) minSpeedWhileTurning = Math.min(minSpeedWhileTurning, s.speed);
  }
  const secs = steps * 0.1;
  check(`${name}: reaches the target`, !s.wpt && toward(s, wp).nm < 0.2, `dist ${toward(s, wp).nm.toFixed(3)} after ${secs}s`);
  check(`${name}: no orbiting (under 90 s real time)`, secs < 90, `${secs}s`);
  check(`${name}: never strays far beyond the start distance`, far < distNm + 0.5, `max ${far.toFixed(2)}`);
}
run('target 1 nm directly behind at 7 kt', 180, 1, 7, 0.5);
run('target 0.4 nm behind at 7 kt', 180, 0.4, 7, 0.5);
run('target 0.3 nm abeam at 10 kt', 90, 0.3, 10, 0.8);
run('target 3 nm ahead at full speed', 0, 3, 5, 1);
console.log(fails ? '\nFAILED' : '\nAll checks passed.');
process.exit(fails ? 1 : 0);
