// Crew comms through the communicator pin (Star Trek style): crew on the left, the voice channel (transcript) in the middle, things to say on the right.
import { sim, toward } from '../sim.js';
import { el, toast } from '../util.js';
import { gameState } from '../persist.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];

export const knownCrew = () => Object.values(gameState.getProperty('contacts.crew') || {})
  .filter((c) => c && c.id !== 'captain' && c.known && c.name);

function act(text, ctx) {
  const s = sim.s, dock = sim.dockPoi();
  switch (text) {
    case 'Status Report': return `Battery ${Math.round(s.battery)}%, oxygen ${Math.round(s.oxygen)}%, hull ${Math.round(s.hull)}%. Depth ${Math.round(s.depth)} metres.`;
    case "Let's take her to sea": sim.setThrottle(0.4); sim.setDepth(30); sim.setHeading(60); return 'Casting off. Heading 060, thirty metres.';
    case "Let's go home": if (dock) { sim.setWpt(dock); sim.setDepth(0); sim.setThrottle(0.5); return `Course set for ${dock.name}. ${toward(sim.s, dock).nm.toFixed(1)} nautical miles.`; } return 'No dock on the charts.';
    case 'Report to my quarters': setTimeout(() => ctx.openScene('quarters'), 500); return 'Acknowledged. Meet you there.';
    case 'Sound General Alarm': toast('GENERAL ALARM', 'error'); return 'General alarm sounded. All hands to stations.';
    case 'All stop': sim.stop(); return 'All stop, aye.';
    case 'All ahead flank': sim.setThrottle(1); return 'All ahead flank!';
    case 'Emergency surface': case 'Emergency surfaace': sim.setDepth(0); return 'Blowing ballast. Surfacing!';
    case 'Emergency dive': sim.setDepth(500); return 'Diving. Five hundred metres.';
    default: return null;
  }
}

export function mount(body, ctx) {
  body.classList.add('comm-menu');
  const crew = knownCrew();
  let page = 'crew', cur = null, cat = null, reply = null, greeted = false;
  const mineP = () => gameState.getProperty('contacts.crew.captain.dialogueOptions.pleasantries') || ['Hello', 'Goodbye', 'Thank you'];
  const cats = () => {
    const o = (cur && cur.dialogueOptions) || {};
    return [['Pleasantries', mineP()], ['Commands', o.commands || []], ['Emergency', o.emergency || []]].filter(([, l]) => l.length);
  };
  const line = (text, onclick, cls = '') => el('button', { class: `comm-line ${cls}`, text, onclick });
  const initial = (c) => c.name.replace(/^(Captain|Commander|Dr\.|Specialist|Engineer|Lieutenant) /, '')[0];

  function speak(text) {
    const o = cur.dialogueOptions || {};
    const done = act(text, ctx);
    const isCommand = [...(o.commands || []), ...(o.emergency || [])].includes(text);
    reply = { said: text, text: done || (isCommand ? 'Aye, Captain.' : pick(o.pleasantries || ['Aye.'])) };
    page = 'reply';
    document.dispatchEvent(new CustomEvent('dialogue-complete', { detail: { characterId: cur.id, dialogueId: 'first_contact' } }));
    render();
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
        ...cat[1].map((t) => line(t, () => speak(t), cat[0] === 'Emergency' ? 'danger' : '')),
        line('Something else …', () => { page = 'cat'; render(); }, 'back')];
    } else {
      kids = [reply.said && el('div', { class: 'comm-you', text: `You: ${reply.said}` }),
        el('div', { class: 'comm-reply' }, el('small', { text: cur.name }), el('p', { text: reply.text })),
        line('Say something else …', () => { page = 'cat'; render(); }, 'back'),
        line('Someone else …', () => { page = 'crew'; render(); }, 'back')];
    }
    body.replaceChildren(el('div', { class: 'comm-page' }, ...kids));
  }
  render();
  return { update() {}, destroy() {} };
}
