// Sound effects for the Aqua Nova, 90s 16-bit style (owner, 2026-11-27). Made with Web Audio: no sound files, nothing to download.
// SNES flavour: simple waves (square, triangle, saw) and noise, a little bit-crush, the top end rolled off (the chip ran at 32 kHz),
// and a darkened echo. Many are for later; the catalogue below says which are wired in (app.js, scene.js).
//
//   playSfx(ctx, out, name, { t, vol })  -> plays a one-shot; returns its length in seconds
//   loopSfx(ctx, out, name, { vol })     -> starts a loop; returns { stop() }
//   SFX_LIST                             -> every name, with a line on what it is
// `out` is any AudioNode (the game's master volume, or an OfflineAudioContext's destination to render a preview).

export const SFX_LIST = {
  generalAlarm: 'General alarm: a rising naval "whoop" klaxon, three times',
  battleStations: 'General quarters gong: a two-tone bell, bong-bong, repeated',
  fireAlarm: 'Fire alarm: a fast two-tone warble',
  collisionAlarm: 'Collision alarm: rapid high beeps',
  depthAlarm: 'Depth warning: a low pulsing tone',
  sonarPing: 'Active sonar ping with its long echo',
  sonarContact: 'New sonar contact: a two-note rising blip',
  sonarLost: 'Contact lost: a two-note falling blip',
  impact: 'Impact: a heavy hull thud',
  crash: 'Crash: metal on rock, a ringing scrape',
  hullCreak: 'Hull groan under pressure',
  torpedoLaunch: 'Torpedo or launch tube: air burst, whoosh, bubbles',
  doorOpen: 'Power-assisted door opening: hiss, servo whine up, clunk',
  doorClose: 'Power-assisted door closing: servo whine down, thunk, seal hiss',
  airlockFlood: 'Airlock flooding: rising rumble and gurgle',
  airlockDrain: 'Airlock draining: falling gurgle and suck',
  ballastBlow: 'Emergency blow: a huge hiss and roar of air',
  radioSquelch: 'Radio squelch: a short burst of noise and a click',
  radioBeep: 'Radio roger beep',
  powerUp: 'Power up: a rising whine and arpeggio (super cruise spool-up)',
  powerDown: 'Power down: a falling whine',
  cruiseEngage: 'Super cruise bites: a deep whoosh and a rising tone',
  bubbles: 'Bubbles',
  splash: 'Surface splash',
  buttonPress: 'Console button: a crisp tick',
  buttonError: 'Console refusal: a low double buzz',
  teletype: 'Teletype chatter for incoming text',
  distantExplosion: 'A distant underwater explosion: a low boom and rumble',
  // loops
  fan: 'LOOP Ventilation fan: soft whirr and air',
  engineRoom: 'LOOP Engine room: the fusion plant hum, pumps thumping, hiss',
  radioStatic: 'LOOP Radio static with crackle',
  reactorHum: 'LOOP Reactor hum: deep pulsing drone',
};

// ---------- the kit ----------
function kit(ctx, out, vol = 1) {
  const bus = ctx.createGain(); bus.gain.value = vol;
  // 16-bit grit: a gentle bit-crush and the top end rolled off
  const crush = ctx.createWaveShaper(); const curve = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.round(x * 48) / 48; }
  crush.curve = curve;
  const top = ctx.createBiquadFilter(); top.type = 'lowpass'; top.frequency.value = 11000;
  bus.connect(crush); crush.connect(top); top.connect(out);
  // SNES echo: a delay with darkened feedback
  const echoIn = ctx.createGain(); echoIn.gain.value = 0.22;
  const dly = ctx.createDelay(1.5); dly.delayTime.value = 0.18;
  const fb = ctx.createGain(); fb.gain.value = 0.35;
  const dark = ctx.createBiquadFilter(); dark.type = 'lowpass'; dark.frequency.value = 2400;
  echoIn.connect(dly); dly.connect(dark); dark.connect(fb); fb.connect(dly); dark.connect(bus);
  let nb = null;
  const k = {
    ctx, offline: typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext,   // rendering a preview: loops schedule ahead (no timers)
    send(node, wet = 0.6) { node.connect(bus); if (wet) { const g = ctx.createGain(); g.gain.value = wet; node.connect(g); g.connect(echoIn); } },
    echo(time, feedback) { dly.delayTime.value = time; fb.gain.value = feedback; },
    noise() { if (!nb) { nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; } const s = ctx.createBufferSource(); s.buffer = nb; s.loop = true; return s; },
    osc(type, f) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; return o; },
    gain(v = 0) { const g = ctx.createGain(); g.gain.value = v; return g; },
    filter(type, f, q = 1) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; },
    // a short percussive envelope on a gain
    hit(g, t, peak, decay, attack = 0.005) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay); },
    // a held note: attack, hold, release
    hold(g, t, peak, a, h, r) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.setValueAtTime(peak, t + a + h); g.gain.exponentialRampToValueAtTime(0.0001, t + a + h + r); },
    bus,
  };
  return k;
}
// one oscillator note through a gain to the kit; returns the oscillator for pitch moves
function tone(k, type, f, t, dur, peak, wet = 0.5, a = 0.01, r = 0.05) {
  const o = k.osc(type, f), g = k.gain(); o.connect(g); k.hold(g, t, peak, a, Math.max(0, dur - a - r), r); k.send(g, wet); o.start(t); o.stop(t + dur + 0.1); return o;
}
// a burst of filtered noise; returns the filter for sweeps
function hiss(k, t, dur, peak, type = 'bandpass', f = 2000, q = 1, wet = 0.4, a = 0.01) {
  const n = k.noise(), fl = k.filter(type, f, q), g = k.gain(); n.connect(fl); fl.connect(g); k.hold(g, t, peak, a, Math.max(0, dur - a - 0.08), 0.08); k.send(g, wet); n.start(t); n.stop(t + dur + 0.2); return fl;
}
function thud(k, t, f0, f1, dur, peak) {
  const o = k.osc('sine', f0), g = k.gain(); o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.6); o.connect(g); k.hit(g, t, peak, dur); k.send(g, 0.3); o.start(t); o.stop(t + dur + 0.1);
}

