import { sim, toward } from '../sim.js';
import { el, toast } from '../util.js';

let crewCache = null;
const threads = {};

export async function loadCrew() {
  if (crewCache) return crewCache;
  try {
    const res = await fetch(new URL('../../../data/contacts.json', import.meta.url));
    crewCache = Object.values((await res.json()).crew);
  } catch (e) { console.error('Could not load contacts.json', e); crewCache = []; }
  return crewCache;
}

function reply(member, text, ctx) {
  const s = sim.s, dock = sim.dockPoi();
  switch (text) {
    case 'Status Report': return `Battery ${Math.round(s.battery)}%, oxygen ${Math.round(s.oxygen)}%, hull ${Math.round(s.hull)}%. Depth ${Math.round(s.depth)} m.`;
    case "Let's take her to sea": sim.setThrottle(0.4); sim.setDepth(30); sim.setHeading(60); return 'Casting off. Heading 060, thirty metres.';
    case "Let's go home": if (dock) { sim.setWpt(dock); sim.setDepth(0); sim.setThrottle(0.5); const t = toward(sim.s, dock); return `Course set for ${dock.name}. ${t.nm.toFixed(1)} nm.`; } return 'No dock on the charts.';
    case 'Report to my quarters': setTimeout(() => ctx.openScene('quarters'), 400); return 'Acknowledged. Standing by in quarters.';
    case 'Sound General Alarm': toast('GENERAL ALARM', 'error'); return 'General alarm sounded. All hands to stations.';
    case 'Goodbye': case 'That is all for now': return 'Understood.';
    case 'Thank you': return 'You are welcome.';
    default: return member.dialogueOptions.pleasantries.find((p) => p.endsWith('?') || p.endsWith('.')) || 'Aye.';
  }
}

export function mount(body, ctx) {
  body.classList.add('comms-st');
  const crew = ctx.crew.filter((c) => c.id !== 'captain');
  let cur = crew.find((c) => c.id === 'executiveOfficer') || crew[0];
  const list = el('div', { class: 'crew-list' });
  const msgs = el('div', { class: 'msgs' }), say = el('div', { class: 'say' });
  body.append(list, el('div', { class: 'thread' }, msgs, say));

  function renderList() {
    list.replaceChildren(...crew.map((c) => el('button', { class: `crew-btn ${c === cur ? 'on' : ''}`, onclick: () => { cur = c; renderList(); renderThread(); } },
      el('span', { class: 'avatar', text: c.name.replace(/^(Captain|Commander) /, '')[0] }), el('span', {}, el('b', { text: c.name }), el('small', { text: c.role })))));
  }
  function renderThread() {
    const t = (threads[cur.id] ||= []);
    msgs.replaceChildren(...(t.length ? t : [el('div', { class: 'empty', text: `Channel open to ${cur.name}.` })]).map((m) => m.nodeType ? m : el('div', { class: `bubble ${m.who}` }, el('small', { text: m.who === 'in' ? cur.name : 'You' }), m.text)));
    msgs.scrollTop = msgs.scrollHeight;
    const o = cur.dialogueOptions, opts = [...o.commands, ...o.emergency, ...o.pleasantries.filter((p) => !p.includes('?') && !p.endsWith('.'))];
    say.replaceChildren(el('div', { class: 'lbl', text: 'Say' }), el('div', { class: 'say-opts' }, opts.map((txt) => el('button', { class: `btn ${o.emergency.includes(txt) ? 'danger' : ''}`, text: txt, onclick: () => speak(txt) }))));
  }
  function speak(text) {
    const t = (threads[cur.id] ||= []);
    t.push({ who: 'out', text });
    t.push({ who: 'in', text: reply(cur, text, ctx) });
    document.dispatchEvent(new CustomEvent('dialogue-complete', { detail: { characterId: cur.id === 'executiveOfficer' ? 'area_command' : cur.id, dialogueId: text } }));
    renderThread();
  }
  renderList(); renderThread();
  return { update() {}, destroy() {} };
}
