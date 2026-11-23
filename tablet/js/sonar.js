// Passive sonar model for the bridge SNR page.
// A listener (the Aqua Nova, or a deployed WSKR) hears anything noisy enough: a bearing line from the listener. A fix (two bearings that cross, AIS, a scan, or sight)
// puts the contact on the map. The ship traffic comes from traffic.js (it owns who hears whom). This file adds noisy installations (mines, platforms, colonies),
// remembers contacts for a while after they fade, and runs the two things the Captain can do:
//   Full sweep: a 360 degree sweep at 1 degree a second. Sensitivity of the sweeping listener doubles. It stops for 2 s on every contact it passes.
//   Scan: a contact the Captain picked. Sensitivity doubles on it for a few seconds; in range, the scan gives a fix, and names it.
// State is in sim.s.snr and is not saved: a new session starts with the ship as the source and nothing selected.
import { sim, toward, wskrName } from './sim.js';
import { traffic, sonarNm, snrGain, triangulate } from './traffic.js';
import { seafloor } from './seafloor.js';
import { affiliation, placeAffiliation } from './contactIcons.js';
import { tell } from './notify.js';

export const SWEEP_DPS = 1, SWEEP_PAUSE_S = 2, SCAN_S = 10, SCAN_NM = 6, LOST_S = 120;
const SIZE_CLASS = ['small craft', 'small vessel', 'medium vessel', 'large vessel'];
const SIZE_NOISE = ['Light, high-pitched outboard whine', 'Small diesel, single screw', 'Medium diesel, steady three-blade beat', 'Heavy slow-turning screws, deep throb'];
const KIND_NOISE = { cargo: 'Slow single screw, heavy thrum', tanker: 'Very slow single screw, deep low throb', trawler: 'Diesel engine with winch and net noise', yacht: 'Light screws, smooth engine', patrol: 'Twin high-speed screws', navy: 'Quiet twin screws, well silenced', research: 'Steady thrusters holding position', tender: 'Diesel with crane and pump noise', rig: 'Thrusters holding station', raider: 'Fast engines, high shaft rate', poacher: 'Diesel engine with winch and net noise' };
const INST = {   // noisy installations: how loud (like a ship's size factor), what they are, what they sound like
  mine: { loud: 1.2, label: 'Mining colony', noise: 'Heavy pumps and drilling, continuous' },
  platform: { loud: 1.0, label: 'Oil platform', noise: 'Compressors and a steady pump hum' },
  colony: { loud: 0.8, label: 'Seabed colony', noise: 'Machinery hum and the clank of hatches' },
};

/** The page's state. */
export const snr = () => (sim.s.snr = sim.s.snr || { src: 'ship', sel: null, sweep: null, scan: null });
const instState = new Map();   // poi id -> { scanUntil, scanFixUntil, named }
const mem = {};                // listener id -> Map(contact id -> contact), including contacts that have just faded
const since = new Map();       // contact id -> game time it was first heard (until it fades)
const iconOf = (aff, type) => ({ type, aff });

/** The listeners: the ship, then every WSKR that is out and in contact. */
export function sources() {
  const s = sim.s, list = [{ id: 'ship', name: 'AQUA NOVA', lat: s.lat, lon: s.lon, heading: s.heading, ok: true }];
  for (const w of s.wskrs) if (!w.dead && !w.arrived && w.lat != null) list.push({ id: w.n, name: wskrName(w).toUpperCase(), lat: w.lat, lon: w.lon, heading: w.heading == null ? s.heading : w.heading, ok: sim.wskrLink(w).raw, w });
  return list;
}
export function source() { const st = snr(), l = sources(); const f = l.find((x) => x.id === st.src); if (f) return f; st.src = 'ship'; return l[0]; }
export function setSource(id) { const st = snr(); if (st.src === id) return; st.src = id; st.sweep = null; st.sel = null; st.scan = null; sim.touch(); }