// ---------- one-shots: (k, t) -> length in seconds ----------
const SHOTS = {
  generalAlarm(k, t) {
    for (let i = 0; i < 3; i++) {
      const t0 = t + i * 1.15;
      for (const det of [0, 7]) { const o = tone(k, 'square', 420, t0, 0.95, 0.12, 0.3, 0.02, 0.08); o.detune.value = det; o.frequency.setValueAtTime(420, t0); o.frequency.exponentialRampToValueAtTime(900, t0 + 0.9); }
    }
    return 3.6;
  },
  battleStations(k, t) {
    for (let i = 0; i < 4; i++) for (const [f, dt] of [[660, 0], [520, 0.38]]) {
      const t0 = t + i * 1.0 + dt;
      for (const [m, v] of [[1, 0.2], [2.76, 0.06], [5.4, 0.03]]) { const o = k.osc('triangle', f * m), g = k.gain(); o.connect(g); k.hit(g, t0, v, 0.9); k.send(g, 0.7); o.start(t0); o.stop(t0 + 1); }
    }
    return 4.6;
  },
  fireAlarm(k, t) { for (let i = 0; i < 12; i++) tone(k, 'square', i % 2 ? 980 : 760, t + i * 0.16, 0.15, 0.1, 0.2, 0.005, 0.02); return 2.2; },
  collisionAlarm(k, t) { for (let i = 0; i < 16; i++) tone(k, 'square', 1700, t + i * 0.1, 0.06, 0.09, 0.15, 0.003, 0.01); return 1.8; },
  depthAlarm(k, t) { for (let i = 0; i < 4; i++) tone(k, 'triangle', 220, t + i * 0.55, 0.35, 0.25, 0.3, 0.04, 0.12); return 2.4; },
  sonarPing(k, t) {
    k.echo(0.42, 0.55);
    const o = tone(k, 'sine', 1180, t, 0.5, 0.25, 1.4, 0.005, 0.45); o.frequency.setValueAtTime(1200, t); o.frequency.exponentialRampToValueAtTime(1150, t + 0.5);
    tone(k, 'triangle', 590, t, 0.3, 0.05, 1, 0.005, 0.25);
    return 3.2;
  },
  sonarContact(k, t) { tone(k, 'square', 880, t, 0.09, 0.08, 0.6); tone(k, 'square', 1320, t + 0.11, 0.14, 0.08, 0.6); return 0.8; },
  sonarLost(k, t) { tone(k, 'square', 1320, t, 0.09, 0.07, 0.6); tone(k, 'square', 660, t + 0.11, 0.18, 0.07, 0.6); return 0.8; },
  impact(k, t) {
    thud(k, t, 120, 38, 0.9, 0.7);
    hiss(k, t, 0.25, 0.35, 'lowpass', 600, 0.7, 0.2, 0.002);
    for (const f of [180, 263, 377]) { const o = k.osc('square', f), g = k.gain(), lp = k.filter('lowpass', 900); o.connect(lp); lp.connect(g); k.hit(g, t + 0.02, 0.04, 0.6); k.send(g, 0.5); o.start(t); o.stop(t + 0.8); }
    return 1.4;
  },
  crash(k, t) {
    thud(k, t, 90, 30, 1.2, 0.6);
    const fl = hiss(k, t, 1.6, 0.25, 'bandpass', 3000, 0.6, 0.5, 0.002); fl.frequency.setValueAtTime(4200, t); fl.frequency.exponentialRampToValueAtTime(700, t + 1.5);
    for (const f of [311, 467, 739, 1123, 1597]) { const o = k.osc('square', f), g = k.gain(); o.connect(g); k.hit(g, t + Math.random() * 0.05, 0.035, 1.4 + Math.random()); k.send(g, 0.7); o.start(t); o.stop(t + 2.6); }
    return 2.8;
  },
  hullCreak(k, t) {
    const o = k.osc('sawtooth', 70), bp = k.filter('bandpass', 260, 7), g = k.gain(); o.connect(bp); bp.connect(g);
    o.frequency.setValueAtTime(62, t); o.frequency.linearRampToValueAtTime(95, t + 0.9); o.frequency.linearRampToValueAtTime(58, t + 2.1);
    bp.frequency.setValueAtTime(220, t); bp.frequency.linearRampToValueAtTime(420, t + 1.1); bp.frequency.linearRampToValueAtTime(180, t + 2.2);
    k.hold(g, t, 0.5, 0.4, 1.4, 0.6); k.send(g, 0.8); o.start(t); o.stop(t + 2.6);
    return 2.8;
  },
  torpedoLaunch(k, t) {
    hiss(k, t, 0.18, 0.5, 'highpass', 1500, 0.7, 0.3, 0.002);
    thud(k, t, 140, 50, 0.4, 0.5);
    const fl = hiss(k, t + 0.1, 1.5, 0.3, 'bandpass', 2500, 2, 0.6, 0.05); fl.frequency.setValueAtTime(2500, t + 0.1); fl.frequency.exponentialRampToValueAtTime(300, t + 1.5);
    SHOTS.bubbles(k, t + 0.3);
    return 2.4;
  },
  doorOpen(k, t) {
    hiss(k, t, 0.25, 0.25, 'highpass', 3000, 0.7, 0.2, 0.005);
    const o = tone(k, 'sawtooth', 160, t + 0.12, 0.6, 0.07, 0.2, 0.05, 0.1); o.frequency.setValueAtTime(160, t + 0.12); o.frequency.linearRampToValueAtTime(420, t + 0.65);
    thud(k, t + 0.72, 220, 90, 0.18, 0.3);
    return 1;
  },
  doorClose(k, t) {
    const o = tone(k, 'sawtooth', 420, t, 0.55, 0.07, 0.2, 0.04, 0.1); o.frequency.setValueAtTime(420, t); o.frequency.linearRampToValueAtTime(150, t + 0.55);
    thud(k, t + 0.58, 160, 55, 0.3, 0.5);
    hiss(k, t + 0.62, 0.35, 0.15, 'highpass', 2500, 0.7, 0.2, 0.01);
    return 1.1;
  },
  airlockFlood(k, t) {
    const fl = hiss(k, t, 3, 0.3, 'lowpass', 300, 1, 0.4, 0.6); fl.frequency.setValueAtTime(250, t); fl.frequency.linearRampToValueAtTime(1100, t + 2.8);
    for (let i = 0; i < 18; i++) { const t0 = t + 0.4 + i * 0.14 + Math.random() * 0.06; const o = tone(k, 'sine', 180 + Math.random() * 220, t0, 0.07, 0.08, 0.5); o.frequency.exponentialRampToValueAtTime(600, t0 + 0.07); }
    return 3.4;
  },
  airlockDrain(k, t) {
    const fl = hiss(k, t, 2.6, 0.3, 'lowpass', 1100, 1, 0.4, 0.2); fl.frequency.setValueAtTime(1100, t); fl.frequency.linearRampToValueAtTime(200, t + 2.5);
    for (let i = 0; i < 12; i++) { const t0 = t + 0.2 + i * 0.18; const o = tone(k, 'sine', 500 - i * 25, t0, 0.09, 0.07, 0.5); o.frequency.exponentialRampToValueAtTime(150, t0 + 0.09); }
    const o = tone(k, 'sawtooth', 90, t + 2.2, 0.5, 0.08, 0.3, 0.02, 0.3); o.frequency.exponentialRampToValueAtTime(40, t + 2.7);
    return 3;
  },
  ballastBlow(k, t) {
    hiss(k, t, 3.2, 0.45, 'highpass', 900, 0.6, 0.4, 0.05);
    const fl = hiss(k, t, 3.2, 0.4, 'lowpass', 400, 1, 0.3, 0.2); fl.frequency.linearRampToValueAtTime(180, t + 3);
    thud(k, t, 80, 30, 2.5, 0.35);
    SHOTS.bubbles(k, t + 0.8); SHOTS.bubbles(k, t + 1.6);
    return 3.8;
  },
  radioSquelch(k, t) { hiss(k, t, 0.16, 0.25, 'bandpass', 1800, 0.8, 0.1, 0.002); tone(k, 'square', 3000, t + 0.16, 0.02, 0.08, 0); return 0.3; },
  radioBeep(k, t) { tone(k, 'square', 1200, t, 0.12, 0.08, 0.2); return 0.3; },
  powerUp(k, t) {
    const o = tone(k, 'sawtooth', 70, t, 2.2, 0.1, 0.4, 0.2, 0.3); o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(560, t + 2.0);
    [262, 330, 392, 523, 659, 784].forEach((f, i) => tone(k, 'square', f, t + 0.3 + i * 0.25, 0.22, 0.05, 0.7));
    return 2.8;
  },
  powerDown(k, t) {
    const o = tone(k, 'sawtooth', 560, t, 2, 0.1, 0.4, 0.05, 0.4); o.frequency.setValueAtTime(560, t); o.frequency.exponentialRampToValueAtTime(50, t + 1.9);
    [784, 523, 392, 262].forEach((f, i) => tone(k, 'square', f, t + i * 0.22, 0.2, 0.04, 0.6));
    return 2.6;
  },
  cruiseEngage(k, t) {
    thud(k, t, 70, 28, 1.6, 0.6);
    const fl = hiss(k, t, 2.2, 0.35, 'bandpass', 400, 1.5, 0.6, 0.05); fl.frequency.setValueAtTime(300, t); fl.frequency.exponentialRampToValueAtTime(3500, t + 2);
    const o = tone(k, 'square', 220, t + 0.2, 2, 0.06, 0.6, 0.3, 0.4); o.frequency.exponentialRampToValueAtTime(880, t + 2.1);
    return 2.8;
  },
  bubbles(k, t) { for (let i = 0; i < 14; i++) { const t0 = t + i * 0.07 + Math.random() * 0.05, f = 300 + Math.random() * 500; const o = tone(k, 'sine', f, t0, 0.06, 0.07, 0.3); o.frequency.exponentialRampToValueAtTime(f * 2.2, t0 + 0.06); } return 1.4; },
  splash(k, t) { const fl = hiss(k, t, 0.9, 0.4, 'lowpass', 3000, 0.5, 0.4, 0.01); fl.frequency.exponentialRampToValueAtTime(500, t + 0.8); SHOTS.bubbles(k, t + 0.2); return 1.6; },
  buttonPress(k, t) { tone(k, 'square', 1500, t, 0.03, 0.08, 0); tone(k, 'square', 750, t + 0.03, 0.03, 0.05, 0); return 0.15; },
  buttonError(k, t) { tone(k, 'square', 180, t, 0.12, 0.1, 0.1); tone(k, 'square', 140, t + 0.16, 0.18, 0.1, 0.1); return 0.45; },
  teletype(k, t) { for (let i = 0; i < 18; i++) { const t0 = t + i * 0.055 + Math.random() * 0.02; hiss(k, t0, 0.02, 0.18, 'bandpass', 2500 + Math.random() * 1500, 3, 0, 0.001); } return 1.2; },
  distantExplosion(k, t) {
    k.echo(0.55, 0.45);
    thud(k, t, 60, 22, 2.5, 0.7);
    const fl = hiss(k, t, 3.5, 0.3, 'lowpass', 500, 0.7, 0.8, 0.02); fl.frequency.exponentialRampToValueAtTime(90, t + 3.3);
    return 4.5;
  },
};

