// Launch Bay control: where Remora, the WSKRs and the away boats physically leave and return.
// WSKRs are controlled from the Sensors station and Remora from the Science Lab; the bay shows what is out.
import { tell } from '../notify.js';
import { sim, toward, wskrName, wskrPerk, WSKR_PERKS } from '../sim.js';
import { ROV_NAME } from '../rov.js';
import { el, toast } from '../util.js';

export function mount(body) {
  body.style.flexDirection = 'column';
  const view = el('div', { class: 'tab-body', style: 'flex:1;min-height:0' });
  body.append(view);
  let sig = '';
  function update() {
    const s = sim.s, w = s.wskrs, r = s.rov;
    const next = JSON.stringify([!!r, w.map((q) => [q.n, q.mode]), s.docked]);
    if (next === sig) return; sig = next;
    const card = (name, state, text, btn) => el('div', { class: 'card task' }, el('div', { class: 'grow' }, el('h3', { text: name }), el('p', { style: 'color:var(--dim)', text })), el('span', { class: state ? 'ok' : '', style: state ? '' : 'color:var(--amber)', text: state ? 'In bay' : 'Out' }), btn);
    const act = (label, fn, off) => el('button', { class: 'btn chip', text: label, disabled: !!off, onclick: () => { fn(); sig = ''; update(); } });
    const launchRov = () => { const x = sim.launchRov(); tell('science', x.ok ? `${ROV_NAME} launched` : x.why === 'docked' ? 'Undock first' : 'Already out', x.ok ? '' : 'error'); };
    const recoverRov = () => { const x = sim.recoverRov(); tell('science', x.ok ? `${ROV_NAME} recovered` : 'Bring Remora within 0.2 nm of the ship first', x.ok ? '' : 'error'); };
    const launchW = () => { const x = sim.deployWskr(); tell('sensors', x.ok ? `${wskrName({ n: x.n })} launched` : x.why === 'docked' ? 'Undock first' : 'All four WSKRs are out', x.ok ? '' : 'error'); };
    view.replaceChildren(
      el('div', { class: 'card' }, el('div', { class: 'lbl', text: 'Bay doors' }), el('div', { class: 'num', text: s.docked ? 'ALONGSIDE' : 'READY' }),
        el('p', { style: 'color:var(--dim);margin-top:0.4rem', text: 'Launches happen here. Fly the WSKRs from Sensors and Remora from the Science Lab.' })),
      card(`${ROV_NAME} (Science ROV)`, !r, 'Slow, short range, hand piloted. Controlled from the Science Lab.', r ? act('Recover', recoverRov) : act('Launch', launchRov, s.docked)),
      ...[1, 2, 3, 4].map((n) => { const q = w.find((x) => x.n === n); return card(`${wskrName(q || { n })} (WSKR ${n})`, !q, q ? `Out: ${q.mode}. ${WSKR_PERKS[n].text}` : `Racked and ready. ${WSKR_PERKS[n].text}`, q ? act('Recall', () => { sim.recallWskrs(); tell('sensors', 'WSKRs recalled'); }) : act('Launch', launchW, s.docked || w.length >= 4)); }),
      card('Sea Crab (away boat)', true, 'Crew ferry. Not yet usable.'));
  }
  update();
  return { update, destroy() {} };
}
