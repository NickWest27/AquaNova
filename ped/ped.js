// Aqua Nova PED for iPhone. A companion to the iPad game:
//   reads   live ship status, missions and findings (pushed by the iPad)
//   writes  journal notes and tasks (merged into the iPad logbook)
// It never writes save points. Everything goes through one secret GitHub gist.
import '../utils/debugPanel.js';
import { getConfig, describeSync, connect as connectSync, clearConfig, autoSyncAllowed, resetPace, getActiveId, pullStatus, syncCompanion, makeJournalEntry, newTask } from '../utils/ledgerSync.js';

const KEY = 'aquaNovaPed';
const $ = (s) => document.querySelector(s);
const ICON = {
  status: '<svg viewBox="0 0 24 24"><path d="M4 18a8 8 0 1116 0"/><path d="M12 18l4-6"/></svg>',
  missions: '<svg viewBox="0 0 24 24"><path d="M6 3v18M6 4h12l-3 4 3 4H6"/></svg>',
  findings: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/></svg>',
  tasks: '<svg viewBox="0 0 24 24"><path d="M5 12l4 4 10-10"/></svg>',
  journal: '<svg viewBox="0 0 24 24"><path d="M5 3h12a2 2 0 012 2v16H7a2 2 0 01-2-2z"/><path d="M9 8h6M9 12h6"/></svg>',
  settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg>',
};
const TABS = ['status', 'missions', 'findings', 'tasks', 'journal', 'settings'];

function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
let store = Object.assign({ id: null, name: '', journals: [], tasks: [], status: null, syncedAt: null }, load());
let tab = getConfig() ? 'status' : 'settings';
let net = { state: getConfig() ? 'idle' : 'off', error: '' };
let busy = false;
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { console.warn('Could not store PED data', e); } };

