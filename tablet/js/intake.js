// Arrival intake. Looks like an Alliance form, but all it does is take the player's name.
// The "biometric scanner" is a button. Nothing is scanned. Nobody is fooled, least of all the Alliance.
import { el } from './util.js';
import { tidyName, validName, setPlayer } from './player.js';

const FINGER = `<svg viewBox="0 0 100 100" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
  <path d="M30 78c-4-10-4-22 2-32 6-10 18-16 30-12"/><path d="M38 84c-6-12-6-28 2-40 6-9 16-13 26-10"/><path d="M48 88c-6-14-6-30 2-42 4-6 10-9 16-9"/>
  <path d="M58 90c-5-14-4-30 4-42"/><path d="M22 66c-2-14 4-28 16-36 12-8 28-8 38 2"/><path d="M70 44c6 10 6 24 0 38"/><path d="M78 56c3 8 2 18-2 26"/></g></svg>`;

/** done() runs after the ID record is acknowledged. */
export function runIntake({ dateText, onDone }) {
  const root = document.getElementById('modal-root');
  const field = (id, label, ph) => el('label', { class: 'f-row', for: id }, el('span', { text: label }), el('input', { id, class: 'f-in', type: 'text', maxlength: '24', placeholder: ph, autocomplete: 'off', autocapitalize: 'words', autocorrect: 'off', spellcheck: 'false' }));
  const first = field('f-first', '1. Given name', 'as it appears on your retirement papers'), last = field('f-last', '2. Surname', 'family name');
  const tick = (text) => { const c = el('input', { type: 'checkbox' }); return { c, row: el('label', { class: 'f-tick' }, c, el('span', { text })) }; };
  const t1 = tick('I declare the above to be true, and that I have read the Alliance Personnel Handbook (4,212 pages).');
  const t2 = tick('I accept responsibility for any damage to the vessel, the crew, or the coffee machine.');
  const msg = el('p', { class: 'f-msg' });
  const scanner = el('button', { class: 'scanner', 'aria-label': 'Biometric scanner: place right index finger', disabled: true, html: FINGER });
  const scanTxt = el('p', { class: 'f-scan', text: 'Complete items 1 and 2 and both declarations to enable the scanner.' });
  const inputs = () => [first.querySelector('input'), last.querySelector('input')];
  const ready = () => inputs().every((i) => validName(i.value)) && t1.c.checked && t2.c.checked;
  const refresh = () => {
    const ok = ready(); scanner.disabled = !ok;
    scanTxt.textContent = ok ? 'Place right index finger on the pad.' : 'Complete items 1 and 2 and both declarations to enable the scanner.';
    const bad = inputs().some((i) => i.value.trim() && !validName(i.value));
    msg.textContent = bad ? 'Names use letters, spaces, hyphens and apostrophes only. The Alliance is traditional.' : '';
  };
  [...inputs(), t1.c, t2.c].forEach((n) => n.addEventListener('input', refresh));

  const paper = el('div', { class: 'form-paper', role: 'dialog' },
    el('div', { class: 'f-head' }, el('b', { text: 'O.E.R.A.' }), el('span', { text: 'Oceanic Exploration and Research Alliance' })),
    el('h3', { text: 'Form OE-117/C · Vessel Arrival, Access and Personnel Declaration' }),
    el('p', { class: 'f-fine', text: 'Complete in BLOCK CAPITALS (touchscreens exempt). Incomplete forms are returned to the sender, who in this case is you.' }),
    el('div', { class: 'f-grid' },
      el('div', { class: 'f-cell' }, el('span', { text: 'Vessel' }), el('b', { text: 'AQUA NOVA · commissioning' })),
      el('div', { class: 'f-cell' }, el('span', { text: 'Point of entry' }), el('b', { text: 'Launch Bay, via Walkway AN-1' })),
      el('div', { class: 'f-cell' }, el('span', { text: 'Date and time' }), el('b', { text: dateText })),
      el('div', { class: 'f-cell' }, el('span', { text: 'Reason for visit' }), el('b', { text: 'Assumption of command' }))),
    first, last, msg, t1.row, t2.row,
    el('div', { class: 'f-bio' }, scanner, el('div', {}, el('b', { text: 'Section 9 · Biometric verification' }), scanTxt)));
  const back = el('div', { class: 'modal-back' }, paper);
  root.append(back);

  scanner.addEventListener('click', () => {
    if (scanner.disabled) return;
    scanner.disabled = true; scanner.classList.add('scanning'); scanTxt.textContent = 'Scanning. Please hold still. Please do not sneeze.';
    inputs().forEach((i) => { i.disabled = true; });
    setTimeout(() => {
      scanner.classList.replace('scanning', 'matched'); scanTxt.textContent = 'Print matched to retirement records.';
      setTimeout(() => {
        const f = tidyName(inputs()[0].value), l = tidyName(inputs()[1].value);
        setPlayer(f, l); back.remove(); idRecord(f, l, root, onDone);
      }, 900);
    }, 1700);
  });
}

function idRecord(f, l, root, onDone) {
  const row = (k, v) => el('div', { class: 'f-id-row' }, el('span', { text: k }), el('b', { text: v }));
  const close = () => { back.remove(); onDone && onDone(); };
  const back = el('div', { class: 'modal-back' }, el('div', { class: 'form-paper id', role: 'dialog' },
    el('div', { class: 'f-ok', text: '✔ Biometric identification confirmed' }),
    el('div', { class: 'f-id' }, row('Name', `${f} ${l}`), row('Rank', 'Captain'), row('Security clearance', 'Level 5 · Omega (highest)'), row('Quarters', "Captain's Quarters, Deck A1"), row('Vessel', 'Aqua Nova')),
    el('p', { class: 'f-notes' }, el('b', { text: 'Notes: ' }), 'Transferred from retirement at the request of O.E.R.A. Admiral Elena Vasquez, to assist with the commissioning of the Aqua Nova after the last-minute relief of Captain Elena Voss.'),
    el('p', { class: 'f-order', text: 'Please report to your Quarters immediately. You have a message from O.E.R.A. Operations.' }),
    el('div', { class: 'actions' }, el('button', { class: 'btn primary', text: 'Acknowledged', onclick: close }))));
  root.append(back);
}
