// Crew comms through the communicator pin (Star Trek style): crew on the left, the voice channel (transcript) in the middle, things to say on the right.
import { pendingDecisions, decide } from '../aria.js';
import { fill } from '../player.js';
import { reply as chatReply, statusReport } from '../chat.js';
import { startSweep, setSource } from '../sonar.js';
import { sim, toward, wskrName, HUG_ALT, HUG_MIN_FLOOR, PERISCOPE_M, cruiseWhy, MAX_KT } from '../sim.js';
import { records } from '../trials.js';
import { GATES_ON } from '../unlocks.js';
import { research } from '../science.js';
import { el, toast } from '../util.js';
import { gameState } from '../persist.js';
import { crewIcon } from '../icons.js';
import { portrait, scenePic, SCENE_BOX } from '../art.js';
import { startReport } from '../transfer.js';
import { topicsFor, askTopic } from '../topics.js';
import { guidesFor, askGuide } from '../howto.js';
import { askDepth } from '../depthPad.js';
import { openSearchDialog } from '../searchDialog.js';
import { orderTern, callBackTern, ternReport, launchTern, destinations } from '../tern.js';
import { TERN_SAFE_M, BAY_SAFE_KT, shuttle, bayDoorsOpen, setBayOverride, launchAllWskrs, bay as bayState } from '../bayops.js';
import { toggleDock } from '../dock.js';
import { alarmOn, soundAlarm, secureAlarm } from '../engineering.js';
import * as E from '../engineering.js';
import { say as crewSay, takeHeld, unreadFor, unreadCount, transcript, logLine, setOpenCrew } from '../notify.js';

// First meeting with each crew member. Spoken once, saved in progress.met.<id>. {captain} = "Captain Surname".
const INTRO = {
  executiveOfficer: 'Welcome aboard, {captain}. I am ARIA, the Aqua Nova\'s executive officer. I run the ship\'s systems, watch the sea around us and keep the log. I answer to you, and I will tell you plainly when I think something is unwise. Admiral Okafor speaks highly of you. I hope to earn the same opinion. Ask me for anything, any time.',
  helm: 'Marcus Chen, helm, {captain}. I have spent the fitting-out in the simulator with her, and I am glad to finally have water under the keel. Tell me where you want to go and I will get us there. I will also tell you if the floor comes up to meet us.',
  science: 'Dr. Samira Patel, {captain}. I look after the laboratory and the sick bay, so I suppose I am responsible for both the samples and the people. Bring me something strange from the deep and I will be happy. Bring me yourself with a headache and I will be almost as happy.',
  sensors: 'Alex Torres, sensors, {captain}. I look after the sonar and the WSKRs. If something is out there, big or small, I will find it before it finds us. Mostly.',
  engineering: 'Ryan Doyle, chief engineer, {captain}. Boston born, twenty years in merchant engine rooms, and this is the first ship I ever loved on sight. The reactor, the pumps and the hull are mine, so please bring her back in one piece. If you hear a noise you do not like, call me before you worry.',
  security: 'Lieutenant Andre Washington, head of security, {captain}. Twelve years a Marine, and I still stand up when an officer walks in, so bear with me. Nothing is wrong on this boat, and I intend to keep it that way. If that changes, you hear it from me first.',
  communications: 'Nicole Brooks, communications, {captain}. Every message in and out of this boat comes through me. Satellite, laser, radio, whatever reaches us. I will tell you when O.E.R.A. calls.'
};

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const GREET = { executiveOfficer: 'Yes, Captain?', helm: 'Helm here, Captain.', sensors: 'Sensors, Captain.', engineering: 'Engineering. What do you need?', science: 'Patel here, Captain.', communications: 'Comms, Captain. Go ahead.', security: 'Washington. Go ahead, Captain.' };   // when the line opens

export const knownCrew = () => Object.values(gameState.getProperty('contacts.crew') || {})
  .filter((c) => c && c.id !== 'captain' && (c.known || unreadFor(c.id) > 0) && c.name);   // someone who has called in is reachable

const docked = () => sim.s.docked;
/** Dive to a depth, but never deeper than the water allows. */
function dive(want, lead) {
  const max = sim.deepest();
  if (max == null) { sim.setDepth(want); return `${lead} Making my depth ${want} metres.`; }
  if (max < 5) return `${lead} There is not enough water under us to dive here, Captain. The floor is only ${Math.round(sim.s.floor)} metres.`;
  if (want > max) { sim.setDepth(want); return `${lead} The floor is ${Math.round(sim.s.floor)} metres here, so I will hold ${max} metres for now and go on down to ${want} when the floor drops away.`; }   // the order stays: terrain protection holds us off the floor (owner, 2026-11-28: he forgot the 300 m order)
  sim.setDepth(want); return `${lead} Making my depth ${want} metres.`;
}
const HEADINGS = [['North 000', 0], ['045', 45], ['East 090', 90], ['135', 135], ['South 180', 180], ['225', 225], ['West 270', 270], ['315', 315]];
const hdgText = (h) => String(Math.round(((h % 360) + 360) % 360)).padStart(3, '0');

