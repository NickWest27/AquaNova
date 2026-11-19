// Small talk for the communicator. A reply is chosen from what the person is like and what is happening on the ship,
// not at random. Each crew member remembers which lines they have used and cycles through the rest first.
// Memory is saved under progress.talk.<id> = { n, used: { intent: [index, ...] } }.
import { sim } from './sim.js';
import { gameState } from './persist.js';
import { fill } from './player.js';
import { cm, loadContacts, linkState, LINKS, antDepth, isActive, distNm } from './commsModel.js';

/** What the Captain said, as one of four intents (or null for anything else). */
export const intentOf = (text) => /^hello|^hi\b/i.test(text) ? 'hello' : /goodbye|farewell/i.test(text) ? 'bye' : /thank/i.test(text) ? 'thanks' : /all for now|that is all/i.test(text) ? 'done' : null;

/** What the radio room can hear and how the links are doing. */
function comms(s) {
  const out = { links: {}, heard: [], mastOpen: true, relay: false };
  try {
    if (!cm.contacts) loadContacts();   // loads in the background; the next reply will have it
    LINKS.slice(0, 3).forEach((L) => { const st = linkState(L); out.links[L.label] = { up: st.up, fading: st.fading, dB: st.dB, status: st.status, eff: Math.round(st.eff), rate: L.rate, to: (L.relay || L.station).name }; });
    out.mastOpen = antDepth('mast') <= 5; out.relay = !!(sim.relayUp && sim.relayUp());
    out.heard = out.mastOpen ? (cm.contacts || []).filter((x) => isActive(x) && !x.distress && (x.band === 'VHF' || x.band === 'HF') && distNm(s, x) <= x.range).map((x) => x.id) : [];
  } catch (e) { /* comms model not ready: Nicole just has less to say */ }
  return out;
}

/** What each station on the radio is up to. Used when it is within range. */
const CHATTER = {
  'rv-gannet': 'I have RV Gannet on VHF. They are recovering a CTD cast and sound unbothered by it.',
  'fv-marguerite': 'FV Marguerite is on VHF with her nets out. The skipper asked us, politely, to stay well below her.',
  'dsv-meridian': 'DSV Meridian is on HF, on a survey line at depth. Not much chat, but it is nice to know they are there.',
  'cg-sector': 'The Coast Guard sector is working its usual traffic on 156.8. Nothing for us, which is how we like it.',
  nantucket: 'Nantucket Harbor Office is reporting sea state two and no traffic concerns.',
  'oera-woodshole': 'Woods Hole Station is reporting fair weather ashore and a quiet night shift.',
};
/** A line about the state of one link, or null. */
const linkLine = (c, label, name) => {
  const l = c.links[label]; if (!l) return null;
  if (l.up) return `The ${name} link is operative at ${l.dB} dB, ${l.rate} to ${l.to}.`;
  if (l.fading) return `The ${name} link is fading, down to ${l.dB} dB. A little shallower would help.`;
  return `The ${name} link has no carrier at this depth. The antenna needs to be nearer the surface${label === 'SAT-COM' ? ', or I can use a relay' : ''}.`;
};

/** A snapshot of the ship in words crew might use. */
export function context(extra = {}) {
  const s = sim.s, h = Math.floor(s.clock / 3600) % 24;
  const floor = typeof s.floor === 'number' ? Math.round(s.floor) : null;
  return {
    period: h >= 5 && h < 12 ? 'morning' : h < 18 ? 'afternoon' : h < 22 ? 'evening' : 'night',
    depth: Math.round(s.depth), kt: Math.round(s.speed * 10) / 10, hdg: Math.round(s.heading), bat: Math.round(s.battery), o2: Math.round(s.oxygen), hull: Math.round(s.hull),
    docked: !!s.docked, place: s.at && s.at.name ? s.at.name : null, floor, under: floor == null ? null : Math.round(floor - s.depth),
    wskrs: (s.wskrs || []).length, rov: !!s.rov, cruise: !!s.cruise, bound: !!s.wpt, moving: s.speed > 0.5, mail: 0, ...comms(s), ...extra,
  };
}

