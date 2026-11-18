import { sim, toward } from '../sim.js';
import { createND } from '../nd.js';
import { el, pad, toast } from '../util.js';

export function mount(body) {
  body.classList.add('nav-st');
  const wrap = el('div', { class: 'nd-wrap' }, el('div', { class: 'nd-hint', text: 'Tap a marker to pick a destination' }));
  const rPos = el('div', { class: 'num' }), rHdg = el('div', { class: 'num' }), rSpd = el('div', { class: 'num' }), rDep = el('div', { class: 'num' });
  const rc = (l, n, w) => el('div', { class: `card ${w || ''}` }, el('div', { class: 'lbl', text: l }), n);
  const rangeTxt = el('div', { class: 'num', text: '2 nm' });
  const pick = el('div', { class: 'card wpt-card' });
  const side = el('div', { class: 'nav-side' },
    el('div', { class: 'readouts' }, rc('Heading', rHdg), rc('Speed', rSpd), rc('Depth', rDep), rc('Range', rangeTxt)),
    pick);
  body.append(wrap, side);
  let nd, sel = null;

  const renderPick = () => {
    pick.replaceChildren();
    if (!sel) { pick.append(el('div', { class: 'lbl', text: 'Destination' }), el('p', { class: 'empty', text: sim.s.wpt ? 'Course set: ' + sim.s.wpt.name : 'None selected' }), ...(sim.s.wpt ? [el('button', { class: 'btn warn', text: 'Cancel course', onclick: () => { sim.stop(); renderPick(); } })] : [])); return; }
    const t = toward(sim.s, sel);
    pick.append(
      el('div', { class: 'lbl', text: sel.type }), el('div', { class: 'num wpt', text: sel.name }),
      el('p', { text: sel.text, style: 'margin:0.5rem 0;color:var(--dim)' }),
      el('div', { class: 'num' }, t.nm.toFixed(2), el('small', { text: `nm  brg ${pad(t.brg)}°` })),
      el('div', { class: 'row', style: 'margin-top:0.7rem' },
        el('button', { class: 'btn primary grow', text: 'Go there', onclick: () => { sim.setWpt(sel); sim.setThrottle(0.5); toast('Course set to ' + sel.name); renderPick(); } }),
        el('button', { class: 'btn', text: 'Clear', onclick: () => { sel = null; nd.sel = null; nd.draw(); renderPick(); } })));
  };
  const zoomRow = el('div', { class: 'range-row card' },
    el('button', { class: 'btn sq', text: '−', 'aria-label': 'Zoom out', onclick: () => { rangeTxt.textContent = nd.zoom(1) + ' nm'; } }),
    el('div', { class: 'lbl', text: 'Map range' }),
    el('button', { class: 'btn sq', text: '+', 'aria-label': 'Zoom in', onclick: () => { rangeTxt.textContent = nd.zoom(-1) + ' nm'; } }));
  side.insertBefore(zoomRow, pick);

  requestAnimationFrame(() => { nd = createND(wrap, { onPick: (p) => { sel = p; renderPick(); } }); renderPick(); update(); });
  function update() {
    const s = sim.s;
    rHdg.textContent = pad(s.heading) + '°'; rSpd.innerHTML = `${s.speed.toFixed(1)}<small>kt</small>`; rDep.innerHTML = `${Math.round(s.depth)}<small>m</small>`;
    nd && nd.redraw();
  }
  return { update, destroy() { nd && nd.destroy(); } };
}
