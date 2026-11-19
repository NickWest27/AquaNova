// Science Lab: samples from the ROV, timed analysis on three instruments, and research topics.
import { sim } from '../sim.js';
import { el, toast } from '../util.js';
import { SAMPLE_KINDS, LABS, TOPICS, samples, jobs, points, research, startAnalysis, startTopic, tickLab } from '../science.js';

const fmt = (secs) => { const m = Math.max(0, Math.ceil(secs / 60)); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; };

export function mount(body, ctx) {
  body.style.flexDirection = 'column';
  let tab = ctx.labTab || 'samples', sig = '';
  const tabs = el('div', { class: 'tabs' });
  const view = el('div', { class: 'tab-body', style: 'flex:1;min-height:0' });
  body.append(tabs, view);
  const go = (t) => { tab = t; sig = ''; update(); };

  function update() {
    tickLab();
    const s = sim.s, sm = samples(), jb = jobs(), pts = points(), done = research.done();
    const next = JSON.stringify([tab, sm, jb.map((j) => [j.sample, Math.floor((j.end - s.clock) / 60)]), pts, done]);
    if (next === sig) return;
    sig = next;
    tabs.replaceChildren(...[['samples', 'Samples'], ['analysis', 'Analysis'], ['research', 'Research']].map(([id, label]) =>
      el('button', { class: 'btn chip' + (tab === id ? ' on' : ''), text: label, onclick: () => go(id) })));
    if (tab === 'samples') {
      view.replaceChildren(...(sm.length ? [...sm].reverse().map((q) => el('div', { class: 'card task' },
        el('div', { class: 'grow' }, el('h3', { text: `#${q.id} ${SAMPLE_KINDS[q.kind].label}` }),
          el('p', { style: 'color:var(--dim)', text: `${q.site} · ${q.tool} · ${q.status === 'done' ? q.result : q.status === 'running' ? 'being analysed' : 'waiting for analysis'}` })),
        q.status === 'done' ? el('span', { class: 'ok', text: 'Done' }) : q.status === 'running' ? el('span', { style: 'color:var(--amber)', text: 'Running' })
          : el('button', { class: 'btn chip', text: 'Analyse', onclick: () => go('analysis') }))) :
        [el('div', { class: 'empty', text: 'No samples yet. Launch Remora from the Science Lab and collect some.' })]));
    } else if (tab === 'analysis') {
      view.replaceChildren(...Object.entries(LABS).map(([id, lab]) => {
        const job = jb.find((j) => j.lab === id), raw = sm.filter((q) => q.status === 'raw' && SAMPLE_KINDS[q.kind].lab === id);
        const running = job && sm.find((q) => q.id === job.sample);
        return el('div', { class: 'card' }, el('h3', { text: lab.name }),
          el('p', { style: 'color:var(--dim);margin:0.3rem 0' }, job ? `Running sample #${job.sample}. ${fmt(job.end - s.clock)} left.` : 'Idle.'),
          el('div', { class: 'row' }, ...(running ? [] : raw.map((q) => el('button', { class: 'btn chip', text: `Run #${q.id} ${SAMPLE_KINDS[q.kind].label}`, onclick: () => {
            if (startAnalysis(q.id)) toast(`${lab.name}: sample #${q.id} started`); sig = ''; update(); } })))),
          !job && !raw.length && el('p', { style: 'color:var(--dim)', text: 'No samples for this instrument.' }));
      }));
    } else {
      view.replaceChildren(el('div', { class: 'card' }, el('div', { class: 'lbl', text: 'Research points' }), el('div', { class: 'num', text: String(pts) }),
        el('p', { style: 'color:var(--dim);margin-top:0.4rem', text: 'Each finished analysis gives one point.' })),
        ...TOPICS.map((t) => el('div', { class: 'card task' },
          el('div', { class: 'grow' }, el('h3', { text: t.name }), el('p', { style: 'color:var(--dim)', text: `${t.text} Cost: ${t.cost}.` })),
          done.includes(t.id) ? el('span', { class: 'ok', text: 'Done' }) : el('button', { class: 'btn chip', text: 'Research', disabled: pts < t.cost, onclick: () => {
            if (startTopic(t.id)) toast(`Research complete: ${t.name}`, 'mission'); sig = ''; update(); } }))));
    }
  }
  update();
  return { update, destroy() {} };
}
