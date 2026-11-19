import { el, modal, toast } from '../util.js';
import { saveManager, gameState, addLogEntry, snapshotSim, restoreSim, restartGame } from '../persist.js';
import { sim } from '../sim.js';
import { requestSync } from '../sync.js';
import missionManager from '../../../game/systems/missionManager.js';

const entryText = (e) => (e.logbook ? e.logbook.content : '');

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
  body.append(el('div', { class: 'row' }, add, exp, imp, file, title), list);

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
    const entries = lb && lb.entries ? [...lb.entries].reverse() : [];
    list.replaceChildren(...(entries.length ? entries.map((e) => {
      const l = e.logbook, tasks = l.tasks || [], done = l.completedTasks || [];
      return el('div', { class: 'card entry' },
        el('div', { class: 'meta' }, el('span', { text: new Date(l.timestamp).toLocaleString() }), el('span', { text: l.entryId })),
        el('h3', { text: (l.type || 'log').replace(/_/g, ' ') }),
        el('p', { text: entryText(e) }),
        tasks.length ? el('ul', {}, tasks.map((t) => el('li', { class: done.includes(t) ? 'done' : '', text: t }))) : null,
        l.entryId === 'M.LOG-0001' && e.gameSnapshot ? el('div', { class: 'actions' }, el('button', { class: 'btn warn chip', text: 'Restart from the beginning', onclick: restart })) :
        e.gameSnapshot && e.metadata && e.metadata.canRevert !== false ? el('div', { class: 'actions' }, el('button', { class: 'btn warn chip', text: 'Revert here', onclick: () => revert(e) })) : null);
    }) : [el('div', { class: 'empty', text: 'No entries yet.' })]));
  }
  render();
  return { update() {}, destroy() {} };
}
