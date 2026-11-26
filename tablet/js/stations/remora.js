// Launch Bay: launches the Science ROV (and later the away boats and WSKRs). Touch piloting for the ROV.
// Hold a button to steer. Tools work only at a site, some only near the sea floor.
import { tell } from '../notify.js';
import { sim, toward } from '../sim.js';
import { launchRemora, recoverRemora, remoraRearm, bay } from '../bayops.js';
import { ROV_NAME, rovRange, rovSite, rovFloor, rovCargo, REMORA_STORE, tetherBar } from '../rov.js';
import { TOOLS, samples, pickKind } from '../science.js';
import { el, toast, modal } from '../util.js';
import { gauge, field, lamp, airlock, sampleSlots, mins, linkLamp } from '../instruments.js';
import { mountCraftView } from '../craftview.js';
import { selectedContact, targetOf } from '../contacts.js';
import { seafloor } from '../seafloor.js';

const WHY = { floor: 'Get within 6 m of the sea floor first.', nothing: 'Nothing to take here. Move to a site.', busy: 'The ROV is busy.', none: 'No ROV out.', full: 'Her sample storage is full. Bring her home to unload.' };

export function mount(body) {
  body.style.flexDirection = 'column';   // fits the screen: the view on top, status and piloting side by side below
  // instruments, not instructions (owner, 2026-11-26): a state lamp and level lines; the help is in the how-to guides
  const headHd = el('div', { class: 'craft-hd' }), headG = el('div', { class: 'rem-g' });
  const head = el('div', { class: 'card rem-card' }, headHd, headG);
  const row = el('div', { class: 'row' });
  const launchBtn = el('button', { class: 'btn chip', text: 'Launch', onclick: () => { const r = launchRemora(); tell('science', r.ok ? `${ROV_NAME} is being readied in the bay. About ${Math.round(r.secs)} seconds.` : ({ docked: 'Undock first', fast: 'Slow below 8 kt first', out: 'Already out', busy: 'The bay is busy with another craft', doors: 'The bay doors are too damaged to open', rearm: `The team are still unloading and re-equipping her: about ${r.mins} min`, tetherfix: `Engineering are splicing a new tether: about ${r.mins} min`, lost: 'Remora is lost. Send the Tern to fetch her' })[r.why] || 'Cannot launch now', r.ok ? 'mission' : 'error', { key: 'bay' }); update(); } });
  const recBtn = el('button', { class: 'btn chip', text: 'Recover', onclick: () => { const r = recoverRemora(); tell('science', r.ok ? `Bringing ${ROV_NAME} aboard. About ${Math.round(r.secs)} seconds.` : r.why === 'busy' ? 'The bay is busy' : 'Bring the ROV within 0.2 nm of the ship first', r.ok ? 'mission' : 'error', { key: 'bay' }); update(); } });
  const autoBtn = el('button', { class: 'btn chip', text: 'Auto return', onclick: () => { const r = sim.rovAuto(); tell('science', r.ok ? (r.nm < 0.03 ? 'She is alongside. Matching your depth, then she is ready to come aboard.' : `${ROV_NAME} is driving home on her own, about ${Math.max(1, Math.round(r.hours * 60))} minutes at her speed. Take her aboard when she arrives.`) : r.why === 'busy' ? 'She is working a tool. Wait for it to finish.' : 'No ROV out.'); update(); } });
  row.classList.add('craft-btns'); row.append(launchBtn, autoBtn, recBtn); head.append(row);
  const pilot = el('div', { class: 'card rem-card' });
  // set-and-go: taps set a speed, a heading and a depth she then holds; or pick a site and she drives there and stops
  const tap = (label, fn) => el('button', { class: 'btn chip', text: label, 'aria-label': label, onclick: () => { fn(); update(); } });
  const pilotBtns = [
    tap('Slower', () => sim.rovSpeed(-0.25)), tap('Faster', () => sim.rovSpeed(0.25)), tap('Stop', () => sim.rovStop()),
    tap('Yaw left', () => sim.rovYaw(-10)), tap('Yaw right', () => sim.rovYaw(10)),
    tap('Up', () => sim.rovDepth(-10)), tap('Down', () => sim.rovDepth(10)), tap('To floor', () => { if (sim.rovToFloor() == null) tell('science', 'No sea floor chart here.', 'error'); }),
  ];
  const goBtn = tap('Go to…', () => {
    const r = sim.s.rov; if (!r) return;
    const list = sim.s.pois.filter((p) => p.type !== 'dock').map((p) => ({ p, ...toward(r, p) })).filter((x) => toward(sim.s, x.p).nm <= rovRange()).sort((x, y) => x.nm - y.nm).slice(0, 6);
    if (!list.length) { tell('science', 'No site is within her tether.', 'error'); return; }
    modal({ title: 'Send Remora to', body: el('p', { text: 'She drives there at her own speed and stops. You then lower her to the floor and take the sample.' }),
      actions: [...list.map((x) => ({ label: `${x.p.name}  ${x.nm.toFixed(2)} nm  ${String(Math.round(x.brg)).padStart(3, '0')}°`, primary: true, run: () => { const g = sim.rovGo(x.p); tell('science', g.ok ? `${ROV_NAME} is driving to ${x.p.name}, about ${Math.max(1, Math.round(g.minutes))} minutes.` : 'No ROV out.'); update(); } })), { label: 'Cancel' }] });
  });
  pilot.append(el('div', { class: 'row' }, ...pilotBtns.slice(0, 3), goBtn), el('div', { class: 'row', style: 'margin-top:0.4rem' }, ...pilotBtns.slice(3)));
  const toolRow = el('div', { class: 'row', style: 'margin-top:0.6rem' });
  const toolIds = Object.keys(TOOLS).filter((id) => TOOLS[id].remora !== false);
  const toolBtns = toolIds.map((id) => [id, TOOLS[id]]).map(([id, t]) => el('button', { class: 'btn chip', text: t.name, onclick: () => {
    const r = sim.rovUse(id); tell('science', r.ok ? `${t.name} working` : WHY[r.why], r.ok ? '' : 'error'); update(); } }));
  toolRow.append(...toolBtns); pilot.append(toolRow);
  const status = el('div', { class: 'rem-g' }); pilot.append(status);   // SITE, FLOOR, SAMPLES, WORKING, ORDER
  const viewBox = el('div', { class: 'card cv' });
  const cv = mountCraftView(viewBox, { title: ROV_NAME, range: 0.5, readouts: () => { const r = sim.s.rov, g = r && r.go; return { ship: sim.s, target: g ? { name: g.name, lat: g.lat, lon: g.lon, depth: seafloor.ready ? seafloor.depthAt(g.lat, g.lon) : null, kt: 0 } : targetOf(selectedContact()) }; }, getCraft: () => { const r = sim.s.rov; return r ? { lat: r.lat, lon: r.lon, heading: r.heading, depth: r.depth, kt: Math.abs(r.cmd.thr || r.thrSet || (r.go ? 1 : 0)) * 2 } : null; } });
  body.append(viewBox, el('div', { class: 'rem-low' }, head, pilot));

  function update() {
    const s = sim.s, r = s.rov, op = bay().op, rr = remoraRearm();
    const lost = !!(r && r.lost), fix = bay().tetherFix, rovOp = op && op.craft === 'rov';   // tether parted: no control, no telemetry
    const st = rovOp ? lamp(op.kind === 'launch' ? 'LAUNCHING' : 'RECOVERING', 'warn') : r ? linkLamp(r) : rr ? lamp('RE-EQUIP', 'warn') : lamp('ABOARD', 'ok');
    const tn = r && !lost ? toward(s, r).nm : 0;
    const lines = [
      bay().tetherBroken ? gauge('TETHER', 0, 'PARTED', 'bad') : fix ? gauge('NEW TETHER', fix.t / fix.dur, mins((fix.dur - fix.t) / 60), 'warn') : null,
      r && !lost ? gauge('TETHER', tn / rovRange(), `${tn.toFixed(2)} / ${rovRange()} nm`, tn / rovRange() >= 0.9 ? 'warn' : '') : null,
      rovOp ? airlock(op, 'BAY') : null,
      !r && rr ? gauge('RE-EQUIP', rr.t / rr.dur, mins((rr.dur - rr.t) / 60), 'warn') : null,
      lost ? field('RECOVERY', 'THE TERN · LAUNCH BAY', 'bad') : null];
    const sig = JSON.stringify([st.textContent, lines.map((x) => x && x.textContent)]);
    if (headG._sig !== sig) { headG._sig = sig; headHd.replaceChildren(el('b', { text: ROV_NAME.toUpperCase() }), st); headG.replaceChildren(...lines.filter(Boolean)); }
    launchBtn.disabled = !!r || s.docked || !!op || !!rr || !!fix; recBtn.disabled = !r || !!op || lost; autoBtn.disabled = !r || !!r.job || !!r.auto || lost;
    autoBtn.textContent = r && r.auto ? 'Driving home…' : 'Auto return'; pilot.hidden = !r || lost; viewBox.hidden = !r || lost;
    pilotBtns.concat(goBtn).forEach((b) => { b.disabled = !r || !!r.job || lost; });
    if (!r || lost) return;
    cv.update();
    const t = toward(s, r), site = rovSite(), fl = rovFloor();
    const ids = toolIds, near = fl != null && fl - r.depth <= 6;
    toolBtns.forEach((b, i) => {
      const id = ids[i], useful = !!pickKind(id, site);   // a tool that can take nothing at this spot is not shown
      b.hidden = !useful;
      b.disabled = !!r.job || r.auto || (rovCargo().length >= REMORA_STORE && pickKind(id, site) !== 'magnetic') || (TOOLS[id].needsFloor && pickKind(id, site) !== 'water' && !near);
      b.title = TOOLS[id].needsFloor && pickKind(id, site) !== 'water' && !near ? 'Get within 6 m of the sea floor first.' : '';
    });
    const nearest = site ? null : s.pois.filter((p) => p.type !== 'dock').map((p) => ({ p, ...toward(r, p) })).sort((x, y) => x.nm - y.nm)[0];
    const alt = fl != null ? fl - r.depth : null, order = r.go ? `TO ${r.go.name.toUpperCase()}` : r.auto ? 'DRIVING HOME' : r.home ? 'ALONGSIDE' : r.thrSet ? `${(r.thrSet * 2).toFixed(1)} KT${r.hdgTo != null ? ` · HDG ${String(Math.round(r.hdgTo)).padStart(3, '0')}°` : ''}` : r.hdgTo != null ? `HDG ${String(Math.round(r.hdgTo)).padStart(3, '0')}°` : 'HOLDING';
    const rows = [
      site ? field('SITE', site.name.toUpperCase(), 'ok') : field('SITE', nearest ? `NONE · ${nearest.p.name.toUpperCase()} ${nearest.nm.toFixed(2)} nm ${String(Math.round(nearest.brg)).padStart(3, '0')}°` : 'NONE', 'idle'),
      field('FLOOR', alt == null ? 'NO CHART' : `${Math.round(alt)} m BELOW${near ? ' · TOOLS REACH' : ''}`, near ? 'ok' : 'idle'),
      sampleSlots(rovCargo(), REMORA_STORE),
      r.job ? (() => { const tl = TOOLS[r.job.tool], left = Math.max(0, r.job.end - s.clock); return gauge('WORKING', 1 - left / tl.secs, `${tl.name.toUpperCase()} · ${mins(left / 60)}`, 'warn'); })() : null,
      field('ORDER', order)];
    const sig2 = JSON.stringify(rows.map((x) => x && x.textContent));
    if (status._sig !== sig2) { status._sig = sig2; status.replaceChildren(...rows.filter(Boolean)); }
  }
  update();
  return { update, destroy() { cv.destroy(); if (sim.s.rov) sim.s.rov.cmd = { thr: 0, turn: 0, dive: 0 }; } };
}
