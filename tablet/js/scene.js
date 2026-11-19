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
  // walkway hub (concept art A1): a tap area on each door, a lit sign on each black panel above a door.
  // Corners are the four corners of the glass in stage pixels (art is cropped to 1920x1080).
  const door = (label, x, y, w, h, target, tagged = false) => el('button', { class: `door${tagged ? ' tagged' : ''}`, style: `left:${x}px;top:${y}px;width:${w}px;height:${h}px`, 'aria-label': label, onclick: () => onOpen(target) }, tagged ? el('span', { text: label }) : null);
  const sign = (text, corners, h = 120) => slanted('wsign-box', el('div', { class: 'wsign', style: `height:${h}px`, text }), 412, h, corners);
  const walkway = el('div', { class: 'scene walkway', hidden: true });
  walkway.append(
    el('img', { class: 'frame', src: 'assets/walkway.webp', alt: '', draggable: 'false', decoding: 'async' }),
    sign('SCIENCE', [[222, 45], [437, 165], [435, 227], [237, 142]]),
    sign('MEDICAL', [[463, 177], [570, 235], [568, 290], [463, 243]]),
    sign('QUARTERS', [[1483, 172], [1683, 62], [1680, 155], [1483, 238]]),
    sign('BRIDGE', [[862, 312], [1068, 312], [1068, 355], [862, 355]], 86),
    door('SCIENCE', 165, 240, 230, 720, 'science'),
    door('MEDICAL', 446, 304, 116, 536, 'medbay'),
    door('QUARTERS', 1524, 240, 237, 710, 'quarters'),
    door('BRIDGE', 805, 377, 323, 293, 'bridge'),
    door('ENGINEERING', 600, 380, 100, 320, 'engineering', true),
    door('LAUNCH BAY', 1235, 380, 95, 320, 'launchbay', true));
  // science lab: placeholder art (medbay concept). Samples, analysis and research live in the Lab station; the ROV in the Launch Bay.
  const science = el('div', { class: 'scene science', hidden: true });
  science.append(el('img', { src: 'assets/science.webp', alt: '', draggable: 'false', style: 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover' }),
    hs('SAMPLES', 20, 400, 780, 560, () => onOpen('lab'), 'top'),
    hs('ANALYSIS', 520, 250, 300, 340, () => onOpen('lab-analysis'), 'top'),
    hs('RESEARCH', 1660, 440, 260, 560, () => onOpen('lab-research'), 'bottom'),
    hs('REMORA', 830, 300, 190, 220, () => onOpen('remora'), 'top'),
    hs('WALKWAY ▸', 1500, 320, 260, 330, () => onOpen('walkway'), 'mid'),
    hs('MEDBAY', 1040, 540, 520, 300, () => onOpen('medbay'), 'mid', 'locked'),
    el('div', { class: 'art-note', text: 'Placeholder art' }));
  // launch bay: placeholder art. Where Remora, the WSKRs and the away boats physically leave and return.
  const bay = el('div', { class: 'scene bay', hidden: true });
  bay.innerHTML = `<svg viewBox="0 0 1920 1080" preserveAspectRatio="none" aria-hidden="true"><rect width="1920" height="1080" fill="#04101f"/>
    <rect x="0" y="700" width="1920" height="380" fill="#0a2536"/><rect x="260" y="180" width="1400" height="520" rx="30" fill="#06202e" stroke="#2f8f9d" stroke-width="4" opacity=".9"/>
    <rect x="300" y="620" width="1320" height="40" fill="#14465a"/><g stroke="#f2d9a0" stroke-width="6" opacity=".6"><line x1="260" y1="700" x2="1660" y2="700"/></g>
    <g fill="none" stroke="#2f8f9d" stroke-width="3" opacity=".6"><rect x="420" y="330" width="360" height="200" rx="20"/><rect x="1140" y="330" width="360" height="200" rx="20"/></g>
    <text x="600" y="440" fill="#2f8f9d" font-size="34" font-family="sans-serif" text-anchor="middle" opacity=".7">REMORA</text><text x="1320" y="440" fill="#2f8f9d" font-size="34" font-family="sans-serif" text-anchor="middle" opacity=".7">WSKR RACK</text></svg>`;
  bay.append(hs('BAY CONTROL', 760, 560, 400, 200, () => onOpen('bay'), 'mid'),
    hs('◂ WALKWAY', 0, 890, 330, 190, () => onOpen('walkway'), 'mid'),
    el('div', { class: 'art-note', text: 'Placeholder art' }));
  stage.append(bridge, quarters, walkway, science, bay);

  const api = {
    inQuarters: false, where: 'bridge',
    show(which) {
      api.where = which; api.inQuarters = which === 'quarters';
      bridge.hidden = which !== 'bridge'; quarters.hidden = which !== 'quarters'; walkway.hidden = which !== 'walkway'; science.hidden = which !== 'science'; bay.hidden = which !== 'launchbay';
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
