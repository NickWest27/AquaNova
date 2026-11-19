// Small helpers shared by the tablet modules.
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const norm360 = (d) => ((d % 360) + 360) % 360;
export const angDiff = (to, from) => ((to - from + 540) % 360) - 180; // signed shortest turn
export const pad = (n, w = 3) => String(Math.round(n)).padStart(w, '0');

export function el(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) node.append(kid.nodeType ? kid : document.createTextNode(kid));
  return node;
}

export const $ = (sel, root = document) => root.querySelector(sel);

/** Pointer-based drag helper that works with finger, pencil and mouse. */
export function drag(node, { start, move, end }) {
  let id = null;
  node.addEventListener('pointerdown', (e) => {
    if (id !== null) return;
    id = e.pointerId;
    node.setPointerCapture(id);
    start && start(e);
    e.preventDefault();
  });
  node.addEventListener('pointermove', (e) => { if (e.pointerId === id) move && move(e); });
  const up = (e) => { if (e.pointerId === id) { id = null; end && end(e); } };
  node.addEventListener('pointerup', up);
  node.addEventListener('pointercancel', up);
}

/** App sets this: true while the bridge is on screen with no station or overlay open. Notices then go to the upper display only. */
export const viewProbe = { fn: () => false };

/** The console line: one docked readout at the bottom edge (no floating cards). In a station it stays until replaced; elsewhere it fades after a few seconds. */
let lineTimer = null;
export function consoleLine(text, kind = '') {
  const box = document.getElementById('console-line');
  if (!box) return;
  box.textContent = text; box.className = `on ${kind}`;
  clearTimeout(lineTimer);
  lineTimer = setTimeout(() => { box.classList.add('old'); if (!document.body.classList.contains('has-line')) box.classList.remove('on'); }, 7000);
}
export function toast(text, kind = '') {
  document.dispatchEvent(new CustomEvent('notice', { detail: { text, kind } }));   // the bridge's upper display shows it
  if (viewProbe.fn()) return;
  consoleLine(text, kind);
}

export function modal({ title, body, actions }) {
  const root = document.getElementById('modal-root');
  const close = () => back.remove();
  const bar = el('div', { class: 'actions' }, (actions || [{ label: 'OK', primary: true }]).map((a) =>
    el('button', { class: `btn ${a.primary ? 'primary' : ''} ${a.kind || ''}`, text: a.label, onclick: () => { close(); a.run && a.run(); } })));
  const back = el('div', { class: 'modal-back' }, el('div', { class: 'modal', role: 'dialog' }, title && el('h3', { text: title }), body, bar));
  root.append(back);
  return close;
}

/** Run fn at most once per animation frame. */
export function frameThrottle(fn) {
  let queued = false;
  return () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; fn(); }); };
}

/** Voice commands for the communicator (PED -> Settings). Off by default: the browser's speech service may send audio to its maker. Saved on this device only. */
export const voiceCmd = {
  get on() { try { return localStorage.getItem('aqua.voiceCommands') === '1'; } catch (e) { return false; } },
  set(v) { try { localStorage.setItem('aqua.voiceCommands', v ? '1' : '0'); } catch (e) { /* ignore */ } },
};
