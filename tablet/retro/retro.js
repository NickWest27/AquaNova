// The retro stage: a 320 x 240 box that is scaled by a WHOLE number of screen pixels and centred on the pixel grid.
// iPad Air 11 (820 x 1180 points, 2x): in landscape the best whole scale is 6 screen pixels = 3 points, so the stage is 960 x 720 points.
export const W = 320, H = 240;

/** The whole-number scale for a viewport. vw, vh in CSS points, dpr = screen pixels per point. Returns { s (screen pixels per art pixel), k (CSS scale), x, y (CSS offset) }. */
export function fitFor(vw, vh, dpr = 1) {
  const s = Math.max(1, Math.floor(Math.min((vw * dpr) / W, (vh * dpr) / H) + 1e-9));
  const ox = Math.floor((vw * dpr - W * s) / 2), oy = Math.floor((vh * dpr - H * s) / 2);   // whole screen pixels, so every art pixel sits on the screen grid
  return { s, k: s / dpr, x: Math.max(0, ox) / dpr, y: Math.max(0, oy) / dpr };
}
/** Put a stage in `root` and keep it fitted. Returns { stage, root, refit }. */
export function mountRetro(root) {
  root.classList.add('retro-root');
  const stage = document.createElement('div'); stage.className = 'retro-stage'; stage.id = 'retro-stage'; root.append(stage);
  const refit = () => {
    const f = fitFor(root.clientWidth || innerWidth, root.clientHeight || innerHeight, window.devicePixelRatio || 1);
    stage.style.transform = `translate(${f.x}px, ${f.y}px) scale(${f.k})`; root.dataset.scale = String(f.s);
  };
  refit(); addEventListener('resize', refit); addEventListener('orientationchange', refit);
  if (window.visualViewport) visualViewport.addEventListener('resize', refit);
  return { stage, root, refit };
}
