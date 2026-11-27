// Sound effects for the Aqua Nova, 90s 16-bit style (owner, 2026-11-27). Made with Web Audio: no sound files, nothing to download.
// SNES flavour: simple waves (square, triangle, saw) and noise, a little bit-crush, the top end rolled off (the chip ran at 32 kHz),
// and a darkened echo. Where each is used: app.js (the sim events) and audio.js (interface sounds, hull flow). See docs/HANDOFF.md.
//
//   playSfx(ctx, out, name, { t, vol })  -> plays a one-shot; returns its length in seconds
//   loopSfx(ctx, out, name, { vol })     -> starts a loop; returns { stop() }
//   SFX_LIST                             -> every name, with a line on what it is
// `out` is any AudioNode (the game's master volume, or an OfflineAudioContext's destination to render a preview).

export const SFX_LIST = {
  generalAlarm: 'General alarm: a rising naval "whoop" klaxon, three times',
  fireAlarm: 'Fire alarm: a fast two-tone warble',
  collisionAlarm: 'Collision alarm: rapid high beeps',
  depthAlarm: 'Depth warning: a low pulsing tone',
  sonarPing: 'Active sonar ping with its long echo',
  sonarContact: 'New sonar contact: a two-note rising blip',
  sonarLost: 'Contact lost: a two-note falling blip',
  impact: 'Impact: a heavy hull thud with a crack',
  crash: 'Crash: a heavy double hit and a grinding scrape of metal on rock',
  hullCreak: 'Hull groan under pressure: a slow bending moan, creaks, a pop',
  torpedoLaunch: 'Torpedo or launch tube: air burst, whoosh, bubbles',
  doorOpen: 'Power-assisted door opening: hiss, servo whine up, clunk',
  doorClose: 'Power-assisted door closing: servo whine down, thunk, seal hiss',
  dockBump: 'Docking: the hull settles against the berth fenders',
  dockClamps: 'Docking clamps latching: four heavy metallic clamps, one after another, ringing',
  clampRelease: 'Docking clamps releasing: hydraulic hiss and four lighter clunks',
  shorePower: 'Shore power connector: a heavy clunk and the supply humming up',
  hatchOpen: 'Launch bay hatch opening: clamps release, hydraulic hiss, a heavy grind, a boom as it stops',
  hatchClose: 'Launch bay hatch closing: the grind, a deep boom, clamps locking',
  airlockFlood: 'Airlock flooding: rising rumble and gurgle',
  airlockDrain: 'Airlock draining: falling gurgle and suck',
  ballastBlow: 'Emergency blow: a huge hiss and roar of air',
  radioSquelch: 'Radio squelch: a short burst of noise and a click',
  radioBeep: 'Radio roger beep',
  powerUp: 'Power up: a turbine spooling up, whine and rushing air (super cruise spool-up)',
  powerDown: 'Power down: the turbine running down, a last clunk (super cruise off)',
  cruiseEngage: 'Super cruise bites: a deep whoosh and a rising tone',
  bubbles: 'Bubbles',
  splash: 'Surface splash',
  buttonPress: 'Console button: a crisp tick',
  buttonError: 'Console refusal: a low double buzz',
  teletype: 'Teletype chatter for incoming text',
  distantExplosion: 'A distant underwater explosion: a deep boom, the pressure wave, a long rumble',
  // interface (moved here from audio.js so the sound board has them; the game plays them through its own sliders)
  commChirp: 'Communicator: two quick rising trills',
  mailOpen: 'Message opens: rising window ticks',
  mailClose: 'Message closes: falling window ticks',
  actionTick: 'Action done: one short low tick',
  noticePing: 'Notice: a soft ping',
  dataUp: 'Data uplink: quick climbing chirps',
  dataDown: 'Data downlink: quick falling chirps',
  dataDone: 'Transfer finished: three rising notes',
  dataFail: 'Transfer failed: two falling notes',
  // loops
  hullFlow: 'LOOP Water past the hull: rushing flow (in the game it gets louder with speed)',
  shipHum: 'LOOP Ship hum: the systems drone under everything',
  ventilation: 'LOOP Ventilation: soft room air',
  engineRoom: 'LOOP Engine room: the fusion plant hum, pumps thumping, hiss',
  bayFlood: 'LOOP Launch bay flooding: water pouring in, gurgling, the hull taking the weight (the game holds it for most of the cycle)',
  bayPump: 'LOOP Launch bay pumping out: pumps thumping, water draining, air hissing in',
  radioStatic: 'LOOP Radio static with crackle',
  reactorHum: 'LOOP Reactor hum: deep pulsing drone',
};

