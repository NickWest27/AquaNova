// The sound board (owner, 2026-11-27): every sound in sfx.js on a big button, to listen, compare and rename. Names are kept on this device
// (localStorage) and "Copy names" puts the list on the clipboard to paste back. Touch first: big buttons, no hover.
import '../../utils/debugPanel.js';
import { SFX_LIST, playSfx, loopSfx, isLoop } from './sfx.js';
import { playTheme, stopTheme, themePlaying } from './theme.js';

const KEY = 'aquaNova_sfxLabels';
const GROUPS = [
  ['Alarms', ['generalAlarm', 'battleStations', 'fireAlarm', 'collisionAlarm', 'depthAlarm']],
  ['Sonar', ['sonarPing', 'sonarContact', 'sonarLost']],
  ['Hull and impacts', ['impact', 'crash', 'hullCreak', 'distantExplosion']],
  ['Machinery', ['doorOpen', 'doorClose', 'airlockFlood', 'airlockDrain', 'ballastBlow', 'powerUp', 'powerDown', 'cruiseEngage', 'torpedoLaunch']],
  ['Radio and consoles', ['radioSquelch', 'radioBeep', 'buttonPress', 'buttonError', 'teletype']],
  ['Water', ['bubbles', 'splash']],
  ['Loops', ['fan', 'engineRoom', 'radioStatic', 'reactorHum']],
];
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
const save = (o) => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* private window: names last until reload */ } };
let names = load();
const defaultName = (id) => (SFX_LIST[id] || id).replace(/^LOOP /, '').split(/[:(]/)[0].trim();
const nameOf = (id) => names[id] || defaultName(id);

// sound: started by the first tap (iPad rule), through one volume control
let ac = null, out = null;
function audio() {
  if (!ac) {
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* older iOS */ }
    const AC = window.AudioContext || window.webkitAudioContext; ac = new AC();
    out = ac.createGain(); out.gain.value = document.getElementById('vol').value / 100; out.connect(ac.destination);
  }
  if (ac.state !== 'running') ac.resume();
  return { ac, out };
}
document.getElementById('vol').addEventListener('input', (e) => { if (out) out.gain.value = e.target.value / 100; });

const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'text') n.textContent = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v); } for (const c of kids) if (c) n.append(c); return n; };
const toast = (t) => { const b = document.getElementById('toast'); b.textContent = t; b.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => b.classList.remove('on'), 1800); };

const loops = new Map();   // id -> { stop }
function pad(id) {
  const loop = isLoop(id), card = el('div', { class: 'pad' + (loop ? ' loop' : '') });
  const label = el('span', { class: 'label' });
  const paint = () => { label.textContent = nameOf(id); if (loop) label.append(el('span', { class: 'tag', text: 'LOOP' })); };
  paint();
  const play = el('button', { class: 'play', 'aria-label': `Play ${nameOf(id)}`, onclick: () => {
    const { ac: c, out: o } = audio();
    if (loop) {
      if (loops.has(id)) { loops.get(id).stop(); loops.delete(id); card.classList.remove('playing'); return; }
      loops.set(id, loopSfx(c, o, id)); card.classList.add('playing'); return;
    }
    const len = playSfx(c, o, id); card.classList.add('playing'); setTimeout(() => card.classList.remove('playing'), Math.max(300, len * 1000));
  } }, label, el('span', { class: 'desc', text: (SFX_LIST[id] || '').replace(/^LOOP /, '') }), el('span', { class: 'id', text: id }));
  const edit = el('button', { class: 'edit', 'aria-label': `Rename ${nameOf(id)}`, text: '✎', onclick: () => {
    if (card.querySelector('input.rename')) return;
    const inp = el('input', { class: 'rename', type: 'text', value: nameOf(id), 'aria-label': 'New name' });
    const done = () => { const v = inp.value.trim(); if (v && v !== defaultName(id)) names[id] = v; else delete names[id]; save(names); inp.remove(); paint(); };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
    inp.addEventListener('blur', done);
    card.append(inp); inp.focus(); inp.select();
  } });
  card.append(play, edit);
  return card;
}

const board = document.getElementById('board');
for (const [title, ids] of GROUPS) board.append(el('h2', { text: title }), el('div', { class: 'grid' }, ...ids.filter((id) => SFX_LIST[id]).map(pad)));
// anything in sfx.js not placed in a group above still gets a button
const placed = new Set(GROUPS.flatMap((g) => g[1])), rest = Object.keys(SFX_LIST).filter((id) => !placed.has(id));
if (rest.length) board.append(el('h2', { text: 'Other' }), el('div', { class: 'grid' }, ...rest.map(pad)));
// the main title too
const themeCard = el('div', { class: 'pad' }, el('button', { class: 'play', onclick: () => { const { ac: c, out: o } = audio(); if (themePlaying()) { stopTheme(); themeCard.classList.remove('playing'); return; } playTheme(c, o); themeCard.classList.add('playing'); } },
  el('span', { class: 'label', text: 'Beneath the Waves' }), el('span', { class: 'desc', text: 'The main title (about a minute and a half). Tap again to stop.' }), el('span', { class: 'id', text: 'theme' })));
board.append(el('h2', { text: 'Music' }), el('div', { class: 'grid' }, themeCard));

document.getElementById('stop').addEventListener('click', () => { for (const l of loops.values()) l.stop(); loops.clear(); stopTheme(); document.querySelectorAll('.pad.playing').forEach((p) => p.classList.remove('playing')); if (out) { const o = out; o.gain.setTargetAtTime(0, ac.currentTime, 0.05); out = ac.createGain(); out.gain.value = document.getElementById('vol').value / 100; out.connect(ac.destination); setTimeout(() => o.disconnect(), 400); } });
document.getElementById('copy').addEventListener('click', async () => {
  const text = 'Aqua Nova sound names\n' + Object.keys(SFX_LIST).map((id) => `${id}: ${nameOf(id)}`).join('\n');
  try { await navigator.clipboard.writeText(text); toast('Names copied'); } catch (e) { prompt('Copy this list:', text); }
});
document.getElementById('reset').addEventListener('click', () => { if (!confirm('Put every name back to the original?')) return; names = {}; save(names); board.querySelectorAll('.pad').forEach((p) => p.remove()); location.reload(); });
