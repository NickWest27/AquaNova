// Communications station: the ship's satellite and laser link. Missions, orders and reports.
// (Crew talk goes through the communicator pin, not here.)
// Messages arrive from missions (send_message action). A message can offer a mission to accept.
// The link needs the antenna near the surface, so reports go out only at 15 m or shallower.
import { tell } from '../notify.js';
import { fill } from '../player.js';
import { sim, gameDateText } from '../sim.js';
import { mailZoom } from '../audio.js';
import { el, toast } from '../util.js';
import { gameState } from '../persist.js';
import * as links from './commsLinks.js';
import { mountControls, mountContacts } from './commsPanels.js';
import { canTransmit } from '../commsModel.js';
import missions from '../../../game/systems/missionManager.js';
import { logAccepted } from '../missionLog.js';

const MISSION_OF = { 'oera-sea-trials': 'seaTrials' }; // older saves stored this message without a mission id
const stateOf = (id) => missions.completedMissions.has(id) ? 'done' : missions.activeMissions.has(id) ? 'active' : 'new';
const when = (iso) => iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';

export function mount(body) {
  const inbox = () => gameState.getProperty('mission.inbox') || [];
  const outbox = () => gameState.getProperty('mission.outbox') || [];
  const setInbox = (list) => gameState.updateProperty('mission.inbox', list);
  body.style.flexDirection = 'column';
  const linkNum = el('div', { class: 'num' }), linkNote = el('p', { style: 'color:var(--dim);margin-top:0.4rem' });
  const transmit = () => {
    const t = canTransmit(); if (!t.ok) { tell('comms', `Cannot transmit: ${t.L.label} is ${t.st.status.toLowerCase()}`, 'warn'); return; }
    const found = (gameState.getProperty('mission.discoveries') || []).length;
    const s = sim.s;
    gameState.updateProperty('mission.outbox', [...outbox(), { at: new Date().toISOString(), text: `Status report via ${t.L.label}: ${s.at ? s.at.name : 'open water'}, depth ${Math.round(s.depth)} m, battery ${Math.round(s.battery)}%, ${found} finding${found === 1 ? '' : 's'}.` }]);
    tell('comms', 'Report transmitted to OERA');
    document.dispatchEvent(new CustomEvent('report-sent'));
    render();
  };
  const send = el('button', { class: 'btn primary', text: 'Transmit report', onclick: transmit });
  const list = el('div', { class: 'tab-body', style: 'flex:1' });
  const sentList = el('div');
  const side = el('div', { class: 'nav-side' },
    el('div', { class: 'card' }, el('div', { class: 'lbl', text: 'Satellite / laser link' }), linkNum, linkNote),
    el('div', { class: 'card' }, el('div', { class: 'lbl', text: 'Outbox' }), el('p', { style: 'margin:0.4rem 0 0.8rem;color:var(--dim)', text: 'Send a status report and your findings to OERA.' }), send, sentList));
  const mailPane = el('div', { style: 'flex:1;min-height:0;display:flex;gap:0.9rem' }, side, list);
  const pane = () => el('div', { style: 'flex:1;min-height:0;overflow-y:auto' });
  const linkPane = pane(), ctlPane = pane(), conPane = pane();
  const lv = links.mount(linkPane), cv = mountControls(ctlPane, { transmit }), nv = mountContacts(conPane);
  const views = { links: [linkPane, lv], controls: [ctlPane, cv], contacts: [conPane, nv] };
  let tab = inbox().some((m) => !m.read) ? 'mail' : 'links';   // new mail: open on the inbox
  const tabs = el('div', { class: 'tabs' });
  const paintTabs = () => {
    const unread = inbox().filter((m) => !m.read).length;
    tabs.replaceChildren(...[['links', 'Links'], ['controls', 'Controls'], ['contacts', 'Contacts'], ['mail', unread ? `Mail (${unread})` : 'Mail']].map(([id, label]) =>
      el('button', { class: 'btn chip' + (tab === id ? ' on' : ''), text: label, onclick: () => { tab = id; paintTabs(); update(); } })));
    mailPane.style.display = tab === 'mail' ? 'flex' : 'none';
    for (const [id, [node]] of Object.entries(views)) node.style.display = tab === id ? '' : 'none';
  };
  body.append(tabs, mailPane, linkPane, ctlPane, conPane);

  // ---- reading a message: a 90s style zoom (4 outline frames) into a large window, and back out ----
  const FROM_FULL = { 'OERA Operations': 'O.E.R.A. - Ocean Exploration and Research Alliance (Operations)' };
  const stamp = (m) => (m.gameClock != null ? gameDateText(m.gameClock).replace('  ', ', ').slice(0, -3) : when(m.receivedAt));
  let reading = null;   // { m, win, back, rowEl }
  const container = () => body.closest('#station') || body;
  const rectIn = (box, host) => { const r = box.getBoundingClientRect(), h = host.getBoundingClientRect(); return { x: r.left - h.left, y: r.top - h.top, w: r.width, h: r.height }; };
  function zoom(host, from, to, done) {
    const frame = el('div', { class: 'mail-zoom' }); host.append(frame);
    let k = 0; const N = 4; const place = (t) => { frame.style.cssText = `left:${from.x + (to.x - from.x) * t}px;top:${from.y + (to.y - from.y) * t}px;width:${from.w + (to.w - from.w) * t}px;height:${from.h + (to.h - from.h) * t}px`; };
    const tick = () => { k++; place(k / N); if (k < N) setTimeout(tick, 60); else { frame.remove(); done(); } };
    place(0); setTimeout(tick, 60);
  }
  function openMessage(m, rowEl) {
    if (reading) return;
    if (!m.read) { setInbox(inbox().map((x) => x.id === m.id ? { ...x, read: true } : x)); m = { ...m, read: true }; }
    const host = container(), mid = m.missionId || MISSION_OF[m.id];
    const back = el('div', { class: 'mail-back', onclick: (e) => { if (e.target === back) closeMessage(); } });
    const field = (k, v) => el('div', { class: 'mail-field' }, el('span', { text: k }), el('b', { text: v }));
    const tail = el('div', { class: 'mail-tail' });
    const fillTail = () => { const st = mid ? stateOf(mid) : null; tail.replaceChildren(...(!mid ? [] : st === 'new'
      ? [el('button', { class: 'btn primary', text: 'Accept mission', onclick: () => { if (missions.startMission(mid)) logAccepted(mid); fillTail(); render(); } })]
      : [el('p', { class: st === 'done' ? 'ok' : 'warn', text: st === 'done' ? 'Mission complete' : 'Mission accepted. See PED → Missions.' })])); };
    fillTail();
    const win = el('div', { class: 'mail-win', style: 'visibility:hidden' },
      field('From:', FROM_FULL[m.from] || m.from), field('To:', 'Captain of the Aqua Nova'), field('Date:', stamp(m)), field('Subject:', fill(m.subject)),
      el('div', { class: 'mail-text', text: fill(m.text) }), tail);
    back.append(win); host.append(back);
    const to = rectIn(win, host);
    reading = { m, win, back, rowEl };
    mailZoom(true);
    zoom(host, rectIn(rowEl, host), to, () => { win.style.visibility = ''; render(); });
  }
  function closeMessage() {
    if (!reading) return;
    const { win, back, rowEl } = reading, host = container(), from = rectIn(win, host);
    win.style.visibility = 'hidden'; back.classList.add('clear');
    const target = rowEl.isConnected ? rectIn(rowEl, host) : { x: from.x + from.w / 2, y: from.y + from.h / 2, w: 10, h: 10 };
    mailZoom(false);
    zoom(host, from, target, () => { back.remove(); reading = null; render(); });
  }
  function messageCard(m) {
    const row = el('button', { class: 'card msg mail-row' + (m.read ? '' : ' unread'), onclick: () => openMessage(m, row) },
      el('span', { class: 'dot', text: m.read ? '' : '●' }), el('b', { class: 'from', text: m.from }), el('span', { class: 'subj', text: m.subject }), el('span', { class: 'when', text: stamp(m).replace(', ', '\n') }));
    return row;
  }
  function render() {
    const msgs = [...inbox()].reverse();
    list.replaceChildren(el('div', { class: 'lbl', text: 'Inbox' }), ...(msgs.length ? msgs.map(messageCard) : [el('div', { class: 'empty', text: 'No messages yet.' })]));
    const sent = [...outbox()].reverse().slice(0, 3);
    paintTabs();
    sentList.replaceChildren(...sent.map((o) => el('p', { style: 'margin-top:0.6rem;font-size:0.9rem;color:var(--dim)', text: `${when(o.at)} — ${o.text}` })));
  }
  function update() {
    const t = canTransmit(), up = t.ok;
    linkNum.className = 'num ' + (up ? 'ok' : 'bad');
    linkNum.textContent = up ? 'LINK UP' : 'NO LINK';
    linkNote.textContent = up ? `${t.L.label} link, ${t.st.dB} dB.` : `${t.L.label}: ${t.st.status.toLowerCase()}. See the Controls page.`;
    send.disabled = !up;
    if (views[tab]) views[tab][1].update();
  }
  // a message can arrive while the station is open
  const onMsg = () => render();
  document.addEventListener('comms-message', onMsg);
  render(); update();
  return { update, destroy() { lv.destroy(); cv.destroy(); nv.destroy(); document.removeEventListener('comms-message', onMsg); if (reading) { reading.back.remove(); reading = null; } } };
}
