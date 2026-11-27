// Passive sonar model for the bridge SNR page.
// A listener (the Aqua Nova, or a deployed WSKR) hears anything noisy enough: a bearing line from the listener. Powered sonar needs no scan: every listener hears all the time,
// and the page shows what ALL of them hear, whichever one is the source (the map centre). A fix (two bearings that cross, AIS, a scan, or sight)
// puts the contact on the map. The ship traffic comes from traffic.js (it owns who hears whom). This file adds noisy installations (mines, platforms, colonies),
// remembers contacts for a while after they fade, and runs the two things the Captain can do:
//   Full sweep: a 360 degree sweep at 10 degrees a second. Sensitivity of the sweeping listener doubles. It stops for 2 s on every contact it passes.
//   Scan: a contact the Captain picked. Sensitivity doubles on it for a few seconds; in range, the scan gives a fix, and names it.
// State is in sim.s.snr and is not saved: a new session starts with the ship as the source and nothing selected.
import { sim, toward, wskrName } from './sim.js';
import { traffic, sonarNm, snrGain, triangulate, onFile, probName } from './traffic.js';
import { seafloor } from './seafloor.js';
import { affiliation, placeAffiliation } from './contactIcons.js';
import { tell } from './notify.js';

export const SWEEP_DPS = 10, SWEEP_PAUSE_S = 2, SCAN_S = 10, SCAN_NM = 6, LOST_S = 120;
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
  const v = a.v, s = sim.s, ident = v.ident, prob = !ident && v.prob, kt = v.dyn ? v.kt * 1.2 : v.kt;
  const pos = a.pos, range = pos ? toward(src, pos).nm : null;
  return {
    id: 'ship:' + v.id, kind: 'ship', ref: v, from: { lat: src.lat, lon: src.lon }, by: String(src.id), byName: src.name, icon: iconOf(ident ? affiliation(v) : 'unknown', 'surface'), bearing: line.brg, range, pos, ident,
    name: ident ? v.name : prob ? probName(v) : 'Unidentified contact', prob: prob || 0, onFile: onFile(v), type: ident ? v.label : `Surface vessel (${SIZE_CLASS[v.size]})`, side: ident ? (v.stance === 'hostile' ? 'Hostile' : v.stance === 'wary' ? 'Unfriendly' : v.stance === 'friendly' ? 'Friendly' : 'Neutral') + ' · ' + v.factionName : 'Unknown',
    depth: 'Surface', speed: ident ? `${kt.toFixed(1)} kt` : `~${Math.round(kt / 2) * 2} kt`, course: pos && pos.hdg != null ? Math.round(pos.hdg) : null,
    notes: [ident ? KIND_NOISE[v.kind] : SIZE_NOISE[v.size], ...(onFile(v) && !ident ? ['Signature on file: a sweep reaches 12 nm'] : [])], hostile: ident && v.stance === 'hostile', scanned: v.scanFixUntil > s.clock, size: v.size,
  };
}
function instContact(e, src, line) {
  const p = e.p, k = INST[p.kind], st = instState.get(p.id) || {}, named = !!e.pos || st.named, depth = e.pos ? seafloor.depthAt(e.pos.lat, e.pos.lon) : null;
  return {
    id: 'inst:' + p.id, kind: 'inst', ref: p, from: { lat: src.lat, lon: src.lon }, by: String(src.id), byName: src.name, icon: iconOf(named ? placeAffiliation(p) : 'unknown', 'installation'), bearing: line.brg, range: e.pos ? toward(src, e.pos).nm : null, pos: e.pos, ident: named,
    name: named ? p.name : 'Unidentified machinery', type: named ? k.label : 'Fixed noise source', side: named ? (p.stance ? p.stance[0].toUpperCase() + p.stance.slice(1) : 'Neutral') : 'Unknown',
    depth: depth == null ? '—' : `${Math.round(depth)} m`, speed: '0 kt', course: null, notes: [k.noise], hostile: false, scanned: st.scanFixUntil > sim.s.clock, size: 3,
  };
}

/** Everything the page shows with listener 'id' as the map centre: what ANY listener hears or just heard (the ship and every WSKR in contact), nearest first
 *  (range where it is known, else the newest). A contact with a fix is placed from the centre. One with only bearings keeps the bearing of the listener that heard it
 *  (`remote`, from `from`), the centre's own if it hears it too. */
