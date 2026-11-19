// Launch Bay control: where Remora, the WSKRs and the away boats physically leave and return.
// WSKRs are controlled from the Sensors station and Remora from the Science Lab; the bay shows what is out.
import { sim, toward, wskrName } from '../sim.js';
import { ROV_NAME } from '../rov.js';
import { el } from '../util.js';

export function mount(body) {
  body.style.flexDirection = 'column';
  const view = el('div', { class: 'tab-body', style: 'flex:1;min-height:0' });
  body.append(view);
  let sig = '';
  function update() {
    const s = sim.s, w = s.wskrs, r = s.rov;
    const next = JSON.stringify([!!r, w.map((q) => [q.n, q.mode]), s.docked]);
    if (next === sig) return; sig = next;
    const card = (name, state, text) => el('div', { class: 'card task' }, el('div', { class: 'grow' }, el('h3', { text: name }), el('p', { style: 'color:var(--dim)', text })), el('span', { class: state ? 'ok' : '', style: state ? '' : 'color:var(--amber)', text: state ? 'In bay' : 'Out' }));
    view.replaceChildren(
      el('div', { class: 'card' }, el('div', { class: 'lbl', text: 'Bay doors' }), el('div', { class: 'num', text: s.docked ? 'ALONGSIDE' : 'READY' }),
        el('p', { style: 'color:var(--dim);margin-top:0.4rem', text: 'Launches happen here. Fly the WSKRs from Sensors and Remora from the Science Lab.' })),
      card(`${ROV_NAME} (Science ROV)`, !r, 'Slow, short range, hand piloted. Controlled from the Science Lab.'),
      ...[1, 2, 3, 4].map((n) => { const q = w.find((x) => x.n === n); return card(`${wskrName(q || { n })} (WSKR ${n})`, !q, q ? `Out: ${q.mode}` : 'Racked and ready. Controlled from Sensors.'); }),
      card('Sea Crab (away boat)', true, 'Crew ferry. Not yet usable.'));
  }
  update();
  return { update, destroy() {} };
}
