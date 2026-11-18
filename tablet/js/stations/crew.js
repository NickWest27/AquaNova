// Crew comms through the communicator pin (Star Trek style): crew on the left, the voice channel (transcript) in the middle, things to say on the right.
import { sim, toward } from '../sim.js';
import { el, toast } from '../util.js';
import { gameState } from '../persist.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];

export const knownCrew = () => Object.values(gameState.getProperty('contacts.crew') || {})
  .filter((c) => c && c.id !== 'captain' && c.known && c.name);

const docked = () => sim.s.docked;
const HEADINGS = [['North 000', 0], ['045', 45], ['East 090', 90], ['135', 135], ['South 180', 180], ['225', 225], ['West 270', 270], ['315', 315]];
const hdgText = (h) => String(Math.round(((h % 360) + 360) % 360)).padStart(3, '0');

// Orders that do something. Anything not listed here (or in PARAM) is shown in the "not yet" colour.
const ORDERS = {
  'Status Report': () => { const s = sim.s; return `Battery ${Math.round(s.battery)}%, oxygen ${Math.round(s.oxygen)}%, hull ${Math.round(s.hull)}%. Depth ${Math.round(s.depth)} metres.`; },
  'Engineering status report': () => { const s = sim.s; return `Power draw ${Math.round(s.power)} kilowatts, battery ${Math.round(s.battery)}%, hull ${Math.round(s.hull)}%. All engineering stations report ready.`; },
  "Let's take her to sea": () => { if (docked()) return 'We are still docked, Captain. Have the Helm undock first.'; sim.setThrottle(0.4); sim.setDepth(30); sim.setHeading(60); return 'Casting off. Heading 060, thirty metres.'; },
  'Prepare for dive': () => { if (docked()) return 'We are still docked, Captain.'; sim.setDepth(100); return 'Making ready. Diving to one hundred metres.'; },
  "Let's go home": () => {
    const dock = sim.dockPoi(); if (!dock) return 'No dock on the charts.';
    if (docked()) return 'We are already at the dock, Captain.';
    sim.setWpt(dock); sim.setDepth(0); sim.setThrottle(0.5); return `Course set for ${dock.name}. ${toward(sim.s, dock).nm.toFixed(1)} nautical miles.`;
  },
  'Report to my quarters': (ctx) => { setTimeout(() => ctx.openScene('quarters'), 500); return 'Acknowledged. Meet you there.'; },
  'Sound General Alarm': () => { toast('GENERAL ALARM', 'error'); return 'General alarm sounded. All hands to stations.'; },
  'All stop': () => { sim.stop(); return 'All stop, aye.'; },
  'All stop!': () => { sim.stop(); return 'All stop, aye.'; },
  'All ahead flank': () => { if (docked()) return 'We are docked, Captain.'; sim.setThrottle(1); return 'All ahead flank!'; },
  'Emergency surface': () => { sim.setDepth(0); return 'Blowing ballast. Surfacing!'; },
  'Emergency surfaace': () => { sim.setDepth(0); return 'Blowing ballast. Surfacing!'; },
  'Emergency dive': () => { if (docked()) return 'We are docked, Captain.'; sim.setDepth(500); return 'Diving. Five hundred metres.'; },
  'Full sensor sweep': () => { sim.s.sonar = true; sim.touch(); const n = sim.s.pois.filter((p) => toward(sim.s, p).nm <= 4).length; return `Sonar active. ${n} contact${n === 1 ? '' : 's'} within four miles. Details are on the Sensors station.`; },
  'Passive listening mode': () => { sim.s.sonar = false; sim.touch(); return 'Sonar secured. Listening passively.'; },
  'Run crew diagnostics': () => 'Crew diagnostics complete. Everyone aboard is healthy, Captain.',
  'Request departure clearance': () => (docked() ? 'Woods Hole Harbor Control: you are cleared to depart at your discretion. Safe travels.' : 'Harbor Control: you are already underway, Captain.'),
};
// Orders that need a number. Each option runs when picked.
const PARAM = {
  'Make your depth': () => ({ title: 'Make your depth …', opts: [['Surface', 0], ['30 m', 30], ['100 m', 100], ['300 m', 300], ['500 m', 500], ['1000 m', 1000], ['2000 m', 2000]].map(([l, v]) => [l, () => (docked() ? 'We are docked, Captain.' : (sim.setDepth(v), v ? `Making my depth ${v} metres, aye.` : 'Coming to the surface, aye.'))]) }),
  'Come left': () => ({ title: 'Come left …', opts: [5, 10, 20, 45, 90].map((d) => [`${d}°`, () => { sim.setHeading(sim.s.targetHeading - d); sim.s.wpt = null; return `Coming left to ${hdgText(sim.s.targetHeading)}, aye.`; }]) }),
  'Come right': () => ({ title: 'Come right …', opts: [5, 10, 20, 45, 90].map((d) => [`${d}°`, () => { sim.setHeading(sim.s.targetHeading + d); sim.s.wpt = null; return `Coming right to ${hdgText(sim.s.targetHeading)}, aye.`; }]) }),
  'Make your heading': () => ({ title: 'Make your heading …', opts: HEADINGS.map(([l, v]) => [l, () => { sim.setHeading(v); sim.s.wpt = null; return `Steering ${hdgText(v)}, aye.`; }]) }),
  'Make your speed': () => ({ title: 'Make your speed …', opts: [['All stop', 0], ['20%', 0.2], ['40%', 0.4], ['60%', 0.6], ['80%', 0.8], ['Flank', 1]].map(([l, v]) => [l, () => { if (docked()) return 'We are docked, Captain.'; if (v) sim.setThrottle(v); else sim.stop(); sim.s.wpt = null; return v ? `Speed ${Math.round(v * 100)} percent, aye.` : 'All stop, aye.'; }]) }),
};
PARAM['Make you speed'] = PARAM['Make your speed']; // old saves keep the typo
const works = (t, pleasantry) => pleasantry || t in ORDERS || t in PARAM;

