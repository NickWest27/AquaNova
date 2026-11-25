// Room pictures and the Display > Pictures setting.
// "original" uses the pictures as the owner handed them over (smooth, any size); "retro" uses the 320x240 palette-snapped copies in hard pixels.
// Every tap area and sign is placed in stage pixels, so swapping a picture never moves them: the picture is always stretched to the same box.
import { el } from './util.js';

const KEY = 'aquaNova_pictures';
export const ART = {
  // bridge: the owner's 1448x1086 picture, cut to the art (1448x992) with real transparent holes; bridge.png is the 320x240 pixel frame
  bridge: { original: { src: 'retro/assets/bridge_original.png', smooth: true }, retro: { src: 'retro/assets/bridge.png', smooth: false } },
  // each room: the owner's original (smooth) and the 320x240 palette copy made by tools/snap_picture.py
  ...Object.fromEntries(['walkway', 'quarters', 'science', 'launchbay', 'medbay', 'engineering'].map((n) => [n, { original: { src: `retro/assets/${n}_original.jpg`, smooth: true }, retro: { src: `retro/assets/${n}.png`, smooth: false } }])),
};

export const getQuality = () => { try { return localStorage.getItem(KEY) === 'retro' ? 'retro' : 'original'; } catch (e) { return 'original'; } };
export function setQuality(q) {
  try { localStorage.setItem(KEY, q === 'retro' ? 'retro' : 'original'); } catch (e) { /* storage may be unavailable: the choice then lasts until reload */ }
  window.dispatchEvent(new Event('art-change'));
}

/** A frame <img> for a scene that follows the setting live. */
export function artImg(name) {
  const img = el('img', { class: 'frame retro', alt: '', draggable: 'false', decoding: 'async' });
  const apply = () => { const a = ART[name][getQuality()]; img.classList.toggle('hires', a.smooth); if (!img.src.endsWith(a.src)) img.src = a.src; };
  apply(); window.addEventListener('art-change', apply);
  return img;
}
