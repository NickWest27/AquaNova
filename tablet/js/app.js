import '../../utils/debugPanel.js';
import * as traffic from './traffic.js';
import './sonar.js'   // passive sonar: contacts, sweep and scan run every step
import { loadReputation } from './reputation.js';
import { initGenerator } from './missionGen.js';
import { dlog } from '../../utils/log.js';
import { sim, clockText, toward, wskrName } from './sim.js';
import { createScene } from './scene.js';
import { say, hush, unreadCount, stats as notifyStats } from './notify.js';
import { seafloor } from './seafloor.js';
import { fileScan, scanned } from './findings.js';
import './survey.js';   // site surveys run on the sim clock
import './engineering.js';   // the ship's systems, damage and repairs
import './trials.js';   // pushing the trials in the Trials AO: records, and a risk of light damage
import './rov.js';
import { SHUTTLE_NAME, BAY_SAFE_KT, bay } from './bayops.js';
import './tern.js';
import './commsModel.js';
import { tickLab, SAMPLE_KINDS, awardSurveyBonus } from './science.js';
import { el, $, toast, pad, modal, frameThrottle, viewProbe } from './util.js';
import { ICONS } from './ui.js';
import { startSync, syncAtBoot } from './sync.js';
import { getPlayer, setPlayer, fill } from './player.js';
import { runIntake } from './intake.js';
import { startAria } from './aria.js';
import { armAway, catchUp, wakeNow, briefing, onWake, AWAY_CAPS } from './away.js';
import { isCommissioned, excuse } from './unlocks.js';
import { isOpen, visit, LOCKED } from './rooms.js';
sim.cruiseGate = sim.cruiseGate || []; sim.cruiseGate.push(() => (isCommissioned('cruise') ? null : 'commission'));   // super cruise is commissioned in the trials area
import { initMissionLog } from './missionLog.js';
import { initAudio, updateHum, chirp, ping, sfx, sfxLoop, getSound } from './audio.js';
import { gameState, saveManager, loadGame, liveNav, startExitSave, saveBeforeSleep, checkpoint, restoreSim } from './persist.js';
import { makeJournalEntry } from '../../utils/ledgerSync.js';

const STATIONS = {
  nav: { title: 'Navigation', icon: 'nav' }, helm: { title: 'Helm', icon: 'helm' }, sys: { title: 'Systems', icon: 'sys' },
  sensors: { title: 'Sensors', icon: 'sensors' }, comms: { title: 'Comms', icon: 'comms' }, log: { title: 'Logbook', icon: 'log' }, ped: { title: 'PED', icon: 'more' },
  lab: { title: 'Science Lab', icon: 'sensors' }, eng: { title: 'Engineering computer', icon: 'sys' }, wskr: { title: 'WSKRs', icon: 'sensors' }, remora: { title: 'Remora (Science ROV)', icon: 'helm' }, bay: { title: 'Launch Bay control', icon: 'helm' },
  crew: { title: 'Communicator', icon: 'comms', hidden: true }, // opened from the pin, not the dock
};
const FILES = { sys: 'systems' };
const WHERE = { bridge: 'Bridge', quarters: 'Quarters', walkway: 'Walkway', walkway2: 'Walkway AN-1', science: 'Science Lab', medbay: 'Medbay', launchbay: 'Launch Bay', engineering: 'Engineering' };   // the back button returns to the room you came from
const SYSTEM_TEXT = {
  communicator_tutorial: ['Communicator ready', 'Pin on. Tap the badge in the top-right corner to talk to your crew. ARIA, your executive officer, is waiting to hear from you.'],
};
const modules = {};
let tickN = 0;
// stamp each new message with the game date and time it arrived (the mission code knows nothing of the game clock)
document.addEventListener('comms-message', () => {
  const list = gameState.getProperty('mission.inbox') || [], last = list[list.length - 1];
  if (last && last.gameClock == null) gameState.updateProperty('mission.inbox', list.map((m, i) => i === list.length - 1 ? { ...m, gameClock: Math.round(sim.s.clock) } : m));
});
document.addEventListener('crew-say', (e) => say(e.detail.role, e.detail.text, 'mission'));   // a mission has a crew member speak
let scene, current = null, missions = null, boarded = false;
const pendingModals = [];
let zoom = 1;
try { zoom = parseFloat(localStorage.getItem('aquaNova_zoom')) || 1; } catch (e) { /* ignore */ }
const applyZoom = () => document.documentElement.style.setProperty('--zoom', zoom);
applyZoom();

// ---------- mission state helpers ----------
const objectives = () => gameState.getProperty('mission.objectives') || [];
const objStatus = (id) => (objectives().find((o) => o.id === id) || {}).status;
const hasPed = () => gameState.getProperty('progress.got_ped') === true;   // the PED lies on the bed until you take it
const commsLocked = () => ['active', 'waiting'].includes(objStatus('meetTheCrew_pickup_communicator'));   // not picked up yet (the step waits its turn behind 'find the communicator' since 2026-11-27)
// Real play is silent (no chirps, no ARIA) until the communicator pin is picked up. Automated tests skip the sign-in and are not hushed unless ?intake=1.
hush.fn = () => commsLocked() && !(navigator.webdriver && !/[?&]intake=1/.test(location.search));

viewProbe.fn = () => boarded && !!scene && scene.where === 'bridge' && !current && !ped && !comm;

const flag = (k) => { if (gameState.getProperty('tutorial.' + k) !== true) { gameState.updateProperty('tutorial.' + k, true); gameState.updateProperty('progress.flags', { ...(gameState.getProperty('progress.flags') || {}), [k]: true }); } };   // saved, so a reload does not forget what the Captain has done   // lesson steps watch these
const ctx = {
  flag, closePed: () => closePed(),
  place: () => (current ? STATIONS[current.name].title : WHERE[scene.where] || scene.where),   // for bug notes
  openScene: (name) => openScene(name),
  closeComm: () => closeComm(),
  openComm: () => { closePed(); if (!comm) toggleComm(); },   // the PED's communicator button: a backup to the pin
  commReady: () => !$('#pin').hidden, commUnread: () => $('#pin').classList.contains('unread'),
  refreshScene: () => { scene && scene.update(); syncUI(); },
  zoom(d) { zoom = d === 0 ? 1 : Math.min(1.5, Math.max(0.8, +(zoom + d).toFixed(2))); applyZoom(); try { localStorage.setItem('aquaNova_zoom', zoom); } catch (e) { /* ignore */ } fit(); },
  objectives: () => objectives().map((o) => ({ text: o.description, done: o.status === 'completed' })),
};

