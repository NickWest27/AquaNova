// Contact symbols, in the style of naval tactical displays (NTDS / APP-6, as in Cold Waters):
// the frame shows what we know about whose it is. Unknown = yellow clover, friendly = blue circle, neutral = green square,
// suspect = amber diamond, hostile = red diamond. Frames are SVG path strings in a -1..1 box, so canvas (Path2D) and HTML (svg) share them.
const clover = (() => { const r = 0.55, c = 0.5, o = (x, y) => `M${x - r},${y}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0z`; return o(-c, -c) + o(c, -c) + o(-c, c) + o(c, c); })();
const FRAMES = {
  unknown: { d: clover, col: '#ffd84a' },
  friendly: { d: 'M-1,0a1,1 0 1,0 2,0a1,1 0 1,0 -2,0z', col: '#5cb8ff' },
  neutral: { d: 'M-0.9,-0.9H0.9V0.9H-0.9z', col: '#4fe08a' },
  suspect: { d: 'M0,-1.15L1.15,0L0,1.15L-1.15,0z', col: '#ffb020' },
  hostile: { d: 'M0,-1.2L1.2,0L0,1.2L-1.2,0z', col: '#ff5a5a' },
};
/** Which frame a ship gets from what the player knows. An unidentified contact is always "unknown". */
export const affiliation = (v) => (!v.ident ? 'unknown' : v.stance === 'hostile' ? 'hostile' : v.stance === 'wary' ? 'suspect' : v.stance === 'friendly' ? 'friendly' : 'neutral');
export const frameColour = (aff) => FRAMES[aff].col;
const paths = {};
/** Draw a frame at the current origin with half-size r on a canvas. */
export function drawFrame(ctx, aff, r, { solid = true } = {}) {
  const f = FRAMES[aff], p = paths[aff] || (paths[aff] = new Path2D(f.d));
  ctx.save(); ctx.scale(r, r); ctx.lineWidth = 2 / r; ctx.strokeStyle = f.col; ctx.fillStyle = f.col + (solid ? '55' : '22'); ctx.fill(p); ctx.stroke(p); ctx.restore();
}
/** The same frame as an inline SVG string for lists. */
export const frameSvg = (aff, px = 18) => `<svg width="${px}" height="${px}" viewBox="-1.4 -1.4 2.8 2.8" aria-hidden="true"><path d="${FRAMES[aff].d}" fill="${FRAMES[aff].col}55" stroke="${FRAMES[aff].col}" stroke-width="0.14"/></svg>`;