// ---- the contacts ----
function shipContact(a, src, line) {
  const v = a.v, s = sim.s, ident = v.ident, kt = v.dyn ? v.kt * 1.2 : v.kt;
  const pos = a.pos, range = pos ? toward(src, pos).nm : null;
  return {
    id: 'ship:' + v.id, kind: 'ship', ref: v, icon: iconOf(ident ? affiliation(v) : 'unknown', 'surface'), bearing: line.brg, range, pos, ident,
    name: ident ? v.name : 'Unidentified contact', type: ident ? v.label : `Surface vessel (${SIZE_CLASS[v.size]})`, side: ident ? (v.stance === 'hostile' ? 'Hostile' : v.stance === 'wary' ? 'Unfriendly' : v.stance === 'friendly' ? 'Friendly' : 'Neutral') + ' · ' + v.factionName : 'Unknown',
    depth: 'Surface (screw noise)', speed: ident ? `${kt.toFixed(1)} kt` : `about ${Math.round(kt / 2) * 2} kt (blade rate)`, course: pos && pos.hdg != null ? Math.round(pos.hdg) : null,
    notes: [ident ? KIND_NOISE[v.kind] : SIZE_NOISE[v.size]], hostile: ident && v.stance === 'hostile', scanned: v.scanFixUntil > s.clock, size: v.size,
  };
}
function instContact(e, src, line) {
  const p = e.p, k = INST[p.kind], st = instState.get(p.id) || {}, named = !!e.pos || st.named, depth = e.pos ? seafloor.depthAt(e.pos.lat, e.pos.lon) : null;
  return {
    id: 'inst:' + p.id, kind: 'inst', ref: p, icon: iconOf(named ? placeAffiliation(p) : 'unknown', 'installation'), bearing: line.brg, range: e.pos ? toward(src, e.pos).nm : null, pos: e.pos, ident: named,
    name: named ? p.name : 'Unidentified machinery', type: named ? k.label : 'Fixed noise source', side: named ? (p.stance ? p.stance[0].toUpperCase() + p.stance.slice(1) : 'Neutral') : 'Unknown',
    depth: depth == null ? 'Unknown' : `${Math.round(depth)} m (seabed)`, speed: 'Stationary', course: null, notes: [k.noise], hostile: false, scanned: st.scanFixUntil > sim.s.clock, size: 3,
  };
}

/** Everything the listener 'id' hears or just heard, nearest first (range where it is known, else the newest). */
export function contactsFor(id) {
  const s = sim.s, m = mem[id]; if (!m) return [];
  const out = [...m.values()].map((c) => ({ ...c, lost: s.clock - c.last > 1, age: s.clock - (since.get(c.id) || c.last) }));
  out.sort((a, b) => (a.range != null && b.range != null ? a.range - b.range : a.range != null ? -1 : b.range != null ? 1 : a.age - b.age));
  return out;
}
export const selected = () => { const st = snr(); return st.sel ? contactsFor(st.src).find((c) => c.id === st.sel) || null : null; };
export function select(id) { const st = snr(); st.sel = st.sel === id ? null : id; sim.touch(); return st.sel; }

// ---- the sweep and the scan ----
export function sweeping() { return !!snr().sweep; }
export function startSweep() { const st = snr(), src = source(); if (!src.ok) return false; st.sweep = { src: src.id, az: 0, t: sim.s.clock, pause: 0, seen: new Set(), found: 0 }; sim.touch(); return true; }
export function stopSweep() { snr().sweep = null; sim.touch(); }
export function canScan() { const c = selected(); return !!c && !c.lost && !snr().scan; }
export function startScan() {
  const st = snr(), c = selected(); if (!c || c.lost || st.scan) return false;
  const until = sim.s.clock + SCAN_S; st.scan = { id: c.id, src: st.src, until };
  if (c.kind === 'ship') c.ref.scanUntil = until; else instState.set(c.ref.id, { ...(instState.get(c.ref.id) || {}), scanUntil: until });
  sim.touch(); return true;
}
function finishScan(sc, now) {
  const st = snr(); st.scan = null;
  const c = contactsFor(sc.src).find((x) => x.id === sc.id), ls = listener(sc.src); if (!c || !ls) return;
  const real = c.kind === 'ship' ? traffic.active.find((a) => a.v === c.ref) : { lat: c.ref.lat, lon: c.ref.lon };
  const nm = real ? toward(ls, real).nm : 99;
  if (nm <= SCAN_NM) {
    if (c.kind === 'ship') { c.ref.scanFixUntil = now + 180; c.ref.ident = true; } else instState.set(c.ref.id, { ...(instState.get(c.ref.id) || {}), scanFixUntil: now + 180, named: true });
    tell('sensors', `Scan complete, Captain. Contact bearing ${String(Math.round(c.bearing)).padStart(3, '0')}, range ${nm.toFixed(1)} miles. Fix and identity updated.`);
  } else tell('sensors', `Scan complete, Captain. That contact is too far for more detail. Closer than ${SCAN_NM} miles, or from a WSKR that is nearer.`);
}
const listener = (id) => sources().find((x) => x.id === id);
/** Is bearing b inside the sweep step from a0 up to a1 (a1 may pass 360)? */
const inArc = (b, a0, a1) => { const x = (((b - a0) % 360) + 360) % 360; return x > 0 && x <= a1 - a0; };

