// Sound, made with Web Audio. No sound files, so nothing to download.
//   hum   : the submarine's systems. Low, steady. A little louder at speed.
//   chirp : the communicator.   ping : a soft notice.
// iPad Safari starts sound only after a tap, so initAudio() runs from the "Board" button.
const KEY = 'aquaNova_sound';
let ac = null, master = null, humGain = null, humFilter = null;
const pref = (() => { try { return Object.assign({ on: true, vol: 0.6 }, JSON.parse(localStorage.getItem(KEY))); } catch (e) { return { on: true, vol: 0.6 }; } })();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(pref)); } catch (e) { /* ignore */ } };
const level = () => (pref.on ? pref.vol * 0.5 : 0);

export const getSound = () => ({ ...pref });
export function setSound(next) {
  Object.assign(pref, next); save();
  if (master) master.gain.setTargetAtTime(level(), ac.currentTime, 0.05);
}
export const audioState = () => ({ started: !!ac, running: !!ac && ac.state === 'running', master: master ? +master.gain.value.toFixed(3) : 0, on: pref.on, vol: pref.vol });

export function initAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ac = new AC();
  master = ac.createGain(); master.gain.value = level(); master.connect(ac.destination);
  // hum: two low saws a little apart (they beat slowly), through a low-pass filter
  humFilter = ac.createBiquadFilter(); humFilter.type = 'lowpass'; humFilter.frequency.value = 180; humFilter.Q.value = 0.7;
  humGain = ac.createGain(); humGain.gain.value = 0.5;
  for (const f of [48, 48.6, 72.2]) { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(humFilter); o.start(); }
  // ventilation: soft filtered noise
  const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const noise = ac.createBufferSource(); noise.buffer = buf; noise.loop = true;
  const nf = ac.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 420; nf.Q.value = 0.4;
  const ng = ac.createGain(); ng.gain.value = 0.035;
  noise.connect(nf); nf.connect(ng); ng.connect(humGain); noise.start();
  humFilter.connect(humGain); humGain.connect(master);
  // keep quiet when the app is not on screen
  document.addEventListener('visibilitychange', () => { if (!ac) return; if (document.hidden) ac.suspend(); else ac.resume(); });
}

/** Call a few times a second. speed in knots. */
export function updateHum(speed) {
  if (!ac || !humGain) return;
  const k = Math.min(1, Math.max(0, speed / 12));
  humGain.gain.setTargetAtTime(0.45 + 0.4 * k, ac.currentTime, 0.4);
  humFilter.frequency.setTargetAtTime(170 + 110 * k, ac.currentTime, 0.4);
}

function blip(freq0, freq1, start, dur, vol = 0.5, type = 'sine') {
  const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + start;
  o.type = type; o.frequency.setValueAtTime(freq0, t); o.frequency.exponentialRampToValueAtTime(freq1, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}
/** The communicator: two quick rising trills. */
export function chirp() {
  if (!ac || !pref.on) return;
  blip(1100, 1900, 0, 0.11); blip(1400, 2300, 0.14, 0.14); blip(1500, 2400, 0.34, 0.09, 0.3);
}
/** A soft notice. */
export function ping() {
  if (!ac || !pref.on) return;
  blip(880, 1320, 0, 0.18, 0.28, 'triangle');
}