// Orders that do something. Anything not listed here (or in PARAM) is shown in the "not yet" colour.
// Orders added here show up even in old saves (a save keeps its own copy of the crew's lines).
const unreadMail = () => (gameState.getProperty('mission.inbox') || []).filter((m) => !m.read).length;
const reportFor = (ctx, id) => statusReport(id, { mail: unreadMail(), objective: (() => { try { const o = ctx.objectives().find((x) => !x.done); return o ? o.text : null; } catch (e) { return null; } })() });
const ORDERS = {
  'Undock': () => { if (!docked()) return 'We are already undocked, Captain.'; setTimeout(() => toggleDock(), 600); return 'Undocking. Disconnecting shore power and releasing the clamps.'; },
  'Dock': () => {
    if (docked()) return 'We are already docked, Captain.';
    if (!sim.canDock()) return sim.s.at && sim.s.at.type === 'dock' ? 'We need to be at the surface and under 1.5 knots to dock, Captain.' : 'We need to be at a dock first, Captain.';
    setTimeout(() => toggleDock(), 600); return 'Docking. Aligning with the berth.';
  },
  'Status Report': (ctx, id) => reportFor(ctx, id || 'executiveOfficer'),
  'Status report': (ctx, id) => reportFor(ctx, id),
  'Engineering status report': (ctx) => reportFor(ctx, 'engineering'),
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
  'Make periscope depth': () => (docked() ? 'We are docked, Captain.' : dive(PERISCOPE_M, 'Periscope depth, aye.')),
  "Let's go home": () => {
    const dock = sim.dockPoi(); if (!dock) return 'No dock on the charts.';
    if (docked()) return 'We are already at the dock, Captain.';
    sim.setWpt(dock); sim.setDepth(0); sim.setThrottle(0.5); return `Course set for ${dock.name}. ${toward(sim.s, dock).nm.toFixed(1)} nautical miles.`;
  },
  'XO has the con': (ctx) => { setTimeout(() => ctx.openScene('sleepAway'), 400); return 'Aye, Captain. I have the con. Choose how long I keep it.'; },
  'All stop': () => { sim.stop(); return 'All stop, aye.'; },
  'All ahead flank': () => { if (docked()) return 'We are docked, Captain.'; sim.setThrottle(1); return 'All ahead flank!'; },
  'Sound General Alarm': () => (soundAlarm('captain').ok ? 'Sounding the general alarm. All hands to emergency stations! Damage control teams are closing up, Captain.' : 'The general alarm is already sounding, Captain.'),
  'Secure from General Alarm': () => { const r = secureAlarm(); return r.ok ? 'Securing from general alarm. Normal lighting is back and the crew are standing down, Captain.' : r.why === 'casualty' ? 'Not yet, Captain. We still have fire or flooding aboard.' : 'There is no alarm sounding, Captain.'; },
  'Emergency blow': () => { const r = E.blow(); return r.ok ? 'Emergency blow! Air into every tank. We are going up fast, Captain.' : { air: 'Not enough air in the bank for an emergency blow, Captain. It recharges near the surface.', offline: 'The ballast system is down, Captain. I cannot blow.', valve: 'The air bank valve is shut, Captain. Open it on the engineering computer.', surfaced: 'We are already on the surface, Captain.' }[r.why] || 'I cannot blow the tanks right now, Captain.'; },
  'Discharge fire suppression': () => { const r = E.discharge(); return r.ok ? 'Suppression discharged. The fire is out, Captain.' : { nofire: 'There is no fire, Captain.', agent: 'We are out of suppression agent, Captain.', offline: 'Fire suppression is down, Captain.', valve: 'The suppression main valve is shut, Captain.' }[r.why] || 'I cannot discharge right now, Captain.'; },
  'Close the bulkheads': () => { E.setBulkhead('fwd', false); E.setBulkhead('aft', false); return 'Bulkheads closed fore and aft, Captain. Any flooding is contained.'; },
  'Open the bulkheads': () => { E.setBulkhead('fwd', true); E.setBulkhead('aft', true); return 'Bulkheads open, Captain.'; },
  'Emergency dive': () => { if (docked()) return 'We are docked, Captain.'; return dive(500, 'Diving!'); },
  'Full sensor sweep': () => { setSource('ship'); return startSweep() ? 'Full mapping sweep, Captain. About forty seconds to go round, and it draws a lot of power. The chart fills in out to twelve miles.' : 'We cannot sweep right now, Captain.'; },
  'Launch all WSKRs': () => {
    const r = launchAllWskrs();
    if (r.ok) return `Launching ${r.count === 1 ? 'the last WSKR' : `all ${r.count} WSKRs`}, aye. The bay takes a minute each, so they go out one after another.`;
    return { docked: 'We are docked, Captain. Undock first.', fast: `We are over ${BAY_SAFE_KT} knots, Captain. Slow down and the bay will launch them.`, full: 'Every WSKR is already out, Captain.', charge: 'None of the WSKRs in the rack has the charge to launch, Captain. They need 20 percent.' }[r.why] || 'The bay cannot launch them now, Captain.';
  },
  'Recall all WSKRs': () => { const n = sim.recallWskrs(); return n ? `Recalling ${n === 1 ? 'the WSKR' : `all ${n} WSKRs`}, aye. The bay takes each one aboard when we are under ${BAY_SAFE_KT} knots.` : 'No WSKRs are out, Captain.'; },
  'Hug the floor': () => { const r = sim.setHug(true); return r.ok ? `Hugging the floor, aye. I will hold ${HUG_ALT} metres off the bottom and follow it.` : r.why === 'docked' ? 'We are docked, Captain.' : 'Not enough water here to hug the floor, Captain. I need at least ' + HUG_MIN_FLOOR + ' metres under us.'; },
  'Stop hugging the floor': () => { if (!sim.s.hug) return 'We are not following the floor, Captain.'; sim.setHug(false); return `Leaving the floor, aye. Holding ${Math.round(sim.s.depth)} metres.`; },
  'Engage super cruise': () => { const r = sim.setCruise(true); return r.ok ? 'Spooling up the drive, Captain. Eight seconds.' : cruiseWhy(r.why); },
  'Disengage super cruise': () => { sim.setCruise(false); return 'Out of super cruise, aye. Easing back to the jets.'; },
  'Set up a relay': () => {
    if (GATES_ON && !research.has('wskr-orders')) return 'We have not got the relay procedures yet, Captain. Science needs to finish the WSKR orders research.';
    const r = sim.setupRelay();
    if (r.ok) return `${wskrName(r.wskr)} is going to the surface to follow us as a relay, Captain. Once it is up, comms and a GPS fix work at any depth.`;
    return r.why === 'already' ? 'We already have a relay up, Captain.' : r.why === 'none' ? 'No WSKRs are out. Launch one from the Sensors station first.' : 'Every WSKR is busy, Captain. Recall one or let it finish.';
  },
  'Stand down the relay': () => { const r = sim.standDownRelay(); return r.ok ? `${wskrName(r.wskr)} is rejoining the formation.` : 'There is no relay up, Captain.'; },
  'Transmit a report': () => {
    const r = startReport();
    if (r.ok) return `Sending it on ${r.L.label}, Captain. About ${Math.ceil(r.eta)} seconds to upload. The progress bar is on the Comms screen.`;
    if (r.why === 'busy') return 'A transmission is already under way, Captain.';
    return `No ${r.L.label} link, Captain: ${r.st.status.toLowerCase()}. The antenna must be near the surface. Raise it, or pick another source on the Comms controls.`;
  },
  'Go passive': () => { sim.setSonarMode('passive'); return 'Active sonar off, Captain. Passive, listening only.'; },
  'Go active': () => { sim.setSonarMode('active'); return 'Going active, Captain. We will hear a long way out, but everyone out there will hear us too. Poachers will run, and anything hostile will know where we are.'; },
  'Sonar off': () => { sim.setSonarMode('off'); return 'Sonar off, Captain. We are deaf past a mile, and we will lose our contacts.'; },
  'Override the bay speed limit': () => (setBayOverride(true) ? 'Aye, Captain. The bay speed limit is overridden until the doors close.' : 'The outer doors are closed, Captain. No limit to override.'),
  'Restore the bay speed limit': () => (setBayOverride(false) ? 'Bay speed limit restored, Captain.' : 'The outer doors are closed, Captain.'),
  'Crew health report': () => 'Everyone is fit for duty, Captain. A couple of stiff necks from the bunks, nothing I need to see twice. Morale is good.',
  'Request departure clearance': () => (docked() ? 'Woods Hole Harbour Control has cleared us to depart at your discretion, Captain. Commander Mitchell says safe travels, and to bring her back in one piece.' : 'We are already under way, Captain. The harbour knows.'),
};
// Orders that need a number. Each option runs when picked.
const PARAM = {
  'Make your depth': () => ({ title: 'Make your depth …', opts: [['Surface', 0], ['30 m', 30], ['100 m', 100], ['300 m', 300], ['500 m', 500], ['1000 m', 1000], ['2000 m', 2000]].map(([l, v]) => [l, () => (docked() ? 'We are docked, Captain.' : v ? dive(v, 'Aye.') : (sim.setDepth(0), 'Coming to the surface, aye.'))]).concat([['Custom depth …', null, (give) => askDepth((v) => give(docked() ? 'We are docked, Captain.' : v ? dive(v, 'Aye.') : (sim.setDepth(0), 'Coming to the surface, aye.')), 'Make your depth')]]) }),
  'Come left': () => ({ title: 'Come left …', opts: [5, 10, 20, 45, 90].map((d) => [`${d}°`, () => { sim.setHeading(sim.s.targetHeading - d); sim.s.wpt = null; return `Coming left to ${hdgText(sim.s.targetHeading)}, aye.`; }]) }),
  'Come right': () => ({ title: 'Come right …', opts: [5, 10, 20, 45, 90].map((d) => [`${d}°`, () => { sim.setHeading(sim.s.targetHeading + d); sim.s.wpt = null; return `Coming right to ${hdgText(sim.s.targetHeading)}, aye.`; }]) }),
  'Make your heading': () => ({ title: 'Make your heading …', opts: HEADINGS.map(([l, v]) => [l, () => { sim.setHeading(v); sim.s.wpt = null; return `Steering ${hdgText(v)}, aye.`; }]) }),
  'Make your speed': () => {   // in knots (owner, 2026-11-27), with the fastest the jets were run in the trials when that beat their rating
    const rec = records().speed, kts = [['All stop', 0], ['5 knots', 5], ['8 knots (bay safe)', 8], ['10 knots', 10], [`Full: ${MAX_KT} knots`, MAX_KT], ...(rec > MAX_KT ? [[`Max tested: ${rec} knots`, rec]] : [])];
    return { title: 'Make your speed …', opts: kts.map(([l, kt]) => [l, () => {
      if (docked()) return 'We are docked, Captain.';
      if (!kt) { sim.stop(); return 'All stop, aye.'; }
      if (kt > MAX_KT) { sim.setThrottle(1, { kind: 'speed', f: kt / MAX_KT }); return `${kt} knots, aye. That is past the jets' rating, Captain, but we have done it before.`; }
      sim.setThrottle(kt / MAX_KT); return `Making ${kt} knots, aye.`;
    }]) };
  },
};
// The Tern: by radio through Nicole when she is out, through Security when she is in the bay.
const destOpts = (run) => destinations().map((d) => [`Go to ${d.name}`, () => run(d)]);
PARAM['Order the Tern to'] = () => ({ title: 'Order the Tern to …', opts: [
  ['Hold position', () => orderTern({ kind: 'hold' }).text],
  ['Surface', () => orderTern({ kind: 'surface' }).text],
  ['Set up a relay', () => orderTern({ kind: 'relay' }).text],
  ['Return to mission', () => orderTern({ kind: 'resume' }).text],
  ['Make depth …', () => ({ title: 'Make depth …', opts: [10, 50, 100, 200, 400, 600, TERN_SAFE_M].map((m) => [`${m} m`, () => orderTern({ kind: 'depth', m }).text]) })],
  ['Make heading …', () => ({ title: 'Make heading …', opts: HEADINGS.map(([l, v]) => [l, () => orderTern({ kind: 'heading', deg: v }).text]) })],
  ['Make speed …', () => ({ title: 'Make speed …', opts: [['All stop', 0], ['5 knots', 5], ['10 knots', 10], ['15 knots', 15], ['20 knots', 20]].map(([l, kt]) => [l, () => orderTern({ kind: 'speed', kt }).text]) })],
  ['Go to …', () => ({ title: 'Go to …', opts: destOpts((d) => orderTern({ kind: 'goto', dest: d }).text) })],
  ['Run a search pattern …', () => { openSearchDialog({ craft: 'tern' }); return 'Set the pattern and the datum, Captain. I will pass it to her.'; }]] });
