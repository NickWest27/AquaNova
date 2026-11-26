// Crew notices. On the bridge they appear on the upper display only. Anywhere else (a station, quarters, the walkway)
// the relevant crew member calls in: a communicator chirp and a short message under the top edge.
// Anti-spam: the chirp sounds at most once every 20 s; messages from the same person within 8 s replace each other.
import { fill } from './player.js';
import { viewProbe, consoleLine } from './util.js';
import { gameState } from './persist.js';
import { chirp, ping, actionTick } from './audio.js';

const CREW_ID = { helm: 'helm', aria: 'executiveOfficer', sensors: 'sensors', engineering: 'engineering', comms: 'communications', science: 'science' };
const FALLBACK = { helm: ['Helm', 'Helm officer'], aria: ['ARIA', 'Executive officer'], sensors: ['Sensors', 'Sensors officer'], engineering: ['Engineering', 'Engineer'], comms: ['Comms', 'Communications'], science: ['Science', 'Science officer'] };
export const stats = { chirps: 0, shown: 0 };
let lastChirp = -1e9, lastPing = -1e9;

// Held messages: what a crew member said that the Captain may have missed. Kept until the Captain reads it in the communicator.
// Dialogue stays current: a held message belongs to a moment, and when that moment has passed it is dropped, never shown late and never filed as a past conversation.
// A message can say when it stops applying: opts.valid (a function that is true while it still applies), opts.key (a newer message with the same key replaces it,
// and retire(key) removes it, for example when the thing it described has finished), opts.ttl (seconds). Only what the Captain has actually read reaches the transcript.
const held = new Map();   // crew id -> [{ text, at, key, valid, ttl }]
const emitChange = () => document.dispatchEvent(new CustomEvent('inbox-change'));
const waiting = () => ((gameState.getProperty('progress.decisions') || {}).pending || []).length;   // decisions ARIA is waiting on
const fresh = (m) => !(m.valid && !m.valid()) && !(m.ttl && Date.now() - m.at > m.ttl * 1000);
function prune() { let gone = false; for (const [id, l] of held) { const k = l.filter(fresh); if (k.length !== l.length) { gone = true; if (k.length) held.set(id, k); else held.delete(id); } } if (gone) emitChange(); }
export const unreadCount = () => { prune(); return [...held.values()].reduce((n, l) => n + l.length, 0) + waiting(); };
export const unreadFor = (id) => { prune(); return (held.get(id) || []).length + (id === 'executiveOfficer' ? waiting() : 0); };
/** Drop every held message with this key (what it described is over). */
export function retire(key) { let gone = false; for (const [id, l] of held) { const k = l.filter((m) => m.key !== key); if (k.length !== l.length) { gone = true; if (k.length) held.set(id, k); else held.delete(id); } } if (gone) emitChange(); }
/** Returns and clears the held messages for one crew member that still apply, and files them in the conversation: the Captain has now read them. */
export function takeHeld(id) { prune(); const l = held.get(id) || []; held.delete(id); if (l.length) emitChange(); for (const m of l) logLine(id, 'crew', m.text); return l.map((m) => m.text); }
export function clearHeld() { held.clear(); emitChange(); }
// The crew member whose communicator page is open right now: what they say meanwhile is read as it arrives.
let openCrew = null;
export const setOpenCrew = (id) => { openCrew = id; };

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
const DEPT = { helm: 'The helm', sensors: 'Sensors', engineering: 'Engineering', comms: 'Comms', science: 'The lab' };
export function say(role, text, kind = '', opts = {}) {
  if (hush.fn()) return;
  // someone the Captain has not met yet (they join the communicator when he visits their room): ARIA passes the message on
  if (CREW_ID[role] && role !== 'aria' && gameState.getProperty(`contacts.crew.${CREW_ID[role]}`) && !gameState.getProperty(`contacts.crew.${CREW_ID[role]}.known`)) {
    return say('aria', `${DEPT[role] || 'The crew'} reports: ${fill(text).replace(/^Captain, /, '')}`, kind, opts);
  }
  text = fill(text); if (opts.keep) opts = { ...opts, keep: fill(opts.keep) };
  const now = Date.now(), w = who(role);
  const keepIt = (kind === 'mission' || kind === 'error') && opts.hold !== false && CREW_ID[role] !== openCrew;   // worth keeping until read, unless they are on the line with us now
  if (CREW_ID[role]) {
    if (!keepIt) logLine(CREW_ID[role], 'crew', text);   // the running notes belong in their communicator too. A kept message is filed when it is read.
  }
  if (keepIt) {
    const id = CREW_ID[role] || role, l = (held.get(id) || []).filter((m) => !(opts.key && m.key === opts.key));
    l.push({ text: opts.keep || text, at: now, key: opts.key, valid: opts.valid, ttl: opts.ttl }); held.set(id, l.slice(-5)); emitChange();
    setTimeout(() => document.dispatchEvent(new CustomEvent('crew-call', { detail: { id } })), 0);   // app.js opens the line to them
  }
  if (viewProbe.fn() && opts.notice) {   // bridge: ship-state notices go to the upper display. Voice never does; it uses the line at the foot of the screen like everywhere else.
    document.dispatchEvent(new CustomEvent('notice', { detail: { text: opts.notice, kind, who: w.name.split(' ').pop().toUpperCase() } }));
  }
  if (opts.action) { actionTick(); }   // a routine action report: a short tick, not the communicator
  else if (now - lastChirp > 20000) { lastChirp = now; stats.chirps++; chirp(); }
  stats.shown++;
  if (!keepIt) consoleLine(`${w.name} · ${w.role}: ${text}`, kind);   // a running note: the line at the foot of the screen. A held message opens the dialogue instead (app.js).

}

/** A crew member reports on what the Captain just did. Replaces the old pop-up toast. kind 'mission' keeps it until read. */
export const tell = (role, text, kind = '', opts = {}) => say(role, text, kind === 'mission' ? 'mission' : '', opts);
