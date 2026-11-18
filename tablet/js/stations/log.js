import { el, modal } from '../util.js';

const KEY = 'aquaNova_tablet_log';
export const readLog = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } };
export function addLog(title, text) {
  const all = readLog(); all.unshift({ id: Date.now(), t: new Date().toISOString(), title, text });
  try { localStorage.setItem(KEY, JSON.stringify(all.slice(0, 200))); } catch (e) { console.warn('Log not saved', e); }
}

export function mount(body, ctx) {
  body.classList.add('log-st');
  const list = el('div', { class: 'log-list' });
  const add = el('button', { class: 'btn primary', text: '+ New entry', onclick: () => {
    const ta = el('textarea', { placeholder: 'Captain\'s log…' });
    modal({ title: 'New log entry', body: ta, actions: [{ label: 'Cancel' }, { label: 'Save', primary: true, run: () => { if (ta.value.trim()) { addLog('captain log', ta.value.trim()); render(); } } }] });
    setTimeout(() => ta.focus(), 50);
  } });
  body.append(el('div', { class: 'row' }, add, el('span', { class: 'grow' })), list);
  function render() {
    const all = readLog();
    list.replaceChildren(...(all.length ? all : [el('div', { class: 'empty', text: 'No entries yet. Log entries are saved on this iPad.' })]).map((e) => e.nodeType ? e :
      el('div', { class: 'card entry' }, el('div', { class: 'meta' }, el('span', { text: new Date(e.t).toLocaleString() })), el('h3', { text: e.title }), el('p', { text: e.text }))));
  }
  render();
  return { update() {}, destroy() {} };
}
