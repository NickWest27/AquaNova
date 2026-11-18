import '../../utils/debugPanel.js';
import { dlog } from '../../utils/log.js';
import { sim } from './sim.js';
import { createScene } from './scene.js';
import { el, $, toast, pad, modal, frameThrottle } from './util.js';
import { ICONS } from './ui.js';
import { gameState, loadGame, startAutosave, checkpoint, addLogEntry, restoreSim } from './persist.js';

const STATIONS = {
  nav: { title: 'Navigation', icon: 'nav' }, helm: { title: 'Helm', icon: 'helm' }, sys: { title: 'Systems', icon: 'sys' },
  comms: { title: 'Comms', icon: 'comms' }, log: { title: 'Logbook', icon: 'log' }, more: { title: 'More', icon: 'more' },
};
const FILES = { sys: 'systems' };
const SYSTEM_TEXT = {
  mission_start_tutorial: ['Welcome aboard, Captain', 'Captain Elena Voss was relieved of command at the last minute. OERA called you out of retirement to take her place on the Aqua Nova. Your quarters are ready, and your communicator pin is waiting on your desk.'],
  communicator_tutorial: ['Communicator ready', 'Pin on. Tap the COMMS button to open it. ARIA, your executive officer, is waiting to hear from you.'],
};
const modules = {};
let scene, current = null, missions = null, boarded = false, dockEls = {};
const pendingModals = [];
let zoom = 1;
try { zoom = parseFloat(localStorage.getItem('aquaNova_zoom')) || 1; } catch (e) { /* ignore */ }
const applyZoom = () => document.documentElement.style.setProperty('--zoom', zoom);
applyZoom();

// ---------- mission state helpers ----------
const objectives = () => gameState.getProperty('mission.objectives') || [];
const objStatus = (id) => (objectives().find((o) => o.id === id) || {}).status;
const commsLocked = () => objStatus('meetTheCrew_pickup_communicator') === 'active';

const ctx = {
  openScene: (name) => openScene(name),
  refreshScene: () => { scene && scene.update(); syncUI(); },
  zoom(d) { zoom = d === 0 ? 1 : Math.min(1.5, Math.max(0.8, +(zoom + d).toFixed(2))); applyZoom(); try { localStorage.setItem('aquaNova_zoom', zoom); } catch (e) { /* ignore */ } fit(); },
  objectives: () => objectives().map((o) => ({ text: o.description, done: o.status === 'completed' })),
};

// Keeps pickup, locks and similar UI in step with the mission. Runs at most once per frame.
const syncUI = frameThrottle(() => {
  if (!scene) return;
  const locked = commsLocked();
  scene.showPickup(scene.inQuarters && locked && objStatus('meetTheCrew_find_communicator') === 'completed');
  scene.lock('COMMS', locked);
  dockEls.comms && dockEls.comms.classList.toggle('locked', locked);
});

// ---------- scene scaling: one transform ----------
function fit() {
  const wrap = $('#scene-wrap'), stage = $('#stage');
  if (!wrap || !stage) return;
  const w = wrap.clientWidth;
  if (w) stage.style.transform = `scale(${w / 1920})`;
}

// ---------- stations ----------
async function openStation(name) {
  if (name === 'comms') {
    if (commsLocked()) { toast('Find your communicator in your quarters first.'); return; }
    gameState.updateProperty('tutorial.communicator_opened', true); // "First Contact" step 3
  }
  if (current) closeStation();
  const def = STATIONS[name]; if (!def) return;
  const root = $('#station');
  const chips = el('div', { class: 'st-chips' });
  const body = el('div', { class: 'st-body' });
  root.replaceChildren(el('header', { class: 'st-head' },
    el('button', { class: 'btn', text: '‹ Bridge', onclick: closeStation }), el('div', { class: 'st-title', text: def.title }), chips), body);
  root.hidden = false;
  try {
    modules[name] ||= await import(`./stations/${FILES[name] || name}.js`);
    current = { name, api: modules[name].mount(body, ctx), chips };
    current.api.update(); updateChips();
  } catch (e) { console.error('Station failed', name, e); toast('Could not open ' + def.title, 'error'); root.hidden = true; }
}
function closeStation() {
  if (!current) return;
  try { current.api.destroy(); } catch (e) { console.error(e); }
  current = null; $('#station').hidden = true; $('#station').replaceChildren();
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
  else if (name === 'pickup') document.dispatchEvent(new CustomEvent('item-pickup', { detail: { itemId: 'communicator' } }));
  else openStation(name);
  syncUI();
}

