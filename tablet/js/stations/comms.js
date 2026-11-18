// Communications station: the ship's satellite and laser link. Missions, orders and reports.
// (Crew talk goes through the communicator pin, not here.)
// Messages arrive from missions (send_message action). A message can offer a mission to accept.
// The link needs the antenna near the surface, so reports go out only at 15 m or shallower.
import { sim } from '../sim.js';
import { el, toast } from '../util.js';
import { gameState } from '../persist.js';
import missions from '../../../game/systems/missionManager.js';

const LINK_MAX_DEPTH = 15; // metres
const MISSION_OF = { 'oera-sea-trials': 'seaTrials' }; // older saves stored this message without a mission id
const stateOf = (id) => missions.completedMissions.has(id) ? 'done' : missions.activeMissions.has(id) ? 'active' : 'new';
const when = (iso) => iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';

export function mount(body) {
  const inbox = () => gameState.getProperty('mission.inbox') || [];
  const outbox = () => gameState.getProperty('mission.outbox') || [];
  const setInbox = (list) => gameState.updateProperty('mission.inbox', list);
  body.style.flexDirection = 'row';
  const linkNum = el('div', { class: 'num' }), linkNote = el('p', { style: 'color:var(--dim);margin-top:0.4rem' });
  const send = el('button', { class: 'btn primary', text: 'Transmit report', onclick: () => {
    const found = (gameState.getProperty('mission.discoveries') || []).length;
    const s = sim.s;
    gameState.updateProperty('mission.outbox', [...outbox(), { at: new Date().toISOString(), text: `Status report: ${s.at ? s.at.name : 'open water'}, depth ${Math.round(s.depth)} m, battery ${Math.round(s.battery)}%, ${found} finding${found === 1 ? '' : 's'}.` }]);
    toast('Report transmitted to OERA');
    document.dispatchEvent(new CustomEvent('report-sent'));
    render();
  } });
  const list = el('div', { class: 'tab-body', style: 'flex:1' });
  const sentList = el('div');
  const side = el('div', { class: 'nav-side' },
    el('div', { class: 'card' }, el('div', { class: 'lbl', text: 'Satellite / laser link' }), linkNum, linkNote),
    el('div', { class: 'card' }, el('div', { class: 'lbl', text: 'Outbox' }), el('p', { style: 'margin:0.4rem 0 0.8rem;color:var(--dim)', text: 'Send a status report and your findings to OERA.' }), send, sentList));
  body.append(side, list);

  function messageCard(m) {
    const mid = m.missionId || MISSION_OF[m.id], st = mid ? stateOf(mid) : null;
    const open = () => { if (!m.read) setInbox(inbox().map((x) => x.id === m.id ? { ...x, read: true } : x)); render(); };
    return el('div', { class: 'card msg' },
      el('button', { class: 'msg-head', style: 'all:unset;display:block;width:100%;cursor:pointer', onclick: open },
        el('div', { class: 'meta' }, el('b', { text: m.from }), el('span', { text: when(m.receivedAt) }), !m.read && el('span', { class: 'warn', text: 'NEW' })),
        el('h3', { text: m.subject })),
      m.read ? el('p', { text: m.text }) : el('p', { text: 'Tap to read', style: 'color:var(--dim)' }),
      m.read && mid && (st === 'new'
        ? el('button', { class: 'btn primary', text: 'Accept mission', onclick: () => { missions.startMission(mid); render(); } })
        : el('p', { class: st === 'done' ? 'ok' : 'warn', text: st === 'done' ? 'Mission complete' : 'Mission accepted. See PED → Missions.' })));
  }
  function render() {
    const msgs = [...inbox()].reverse();
    list.replaceChildren(el('div', { class: 'lbl', text: 'Inbox' }), ...(msgs.length ? msgs.map(messageCard) : [el('div', { class: 'empty', text: 'No messages yet.' })]));
    const sent = [...outbox()].reverse().slice(0, 3);
    sentList.replaceChildren(...sent.map((o) => el('p', { style: 'margin-top:0.6rem;font-size:0.9rem;color:var(--dim)', text: `${when(o.at)} — ${o.text}` })));
  }
  function update() {
    const up = sim.s.depth <= LINK_MAX_DEPTH;
    linkNum.className = 'num ' + (up ? 'ok' : 'bad');
    linkNum.textContent = up ? 'LINK UP' : 'NO LINK';
    linkNote.textContent = up ? 'Antenna is above the waterline.' : `Rise to ${LINK_MAX_DEPTH} m or shallower to connect.`;
    send.disabled = !up;
  }
  // a message can arrive while the station is open
  const onMsg = () => render();
  document.addEventListener('comms-message', onMsg);
  render(); update();
  return { update, destroy() { document.removeEventListener('comms-message', onMsg); } };
}