// Keeps pickup, locks and similar UI in step with the mission. Runs at most once per frame.
let firstUI = true;
const syncUI = frameThrottle(() => {
  if (!scene) return;
  const locked = commsLocked();
  const readLog = gameState.getProperty('progress.read_welcome') === true;
  const inside = scene.inQuarters;
  scene.showItems({ pin: inside && locked && objStatus('meetTheCrew_find_communicator') === 'completed', ped: inside && !hasPed() });   // pin on the desk, PED on the bed: before or after the logbook
  scene.glow('Pick up communicator', inside && readLog); scene.glow('Pick up PED', inside && readLog);   // only after the logbook says what to do
  scene.glow('LOGBOOK', inside && locked && !readLog);   // a new game: the laptop glows until the welcome entry is read
  const toQuarters = locked && !!getPlayer() && objStatus('meetTheCrew_find_communicator') !== 'completed';   // told to report to quarters: light the way
  scene.glow('A1 DECK ▼', toQuarters); scene.glow('QUARTERS', toQuarters);
  if ($('#station').hidden) $('#ped-btn').hidden = !hasPed();   // a station covers the screen: no round button
  const unread = (gameState.getProperty('mission.inbox') || []).filter((m) => !m.read).length;
  scene.glow('COMMS', unread > 0);   // new mail: the comms station glows on the bridge
  const pin = $('#pin');
  const quiet = firstUI; firstUI = false;   // the first pass only restores state: no chirp on load
  if (pin.hidden === locked) return;
  pin.hidden = locked;
  if (!locked) { pin.classList.remove('ring'); void pin.offsetWidth; pin.classList.add('ring'); if (!quiet) chirp(); }
});
document.addEventListener('pin-pulse', () => { const pin = $('#pin'); if (pin.hidden) return; pin.classList.remove('ring'); void pin.offsetWidth; pin.classList.add('ring'); });   // a crew line that is not shown: the pin pulses

// ---------- scene scaling: one transform ----------
const PAGE_W = 1024, PAGE_H = 768;   // station pages: 4:3, the stage's 1920x1440 / 1.875
let safe = null;
function fit() {
  const wrap = $('#scene-wrap'), stage = $('#stage');
  if (wrap && stage) { const w = wrap.clientWidth; if (w) stage.style.transform = `scale(${w / 1920})`; }
  // the station page: the largest 4:3 box inside the safe area, centred, scaled by one transform
  const boxes = ['#station', '#ped-pop', '#comm-pop', '#hud'].map((q) => $(q)).filter(Boolean); if (!boxes.length) return;
  if (!safe) { safe = document.createElement('div'); safe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)'; document.body.append(safe); }
  const cs = getComputedStyle(safe), T = parseFloat(cs.paddingTop) || 0, R = parseFloat(cs.paddingRight) || 0, B = parseFloat(cs.paddingBottom) || 0, L = parseFloat(cs.paddingLeft) || 0;
  const W = window.innerWidth - L - R, H = window.innerHeight - T - B, k = Math.min(W / PAGE_W, H / PAGE_H);
  const tf = `translate(${Math.round(L + (W - PAGE_W * k) / 2)}px, ${Math.round(T + (H - PAGE_H * k) / 2)}px) scale(${k})`;
  for (const b of boxes) b.style.transform = tf;   // station pages, the PED, the communicator and the corner buttons share one 4:3 box
}

// ---------- PED: a pop-up on top of the current screen, not a station ----------
let ped = null;
async function togglePed() {
  if (ped) return closePed();
  flag('opened_ped');
  const root = $('#ped-pop'), body = el('div', { class: 'st-body' });
  // The PED is a handheld: the PDA frame sits around it.
  root.replaceChildren(el('div', { class: 'ped-panel pda' },
    el('div', { class: 'pda-screen' },
      body),
    el('img', { class: 'pda-frame', src: 'assets/pda-frame.webp', alt: '', draggable: 'false' })));
  root.onclick = (e) => { if (e.target === root) closePed(); };   // tap outside the PDA
  root.hidden = false;
  try {
    modules.ped ||= await import('./stations/ped.js');
    ped = { api: modules.ped.mount(body, ctx) }; ped.api.update();
  } catch (e) { console.error('PED failed', e); toast('Could not open the PED', 'error'); root.hidden = true; }
}
function closePed() {
  if (!ped) return;
  try { ped.api.destroy(); } catch (e) { console.error(e); }
  ped = null; $('#ped-pop').hidden = true; $('#ped-pop').replaceChildren();
}

// ---------- Communicator: a voice channel, shown as a blurred overlay over the current screen ----------
let comm = null;
async function toggleComm(who = null) {
  if (comm) { if (!who) return closeComm(); closeComm(); }   // opened on someone: start again on them
  if (commsLocked()) return;
  gameState.updateProperty('tutorial.communicator_opened', true); // "First Contact" step 3
  const root = $('#comm-pop'), body = el('div', { class: 'st-body' });
  root.replaceChildren(el('div', { class: 'comm-panel' },
    el('div', { class: 'comm-top' }, el('small', { class: 'comm-live', text: '● voice channel open' })),
    body));
  root.onclick = (e) => { if (!e.target.closest('button, .comm-reply, .comm-head, .comm-you, .comm-who-label, .rd-box')) closeComm(); };   // a tap anywhere but a button or text closes it
  root.hidden = false;
  try {
    modules.crew ||= await import('./stations/crew.js');
    comm = { api: modules.crew.mount(body, ctx, { who }) };
    sfx('radioSquelch', 0.7);
  } catch (e) { console.error('Communicator failed', e); toast('Could not open the communicator', 'error'); root.hidden = true; }
}
function closeComm() {
  if (!comm) return;
  try { comm.api.destroy(); } catch (e) { console.error(e); }
  comm = null; $('#comm-pop').hidden = true; $('#comm-pop').replaceChildren();
}

// ---------- stations ----------
async function openStation(name) {
  if (name === 'ped') return togglePed();
  if (name === 'crew') return toggleComm();
  if (current) closeStation();
  const def = STATIONS[name]; if (!def) return;
  if (!isCommissioned(name)) { say('aria', excuse(name)); return; }   // ARIA explains: she sees what is and is not commissioned
  flag('opened_' + name);
  if (name === 'log') gameState.updateProperty('progress.read_welcome', true);
  const root = $('#station');
  const chips = el('div', { class: 'st-chips' });
  const body = el('div', { class: 'st-body' });
  root.replaceChildren(el('header', { class: 'st-head' },
    el('button', { class: 'btn', text: '‹ ' + (WHERE[scene.where] || 'Back'), onclick: closeStation }), el('div', { class: 'st-title', text: def.title }), chips, el('button', { class: 'btn', text: 'PED', onclick: togglePed })), body);
  root.hidden = false; $('#ped-btn').hidden = true; document.body.classList.add('has-line');
  try {
    modules[name] ||= await import(`./stations/${FILES[name] || name}.js`);
    current = { name, api: modules[name].mount(body, ctx), chips };
    current.api.update(); updateChips();
  } catch (e) { console.error('Station failed', name, e); toast('Could not open ' + def.title, 'error'); root.hidden = true; document.body.classList.remove('has-line'); }
}
function closeStation() {
  if (!current) return;
  try { current.api.destroy(); } catch (e) { console.error(e); }
  current = null; document.body.classList.remove('has-line'); $('#station').hidden = true; $('#station').replaceChildren(); $('#ped-btn').hidden = !hasPed();
  scene.update(); syncUI();
}
function updateChips() {
  if (!current) return;
  const s = sim.s;
  const txt = `SPD ${s.speed.toFixed(1)} · DEP ${Math.round(s.depth)} · HDG ${pad(s.heading)}`;
  if (current.chips.textContent !== txt) current.chips.textContent = txt;
}
// a power-assisted door between rooms (opens, then shuts behind), and the engine room's own noise while the Captain is in it
const ROOMS = ['bridge', 'walkway', 'walkway2', 'quarters', 'science', 'medbay', 'launchbay', 'engineering'];
let lastRoom = null, engineLoop = null;
// Where each sound is heard (owner, 2026-11-27): a room's own sounds only in that room (sonar blips and the depth warning on the bridge,
// the hatches, flooding and launches in the launch bay); the hull, the alarms, the drive, doors and the communicator everywhere.
const HEARD_IN = { sonarContact: 'bridge', sonarLost: 'bridge', depthAlarm: 'bridge', teletype: 'bridge',
  torpedoLaunch: 'launchbay', hatchOpen: 'launchbay', hatchClose: 'launchbay', airlockFlood: 'launchbay', airlockDrain: 'launchbay', bayFlood: 'launchbay', bayPump: 'launchbay' };
