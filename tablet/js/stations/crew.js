// Crew comms through the communicator pin (Star Trek style): crew on the left, the voice channel (transcript) in the middle, things to say on the right.
import { sim, toward } from '../sim.js';
import { el, toast } from '../util.js';
import { gameState } from '../persist.js';
import { toggleDock } from '../dock.js';
import { say as crewSay, takeHeld, unreadFor, unreadCount } from '../notify.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];

export const knownCrew = () => Object.values(gameState.getProperty('contacts.crew') || {})
  .filter((c) => c && c.id !== 'captain' && (c.known || unreadFor(c.id) > 0) && c.name);   // someone who has called in is reachable

const docked = () => sim.s.docked;
/** Dive to a depth, but never deeper than the water allows. */
function dive(want, lead) {
  const max = sim.deepest();
  if (max == null) { sim.setDepth(want); return `${lead} Making my depth ${want} metres.`; }
  if (max < 5) return `${lead} There is not enough water under us to dive here, Captain. The floor is only ${Math.round(sim.s.floor)} metres.`;
  if (want > max) { sim.setDepth(max); return `${lead} The floor is ${Math.round(sim.s.floor)} metres here, so ${max} metres is as deep as is safe. Making ${max}.`; }
  sim.setDepth(want); return `${lead} Making my depth ${want} metres.`;
}
const HEADINGS = [['North 000', 0], ['045', 45], ['East 090', 90], ['135', 135], ['South 180', 180], ['225', 225], ['West 270', 270], ['315', 315]];
const hdgText = (h) => String(Math.round(((h % 360) + 360) % 360)).padStart(3, '0');

