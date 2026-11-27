// Sound, made with Web Audio. No sound files, so nothing to download.
//   hum   : the submarine's systems ("Ship" slider). Low, steady. A little louder at speed.
//   ambient : room tone, soft ventilation ("Ambient").   chirp : the communicator ("Communicator").
//   ping : a soft notice ("Notices").   mail zoom : window ticks ("Interface").  "Master" scales all of them.
// iPad Safari starts sound only after a tap, so initAudio() runs from the "Board" button.
import { playSfx, loopSfx } from './sfx.js';   // effects and the interface sounds live in sfx.js (one place, so the sound board has them too)
const KEY = 'aquaNova_sound';
let ac = null, master = null, humGain = null, humFilter = null, ambGain = null, flow = null;
const DEFAULTS = { on: true, vol: 0.6, hum: 0.25, ambient: 0.6, comm: 1, notice: 1, ui: 1, fx: 0.8 };   // fx = the Effects slider (sfx.js)   // hum = the Ship slider
const pref = (() => { try { return Object.assign({ ...DEFAULTS }, JSON.parse(localStorage.getItem(KEY))); } catch (e) { return { ...DEFAULTS }; } })();
const ambLevel = () => 0.1 * pref.ambient;
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(pref)); } catch (e) { /* ignore */ } };
let lastSpeed = 0;
const humLevel = (speed) => (0.06 + 0.08 * Math.min(1, Math.max(0, speed / 12))) * (pref.hum == null ? 0.25 : pref.hum) * 0.4;   // the hum has its own level: Off, Low, Normal
const level = () => (pref.on ? pref.vol * 0.8 : 0);

export const getSound = () => ({ ...pref });
/** The live context and master volume, for music (theme.js); null until sound has started. */
export const audioOut = () => (ac && master ? { ac, master } : null);
/** A sound effect from sfx.js through the Effects volume. */
export function sfx(name, vol = 1) { if (!ac || !pref.on) return 0; return playSfx(ac, master, name, { vol: vol * (pref.fx ?? 0.8) }); }
/** A looping sound effect; returns { stop() }. */
export function sfxLoop(name, vol = 1) { if (!ac || !pref.on) return { stop() {}, setVol() {} }; return loopSfx(ac, master, name, { vol: vol * (pref.fx ?? 0.8) }); }
/** An interface sound (sfx.js) at its slider's level: bus = comm, ui or notice. */
const uiSound = (name, bus) => { if (!ac || !pref.on) return; const v = pref[bus] ?? 1; if (v < 0.002) return; playSfx(ac, master, name, { vol: v, t: ac.currentTime }); };
// Water past the hull (owner, 2026-11-27: the old fan loop sounded like it): silent when stopped, louder with speed, on the Ship slider.
const flowLevel = (speed) => Math.pow(Math.min(1.4, Math.max(0, speed) / 15), 1.3) * 0.8 * Math.min(1, (pref.hum ?? 0.25) * 4);
export function setSound(next) {
  Object.assign(pref, next); save();
  if (master) master.gain.setTargetAtTime(level(), ac.currentTime, 0.05);
  if (humGain) humGain.gain.setTargetAtTime(humLevel(lastSpeed), ac.currentTime, 0.1);
  if (ambGain) ambGain.gain.setTargetAtTime(ambLevel(), ac.currentTime, 0.1);
  if (flow) flow.setVol(flowLevel(lastSpeed));
}
export const audioState = () => ({ started: !!ac, state: ac ? ac.state : 'not started', running: !!ac && ac.state === 'running', master: master ? +master.gain.value.toFixed(3) : 0, on: pref.on, vol: pref.vol });

export function initAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC || navigator.webdriver) return; // automated test browsers render audio at full CPU, so skip there
  // iOS: Web Audio is silent when the ringer switch is on mute unless the page asks for "playback" audio.
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* older iOS */ }
  try { const a = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='); a.loop = true; a.play().catch(() => {}); } catch (e) { /* ignore */ }
  ac = new AC();
  ac.resume();
  // iOS pauses audio on interruptions (a call, Siri). Any tap brings it back.
  ['pointerdown', 'touchend', 'keydown'].forEach((ev) => document.addEventListener(ev, () => { if (ac && ac.state !== 'running' && !document.hidden) ac.resume(); }, { passive: true }));
  master = ac.createGain(); master.gain.value = level(); master.connect(ac.destination);
  // hum: two low saws a little apart (they beat slowly), through a low-pass filter
  humFilter = ac.createBiquadFilter(); humFilter.type = 'lowpass'; humFilter.frequency.value = 380; humFilter.Q.value = 0.7;
  humGain = ac.createGain(); humGain.gain.value = 0.01;
  for (const f of [110, 110.8, 165.3, 220.5]) { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(humFilter); o.start(); }
  // ventilation: soft filtered noise
  const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const noise = ac.createBufferSource(); noise.buffer = buf; noise.loop = true;
  const nf = ac.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 420; nf.Q.value = 0.4;
  const ng = ac.createGain(); ng.gain.value = 0.5;
  ambGain = ac.createGain(); ambGain.gain.value = ambLevel();
  noise.connect(nf); nf.connect(ng); ng.connect(ambGain); ambGain.connect(master); noise.start();
  humFilter.connect(humGain); humGain.connect(master);
  flow = loopSfx(ac, master, 'hullFlow', { vol: 0.0001 });
  // keep quiet when the app is not on screen
  document.addEventListener('visibilitychange', () => { if (!ac) return; if (document.hidden) ac.suspend(); else ac.resume(); });
}

/** Call a few times a second. speed in knots. */
export function updateHum(speed) {
  if (!ac || !humGain) return;
  lastSpeed = speed;
  const k = Math.min(1, Math.max(0, speed / 12));
  humGain.gain.setTargetAtTime(humLevel(speed), ac.currentTime, 0.4);
  humFilter.frequency.setTargetAtTime(340 + 260 * k, ac.currentTime, 0.4);
  if (flow) flow.setVol(flowLevel(speed));
}

/** The communicator: two quick rising trills. */
export function chirp() { uiSound('commChirp', 'comm'); }
/** 90s window zoom: quick ticks, rising as a message opens, falling as it closes. */
export function mailZoom(up = true) { uiSound(up ? 'mailOpen' : 'mailClose', 'ui'); }
/** An action happened (a sample taken, a craft launched): one short low tick. Not the communicator. */
export function actionTick() { uiSound('actionTick', 'ui'); }
/** A soft notice. */
export function ping() { uiSound('noticePing', 'notice'); }

/** For the PED "Test sound" button. Must run from a tap. Returns the engine state. */
export function testSound() {
  initAudio();
  if (ac && ac.state !== 'running') ac.resume();
  chirp();
  return audioState();
}

/** Data transfer: 16 very quick chirps, about half a second. Uplink climbs in pitch, downlink falls. */
export function dataTick(up = true) { uiSound(up ? 'dataUp' : 'dataDown', 'ui'); }
/** A transfer finished: three rising notes. ok=false: two falling notes. */
export function dataDone(ok = true) { uiSound(ok ? 'dataDone' : 'dataFail', 'ui'); }
