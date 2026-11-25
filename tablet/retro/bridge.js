// The retro bridge, 320 x 240. The picture (assets/bridge.png) is the pixel-art bridge; the real bridge console (js/bridge.js)
// is mounted on its screens and desks, so the game works exactly as before. Only the look changed.
// Boxes are in art pixels (the picture is 320 x 240).
import { sim } from '../js/sim.js';
import { unreadCount } from '../js/notify.js';
import { LINKS, linkState, activeLink } from '../js/commsModel.js';
import { createBridgeConsole } from '../js/bridge.js';
import { createND } from './navChart.js';
import { el, setText, setClass } from './ui.js';

export const waterSlot = (m) => (m < 10 ? 25 : m < 40 ? 24 : m < 100 ? 23 : m < 250 ? 22 : m < 500 ? 21 : m < 1000 ? 20 : m < 2000 ? 19 : m < 4000 ? 18 : m < 7000 ? 17 : 16);
const SHORT = { Route: 'Rte', Port: 'Prt', Stbd: 'Sbd', Stop: 'Stp', Slow: 'Slo', Fast: 'Fst', Srfc: 'Srf', Cruise: 'Crs', Dest: 'Dst' };
const box = (cls, x, y, w, h, kid) => { const b = el('div', `rbox ${cls}`, null, `left:${x}px;top:${y}px;width:${w}px;height:${h}px`); if (kid) b.append(kid); return b; };

export function createBridge(stage, { onOpen }) {
  const root = el('div', 'rabs rbridge', null, 'inset:0'); stage.append(root);
  root.append(el('img', 'rart', null, 'left:0;top:0;width:320px;height:240px')); root.firstChild.src = new URL('./assets/bridge.png', import.meta.url).href; root.firstChild.alt = '';
  const topD = el('div', 'bt'), mainD = el('div', 'bmain'), ctrD = el('div', 'bctl'), leftD = el('div', 'bleft'), rightD = el('div', 'bright'), dispD = el('div', 'bdisp');
  const api = createBridgeConsole({ top: topD, main: mainD, display: dispD, center: ctrD, left: leftD, right: rightD, onExpand: (id) => onOpen(id), retro: { createND, short: SHORT } });
  // the two station screens (COMMS left, SENSORS right): two short lines each
  const stnL = el('div', 'rstn'), stnR = el('div', 'rstn');
  const hs = (label, x, y, w, h, id) => { const b = el('button', 'rhs', null, `left:${x}px;top:${y}px;width:${w}px;height:${h}px`); b.setAttribute('aria-label', label); b.onclick = () => onOpen(id); return b; };
  const badge = el('div', 'rbadge', '', 'left:60px;top:116px;display:none');
  // layers, bottom to top: black, the live screens, the frame picture (its holes are the screens), the desk controls, tap areas
  const art = root.firstChild; root.removeChild(art);
  root.append(el('div', 'rbase', null, 'left:0;top:0;width:320px;height:240px'),
    box('rtop', 106, 14, 108, 18, topD), box('rmain', 40, 36, 240, 96, mainD), box('rdisp', 116, 140, 89, 42, dispD),
    box('rstnL', 46, 128, 19, 13, stnL), box('rstnR', 255, 128, 19, 13, stnR), box('rside', 0, 55, 9, 45), box('rside', 311, 55, 9, 45), art,
    box('rleft deskc', 52, 190, 54, 32, leftD), box('rctl deskc', 106, 190, 108, 32, ctrD), box('rright deskc', 214, 190, 54, 32, rightD),
    hs('COMMS', 14, 88, 78, 40, 'comms'), hs('SENSORS', 228, 88, 78, 40, 'sensors'), badge);
  const walk = el('button', 'rbtn rwalk', 'WALK\u25b8'); walk.onclick = () => onOpen('walkway'); root.append(walk);
  const msg = el('div', 'rmsg'); msg.id = 'console-line'; root.append(msg);
  function updateStations() {
    const s = sim.s, act = activeLink(), st = act ? linkState(act) : null;
    if (!stnL.firstChild) stnL.append(el('div')); if (!stnR.firstChild) stnR.append(el('div'));
    setText(stnL.firstChild, 'COM'); setClass(stnL.firstChild, st && st.up ? 'ok' : 'bad');   // green: a link is up
    setText(stnR.firstChild, 'SNR'); setClass(stnR.firstChild, s.sonar ? 'ok' : 'bad');     // green: sonar is on
    const n = unreadCount(); badge.style.display = n ? 'block' : 'none'; setText(badge, String(n));
  }
  function update() { api.update(); updateStations(); }
  update();
  return { update, root, console: api };
}