// ---- every step ----
function step() {
  const s = sim.s, st = snr(), now = s.clock, sn = traffic.cfg && traffic.cfg.sensing; if (!sn || !traffic.ready) return;
  const list = sources(), heard = new Set();
  // noisy installations: ears from each listener, and a fix when two bearings cross
  const insts = [];
  for (const p of s.pois) {
    const k = INST[p.kind]; if (!k) continue;
    const ss = instState.get(p.id) || {}, ears = [];
    for (const L of list) {
      if (!L.ok) continue;
      const t = toward(L, p), reach = (L.id === 'ship' ? sonarNm(s) : sn.wskr_sonar_nm) * k.loud * snrGain(L.id, ss.scanUntil);
      if (t.nm <= reach) ears.push({ src: L.id, from: { lat: L.lat, lon: L.lon }, brg: (t.brg + 0.6 * Math.sin(now / 41 + p.id)) % 360 });
    }
    if (ears.length) { const fix = ss.scanFixUntil > now ? { lat: p.lat, lon: p.lon, err: 0.1 } : triangulate(ears); insts.push({ p, ears, pos: fix }); }
  }
  for (const L of list) {
    if (!mem[L.id]) mem[L.id] = new Map();
    const m = mem[L.id];
    if (L.ok) {
      for (const a of traffic.active) { const line = a.lines.find((l) => l.src === L.id); if (line) { m.set('ship:' + a.v.id, { ...shipContact(a, L, line), last: now }); heard.add('ship:' + a.v.id); } }
      for (const e of insts) { const line = e.ears.find((l) => l.src === L.id); if (line) { m.set('inst:' + e.p.id, { ...instContact(e, L, line), last: now }); heard.add('inst:' + e.p.id); } }
    }
    for (const [id, c] of m) if (now - c.last > LOST_S) m.delete(id);
  }
  for (const id of [...since.keys()]) if (!heard.has(id)) since.delete(id);
  for (const id of heard) if (!since.has(id)) since.set(id, now);
  for (const id of Object.keys(mem)) if (!list.some((x) => String(x.id) === id)) delete mem[id];   // a WSKR that is gone
  const cur = list.find((x) => x.id === st.src);
  if (!cur || !cur.ok) { if (!cur) st.src = 'ship'; if (st.sweep) st.sweep = null; }
  if (st.sel && !(mem[st.src] && mem[st.src].has(st.sel))) st.sel = null;
  // the sweep
  let sw = st.sweep;
  if (sw) {
    let t = now - sw.t; sw.t = now;
    const mine = contactsFor(sw.src).filter((c) => !c.lost);
    const done = () => { tell('sensors', sw.found ? `Full sweep complete, Captain. ${sw.found} contact${sw.found === 1 ? '' : 's'}.` : 'Full sweep complete, Captain. Nothing out there.'); st.sweep = sw = null; };
    while (t > 0 && sw) {
      if (sw.pause > 0) { const u = Math.min(t, sw.pause); sw.pause -= u; t -= u; if (sw.pause <= 0 && sw.az >= 360) done(); continue; }
      const a = Math.min(t, 1), a0 = sw.az; sw.az += a; t -= a;
      for (const c of mine) if (!sw.seen.has(c.id) && inArc(c.bearing, a0, sw.az)) { sw.seen.add(c.id); sw.found++; sw.pause = SWEEP_PAUSE_S; break; }
      if (sw.az >= 360 && sw.pause <= 0) done();
    }
  }
  if (st.scan && now >= st.scan.until) finishScan(st.scan, now);
}
sim.afterStep = sim.afterStep || []; sim.afterStep.push(step);
