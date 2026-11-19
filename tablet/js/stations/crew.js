// Crew comms through the communicator pin (Star Trek style): crew on the left, the voice channel (transcript) in the middle, things to say on the right.
import { sim, toward, MAX_SPEED } from '../sim.js';
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

// ---------------------------------------------------------------------------------------------
// The communicator is a voice channel, like the badge in the show: no menus and no buttons.
// Speak (the microphone listens while the channel is open), or type a line / use the keyboard's dictation key.
// "Helm, make your depth one hundred metres."  "ARIA, status report."  "Hello."  "That's all."
// ---------------------------------------------------------------------------------------------
const ONES = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
/** "one hundred and twenty" -> "120"; the rest of the line is left alone. */
export function normalize(raw) {
  const toks = String(raw).toLowerCase().replace(/[^a-z0-9%' ]+/g, ' ').replace(/\band\b(?=\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety))/g, ' ').split(/\s+/).filter(Boolean);
  const out = []; let run = null;
  const flush = () => { if (run) { out.push(String(run.total + run.cur)); run = null; } };
  for (const w of toks) {
    if (!(w in ONES || w in TENS || w === 'hundred' || w === 'thousand')) { flush(); out.push(w); continue; }
    run ||= { total: 0, cur: 0 };
    if (w in ONES) run.cur += ONES[w]; else if (w in TENS) run.cur += TENS[w];
    else if (w === 'hundred') run.cur = (run.cur || 1) * 100; else { run.total += (run.cur || 1) * 1000; run.cur = 0; }
  }
  flush(); return out.join(' ');
}
// who answers to what
const ALIAS = {
  executiveOfficer: ['aria', 'xo', 'executive officer', 'number one', 'computer'], helm: ['helm', 'helmsman', 'marcus'], engineering: ['engineering', 'engineer', 'riley', 'chief'],
  science: ['science', 'doctor', 'patel', 'sam', 'medical'], sensors: ['sensors', 'sensor', 'alex', 'torres'], communications: ['comms', 'communications', 'nicole', 'brooks'], security: ['security', 'jordan', 'kim'],
};
const CARD = { north: 0, south: 180, east: 90, west: 270 };
const num = (m, i = 1) => (m && m[i] != null ? parseInt(m[i], 10) : null);
/** Turn what was said into { dept, run(ctx) } (or a special word). The department is the crew member whose job it is. */
export function understand(t) {
  const has = (re) => re.test(t);
  if (has(/\b(that'?s all|that is all|over and out|signing off|close (the )?channel|dismissed)\b/) || /(^| )out$/.test(t)) return { kind: 'close' };
  if (has(/\b(what can you do|what can i ask|options|help)\b/)) return { kind: 'help' };
  if (has(/\bemergency surface\b|\bblow (the )?ballast\b/)) return { dept: 'helm', run: () => ORDERS['Emergency surface']() };
  if (has(/\bemergency dive\b/)) return { dept: 'helm', run: () => ORDERS['Emergency dive']() };
  if (has(/\bundock\b|release (the )?clamps|cast off/)) return { dept: 'helm', run: () => ORDERS['Undock']() };
  if (has(/\bdock\b|\bberth\b/) && !has(/\bdock to\b/)) return { dept: 'helm', run: () => ORDERS['Dock']() };
  if (has(/\ball stop\b|\bstop (the )?(engines?|ship)\b|\bhold position\b/)) return { dept: 'helm', run: () => ORDERS['All stop']() };
  if (has(/\bflank\b/)) return { dept: 'helm', run: () => ORDERS['All ahead flank']() };
  if (has(/\btake her (out )?to sea\b|\bget us underway\b|\bset sail\b|\bhead out\b/)) return { dept: 'executiveOfficer', run: (c) => ORDERS["Let's take her to sea"](c) };
  if (has(/\b(go|take us|head|return|bring us) (back )?(to )?(home|the dock|port|base)\b|\bgo home\b|\btake us home\b/)) return { dept: 'executiveOfficer', run: () => ORDERS["Let's go home"]() };
  if (has(/\bquarters\b/)) return { dept: 'executiveOfficer', run: (c) => ORDERS['Report to my quarters'](c) };
  if (has(/\bgeneral alarm\b|\bsound the alarm\b/)) return { dept: 'executiveOfficer', run: () => ORDERS['Sound General Alarm']() };
  if (has(/\bengineering status\b|\bpower status\b/)) return { dept: 'engineering', run: () => ORDERS['Engineering status report']() };
  if (has(/\bstatus\b|\breport in\b|\bhow are we\b/)) return { dept: 'executiveOfficer', run: () => ORDERS['Status Report']() };
  if (has(/\bprepare (for|to) dive\b|\bmake ready to dive\b/)) return { dept: 'engineering', run: () => ORDERS['Prepare for dive']() };
  if (has(/\b(sensor|sonar) sweep\b|\bping\b/)) return { dept: 'sensors', run: () => ORDERS['Full sensor sweep']() };
  if (has(/\bpassive\b|\bgo quiet\b|\bsilent running\b/)) return { dept: 'sensors', run: () => ORDERS['Passive listening mode']() };
  if (has(/\bdeploy\b.*\b(buoys?|wskrs?)\b|\blaunch\b.*\bwskrs?\b/)) return { dept: 'sensors', run: () => ORDERS['Deploy sensor buoys']() };
  if (has(/\bcrew diagnostics?\b/)) return { dept: 'science', run: () => ORDERS['Run crew diagnostics']() };
  if (has(/\bdeparture clearance\b/)) return { dept: 'communications', run: () => ORDERS['Request departure clearance']() };
  let m;
  if (has(/\b(heading|steer|course|bearing)\b/) && ((m = t.match(/\b(\d{1,3})\b/)) || (m = t.match(/\b(north|south|east|west)\b/)))) {
    const v = /\d/.test(m[1]) ? parseInt(m[1], 10) % 360 : CARD[m[1]];
    return { dept: 'helm', run: () => { sim.setHeading(v); sim.s.wpt = null; return `Steering ${hdgText(v)}, aye.`; } };
  }
  if ((m = t.match(/\b(?:come|turn|steer)?\s*(left|right|port|starboard)(?: (\d{1,3}))?\b/)) && has(/\b(left|right|port|starboard)\b/)) {
    const d = Math.min(180, num(m, 2) || 10), left = m[1] === 'left' || m[1] === 'port';
    return { dept: 'helm', run: () => { sim.setHeading(sim.s.targetHeading + (left ? -d : d)); sim.s.wpt = null; return `Coming ${left ? 'left' : 'right'} to ${hdgText(sim.s.targetHeading)}, aye.`; } };
  }
  if (has(/\b(speed|knots?|percent|ahead|slow|half|full)\b|%/) && !has(/\bdepth\b/)) {
    let v = null;
    if ((m = t.match(/\b(\d{1,3}) ?(percent|%)/))) v = Math.min(1, parseInt(m[1], 10) / 100);
    else if ((m = t.match(/\b(\d{1,2}) knots?\b/))) v = Math.min(1, parseInt(m[1], 10) / MAX_SPEED);
    else if (has(/\bslow\b/)) v = 0.2; else if (has(/\bhalf\b/)) v = 0.5; else if (has(/\bfull\b/)) v = 0.8;
    if (v != null) return { dept: 'helm', run: () => { if (docked()) return 'We are docked, Captain.'; if (v) sim.setThrottle(v); else sim.stop(); sim.s.wpt = null; return v ? `Speed ${Math.round(v * 100)} percent, aye.` : 'All stop, aye.'; } };
  }
  if (has(/\b(depth|dive|descend|metres?|meters?)\b/) && (m = t.match(/\b(\d{1,4})\b/))) {
    const v = parseInt(m[1], 10);
    return { dept: 'helm', run: () => (docked() ? 'We are docked, Captain.' : v ? dive(v, 'Aye.') : (sim.setDepth(0), 'Coming to the surface, aye.')) };
  }
  if (has(/\b(surface|come up)\b/)) return { dept: 'helm', run: () => (docked() ? 'We are docked, Captain.' : (sim.setDepth(0), 'Coming to the surface, aye.')) };
  if (has(/\b(hello|hi|hey|good (morning|evening|day)|thank you|thanks|how are you|goodbye|bye)\b/)) return { kind: 'pleasantry', bye: has(/\b(goodbye|bye)\b/) };
  return null;
}
const SAMPLES = [
  'Helm, make your depth one hundred metres.', 'ARIA, status report.', 'Helm, come right forty five.', 'Make your heading two seven zero.',
  'Helm, speed sixty percent.', 'ARIA, let\'s take her to sea.', 'Sensors, full sensor sweep.', 'Hello, ARIA.', 'Helm, undock.', 'Engineering, status report.',
];
const hist = [];      // the conversation, kept while the game runs: { you, who, text }
let hintAt = 0;

export function mount(body, ctx) {
  body.classList.add('comm-menu');
  const crew = knownCrew();
  const byId = (id) => crew.find((c) => c.id === id);
  const aria = () => byId('executiveOfficer') || crew[0];
  const first = (c) => (c.id === 'executiveOfficer' ? 'ARIA' : c.name.replace(/^(Captain|Commander|Dr\.|Specialist|Engineer|Lieutenant) /, '').split(' ')[0]);
  const pleasantries = (c) => (c.dialogueOptions && c.dialogueOptions.pleasantries) || ['Aye.'];
  let alive = true, fails = 0, last = null;
  const log = el('div', { class: 'comm-log' });
  const hint = el('div', { class: 'comm-hint' });
  const listen = el('span', { class: 'comm-mic' });
  const input = el('input', { class: 'comm-input', type: 'text', placeholder: 'Speak, or type here…', autocomplete: 'off', autocapitalize: 'sentences', enterkeyhint: 'send', 'aria-label': 'Say something to the crew' });
  const form = el('form', { class: 'comm-say', onsubmit: (e) => { e.preventDefault(); const t = input.value.trim(); input.value = ''; if (t) heard(t); } }, input);
  body.replaceChildren(el('div', { class: 'comm-page' }, log, hint, listen, form));

  function draw() {
    log.replaceChildren(...(hist.length ? hist.slice(-5).map((e) => el('div', { class: 'comm-entry' },
      e.you && el('div', { class: 'comm-you', text: `You: ${e.you}` }),
      el('div', { class: 'comm-reply' }, el('small', { text: e.who ? e.who.name : '' }), el('p', { text: e.text })))) : [el('div', { class: 'comm-quiet', text: 'Channel open. Who do you want to talk to?' })]));
    log.scrollTop = log.scrollHeight;
    hint.textContent = `Try: “${SAMPLES[hintAt % SAMPLES.length]}”`;
  }
  function reply(who, text, you) {
    hist.push({ you, who, text }); draw();
    document.dispatchEvent(new CustomEvent('dialogue-complete', { detail: { characterId: who.id, dialogueId: 'first_contact' } }));
  }
  function heard(raw) {
    const t = normalize(raw);
    // who was spoken to
    let addressed = null;
    for (const c of crew) if ((ALIAS[c.id] || [first(c).toLowerCase()]).some((a) => new RegExp(`\\b${a}\\b`).test(t))) { addressed = c; break; }
    const u = understand(t);
    if (!u) {
      const who = addressed || last || aria(); last = who; fails++;
      reply(who, fails > 1 ? `Say again, Captain? ${first(who)} can take orders for depth, heading, speed, docking, status, sweeps and more. Try “${SAMPLES[(hintAt++) % SAMPLES.length]}”.` : 'Say again, Captain?', raw);
      return;
    }
    fails = 0;
    if (u.kind === 'close') { hist.push({ you: raw, who: addressed || last || aria(), text: 'Aye, Captain. Out.' }); draw(); setTimeout(() => ctx.closeComm(), 700); return; }
    if (u.kind === 'help') { const who = addressed || aria(); last = who; reply(who, 'Try giving an order: depth, heading, come left or right, speed, dock or undock, status report, sensor sweep. Start with a name, like “Helm, …”.', raw); return; }
    if (u.kind === 'pleasantry') { const who = addressed || last || aria(); last = who; reply(who, pleasantries(who)[Math.floor(Math.random() * pleasantries(who).length)], raw); if (u.bye) setTimeout(() => ctx.closeComm(), 1400); return; }
    // an order: the right officer takes it (the XO takes anything, as a relay)
    const owner = byId(u.dept) || aria();
    let who = addressed || owner;
    if (addressed && addressed.id !== 'executiveOfficer' && addressed.id !== owner.id) { last = addressed; reply(addressed, `That is a matter for ${first(owner)}, Captain.`, raw); return; }
    if (addressed && addressed.id === 'executiveOfficer' && owner.id !== 'executiveOfficer') who = addressed;
    last = who;
    reply(who, u.run(ctx) || 'Aye.', raw);
  }

  // the microphone, where the browser allows it (it listens while the channel is open)
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, quiet = 0;
  function startMic() {
    if (!SR || !alive) { listen.textContent = ''; return; }
    try {
      rec = new SR(); rec.lang = 'en-US'; rec.interimResults = false; rec.maxAlternatives = 1;
      rec.onstart = () => { listen.textContent = '● listening'; };
      rec.onresult = (e) => { quiet = 0; const t = e.results[e.results.length - 1][0].transcript; if (t) heard(t); };
      rec.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { alive = false; listen.textContent = 'Microphone is off. Type, or use the keyboard’s dictation key.'; } };
      rec.onend = () => { if (alive && ++quiet < 6) setTimeout(() => { try { rec.start(); } catch (e) { /* already running */ } }, 250); else if (alive) listen.textContent = 'Not listening. Tap and type, or use dictation.'; };
      rec.start();
    } catch (e) { listen.textContent = ''; }
  }

  // anything that was waiting for the Captain is said first, then the greeting
  let spoke = false;
  for (const c of crew) {
    const held = takeHeld(c.id);
    if (held.length) { hist.push({ who: c, text: held.map((h) => `Captain, ${h.charAt(0).toLowerCase()}${h.slice(1)}`).join(' '), held: true }); last = c; spoke = true; }
  }
  if (!spoke && !hist.length && byId('executiveOfficer')) { hist.push({ who: aria(), text: 'Welcome aboard, Captain. I am ARIA, your executive officer. How may I assist you?' }); last = aria(); }
  hintAt = Math.floor(Math.random() * SAMPLES.length);
  draw(); startMic();
  return { update() {}, destroy() { alive = false; try { rec && rec.abort(); } catch (e) { /* ignore */ } } };
}
