// utils/ledgerSync.js
// Keeps the iPad game and the iPhone PED in step through ONE secret gist on your GitHub account.
// Same idea as the Body Clock app.
//
//   meta.json            salt and a passphrase check            (plain)
//   active.json          which logbook is active                (iPad writes)
//   <logbookId>.json     the logbook: entries, tasks            (both write)
//   <logbookId>.status.json   live ship status                  (iPad writes)
//
// Every file except meta.json is encrypted on the device (PBKDF2-SHA-256, then AES-GCM 256).
// GitHub only holds scrambled data. The token needs only the "gist" permission.
//
// Request budget (the point of this file):
//   - One GET returns every file. It is conditional (ETag): "not changed" answers do not count
//     against the GitHub limit.
//   - Writes are batched: one PATCH carries the logbook, active id and status together, and is
//     sent only when something changed. Status is rewritten at most every 20 seconds.
//   - After errors, automatic sync backs off (1, 2, 4 ... up to 15 min). After a bad token or a
//     missing gist it stops until the player taps Sync now. After a rate limit it waits for the reset.
// No DOM here. Both apps import it.

const CFG_KEY = 'aquaNovaSync2';
const API = 'https://api.github.com';
const DESC = 'Aqua Nova sync';
const STATUS_MIN_GAP = 20000;    // never rewrite status more often than this
const STATUS_HEARTBEAT = 120000; // rewrite an unchanged status this often, so the phone sees "live"
const READ_MEMO = 5000;          // reads inside this window reuse the last answer

export class SyncError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

// ---------- config ----------
export function getConfig() {
  try { const c = JSON.parse(localStorage.getItem(CFG_KEY)); return c && c.token && c.gist && c.key && c.salt ? c : null; } catch (e) { return null; }
}
const putConfig = (c) => localStorage.setItem(CFG_KEY, JSON.stringify(c));
export function clearConfig() { localStorage.removeItem(CFG_KEY); cache = { gist: null, etag: null, files: {}, at: 0 }; staged = {}; lastStatus = { sig: '', at: 0 }; }

// ---------- what this device last saw (for the Sync details card) ----------
const info = { requests: 0, read: null, write: null, files: {}, last: null };
const clock = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
/** Plain lines for the Sync details card. */
export function describeSync() {
  const cfg = getConfig();
  if (!cfg) return ['Not connected.'];
  const names = Object.keys(info.files);
  return [
    `Gist ${cfg.gist.slice(0, 8)}…`,
    names.length ? `In the gist: ${names.map((n) => `${n.replace(/^(.{12}).*(\.[a-z.]+)$/, '$1…$2')} (${info.files[n]} B)`).join(', ')}` : 'In the gist: not read yet',
    info.read ? `Last read ${clock(info.read.at)}: ${info.read.kind}` : 'Last read: never',
    info.write ? `Last write ${clock(info.write.at)}: ${info.write.names.map((n) => n.replace(/^(.{12}).*(\.[a-z.]+)$/, '$1…$2')).join(', ')}` : 'Last write: none from this device',
    `Requests this session: ${info.requests}`,
    info.last ? `Last request: ${info.last}` : '',
    !autoSyncAllowed() ? (pace.stopped ? 'Automatic sync is stopped. Tap Sync now.' : 'Automatic sync is waiting (backoff or rate limit).') : '',
  ].filter(Boolean);
}

// ---------- pacing ----------
const pace = { fails: 0, retryAt: 0, limitUntil: 0, stopped: false };
/** True when the timer-driven sync may run now. Manual syncs ignore this (except a rate limit). */
export const autoSyncAllowed = () => !pace.stopped && Date.now() >= Math.max(pace.retryAt, pace.limitUntil);
/** Call before a sync the player asked for. Clears error backoff, not a rate limit. */
export function resetPace() { pace.fails = 0; pace.retryAt = 0; pace.stopped = false; cache.at = 0; }  // cache.at = 0: a manual sync always asks GitHub (free if unchanged)

const explain = (status) => status === 401 ? 'GitHub rejected the token. Make a new token.'
  : status === 403 ? 'GitHub refused. The token needs the "gist" permission.'
  : status === 404 ? 'The synced gist is gone. Disconnect and connect again.'
  : `GitHub error ${status}`;

