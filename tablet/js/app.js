import '../../utils/debugPanel.js';
import { dlog } from '../../utils/log.js';
import { sim } from './sim.js';
import { createScene } from './scene.js';
import { el, $, toast, pad } from './util.js';
import { ICONS } from './ui.js';
import { loadCrew } from './stations/comms.js';
import { addLog } from './stations/log.js';

const STATIONS = {
  nav: { title: 'Navigation', icon: 'nav' }, helm: { title: 'Helm', icon: 'helm' }, sys: { title: 'Systems', icon: 'sys' },
  comms: { title: 'Comms', icon: 'comms' }, log: { title: 'Logbook', icon: 'log' }, more: { title: 'More', icon: 'more' },
};
const modules = {};
let scene, current = null, crew = [], missions = null;
let zoom = 1;
try { zoom = parseFloat(localStorage.getItem('aquaNova_zoom')) || 1; } catch (e) { /* ignore */ }
const applyZoom = () => document.documentElement.style.setProperty('--zoom', zoom);
applyZoom();

const ctx = {
  crew: [],
  openScene: (name) => openScene(name),
  zoom(d) { zoom = d === 0 ? 1 : Math.min(1.5, Math.max(0.8, +(zoom + d).toFixed(2))); applyZoom(); try { localStorage.setItem('aquaNova_zoom', zoom); } catch (e) { /* ignore */ } fit(); },
  objectives() {
    try { return (missions ? missions.getCurrentObjectives() : []).map((o) => ({ text: o.description || o.text || o.id, done: !!(o.completed || o.done) })); } catch (e) { return []; }
  },
};

// ---------- scene scaling: one transform ----------
function fit() {
  const wrap = $('#scene-wrap'), stage = $('#stage');
  if (!wrap || !stage) return;
  const w = wrap.clientWidth;
  if (w) stage.style.transform = `scale(${w / 1920})`;
}

// ---------- stations ----------
async function openStation(name) {
  if (current) closeStation();
  const def = STATIONS[name]; if (!def) return;
  const root = $('#station');
  const chips = el('div', { class: 'st-chips' });
  const body = el('div', { class: 'st-body' });
  root.replaceChildren(el('header', { class: 'st-head' },
    el('button', { class: 'btn', text: '‹ Bridge', onclick: closeStation }), el('div', { class: 'st-title', text: def.title }), chips), body);
  root.hidden = false;
  try {
    modules[name] ||= await import(`./stations/${name === 'sys' ? 'systems' : name}.js`);
    current = { name, api: modules[name].mount(body, ctx), chips };
    current.api.update(); updateChips();
  } catch (e) { console.error('Station failed', name, e); toast('Could not open ' + def.title, 'error'); root.hidden = true; }
}
function closeStation() {
  if (!current) return;
  try { current.api.destroy(); } catch (e) { console.error(e); }
  current = null; $('#station').hidden = true; $('#station').replaceChildren();
  scene.update();
}
function updateChips() {
  if (!current) return;
  const s = sim.s;
  const txt = `SPD ${s.speed.toFixed(1)} · DEP ${Math.round(s.depth)} · HDG ${pad(s.heading)}`;
  if (current.chips.textContent !== txt) current.chips.textContent = txt;
}
function openScene(name) {
  if (name === 'quarters') { closeStation(); scene.show('quarters'); document.dispatchEvent(new CustomEvent('location-enter', { detail: { location: 'quarters' } })); }
  else if (name === 'bridge') { closeStation(); scene.show('bridge'); }
  else if (name === 'communicator') {
    document.dispatchEvent(new CustomEvent('item-pickup', { detail: { itemId: 'communicator' } }));
    document.dispatchEvent(new CustomEvent('tutorial.communicator_opened'));
    openStation('comms');
  } else openStation(name);
}

// ---------- dock ----------
function buildDock() {
  const dock = $('#dock');
  const status = el('div', { class: 'dock-status' });
  const sp = el('span', { class: 'sp' });
  const st = { pos: el('span'), obj: el('span'), bat: el('span') };
  status.append(st.pos, sp, st.obj, st.bat);
  const buttons = el('div', { class: 'dock-buttons' },
    ...Object.entries(STATIONS).map(([k, v]) => el('button', { class: 'dbtn', 'data-st': k, onclick: () => openStation(k), html: `${ICONS[v.icon]}<span>${v.title}</span>` })),
    el('button', { class: 'dbtn', 'data-st': 'quarters', onclick: () => openScene(scene.inQuarters ? 'bridge' : 'quarters'), html: `${ICONS.quarters}<span>${'Quarters'}</span>` }));
  dock.replaceChildren(status, buttons);
  return st;
}

// ---------- boot ----------
async function boot() {
  const btn = $('#board-btn'), info = $('#splash-info');
  const fail = (m) => { info.textContent = m; };
  try {
    info.textContent = 'Loading charts and crew…';
    await Promise.all([sim.loadPois(), loadCrew().then((c) => { crew = c; ctx.crew = c; })]);
    const dock = sim.dockPoi(); if (dock) { sim.s.lat = dock.lat; sim.s.lon = dock.lon; sim.s.at = dock; }
    try {
      const mm = (await import('../../game/systems/missionManager.js')).default;
      await mm.init(); missions = mm;
    } catch (e) { console.warn('Missions unavailable', e); }
    btn.disabled = false; btn.textContent = 'Board the Aqua Nova'; info.textContent = '';
  } catch (e) { console.error('Boot failed', e); fail('Startup failed. Triple-tap the top-left corner for the log.'); return; }

  btn.addEventListener('click', () => {
    $('#splash').hidden = true; $('#shell').hidden = false;
    scene = createScene($('#stage'), { onOpen: openScene });
    const st = buildDock();
    new ResizeObserver(fit).observe($('#scene-wrap')); fit();
    sim.start();
    let lastObj = '';
    sim.on((type, data) => {
      if (type === 'tick') {
        const s = sim.s;
        scene.update(); updateChips(); current && current.api.update();
        const t = `${s.lat.toFixed(3)}°N ${Math.abs(s.lon).toFixed(3)}°W`;
        if (st.pos.textContent !== t) st.pos.textContent = t;
        const o = ctx.objectives().find((x) => !x.done); const ot = o ? 'Objective: ' + o.text : '';
        if (ot !== lastObj) { lastObj = ot; st.obj.textContent = ot; if (ot) toast(ot, 'mission'); }
        const b = `BAT ${Math.round(s.battery)}%`; if (st.bat.textContent !== b) st.bat.textContent = b;
      } else if (type === 'enter') { toast('Arrived: ' + data.name); addLog('arrival', `Arrived at ${data.name}. ${data.text}`); }
      else if (type === 'arrived') toast('Destination reached');
    });
    scene.update();
    dlog('tablet: boarded');
  });
}
boot();
if ('serviceWorker' in navigator) { /* intentionally none: GitHub Pages caching is enough, and a stale worker is worse than a slow load */ }
