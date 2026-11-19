// Comms console, Links page: four numbered links with NORPAC network and laser codes, signal readout,
// satellite / shore-station data column, band table (ELF to laser), spectrum display and a world map.
// Everything is worked out from the ship's depth, position and clock. The ship must have its antenna
// near the surface for most links; only the low bands reach deeper.
import { sim } from '../sim.js';
import { el } from '../util.js';
import { LINKS, BANDS, linkState, antDepth, cm, SOURCES } from '../commsModel.js';

const rad = Math.PI / 180;
const pad = (n, w) => String(Math.round(n)).padStart(w, '0');
const deg = (b) => `${pad(Math.floor(b), 3)}.${pad((b % 1) * 60, 2)}`;
const ll = (p) => `${Math.abs(p.lat).toFixed(2)}${p.lat >= 0 ? 'N' : 'S'} ${Math.abs(p.lon).toFixed(2)}${p.lon >= 0 ? 'E' : 'W'}`;
const km = (n) => `${Math.round(n).toLocaleString('en-US')} KM`;
export { LINKS, BANDS, linkState };

// ---- map: a small blocky world, drawn once ----
const LAND = [
  [[-168, 66], [-141, 70], [-110, 73], [-95, 72], [-80, 73], [-62, 66], [-55, 52], [-66, 45], [-70, 41], [-76, 35], [-81, 25], [-97, 26], [-97, 19], [-87, 21], [-83, 10], [-78, 8], [-90, 14], [-105, 20], [-117, 32], [-124, 40], [-125, 49], [-140, 59], [-152, 60], [-165, 55]],
  [[-73, 78], [-20, 82], [-20, 70], [-43, 60], [-55, 68]],
  [[-78, 8], [-60, 10], [-50, 0], [-35, -6], [-40, -22], [-58, -38], [-66, -55], [-74, -50], [-72, -30], [-81, -5]],
  [[-10, 36], [-9, 43], [0, 50], [10, 55], [25, 70], [60, 70], [100, 78], [140, 72], [180, 68], [170, 60], [140, 52], [142, 40], [122, 30], [110, 20], [105, 10], [98, 16], [80, 8], [72, 20], [57, 25], [50, 12], [35, 30], [28, 36], [10, 38]],
  [[-17, 21], [-10, 35], [10, 37], [32, 31], [43, 12], [51, 11], [40, -15], [32, -28], [20, -35], [12, -18], [9, 4], [-8, 5], [-17, 14]],
  [[114, -22], [130, -12], [142, -11], [153, -27], [146, -39], [130, -32], [115, -34]],
  [[-180, -72], [180, -72], [180, -90], [-180, -90]],
];
const MW = 192, MH = 96;
const mx = (lon) => (lon + 180) / 360 * MW, my = (lat) => (90 - lat) / 180 * MH;
let landLayer = null;
function land() {
  if (landLayer) return landLayer;
  landLayer = document.createElement('canvas'); landLayer.width = MW; landLayer.height = MH;
  const c = landLayer.getContext('2d'); c.fillStyle = '#2f78c4';
  for (const poly of LAND) { c.beginPath(); poly.forEach(([lo, la], i) => (i ? c.lineTo(mx(lo), my(la)) : c.moveTo(mx(lo), my(la)))); c.closePath(); c.fill(); }
  return landLayer;
}

