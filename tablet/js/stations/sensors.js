// Sensors station: two pages. SONAR (the passive sonar display, the same as the bridge's SNR page: contacts, sweep, scan, and Scan site when the
// ship is at a site) and WSKRs (the autonomous remote sensors: launch, orders, investigate; tap a site on their chart to select it).
// The old "Sites and scans" page was removed on 2026-11-25 (owner): its information is on these two pages.
import { tell } from '../notify.js';
import { el } from '../util.js';
import { mountWskrPanel } from './wskr.js';
import { isCommissioned, EXCUSES } from '../unlocks.js';
import { mountSnr } from '../sonarView.js';

export function mount(body) {
  body.style.flexDirection = 'column';
  const pageB = el('div', { style: 'display:flex;flex-direction:column;flex:1;min-height:0;gap:0.6rem' });   // WSKRs
  const pageS = el('div', { style: 'display:flex;flex-direction:column;flex:1;min-height:0;gap:0.5rem' });   // the main page: SONAR, the same passive sonar display as the bridge
  let snrPage = null, panel = null, tab = 'snr';
  const tabs = el('div', { class: 'tabs' });
  const go = (t) => {
    if (t === 'wskrs' && !isCommissioned('wskr')) { tell('sensors', EXCUSES.wskr, 'error'); return; }
    tab = t; if (t === 'wskrs' && !panel) panel = mountWskrPanel(pageB);
    if (t === 'snr' && !snrPage) snrPage = mountSnr(pageS);
    tabs.replaceChildren(...[['snr', 'SONAR'], ['wskrs', 'WSKRs']].map(([id, label]) => el('button', { class: 'btn chip' + (tab === id ? ' on' : ''), text: label, onclick: () => go(id) })));
    pageS.hidden = tab !== 'snr'; pageB.hidden = tab !== 'wskrs'; update();
  };
  body.append(tabs, pageS, pageB); pageB.hidden = true;
  function update() {
    if (tab === 'snr') { if (snrPage) snrPage.update(); return; }
    if (panel) panel.update();
  }
  go('snr');
  return { update, destroy() { if (panel) panel.destroy(); } };
}
