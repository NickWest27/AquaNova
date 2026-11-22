// Launch Bay control: where Remora, the WSKRs and the shuttle physically leave and return (rules and numbers in bayops.js).
// WSKRs are flown from Sensors, Remora from the Science Lab, and the shuttle is sent from here.
import { tell } from '../notify.js';
import { sim, toward, wskrName, WSKR_PERKS } from '../sim.js';
import { ROV_NAME, tetherBar } from '../rov.js';
import { el } from '../util.js';
import { TERN_SAFE_M, TERN_CRUSH_M, launchRemora, recoverRemora, remoraRearm, shuttleHours, shuttleO2Hours, o2HoursLeft, O2_CHARGE_H, O2_CREW, setManning, SHUTTLE_SEATS, SHUTTLE_COCKPIT, bay, busy, rackBat, shuttle, launchWskr, launchText, receiveWskrNow, launchShuttle, recoverShuttle, sendShuttle, recallShuttle, dockList, shuttleRangeNm, SHUTTLE_NAME, BAY_SAFE_KT, DOOR_DAMAGE_KT, SHUTTLE_KT, SHUTTLE_CHARGE_H, MIN_LAUNCH_PCT } from '../bayops.js';
import { WSKR_CHARGE_H } from '../sim.js';

const mins = (m) => (m < 1 ? 'under a minute' : m < 60 ? `${Math.round(m)} min` : `${Math.floor(m / 60)} h ${Math.round(m % 60)} min`);
const toFull = (bat, hours) => ((100 - bat) / 100) * hours * 60;
const SHUTTLE_WORDS = { goto: 'under way to a position', station: 'holding position', steer: 'on a heading', relay: 'up as a relay', follow: 'alongside', going: 'under way to a dock', exchange: 'cycling the airlock', returning: 'coming home', moored: 'moored at a dock, charging' };