export function mount(host) {
  let sel = 1;
  const cards = LINKS.map((L) => {
    const f = {};
    const c = el('button', { class: 'cl-card', onclick: () => { sel = L.n; update(); } },
      el('div', { class: 'cl-tag', text: `LINK ${L.n}` }), f.tx = el('div', { class: 'cl-k cl-tx' }),
      f.mc = el('div', { class: 'cl-v' }), f.st = el('div', { class: 'cl-st' }), f.net = el('div', { class: 'cl-v', text: 'NORPAC' }), f.code = el('div', { class: 'cl-v' }),
      el('div', { class: 'cl-k', text: L.label === L.band ? L.label : `${L.label} · ${L.band.replace('BLUE-GREEN', 'B-G')}` }));
    f.mc.textContent = `MCell ${L.mcell}`; f.code.textContent = L.code;
    return { L, c, f };
  });
  const sig = {}, row = (k, key) => el('div', { class: 'cl-row' }, el('span', { class: 'cl-k', text: k }), sig[key] = el('span', { class: 'cl-v' }));
  const sigPanel = el('div', { class: 'cl-panel cl-sig' }, el('div', { class: 'lbl', text: 'Signal' }),
    row('SIG STRENGTH:', 'dB'), row('EST DIST:', 'dist'), row('FREQ RANGE:', 'fr'), row('TRACKED LOCATION:', 'loc'), row('BEAR:', 'brg'), row('IDENT:', 'id'),
    sig.banner = el('div', { class: 'cl-banner' }));
  const bandRows = BANDS.map((b) => { const lamp = el('i', { class: 'lamp' }), v = el('b', { class: 'cl-v' }); return { b, lamp, v, node: el('div', { class: 'cl-band' }, lamp, el('b', { class: 'cl-bid', text: b.id }), el('span', { class: 'cl-k', text: b.fr }), el('span', { class: 'cl-k', text: b.mode }), v) }; });
  const bandPanel = el('div', { class: 'cl-panel cl-bands' }, el('div', { class: 'lbl', text: 'Bands' }), ...bandRows.map((r) => r.node));
  const sat = [], satLabel = el('div', { class: 'lbl' });
  const satRows = Array.from({ length: 12 }, () => { const k = el('span', { class: 'cl-k' }), v = el('span', { class: 'cl-v' }); sat.push([k, v]); return el('div', { class: 'cl-row' }, k, v); });
  const satPanel = el('div', { class: 'cl-panel cl-sat' }, satLabel, ...satRows);
  const spec = document.createElement('canvas'); spec.width = 560; spec.height = 150; spec.className = 'cl-canvas';
  const map = document.createElement('canvas'); map.width = MW; map.height = MH; map.className = 'cl-canvas cl-map';
  host.classList.add('cl-grid');
  host.append(...cards.map((x) => x.c), satPanel, sigPanel, bandPanel, el('div', { class: 'cl-panel cl-spec' }, spec), el('div', { class: 'cl-panel cl-mapbox' }, map));

  function drawSpec(sts) {
    const c = spec.getContext('2d'), W = spec.width, H = spec.height, N = 28, bw = W / N, t = Date.now() / 420;
    c.fillStyle = '#04101f'; c.fillRect(0, 0, W, H);
    const live = sts[sel - 1], chan = Math.min(N - 3, 1 + (sel - 1) * 7);
    for (let i = 0; i < N; i++) {
      const lit = i >= chan && i < chan + 3, base = 0.12 + 0.18 * Math.abs(Math.sin(i * 1.7 + t * 0.9)) + 0.1 * Math.abs(Math.sin(i * 0.6 - t));
      const h = (lit ? (live.up ? 0.55 + 0.4 * Math.abs(Math.sin(t * 2 + i)) : 0.15 + 0.1 * Math.abs(Math.sin(t * 2 + i))) : base) * (H - 18);
      c.fillStyle = lit ? (live.up ? '#e6e66a' : '#ff8a5c') : '#3d7fd0';
      c.fillRect(i * bw + 2, H - 14 - h, bw - 4, h);
    }
    c.fillStyle = '#6fa8ff'; c.font = '11px monospace';
    for (let i = 0; i < N; i += 2) c.fillText(String(i + 2), i * bw + 3, H - 3);
  }
  function drawMap(s, sts) {
    const c = map.getContext('2d'); c.fillStyle = '#04101f'; c.fillRect(0, 0, MW, MH);
    c.strokeStyle = 'rgba(111,168,255,0.18)'; c.lineWidth = 1;
    for (let lo = -150; lo <= 150; lo += 30) { c.beginPath(); c.moveTo(mx(lo) + .5, 0); c.lineTo(mx(lo) + .5, MH); c.stroke(); }
    for (let la = -60; la <= 60; la += 30) { c.beginPath(); c.moveTo(0, my(la) + .5); c.lineTo(MW, my(la) + .5); c.stroke(); }
    c.drawImage(land(), 0, 0);
    const me = [mx(s.lon), my(s.lat)], cur = sts[sel - 1], t = cur.tgt;
    for (const L of LINKS) { const p = L.relay || L.station, on = L.n === sel; c.fillStyle = on ? '#e6e66a' : '#b9b95a'; const x = mx(p.lon), y = my(p.lat); c.fillRect(x - 1.5, y - 1.5, 3, 3); if (on) c.strokeRect(x - 3.5 + .5, y - 3.5 + .5, 6, 6); }
    c.strokeStyle = cur.up ? '#e6e66a' : '#ff8a5c'; c.setLineDash([2, 2]); c.beginPath(); c.moveTo(...me); c.lineTo(mx(t.lon), my(t.lat)); c.stroke(); c.setLineDash([]);
    c.fillStyle = '#64ffda'; c.fillRect(me[0] - 2, me[1] - 2, 4, 4);
  }

  function update() {
    const s = sim.s, sts = LINKS.map((L) => linkState(L, s)), L = LINKS[sel - 1], st = sts[sel - 1];
    cards.forEach(({ L: l, c, f }, i) => {
      const x = sts[i]; f.st.textContent = x.status; f.st.className = 'cl-st ' + (x.up ? 'ok' : x.fading ? 'warn' : 'bad');
      c.classList.toggle('on', l.n === sel);
      f.tx.textContent = SOURCES.find((q) => q.id === cm.source).link === l.n ? '● TX SOURCE' : '';
    });
    sig.dB.textContent = st.dB == null ? '--' : `${st.dB >= 0 ? '+' : ''}${st.dB} dB`;
    sig.dist.textContent = L.relay ? km(st.dist) : `${(st.dist / 1.852).toFixed(0)} NM`;
    sig.fr.textContent = L.fr;
    sig.loc.textContent = st.tgt.name;
    sig.brg.textContent = `${pad(st.brg, 3)}° ${L.relay ? `EL ${Math.round(st.elev)}°` : ''}`;
    sig.id.textContent = L.relay ? 'OERA RELAY' : 'SHORE STATION';
    sig.banner.textContent = st.up ? 'COMMUNICATIONS LINK ESTABLISHED' : st.fading ? 'LINK FADING. RISE TO IMPROVE' : `${st.status === 'NO LOCK' ? 'NO LOCK. AIM THE ANTENNA' : `NO CARRIER. ANTENNA AT ${Math.round(st.eff)} M, NEED ${L.max} M`}`;
    sig.banner.className = 'cl-banner ' + (st.up ? 'ok' : st.fading ? 'warn' : 'bad');
    satLabel.textContent = L.relay ? 'Intel sat com' : 'Shore station com';
    const rows = L.relay ? [
      ['COURSE', deg(st.brg)], ['ELEVATION', `${Math.round(st.elev)}°`], ['SAT POS', ll(st.tgt)], ['COMLAN', `A-${100 + L.n * 13}`],
      ['DATA TRANS', st.up ? L.rate.toUpperCase() : '0'], ['ORBIT', 'GEO'], ['SPEED', '3.07 KM/S'], ['DIST', km(st.dist)],
      ['GEO LOCK', st.up ? 'LOCKED' : st.fading ? 'WEAK' : 'LOST'], ['TRACKING', st.up ? 'ARMED' : 'STANDBY'], ['SIG SOURCE', st.tgt.name], ['ALPHA CHAN', st.up ? (L.tx ? 'SEND' : 'RCV') : 'IDLE'],
    ] : [
      ['COURSE', deg(st.brg)], ['SURFACE', st.up ? 'CLEAR' : 'SUBMERGED'], ['STN POS', ll(st.tgt)], ['COMLAN', `B-${100 + L.n * 13}`],
      ['DATA TRANS', st.up ? L.rate.toUpperCase() : '0'], ['PROPAGATION', L.band === 'VLF' ? 'GROUND WAVE' : 'SKY WAVE'], ['POWER', L.band === 'VLF' ? '1.8 MW' : '10 KW'], ['DIST', `${(st.dist / 1.852).toFixed(0)} NM`],
      ['LOCK', st.up ? 'LOCKED' : st.fading ? 'WEAK' : 'LOST'], ['TRACKING', st.up ? 'ARMED' : 'STANDBY'], ['SIG SOURCE', st.tgt.name], ['ALPHA CHAN', st.up ? (L.tx ? 'SEND' : 'RCV') : 'IDLE'],
    ];
    rows.forEach(([k, v], i) => { sat[i][0].textContent = k; sat[i][1].textContent = v; });
    bandRows.forEach(({ b, lamp, v }) => { const ok = antDepth(b.ant) <= b.max; lamp.className = 'lamp ' + (ok ? 'ok' : 'bad'); v.textContent = ok ? 'OPEN' : `≤ ${b.max} M`; });
    drawSpec(sts); drawMap(s, sts);
  }
  update();
  return { update, destroy() {} };
}