export function contactsFor(id) {
  const s = sim.s, list = sources(), src = list.find((x) => String(x.id) === String(id)) || list[0], mine = String(src.id), best = new Map(), heardBy = new Map();
  for (const [lid, m] of Object.entries(mem)) for (const [cid, c] of m) {
    const live = s.clock - c.last <= 1;
    if (live) { if (!heardBy.has(cid)) heardBy.set(cid, []); heardBy.get(cid).push(c.byName); }
    const rank = (live ? 4 : 0) + (lid === mine ? 2 : 0), cur = best.get(cid);
    if (!cur || rank > cur.rank || (rank === cur.rank && c.last > cur.c.last)) best.set(cid, { c, rank, lid });
  }
  const out = [];
  for (const [cid, { c, rank, lid }] of best) {
    const t = c.pos ? toward(src, c.pos) : null;
    out.push({ ...c, bearing: t ? t.brg : c.bearing, range: t ? t.nm : null, remote: !c.pos && lid !== mine, lost: rank < 4, heardBy: heardBy.get(cid) || [], age: s.clock - (since.get(cid) || c.last), inv: sim.trailing(c.kind, c.ref.id).map(wskrName) });
  }
  out.sort((a, b) => (a.range != null && b.range != null ? a.range - b.range : a.range != null ? -1 : b.range != null ? 1 : a.age - b.age));
  return out;
}
export const selected = () => { const st = snr(); return st.sel ? contactsFor(st.src).find((c) => c.id === st.sel) || null : null; };
export function select(id) { const st = snr(); st.sel = st.sel === id ? null : id; sim.touch(); return st.sel; }

// ---- sending a WSKR ----
/** Is there a WSKR that can be sent (the chosen source if it is a WSKR, else a free one in formation), or one already on this contact? */
export function canInvestigate() {
  const c = selected(); if (!c || c.lost) return false;
  if (c.inv.length) return true;
  const st = snr(), w = sim.s.wskrs.filter((q) => !q.dead && !q.arrived);
  return st.src !== 'ship' ? w.some((q) => q.n === st.src && q.mode !== 'recall') : w.some((q) => q.mode === 'escort');
}
/** The Investigate button: send a WSKR to the picked contact, or, if one is on it, release it back to formation. */
export function toggleInvestigate() {
  const st = snr(), c = selected(); if (!c) return;
  const on = sim.trailing(c.kind, c.ref.id);
  if (on.length) { for (const w of on) sim.orderWskr(w.n, 'escort'); tell('sensors', `${on.map(wskrName).join(' and ')} released from the contact and back in formation, Captain.`); return; }
  const w = sim.trailWskr({ kind: c.kind, id: c.ref.id }, st.src === 'ship' ? 0 : st.src);
  tell('sensors', w ? `${wskrName(w)} is going to investigate, Captain. It will close to a mile and stay with the contact until you release it.` : 'No WSKR is free to send, Captain.', w ? '' : 'error');
}

