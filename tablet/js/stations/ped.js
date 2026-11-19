// PED (personal electronic device): ship status, missions, findings, tasks, journal, settings.
// The iPhone PED (ped/ at the site root) shows the same things, kept in step through GitHub.
import { el, pad, toast } from '../util.js';
import { sim, clockText } from '../sim.js';
import { gameState, saveManager } from '../persist.js';
import { syncNow, requestSync, syncState, onSyncChange } from '../sync.js';
import { getConfig, connect as connectSync, clearConfig, makeJournalEntry, newTask, isJournal } from '../../../utils/ledgerSync.js';
import { getSound, setSound, chirp, ping, mailZoom, testSound, audioState } from '../audio.js';
import { knownCrew } from './crew.js';
import missionManager from '../../../game/systems/missionManager.js';

let appVersion = '…';
try { if (window.caches) caches.keys().then((k) => { const v = k.find((n) => n.startsWith('aquanova-')); appVersion = v ? v.slice(9) : 'not saved offline'; }); } catch (e) { /* ignore */ }
/** Forget the saved offline copy and load every file again from the server. Saves are not touched.
 *  The browser's own HTTP cache can keep old files for minutes (GitHub Pages allows 10), so each file is
 *  re-fetched with cache "reload" before the page restarts. */
async function updateNow() {
  try {
    const regs = navigator.serviceWorker ? await navigator.serviceWorker.getRegistrations() : [];
    await Promise.all(regs.map((r) => r.unregister()));
    const keys = window.caches ? await caches.keys() : [];
    await Promise.all(keys.map((k) => caches.delete(k)));
  } catch (e) { console.warn('Update clear failed', e); }
  try {
    const sw = new URL('../../../sw.js', import.meta.url);
    const text = await (await fetch(sw, { cache: 'reload' })).text();
    const list = JSON.parse(text.slice(text.indexOf('const ASSETS = [') + 15, text.indexOf('];', text.indexOf('const ASSETS = [')) + 1));
    const q = [...list]; let fails = 0;
    await Promise.all(Array.from({ length: 6 }, async () => { while (q.length) { const a = q.shift(); try { await fetch(new URL(a, sw), { cache: 'reload' }); } catch (e) { fails++; } } }));
    if (fails) console.warn('Update: could not refresh', fails, 'files');
  } catch (e) { console.warn('Update refresh failed', e); }
  location.replace(location.pathname + '?v=' + Date.now());
}

/** Ask the server which build is current (the service worker file carries the version). */
async function latestBuild() {
  try {
    const text = await (await fetch(new URL('../../../sw.js', import.meta.url), { cache: 'no-store' })).text();
    const m = /const VERSION = '([^']+)'/.exec(text); return m ? m[1] : null;
  } catch (e) { return null; }
}

