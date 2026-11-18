// Docking and undocking: a short scripted sequence, then the ship is held at the berth. Used by the Helm and the bridge.
import { sim } from './sim.js';
import { modal, toast } from './util.js';
import { liveNav } from './persist.js';

const sequence = (title, steps, done) => {
  const line = document.createElement('p'); line.style.minHeight = '2.6rem';
  const close = modal({ title, body: line, actions: [] });
  let i = 0;
  const next = () => { if (i >= steps.length) { close(); done(); return; } line.textContent = steps[i++]; setTimeout(next, 1100); };
  next();
};

/** onChange runs after the ship docks or undocks (the Helm resets its throttle lever there). */
export function toggleDock(onChange = () => {}) {
  const s = sim.s;
  if (s.docked) return sequence('Undocking', ['Disconnecting shore power…', 'Releasing the clamps…', 'Clear of the berth.'], () => { s.docked = false; liveNav(); toast('Undocked'); onChange(); });
  if (!sim.canDock()) { toast(s.at && s.at.type === 'dock' ? 'Slow to 1.5 knots and come to the surface to dock' : 'Move to a dock to dock', 'error'); return; }
  sequence('Docking', ['Aligning with the berth…', 'Matching speed…', 'Latching the clamps…', 'Connecting shore power…'], () => { s.docked = true; s.throttle = 0; s.speed = 0; liveNav(); toast('Docked. Shore power is charging the ship.'); onChange(); });
}
