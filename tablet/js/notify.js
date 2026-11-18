// Crew notices. On the bridge they appear on the upper display only. Anywhere else (a station, quarters, the walkway)
// the relevant crew member calls in: a communicator chirp and a short message under the top edge.
// Anti-spam: the chirp sounds at most once every 20 s; messages from the same person within 8 s replace each other.
import { viewProbe, el } from './util.js';
import { gameState } from './persist.js';
import { chirp, ping } from './audio.js';

const CREW_ID = { helm: 'helm', aria: 'executiveOfficer', sensors: 'sensors', engineering: 'engineering', comms: 'communications', science: 'science' };
const FALLBACK = { helm: ['Helm', 'Helm officer'], aria: ['ARIA', 'Executive officer'], sensors: ['Sensors', 'Sensors officer'], engineering: ['Engineering', 'Engineer'], comms: ['Comms', 'Communications'], science: ['Science', 'Science officer'] };
export const stats = { chirps: 0, shown: 0 };
let lastChirp = -1e9, lastPing = -1e9, box = null;
const msgs = [];   // { who, node, at, timer }

// Held messages: what a crew member said that the Captain may have missed. Kept until the Captain reads it in the communicator.
const held = new Map();   // crew id -> [{ text, at }]
const emitChange = () => document.dispatchEvent(new CustomEvent('inbox-change'));
export const unreadCount = () => [...held.values()].reduce((n, l) => n + l.length, 0);
export const unreadFor = (id) => (held.get(id) || []).length;
/** Returns and clears the held messages for one crew member. */
export function takeHeld(id) { const l = held.get(id) || []; held.delete(id); if (l.length) emitChange(); return l.map((m) => m.text); }
export function clearHeld() { held.clear(); emitChange(); }

const who = (role) => {
  const c = gameState.getProperty(`contacts.crew.${CREW_ID[role] || role}`);
  return { name: (c && c.name) || (FALLBACK[role] || [role])[0], role: (c && c.role) || (FALLBACK[role] || [, ''])[1] };
};

/** role: 'helm' | 'aria' | 'sensors' | 'engineering' | 'comms' | 'science'. kind: '' | 'mission' | 'error'. */
export function say(role, text, kind = '', opts = {}) {
  const now = Date.now(), w = who(role);
  if (kind === 'mission' || kind === 'error') {   // worth keeping until read
    const id = CREW_ID[role] || role, l = held.get(id) || []; l.push({ text: opts.keep || text, at: now }); held.set(id, l.slice(-5)); emitChange();
  }
  if (viewProbe.fn()) {   // bridge: the upper display
    document.dispatchEvent(new CustomEvent('notice', { detail: { text: opts.notice || `${w.name.split(' ').pop().toUpperCase()}: ${text}`, kind } }));
    if (now - lastPing > 3000) { lastPing = now; ping(); }
    return;
  }
  if (now - lastChirp > 20000) { lastChirp = now; stats.chirps++; chirp(); }
  box ||= (() => { const b = el('div', { id: 'crew-msg', 'aria-live': 'polite' }); (document.getElementById('toasts') || document.body).parentElement.append(b); return b; })();
  const mine = msgs.find((m) => m.who === w.name && now - m.at < 8000);
  if (mine) { mine.node.querySelector('p').textContent = text; mine.at = now; clearTimeout(mine.timer); mine.timer = setTimeout(() => drop(mine), 6500); return; }
  const node = el('div', { class: `crew-card ${kind}` }, el('span', { class: 'avatar', text: w.name.replace(/^(Captain|Commander|Dr\.|Specialist|Engineer|Lieutenant) /, '')[0] }),
    el('div', {}, el('small', { text: `${w.name} · ${w.role}` }), el('p', { text })));
  const m = { who: w.name, node, at: now, timer: null }; msgs.push(m); stats.shown++;
  box.append(node); while (msgs.length > 2) drop(msgs[0]);
  m.timer = setTimeout(() => drop(m), 6500);
}
function drop(m) { clearTimeout(m.timer); const i = msgs.indexOf(m); if (i >= 0) msgs.splice(i, 1); m.node.classList.add('out'); setTimeout(() => m.node.remove(), 300); }
