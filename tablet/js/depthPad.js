// A touch keypad for entering a depth in metres. Used by the communicator ("Custom depth") and the Helm station.
import { el, modal } from './util.js';
import { sim } from './sim.js';

export const MAX_DEPTH = 6000;
/** Ask for a depth. onSet(metres) runs when the Captain taps Set depth. */
export function askDepth(onSet, title = 'Set a depth') {
  let txt = '';
  const read = el('div', { class: 'dp-read' }), note = el('div', { class: 'dp-note' });
  const safe = sim.deepest();
  const paint = () => {
    read.innerHTML = `${txt || '0'}<small> m</small>`;
    const v = Number(txt || 0);
    note.textContent = safe != null && v > safe ? `Only ${safe} m is safe here. The ship holds ${safe} m and goes deeper when the floor drops away.` : safe != null ? `Safe to ${safe} m here. Maximum ${MAX_DEPTH} m.` : `Maximum ${MAX_DEPTH} m.`;
  };
  const press = (k) => {
    if (k === '⌫') txt = txt.slice(0, -1); else if (k === 'C') txt = ''; else if ((txt + k).length <= 4 && Number(txt + k) <= MAX_DEPTH) txt = String(Number(txt + k));
    paint();
  };
  const pad = el('div', { class: 'dp-pad' }, ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((k) => el('button', { class: 'btn dp-key', text: k, onclick: () => press(k) })));
  paint();
  modal({ title, body: el('div', { class: 'dp' }, read, note, pad), actions: [{ label: 'Cancel' }, { label: 'Set depth', primary: true, run: () => onSet(Number(txt || 0)) }] });
}
