// The stand-alone sound board page (soundboard.html). The buttons come from soundboardKit.js (also in PED > Settings > Sound).
import '../../utils/debugPanel.js';
import { buildBoard, BOARD_CSS } from './soundboardKit.js';

document.head.append(Object.assign(document.createElement('style'), { textContent: BOARD_CSS }));
let ac = null, out = null;
function audio() {   // started by the first tap (iPad rule), through the page's volume slider
  if (!ac) {
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* older iOS */ }
    const AC = window.AudioContext || window.webkitAudioContext; ac = new AC();
    out = ac.createGain(); out.gain.value = document.getElementById('vol').value / 100; out.connect(ac.destination);
  }
  if (ac.state !== 'running') ac.resume();
  return { ac, out };
}
document.getElementById('vol').addEventListener('input', (e) => { if (out) out.gain.value = e.target.value / 100; });
const toast = (t) => { const b = document.getElementById('toast'); b.textContent = t; b.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => b.classList.remove('on'), 1800); };
const board = buildBoard(document.getElementById('board'), audio, toast);
document.getElementById('stop').addEventListener('click', () => {
  board.stopAll();
  if (out) { const o = out; o.gain.setTargetAtTime(0, ac.currentTime, 0.05); out = ac.createGain(); out.gain.value = document.getElementById('vol').value / 100; out.connect(ac.destination); setTimeout(() => o.disconnect(), 400); }
});
document.getElementById('copy').addEventListener('click', () => board.copyNames());
document.getElementById('reset').addEventListener('click', () => { if (confirm('Put every name back to the original?')) board.resetNames(); });