async function ghFetch(cfg, path, opts = {}) {
  const now = Date.now();
  if (pace.limitUntil > now) throw new SyncError(`GitHub rate limit reached. Try again after ${new Date(pace.limitUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`, 429);
  let res;
  try {
    res = await fetch(API + path, { ...opts, cache: 'no-store', headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(opts.headers || {}) } });
  } catch (e) {
    pace.fails++; pace.retryAt = now + Math.min(60000 * 2 ** (pace.fails - 1), 900000);
    throw new SyncError('No connection to GitHub.', 0);
  }
  info.requests++; info.last = `${opts.method || 'GET'} ${path.split('?')[0].replace(/[0-9a-f]{20,}/, 'gist')} → ${res.status}`;
  const left = res.headers.get('x-ratelimit-remaining'), reset = +res.headers.get('x-ratelimit-reset') * 1000, wait = +res.headers.get('retry-after') * 1000;
  if (res.status === 429 || (res.status === 403 && left === '0')) pace.limitUntil = Math.max(now + 60000, wait ? now + wait : 0, reset || 0);
  else if (left !== null && +left <= 25 && reset) pace.limitUntil = reset;          // nearly out: stop early
  else if (res.status === 401 || res.status === 403 || res.status === 404) pace.stopped = true;
  else if (res.status >= 500) { pace.fails++; pace.retryAt = now + Math.min(60000 * 2 ** (pace.fails - 1), 900000); }
  else if (res.ok || res.status === 304) { pace.fails = 0; pace.retryAt = 0; pace.stopped = false; }
  return res;
}

// ---------- encryption ----------
const b64 = (buf) => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function deriveKey(pass, salt64) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: unb64(salt64), iterations: 310000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}
const keyCache = new Map();
async function cryptoKey(raw64) {
  if (!keyCache.has(raw64)) keyCache.set(raw64, await crypto.subtle.importKey('raw', unb64(raw64), 'AES-GCM', false, ['encrypt', 'decrypt']));
  return keyCache.get(raw64);
}
async function sealWith(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
  return JSON.stringify({ v: 1, iv: b64(iv), ct: b64(ct) });
}
async function unsealWith(key, text) {
  const blob = JSON.parse(text);
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(blob.iv) }, key, unb64(blob.ct))));
}
const seal = async (cfg, obj) => sealWith(await cryptoKey(cfg.key), obj);
async function unseal(cfg, text) {
  try { return await unsealWith(await cryptoKey(cfg.key), text); }
  catch (e) { throw new SyncError('The passphrase does not open the synced data. Disconnect and connect again.', 0); }
}

// ---------- the gist ----------
let cache = { gist: null, etag: null, files: {}, at: 0 };
let staged = {};
let lastStatus = { sig: '', at: 0 };
const need = () => { const c = getConfig(); if (!c) throw new SyncError('Sync is not set up.', 0); return c; };

async function readFiles(j) {
  const files = {};
  for (const [name, f] of Object.entries(j.files || {})) {
    let text = f.content;
    if (f.truncated || text == null) { const r = await fetch(f.raw_url, { cache: 'no-store' }); if (!r.ok) throw new SyncError(`GitHub error ${r.status}`, r.status); text = await r.text(); }
    files[name] = text;
  }
  return files;
}

/** All gist files. One conditional GET; "304 not modified" costs nothing against the limit. */
async function load(cfg) {
  if (cache.gist === cfg.gist && Date.now() - cache.at < READ_MEMO) return cache.files;
  const same = cache.gist === cfg.gist && cache.etag;
  const res = await ghFetch(cfg, `/gists/${cfg.gist}`, same ? { headers: { 'If-None-Match': cache.etag } } : {});
  if (res.status === 304) { cache.at = Date.now(); info.read = { at: cache.at, kind: 'no change' }; return cache.files; }
  if (!res.ok) throw new SyncError(explain(res.status), res.status);
  cache = { gist: cfg.gist, etag: res.headers.get('etag'), files: await readFiles(await res.json()), at: Date.now() };
  info.read = { at: cache.at, kind: 'downloaded' }; info.files = Object.fromEntries(Object.entries(cache.files).map(([n, t]) => [n, t.length]));
  return cache.files;
}

const stage = (name, obj) => { staged[name] = obj; };

