// utils/log.js
// Debug logging switch. Normal play stays quiet; debug mode shows everything.
//
// Turn on:  open any page with ?debug=1   (remembered in localStorage)
// Turn off: open any page with ?debug=0
//
// Use dlog() for routine progress messages. Keep console.warn and
// console.error for real problems: they always show.

function readDebugFlag() {
  try {
    const query = new URLSearchParams(window.location.search).get('debug');
    if (query === '1') localStorage.setItem('aquaNova_debug', '1');
    if (query === '0') localStorage.removeItem('aquaNova_debug');
    return localStorage.getItem('aquaNova_debug') === '1';
  } catch (error) {
    return false;
  }
}

export const DEBUG = readDebugFlag();

export function dlog(...args) {
  if (DEBUG) console.log(...args);
}