PARAM['Launch the Tern to'] = () => ({ title: 'Launch the Tern to …', opts: [
  ['Supply run: closest dock', () => launchTern({ kind: 'supply' }).text],
  ['Search and rescue', () => launchTern({ kind: 'sar' }).text],
  ['Go to …', () => ({ title: 'Go to …', opts: destOpts((d) => launchTern({ kind: 'goto', dest: d }).text) })]] });
ORDERS['Call back the Tern'] = () => callBackTern().text;
ORDERS['Report on the Tern'] = () => ternReport();
// What the Captain says when picking an order: conversational, not a menu item (owner, 2026-11-27). The key is the order's id.
const SAY = {
  'Status Report': 'How is the ship, ARIA?', 'XO has the con': 'You have the con.',
  'Engineering status report': 'How is she running, Ryan?', 'Crew health report': "How's the crew?",
  'Full sensor sweep': 'Give me a full mapping sweep.', 'Launch all WSKRs': 'Launch the WSKRs.', 'Recall all WSKRs': 'Bring the WSKRs home.',
  'Go passive': 'Go passive.', 'Go active': 'Go active.', 'Sonar off': 'Switch the sonar off.', 'Set up a relay': 'Put a WSKR up as a relay.', 'Stand down the relay': 'Bring the relay down.',
  'Transmit a report': 'Send our report to OERA.', 'Order the Tern to': 'Tell the Tern to …', 'Call back the Tern': 'Bring the Tern home.', 'Report on the Tern': "How's the Tern doing?",
  'Launch the Tern to': 'Get the Tern ready to go to …', 'Request departure clearance': 'Ask the harbour for departure clearance.',
  'Make your depth': 'Take us to …', 'Make your heading': 'Steer …', 'Make your speed': 'Make our speed …', 'Make periscope depth': 'Periscope depth.',
  'Override the bay speed limit': 'Ignore the bay speed limit.', 'Restore the bay speed limit': 'Back to the bay speed limit.',
  'Open the bulkheads': 'Open the bulkheads.', 'Engage super cruise': 'Super cruise.', 'Disengage super cruise': 'Out of super cruise.',
};
const STATUS_SAY = { helm: 'How are things at the helm?', sensors: 'Anything out there, Alex?', communications: 'Any traffic, Nicole?', security: 'All quiet, Lieutenant?', science: 'How is the lab?' };
const sayFor = (t, id) => { const l = (t === 'Status report' && STATUS_SAY[id]) || SAY[t] || t; return t in PARAM && !l.endsWith('…') ? `${l} …` : l; };   // an order that asks for a value opens a menu: it ends with …
const sub = (l) => (l.endsWith('…') ? l : `${l} …`);   // a line that opens a menu
const works = (t, pleasantry) => pleasantry || t in ORDERS || t in PARAM;


