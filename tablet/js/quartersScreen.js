// The wall screen in the Captain's quarters: it cycles through pages that keep the Captain informed off watch.
// NAV chart, forward view (synthetic vision once researched), passive sonar, WSKRs, ship status. A tap shows the next page.
// Display only: nothing on it gives orders (the bridge and the communicator do that).
import { sim, toward } from './sim.js';
import { el } from './util.js';
import { createND } from './nd.js';
import { createSynth } from './synth.js';
import { createSnrView } from './sonarView.js';
import { GATES_ON } from './unlocks.js';
import { research } from './science.js';
import * as E from './engineering.js';

export const QS_PAGE_S = 10;   // seconds each page stays up
const pad3 = (n) => String(Math.round(((n % 360) + 360) % 360)).padStart(3, '0');
const synthOk = () => !GATES_ON || research.has('synthetic-view');

export function createQuartersScreen(W, H) {
  const root = el('div', { class: 'qs' });
  const title = el('b', { class: 'qs-title' }), dots = el('span', { class: 'qs-dots' });
  const body = el('div', { class: 'qs-body' });
  root.append(el('div', { class: 'qs-head' }, title, dots), body);
  root.style.width = W + 'px'; root.style.height = H + 'px';

  // pages: { id, title, node, update, ok() }
  const row = (k, v, cls = '') => `<div class="qs-r ${cls}"><span>${k}</span><b>${v}</b></div>`;
  const pages = [];
  // NAV: the chart with the ship's numbers beside it
  { const wrap = el('div', { class: 'qs-nd' }), info = el('div', { class: 'qs-info' }); const node = el('div', { class: 'qs-page qs-nav' }, wrap, info);
    let nd = null;
    pages.push({ id: 'nav', title: 'NAVIGATION', node, ok: () => true, update() {
      if (!nd) { nd = createND(wrap, { stage: true, units: 1.1, rings: true }); nd.setRange(8); }
      nd.redraw();
      const s = sim.s, w = s.wpt, t = w ? toward(s, w) : null;
      info.innerHTML = row('SPD', s.speed.toFixed(1) + ' KT') + row('DEP', Math.round(s.depth) + ' M') + row('HDG', pad3(s.heading) + '°') + row('DEST', w ? w.name : 'NONE') + (t ? row('DIST', t.nm.toFixed(1) + ' NM') : '');
    } }); }
  // VIEW: synthetic vision of the sea floor ahead
  { const node = el('div', { class: 'qs-page qs-view' }); let sy = null, last = 0;
    pages.push({ id: 'view', title: 'SYNTHETIC VISION', node, ok: synthOk, update() {
      if (!sy) sy = createSynth(node);
      if (Date.now() - last < 250) return; last = Date.now();
      const s = sim.s; sy.draw({ lat: s.lat, lon: s.lon, heading: s.heading, depth: s.depth, speed: s.speed });
    } }); }
  // SONAR: the passive sonar picture and its contact list
  { const node = el('div', { class: 'qs-page qs-snr' }); let v = null;
    pages.push({ id: 'snr', title: 'SONAR', node, ok: () => true, update() {
      if (!v) { v = createSnrView({ bbtn: (t, f, c = '') => el('button', { class: 'bb ' + c, text: t, onclick: f }) }).make(true); node.append(v.m); }
      v.update();
    } }); }
  // WSKRS: where each drone is and how it is doing
  { const node = el('div', { class: 'qs-page qs-wk' });
    pages.push({ id: 'wskr', title: 'WSKRS', node, ok: () => true, update() {
      const s = sim.s, ws = (s.wskrs || []).filter((w) => !w.dead);
      node.innerHTML = ws.length ? ws.map((w) => { const t = toward(s, w); return `<div class="qs-wr"><b>WSKR ${w.n}</b><span>${String(w.mode || '').toUpperCase()}</span><span>BRG ${pad3(t.brg)}° ${t.nm.toFixed(1)} NM</span><span>BAT ${Math.round(w.bat)}%</span></div>`; }).join('')
        : '<div class="qs-none">ALL WSKRS IN THEIR BAYS</div>';
    } }); }
  // SHIP: the numbers the Captain checks before sleeping
  { const node = el('div', { class: 'qs-page qs-ship' });
    pages.push({ id: 'ship', title: 'SHIP STATUS', node, ok: () => true, update() {
      const s = sim.s, e = E.eng(), fusion = E.fusionOk() ? 'ONLINE' : e.on.fusion ? 'FAULT' : 'STANDBY', flood = e.leak.fwd || e.leak.aft;
      const worst = Object.entries(e.health).sort((a, b) => a[1] - b[1])[0];
      node.innerHTML = `<div class="qs-col">${row('FUSION', fusion, fusion === 'ONLINE' ? 'ok' : 'bad')}${row('BATTERY', Math.round(s.battery) + '%', s.battery < 20 ? 'bad' : '')}${row('HULL', Math.round(s.hull ?? 100) + '%', (s.hull ?? 100) < 50 ? 'bad' : '')}${row('REPAIRS', e.repairs.length ? e.repairs.length + ' TEAM' + (e.repairs.length > 1 ? 'S' : '') : 'NONE')}</div>`
        + `<div class="qs-col">${row('O2', Math.round(s.oxygen) + '%', s.oxygen < 90 ? 'bad' : '')}${row('CO2', s.co2.toFixed(2) + '%', s.co2 > 1 ? 'bad' : '')}${row('CABIN', e.cabin.toFixed(1) + '°C')}${row(e.fire ? 'FIRE' : flood ? 'FLOOD' : 'ALARMS', e.fire || flood ? 'YES' : e.general ? 'GENERAL' : 'NONE', e.fire || flood || e.general ? 'bad' : 'ok')}</div>`
        + `<div class="qs-col">${row('WORST', worst && worst[1] < 100 ? worst[0].toUpperCase() + ' ' + Math.round(worst[1]) + '%' : 'ALL 100%', worst && worst[1] < 50 ? 'bad' : '')}${row('SPEED', s.cruise ? 'SUPER CRUISE' : s.speed.toFixed(1) + ' KT')}${row('DEPTH', Math.round(s.depth) + ' M')}</div>`;
    } }); }

  for (const p of pages) { p.node.hidden = true; body.append(p.node); }
  let cur = -1, shownAt = 0;
  const live = () => pages.filter((p) => p.ok());
  function show(i) {
    const L = live(); if (!L.length) return;
    cur = ((i % L.length) + L.length) % L.length;
    for (const p of pages) p.node.hidden = p !== L[cur];
    title.textContent = L[cur].title;
    dots.innerHTML = L.map((p, k) => `<i class="${k === cur ? 'on' : ''}"></i>`).join('');
    shownAt = Date.now(); L[cur].update();
  }
  const tap = el('button', { class: 'qs-tap', 'aria-label': 'Next page on the quarters screen', onclick: () => show(cur + 1) });
  root.append(tap);
  return {
    root,
    /** Called every tick while the Captain is in the quarters. */
    update() {
      if (cur < 0) { show(0); return; }
      if (Date.now() - shownAt >= QS_PAGE_S * 1000) { show(cur + 1); return; }
      const L = live(); if (L[cur]) L[cur].update();
    },
    next: () => show(cur + 1),
    page: () => (live()[cur] || {}).id,
  };
}
