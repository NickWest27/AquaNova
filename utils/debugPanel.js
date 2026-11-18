// utils/debugPanel.js
// On-screen log viewer for devices without a console (iPad).
//
// Open/close: tap 3 times fast in the top-left corner, or press the ` key.
// Records console.error, console.warn, uncaught errors and failed promises
// at all times. Records console.log too when debug mode is on (?debug=1).
//
// Import this FIRST in each page's entry script so it sees early errors.

import { DEBUG } from './log.js';

const MAX_LINES = 200;
const lines = [];
let panel = null;
let output = null;
let open = false;

function format(value) {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch (error) {
    return String(value);
  }
}

function record(level, args) {
  const time = new Date().toLocaleTimeString('en-US', { hour12: false });
  lines.push({ level, text: `${time} ${args.map(format).join(' ')}` });
  if (lines.length > MAX_LINES) lines.shift();
  if (open) render();
}

function patchConsole() {
  const levels = ['error', 'warn'];
  if (DEBUG) levels.push('log');
  levels.forEach((level) => {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      record(level, args);
      original(...args);
    };
  });

  window.addEventListener('error', (e) => {
    record('error', [`${e.message} (${(e.filename || '').split('/').pop()}:${e.lineno})`]);
  });
  window.addEventListener('unhandledrejection', (e) => {
    record('error', ['Unhandled promise rejection:', e.reason]);
  });
}

function summary() {
  const scale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--scale')).toFixed(2);
  return `${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio}x | scale ${scale === 'NaN' ? '?' : scale} | debug ${DEBUG ? 'on' : 'off'} | ${window.location.pathname}`;
}

function render() {
  if (!output) return;
  output.textContent = '';
  const head = document.createElement('div');
  head.className = 'debug-head';
  head.textContent = summary();
  output.appendChild(head);
  lines.forEach((entry) => {
    const row = document.createElement('div');
    row.className = `debug-line debug-${entry.level}`;
    row.textContent = entry.text;
    output.appendChild(row);
  });
  output.scrollTop = output.scrollHeight;
}

function buildPanel() {
  const style = document.createElement('style');
  style.textContent = `
    #debug-panel { position: fixed; left: 0; right: 0; bottom: 0; height: 40vh; z-index: 100000;
      display: none; flex-direction: column; background: rgba(0,0,0,0.92); color: #cfe;
      font: 12px/1.4 'Courier New', monospace; border-top: 2px solid #64ffda; text-align: left; }
    #debug-panel .debug-bar { display: flex; gap: 8px; padding: 6px; }
    #debug-panel button { font: inherit; padding: 6px 12px; color: #64ffda; background: #112240;
      border: 1px solid #64ffda; border-radius: 4px; }
    #debug-panel .debug-out { flex: 1; overflow-y: auto; padding: 0 8px 8px; -webkit-overflow-scrolling: touch; }
    #debug-panel .debug-head { color: #8892b0; margin-bottom: 4px; }
    #debug-panel .debug-line { white-space: pre-wrap; word-break: break-word; }
    #debug-panel .debug-error { color: #ff6b6b; }
    #debug-panel .debug-warn { color: #ffa500; }
  `;
  document.head.appendChild(style);

  panel = document.createElement('div');
  panel.id = 'debug-panel';
  panel.innerHTML = `
    <div class="debug-bar">
      <button data-act="copy">Copy</button>
      <button data-act="clear">Clear</button>
      <button data-act="close">Close</button>
    </div>
    <div class="debug-out"></div>
  `;
  output = panel.querySelector('.debug-out');
  panel.addEventListener('click', (e) => {
    const action = e.target.dataset && e.target.dataset.act;
    if (action === 'close') toggle();
    if (action === 'clear') { lines.length = 0; render(); }
    if (action === 'copy') {
      const text = `${summary()}\n${lines.map((l) => l.text).join('\n')}`;
      if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
    }
  });
  document.body.appendChild(panel);
}

function toggle() {
  if (!panel) buildPanel();
  open = !open;
  panel.style.display = open ? 'flex' : 'none';
  if (open) render();
}

function bindOpenGestures() {
  let taps = [];
  window.addEventListener('pointerdown', (e) => {
    if (e.clientX > 64 || e.clientY > 64) return;
    const now = Date.now();
    taps = taps.filter((t) => now - t < 700);
    taps.push(now);
    if (taps.length >= 3) {
      taps = [];
      toggle();
    }
  }, true);

  document.addEventListener('keydown', (e) => {
    const typing = e.target && ['INPUT', 'TEXTAREA'].includes(e.target.tagName);
    if (e.key === '`' && !typing) toggle();
  });
}

patchConsole();
bindOpenGestures();

export { toggle as toggleDebugPanel };