const heardHere = (name, room = HEARD_IN[name]) => !room || lastRoom === room;
const play = (name, vol = 1, room) => (heardHere(name, room) ? sfx(name, vol) : 0);
function roomSound(name) {
  if (!ROOMS.includes(name)) return;
  const walk = (r) => r === 'walkway' || r === 'walkway2';   // the two walkways join with no door between them
  if (lastRoom && lastRoom !== name && !(walk(lastRoom) && walk(name))) { sfx('doorOpen'); setTimeout(() => sfx('doorClose'), 1300); }   // through the door, and it shuts behind (owner, 2026-11-27)
  lastRoom = name;
  if (name === 'engineering' && !engineLoop) engineLoop = sfxLoop('engineRoom', 0.8);
  else if (name !== 'engineering' && engineLoop) { engineLoop.stop(); engineLoop = null; }
}
function openScene(name) {
  if (name.startsWith('enter-')) {   // a door into a room the story may not have opened yet
    const room = name.slice(6);
    if (!isOpen(room)) { const o = ctx.objectives().find((x) => !x.done), t = o ? o.text.charAt(0).toLowerCase() + o.text.slice(1).replace(/\.?$/, '') : 'carry on with what we are doing'; say('aria', (LOCKED[room] || 'That door stays shut for now, {captain}. For now, {task}.').replace('{task}', t)); return; }
    name = room;
  }
  visit(name);   // the people who work here are now on the communicator
  roomSound(name);
  if (name.startsWith('talk-')) { const id = name.slice(5); if (gameState.getProperty(`contacts.crew.${id}`)) gameState.updateProperty(`contacts.crew.${id}.known`, true); return toggleComm(id); }   // a tap on a crew member in a room opens the line to them (meeting them in person makes them reachable)
  if (['bridge', 'walkway', 'walkway2', 'science', 'medbay', 'launchbay', 'engineering'].includes(name)) setTimeout(() => document.dispatchEvent(new CustomEvent('location-enter', { detail: { location: name } })), 0);
  if (name === 'quarters') {
    closeStation(); scene.show('quarters');
    document.dispatchEvent(new CustomEvent('location-enter', { detail: { location: 'quarters' } }));
  } else if (name === 'bridge') { closeStation(); scene.show('bridge'); gameState.updateProperty('progress.been_bridge', true); }
  else if (name === 'walkway') { closeStation(); scene.show('walkway'); }
  else if (name === 'walkway2') { closeStation(); scene.show('walkway2'); }
  else if (name === 'sleep') sleepDialog();
  else if (name === 'sleepAway') sleepDialog('away');
  else if (name === 'science') { closeStation(); scene.show('science'); }
  else if (name === 'launchbay') { closeStation(); scene.show('launchbay'); }
  else if (name === 'medbay') { closeStation(); scene.show('medbay'); }
  else if (name === 'medbay-station') say('aria', 'The medbay equipment is not commissioned yet, Captain.');
  else if (name === 'bay-airlock') say('engineering', 'The inner airlock is not wired up yet, Captain. Use the control console.');
  else if (name === 'lab-samples' || name === 'lab-analysis' || name === 'lab-research') { ctx.labTab = name.slice(4); ctx.labOnly = true; openStation('lab'); }   // a bench shows only its own page
  else if (name === 'lab') { ctx.labTab = 'samples'; ctx.labOnly = false; openStation('lab'); }   // the main computer offers all three
  else if (name === 'engineering') { closeStation(); scene.show('engineering'); }
  else if (name === 'eng-bench') say('engineering', 'The workbench is not set up yet, Captain. Use the console for the ship\'s systems.');
  else if (name === 'pickup-ped') { gameState.updateProperty('progress.got_ped', true); }
  else if (name === 'pickup') document.dispatchEvent(new CustomEvent('item-pickup', { detail: { itemId: 'communicator' } }));
  else openStation(name);
  syncUI();
}

// ---------- sleep: jump the game clock forward ----------
function sleepDialog(startMode = 'skip') {
  const s = sim.s;
  // time to the destination at the speed you are set for (so a long transit takes less of your time)
  const kt = Math.max(s.speed, s.throttle * sim.maxKt());
  const eh = s.wpt && kt > 0.5 && !s.docked ? sim.etaHours() : null;
  const eta = eh == null ? null : Math.min(96, Math.ceil(eh * 10) / 10 + 0.1);
  let hours = eta && eta <= 12 ? eta : 8, untilArrival = !!(eta && eta <= 12);
  const fmt = (h) => (h >= 1 ? `${Math.round(h * 10) / 10} h` : `${Math.round(h * 60)} min`);
  const note = el('p', { text: `It is ${clockText()}. The game saves first. The ship keeps its course and speed while you sleep, so a long trip passes quickly. The crew wake you if you arrive at your destination, or in an emergency.${s.docked ? ' Docked: shore power charges the ship.' : ''}` });
  const chips = el('div', { class: 'row' });
  const draw = () => chips.replaceChildren(
    ...[2, 4, 8, 12, 24].map((h) => el('button', { class: `btn chip ${!untilArrival && h === hours ? 'on primary' : ''}`, text: `${h} h`, onclick: () => { hours = h; untilArrival = false; draw(); } })),
    eta && el('button', { class: `btn chip ${untilArrival ? 'on primary' : ''}`, text: `Until arrival (${fmt(eta)})`, onclick: () => { hours = eta; untilArrival = true; draw(); } }));
  let mode = startMode, cap = 8;   // skip = jump the clock ahead; away = the crew have the con and the app may be closed
  const modes = el('div', { class: 'row' });
  const awayNote = el('p', { text: 'The crew have the con. Close the app whenever you like: when you open it again, ARIA briefs you on what happened. They keep your course and speed, hold at the Area of Operations limit, and stop on arrival, on a shoal, when supplies run low or if a craft is lost. If you are still asleep an hour after a stop, if a port is close by an away team takes the Tern for supplies (food, science equipment, mail, fresh CO2 scrubbers), and five minutes later the science team send Remora down to sample the point of interest you reached. They stand down after the limit you choose. Your iPhone shows where the ship should be.' });
  const drawAll = () => {
    modes.replaceChildren(el('button', { class: `btn chip ${mode === 'skip' ? 'on primary' : ''}`, text: 'Skip time', onclick: () => { mode = 'skip'; drawAll(); } }), el('button', { class: `btn chip ${mode === 'away' ? 'on primary' : ''}`, text: 'Crew has the con', onclick: () => { mode = 'away'; drawAll(); } }));
    if (mode === 'skip') { note.hidden = false; awayNote.hidden = true; draw(); }
    else { note.hidden = true; awayNote.hidden = false; chips.replaceChildren(el('span', { class: 'note', text: 'Crew stand down after ' }), ...AWAY_CAPS.map((h) => el('button', { class: `btn chip ${h === cap ? 'on primary' : ''}`, text: `${h} h`, onclick: () => { cap = h; drawAll(); } }))); }
  };
  draw();
  modal({ title: 'Sleep', body: el('div', {}, modes, note, awayNote, chips), actions: [{ label: 'Cancel' }, { label: 'Sleep', primary: true, run: () => {
    if (mode === 'away') { saveBeforeSleep(); armAway(cap); awayScreen(cap); syncUI(); return; }
    saveBeforeSleep();                         // a save before sleep, as agreed
    const r = sim.warp(hours);
    const h = fmt(r.hours);
    const text = r.arrived ? `Captain, we have arrived at ${r.arrived}. You slept ${h}. It is ${clockText()}.`
      : r.reason ? `Captain, ${r.reason}. I woke you early. You slept ${h}. It is ${clockText()}.` : `You slept ${h}. It is ${clockText()}.`;
    modal({ title: r.arrived ? 'We have arrived' : r.reason ? 'ARIA woke you' : 'Good morning, Captain', body: el('p', { text }), actions: [{ label: 'OK', primary: true }] });
    ping(); liveNav(); syncUI(); scene.update();
  } }] });
  drawAll();
}

