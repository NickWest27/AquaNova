// Docking and undocking: a short scripted sequence, then the ship is held at the berth. Used by the Helm and the bridge.
import { sim } from './sim.js';
import { toast } from './util.js';
import { say } from './notify.js';
import { liveNav } from './persist.js';
import { sfx } from './audio.js';

let busy = false;
// One message for the whole sequence (owner, 2026-11-27: not a line per step). Marcus says it as it starts; the sounds play at their steps
// (sfx.js: clamps, shore power), and the ship docks or undocks when the last step is done.
const sequence = (text, sounds, done) => {
  busy = true; say('helm', text);
  let t = 0; for (const [at, snd] of sounds) { setTimeout(() => sfx(snd), at); t = Math.max(t, at); }
  setTimeout(() => { busy = false; done(); }, t + 1500);
};

/** onChange runs after the ship docks or undocks (the Helm resets its throttle lever there). */
export function toggleDock(onChange = () => {}) {
  const s = sim.s;
  if (busy) return;
  if (s.docked) return sequence('Undocking, Captain: disconnecting shore power and releasing the clamps.', [[200, 'shorePower'], [1500, 'clampRelease']], () => { s.docked = false; liveNav(); onChange(); });
  if (!sim.canDock()) { say('helm', s.at && s.at.type === 'dock' ? 'Slow to 1.5 knots and come to the surface to dock, Captain.' : 'We need to be at a dock first, Captain.', 'error'); return; }
  sequence('Docking, Captain: bringing her alongside, latching the clamps and connecting shore power. The ship will charge at the berth.', [[200, 'dockBump'], [1200, 'dockClamps'], [4000, 'shorePower']], () => { s.docked = true; s.throttle = 0; s.speed = 0; liveNav(); onChange(); });
}
