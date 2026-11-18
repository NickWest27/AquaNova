// Touch controls: vertical lever, heading dial, meters.
import { el, clamp, drag, pad, norm360 } from './util.js';

/** Vertical lever. value 0..1 (1 at top). */
export function createLever({ ticks = [], onInput, format }) {
  const fill = el('div', { class: 'lever-fill' });
  const act = el('div', { class: 'lever-act' });
  const thumb = el('div', { class: 'lever-thumb' });
  const track = el('div', { class: 'lever-track' }, fill, act, thumb);
  const scale = el('div', { class: 'lever-scale' }, ticks.map((t) => el('span', { text: t.label, 'data-v': t.v })));
  const root = el('div', { class: 'lever' }, scale, track);
  let value = 0;
  const THUMB = 0.0; // set after layout
  function place(el_, v, centre) {
    const H = track.clientHeight; const th = centre ? 0 : thumb.offsetHeight;
    el_.style.top = (1 - v) * (H - th) + 'px';
  }
  function layout() {
    place(thumb, value);
    fill.style.top = thumb.offsetTop + thumb.offsetHeight / 2 + 'px'; fill.style.bottom = '0';
    scale.querySelectorAll('span').forEach((s) => { s.style.top = (1 - +s.dataset.v) * (track.clientHeight - thumb.offsetHeight) + thumb.offsetHeight / 2 + 'px'; });
  }
  const setFromPointer = (e) => {
    const r = track.getBoundingClientRect(); const th = thumb.offsetHeight;
    const v = 1 - (e.clientY - r.top - th / 2) / (r.height - th);
    value = clamp(v, 0, 1); layout(); onInput && onInput(value);
  };
  drag(root, { start: setFromPointer, move: setFromPointer });
  const api = {
    root,
    set(v) { value = clamp(v, 0, 1); layout(); },
    setActual(v) { act.style.top = (1 - clamp(v, 0, 1)) * track.clientHeight - 2 + 'px'; },
    layout,
  };
  new ResizeObserver(layout).observe(track);
  return api;
}

/** Heading dial as one SVG. Drag anywhere on it to set a heading. */
export function createDial({ onInput }) {
  const NS = 'http://www.w3.org/2000/svg';
  const mk = (t, a = {}) => { const n = document.createElementNS(NS, t); for (const k in a) n.setAttribute(k, a[k]); return n; };
  const svg = mk('svg', { viewBox: '-120 -120 240 240' });
  svg.append(mk('circle', { r: 112, fill: '#061523', stroke: 'rgba(100,255,218,0.4)', 'stroke-width': 3 }));
  for (let d = 0; d < 360; d += 10) {
    const big = d % 30 === 0, a = (d * Math.PI) / 180;
    svg.append(mk('line', { x1: Math.sin(a) * (big ? 92 : 100), y1: -Math.cos(a) * (big ? 92 : 100), x2: Math.sin(a) * 108, y2: -Math.cos(a) * 108, stroke: big ? '#64ffda' : '#4c6a85', 'stroke-width': big ? 3 : 2 }));
    if (big) { const t = mk('text', { x: Math.sin(a) * 78, y: -Math.cos(a) * 78 + 6, 'text-anchor': 'middle', fill: '#8fa6bd', 'font-size': 17, 'font-weight': 700, 'font-family': 'ui-monospace, Menlo, monospace' }); t.textContent = d === 0 ? 'N' : d === 90 ? 'E' : d === 180 ? 'S' : d === 270 ? 'W' : String(d / 10); svg.append(t); }
  }
  const tgt = mk('polygon', { points: '0,-112 -9,-92 9,-92', fill: '#ffb020' });
  const ship = mk('polygon', { points: '0,-58 22,40 0,24 -22,40', fill: '#3ddc84', stroke: '#04101f', 'stroke-width': 3 });
  const read = mk('text', { x: 0, y: 8, 'text-anchor': 'middle', fill: '#fff', 'font-size': 30, 'font-weight': 800, 'font-family': 'ui-monospace, Menlo, monospace' });
  svg.append(tgt, ship, read);
  const root = el('div', { class: 'dial' }, svg);
  const fromPointer = (e) => {
    const r = svg.getBoundingClientRect();
    const a = Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2)));
    onInput && onInput(Math.round(norm360((a * 180) / Math.PI)));
  };
  drag(root, { start: fromPointer, move: fromPointer });
  return {
    root,
    update(heading, target) {
      ship.setAttribute('transform', `rotate(${heading})`);
      tgt.setAttribute('transform', `rotate(${target})`);
      read.textContent = pad(heading) + '°';
    },
  };
}

export function meter(label, key) {
  const val = el('span', { text: '--' });
  const bar = el('i');
  const root = el('div', { class: 'meter' }, el('div', { class: 'top' }, el('span', { text: label }), val), el('div', { class: 'bar' }, bar));
  return {
    root, key,
    set(pct, text, warnBelow = 30, badBelow = 15, invert = false) {
      const p = clamp(pct, 0, 100);
      bar.style.width = p + '%';
      val.textContent = text;
      const bad = invert ? p > 100 - badBelow : p < badBelow, warn = invert ? p > 100 - warnBelow : p < warnBelow;
      root.className = 'meter ' + (bad ? 'bad' : warn ? 'warn' : '');
    },
  };
}

export const ICONS = {
  nav: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/></svg>',
  helm: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>',
  sys: '<svg viewBox="0 0 24 24"><path d="M13 2L5 14h6l-1 8 8-12h-6z"/></svg>',
  comms: '<svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z"/></svg>',
  log: '<svg viewBox="0 0 24 24"><path d="M5 3h12a2 2 0 012 2v16H7a2 2 0 01-2-2z"/><path d="M9 8h6M9 12h6"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>',
  quarters: '<svg viewBox="0 0 24 24"><path d="M3 11l9-7 9 7v9H3z"/><path d="M10 20v-6h4v6"/></svg>',
};
