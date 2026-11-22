import { sim } from '../sim.js';
import { meter, } from '../ui.js';
import { el } from '../util.js';
import { bay, BAY_SAFE_KT, DOOR_DAMAGE_KT } from '../bayops.js';

export function mount(body) {
  const banner = el('div', { class: 'sys-banner ok', text: 'ALL SYSTEMS NOMINAL' });
  const m = { bat: meter('Battery', 'bat'), pow: meter('Power draw', 'pow'), o2: meter('Oxygen', 'o2'), co2: meter('CO₂', 'co2'), hull: meter('Hull integrity', 'hull'), pres: meter('Pressure vs rating', 'pres') };
  const sw = (key, label) => el('button', { class: 'btn chip' + (sim.s[key] ? ' on' : ''), text: label, onclick: (e) => { sim.s[key] = !sim.s[key]; e.currentTarget.classList.toggle('on', !!sim.s[key]); } });
  const row = (label) => { const v = el('b'), root = el('div', { class: 'sys-door' }, el('span', { text: label + ' ' }), v); return { root, set(t, cls) { v.textContent = t; v.className = cls || ''; } }; };
  const door = { outer: row('Outer doors (open to the sea):'), inner: row('Inner doors (open to the ship):'), outerNote: el('p', { class: 'note' }), innerNote: el('p', { class: 'note' }) };
  const grid = el('div', { class: 'sys-grid' },
    el('div', { class: 'card sys-card' }, el('h3', { text: 'Power' }), m.bat.root, m.pow.root),
    el('div', { class: 'card sys-card' }, el('h3', { text: 'Life support' }), m.o2.root, m.co2.root),
    el('div', { class: 'card sys-card' }, el('h3', { text: 'Hull' }), m.hull.root, m.pres.root),
    el('div', { class: 'card sys-card' }, el('h3', { text: 'Switches' }), el('div', { class: 'row' }, sw('lights', 'Lights'), sw('sonar', 'Sonar'))),
    el('div', { class: 'card sys-card' }, el('h3', { text: 'Launch bay doors' }), door.outer.root, door.outerNote, door.inner.root, door.innerNote));
  body.style.flexDirection = 'column';
  body.append(banner, grid);
  function update() {
    const s = sim.s;
    m.bat.set(s.battery, Math.round(s.battery) + '%'); m.pow.set(s.power, Math.round(s.power) + ' kW', 30, 15, true);
    m.o2.set(s.oxygen, Math.round(s.oxygen) + '%'); m.co2.set(s.co2 * 20, s.co2.toFixed(2) + '%', 40, 20, true);
    m.hull.set(s.hull, Math.round(s.hull) + '%'); m.pres.set(s.depth / 60, Math.round(s.depth / 10 + 1) + ' bar', 60, 20, true);
    const b = bay(), op = b.op, outerOpen = !!(op || s.rov), kt = s.speed;
    const why = op ? (op.kind === 'launch' ? 'launching' : 'taking aboard') : 'held by Remora\'s tether';
    door.outer.set(outerOpen ? 'OPEN, ' + why : s.docked ? 'CLOSED, alongside' : 'CLOSED', outerOpen && kt > BAY_SAFE_KT ? 'bad' : outerOpen ? 'warn' : '');
    door.outerNote.textContent = `Speed limit with the outer doors open: ${BAY_SAFE_KT} kt (the ship takes damage above it), ${DOOR_DAMAGE_KT} kt (the doors are damaged for good). Ship speed ${kt.toFixed(1)} kt. Door damage ${Math.round(b.doorDmg)}%${b.doorDmg >= 100 ? ': the outer doors will not open' : b.doorDmg > 0 ? ': launches take longer' : ''}.`;
    door.inner.set(outerOpen ? 'CLOSED, sealed from the bay' : 'OPEN', outerOpen ? 'warn' : '');
    door.innerNote.textContent = outerOpen ? 'The inner doors stay shut while the outer doors are open. The bay is sealed and unsafe to enter.' : 'The bay is open to the ship. The inner doors close before the outer doors open.';
    const bad = s.battery < 15 || s.oxygen < 15 || s.hull < 40, warn = s.battery < 30 || s.oxygen < 30 || s.hull < 80;
    const cls = bad ? 'bad' : warn ? 'warn' : 'ok';
    banner.className = 'sys-banner ' + cls; banner.textContent = bad ? 'CRITICAL: RETURN TO DOCK' : warn ? 'CAUTION: CHECK SYSTEMS' : 'ALL SYSTEMS NOMINAL';
  }
  update();
  return { update, destroy() {} };
}
