// PED (personal electronic device): ship status, missions, findings, tasks, journal, settings.
// The iPhone PED (ped/ at the site root) shows the same things, kept in step through GitHub.
import { el, modal, pad, toast } from '../util.js';
import { sim } from '../sim.js';
import { gameState, saveManager, restartGame } from '../persist.js';
import { syncNow, requestSync, syncState, onSyncChange } from '../sync.js';
import { getConfig, describeSync, connect as connectSync, clearConfig, makeJournalEntry, newTask, isJournal } from '../../../utils/ledgerSync.js';
import { DEBUG } from '../../../utils/log.js';
import { getSound, setSound, chirp, testSound, audioState } from '../audio.js';

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
      const obj = ctx.objectives();
      return obj.length ? obj.map((o) => el('div', { class: `card task ${o.done ? 'done' : ''}` }, el('span', { class: 'dot' }), el('span', { text: o.text }))) : [el('div', { class: 'empty', text: 'No active missions.' })];
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
      const obj = ctx.objectives();
      return [...(obj.length ? [el('div', { class: 'lbl', text: 'Mission objectives' }), ...obj.map((o) => el('div', { class: `card task mission-obj ${o.done ? 'done' : ''}` }, el('span', { class: 'dot' }), el('span', { text: o.text }))), el('div', { class: 'lbl', text: 'My tasks' })] : []),
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
      const cfg = getConfig() || {};
      const token = el('input', { class: 'field', type: 'password', placeholder: 'GitHub token (ghp_…)', autocapitalize: 'off', autocorrect: 'off' });
      const pass = el('input', { class: 'field', type: 'password', placeholder: 'Passphrase (8 or more characters)', autocapitalize: 'off', autocorrect: 'off' });
      syncLine = el('p', { text: syncText() });
      return [
        el('div', { class: 'card setting' }, el('div', { class: 'lbl', text: 'Phone sync (GitHub gist)' }),
          el('p', { text: 'Links this iPad to your iPhone PED through one secret gist. Data is scrambled with your passphrase before it leaves the iPad. Make a classic token with only the "gist" permission. Use the same token and passphrase on the phone.' }),
          ...(getConfig() ? [] : [token, pass]), syncLine,
          el('div', { class: 'row' },
            !getConfig() && el('button', { class: 'btn primary', text: 'Connect', onclick: async () => {
              if (!token.value.trim() || !pass.value) { toast('Fill in both boxes', 'error'); return; }
              try { await connectSync(token.value, pass.value); } catch (e) { toast(e.message, 'error'); return; }   // keep what was typed
              await syncNow({ manual: true }); render();
            } }),
            getConfig() && el('button', { class: 'btn', text: 'Sync now', onclick: () => syncNow({ manual: true }) }),
            getConfig() && el('button', { class: 'btn danger', text: 'Disconnect', onclick: () => { clearConfig(); syncState.status = 'off'; render(); } }))),
        getConfig() && el('div', { class: 'card setting' }, el('div', { class: 'lbl', text: 'Sync details' }), ...describeSync().map((t) => el('p', { text: t }))),
        el('div', { class: 'card setting' }, el('div', { class: 'lbl', text: 'Sound' }),
          el('p', { text: (getSound().on ? 'Sound is on: ship hum and communicator.' : 'Sound is off.') + ` Sound engine: ${audioState().state}.` }),
          el('p', { text: 'If you hear nothing: turn the ringer switch off mute, raise the volume, then tap Test sound.' }),
          el('div', { class: 'row' },
            el('button', { class: 'btn primary', text: 'Test sound', onclick: () => { const st = testSound(); toast(`Sound engine: ${st.state}`); setTimeout(render, 400); } }),
            el('button', { class: 'btn', text: getSound().on ? 'Turn sound off' : 'Turn sound on', onclick: () => { setSound({ on: !getSound().on }); if (getSound().on) chirp(); render(); } }),
            ...[['Quiet', 0.25], ['Medium', 0.6], ['Loud', 1]].map(([t, v]) => el('button', { class: `btn ${Math.abs(getSound().vol - v) < 0.01 ? 'primary' : ''}`, text: t, onclick: () => { setSound({ vol: v }); chirp(); render(); } })))),
        el('div', { class: 'card setting' }, el('div', { class: 'lbl', text: 'Engine hum' }), el('div', { class: 'row' },
          ...[['Off', 0], ['Faint', 0.25], ['Normal', 1]].map(([t, v]) => el('button', { class: `btn ${Math.abs((getSound().hum ?? 0.25) - v) < 0.01 ? 'primary' : ''}`, text: t, onclick: () => { setSound({ hum: v }); render(); } })))),
        el('div', { class: 'card setting' }, el('div', { class: 'lbl', text: 'Game version' }), el('p', { text: `Build ${appVersion}. The game checks for updates each time it opens. If a change is missing, tap Update now. Your saves stay.` }),
          el('button', { class: 'btn primary', text: 'Update now', onclick: (e) => { e.currentTarget.textContent = 'Updating…'; e.currentTarget.disabled = true; updateNow(); } })),
        el('div', { class: 'card setting' }, el('div', { class: 'lbl', text: 'Text size' }), el('div', { class: 'row' }, zoomBtn('Smaller', -0.1), zoomBtn('Reset', 0), zoomBtn('Larger', 0.1))),
        el('div', { class: 'card setting' }, el('div', { class: 'lbl', text: 'Debug' }), el('p', { text: DEBUG ? 'Debug logging is on. Triple-tap the top-left corner to see the log.' : 'Triple-tap the top-left corner to see the log panel. Add ?debug=1 to the address for routine logs.' })),
        el('div', { class: 'card setting' }, el('div', { class: 'lbl', text: 'New game' }), el('p', { text: 'Starts again from the first logbook entry (M.LOG-0001). Removes later entries, notes, tasks and mission progress on every synced device.' }),
          el('button', { class: 'btn danger', text: 'Erase and restart', onclick: () => modal({ title: 'Erase and restart?', body: el('p', { text: 'This cannot be undone. Export your logbook first if you want to keep it.' }),
            actions: [{ label: 'Cancel' }, { label: 'Erase', kind: 'danger', primary: true, run: () => { try { restartGame(); } catch (e) { console.error(e); toast(e.message, 'error'); } } }] }) })),
      ];
    },
  };
  const TITLES = { status: 'Status', missions: 'Missions', findings: 'Findings', tasks: 'Tasks', journal: 'Journal', settings: 'Settings' };
  function render() {
    syncLine = null;
    tabs.replaceChildren(...Object.keys(views).map((k) => el('button', { class: `btn chip ${k === cur ? 'on' : ''}`, text: TITLES[k], onclick: () => { cur = k; render(); } })),
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
