// Crew comms through the communicator pin (Star Trek style): crew on the left, the voice channel (transcript) in the middle, things to say on the right.
import { pendingDecisions, decide } from '../aria.js';
import { fill } from '../player.js';
import { reply as chatReply } from '../chat.js';
import { sim, toward, wskrName, HUG_ALT, HUG_MIN_FLOOR } from '../sim.js';
import { GATES_ON } from '../unlocks.js';
import { research } from '../science.js';
import { el, toast } from '../util.js';
import { gameState } from '../persist.js';
import { crewIcon } from '../icons.js';
import { startReport } from '../transfer.js';
import { askDepth } from '../depthPad.js';
import { toggleDock } from '../dock.js';
import { say as crewSay, takeHeld, unreadFor, unreadCount, transcript, logLine } from '../notify.js';

// First meeting with each crew member. Spoken once, saved in progress.met.<id>. {captain} = "Captain Surname".
const INTRO = {
  executiveOfficer: 'Welcome aboard, {captain}. I am ARIA, the Aqua Nova\'s executive officer. I run the ship\'s systems, watch the sea around us and keep the log. I answer to you, and I will tell you plainly when I think something is unwise. Admiral Okafor speaks highly of you. I hope to earn the same opinion. Ask me for anything, any time.',
  helm: 'Marcus Chen, helm, {captain}. I have spent the fitting-out in the simulator with her, and I am glad to finally have water under the keel. Tell me where you want to go and I will get us there. I will also tell you if the floor comes up to meet us.',
  science: 'Dr. Samira Patel, {captain}. I look after the laboratory and the sick bay, so I suppose I am responsible for both the samples and the people. Bring me something strange from the deep and I will be happy. Bring me yourself with a headache and I will be almost as happy.',
  sensors: 'Alex Torres, sensors, {captain}. I look after the sonar and the WSKRs. If something is out there, big or small, I will find it before it finds us. Mostly.',
  engineering: 'Ryan Chen, chief engineer, {captain}. No relation to Marcus. Everyone asks. The reactor, the pumps and the hull are mine, so please bring her back in one piece. If you hear a noise you do not like, call me before you worry.',
  security: 'Lieutenant Daniel Kim, head of security, {captain}. Nothing is wrong, and I intend to keep it that way. If that changes, you will hear it from me first.',
  communications: 'Nicole Brooks, communications, {captain}. Every message in and out of this boat comes through me. Satellite, laser, radio, whatever reaches us. I will tell you when O.E.R.A. calls.'
};

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
const EXTRA = { helm: ['Undock', 'Dock', 'Hug the floor', 'Stop hugging the floor', 'Engage super cruise', 'Disengage super cruise'], sensors: ['Set up a relay', 'Stand down the relay'], communications: ['Transmit a report'] };
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
  'Hug the floor': () => { const r = sim.setHug(true); return r.ok ? `Hugging the floor, aye. I will hold ${HUG_ALT} metres off the bottom and follow it.` : r.why === 'docked' ? 'We are docked, Captain.' : 'Not enough water here to hug the floor, Captain. I need at least ' + HUG_MIN_FLOOR + ' metres under us.'; },
  'Stop hugging the floor': () => { if (!sim.s.hug) return 'We are not following the floor, Captain.'; sim.setHug(false); return `Leaving the floor, aye. Holding ${Math.round(sim.s.depth)} metres.`; },
  'Engage super cruise': () => { const r = sim.setCruise(true); return r.ok ? 'Super cruise engaged. Hold on to something, Captain.' : r.why === 'docked' ? 'We are docked, Captain.' : r.why === 'power' ? 'We have no power for it, Captain.' : 'Not enough deep water ahead, Captain. We need 120 metres under us for the next nine miles.'; },
  'Disengage super cruise': () => { sim.setCruise(false); return 'Super cruise disengaged. Back to normal cruise.'; },
  'Set up a relay': () => {
    if (GATES_ON && !research.has('wskr-orders')) return 'We have not got the relay procedures yet, Captain. Science needs to finish the WSKR orders research.';
    const r = sim.setupRelay();
    if (r.ok) return `${wskrName(r.wskr)} is going to the surface to follow us as a relay, Captain. Once it is up, comms and a GPS fix work at any depth.`;
    return r.why === 'already' ? 'We already have a relay up, Captain.' : r.why === 'none' ? 'No WSKRs are out. Launch one from the Sensors station first.' : 'Every WSKR is busy, Captain. Recall one or let it finish.';
  },
  'Stand down the relay': () => { const r = sim.standDownRelay(); return r.ok ? `${wskrName(r.wskr)} is rejoining the formation.` : 'There is no relay up, Captain.'; },
  'Transmit a report': () => {
    const r = startReport();
    if (r.ok) return `Sending it on ${r.L.label}, Captain. About ${Math.ceil(r.eta)} seconds to upload, then we wait for O.E.R.A. to answer. The progress bar is on your screen.`;
    if (r.why === 'busy') return 'A transmission is already under way, Captain.';
    return `No ${r.L.label} link, Captain: ${r.st.status.toLowerCase()}. The antenna must be near the surface. Raise it, or pick another source on the Comms controls.`;
  },
  'Passive listening mode': () => { sim.s.sonar = false; sim.touch(); return 'Sonar secured. Listening passively.'; },
  'Run crew diagnostics': () => 'Crew diagnostics complete. Everyone aboard is healthy, Captain.',
  'Request departure clearance': () => (docked() ? 'Woods Hole Harbor Control: you are cleared to depart at your discretion. Safe travels.' : 'Harbor Control: you are already underway, Captain.'),
};
// Orders that need a number. Each option runs when picked.
const PARAM = {
  'Make your depth': () => ({ title: 'Make your depth …', opts: [['Surface', 0], ['30 m', 30], ['100 m', 100], ['300 m', 300], ['500 m', 500], ['1000 m', 1000], ['2000 m', 2000]].map(([l, v]) => [l, () => (docked() ? 'We are docked, Captain.' : v ? dive(v, 'Aye.') : (sim.setDepth(0), 'Coming to the surface, aye.'))]).concat([['Custom depth …', null, (give) => askDepth((v) => give(docked() ? 'We are docked, Captain.' : v ? dive(v, 'Aye.') : (sim.setDepth(0), 'Coming to the surface, aye.')), 'Make your depth')]]) }),
  'Come left': () => ({ title: 'Come left …', opts: [5, 10, 20, 45, 90].map((d) => [`${d}°`, () => { sim.setHeading(sim.s.targetHeading - d); sim.s.wpt = null; return `Coming left to ${hdgText(sim.s.targetHeading)}, aye.`; }]) }),
  'Come right': () => ({ title: 'Come right …', opts: [5, 10, 20, 45, 90].map((d) => [`${d}°`, () => { sim.setHeading(sim.s.targetHeading + d); sim.s.wpt = null; return `Coming right to ${hdgText(sim.s.targetHeading)}, aye.`; }]) }),
  'Make your heading': () => ({ title: 'Make your heading …', opts: HEADINGS.map(([l, v]) => [l, () => { sim.setHeading(v); sim.s.wpt = null; return `Steering ${hdgText(v)}, aye.`; }]) }),
  'Make your speed': () => ({ title: 'Make your speed …', opts: [['All stop', 0], ['20%', 0.2], ['40%', 0.4], ['60%', 0.6], ['80%', 0.8], ['Flank', 1]].map(([l, v]) => [l, () => { if (docked()) return 'We are docked, Captain.'; if (v) sim.setThrottle(v); else sim.stop(); sim.s.wpt = null; return v ? `Speed ${Math.round(v * 100)} percent, aye.` : 'All stop, aye.'; }]) }),
};
PARAM['Make you speed'] = PARAM['Make your speed']; // old saves keep the typo
const works = (t, pleasantry) => pleasantry || t in ORDERS || t in PARAM;

