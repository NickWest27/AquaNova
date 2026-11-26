// The SNR page of the bridge console: passive sonar.
//   Left half of the display: a top-down, track-up map centred on the chosen source, with range rings. Every contact is a light bearing line from the source.
//   With a fix the contact's symbol and name are at its place; with no fix a "?" sits at the end of the line, on the outer ring.
//   Right half: the contacts by range (or, with no range, by age). A tap on a symbol, a line or a row opens the info box in its place.
//   The same page is the main page of the Sensors station (mountSnr below).
//   Centre controls: Source (a list: the ship or a WSKR), Full sweep, and with a contact picked, Scan and Clear.   Right desk: range - and +, DSP.
import { sim, toward } from './sim.js';
import { el } from './util.js';
import { scanned, fileScan } from './findings.js';
import { surveySite, surveying, startSurvey, stopSurvey, SURVEY_KT } from './survey.js';
import { tell } from './notify.js';
import { drawContact, contactSvg, frameColour } from './contactIcons.js';
import { sources, source, setSource, contactsFor, selected, select, snr, sweeping, startSweep, stopSweep, startScan, canScan, toggleInvestigate, canInvestigate, SCAN_NM } from './sonar.js';

const RANGES = [0.5, 1, 2, 4, 8, 16, 32, 64, 128, 256];   // the same steps as the NAV chart: one master range for the whole console
const set = (node, v) => { if (node._v !== v) { node._v = v; node.textContent = v; } };
const pad3 = (v) => String(Math.round(v) % 360).padStart(3, '0');
const view = { range: 8 };   // the master range: shared by the large and the medium copy, and with NAV (bridge.js links the two)
const hooks = [];
/** Set the range from outside (NAV zoomed). */
export const setSnrRange = (r) => { view.range = r; };
/** Call f(range) when the SNR range buttons change the range. */
export const onSnrRange = (f) => hooks.push(f);
const ageText = (s) => (s < 90 ? `${Math.round(s)} s` : `${Math.floor(s / 60)} min`);

