import { mergeLogbooks } from '../utils/ledgerSync.js';
const j = (id, t) => ({ logbook: { entryId: id, timestamp: t, type: 'journal' } });
const m = (id) => ({ logbook: { entryId: id, timestamp: '2026-01-01T00:00:00Z', type: 'mission_log' }, gameSnapshot: {} });
const remote = { revision: 3, entries: [m('M.LOG-0001'), m('LOG-0002'), j('J1', '2026-11-18T10:00:00Z')], pedTasks: [{ id: 't1', modified: Date.parse('2026-11-18T10:00:00Z') }] };
const local = { revision: 4, resetAt: '2026-11-18T11:00:00Z', entries: [m('M.LOG-0001')], pedTasks: [] };
const out = mergeLogbooks(local, remote);
const ok = out.entries.length === 1 && out.pedTasks.length === 0 && out.resetAt === local.resetAt && out.revision === 4;
// a note made after the restart survives
const later = { revision: 3, entries: [j('J2', '2026-11-18T11:30:00Z')], pedTasks: [{ id: 't2', modified: Date.parse('2026-11-18T11:30:00Z') }] };
const out2 = mergeLogbooks(local, later);
const ok2 = out2.entries.some((e) => e.logbook.entryId === 'J2') && out2.pedTasks.length === 1;
console.log(ok ? 'ok   restart drops old notes and tasks' : 'FAIL restart merge', out.entries.length, out.pedTasks.length);
console.log(ok2 ? 'ok   notes made after the restart survive' : 'FAIL later note', out2.entries.length, out2.pedTasks.length);
