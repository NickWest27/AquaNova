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
  for (const kid of kids.flat()) if (kid != null) node.append(kid.nodeType ? kid : document.createTextNode(kid));
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

export function toast(text, kind = '') {
  const box = document.getElementById('toasts');
  if (!box) return;
  const t = el('div', { class: `toast ${kind}`, text });
  box.append(t);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => t.classList.add('out'), 3200);
  setTimeout(() => t.remove(), 3600);
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
