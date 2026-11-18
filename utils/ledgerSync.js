// utils/ledgerSync.js
// Keeps the iPad game and the iPhone PED in step through a private GitHub repo.
//
//   saves/active.json          which logbook is active           (iPad writes)
//   saves/<logbookId>.json     the logbook: entries, tasks       (both write)
//   saves/<logbookId>.status.json   live ship status snapshot    (iPad writes)
//
// No DOM here. Both apps import it. The token only needs "Contents: read and write"
// on the saves repo, so it cannot touch the game code.

const CFG_KEY = 'aquaNovaSync';
const API = 'https://api.github.com';

export function getConfig() {
  try {
    const c = JSON.parse(localStorage.getItem(CFG_KEY));
    return c && c.owner && c.repo && c.token ? c : null;
  } catch (e) { return null; }
}
export const setConfig = (c) => localStorage.setItem(CFG_KEY, JSON.stringify({ owner: c.owner.trim(), repo: c.repo.trim(), token: c.token.trim() }));
export const clearConfig = () => localStorage.removeItem(CFG_KEY);

// ---------- GitHub contents API ----------
const utf8ToB64 = (s) => { const b = new TextEncoder().encode(s); let bin = ''; for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(bin); };
const headers = (cfg, accept) => ({ Authorization: `Bearer ${cfg.token}`, Accept: accept || 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' });
const url = (cfg, path) => `${API}/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${path}`;

export class SyncError extends Error {
  constructor(message, status) { super(message); this.status = status; this.conflict = status === 409 || status === 422; }
}
const explain = (status) => status === 401 ? 'Token rejected. Make a new token.' : status === 403 ? 'Token not allowed, or rate limit reached.' : status === 404 ? 'Repo not found. Check owner and repo name.' : `GitHub error ${status}`;

export async function getFile(cfg, path) {
  const res = await fetch(url(cfg, path), { headers: headers(cfg), cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new SyncError(explain(res.status), res.status);
  const j = await res.json();
  let text;
  if (j.content) {
    const bin = atob(j.content.replace(/\n/g, ''));
    text = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } else { // over 1 MB: GitHub omits the content, so fetch the raw file
    const raw = await fetch(url(cfg, path), { headers: headers(cfg, 'application/vnd.github.raw+json'), cache: 'no-store' });
    if (!raw.ok) throw new SyncError(explain(raw.status), raw.status);
    text = await raw.text();
  }
  return { text, sha: j.sha };
}

export async function putFile(cfg, path, text, sha, message = 'sync') {
  const res = await fetch(url(cfg, path), { method: 'PUT', headers: { ...headers(cfg), 'Content-Type': 'application/json' }, body: JSON.stringify({ message, content: utf8ToB64(text), ...(sha ? { sha } : {}) }) });
  if (!res.ok) throw new SyncError(explain(res.status), res.status);
  return (await res.json()).content.sha;
}

// ---------- merge rules ----------
export const isJournal = (e) => e && e.logbook && e.logbook.type === 'journal';

export function makeJournalEntry(text) {
  const rand = Math.random().toString(36).slice(2, 6);
  return {
    logbook: { entryId: `PED-${Date.now().toString(36)}-${rand}`, timestamp: new Date().toISOString(), type: 'journal', tags: ['journal'],
      author: { organization: 'Aqua Nova DSV', name: 'Captain', role: 'Commanding Officer' }, content: text, tasks: [], completedTasks: [] },
    metadata: { importance: 'normal', canRevert: false },
  };
}
export const newTask = (text) => ({ id: `T-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`, text, done: false, deleted: false, modified: Date.now() });

function mergeTasks(a = [], b = []) {
  const map = new Map();
  for (const t of [...a, ...b]) { const old = map.get(t.id); if (!old || (t.modified || 0) > (old.modified || 0)) map.set(t.id, t); }
  return [...map.values()].sort((x, y) => (x.modified || 0) - (y.modified || 0) || (x.id < y.id ? -1 : 1));
}

/** Merge two copies of one logbook.
 *  Journal entries and tasks from both sides are always kept.
 *  Save points follow `revision`: a revert raises it, so reverted entries do not come back.
 *  The checkpoint (exit save) with the newer time wins when revisions match. */
export function mergeLogbooks(a, b) {
  const ra = a.revision || 0, rb = b.revision || 0;
  const base = ra >= rb ? a : b, other = base === a ? b : a;
  const map = new Map();
  const take = (list, journalsOnly) => (list || []).forEach((e) => { const id = e.logbook.entryId; if (!map.has(id) && (!journalsOnly || isJournal(e))) map.set(id, e); });
  take(base.entries, false);
  take(other.entries, ra === rb ? false : true);
  const entries = [...map.values()].sort((x, y) => new Date(x.logbook.timestamp) - new Date(y.logbook.timestamp));
  let checkpoint = base.checkpoint || null;
  if (ra === rb && a.checkpoint && b.checkpoint) checkpoint = new Date(a.checkpoint.timestamp) >= new Date(b.checkpoint.timestamp) ? a.checkpoint : b.checkpoint;
  else if (ra === rb) checkpoint = a.checkpoint || b.checkpoint || null;
  return { ...other, ...base, entries, checkpoint, revision: Math.max(ra, rb), pedTasks: mergeTasks(a.pedTasks, b.pedTasks) };
}

const fingerprint = (b) => JSON.stringify([b.revision || 0, (b.entries || []).map((e) => e.logbook.entryId), b.checkpoint && b.checkpoint.timestamp,
  (b.pedTasks || []).map((t) => `${t.id}:${t.modified}:${t.done ? 1 : 0}${t.deleted ? 1 : 0}`)]);

/** Pull the remote copy, merge, push back if anything changed. Returns the merged logbook. */
export async function syncLogbook(local, { push = true } = {}) {
  const cfg = getConfig();
  if (!cfg) throw new SyncError('Sync is not set up.', 0);
  const path = `saves/${local.id}.json`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const remote = await getFile(cfg, path);
    const remoteBook = remote ? JSON.parse(remote.text) : null;
    const merged = remoteBook ? mergeLogbooks(local, remoteBook) : JSON.parse(JSON.stringify(local));
    if (push && (!remoteBook || fingerprint(merged) !== fingerprint(remoteBook))) {
      try { await putFile(cfg, path, JSON.stringify(merged), remote && remote.sha, 'logbook'); } catch (e) { if (e.conflict && attempt < 2) continue; throw e; }
    }
    return merged;
  }
}

export async function publishActive(id) {
  const cfg = getConfig(); if (!cfg) return;
  const path = 'saves/active.json';
  const text = JSON.stringify({ activeId: id, updated: new Date().toISOString() });
  for (let i = 0; i < 3; i++) {
    const cur = await getFile(cfg, path);
    if (cur) { try { if (JSON.parse(cur.text).activeId === id) return; } catch (e) { /* rewrite */ } }
    try { await putFile(cfg, path, text, cur && cur.sha, 'active'); return; } catch (e) { if (!e.conflict || i === 2) throw e; }
  }
}
export async function getActiveId() {
  const cfg = getConfig(); if (!cfg) throw new SyncError('Sync is not set up.', 0);
  const f = await getFile(cfg, 'saves/active.json');
  return f ? JSON.parse(f.text).activeId : null;
}

// Status file: small, overwritten often, never a save.
const statusSha = {};
export async function pushStatus(id, status) {
  const cfg = getConfig(); if (!cfg) return;
  const path = `saves/${id}.status.json`;
  const text = JSON.stringify(status);
  for (let i = 0; i < 3; i++) {
    if (!(path in statusSha)) { const cur = await getFile(cfg, path); statusSha[path] = cur ? cur.sha : null; }
    try { statusSha[path] = await putFile(cfg, path, text, statusSha[path] || undefined, 'status'); return; }
    catch (e) { if (e.conflict && i < 2) { delete statusSha[path]; continue; } throw e; }
  }
}
export async function pullStatus(id) {
  const cfg = getConfig(); if (!cfg) throw new SyncError('Sync is not set up.', 0);
  const f = await getFile(cfg, `saves/${id}.status.json`);
  return f ? JSON.parse(f.text) : null;
}

/** For the phone. It adds only journal notes and tasks to the remote logbook.
 *  It never sends save points or snapshots, so it cannot damage the iPad's save.
 *  mine = { entries: [journal entries], pedTasks: [tasks] } */
export async function syncCompanion(id, mine) {
  const cfg = getConfig();
  if (!cfg) throw new SyncError('Sync is not set up.', 0);
  const path = `saves/${id}.json`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const remote = await getFile(cfg, path);
    if (!remote) throw new SyncError('No save found on GitHub yet. Open the game on the iPad first.', 404);
    const remoteBook = JSON.parse(remote.text);
    const merged = mergeLogbooks(remoteBook, { id, revision: remoteBook.revision || 0, entries: (mine.entries || []).filter(isJournal), checkpoint: null, pedTasks: mine.pedTasks || [] });
    if (fingerprint(merged) !== fingerprint(remoteBook)) {
      try { await putFile(cfg, path, JSON.stringify(merged), remote.sha, 'phone'); } catch (e) { if (e.conflict && attempt < 2) continue; throw e; }
    }
    return { name: merged.name, entries: merged.entries.filter(isJournal), pedTasks: merged.pedTasks };
  }
}
