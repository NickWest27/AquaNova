// Comms console, Controls and Contacts pages.
// Controls: raise and lower antennas, pick the transmit source, aim the dish, transmit a report, EMF detector.
// Contacts: directory of bases, ships, subs and organisations; tune a frequency, scan for carriers, hail.
import { sim, clockText, timeBase } from '../sim.js';
import { el, toast } from '../util.js';
import { ANTS, ant, setAnt, antDepth, SOURCES, cm, LINKS, linkState, activeLink, canTransmit, bestSource, DIAL, loadContacts, isActive, hailed, tune, scan, hail, emf, authCode } from '../commsModel.js';

const chip = (text, on, fn) => el('button', { class: 'btn chip' + (on ? ' on' : ''), text, onclick: fn });
const small = (text, fn) => el('button', { class: 'btn cp-step', text, onclick: fn });
const deg3 = (n) => String(Math.round(((n % 360) + 360) % 360)).padStart(3, '0') + '°';

// ================= CONTROLS =================
export function mountControls(host, api) {
  host.classList.add('cp-grid');
  // antennas
  const antRows = Object.keys(ANTS).map((k) => {
    const D = ANTS[k], step = Math.max(1, Math.round(D.max / 8)), fill = el('i'), txt = el('span', { class: 'cl-v' }), dep = el('span', { class: 'cl-k' });
    return { k, dep, fill, txt, node: el('div', { class: 'cp-ant' },
      el('div', { class: 'cp-ant-h' }, el('b', { text: D.label }), el('span', { class: 'cl-k', text: D.note }), txt),
      el('div', { class: 'cp-bar' }, fill), dep,
      el('div', { class: 'cp-btns' }, small('− Lower', () => setAnt(k, ant(k).set - step)), small('+ Raise', () => setAnt(k, ant(k).set + step)), small('Stow', () => setAnt(k, 0)), small('Max', () => setAnt(k, D.max)))) };
  });
  const antPanel = el('div', { class: 'cl-panel' }, el('div', { class: 'lbl', text: 'Antennas' }), ...antRows.map((r) => r.node),
    el('p', { class: 'cl-k', style: 'margin-top:0.5rem', text: 'Antennas take time to move and are pulled in if the ship goes too fast.' }));

  // source and aim
  const srcBtns = SOURCES.map((x) => { const st = el('span', { class: 'cl-k' }); const b = el('button', { class: 'btn cp-src', onclick: () => { cm.source = x.id; } }, el('b', { text: x.label }), st); return { x, b, st }; });
  const best = el('button', { class: 'btn chip', text: 'Best signal', onclick: () => { const b = bestSource(); if (b) cm.source = b.id; else toast('No usable link. Raise an antenna.', 'warn'); } });
  const aimOut = el('div', { class: 'cl-v' }), aimNote = el('div', { class: 'cl-k' });
  const autoBtn = el('button', { class: 'btn chip', onclick: () => { const L = activeLink(); if (cm.auto) { const st = linkState(L); if (L.relay) cm.aim[L.n] = Math.round(st.brg); } cm.auto = !cm.auto; } });
  const nudge = (d) => { const L = activeLink(); if (!L.relay) return; cm.auto = false; cm.aim[L.n] = (cm.aim[L.n] + d + 360) % 360; };
  const srcPanel = el('div', { class: 'cl-panel' }, el('div', { class: 'lbl', text: 'Transmit source' }),
    el('div', { class: 'cp-srcs' }, ...srcBtns.map((q) => q.b)), el('div', { class: 'cp-btns', style: 'margin-top:0.5rem' }, best),
    el('div', { class: 'lbl', style: 'margin-top:0.9rem', text: 'Dish aim' }), aimOut, aimNote,
    el('div', { class: 'cp-btns', style: 'margin-top:0.4rem' }, small('◀◀ 10°', () => nudge(-10)), small('◀ 1°', () => nudge(-1)), small('1° ▶', () => nudge(1)), small('10° ▶▶', () => nudge(10))),
    el('div', { class: 'cp-btns', style: 'margin-top:0.4rem' }, autoBtn));

  // transmit and EMF
  const txState = el('p', { class: 'cl-k' }), txBtn = el('button', { class: 'btn primary cp-tx', text: 'Transmit report', onclick: () => api.transmit() });
  const emfV = el('div', { class: 'num' }), emfBar = el('i'), emfNote = el('div', { class: 'cl-k' }), needle = el('div', { class: 'cp-needle' }), emfBtn = el('button', { class: 'btn chip', onclick: () => { cm.emf = !cm.emf; } });
  const emfPanel = el('div', { class: 'cl-panel' }, el('div', { class: 'lbl', text: 'EMF detector' }),
    el('div', { class: 'cp-emf' }, el('div', {}, emfV, el('span', { class: 'cl-k', text: 'µT' })), el('div', { class: 'cp-dial' }, needle)),
    el('div', { class: 'cp-bar' }, emfBar), emfNote, el('div', { class: 'cp-btns', style: 'margin-top:0.5rem' }, emfBtn));
  const txPanel = el('div', { class: 'cl-panel' }, el('div', { class: 'lbl', text: 'Report' }), txState, txBtn);
  host.append(antPanel, srcPanel, el('div', { class: 'cp-col' }, txPanel, emfPanel));

  function update() {
    const s = sim.s;
    for (const r of antRows) { const a = ant(r.k), D = ANTS[r.k]; r.fill.style.width = `${(a.ext / D.max) * 100}%`; r.txt.textContent = `${a.ext.toFixed(0)} / ${D.max} m${Math.abs(a.set - a.ext) > 0.3 ? (a.set > a.ext ? ' ▲' : ' ▼') : ''}`; r.dep.textContent = `Antenna depth ${antDepth(r.k, s).toFixed(0)} m`; }
    for (const q of srcBtns) { const L = LINKS[q.x.link - 1], st = linkState(L); q.b.classList.toggle('on', cm.source === q.x.id); q.st.textContent = `${st.status}${st.dB == null ? '' : `  ${st.dB} dB`}`; }
    const L = activeLink(), st = linkState(L);
    if (L.relay) { aimOut.textContent = `AIM ${deg3(st.aim)}  ·  SAT ${deg3(st.brg)}`; aimNote.textContent = cm.auto ? 'Auto track on. The dish follows the satellite.' : `Off by ${Math.round(st.off)}°. ${st.off <= st.tol ? 'On target.' : 'Turn the dish.'}`; }
    else { aimOut.textContent = 'OMNI'; aimNote.textContent = 'Radio needs no aiming.'; }
    autoBtn.textContent = cm.auto ? 'Auto track: ON' : 'Auto track: OFF'; autoBtn.classList.toggle('on', cm.auto); autoBtn.disabled = !L.relay;
    const t = canTransmit(); txBtn.disabled = !t.ok;
    txState.textContent = t.ok ? `Ready on ${t.L.label}, ${t.st.dB} dB.` : `Cannot transmit: ${t.L.label} is ${t.st.status.toLowerCase()}.`;
    emfBtn.textContent = cm.emf ? 'Detector: ON' : 'Detector: OFF'; emfBtn.classList.toggle('on', cm.emf);
    if (cm.emf) {
      const e = emf(s); emfV.textContent = e.uT; emfBar.style.width = `${Math.min(100, (e.uT - 30) / 6)}%`;
      emfNote.textContent = e.what ? `${e.what}${e.name ? `: ${e.name}` : ''}, ${e.brg}°, ${e.d.toFixed(1)} nm` : 'Background field only.';
      needle.style.opacity = e.brg == null ? 0.15 : 1; needle.style.transform = `rotate(${(e.brg == null ? 0 : e.brg - s.heading)}deg)`;
    } else { emfV.textContent = '--'; emfBar.style.width = '0'; emfNote.textContent = 'Detector off.'; needle.style.opacity = 0.15; }
  }
  update();
  return { update, destroy() {} };
}