export function mount(body, ctx) {
  body.classList.add('comm-menu');
  const crew = knownCrew();
  let page = 'crew', cur = null, cat = null, reply = null, greeted = false, param = null;
  const mineP = () => gameState.getProperty('contacts.crew.captain.dialogueOptions.pleasantries') || ['Hello', 'Goodbye', 'Thank you'];
  const cats = () => {
    const o = (cur && cur.dialogueOptions) || {};
    return [['Pleasantries', mineP()], ['Commands', o.commands || []], ['Emergency', o.emergency || []]].filter(([, l]) => l.length);
  };
  const line = (text, onclick, cls = '') => el('button', { class: `comm-line ${cls}`, text, onclick });
  const initial = (c) => c.name.replace(/^(Captain|Commander|Dr\.|Specialist|Engineer|Lieutenant) /, '')[0];

  function say(text, done) {
    reply = { said: text, text: done };
    page = 'reply';
    document.dispatchEvent(new CustomEvent('dialogue-complete', { detail: { characterId: cur.id, dialogueId: 'first_contact' } }));
    render();
  }
  function speak(text) {
    const o = cur.dialogueOptions || {};
    const isOrder = [...(o.commands || []), ...(o.emergency || [])].includes(text);
    if (!isOrder) { say(text, pick(o.pleasantries || ['Aye.'])); return; }
    if (PARAM[text]) { const p = PARAM[text](); param = { said: text, ...p }; page = 'param'; render(); return; }
    if (ORDERS[text]) { say(text, ORDERS[text](ctx)); return; }
    reply = { said: text, text: 'That order is not available yet.', stub: true }; page = 'reply'; render();
  }

  function render() {
    let kids;
    if (!crew.length) kids = [el('div', { class: 'comm-head', text: 'No one else seems to be available right now…' })];
    else if (page === 'crew') {
      kids = [el('div', { class: 'comm-head', text: 'Who would you like to reach out to?' }),
        ...crew.map((c) => el('button', { class: 'comm-line comm-who', onclick: () => {
          cur = c; cat = null;
          if (c.id === 'executiveOfficer' && !greeted) { greeted = true; reply = { said: null, text: 'Welcome aboard, Captain. I am ARIA, your executive officer. How may I assist you?' }; page = 'reply'; } else page = 'cat';
          render();
        } }, el('span', { class: `avatar ${c.id === 'executiveOfficer' ? 'aria' : ''}`, text: initial(c) }), el('span', {}, el('b', { text: c.name }), el('small', { text: c.role }))))];
    } else if (page === 'cat') {
      kids = [el('div', { class: 'comm-head', text: `What would you like to say to ${cur.name}?` }),
        ...cats().map(([n, l]) => line(n, () => { cat = [n, l]; page = 'lines'; render(); }, n === 'Emergency' ? 'danger' : '')),
        line('Someone else …', () => { page = 'crew'; render(); }, 'back')];
    } else if (page === 'lines') {
      kids = [el('div', { class: 'comm-head', text: `${cat[0]} with ${cur.name}` }),
        ...cat[1].map((t) => { const ok = works(t, cat[0] === 'Pleasantries'); return line(t, () => speak(t), ok ? (cat[0] === 'Emergency' ? 'danger' : '') : 'stub'); }),
        line('Something else …', () => { page = 'cat'; render(); }, 'back')];
    } else if (page === 'param') {
      kids = [el('div', { class: 'comm-head', text: param.title }),
        el('div', { class: 'comm-chips' }, ...param.opts.map(([l, fn]) => line(l, () => say(`${param.said}: ${l}`, fn(ctx)), 'chip'))),
        line('Never mind …', () => { page = 'lines'; render(); }, 'back')];
    } else {
      kids = [reply.said && el('div', { class: 'comm-you', text: `You: ${reply.said}` }),
        el('div', { class: 'comm-reply' + (reply.stub ? ' stub' : '') }, el('small', { text: cur.name }), el('p', { text: reply.text })),
        line('Say something else …', () => { page = 'cat'; render(); }, 'back'),
        line('Someone else …', () => { page = 'crew'; render(); }, 'back')];
    }
    body.replaceChildren(el('div', { class: 'comm-page' }, ...kids));
  }
  render();
  return { update() {}, destroy() {} };
}
