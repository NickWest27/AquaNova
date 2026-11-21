// Contact symbols for the tactical plot, in the style of a NATO-like naval table (as Sub Command uses).
// Colour says whose it is: blue friendly, green neutral, orange unfriendly, red hostile, pale yellow unknown.
// The frame also changes with the side: friendly circle, neutral and unfriendly square, hostile diamond, unknown square.
// Types in use: surface (frame with a dot), sub (a bowl with a dot above it), installation (square with a grid), unknown ("?" in brackets).
// Drawn on a canvas with drawContact, or as an inline svg string for lists with contactSvg. Both use the same shape data (-1..1 box).
const COL = { friendly: '#5cb8ff', neutral: '#6fd36f', unfriendly: '#ff8a2a', hostile: '#ff4d4d', unknown: '#f5e27a' };
export const frameColour = (aff) => COL[aff];
/** The side a ship is shown as. An unidentified contact is always unknown. Faction stance: friendly, neutral, wary (unfriendly), hostile. */
export const affiliation = (v) => (!v.ident ? 'unknown' : v.stance === 'hostile' ? 'hostile' : v.stance === 'wary' ? 'unfriendly' : v.stance === 'friendly' ? 'friendly' : 'neutral');
/** Same, for a place on the chart (the Aqua Nova's own docks count as friendly). */
export const placeAffiliation = (p) => (p.stance === 'hostile' ? 'hostile' : p.stance === 'wary' ? 'unfriendly' : p.stance === 'neutral' ? 'neutral' : 'friendly');

const FRAME = {
  friendly: 'M-1,0a1,1 0 1,0 2,0a1,1 0 1,0 -2,0z',
  neutral: 'M-0.9,-0.9H0.9V0.9H-0.9z', unfriendly: 'M-0.9,-0.9H0.9V0.9H-0.9z', unknown: 'M-0.9,-0.9H0.9V0.9H-0.9z',
  hostile: 'M0,-1.25L1.25,0L0,1.25L-1.25,0z',
};
const BOWL = {   // the submarine mark: round bowl for friendly, square bowl for neutral, unfriendly and unknown, a V for hostile
  friendly: 'M-1,-0.1a1,1 0 0,0 2,0', hostile: 'M-1.1,-0.5L0,0.8L1.1,-0.5', other: 'M-0.9,-0.3V0.8H0.9V-0.3',
};
const GRID = 'M-0.9,-0.9H0.9V0.9H-0.9zM-0.3,-0.9V0.9M0.3,-0.9V0.9M-0.9,-0.3H0.9M-0.9,0.3H0.9';
const bowl = (aff) => BOWL[aff === 'friendly' ? 'friendly' : aff === 'hostile' ? 'hostile' : 'other'];
const DOT = 'M-0.2,0a0.2,0.2 0 1,0 0.4,0a0.2,0.2 0 1,0 -0.4,0z';
const DOT_UP = 'M-0.2,-0.55a0.2,0.2 0 1,0 0.4,0a0.2,0.2 0 1,0 -0.4,0z';
const QUERY = 'M-0.9,-0.5V-0.9H-0.5M0.5,-0.9H0.9V-0.5M0.9,0.5V0.9H0.5M-0.5,0.9H-0.9V0.5';

/** Pieces to draw for a type and side: { fill?: path, line?: path, dot?: path, text?: '?' }. */
function shape(type, aff) {
  if (type === 'sub') return { line: bowl(aff), dot: DOT_UP };
  if (type === 'installation') return { fill: FRAME.neutral, line: GRID };
  if (type === 'unknown') return { line: QUERY, text: '?' };
  return { fill: FRAME[aff], dot: DOT };   // surface unit
}
const cache = {};
const p2d = (d) => cache[d] || (cache[d] = new Path2D(d));
/** Draw a contact symbol at the current origin, half-size r. type: 'surface' | 'sub' | 'installation' | 'unknown'. */
export function drawContact(ctx, type, aff, r, { faint = false } = {}) {
  const sh = shape(type, aff), col = COL[aff];
  ctx.save(); ctx.scale(r, r); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.lineWidth = 2.2 / r;
  if (sh.fill) { ctx.globalAlpha = faint ? 0.45 : 1; ctx.fillStyle = col; ctx.fill(p2d(sh.fill)); ctx.strokeStyle = '#04101f'; ctx.stroke(p2d(sh.fill)); ctx.globalAlpha = 1; }
  if (sh.line) { ctx.strokeStyle = sh.fill ? '#04101f' : col; ctx.lineWidth = (sh.fill ? 1.2 : 3) / r; ctx.stroke(p2d(sh.line)); }
  if (sh.dot) { ctx.fillStyle = sh.fill ? '#04101f' : col; ctx.fill(p2d(sh.dot)); }
  if (sh.text) { ctx.fillStyle = col; ctx.font = '700 1.3px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(sh.text, 0, 0.05); }
  ctx.restore();
}
/** The same symbol as an inline svg string for lists. */
export function contactSvg(type, aff, px = 18) {
  const sh = shape(type, aff), col = COL[aff], dark = '#04101f';
  const parts = [];
  if (sh.fill) parts.push(`<path d="${sh.fill}" fill="${col}" stroke="${dark}" stroke-width="0.12"/>`);
  if (sh.line) parts.push(`<path d="${sh.line}" fill="none" stroke="${sh.fill ? dark : col}" stroke-width="${sh.fill ? 0.1 : 0.22}" stroke-linecap="round" stroke-linejoin="round"/>`);
  if (sh.dot) parts.push(`<path d="${sh.dot}" fill="${sh.fill ? dark : col}"/>`);
  if (sh.text) parts.push(`<text x="0" y="0.45" font-size="1.3" font-weight="700" text-anchor="middle" fill="${col}">?</text>`);
  return `<svg width="${px}" height="${px}" viewBox="-1.4 -1.4 2.8 2.8" aria-hidden="true">${parts.join('')}</svg>`;
}