/** Send everything staged in ONE request. Does nothing when nothing is staged. */
export async function flush() {
  const names = Object.keys(staged);
  if (!names.length) return false;
  const cfg = need(), out = {}, written = {};
  for (const n of names) { written[n] = await seal(cfg, staged[n]); out[n] = { content: written[n] }; }
  staged = {};
  const res = await ghFetch(cfg, `/gists/${cfg.gist}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ files: out }) });
  if (!res.ok) throw new SyncError(explain(res.status), res.status);
  cache = { gist: cfg.gist, etag: res.headers.get('etag'), files: { ...cache.files, ...written }, at: Date.now() };
  info.write = { at: cache.at, names }; info.files = Object.fromEntries(Object.entries(cache.files).map(([n, t]) => [n, t.length]));
  return true;
}

/** Join the gist your other device made, or make it. Use the same token and passphrase on each device. */
export async function connect(token, pass) {
  token = (token || '').trim();
  if (!token) throw new SyncError('Enter the token.', 0);
  if ((pass || '').length < 8) throw new SyncError('The passphrase needs 8 or more characters.', 0);
  resetPace();
  const bare = { token };
  let found = null;
  for (let page = 1; page <= 3 && !found; page++) {
    const res = await ghFetch(bare, `/gists?per_page=100&page=${page}`);
    if (!res.ok) throw new SyncError(explain(res.status), res.status);
    const list = await res.json();
    found = list.find((g) => g.description === DESC && g.files && g.files['meta.json']) || null;
    if (list.length < 100) break;
  }
  let gist, salt, key;
  if (found) {
    const res = await ghFetch(bare, `/gists/${found.id}`);
    if (!res.ok) throw new SyncError(explain(res.status), res.status);
    const files = await readFiles(await res.json());
    const meta = JSON.parse(files['meta.json']);
    key = await deriveKey(pass, meta.salt);
    try { await unsealWith(key, meta.check); } catch (e) { throw new SyncError('That passphrase does not open your synced data. Use the one from your other device.', 0); }
    gist = found.id; salt = meta.salt;
  } else {
    salt = b64(crypto.getRandomValues(new Uint8Array(16)));
    key = await deriveKey(pass, salt);
    const meta = JSON.stringify({ v: 1, salt, check: await sealWith(key, 'aquanova') });
    const res = await ghFetch(bare, '/gists', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ description: DESC, public: false, files: { 'meta.json': { content: meta } } }) });
    if (!res.ok) throw new SyncError(explain(res.status), res.status);
    gist = (await res.json()).id;
  }
  cache = { gist: null, etag: null, files: {}, at: 0 }; staged = {}; lastStatus = { sig: '', at: 0 };
  putConfig({ token, gist, salt, key: b64(await crypto.subtle.exportKey('raw', key)) });
  return getConfig();
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

/** Pull the remote copy, merge, and stage the result if anything changed.
 *  Call flush() afterwards (the iPad does, once, with the other files). Returns the merged logbook. */
export async function syncLogbook(local, { push = true } = {}) {
  const cfg = need();
  const name = `${local.id}.json`;
  const files = await load(cfg);
  const remoteBook = files[name] ? await unseal(cfg, files[name]) : null;
  const merged = remoteBook ? mergeLogbooks(local, remoteBook) : JSON.parse(JSON.stringify(local));
  if (push && (!remoteBook || fingerprint(merged) !== fingerprint(remoteBook))) stage(name, merged);
  return merged;
}

export async function publishActive(id) {
  const cfg = need();
  const files = await load(cfg);
  if (files['active.json']) { try { if ((await unseal(cfg, files['active.json'])).activeId === id) return; } catch (e) { if (e instanceof SyncError && e.message.startsWith('The passphrase')) throw e; } }
  stage('active.json', { activeId: id, updated: new Date().toISOString() });
}
export async function getActiveId() {
  const cfg = need();
  const files = await load(cfg);
  return files['active.json'] ? (await unseal(cfg, files['active.json'])).activeId : null;
}

// Status file: small, never a save. Staged only when it changed, and not more than every 20 seconds.
export async function pushStatus(id, status) {
  const sig = JSON.stringify({ ...status, t: 0 });
  const age = Date.now() - lastStatus.at;
  if (lastStatus.at && (age < STATUS_MIN_GAP || (sig === lastStatus.sig && age < STATUS_HEARTBEAT))) return false;
  stage(`${id}.status.json`, status);
  lastStatus = { sig, at: Date.now() };
  return true;
}
export async function pullStatus(id) {
  const cfg = need();
  const files = await load(cfg);
  return files[`${id}.status.json`] ? unseal(cfg, files[`${id}.status.json`]) : null;
}

/** For the phone. It adds only journal notes and tasks to the remote logbook.
 *  It never sends save points or snapshots, so it cannot damage the iPad's save.
 *  mine = { entries: [journal entries], pedTasks: [tasks] } */
export async function syncCompanion(id, mine) {
  const cfg = need();
  const name = `${id}.json`;
  const files = await load(cfg);
  if (!files[name]) throw new SyncError('No save found on GitHub yet. Open the game on the iPad first.', 404);
  const remoteBook = await unseal(cfg, files[name]);
  const merged = mergeLogbooks(remoteBook, { id, revision: remoteBook.revision || 0, entries: (mine.entries || []).filter(isJournal), checkpoint: null, pedTasks: mine.pedTasks || [] });
  if (fingerprint(merged) !== fingerprint(remoteBook)) { stage(name, merged); await flush(); }
  return { name: merged.name, entries: merged.entries.filter(isJournal), pedTasks: merged.pedTasks };
}
