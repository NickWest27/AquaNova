// Communications station: the ship's satellite and laser link. Missions, orders and reports.
// (Crew talk goes through the communicator pin, not here.)
import { sim } from '../sim.js';
import { el, toast } from '../util.js';
import { gameState } from '../persist.js';

const LINK_MAX_DEPTH = 15; // metres. Satellite and surface laser need the antenna near the surface.
const SEED = [{
  id: 'oera-sea-trials', from: 'OERA Operations', subject: 'Sea trials orders', read: false,
  text: 'Captain, get the Aqua Nova out of dry dock and underway for sea trials. Familiarize yourself and the crew with the ship under various conditions. Report findings when you have a link.',
}];

export function mount(body) {
  let inbox = gameState.getProperty('mission.inbox');
  if (!inbox) { inbox = SEED.map((m) => ({ ...m })); gameState.updateProperty('mission.inbox', inbox); }
  body.style.flexDirection = 'row';
  const linkNum = el('div', { class: 'num' }), linkNote = el('p', { style: 'color:var(--dim);margin-top:0.4rem' });
  const send = el('button', { class: 'btn primary', text: 'Transmit findings', onclick: () => {
    const found = gameState.getProperty('mission.discoveries') || [];
    toast(found.length ? `Transmitted ${found.length} finding${found.length > 1 ? 's' : ''}` : 'Nothing to transmit yet');
  } });
  const list = el('div', { class: 'tab-body', style: 'flex:1' });
  const side = el('div', { class: 'nav-side' }, el('div', { class: 'card' }, el('div', { class: 'lbl', text: 'Satellite / laser link' }), linkNum, linkNote), el('div', { class: 'card' }, el('div', { class: 'lbl', text: 'Outbox' }), el('p', { style: 'margin:0.4rem 0 0.8rem;color:var(--dim)', text: 'Send reports and findings to OERA.' }), send));
  body.append(side, list);

  function render() {
    list.replaceChildren(el('div', { class: 'lbl', text: 'Inbox' }), ...inbox.map((m) => el('button', { class: 'card msg', onclick: () => { m.read = true; gameState.updateProperty('mission.inbox', inbox); render(); } },
      el('div', { class: 'meta' }, el('b', { text: m.from }), !m.read && el('span', { class: 'warn', text: 'NEW' })),
      el('h3', { text: m.subject }), m.read ? el('p', { text: m.text }) : el('p', { text: 'Tap to read', style: 'color:var(--dim)' }))));
  }
  function update() {
    const up = sim.s.depth <= LINK_MAX_DEPTH;
    linkNum.className = 'num ' + (up ? 'ok' : 'bad');
    linkNum.textContent = up ? 'LINK UP' : 'NO LINK';
    linkNote.textContent = up ? 'Antenna is above the waterline.' : `Rise to ${LINK_MAX_DEPTH} m or shallower to connect.`;
    send.disabled = !up;
  }
  render(); update();
  return { update, destroy() {} };
}