// "Crew has the con" screen: shown while the app is open and the Captain sleeps. Closing the app is fine.
let awayClose = null;
function awayScreen(cap) {
  awayClose = modal({ title: 'Good night, Captain', body: el('div', {}, el('p', { text: `The crew have the con for up to ${cap} hours. You can close the app now. When you open it again, I will tell you what happened.` })), actions: [{ label: 'Wake up now', primary: true, run: () => { const rep = wakeNow(); syncUI(); scene.update(); showBriefing(rep); } }] });
}
function showBriefing(rep) {
  if (!rep) { modal({ title: 'Good morning, Captain', body: el('p', { text: 'Nothing to report. The ship is as you left her.' }), actions: [{ label: 'OK', primary: true }] }); return; }
  const b = briefing(rep);
  modal({ title: b.title, body: el('div', {}, b.lines.map((t) => el('p', { text: t }))), actions: [{ label: 'OK', primary: true }] });
  ping(); liveNav(); syncUI(); scene && scene.update();
}

// ---------- status line (no buttons: stations open from hotspots in the rooms) ----------
function buildDock() {
  const dock = $('#dock');
  const status = el('div', { class: 'dock-status' });
  const st = { clock: el('span'), pos: el('span'), obj: el('span'), bat: el('span') };
  status.append(st.clock, st.pos, el('span', { class: 'sp' }), st.obj, st.bat);
  dock.replaceChildren(status);
  return st;
}

// ---------- mission events ----------
function showSystemDialogue(id) {
  const t = SYSTEM_TEXT[id]; if (!t) return;
  const run = () => modal({ title: t[0], body: el('p', { text: t[1] }), actions: [{ label: 'OK', primary: true }] });
  if (boarded) run(); else pendingModals.push(run);
}
document.addEventListener('show-dialogue', (e) => { if (e.detail.characterId === 'system') showSystemDialogue(e.detail.dialogueId); });
document.addEventListener('comms-message', (e) => { if (boarded) say('comms', 'Captain, sorry to interrupt, but we have an incoming message.', 'mission', { notice: 'INCOMING MESSAGE', keep: `We have an incoming message from ${e.detail.from}. It is waiting at the Comms station.` }); syncUI(); });
let lastReportAt = -1e9; document.addEventListener('report-sent', () => { lastReportAt = Date.now(); });
// A new mission starts quietly (owner, 2026-11-27): it is in the PED under Missions and Tasks, and its orders come by mail.
document.addEventListener('mission-notify', (e) => {
  if (!boarded || e.detail.tutorial) return;   // tutorial steps are ticked off in the PED without ARIA announcing them
  if (e.detail.subtitle === 'Objective Complete') {   // ARIA keeps it short: done, and what is next
    const next = objectives().find((o) => o.status !== 'completed');
    say('aria', next ? `Objective complete. Next: ${next.description.replace(/[.\s]+$/, '')}.` : 'Objective complete.', 'mission', { hold: false }); return;
  }
  if (e.detail.subtitle !== 'Mission Complete!') return;   // no "New Mission Started" from ARIA
  // ARIA congratulates the Captain once the mission is done. Most missions end with the report to OERA, so she waits a few seconds to come in
  // after Nicole's "Report is out". This only speaks: the report's transfer and OERA's reply mail keep their own timing (transfer.js).
  const name = e.detail.title;
  setTimeout(() => {   // decided after the wait: the report-sent event can reach the mission manager before it reaches the line below
    const reported = Date.now() - lastReportAt < 15000;   // did this mission end with the report going out?
    const lines = reported ? [
      `Well done, {captain}. ${name} is complete, and OERA has your report.`,
      `That is ${name} finished and reported, {captain}. A good piece of work. The crew did well, and so did you.`,
      `${name} is complete and the report is with OERA, {captain}. Nicely done.`,
    ] : [
      `Well done, {captain}. ${name} is complete.`,
      `That is ${name} finished, {captain}. A good piece of work. The crew did well, and so did you.`,
      `${name} is complete, {captain}. Nicely done.`,
    ];
    let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    say('aria', lines[h % lines.length], 'mission');
  }, 5000);
});   // objectives live in the PDA Tasks, not the communicator

function firstVisit(poi) {
  const seen = gameState.getProperty('progress.areasExplored') || [];
  const key = poi.name.toLowerCase().replace(/\s+/g, '_');
  if (seen.includes(key)) return;
  gameState.updateProperty('progress.areasExplored', [...seen, key]);
  try { saveManager.addJournal(makeJournalEntry(`Arrived at ${poi.name}. ${poi.text}`)); } catch (e) { console.warn('journal', e); }   // a note in the PED journal, not the logbook (owner, 2026-11-27)
}

// ---------- boot ----------
/** Lesson steps that watch a flag are re-checked now and then, so a step the Captain has already done (or that was missed) still counts.
 *  Charting a Course (to Vineyard Ledge): the flags below come from the ship's own state, so being there already counts. */
