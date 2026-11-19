// Commissioning: systems the player has not been shown yet stay offline ("not commissioned").
// The first missions look like sea trials but each one teaches a system and commissions it.
// A mission commissions a station with the action { "type": "unlock_station", "station": "wskr" }.
// During development everything is commissioned. Add ?locked=1 to the URL to play with the gates on.
import { gameState } from './persist.js';

export const GATES_ON = /[?&]locked=1/.test(location.search);
// available from the first minute of play
export const ALWAYS = ['ped', 'crew', 'log'];
// older missions name stations the long way
const ALIAS = { communications: 'comms', logbook: 'log', navigation: 'nav', systems: 'sys', 'science lab': 'lab' };
const norm = (n) => { const k = String(n).toLowerCase(); return ALIAS[k] || k; };
// shown when a station is tried too early
export const EXCUSES = {
  helm: 'The helm has not been commissioned yet. Finish the ship tour with ARIA first.',
  nav: 'Navigation has not been commissioned yet. Finish your sea trials first.',
  sys: 'Systems monitoring has not been commissioned yet. Finish the ship tour first.',
  sensors: 'The sensor suite has not been commissioned yet. Learn to chart a course first.',
  comms: 'The communications console has not been commissioned yet. Use the communicator for now.',
  lab: 'The science lab has not been commissioned yet. The equipment is still in crates.',
  remora: 'Remora is still in its cradle and has not been commissioned yet.',
  wskr: 'The WSKR control link has not been commissioned yet. The drones are still being tested.',
  bay: 'The launch bay controls have not been commissioned yet.',
};
export const isCommissioned = (name) => !GATES_ON || ALWAYS.includes(name) || (gameState.getProperty('progress.stationsUnlocked') || []).map(norm).includes(name);
export const excuse = (name) => EXCUSES[name] || 'That system has not been commissioned yet.';