// ---------- the kit ----------
function kit(ctx, out, vol = 1, drive = 0) {
  const bus = ctx.createGain(); bus.gain.value = vol;
  // heavy hits (owner, 2026-11-27: still too quiet on the iPad): soft saturation. Low thuds grow harmonics a small speaker can play,
  // and the level can go up without hard clipping. drive = how hard (0 = off). The 0.62 leaves headroom (the crush and filters add a little).
  let into = bus;
  if (drive) { const sat = ctx.createWaveShaper(), c = new Float32Array(2048), n = Math.tanh(drive); for (let i = 0; i < 2048; i++) { const x = (i / 2047) * 2 - 1; c[i] = 0.62 * Math.tanh(drive * x) / n; } sat.curve = c; sat.oversample = '2x'; bus.connect(sat); into = sat; }
  // 16-bit grit: a gentle bit-crush and the top end rolled off
  const crush = ctx.createWaveShaper(); const curve = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.round(x * 48) / 48; }
  crush.curve = curve;
  const top = ctx.createBiquadFilter(); top.type = 'lowpass'; top.frequency.value = 11000;
  into.connect(crush); crush.connect(top); top.connect(out);
  // SNES echo: a delay with darkened feedback
  const echoIn = ctx.createGain(); echoIn.gain.value = 0.22;
  const dly = ctx.createDelay(1.5); dly.delayTime.value = 0.18;
  const fb = ctx.createGain(); fb.gain.value = 0.35;
  const dark = ctx.createBiquadFilter(); dark.type = 'lowpass'; dark.frequency.value = 2400;
  echoIn.connect(dly); dly.connect(dark); dark.connect(fb); fb.connect(dly); dark.connect(bus);
  const dry = ctx.createGain(); dry.gain.value = vol; dry.connect(out);   // straight out, no grit or echo (the interface sounds)
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
    bus, dry,
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
// a clean interface blip straight to the output (as audio.js always made them)
function blip(k, f0, f1, start, dur, vol = 0.5, type = 'sine') {
  const o = k.osc(type, f0), g = k.gain(), t = start;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(k.dry); o.start(t); o.stop(t + dur + 0.05);
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
  impact(k, t) {   // heavier (owner, 2026-11-27): two low hits, a crack, the hull ringing a little
    thud(k, t, 160, 40, 1.0, 0.9); thud(k, t + 0.03, 75, 28, 1.3, 0.7);
    hiss(k, t, 0.12, 0.6, 'highpass', 500, 0.7, 0.3, 0.001);
    const rb = hiss(k, t, 1.1, 0.4, 'lowpass', 500, 0.8, 0.3, 0.003); rb.frequency.exponentialRampToValueAtTime(120, t + 1);
    for (const f of [140, 211]) { const o = k.osc('triangle', f), g = k.gain(); o.connect(g); k.hit(g, t + 0.02, 0.06, 1.2); k.send(g, 0.5); o.start(t); o.stop(t + 1.4); }
    return 1.6;
  },
  crash(k, t) {   // remade (owner, 2026-11-27): a double hit, then metal grinding on rock (no ringing bells)
    thud(k, t, 130, 32, 1.4, 0.9); thud(k, t + 0.09, 85, 26, 1.6, 0.7);
    hiss(k, t, 0.15, 0.6, 'highpass', 400, 0.7, 0.3, 0.001);
    const sc = hiss(k, t + 0.05, 1.5, 0.45, 'bandpass', 900, 4, 0.4, 0.02);   // the scrape: a narrow band of noise that jitters about
    for (let i = 0; i < 26; i++) sc.frequency.setValueAtTime(450 + Math.random() * 1300, t + 0.05 + i * 0.055);
    const gr = hiss(k, t + 0.05, 1.6, 0.35, 'lowpass', 700, 0.8, 0.3, 0.02); gr.frequency.exponentialRampToValueAtTime(150, t + 1.6);
    const o = k.osc('triangle', 118), g = k.gain(); o.connect(g); k.hit(g, t + 0.05, 0.08, 1.8); k.send(g, 0.6); o.start(t); o.stop(t + 2);
    return 2.4;
  },
  hullCreak(k, t) {   // remade (owner, 2026-11-27): steel bending under pressure: a slow moan with a stick-slip flutter, creaks, and a pop at the end
    const o = k.osc('sawtooth', 48), bp = k.filter('bandpass', 200, 12), g = k.gain(), am = k.osc('square', 11), ad = k.gain(0.25);
    am.connect(ad); ad.connect(g.gain); o.connect(bp); bp.connect(g);
    o.frequency.setValueAtTime(44, t); o.frequency.linearRampToValueAtTime(58, t + 1.4); o.frequency.linearRampToValueAtTime(40, t + 2.6);
    bp.frequency.setValueAtTime(170, t); bp.frequency.linearRampToValueAtTime(330, t + 1.3); bp.frequency.linearRampToValueAtTime(140, t + 2.6);
    k.hold(g, t, 0.55, 0.5, 1.6, 0.6); k.send(g, 0.8); o.start(t); am.start(t); o.stop(t + 3); am.stop(t + 3);
    let tt = t + 0.3; for (let i = 0; i < 14; i++) { tt += 0.05 + 0.1 * Math.abs(Math.sin(i * 0.7)); hiss(k, tt, 0.018, 0.22, 'bandpass', 1400 + Math.random() * 900, 6, 0.5, 0.001); }
    thud(k, t + 2.5, 95, 45, 0.35, 0.5);
    return 3.2;
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
  // docking (owner, 2026-11-27: metallic thuds)
  dockBump(k, t) {
    thud(k, t, 90, 45, 0.9, 0.7); hiss(k, t, 0.5, 0.25, 'lowpass', 400, 0.8, 0.3, 0.02);
    const c = tone(k, 'sawtooth', 60, t + 0.2, 0.8, 0.06, 0.4, 0.1, 0.3); c.frequency.linearRampToValueAtTime(48, t + 1);   // the hull creaks as it takes the weight
    return 1.4;
  },
  dockClamps(k, t) {
    [0, 0.45, 0.8, 1.3].forEach((dt, i) => {
      const t0 = t + dt;
      thud(k, t0, 260 - i * 15, 85, 0.35, 0.8); thud(k, t0 + 0.01, 120, 45, 0.6, 0.6);   // the clamp jaw slams home
      hiss(k, t0, 0.05, 0.4, 'bandpass', 3000, 1.5, 0.3, 0.001);
      for (const [f, v, d] of [[387, 0.07, 0.9], [913, 0.05, 0.6], [1612, 0.03, 0.4], [2390, 0.02, 0.3]]) { const o = k.osc('triangle', f * (1 + i * 0.03)), g = k.gain(); o.connect(g); k.hit(g, t0 + 0.005, v, d); k.send(g, 0.6); o.start(t0); o.stop(t0 + d + 0.1); }   // steel ringing (inharmonic)
    });
    thud(k, t + 1.8, 70, 30, 1.2, 0.6);   // the whole hull settles
    return 3;
  },
  clampRelease(k, t) {
    hiss(k, t, 0.6, 0.3, 'highpass', 1800, 0.7, 0.3, 0.02);
    [0.3, 0.6, 0.95, 1.25].forEach((dt, i) => { const t0 = t + dt; thud(k, t0, 200, 90, 0.25, 0.5); for (const [f, v] of [[421, 0.04], [1033, 0.025]]) { const o = k.osc('triangle', f * (1 - i * 0.03)), g = k.gain(); o.connect(g); k.hit(g, t0, v, 0.5); k.send(g, 0.5); o.start(t0); o.stop(t0 + 0.6); } });
    hiss(k, t + 1.4, 0.5, 0.15, 'highpass', 2500, 0.7, 0.3, 0.05);
    return 2.2;
  },
  shorePower(k, t) {
    thud(k, t, 180, 70, 0.4, 0.8); hiss(k, t, 0.04, 0.35, 'bandpass', 2800, 2, 0.2, 0.001);
    const h = tone(k, 'sawtooth', 50, t + 0.2, 1.4, 0.07, 0.2, 0.5, 0.4); h.frequency.linearRampToValueAtTime(60, t + 1.6);
    const h2 = tone(k, 'square', 120, t + 0.3, 1.3, 0.025, 0.2, 0.5, 0.4); h2.frequency.linearRampToValueAtTime(120.5, t + 1.6);
    return 1.9;
  },
  hatchOpen(k, t) {   // a pressure hatch, much heavier than a room door (owner, 2026-11-27: the launch bay cycle)
    for (const dt of [0, 0.12, 0.22]) { thud(k, t + dt, 300, 140, 0.12, 0.35); hiss(k, t + dt, 0.04, 0.3, 'bandpass', 2500, 2, 0.2, 0.001); }   // clamps let go
    hiss(k, t + 0.3, 0.5, 0.3, 'highpass', 2000, 0.7, 0.3, 0.01);   // hydraulics
    const g = tone(k, 'sawtooth', 55, t + 0.4, 1.6, 0.12, 0.3, 0.2, 0.2); g.frequency.linearRampToValueAtTime(75, t + 2);   // the hatch grinding round
    const r = hiss(k, t + 0.4, 1.6, 0.18, 'bandpass', 500, 3, 0.3, 0.2); for (let i = 0; i < 14; i++) r.frequency.setValueAtTime(350 + Math.random() * 400, t + 0.4 + i * 0.11);
    thud(k, t + 2.05, 110, 40, 0.7, 0.8);   // the stop
    return 2.8;
  },
  hatchClose(k, t) {
    const g = tone(k, 'sawtooth', 75, t, 1.5, 0.12, 0.3, 0.2, 0.15); g.frequency.linearRampToValueAtTime(55, t + 1.5);
    const r = hiss(k, t, 1.5, 0.18, 'bandpass', 500, 3, 0.3, 0.2); for (let i = 0; i < 13; i++) r.frequency.setValueAtTime(350 + Math.random() * 400, t + i * 0.11);
    thud(k, t + 1.55, 100, 35, 0.9, 0.9); hiss(k, t + 1.55, 0.15, 0.4, 'lowpass', 900, 0.7, 0.4, 0.001);   // the hatch seats
    for (const dt of [1.9, 2.0, 2.1]) thud(k, t + dt, 320, 150, 0.1, 0.35);   // clamps lock
    return 2.6;
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
  powerUp(k, t) {   // remade (owner, 2026-11-27): a turbine spooling up: a rising whine, a growl under it, air rushing in. No tune.
    const w = tone(k, 'triangle', 60, t, 3.4, 0.16, 0.4, 0.4, 0.4); w.frequency.setValueAtTime(60, t); w.frequency.exponentialRampToValueAtTime(900, t + 3.2);
    const gr = k.osc('square', 30), lp = k.filter('lowpass', 180, 2), gg = k.gain(); gr.connect(lp); lp.connect(gg); k.hold(gg, t, 0.12, 0.5, 2.4, 0.5); k.send(gg, 0.2);
    gr.frequency.setValueAtTime(30, t); gr.frequency.exponentialRampToValueAtTime(110, t + 3); lp.frequency.setValueAtTime(150, t); lp.frequency.exponentialRampToValueAtTime(900, t + 3); gr.start(t); gr.stop(t + 3.6);
    const air = hiss(k, t, 3.4, 0.22, 'bandpass', 300, 1.2, 0.4, 1.2); air.frequency.setValueAtTime(300, t); air.frequency.exponentialRampToValueAtTime(2600, t + 3.2);
    return 3.8;
  },
  powerDown(k, t) {   // remade (owner, 2026-11-27): the turbine running down, the air dying away, a last clunk
    const w = tone(k, 'triangle', 900, t, 3, 0.15, 0.4, 0.05, 0.6); w.frequency.setValueAtTime(900, t); w.frequency.exponentialRampToValueAtTime(45, t + 2.8);
    const gr = k.osc('square', 110), lp = k.filter('lowpass', 900, 2), gg = k.gain(); gr.connect(lp); lp.connect(gg); k.hold(gg, t, 0.1, 0.05, 2, 0.7); k.send(gg, 0.2);
    gr.frequency.setValueAtTime(110, t); gr.frequency.exponentialRampToValueAtTime(28, t + 2.6); lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(120, t + 2.6); gr.start(t); gr.stop(t + 3);
    const air = hiss(k, t, 2.6, 0.2, 'bandpass', 2600, 1.2, 0.4, 0.05); air.frequency.setValueAtTime(2600, t); air.frequency.exponentialRampToValueAtTime(250, t + 2.5);
    thud(k, t + 2.8, 120, 50, 0.3, 0.4);
    return 3.4;
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
  distantExplosion(k, t) {   // heavier (owner, 2026-11-27): a deep boom, the pressure wave hitting the hull, a long rolling rumble
    k.echo(0.55, 0.5);
    thud(k, t, 75, 20, 3, 1.0); thud(k, t + 0.12, 110, 35, 1.2, 0.5);
    hiss(k, t, 0.3, 0.5, 'lowpass', 1400, 0.7, 0.4, 0.002);
    const fl = hiss(k, t, 4, 0.55, 'lowpass', 600, 0.9, 0.8, 0.03); fl.frequency.exponentialRampToValueAtTime(70, t + 3.8);
    thud(k, t + 0.6, 60, 30, 0.8, 0.45);   // the pressure wave reaches the hull
    return 5;
  },
  // interface: the same sounds audio.js always played, straight to the output
  commChirp(k, t) { blip(k, 1100, 1900, t, 0.11); blip(k, 1400, 2300, t + 0.14, 0.14); blip(k, 1500, 2400, t + 0.34, 0.09, 0.3); return 0.5; },
  mailOpen(k, t) { for (let i = 0; i < 4; i++) { const f = 320 + i * 260; blip(k, f, f * 1.15, t + i * 0.06, 0.07, 0.2, 'square'); } blip(k, 1500, 1900, t + 0.25, 0.09, 0.18, 'triangle'); return 0.4; },
  mailClose(k, t) { for (let i = 0; i < 4; i++) { const f = 1100 - i * 260; blip(k, f, f * 1.15, t + i * 0.06, 0.07, 0.2, 'square'); } blip(k, 220, 160, t + 0.25, 0.09, 0.18, 'triangle'); return 0.4; },
  actionTick(k, t) { blip(k, 300, 240, t, 0.07, 0.22, 'square'); return 0.1; },
  noticePing(k, t) { blip(k, 880, 1320, t, 0.18, 0.28, 'triangle'); return 0.25; },
  dataUp(k, t) { for (let i = 0; i < 16; i++) { const f = 1000 + i * 130; blip(k, f, f * 1.12, t + i * 0.032, 0.026, 0.1, 'square'); } return 0.6; },
  dataDown(k, t) { for (let i = 0; i < 16; i++) { const f = 2600 - i * 110; blip(k, f, f * 1.12, t + i * 0.032, 0.026, 0.1, 'square'); } return 0.6; },
  dataDone(k, t) { blip(k, 900, 1000, t, 0.1, 0.25, 'triangle'); blip(k, 1200, 1300, t + 0.12, 0.1, 0.25, 'triangle'); blip(k, 1600, 1700, t + 0.24, 0.16, 0.25, 'triangle'); return 0.45; },
  dataFail(k, t) { blip(k, 600, 500, t, 0.14, 0.25, 'triangle'); blip(k, 420, 330, t + 0.17, 0.2, 0.25, 'triangle'); return 0.4; },
};

// ---------- loops: (k) -> stop() ----------
const LOOPS = {
  hullFlow(k) {   // was 'Ventilation fan'; the owner heard it as water past the hull (2026-11-27). The game sets its volume by speed (audio.js)
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
  bayFlood(k) {   // water pouring into the bay, for as long as the game holds it
    const ctx = k.ctx, src = [];
    const n = k.noise(), lp = k.filter('lowpass', 700, 0.8), g = k.gain(0.35); n.connect(lp); lp.connect(g); k.send(g, 0.3); n.start(); src.push(n);
    const n2 = k.noise(), bp = k.filter('bandpass', 1400, 1.2), g2 = k.gain(0.08); n2.connect(bp); bp.connect(g2); k.send(g2, 0.2); n2.start(); src.push(n2);
    const lfo = k.osc('sine', 0.23), ld = k.gain(250); lfo.connect(ld); ld.connect(lp.frequency); lfo.start(); src.push(lfo);   // the pour surges
    let t = ctx.currentTime + 0.2, live = true;
    const glug = () => { if (!live) return; while (t < (k.offline ? 8 : ctx.currentTime + 2)) { const f = 150 + Math.random() * 250, o = tone(k, 'sine', f, t, 0.08, 0.07, 0.5); o.frequency.exponentialRampToValueAtTime(f * 2.4, t + 0.08); if (Math.random() < 0.12) thud(k, t, 70, 40, 0.6, 0.15); t += 0.09 + Math.random() * 0.25; } if (!k.offline) setTimeout(glug, 1000); };   // gurgles, now and then the hull taking the weight
    glug();
    return () => { live = false; for (const x of src) x.stop(); };
  },
  bayPump(k) {   // the pumps clearing the bay and air hissing back in
    const ctx = k.ctx, src = [];
    const n = k.noise(), lp = k.filter('lowpass', 450, 0.8), g = k.gain(0.22); n.connect(lp); lp.connect(g); k.send(g, 0.2); n.start(); src.push(n);
    const a = k.noise(), hp = k.filter('highpass', 3000, 0.7), ag = k.gain(0.05); a.connect(hp); hp.connect(ag); k.send(ag, 0.1); a.start(); src.push(a);
    const m = k.osc('sawtooth', 47), ml = k.filter('lowpass', 260, 1), mg = k.gain(0.06); m.connect(ml); ml.connect(mg); k.send(mg, 0); m.start(); src.push(m);
    let t = ctx.currentTime + 0.1, live = true;
    const beat = () => { if (!live) return; while (t < (k.offline ? 8 : ctx.currentTime + 2)) { thud(k, t, 120, 55, 0.3, 0.3); const f = 500 - Math.random() * 200, o = tone(k, 'sine', f, t + 0.3, 0.1, 0.05, 0.5); o.frequency.exponentialRampToValueAtTime(f * 0.4, t + 0.4); t += 0.7; } if (!k.offline) setTimeout(beat, 1000); };   // pump strokes, water sucked away
    beat();
    return () => { live = false; for (const x of src) x.stop(); };
  },
  radioStatic(k) {
    const ctx = k.ctx, n = k.noise(), bp = k.filter('bandpass', 1800, 0.6), g = k.gain(0.12); n.connect(bp); bp.connect(g); k.send(g, 0); n.start();
    let live = true; const crackle = () => { if (!live) return; const t = ctx.currentTime + Math.random() * 0.3; hiss(k, t, 0.02 + Math.random() * 0.04, 0.2, 'highpass', 4000, 0.7, 0, 0.001); setTimeout(crackle, 80 + Math.random() * 250); };
    if (k.offline) { for (let t = 0.1; t < 8; t += 0.08 + Math.random() * 0.25) hiss(k, t, 0.02 + Math.random() * 0.04, 0.2, 'highpass', 4000, 0.7, 0, 0.001); } else crackle();
    return () => { live = false; n.stop(); };
  },
  shipHum(k) {   // as audio.js makes the ship's hum (two low saws a little apart, through a low-pass), for the sound board
    const lp = k.filter('lowpass', 420, 0.7), g = k.gain(0.12), src = []; lp.connect(g); k.send(g, 0);
    for (const f of [110, 110.8, 165.3, 220.5]) { const o = k.osc('sawtooth', f); o.connect(lp); o.start(); src.push(o); }
    return () => { for (const o of src) o.stop(); };
  },
  ventilation(k) {   // as audio.js makes the room air (the Ambient slider)
    const n = k.noise(), bp = k.filter('bandpass', 420, 0.4), g = k.gain(0.3); n.connect(bp); bp.connect(g); k.send(g, 0); n.start();
    return () => n.stop();
  },
  reactorHum(k) {
    const o1 = k.osc('triangle', 55), o2 = k.osc('sine', 110.4), g = k.gain(0.12), lfo = k.osc('sine', 0.7), ld = k.gain(0.05);
    lfo.connect(ld); ld.connect(g.gain); o1.connect(g); o2.connect(g); k.send(g, 0.2); o1.start(); o2.start(); lfo.start();
    return () => { for (const s of [o1, o2, lfo]) s.stop(); };
  },
};

// level of each sound so they sit together in the game (from rendered peaks, 2026-11-27): alarms and crashes loud, interface ticks soft, loops low
const LEVEL = {"generalAlarm": 1.25, "fireAlarm": 2.69, "collisionAlarm": 3.18, "depthAlarm": 1.15, "sonarPing": 1.17, "sonarContact": 2.27, "sonarLost": 2.5, "impact": 3, "crash": 3, "hullCreak": 1.6, "torpedoLaunch": 0.5, "doorOpen": 0.8, "doorClose": 0.73, "dockBump": 2, "dockClamps": 1.6, "clampRelease": 1.2, "shorePower": 1.0, "hatchOpen": 1.0, "hatchClose": 1.0, "bayFlood": 0.9, "bayPump": 1.0, "airlockFlood": 1.67, "airlockDrain": 1.84, "ballastBlow": 0.56, "radioSquelch": 1.18, "radioBeep": 1.36, "powerUp": 1.3, "powerDown": 1.3, "cruiseEngage": 0.86, "bubbles": 2.86, "splash": 1.0, "buttonPress": 1.8, "buttonError": 1.54, "teletype": 2.14, "distantExplosion": 2.5, "hullFlow": 0.92, "shipHum": 0.6, "ventilation": 0.8, "engineRoom": 0.71, "radioStatic": 0.56, "reactorHum": 0.56};
const DRIVE = { impact: 5, crash: 5, distantExplosion: 4, dockClamps: 3, dockBump: 3 };   // soft saturation for the heavy hits (see kit)
/** Play a one-shot. Returns its length in seconds (0 if the name is unknown). */
export function playSfx(ctx, out, name, { t = ctx.currentTime + 0.02, vol = 1 } = {}) {
  const f = SHOTS[name]; if (!f || !ctx || !out) return 0;
  const k = kit(ctx, out, vol * (LEVEL[name] || 1), DRIVE[name] || 0); return f(k, t);
}
/** Start a loop. Returns { stop() } (fades out). */
export function loopSfx(ctx, out, name, { vol = 1 } = {}) {
  const f = LOOPS[name]; if (!f || !ctx || !out) return { stop() {} };
  const k = kit(ctx, out, 0.0001); k.bus.gain.linearRampToValueAtTime(vol * (LEVEL[name] || 1), ctx.currentTime + 1.2);
  const end = f(k); let stopped = false;
  return { setVol(v) { if (!stopped) k.bus.gain.setTargetAtTime(Math.max(0.0001, v * (LEVEL[name] || 1)), ctx.currentTime, 0.5); },   // the game moves a loop's level (hull flow with speed)
    stop() { if (stopped) return; stopped = true; k.bus.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.4); setTimeout(() => { try { end(); } catch (e) { /* gone */ } k.bus.disconnect(); }, 2000); } };
}
export const isLoop = (name) => name in LOOPS;
