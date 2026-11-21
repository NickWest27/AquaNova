// Science Lab: samples from the ROV, timed analysis on three instruments, and research topics.
import { tell } from '../notify.js';
import { sim } from '../sim.js';
import { el, toast } from '../util.js';
import { drawScreen } from '../analysisView.js';
import { SAMPLE_KINDS, LABS, TOPICS, samples, sampleName, jobs, points, research, startAnalysis, startTopic, tickLab } from '../science.js';

const fmt = (secs) => { const m = Math.max(0, Math.ceil(secs / 60)); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; };

export function mount(body, ctx) {
  body.style.flexDirection = 'column';
  let tab = ctx.labTab || 'samples', sig = '', screens = [], shown = {}, raf = 0, alive = true;
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
    screens = [];
    if (tab === 'samples') {
      view.replaceChildren(...(sm.length ? [...sm].reverse().map((q) => el('div', { class: 'card task' },
        el('div', { class: 'grow' }, el('h3', { text: sampleName(q, sm) }),
          el('p', { style: 'color:var(--dim)', text: `${q.site} · ${q.tool} · ${q.status === 'done' ? q.result : q.status === 'running' ? 'being analysed' : 'waiting for analysis'}` })),
        q.status === 'done' ? el('span', { class: 'ok', text: 'Done' }) : q.status === 'running' ? el('span', { style: 'color:var(--amber)', text: 'Running' })
          : el('button', { class: 'btn chip', text: 'Analyse', onclick: () => go('analysis') }))) :
        [el('div', { class: 'empty', text: 'No samples yet. Launch Remora from the Science Lab and collect some.' })]));
    } else if (tab === 'analysis') {
      view.replaceChildren(...Object.entries(LABS).map(([id, lab]) => {
        const job = jb.find((j) => j.lab === id), raw = sm.filter((q) => q.status === 'raw' && SAMPLE_KINDS[q.kind].lab === id);
        const running = job && sm.find((q) => q.id === job.sample), finished = sm.filter((q) => q.status === 'done' && SAMPLE_KINDS[q.kind].lab === id);
        const canvas = el('canvas', { class: 'an-screen', 'aria-label': `${lab.name} display` });
        screens.push({ id, canvas });
        return el('div', { class: 'card' }, el('h3', { text: lab.name }), canvas,
          el('p', { style: 'color:var(--dim);margin:0.3rem 0' }, job ? `Running ${sampleName(sm.find((q) => q.id === job.sample) || { kind: 'water', site: '', id: job.sample }, sm)}. ${fmt(job.end - s.clock)} left.` : 'Idle.'),
          el('div', { class: 'row' }, ...(running ? [] : raw.map((q) => el('button', { class: 'btn chip', text: `Run ${sampleName(q, sm)}`, onclick: () => {
            if (startAnalysis(q.id)) tell('science', `${lab.name}: ${sampleName(q, sm)} started`); sig = ''; update(); } })))),
          el('div', { class: 'row' }, ...(!job ? [...finished].reverse().slice(0, 4).map((q) => el('button', { class: 'btn chip' + (shown[id] === q.id ? ' on' : ''), text: `Show ${sampleName(q, sm)}`, onclick: () => { shown[id] = shown[id] === q.id ? null : q.id; sig = ''; update(); } })) : [])),
          !job && !raw.length && !finished.length && el('p', { style: 'color:var(--dim)', text: 'No samples for this instrument.' }));
      }));
    } else {
      view.replaceChildren(el('div', { class: 'card' }, el('div', { class: 'lbl', text: 'Research points' }), el('div', { class: 'num', text: String(pts) }),
        el('p', { style: 'color:var(--dim);margin-top:0.4rem', text: 'Each finished analysis gives one point.' })),
        ...TOPICS.map((t) => el('div', { class: 'card task' },
          el('div', { class: 'grow' }, el('h3', { text: t.name }), el('p', { style: 'color:var(--dim)', text: `${t.text} Cost: ${t.cost}.` })),
          done.includes(t.id) ? el('span', { class: 'ok', text: 'Done' }) : el('button', { class: 'btn chip', text: 'Research', disabled: pts < t.cost || (t.requires && !done.includes(t.requires)), onclick: () => {
            if (startTopic(t.id)) tell('science', `Research complete: ${t.name}`, 'mission'); sig = ''; update(); } }))));
    }
  }
  // the instrument screens animate on their own clock; progress comes from the running job
  function frame() {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    if (tab !== 'analysis') return;
    const s = sim.s, t = performance.now() / 1000, jb = jobs(), sm = samples();
    for (const sc of screens) {
      if (!sc.canvas.isConnected) continue;
      const job = jb.find((j) => j.lab === sc.id), q = job ? sm.find((x) => x.id === job.sample) : sm.find((x) => x.id === shown[sc.id]) || null;
      drawScreen(sc.canvas, sc.id, q, job ? Math.max(0, Math.min(1, (s.clock - job.start) / (job.end - job.start))) : q ? 1 : 0, t, Object.fromEntries(Object.entries(SAMPLE_KINDS).map(([k, v]) => [k, v.label])));
    }
  }
  update();
  raf = requestAnimationFrame(frame);
  return { update, destroy() { alive = false; cancelAnimationFrame(raf); } };
}
