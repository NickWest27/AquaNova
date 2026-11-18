// Sensors station: sonar contacts around the ship, and scans.
// A scan files a finding (PED → Findings). Scanning needs the ship at the site (inside its marker).
import { sim, toward } from '../sim.js';
import { el, toast } from '../util.js';
import { gameState } from '../persist.js';

const SONAR_RANGE_NM = 4;
const findings = () => gameState.getProperty('mission.discoveries') || [];

export function mount(body) {
  body.style.flexDirection = 'column';
  const head = el('div', { class: 'card' }, el('div', { class: 'lbl', text: 'Sonar' }), el('div', { class: 'num' }), el('p', { style: 'color:var(--dim);margin-top:0.4rem' }));
  const sonarBtn = el('button', { class: 'btn chip', onclick: () => { sim.s.sonar = !sim.s.sonar; update(); } });
  head.append(sonarBtn);
  const list = el('div', { class: 'tab-body', style: 'flex:1;min-height:0' });
  body.append(head, list);
  let sig = '';

  const scan = (p) => {
    if (findings().some((f) => f.id === `poi-${p.id}`)) { toast('Already scanned'); return; }
    gameState.updateProperty('mission.discoveries', [...findings(), { id: `poi-${p.id}`, name: p.name, description: p.text || `Scanned ${p.name}.`, type: p.type, scannedAt: new Date().toISOString() }]);
    toast(`Scan filed: ${p.name}`, 'mission'); sig = ''; update();
  };

  function update() {
    const s = sim.s;
    head.children[1].textContent = s.sonar ? 'ACTIVE' : 'OFF';
    head.children[1].className = 'num ' + (s.sonar ? 'ok' : 'bad');
    head.children[2].textContent = s.sonar ? `Showing contacts within ${SONAR_RANGE_NM} nm. ${findings().length} scan${findings().length === 1 ? '' : 's'} filed.` : 'Turn sonar on to see contacts.';
    sonarBtn.textContent = s.sonar ? 'Sonar off' : 'Sonar on';
    const rows = s.sonar ? s.pois.map((p) => ({ p, ...toward(s, p) })).filter((r) => r.nm <= SONAR_RANGE_NM).sort((a, b) => a.nm - b.nm) : [];
    const next = JSON.stringify([s.sonar, rows.map((r) => [r.p.id, r.nm.toFixed(1), Math.round(r.brg), s.at && s.at.id === r.p.id, findings().some((f) => f.id === `poi-${r.p.id}`)])]);
    if (next === sig) return;   // redraw only when something visible changed
    sig = next;
    list.replaceChildren(...(rows.length ? rows.map((r) => {
      const here = s.at && s.at.id === r.p.id, done = findings().some((f) => f.id === `poi-${r.p.id}`);
      return el('div', { class: 'card task' },
        el('div', { class: 'grow' }, el('h3', { text: r.p.name }), el('p', { style: 'color:var(--dim)', text: `${r.nm.toFixed(1)} nm · bearing ${String(Math.round(r.brg)).padStart(3, '0')}° · ${r.p.type.replace(/_/g, ' ')}` })),
        done ? el('span', { class: 'ok', text: 'Scanned' }) : here ? el('button', { class: 'btn primary', text: 'Scan', onclick: () => scan(r.p) }) : el('span', { style: 'color:var(--dim)', text: 'Move closer to scan' }));
    }) : [el('div', { class: 'empty', text: s.sonar ? 'No contacts in range.' : 'Sonar is off.' })]));
  }
  update();
  return { update, destroy() {} };
}
