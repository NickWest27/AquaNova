// Room pictures and the Display > Pictures setting.
// "original" uses the pictures as the owner handed them over (smooth, any size); "retro" uses the 320x240 palette-snapped copies in hard pixels.
// Every tap area and sign is placed in stage pixels, so swapping a picture never moves them: the picture is always stretched to the same box.
import { el } from './util.js';

const KEY = 'aquaNova_pictures';
export const ART = {
  // bridge: the owner's 1448x1086 picture, cut to the art (1448x992) with real transparent holes; bridge.png is the 320x240 pixel frame
  bridge: { original: { src: 'retro/assets/bridge_original.png', smooth: true }, retro: { src: 'retro/assets/bridge.png', smooth: false } },
  // each room: the owner's original (smooth) and the 320x240 palette copy made by tools/snap_picture.py
  // walkway, walkway2 and medbay were soft paintings: tools/even_palette.py rebuilds them as pixel art at Engineering's pixel size (PNG)
  ...Object.fromEntries(['walkway', 'walkway2', 'quarters', 'science', 'launchbay', 'medbay', 'engineering'].map((n) => [n, { original: { src: `retro/assets/${n}_original.${['walkway', 'walkway2', 'medbay'].includes(n) ? 'png' : 'jpg'}`, smooth: true }, retro: { src: `retro/assets/${n}.png`, smooth: false } }])),
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

// Crew portraits (owner, 2026-11-26): the static portrait shown with what a crew member says on the communicator, and in the crew list.
// Like the rooms: the owner's original (smooth) and a 64x64 palette copy (Display > Pictures > Retro). Keyed by crew id (data/contacts.json).
export const PORTRAITS = {
  communications: { original: 'retro/assets/crew/communications_original.jpg', retro: 'retro/assets/crew/communications.png' },   // Nicole Brooks
  ...Object.fromEntries(['helm', 'executiveOfficer', 'science'].map((id) => [id, { original: `retro/assets/crew/${id}_original.jpg`, retro: `retro/assets/crew/${id}.png` }])),   // Marcus, ARIA, Dr. Patel (tools/crew_art.py)
};
/** One <img> per picture and class, made once and reused (it follows the Pictures setting; no new listener on every redraw). */
const pics = new Map();
function pic(set, id, cls) {
  const p = set[id]; if (!p) return null;
  const key = cls + '|' + id; let img = pics.get(key);
  if (!img) {
    img = el('img', { class: cls, alt: '', draggable: 'false', decoding: 'async' });
    const apply = () => { const q = getQuality(); img.classList.toggle('px', q === 'retro'); const src = p[q]; if (!img.src.endsWith(src)) img.src = src; };
    apply(); window.addEventListener('art-change', apply); pics.set(key, img);
  }
  return img;
}
/** A crew member's portrait (or null when there is none yet). */
export const portrait = (id, cls = 'portrait') => pic(PORTRAITS, id, cls);

// Crew scene pictures (owner, 2026-11-26): talking with this crew member, the communicator becomes a 90s-style dialogue screen: the picture
// fills the 4:3 box and a text box on the empty side carries what they say and the choices. Original and a 320x240 palette copy.
export const SCENES = {
  communications: { original: 'retro/assets/crew/communications_scene_original.jpg', retro: 'retro/assets/crew/communications_scene.png' },   // Nicole at the comms station (a stand-in until the owner has the over-the-shoulder pose)
  ...Object.fromEntries(['helm', 'executiveOfficer', 'science'].map((id) => [id, { original: `retro/assets/crew/${id}_scene_original.jpg`, retro: `retro/assets/crew/${id}_scene.png` }])),   // the owner's pictures, 2026-11-27
};
/** Where the text box goes on each scene picture: on the empty side. 'right' (default), 'left', or 'side-left' (narrow, beside a standing figure). */
export const SCENE_BOX = { helm: 'left', science: 'side-left' };
/** A crew member's scene picture (or null). */
export const scenePic = (id, cls = 'rd-pic') => pic(SCENES, id, cls);
