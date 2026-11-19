// WSKR page: pick a WSKR that is out, see through it (profile, synthetic forward view, contour map) and give it orders:
// hold formation, manual control (touch), search pattern, relay, recall; depth (auto, shallow, deep); fleet formation (loose, tight).
// Launching is from the Launch Bay or Sensors.
import { tell } from '../notify.js';
import { sim, wskrName, wskrPerk, wskrCraft, WSKR_PERKS, WSKR_DEPTHS, WSKR_LINK_NM } from '../sim.js';
import { mountCraftView } from '../craftview.js';
import { GATES_ON } from '../unlocks.js';
import { research } from '../science.js';
import { el } from '../util.js';

export const ordersOk = () => !GATES_ON || research.has('wskr-orders');
const SAY = { escort: 'holding formation', manual: 'under manual control', search: 'running a search pattern', relay: 'holding as a relay', recall: 'returning to the bay' };

export function mount(body) {
  body.style.flexDirection = 'column'; body.style.overflowY = 'auto';
  let sel = null, sig = '';
  const tabs = el('div', { class: 'tabs' }), info = el('div', { class: 'card' }), viewBox = el('div', { class: 'card cv' });
  const cv = mountCraftView(viewBox, { title: () => { const w = sim.s.wskrs.find((q) => q.n === sel); return w ? wskrName(w) : 'WSKR'; }, range: 2, getCraft: () => { const w = sim.s.wskrs.find((q) => q.n === sel); return w ? wskrCraft(w) : null; } });
  const orders = el('div', { class: 'card wo' }), helm = el('div', { class: 'card wo-helm' }), stat = el('div', { class: 'wo-stat', style: 'color:var(--dim);margin:0.3rem 0' });
  body.append(tabs, viewBox, info, orders, helm);
  const cur = () => sim.s.wskrs.find((q) => q.n === sel);
  const act = (text, on, fn, disabled) => el('button', { class: 'btn chip' + (on ? ' on' : ''), text, disabled: !!disabled, onclick: () => { fn(); sig = ''; update(); } });
  const hold = (label, fn) => {
    const b = el('button', { class: 'btn chip', text: label, 'aria-label': label });
    const down = (e) => { e.preventDefault(); fn(true); b.classList.add('on'); }, up = () => { fn(false); b.classList.remove('on'); };
    b.addEventListener('pointerdown', down); ['pointerup', 'pointercancel', 'pointerleave'].forEach((n) => b.addEventListener(n, up));
    return b;
  };
  function statText(w) {
    const l = sim.wskrLink(w), mode = SAY[w.mode] || (w.mode === 'task' ? 'investigating a contact' : w.mode);
    if (w.mode !== 'manual') return mode[0].toUpperCase() + mode.slice(1) + '.';
    return `Manual: heading ${String(Math.round(w.heading ?? 0)).padStart(3, '0')}°, speed ${Math.round((w.thr || 0) * 100)}%. Link ${l.nm.toFixed(1)} of ${l.max} nm.${w.limited ? ' At the link limit: bring a relay out or turn back.' : ''}${w.blockedNow ? ' Shallows ahead.' : ''}`;
  }
  function update() {
    const s = sim.s; if (!s.wskrs.some((w) => w.n === sel)) sel = s.wskrs.length ? s.wskrs[0].n : null;
    const w = cur(), ok = ordersOk();
    const next = JSON.stringify([sel, ok, s.wskrForm, s.wskrs.map((q) => [q.n, q.mode, q.target, q.dep])]);
    if (next !== sig) {
      sig = next;
      tabs.replaceChildren(...s.wskrs.map((q) => el('button', { class: 'btn chip' + (q.n === sel ? ' on' : ''), text: wskrName(q), onclick: () => { sel = q.n; sig = ''; update(); } })));
      const poi = w && w.target != null ? s.pois.find((p) => p.id === w.target) : null;
      info.replaceChildren(...(w ? [el('h3', { text: `${wskrName(w)} (WSKR ${w.n})` }), el('p', { style: 'color:var(--dim);margin:0.3rem 0', text: `${w.mode === 'task' ? `Investigating ${poi ? poi.name : 'a contact'}` : SAY[w.mode] ? SAY[w.mode][0].toUpperCase() + SAY[w.mode].slice(1) : w.mode}. ${WSKR_PERKS[w.n].text}` }), stat]
        : [el('div', { class: 'empty', text: 'No WSKR is out. Launch one from the Launch Bay or the Sensors station.' })]));
      if (w) {
        const say = (t) => tell('sensors', t);
        orders.replaceChildren(el('div', { style: 'color:var(--dim);margin-bottom:0.4rem', text: ok ? 'Orders' : 'Orders: research "WSKR formations and orders" in the Science Lab to unlock.' }),
          el('div', { class: 'row' },
            act('Hold formation', w.mode === 'escort', () => { sim.orderWskr(w.n, 'escort'); say(`${wskrName(w)} rejoining formation`); }, !ok),
            act('Manual control', w.mode === 'manual', () => { sim.orderWskr(w.n, 'manual'); say(`${wskrName(w)} is yours, Captain`); }, !ok),
            act('Search pattern', w.mode === 'search', () => { sim.orderWskr(w.n, 'search'); say(`${wskrName(w)} starting a search pattern`); }, !ok),
            act('Relay', w.mode === 'relay', () => { sim.orderWskr(w.n, 'relay'); say(`${wskrName(w)} holding here as a relay`); }, !ok),
            act('Recall', w.mode === 'recall', () => { sim.recallWskr(w.n); say(`${wskrName(w)} recalled`); })),
          el('div', { class: 'row', style: 'margin-top:0.5rem' }, el('span', { style: 'color:var(--dim)', text: 'Depth' }),
            ...Object.entries(WSKR_DEPTHS).map(([k, t]) => act(t, (w.dep || 'auto') === k, () => { sim.setWskrDepth(w.n, k); say(`${wskrName(w)} depth: ${t.toLowerCase()}`); }, !ok)),
            el('span', { style: 'color:var(--dim);margin-left:1rem', text: 'Formation (all)' }),
            act('Loose', s.wskrForm !== 'tight', () => { sim.setWskrForm('loose'); say('Formation loose'); }, !ok), act('Tight', s.wskrForm === 'tight', () => { sim.setWskrForm('tight'); say('Formation tight'); }, !ok)));
        helm.replaceChildren(...(w.mode === 'manual' ? [el('div', { style: 'color:var(--dim);margin-bottom:0.4rem', text: `Manual control. Hold a button to turn. The link reaches ${WSKR_LINK_NM} nm from the ship or from a relay WSKR.` }),
          el('div', { class: 'row' }, hold('Turn left', (d) => sim.wskrHelm(w.n, { turn: d ? -1 : 0 })), hold('Turn right', (d) => sim.wskrHelm(w.n, { turn: d ? 1 : 0 })),
            el('button', { class: 'btn chip', text: 'Slower', onclick: () => sim.wskrHelm(w.n, { thr: (cur().thr || 0) - 0.25 }) }), el('button', { class: 'btn chip', text: 'Faster', onclick: () => sim.wskrHelm(w.n, { thr: (cur().thr || 0) + 0.25 }) }),
            el('button', { class: 'btn chip', text: 'Stop', onclick: () => sim.wskrHelm(w.n, { thr: 0 }) }))] : []));
      } else { orders.replaceChildren(); helm.replaceChildren(); }
      orders.hidden = !w; helm.hidden = !w || w.mode !== 'manual';
    }
    stat.textContent = w ? statText(w) : '';
    viewBox.hidden = !w;
    if (w) cv.update();
  }
  update();
  return { update, destroy() { cv.destroy(); } };
}
