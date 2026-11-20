// Launch Bay control: where Remora, the WSKRs and the shuttle physically leave and return (rules and numbers in bayops.js).
// WSKRs are flown from Sensors, Remora from the Science Lab, and the shuttle is sent from here.
import { tell } from '../notify.js';
import { sim, toward, wskrName, WSKR_PERKS } from '../sim.js';
import { ROV_NAME } from '../rov.js';
import { el } from '../util.js';
import { setManning, SHUTTLE_SEATS, SHUTTLE_COCKPIT, bay, busy, rackBat, shuttle, launchWskr, launchText, receiveWskrNow, launchShuttle, recoverShuttle, sendShuttle, recallShuttle, dockList, shuttleRangeNm, SHUTTLE_NAME, BAY_SAFE_KT, DOOR_DAMAGE_KT, SHUTTLE_KT, SHUTTLE_CHARGE_H, MIN_LAUNCH_PCT } from '../bayops.js';
import { WSKR_CHARGE_H } from '../sim.js';

const mins = (m) => (m < 1 ? 'under a minute' : m < 60 ? `${Math.round(m)} min` : `${Math.floor(m / 60)} h ${Math.round(m % 60)} min`);
const toFull = (bat, hours) => ((100 - bat) / 100) * hours * 60;
const SHUTTLE_WORDS = { follow: 'alongside', going: 'under way to a dock', exchange: 'cycling the airlock', returning: 'coming home', moored: 'moored at a dock, charging' };

