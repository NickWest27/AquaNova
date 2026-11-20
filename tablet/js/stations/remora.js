// Launch Bay: launches the Science ROV (and later the away boats and WSKRs). Touch piloting for the ROV.
// Hold a button to steer. Tools work only at a site, some only near the sea floor.
import { tell } from '../notify.js';
import { sim, toward } from '../sim.js';
import { launchRemora, recoverRemora, remoraRearm, bay } from '../bayops.js';
import { ROV_NAME, rovRange, rovSite, rovFloor, rovCargo, REMORA_STORE, tetherBar } from '../rov.js';
import { TOOLS, samples, pickKind } from '../science.js';
import { el, toast } from '../util.js';
import { mountCraftView } from '../craftview.js';

const WHY = { floor: 'Get within 6 m of the sea floor first.', nothing: 'Nothing to take here. Move to a site.', busy: 'The ROV is busy.', none: 'No ROV out.', full: 'Her sample storage is full. Bring her home to unload.' };

export function mount(body) {
  body.style.flexDirection = 'column'; body.style.overflowY = 'auto';
  const head = el('div', { class: 'card' }, el('div', { class: 'lbl', text: ROV_NAME + ' (Science ROV)' }), el('div', { class: 'num' }), el('p', { style: 'color:var(--dim);margin:0.4rem 0' }));
  const row = el('div', { class: 'row' });
  const launchBtn = el('button', { class: 'btn chip', text: 'Launch', onclick: () => { const r = launchRemora(); tell('science', r.ok ? `${ROV_NAME} is being readied in the bay. About ${Math.round(r.secs)} seconds.` : ({ docked: 'Undock first', out: 'Already out', busy: 'The bay is busy with another craft', doors: 'The bay doors are too damaged to open', rearm: `The team are still unloading and re-equipping her: about ${r.mins} min` })[r.why] || 'Cannot launch now', r.ok ? 'mission' : 'error'); update(); } });
  const recBtn = el('button', { class: 'btn chip', text: 'Recover', onclick: () => { const r = recoverRemora(); tell('science', r.ok ? `Bringing ${ROV_NAME} aboard. About ${Math.round(r.secs)} seconds.` : r.why === 'busy' ? 'The bay is busy' : 'Bring the ROV within 0.2 nm of the ship first', r.ok ? 'mission' : 'error'); update(); } });
  const autoBtn = el('button', { class: 'btn chip', text: 'Auto return', onclick: () => { const r = sim.rovAuto(); tell('science', r.ok ? (r.nm < 0.03 ? 'She is alongside. Matching your depth, then she is ready to come aboard.' : `${ROV_NAME} is driving home on her own, about ${Math.max(1, Math.round(r.hours * 60))} minutes at her speed. Take her aboard when she arrives.`) : r.why === 'busy' ? 'She is working a tool. Wait for it to finish.' : 'No ROV out.'); update(); } });
  row.append(launchBtn, autoBtn, recBtn); const tether = tetherBar(); head.append(row, tether);
  const pilot = el('div', { class: 'card' });
  const hold = (label, key, val) => {
    const b = el('button', { class: 'btn chip', text: label, 'aria-label': label });
    const on = (e) => { e.preventDefault(); if (sim.s.rov) { sim.s.rov.cmd[key] = val; b.classList.add('on'); } };
    const off = () => { if (sim.s.rov) sim.s.rov.cmd[key] = 0; b.classList.remove('on'); };
    b.addEventListener('pointerdown', on); ['pointerup', 'pointercancel', 'pointerleave'].forEach((n) => b.addEventListener(n, off));
    return b;
  };
  pilot.append(el('div', { class: 'row' }, hold('Forward', 'thr', 1), hold('Back', 'thr', -1), hold('Turn left', 'turn', -1), hold('Turn right', 'turn', 1), hold('Dive', 'dive', 1), hold('Rise', 'dive', -1)));
  const toolRow = el('div', { class: 'row', style: 'margin-top:0.6rem' });
  const toolIds = Object.keys(TOOLS).filter((id) => TOOLS[id].remora !== false);
  const toolBtns = toolIds.map((id) => [id, TOOLS[id]]).map(([id, t]) => el('button', { class: 'btn chip', text: t.name, onclick: () => {
    const r = sim.rovUse(id); tell('science', r.ok ? `${t.name} working` : WHY[r.why], r.ok ? '' : 'error'); update(); } }));
  toolRow.append(...toolBtns); pilot.append(toolRow);
  const readout = el('p', { style: 'color:var(--dim);margin-top:0.6rem' }); pilot.append(readout);
  const viewBox = el('div', { class: 'card cv' });
  const cv = mountCraftView(viewBox, { title: ROV_NAME, range: 0.5, getCraft: () => { const r = sim.s.rov; return r ? { lat: r.lat, lon: r.lon, heading: r.heading, depth: r.depth, kt: Math.abs(r.cmd.thr) * 2 } : null; } });
  body.append(head, viewBox, pilot);

  function update() {
    const s = sim.s, r = s.rov, op = bay().op, rr = remoraRearm();
    head.children[1].textContent = r ? 'OUT' : 'ABOARD'; head.children[1].className = 'num ' + (r ? 'ok' : '');
    head.children[2].textContent = op ? `The bay doors are open: ${op.kind === 'launch' ? 'launching' : 'taking aboard'}, ${Math.max(0, Math.round(op.dur - op.t))} s.` : r ? 'Hand piloted. Slow (2 kt) and on a tether: the bay doors stay open until she is back aboard, so keep the ship slow.' : rr ? `Aboard. The team are unloading ${rr.load} sample${rr.load === 1 ? '' : 's'} and re-equipping her: ${Math.max(1, Math.ceil((rr.dur - rr.t) / 60))} min.` : 'Short range, slow, and it carries the instruments the WSKRs lack. Launch it at sea.';
    tether.refresh();
    launchBtn.disabled = !!r || s.docked || !!op || !!rr; recBtn.disabled = !r || !!op; autoBtn.disabled = !r || !!r.job || !!r.auto;
    autoBtn.textContent = r && r.auto ? 'Driving home…' : 'Auto return'; pilot.hidden = !r; viewBox.hidden = !r;
    if (!r) return;
    cv.update();
    const t = toward(s, r), site = rovSite(), fl = rovFloor();
    const ids = toolIds, near = fl != null && fl - r.depth <= 6;
    toolBtns.forEach((b, i) => {
      const id = ids[i], useful = !!pickKind(id, site);   // a tool that can take nothing at this spot is not shown
      b.hidden = !useful;
      b.disabled = !!r.job || r.auto || (rovCargo().length >= REMORA_STORE && pickKind(id, site) !== 'magnetic') || (TOOLS[id].needsFloor && pickKind(id, site) !== 'water' && !near);
      b.title = TOOLS[id].needsFloor && pickKind(id, site) !== 'water' && !near ? 'Get within 6 m of the sea floor first.' : '';
    });
    readout.textContent = `Range ${t.nm.toFixed(2)} of ${rovRange()} nm · bearing ${String(Math.round(t.brg)).padStart(3, '0')}° · heading ${String(Math.round(r.heading)).padStart(3, '0')}° · depth ${Math.round(r.depth)} m` +
      (fl != null ? ` · floor ${Math.round(fl)} m` : '') + (site ? ` · at ${site.name}` : (() => { const n = s.pois.filter((p) => p.type !== 'dock').map((p) => ({ p, ...toward(r, p) })).sort((a, b) => a.nm - b.nm)[0]; return n ? ` · no site here: nearest is ${n.p.name}, ${n.nm.toFixed(2)} nm, bearing ${String(Math.round(n.brg)).padStart(3, '0')}° (get within 0.15 nm)` : ' · no site here'; })()) +
      (r.job ? ` · ${TOOLS[r.job.tool].name}: ${Math.max(0, Math.ceil((r.job.end - s.clock) / 60))} min left` : '') + ` · storage ${rovCargo().length} of ${REMORA_STORE}` + (r.auto ? ' · driving home' : r.home ? ' · alongside, ready to take aboard' : '');
  }
  update();
  return { update, destroy() { cv.destroy(); if (sim.s.rov) sim.s.rov.cmd = { thr: 0, turn: 0, dive: 0 }; } };
}
