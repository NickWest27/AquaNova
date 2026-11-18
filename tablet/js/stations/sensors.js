// Sensors station: sonar, contacts around the ship, scans, and the WSKRs (autonomous remote sensors).
// A scan files a finding (PED → Findings). Scanning needs the ship at the site, or a WSKR sent to investigate it.
// WSKRs are launched only here. They hold a ring round the ship, can be sent to a contact, and can be recalled.
import { sim, toward } from '../sim.js';
import { el, toast } from '../util.js';
import { findings, scanned, fileScan } from '../findings.js';

const SONAR_RANGE_NM = 4, SWEEP_GAME_S = 1800;

export function mount(body) {
  body.style.flexDirection = 'column';
  const head = el('div', { class: 'card' }, el('div', { class: 'lbl', text: 'Sonar' }), el('div', { class: 'num' }), el('p', { style: 'color:var(--dim);margin-top:0.4rem' }));
  const sonarBtn = el('button', { class: 'btn chip', onclick: () => { sim.s.sonar = !sim.s.sonar; sig = ''; update(); } });
  const sweepBtn = el('button', { class: 'btn chip', text: 'Full sweep', onclick: () => { sim.s.sonar = true; sim.s.sweepUntil = sim.s.clock + SWEEP_GAME_S; toast('Active sweep: the chart shows more detail for a minute'); sig = ''; update(); } });
  head.append(sonarBtn, sweepBtn);
  const wsk = el('div', { class: 'card' }, el('div', { class: 'lbl', text: 'WSKRs' }), el('div', { class: 'num' }), el('p', { style: 'color:var(--dim);margin:0.4rem 0' }));
  const wRow = el('div', { class: 'row' });
  const depBtn = el('button', { class: 'btn chip', text: 'Deploy WSKR', onclick: () => {
    const r = sim.deployWskr();
    toast(r.ok ? `WSKR ${r.n} deployed` : r.why === 'docked' ? 'Undock first' : 'All four WSKRs are out', r.ok ? '' : 'error'); sig = ''; update(); } });
  const recBtn = el('button', { class: 'btn chip', text: 'Recall all', onclick: () => { sim.recallWskrs(); toast('WSKRs recalled'); sig = ''; update(); } });
  wRow.append(depBtn, recBtn); wsk.append(wRow);
  const list = el('div', { class: 'tab-body', style: 'flex:1;min-height:0' });
  body.append(head, wsk, list);
  let sig = '';

  const scan = (p) => {
    if (!fileScan(p)) { toast('Already scanned'); return; }
    toast(`Scan filed: ${p.name}`, 'mission'); sig = ''; update();
  };
  const wText = (w, s) => w.mode === 'escort' ? 'holding formation' : w.mode === 'recall' ? 'returning' : `investigating ${(s.pois.find((p) => p.id === w.target) || {}).name || 'a contact'}`;

  function update() {
    const s = sim.s, sweeping = s.clock < (s.sweepUntil || 0);
    head.children[1].textContent = sweeping ? 'SWEEPING' : s.sonar ? 'ACTIVE' : 'OFF';
    head.children[1].className = 'num ' + (s.sonar ? 'ok' : 'bad');
    head.children[2].textContent = s.sonar ? `Contacts within ${SONAR_RANGE_NM} nm. The chart shows detailed contours ${sweeping ? '8' : '4'} nm round the ship. ${findings().length} scan${findings().length === 1 ? '' : 's'} filed.` : 'Sonar off: contacts hidden and only the nearest 0.8 nm is charted in detail.';
    sonarBtn.textContent = 'Sonar'; sonarBtn.classList.toggle('on', !!s.sonar);
    wsk.children[1].textContent = `${s.wskrs.length} of 4 out`;
    wsk.children[2].textContent = s.wskrs.length ? s.wskrs.map((w) => `WSKR ${w.n}: ${wText(w, s)}`).join(' · ') : 'Autonomous remote sensors. Out, they spread round the ship for better readings, and each charts the sea floor in detail around itself. Send one to a contact to investigate it.';
    depBtn.disabled = s.docked || s.wskrs.length >= 4; recBtn.disabled = !s.wskrs.length;
    const rows = s.sonar ? s.pois.map((p) => ({ p, ...toward(s, p) })).filter((r) => r.nm <= SONAR_RANGE_NM).sort((a, b) => a.nm - b.nm) : [];
    const idle = s.wskrs.some((w) => w.mode === 'escort');
    const next = JSON.stringify([s.sonar, sweeping, s.wskrs.map((w) => [w.n, w.mode, w.target]), s.docked, rows.map((r) => [r.p.id, r.nm.toFixed(1), Math.round(r.brg), s.at && s.at.id === r.p.id, scanned(r.p)])]);
    if (next === sig) return;   // redraw only when something visible changed
    sig = next;
    list.replaceChildren(...(rows.length ? rows.map((r) => {
      const here = s.at && s.at.id === r.p.id, done = scanned(r.p), busy = s.wskrs.some((w) => w.target === r.p.id);
      return el('div', { class: 'card task' },
        el('div', { class: 'grow' }, el('h3', { text: r.p.name }), el('p', { style: 'color:var(--dim)', text: `${r.nm.toFixed(1)} nm · bearing ${String(Math.round(r.brg)).padStart(3, '0')}° · ${r.p.type.replace(/_/g, ' ')}` })),
        done ? el('span', { class: 'ok', text: 'Scanned' }) : busy ? el('span', { style: 'color:var(--amber)', text: 'WSKR investigating' })
          : [here && el('button', { class: 'btn primary', text: 'Scan', onclick: () => scan(r.p) }),
             r.p.type !== 'dock' && (idle ? el('button', { class: 'btn chip', text: 'Send WSKR', onclick: () => { const w = sim.taskWskr(r.p); toast(`WSKR ${w.n} sent to ${r.p.name}`); sig = ''; update(); } }) : !here && el('span', { style: 'color:var(--dim)', text: s.wskrs.length ? 'No free WSKR' : 'Deploy a WSKR or move closer' }))]);
    }) : [el('div', { class: 'empty', text: s.sonar ? 'No contacts in range.' : 'Sonar is off.' })]));
  }
  update();
  return { update, destroy() {} };
}
