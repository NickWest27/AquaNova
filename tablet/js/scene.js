// Bridge and quarters scenes on the fixed 1920x1080 stage. Updates only touch text nodes that changed.
import { sim } from './sim.js';
import { el } from './util.js';
import { createBridgeConsole } from './bridge.js';

const box = (cls, x, y, w, h, kids) => el('div', { class: `disp ${cls}`, style: `left:${x}px;top:${y}px;width:${w}px;height:${h}px` }, kids);

// Map a W x H content box onto a slanted screen. q = corners TL, TR, BR, BL in stage pixels, relative to the box origin.
function warp(node, W, H, q) {
  const src = [[0, 0], [W, 0], [W, H], [0, H]], A = [], b = [];
  src.forEach(([x, y], i) => { const [X, Y] = q[i]; A.push([x, y, 1, 0, 0, 0, -x * X, -y * X], [0, 0, 0, x, y, 1, -x * Y, -y * Y]); b.push(X, Y); });
  for (let i = 0; i < 8; i++) {                                            // Gaussian elimination
    let m = i; for (let r = i + 1; r < 8; r++) if (Math.abs(A[r][i]) > Math.abs(A[m][i])) m = r;
    [A[i], A[m]] = [A[m], A[i]]; [b[i], b[m]] = [b[m], b[i]];
    for (let r = 0; r < 8; r++) if (r !== i) { const f = A[r][i] / A[i][i]; for (let c = i; c < 8; c++) A[r][c] -= f * A[i][c]; b[r] -= f * b[i]; }
  }
  const [a, bb, c, d, e, f, g, h] = b.map((v, i) => v / A[i][i]);
  node.style.cssText += `;position:absolute;left:0;top:0;width:${W}px;height:${H}px;inset:auto;transform-origin:0 0;transform:matrix3d(${a},${d},0,${g},${bb},${e},0,${h},0,0,1,0,${c},${f},0,1)`;
}
// A screen in the art: its bounding box plus the four corners of the slanted glass (stage pixels).
function slanted(cls, node, W, H, corners) {
  const xs = corners.map((p) => p[0]), ys = corners.map((p) => p[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys);
  warp(node, W, H, corners.map(([x, y]) => [x - x0, y - y0]));
  return box(cls, x0, y0, x1 - x0, y1 - y0, [node]);
}

export function createScene(stage, { onOpen }) {
  const bridge = el('div', { class: 'scene' });
  const quarters = el('div', { class: 'scene', hidden: true });
  const cache = new Map();
  const txt = (key, node) => (v) => { if (cache.get(key) !== v) { cache.set(key, v); node.textContent = v; } };

  // bridge console: top display, main screen, left selector, center controls, right data
  const topD = el('div', { class: 'bt' }), mainD = el('div', { class: 'bmain' });
  const ctrD = el('div', { class: 'bctl' }), leftD = el('div', { class: 'bleft' }), rightD = el('div', { class: 'bright' });
  const dispD = el('div', { class: 'bdisp' });
  const consoleApi = createBridgeConsole({ top: topD, main: mainD, display: dispD, center: ctrD, left: leftD, right: rightD, onExpand: (id) => onOpen(id) });

  const frame = el('img', { class: 'frame', src: 'assets/bridge.webp', alt: '', draggable: 'false', decoding: 'async' });
  const hs = (label, x, y, w, h, onclick, tagPos = 'top', extra = '') =>
    el('button', { class: `hs ${extra}`, style: `left:${x}px;top:${y}px;width:${w}px;height:${h}px`, 'aria-label': label, onclick },
      el('span', { class: `tag ${tagPos}`, text: label }));

  bridge.append(
    box('bmainbox', 254, 189, 1410, 364, [mainD]), box('', 594, 76, 733, 94, [topD]), slanted('bdispbox', dispD, 478, 204, [[730, 581], [1187, 581], [1206, 781], [711, 781]]),
    slanted('', ctrD, 612, 118, [[674, 832], [1243, 832], [1287, 947], [641, 947]]),
    slanted('', leftD, 205, 146, [[470, 805], [640, 808], [595, 947], [379, 947]]),
    slanted('', rightD, 180, 128, [[1292, 812], [1441, 816], [1515, 938], [1327, 938]]), frame,
    hs('COMMS', 40, 430, 520, 350, () => onOpen('comms'), 'top'),        // comms officer, left station
    hs('SENSORS', 1380, 430, 520, 350, () => onOpen('sensors'), 'top'),  // sensors, right station
    hs('◂ WALKWAY', 0, 890, 330, 190, () => onOpen('walkway'), 'mid'),    // lower corners leave the bridge
    hs('WALKWAY ▸', 1590, 890, 330, 190, () => onOpen('walkway'), 'mid'),
  );

  // quarters
  const qimg = el('img', { src: 'assets/quarters.webp', alt: '', draggable: 'false', style: 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover' });
  const pickup = el('button', { class: 'pickup', hidden: true, style: 'left:480px;top:560px;width:120px;height:180px', 'aria-label': 'Pick up communicator', onclick: () => onOpen('pickup') },
    el('img', { src: 'assets/comm-pin.webp', alt: '' }), el('span', { class: 'tag', text: 'COMMUNICATOR' }));
  quarters.append(qimg,
    hs('LOGBOOK', 210, 516, 290, 190, () => onOpen('log'), 'top'),
    hs('SLEEP', 640, 610, 580, 250, () => onOpen('sleep'), 'mid'),
    hs('TO WALKWAY', 1236, 120, 560, 700, () => onOpen('walkway'), 'mid'),
    pickup);
  // walkway hub: placeholder art. Doors to the bridge, quarters, engineering and science/medical.
  const door = (label, x, y, w, h, target, cls = '') => el('button', { class: `door ${cls}`, style: `left:${x}px;top:${y}px;width:${w}px;height:${h}px`, 'aria-label': label, onclick: () => onOpen(target) }, el('span', { text: label }));
  const walkway = el('div', { class: 'scene walkway', hidden: true });
  walkway.innerHTML = `<svg viewBox="0 0 1920 1080" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="wf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d2c3c"/><stop offset="1" stop-color="#051722"/></linearGradient>
    <linearGradient id="ww" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#14465a"/><stop offset="1" stop-color="#0b2a3a"/></linearGradient></defs>
    <rect width="1920" height="1080" fill="#04101f"/>
    <polygon points="0,0 700,300 700,780 0,1080" fill="url(#ww)"/><polygon points="1920,0 1220,300 1220,780 1920,1080" fill="url(#ww)" transform="scale(1,1)"/>
    <polygon points="0,0 1920,0 1220,300 700,300" fill="#0a2536"/><polygon points="0,1080 700,780 1220,780 1920,1080" fill="url(#wf)"/>
    <rect x="700" y="300" width="520" height="480" fill="#06202e"/>
    <g stroke="#2f8f9d" stroke-width="3" opacity=".55"><line x1="0" y1="0" x2="700" y2="300"/><line x1="1920" y1="0" x2="1220" y2="300"/><line x1="0" y1="1080" x2="700" y2="780"/><line x1="1920" y1="1080" x2="1220" y2="780"/><line x1="960" y1="780" x2="960" y2="1080"/><line x1="830" y1="780" x2="560" y2="1080"/><line x1="1090" y1="780" x2="1360" y2="1080"/></g>
    <rect x="600" y="0" width="720" height="22" rx="11" fill="#f2d9a0" opacity=".55"/></svg>`;
  walkway.append(
    door('BRIDGE', 790, 360, 340, 400, 'bridge', 'far'),
    door('QUARTERS', 120, 300, 340, 520, 'quarters'),
    door('ENGINEERING', 470, 360, 190, 400, 'engineering', 'near-l'),
    door('SCIENCE / MEDICAL', 1460, 300, 340, 520, 'science'),
    el('div', { class: 'art-note', text: 'Placeholder art' }));
  // science lab: placeholder art (medbay concept). Samples, analysis and research live in the Lab station; the ROV in the Launch Bay.
  const science = el('div', { class: 'scene science', hidden: true });
  science.append(el('img', { src: 'assets/science.webp', alt: '', draggable: 'false', style: 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover' }),
    hs('SAMPLES', 20, 400, 780, 560, () => onOpen('lab'), 'top'),
    hs('ANALYSIS', 520, 250, 300, 340, () => onOpen('lab-analysis'), 'top'),
    hs('RESEARCH', 1660, 440, 260, 560, () => onOpen('lab-research'), 'bottom'),
    hs('LAUNCH BAY', 1500, 320, 260, 330, () => onOpen('launch'), 'mid'),
    hs('MEDBAY', 1040, 540, 520, 300, () => onOpen('medbay'), 'mid', 'locked'),
    hs('WALKWAY ▸', 840, 900, 320, 180, () => onOpen('walkway'), 'mid'),
    el('div', { class: 'art-note', text: 'Placeholder art' }));
  stage.append(bridge, quarters, walkway, science);

  const api = {
    inQuarters: false, where: 'bridge',
    show(which) {
      api.where = which; api.inQuarters = which === 'quarters';
      bridge.hidden = which !== 'bridge'; quarters.hidden = which !== 'quarters'; walkway.hidden = which !== 'walkway'; science.hidden = which !== 'science';
      cache.clear(); api.update();
    },
    update() {
      if (api.where !== 'bridge') return;
      const s = sim.s;
      consoleApi.update();
    },
    console: consoleApi,
    showPickup(on) { pickup.hidden = !on; },
    lock(label, on) { stage.querySelectorAll('.hs').forEach((b) => { if (b.textContent === label) b.classList.toggle('locked', on); }); },
    glow(label, on) { stage.querySelectorAll('.hs').forEach((b) => { if (b.textContent === label) b.classList.toggle('glow', on); }); },
  };
  return api;
}
