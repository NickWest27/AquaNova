// WSKR page (the Sensors console's WSKRs tab): status of every WSKR out (order, depth, battery, range, link), fleet settings
// (depth stagger, formation), and, once one is selected, its controls (orders, manual helm) and its craft view.
// Orders: hold formation, manual control (touch), search pattern, relay (follows the ship under the surface, carries comms and GPS), recall.
import { tell } from '../notify.js';
import { sim, wskrName, wskrPerk, wskrCraft, wskrDepthFor, WSKR_PERKS, WSKR_DEPTHS, WSKR_LINK_NM, WSKR_LOW_PCT, toward } from '../sim.js';
import { mountCraftView } from '../craftview.js';
import { GATES_ON } from '../unlocks.js';
import { research } from '../science.js';
import { el } from '../util.js';

export const ordersOk = () => !GATES_ON || research.has('wskr-orders');
const SAY = { escort: 'Holding formation', manual: 'Manual control', search: 'Search pattern', relay: 'Relay', recall: 'Returning to the bay', task: 'Investigating a contact' };

export function mountWskrPanel(body) {
  body.style.flexDirection = 'column';
  let sel = null, sig = '', rowSig = '';
  const cur = () => sim.s.wskrs.find((q) => q.n === sel);
  const head = el('div', { class: 'card' }), fleet = el('div', { class: 'card' }), list = el('div', { class: 'wst' }), orders = el('div', { class: 'card wo' }), helm = el('div', { class: 'card wo-helm' }), stat = el('div', { class: 'wo-stat', style: 'color:var(--dim);margin:0.3rem 0' }), viewBox = el('div', { class: 'card cv' });
  const cv = mountCraftView(viewBox, { title: () => { const w = cur(); return w ? wskrName(w) : 'WSKR'; }, range: 2, getCraft: () => { const w = cur(); return w ? wskrCraft(w) : null; } });
  body.append(head, fleet, list, orders, helm, viewBox);
  const say = (t) => tell('sensors', t);
  const act = (text, on, fn, disabled) => el('button', { class: 'btn chip' + (on ? ' on' : ''), text, disabled: !!disabled, onclick: () => { fn(); sig = ''; update(); } });
  const hold = (label, fn) => {
    const b = el('button', { class: 'btn chip', text: label, 'aria-label': label });
    const down = (e) => { e.preventDefault(); fn(true); b.classList.add('on'); }, up = () => { fn(false); b.classList.remove('on'); };
    b.addEventListener('pointerdown', down); ['pointerup', 'pointercancel', 'pointerleave'].forEach((n) => b.addEventListener(n, up));
    return b;
  };
  const rowText = (w) => {
    const s = sim.s, l = sim.wskrLink(w), bat = Math.round(w.bat == null ? 100 : w.bat), poi = w.target != null ? s.pois.find((p) => p.id === w.target) : null;
    return { order: w.dead ? 'ADRIFT: no power' : w.mode === 'task' ? `Investigating ${poi ? poi.name : 'a contact'}` : SAY[w.mode] || w.mode, depth: `${wskrDepthFor(w)} m`, bat: `${bat}%`, low: bat <= WSKR_LOW_PCT, range: `${toward(s, w).nm.toFixed(1)} nm`, link: l.ok ? 'Link up' : 'Out of link range' };
  };
  function update() {
    const s = sim.s; if (!s.wskrs.some((w) => w.n === sel)) sel = s.wskrs.length ? s.wskrs[0].n : null;
    const w = cur(), ok = ordersOk();
    const next = JSON.stringify([sel, ok, s.wskrForm, s.wskrDepth, s.docked, s.wskrs.map((q) => [q.n, q.mode, q.target]), sim.hasGps()]);
    if (next !== sig) {
      sig = next;
      head.replaceChildren(el('div', { class: 'row' }, el('strong', { text: `${s.wskrs.length} of 4 WSKRs out` }),
        el('span', { class: sim.hasGps() ? 'ok' : 'bad', text: sim.hasGps() ? 'GPS fix' : 'No GPS fix (dead reckoning)' }),
        act('Deploy WSKR', false, () => { const r = sim.deployWskr(); say(r.ok ? `${wskrName({ n: r.n })} launched from the bay` : r.why === 'docked' ? 'Undock first' : 'All four WSKRs are out'); }, s.docked || s.wskrs.length >= 4),
        act('Recall all', false, () => { sim.recallWskrs(); say('WSKRs recalled'); }, !s.wskrs.length)));
      fleet.replaceChildren(el('div', { style: 'color:var(--dim);margin-bottom:0.4rem', text: ok ? 'Fleet settings' : 'Fleet settings: research "WSKR formations and orders" in the Science Lab to unlock.' }),
        el('div', { class: 'row' }, el('span', { style: 'color:var(--dim)', text: 'Depth' }),
          ...Object.entries(WSKR_DEPTHS).map(([k, t]) => act(t, s.wskrDepth === k, () => { sim.setWskrDepth(k); say(`WSKR depth: ${t.toLowerCase()}`); }, !ok)),
          el('span', { style: 'color:var(--dim);margin-left:1rem', text: 'Formation' }),
          act('Loose', s.wskrForm !== 'tight', () => { sim.setWskrForm('loose'); say('Formation loose'); }, !ok), act('Tight', s.wskrForm === 'tight', () => { sim.setWskrForm('tight'); say('Formation tight'); }, !ok)));
      list.replaceChildren(...(s.wskrs.length ? s.wskrs.map((q) => el('button', { class: 'card task wsk-row' + (q.n === sel ? ' sel' : ''), 'data-n': q.n, onclick: () => { sel = q.n; sig = ''; update(); } },
        el('div', { class: 'grow' }, el('h3', { text: wskrName(q) }), el('p', { class: 'wr-order', style: 'color:var(--dim)' })), el('span', { class: 'wr-depth' }), el('span', { class: 'wr-bat' }), el('span', { class: 'wr-range', style: 'color:var(--dim)' }), el('span', { class: 'wr-link' })))
        : [el('div', { class: 'empty', text: 'No WSKR is out. Deploy one here, or from the Launch Bay.' })]));
      if (w) {
        orders.replaceChildren(el('h3', { text: `${wskrName(w)} (WSKR ${w.n})` }), el('p', { style: 'color:var(--dim);margin:0.3rem 0', text: WSKR_PERKS[w.n].text }), stat,
          el('div', { class: 'row' },
            act('Hold formation', w.mode === 'escort', () => { sim.orderWskr(w.n, 'escort'); say(`${wskrName(w)} rejoining formation`); }, !ok || w.dead),
            act('Manual control', w.mode === 'manual', () => { sim.orderWskr(w.n, 'manual'); say(`${wskrName(w)} is yours, Captain`); }, !ok || w.dead),
            act('Search pattern', w.mode === 'search', () => { sim.orderWskr(w.n, 'search'); say(`${wskrName(w)} starting a search pattern`); }, !ok || w.dead),
            act('Relay', w.mode === 'relay', () => { sim.orderWskr(w.n, 'relay'); say(`${wskrName(w)} going up as a relay`); }, !ok || w.dead),
            act('Recall', w.mode === 'recall', () => { sim.recallWskr(w.n); say(`${wskrName(w)} recalled`); }, w.dead)));
        helm.replaceChildren(...(w.mode === 'manual' ? [el('div', { style: 'color:var(--dim);margin-bottom:0.4rem', text: `Hold a button to turn. Super cruise is 12 times faster. The link reaches ${WSKR_LINK_NM} nm from the ship or from a relay WSKR.` }),
          el('div', { class: 'row' }, hold('Turn left', (d) => sim.wskrHelm(w.n, { turn: d ? -1 : 0 })), hold('Turn right', (d) => sim.wskrHelm(w.n, { turn: d ? 1 : 0 })),
            el('button', { class: 'btn chip', text: 'Slower', onclick: () => sim.wskrHelm(w.n, { thr: (cur().thr || 0) - 0.25 }) }), el('button', { class: 'btn chip', text: 'Faster', onclick: () => sim.wskrHelm(w.n, { thr: (cur().thr || 0) + 0.25 }) }),
            el('button', { class: 'btn chip', text: 'Stop', onclick: () => sim.wskrHelm(w.n, { thr: 0 }) }),
            act('Super cruise', !!w.cruise, () => { w.cruise = !w.cruise; say(`${wskrName(w)} super cruise ${w.cruise ? 'on' : 'off'}`); }))] : []));
      } else { orders.replaceChildren(); helm.replaceChildren(); }
      orders.hidden = !w; helm.hidden = !w || w.mode !== 'manual';
    }
    for (const q of s.wskrs) {                     // live numbers, without rebuilding the rows
      const row = list.querySelector(`[data-n="${q.n}"]`); if (!row) continue; const t = rowText(q);
      row.querySelector('.wr-order').textContent = t.order; row.querySelector('.wr-depth').textContent = `Depth ${t.depth}`;
      const b = row.querySelector('.wr-bat'); b.textContent = `Battery ${t.bat}`; b.className = 'wr-bat ' + (t.low ? 'bad' : '');
      row.querySelector('.wr-range').textContent = t.range; row.querySelector('.wr-link').textContent = t.link;
    }
    if (w) {
      const l = sim.wskrLink(w);
      stat.textContent = w.mode === 'manual' ? `Heading ${String(Math.round(w.heading ?? 0)).padStart(3, '0')}°, speed ${Math.round((w.thr || 0) * 100)}%. Link ${l.nm.toFixed(1)} of ${l.max} nm.${w.limited ? ' At the link limit: bring a relay out or turn back.' : ''}${w.blockedNow ? ' Shallows ahead.' : ''}` : w.mode === 'relay' ? (sim.relayUp() ? 'Relay up: comms and GPS work at any depth.' : 'Moving up to the surface to follow the ship.') : '';
    }
    viewBox.hidden = !w;
    if (w) cv.update();
  }
  update();
  return { update, destroy() { cv.destroy(); } };
}

// The WSKR page is part of the Sensors console; this keeps the old scene name working.
export function mount(body) { body.style.overflowY = 'auto'; return mountWskrPanel(body); }
