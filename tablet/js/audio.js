// Sound, made with Web Audio. No sound files, so nothing to download.
//   hum   : the submarine's systems ("Ship" slider). Low, steady. A little louder at speed.
//   ambient : room tone, soft ventilation ("Ambient").   chirp : the communicator ("Communicator").
//   ping : a soft notice ("Notices").   mail zoom : window ticks ("Interface").  "Master" scales all of them.
// iPad Safari starts sound only after a tap, so initAudio() runs from the "Board" button.
const KEY = 'aquaNova_sound';
let ac = null, master = null, humGain = null, humFilter = null, ambGain = null;
const DEFAULTS = { on: true, vol: 0.6, hum: 0.25, ambient: 0.6, comm: 1, notice: 1, ui: 1 };   // hum = the Ship slider
const pref = (() => { try { return Object.assign({ ...DEFAULTS }, JSON.parse(localStorage.getItem(KEY))); } catch (e) { return { ...DEFAULTS }; } })();
const ambLevel = () => 0.1 * pref.ambient;
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(pref)); } catch (e) { /* ignore */ } };
let lastSpeed = 0;
const humLevel = (speed) => (0.06 + 0.08 * Math.min(1, Math.max(0, speed / 12))) * (pref.hum == null ? 0.25 : pref.hum) * 0.4;   // the hum has its own level: Off, Low, Normal
const level = () => (pref.on ? pref.vol * 0.8 : 0);

export const getSound = () => ({ ...pref });
export function setSound(next) {
  Object.assign(pref, next); save();
  if (master) master.gain.setTargetAtTime(level(), ac.currentTime, 0.05);
  if (humGain) humGain.gain.setTargetAtTime(humLevel(lastSpeed), ac.currentTime, 0.1);
  if (ambGain) ambGain.gain.setTargetAtTime(ambLevel(), ac.currentTime, 0.1);
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
}

function blip(freq0, freq1, start, dur, vol = 0.5, type = 'sine', bus = 'comm') {
  vol *= pref[bus] ?? 1; if (vol < 0.002) return;
  const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + start;
  o.type = type; o.frequency.setValueAtTime(freq0, t); o.frequency.exponentialRampToValueAtTime(freq1, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}
/** The communicator: two quick rising trills. */
export function chirp() {
  if (!ac || !pref.on) return;
  blip(1100, 1900, 0, 0.11); blip(1400, 2300, 0.14, 0.14); blip(1500, 2400, 0.34, 0.09, 0.3);   // bus: comm
}
/** 90s window zoom: eight quick ticks, rising as a message opens, falling as it closes. */
export function mailZoom(up = true) {
  if (!ac || !pref.on) return;
  for (let k = 0; k < 4; k++) { const f = up ? 320 + k * 260 : 1100 - k * 260; blip(f, f * 1.15, k * 0.06, 0.07, 0.2, 'square', 'ui'); }
  blip(up ? 1500 : 220, up ? 1900 : 160, 0.25, 0.09, 0.18, 'triangle', 'ui');
}
/** A soft notice. */
export function ping() {
  if (!ac || !pref.on) return;
  blip(880, 1320, 0, 0.18, 0.28, 'triangle', 'notice');
}

/** For the PED "Test sound" button. Must run from a tap. Returns the engine state. */
export function testSound() {
  initAudio();
  if (ac && ac.state !== 'running') ac.resume();
  chirp();
  return audioState();
}
