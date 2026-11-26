// Flow diagrams for the engineering computer: an SVG kit of pumps, fans, valves, breakers, tanks, units, nozzles and doors, joined by pipes
// and wires coloured by what they carry. Live lines flow (animated dashes); a tappable part has a finger-sized hit area.
// drawSchematic({ nodes, links }) -> <svg> in a 600 x 300 box. Styles: "Schematics" in tablet.css.
const NS = 'http://www.w3.org/2000/svg';
const mk = (tag, attrs = {}, kids = []) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v); for (const c of kids) if (c) n.append(c); return n; };
const text = (x, y, s, cls = 'sch-lbl', anchor = 'middle') => { const t = mk('text', { x, y, class: cls, 'text-anchor': anchor }); t.textContent = s; return t; };
export const MEDIUM = { power: '#ffd666', sea: '#2f8fd8', water: '#59c3ff', air: '#dfe9f5', o2: '#64ffda', co2: '#9aa6b5', coolant: '#ff9a3c', agent: '#ff6b6b', gas: '#c792ff' };

function body(n) {
  const on = !!n.on, st = on ? 'on' : 'off';
  switch (n.kind) {
    case 'pump': return [mk('circle', { r: 17, class: `sch-part ${st}` }), mk('path', { d: 'M-9,8 L0,-10 L9,8 Z', class: `sch-imp ${on ? 'spin' : ''}` })];
    case 'fan': return [mk('circle', { r: 17, class: `sch-part ${st}` }), mk('g', { class: `sch-imp ${on ? 'spin' : ''}` }, [0, 120, 240].map((a) => mk('path', { d: 'M0,0 L4,-13 L-4,-13 Z', transform: `rotate(${a})` })))];
    case 'valve': return [mk('path', { d: 'M-15,-10 L15,10 L15,-10 L-15,10 Z', class: `sch-valve ${on ? 'open' : 'shut'}` })];
    case 'breaker': return [mk('circle', { cx: -14, r: 4, class: 'sch-dot' }), mk('circle', { cx: 14, r: 4, class: 'sch-dot' }), mk('line', { x1: -14, y1: 0, x2: on ? 14 : 9, y2: on ? 0 : -14, class: `sch-arm ${st}` })];
    case 'tank': { const w = n.w || 54, h = n.h || 64, f = Math.max(0, Math.min(1, n.level ?? 0)); return [mk('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: 6, class: 'sch-tank' }), mk('rect', { x: -w / 2 + 3, y: h / 2 - 3 - (h - 6) * f, width: w - 6, height: (h - 6) * f, rx: 3, class: 'sch-fill', fill: n.color || '#59c3ff' }), text(0, 5, `${Math.round(f * 100)}%`, 'sch-val')]; }
    case 'unit': { const w = n.w || 96, h = n.h || 40; return [mk('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: 8, class: `sch-unit ${st}` }), text(0, 5, n.inner || '', 'sch-inner')]; }
    case 'nozzle': return [mk('path', { d: 'M-12,-8 L12,-8 L6,8 L-6,8 Z', class: `sch-part ${n.alarm ? 'alarm' : st}` }), n.alarm ? mk('path', { d: 'M0,26 C-10,14 -4,8 0,14 C2,6 10,10 0,26 Z', class: 'sch-flame' }) : null];
    case 'door': return [mk('rect', { x: -7, y: -26, width: 14, height: 52, rx: 3, class: `sch-door ${on ? 'open' : 'shut'}` })];
    case 'lever': return [mk('rect', { x: -(n.w || 84) / 2, y: -18, width: n.w || 84, height: 36, rx: 6, class: `sch-lever ${n.alarm ? 'alarm' : ''}` }), text(0, 6, n.inner || '', 'sch-inner')];
    default: return [];   // 'src' / 'sink': a label only
  }
}

/** Draw a diagram. nodes: { id, kind, x, y, label, on, level, color, inner, w, h, alarm, tap }; links: { pts: [[x,y]...], medium, live } */
export function drawSchematic({ nodes, links }) {
  const svg = mk('svg', { viewBox: '0 0 600 300', class: 'sch', preserveAspectRatio: 'xMidYMid meet' });
  for (const l of links) {
    const d = 'M' + l.pts.map((p) => p.join(',')).join(' L');
    svg.append(mk('path', { d, class: 'sch-pipe', stroke: MEDIUM[l.medium] || '#888' }));
    if (l.live) svg.append(mk('path', { d, class: 'sch-flow', stroke: MEDIUM[l.medium] || '#888' }));
  }
  for (const n of nodes) {
    const g = mk('g', { transform: `translate(${n.x},${n.y})`, class: 'sch-node' + (n.tap ? ' tap' : '') + (n.alarm ? ' alarm' : '') });
    g.append(...body(n));
    if (n.label) { const below = n.kind === 'src' || n.kind === 'sink' ? 4 : n.kind === 'tank' ? (n.h || 64) / 2 + 15 : n.kind === 'door' ? 40 : n.kind === 'unit' || n.kind === 'lever' ? (n.h || 40) / 2 + 15 : 32; g.append(text(n.lx || 0, n.ly != null ? n.ly : below, n.label, n.kind === 'src' || n.kind === 'sink' ? 'sch-end' : 'sch-lbl', n.anchor || 'middle')); }
    if (n.state) g.append(text(0, -26, n.state, 'sch-state'));
    if (n.tap) { g.append(mk('rect', { x: -32, y: -32, width: 64, height: 64, class: 'sch-hit' })); g.addEventListener('click', (ev) => { ev.stopPropagation(); n.tap(); }); }
    svg.append(g);
  }
  return svg;
}
