// The standard target readout (owner, 2026-11-25): an arrow, then NAME, BRG, RNG, DEP and SPD stacked. Used wherever a craft or
// target is shown with a bearing and a distance: the WSKR and Remora views (Aqua Nova and the target), the Tern on the Launch Bay page.
// set({ name, brg, nm, depth, kt, rel }): brg is the true bearing to it; rel turns the arrow (relative to the viewer's heading; brg if left out).
// A value that is not known shows a dash. No target: set(null, 'NO CONTACT').
import { el } from './util.js';

const pad3 = (n) => String(Math.round(n) % 360).padStart(3, '0');
export const fmtNm = (nm) => (nm < 10 ? nm.toFixed(2) : nm.toFixed(1));

export function readout(cls = '') {
  const arrow = el('span', { class: 'ro-arrow', text: '▲' }), name = el('b', { class: 'ro-name' });
  const line = (k) => { const v = el('span'); return { row: el('div', { class: 'ro-row' }, el('i', { text: k }), v), v }; };
  const brg = line('BRG'), rng = line('RNG'), dep = line('DEP'), spd = line('SPD');
  const box = el('div', { class: 'ro ' + cls }, arrow, name, brg.row, rng.row, dep.row, spd.row);
  return {
    box,
    set(t, label, none = 'NO CONTACT') {
      name.textContent = label || (t && t.name) || '';
      if (!t) { arrow.style.visibility = 'hidden'; brg.v.textContent = none; rng.v.textContent = dep.v.textContent = spd.v.textContent = '—'; return; }
      arrow.style.visibility = 'visible'; arrow.style.transform = `rotate(${t.rel != null ? t.rel : t.brg || 0}deg)`;
      brg.v.textContent = t.brg != null ? pad3(t.brg) + '°' : '—';
      rng.v.textContent = t.nm != null ? fmtNm(t.nm) + ' nm' : '—';
      dep.v.textContent = t.depth == null ? '—' : t.depth === 'surface' ? 'SURFACE' : Math.round(t.depth) + ' m';
      spd.v.textContent = t.kt != null ? t.kt.toFixed(1) + ' kt' : '—';
    },
  };
}
