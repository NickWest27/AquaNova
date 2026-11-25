// Bridge and quarters scenes on the fixed 1920x1080 stage. Updates only touch text nodes that changed.
import { sim, toward, gameDateText } from './sim.js';
import { el } from './util.js';
import { artImg } from './art.js';
import { createBridgeConsole } from './bridge.js';
import { samples, sampleName, jobs, points, research, LABS, SAMPLE_KINDS } from './science.js';
import { rovRange } from './rov.js';
import { LINKS, linkState, activeLink } from './commsModel.js';

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

  // Retro skin: the bridge frame is the 320x240 pixel-art picture (transparent holes for the screens), shown at 6x with hard pixels.
  // The bridge stage is 1920x1440 (4:3). Everything below is in stage pixels = art pixels x 6.
  const frame = artImg('bridge');
  const hs = (label, x, y, w, h, onclick, tagPos = 'top', extra = '') =>
    el('button', { class: `hs ${extra}`, style: `left:${x}px;top:${y}px;width:${w}px;height:${h}px`, 'aria-label': label, onclick },
      el('span', { class: `tag ${tagPos}`, text: label }));

  // The art (bridge.png, 1920x1080) has eight cut-outs; each screen sits behind its cut-out. Corners are TL, TR, BR, BL on the stage.
  // W x H is the screen's own size, with the perspective undone (flat desk panels are deeper than they look), so the picture is tilted and squeezed the way the glass is.
  // Station screens: a mini Links page (comms) and a mini sensor page. Four short lines each; 200 x 74 px.
  const stnL = el('div', { class: 'bstn' }), stnR = el('div', { class: 'bstn' });
  const mini = (node, key, html) => { if (cache.get(key) !== html) { cache.set(key, html); node.innerHTML = html; } };
  function updateStations() {
    const s = sim.s, act = activeLink();
    mini(stnL, 'stnL', `<h5>COMMS · LINKS</h5>${LINKS.map((L) => { const st = linkState(L); return `<div class="${st.up ? 'ok' : st.fading ? 'warn' : 'bad'}"><span>${L === act ? '▸' : ' '}${L.n} ${L.label}</span><b>${st.status}</b></div>`; }).join('')}`);
    const near = s.sonar ? s.pois.map((p) => ({ p, ...toward(s, p) })).sort((a, b) => a.nm - b.nm)[0] : null;
    const inRange = s.sonar ? s.pois.filter((p) => toward(s, p).nm <= 4).length : 0, sweeping = s.clock < (s.sweepUntil || 0);
    mini(stnR, 'stnR', `<h5>SENSORS</h5><div class="${s.sonar ? 'ok' : 'bad'}"><span>SONAR</span><b>${sweeping ? 'SWEEPING' : s.sonar ? 'ACTIVE' : 'OFF'}</b></div><div><span>CONTACTS</span><b>${s.sonar ? inRange + ' in 4 nm' : '—'}</b></div><div><span>WSKRS</span><b>${s.wskrs.length} of 4 out</b></div><div><span>NEAREST</span><b>${near ? near.p.name.slice(0, 11) + ' ' + near.nm.toFixed(1) : '—'}</b></div>`);
  }
  topD.classList.add('compact');
  const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  bridge.append(
    el('div', { class: 'bridge-base' }),
    box('bmainbox', 240, 216, 1440, 576, [mainD]),                                                       // the big window
    box('btbox', 606, 90, 708, 90, [topD]),                                                              // Top Strip, in the lit panel
    slanted('bdispbox', dispD, 560, 190, rect(696, 840, 1224, 1086)),                                    // centre display
    slanted('', stnL, 200, 74, rect(258, 768, 408, 840)),                                                // left station screen
    slanted('', stnR, 200, 74, rect(1506, 768, 1656, 840)),                                              // right station screen
    frame,
    slanted('', ctrD, 612, 130, rect(636, 1140, 1284, 1332)),                                            // centre desk (on top of the frame: the pads are slanted holes)
    slanted('', leftD, 300, 116, rect(312, 1140, 636, 1332)),                                            // left desk panel
    slanted('', rightD, 300, 116, rect(1284, 1140, 1608, 1332)),                                         // right desk panel
    hs('COMMS', 84, 500, 468, 340, () => onOpen('comms'), 'top'),        // comms officer, left station
    hs('SENSORS', 1368, 500, 468, 340, () => onOpen('sensors'), 'top'),  // sensors, right station
    hs('WALKWAY', 0, 1332, 1920, 108, () => onOpen('walkway'), 'mid'),   // the bottom edge leaves the bridge
  );

  // quarters
  const qimg = artImg('quarters');
  // Two things to collect, lying flat: the communicator pin on the desk and the PED on the bed.
  // flat(): a w x h item turned by `rot` degrees on a surface seen from the front, so it is squashed vertically.
  const flat = (cx, cy, w, h, rot, squash) => [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => {
    const a = rot * Math.PI / 180; return [cx + x * Math.cos(a) - y * Math.sin(a), cy + (x * Math.sin(a) + y * Math.cos(a)) * squash];
  });
  const pinArt = el('div', { class: 'item-pin' }, el('img', { src: 'assets/comm-pin.webp', alt: '', draggable: 'false' }));
  const pedArt = el('div', { class: 'item-ped' }, el('i'), el('img', { src: 'assets/pda-frame.webp', alt: '', draggable: 'false' }));
  const pinVis = slanted('item', pinArt, 90, 135, flat(1440, 985, 90, 135, -32, 0.36));
  const pedVis = slanted('item', pedArt, 120, 213, flat(520, 1130, 120, 213, 62, 0.37));
  const grab = (label, tag, x, y, w, h, target) => el('button', { class: 'pickup', hidden: true, style: `left:${x}px;top:${y}px;width:${w}px;height:${h}px`, 'aria-label': label, onclick: () => onOpen(target) }, el('span', { class: 'tag', text: tag }));
  const pinGrab = grab('Pick up communicator', 'COMMUNICATOR', 1370, 920, 150, 110, 'pickup'), pedGrab = grab('Pick up PED', 'PED', 430, 1060, 180, 120, 'pickup-ped');
  pinVis.hidden = pedVis.hidden = true;
  quarters.append(qimg,
    hs('LOGBOOK', 1480, 740, 340, 300, () => onOpen('log'), 'top'),
    hs('SLEEP', 0, 930, 750, 430, () => onOpen('sleep'), 'mid'),
    hs('TO WALKWAY', 800, 1150, 570, 290, () => onOpen('walkway'), 'mid'),
    pinVis, pedVis, pinGrab, pedGrab);
  // walkway hub (concept art A1): a tap area on each door, a lit sign on each black panel above a door.
  // Corners are the four corners of the glass in stage pixels (art is cropped to 1920x1080).
  const door = (label, x, y, w, h, target, tagged = false) => el('button', { class: `door${tagged ? ' tagged' : ''}`, style: `left:${x}px;top:${y}px;width:${w}px;height:${h}px`, 'aria-label': label, onclick: () => onOpen(target) }, tagged ? el('span', { text: label }) : null);
  const sign = (text, corners, h = 120) => slanted('wsign-box', el('div', { class: 'wsign', style: `height:${h}px`, text }), 412, h, corners);
  const walkway = el('div', { class: 'scene walkway', hidden: true });
  walkway.append(
    artImg('walkway'),
    // the owner's original picture (512x382, smooth), stretched to the 1920x1440 stage; walkway.png is the 320x240 palette-snapped copy. The BRIDGE sign is painted in the art, so the game draws no signs here
    door('SCIENCE', 150, 260, 230, 940, 'science'),
    door('MEDICAL', 380, 380, 110, 680, 'medbay'),
    door('QUARTERS', 1600, 300, 180, 900, 'quarters'),
    door('BRIDGE', 780, 470, 380, 390, 'bridge'),
    hs('AN-1 DECK ▼', 500, 1230, 920, 210, () => onOpen('walkway2'), 'mid'));      // walk on to the next section
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
  const sciFrame = artImg('science');
  const science = el('div', { class: 'scene science', hidden: true });
  const rect2 = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  science.append(
    sciFrame,
    // the picture is opaque, so the live screens sit on top of its dark screens (art px x 6 for the stage)
    slanted('', sci.banner, 350, 72, rect2(722, 320, 1078, 386)),                 // the bar on the back wall
    slanted('', sci.samples, 250, 206, rect2(1181, 508, 1350, 612)),              // the black screen on the right wall
    slanted('', sci.analysis, 296, 186, rect2(1678, 706, 1847, 828)),             // Main Computer (the CRT)
    slanted('', sci.research, 160, 172, rect2(0, 367, 178, 621)),                 // the left wall monitor
    slanted('', sci.remora, 190, 96, rect2(563, 662, 709, 762)),                  // the ROV console
    hs('SAMPLES', 955, 810, 450, 450, () => onOpen('lab-samples'), 'top'),        // the island bench
    hs('SAMPLES', 0, 700, 300, 400, () => onOpen('lab-samples'), 'top'),          // the left bench, test tubes and microscope
    hs('ANALYSIS', 1550, 380, 370, 290, () => onOpen('lab-analysis'), 'top'),     // the reagent shelves on the right
    hs('RESEARCH', 300, 520, 260, 240, () => onOpen('lab-research'), 'bottom'),   // the aquarium
    hs('WALKWAY ▸', 835, 480, 215, 330, () => onOpen('walkway'), 'mid'),          // the door
    hs('SAMPLES', 1170, 500, 190, 120, () => onOpen('lab-samples'), 'bottom'),    // the screen on the right wall
    hs('MAIN COMPUTER', 1660, 690, 220, 160, () => onOpen('lab'), 'bottom'),
    hs('RESEARCH COMPUTER', 0, 360, 180, 270, () => onOpen('lab-research'), 'bottom'),
    hs('ROV STATION', 540, 650, 190, 140, () => onOpen('remora'), 'bottom'));
  // medbay (concept art). Treatment and crew health are not built yet; the exam table is a locked tap area for now.
  const medbay = el('div', { class: 'scene medbay', hidden: true });
  const mbRead = el('div', { class: 'mb-read' });
  const mbView = el('div', { class: 'mb-view' }, [el('div', { class: 'mb-snow' }), el('div', { class: 'mb-snow s2' }), mbRead]);   // the cutout in the art shows the sea outside
  medbay.append(mbView, el('img', { class: 'frame', src: 'assets/medbay.webp', alt: '', draggable: 'false', decoding: 'async' }),
    hs('EXAM TABLE', 1045, 540, 500, 290, () => onOpen('medbay-station'), 'mid', 'locked'),
    hs('WALKWAY ▸', 1516, 327, 230, 293, () => onOpen('walkway'), 'mid'));
  // launch bay (TempLaunchbay art, 1920x1080, a temporary frame): the control console is on the left, the door to the walkway beyond it,
  // the inner airlock straight ahead, Remora and a second craft on their racks to the right. The ceiling map will show door and tether status.
  const bay = el('div', { class: 'scene bay', hidden: true });
  bay.append(artImg('launchbay'),
    hs('BAY CONTROL', 0, 690, 525, 630, () => onOpen('bay'), 'mid'),                       // the console: doors, craft, charging
    hs('◂ WALKWAY', 180, 225, 195, 415, () => onOpen('walkway2'), 'mid'),                  // the door to the walkway
    hs('INNER AIRLOCK', 730, 490, 470, 350, () => onOpen('bay-airlock'), 'mid', 'locked'), // not built yet
    hs('REMORA', 1275, 640, 645, 375, () => onOpen('remora'), 'mid'));                     // the craft on the racks
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
      document.body.classList.toggle('stage-4x3', ['bridge', 'walkway', 'quarters', 'science', 'launchbay'].includes(which));   // the retro scenes are 4:3, the others are still 16:9
      window.dispatchEvent(new Event('resize'));
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
      consoleApi.update(); updateStations();
    },
    console: consoleApi,
    showItems({ pin, ped }) { pinVis.hidden = pinGrab.hidden = !pin; pedVis.hidden = pedGrab.hidden = !ped; },
    lock(label, on) { stage.querySelectorAll('.hs').forEach((b) => { if (b.textContent === label) b.classList.toggle('locked', on); }); },
    glow(label, on) { stage.querySelectorAll('.hs, .door, .pickup').forEach((b) => { if (b.textContent === label || b.getAttribute('aria-label') === label) b.classList.toggle('glow', on); }); },
  };
  return api;
}
