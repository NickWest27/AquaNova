// "Beneath the Waves": the Aqua Nova's main title (an original piece, 2026-11-27). 90s 16-bit style, made with Web Audio:
// a two-oscillator brass lead with delayed vibrato, string pads, a harp arpeggio, triangle bass, timpani, cymbal and a sonar ping,
// all through an SNES-style echo. No sound file: the notes are scheduled here, so it costs nothing to download.
// scheduleTheme(ctx, out, t0) puts the whole piece on any AudioContext (live or offline, to render a WAV) and returns its length in seconds.
const BPM = 76, B = 60 / BPM;   // seconds per beat
const N = (name) => {   // 'D4' -> Hz
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name); const s = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return 440 * Math.pow(2, (s + (Number(m[3]) + 1) * 12 - 69) / 12);
};
// melody: [note, beats] ('-' = rest). Four bars of 4/4 per line.
const THEME_A = [
  ['D4', 2], ['A4', 2], ['G4', 1.5], ['F4', 0.5], ['E4', 1], ['F4', 1], ['D4', 1], ['F4', 1], ['A4', 1], ['D5', 1], ['C5', 3], ['A4', 1],
  ['Bb4', 2], ['A4', 1], ['G4', 1], ['F4', 1.5], ['G4', 0.5], ['A4', 2], ['G4', 1], ['F4', 1], ['E4', 1], ['C4', 1], ['D4', 4],
];
const THEME_B = [
  ['A4', 1], ['C5', 1], ['F5', 2], ['E5', 1.5], ['D5', 0.5], ['C5', 2], ['D5', 1], ['C5', 1], ['A4', 2], ['Bb4', 1], ['D5', 1], ['F5', 2],
  ['F5', 1], ['E5', 1], ['D5', 1], ['C5', 1], ['C5', 2], ['G4', 2], ['Bb4', 1], ['C5', 1], ['D5', 1], ['F5', 1], ['E5', 4],
];
// one chord per bar: root for the bass, then the chord tones for pads and harp
const CH = {
  Dm: ['D2', 'D3', 'F3', 'A3'], Gm: ['G2', 'G3', 'Bb3', 'D4'], F: ['F2', 'F3', 'A3', 'C4'], Bb: ['Bb1', 'Bb2', 'D3', 'F3'], C: ['C2', 'C3', 'E3', 'G3'],
  A: ['A1', 'A2', 'C#3', 'E3'], Dmaj: ['D2', 'D3', 'F#3', 'A3'], Dm9: ['D2', 'D3', 'F3', 'A3', 'E4'],
};
const CHORDS_A = ['Dm', 'Gm', 'Dm', 'F', 'Bb', 'F', 'C', 'Dm'];
const CHORDS_B = ['F', 'C', 'Dm', 'Bb', 'F', 'C', 'Bb', 'A'];

