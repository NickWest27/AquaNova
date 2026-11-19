// Crew notices. On the bridge they appear on the upper display only. Anywhere else (a station, quarters, the walkway)
// the relevant crew member calls in: a communicator chirp and a short message under the top edge.
// Anti-spam: the chirp sounds at most once every 20 s; messages from the same person within 8 s replace each other.
import { fill } from './player.js';
import { viewProbe, consoleLine } from './util.js';
import { gameState } from './persist.js';
import { chirp, ping } from './audio.js';

const CREW_ID = { helm: 'helm', aria: 'executiveOfficer', sensors: 'sensors', engineering: 'engineering', comms: 'communications', science: 'science' };
const FALLBACK = { helm: ['Helm', 'Helm officer'], aria: ['ARIA', 'Executive officer'], sensors: ['Sensors', 'Sensors officer'], engineering: ['Engineering', 'Engineer'], comms: ['Comms', 'Communications'], science: ['Science', 'Science officer'] };
export const stats = { chirps: 0, shown: 0 };
let lastChirp = -1e9, lastPing = -1e9;

// Held messages: what a crew member said that the Captain may have missed. Kept until the Captain reads it in the communicator.
const held = new Map();   // crew id -> [{ text, at }]
const emitChange = () => document.dispatchEvent(new CustomEvent('inbox-change'));
const waiting = () => ((gameState.getProperty('progress.decisions') || {}).pending || []).length;   // decisions ARIA is waiting on
export const unreadCount = () => [...held.values()].reduce((n, l) => n + l.length, 0) + waiting();
export const unreadFor = (id) => (held.get(id) || []).length + (id === 'executiveOfficer' ? waiting() : 0);
/** Returns and clears the held messages for one crew member. */
export function takeHeld(id) { const l = held.get(id) || []; held.delete(id); if (l.length) emitChange(); return l.map((m) => m.text); }
export function clearHeld() { held.clear(); emitChange(); }

// The conversation with each crew member: what they said (including running notes such as the undocking sequence) and what the Captain said.
// Kept in memory for the session; the communicator shows it as a transcript and updates it live.
const talk = new Map();   // crew id -> [{ from: 'you' | 'crew', text, at }]
export const transcript = (id) => talk.get(id) || [];
export function logLine(id, from, text) {
  const l = talk.get(id) || []; l.push({ from, text, at: Date.now() }); talk.set(id, l.slice(-24));
  document.dispatchEvent(new CustomEvent('crew-line', { detail: { id } }));
}

const who = (role) => {
  const c = gameState.getProperty(`contacts.crew.${CREW_ID[role] || role}`);
  return { name: (c && c.name) || (FALLBACK[role] || [role])[0], role: (c && c.role) || (FALLBACK[role] || [, ''])[1] };
};

/** role: 'helm' | 'aria' | 'sensors' | 'engineering' | 'comms' | 'science'. kind: '' | 'mission' | 'error'. */
/** While hush.fn() is true nobody calls in: no chirps, no console lines, no ARIA guidance. (Before the communicator pin is picked up.) */
export const hush = { fn: () => false };
export function say(role, text, kind = '', opts = {}) {
  if (hush.fn()) return;
  text = fill(text); if (opts.keep) opts = { ...opts, keep: fill(opts.keep) };
  const now = Date.now(), w = who(role);
  if (CREW_ID[role]) logLine(CREW_ID[role], 'crew', text);   // the running notes belong in their communicator too
  if ((kind === 'mission' || kind === 'error') && opts.hold !== false) {   // worth keeping until read
    const id = CREW_ID[role] || role, l = held.get(id) || []; l.push({ text: opts.keep || text, at: now }); held.set(id, l.slice(-5)); emitChange();
  }
  if (viewProbe.fn()) {   // bridge: the upper display
    document.dispatchEvent(new CustomEvent('notice', { detail: { text: opts.notice || text, kind, who: w.name.split(' ').pop().toUpperCase() } }));
    if (now - lastPing > 3000) { lastPing = now; ping(); }
    return;
  }
  if (now - lastChirp > 20000) { lastChirp = now; stats.chirps++; chirp(); }
  stats.shown++;
  consoleLine(`${w.name} · ${w.role}: ${text}${kind === 'mission' || kind === 'error' ? '  (tap the pin to answer)' : ''}`, kind);   // docked readout; the pin pulses for held messages

}

/** A crew member reports on what the Captain just did. Replaces the old pop-up toast. kind 'mission' keeps it until read. */
export const tell = (role, text, kind = '') => say(role, text, kind === 'mission' ? 'mission' : '');