// Orders that do something. Anything not listed here (or in PARAM) is shown in the "not yet" colour.
// Orders added here show up even in old saves (a save keeps its own copy of the crew's lines).
const EXTRA = { helm: ['Undock', 'Dock'] };
const ORDERS = {
  'Undock': () => { if (!docked()) return 'We are already undocked, Captain.'; setTimeout(() => toggleDock(), 600); return 'Undocking. Disconnecting shore power and releasing the clamps.'; },
  'Dock': () => {
    if (docked()) return 'We are already docked, Captain.';
    if (!sim.canDock()) return sim.s.at && sim.s.at.type === 'dock' ? 'We need to be at the surface and under 1.5 knots to dock, Captain.' : 'We need to be at a dock first, Captain.';
    setTimeout(() => toggleDock(), 600); return 'Docking. Aligning with the berth.';
  },
  'Status Report': () => { const s = sim.s; return `Battery ${Math.round(s.battery)}%, oxygen ${Math.round(s.oxygen)}%, hull ${Math.round(s.hull)}%. Depth ${Math.round(s.depth)} metres.`; },
  'Engineering status report': () => { const s = sim.s; return `Power draw ${Math.round(s.power)} kilowatts, battery ${Math.round(s.battery)}%, hull ${Math.round(s.hull)}%. All engineering stations report ready.`; },
  "Let's take her to sea": (ctx) => {
    const go = () => {
      const c = sim.safeHeading();
      if (!c || c.clearNm < 1) return 'I cannot find a mile of safe water in any direction, Captain. Better to plot a course ourselves.';
      sim.setHeading(c.heading); sim.setDepth(0); sim.setThrottle(0.3); sim.s.wpt = null;
      return `Heading ${hdgText(c.heading)}, on the surface at about four knots. ${c.clearNm >= 9.9 ? 'Clear water for ten miles' : `${c.clearNm.toFixed(1)} miles of clear water ahead`}. We will go deeper once we are in open water.`;
    };
    if (docked()) { setTimeout(() => toggleDock(() => crewSay('aria', go())), 600); return 'Undocking first, Captain. Then I will set a safe course out.'; }
    return go();
  },
  'Prepare for dive': () => { if (docked()) return 'We are still docked, Captain.'; return dive(100, 'Making ready.'); },
  "Let's go home": () => {
    const dock = sim.dockPoi(); if (!dock) return 'No dock on the charts.';
    if (docked()) return 'We are already at the dock, Captain.';
    sim.setWpt(dock); sim.setDepth(0); sim.setThrottle(0.5); return `Course set for ${dock.name}. ${toward(sim.s, dock).nm.toFixed(1)} nautical miles.`;
  },
  'Report to my quarters': (ctx) => { setTimeout(() => ctx.openScene('quarters'), 500); return 'Acknowledged. Meet you there.'; },
  'Sound General Alarm': () => { toast('GENERAL ALARM', 'error'); return 'General alarm sounded. All hands to stations.'; },
  'All stop': () => { sim.stop(); return 'All stop, aye.'; },
  'All stop!': () => { sim.stop(); return 'All stop, aye.'; },
  'All ahead flank': () => { if (docked()) return 'We are docked, Captain.'; sim.setThrottle(1); return 'All ahead flank!'; },
  'Emergency surface': () => { sim.setDepth(0); return 'Blowing ballast. Surfacing!'; },
  'Emergency surfaace': () => { sim.setDepth(0); return 'Blowing ballast. Surfacing!'; },
  'Emergency dive': () => { if (docked()) return 'We are docked, Captain.'; return dive(500, 'Diving!'); },
  'Full sensor sweep': () => { sim.s.sonar = true; sim.s.sweepUntil = sim.s.clock + 1800; sim.touch(); const n = sim.s.pois.filter((p) => toward(sim.s, p).nm <= 4).length; return `Active sweep. ${n} contact${n === 1 ? '' : 's'} within four miles, and the chart shows more detail for a minute.`; },
  'Deploy sensor buoys': () => `WSKRs launch from the Sensors station, Captain. ${sim.s.wskrs.length} of 4 are out. Once they are out they spread round us on their own, and you can send one to investigate a contact.`,
  'Passive listening mode': () => { sim.s.sonar = false; sim.touch(); return 'Sonar secured. Listening passively.'; },
  'Run crew diagnostics': () => 'Crew diagnostics complete. Everyone aboard is healthy, Captain.',
  'Request departure clearance': () => (docked() ? 'Woods Hole Harbor Control: you are cleared to depart at your discretion. Safe travels.' : 'Harbor Control: you are already underway, Captain.'),
};
// Orders that need a number. Each option runs when picked.
const PARAM = {
  'Make your depth': () => ({ title: 'Make your depth …', opts: [['Surface', 0], ['30 m', 30], ['100 m', 100], ['300 m', 300], ['500 m', 500], ['1000 m', 1000], ['2000 m', 2000]].map(([l, v]) => [l, () => (docked() ? 'We are docked, Captain.' : v ? dive(v, 'Aye.') : (sim.setDepth(0), 'Coming to the surface, aye.'))]) }),
  'Come left': () => ({ title: 'Come left …', opts: [5, 10, 20, 45, 90].map((d) => [`${d}°`, () => { sim.setHeading(sim.s.targetHeading - d); sim.s.wpt = null; return `Coming left to ${hdgText(sim.s.targetHeading)}, aye.`; }]) }),
  'Come right': () => ({ title: 'Come right …', opts: [5, 10, 20, 45, 90].map((d) => [`${d}°`, () => { sim.setHeading(sim.s.targetHeading + d); sim.s.wpt = null; return `Coming right to ${hdgText(sim.s.targetHeading)}, aye.`; }]) }),
  'Make your heading': () => ({ title: 'Make your heading …', opts: HEADINGS.map(([l, v]) => [l, () => { sim.setHeading(v); sim.s.wpt = null; return `Steering ${hdgText(v)}, aye.`; }]) }),
  'Make your speed': () => ({ title: 'Make your speed …', opts: [['All stop', 0], ['20%', 0.2], ['40%', 0.4], ['60%', 0.6], ['80%', 0.8], ['Flank', 1]].map(([l, v]) => [l, () => { if (docked()) return 'We are docked, Captain.'; if (v) sim.setThrottle(v); else sim.stop(); sim.s.wpt = null; return v ? `Speed ${Math.round(v * 100)} percent, aye.` : 'All stop, aye.'; }]) }),
};
PARAM['Make you speed'] = PARAM['Make your speed']; // old saves keep the typo
const works = (t, pleasantry) => pleasantry || t in ORDERS || t in PARAM;

// The conversation is kept while the game runs, so reopening the pin picks up where you left off.
const hist = {};      // crew id -> [{ you, text, stub, held }]
let lastId = null;
const TABS = [['Pleasantries', 'Talk'], ['Commands', 'Orders'], ['Emergency', 'Emergency']];

