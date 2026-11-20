// Analysis instrument screens for the science lab, drawn on a canvas in the style of the show's lab displays.
// drawScreen(canvas, labId, sample, p, t): sample is null for standby; p is 0..1 progress; t is seconds for animation.
// Everything is seeded from the sample, so the same sample always gives the same trace, bars and sequence.
const W = 960, H = 300;
const LBL = '#4aa3bb', BG = '#021218', CY = '#52e5ff', DIM = '#0f4a5c', GRID = '#0a2f3b', AMB = '#ffc857', GRN = '#6ee7a1', RED = '#ff7a7a';
const FONT = (n, w = '') => `${w} ${n}px "SF Mono", Menlo, Consolas, monospace`;
const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const seedOf = (q) => { let h = q.id * 7919; for (const c of `${q.kind}${q.site}`) h = (h * 31 + c.charCodeAt(0)) | 0; return h; };

/** Elements for the material table, by sample kind. Weights are seeded, then normalised to 100%. */
const ELEMENTS = {
  sediment: [['Si', 'Silicon'], ['Al', 'Aluminium'], ['Fe', 'Iron'], ['Ca', 'Calcium'], ['K', 'Potassium'], ['Mg', 'Magnesium'], ['Na', 'Sodium'], ['Ti', 'Titanium']],
  rock: [['Si', 'Silicon'], ['Fe', 'Iron'], ['Mg', 'Magnesium'], ['Ca', 'Calcium'], ['Al', 'Aluminium'], ['Mn', 'Manganese'], ['Ni', 'Nickel'], ['Cr', 'Chromium']],
};
export function composition(q) {
  const r = rng(seedOf(q)), list = ELEMENTS[q.kind] || ELEMENTS.sediment;
  const raw = list.map((_, i) => (list.length - i) * (0.5 + r()));
  const sum = raw.reduce((a, b) => a + b, 0);
  return list.map(([sym, name], i) => ({ sym, name, pct: Math.round((raw[i] / sum) * 1000) / 10 }));
}
const PEAKS = {
  water: [['O2', 0.18], ['CO2', 0.34], ['Mg', 0.48], ['Na', 0.62], ['H2S', 0.78], ['CH4', 0.88]],
  magnetic: [['Bx', 0.2], ['By', 0.4], ['Bz', 0.6], ['Bt', 0.8]],
};
const BASES = 'ACGT', BASECOL = { A: RED, C: GRN, G: CY, T: AMB };