// ---------- loops: (k) -> stop() ----------
const LOOPS = {
  fan(k) {
    const n = k.noise(), lp = k.filter('lowpass', 900, 0.7), g = k.gain(0.12); n.connect(lp); lp.connect(g); k.send(g, 0); n.start();
    const o = k.osc('triangle', 55), og = k.gain(0.05), lfo = k.osc('sine', 9), ld = k.gain(0.02); lfo.connect(ld); ld.connect(og.gain); o.connect(og); k.send(og, 0); o.start(); lfo.start();
    return () => { for (const s of [n, o, lfo]) s.stop(); };
  },
  engineRoom(k) {
    const ctx = k.ctx, src = [];
    for (const f of [41, 41.7, 82.5]) { const o = k.osc('sawtooth', f), lp = k.filter('lowpass', 220, 0.8), g = k.gain(0.07); o.connect(lp); lp.connect(g); k.send(g, 0); o.start(); src.push(o); }
    const n = k.noise(), hp = k.filter('highpass', 3500, 0.7), hg = k.gain(0.025); n.connect(hp); hp.connect(hg); k.send(hg, 0); n.start(); src.push(n);
    // pumps thumping twice a second, scheduled ahead in chunks
    let t = ctx.currentTime + 0.1, live = true;
    const pump = () => { if (!live) return; while (t < (k.offline ? 8 : ctx.currentTime + 2)) { thud(k, t, 90, 45, 0.35, 0.18); thud(k, t + 0.27, 80, 40, 0.3, 0.1); t += 0.9; } if (!k.offline) setTimeout(pump, 1000); };
    pump();
    return () => { live = false; for (const s of src) s.stop(); };
  },
  radioStatic(k) {
    const ctx = k.ctx, n = k.noise(), bp = k.filter('bandpass', 1800, 0.6), g = k.gain(0.12); n.connect(bp); bp.connect(g); k.send(g, 0); n.start();
    let live = true; const crackle = () => { if (!live) return; const t = ctx.currentTime + Math.random() * 0.3; hiss(k, t, 0.02 + Math.random() * 0.04, 0.2, 'highpass', 4000, 0.7, 0, 0.001); setTimeout(crackle, 80 + Math.random() * 250); };
    if (k.offline) { for (let t = 0.1; t < 8; t += 0.08 + Math.random() * 0.25) hiss(k, t, 0.02 + Math.random() * 0.04, 0.2, 'highpass', 4000, 0.7, 0, 0.001); } else crackle();
    return () => { live = false; n.stop(); };
  },
  reactorHum(k) {
    const o1 = k.osc('triangle', 55), o2 = k.osc('sine', 110.4), g = k.gain(0.12), lfo = k.osc('sine', 0.7), ld = k.gain(0.05);
    lfo.connect(ld); ld.connect(g.gain); o1.connect(g); o2.connect(g); k.send(g, 0.2); o1.start(); o2.start(); lfo.start();
    return () => { for (const s of [o1, o2, lfo]) s.stop(); };
  },
};

