import { el, modal } from '../util.js';
import { DEBUG } from '../../../utils/log.js';

export function mount(body, ctx) {
  body.classList.add('more-st');
  const tabs = el('div', { class: 'tabs' }), tb = el('div', { class: 'tab-body' });
  body.append(tabs, tb);
  let cur = 'mission';
  const views = {
    mission() {
      const obj = ctx.objectives();
      return obj.length ? obj.map((o) => el('div', { class: `card task ${o.done ? 'done' : ''}` }, el('span', { class: 'dot' }), el('span', { text: o.text }))) : [el('div', { class: 'empty', text: 'No active objectives.' })];
    },
    settings() {
      const zoomBtn = (t, d) => el('button', { class: 'btn', text: t, onclick: () => { ctx.zoom(d); } });
      return [
        el('div', { class: 'card setting' }, el('div', { class: 'lbl', text: 'Text size' }), el('div', { class: 'row' }, zoomBtn('Smaller', -0.1), zoomBtn('Reset', 0), zoomBtn('Larger', 0.1))),
        el('div', { class: 'card setting' }, el('div', { class: 'lbl', text: 'Debug' }), el('p', { text: DEBUG ? 'Debug logging is on. Triple-tap the top-left corner to see the log.' : 'Triple-tap the top-left corner to see the log panel. Add ?debug=1 to the address for routine logs.' })),
        el('div', { class: 'card setting' }, el('div', { class: 'lbl', text: 'New game' }), el('p', { text: 'Erases every logbook and save on this device, then restarts the tutorial.' }),
          el('button', { class: 'btn danger', text: 'Erase and restart', onclick: () => modal({ title: 'Erase all saves?', body: el('p', { text: 'This cannot be undone. Export your logbook first if you want to keep it.' }),
            actions: [{ label: 'Cancel' }, { label: 'Erase', kind: 'danger', primary: true, run: () => { try { localStorage.removeItem('aquaNovaBookshelf'); } catch (e) { /* ignore */ } location.reload(); } }] }) })),
      ];
    },
    about() { return [el('div', { class: 'card' }, el('h3', { text: 'Aqua Nova DSV: tablet edition' }), el('p', { text: 'Touch-first bridge. The scene is one image; every control is a large tap target; the simulation sleeps when the app is hidden.' }))]; },
  };
  function render() {
    tabs.replaceChildren(...Object.keys(views).map((k) => el('button', { class: `btn chip ${k === cur ? 'on' : ''}`, text: k, onclick: () => { cur = k; render(); } })));
    tb.replaceChildren(...views[cur]());
  }
  render();
  return { update() {}, destroy() {} };
}