// ---------- The orders menu ----------
// Orders sit in folders by what they do, and an order is only offered when it makes sense now: Dock or Undock, never both; Hug the floor or Stop hugging it.
// F(folder label, ...items). O(order text, show). Only orders listed here are offered (the old placeholder lines in saves are ignored).
const F = (label, ...items) => ({ label, items });
const O = (text, show = () => true) => ({ text, show });
const relayOut = () => sim.s.wskrs.some((w) => w.mode === 'relay' && !w.dead);
const ternOut = () => shuttle().state === 'out';
const atDock = () => !!(sim.s.at && sim.s.at.type === 'dock');
const underway = () => !sim.s.docked;
const TREE = {
  executiveOfficer: () => [
    F('Ship', O('Status Report'), O('XO has the con')),
    F('Getting underway', O("Let's take her to sea", () => docked()), O("Let's go home", () => underway() && !!sim.dockPoi() && !atDock())),
  ],
  helm: () => [
    F('Depth', O('Make periscope depth', () => underway() && Math.abs(sim.s.depth - PERISCOPE_M) > 1.5), O('Make your depth', underway), O('Hug the floor', () => underway() && !sim.s.hug), O('Stop hugging the floor', () => !!sim.s.hug)),
    F('Heading', O('Make your heading', underway), O('Come left', underway), O('Come right', underway)),
    F('Speed', O('Make your speed', underway), O('All stop', () => underway() && (sim.s.speed > 0.1 || sim.s.throttle > 0)), O('Override the bay speed limit', () => bayDoorsOpen() && !bayState().override), O('Restore the bay speed limit', () => bayDoorsOpen() && !!bayState().override), O('Engage super cruise', () => underway() && !sim.s.cruise), O('Disengage super cruise', () => !!sim.s.cruise)),
    F('Docking', O('Undock', docked), O('Dock', () => underway() && atDock())),
    F('Navigation', O("Let's go home", () => underway() && !!sim.dockPoi() && !atDock())),
    F('Ship', O('Status report')),
  ],
  sensors: () => [
    F('Sonar', O('Full sensor sweep', underway), O('Go passive', () => !sim.s.sonar || !!sim.s.sonarActive), O('Go active', () => !sim.s.sonarActive), O('Sonar off', () => !!sim.s.sonar)),
    F('WSKRs', O('Launch all WSKRs', underway), O('Recall all WSKRs', () => sim.s.wskrs.length > 0), O('Set up a relay', () => underway() && !relayOut()), O('Stand down the relay', relayOut)),
    F('Ship', O('Status report')),
  ],
  engineering: () => [F('Ship', O('Engineering status report'), O('Open the bulkheads', () => { const b = E.eng().bulk; return !b.fwd || !b.aft; }))],
  science: () => [F('Ship', O('Status report'), O('Crew health report'))],
  communications: () => [
    F('Radio', O('Transmit a report'), O('Request departure clearance', docked)),
    F('The Tern', O('Order the Tern to', ternOut), O('Call back the Tern', ternOut), O('Report on the Tern', ternOut)),
    F('Ship', O('Status report')),
  ],
  security: () => [F('The Tern', O('Launch the Tern to', () => !ternOut() && underway())), F('Ship', O('Status report'))],
};

