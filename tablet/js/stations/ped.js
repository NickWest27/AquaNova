// PED (personal electronic device): ship status, missions, findings, settings.
import { el, modal, pad } from '../util.js';
import { sim } from '../sim.js';
import { gameState } from '../persist.js';
import { DEBUG } from '../../../utils/log.js';

export function mount(body, ctx) {
  body.classList.add('more-st');
  const tabs = el('div', { class: 'tabs' }), tb = el('div', { class: 'tab-body' });
  body.append(tabs, tb);
  let cur = 'status', refs = {};
  const stat = (label, key) => { const n = el('div', { class: 'num' }); refs[key] = n; return el('div', { class: 'card' }, el('div', { class: 'lbl', text: label }), n); };
  const views = {
    status() {
      refs = {};
      return [el('div', { class: 'readouts', style: 'grid-template-columns:repeat(auto-fit,minmax(13rem,1fr))' },
        stat('Location', 'loc'), stat('Position', 'pos'), stat('Depth', 'dep'), stat('Heading', 'hdg'), stat('Speed', 'spd'), stat('Battery', 'bat'), stat('Oxygen', 'o2'), stat('Hull', 'hull'))];
    },
    missions() {
      const obj = ctx.objectives();
      return obj.length ? obj.map((o) => el('div', { class: `card task ${o.done ? 'done' : ''}` }, el('span', { class: 'dot' }), el('span', { text: o.text }))) : [el('div', { class: 'empty', text: 'No active missions.' })];
    },
    findings() {
      const f = gameState.getProperty('mission.discoveries') || [];
      return f.length ? f.map((d) => el('div', { class: 'card' }, el('h3', { text: d.name || d.title || 'Finding' }), el('p', { text: d.description || d.text || '' }))) : [el('div', { class: 'empty', text: 'No findings yet. Samples and scans will be filed here.' })];
    },
    settings() {
      const zoomBtn = (t, d) => el('button', { class: 'btn', text: t, onclick: () => ctx.zoom(d) });
      return [
        el('div', { class: 'card setting' }, el('div', { class: 'lbl', text: 'Text size' }), el('div', { class: 'row' }, zoomBtn('Smaller', -0.1), zoomBtn('Reset', 0), zoomBtn('Larger', 0.1))),
        el('div', { class: 'card setting' }, el('div', { class: 'lbl', text: 'Debug' }), el('p', { text: DEBUG ? 'Debug logging is on. Triple-tap the top-left corner to see the log.' : 'Triple-tap the top-left corner to see the log panel. Add ?debug=1 to the address for routine logs.' })),
        el('div', { class: 'card setting' }, el('div', { class: 'lbl', text: 'New game' }), el('p', { text: 'Erases every logbook and save on this device, then restarts the tutorial.' }),
          el('button', { class: 'btn danger', text: 'Erase and restart', onclick: () => modal({ title: 'Erase all saves?', body: el('p', { text: 'This cannot be undone. Export your logbook first if you want to keep it.' }),
            actions: [{ label: 'Cancel' }, { label: 'Erase', kind: 'danger', primary: true, run: () => { try { localStorage.removeItem('aquaNovaBookshelf'); } catch (e) { /* ignore */ } location.reload(); } }] }) })),
      ];
    },
  };
  const TITLES = { status: 'Status', missions: 'Missions', findings: 'Findings', settings: 'Settings' };
  function render() {
    tabs.replaceChildren(...Object.keys(views).map((k) => el('button', { class: `btn chip ${k === cur ? 'on' : ''}`, text: TITLES[k], onclick: () => { cur = k; render(); } })));
    tb.replaceChildren(...views[cur]());
    update();
  }
  function update() {
    if (cur !== 'status' || !refs.loc) return;
    const s = sim.s;
    refs.loc.textContent = s.at ? s.at.name : 'Open water'; refs.loc.style.fontSize = '1.2rem';
    refs.pos.innerHTML = `${s.lat.toFixed(3)}°N<br>${Math.abs(s.lon).toFixed(3)}°W`; refs.pos.style.fontSize = '1.3rem';
    refs.dep.innerHTML = `${Math.round(s.depth)}<small>m</small>`; refs.hdg.textContent = pad(s.heading) + '°'; refs.spd.innerHTML = `${s.speed.toFixed(1)}<small>kt</small>`;
    refs.bat.textContent = Math.round(s.battery) + '%'; refs.o2.textContent = Math.round(s.oxygen) + '%'; refs.hull.textContent = Math.round(s.hull) + '%';
  }
  render();
  return { update, destroy() {} };
}
