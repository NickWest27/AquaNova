// Docking and undocking: a short scripted sequence, then the ship is held at the berth. Used by the Helm and the bridge.
import { sim } from './sim.js';
import { toast } from './util.js';
import { say } from './notify.js';
import { liveNav } from './persist.js';
import { sfx } from './audio.js';

let busy = false;
// Crew calls out each step. On the bridge that shows on the upper display; elsewhere one chirp and one short message.
// A step is its text, or [text, sound] (sfx.js): the clamps and shore power are heard as they happen (owner, 2026-11-27).
const sequence = (steps, done) => {
  busy = true; let i = 0;
  const next = () => { if (i >= steps.length) { busy = false; done(); return; } const st = steps[i++], [text, snd] = Array.isArray(st) ? st : [st]; say('helm', text); if (snd) sfx(snd); setTimeout(next, snd === 'dockClamps' ? 2200 : 1100); };
  next();
};

/** onChange runs after the ship docks or undocks (the Helm resets its throttle lever there). */
export function toggleDock(onChange = () => {}) {
  const s = sim.s;
  if (busy) return;
  if (s.docked) return sequence([['Disconnecting shore power…', 'shorePower'], ['Releasing the clamps…', 'clampRelease'], 'Clear of the berth.'], () => { s.docked = false; liveNav(); say('helm', 'Undocked. We are clear of the berth, Captain.'); onChange(); });
  if (!sim.canDock()) { say('helm', s.at && s.at.type === 'dock' ? 'Slow to 1.5 knots and come to the surface to dock, Captain.' : 'We need to be at a dock first, Captain.', 'error'); return; }
  sequence(['Aligning with the berth…', ['Matching speed…', 'dockBump'], ['Latching the clamps…', 'dockClamps'], ['Connecting shore power…', 'shorePower']], () => { s.docked = true; s.throttle = 0; s.speed = 0; liveNav(); say('helm', 'Docked. Shore power is charging the ship.'); onChange(); });
}