function frame(g, title, status, tone) {
  g.fillStyle = BG; g.fillRect(0, 0, W, H);
  g.strokeStyle = GRID; g.lineWidth = 1;
  for (let x = 0; x <= W; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let y = 0; y <= H; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  g.strokeStyle = CY; g.lineWidth = 2; g.strokeRect(4, 4, W - 8, H - 8);
  g.fillStyle = CY; g.font = FONT(17, 'bold'); g.textAlign = 'left'; g.fillText(title, 20, 30);
  g.fillStyle = tone; g.textAlign = 'right'; g.fillText(status, W - 20, 30); g.textAlign = 'left';
}
const statusOf = (q, p) => (!q ? ['STANDBY', DIM] : p >= 1 ? ['COMPLETE', GRN] : [`ANALYSING ${Math.floor(p * 100)}%`, AMB]);
const titleOf = (name, q, kinds) => (q ? `${name} · SAMPLE #${q.id} ${kinds[q.kind].toUpperCase()} · ${String(q.site).toUpperCase()}` : name);

function standby(g, t) {
  g.fillStyle = DIM; g.font = FONT(26, 'bold'); g.textAlign = 'center'; g.fillText('NO SAMPLE LOADED', W / 2, H / 2 - 4);
  g.font = FONT(15); g.fillText('Load a sample from the Samples tab', W / 2, H / 2 + 26); g.textAlign = 'left';
  g.strokeStyle = DIM; g.lineWidth = 2; g.beginPath(); for (let x = 20; x < W - 20; x += 4) { const y = H - 40 + Math.sin(x / 30 + t) * 3; x === 20 ? g.moveTo(x, y) : g.lineTo(x, y); } g.stroke();
}

function material(g, q, p, t) {
  const comp = composition(q), r = rng(seedOf(q) ^ 0x51ed), live = p < 1;
  // spectrum bars: 44 bars with seeded peaks; they rise and settle as the analysis completes
  const N = 44, bx = 24, bw = 10, gap = 1.6, base = H - 30, top = 60, peaks = [3, 11, 19, 27, 36].map((c) => [c + Math.floor(r() * 3), 0.5 + r() * 0.5]);
  const target = Array.from({ length: N }, (_, i) => { let v = 0.08 + r() * 0.12; for (const [c, h] of peaks) v += h * Math.exp(-((i - c) ** 2) / 3); return Math.min(1, v); });
  const grow = Math.min(1, p * 1.25 + 0.04);
  for (let i = 0; i < N; i++) {
    const jitter = live ? 0.82 + 0.18 * Math.sin(t * 5 + i * 1.7) : 1, h = (base - top) * target[i] * grow * jitter;
    g.fillStyle = target[i] > 0.6 ? AMB : CY; g.fillRect(bx + i * (bw + gap), base - h, bw, h);
  }
  g.fillStyle = LBL; g.font = FONT(13); g.fillText('SPECTRUM', bx, base + 18); g.fillText('ENERGY →', bx + 330, base + 18);
  // element table
  const x0 = 560, rowH = 27, y0 = 62;
  g.fillStyle = LBL; g.fillText('EL', x0, y0 - 8); g.fillText('ELEMENT', x0 + 44, y0 - 8); g.textAlign = 'right'; g.fillText('%', x0 + 372, y0 - 8); g.textAlign = 'left';
  comp.forEach((e, i) => {
    const y = y0 + i * rowH, shown = Math.max(0, Math.min(1, p * 1.15 * comp.length - i)), fin = shown >= 1;
    g.fillStyle = fin ? CY : DIM; g.font = FONT(17, 'bold'); g.fillText(e.sym, x0, y + 16);
    g.font = FONT(14); g.fillStyle = fin ? '#bfefff' : DIM; g.fillText(e.name, x0 + 44, y + 16);
    g.fillStyle = GRID; g.fillRect(x0 + 160, y + 4, 150, 14);
    g.fillStyle = e.pct > 20 ? AMB : CY; g.fillRect(x0 + 160, y + 4, 150 * Math.min(1, e.pct / 40) * shown, 14);
    g.textAlign = 'right'; g.fillStyle = fin ? '#fff' : DIM;
    const val = fin ? e.pct : shown > 0 ? e.pct * shown * (0.9 + 0.2 * Math.abs(Math.sin(t * 7 + i))) : null;
    g.fillText(val == null ? '--' : val.toFixed(1), x0 + 372, y + 16); g.textAlign = 'left';
  });
}

function spectral(g, q, p, t) {
  const r = rng(seedOf(q) ^ 0x7a11), peaks = PEAKS[q.kind] || PEAKS.water, live = p < 1;
  const x0 = 40, x1 = W - 40, yb = H - 44, yt = 62, cur = x0 + (x1 - x0) * Math.min(1, p);
  const tall = peaks.map(() => 0.3 + r() * 0.7);
  const f = (x) => { const u = (x - x0) / (x1 - x0); let v = 0.06 + 0.03 * Math.sin(u * 40); peaks.forEach(([, c], i) => { v += tall[i] * Math.exp(-((u - c) ** 2) / 0.0007); }); return v; };
  g.strokeStyle = DIM; g.beginPath(); g.moveTo(x0, yb); g.lineTo(x1, yb); g.stroke();
  g.fillStyle = LBL; g.font = FONT(13); for (let i = 0; i <= 8; i++) { const x = x0 + ((x1 - x0) * i) / 8; g.fillRect(x, yb, 1, 6); g.fillText(`${400 + i * 50}`, x - 12, yb + 22); }
  g.fillText('WAVELENGTH nm', x1 - 112, yb + 40);
  // the scan: trace is clean behind the cursor and noisy ahead of it
  g.strokeStyle = CY; g.lineWidth = 2; g.beginPath();
  for (let x = x0; x <= x1; x += 2) { const n = x > cur ? (r() - 0.5) * 0.05 + 0.02 : 0, y = yb - (yb - yt) * Math.min(1, f(x) + n); x === x0 ? g.moveTo(x, y) : g.lineTo(x, y); }
  g.stroke();
  peaks.forEach(([name, c], i) => { const x = x0 + (x1 - x0) * c; if (x < cur - 6) { g.fillStyle = AMB; g.font = FONT(14, 'bold'); g.textAlign = 'center'; g.fillText(name, x, yb - (yb - yt) * Math.min(1, f(x)) - 8); g.textAlign = 'left'; } });
  if (live) { g.strokeStyle = AMB; g.lineWidth = 1; g.setLineDash([5, 4]); g.beginPath(); g.moveTo(cur, yt - 10); g.lineTo(cur, yb); g.stroke(); g.setLineDash([]); }
}

function gene(g, q, p, t) {
  const r = rng(seedOf(q) ^ 0x6e6e), live = p < 1;
  const seq = Array.from({ length: 400 }, () => BASES[Math.floor(r() * 4)]);
  const total = 30000, done = Math.floor(total * p), x0 = 24, x1 = W - 24, cy = 128, amp = 44, pitch = 17;
  const reveal = x0 + (x1 - x0) * p;
  // double helix: two sine strands with a rung per step, coloured by base; bright where the read has reached
  const scroll = live ? t * 40 : 0;
  for (let x = x0; x < x1; x += pitch) {
    const k = Math.floor((x + scroll) / pitch), ph = (x + scroll) / 26, y1 = cy + Math.sin(ph) * amp, y2 = cy - Math.sin(ph) * amp, b = seq[((k % 400) + 400) % 400], on = x <= reveal;
    g.globalAlpha = on ? 1 : 0.28; g.strokeStyle = BASECOL[b]; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y1); g.lineTo(x, y2); g.stroke();
    g.fillStyle = CY; g.beginPath(); g.arc(x, y1, 3, 0, 7); g.arc(x, y2, 3, 0, 7); g.fill();
  }
  g.globalAlpha = 1;
  // the read-out line
  const start = Math.floor(done / 40) % 360; g.font = FONT(18, 'bold'); let sx = 24;
  for (let i = 0; i < 40; i++) { const b = seq[(start + i) % 400]; g.fillStyle = i / 40 <= p + 0.02 || !live ? BASECOL[b] : DIM; g.fillText(b, sx, 206); sx += 23; }
  g.font = FONT(14); g.fillStyle = LBL; g.fillText(`BASE PAIRS ${done.toLocaleString()} / ${total.toLocaleString()}`, 24, 232);
  const c = [0, 0, 0, 0]; seq.slice(0, Math.max(1, Math.floor(400 * p))).forEach((b) => { c[BASES.indexOf(b)]++; });
  const sum = c.reduce((a, b) => a + b, 0) || 1; g.fillText(`GC ${Math.round(((c[1] + c[2]) / sum) * 100)}%`, 300, 232);
  // bio monitor: a heartbeat-style activity trace of the sample
  g.fillStyle = LBL; g.fillText('BIO MONITOR', 24, 262);
  g.strokeStyle = GRN; g.lineWidth = 2; g.beginPath();
  for (let x = 140; x < x1; x += 3) { const u = ((x + (live ? t * 90 : 0)) % 150) / 150, y = 258 - (u > 0.42 && u < 0.46 ? 22 : u > 0.46 && u < 0.5 ? -8 : u > 0.62 && u < 0.7 ? 6 : 0) + Math.sin(x / 9) * 1.5; x === 140 ? g.moveTo(x, y) : g.lineTo(x, y); }
  g.stroke();
}

const DRAW = { material, spectral, gene };
const NAMES = { material: 'MATERIAL ANALYSIS', spectral: 'SPECTRAL ANALYSIS', gene: 'GENE SEQUENCING' };
export function drawScreen(canvas, labId, sample, p, t, kinds) {
  if (canvas.width !== W) { canvas.width = W; canvas.height = H; }
  const g = canvas.getContext('2d'), [st, tone] = statusOf(sample, p);
  frame(g, titleOf(NAMES[labId], sample, kinds), st, tone);
  if (!sample) standby(g, t); else DRAW[labId](g, sample, p, t);
}
