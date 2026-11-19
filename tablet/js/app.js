import '../../utils/debugPanel.js';
import { dlog } from '../../utils/log.js';
import { sim, clockText, toward, MAX_SPEED, wskrName } from './sim.js';
import { createScene } from './scene.js';
import { say, unreadCount, stats as notifyStats } from './notify.js';
import { seafloor } from './seafloor.js';
import { fileScan } from './findings.js';
import './rov.js';
import './commsModel.js';
import { tickLab, SAMPLE_KINDS, awardSurveyBonus } from './science.js';
import { el, $, toast, pad, modal, frameThrottle, viewProbe } from './util.js';
import { ICONS } from './ui.js';
import { startSync, syncAtBoot } from './sync.js';
import { isCommissioned, excuse } from './unlocks.js';
import { initAudio, updateHum, chirp, ping } from './audio.js';
import { gameState, loadGame, liveNav, startExitSave, saveBeforeSleep, checkpoint, addLogEntry, restoreSim } from './persist.js';

const STATIONS = {
  nav: { title: 'Navigation', icon: 'nav' }, helm: { title: 'Helm', icon: 'helm' }, sys: { title: 'Systems', icon: 'sys' },
  sensors: { title: 'Sensors', icon: 'sensors' }, comms: { title: 'Comms', icon: 'comms' }, log: { title: 'Logbook', icon: 'log' }, ped: { title: 'PED', icon: 'more' },
  lab: { title: 'Science Lab', icon: 'sensors' }, wskr: { title: 'WSKRs', icon: 'sensors' }, remora: { title: 'Remora (Science ROV)', icon: 'helm' }, bay: { title: 'Launch Bay control', icon: 'helm' },
  crew: { title: 'Communicator', icon: 'comms', hidden: true }, // opened from the pin, not the dock
};
const FILES = { sys: 'systems' };
const WHERE = { bridge: 'Bridge', quarters: 'Quarters', walkway: 'Walkway', walkway2: 'Walkway AN-1', science: 'Science Lab', medbay: 'Medbay', launchbay: 'Launch Bay' };   // the back button returns to the room you came from
const SYSTEM_TEXT = {
  mission_start_tutorial: ['Welcome aboard, Captain', 'Captain Elena Voss was relieved of command at the last minute. OERA called you out of retirement to take her place on the Aqua Nova. Your quarters are ready, and your communicator pin is waiting on your desk.'],
  communicator_tutorial: ['Communicator ready', 'Pin on. Tap the badge in the top-right corner to talk to your crew. ARIA, your executive officer, is waiting to hear from you.'],
};
const modules = {};
let tickN = 0;
// stamp each new message with the game date and time it arrived (the mission code knows nothing of the game clock)
document.addEventListener('comms-message', () => {
  const list = gameState.getProperty('mission.inbox') || [], last = list[list.length - 1];
  if (last && last.gameClock == null) gameState.updateProperty('mission.inbox', list.map((m, i) => i === list.length - 1 ? { ...m, gameClock: Math.round(sim.s.clock) } : m));
});
let scene, current = null, missions = null, boarded = false;
const pendingModals = [];
let zoom = 1;
try { zoom = parseFloat(localStorage.getItem('aquaNova_zoom')) || 1; } catch (e) { /* ignore */ }
const applyZoom = () => document.documentElement.style.setProperty('--zoom', zoom);
applyZoom();

// ---------- mission state helpers ----------
const objectives = () => gameState.getProperty('mission.objectives') || [];
const objStatus = (id) => (objectives().find((o) => o.id === id) || {}).status;
const commsLocked = () => objStatus('meetTheCrew_pickup_communicator') === 'active';

viewProbe.fn = () => boarded && !!scene && scene.where === 'bridge' && !current && !ped && !comm;