export function scheduleTheme(ctx, out, t0 = ctx.currentTime + 0.1) {
  // ---- the mix: dry bus + SNES-like echo (delay with a darkened feedback) ----
  const bus = ctx.createGain(); bus.gain.value = 0.9; bus.connect(out);
  const echoIn = ctx.createGain(); echoIn.gain.value = 0.28;
  const dly = ctx.createDelay(1); dly.delayTime.value = B * 0.75;
  const fb = ctx.createGain(); fb.gain.value = 0.38;
  const dark = ctx.createBiquadFilter(); dark.type = 'lowpass'; dark.frequency.value = 2200;
  echoIn.connect(dly); dly.connect(dark); dark.connect(fb); fb.connect(dly); dark.connect(bus);
  const send = (node, wet = 1) => { node.connect(bus); if (wet) { const g = ctx.createGain(); g.gain.value = wet; node.connect(g); g.connect(echoIn); } };
  let noiseBuf = null; const noise = () => { if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; } const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; return s; };
  const env = (g, t, a, d, s, r, dur, peak) => { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.linearRampToValueAtTime(peak * s, t + a + d); g.gain.setValueAtTime(peak * s, t + Math.max(a + d, dur)); g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(a + d, dur) + r); };

  // ---- instruments ----
  function lead(f, t, dur, vol = 0.11, oct = 1) {   // brass: two squares a little apart, low-passed, vibrato that comes in late
    const g = ctx.createGain(), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, t); lp.frequency.linearRampToValueAtTime(2600, t + 0.12); lp.Q.value = 2;
    const vib = ctx.createOscillator(), vd = ctx.createGain(); vib.frequency.value = 5.5; vd.gain.setValueAtTime(0, t); vd.gain.linearRampToValueAtTime(f * oct * 0.006, t + Math.min(0.6, dur)); vib.connect(vd);
    for (const det of [-6, 6]) { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f * oct; o.detune.value = det; vd.connect(o.frequency); o.connect(lp); o.start(t); o.stop(t + dur + 0.4); }
    vib.start(t); vib.stop(t + dur + 0.4); lp.connect(g); env(g, t, 0.05, 0.15, 0.75, 0.25, dur, vol); send(g, 0.9);
  }
  function pad(fs, t, dur, vol = 0.035) {   // strings: soft saws, slow swell
    const g = ctx.createGain(), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1300;
    for (const f of fs) for (const det of [-8, 8]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det; o.connect(lp); o.start(t); o.stop(t + dur + 0.8); }
    lp.connect(g); env(g, t, 0.45, 0.3, 0.85, 0.7, dur, vol); send(g, 0.5);
  }
  function harp(f, t, vol = 0.045) {   // plucked pulse
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'square'; o.frequency.value = f;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(3000, t); lp.frequency.exponentialRampToValueAtTime(600, t + 0.3);
    o.connect(lp); lp.connect(g); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55); o.start(t); o.stop(t + 0.6); send(g, 1);
  }
  function bass(f, t, dur, vol = 0.16) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'triangle'; o.frequency.value = f; o.connect(g); env(g, t, 0.02, 0.2, 0.8, 0.15, dur, vol); o.start(t); o.stop(t + dur + 0.3); send(g, 0); }
  function timp(t, vol = 0.32, f0 = 98) {   // timpani: a falling sine and a breath of noise
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(f0 * 1.6, t); o.frequency.exponentialRampToValueAtTime(f0, t + 0.08);
    o.connect(g); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1); o.start(t); o.stop(t + 1.2); send(g, 0.3);
    const n = noise(), ng = ctx.createGain(), nl = ctx.createBiquadFilter(); nl.type = 'lowpass'; nl.frequency.value = 500; n.connect(nl); nl.connect(ng); ng.gain.setValueAtTime(vol * 0.4, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.25); n.start(t); n.stop(t + 0.3); send(ng, 0);
  }
  function cymbal(t, vol = 0.09, len = 2.2) { const n = noise(), g = ctx.createGain(), hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 5000; n.connect(hp); hp.connect(g); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len); n.start(t); n.stop(t + len + 0.1); send(g, 0.4); }
  function roll(t, beats, vol = 0.06) { const n = noise(), g = ctx.createGain(), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.8; n.connect(bp); bp.connect(g); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + beats * B); g.gain.exponentialRampToValueAtTime(0.0001, t + beats * B + 0.15); n.start(t); n.stop(t + beats * B + 0.2); send(g, 0.2); }
  function sonar(t, vol = 0.07) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = 1180; o.connect(g); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4); o.start(t); o.stop(t + 1.5); send(g, 1.6); }

  // ---- arrangement ----
  let t = t0; const bar = 4 * B;
  const harpBar = (ch, tb, vol) => { const c = CH[ch].slice(1).map(N), up = [...c, ...c.map((f) => f * 2)]; for (let i = 0; i < 8; i++) harp(up[[0, 1, 2, 3, 4, 3, 2, 1][i]], tb + i * B / 2, vol); };
  const backing = (chords, t1, { arp = true, padVol = 0.035, timpani = true, harpVol = 0.045 } = {}) => chords.forEach((ch, i) => {
    const tb = t1 + i * bar, c = CH[ch];
    bass(N(c[0]), tb, 2 * B - 0.05); bass(N(c[0]) * (i % 2 ? 1.5 : 1), tb + 2 * B, 2 * B - 0.05);
    pad(c.slice(1).map(N), tb, bar - 0.1, padVol);
    if (arp) harpBar(ch, tb, harpVol);
    if (timpani) timp(tb, 0.28, N(c[0]) * 2 > 120 ? N(c[0]) : N(c[0]) * 2);
  });
  const melody = (notes, t1, vol, oct = 1, harmony = 0) => { let tm = t1; for (const [n, beats] of notes) { if (n !== '-') { lead(N(n), tm, beats * B - 0.06, vol, oct); if (harmony) lead(N(n) * Math.pow(2, harmony / 12), tm, beats * B - 0.06, vol * 0.45, oct); } tm += beats * B; } };

  // 1. the deep: a low pad, sonar pings, the harp coming up out of the dark (4 bars)
  pad(CH.Dm9.slice(1).map(N), t, 4 * bar - 0.2, 0.03); bass(N('D2'), t, 4 * bar - 0.2, 0.12);
  for (let i = 0; i < 4; i++) { sonar(t + i * bar); if (i >= 2) harpBar('Dm9', t + i * bar, 0.02 + i * 0.008); }
  roll(t + 3 * bar + 2 * B, 2, 0.05);
  t += 4 * bar;
  // 2. the theme (8 bars)
  backing(CHORDS_A, t); melody(THEME_A, t, 0.1); cymbal(t, 0.07);
  t += 8 * bar;
  // 3. the lift into F major, a little bolder (8 bars), a roll into the climax
  backing(CHORDS_B, t, { harpVol: 0.05, padVol: 0.04 }); melody(THEME_B, t, 0.105, 1, -4);
  roll(t + 7 * bar, 4, 0.08); timp(t + 7 * bar + 2 * B, 0.3); timp(t + 7 * bar + 3 * B, 0.34);
  t += 8 * bar;
  // 4. the climax: the theme an octave up with a harmony, full kit (8 bars)
  backing(CHORDS_A.slice(0, 7).concat(['Dmaj']), t, { harpVol: 0.055, padVol: 0.045 }); cymbal(t, 0.11, 3);
  melody(THEME_A.slice(0, -1).concat([['F#4', 4]]), t, 0.11, 2, -5);   // ends on F# (D major): the picardy lift
  for (let i = 0; i < 8; i++) if (i % 2) timp(t + i * bar + 2 * B, 0.2);
  t += 8 * bar;
  // 5. the end: D major held, one last ping, the cymbal swells away
  pad(CH.Dmaj.slice(1).map(N).concat([N('D4'), N('A4')]), t, 2 * bar, 0.05); bass(N('D2'), t, 2 * bar, 0.15); timp(t, 0.36, 73.4); cymbal(t, 0.1, 4);
  lead(N('D5'), t, 2 * bar - 0.1, 0.09); lead(N('A4'), t, 2 * bar - 0.1, 0.05); sonar(t + bar, 0.05);
  t += 2 * bar + 2;
  return t - t0;
}

// ---- in the game ----
let playing = null;
/** Play the main title through the game's sound (see audio.js). Returns false when sound is not running yet. */
export function playTheme(ctx, out) {
  if (!ctx || !out) return false;
  stopTheme();
  const g = ctx.createGain(); g.gain.value = 1; g.connect(out);
  const len = scheduleTheme(ctx, g);
  playing = { g, until: ctx.currentTime + len };
  return true;
}
export function stopTheme() { if (playing) { try { playing.g.gain.setTargetAtTime(0, playing.g.context.currentTime, 0.4); const g = playing.g; setTimeout(() => g.disconnect(), 2500); } catch (e) { /* already gone */ } playing = null; } }
export const themePlaying = () => !!playing && playing.g.context.currentTime < playing.until;
