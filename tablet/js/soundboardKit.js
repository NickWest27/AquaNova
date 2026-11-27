// The sound board's buttons (owner, 2026-11-27), shared by the stand-alone page (soundboard.html) and PED > Settings > Sound.
// buildBoard(root, audio, toast): root gets a grid per group; audio() returns { ac, out } (started on the first tap); toast(text) reports.
// Names are kept on this device (localStorage) and shared by both places. Returns { stopAll(), copyNames(), resetNames() }.
import { SFX_LIST, playSfx, loopSfx, isLoop } from './sfx.js';
import { playTheme, stopTheme, themePlaying } from './theme.js';

const KEY = 'aquaNova_sfxLabels';
export const GROUPS = [
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
const defaultName = (id) => (SFX_LIST[id] || id).replace(/^LOOP /, '').split(/[:(]/)[0].trim();
const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'text') n.textContent = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v); } for (const c of kids) if (c) n.append(c); return n; };

export function buildBoard(board, audio, toast = () => {}) {
  let names = load();
  const nameOf = (id) => names[id] || defaultName(id);
  const loops = new Map();
  function pad(id) {
    const loop = isLoop(id), card = el('div', { class: 'sb-pad' + (loop ? ' loop' : '') });
    const label = el('span', { class: 'sb-label' });
    const paint = () => { label.textContent = nameOf(id); if (loop) label.append(el('span', { class: 'sb-tag', text: 'LOOP' })); };
    paint();
    const play = el('button', { class: 'sb-play', onclick: () => {
      const a = audio(); if (!a) { toast('Sound is not running yet'); return; }
      if (loop) {
        if (loops.has(id)) { loops.get(id).stop(); loops.delete(id); card.classList.remove('playing'); return; }
        loops.set(id, loopSfx(a.ac, a.out, id)); card.classList.add('playing'); return;
      }
      const len = playSfx(a.ac, a.out, id); card.classList.add('playing'); setTimeout(() => card.classList.remove('playing'), Math.max(300, len * 1000));
    } }, label, el('span', { class: 'sb-desc', text: (SFX_LIST[id] || '').replace(/^LOOP /, '') }), el('span', { class: 'sb-id', text: id }));
    const edit = el('button', { class: 'sb-edit', 'aria-label': 'Rename', text: '✎', onclick: () => {
      if (card.querySelector('input.sb-rename')) return;
      const inp = el('input', { class: 'sb-rename', type: 'text', value: nameOf(id), 'aria-label': 'New name' });
      const done = () => { const v = inp.value.trim(); if (v && v !== defaultName(id)) names[id] = v; else delete names[id]; save(names); inp.remove(); paint(); };
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
      inp.addEventListener('blur', done);
      card.append(inp); inp.focus(); inp.select();
    } });
    card.append(play, edit);
    return card;
  }
  for (const [title, ids] of GROUPS) board.append(el('h2', { class: 'sb-h', text: title }), el('div', { class: 'sb-grid' }, ...ids.filter((id) => SFX_LIST[id]).map(pad)));
  const placed = new Set(GROUPS.flatMap((g) => g[1])), rest = Object.keys(SFX_LIST).filter((id) => !placed.has(id));
  if (rest.length) board.append(el('h2', { class: 'sb-h', text: 'Other' }), el('div', { class: 'sb-grid' }, ...rest.map(pad)));
  const themeCard = el('div', { class: 'sb-pad' }, el('button', { class: 'sb-play', onclick: () => { const a = audio(); if (!a) return; if (themePlaying()) { stopTheme(); themeCard.classList.remove('playing'); return; } playTheme(a.ac, a.out); themeCard.classList.add('playing'); } },
    el('span', { class: 'sb-label', text: 'Beneath the Waves' }), el('span', { class: 'sb-desc', text: 'The main title (about a minute and a half). Tap again to stop.' }), el('span', { class: 'sb-id', text: 'theme' })));
  board.append(el('h2', { class: 'sb-h', text: 'Music' }), el('div', { class: 'sb-grid' }, themeCard));
  return {
    stopAll() { for (const l of loops.values()) l.stop(); loops.clear(); stopTheme(); board.querySelectorAll('.sb-pad.playing').forEach((p) => p.classList.remove('playing')); },
    async copyNames() { const text = 'Aqua Nova sound names\n' + Object.keys(SFX_LIST).map((id) => `${id}: ${nameOf(id)}`).join('\n'); try { await navigator.clipboard.writeText(text); toast('Names copied'); } catch (e) { prompt('Copy this list:', text); } },
    resetNames() { names = {}; save(names); board.querySelectorAll('.sb-pad').forEach((p) => { const id = p.querySelector('.sb-id').textContent; const l = p.querySelector('.sb-label'); if (id !== 'theme') { l.textContent = defaultName(id); if (isLoop(id)) l.append(el('span', { class: 'sb-tag', text: 'LOOP' })); } }); toast('Names reset'); },
  };
}