// ================= CONTACTS =================
const KINDS = [['base', 'Bases'], ['ship', 'Ships'], ['sub', 'Subs'], ['org', 'Orgs']];
export function mountContacts(host) {
  host.classList.add('cp-grid', 'cc');
  let kind = 'base', msg = '', sig = '';
  const kindBar = el('div', { class: 'tabs', style: 'flex-wrap:wrap' }), dir = el('div', { class: 'cp-list' });
  const dirPanel = el('div', { class: 'cl-panel' }, el('div', { class: 'lbl', text: 'Directory' }), kindBar, dir);
  const bandBar = el('div', { class: 'cp-btns' }), freq = el('div', { class: 'cp-freq' }), tuneNote = el('div', { class: 'cl-k' }), found = el('div', { class: 'cp-list' }), msgLine = el('p', { class: 'cp-msg' });
  const D = () => DIAL[cm.band], bump = (d) => tune(cm.band, cm.mhz + d);
  const secBtn = el('button', { class: 'btn chip', onclick: () => { cm.secure = !cm.secure; } });
  const tunePanel = el('div', { class: 'cl-panel' }, el('div', { class: 'lbl', text: 'Tune' }), bandBar, freq,
    el('div', { class: 'cp-btns' }, small('◀◀', () => bump(-D().coarse)), small('◀', () => bump(-D().fine)), small('▶', () => bump(D().fine)), small('▶▶', () => bump(D().coarse))),
    tuneNote, el('div', { class: 'cp-btns', style: 'margin-top:0.6rem' },
      el('button', { class: 'btn', text: 'Scan band', onclick: () => { msg = scan().msg; } }), el('button', { class: 'btn primary', text: 'Hail', onclick: () => { const r = hail(); msg = r.msg; if (r.ok) toast(r.msg); } }), secBtn),
    msgLine, el('div', { class: 'lbl', text: 'Carriers found' }), found);
  const callBox = el('div'), logBox = el('div');
  const callPanel = el('div', { class: 'cl-panel' }, el('div', { class: 'lbl', text: 'Call' }), callBox, logBox);
  host.append(dirPanel, tunePanel, callPanel);
  loadContacts().then(() => { sig = ''; update(); });

  const row = (k, v) => el('div', { class: 'cl-row' }, el('span', { class: 'cl-k', text: k }), el('span', { class: 'cl-v', text: v }));
  function update() {
    const list = (cm.contacts || []).filter((c) => c.kind === kind && isActive(c));
    const next = JSON.stringify([kind, cm.band, list.map((c) => [c.id, hailed().includes(c.id)]), cm.found, cm.log.length]);
    secBtn.textContent = cm.secure ? 'Secured' : 'Unsecured'; secBtn.classList.toggle('on', cm.secure);
    freq.textContent = cm.band === 'LPI' ? `${cm.mhz.toFixed(1)} kHz` : `${cm.mhz.toFixed(3)} MHz`;
    const here = (cm.contacts || []).find((c) => isActive(c) && c.band === cm.band && Math.abs(c.mhz - cm.mhz) < D().fine * 0.6);
    tuneNote.textContent = here && hailed().includes(here.id) ? `On ${here.name}.` : 'Match a contact\'s frequency, then hail.';
    msgLine.textContent = msg;
    if (next === sig) return;
    sig = next;
    kindBar.replaceChildren(...KINDS.map(([id, label]) => chip(label, kind === id, () => { kind = id; sig = ''; update(); })));   // only rebuilt when something changed: a button replaced between touch down and up never gets its tap
    bandBar.replaceChildren(...Object.keys(DIAL).map((b) => chip(b, cm.band === b, () => { if (b !== cm.band) tune(b, { HF: 10, VHF: 158, UHF: 280, LPI: 20 }[b]); sig = ''; update(); })));
    dir.replaceChildren(...(list.length ? list.map((c) => el('button', { class: 'cp-contact', onclick: () => { tune(c.band, c.mhz); msg = `Tuned to ${c.name}.`; } },
      el('b', { text: c.name }), el('span', { class: 'cl-k', text: c.band === 'LPI' ? `LPI ${c.mhz.toFixed(1)} kHz  ·  acoustic, any depth` : `${c.band} ${c.mhz.toFixed(3)} MHz  ·  ${c.range > 9999 ? 'via satellite' : `range ${c.range} nm`}` }))) : [el('div', { class: 'empty', text: 'No contacts of this kind.' })]));
    found.replaceChildren(...(cm.found.length ? cm.found.map((f) => el('button', { class: 'cp-contact' + (f.distress ? ' sos' : ''), onclick: () => { tune(cm.band, f.mhz); msg = `Tuned to ${f.mhz.toFixed(3)} MHz.`; } },
      el('b', { text: `${cm.band === 'LPI' ? f.mhz.toFixed(1) + ' kHz' : f.mhz.toFixed(3) + ' MHz'}${f.name ? `  ${f.name}` : ''}` }), el('span', { class: 'cl-k', text: `${f.dB} dB · bearing ${String(f.brg).padStart(3, '0')}°${f.distress ? ' · DISTRESS SIGNAL' : ''}` }))) : [el('div', { class: 'cl-k', text: 'Run a scan to look for carriers.' })]));
    const e = cm.log[0];
    callBox.replaceChildren(...(e ? [row('CALL ORIGIN:', 'AQN-101-' + new Date(timeBase.epoch).getUTCFullYear()), row('TO STATION:', authCode(e.id) + '-' + e.band), row('AUTH CODE:', authCode('aqn' + e.id)), row('LINK:', e.secure ? 'SECURED' : 'UNSECURED'), row('CALL ROUTE:', e.route), row('RANGE:', `${e.dist} NM`),
      el('p', { class: 'cp-reply' + (e.distress ? ' sos' : ''), text: `${e.name}: ${e.text}` })] : [el('div', { class: 'cl-k', text: 'No call yet.' })]));
    logBox.replaceChildren(...cm.log.slice(1).map((x) => el('p', { class: 'cl-k', text: `${clockText(x.at)}  ${x.name}` })));
  }
  update();
  return { update, destroy() {} };
}
