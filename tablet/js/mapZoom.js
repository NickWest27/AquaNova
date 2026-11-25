// Zoom buttons for a map: two round buttons and the range between them, in the map's top-right corner (the WSKR page style, the default for every zoomable map).
// One direction everywhere: "+" zooms in (shorter range), "−" zooms out. step(d): d = -1 is a shorter range, +1 a longer one.
// The bridge main screen is not tappable, so its range buttons are on the right desk console instead (bridge.js), same direction.
import { el } from './util.js';

export function mapZoom(step) {
  const label = el('span', { class: 'map-range' });
  const box = el('div', { class: 'map-zoom' },
    el('button', { class: 'btn chip', text: '−', 'aria-label': 'Zoom out', onclick: () => step(1) }),
    label,
    el('button', { class: 'btn chip', text: '+', 'aria-label': 'Zoom in', onclick: () => step(-1) }));
  return { box, label };
}