function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) n.append(kid.nodeType ? kid : document.createTextNode(kid));
  return n;
}
function toast(text) { const t = $('#toast'); t.textContent = text; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2600); }
const ago = (iso) => { const s = Math.max(0, (Date.now() - new Date(iso)) / 1000); return s < 90 ? 'just now' : s < 5400 ? `${Math.round(s / 60)} min ago` : s < 129600 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} days ago`; };

// ---------- sync ----------
async function sync({ manual = false } = {}) {
  if (!getConfig()) { net = { state: 'off', error: '' }; paint(); return; }
  if (busy) return;
  if (manual) resetPace(); else if (!autoSyncAllowed()) return;
  busy = true; net = { state: 'busy', error: '' }; paintChip();
  try {
    const id = await getActiveId();
    if (!id) throw new Error('No save found yet. Open the game on the iPad first.');
    if (store.id !== id) store = { id, name: '', journals: [], tasks: [], status: null, syncedAt: null };
    const [mine, status] = await Promise.all([syncCompanion(id, { entries: store.journals, pedTasks: store.tasks }), pullStatus(id)]);
    store.name = mine.name || store.name; store.journals = mine.entries; store.tasks = mine.pedTasks;
    if (status) store.status = status;
    store.syncedAt = new Date().toISOString();
    save(); net = { state: 'ok', error: '' };
  } catch (e) {
    net = { state: 'err', error: e.message || String(e) };
    if (!navigator.onLine) net.error = 'Offline. Changes are kept and will sync later.';
  } finally { busy = false; paint(); }
}

// ---------- views ----------
const views = {
  status() {
    const s = store.status;
    if (!s) return [el('div', { class: 'empty', text: getConfig() ? 'No ship data yet. Open the game on the iPad.' : 'Connect in Settings to see your ship.' })];
    const stale = (Date.now() - new Date(s.t)) > 5 * 60000;
    const cls = (v, lo, bad) => (v < bad ? 'bad' : v < lo ? 'warn' : 'ok');
    const num = (label, html, extra = '') => el('div', { class: 'card' }, el('div', { class: 'lbl', text: label }), el('div', { class: `num ${extra}`, html }));
    return [
      el('div', { class: 'card' }, el('div', { class: 'lbl', text: 'Location' }), el('div', { class: 'num', style: 'font-size:1.3rem', text: s.location }),
        el('p', { class: `note ${stale ? 'warn' : ''}`, text: stale ? `iPad last reported ${ago(s.t)}` : `Live from the iPad, ${ago(s.t)}` })),
      el('div', { class: 'grid' },
        num('Depth', `${s.depth}<small>m</small>`), num('Heading', `${String(s.heading).padStart(3, '0')}°`),
        num('Speed', `${s.speed}<small>kt</small>`), num('Position', `${s.lat.toFixed(2)}°N<br>${Math.abs(s.lon).toFixed(2)}°W`),
        num('Battery', `${s.battery}%`, cls(s.battery, 30, 15)), num('Oxygen', `${s.oxygen}%`, cls(s.oxygen, 30, 15)),
        num('Hull', `${s.hull}%`, cls(s.hull, 80, 40)), num('Destination', s.destination ? s.destination : '—')),
    ];
  },
  missions() {
    const o = (store.status && store.status.objectives) || [];
    return o.length ? o.map((x) => el('div', { class: `card task ${x.done ? 'done' : ''}` }, el('span', { class: 'box' }), el('span', { class: 'txt', text: x.text }))) : [el('div', { class: 'empty', text: 'No active missions.' })];
  },
  findings() {
    const f = (store.status && store.status.discoveries) || [];
    return f.length ? f.map((d) => el('div', { class: 'card' }, el('h3', { text: d.name || d.title || 'Finding' }), el('p', { text: d.description || d.text || '' }))) : [el('div', { class: 'empty', text: 'No findings yet.' })];
  },
  tasks() {
    const input = el('input', { class: 'field', type: 'text', placeholder: 'New task…', enterkeyhint: 'done' });
    const add = () => { const v = input.value.trim(); if (!v) return; store.tasks = [...store.tasks, newTask(v)]; save(); paint(); sync(); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
    const change = (id, fn) => { store.tasks = store.tasks.map((t) => t.id === id ? { ...t, ...fn(t), modified: Date.now() } : t); save(); paint(); sync(); };
    const live = store.tasks.filter((t) => !t.deleted);
    return [el('div', { class: 'row' }, el('div', { class: 'grow' }, input), el('button', { class: 'btn primary', text: 'Add', onclick: add })),
      ...(live.length ? live.map((t) => el('div', { class: `card task ${t.done ? 'done' : ''}` },
        el('button', { class: 'box', 'aria-label': 'Toggle task', onclick: () => change(t.id, (x) => ({ done: !x.done })) }), el('span', { class: 'txt', text: t.text }),
        el('button', { class: 'btn sm', text: 'Delete', onclick: () => change(t.id, () => ({ deleted: true })) }))) : [el('div', { class: 'empty', text: 'No tasks.' })])];
  },
  journal() {
    const ta = el('textarea', { class: 'field', placeholder: 'Write a journal note…' });
    const add = () => { const v = ta.value.trim(); if (!v) return; store.journals = [...store.journals, makeJournalEntry(v)]; save(); toast('Note saved'); paint(); sync(); };
    const notes = [...store.journals].reverse();
    return [ta, el('div', { class: 'row' }, el('button', { class: 'btn primary', text: 'Save note', onclick: add })),
      ...(notes.length ? notes.map((e) => el('div', { class: 'card' }, el('div', { class: 'meta', text: new Date(e.logbook.timestamp).toLocaleString() }), el('p', { text: e.logbook.content }))) : [el('div', { class: 'empty', text: 'No notes yet.' })])];
  },
  settings() {
    const token = el('input', { class: 'field', type: 'password', placeholder: 'GitHub token (ghp_…)', autocapitalize: 'off', autocorrect: 'off' });
    const pass = el('input', { class: 'field', type: 'password', placeholder: 'Passphrase (8 or more characters)', autocapitalize: 'off', autocorrect: 'off' });
    const connect = async () => {
      if (!token.value.trim() || !pass.value) { toast('Fill in both boxes'); return; }
      net = { state: 'busy', error: '' }; paintChip();
      try { await connectSync(token.value, pass.value); sync({ manual: true }); }
      catch (e) { net = { state: 'err', error: e.message || String(e) }; paint(); }
    };
    return [
      el('div', { class: 'card' }, el('div', { class: 'lbl', text: 'Connect to your game' }),
        el('p', { class: 'note', style: 'margin:.4rem 0 .8rem', text: net.state === 'err' ? net.error : net.state === 'ok' ? `Connected. Synced ${ago(store.syncedAt)}.` : 'Not connected.' }),
        getConfig() ? el('p', { class: 'note', text: 'Token and passphrase are saved on this phone.' }) : [token, el('div', { style: 'height:.5rem' }), pass],
        el('div', { class: 'row', style: 'margin-top:.8rem' }, el('button', { class: 'btn primary', text: getConfig() ? 'Sync now' : 'Connect', onclick: getConfig() ? () => sync({ manual: true }) : connect }),
          getConfig() && el('button', { class: 'btn danger', text: 'Disconnect', onclick: () => { clearConfig(); net = { state: 'off', error: '' }; paint(); } }))),
      el('div', { class: 'card' }, el('div', { class: 'lbl', text: 'One-time setup' }),
        el('ol', { class: 'steps', style: 'margin-top:.5rem' },
          el('li', { text: 'On github.com, go to Settings, Developer settings, Personal access tokens, Tokens (classic).' }),
          el('li', { text: 'Tap Generate new token (classic). Name it Aqua Nova. Tick only "gist". Nothing else.' }),
          el('li', { text: 'Copy the token. Paste it in the first box above.' }),
          el('li', { text: 'Make up a passphrase of 8 or more characters. Type it in the second box. It scrambles your data.' }),
          el('li', { text: 'Use the SAME token and passphrase on the iPad.' }),
          el('li', { text: 'On the iPad: PED, Settings, Phone sync.' }))),
      getConfig() && el('div', { class: 'card' }, el('div', { class: 'lbl', text: 'Sync details' }), ...describeSync().map((t) => el('p', { class: 'note', style: 'margin-top:.3rem', text: t })), el('p', { class: 'note', style: 'margin-top:.3rem', text: store.status ? `Ship status from the iPad: ${new Date(store.status.t).toLocaleString()}` : 'Ship status from the iPad: none yet' })),
      el('div', { class: 'card' }, el('div', { class: 'lbl', text: 'About' }), el('p', { class: 'note', style: 'margin-top:.4rem', text: 'Ship status and missions come from the iPad. Notes and tasks you add here appear in the iPad logbook and PED. This app never changes your save points.' })),
    ];
  },
};

// ---------- paint ----------
function paintChip() {
  const chip = $('#chip'), t = $('#chip-text');
  chip.className = 'chip ' + ({ ok: 'ok', err: 'err', busy: 'busy' }[net.state] || '');
  t.textContent = net.state === 'busy' ? 'Syncing…' : net.state === 'ok' ? 'Synced ' + ago(store.syncedAt) : net.state === 'err' ? 'Sync failed' : net.state === 'off' ? 'Not connected' : (store.syncedAt ? 'Synced ' + ago(store.syncedAt) : 'Ready');
  $('#book').textContent = store.name || 'Aqua Nova DSV';
}
function paint() {
  paintChip();
  $('#nav').replaceChildren(...TABS.map((k) => el('button', { class: k === tab ? 'on' : '', 'data-tab': k, html: `${ICON[k]}<span>${k}</span>`, onclick: () => { tab = k; paint(); } })));
  // A background sync repaints the screen. Keep whatever the player is typing.
  const view = $('#view'), f = document.activeElement;
  const inputs = [...view.querySelectorAll('input,textarea')];
  const kept = f && view.contains(f) ? { i: inputs.indexOf(f), v: f.value } : null;
  view.replaceChildren(...views[tab]());
  if (kept && kept.i >= 0) { const n = [...view.querySelectorAll('input,textarea')][kept.i]; if (n) { n.value = kept.v; n.focus(); } }
}
$('#chip').addEventListener('click', () => { if (net.state === 'err' || net.state === 'off') tab = 'settings'; sync({ manual: true }); paint(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
window.addEventListener('online', sync);
setInterval(() => { if (!document.hidden) sync(); }, 60000);
paint(); sync();
if ('serviceWorker' in navigator) navigator.serviceWorker.register(new URL('../sw.js', import.meta.url)).catch(() => {});
