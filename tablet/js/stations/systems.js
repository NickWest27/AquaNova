import { sim } from '../sim.js';
import { meter, } from '../ui.js';
import { el } from '../util.js';

export function mount(body) {
  const banner = el('div', { class: 'sys-banner ok', text: 'ALL SYSTEMS NOMINAL' });
  const m = { bat: meter('Battery', 'bat'), pow: meter('Power draw', 'pow'), o2: meter('Oxygen', 'o2'), co2: meter('CO₂', 'co2'), hull: meter('Hull integrity', 'hull'), pres: meter('Pressure vs rating', 'pres') };
  const sw = (key, label) => el('button', { class: 'btn chip on', text: label + ' ON', onclick: (e) => { sim.s[key] = !sim.s[key]; e.currentTarget.textContent = label + (sim.s[key] ? ' ON' : ' OFF'); e.currentTarget.classList.toggle('on', sim.s[key]); } });
  const grid = el('div', { class: 'sys-grid' },
    el('div', { class: 'card sys-card' }, el('h3', { text: 'Power' }), m.bat.root, m.pow.root),
    el('div', { class: 'card sys-card' }, el('h3', { text: 'Life support' }), m.o2.root, m.co2.root),
    el('div', { class: 'card sys-card' }, el('h3', { text: 'Hull' }), m.hull.root, m.pres.root),
    el('div', { class: 'card sys-card' }, el('h3', { text: 'Switches' }), el('div', { class: 'row' }, sw('lights', 'Lights'), sw('sonar', 'Sonar'))));
  body.style.flexDirection = 'column';
  body.append(banner, grid);
  function update() {
    const s = sim.s;
    m.bat.set(s.battery, Math.round(s.battery) + '%'); m.pow.set(s.power, Math.round(s.power) + ' kW', 30, 15, true);
    m.o2.set(s.oxygen, Math.round(s.oxygen) + '%'); m.co2.set(s.co2 * 20, s.co2.toFixed(2) + '%', 40, 20, true);
    m.hull.set(s.hull, Math.round(s.hull) + '%'); m.pres.set(s.depth / 60, Math.round(s.depth / 10 + 1) + ' bar', 60, 20, true);
    const bad = s.battery < 15 || s.oxygen < 15 || s.hull < 40, warn = s.battery < 30 || s.oxygen < 30 || s.hull < 80;
    const cls = bad ? 'bad' : warn ? 'warn' : 'ok';
    banner.className = 'sys-banner ' + cls; banner.textContent = bad ? 'CRITICAL: RETURN TO DOCK' : warn ? 'CAUTION: CHECK SYSTEMS' : 'ALL SYSTEMS NOMINAL';
  }
  update();
  return { update, destroy() {} };
}