// ---- the sweep and the scan ----
export function sweeping() { return !!snr().sweep; }
// A full sweep turns once round (360 / SWEEP_DPS = 36 s, plus a short pause per contact). While it runs the chart is drawn finer round the ship
// (sim.fineNm, via sweepUntil) and each bearing hears twice as far once the beam has passed it (traffic.snrGain).
export function startSweep() { const st = snr(), src = source(); if (!src.ok) return false; st.sweep = { src: src.id, az: 0, t: sim.s.clock, pause: 0, seen: new Set(), found: 0 }; sim.s.sonar = true; sim.s.sweepUntil = sim.s.clock + 360 / SWEEP_DPS + 60; sim.emit('sonar-sweep', {}); sim.touch(); return true; }
export function stopSweep() { snr().sweep = null; sim.s.sweepUntil = sim.s.clock; sim.touch(); }
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
  if (nm <= (c.onFile ? traffic.cfg.sensing.sweep_nm_known : SCAN_NM)) {   // a signature on file is recognised further out
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
  const before = new Set(Object.values(mem).flatMap((m) => [...m.keys()]));   // for the new-contact and contact-lost blips (app.js)
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
  const after = new Set(Object.values(mem).flatMap((m) => [...m.keys()]));
  for (const id of after) if (!before.has(id)) sim.emit('sonar-contact', { id });
  for (const id of before) if (!after.has(id)) sim.emit('sonar-lost', { id });
  const cur = list.find((x) => x.id === st.src);
  if (!cur || !cur.ok) { if (!cur) st.src = 'ship'; if (st.sweep) st.sweep = null; }
  if (st.sel && !contactsFor(st.src).some((c) => c.id === st.sel)) st.sel = null;
  // the sweep
  let sw = st.sweep;
  if (sw) {
    let t = now - sw.t; sw.t = now;
    const mine = contactsFor(sw.src).filter((c) => !c.lost && !c.remote);   // the ones the sweeping listener can place a line on
    const done = () => { tell('sensors', sw.found ? `Full sweep complete, Captain. ${sw.found} contact${sw.found === 1 ? '' : 's'}.` : 'Full sweep complete, Captain. Nothing out there.'); st.sweep = sw = null; s.sweepUntil = now; };
    while (t > 0 && sw) {
      if (sw.pause > 0) { const u = Math.min(t, sw.pause); sw.pause -= u; t -= u; if (sw.pause <= 0 && sw.az >= 360) done(); continue; }
      const a = Math.min(t, 1); sw.az += a * SWEEP_DPS; t -= a;   // below: anything on a bearing the beam has passed, including one it has just brought up
      for (const c of mine) if (!sw.seen.has(c.id) && inArc(c.bearing, 0, sw.az)) { sw.seen.add(c.id); sw.found++; sw.pause = SWEEP_PAUSE_S; break; }
      if (sw.az >= 360 && sw.pause <= 0) done();
    }
  }
  for (const w of s.wskrs) {   // a WSKR on a contact reports when it has identified it
    const tr = w.mode === 'trail' && w.trail; if (!tr || tr.said || tr.kind !== 'ship') continue;
    const a = traffic.active.find((x) => String(x.v.id) === tr.id);
    if (a && a.v.ident) { tr.said = true; tell('sensors', `${wskrName(w)} has identified the contact, Captain: ${a.v.name}, ${a.v.label.toLowerCase()}, ${a.v.factionName}.`, a.v.stance === 'hostile' ? 'mission' : ''); }
  }
  if (st.scan && now >= st.scan.until) finishScan(st.scan, now);
}
sim.afterStep = sim.afterStep || []; sim.afterStep.push(step);

// ---- the screen intercepts what it has not identified ----
// Every 5 game seconds: a WSKR in formation is sent to close on any unidentified ship the sonar has a fix on, nearest WSKR first, one at a time, and at least one
// WSKR stays in the screen. When the contact is identified the WSKR is released back to its station. Off with sim.setWskrAuto(false). A contact is only chased once.
let autoAt = 0;   // the chased list is sim.s.wskrChased (saved), so a reload does not send a WSKR after the same contact again
/** Leash: the screen only starts a chase when the contact is within AUTO_START_NM of the ship, and breaks off if the WSKR gets beyond AUTO_LEASH_NM. Sent by hand (Investigate) there is no limit. */
export const AUTO_START_NM = 6, AUTO_LEASH_NM = 8;
sim.hooks.push(() => {
  const s = sim.s; if (s.clock - autoAt < 5) return; autoAt = s.clock;
  if (s.wskrAuto === false || !s.wskrs.length) return;
  const list = contactsFor('ship');
  for (const w of s.wskrs) if (w.mode === 'trail' && w.auto && w.trail) {
    const c = list.find((x) => x.id === w.trail.kind + ':' + w.trail.id);
    if (toward(s, w).nm > AUTO_LEASH_NM) { w.auto = false; sim.orderWskr(w.n, 'escort'); tell('sensors', `${wskrName(w)} is breaking off the chase at ${AUTO_LEASH_NM} miles, Captain, and returning to the screen. Send it to investigate if you want it to go further.`); continue; }
    if (c && c.ident) { w.auto = false; sim.orderWskr(w.n, 'escort'); tell('sensors', `${wskrName(w)} has identified it as ${c.name}, Captain, and is back on the screen.`); }
  }
  const free = s.wskrs.filter((w) => w.mode === 'escort' && !w.dead && !w.arrived);
  if (free.length < 2) return;
  const c = list.find((x) => x.kind === 'ship' && !x.ident && !x.lost && x.pos && toward(s, x.pos).nm <= AUTO_START_NM && !x.inv.length && !x.onFile && !(s.wskrChased || []).includes(x.id));   // a ship on file is swept, not chased
  if (!c) return;
  const near = free.sort((a, b) => toward(a, c.pos).nm - toward(b, c.pos).nm)[0];
  const w = sim.trailWskr({ kind: 'ship', id: c.ref.id }, near.n); if (!w) return;
  w.auto = true; s.wskrChased = [...(s.wskrChased || []), c.id].slice(-200);
  tell('sensors', `${wskrName(w)} is closing on an unidentified contact, bearing ${String(Math.round(c.bearing)).padStart(3, '0')}, Captain.`);
});
