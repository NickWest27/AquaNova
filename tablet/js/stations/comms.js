// Comms: a handheld PDA in the middle, crew on the left, things to say on the right.
import { sim, toward } from '../sim.js';
import { el, toast } from '../util.js';
import { gameState } from '../persist.js';

const threads = {};
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export const knownCrew = () => Object.values(gameState.getProperty('contacts.crew') || {})
  .filter((c) => c && c.id !== 'captain' && c.known && c.name);

function act(text, ctx) {
  const s = sim.s, dock = sim.dockPoi();
  switch (text) {
    case 'Status Report': return `Battery ${Math.round(s.battery)}%, oxygen ${Math.round(s.oxygen)}%, hull ${Math.round(s.hull)}%. Depth ${Math.round(s.depth)} metres.`;
    case "Let's take her to sea": sim.setThrottle(0.4); sim.setDepth(30); sim.setHeading(60); return 'Casting off. Heading 060, thirty metres.';
    case "Let's go home": if (dock) { sim.setWpt(dock); sim.setDepth(0); sim.setThrottle(0.5); return `Course set for ${dock.name}. ${toward(sim.s, dock).nm.toFixed(1)} nautical miles.`; } return 'No dock on the charts.';
    case 'Report to my quarters': setTimeout(() => ctx.openScene('quarters'), 500); return 'Acknowledged. Meet you there.';
    case 'Sound General Alarm': toast('GENERAL ALARM', 'error'); return 'General alarm sounded. All hands to stations.';
    case 'All stop': sim.stop(); return 'All stop, aye.';
    case 'All ahead flank': sim.setThrottle(1); return 'All ahead flank!';
    case 'Emergency surface': case 'Emergency surfaace': sim.setDepth(0); return 'Blowing ballast. Surfacing!';
    case 'Emergency dive': sim.setDepth(500); return 'Diving. Five hundred metres.';
    default: return null;
  }
}

export function mount(body, ctx) {
  body.classList.add('comms-st');
  const crew = knownCrew();
  let cur = crew.find((c) => c.id === 'executiveOfficer') || crew[0];
  const list = el('div', { class: 'crew-list' });
  const name = el('b'), role = el('small'), avatar = el('span', { class: 'avatar' });
  const msgs = el('div', { class: 'msgs' });
  const screen = el('div', { class: 'pda-screen' }, el('div', { class: 'pda-head' }, avatar, el('div', {}, name, role)), msgs);
  const pda = el('div', { class: 'pda' }, screen, el('img', { class: 'pda-frame', src: 'assets/pda-frame.webp', alt: '', draggable: 'false' }));
  const say = el('div', { class: 'say' });
  body.append(list, pda, say);

  const thread = () => (threads[cur.id] ||= []);
  function renderList() {
    list.replaceChildren(...crew.map((c) => el('button', { class: `crew-btn ${c === cur ? 'on' : ''}`, onclick: () => { cur = c; renderList(); renderThread(); } },
      el('span', { class: 'avatar', text: c.name.replace(/^(Captain|Commander|Dr\.|Specialist|Engineer|Lieutenant) /, '')[0] }),
      el('span', {}, el('b', { text: c.name }), el('small', { text: c.role })))));
  }
  function renderThread() {
    if (!cur) { msgs.replaceChildren(el('div', { class: 'empty', text: 'No contacts yet.' })); say.replaceChildren(); return; }
    name.textContent = cur.name; role.textContent = cur.role; avatar.textContent = cur.name.replace(/^(Captain|Commander|Dr\.|Specialist|Engineer|Lieutenant) /, '')[0];
    avatar.classList.toggle('aria', cur.id === 'executiveOfficer');
    const t = thread();
    if (!t.length && cur.id === 'executiveOfficer') t.push({ who: 'in', text: 'Welcome aboard, Captain. I am ARIA, your executive officer. How may I assist you?' });
    msgs.replaceChildren(...(t.length ? t : [el('div', { class: 'empty', text: `Channel open to ${cur.name}.` })]).map((m) =>
      m.nodeType ? m : el('div', { class: `bubble ${m.who}` }, el('small', { text: m.who === 'in' ? cur.name : 'You' }), m.text)));
    msgs.scrollTop = msgs.scrollHeight;
    const mine = (gameState.getProperty('contacts.crew.captain.dialogueOptions.pleasantries') || ['Hello', 'Goodbye', 'Thank you']);
    const o = cur.dialogueOptions || { commands: [], emergency: [], pleasantries: [] };
    const opts = [...mine, ...o.commands, ...o.emergency];
    say.replaceChildren(el('div', { class: 'lbl', text: 'Say' }), el('div', { class: 'say-opts' },
      opts.map((txt) => el('button', { class: `btn ${(o.emergency || []).includes(txt) ? 'danger' : ''}`, text: txt, onclick: () => speak(txt) }))));
  }
  function speak(text) {
    const t = thread();
    t.push({ who: 'out', text });
    const done = act(text, ctx);
    const isCommand = [...(cur.dialogueOptions.commands || []), ...(cur.dialogueOptions.emergency || [])].includes(text);
    t.push({ who: 'in', text: done || (isCommand ? 'Aye, Captain.' : pick(cur.dialogueOptions.pleasantries || ['Aye.'])) });
    document.dispatchEvent(new CustomEvent('dialogue-complete', { detail: { characterId: cur.id, dialogueId: 'first_contact' } }));
    renderThread();
  }
  renderList(); renderThread();
  return { update() {}, destroy() {} };
}
