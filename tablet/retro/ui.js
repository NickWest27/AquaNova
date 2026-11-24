// Small helpers for building retro screens on the 320 x 240 stage.
export const el = (tag, cls = '', text = null, style = '') => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; if (style) n.style.cssText = style; return n; };
/** A label at pixel (x, y). */
export const label = (stage, x, y, text, cls = '', style = '') => { const n = el('div', 'rlabel ' + cls, text, `left:${x}px;top:${y}px;${style}`); stage.append(n); return n; };
/** Set text only when it changed (cheap to call every tick). */
export const setText = (node, text) => { if (node.textContent !== text) node.textContent = text; };
export const setClass = (node, cls) => { if (node.className !== cls) node.className = cls; };
