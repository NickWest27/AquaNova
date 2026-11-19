// Arrival sign-in. A secure personnel sign-in on a PED, confirming the Captain's identity by biometrics.
// What it really does is take the player's name. The "scanner" is a button.
import { el } from './util.js';
import { tidyName, validName, setPlayer } from './player.js';

const FINGER = `<svg viewBox="0 0 100 100" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
  <path d="M30 78c-4-10-4-22 2-32 6-10 18-16 30-12"/><path d="M38 84c-6-12-6-28 2-40 6-9 16-13 26-10"/><path d="M48 88c-6-14-6-30 2-42 4-6 10-9 16-9"/>
  <path d="M58 90c-5-14-4-30 4-42"/><path d="M22 66c-2-14 4-28 16-36 12-8 28-8 38 2"/><path d="M70 44c6 10 6 24 0 38"/><path d="M78 56c3 8 2 18-2 26"/></g></svg>`;

/** Shows content on a PED with its frame, the same handheld as the PED pop-up. */
function onPed(content) {
  const root = document.getElementById('modal-root');
  const back = el('div', { class: 'modal-back ped-back' }, el('div', { class: 'ped-panel pda signin', role: 'dialog' },
    el('div', { class: 'pda-screen' }, content), el('img', { class: 'pda-frame', src: 'assets/pda-frame.webp', alt: '', draggable: 'false' })));
  root.append(back);
  return back;
}

/** onDone() runs after the identification record is acknowledged. */
export function runIntake({ dateText, onDone }) {
  const field = (id, label) => el('label', { class: 'f-row', for: id }, el('span', { text: label }), el('input', { id, class: 'f-in', type: 'text', maxlength: '24', autocomplete: 'off', autocapitalize: 'words', autocorrect: 'off', spellcheck: 'false' }));
  const first = field('f-first', 'Given name'), last = field('f-last', 'Surname');
  const info = (k, v) => el('div', { class: 'f-cell' }, el('span', { text: k }), el('b', { text: v }));
  const decl = el('input', { type: 'checkbox' });
  const msg = el('p', { class: 'f-msg' });
  const scanner = el('button', { class: 'scanner', 'aria-label': 'Biometric sensor: place right index finger', disabled: true, html: FINGER });
  const status = el('p', { class: 'f-scan' });
  const inputs = () => [first.querySelector('input'), last.querySelector('input')];
  const ready = () => inputs().every((i) => validName(i.value)) && decl.checked;
  const refresh = () => {
    const ok = ready(); scanner.disabled = !ok;
    status.textContent = ok ? 'Place your right index finger on the sensor.' : 'Enter your full name and confirm to enable the sensor.';
    const bad = inputs().some((i) => i.value.trim() && !validName(i.value));
    msg.textContent = bad ? 'Names may use letters, spaces, hyphens and apostrophes only.' : '';
  };
  [...inputs(), decl].forEach((n) => n.addEventListener('input', refresh));
  refresh();

  const back = onPed(el('div', { class: 'sign' },
    el('div', { class: 'sg-head' }, el('b', { text: 'O.E.R.A.' }), el('span', { text: 'Secure access · Personnel sign-in' })),
    el('div', { class: 'sg-cols' },
      el('div', { class: 'sg-left' },
        el('h3', { text: 'Crew sign-in' }),
        el('div', { class: 'f-grid' }, info('Vessel', 'Aqua Nova'), info('Sign-in', 'Arrival'), info('Location', 'Launch Bay'), info('Date and time', dateText)),
        el('div', { class: 'f-names' }, first, last), msg,
        el('label', { class: 'f-tick' }, decl, el('span', { text: 'I confirm that I am the person named above.' }))),
      el('div', { class: 'sg-right' }, el('b', { class: 'sg-bio', text: 'Biometric verification' }), scanner, status))));

  scanner.addEventListener('click', () => {
    if (scanner.disabled) return;
    scanner.disabled = true; scanner.classList.add('scanning'); status.textContent = 'Verifying. Hold still.';
    inputs().forEach((i) => { i.disabled = true; }); decl.disabled = true;
    setTimeout(() => {
      scanner.classList.replace('scanning', 'matched'); status.textContent = 'Print matched to the personnel record.';
      setTimeout(() => {
        const f = tidyName(inputs()[0].value), l = tidyName(inputs()[1].value);
        setPlayer(f, l); back.remove(); idRecord(f, l, onDone);
      }, 900);
    }, 1700);
  });
}

function idRecord(f, l, onDone) {
  const row = (k, v) => el('div', { class: 'f-id-row' }, el('span', { text: k }), el('b', { text: v }));
  const back = onPed(el('div', { class: 'sign' },
    el('div', { class: 'sg-head' }, el('b', { text: 'O.E.R.A.' }), el('span', { text: 'Secure access · Identification record' })),
    el('div', { class: 'f-ok', text: '✔ Biometric identification confirmed' }),
    el('div', { class: 'sg-cols' },
      el('div', { class: 'sg-left f-id' }, row('Name', `${f} ${l}`), row('Rank', 'Captain'), row('Security clearance', 'Level 5 · Omega (highest)'), row('Quarters', "Captain's Quarters, Deck A1"), row('Vessel', 'Aqua Nova')),
      el('div', { class: 'sg-right sg-note' },
        el('p', { class: 'f-notes' }, el('b', { text: 'Notes: ' }), 'Transferred from retirement at the request of O.E.R.A. Admiral Elena Vasquez, to assist with the commissioning of the Aqua Nova after the last-minute relief of Captain Elena Voss.'),
        el('p', { class: 'f-order', text: 'Please report to your Quarters immediately. You have a message from O.E.R.A. Operations.' }),
        el('button', { class: 'btn primary', text: 'Acknowledged', onclick: () => { back.remove(); onDone && onDone(); } })))));
}
