import { fill } from '../player.js';
import { el, modal, toast } from '../util.js';
import { saveManager, gameState, addLogEntry, snapshotSim, restoreSim, restartGame } from '../persist.js';
import { sim } from '../sim.js';
import { requestSync } from '../sync.js';
import missionManager from '../../../game/systems/missionManager.js';
import { all as repAll, history as repHistory, label as repLabel } from '../reputation.js';

const entryText = (e) => (e.logbook ? fill(e.logbook.content) : '');

export function mount(body, ctx) {
  body.classList.add('log-st');
  const list = el('div', { class: 'log-list' });
  const book = () => saveManager.getActiveLogbook();

  const add = el('button', { class: 'btn primary', text: '+ New entry', onclick: () => {
    const ta = el('textarea', { placeholder: "Captain's log…" });
    modal({ title: 'New log entry', body: ta, actions: [{ label: 'Cancel' }, { label: 'Save', primary: true, run: () => {
      if (!ta.value.trim()) return;
      addLogEntry(ta.value.trim(), { type: 'personal_log' }); toast('Log entry saved'); requestSync(); render();
    } }] });
    setTimeout(() => ta.focus(), 50);
  } });
  const exp = el('button', { class: 'btn', text: 'Export', onclick: () => {
    try { snapshotSim(); saveManager.exportLogbook(); } catch (e) { toast('Export failed', 'error'); console.error(e); }
  } });
  const file = el('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const lb = await saveManager.importLogbook(f); toast('Imported ' + lb.name); render(); } catch (err) { toast('Import failed', 'error'); }
    file.value = '';
  } });
  const imp = el('button', { class: 'btn', text: 'Import', onclick: () => file.click() });
  const title = el('div', { class: 'lbl grow' });
  // two pages: the entries, and Standings (how the groups think of us: quiet, no numbers)
  const entriesPane = el('div', { style: 'display:flex;flex-direction:column;flex:1;min-height:0;gap:0.7rem' }, el('div', { class: 'row' }, add, exp, imp, file, title), list);
  const standPane = el('div', { class: 'log-list', style: 'display:none' });
  let page = 'entries';
  const tabs = el('div', { class: 'tabs' });
  const paintTabs = () => {
    tabs.replaceChildren(...[['entries', 'Entries'], ['standings', 'Standings']].map(([id, t]) => el('button', { class: 'btn chip' + (page === id ? ' on' : ''), text: t, onclick: () => { page = id; paintTabs(); if (id === 'standings') paintStandings(); } })));
    entriesPane.style.display = page === 'entries' ? 'flex' : 'none'; standPane.style.display = page === 'standings' ? '' : 'none';
  };
  const WORDS = { Hostile: 'They will not deal with us.', Cold: 'They keep us at arm\'s length.', Neutral: 'No opinion either way.', Warm: 'They speak well of us.', Trusted: 'They would vouch for us.' };
  function paintStandings() {
    const dim = 'color:var(--dim)';
    const hist = repHistory().filter((h) => h.why && Object.values(h.d).some((d) => Math.abs(d) >= 1.5)).slice(-8).reverse();
    standPane.replaceChildren(
      el('div', { class: 'card' }, el('div', { class: 'lbl', text: 'How the groups regard the Aqua Nova' }),
        ...repAll().map((f) => el('div', { style: 'display:flex;gap:1rem;align-items:baseline;margin-top:0.6rem' },
          el('b', { style: 'min-width:13rem', text: f.name }), el('span', { style: 'min-width:5rem', text: f.tier }), el('span', { style: dim, text: WORDS[f.tier] })))),
      el('div', { class: 'card' }, el('div', { class: 'lbl', text: 'Recent' }),
        ...(hist.length ? hist.map((h) => el('p', { style: 'margin-top:0.5rem;' + dim, text: `${h.why}: ` + Object.entries(h.d).filter(([, d]) => Math.abs(d) >= 1.5).map(([g, d]) => `${repLabel(g)} ${d > 0 ? 'up' : 'down'}`).join(', ') })) : [el('p', { style: 'margin-top:0.5rem;' + dim, text: 'Nothing yet.' })])));
  }
  body.append(tabs, entriesPane, standPane); paintTabs();

  function revert(entry) {
    modal({ title: 'Revert to this entry?', body: el('p', { text: 'The ship and mission return to this moment. Later entries are removed.' }),
      actions: [{ label: 'Cancel' }, { label: 'Revert', primary: true, kind: 'danger', run: () => {
        try { saveManager.revertToEntry(entry.logbook.entryId); restoreSim(); missionManager.restoreFromState(); sim.touch(); requestSync(); toast('Reverted'); ctx.refreshScene && ctx.refreshScene(); render(); } catch (e) { toast(e.message, 'error'); }
      } }] });
  }

  function restart() {
    modal({ title: 'Restart from the beginning?', body: el('p', { text: 'The game returns to M.LOG-0001. Every later logbook entry, journal note, task and mission progress is removed, on the iPad and on the iPhone. Export the logbook first if you want a copy.' }),
      actions: [{ label: 'Cancel' }, { label: 'Restart', primary: true, kind: 'danger', run: () => {
        try { restartGame(); } catch (e) { toast(e.message, 'error'); }
      } }] });
  }

  function render() {
    const lb = book();
    title.textContent = lb ? lb.name : 'No logbook';
    const entries = lb && lb.entries ? [...lb.entries].filter((e) => !['journal', 'discovery_log'].includes(e.logbook && e.logbook.type)).reverse() : [];   // mission reports and the Captain's own entries; notes live in the PED (journal, findings)
    list.replaceChildren(...(entries.length ? entries.map((e) => {
      const l = e.logbook, tasks = l.tasks || [];   // a logbook entry is a document: it lists its tasks and never crosses them out
      return el('div', { class: 'card entry' },
        el('div', { class: 'meta' }, el('span', { text: new Date(l.timestamp).toLocaleString() }), el('span', { text: l.entryId })),
        el('h3', { text: (l.type || 'log').replace(/_/g, ' ') }),
        el('p', { text: entryText(e) }),
        tasks.length ? el('ul', {}, tasks.map((t) => el('li', { text: t }))) : null,
        l.entryId === 'M.LOG-0001' && e.gameSnapshot ? el('div', { class: 'actions' }, el('button', { class: 'btn warn chip', text: 'Restart from the beginning', onclick: restart })) :
        e.gameSnapshot && e.metadata && e.metadata.canRevert !== false ? el('div', { class: 'actions' }, el('button', { class: 'btn warn chip', text: 'Revert here', onclick: () => revert(e) })) : null);
    }) : [el('div', { class: 'empty', text: 'No entries yet.' })]));
  }
  render();
  return { update() {}, destroy() {} };
}
