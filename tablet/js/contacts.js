// The ship's contact list: anything the Captain can select as the current target. For now it is built from the sonar list
// (charted points of interest, tagged S1, S2, ...). Later other sources (radar, comms, WSKRs) add their own tags to the same list.
// A contact is { id, tag, name, label, lat, lon, source, type }. The selection is kept in sim.s.selContact (saved by persist.js).
import { sim } from './sim.js';

export const contactList = () => {
  const s = sim.s; let n = 0;
  return s.pois.map((p) => { n++; return { id: 'poi:' + p.id, tag: 'S' + n, name: p.name, label: `S${n} ${p.name}`, lat: p.lat, lon: p.lon, source: 'sonar', type: p.type, poi: p }; });
};
export const selectedContact = () => { const id = sim.s.selContact; return id ? contactList().find((c) => c.id === id) || null : null; };
/** Select a contact by id; selecting the one already selected clears it. Returns the new selection id (or null). */
export const selectContact = (id) => { sim.s.selContact = sim.s.selContact === id ? null : id; sim.touch(); return sim.s.selContact; };