export function createSnrView({ bbtn }) {
  const copies = [];
  const rangeTxt = el('span', { class: 'rng' });
  const zoom = (d) => { const i = Math.max(0, Math.min(RANGES.length - 1, RANGES.indexOf(view.range) + d)); view.range = RANGES[i]; hooks.forEach((f) => f(view.range)); sim.touch(); };

  function make(compact) {
    const m = el('div', { class: 'bd bd-snr' + (compact ? ' compact' : '') });
    const wrap = el('div', { class: 'snr-map' }), canvas = el('canvas'); wrap.append(canvas); const ctx = canvas.getContext('2d');
    const side = el('div', { class: 'snr-side' });
    const head = el('div', { class: 'snr-head' }), stat = el('div', { class: 'snr-stat' }), list = el('div', { class: 'snr-list' });
    const info = el('div', { class: 'snr-info' });
    side.append(head, stat, list, info); m.append(wrap, side);
    const hits = []; let W = 0, H = 0;

    // ---- the info box: short labels, six values in a grid, one line of sound. A tap on the box closes it (a second tap on the contact does too). ----
    const iName = el('b', { class: 'in-name' }), iType = el('div', { class: 'in-type' }), iNotes = el('div', { class: 'in-notes' });
    const iVals = {}, iRows = el('div', { class: 'in-rows' });
    for (const [k, l] of [['brg', 'BRG'], ['rng', 'RNG'], ['dep', 'DEPTH'], ['spd', 'SPEED'], ['crs', 'CRS'], ['age', 'AGE']]) { iVals[k] = el('b'); iRows.append(el('div', { class: 'in-r' }, el('small', { text: l }), iVals[k])); }
    info.append(iName, iType, iRows, iNotes); info.addEventListener('click', () => select(snr().sel));

    // ---- the list ----
    const rows = new Map();
    const rowFor = (c) => {
      let r = rows.get(c.id);
      if (!r) {
        const ic = el('span', { class: 'sr-ic' }), nm = el('b'), sub = el('small'), rg = el('span', { class: 'sr-rg' });
        const b = el('button', { class: 'snr-row', onclick: () => select(c.id) }, ic, el('span', { class: 'sr-t' }, nm, sub), rg);
        r = { b, ic, nm, sub, rg, key: '' }; rows.set(c.id, r);
      }
      return r;
    };

    function draw(src, cons) {
      const r = canvas.parentNode.getBoundingClientRect(), lw = wrap.offsetWidth, lh = wrap.offsetHeight; if (!lw || !lh) return;
      const sc = r.width / lw, dpr = Math.min(window.devicePixelRatio || 1, 2), cw = Math.round(lw * sc * dpr), ch = Math.round(lh * sc * dpr);
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; canvas.style.width = lw + 'px'; canvas.style.height = lh + 'px'; }
      ctx.setTransform(canvas.width / lw, 0, 0, canvas.height / lh, 0, 0); W = lw; H = lh;
      const u = Math.max(0.8, Math.min(lw, lh) / 440), cx = lw / 2, cy = lh / 2, R = Math.min(lw, lh) / 2 - 22 * u, hd = (src.heading * Math.PI) / 180, range = view.range;
      const at = (brg, nm) => { const a = (brg * Math.PI) / 180 - hd, k = (nm / range) * R; return { x: cx + Math.sin(a) * k, y: cy - Math.cos(a) * k }; };
      ctx.clearRect(0, 0, lw, lh);
      ctx.fillStyle = '#021019'; ctx.fillRect(0, 0, lw, lh);
      // range rings and the bearing scale
      ctx.lineWidth = 1; ctx.font = `${12 * u}px system-ui`; ctx.textAlign = 'left';
      for (let i = 1; i <= 4; i++) { ctx.strokeStyle = i === 4 ? 'rgba(120,200,230,.7)' : 'rgba(120,200,230,.28)'; ctx.lineWidth = i === 4 ? 2 : 1; ctx.beginPath(); ctx.arc(cx, cy, (R * i) / 4, 0, 6.2832); ctx.stroke(); ctx.fillStyle = 'rgba(160,210,230,.75)'; ctx.fillText(`${+(range * i / 4).toFixed(2)}`, cx + 4, cy - (R * i) / 4 + 13 * u); }
      ctx.strokeStyle = 'rgba(120,200,230,.7)'; ctx.fillStyle = '#9fd6e8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `${12 * u}px system-ui`;
      for (let b = 0; b < 360; b += 10) {
        const a = (b * Math.PI) / 180 - hd, major = b % 30 === 0, r0 = R + (major ? -9 : -5) * u; ctx.lineWidth = major ? 1.6 : 1; ctx.beginPath();
        ctx.moveTo(cx + Math.sin(a) * r0, cy - Math.cos(a) * r0); ctx.lineTo(cx + Math.sin(a) * R, cy - Math.cos(a) * R); ctx.stroke();
        if (major) ctx.fillText(b === 0 ? 'N' : pad3(b), cx + Math.sin(a) * (R + 13 * u), cy - Math.cos(a) * (R + 13 * u));
      }
      ctx.textBaseline = 'alphabetic';
      // the sweep: a line and a fading wedge behind it
      const sw = snr().sweep;
      if (sw && sw.src === src.id) {
        const a = (sw.az * Math.PI) / 180 - hd - Math.PI / 2, g = ctx.createConicGradient ? ctx.createConicGradient(a - 0.6, cx, cy) : null;
        ctx.save(); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, a - 0.6, a); ctx.closePath(); ctx.fillStyle = 'rgba(100,255,218,.16)'; ctx.fill(); ctx.restore();
        ctx.strokeStyle = sw.pause > 0 ? '#ffd24a' : '#64ffda'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.stroke(); void g;
      }
      // contacts
      hits.length = 0; const st = snr();
      for (const c of cons) {
        // the bearing line: from the centre, or (a contact only another listener hears) from that listener's place; it ends on the outer ring
        let o = { x: cx, y: cy }; if (c.remote) { const t = toward(src, c.from); o = at(t.brg, t.nm); }
        const ra = (c.bearing * Math.PI) / 180 - hd, dx = Math.sin(ra), dy = -Math.cos(ra), ox = o.x - cx, oy = o.y - cy, bq = ox * dx + oy * dy, disc = bq * bq - (ox * ox + oy * oy - R * R);
        const tt = disc < 0 ? -1 : -bq + Math.sqrt(disc), picked = st.sel === c.id;
        if (!c.pos && tt <= 0) continue;   // heard by a listener outside the map and pointing away: nothing to draw at this range
        const edge = c.pos || tt > 0 ? { x: o.x + dx * Math.max(tt, 0), y: o.y + dy * Math.max(tt, 0) } : o;
        ctx.save(); if (c.lost) ctx.setLineDash([4, 6]);
        ctx.strokeStyle = picked ? '#ffd24a' : c.lost ? 'rgba(200,225,255,.22)' : 'rgba(210,235,255,.42)'; ctx.lineWidth = picked ? 2.4 : 1.2; ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(edge.x, edge.y); ctx.stroke(); ctx.restore();
        const inside = c.pos && c.range <= range, p = c.pos ? (inside ? at(c.bearing, c.range) : at(c.bearing, range)) : edge, rad = 11 * u;
        ctx.save(); ctx.translate(p.x, p.y); ctx.globalAlpha = c.lost ? 0.4 : c.pos && !inside ? 0.7 : 1;
        if (picked) { ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(0, 0, rad + 7 * u, 0, 6.2832); ctx.stroke(); }
        drawContact(ctx, c.pos ? c.icon.type : 'unknown', c.pos ? c.icon.aff : 'unknown', rad);
        ctx.restore();
        ctx.font = `${12.5 * u}px system-ui`; ctx.textBaseline = 'middle'; ctx.fillStyle = c.pos ? '#e6f4ff' : '#f5e27a'; ctx.globalAlpha = c.lost ? 0.5 : 1;
        const label = c.pos ? `${c.name}  ${c.range.toFixed(1)}` : `${pad3(c.bearing)}°`, left = p.x > cx + R * 0.45;
        ctx.textAlign = left ? 'right' : 'left'; ctx.fillText(label, p.x + (left ? -rad - 5 * u : rad + 5 * u), p.y); ctx.globalAlpha = 1; ctx.textBaseline = 'alphabetic';
        hits.push({ id: c.id, x: p.x, y: p.y, r: rad + 10 * u, x1: o.x, y1: o.y, x2: edge.x, y2: edge.y });
      }
      // the listener: a small arrow, heading up
      ctx.save(); ctx.translate(cx, cy); ctx.fillStyle = '#64ffda'; ctx.beginPath(); ctx.moveTo(0, -9 * u); ctx.lineTo(6 * u, 7 * u); ctx.lineTo(0, 3 * u); ctx.lineTo(-6 * u, 7 * u); ctx.closePath(); ctx.fill(); ctx.restore();
      ctx.fillStyle = '#9fd6e8'; ctx.font = `${12 * u}px system-ui`; ctx.textAlign = 'left'; ctx.fillText('TRACK UP', 8, 16 * u); ctx.fillText(`RANGE ${range} NM`, 8, 30 * u);
    }
    // a tap: on a symbol, or near a bearing line
    canvas.addEventListener('click', (ev) => {
      const r = canvas.getBoundingClientRect(), x = ((ev.clientX - r.left) * W) / r.width, y = ((ev.clientY - r.top) * H) / r.height;
      let best = null, bd = 1e9;
      for (const h of hits) {
        const dI = Math.hypot(x - h.x, y - h.y); if (dI <= h.r && dI < bd) { best = h; bd = dI; }
        const dx = h.x2 - h.x1, dy = h.y2 - h.y1, L = Math.hypot(dx, dy) || 1, t = ((x - h.x1) * dx + (y - h.y1) * dy) / (L * L), dl = Math.hypot(x - (h.x1 + dx * t), y - (h.y1 + dy * t));
        if (t > 0 && t <= 1.02 && dl < 16 && dl + 8 < bd) { best = h; bd = dl + 8; }
      }
      const st = snr(); if (best) select(best.id); else if (st.sel) select(st.sel);   // a tap on a contact opens it, a second tap closes it
    });

    function update() {
      const src = source(), st = snr(), cons = contactsFor(src.id), sel = selected(), sw = st.sweep;
      draw(src, cons);
      set(head, `PASSIVE SONAR · ${src.name}${src.ok ? '' : ' · NO LINK'}`);
      const live = cons.filter((c) => !c.lost).length;
      set(stat, sw ? `FULL SWEEP ${Math.round(sw.az)}°${sw.pause > 0 ? ' · CONTACT' : ''}` : st.scan ? `SCANNING… ${Math.max(0, Math.ceil(st.scan.until - sim.s.clock))} s` : `${live} CONTACT${live === 1 ? '' : 'S'}${cons.length > live ? ` · ${cons.length - live} FADED` : ''}`);
      stat.className = 'snr-stat' + (sw || st.scan ? ' act' : '');
      list.hidden = !!sel; info.hidden = !sel;
      if (sel) {
        const tag = (sel.lost ? 'SIGNAL LOST' : sel.scanned ? 'SCANNED' : '');
        set(iName, sel.name); iName.style.color = sel.hostile ? '#ff7a7a' : '';
        set(iType, [sel.type, sel.side === 'Unknown' ? '' : sel.side.split(' · ')[0], tag].filter(Boolean).join(' · '));
        set(iVals.brg, pad3(sel.bearing) + '°'); set(iVals.rng, sel.range == null ? 'NO FIX' : sel.range.toFixed(1) + ' nm'); set(iVals.dep, sel.depth); set(iVals.spd, sel.speed);
        set(iVals.crs, sel.course == null ? '—' : pad3(sel.course) + '°'); set(iVals.age, ageText(sel.age));
        set(iNotes, [...sel.notes, sel.inv.length ? `${sel.inv.join(', ')} investigating` : sel.remote ? `Heard by ${sel.byName}` : ''].filter(Boolean).join('\n'));
        return;
      }
      const keep = new Set();
      for (const c of cons) {
        const r = rowFor(c); keep.add(c.id);
        const key = c.icon.type + c.icon.aff + (c.pos ? 'f' : 'u') + (c.lost ? 'l' : '');
        if (r.key !== key) { r.key = key; r.ic.innerHTML = contactSvg(c.pos ? c.icon.type : 'unknown', c.pos ? c.icon.aff : 'unknown', 34); }
        set(r.nm, c.pos ? c.name : 'Unknown contact'); set(r.sub, `BRG ${pad3(c.bearing)}°${c.lost ? ' · LOST' : c.remote ? ' · ' + c.byName : c.inv.length ? ' · WSKR' : ''}`); set(r.rg, c.range != null ? c.range.toFixed(1) + ' nm' : ageText(c.age));
        r.b.classList.toggle('lost', c.lost); r.b.style.setProperty('--col', frameColour(c.icon.aff));
      }
      for (const [id, r] of rows) if (!keep.has(id)) { r.b.remove(); rows.delete(id); }
      const want = cons.map((c) => rows.get(c.id).b);
      if (want.some((b, i) => list.children[i] !== b)) list.replaceChildren(...want);
      if (!cons.length) { if (!list._empty) { list._empty = el('div', { class: 'snr-empty', text: 'NO CONTACTS' }); } if (list.firstChild !== list._empty) list.replaceChildren(list._empty); }
    }
    const out = { m, update };
    copies.push(out); return out;
  }

  // ---- centre controls: Source, Full sweep; with a contact picked, Scan, Investigate and Clear ----
  const srcB = bbtn('Source', () => { open = !open; side(); });
  const sweepB = bbtn('Full sweep', () => { if (sweeping()) stopSweep(); else if (!startSweep()) return; side(); });
  const atSite = () => { const a = sim.s.at; return a && a.type !== 'dock' && !scanned(a) ? a : null; };   // the ship at a site it has not scanned yet
  const siteB = bbtn('Scan site', () => { const a = atSite(); if (a && fileScan(a)) tell('sensors', `Scan filed: ${a.name}`, 'mission'); side(); });
  const survB = bbtn('Survey site', () => {   // hold station at a site for 30 minutes: a detailed chart and a survey finding (survey.js)
    if (surveying()) { stopSurvey('captain'); side(); return; }
    const x = startSurvey(); tell('sensors', x.ok ? `Surveying ${surveySite().name}, Captain. Thirty minutes. Hold station.` : x.why === 'fast' ? `Slow to ${SURVEY_KT} knots or less to survey` : 'Bring the ship to a site first', x.ok ? 'mission' : 'error'); side(); });
  const scanB = bbtn('Scan', () => { startScan(); side(); });
  const clearB = bbtn('Clear', () => { const st = snr(); if (st.sel) select(st.sel); side(); });
  const invB = bbtn('Investigate', () => { toggleInvestigate(); side(); sim.touch(); });
  const r1 = el('div', { class: 'rowN' }, srcB, sweepB, siteB, survB), r2 = el('div', { class: 'rowN' }, scanB, invB, clearB), srcList = el('div', { class: 'snr-srcs' });
  const c = el('div', { class: 'bc' }, r1, r2, srcList);
  let open = false, srcSig = '';
  function side() {
    const st = snr(), sel = selected(), srcs = sources();
    set(rangeTxt, view.range + ' NM');
    srcB.classList.toggle('on', open); sweepB.classList.toggle('on', !!st.sweep); sweepB.textContent = st.sweep ? 'Stop sweep' : 'Full sweep'; sweepB.disabled = !source().ok && !st.sweep;
    r2.hidden = !sel || open; r1.hidden = open; srcList.hidden = !open; siteB.hidden = !atSite();
    const sv = surveying(); survB.hidden = !sv && !surveySite(); survB.classList.toggle('on', !!sv); survB.textContent = sv ? `Surveying ${Math.max(1, Math.ceil((sv.end - sim.s.clock) / 60))} min` : 'Survey site';
    scanB.disabled = !canScan(); scanB.textContent = st.scan ? 'Scanning' : 'Scan'; scanB.classList.toggle('on', !!st.scan);
    invB.disabled = !canInvestigate(); invB.classList.toggle('on', !!(sel && sel.inv.length)); invB.textContent = sel && sel.inv.length ? 'Investigating' : 'Investigate';
    const sig = open + '|' + st.src + '|' + srcs.map((x) => x.id + x.name + x.ok).join();
    if (open && sig !== srcSig) {
      srcSig = sig; const bs = srcs.map((x) => { const b = bbtn(x.ok ? x.name : x.name + ' · NO LINK', () => { setSource(x.id); open = false; side(); }, x.id === st.src ? 'on' : ''); b.disabled = !x.ok; return b; });
      srcList.replaceChildren(...[0, 3].map((i) => el('div', { class: 'rowN' }, ...bs.slice(i, i + 3))).filter((r) => r.children.length));
    }
  }
  return { make, c, v: [bbtn('−', () => zoom(1), 'sym'), el('div', { class: 'rngbox' }, el('small', { text: 'RANGE' }), rangeTxt), bbtn('+', () => zoom(-1), 'sym')], expand: null, side };
}

/** The Sensors station's main page: the SNR display with its controls and range buttons under it, in station buttons. */
export function mountSnr(body) {
  const bbtn = (text, onclick, cls = '') => el('button', { class: `bbtn ${cls}`, text, onclick });
  const v = createSnrView({ bbtn }), page = v.make(false);
  const screen = el('div', { style: 'position:relative;flex:1;min-height:330px' }, page.m);
  const ctl = el('div', { class: 'bc', style: 'position:relative;inset:auto;flex:none;height:120px' }, ...v.c.children);
  const range = el('div', { class: 'rowN', style: 'flex:none;height:64px' }, ...v.v);
  body.append(screen, el('div', { class: 'msc', style: 'flex:none;display:flex;flex-direction:column;gap:6px' }, ctl, range));
  return { update() { page.update(); v.side(); }, el: [screen, ctl, range] };
}