const ctx = {
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
  scene.showPickup(scene.inQuarters && locked && objStatus('meetTheCrew_find_communicator') === 'completed');
  const unread = (gameState.getProperty('mission.inbox') || []).filter((m) => !m.read).length;
  scene.glow('COMMS', unread > 0);   // new mail: the comms station glows on the bridge
  const pin = $('#pin');
  const quiet = firstUI; firstUI = false;   // the first pass only restores state: no chirp on load
  if (pin.hidden === locked) return;
  pin.hidden = locked;
  if (!locked) { pin.classList.remove('ring'); void pin.offsetWidth; pin.classList.add('ring'); if (!quiet) chirp(); }
});

// ---------- scene scaling: one transform ----------
function fit() {
  const wrap = $('#scene-wrap'), stage = $('#stage');
  if (!wrap || !stage) return;
  const w = wrap.clientWidth;
  if (w) stage.style.transform = `scale(${w / 1920})`;
}

// ---------- PED: a pop-up on top of the current screen, not a station ----------
let ped = null;
async function togglePed() {
  if (ped) return closePed();
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
async function toggleComm() {
  if (comm) return closeComm();
  if (commsLocked()) return;
  gameState.updateProperty('tutorial.communicator_opened', true); // "First Contact" step 3
  const root = $('#comm-pop'), body = el('div', { class: 'st-body' });
  root.replaceChildren(el('div', { class: 'comm-panel' },
    el('div', { class: 'comm-top' }, el('small', { class: 'comm-live', text: '● voice channel open' })),
    body));
  root.onclick = (e) => { if (!e.target.closest('button, .comm-reply, .comm-head, .comm-you, .comm-who-label')) closeComm(); };   // a tap anywhere but a button or text closes it
  root.hidden = false;
  try {
    modules.crew ||= await import('./stations/crew.js');
    comm = { api: modules.crew.mount(body, ctx) };
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
  if (!isCommissioned(name)) { toast(excuse(name), 'warn'); return; }
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
  current = null; document.body.classList.remove('has-line'); $('#station').hidden = true; $('#station').replaceChildren(); $('#ped-btn').hidden = false;
  scene.update(); syncUI();
}
function updateChips() {
  if (!current) return;
  const s = sim.s;
  const txt = `SPD ${s.speed.toFixed(1)} · DEP ${Math.round(s.depth)} · HDG ${pad(s.heading)}`;
  if (current.chips.textContent !== txt) current.chips.textContent = txt;
}
function openScene(name) {
  if (name === 'quarters') {
    closeStation(); scene.show('quarters');
    document.dispatchEvent(new CustomEvent('location-enter', { detail: { location: 'quarters' } }));
  } else if (name === 'bridge') { closeStation(); scene.show('bridge'); }
  else if (name === 'walkway') { closeStation(); scene.show('walkway'); }
  else if (name === 'walkway2') { closeStation(); scene.show('walkway2'); }
  else if (name === 'sleep') sleepDialog();
  else if (name === 'science') { closeStation(); scene.show('science'); }
  else if (name === 'launchbay') { closeStation(); scene.show('launchbay'); }
  else if (name === 'medbay') { closeStation(); scene.show('medbay'); }
  else if (name === 'medbay-station') toast('The medbay equipment is not commissioned yet.');
  else if (name === 'lab-analysis' || name === 'lab-research') { ctx.labTab = name.slice(4); openStation('lab'); }
  else if (name === 'lab') { ctx.labTab = 'samples'; openStation('lab'); }
  else if (name === 'engineering') toast('Engineering is not built yet. Talk to the crew on the communicator.');
  else if (name === 'pickup') document.dispatchEvent(new CustomEvent('item-pickup', { detail: { itemId: 'communicator' } }));
  else openStation(name);
  syncUI();
}

// ---------- sleep: jump the game clock forward ----------
function sleepDialog() {
  const s = sim.s;
  // time to the destination at the speed you are set for (so a long transit takes less of your time)
  const kt = Math.max(s.speed, s.throttle * MAX_SPEED);
  const eh = s.wpt && kt > 0.5 && !s.docked ? sim.etaHours() : null;
  const eta = eh == null ? null : Math.min(96, Math.ceil(eh * 10) / 10 + 0.1);
  let hours = eta && eta <= 12 ? eta : 8, untilArrival = !!(eta && eta <= 12);
  const fmt = (h) => (h >= 1 ? `${Math.round(h * 10) / 10} h` : `${Math.round(h * 60)} min`);
  const note = el('p', { text: `It is ${clockText()}. The game saves first. The ship keeps its course and speed while you sleep, so a long trip passes quickly. The crew wake you if you arrive at your destination, or in an emergency.${s.docked ? ' Docked: shore power charges the ship.' : ''}` });
  const chips = el('div', { class: 'row' });
  const draw = () => chips.replaceChildren(
    ...[2, 4, 8, 12, 24].map((h) => el('button', { class: `btn chip ${!untilArrival && h === hours ? 'on primary' : ''}`, text: `${h} h`, onclick: () => { hours = h; untilArrival = false; draw(); } })),
    eta && el('button', { class: `btn chip ${untilArrival ? 'on primary' : ''}`, text: `Until arrival (${fmt(eta)})`, onclick: () => { hours = eta; untilArrival = true; draw(); } }));
  draw();
  modal({ title: 'Sleep', body: el('div', {}, note, chips), actions: [{ label: 'Cancel' }, { label: 'Sleep', primary: true, run: () => {
    saveBeforeSleep();                         // a save before sleep, as agreed
    const r = sim.warp(hours);
    const h = fmt(r.hours);
    const text = r.arrived ? `Captain, we have arrived at ${r.arrived}. You slept ${h}. It is ${clockText()}.`
      : r.reason ? `Captain, ${r.reason}. I woke you early. You slept ${h}. It is ${clockText()}.` : `You slept ${h}. It is ${clockText()}.`;
    modal({ title: r.arrived ? 'We have arrived' : r.reason ? 'ARIA woke you' : 'Good morning, Captain', body: el('p', { text }), actions: [{ label: 'OK', primary: true }] });
    ping(); liveNav(); syncUI(); scene.update();
  } }] });
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
document.addEventListener('mission-notify', (e) => { if (boarded) say('aria', `${e.detail.title} — ${e.detail.subtitle}`, 'mission', { hold: false }); });   // objectives live in the PDA Tasks, not the communicator

function firstVisit(poi) {
  const seen = gameState.getProperty('progress.areasExplored') || [];
  const key = poi.name.toLowerCase().replace(/\s+/g, '_');
  if (seen.includes(key)) return;
  gameState.updateProperty('progress.areasExplored', [...seen, key]);
  addLogEntry(`Arrived at ${poi.name}. ${poi.text}`, { type: 'discovery_log', tags: ['arrival', poi.type], canRevert: false }); // a note, not a save point
}

// ---------- boot ----------
async function boot() {
  const btn = $('#board-btn'), info = $('#splash-info');
  try {
    info.textContent = 'Loading charts, crew and saved game…';
    await sim.loadPois();
    seafloor.load().then((ok) => ok && sim.touch());      // sea floor data loads in the background
    await loadGame();                       // saveManager + GameState + sim restore
    await syncAtBoot();                     // pick up journal notes and tasks from the phone
    try {
      missions = (await import('../../game/systems/missionManager.js')).default;
      await missions.init();
    } catch (e) { console.warn('Missions unavailable', e); }
    if (!sim.s.at && !gameState.getProperty('navigation.location')) { const d = sim.dockPoi(); if (d) { sim.s.lat = d.lat; sim.s.lon = d.lon; sim.s.at = d; sim.s.docked = true; } }
    btn.disabled = false; btn.textContent = 'Board the Aqua Nova'; info.textContent = '';
  } catch (e) { console.error('Boot failed', e); info.textContent = 'Startup failed. Triple-tap the top-left corner for the log.'; return; }

  btn.addEventListener('click', () => {
    initAudio();                            // sound may start only after a tap
    $('#splash').hidden = true; $('#shell').hidden = false;
    scene = createScene($('#stage'), { onOpen: openScene });
    const st = buildDock();
    new ResizeObserver(fit).observe($('#scene-wrap')); fit();
    boarded = true;
    sim.start(); startExitSave(); startSync();
    gameState.addObserver(syncUI);
    $('#pin').addEventListener('click', toggleComm);
    document.addEventListener('inbox-change', () => $('#pin').classList.toggle('unread', unreadCount() > 0));
    $('#ped-btn').hidden = false; $('#ped-btn').addEventListener('click', togglePed);
    sim.on((type, data) => {
      if (type === 'tick') {
        const s = sim.s;
        scene.update(); updateChips(); current && current.api.update(); ped && ped.api.update(); updateHum(s.speed);
        if (++tickN % 5 === 0) { liveNav(); if (awardSurveyBonus()) say('science', 'OERA has granted a research budget for the survey, Captain: 3 research points. Check the Research tab.', 'mission'); for (const q of tickLab()) say('science', `Analysis of sample #${q.id} (${SAMPLE_KINDS[q.kind].label.toLowerCase()}) is done: ${q.result} Finding filed.`, 'mission'); }            // about once a second
        const t = `${s.lat.toFixed(3)}°N ${Math.abs(s.lon).toFixed(3)}°W`;
        if (st.pos.textContent !== t) st.pos.textContent = t;
        const ck = clockText() + (s.docked ? ' · DOCKED' : ''); if (st.clock.textContent !== ck) st.clock.textContent = ck;
        const o = ctx.objectives().find((x) => !x.done); const ot = o ? 'Objective: ' + o.text : '';
        if (st.obj.textContent !== ot) st.obj.textContent = ot;
        const b = `BAT ${Math.round(s.battery)}%`; if (st.bat.textContent !== b) st.bat.textContent = b;
      } else if (type === 'enter') { say('helm', `We are at ${data.name}, Captain.`); firstVisit(data); }
      else if (type === 'arrived') say('helm', 'Destination reached, Captain.');
      else if (type === 'wskr-found') { const fresh = fileScan(data.poi); say('sensors', fresh ? `${wskrName(data.wskr)} has finished investigating ${data.poi.name}. Scan filed, Captain.` : `${wskrName(data.wskr)} re-checked ${data.poi.name}. Nothing new.`, 'mission'); }
      else if (type === 'rov-sample') say('science', `The ROV has a ${SAMPLE_KINDS[data.kind].label.toLowerCase()} sample from ${data.site}. It is in the lab, Captain.`);
      else if (type === 'wskr-recovered') say('sensors', `${wskrName(data)} is back in the launch bay.`);
      else if (type === 'bump') {
        const k = data.kind;
        if (k === 'edge') say('helm', 'We are at the edge of the charted area, Captain. All stop.', 'error');
        else say('engineering', `${k === 'shoal' ? 'We have run aground' : 'We touched bottom'}! Hull damage ${Math.round(data.damage)}%.`, 'error');
      }
    });
    // A new game starts in your quarters, where the tutorial begins.
    if (commsLocked()) openScene('quarters'); else scene.show('bridge');
    pendingModals.splice(0).forEach((run) => run());
    syncUI();
    dlog('tablet: boarded');
  });
}
// Offline play: the service worker keeps a copy of the game. Needs https (GitHub Pages) or localhost.
if ('serviceWorker' in navigator) navigator.serviceWorker.register(new URL('../../sw.js', import.meta.url)).catch((e) => dlog('service worker not registered: ' + e.message));
window.__aq = { open: (n) => openStation(n), scene: (n) => openScene(n), toggleQuarters: () => openScene(scene.inQuarters ? 'bridge' : 'quarters'), notify: notifyStats, console: () => scene.console };   // used by the test scripts
boot();
