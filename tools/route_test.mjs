import { planRoute, routeLength } from '../tablet/js/route.js';
let fails = 0;
const check = (n, ok, x = '') => { console.log((ok ? 'ok   ' : 'FAIL ') + n + (ok ? '' : '  ' + x)); if (!ok) fails++; };
// an island (a disc of land) in open water, plus a long wall with a gap
const island = (lat, lon) => Math.hypot((lat - 40) * 60, (lon + 72) * 60 * Math.cos(40 * Math.PI / 180)) > 4;
const A = { lat: 40, lon: -72.2 }, B = { lat: 40, lon: -71.8 };
let r = planRoute(A, B, island);
check('route goes around an island', r && r.length >= 1, JSON.stringify(r));
const direct = Math.hypot(0.4 * 60 * Math.cos(40 * Math.PI / 180), 0);
check('detour is sensible (under 2.2x direct)', r && routeLength(A, r) < direct * 2.2, r && routeLength(A, r));
let blocked = false; if (r) { let p = A; for (const q of [...r]) { for (let i = 0; i <= 50; i++) { const la = p.lat + (q.lat - p.lat) * i / 50, lo = p.lon + (q.lon - p.lon) * i / 50; if (!island(la, lo)) blocked = true; } p = q; } }
check('no leg crosses land', r && !blocked);
check('clear water gives a direct route', JSON.stringify(planRoute({ lat: 40, lon: -73 }, { lat: 40.2, lon: -73.1 }, () => true)) === '[]');
const sealed = (lat, lon) => Math.hypot((lat - 40) * 60, (lon + 72) * 60) > 2 || Math.hypot((lat - 40) * 60, (lon + 72) * 60) < 1.5;
check('goal inside a lake with no way in returns null or snaps', (() => { const q = planRoute({ lat: 40.5, lon: -72 }, { lat: 40, lon: -72 }, sealed); return q === null || q.snapped; })());
check('goal on land snaps to nearby water', (() => { const q = planRoute(A, { lat: 40, lon: -72.076 }, island); return q && q.snapped && island(q[q.length - 1].lat, q[q.length - 1].lon); })());
const wall = (lat, lon) => !(Math.abs(lon + 72) < 0.02 && Math.abs(lat - 40) < 0.5 && Math.abs(lat - 40.4) > 0.03);
r = planRoute({ lat: 40, lon: -72.1 }, { lat: 40, lon: -71.9 }, wall);
check('finds the gap in a wall', r && r.length >= 1 && routeLength({ lat: 40, lon: -72.1 }, r) < 90, r && routeLength({ lat: 40, lon: -72.1 }, r));
// a long trip (over 120 nm) round an island must not fall off the edge of the search grid (bug found 2026-11-27: Woods Hole to the Trials AO)
const farIsland = (lat, lon) => !(Math.abs(lat - 40.6) < 0.1 && Math.abs(lon + 70.7) < 0.15);
r = planRoute({ lat: 41.52, lon: -70.67 }, { lat: 39.6, lon: -70.75 }, farIsland);
check('a 115+ nm trip round an island is found', Array.isArray(r) && r.length >= 1, JSON.stringify(r));
console.log(fails ? '\nFAILED' : '\nAll checks passed.'); process.exit(fails ? 1 : 0);