export function mount(body, ctx) {
  body.classList.add('comm-menu');
  const crew = knownCrew();
  let page = 'crew', cur = null, cat = null, reply = null, greeted = false, param = null;
  const mineP = () => gameState.getProperty('contacts.crew.captain.dialogueOptions.pleasantries') || ['Hello', 'Goodbye', 'Thank you'];
  const cats = () => {
    const o = (cur && cur.dialogueOptions) || {};
    const cmds = [...(o.commands || []), ...((EXTRA[cur && cur.id]) || []).filter((c) => !(o.commands || []).includes(c))];
    return [['Pleasantries', mineP(), 'Make small talk'], ['Commands', cmds, 'Give an order'], ['Emergency', o.emergency || [], 'Report an emergency']].filter(([, l]) => l.length);
  };
  const line = (text, onclick, cls = '') => el('button', { class: `comm-line ${cls}`, text, onclick });
  const first = (c) => (c.id === 'executiveOfficer' ? 'ARIA' : c.name.replace(/^(Captain|Commander|Dr\.|Specialist|Engineer|Lieutenant) /, '').split(' ')[0]);
  const initial = (c) => c.name.replace(/^(Captain|Commander|Dr\.|Specialist|Engineer|Lieutenant) /, '')[0];

  function say(text, done, you = true) {
    if (you && text) logLine(cur.id, 'you', text);
    if (done) logLine(cur.id, 'crew', done);
    reply = { said: text, text: done };
    page = 'reply';
    document.dispatchEvent(new CustomEvent('dialogue-complete', { detail: { characterId: cur.id, dialogueId: 'first_contact' } }));
    render();
  }
  function speak(text) {
    const o = cur.dialogueOptions || {};
    logLine(cur.id, 'you', text);   // before the order runs, so the running notes it starts land after it
    const isOrder = [...(o.commands || []), ...(EXTRA[cur.id] || []), ...(o.emergency || [])].includes(text);
    if (!isOrder) { say(text, chatReply(cur.id, text, { mail: (gameState.getProperty('mission.inbox') || []).filter((m) => !m.read).length }) || fill(pick(o.pleasantries || ['Aye.'])), false); return; }
    if (PARAM[text]) { const p = PARAM[text](); param = { said: text, ...p }; page = 'param'; render(); return; }
    if (ORDERS[text]) { say(text, ORDERS[text](ctx), false); return; }
    reply = { said: text, text: 'That order is not available yet.', stub: true }; page = 'reply'; render();
  }

  // Earlier lines scroll above; the newest thing the crew member said is always the big reply block below.
  const logView = (n, dropLast = false) => {
    let L = transcript(cur.id).slice(-n); if (dropLast && L.length && L[L.length - 1].from === 'crew') L = L.slice(0, -1);
    if (!L.length) return null;
    const box = el('div', { class: 'comm-log' }, ...L.map((l) => l.from === 'you' ? el('div', { class: 'cl you', text: `You: ${l.text}` }) : el('div', { class: 'cl crew' }, el('small', { text: first(cur) }), l.text)));
    requestAnimationFrame(() => { box.scrollTop = box.scrollHeight; });
    return box;
  };
  const onLine = (e) => { if (cur && e.detail.id === cur.id && (page === 'reply' || page === 'cat')) render(); };
  document.addEventListener('crew-line', onLine);

  function render() {
    let kids;
    if (!crew.length) kids = [el('div', { class: 'comm-head', text: 'No one else seems to be available right now…' })];
    else if (page === 'crew') {
      kids = [el('div', { class: 'comm-head', text: 'Who would you like to reach out to?' }),
        unreadCount() > 0 && el('div', { class: 'comm-waiting', text: 'You have messages waiting.' }),
        ...crew.map((c) => el('button', { class: 'comm-line comm-who', onclick: () => {
          cur = c; cat = null;
          const met = !!gameState.getProperty('progress.met.' + c.id);
          if (c.id === 'executiveOfficer' && pendingDecisions().length) { gameState.updateProperty('progress.met.' + c.id, true); greeted = true; page = 'decision'; render(); return; }   // ARIA is waiting for an answer
          if (INTRO[c.id] && !met) { gameState.updateProperty('progress.met.' + c.id, true); greeted = true; logLine(c.id, 'crew', fill(INTRO[c.id])); reply = { said: null, text: fill(INTRO[c.id]) }; page = 'reply'; render(); return; }   // first meeting comes before anything they were holding back
          const held = takeHeld(c.id);   // what they tried to tell the Captain while he was elsewhere
          if (held.length) { greeted = true; reply = { said: null, text: held.map((h) => (/^Captain\b/.test(h) ? h : `Captain, ${h.charAt(0).toLowerCase()}${h.slice(1)}`)).join(' '), held: true }; page = 'reply'; } else page = 'cat';
          render();
        } }, el('span', { class: `avatar ${c.id === 'executiveOfficer' ? 'aria' : ''}` }, crewIcon(c.id) || initial(c)), el('span', {}, el('b', { text: c.name }), el('small', { text: c.role })), unreadFor(c.id) > 0 && el('span', { class: 'comm-badge', text: String(unreadFor(c.id)) })))];
    } else if (page === 'cat') {
      kids = [logView(5), el('div', { class: 'comm-head', text: `What is on your mind, Captain?` }), el('div', { class: 'comm-who-label', text: `${cur.name} · ${cur.role}` }),
        ...cats().map(([n, l, label]) => line(label, () => { cat = [n, l, label]; page = 'lines'; render(); }, n === 'Emergency' ? 'danger' : '')),
        line('Actually, let me call someone else …', () => { page = 'crew'; render(); }, 'back')];
    } else if (page === 'lines') {
      kids = [el('div', { class: 'comm-head', text: cat[0] === 'Pleasantries' ? `Say to ${first(cur)}…` : cat[0] === 'Commands' ? `Order to ${first(cur)}…` : `Tell ${first(cur)}…` }),
        ...cat[1].map((t) => { const ok = works(t, cat[0] === 'Pleasantries'); return line(t, () => speak(t), ok ? (cat[0] === 'Emergency' ? 'danger' : '') : 'stub'); }),
        line('Belay that …', () => { page = 'cat'; render(); }, 'back')];
    } else if (page === 'decision') {
      const d = pendingDecisions()[0];
      if (!d) { page = 'cat'; return render(); }
      kids = [el('div', { class: 'comm-reply' }, el('small', { text: cur.name }), el('p', { text: fill(d.text) })),
        ...d.options.map((o) => line(o.label, () => { say(o.label, decide(d.id, o.id)); }, 'decide')),
        line('Give me a moment …', () => { page = 'crew'; render(); }, 'back')];
    } else if (page === 'param') {
      kids = [el('div', { class: 'comm-head', text: param.title }),
        el('div', { class: 'comm-chips' }, ...param.opts.map(([l, fn, custom]) => line(l, () => custom ? custom((text) => say(`${param.said}: ${l.replace(/ …$/, '').replace(/^Custom /, '')}`, text)) : say(`${param.said}: ${l}`, fn(ctx)), 'chip'))),
        line('Belay that …', () => { page = 'lines'; render(); }, 'back')];
    } else {
      const T = transcript(cur.id), last = T[T.length - 1], live = !reply.stub && !reply.held && last && last.from === 'crew' ? last.text : null;
      kids = [!reply.stub && logView(8, true),
        reply.said && !live && el('div', { class: 'comm-you', text: `You: ${reply.said}` }),
        el('div', { class: 'comm-reply' + (reply.stub ? ' stub' : '') }, el('small', { text: cur.name }), el('p', { text: live || reply.text })),
        line(reply.said ? `One more thing, ${first(cur)} …` : `I need something, ${first(cur)} …`, () => { page = 'cat'; render(); }, 'back'),
        line('Someone else …', () => { page = 'crew'; render(); }, 'back'),
        line("That's all. Out.", () => ctx.closeComm(), 'back')];
    }
    body.replaceChildren(el('div', { class: 'comm-page' }, ...kids.filter(Boolean)));
  }
  render();
  return { update() {}, destroy() { document.removeEventListener('crew-line', onLine); } };
}