// Greetings are { t, p?, min? }: p = only at that time of day, min = only once the Captain has spoken to them that many times.
const G = (...a) => a.map((t) => (typeof t === 'string' ? { t } : t));
const CREW = {
  executiveOfficer: {
    greet: G('Good {period}, {captain}.', 'Captain.', 'I am here, {captain}.', { t: 'Still awake, {captain}? I do not sleep, so I have no excuse.', p: 'night' }, { t: 'Good to see you, {first}.', min: 6 }, 'At your service, {captain}.'),
    status: (c) => [
      c.docked ? `We are alongside${c.place ? ' at ' + c.place : ''} on shore power, and every system is nominal.` : null,
      !c.docked && c.moving ? `We are making ${c.kt} knots on ${c.hdg}, ${c.depth} metres down${c.under != null ? `, with ${c.under} under the keel` : ''}.` : null,
      !c.docked && !c.moving ? `We are holding at ${c.depth} metres. All systems are nominal.` : null,
      c.bat < 30 ? `The battery is at ${c.bat} percent. I would like to see it recharged.` : null,
      c.hull < 95 ? `Hull integrity is ${c.hull} percent. Engineering is aware.` : null,
      c.o2 < 85 ? `Oxygen is down to ${c.o2} percent. Nothing alarming, but I am watching it.` : null,
      c.wskrs ? `${c.wskrs === 1 ? 'One WSKR is' : c.wskrs + ' WSKRs are'} out and reporting.` : null,
      c.rov ? 'Remora is out. Dr. Patel is pleased about it.' : null,
      c.mail ? `You have ${c.mail === 1 ? 'a message' : c.mail + ' messages'} waiting at Comms.` : null,
    ],
    thanks: ['You are welcome, {captain}.', 'That is what I am here for.', 'Of course.', 'Any time, {captain}.'],
    bye: ['Goodbye, {captain}. I will be here.', 'I will keep an eye on things.', 'Until next time, {captain}.', 'I am never far.'],
    done: ['Understood. I am here if you need me.', 'Very good, {captain}.', 'Standing by.', 'Noted.'],
  },
  helm: {
    greet: G('Helm here, {captain}.', 'Say the word, {captain}.', 'Marcus here, {captain}.', { t: 'Quiet watch, {captain}.', p: 'night' }, { t: 'Good {period}, {captain}.' }, { t: 'Morning, {first}.', p: 'morning', min: 5 }),
    status: (c) => [
      c.docked ? 'Lines are secure, and we are ready when you are.' : null,
      !c.docked && c.moving ? `Steady on ${c.hdg}, making ${c.kt} knots at ${c.depth} metres.` : null,
      !c.docked && !c.moving ? `We are holding at ${c.depth} metres. She is behaving.` : null,
      c.under != null && c.under < 40 && !c.docked ? `There is only ${c.under} metres under us. I am watching it closely.` : null,
      c.cruise ? `Running at ${c.kt} knots in super cruise. Smooth as glass.` : null,
      c.bound ? 'We have a course laid in. All I have to do is not hit anything.' : null,
    ],
    thanks: ['Any time, {captain}.', 'Just doing the job.', 'My pleasure.', 'Glad to help.'],
    bye: ['Smooth sailing, {captain}.', 'I will keep her steady.', 'Call if you need me.', 'Aye, {captain}.'],
    done: ['Aye, {captain}.', 'Holding as we are.', 'Understood.', 'Standing by, {captain}.'],
  },
  science: {
    greet: G('Dr. Patel here, {captain}.', 'Good {period}, {captain}.', { t: 'It is late, {captain}. Are you sleeping?', p: 'night' }, 'Captain. Everyone is well.', { t: 'Hello, {first}.', min: 6 }, 'How are you feeling, {captain}?'),
    status: (c) => [
      'The crew are healthy and reasonably rested.',
      c.period === 'night' ? 'Most of the crew are asleep, which is the correct thing to be.' : null,
      c.o2 < 85 ? `The air is getting stale at ${c.o2} percent. I would like Engineering to look at it.` : null,
      c.rov ? 'Remora is out. I am keen to see what it brings back.' : null,
      c.depth > 1000 ? `We are ${c.depth} metres down. The pressure is the hull's problem, but I am keeping an eye on morale.` : null,
      c.hull < 95 ? 'I heard the hull took a knock. Nobody is hurt.' : null,
    ],
    thanks: ['You are welcome, {captain}.', 'Of course.', 'Do not mention it.', 'Happy to help.'],
    bye: ['Take care, {captain}.', 'Get some rest when you can.', 'Goodbye, {captain}. Drink some water.', 'Call me if anything feels wrong.'],
    done: ['Of course, {captain}.', 'Medical is here if you need it.', 'Understood.', 'Right, then.'],
  },
  sensors: {
    greet: G('Sensors, {captain}.', 'Torres here, {captain}.', 'Captain.', { t: 'Quiet on the scope, {captain}.', p: 'night' }, 'Listening, {captain}.'),
    status: (c) => [
      c.floor != null ? `The floor is ${c.floor} metres below the surface here.` : null,
      c.wskrs ? `${c.wskrs === 1 ? 'One WSKR is' : c.wskrs + ' WSKRs are'} out and charting. Probably fine.` : 'Nothing on the scope. Probably.',
      c.bound && c.moving ? 'I am watching the water ahead on the course you set.' : null,
      c.docked ? 'Nothing out there but the harbour traffic.' : null,
      c.rov ? 'I have Remora on the tether. It is steady.' : null,
    ],
    thanks: ['Any time, {captain}.', 'Just the job.', 'You are welcome.', 'Glad it helped.'],
    bye: ['I will keep listening.', 'Call if I can help.', 'Goodbye, {captain}.', 'Back to the scope.'],
    done: ['Aye, {captain}.', 'Sensors standing by.', 'Understood.', 'Still listening.'],
  },
  engineering: {
    greet: G('Engineering, {captain}.', 'Ryan here, {captain}.', 'Captain.', { t: 'Engine room is quiet, {captain}.', p: 'night' }, 'What can I do for you, {captain}?'),
    status: (c) => [
      `Battery is at ${c.bat} percent.`,
      c.docked ? 'We are on shore power and topping off.' : null,
      !c.docked && c.moving ? `The plant is steady with us at ${c.kt} knots.` : null,
      c.cruise ? 'Super cruise is pulling a lot. I am watching the temperatures.' : null,
      c.hull < 95 ? `Hull is at ${c.hull} percent. I have people looking at it.` : null,
      c.bat < 30 ? 'I would not stay out much longer on this charge.' : null,
    ],
    thanks: ['No problem, {captain}.', 'Just keeping her running.', 'Any time.', 'That is what I am here for.'],
    bye: ['I will keep the plant happy.', 'Goodbye, {captain}.', 'Call me before you worry about any noise.', 'Back to it.'],
    done: ['Understood, {captain}.', 'Engineering standing by.', 'Aye.', 'Fine by me.'],
  },
  security: {
    greet: G('Security, {captain}.', 'Kim here, {captain}.', 'Captain.', { t: 'Corridors are quiet, {captain}.', p: 'night' }, 'All secure, {captain}.'),
    status: (c) => [
      'All quiet. That is how I like it.',
      c.docked ? 'The gangway is secure and logged.' : null,
      c.depth > 200 && !c.docked ? 'Nothing out here but us and the fish. Probably.' : null,
      c.period === 'night' ? 'I did a walk of the boat an hour ago. Nothing to report.' : null,
    ],
    thanks: ['Of course, {captain}.', 'Just the job.', 'Understood.', 'Any time.'],
    bye: ['Stay sharp, {captain}.', 'Goodbye, {captain}.', 'I will keep watch.', 'Call if you need me.'],
    done: ['Understood, {captain}.', 'Standing ready.', 'Aye.', 'Security standing by.'],
  },
  communications: {
    greet: G('Comms, {captain}.', 'Nicole here, {captain}.', 'Captain.', { t: 'The airwaves are quiet, {captain}.', p: 'night' }, 'Channel is open, {captain}.'),
    status: (c) => [
      c.mail ? `You have ${c.mail === 1 ? 'a message' : c.mail + ' messages'} waiting.` : 'No new traffic.',
      linkLine(c, 'LASER', 'laser'), linkLine(c, 'SAT-COM', 'satellite'), linkLine(c, 'HF', 'HF'),
      c.relay ? 'A WSKR is relaying from just under the surface, so we have the links of a surface ship.' : null,
      c.docked ? 'We have a clean link to the shore.' : null,
      !c.mastOpen && !c.docked ? 'The mast is too deep for VHF and HF. I am hearing nothing on the radio until we come up.' : null,
      ...c.heard.map((id) => CHATTER[id]),
      c.mastOpen && !c.heard.length ? 'The radio is quiet. No traffic in range.' : null,
      c.period === 'night' ? 'It is quiet on the old frequencies too.' : null,
      ...GOSSIP(c),
    ],
    thanks: ['Any time, {captain}.', 'My pleasure.', 'Happy to help.', 'Just the job.'],
    bye: ['I will keep the channel open.', 'Goodbye, {captain}.', 'Call if you need a line out.', 'Signing off.'],
    done: ['Understood, {captain}.', 'Comms standing by.', 'Aye.', 'Channel stays open.'],
  },
};

