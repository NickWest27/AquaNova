// Role icons for crew contacts (communicator list). Simple line drawings, one per crew id, stroke follows the text colour.
const P = {
  executiveOfficer: '<circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="7.5"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/>',                       // ARIA: an eye / lens
  helm: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7.5"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5M5 5l3.5 3.5M15.5 15.5L19 19M19 5l-3.5 3.5M8.5 15.5L5 19"/>',   // ship's wheel
  science: '<path d="M9.5 3h5M10.5 3v6L5 19.5a1.5 1.5 0 0 0 1.3 2.2h11.4a1.5 1.5 0 0 0 1.3-2.2L13.5 9V3"/><path d="M7.8 15h8.4"/>',                              // flask
  engineering: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5l1.6 2.6 3-.6.6 3 2.6 1.6-1.6 2.6 1.6 2.6-2.6 1.6-.6 3-3-.6L12 21.5l-1.6-2.6-3 .6-.6-3-2.6-1.6 1.6-2.6L4.2 9.7l2.6-1.6.6-3 3 .6z"/>', // gear
  sensors: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.8"/><path d="M12 12l6-6"/><circle cx="16" cy="9" r="0.9"/>',                                  // sonar scope
  communications: '<path d="M12 21v-8"/><circle cx="12" cy="11" r="1.8"/><path d="M7.5 6.5a6.4 6.4 0 0 0 0 9M16.5 6.5a6.4 6.4 0 0 1 0 9M4.5 3.8a10.4 10.4 0 0 0 0 14.4M19.5 3.8a10.4 10.4 0 0 1 0 14.4"/>', // antenna and signal
  security: '<path d="M12 2.8l7.5 2.8v5.6c0 4.6-3.1 8.2-7.5 10-4.4-1.8-7.5-5.4-7.5-10V5.6z"/><path d="M8.8 12l2.4 2.4 4.2-4.6"/>',                                   // shield
  captain: '<path d="M3.5 15.5h17l-2 3.5h-13z"/><path d="M8 15.5V9l4-4 4 4v6.5"/>',
};
/** An inline SVG icon for a crew id, or null when there is none. */
export function crewIcon(id) {
  const d = P[id]; if (!d) return null;
  const span = document.createElement('span'); span.className = 'avatar-icon';
  span.innerHTML = `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  return span;
}