/** The board's styles (used by both places). */
export const BOARD_CSS = `
.sb-h { font: 700 14px ui-monospace, Menlo, monospace; letter-spacing: .16em; color: #8fa6bd; margin: 18px 0 8px; text-transform: uppercase; }
.sb-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
.sb-pad { position: relative; display: flex; flex-direction: column; border-radius: 14px; border: 2px solid rgba(100,255,218,.3); background: #0a1f33; overflow: hidden; }
.sb-play { flex: 1; min-height: 84px; padding: 12px 14px 10px; border: 0; background: none; color: #e6f1ff; text-align: left; font-family: inherit; display: flex; flex-direction: column; gap: 4px; }
.sb-play:active, .sb-pad.playing .sb-play { background: rgba(100,255,218,.16); }
.sb-pad.playing { border-color: #64ffda; } .sb-pad.loop.playing { border-color: #ffb020; }
.sb-label { font: 700 17px inherit; font-family: inherit; color: #64ffda; padding-right: 40px; }
.sb-desc { font-size: 13px; color: #8fa6bd; padding-right: 40px; }
.sb-id { font: 11px ui-monospace, Menlo, monospace; color: #4f6b85; }
.sb-edit { position: absolute; top: 6px; right: 6px; width: 40px; height: 40px; border-radius: 10px; border: 1px solid rgba(100,255,218,.3); background: #072236; color: #8fa6bd; font-size: 18px; }
.sb-rename { margin: 8px 10px 10px; min-height: 44px; border-radius: 10px; border: 2px solid #64ffda; background: #031019; color: #e6f1ff; font: 600 17px inherit; font-family: inherit; padding: 0 10px; -webkit-user-select: text; user-select: text; }
.sb-tag { display: inline-block; margin-left: 6px; padding: 1px 6px; border-radius: 6px; font: 700 10px ui-monospace, monospace; letter-spacing: .1em; color: #04101f; background: #ffb020; vertical-align: middle; }
`;

/** The board as a full-screen panel over the game (PED > Settings > Sound > Sound board). Close stops everything it started. */
export function openSoundBoard(audio, toast = () => {}) {
  if (document.querySelector('.sb-overlay')) return;
  if (!document.getElementById('sb-css')) document.head.append(el('style', { id: 'sb-css', text: BOARD_CSS + OVERLAY_CSS }));
  const body = el('div', { class: 'sb-body' }, el('p', { class: 'sb-note', text: 'Tap a sound to play it. LOOP sounds play until you tap them again. ✎ renames a sound (kept on this iPad). Copy names copies your list to paste back to Claude.' }));
  const board = buildBoard(body, audio, toast);
  const btn = (text, fn, cls = '') => el('button', { class: 'sb-tool ' + cls, text, onclick: fn });
  const ov = el('div', { class: 'sb-overlay', role: 'dialog', 'aria-label': 'Sound board' },
    el('div', { class: 'sb-head' }, el('span', { class: 'sb-title', text: 'SOUND BOARD' }),
      btn('Stop all', () => board.stopAll(), 'stop'), btn('Copy names', () => board.copyNames()),
      btn('Reset names', () => { if (confirm('Put every name back to the original?')) board.resetNames(); }),
      btn('Close', () => { board.stopAll(); ov.remove(); }, 'close')),
    body);
  document.body.append(ov);
}
const OVERLAY_CSS = `
.sb-overlay { position: fixed; inset: 0; z-index: 9000; background: #04101f; color: #e6f1ff; display: flex; flex-direction: column; font: 16px/1.35 -apple-system, system-ui, sans-serif; }
.sb-head { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; padding: calc(env(safe-area-inset-top) + 10px) 16px 10px; border-bottom: 1px solid rgba(100,255,218,.3); }
.sb-title { font: 800 20px ui-monospace, Menlo, monospace; letter-spacing: .12em; color: #64ffda; margin-right: auto; }
.sb-tool { min-height: 48px; padding: 0 16px; border-radius: 12px; border: 2px solid rgba(100,255,218,.3); background: #0a1f33; color: #e6f1ff; font: 600 16px inherit; font-family: inherit; }
.sb-tool.stop { border-color: #ff5c5c; color: #ff5c5c; } .sb-tool.close { border-color: #64ffda; color: #64ffda; }
.sb-body { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 8px 16px calc(env(safe-area-inset-bottom) + 24px); }
.sb-note { color: #8fa6bd; font-size: 14px; margin: 6px 0 0; }
`;
