// Communications station: the ship's satellite and laser link. Missions, orders and reports.
// (Crew talk goes through the communicator pin, not here.)
// Messages arrive from missions (send_message action). A message can offer a mission to accept.
// The link needs the antenna near the surface, so reports go out only at 15 m or shallower.
import { sim, gameDateText } from '../sim.js';
import { mailZoom } from '../audio.js';
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

  // ---- reading a message: a 90s style zoom (8 outline frames) into a large window, and back out ----
  const FROM_FULL = { 'OERA Operations': 'O.E.R.A. - Ocean Exploration and Research Alliance (Operations)' };
  const stamp = (m) => (m.gameClock != null ? gameDateText(m.gameClock).replace('  ', ', ').slice(0, -3) : when(m.receivedAt));
  let reading = null;   // { m, win, back, rowEl }
  const container = () => body.closest('#station') || body;
  const rectIn = (box, host) => { const r = box.getBoundingClientRect(), h = host.getBoundingClientRect(); return { x: r.left - h.left, y: r.top - h.top, w: r.width, h: r.height }; };
  function zoom(host, from, to, done) {
    const frame = el('div', { class: 'mail-zoom' }); host.append(frame);
    let k = 0; const place = (t) => { frame.style.cssText = `left:${from.x + (to.x - from.x) * t}px;top:${from.y + (to.y - from.y) * t}px;width:${from.w + (to.w - from.w) * t}px;height:${from.h + (to.h - from.h) * t}px`; };
    const tick = () => { k++; place(k / 8); if (k < 8) setTimeout(tick, 36); else { frame.remove(); done(); } };
    place(0); setTimeout(tick, 36);
  }
  function openMessage(m, rowEl) {
    if (reading) return;
    if (!m.read) { setInbox(inbox().map((x) => x.id === m.id ? { ...x, read: true } : x)); m = { ...m, read: true }; }
    const host = container(), mid = m.missionId || MISSION_OF[m.id];
    const back = el('div', { class: 'mail-back', onclick: (e) => { if (e.target === back) closeMessage(); } });
    const field = (k, v) => el('div', { class: 'mail-field' }, el('span', { text: k }), el('b', { text: v }));
    const tail = el('div', { class: 'mail-tail' });
    const fillTail = () => { const st = mid ? stateOf(mid) : null; tail.replaceChildren(...(!mid ? [] : st === 'new'
      ? [el('button', { class: 'btn primary', text: 'Accept mission', onclick: () => { missions.startMission(mid); fillTail(); render(); } })]
      : [el('p', { class: st === 'done' ? 'ok' : 'warn', text: st === 'done' ? 'Mission complete' : 'Mission accepted. See PED → Missions.' })])); };
    fillTail();
    const win = el('div', { class: 'mail-win', hidden: true },
      field('From:', FROM_FULL[m.from] || m.from), field('To:', 'Captain of the Aqua Nova'), field('Date:', stamp(m)), field('Subject:', m.subject),
      el('div', { class: 'mail-text', text: m.text }), tail);
    back.append(win); host.append(back);
    const to = rectIn(win, host); win.hidden = true;
    reading = { m, win, back, rowEl };
    mailZoom(true);
    zoom(host, rectIn(rowEl, host), to, () => { win.hidden = false; render(); });
  }
  function closeMessage() {
    if (!reading) return;
    const { win, back, rowEl } = reading, host = container(), from = rectIn(win, host);
    win.hidden = true; back.classList.add('clear');
    const target = rowEl.isConnected ? rectIn(rowEl, host) : { x: from.x + from.w / 2, y: from.y + from.h / 2, w: 10, h: 10 };
    mailZoom(false);
    zoom(host, from, target, () => { back.remove(); reading = null; render(); });
  }
  function messageCard(m) {
    const row = el('button', { class: 'card msg mail-row' + (m.read ? '' : ' unread'), onclick: () => openMessage(m, row) },
      el('span', { class: 'dot', text: m.read ? '' : '●' }), el('b', { class: 'from', text: m.from }), el('span', { class: 'subj', text: m.subject }), el('span', { class: 'when', text: stamp(m) }));
    return row;
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
  return { update, destroy() { document.removeEventListener('comms-message', onMsg); if (reading) { reading.back.remove(); reading = null; } } };
}