// ---------- dock ----------
function buildDock() {
  const dock = $('#dock');
  const status = el('div', { class: 'dock-status' });
  const st = { pos: el('span'), obj: el('span'), bat: el('span') };
  status.append(st.pos, el('span', { class: 'sp' }), st.obj, st.bat);
  const buttons = el('div', { class: 'dock-buttons' },
    ...Object.entries(STATIONS).map(([k, v]) => el('button', { class: 'dbtn', 'data-st': k, onclick: () => openStation(k), html: `${ICONS[v.icon]}<span>${v.title}</span>` })),
    el('button', { class: 'dbtn', 'data-st': 'quarters', onclick: () => openScene(scene.inQuarters ? 'bridge' : 'quarters'), html: `${ICONS.quarters}<span>Quarters</span>` }));
  dock.replaceChildren(status, buttons);
  dockEls = { comms: buttons.querySelector('[data-st="comms"]') };
  return st;
}

// ---------- mission events ----------
function showSystemDialogue(id) {
  const t = SYSTEM_TEXT[id]; if (!t) return;
  const run = () => modal({ title: t[0], body: el('p', { text: t[1] }), actions: [{ label: 'OK', primary: true }] });
  if (boarded) run(); else pendingModals.push(run);
}
document.addEventListener('show-dialogue', (e) => { if (e.detail.characterId === 'system') showSystemDialogue(e.detail.dialogueId); });
document.addEventListener('mission-notify', (e) => { if (boarded) toast(`${e.detail.title} — ${e.detail.subtitle}`, 'mission'); });

function firstVisit(poi) {
  const seen = gameState.getProperty('progress.areasExplored') || [];
  const key = poi.name.toLowerCase().replace(/\s+/g, '_');
  if (seen.includes(key)) return;
  gameState.updateProperty('progress.areasExplored', [...seen, key]);
  addLogEntry(`Arrived at ${poi.name}. ${poi.text}`, { type: 'discovery_log', tags: ['arrival', poi.type] });
}

// ---------- boot ----------
async function boot() {
  const btn = $('#board-btn'), info = $('#splash-info');
  try {
    info.textContent = 'Loading charts, crew and saved game…';
    await sim.loadPois();
    await loadGame();                       // saveManager + GameState + sim restore
    try {
      missions = (await import('../../game/systems/missionManager.js')).default;
      await missions.init();
    } catch (e) { console.warn('Missions unavailable', e); }
    if (!sim.s.at && !gameState.getProperty('navigation.location')) { const d = sim.dockPoi(); if (d) { sim.s.lat = d.lat; sim.s.lon = d.lon; sim.s.at = d; } }
    btn.disabled = false; btn.textContent = 'Board the Aqua Nova'; info.textContent = '';
  } catch (e) { console.error('Boot failed', e); info.textContent = 'Startup failed. Triple-tap the top-left corner for the log.'; return; }

  btn.addEventListener('click', () => {
    $('#splash').hidden = true; $('#shell').hidden = false;
    scene = createScene($('#stage'), { onOpen: openScene });
    const st = buildDock();
    new ResizeObserver(fit).observe($('#scene-wrap')); fit();
    boarded = true;
    sim.start(); startAutosave();
    gameState.addObserver(syncUI);
    sim.on((type, data) => {
      if (type === 'tick') {
        const s = sim.s;
        scene.update(); updateChips(); current && current.api.update();
        const t = `${s.lat.toFixed(3)}°N ${Math.abs(s.lon).toFixed(3)}°W`;
        if (st.pos.textContent !== t) st.pos.textContent = t;
        const o = ctx.objectives().find((x) => !x.done); const ot = o ? 'Objective: ' + o.text : '';
        if (st.obj.textContent !== ot) st.obj.textContent = ot;
        const b = `BAT ${Math.round(s.battery)}%`; if (st.bat.textContent !== b) st.bat.textContent = b;
      } else if (type === 'enter') { toast('Arrived: ' + data.name); firstVisit(data); }
      else if (type === 'arrived') toast('Destination reached');
    });
    // A new game starts in your quarters, where the tutorial begins.
    if (commsLocked()) openScene('quarters'); else scene.show('bridge');
    pendingModals.splice(0).forEach((run) => run());
    syncUI();
    dlog('tablet: boarded');
  });
}
boot();
