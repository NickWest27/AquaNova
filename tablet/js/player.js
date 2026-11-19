// (Kept under progress.*: that section is part of every save. tutorial.* flags are not.)
// The player's name, captured at the arrival form. Formal: "Captain Surname". Informal: the first name.
import { gameState } from './persist.js';

export const getPlayer = () => { const p = gameState.getProperty('progress.player'); return p && p.surname ? p : null; };
export function setPlayer(first, surname) {
  gameState.updateProperty('progress.player', { first, surname, name: `${first} ${surname}`, rank: 'Captain' });
}
/** Text may hold {captain} (Captain Surname), {surname}, {first} or {name}. Without a name they fall back to plain "Captain". */
export function fill(text) {
  if (typeof text !== 'string' || !text.includes('{')) return text;
  const p = getPlayer();
  const v = { captain: p ? `Captain ${p.surname}` : 'Captain', surname: p ? p.surname : 'Captain', first: p ? p.first : 'Captain', name: p ? p.name : 'Captain', rank: 'Captain' };
  return text.replace(/\{(captain|surname|first|name|rank)\}/g, (_, k) => v[k]);
}
/** "mercer" / "o'neil" / "smith-jones" -> "Mercer" / "O'Neil" / "Smith-Jones" */
export const tidyName = (s) => s.trim().replace(/\s+/g, ' ').toLowerCase().replace(/(^|[\s'-])([a-zà-ɏ])/g, (_, a, b) => a + b.toUpperCase());
export const validName = (s) => /^[A-Za-zÀ-ɏ][A-Za-zÀ-ɏ '-]{0,23}$/.test(s.trim());