// Bug notes: short findings the owner writes while playing. Kept on this device; "Copy all" puts them on the clipboard to paste into a chat.
const BUG_KEY = 'aquaNova_bugnotes';
const loadBugs = () => { try { return JSON.parse(localStorage.getItem(BUG_KEY)) || []; } catch (e) { return []; } };
const saveBugs = (list) => { try { localStorage.setItem(BUG_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ } };
// Optional: each note is also posted as a GitHub Issue (label "bug-note") so it can be read later without copying.
// Needs a fine-grained token limited to this repo with Issues read and write. The repo is public, so the notes are too.
const BUG_REPO = 'NickWest27/AquaNova', TOKEN_KEY = 'aquaNova_bugtoken';
const getTok = () => { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } };
let bugError = '';
async function sendBug(b) {
  const tok = getTok(); if (!tok || b.issue) return false;
  try {
    const r = await fetch(`https://api.github.com/repos/${BUG_REPO}/issues`, { method: 'POST',
      headers: { Authorization: `Bearer ${tok}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: `Bug note: ${b.text.slice(0, 60)}`, body: `${b.text}\n\n---\nGame time: ${b.clock}\nPlace: ${b.where}\nBuild: ${b.build}`, labels: ['bug-note'] }) });
    if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? 'GitHub refused the token (it needs Issues read and write on this repo)' : `GitHub answered ${r.status}`);
    const j = await r.json(); saveBugs(loadBugs().map((x) => x.id === b.id ? { ...x, issue: j.number } : x)); bugError = ''; return true;
  } catch (e) { bugError = e.message === 'Failed to fetch' ? 'No connection. The note is kept and will be sent later.' : e.message; return false; }
}
async function sendUnsent() { let n = 0; for (const b of loadBugs()) if (!b.issue && await sendBug(b)) n++; return n; }

const MISSION_OF = { 'oera-sea-trials': 'seaTrials' };   // older saves stored this offer without a mission id
const mName = (id, fallback) => (missionManager.missions.get(id) || {}).name || fallback || id;

export function mount(body, ctx) {
  body.classList.add('more-st');
  const tabs = el('div', { class: 'tabs' }), tb = el('div', { class: 'tab-body' });
  body.append(tabs, tb);
  let cur = 'status', refs = {}, syncLine = null;
  const stat = (label, key) => { const n = el('div', { class: 'num' }); refs[key] = n; return el('div', { class: 'card' }, el('div', { class: 'lbl', text: label }), n); };

  const syncText = () => {
    if (syncState.status === 'off') return 'Not connected.';
    if (syncState.status === 'syncing') return 'Syncing…';
    if (syncState.status === 'error') return 'Sync failed: ' + syncState.error;
    return syncState.at ? 'Synced at ' + syncState.at.toLocaleTimeString() : 'Connected.';
  };

  const views = {
    status() {
      refs = {};
      return [el('div', { class: 'readouts', style: 'grid-template-columns:repeat(auto-fit,minmax(13rem,1fr))' },
        stat('Location', 'loc'), stat('Position', 'pos'), stat('Depth', 'dep'), stat('Heading', 'hdg'), stat('Speed', 'spd'), stat('Battery', 'bat'), stat('Oxygen', 'o2'), stat('Hull', 'hull'))];
    },
    missions() {
      const active = missionManager.getActiveMissions().filter(Boolean);
      const objs = gameState.getProperty('mission.objectives') || [];
      const offers = []; const seen = new Set();
      for (const m of gameState.getProperty('mission.inbox') || []) {
        const id = m.missionId || MISSION_OF[m.id];
        if (id && !seen.has(id) && !missionManager.activeMissions.has(id) && !missionManager.completedMissions.has(id)) { seen.add(id); offers.push({ id, from: m.from }); }
      }
      const done = [...missionManager.completedMissions];
      return [
        el('div', { class: 'lbl', text: 'Active' }),
        ...(active.length ? active.map((m) => { const o = objs.filter((x) => x.missionId === m.id); const n = o.filter((x) => x.status === 'completed').length;
          return el('div', { class: 'card mission' }, el('h3', { text: m.name }), el('p', { text: m.description || '' }), el('div', { class: 'meta' }, el('span', { text: `${n} of ${o.length} tasks done` }))); }) : [el('div', { class: 'empty', text: 'No active missions.' })]),
        el('div', { class: 'lbl', text: 'Available' }),
        ...(offers.length ? offers.map((o) => el('div', { class: 'card mission' }, el('h3', { text: mName(o.id) }),
          el('p', { text: `Offered by ${o.from || 'OERA'}. Read the orders in Comms, then accept.` }),
          el('div', { class: 'row' }, el('button', { class: 'btn primary', text: 'Open Comms', onclick: () => { ctx.closePed && ctx.closePed(); ctx.openScene('comms'); } })))) : [el('div', { class: 'empty', text: 'No missions on offer.' })]),
        ...(done.length ? [el('div', { class: 'lbl', text: 'Completed' }), ...done.map((id) => el('div', { class: 'card mission done' }, el('h3', { text: mName(id) })))] : []),
      ];
    },
    contacts() {
      const person = (c) => el('div', { class: 'card contact' }, el('h3', { text: c.name }),
        el('div', { class: 'meta' }, el('span', { text: [c.role, c.company].filter(Boolean).join(' · ') })), el('p', { text: c.bio || 'No biography on file.' }));
      const crew = knownCrew();
      const outside = Object.values(gameState.getProperty('contacts.contacts') || {}).filter((c) => c && c.known && c.name);
      return [
        el('div', { class: 'lbl', text: 'Crew' }), ...(crew.length ? crew.map(person) : [el('div', { class: 'empty', text: 'You have not met the crew yet.' })]),
        ...(outside.length ? [el('div', { class: 'lbl', text: 'Outside the ship' }), ...outside.map(person)] : []),
      ];
    },
    findings() {
      const f = gameState.getProperty('mission.discoveries') || [];
      return f.length ? f.map((d) => el('div', { class: 'card' }, el('h3', { text: d.name || d.title || 'Finding' }), el('p', { text: d.description || d.text || '' }))) : [el('div', { class: 'empty', text: 'No findings yet. Samples and scans will be filed here.' })];
    },
    tasks() {
      const input = el('input', { class: 'field', type: 'text', placeholder: 'New task…', enterkeyhint: 'done' });
      const save = (tasks) => { saveManager.setPedTasks(tasks); requestSync(); render(); };
      const add = () => { const v = input.value.trim(); if (!v) return; save([...saveManager.getPedTasks(), newTask(v)]); };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
      const change = (id, fn) => save(saveManager.getPedTasks().map((t) => t.id === id ? { ...t, ...fn(t), modified: Date.now() } : t));
      const live = saveManager.getPedTasks().filter((t) => !t.deleted);
      const objs = gameState.getProperty('mission.objectives') || [];
      const groups = missionManager.getActiveMissions().filter(Boolean).map((m) => [m, objs.filter((o) => o.missionId === m.id)]).filter(([, o]) => o.length);
      return [...groups.flatMap(([m, o]) => [el('div', { class: 'lbl', text: m.name }), ...o.map((x) => el('div', { class: `card task mission-obj ${x.status === 'completed' ? 'done' : ''}` }, el('span', { class: 'dot' }), el('span', { text: x.description })))]),
        ...(groups.length ? [] : [el('div', { class: 'lbl', text: 'Mission tasks' }), el('div', { class: 'empty', text: 'No mission tasks. Accept a mission to see its tasks here.' })]),
        el('div', { class: 'lbl', text: 'My tasks' }),
        el('div', { class: 'row' }, input, el('button', { class: 'btn primary', text: 'Add', onclick: add })),
        ...(live.length ? live.map((t) => el('div', { class: `card task ${t.done ? 'done' : ''}` },
          el('button', { class: 'dot', 'aria-label': 'Toggle task', onclick: () => change(t.id, (x) => ({ done: !x.done })) }), el('span', { class: 'grow', text: t.text }),
          el('button', { class: 'btn chip', text: 'Delete', onclick: () => change(t.id, () => ({ deleted: true })) }))) : [el('div', { class: 'empty', text: 'No tasks.' })])];
    },
    journal() {
      const ta = el('textarea', { class: 'field', placeholder: 'Write a journal note…', rows: 3 });
      const save = el('button', { class: 'btn primary', text: 'Save note', onclick: () => {
        if (!ta.value.trim()) return;
        saveManager.addJournal(makeJournalEntry(ta.value.trim())); requestSync(); toast('Note saved'); render();
      } });
      const notes = ((saveManager.getActiveLogbook() || {}).entries || []).filter(isJournal).reverse();
      return [ta, el('div', { class: 'row' }, save),
        ...(notes.length ? notes.map((e) => el('div', { class: 'card entry' }, el('div', { class: 'meta' }, el('span', { text: new Date(e.logbook.timestamp).toLocaleString() })), el('p', { text: e.logbook.content }))) : [el('div', { class: 'empty', text: 'No notes yet.' })])];
    },
    settings() {
      const zoomBtn = (t, d) => el('button', { class: 'btn', text: t, onclick: () => ctx.zoom(d) });
      const connected = !!getConfig();
      const token = el('input', { class: 'field', type: 'password', placeholder: 'GitHub token (ghp_…)', autocapitalize: 'off', autocorrect: 'off' });
      const pass = el('input', { class: 'field', type: 'password', placeholder: 'Passphrase (8 or more characters)', autocapitalize: 'off', autocorrect: 'off' });
      syncLine = el('p', { text: syncText() });
      const sync = el('div', { class: 'card setting' }, el('div', { class: 'lbl', text: 'Sync with the iPhone PED' }),
        ...(connected ? [syncLine,
          el('div', { class: 'row' }, el('button', { class: 'btn primary', text: 'Sync now', onclick: () => syncNow({ manual: true }) }),
            el('button', { class: 'btn danger', text: 'Disconnect', onclick: () => { clearConfig(); syncState.status = 'off'; render(); } }))]
          : [el('p', { text: 'How to connect:' }),
            el('ol', { class: 'steps' },
              el('li', { text: 'On github.com, make a classic token with only the "gist" permission.' }),
              el('li', { text: 'Type the token below. Choose a passphrase of 8 or more characters.' }),
              el('li', { text: 'Tap Connect. On the phone, use the same token and passphrase.' })),
            token, pass, syncLine,
            el('div', { class: 'row' }, el('button', { class: 'btn primary', text: 'Connect', onclick: async () => {
              if (!token.value.trim() || !pass.value) { toast('Fill in both boxes', 'error'); return; }
              try { await connectSync(token.value, pass.value); } catch (e) { toast(e.message, 'error'); return; }   // keep what was typed
              await syncNow({ manual: true }); render();
            } }))]));

      // sound mixer: Master scales everything. A slider plays its sound when you let go.
      const snd = getSound();
      const slider = (label, key, preview) => {
        const val = el('span', { class: 'mix-val', text: Math.round((snd[key] ?? 1) * 100) + '%' });
        const inp = el('input', { type: 'range', min: '0', max: '100', step: '5', value: String(Math.round((snd[key] ?? 1) * 100)), class: 'mix', 'aria-label': label });
        inp.addEventListener('input', () => { setSound({ [key]: inp.value / 100 }); val.textContent = inp.value + '%'; });
        inp.addEventListener('change', () => preview && preview());
        return el('label', { class: 'mix-row' }, el('span', { text: label }), inp, val);
      };
      const sound = el('div', { class: 'card setting' }, el('div', { class: 'lbl', text: 'Sound' }),
        el('div', { class: 'row' },
          el('button', { class: 'btn', text: snd.on ? 'Turn sound off' : 'Turn sound on', onclick: () => { setSound({ on: !getSound().on }); if (getSound().on) chirp(); render(); } }),
          el('button', { class: 'btn primary', text: 'Test sound', onclick: () => { const st = testSound(); toast(`Sound engine: ${st.state}`); setTimeout(render, 400); } })),
        slider('Master', 'vol', chirp), slider('Ship', 'hum'), slider('Ambient', 'ambient'), slider('Communicator', 'comm', chirp), slider('Notices', 'notice', ping), slider('Interface', 'ui', () => mailZoom(true)),
        el('p', { text: `Sound engine: ${audioState().state}. If you hear nothing, turn the ringer switch off mute and raise the volume.` }));

      // version: build number, a check against the server, and the update button
      const verLine = el('p', { text: `Build ${appVersion}.` });
      const upBtn = el('button', { class: 'btn primary', text: 'Update now', onclick: (e) => { e.currentTarget.textContent = 'Updating…'; e.currentTarget.disabled = true; updateNow(); } });
      const check = async () => {
        verLine.textContent = `Build ${appVersion}. Checking…`;
        const v = await latestBuild();
        verLine.textContent = v == null ? `Build ${appVersion}. Could not reach the server.` : v === appVersion ? `Build ${appVersion}. Up to date.` : `Build ${appVersion}. Update available (build ${v}).`;
        upBtn.classList.toggle('glow', v != null && v !== appVersion);
      };
      const version = el('div', { class: 'card setting' }, el('div', { class: 'lbl', text: 'Game version' }), verLine,
        el('div', { class: 'row' }, el('button', { class: 'btn', text: 'Check for update', onclick: check }), upBtn));
      setTimeout(check, 400);

      // bug notes
      const bugBox = el('textarea', { class: 'field', placeholder: 'What went wrong? A few words are enough.', rows: 2 });
      const bugList = el('div', { class: 'bug-list' });
      const drawBugs = () => {
        const list = loadBugs();
        bugList.replaceChildren(...(list.length ? [...list].reverse().map((b) => el('div', { class: 'bug-note' },
          el('div', { class: 'meta' }, el('span', { text: `${b.clock} · ${b.where}${b.issue ? ` · sent (issue #${b.issue})` : getTok() ? ' · not sent yet' : ''}` }), el('button', { class: 'btn chip', text: 'Delete', onclick: () => { saveBugs(loadBugs().filter((x) => x.id !== b.id)); drawBugs(); } })),
          el('p', { text: b.text }))) : [el('div', { class: 'empty', text: 'No bug notes.' })]));
      };
      const addBug = () => {
        const v = bugBox.value.trim(); if (!v) return;
        saveBugs([...loadBugs(), { id: Date.now(), clock: clockText(), where: ctx.place ? ctx.place() : '', text: v, build: appVersion }]);
        bugBox.value = ''; toast('Bug note saved'); drawBugs();
        sendUnsent().then((n) => { drawBugs(); drawTok(); if (n) toast('Sent to GitHub'); });
      };
      const copyBugs = async () => {
        const text = loadBugs().map((b, i) => `${i + 1}. [${b.clock}, ${b.where}, build ${b.build}] ${b.text}`).join('\n');
        if (!text) { toast('No bug notes to copy'); return; }
        try { await navigator.clipboard.writeText(text); toast('Copied. Paste it into the chat.'); } catch (e) { bugBox.value = text; toast('Copy failed. The text is in the box: select and copy it.', 'warn'); }
      };
      const tokBox = el('div', { class: 'bug-tok' });
      const tokInput = el('input', { class: 'field', type: 'password', placeholder: 'GitHub token for bug notes', autocapitalize: 'off', autocorrect: 'off' });
      const drawTok = () => tokBox.replaceChildren(...(getTok()
        ? [el('p', { text: bugError || 'Notes are also sent to GitHub, where Claude can read them.' }),
           el('div', { class: 'row' }, el('button', { class: 'btn', text: 'Send unsent notes', onclick: async () => { const n = await sendUnsent(); drawBugs(); drawTok(); toast(n ? `Sent ${n}` : bugError || 'Nothing to send'); } }),
             el('button', { class: 'btn danger', text: 'Remove token', onclick: () => { try { localStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ } bugError = ''; drawBugs(); drawTok(); } }))]
        : [el('p', { text: 'Optional: send each note to GitHub so Claude can read it. Make a fine-grained token on github.com for the repository NickWest27/AquaNova only, with the permission "Issues: read and write". The notes become public, because the repository is public.' }),
           tokInput, el('div', { class: 'row' }, el('button', { class: 'btn', text: 'Save token', onclick: async () => {
             const v = tokInput.value.trim(); if (!v) return;
             try { localStorage.setItem(TOKEN_KEY, v); } catch (e) { toast('Could not save the token', 'error'); return; }
             const n = await sendUnsent(); drawBugs(); drawTok(); toast(n ? `Sent ${n} note${n === 1 ? '' : 's'} to GitHub` : bugError || 'Token saved');
           } }))]));
      drawBugs(); drawTok();
      const bugs = el('div', { class: 'card setting' }, el('div', { class: 'lbl', text: 'Bug notes' }),
        el('p', { text: 'Write what you find while you play. Each note keeps the game time, the place and the build. Copy them all and paste them into the chat later.' }),
        bugBox, el('div', { class: 'row' }, el('button', { class: 'btn primary', text: 'Add note', onclick: addBug }), el('button', { class: 'btn', text: 'Copy all', onclick: copyBugs })), bugList, tokBox);

      return [sync, sound, version, el('div', { class: 'card setting' }, el('div', { class: 'lbl', text: 'Text size' }), el('div', { class: 'row' }, zoomBtn('Smaller', -0.1), zoomBtn('Reset', 0), zoomBtn('Larger', 0.1))), bugs];
    },
  };
  const TITLES = { status: 'Status', missions: 'Missions', tasks: 'Tasks', contacts: 'Contacts', findings: 'Findings', journal: 'Journal', settings: 'Settings' };
  function render() {
    syncLine = null;
    tabs.replaceChildren(...Object.keys(TITLES).map((k) => el('button', { class: `btn chip ${k === cur ? 'on' : ''}`, text: TITLES[k], onclick: () => { cur = k; render(); } })),
      ctx.commReady && ctx.commReady() && el('button', { class: `btn chip comm-btn${ctx.commUnread() ? ' unread' : ''}`, text: 'Communicator', 'aria-label': 'Open communicator', onclick: () => ctx.openComm() }));
    tb.replaceChildren(...views[cur]());
    update();
  }
  function update() {
    if (cur !== 'status' || !refs.loc) return;
    const s = sim.s;
    refs.loc.textContent = s.at ? s.at.name : 'Open water'; refs.loc.style.fontSize = '1.2rem';
    refs.pos.innerHTML = `${s.lat.toFixed(3)}°N<br>${Math.abs(s.lon).toFixed(3)}°W`; refs.pos.style.fontSize = '1.3rem';
    refs.dep.innerHTML = `${Math.round(s.depth)}<small>m</small>`; refs.hdg.textContent = pad(s.heading) + '°'; refs.spd.innerHTML = `${s.speed.toFixed(1)}<small>kt</small>`;
    refs.bat.textContent = Math.round(s.battery) + '%'; refs.o2.textContent = Math.round(s.oxygen) + '%'; refs.hull.textContent = Math.round(s.hull) + '%';
  }
  const off = onSyncChange(() => { if (syncLine) syncLine.textContent = syncText(); if (syncState.status === 'syncing') return;
    const f = tb.querySelector('input,textarea');
    if (f && (f.value || document.activeElement === f)) return;           // never wipe what the player is typing
    if (cur === 'settings' ? !!getConfig() : (cur === 'tasks' || cur === 'journal')) render();   // show what the phone sent
  });
  render();
  return { update, destroy() { off(); } };
}