// Lesson flags that come from ship state rather than from a button press.
let limitsWarned = false;   // the en-route limits reminder, once a session
function syncLessonFlags() {
  if (!missions) return;
  const s = sim.s, ledge = (p) => p && p.name === 'Vineyard Ledge';
  if (ledge(s.wpt) || (ledge(s.at) && objStatus('navLesson_plot'))) { flag('plotted_ledge'); }
  if (ledge(s.at) && objStatus('navLesson_arrive') === 'active') flag('arrived_ledge');
  if (s.wskrs && s.wskrs.length) flag('wskr_out');
  // Sea Trials: the commissioning trip to the Trials AO
  // mission areas: a box on the chart for every active mission that names one ("area" in its JSON)
  sim.missionAreas = [...missions.activeMissions].map((id) => missions.missions.get(id)).filter((m) => m && m.area).map((m) => m.area);
  const box = (sim.missionAreas || []).find((a) => a.name === 'TRIALS AO') || (missions.missions.get('seaTrials') || {}).area;
  const inAO = (p) => !!(p && box && p.lat >= box.lat0 && p.lat <= box.lat1 && p.lon >= box.lon0 && p.lon <= box.lon1);
  if (inAO(s.wpt) || (inAO(s) && objStatus('seaTrials_plot'))) flag('plotted_ao');
  if (inAO(s) && objStatus('seaTrials_arrive') === 'active') flag('arrived_ao');
  if (['active', 'waiting'].includes(objStatus('seaTrials_arrive')) && !limitsWarned && (s.depth > 305 || s.speed > 15.5)) { limitsWarned = true; say('aria', `${s.depth > 305 ? 'We are below 300 metres' : 'We are over 15 knots'}, Captain. Our orders are 15 knots and 300 metres until we reach the trials area.`, 'error'); }
  const ledgePoi = s.pois.find(ledge); if (ledgePoi && scanned(ledgePoi)) { flag('scanned'); flag('scanned_ledge'); }   // a scan filed by the ship or by a WSKR
  missions.checkTriggers();
}
async function boot() {
  const btn = $('#board-btn'), info = $('#splash-info');
  try {
    info.textContent = 'Loading charts, crew and saved game…';
    await sim.loadPois();
    seafloor.load().then((ok) => ok && sim.touch());      // sea floor data loads in the background
    await loadGame();                       // saveManager + GameState + sim restore
    try { await loadReputation(); } catch (e) { console.warn('reputation not loaded', e); }
    try { await traffic.load(); } catch (e) { console.warn('traffic not loaded', e); }   // after the save: the world seed and the sunk ships live in it
    Object.keys(gameState.getProperty('progress.flags') || {}).forEach((k) => gameState.updateProperty('tutorial.' + k, true));   // lesson flags come back with the save
    await syncAtBoot();                     // pick up journal notes and tasks from the phone
    try {
      missions = (await import('../../game/systems/missionManager.js')).default;
      await missions.init(); initMissionLog(); startAria(); try { await initGenerator(); } catch (e) { console.warn('Generator unavailable', e); }
      {   // The Captain has been on the bridge (an older save, or the tour is done): the whole bridge crew is reachable
        const un = (gameState.getProperty('progress.stationsUnlocked') || []).map((x) => String(x).toLowerCase());
        const onBridge = un.includes('helm') || un.includes('sys') || (gameState.getProperty('mission.completedIds') || []).includes('shipTour') || objStatus('shipTour_bridge') === 'completed';
        if (onBridge) for (const id of ['sensors', 'communications', 'security']) if (!gameState.getProperty(`contacts.crew.${id}.known`)) gameState.unlockCrewMember(id);
      }
    } catch (e) { console.warn('Missions unavailable', e); }
    if (!sim.s.at && !gameState.getProperty('navigation.location')) { const d = sim.dockPoi(); if (d) { sim.s.lat = d.lat; sim.s.lon = d.lon; sim.s.at = d; sim.s.docked = true; } }
    btn.disabled = false; btn.textContent = 'Board the Aqua Nova'; info.textContent = '';
  } catch (e) { console.error('Boot failed', e); info.textContent = 'Startup failed. Triple-tap the top-left corner for the log.'; return; }

  btn.addEventListener('click', () => {
    initAudio();                            // sound may start only after a tap
    $('#splash').hidden = true; $('#shell').hidden = false;
    scene = createScene($('#stage'), { onOpen: openScene });
    const st = buildDock();
    new ResizeObserver(fit).observe($('#scene-wrap')); window.addEventListener('resize', fit); fit();
    boarded = true;
    const awayRep = catchUp();   // the app was closed while the crew had the con: work out what happened
    if (awayRep) pendingModals.push(() => showBriefing(awayRep));
    onWake((rep) => { if (awayClose) { awayClose(); awayClose = null; } showBriefing(rep); });   // or it was only in the background
    sim.start(); startExitSave(); startSync();
    gameState.addObserver(syncUI);
    $('#pin').addEventListener('click', toggleComm);
    // A crew member with something to say opens the line to them (owner, 2026-11-27), unless the Captain is already talking to someone.
    // Automated tests keep the old behaviour (the pin glows) unless they ask with ?callin=1.
    const callIn = !navigator.webdriver || /[?&]callin=1/.test(location.search);
    document.addEventListener('crew-call', (e) => { if (callIn && !comm && !commsLocked()) toggleComm(e.detail.id); });
    document.addEventListener('inbox-change', () => $('#pin').classList.toggle('unread', unreadCount() > 0));
    $('#ped-btn').hidden = !hasPed(); $('#ped-btn').addEventListener('click', togglePed);
    // sound effects (sfx.js, 2026-11-27): the moments that should be heard
    const sfxAt = {};
    sim.on((type, data) => {
      if (type === 'general-alarm' && data.on) play('generalAlarm');
      else if (type === 'bump') { if (data && data.damage) play(data.damage >= 10 ? 'crash' : 'impact'); }   // only a real hit (not the map-edge stop or the AO warning)
      else if (type === 'eng-fire') play('fireAlarm');
      else if (type === 'eng-leak') play('collisionAlarm');
      else if (type === 'cruise-on') play('powerUp');
      else if (type === 'cruise-spooled') play('cruiseEngage');
      else if (type === 'eng-blow') play('ballastBlow');
      else if (type === 'sonar-ping' && Date.now() - (sfxAt.ping || 0) > 5000) { sfxAt.ping = Date.now(); play('sonarPing'); }   // active sonar pings (a full sweep is a quiet mapping sweep now)
      // more of the library wired in (owner, 2026-11-27)
      else if (type === 'cruise-off') play('powerDown');
      else if (type === 'depth-cap') play('depthAlarm');
      else if (type === 'sonar-contact' && sim.s.clock - (sfxAt.contact ?? -1e9) > 4) { sfxAt.contact = sim.s.clock; play('sonarContact', 0.7); }   // at most one blip every 4 game seconds
      else if (type === 'sonar-lost' && sim.s.clock - (sfxAt.lost ?? -1e9) > 4) { sfxAt.lost = sim.s.clock; play('sonarLost', 0.6); }
      else if (type === 'bay-launched') play(data && data.craft === 'wskr' ? 'torpedoLaunch' : 'bubbles', 0.8, 'launchbay');   // a WSKR leaves its tube; the Tern or Remora clears the bay
    });
    // diving and surfacing, and the hull at depth
    let wasDeep = null, nextCreak = 0;
    sim.on((type) => {
      if (type !== 'tick') return;
      const s = sim.s, deep = s.depth > 3;
      if (wasDeep !== null && deep !== wasDeep && !s.docked) play(deep ? 'bubbles' : 'splash', 0.7);   // vents open as she goes under; she breaks the surface
      wasDeep = deep;
      if (s.depth >= 400 && s.clock >= nextCreak) { if (nextCreak) play('hullCreak', Math.min(1, 0.4 + (s.depth - 400) / 500)); nextCreak = s.clock + 90 + Math.random() * 150; }   // the hull talks below 400 m, every few minutes
    });
    document.addEventListener('comms-message', () => play('teletype', 0.6));   // a message coming in
    // The launch bay cycle (owner, 2026-11-27): hatches are quick, equalising the pressure takes most of the cycle. Cues are at fractions of the op
    // (game time, so they follow time compression). Launch: inner hatch open, close, flood, outer hatch open, the craft goes, outer hatch closes.
    // Recovery: outer hatch open, the craft comes in, outer hatch closes, pump out, inner hatch open, close. Heard only in the launch bay.
    const BAY_PLAN = { launch: [[0, 'hatchOpen'], [0.1, 'hatchClose'], [0.15, 'airlockFlood'], [0.15, 'loop:bayFlood'], [0.76, 'stop'], [0.78, 'hatchOpen']],
      recover: [[0, 'hatchOpen'], [0.12, 'hatchClose'], [0.17, 'airlockDrain'], [0.17, 'loop:bayPump'], [0.82, 'stop'], [0.85, 'hatchOpen'], [0.95, 'hatchClose']] };
    let bayCue = null;
    const bayVol = () => (heardHere('bayFlood') ? 1 : 0);   // only in the launch bay (the loop keeps running, so walking in you hear it)
    sim.on((type) => {
      if (type !== 'tick') return;
      const op = bay().op;
      if (bayCue && bayCue.op !== op) {   // the op ended (or a new one began)
        if (bayCue.loop) bayCue.loop.stop();
        if (!op && bayCue.op.kind === 'launch' && bayCue.op.t >= bayCue.op.dur) setTimeout(() => play('hatchClose'), 2500);   // the craft is away: outer hatch shuts
        bayCue = null;
      }
      if (!op || !BAY_PLAN[op.kind]) return;
      const f = op.t / (op.dur + (op.air || 0));
      if (!bayCue) {   // joined mid-cycle (a reload): skip what is past, but pick up a flood or pump that is still running
        const plan = BAY_PLAN[op.kind], past = plan.filter(([at]) => at < f - 0.02), stopAt = (plan.find(([, w]) => w === 'stop') || [1])[0];
        bayCue = { op, done: new Set(past.map(([at, w]) => at + w)), loop: null };
        const lp = past.find(([, w]) => w.startsWith('loop:')); if (lp && f < stopAt) bayCue.loop = sfxLoop(lp[1].slice(5), bayVol());
      }
      for (const [at, what] of BAY_PLAN[op.kind]) {
        if (f < at || bayCue.done.has(at + what)) continue;
        bayCue.done.add(at + what);
        if (what === 'stop') { if (bayCue.loop) { bayCue.loop.stop(); bayCue.loop = null; } }
        else if (what.startsWith('loop:')) bayCue.loop = sfxLoop(what.slice(5), bayVol());
        else play(what);
      }
      if (bayCue.loop && bayCue.loop.setVol) bayCue.loop.setVol(bayVol() * (getSound().fx ?? 0.8));   // walking into or out of the bay
    });
    sim.on((type, data) => {
      if (type === 'tick') {
        const s = sim.s;
        document.body.classList.toggle('general-alarm', !!(s.eng && s.eng.general)); scene.update(); updateChips(); current && current.api.update(); ped && ped.api.update(); updateHum(s.speed);
        if (++tickN % 5 === 0) { liveNav(); if (sim.s.wpt) flag('plotted'); syncLessonFlags(); if (awardSurveyBonus()) say('science', 'OERA has granted a research budget for the survey, Captain: 3 research points. Check the Research tab.', 'mission'); for (const q of tickLab()) say('science', `Analysis of sample #${q.id} (${SAMPLE_KINDS[q.kind].label.toLowerCase()}) is done: ${q.result} Finding filed.`, 'mission'); }            // about once a second
        const t = `${s.lat.toFixed(3)}°N ${Math.abs(s.lon).toFixed(3)}°W`;
        if (st.pos.textContent !== t) st.pos.textContent = t;
        const ck = clockText() + (s.docked ? ' · DOCKED' : ''); if (st.clock.textContent !== ck) st.clock.textContent = ck;
        const o = ctx.objectives().find((x) => !x.done); const ot = o ? 'Objective: ' + o.text : '';
        if (st.obj.textContent !== ot) st.obj.textContent = ot;
        const b = `BAT ${Math.round(s.battery)}%`; if (st.bat.textContent !== b) st.bat.textContent = b;
      } else if (type === 'enter') { say('helm', `We are at ${data.name}, Captain.`, '', { notice: `Arrival at ${data.name}` }); firstVisit(data); }
      else if (type === 'arrived') { flag('arrived'); say('helm', 'Destination reached, Captain.'); }
      else if (type === 'sonar-sweep') flag('swept');
      else if (type === 'wskr-found') { const fresh = fileScan(data.poi); say('sensors', fresh ? `${wskrName(data.wskr)} has finished investigating ${data.poi.name}. Scan filed, Captain.` : `${wskrName(data.wskr)} re-checked ${data.poi.name}. Nothing new.`, 'mission'); }
      else if (type === 'rov-sample') { say('science', `Remora has a ${SAMPLE_KINDS[data.kind].label.toLowerCase()} sample from ${data.site}, Captain. Storage ${data.stored} of ${data.store}.${data.full ? ' She is full. Bring her home so we can unload her.' : ' Bring her home when you have what you came for, and she will deliver it to the lab.'}`, '', { action: true }); }
      else if (type === 'rov-arrived') say('science', `Remora is on station at ${data.name}, Captain. Take her down to the floor and take your sample.`, '', { action: true });
      else if (type === 'cruise-spooled') say('helm', 'Drive is spooled. Super cruise, Captain. Hold on to something.', '', { action: true });
      else if (type === 'cruise-off' && data.why === 'throttle') say('helm', 'New power setting: dropping out of super cruise, Captain.', '', { action: true });
      else if (type === 'general-alarm') { document.body.classList.toggle('general-alarm', data.on); if (data.on && data.by === 'auto') say('aria', 'General alarm, Captain. All hands to emergency stations. Damage control teams are closing up.', 'error'); }
      else if (type === 'general-alarm-clear') say('aria', 'The casualty is over, Captain. Fire and flooding are clear. Give the order when you want to secure from general alarm.', '');
      else if (type === 'eng-fire') say('engineering', `FIRE in the ${({ fwd: 'forward', mid: 'midships', aft: 'aft' })[data.comp]} compartment, Captain!`, 'error', { notice: 'FIRE' });
      else if (type === 'eng-fire-out') say('engineering', data.auto ? 'Fire suppression has put the fire out, Captain.' : 'Fire is out, Captain.', '');
      else if (type === 'eng-leak') say('engineering', `We are taking on water in the ${data.comp === 'fwd' ? 'forward' : 'aft'} compartment, Captain! Close that bulkhead.`, 'error', { notice: 'FLOODING' });
      else if (type === 'eng-bulkhead-auto') say('engineering', `Damage control has closed the ${data.c === 'fwd' ? 'forward' : 'aft'} bulkhead, Captain. The flooding is contained. We need a repair team on the Bulkheads to seal the leak.`, 'error');
      else if (type === 'eng-repaired') say('engineering', `${data.name} back to full, Captain.`, '');
      else if (type === 'eng-cruise-lost') say('engineering', 'The fusion drive is down, Captain. Super cruise is out until it is back.', 'error');
      else if (type === 'survey-start') { /* told by the SONAR page */ }
      else if (type === 'survey-done') say('sensors', `Survey of ${data.name} complete, Captain. The sea floor is charted in detail round it, and the survey is filed in Findings.`, 'mission', { notice: 'SURVEY COMPLETE' });
      else if (type === 'survey-stopped' && data.why !== 'captain') say('sensors', `Survey of ${data.name} broken off, Captain: ${data.why === 'moved' ? 'we moved off station' : data.why === 'fast' ? 'we picked up speed' : 'we left the site'}.`, 'error');
      else if (type === 'rov-snapped') say('security', `Captain, Remora's tether has parted! She is ${data.nm.toFixed(1)} miles astern, no control and no telemetry. I am closing the outer door. The Tern can go for her: Launch Bay, Fetch Remora. Engineering will fit a new tether once she is back aboard.`, 'error', { notice: 'TETHER PARTED' });   // the launch bay is Lt. Washington's (owner, 2026-11-27)
      else if (type === 'shuttle-fetched') say('security', 'The Tern has Remora in her cradle, Captain. Bringing them both home.', 'mission');
      else if (type === 'tether-repair-start') say('science', 'Engineering have Remora. A new tether takes about two hours, Captain.', '');
      else if (type === 'tether-repaired') say('science', 'Engineering: the new tether is fitted and tested. Remora is ready.', '');
      else if (type === 'rov-home') say('science', 'Remora is alongside, Captain. She is ready to be taken aboard.', '', { action: true });
      else if (type === 'rov-blocked') say('science', 'Remora has hit shoal water on her way back, Captain. She has stopped. Somebody needs to pilot her round it.', 'error');
      else if (type === 'rov-reading') say('science', `Magnetometer reading from ${data.site} is in the lab, live over the tether.`, '', { action: true });
      else if (type === 'remora-unloaded') say('science', `Sample unloaded and in the lab.${data.left ? ` ${data.left} to go.` : ''}`, '', { action: true });
      else if (type === 'hug-off') say('helm', data.why === 'docked' ? 'Following the floor ended, Captain.' : 'The water is too shallow to follow the floor, Captain. Holding this depth.', 'mission', { hold: false });
      else if (type === 'shuttle-standoff') say('comms', `Aqua Nova, ${SHUTTLE_NAME}. You are below 800 metres, past our safe depth. We are holding off your beam at a safe distance and a safe depth. Bring her up above 800 metres and we will come in.`, 'mission');
      else if (type === 'shuttle-lostlink') say('comms', `Captain, we have lost radio contact with ${SHUTTLE_NAME}. She is continuing her mission, and she will surface to try a check-in every hour. Orders for her will wait until we have contact.`, 'mission');
      else if (type === 'shuttle-contact') say('comms', `Captain, contact with ${SHUTTLE_NAME} is back. Any orders that were waiting are on their way.`, 'mission');
      else if (type === 'shuttle-checkin') say('comms', `Captain, ${SHUTTLE_NAME} has checked in from the surface at ${data.lat.toFixed(2)}°N ${Math.abs(data.lon).toFixed(2)}°W. Battery ${Math.round(data.bat)} percent, air ${Math.round(data.o2)} percent. All well, and she is carrying on.`, 'mission');
      else if (type === 'shuttle-missed') say('comms', `Captain, ${SHUTTLE_NAME} has missed a check-in. She came up to the surface and we heard nothing. She is still keeping to her last orders. We will listen again in an hour.`, 'error');
      else if (type === 'shuttle-onstation') say('comms', `Aqua Nova, ${SHUTTLE_NAME}. We are on station${data.mission ? ' at ' + (data.mission.dest ? data.mission.dest.name : 'the position') : ''}. Holding and waiting for orders.`, 'mission');
      else if (type === 'shuttle-blocked') say('comms', `Aqua Nova, ${SHUTTLE_NAME}. We cannot go further on this heading: shoal water or the edge of our Area of Operations. Holding position.`, 'mission');
      else if (type === 'shuttle-orders-sent') say('comms', `${SHUTTLE_NAME} has our orders, Captain. ${data.lines.join(' ')}`, 'mission');
      else if (type === 'shuttle-mission-fail') say('security', data.why === 'enemy' ? `Captain, I will not send ${SHUTTLE_NAME} to an enemy port for supplies. She is staying alongside.` : `Captain, ${SHUTTLE_NAME} could not start her mission. She is staying alongside.`, 'error');
      else if (type === 'supplies-delivered') say('security', `The away team is back with ${SHUTTLE_NAME}, Captain, with supplies: food, science equipment, mail and fresh CO2 scrubbers. The scrubbers are changed.`, 'mission');
      else if (type === 'shuttle-clear') say('comms', `Aqua Nova, ${SHUTTLE_NAME}. You are above 800 metres. We are closing and ready to dock.`, 'mission');
      else if (type === 'avoid-on') say('helm', `Captain, the sea floor is rising ahead. We would hit it within a minute at ${data.ordered} metres. I am holding ${data.hold} metres, ${data.margin || 10} off the bottom, and will go back to ${data.ordered} when it falls away.`, 'error', { notice: 'COLLISION AVOIDANCE', hold: false });
      else if (type === 'avoid-off') say('helm', `The floor has dropped away, Captain. Continuing to ${data.ordered} metres.`, '', { hold: false });
      else if (type === 'cruise-off') say('helm', data.why === 'shallow' ? 'Shallow water ahead, Captain. Dropping out of super cruise.' : data.why === 'docked' ? 'Super cruise disengaged.' : 'Power is gone. Super cruise is off.', 'mission');
      else if (type === 'wskr-link-lost') say('sensors', `${wskrName(data)} has gone out of link range, Captain. If we do not regain contact in ten minutes it will surface to call us.`);
      else if (type === 'wskr-surfaced') say('sensors', `${wskrName(data)} has surfaced and is calling in over the surface link, Captain. It will dive again when it is back in range.`, 'mission');
      else if (type === 'wskr-link-back') say('sensors', `${wskrName(data)} is back in link range, Captain.`);
      else if (type === 'wskr-low') say('sensors', `${wskrName(data)} is down to its last charge, Captain. Recalling it.`, 'mission');
      else if (type === 'wskr-dead') say('sensors', `${wskrName(data)} has lost power and is adrift, Captain. Bring the ship alongside to recover it.`, 'mission');
      else if (type === 'shuttle-search-done') say('comms', `Aqua Nova, ${SHUTTLE_NAME}. Search pattern finished. Holding position and waiting for orders.`, 'mission');
      else if (type === 'wskr-search-done') say('sensors', `${wskrName(data)} has finished its search pattern and is rejoining the formation.`);
      else if (type === 'bay-launched') say(data.craft === 'shuttle' ? 'security' : data.craft === 'rov' ? 'science' : 'sensors', data.craft === 'shuttle' ? `${SHUTTLE_NAME} is away, Captain.` : data.craft === 'rov' ? 'Remora is away. The bay doors stay open for her tether until she is back aboard, Captain.' : `${wskrName(data)} is away.`, '', { action: true });
      else if (type === 'speed-cap') say('helm', `Captain, the outer bay doors are open. I am holding us at ${data.kt} knots to protect the ship and the doors. Tell me to override the limit, or use Systems, if you want more.`, 'mission');
      else if (type === 'speed-override') say('helm', 'Limit overridden, Captain. Speed is yours until the doors close. Watch the bay.');
      else if (type === 'bay-warn') say('engineering', `Captain, the bay doors are open and she is taking a beating at ${Math.round(data.kt)} knots. Come below ${BAY_SAFE_KT}, if ya please.`, 'mission');
      else if (type === 'bay-door-damage') say('engineering', `Captain, ya killing the bay doors at this speed! I recommend we slow down. They are ${Math.round(data.pct)} percent gone, and only a dry dock fixes that.`, 'mission');
      else if (type === 'bay-tether') say('sensors', `${wskrName(data)} is alongside, Captain, but Remora's tether is holding the bay doors open. Get her aboard first.`);
      else if (type === 'remora-aboard') say('science', `Remora is aboard. The team are unloading ${data.load} sample${data.load === 1 ? '' : 's'} and re-equipping her: about ${Math.ceil(data.dur / 60)} minutes.`, '', { action: true });
      else if (type === 'remora-ready') say('science', 'Remora is unloaded and re-equipped, Captain. She is ready to launch.', '', { action: true });
      else if (type === 'bay-wait') say('sensors', `${wskrName(data)} is alongside, Captain. Slow below ${BAY_SAFE_KT} knots and we will take it aboard.`);
      else if (type === 'shuttle-arrived') say('helm', `${SHUTTLE_NAME} is alongside ${(data.dest || {}).name || 'the pier'}. Cycling the airlock, ten seconds.`);
      else if (type === 'shuttle-landed') say('helm', `The away team is ashore at ${(data.dest || {}).name || 'the pier'}, ${SHUTTLE_NAME} is moored and charging. Recall her when they are ready.`);
      else if (type === 'shuttle-nolink') say('helm', `${SHUTTLE_NAME} has lost her radio link with one pilot aboard, Captain. She is turning back.`, 'mission');
      else if (type === 'shuttle-exchanged') say('helm', `Crew and supplies are across. ${SHUTTLE_NAME} is coming home.`);
      else if (type === 'shuttle-alongside') say('security', `${SHUTTLE_NAME} is alongside, Captain. Get us below ${BAY_SAFE_KT} knots and I will bring her in.`);
      else if (type === 'shuttle-aboard') say('security', `${SHUTTLE_NAME} is aboard, Captain. The bay is dry and she is on charge.`);
      else if (type === 'shuttle-low') say('helm', `${SHUTTLE_NAME} is down to her reserve, Captain. Bringing her home.`, 'mission');
      else if (type === 'shuttle-o2-low') say('helm', `${SHUTTLE_NAME}'s air is down to her reserve, Captain. Bringing her home.`, 'mission');
      else if (type === 'shuttle-o2-out') say('helm', `${SHUTTLE_NAME} is out of air, Captain, and drifting. Take the ship to her, fast.`, 'mission');
      else if (type === 'shuttle-dead') say('helm', `${SHUTTLE_NAME} has lost power and is adrift, Captain. Take the ship to her.`, 'mission');
      else if (type === 'wskr-relaunch') say('sensors', `${wskrName(data)} is fully charged and going back out, Captain.`);
      else if (type === 'wskr-trail-lost') say('sensors', `${wskrName(data)} has lost the contact, Captain, and is back in formation.`);
      else if (type === 'wskr-relaunch-wait') say('sensors', `${wskrName(data)} is charged and ready to go back out, Captain. Slow below ${BAY_SAFE_KT} knots and the bay will launch it.`);
      else if (type === 'wskr-launchall-stop') say('sensors', data.why === 'charge' ? 'The rest of the WSKRs are still charging, Captain. I have stopped the launch.' : 'I have stopped the WSKR launch, Captain. The bay cannot send the next one.');
      else if (type === 'wskr-recovered') say('sensors', `${wskrName(data)} is back in the launch bay.`);
      else if (type === 'bump') {
        const k = data.kind;
        if (k === 'edge') say('helm', 'That is the limit of our Area of Operations, Captain. We are not cleared to go further. All stop.', 'error');
        else if (k === 'ao-near') say('helm', `Captain, the limit of our Area of Operations is about ${Math.max(1, Math.round(data.nm))} miles ahead. We are not cleared to cross it.`, 'error');
        else say('engineering', `${k === 'shoal' ? 'We have run aground' : 'We touched bottom'}! Hull damage ${Math.round(data.damage)}%.`, 'error');
      }
    });
    // A new game starts in the Launch Bay (the Captain arrives by the Tern) with the arrival form. Saves from before the form keep their PED and get no name.
    const fresh = !getPlayer() && commsLocked();
    if (!fresh && !hasPed() && !getPlayer()) gameState.updateProperty('progress.got_ped', true);
    const skip = navigator.webdriver && !/[?&]intake=1/.test(location.search);   // automated tests skip the form
    if (fresh && !skip) {
      openScene('launchbay');
      runIntake({ dateText: clockText(), onDone: () => { checkpoint(); syncUI(); } });
    } else {
      if (fresh) { setPlayer('Alex', 'Mercer'); gameState.updateProperty('progress.got_ped', true); }
      const resume = !fresh && gameState.getProperty('progress.read_welcome') === true && !(navigator.webdriver && !/[?&]resume=1/.test(location.search));   // tests start on the bridge unless they ask
      if (resume) { scene.show('quarters'); openStation('log'); }   // coming back to a game, or after an update: start at the logbook
      else if (commsLocked()) openScene('quarters'); else scene.show('bridge');
    }
    pendingModals.splice(0).forEach((run) => run());
    syncUI();
    dlog('tablet: boarded');
  });
}
// Offline play: the service worker keeps a copy of the game. Needs https (GitHub Pages) or localhost.
if ('serviceWorker' in navigator) navigator.serviceWorker.register(new URL('../../sw.js', import.meta.url)).catch((e) => dlog('service worker not registered: ' + e.message));
window.__aq = { open: (n) => openStation(n), scene: (n) => openScene(n), toggleQuarters: () => openScene(scene.inQuarters ? 'bridge' : 'quarters'), notify: notifyStats, console: () => scene.console };   // used by the test scripts
boot();
