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
  const badge = el('div', 'rbadge', '', 'left:60px;top:106px;display:none');
  root.append(
    hs('COMMS', 14, 88, 78, 52, 'comms'), hs('SENSORS', 228, 88, 78, 52, 'sensors'), hs('WALKWAY', 100, 194, 120, 22, 'walkway'),
    box('rtop', 90, 17, 156, 10, topD), box('rmain', 30, 47, 276, 65, mainD), box('rdisp', 120, 122, 96, 29, dispD),
    box('rleft', 57, 157, 54, 32, leftD), box('rctl', 112, 157, 100, 32, ctrD), box('rright', 214, 157, 54, 32, rightD),
    box('rstnL', 45, 109, 36, 16, stnL), box('rstnR', 253, 109, 26, 16, stnR), badge);
  const msg = el('div', 'rmsg'); msg.id = 'console-line'; root.append(msg);
  root.append(el('div', 'rwalk', '▼ WALKWAY'));
  function updateStations() {
    const s = sim.s, act = activeLink(), st = act ? linkState(act) : null;
    setText(stnL.firstChild || stnL.appendChild(el('div')), 'COMMS'); if (!stnL.children[1]) stnL.append(el('div'));
    setText(stnL.children[1], st ? (st.up ? 'LINK UP' : 'NO LINK') : 'NO LINK'); setClass(stnL.children[1], st && st.up ? 'ok' : 'bad');
    if (!stnR.firstChild) stnR.append(el('div'), el('div'));
    setText(stnR.children[0], 'SNR'); setText(stnR.children[1], s.sonar ? 'ACT' : 'OFF'); setClass(stnR.children[1], s.sonar ? 'ok' : 'bad');
    const n = unreadCount(); badge.style.display = n ? 'block' : 'none'; setText(badge, String(n));
  }
  function update() { api.update(); updateStations(); }
  update();
  return { update, root, console: api };
}