// EMERGENCY: only orders that do something now, per crew member (owner, 2026-11-27). A crew member with none has no EMERGENCY folder.
const EMERGENCY = {
  executiveOfficer: () => [alarmOn() ? 'Secure from General Alarm' : 'Sound General Alarm'],
  helm: () => (underway() ? ['All stop', 'All ahead flank', 'Emergency dive'] : []),
  engineering: () => { const e = E.eng(); return [...(underway() && sim.s.depth > 1 ? ['Emergency blow'] : []), ...(e.fire ? ['Discharge fire suppression'] : []), ...(e.bulk.fwd || e.bulk.aft ? ['Close the bulkheads'] : [])]; },
};

export function mount(body, ctx, opts = {}) {
  body.classList.add('comm-menu');
  const crew = knownCrew();
  let page = 'crew', cur = null, cat = null, reply = null, greeted = false, param = null;
  // What the Captain is reading stays on screen; anything said meanwhile waits behind "Continue" (owner, 2026-11-27: a new line hijacked ARIA's introduction)
  let readTo = 0;
  const markRead = () => { readTo = cur ? transcript(cur.id).length : 0; };
  const unread = () => (cur ? transcript(cur.id).map((l, i) => ({ ...l, i })).slice(readTo).filter((l) => l.from === 'crew') : []);
  const nextLine = () => { const u = unread(); if (!u.length) return null; return line(`Continue${u.length > 1 ? ` (${u.length})` : ''}`, () => { reply = { said: null, text: u[0].text }; readTo = u[0].i + 1; page = 'reply'; render(); }); };
  // The menu is a tree of folders. A folder is { folder: true, label, title, kids }, a leaf is { label, run, cls }.
  const orderLeaf = (t) => ({ label: sayFor(t, cur && cur.id), run: () => speak(t) });
  const orderKids = () => {   // the folders in TREE, each order shown only when it makes sense now
    const id = cur && cur.id, kids = [];
    for (const f of (TREE[id] ? TREE[id]() : [])) {
      const shown = f.items.filter((i) => (i.text in ORDERS || i.text in PARAM) && i.show());
      if (shown.length) kids.push({ folder: true, label: f.label, title: f.label, kids: shown.map((i) => orderLeaf(i.text)) });
    }
    const all = kids.flatMap((k) => k.kids);
    return all.length <= 6 ? all : kids;   // a few orders: show them straight away
  };
  const askKids = () => {
    const id = cur && cur.id, kids = [];
    for (const f of guidesFor(id)) kids.push({ folder: true, label: f.label, title: `${f.label} …`, kids: f.items.map((i) => ({ label: i.label, run: () => say(`How do I … ${i.label}`, askGuide(id, i.id)) })) });
    const topics = topicsFor(id);
    if (topics.length) kids.push({ folder: true, label: 'Background', title: `Ask ${first(cur)} about …`, kids: topics.map((q) => ({ label: `${q.told ? '✓ ' : ''}${q.label}`, cls: q.told ? 'stub' : '', run: () => say(`Ask about ${q.label}`, askTopic(id, q.id)) })) });
    return kids;
  };
  const cats = () => {
    const top = [];
    const ak = askKids(); if (ak.length) top.push({ folder: true, label: 'Ask about', title: `Ask ${first(cur)} about`, kids: ak });
    const ok = orderKids(); if (ok.length) top.push({ folder: true, label: 'Orders', title: `Orders for ${first(cur)}`, kids: ok });
    const em = EMERGENCY[cur.id] ? EMERGENCY[cur.id]() : []; if (em.length) top.push({ folder: true, label: 'EMERGENCY', cls: 'danger', title: 'EMERGENCY', kids: em.map((t) => ({ label: t, cls: 'danger', run: () => speak(t) })) });
    return top;
  };
  let trail = [];   // labels of the folders open now, outermost first. Looked up again on every draw, so the menu follows the ship's state.
  const openFolder = () => { let kids = cats(), f = null; for (const l of trail) { f = kids.find((k) => k.folder && k.label === l); if (!f) return null; kids = f.kids; } return f; };
  const line = (text, onclick, cls = '') => el('button', { class: `comm-line ${cls}`, text, onclick });
  const first = (c) => (c.id === 'executiveOfficer' ? 'ARIA' : c.name.replace(/^(Captain|Commander|Dr\.|Specialist|Engineer|Lieutenant) /, '').split(' ')[0]);
  const initial = (c) => c.name.replace(/^(Captain|Commander|Dr\.|Specialist|Engineer|Lieutenant) /, '')[0];

  function say(text, done, you = true) {
    if (you && text) logLine(cur.id, 'you', text);
    if (done) logLine(cur.id, 'crew', done);
    reply = { said: text, text: done };
    page = 'reply'; markRead();
    render();
  }
  function speak(text) {
    const o = cur.dialogueOptions || {};
    const spoken = sayFor(text, cur.id);
    logLine(cur.id, 'you', spoken);   // before the order runs, so the running notes it starts land after it
    if (PARAM[text]) { const p = PARAM[text](); param = { said: spoken.replace(/ …$/, ''), ...p }; page = 'param'; render(); return; }
    if (ORDERS[text]) { say(spoken, ORDERS[text](ctx, cur.id), false); return; }
    reply = { said: text, text: 'Say again, Captain?', stub: true }; page = 'reply'; render();
  }

  // Earlier lines scroll above; the newest thing the crew member said is always the big reply block below.
  const logView = (n, dropLast = false) => {
    let L = transcript(cur.id).slice(0, readTo || undefined).slice(-n); if (dropLast && L.length && L[L.length - 1].from === 'crew') L = L.slice(0, -1);   // only what has been read: newer lines wait behind Continue
    if (!L.length) return null;
    const box = el('div', { class: 'comm-log' }, ...L.map((l) => l.from === 'you' ? el('div', { class: 'cl you', text: `You: ${l.text}` }) : el('div', { class: 'cl crew' }, el('small', { text: first(cur) }), l.text)));
    requestAnimationFrame(() => { box.scrollTop = box.scrollHeight; });
    return box;
  };
  const onLine = (e) => { if (cur && e.detail.id === cur.id && (page === 'reply' || page === 'cat')) render(); };
  document.addEventListener('crew-line', onLine);

  /** What a crew member says, with their portrait beside it when there is one (static portrait + speech box). */
  const sceneOn = () => !!(cur && page !== 'crew' && scenePic(cur.id));   // 90s dialogue screen: their picture fills the box, a text box carries the talk
  const withFace = (node) => { const f = !sceneOn() && cur && portrait(cur.id, 'comm-face'); return f ? el('div', { class: 'comm-say' }, f, node) : node; };
  /** Open the line to one crew member: their first meeting, a decision, what they were holding back, or the menu. */
  function pick(c) {
    cur = c; cat = null; readTo = 0;
    document.dispatchEvent(new CustomEvent('dialogue-complete', { detail: { characterId: c.id, dialogueId: 'first_contact' } }));   // reaching them is meeting them (tutorial)
    const met = !!gameState.getProperty('progress.met.' + c.id);
    if (c.id === 'executiveOfficer' && pendingDecisions().length) { gameState.updateProperty('progress.met.' + c.id, true); greeted = true; page = 'decision'; markRead(); render(); return; }   // ARIA is waiting for an answer
    if (INTRO[c.id] && !met) { gameState.updateProperty('progress.met.' + c.id, true); greeted = true; logLine(c.id, 'crew', fill(INTRO[c.id])); reply = { said: null, text: fill(INTRO[c.id]) }; page = 'reply'; markRead(); render(); return; }   // first meeting comes before anything they were holding back
    const held = takeHeld(c.id);   // what they tried to tell the Captain while he was elsewhere
    if (held.length) { greeted = true; reply = { said: null, text: held.map((h, i) => (i || /\bCaptain\b/.test(h) ? h : `Captain, ${h.charAt(0).toLowerCase()}${h.slice(1)}`)).join('\n\n'), held: true }; page = 'reply'; } else page = 'cat';
    markRead(); render();
  }
  function render() {
    setOpenCrew(!cur || page === 'crew' ? null : cur.id);   // while we are on the line with someone, what they say is read as it comes
    let kids;
    if (!crew.length) kids = [el('div', { class: 'comm-head', text: 'No one else seems to be available right now…' })];
    else if (page === 'crew') {
      kids = [el('div', { class: 'comm-head', text: 'Who do you want to reach?' }),
        unreadCount() > 0 && el('div', { class: 'comm-waiting', text: 'You have messages waiting.' }),
        ...crew.map((c) => el('button', { class: 'comm-line comm-who', onclick: () => pick(c) }, el('span', { class: `avatar ${c.id === 'executiveOfficer' ? 'aria' : ''}${portrait(c.id) ? ' face' : ''}` }, portrait(c.id, 'avatar-face') || crewIcon(c.id) || initial(c)), el('span', {}, el('b', { text: c.name }), el('small', { text: c.role })), unreadFor(c.id) > 0 && el('span', { class: 'comm-badge', text: String(unreadFor(c.id)) })))];
    } else if (page === 'cat') {
      kids = [logView(5), withFace(el('div', {}, el('div', { class: 'comm-head', text: GREET[cur.id] || 'Yes, Captain?' }), el('div', { class: 'comm-who-label', text: `${cur.name} · ${cur.role}` }))),
        nextLine(),
        ...cats().map((f) => line(sub(f.label), () => { trail = [f.label]; page = 'lines'; render(); }, f.cls || '')),
        line('Call another station', () => { page = 'crew'; render(); }, 'back'), line("That's all", () => ctx.closeComm(), 'back')];
    } else if (page === 'lines') {
      const f = openFolder();
      if (!f) { trail = []; page = 'cat'; return render(); }
      kids = [el('div', { class: 'comm-head', text: f.title }),
        ...f.kids.map((k) => k.folder ? line(sub(k.label), () => { trail.push(k.label); render(); }, k.cls || '') : line(k.label, k.run, k.cls || '')),
        line('Back', () => { trail.pop(); if (!trail.length) page = 'cat'; render(); }, 'back')];
    } else if (page === 'decision') {
      const d = pendingDecisions()[0];
      if (!d) { page = 'cat'; return render(); }
      kids = [withFace(el('div', { class: 'comm-reply' }, el('small', { text: cur.name }), el('p', { text: fill(d.text) }))),
        ...d.options.map((o) => line(o.label, () => { say(o.label, decide(d.id, o.id)); }, 'decide')),
        line('Not yet', () => { page = 'crew'; render(); }, 'back')];
    } else if (page === 'param') {
      kids = [el('div', { class: 'comm-head', text: param.title }),
        el('div', { class: 'comm-chips' }, ...param.opts.map(([l, fn, custom]) => line(l, () => { if (custom) return custom((text) => say(`${param.said}: ${l.replace(/ …$/, '').replace(/^Custom /, '')}`, text)); const r = fn(ctx); if (r && typeof r === 'object') { param = { said: `${param.said}: ${l.replace(/ …$/, '')}`, ...r }; render(); } else say(`${param.said}: ${l}`, r); }, 'chip'))),
        line('Back', () => { page = 'lines'; render(); }, 'back')];
    } else {
      kids = [!reply.stub && logView(8, true),
        reply.said && el('div', { class: 'comm-you', text: `You: ${reply.said}` }),
        withFace(el('div', { class: 'comm-reply' + (reply.stub ? ' stub' : '') }, el('small', { text: cur.name }), el('p', { text: reply.text }))),
        nextLine(),
        line(reply.said ? 'Something else' : `${first(cur)}, I need something`, () => { page = 'cat'; render(); }, 'back'),
        line('Call another station', () => { page = 'crew'; render(); }, 'back'),
        line("That's all", () => ctx.closeComm(), 'back')];
    }
    if (sceneOn()) {   // the retro dialogue screen: tap a choice, or tap the picture to end the call (app.js closes on a tap outside buttons and text)
      body.closest('#comm-pop')?.classList.add('rd-on');
      body.replaceChildren(el('div', { class: 'rd box-' + (SCENE_BOX[cur.id] || 'right') }, scenePic(cur.id), el('div', { class: 'rd-box comm-page' }, el('div', { class: 'rd-name', text: cur.name.toUpperCase() }), ...kids.filter(Boolean))));
    } else {
      body.closest('#comm-pop')?.classList.remove('rd-on');
      body.replaceChildren(el('div', { class: 'comm-page' }, ...kids.filter(Boolean)));
    }
  }
  const want = opts.who && crew.find((c) => c.id === opts.who);
  if (want) pick(want); else render();   // opened on one person: a tap on them on the bridge, or they called in
  return { who: () => (page === 'crew' || !cur ? null : cur.id), update() {}, destroy() { setOpenCrew(null); document.removeEventListener('crew-line', onLine); } };
}