/** Radio-room gossip. Light, a little dry; the Voss lines unlock once the Captain has been around a while. */
const GOSSIP_LINES = [
  { t: 'Between us, there are two Chens aboard and one mailbox. Mail is an adventure.' },
  { t: 'Torres says "probably" so often that the crew has a pool on how many times a shift. I will not say which way I bet.' },
  { t: 'Marcus insists that the galley coffee is a breach of some convention. He still drinks three cups.' },
  { t: 'Lieutenant Kim has walked the boat four times today. I do not think he trusts the doors.' },
  { t: 'Dr. Patel keeps a plant on her desk in the sick bay. She says it is for the air. It is named Gerald.' },
  { t: 'Ryan talks to the reactor when he thinks nobody is listening. I am told it answers.' },
  { t: 'Nobody has sat in the Captain\'s chair on the bridge except you, {captain}. The rest of us are not sure if it is allowed.', min: 3 },
  { t: 'Nobody will say why Captain Voss left. I asked ARIA, and she went very quiet. She does not usually go quiet.', min: 5 },
];
const GOSSIP = (c) => { const n = (gameState.getProperty('progress.talk.communications') || { n: 0 }).n; return GOSSIP_LINES.filter((g) => !g.min || n >= g.min).map((g) => g.t); };

const mem = (id) => gameState.getProperty('progress.talk.' + id) || { n: 0, used: {} };
/** The next unused option from a list (indices stay in the save), or the first once all are used. */
function choose(m, key, list) {
  const used = new Set(m.used[key] || []);
  let free = list.map((_, i) => i).filter((i) => !used.has(i));
  if (!free.length) { m.used[key] = []; free = list.map((_, i) => i); }
  const i = free[Math.floor(Math.random() * free.length)];
  m.used[key] = [...(m.used[key] || []), i];
  return i;
}

/** The reply to a bit of small talk, or null when we have nothing for that person or phrase. */
export function reply(id, text, extra) {
  const intent = intentOf(text), person = CREW[id];
  if (!intent || !person) return null;
  const c = context(extra), m = mem(id);
  if (intent === 'hello') m.n += 1;
  let out;
  if (intent === 'hello') {
    const greets = person.greet.filter((g) => (!g.p || g.p === c.period) && (!g.min || m.n >= g.min));
    const g = greets[choose(m, 'greet', greets.map((x) => x.t))];
    const said = [...new Set(m.used.status0 || [])];   // statements already used lately
    const options = person.status(c).filter(Boolean);
    const free = options.filter((o) => !said.includes(o));
    const st = (free.length ? free : options)[Math.floor(Math.random() * (free.length ? free.length : options.length))];
    m.used.status0 = [...said, st].slice(-6);
    out = `${g.t.replace('{period}', c.period)} ${st || ''}`.trim();
  } else out = person[intent][choose(m, intent, person[intent])];
  gameState.updateProperty('progress.talk.' + id, m);
  return fill(out);
}
