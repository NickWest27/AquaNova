import { sim, MAX_SPEED } from '../sim.js';
import { createLever, createDial } from '../ui.js';
import { el, pad, modal, toast } from '../util.js';
import { liveNav } from '../persist.js';

export function mount(body) {
  body.classList.add('helm-st');
  const thr = createLever({ ticks: [{ v: 1, label: 'FULL' }, { v: 0.5, label: 'HALF' }, { v: 0, label: 'STOP' }], onInput: (v) => { sim.setThrottle(Math.round(v * 20) / 20); sim.s.wpt = null; } });
  const dep = createLever({ ticks: [{ v: 1, label: '0' }, { v: 0.5, label: '3000' }, { v: 0, label: '6000' }], onInput: (v) => sim.setDepth(Math.round((1 - v) * 600) * 10) });
  const dial = createDial({ onInput: (h) => { sim.setHeading(h); sim.s.wpt = null; } });
  const spd = el('div', { class: 'num' }), dp = el('div', { class: 'num' });
  const card = (t, read, lever) => el('div', { class: 'helm-col lever-col' }, el('div', { class: 'card lever-card' }, el('div', { class: 'big-read' }, el('div', { class: 'lbl', text: t }), read), lever.root));
  const presets = el('div', { class: 'helm-presets' },
    [['Stop', () => { sim.stop(); thr.set(0); }], ['Surface', () => { sim.setDepth(0); dep.set(1); }], ['Dive 500', () => { sim.setDepth(500); dep.set(1 - 500 / 6000); }],
     ['Port 10°', () => sim.setHeading(sim.s.targetHeading - 10)], ['Stbd 10°', () => sim.setHeading(sim.s.targetHeading + 10)]]
      .map(([t, fn]) => el('button', { class: 'btn chip', text: t, onclick: fn })));
  // docking: a short scripted sequence, then the ship is held at the berth
  const sequence = (title, steps, done) => {
    const line = el('p', { style: 'min-height:2.6rem' });
    const close = modal({ title, body: line, actions: [] });
    let i = 0;
    const next = () => { if (i >= steps.length) { close(); done(); return; } line.textContent = steps[i++]; setTimeout(next, 1100); };
    next();
  };
  const dockBtn = el('button', { class: 'btn chip', text: 'Dock', onclick: () => {
    const s = sim.s;
    if (s.docked) return sequence('Undocking', ['Disconnecting shore power…', 'Releasing the clamps…', 'Clear of the berth.'], () => { s.docked = false; liveNav(); toast('Undocked'); });
    if (!sim.canDock()) { toast(s.at && s.at.type === 'dock' ? 'Slow to 1.5 knots and come to the surface to dock' : 'Move to a dock to dock', 'error'); return; }
    sequence('Docking', ['Aligning with the berth…', 'Matching speed…', 'Latching the clamps…', 'Connecting shore power…'], () => { s.docked = true; s.throttle = 0; s.speed = 0; thr.set(0); liveNav(); toast('Docked. Shore power is charging the ship.'); });
  } });
  presets.append(dockBtn);
  body.append(card('Throttle', spd, thr), el('div', { class: 'helm-col dial-col' }, dial.root, presets), card('Depth', dp, dep));
  requestAnimationFrame(() => { thr.set(sim.s.throttle); dep.set(1 - sim.s.targetDepth / 6000); update(); });
  function update() {
    const s = sim.s;
    spd.innerHTML = `${s.speed.toFixed(1)}<small>kt</small>`; dp.innerHTML = `${Math.round(s.depth)}<small>m</small>`;
    dial.update(s.heading, s.targetHeading);
    body.classList.toggle('docked-st', !!s.docked);
    const label = s.docked ? 'Undock' : 'Dock'; if (dockBtn.textContent !== label) dockBtn.textContent = label;
    dockBtn.classList.toggle('on', s.docked || sim.canDock());
    thr.setActual(s.speed / MAX_SPEED); dep.setActual(1 - s.depth / 6000);
  }
  return { update, destroy() {} };
}