export function mount(body, ctx) {
  body.classList.add('comm-menu');
  const crew = knownCrew();
  let cur = null, tab = 'Commands', param = null;
  const mineP = () => gameState.getProperty('contacts.crew.captain.dialogueOptions.pleasantries') || ['Hello', 'Goodbye', 'Thank you'];
  const linesOf = (name) => {
    const o = (cur && cur.dialogueOptions) || {};
    if (name === 'Pleasantries') return mineP();
    if (name === 'Commands') return [...(o.commands || []), ...((EXTRA[cur && cur.id]) || []).filter((c) => !(o.commands || []).includes(c))];
    return o.emergency || [];
  };
  const tabsFor = () => TABS.filter(([n]) => linesOf(n).length);
  const line = (text, onclick, cls = '') => el('button', { class: `comm-line ${cls}`, text, onclick });
  const first = (c) => (c.id === 'executiveOfficer' ? 'ARIA' : c.name.replace(/^(Captain|Commander|Dr\.|Specialist|Engineer|Lieutenant) /, '').split(' ')[0]);
  const initial = (c) => c.name.replace(/^(Captain|Commander|Dr\.|Specialist|Engineer|Lieutenant) /, '')[0];
  const log = () => (hist[cur.id] ||= []);

  function select(c) {
    cur = c; lastId = c.id; param = null;
    const held = takeHeld(c.id);   // what they tried to tell the Captain while he was elsewhere
    if (held.length) log().push({ text: held.map((h) => `Captain, ${h.charAt(0).toLowerCase()}${h.slice(1)}`).join(' '), held: true });
    else if (c.id === 'executiveOfficer' && !log().length) log().push({ text: 'Welcome aboard, Captain. I am ARIA, your executive officer. How may I assist you?' });
    const t = tabsFor().map(([n]) => n); if (!t.includes(tab)) tab = t.includes('Commands') ? 'Commands' : t[0];
    render();
  }
  function say(text, done) {
    log().push({ you: text, text: done }); param = null;
    document.dispatchEvent(new CustomEvent('dialogue-complete', { detail: { characterId: cur.id, dialogueId: 'first_contact' } }));
    render();
  }
  function speak(text) {
    const o = cur.dialogueOptions || {};
    const isOrder = [...(o.commands || []), ...(EXTRA[cur.id] || []), ...(o.emergency || [])].includes(text);
    if (!isOrder) { say(text, pick(o.pleasantries || ['Aye.'])); return; }
    if (PARAM[text]) { param = { said: text, ...PARAM[text]() }; render(); return; }
    if (ORDERS[text]) { say(text, ORDERS[text](ctx)); return; }
    log().push({ you: text, text: 'That order is not available yet.', stub: true }); render();
  }

  function render() {
    if (!crew.length) { body.replaceChildren(el('div', { class: 'comm-page' }, el('div', { class: 'comm-head', text: 'No one else seems to be available right now…' }))); return; }
    const strip = el('div', { class: 'comm-crew' }, ...crew.map((c) => el('button', { class: 'comm-who' + (cur && cur.id === c.id ? ' on' : ''), 'aria-label': c.name, onclick: () => select(c) },
      el('span', { class: `avatar ${c.id === 'executiveOfficer' ? 'aria' : ''}`, text: initial(c) }), el('span', {}, el('b', { text: first(c) }), el('small', { text: c.role })),
      unreadFor(c.id) > 0 && el('span', { class: 'comm-badge', text: String(unreadFor(c.id)) }))));
    const entries = log().slice(-3);
    const talk = el('div', { class: 'comm-log' }, ...(entries.length ? entries.map((e) => el('div', { class: 'comm-entry' },
      e.you && el('div', { class: 'comm-you', text: `You: ${e.you}` }),
      el('div', { class: 'comm-reply' + (e.stub ? ' stub' : '') }, el('small', { text: cur.name }), el('p', { text: e.text })))) : [el('div', { class: 'comm-quiet', text: `${cur.name} is on the channel.` })]));
    let controls;
    if (param) controls = [el('div', { class: 'comm-head', text: param.title }), el('div', { class: 'comm-chips' }, ...param.opts.map(([l, fn]) => line(l, () => say(`${param.said}: ${l}`, fn(ctx)), 'chip'))), line('Belay that', () => { param = null; render(); }, 'back')];
    else controls = [el('div', { class: 'comm-tabs' }, ...tabsFor().map(([n, label]) => el('button', { class: `comm-tab${tab === n ? ' on' : ''}${n === 'Emergency' ? ' danger' : ''}`, text: label, onclick: () => { tab = n; render(); } }))),
      el('div', { class: 'comm-grid' }, ...linesOf(tab).map((t) => { const ok = works(t, tab === 'Pleasantries'); return line(t, () => speak(t), ok ? (tab === 'Emergency' ? 'danger' : '') : 'stub'); }))];
    body.replaceChildren(el('div', { class: 'comm-page' }, strip, cur ? talk : el('div', { class: 'comm-quiet', text: 'Who would you like to reach?' }),
      ...(cur ? controls : []), line("That's all. Out.", () => ctx.closeComm(), 'back out')));
    const lg = body.querySelector('.comm-log'); if (lg) lg.scrollTop = lg.scrollHeight;
  }
  const withMail = crew.slice().sort((a, b) => unreadFor(b.id) - unreadFor(a.id))[0];
  const start = (withMail && unreadFor(withMail.id) > 0 && withMail) || crew.find((c) => c.id === lastId) || crew[0];
  if (start) select(start); else render();
  return { update() {}, destroy() {} };
}
