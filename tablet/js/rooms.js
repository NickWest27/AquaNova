// Rooms open as the story needs them, and crew join the communicator once the Captain has been to their room (owner, 2026-11-27).
// Open from the start: the Launch Bay (where the Captain arrives), walkways AN-1 and A1, the quarters and the bridge.
// A mission opens the rest with the action { "type": "unlock_room", "room": "science" }: the lab and sick bay when the first survey
// needs samples, Engineering when the trials reach the AO. A tap on a locked door gets an excuse from ARIA (app.js).
// ?open=1 in the URL opens every room (development).
import { gameState } from './persist.js';

export const START_ROOMS = ['launchbay', 'walkway', 'walkway2', 'quarters', 'bridge'];
const ALL_OPEN = /[?&]open=1/.test(location.search);
export const isOpen = (room) => ALL_OPEN || START_ROOMS.includes(room) || (gameState.getProperty('progress.roomsOpen') || []).includes(room);
export function openRoom(room) { const l = gameState.getProperty('progress.roomsOpen') || []; if (!l.includes(room)) gameState.updateProperty('progress.roomsOpen', [...l, room]); }

// who works in each room: visiting it puts them on the communicator
export const ROOM_CREW = { bridge: ['helm', 'communications', 'sensors'], launchbay: ['security'], science: ['science'], medbay: ['science'], engineering: ['engineering'] };
export function visit(room) {
  for (const id of ROOM_CREW[room] || []) if (gameState.getProperty(`contacts.crew.${id}`) && !gameState.getProperty(`contacts.crew.${id}.known`)) gameState.updateProperty(`contacts.crew.${id}.known`, true);
}

// ARIA's excuse at a locked door: who is behind it, and what to do instead. {task} is the current objective.
export const LOCKED = {
  science: 'I will introduce you to Dr. Patel later, {captain}. Her lab is still being unpacked. For now, {task}.',
  medbay: 'The sick bay is Dr. Patel\'s, and she is still setting it up, {captain}. I will introduce you when we need her. For now, {task}.',
  engineering: 'Chief Doyle is deep in the plant getting it ready for the trials, {captain}, and he does not like visitors before a run. I will introduce you when we need him. For now, {task}.',
};
