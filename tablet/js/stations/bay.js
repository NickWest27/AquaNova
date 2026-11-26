// Launch Bay control (owner, 2026-11-25: instruments, not instructions).
// The MAIN bay (outer door and airlock) is shared by Remora and the Tern, one craft at a time. Each WSKR has its own launch bay.
// Rules and numbers: bayops.js. WSKRs are flown from Sensors, Remora from the Science Lab; the Tern is sent from here.
import { tell } from '../notify.js';
import { sim, toward, wskrName, WSKR_CHARGE_H } from '../sim.js';
import { ROV_NAME, rovRange, REMORA_STORE } from '../rov.js';
import { TOOLS } from '../science.js';
import { el, modal } from '../util.js';
import { readout } from '../readout.js';
import { gauge, field, lamp, airlock, pctLvl, sampleSlots, mins } from '../instruments.js';
import { TERN_SAFE_M, launchRemora, recoverRemora, remoraRearm, o2HoursLeft, O2_CHARGE_H, setManning, SHUTTLE_SEATS, SHUTTLE_COCKPIT, bay, busy, tubeBusy, rackBat, shuttle, launchWskr, launchText, receiveWskrNow, launchShuttle, recoverShuttle, sendShuttle, recallShuttle, fetchRemora, dockList, shuttleRangeNm, shuttleSpeed, SHUTTLE_NAME, BAY_SAFE_KT, DOOR_DAMAGE_KT, SHUTTLE_CHARGE_H, MIN_LAUNCH_PCT, LOW_PCT } from '../bayops.js';

const toFull = (bat, hours) => ((100 - bat) / 100) * hours * 60;
const TERN_STATE = { fetch: 'FETCHING REMORA', goto: 'UNDER WAY', station: 'HOLDING', steer: 'ON A HEADING', relay: 'RELAY', follow: 'ALONGSIDE', going: 'TO DOCK', exchange: 'AIRLOCK', returning: 'RETURNING', moored: 'MOORED', search: 'SEARCHING' };
const CRAFT = { rov: ROV_NAME.toUpperCase(), shuttle: SHUTTLE_NAME.toUpperCase(), wskr: 'WSKR' };

