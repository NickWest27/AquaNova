// Search patterns: one generator for the Aqua Nova, the WSKRs and the Tern.
// A pattern is a spec ({ kind, brg, space, ... }) and a datum ({ lat, lon }). build() turns them into a list of waypoints.
// This file knows nothing about the craft. Each craft follows the list in its own way (see sim.js, bayops.js, route.js).
// Bearings are degrees true. Distances are nautical miles. Turns go to starboard unless side is 'left'.

const NM_LAT = 60, MAX_WPS = 80;
const rad = (d) => (d * Math.PI) / 180;
const wrap = (d) => ((d % 360) + 360) % 360;

/** The point nm miles from p on bearing brg (flat earth: right for the distances a search covers). */
export function project(p, brg, nm) {
  const r = rad(brg);
  return { lat: p.lat + (nm * Math.cos(r)) / NM_LAT, lon: p.lon + (nm * Math.sin(r)) / (NM_LAT * Math.cos(rad(p.lat))) };
}
/** Offset from p: along the bearing, then across it to starboard. */
const at = (p, brg, along, across) => project(project(p, brg, along), brg + 90, across);
const dist = (a, b) => Math.hypot((b.lat - a.lat) * NM_LAT, (b.lon - a.lon) * NM_LAT * Math.cos(rad((a.lat + b.lat) / 2)));

/** What each pattern is for, and which numbers it needs. */
export const KINDS = {
  square: { name: 'Expanding square', use: 'Best when the datum is good. Spirals out from it.', fields: ['space', 'legs'] },
  sector: { name: 'Sector search', use: 'Best for a small, very good datum. Covers it again and again.', fields: ['radius', 'rounds'] },
  parallel: { name: 'Parallel track', use: 'Best for a large area. Straight tracks side by side.', fields: ['length', 'width', 'space'] },
  creeping: { name: 'Creeping line', use: 'Best when the target is somewhere along a line. Tracks cross it and move ahead.', fields: ['length', 'width', 'space'] },
};
export const kinds = () => Object.keys(KINDS);
const LIMITS = { space: [0.05, 5], legs: [2, 40], radius: [0.2, 15], rounds: [1, 3], length: [0.3, 30], width: [0.3, 30] };
export const DEFAULTS = { kind: 'square', brg: 0, space: 0.5, legs: 12, radius: 2, rounds: 2, length: 4, width: 2, side: 'right' };

/** A spec with every number inside its limits. Unknown kinds become 'square'. */
export function normalize(spec = {}) {
  const o = { ...DEFAULTS, ...spec };
  if (!KINDS[o.kind]) o.kind = 'square';
  for (const k of Object.keys(LIMITS)) { const v = Number(o[k]); o[k] = Math.max(LIMITS[k][0], Math.min(LIMITS[k][1], Number.isFinite(v) ? v : DEFAULTS[k])); }
  o.legs = Math.round(o.legs); o.rounds = Math.round(o.rounds); o.brg = wrap(Number.isFinite(Number(o.brg)) ? Number(o.brg) : 0); o.side = o.side === 'left' ? 'left' : 'right';
  return o;
}

function expandingSquare(d, o) {
  const out = []; let p = d; const turn = o.side === 'left' ? -90 : 90;
  for (let i = 0; i < o.legs; i++) { p = project(p, o.brg + turn * i, o.space * (Math.floor(i / 2) + 1)); out.push(p); }
  return out;
}
/** Tracks that run on trackBrg, are `len` long and sit `space` or less apart across a span, stepping along advBrg. a0 is where the first track sits. */
function lanes(d, trackBrg, advBrg, len, span, space, a0) {
  const n = Math.max(2, Math.ceil(span / space) + 1), out = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + (span * i) / (n - 1), c = project(d, advBrg, a), x = project(c, trackBrg, -len / 2), y = project(c, trackBrg, len / 2);
    if (i % 2) out.push(y, x); else out.push(x, y);
  }
  return out;
}
function parallel(d, o) {
  const s = o.side === 'left' ? -1 : 1;
  return lanes(d, o.brg, o.brg + 90 * s, o.length, o.width, o.space, -o.width / 2);
}
function creeping(d, o) {
  // Tracks run across the bearing and the line of tracks moves ahead along it. The first track passes through the datum.
  return lanes(d, o.brg + 90, o.brg, o.width, o.length, o.space, 0);
}
function sector(d, o) {
  const out = [], step = 120 / o.rounds, s = o.side === 'left' ? -1 : 1;
  for (let r = 0; r < o.rounds; r++) {
    const t = o.brg + s * step * r, a = project(d, t, o.radius), b = project(a, t + s * 120, o.radius);
    out.push(a, b, { lat: d.lat, lon: d.lon });
  }
  return out;
}
/** The waypoints of a pattern about a datum, in order. The first is where the craft goes first. Never more than 80. */
export function build(spec, datum) {
  const o = normalize(spec), d = { lat: datum.lat, lon: datum.lon };
  const w = { square: expandingSquare, sector, parallel, creeping }[o.kind](d, o);
  return w.slice(0, MAX_WPS).map((p) => ({ lat: +p.lat.toFixed(5), lon: +p.lon.toFixed(5) }));
}
/** Length in nautical miles, counting the run from `from` to the first waypoint when it is given. */
export function lengthNm(wps, from) {
  let nm = 0, p = from || wps[0];
  for (const q of wps) { nm += dist(p, q); p = q; }
  return nm;
}
/** Furthest any waypoint lies from the datum (to draw the area or to check a range). */
export function extentNm(wps, datum) { return wps.reduce((m, q) => Math.max(m, dist(datum, q)), 0); }
/** Keep the waypoints a craft can use. ok(lat, lon) says whether a point is open water inside the Area of Operations. */
export function clip(wps, ok) { return wps.filter((p) => ok(p.lat, p.lon)); }
/** Hours at `kt` knots to run the whole pattern from `from`. */
export const hours = (wps, from, kt) => lengthNm(wps, from) / Math.max(0.1, kt);
/** One line for a log or a speech: "Expanding square, 12 legs, 0.5 nm apart, first leg 045". */
export function describe(spec) {
  const o = normalize(spec), b = String(Math.round(o.brg)).padStart(3, '0'), f = (n) => +n.toFixed(2);
  switch (o.kind) {
    case 'square': return `Expanding square, ${o.legs} legs, ${f(o.space)} nm apart, first leg ${b}`;
    case 'sector': return `Sector search, radius ${f(o.radius)} nm, ${o.rounds} round${o.rounds > 1 ? 's' : ''}, first leg ${b}`;
    case 'parallel': return `Parallel track, ${f(o.length)} by ${f(o.width)} nm, tracks ${f(o.space)} nm apart, on ${b}`;
    default: return `Creeping line, ${f(o.length)} nm ahead on ${b}, tracks ${f(o.width)} nm wide, ${f(o.space)} nm apart`;
  }
}