export function mount(body) {
  body.style.flexDirection = 'column';
  const view = el('div', { class: 'tab-body', style: 'flex:1;min-height:0' });
  body.append(view);
  let sig = '';
  const tether = tetherBar();   // how much of Remora's tether is out (shown on her card while she is out)
  function update() {
    const s = sim.s, w = s.wskrs, r = s.rov, b = bay(), sh = shuttle(), op = b.op;
    const secs = op ? Math.round(op.dur + (op.air || 0) - op.t) : 0;
    const fast = s.speed > BAY_SAFE_KT, vfast = s.speed > DOOR_DAMAGE_KT;
    const next = JSON.stringify([!!r, w.map((q) => [q.n, q.mode, !!q.arrived, Math.round(q.bat || 0)]), s.docked, Math.round(s.speed), op && [op.kind, op.craft, op.n, secs], Math.round(b.doorDmg), sh.state, sh.mode, Math.round(sh.bat), Math.round(sh.o2 == null ? 100 : sh.o2), remoraRearm() && Math.round(remoraRearm().t / 10), shuttleHours(), shuttleO2Hours(), sh.pilots, sh.pax, sh.ashore, Math.round(rackBat(1) + rackBat(2) * 3 + rackBat(3) * 7 + rackBat(4) * 11), Math.round(toward(s, sh).nm * 10)]);
    tether.refresh();
    if (next === sig) return; sig = next;
    const card = (name, state, text, ...btns) => el('div', { class: 'card task' }, el('div', { class: 'grow' }, el('h3', { text: name }), el('p', { style: 'color:var(--dim)', text })), el('span', { class: state ? 'ok' : '', style: state ? '' : 'color:var(--amber)', text: state ? 'In bay' : 'Out' }), ...btns);
    const rovCard = (...a) => { const c = card(...a); c.querySelector('.grow').append(tether); return c; };
    const act = (label, fn, off) => el('button', { class: 'btn chip', text: label, disabled: !!off, onclick: () => { fn(); sig = ''; update(); } });
    const launchRov = () => { const x = launchRemora(); tell('science', x.ok ? `${ROV_NAME} is being readied. About ${Math.round(x.secs)} seconds.` : ({ docked: 'Undock first', fast: 'Slow below 8 kt first', out: 'Already out', busy: 'The bay is busy with another craft', doors: 'The bay doors are too damaged to open', rearm: `The team are still unloading and re-equipping her: about ${x.mins} min` })[x.why] || 'Cannot launch now', x.ok ? 'mission' : 'error', { key: 'bay' }); };
    const recoverRov = () => { const x = recoverRemora(); tell('science', x.ok ? `Bringing ${ROV_NAME} aboard. About ${Math.round(x.secs)} seconds.` : x.why === 'busy' ? 'The bay is busy' : 'Bring Remora within 0.2 nm of the ship first', x.ok ? 'mission' : 'error', { key: 'bay' }); };
    const doors = el('div', { class: 'card' }, el('div', { class: 'lbl', text: 'Bay doors (Engineering)' }),
      el('div', { class: 'num' + (vfast && (op || r) ? ' bad' : ''), text: op ? `OPEN · ${op.kind === 'launch' ? 'launching' : 'taking aboard'} · ${secs} s${op.air && op.t > op.dur ? ' (airlock cycling)' : ''}` : r ? 'OPEN · held by Remora\'s tether' : s.docked ? 'ALONGSIDE' : 'CLOSED' }),
      el('p', { style: 'color:var(--dim);margin-top:0.4rem', text: `A launch or recovery takes about a minute with the doors open. While Remora is out on her tether the doors stay open and no other craft can be launched or taken aboard. Keep the ship under ${BAY_SAFE_KT} knots: above that the ship takes damage while the doors are open, and above ${DOOR_DAMAGE_KT} the doors themselves are damaged for good (a dry dock repairs them).` }),
      el('p', { style: `margin-top:0.3rem;color:${vfast ? 'var(--red,#ff5c5c)' : fast ? 'var(--amber)' : 'var(--dim)'}`, text: `Ship speed ${s.speed.toFixed(1)} kt${fast ? (vfast ? ': too fast, the doors will be damaged' : ': too fast, the ship will be damaged') : ': fine for the bay'}. Door damage ${Math.round(b.doorDmg)}%${b.doorDmg >= 100 ? ' (doors will not open)' : b.doorDmg > 0 ? ' (launches take longer)' : ''}.` }));
    const wskrCard = (n) => {
      const q = w.find((x) => x.n === n), bat = rackBat(n);
      if (q) return card(`${wskrName(q)} (WSKR ${n})`, false, q.arrived ? (op && op.craft === 'wskr' && op.n === n ? 'Alongside, being taken aboard.' : `Alongside. Slow below ${BAY_SAFE_KT} knots and it will be taken aboard.`) : `Out: ${q.mode}. Battery ${Math.round(q.bat || 0)}%. ${WSKR_PERKS[n].text}`,
        q.arrived ? act('Take aboard now', () => { const x = receiveWskrNow(n); tell('sensors', x.ok ? 'Taking it aboard' : 'The bay is busy', x.ok ? '' : 'error'); }, busy()) : act('Recall', () => { sim.recallWskrs(); tell('sensors', 'WSKRs recalled'); }));
      const full = bat >= 99.5;
      return card(`${wskrName({ n })} (WSKR ${n})`, true, `${full ? 'Racked and fully charged.' : `Charging: ${Math.round(bat)}%, full in ${mins(toFull(bat, WSKR_CHARGE_H))}.`} ${WSKR_PERKS[n].text}`, act('Launch', () => tell('sensors', launchText(launchWskr(n)), 'mission'), s.docked || w.length >= 4 || busy() || bat < MIN_LAUNCH_PCT));
    };
    const dk = dockList();
    const shuttleCard = sh.state === 'bay'
      ? card(`${SHUTTLE_NAME} (shuttle)`, true, `Ferries crew and supplies so the Aqua Nova does not have to dock. Safe to ${TERN_SAFE_M} m, crush depth ${TERN_CRUSH_M} m. ${SHUTTLE_KT} kt, ${shuttleHours()} hour${shuttleHours() === 1 ? '' : 's'} on a full charge (research can extend it), air for ${shuttleO2Hours()} hours with all eight seats taken, airlocks cycle in 10 seconds. Two cockpit seats (one pilot and a radio link will do) and six passenger seats for crew, supplies and away teams. Navigation and radio, but no scanning gear. ${sh.bat >= 99.5 ? 'Fully charged.' : `Charging: ${Math.round(sh.bat)}%, full in ${mins(toFull(sh.bat, SHUTTLE_CHARGE_H))}.`} ${(sh.o2 == null ? 100 : sh.o2) >= 99.5 ? 'Air full.' : `Air ${Math.round(sh.o2)}%, full in ${mins(toFull(sh.o2, O2_CHARGE_H))}.`}`,
        act('Pilots: ' + (sh.pilots == null ? 2 : sh.pilots) + ' of ' + SHUTTLE_COCKPIT, () => setManning(((sh.pilots == null ? 2 : sh.pilots) + 1) % (SHUTTLE_COCKPIT + 1), sh.pax || 0)),
        act('Passengers: ' + (sh.pax || 0) + ' of ' + SHUTTLE_SEATS, () => setManning(sh.pilots == null ? 2 : sh.pilots, ((sh.pax || 0) + 1) % (SHUTTLE_SEATS + 1))),
        act('Launch', () => { const x = launchShuttle(); tell('helm', x.ok ? `${SHUTTLE_NAME} is being readied. About ${Math.round(x.secs)} seconds.` : ({ docked: 'Undock first', fast: 'Slow below 8 kt first', busy: 'The bay is busy', doors: 'The bay doors are too damaged to open', charge: `${SHUTTLE_NAME} needs ${MIN_LAUNCH_PCT} percent charge`, o2: `${SHUTTLE_NAME} needs ${MIN_LAUNCH_PCT} percent air`, tether: "Remora's tether is holding the doors open", deep: `Engineering: it is not safe to launch ${SHUTTLE_NAME} below ${TERN_SAFE_M} m. Bring us up first`, standoff: `${SHUTTLE_NAME} is holding at a safe distance until we are above ${TERN_SAFE_M} m`, pilot: 'She needs at least one pilot' })[x.why] || 'Cannot launch now', x.ok ? 'mission' : 'error', { key: 'bay' }); }, s.docked || busy() || sh.bat < MIN_LAUNCH_PCT || (sh.o2 != null && sh.o2 < MIN_LAUNCH_PCT) || sh.pilots === 0))
      : card(`${SHUTTLE_NAME} (shuttle)`, false, `${sh.dead ? 'Adrift with no power. The ship must come alongside.' : `${SHUTTLE_WORDS[sh.mode] || sh.mode}${sh.mode === 'going' && sh.dest ? ': ' + sh.dest.name : ''}.`} Battery ${Math.round(sh.bat)}%. Air ${Math.round(sh.o2 == null ? 100 : sh.o2)}%, ${mins(o2HoursLeft(sh) * 60)} at this load. Range ${shuttleRangeNm().toFixed(0)} nm. Aboard: ${sh.pilots == null ? 2 : sh.pilots} pilot${sh.pilots === 1 ? '' : 's'}, ${sh.pax || 0} passenger${sh.pax === 1 ? '' : 's'}${sh.ashore ? `; ${sh.ashore} ashore` : ''}. ${toward(s, sh).nm.toFixed(1)} nm from the ship.`,
        ...(sh.mode === 'moored' ? [act('Pick up the team', () => { recallShuttle(); tell('helm', `${SHUTTLE_NAME} is boarding the team`); })] : []),
        ...(sh.mode === 'follow' && !sh.dead ? [...dk.flatMap((p) => [act(`Send to ${p.name}`, () => { const x = sendShuttle(p); tell('helm', x.ok ? `${SHUTTLE_NAME} is off to ${p.name}, ${x.nm.toFixed(1)} nm, about ${mins(x.hours * 60)}.` : x.why === 'range' ? `${p.name} is ${x.trip.toFixed(0)} nm there and back, more than ${SHUTTLE_NAME}'s ${x.range.toFixed(0)} nm range` : 'Not available', x.ok ? 'mission' : 'error', { key: 'bay' }); }), ...(sh.pax ? [act(`Drop team at ${p.name}`, () => { const x = sendShuttle(p, true); tell('helm', x.ok ? `${SHUTTLE_NAME} is taking the team to ${p.name}.` : 'Not available', x.ok ? 'mission' : 'error', { key: 'bay' }); })] : [])]),
          act('Take aboard', () => { const x = recoverShuttle(); tell('helm', x.ok ? `Bringing ${SHUTTLE_NAME} aboard.` : x.why === 'far' ? `${SHUTTLE_NAME} is too far from the ship` : 'Not available', x.ok ? '' : 'error'); }, busy())] : (sh.mode === 'moored' ? [] : [act('Recall', () => { recallShuttle(); tell('helm', `${SHUTTLE_NAME} recalled`); }, sh.dead)])));
    view.replaceChildren(doors,
      rovCard(`${ROV_NAME} (Science ROV)`, !r, r ? 'Out on her tether, hand piloted from the Science Lab. The bay doors stay open until she is back aboard, so no other craft can launch or be taken aboard. Keep the ship under 8 knots.' : remoraRearm() ? `Aboard. The science team are unloading ${remoraRearm().load} sample${remoraRearm().load === 1 ? '' : 's'} and re-equipping her: ${Math.max(1, Math.ceil((remoraRearm().dur - remoraRearm().t) / 60))} min to go. She needs no charge.` : 'Slow, short range, hand piloted from the Science Lab. Launching takes a minute, and the doors then stay open for her tether. Needs no charging, but the team unload her samples and re-equip her after every dive (5 min and 2 min a sample).', r ? act('Recover', recoverRov, busy()) : act('Launch', launchRov, s.docked || busy() || !!remoraRearm())),
      ...[1, 2, 3, 4].map(wskrCard), shuttleCard);
  }
  update();
  return { update, destroy() {} };
}