export function mount(body) {
  body.style.flexDirection = 'column';
  const view = el('div', { class: 'bay-v' });
  body.append(view);
  let sig = '';
  const ternRo = readout('ro-tern');
  function update() {
    const s = sim.s, w = s.wskrs, r = s.rov, b = bay(), sh = shuttle(), op = b.op, rr = remoraRearm();
    const o2 = sh.o2 == null ? 100 : sh.o2, pilots = sh.pilots == null ? 2 : sh.pilots, pax = sh.pax || 0;
    const tw = sh.state === 'out' ? toward(s, sh) : null;
    const next = JSON.stringify([!!r, r && r.lost, b.tetherFix && Math.round(b.tetherFix.t / 30), !!sh.carry, r && Math.round(toward(s, r).nm * 100), r && (r.cargo || []).map((c) => c.kind).join(), r && r.job && Math.ceil((r.job.end - s.clock) / 60), rr && (rr.cargo || []).length, w.map((q) => [q.n, q.mode, !!q.arrived, Math.round(q.bat || 0)]), s.docked, Math.round(s.speed * 2), op && [op.kind, op.craft, Math.round(op.t)],
      Object.values(b.tubes).map((t) => [t.n, t.kind, Math.round(t.t)]), Math.round(b.doorDmg), sh.state, sh.mode, sh.dead, Math.round(sh.bat), Math.round(o2), rr && Math.round(rr.t / 10), pilots, pax, sh.ashore,
      [1, 2, 3, 4].map((n) => Math.round(rackBat(n))), tw && [Math.round(tw.brg), Math.round(tw.nm * 100), Math.round(sh.depth || 0)]]);
    if (next === sig) return; sig = next;
    const act = (label, fn, off, cls = '') => el('button', { class: 'btn chip ' + cls, text: label, disabled: !!off, onclick: () => { fn(); sig = ''; update(); } });

    // ---- the main bay: outer door, ship speed, airlock ----
    const lost = !!(r && r.lost), fix = b.tetherFix, open = !!(op || (r && !lost)), fast = s.speed > BAY_SAFE_KT, vfast = s.speed > DOOR_DAMAGE_KT;   // the door damage itself shows only as JAMMED (the doors will not open)
    const doorLamp = s.docked ? lamp('ALONGSIDE', '') : open ? lamp(op ? 'OPEN' : 'OPEN · TETHER', vfast ? 'bad' : 'warn') : b.doorDmg >= 100 ? lamp('JAMMED', 'bad') : lamp('CLOSED', 'ok');
    const main = el('div', { class: 'card bay-main' },
      el('div', { class: 'bay-hd' }, el('b', { text: 'MAIN BAY' }), el('span', { class: 'gz-k', text: 'OUTER DOOR' }), doorLamp,
        op ? el('span', { class: 'bay-op', text: `${op.kind === 'launch' ? 'LAUNCHING' : 'RECOVERING'} ${CRAFT[op.craft]}${op.air && op.t > op.dur ? ' · AIRLOCK' : ''}` }) : null),
      airlock(op),
      el('div', { class: 'bay-hd' }, el('span', { class: 'gz-k', text: 'SHIP SPEED' }), fast ? lamp('TOO FAST', 'bad') : lamp('OK', 'ok')));   // over bay speed: red

    // ---- Remora ----
    const launchRov = () => { const x = launchRemora(); tell('science', x.ok ? `${ROV_NAME} is being readied. About ${Math.round(x.secs)} seconds.` : ({ docked: 'Undock first', fast: 'Slow below 8 kt first', out: 'Already out', busy: 'The bay is busy with another craft', doors: 'The bay doors are too damaged to open', rearm: `The team are still unloading and re-equipping her: about ${x.mins} min`, tetherfix: `Engineering are splicing a new tether: about ${x.mins} min`, lost: 'Remora is lost. Send the Tern to fetch her' })[x.why] || 'Cannot launch now', x.ok ? 'mission' : 'error', { key: 'bay' }); };
    const recoverRov = () => { const x = recoverRemora(); tell('science', x.ok ? `Bringing ${ROV_NAME} aboard. About ${Math.round(x.secs)} seconds.` : x.why === 'busy' ? 'The bay is busy' : 'Bring Remora within 0.2 nm of the ship first', x.ok ? 'mission' : 'error', { key: 'bay' }); };
    const rovOp = op && op.craft === 'rov', tnm = r ? toward(s, r).nm : 0;
    // her sample collectors: one slot per sample she can hold (lit with what is in it), and the tool at work
    const collectors = (cargo, unknown) => sampleSlots(cargo, REMORA_STORE, unknown);
    const working = (job) => { const t = TOOLS[job.tool] || { name: job.tool, secs: 1 }, left = Math.max(0, job.end - s.clock); return gauge('WORKING', 1 - left / t.secs, `${t.name.toUpperCase()} · ${Math.ceil(left / 60)} MIN`, 'warn'); };
    const rem = el('div', { class: 'card craft' },
      el('div', { class: 'craft-hd' }, el('b', { text: CRAFT.rov }), rovOp ? lamp(op.kind === 'launch' ? 'LAUNCHING' : 'RECOVERING', 'warn') : lost ? lamp(sh.carry || sh.mode === 'fetch' ? 'TERN FETCHING' : 'LOST', 'bad') : r ? lamp('OUT', 'warn') : rr ? lamp('RE-EQUIP', 'warn') : lamp('IN BAY', 'ok')),
      fix ? gauge('TETHER', fix.t / fix.dur, `PARTED · NEW ${mins((fix.dur - fix.t) / 60)}`, 'bad') : null,
      lost ? null : r ? gauge('TETHER', tnm / rovRange(), `${tnm.toFixed(2)} / ${rovRange()} nm`, tnm / rovRange() > 0.9 ? 'warn' : '') : rr ? gauge('RE-EQUIP', rr.t / rr.dur, `${mins((rr.dur - rr.t) / 60)}${rr.load ? ` · ${rr.load} smp` : ''}`, 'warn') : gauge('READY', 1, 'NO CHARGE NEEDED'),
      collectors(r ? (r.cargo || []) : sh.carry ? (sh.carry.cargo || []) : rr ? (rr.cargo || []) : [], lost), r && r.job ? working(r.job) : null,
      el('div', { class: 'row craft-btns' }, lost ? null : r ? act('Recover', recoverRov, busy()) : act('Launch', launchRov, s.docked || busy() || !!rr || !!fix)));

    // ---- the Tern ----
    const ternLaunch = () => { const x = launchShuttle(); tell('helm', x.ok ? `${SHUTTLE_NAME} is being readied. About ${Math.round(x.secs)} seconds.` : ({ docked: 'Undock first', fast: 'Slow below 8 kt first', busy: 'The bay is busy', doors: 'The bay doors are too damaged to open', charge: `${SHUTTLE_NAME} needs ${MIN_LAUNCH_PCT} percent charge`, o2: `${SHUTTLE_NAME} needs ${MIN_LAUNCH_PCT} percent air`, tether: "Remora's tether is holding the doors open", deep: `Engineering: it is not safe to launch ${SHUTTLE_NAME} below ${TERN_SAFE_M} m. Bring us up first`, standoff: `${SHUTTLE_NAME} is holding at a safe distance until we are above ${TERN_SAFE_M} m`, pilot: 'She needs at least one pilot' })[x.why] || 'Cannot launch now', x.ok ? 'mission' : 'error', { key: 'bay' }); };
    const sendTo = () => {   // one button and a list of docks
      const send = (p, drop) => { const x = sendShuttle(p, drop); tell('helm', x.ok ? (drop ? `${SHUTTLE_NAME} is taking the team to ${p.name}.` : `${SHUTTLE_NAME} is off to ${p.name}, ${x.nm.toFixed(1)} nm, about ${mins(x.hours * 60)}.`) : x.why === 'range' ? `${p.name} is ${x.trip.toFixed(0)} nm there and back, more than ${SHUTTLE_NAME}'s ${x.range.toFixed(0)} nm range` : 'Not available', x.ok ? 'mission' : 'error', { key: 'bay' }); sig = ''; update(); };
      const near = dockList().map((p) => ({ p, nm: toward(s, p).nm })).sort((a, c) => a.nm - c.nm).slice(0, 8);
      modal({ title: `Send ${SHUTTLE_NAME} to`, body: el('p', { text: `Range ${shuttleRangeNm().toFixed(0)} nm there and back. Nearest docks first.` }),
        actions: [...near.flatMap(({ p, nm }) => [{ label: `${p.name}  ${nm.toFixed(0)} nm`, primary: true, run: () => send(p, false) }, ...(pax ? [{ label: `Drop team at ${p.name}`, run: () => send(p, true) }] : [])]), { label: 'Cancel' }] });
    };
    const shOp = op && op.craft === 'shuttle', inBay = sh.state === 'bay';
    const ternLamp = shOp ? lamp(op.kind === 'launch' ? 'LAUNCHING' : 'RECOVERING', 'warn') : inBay ? lamp('IN BAY', 'ok') : sh.dead ? lamp('ADRIFT', 'bad') : lamp(`${TERN_STATE[sh.mode] || sh.mode.toUpperCase()}${sh.mode === 'going' && sh.dest ? ': ' + sh.dest.name.toUpperCase() : ''}`, 'warn');
    if (tw) ternRo.set({ brg: tw.brg, rel: tw.brg - s.heading, nm: tw.nm, depth: sh.depth || 0, kt: shuttleSpeed(sh) }, SHUTTLE_NAME.toUpperCase());
    const ternBtns = inBay
      ? [act(`PILOTS ${pilots}/${SHUTTLE_COCKPIT}`, () => setManning((pilots + 1) % (SHUTTLE_COCKPIT + 1), pax)), act(`PAX ${pax}/${SHUTTLE_SEATS}`, () => setManning(pilots, (pax + 1) % (SHUTTLE_SEATS + 1))),
         act('Launch', ternLaunch, s.docked || busy() || sh.bat < MIN_LAUNCH_PCT || o2 < MIN_LAUNCH_PCT || pilots === 0)]
      : [...(lost && !sh.dead && sh.mode !== 'fetch' && !sh.carry ? [act('Fetch Remora', () => { const x = fetchRemora(); tell('helm', x.ok ? `${SHUTTLE_NAME} is going for Remora, ${x.nm.toFixed(1)} nm, about ${mins(x.hours * 60)}.` : x.why === 'range' ? `Remora is ${x.trip.toFixed(0)} nm there and back, more than ${SHUTTLE_NAME}'s ${x.range.toFixed(0)} nm range` : 'Not available', x.ok ? 'mission' : 'error', { key: 'bay' }); }, false, 'warn')] : []),
         ...(sh.mode === 'moored' ? [act('Pick up the team', () => { recallShuttle(); tell('helm', `${SHUTTLE_NAME} is boarding the team`); })] : []),
         ...(sh.mode === 'follow' && !sh.dead ? [act('Send to…', sendTo), act('Take aboard', () => { const x = recoverShuttle(); tell('helm', x.ok ? `Bringing ${SHUTTLE_NAME} aboard.` : x.why === 'far' ? `${SHUTTLE_NAME} is too far from the ship` : 'Not available', x.ok ? '' : 'error'); }, busy())]
           : sh.mode === 'moored' ? [] : [act('Recall', () => { recallShuttle(); tell('helm', `${SHUTTLE_NAME} recalled`); }, sh.dead)])];
    const tern = el('div', { class: 'card craft tern' },
      el('div', { class: 'craft-hd' }, el('b', { text: CRAFT.shuttle }), ternLamp),
      el('div', { class: 'tern-body' },
        el('div', { class: 'tern-g' },
          gauge('BATT', sh.bat / 100, inBay && sh.bat < 99.5 ? `${Math.round(sh.bat)}% · full ${mins(toFull(sh.bat, SHUTTLE_CHARGE_H))}` : `${Math.round(sh.bat)}%`, pctLvl(sh.bat)),
          gauge('O2', o2 / 100, inBay ? (o2 < 99.5 ? `${Math.round(o2)}% · full ${mins(toFull(o2, O2_CHARGE_H))}` : `${Math.round(o2)}%`) : `${Math.round(o2)}% · ${mins(o2HoursLeft(sh) * 60)}`, pctLvl(o2)),
          el('div', { class: 'gz' }, el('span', { class: 'gz-k', text: 'RANGE' }), el('span', { class: 'gz-v wide', text: `${shuttleRangeNm().toFixed(0)} nm` })),
          !inBay ? el('div', { class: 'gz' }, el('span', { class: 'gz-k', text: 'ABOARD' }), el('span', { class: 'gz-v wide', text: `${pilots} pilot${pilots === 1 ? '' : 's'} · ${pax} pax${sh.ashore ? ` · ${sh.ashore} ashore` : ''}` })) : null),
        tw ? ternRo.box : null),
      el('div', { class: 'row craft-btns' }, ...ternBtns));

    // ---- the WSKR launch bays ----
    const wskrBay = (n) => {
      const q = w.find((x) => x.n === n), t = b.tubes[n], bat = q ? (q.bat == null ? 100 : q.bat) : rackBat(n);
      const st = t ? lamp(t.kind === 'launch' ? 'LAUNCHING' : 'RECOVERING', 'warn') : q ? (q.arrived ? lamp('ALONGSIDE', 'warn') : lamp('OUT', 'warn')) : lamp('RACKED', 'ok');
      const btn = t ? null : q ? (q.arrived ? act('Take aboard', () => { const x = receiveWskrNow(n); tell('sensors', x.ok ? 'Taking it aboard' : 'Its launch bay is busy', x.ok ? '' : 'error'); }, tubeBusy(n))
        : act('Recall', () => { sim.recallWskr(n); tell('sensors', `${wskrName(q)} recalled`); }))
        : act('Launch', () => tell('sensors', launchText(launchWskr(n)), 'mission'), s.docked || bat < MIN_LAUNCH_PCT);
      return el('div', { class: 'card craft wbay' },
        el('div', { class: 'craft-hd' }, el('b', { text: wskrName({ n }).toUpperCase() }), el('span', { class: 'gz-k', text: '#' + n }), st),
        gauge('BATT', bat / 100, !q && bat < 99.5 ? `${Math.round(bat)}% · ${mins(toFull(bat, WSKR_CHARGE_H))}` : `${Math.round(bat)}%`, pctLvl(bat)),
        airlock(t, 'LOCK'),
        el('div', { class: 'row craft-btns' }, btn));
    };

    view.replaceChildren(main, el('div', { class: 'bay-craft' }, rem, tern),
      el('div', { class: 'bay-lbl', text: 'WSKR LAUNCH BAYS' }), el('div', { class: 'bay-w' }, ...[1, 2, 3, 4].map(wskrBay)));
  }
  update();
  return { update, destroy() {} };
}
