// Sending a report to OERA takes time: upload, a wait for OERA to answer, then the reply downloads.
// Speed depends on the link (laser fast, satellite medium, HF slow) and on signal strength (dB).
// If the link drops the transfer stalls; after 40 s without a link it fails. Times are real seconds.
// One transfer at a time. The progress bar sits on the stage so it shows in every scene.
import { canTransmit } from './commsModel.js';
import { sim } from './sim.js';
import { gameState } from './persist.js';
import { say } from './notify.js';
import { dataTick, dataDone } from './audio.js';
import { el } from './util.js';

const UP_S = { 1: 18, 2: 7, 3: 45 };     // base seconds to upload at full strength, by link number
const DOWN_S = { 1: 8, 2: 3, 3: 20 };    // base seconds for the reply
const LATENCY_S = { 1: 3, 2: 2, 3: 4 };  // extra delay before OERA answers (signal travel)
const STALL_FAIL_S = 40;
export const xfer = { job: null, count: 0 };
let timer = 0, bar = null, lastTick = 0, hideTimer = 0, lastBeep = 0;

const speed = (L, st) => Math.max(0.3, Math.min(1.15, (st.dB == null ? 0 : st.dB) / L.base));
const secs = (n) => `${Math.max(1, Math.ceil(n))} s`;
const emit = () => document.dispatchEvent(new CustomEvent('xfer-change'));

function paint() {
  const j = xfer.job; if (!j || !bar) return;
  const pct = Math.round(j.p * 100);
  bar.className = `xfer ${j.phase}${j.stalled ? ' stalled' : ''}`;
  bar.querySelector('.xf-title').textContent = j.phase === 'up' ? `UPLINK · ${j.label}` : j.phase === 'wait' ? `AWAITING OERA · ${j.label}` : j.phase === 'down' ? `DOWNLINK · ${j.label}` : j.phase === 'done' ? 'REPORT SENT' : 'TRANSFER FAILED';
  bar.querySelector('.xf-fill').style.width = `${j.phase === 'wait' ? 100 : pct}%`;
  const eta = j.phase === 'up' ? (1 - j.p) * j.upS / j.f : j.phase === 'down' ? (1 - j.p) * j.downS / j.f : 0;
  bar.querySelector('.xf-note').textContent = j.stalled ? 'Signal lost. Holding.' : j.phase === 'wait' ? 'Report delivered. Waiting for an answer…' : j.phase === 'done' ? 'Report sent.' : j.phase === 'fail' ? j.why : `${pct}% · ${j.dB} dB · ${secs(eta)} left`;
}
function hideSoon(ms) { clearTimeout(hideTimer); hideTimer = setTimeout(() => { if (bar) bar.remove(); xfer.job = null; emit(); }, ms); }

function finishUp(j) {
  const t = j.text;
  gameState.updateProperty('mission.outbox', [...(gameState.getProperty('mission.outbox') || []), { at: new Date().toISOString(), text: t }]);
  document.dispatchEvent(new CustomEvent('report-sent'));
  j.phase = 'done'; j.p = 1; dataDone(true); paint(); emit(); hideSoon(3000);   // no read receipt: OERA answers only when it has something to say
  say('comms', 'Report is out, Captain.');
}
function step() {
  const j = xfer.job; if (!j) return;
  const now = Date.now(), dt = Math.min(1.5, (now - lastTick) / 1000); lastTick = now;
  if (j.phase === 'done' || j.phase === 'fail') return;
  const t = canTransmit(), L = t.L;
  j.stalled = !(t.ok && L.n === j.n);   // the link must stay up, on the same source
  if (j.stalled) {
    j.stallFor = (j.stallFor || 0) + dt;
    if (j.stallFor > STALL_FAIL_S) { j.phase = 'fail'; j.why = 'No link for 40 s. Report not sent.'; dataDone(false); say('comms', 'We lost the link, Captain. The report did not go. Bring the antenna up and I will send it again.', 'error'); paint(); emit(); hideSoon(6000); return; }
    paint(); return;
  }
  j.stallFor = 0; j.dB = t.st.dB; j.f = speed(L, t.st);
  if (j.phase === 'up') { j.p = Math.min(1, j.p + dt * j.f / j.upS); if (j.p >= 1) finishUp(j); }
  else if (j.phase === 'wait') { j.waitLeft -= dt; if (j.waitLeft <= 0) { j.phase = 'down'; j.p = 0; lastBeep = now; dataTick(false); } }
  else if (j.phase === 'down') {
    j.p = Math.min(1, j.p + dt * j.f / j.downS);
    if (j.p >= 1) { j.phase = 'done'; dataDone(true); deliverReply(j); paint(); emit(); hideSoon(4000); return; }
  }
  if ((j.phase === 'up' || j.phase === 'down') && now - lastBeep > 3000) { lastBeep = now; dataTick(j.phase === 'up'); }
  paint(); emit();
}

/** Starts a report. Returns { ok, why, eta } where why is 'busy', 'link' or 'docked'. */
export function startReport() {
  if (xfer.job && xfer.job.phase !== 'done' && xfer.job.phase !== 'fail') return { ok: false, why: 'busy' };
  const t = canTransmit();
  if (!t.ok) return { ok: false, why: 'link', L: t.L, st: t.st };
  clearTimeout(hideTimer);
  const s = sim.s, found = (gameState.getProperty('mission.discoveries') || []).length, L = t.L, f = speed(L, t.st);
  xfer.job = { phase: 'up', p: 0, n: L.n, label: L.label, dB: t.st.dB, f, upS: UP_S[L.n] || 20, downS: DOWN_S[L.n] || 8,
    text: `Status report via ${L.label}: ${s.at ? s.at.name : 'open water'}, depth ${Math.round(s.depth)} m, battery ${Math.round(s.battery)}%, ${found} finding${found === 1 ? '' : 's'}.` };
  bar ||= el('div', { class: 'xfer', style: 'pointer-events:none' }, el('div', { class: 'xf-title' }), el('div', { class: 'xf-track' }, el('div', { class: 'xf-fill' })), el('div', { class: 'xf-note' }));
  lastTick = Date.now(); lastBeep = 0;
  clearInterval(timer); timer = setInterval(step, 250);
  paint(); emit(); dataTick(true);
  return { ok: true, L, eta: xfer.job.upS / f };
}
/** The progress bar. The Communications console mounts it, so it is part of the console and never a pop-up over other scenes. */
export const xferBar = () => (xfer.job && bar ? bar : null);
export const transferring = () => !!xfer.job && xfer.job.phase !== 'done' && xfer.job.phase !== 'fail';