// level of each sound so they sit together in the game (from rendered peaks, 2026-11-27): alarms and crashes loud, interface ticks soft, loops low
const LEVEL = {"generalAlarm": 1.25, "battleStations": 1.6, "fireAlarm": 2.69, "collisionAlarm": 3.18, "depthAlarm": 1.15, "sonarPing": 1.17, "sonarContact": 2.27, "sonarLost": 2.5, "impact": 0.82, "crash": 0.74, "hullCreak": 2.33, "torpedoLaunch": 0.5, "doorOpen": 0.8, "doorClose": 0.73, "airlockFlood": 1.67, "airlockDrain": 1.84, "ballastBlow": 0.56, "radioSquelch": 1.18, "radioBeep": 1.36, "powerUp": 1.75, "powerDown": 1.84, "cruiseEngage": 0.86, "bubbles": 2.86, "splash": 1.0, "buttonPress": 1.8, "buttonError": 1.54, "teletype": 2.14, "distantExplosion": 0.7, "fan": 0.92, "engineRoom": 0.71, "radioStatic": 0.56, "reactorHum": 0.56};
/** Play a one-shot. Returns its length in seconds (0 if the name is unknown). */
export function playSfx(ctx, out, name, { t = ctx.currentTime + 0.02, vol = 1 } = {}) {
  const f = SHOTS[name]; if (!f || !ctx || !out) return 0;
  const k = kit(ctx, out, vol * (LEVEL[name] || 1)); return f(k, t);
}
/** Start a loop. Returns { stop() } (fades out). */
export function loopSfx(ctx, out, name, { vol = 1 } = {}) {
  const f = LOOPS[name]; if (!f || !ctx || !out) return { stop() {} };
  const k = kit(ctx, out, 0.0001); k.bus.gain.linearRampToValueAtTime(vol * (LEVEL[name] || 1), ctx.currentTime + 1.2);
  const end = f(k); let stopped = false;
  return { stop() { if (stopped) return; stopped = true; k.bus.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.4); setTimeout(() => { try { end(); } catch (e) { /* gone */ } k.bus.disconnect(); }, 2000); } };
}
export const isLoop = (name) => name in LOOPS;