export function mount(body) {
  body.style.flexDirection = 'column';
  const view = el('div', { class: 'tab-body', style: 'flex:1;min-height:0' });
  body.append(view);
  let sig = '';
  function update() {
    const s = sim.s, w = s.wskrs, r = s.rov, b = bay(), sh = shuttle(), op = b.op;
    const secs = op ? Math.round(op.dur + (op.air || 0) - op.t) : 0;
    const fast = s.speed > BAY_SAFE_KT, vfast = s.speed > DOOR_DAMAGE_KT;
    const next = JSON.stringify([!!r, w.map((q) => [q.n, q.mode, !!q.arrived, Math.round(q.bat || 0)]), s.docked, Math.round(s.speed), op && [op.kind, op.craft, op.n, secs], Math.round(b.doorDmg), sh.state, sh.mode, Math.round(sh.bat), sh.pilots, sh.pax, sh.ashore, Math.round(rackBat(1) + rackBat(2) * 3 + rackBat(3) * 7 + rackBat(4) * 11), Math.round(toward(s, sh).nm * 10)]);
    if (next === sig) return; sig = next;
    const card = (name, state, text, ...btns) => el('div', { class: 'card task' }, el('div', { class: 'grow' }, el('h3', { text: name }), el('p', { style: 'color:var(--dim)', text })), el('span', { class: state ? 'ok' : '', style: state ? '' : 'color:var(--amber)', text: state ? 'In bay' : 'Out' }), ...btns);
    const act = (label, fn, off) => el('button', { class: 'btn chip', text: label, disabled: !!off, onclick: () => { fn(); sig = ''; update(); } });
    const launchRov = () => { const x = sim.launchRov(); tell('science', x.ok ? `${ROV_NAME} launched` : x.why === 'docked' ? 'Undock first' : 'Already out', x.ok ? '' : 'error'); };
    const recoverRov = () => { const x = sim.recoverRov(); tell('science', x.ok ? `${ROV_NAME} recovered` : 'Bring Remora within 0.2 nm of the ship first', x.ok ? '' : 'error'); };
    const doors = el('div', { class: 'card' }, el('div', { class: 'lbl', text: 'Bay doors' }),
      el('div', { class: 'num' + (vfast && op ? ' bad' : ''), text: op ? `OPEN · ${op.kind === 'launch' ? 'launching' : 'taking aboard'} · ${secs} s${op.air && op.t > op.dur ? ' (airlock cycling)' : ''}` : s.docked ? 'ALONGSIDE' : 'CLOSED' }),
      el('p', { style: 'color:var(--dim);margin-top:0.4rem', text: `A launch or recovery takes about a minute with the doors open. Keep the ship under ${BAY_SAFE_KT} knots: above that the ship takes damage while the doors are open, and above ${DOOR_DAMAGE_KT} the doors themselves are damaged for good (a dry dock repairs them).` }),
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
      ? card(`${SHUTTLE_NAME} (shuttle)`, true, `Ferries crew and supplies so the Aqua Nova does not have to dock. ${SHUTTLE_KT} kt, 6 hours on a full charge, airlocks cycle in 10 seconds. Two cockpit seats (one pilot and a radio link will do) and six passenger seats for crew, supplies and away teams. Navigation and radio, but no scanning gear. ${sh.bat >= 99.5 ? 'Fully charged.' : `Charging: ${Math.round(sh.bat)}%, full in ${mins(toFull(sh.bat, SHUTTLE_CHARGE_H))}.`}`,
        act('Pilots: ' + (sh.pilots == null ? 2 : sh.pilots) + ' of ' + SHUTTLE_COCKPIT, () => setManning(((sh.pilots == null ? 2 : sh.pilots) + 1) % (SHUTTLE_COCKPIT + 1), sh.pax || 0)),
        act('Passengers: ' + (sh.pax || 0) + ' of ' + SHUTTLE_SEATS, () => setManning(sh.pilots == null ? 2 : sh.pilots, ((sh.pax || 0) + 1) % (SHUTTLE_SEATS + 1))),
        act('Launch', () => { const x = launchShuttle(); tell('helm', x.ok ? `${SHUTTLE_NAME} is being readied. About ${Math.round(x.secs)} seconds.` : ({ docked: 'Undock first', busy: 'The bay is busy', doors: 'The bay doors are too damaged to open', charge: `${SHUTTLE_NAME} needs ${MIN_LAUNCH_PCT} percent charge`, pilot: 'She needs at least one pilot' })[x.why] || 'Cannot launch now', x.ok ? 'mission' : 'error'); }, s.docked || busy() || sh.bat < MIN_LAUNCH_PCT || sh.pilots === 0))
      : card(`${SHUTTLE_NAME} (shuttle)`, false, `${sh.dead ? 'Adrift with no power. The ship must come alongside.' : `${SHUTTLE_WORDS[sh.mode] || sh.mode}${sh.mode === 'going' && sh.dest ? ': ' + sh.dest.name : ''}.`} Battery ${Math.round(sh.bat)}%, range ${shuttleRangeNm().toFixed(0)} nm. Aboard: ${sh.pilots == null ? 2 : sh.pilots} pilot${sh.pilots === 1 ? '' : 's'}, ${sh.pax || 0} passenger${sh.pax === 1 ? '' : 's'}${sh.ashore ? `; ${sh.ashore} ashore` : ''}. ${toward(s, sh).nm.toFixed(1)} nm from the ship.`,
        ...(sh.mode === 'moored' ? [act('Pick up the team', () => { recallShuttle(); tell('helm', `${SHUTTLE_NAME} is boarding the team`); })] : []),
        ...(sh.mode === 'follow' && !sh.dead ? [...dk.flatMap((p) => [act(`Send to ${p.name}`, () => { const x = sendShuttle(p); tell('helm', x.ok ? `${SHUTTLE_NAME} is off to ${p.name}, ${x.nm.toFixed(1)} nm, about ${mins(x.hours * 60)}.` : x.why === 'range' ? `${p.name} is ${x.trip.toFixed(0)} nm there and back, more than ${SHUTTLE_NAME}'s ${x.range.toFixed(0)} nm range` : 'Not available', x.ok ? 'mission' : 'error'); }), ...(sh.pax ? [act(`Drop team at ${p.name}`, () => { const x = sendShuttle(p, true); tell('helm', x.ok ? `${SHUTTLE_NAME} is taking the team to ${p.name}.` : 'Not available', x.ok ? 'mission' : 'error'); })] : [])]),
          act('Take aboard', () => { const x = recoverShuttle(); tell('helm', x.ok ? `Bringing ${SHUTTLE_NAME} aboard.` : x.why === 'far' ? `${SHUTTLE_NAME} is too far from the ship` : 'Not available', x.ok ? '' : 'error'); }, busy())] : (sh.mode === 'moored' ? [] : [act('Recall', () => { recallShuttle(); tell('helm', `${SHUTTLE_NAME} recalled`); }, sh.dead)])));
    view.replaceChildren(doors,
      card(`${ROV_NAME} (Science ROV)`, !r, 'Slow, short range, hand piloted. Controlled from the Science Lab. (Launches at once; it does not use the bay doors yet.)', r ? act('Recover', recoverRov) : act('Launch', launchRov, s.docked)),
      ...[1, 2, 3, 4].map(wskrCard), shuttleCard);
  }
  update();
  return { update, destroy() {} };
}
