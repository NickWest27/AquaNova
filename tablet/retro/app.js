// Retro Aqua Nova: the same game engine (sim, saves, missions, crew) under a 320 x 240 pixel look. Screens are converted one at a time:
// the bridge is done; every other station shows a "not converted yet" page until it is.
import '../../utils/debugPanel.js';
import { dlog } from '../../utils/log.js';
import { sim } from '../js/sim.js';
import { seafloor } from '../js/seafloor.js';
import * as traffic from '../js/traffic.js';
import '../js/sonar.js';
import '../js/rov.js';
import '../js/tern.js';
import '../js/commsModel.js';
import { loadReputation } from '../js/reputation.js';
import { initGenerator } from '../js/missionGen.js';
import { startAria } from '../js/aria.js';
import { initMissionLog } from '../js/missionLog.js';
import { initAudio, updateHum } from '../js/audio.js';
import { gameState, loadGame, startExitSave } from '../js/persist.js';
import { mountRetro } from './retro.js';
import { createBridge } from './bridge.js';
import { el } from './ui.js';

const { stage } = mountRetro(document.getElementById('root'));
let bridge = null, stub = null;

// ---- stations that are not converted yet ----
const TITLES = { helm: 'HELM', nav: 'NAVIGATION', sys: 'SYSTEMS', comms: 'COMMS', sensors: 'SENSORS', walkway: 'WALKWAY' };
function openStub(id) {
  closeStub();
  stub = el('div', 'rstub');
  stub.append(el('div', 'head', TITLES[id] || id.toUpperCase()),
    el('div', 'body', 'This station is not in the retro look yet. It still works in the old tablet version. Tell Claude which one to convert next.'));
  const back = el('button', 'rbtn', 'BACK'); back.onclick = closeStub; stub.append(back); stage.append(stub);
}
function closeStub() { if (stub) { stub.remove(); stub = null; } }

// ---- splash ----
const splash = el('div', 'rsplash');
const info = el('div', 'info', 'Starting systems...'), board = el('button', 'rbtn', 'BOARD'); board.disabled = true;
splash.append(el('div', 'title', 'A Q U A   N O V A'), el('div', 'sub', 'Deep Sea Research Vessel'), board, info); stage.append(splash);

async function boot() {
  let missions = null;
  try {
    info.textContent = 'Loading charts, crew and saved game...';
    await sim.loadPois();
    seafloor.load().then((ok) => ok && sim.touch());
    await loadGame();
    try { await loadReputation(); } catch (e) { console.warn('reputation not loaded', e); }
    try { await traffic.load(); } catch (e) { console.warn('traffic not loaded', e); }
    try { missions = (await import('../../game/systems/missionManager.js')).default; await missions.init(); initMissionLog(); startAria(); try { await initGenerator(); } catch (e) { console.warn('Generator unavailable', e); } } catch (e) { console.warn('Missions unavailable', e); }
    if (!sim.s.at && !gameState.getProperty('navigation.location')) { const d = sim.dockPoi(); if (d) { sim.s.lat = d.lat; sim.s.lon = d.lon; sim.s.at = d; sim.s.docked = true; } }
    board.disabled = false; info.textContent = '';
  } catch (e) { console.error('Boot failed', e); info.textContent = 'Startup failed. Triple-tap the top-left corner.'; return; }
  board.onclick = () => {
    initAudio(); splash.remove();
    bridge = createBridge(stage, { onOpen: openStub });
    sim.start(); startExitSave();
    sim.on((type) => { if (type === 'tick') { bridge.update(performance.now()); updateHum(sim.s.speed); } });
    bridge.update(performance.now());
    dlog('retro: boarded');
  };
}
window.__aq = { open: (id) => openStub(id), close: closeStub, bridge: () => bridge };
if ('serviceWorker' in navigator) navigator.serviceWorker.register(new URL('../../sw.js', import.meta.url)).catch((e) => dlog('service worker not registered: ' + e.message));
boot();
