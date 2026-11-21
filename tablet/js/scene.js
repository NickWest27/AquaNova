// Bridge and quarters scenes on the fixed 1920x1080 stage. Updates only touch text nodes that changed.
import { sim, toward, gameDateText } from './sim.js';
import { el } from './util.js';
import { createBridgeConsole } from './bridge.js';
import { samples, sampleName, jobs, points, research, LABS, SAMPLE_KINDS } from './science.js';
import { rovRange } from './rov.js';

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
// A flat (front-facing) screen clipped to the cut-out's outline. Points are relative to the box.
const boxClip = (cls, x, y, w, h, pts, kids) => { const b = box(cls, x, y, w, h, kids); b.style.clipPath = `polygon(${pts.map(([px, py]) => `${px}px ${py}px`).join(',')})`; return b; };
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

  // The art (bridge.png, 1920x1080) has eight cut-outs; each screen sits behind its cut-out. Corners are TL, TR, BR, BL on the stage.
  // W x H is the screen's own size, with the perspective undone (flat desk panels are deeper than they look), so the picture is tilted and squeezed the way the glass is.
  const stnL = el('div', { class: 'bstn' }, el('b', { text: 'COMMS' }), el('span', { text: 'STANDBY' }));
  const stnR = el('div', { class: 'bstn' }, el('b', { text: 'SENSORS' }), el('span', { text: 'STANDBY' }));
  topD.classList.add('compact');
  bridge.append(
    box('bmainbox', 243, 168, 1433, 351, [mainD]),                                                        // the big window
    boxClip('btbox', 604, 52, 709, 40, [[0, 3], [709, 0], [674, 40], [28, 40]], [topD]),                  // Top Strip: front-facing, two lines
    slanted('bdispbox', dispD, 560, 190, [[719, 584], [1203, 584], [1253, 740], [664, 735]]),             // centre display
    slanted('', ctrD, 612, 130, [[752, 793], [1159, 792], [1206, 872], [713, 867]]),                      // centre desk
    slanted('', leftD, 300, 116, [[389, 774], [614, 778], [552, 870], [304, 865]]),                       // left desk panel
    slanted('', rightD, 300, 116, [[1306, 776], [1530, 772], [1616, 864], [1369, 869]]),                  // right desk panel
    slanted('', stnL, 200, 74, [[266, 508], [444, 510], [413, 573], [231, 568]]),                         // left station screen
    slanted('', stnR, 200, 74, [[1479, 510], [1652, 508], [1689, 572], [1504, 573]]),                     // right station screen
    frame,
    hs('COMMS', 150, 470, 360, 170, () => onOpen('comms'), 'top'),        // comms officer, left station
    hs('SENSORS', 1410, 470, 360, 170, () => onOpen('sensors'), 'top'),  // sensors, right station
    hs('WALKWAY', 0, 890, 1920, 190, () => onOpen('walkway'), 'mid'),    // the whole bottom edge leaves the bridge
  );

  // quarters
  const qimg = el('img', { src: 'assets/quarters.webp', alt: '', draggable: 'false', style: 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover' });
  // Two things to collect, lying flat: the communicator pin on the desk and the PED on the bed.
  // flat(): a w x h item turned by `rot` degrees on a surface seen from the front, so it is squashed vertically.
  const flat = (cx, cy, w, h, rot, squash) => [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => {
    const a = rot * Math.PI / 180; return [cx + x * Math.cos(a) - y * Math.sin(a), cy + (x * Math.sin(a) + y * Math.cos(a)) * squash];
  });
  const pinArt = el('div', { class: 'item-pin' }, el('img', { src: 'assets/comm-pin.webp', alt: '', draggable: 'false' }));
  const pedArt = el('div', { class: 'item-ped' }, el('i'), el('img', { src: 'assets/pda-frame.webp', alt: '', draggable: 'false' }));
  const pinVis = slanted('item', pinArt, 90, 135, flat(565, 668, 90, 135, -32, 0.36));
  const pedVis = slanted('item', pedArt, 120, 213, flat(1150, 688, 120, 213, 62, 0.37));
  const grab = (label, tag, x, y, w, h, target) => el('button', { class: 'pickup', hidden: true, style: `left:${x}px;top:${y}px;width:${w}px;height:${h}px`, 'aria-label': label, onclick: () => onOpen(target) }, el('span', { class: 'tag', text: tag }));
  const pinGrab = grab('Pick up communicator', 'COMMUNICATOR', 490, 610, 150, 110, 'pickup'), pedGrab = grab('Pick up PED', 'PED', 1060, 630, 180, 120, 'pickup-ped');
  pinVis.hidden = pedVis.hidden = true;
  quarters.append(qimg,
    hs('LOGBOOK', 210, 516, 290, 190, () => onOpen('log'), 'top'),
    hs('SLEEP', 640, 610, 580, 250, () => onOpen('sleep'), 'mid'),
    hs('TO WALKWAY', 1236, 120, 560, 700, () => onOpen('walkway'), 'mid'),
    pinVis, pedVis, pinGrab, pedGrab);
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
    hs('AN-1 DECK ▼', 560, 900, 800, 180, () => onOpen('walkway2'), 'mid'));      // walk on to the next section
  // walkway AN-1 (concept art): the junction past A1. Launch Bay on the left, Engineering on the right; the sign sits in the cutout.
  const walkway2 = el('div', { class: 'scene walkway2', hidden: true });
  walkway2.append(
    el('div', { class: 'an-sign', style: 'left:677px;top:111px;width:565px;height:101px' }, [el('div', { class: 'l', text: '◂ LAUNCH BAY' }), el('div', { class: 'r', text: 'ENGINEERING ▸' })]),
    el('img', { class: 'frame', src: 'assets/walkway-an1.webp', alt: '', draggable: 'false', decoding: 'async' }),
    door('LAUNCH BAY', 396, 287, 494, 586, 'launchbay'),
    door('ENGINEERING', 1062, 300, 413, 440, 'engineering'),
    hs('A1 DECK ▼', 560, 900, 800, 180, () => onOpen('walkway'), 'mid'));
  // science lab (science.png, 1920x1080): five cut-outs hold live screens that open the stations they show. The door leads out to the walkway.
  const sci = { banner: el('div', { class: 'sciscr' }), samples: el('div', { class: 'sciscr' }), analysis: el('div', { class: 'sciscr' }), research: el('div', { class: 'sciscr' }), remora: el('div', { class: 'sciscr' }) };
  const sciFrame = el('img', { class: 'frame', src: 'assets/science.webp', alt: '', draggable: 'false', decoding: 'async' });
  const science = el('div', { class: 'scene science', hidden: true });
  science.append(
    slanted('', sci.banner, 350, 72, [[365, 215], [715, 225], [723, 289], [370, 282]]),
    slanted('', sci.samples, 250, 206, [[1569, 110], [1816, 36], [1810, 242], [1566, 281]]),
    slanted('', sci.analysis, 296, 186, [[1596, 335], [1887, 301], [1882, 487], [1596, 483]]),                 // Main Computer
    slanted('', sci.research, 160, 172, [[1107, 345], [1265, 311], [1268, 482], [1109, 483]]),
    slanted('', sci.remora, 190, 96, [[749, 378], [936, 378], [936, 472], [750, 475]]),
    sciFrame,
    hs('SAMPLES', 666, 620, 680, 430, () => onOpen('lab'), 'top'),                 // the island bench
    hs('ANALYSIS', 1280, 540, 640, 300, () => onOpen('lab-analysis'), 'top'),     // the bench with the racks and the microscope
    hs('RESEARCH', 0, 380, 240, 260, () => onOpen('lab-research'), 'bottom'),     // the machine on the left
    hs('WALKWAY ▸', 345, 345, 255, 300, () => onOpen('walkway'), 'mid'),          // the door
    hs('SAMPLES', 1530, 60, 330, 250, () => onOpen('lab'), 'bottom'),             // the screens
    hs('MAIN COMPUTER', 1590, 300, 310, 200, () => onOpen('lab-analysis'), 'bottom'),
    hs('RESEARCH COMPUTER', 1100, 310, 175, 180, () => onOpen('lab-research'), 'bottom'),
    hs('ROV STATION', 745, 370, 195, 110, () => onOpen('remora'), 'bottom'));
  // medbay (concept art). Treatment and crew health are not built yet; the exam table is a locked tap area for now.
  const medbay = el('div', { class: 'scene medbay', hidden: true });
  const mbRead = el('div', { class: 'mb-read' });
  const mbView = el('div', { class: 'mb-view' }, [el('div', { class: 'mb-snow' }), el('div', { class: 'mb-snow s2' }), mbRead]);   // the cutout in the art shows the sea outside
  medbay.append(mbView, el('img', { class: 'frame', src: 'assets/medbay.webp', alt: '', draggable: 'false', decoding: 'async' }),
    hs('EXAM TABLE', 1045, 540, 500, 290, () => onOpen('medbay-station'), 'mid', 'locked'),
    hs('WALKWAY ▸', 1516, 327, 230, 293, () => onOpen('walkway'), 'mid'));
  // launch bay: placeholder art. Where Remora, the WSKRs and the away boats physically leave and return.
  const bay = el('div', { class: 'scene bay', hidden: true });
  bay.innerHTML = `<svg viewBox="0 0 1920 1080" preserveAspectRatio="none" aria-hidden="true"><rect width="1920" height="1080" fill="#04101f"/>
    <rect x="0" y="700" width="1920" height="380" fill="#0a2536"/><rect x="260" y="180" width="1400" height="520" rx="30" fill="#06202e" stroke="#2f8f9d" stroke-width="4" opacity=".9"/>
    <rect x="300" y="620" width="1320" height="40" fill="#14465a"/><g stroke="#f2d9a0" stroke-width="6" opacity=".6"><line x1="260" y1="700" x2="1660" y2="700"/></g>
    <g fill="none" stroke="#2f8f9d" stroke-width="3" opacity=".6"><rect x="420" y="330" width="360" height="200" rx="20"/><rect x="1140" y="330" width="360" height="200" rx="20"/></g>
    <text x="600" y="440" fill="#2f8f9d" font-size="34" font-family="sans-serif" text-anchor="middle" opacity=".7">REMORA</text><text x="1320" y="440" fill="#2f8f9d" font-size="34" font-family="sans-serif" text-anchor="middle" opacity=".7">WSKR RACK</text></svg>`;
  bay.append(hs('BAY CONTROL', 760, 560, 400, 200, () => onOpen('bay'), 'mid'),
    hs('◂ WALKWAY', 0, 890, 330, 190, () => onOpen('walkway2'), 'mid'),
    el('div', { class: 'art-note', text: 'Placeholder art' }));
  stage.append(bridge, quarters, walkway, walkway2, science, medbay, bay);
  // Labels are hidden for immersion. Press and hold anywhere on the scene to show them (they stay a moment after release).
  { let t = null, off = null, shown = 0;
    const hide = () => { document.body.classList.remove('show-labels'); };
    stage.addEventListener('pointerdown', (e) => { if (e.button) return; clearTimeout(t); t = setTimeout(() => { shown = Date.now(); clearTimeout(off); document.body.classList.add('show-labels'); }, 500); });
    const up = () => { clearTimeout(t); if (document.body.classList.contains('show-labels')) { clearTimeout(off); off = setTimeout(hide, 2500); } };
    stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
    stage.addEventListener('click', (e) => { if (Date.now() - shown < 600) { e.stopPropagation(); e.preventDefault(); } }, true);   // the press that revealed the labels is not a tap
  }

  const row = (k, v) => `<div><span>${k}</span><b>${v}</b></div>`;
  function updateScience() {
    const sm = samples(), jb = jobs(), s = sim.s, r = s.rov, done = research.done();
    const put = (key, html) => { if (cache.get('sci' + key) !== html) { cache.set('sci' + key, html); sci[key].innerHTML = html; } };
    const mins = (j) => Math.max(1, Math.round((j.end - s.clock) / 60)), pct = (j) => Math.round(Math.max(0, Math.min(1, (s.clock - j.start) / (j.end - j.start))) * 100);
    const tether = r ? Math.round(Math.min(1, toward(s, r).nm / rovRange()) * 100) : 0, held = r ? (r.cargo || []).length : 0;
    const rovTxt = !r ? 'in bay' : r.auto ? 'coming home' : r.go ? 'under way' : r.job ? 'sampling' : 'out';
    const j0 = jb[0], q0 = j0 && sm.find((q) => q.id === j0.sample);
    // Banner: the state of the lab at a glance
    const left = (j) => { const m = Math.max(1, Math.round((j.end - s.clock) / 60)); return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`; };
    put('banner', `<p>ROV ${rovTxt} | ${tether}% Tether | ${held}/3 Samples</p><p>${j0 && q0 ? `Analysing ${sampleName(q0, sm)} ${pct(j0)}% | ${left(j0)} left${jb.length > 1 ? ` | +${jb.length - 1} queued` : ''}` : 'Labs idle'}</p>`);
    // Upper right: the latest sample and its labels
    const q = sm[sm.length - 1];
    put('samples', `<h4>LATEST SAMPLE</h4>${q ? `<p class="big">${sampleName(q, sm)}</p>${row('Type', SAMPLE_KINDS[q.kind].label)}${row('Place', q.site)}${row('Taken', q.at ? gameDateText(q.at).replace('  ', ', ').slice(0, -3) : '')}${row('Status', q.status === 'done' ? 'analysed' : jb.some((x) => x.sample === q.id) ? 'analysing' : 'raw')}` : '<p class="dim">No samples yet</p>'}`);
    // Main Computer: whatever is being worked on now
    put('analysis', `<h4>MAIN COMPUTER</h4>${j0 && q0 ? `<p class="big">${LABS[j0.lab] ? LABS[j0.lab].name : j0.lab}</p><p>${sampleName(q0, sm)}</p><span class="pbar"><i style="width:${pct(j0)}%"></i></span>${row('Done', pct(j0) + '%')}${row('Time left', left(j0))}${jb.length > 1 ? row('Queued', jb.length - 1) : ''}` : `<p class="big">No analysis running</p><p class="dim">Tap to start one</p>`}`);
    // Research Computer
    put('research', `<h4>RESEARCH</h4>${row('Points', points())}${row('Done', done.length)}`);
    // ROV Station
    put('remora', `<h4>ROV STATION</h4>${row('Remora', rovTxt)}${r ? row('Tether', tether + '%') : ''}${row('Storage', `${held} of 3`)}`);
  }
  const api = {
    inQuarters: false, where: 'bridge',
    show(which) {
      api.where = which; api.inQuarters = which === 'quarters';
      bridge.hidden = which !== 'bridge'; quarters.hidden = which !== 'quarters'; walkway.hidden = which !== 'walkway'; walkway2.hidden = which !== 'walkway2'; science.hidden = which !== 'science'; medbay.hidden = which !== 'medbay'; bay.hidden = which !== 'launchbay';
      cache.clear(); api.update();
    },
    update() {
      if (api.where === 'medbay') {
        const t = `EXTERNAL VIEW · ${Math.round(sim.s.depth)} m`;
        if (cache.get('mb') !== t) { cache.set('mb', t); mbRead.textContent = t; mbView.style.setProperty('--dark', Math.min(0.92, 0.25 + sim.s.depth / 700).toFixed(2)); }
        return;
      }
      if (api.where === 'science') { updateScience(); return; }
      if (api.where !== 'bridge') return;
      const s = sim.s;
      consoleApi.update();
    },
    console: consoleApi,
    showItems({ pin, ped }) { pinVis.hidden = pinGrab.hidden = !pin; pedVis.hidden = pedGrab.hidden = !ped; },
    lock(label, on) { stage.querySelectorAll('.hs').forEach((b) => { if (b.textContent === label) b.classList.toggle('locked', on); }); },
    glow(label, on) { stage.querySelectorAll('.hs, .door, .pickup').forEach((b) => { if (b.textContent === label || b.getAttribute('aria-label') === label) b.classList.toggle('glow', on); }); },
  };
  return api;
}
