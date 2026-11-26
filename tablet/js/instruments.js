// Instruments for display pages (owner, 2026-11-25: instruments, not instructions): a level line, a lamp, an airlock line, sample slots.
// Styles: the "Instruments" section of tablet.css (.gz, .ilamp, .coll).
import { el } from './util.js';
import { LOW_PCT, MIN_LAUNCH_PCT } from './bayops.js';

/** A level line: label, bar, value. lvl: 'bad', 'warn', 'idle' or 'cyc …' colours it. */
export const gauge = (k, frac, v, lvl = '') => el('div', { class: 'gz ' + lvl }, el('span', { class: 'gz-k', text: k }), el('span', { class: 'gz-bar' }, el('i', { style: `width:${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%` })), el('span', { class: 'gz-v', text: v }));
/** A label and a plain value on one line, no bar. */
export const field = (k, v, lvl = '') => el('div', { class: 'gz ' + lvl }, el('span', { class: 'gz-k', text: k }), el('span', { class: 'gz-v wide', text: v }));
export const pctLvl = (p) => (p < LOW_PCT ? 'bad' : p < MIN_LAUNCH_PCT ? 'warn' : '');
/** A status light with its word: kind 'ok' (green), 'warn' (amber), 'bad' (red). */
export const lamp = (text, kind) => el('span', { class: 'ilamp ' + (kind || '') }, el('i'), text);
/** An airlock line: fills while a craft goes out, empties while one comes in. */
export const airlock = (op, label = 'AIRLOCK') => {
  if (!op) return gauge(label, 0, 'IDLE', 'idle');
  const tot = op.dur + (op.air || 0), f = Math.min(1, op.t / tot), left = Math.max(0, Math.round(tot - op.t));
  return gauge(label, op.kind === 'launch' ? f : 1 - f, `${op.kind === 'launch' ? 'OUT' : 'IN'} ${left} s`, 'cyc ' + (op.kind === 'launch' ? 'out' : 'in'));
};
const SHORT = { water: 'WATER', sediment: 'SEDIM', rock: 'CORE', bio: 'BIO' };
/** Remora's sample slots: one per sample she can hold, lit with what is in it. unknown: no telemetry ("?"). */
export const sampleSlots = (cargo, n, unknown = false) => el('div', { class: 'coll' }, el('span', { class: 'gz-k', text: 'SAMPLES' }),
  ...Array.from({ length: n }, (_, i) => { const c = cargo[i]; return el('span', { class: 'slot' + (c && !unknown ? ' full' : ''), text: unknown ? '?' : c ? SHORT[c.kind] || c.kind.slice(0, 3).toUpperCase() : 'EMPTY' }); }));
export const mins = (m) => { if (m < 1) return '<1 min'; const t = Math.round(m); return t < 60 ? `${t} min` : `${Math.floor(t / 60)} h ${t % 60} min`; };
/** Remora's connection over her tether: LINK · DATA (flickers like data moving) while connected, LINK LOST once the tether has parted. */
export const linkLamp = (r) => (r && r.lost ? lamp('LINK LOST', 'bad') : lamp('LINK · DATA', 'ok data'));
