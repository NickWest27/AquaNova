// WSKR page: pick a WSKR that is out, see through it (profile, synthetic forward view, contour map).
// Orders (formations, search patterns, manual control) come later. Launching is from the Launch Bay or Sensors.
import { sim, wskrName, wskrPerk, wskrCraft, WSKR_PERKS } from '../sim.js';
import { mountCraftView } from '../craftview.js';
import { el, toast } from '../util.js';

export function mount(body) {
  body.style.flexDirection = 'column'; body.style.overflowY = 'auto';
  let sel = null, sig = '';
  const tabs = el('div', { class: 'tabs' }), info = el('div', { class: 'card' }), viewBox = el('div', { class: 'card cv' });
  const cv = mountCraftView(viewBox, { title: () => { const w = sim.s.wskrs.find((q) => q.n === sel); return w ? wskrName(w) : 'WSKR'; }, range: 2, getCraft: () => { const w = sim.s.wskrs.find((q) => q.n === sel); return w ? wskrCraft(w) : null; } });
  body.append(tabs, viewBox, info);
  function update() {
    const s = sim.s; if (!s.wskrs.some((w) => w.n === sel)) sel = s.wskrs.length ? s.wskrs[0].n : null;
    const w = s.wskrs.find((q) => q.n === sel);
    const next = JSON.stringify([sel, s.wskrs.map((q) => [q.n, q.mode, q.target])]);
    if (next !== sig) {
      sig = next;
      tabs.replaceChildren(...s.wskrs.map((q) => el('button', { class: 'btn chip' + (q.n === sel ? ' on' : ''), text: wskrName(q), onclick: () => { sel = q.n; sig = ''; update(); } })));
      const poi = w && w.target != null ? s.pois.find((p) => p.id === w.target) : null;
      info.replaceChildren(...(w ? [el('h3', { text: `${wskrName(w)} (WSKR ${w.n})` }), el('p', { style: 'color:var(--dim);margin:0.3rem 0', text: `${w.mode === 'escort' ? 'Holding formation' : w.mode === 'recall' ? 'Returning to the bay' : `Investigating ${poi ? poi.name : 'a contact'}`}. ${WSKR_PERKS[w.n].text}` }),
        el('button', { class: 'btn chip', text: 'Recall', disabled: w.mode === 'recall', onclick: () => { sim.recallWskr(w.n); toast(`${wskrName(w)} recalled`); sig = ''; update(); } })]
        : [el('div', { class: 'empty', text: 'No WSKR is out. Launch one from the Launch Bay or the Sensors station.' })]));
    }
    viewBox.hidden = !w;
    if (w) cv.update();
  }
  update();
  return { update, destroy() { cv.destroy(); } };
}
