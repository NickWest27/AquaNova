// The engineering computer (docs/ENGINEERING.md): the ship's systems, their power, damage, fire, flooding and repairs.
// Top: fusion drive, battery, power, damage-control teams, alarms. Left: the ten systems (tap one). Right: its instruments and controls.
import { sim, MAX_KT, SUPER_KT } from '../sim.js';
import { el } from '../util.js';
import { tell } from '../notify.js';
import { gauge, field, lamp } from '../instruments.js';
import { SYSTEMS, RELAYS, COMPS, TEAMS, BLOW_AIR, FIRE_AGENT, eng, status, powered, working, fusionOk, jetFactor, busyTeams, setRelay, setOn, setScrub, setCabin, setArmed, setBulkhead, discharge, blow, repair, standDown } from '../engineering.js';

const LAMP = { ok: ['OK', 'ok'], degraded: ['DEGRADED', 'warn'], offline: ['OFFLINE', 'bad'], fire: ['FIRE', 'bad'] };
const lvl = (h) => (h < 25 ? 'bad' : h < 50 ? 'warn' : '');

export function mount(body) {
  body.style.flexDirection = 'column';
  const top = el('div', { class: 'card eng-top' }), list = el('div', { class: 'eng-list' }), detail = el('div', { class: 'card eng-detail' });
  body.append(top, el('div', { class: 'eng-main' }, list, detail));
  let sel = 'relays', sig = '';
  const act = (label, fn, opts = {}) => el('button', { class: 'btn chip' + (opts.on ? ' on' : '') + (opts.cls ? ' ' + opts.cls : ''), text: label, disabled: !!opts.off, onclick: () => { const r = fn(); if (r && r.ok === false && opts.why) tell('engineering', opts.why(r.why), 'error'); sig = ''; update(); } });
  const toggle = (label, on, fn, off) => act(`${label}: ${on ? 'ON' : 'OFF'}`, fn, { on, off });

  function detailFor(id) {
    const e = eng(), s = sim.s, x = SYSTEMS.find((q) => q.id === id), h = e.health[id], st = status(id), team = e.repairs.some((r) => r.id === id);
    const head = el('div', { class: 'craft-hd' }, el('b', { text: x.name.toUpperCase() }), el('span', { class: 'gz-k', text: `${COMPS[x.comp].toUpperCase()}${x.relay ? ` · RELAY ${x.relay}` : ''}` }), lamp(...LAMP[st]));
    const rows = [gauge('HEALTH', h / 100, `${Math.round(h)}%`, lvl(h))];
    const ctl = [];
    if (id === 'relays') {
      for (const r of Object.keys(RELAYS)) rows.push(el('div', { class: 'eng-row' }, el('span', { class: 'gz-k', text: `${r} · ${RELAYS[r].toUpperCase()}` }), e.relays[r] ? lamp('CLOSED', 'ok') : lamp('OPEN', 'bad'),
        act(e.relays[r] ? 'Open' : 'Close', () => setRelay(r, !e.relays[r]))));
    } else if (id === 'propulsion') {
      const top = Math.round(MAX_KT * jetFactor());
      rows.push(gauge('HYDRO-JETS', jetFactor(), `TOP ${top} KT`, jetFactor() < 1 ? 'warn' : ''),
        el('div', { class: 'eng-row' }, el('span', { class: 'gz-k', text: 'FUSION DRIVE' }), fusionOk() ? lamp('ONLINE', 'ok') : e.on.fusion ? lamp('FAULT', 'bad') : lamp('STANDBY', 'warn')),
        field('SPEED', `${s.speed.toFixed(1)} KT${s.cruise ? ' · SUPER CRUISE' : ''}`), field('SUPER CRUISE', fusionOk() ? `AVAILABLE · ${SUPER_KT} KT` : 'NOT AVAILABLE', fusionOk() ? '' : 'idle'));
      ctl.push(toggle('Fusion drive', e.on.fusion, () => setOn('fusion', !e.on.fusion)));
    } else if (id === 'scrubbers') {
      rows.push(gauge('CANISTERS', (s.scrubbers ?? 100) / 100, `${Math.round(s.scrubbers ?? 100)}%`, lvl(s.scrubbers ?? 100)), field('CO2', `${s.co2.toFixed(2)}%`, s.co2 > 1 ? 'bad' : s.co2 > 0.5 ? 'warn' : ''));
      ctl.push(...['normal', 'boost', 'off'].map((m) => act(m.toUpperCase(), () => setScrub(m), { on: e.scrubMode === m })));
    } else if (id === 'o2') {
      rows.push(gauge('OXYGEN', s.oxygen / 100, `${Math.round(s.oxygen)}%`, lvl(s.oxygen)), gauge('O2 TANK', e.o2tank / 100, `${Math.round(e.o2tank)}%`, lvl(e.o2tank)),
        field('GENERATOR', working('o2') && e.on.o2 ? 'MAKING O2' : 'STOPPED', working('o2') && e.on.o2 ? 'ok' : 'warn'));
      ctl.push(toggle('Generator', e.on.o2, () => setOn('o2', !e.on.o2)));
    } else if (id === 'water') {
      rows.push(gauge('FRESH WATER', e.water / 100, `${Math.round(e.water)}%`, lvl(e.water)), field('DESALINATOR', working('water') && e.on.water ? 'MAKING WATER' : 'STOPPED', working('water') && e.on.water ? 'ok' : 'warn'));
      ctl.push(toggle('Desalinator', e.on.water, () => setOn('water', !e.on.water)));
    } else if (id === 'hvac') {
      rows.push(field('CABIN', `${e.cabin.toFixed(1)} °C`, Math.abs(e.cabin - e.set) > 3 ? 'warn' : ''), field('SET', `${e.set} °C`), field('SEA', `${s.temp.toFixed(1)} °C`, 'idle'));
      ctl.push(act('−', () => setCabin(e.set - 1)), act('+', () => setCabin(e.set + 1)), toggle('Heat/cool', e.on.hvac, () => setOn('hvac', !e.on.hvac)));
    } else if (id === 'fire') {
      rows.push(el('div', { class: 'eng-row' }, el('span', { class: 'gz-k', text: 'COMPARTMENTS' }), e.fire ? lamp(`FIRE · ${COMPS[e.fire.comp].toUpperCase()}`, 'bad') : lamp('CLEAR', 'ok')),
        gauge('AGENT', e.agent / 100, `${Math.round(e.agent)}% · ${Math.floor(e.agent / FIRE_AGENT)} SHOTS`, e.agent < FIRE_AGENT ? 'bad' : ''));
      ctl.push(toggle('Auto', e.armed, () => setArmed(!e.armed)), act('Discharge', discharge, { off: !e.fire, cls: 'warn', why: (w) => (w === 'agent' ? 'No agent left' : 'Fire suppression is offline') }));
    } else if (id === 'bulkheads') {
      for (const c of ['fwd', 'aft']) rows.push(el('div', { class: 'eng-row' }, el('span', { class: 'gz-k', text: COMPS[c].toUpperCase() }), e.bulk[c] ? lamp('OPEN', 'warn') : lamp('CLOSED', 'ok'), e.leak[c] ? lamp('LEAK', 'bad') : null,
        act(e.bulk[c] ? 'Close' : 'Open', () => setBulkhead(c, !e.bulk[c]))), gauge(`FLOOD ${c.toUpperCase()}`, e.flood[c] / 100, `${Math.round(e.flood[c])}%`, e.flood[c] > 0 ? 'bad' : ''));
    } else if (id === 'ballast') {
      const fill = Math.min(1, s.depth / 600), trim = s.targetDepth > s.depth + 1 ? 'DIVING' : s.targetDepth < s.depth - 1 ? 'RISING' : 'TRIMMED';
      rows.push(gauge('FORE TANK', fill, `${Math.round(fill * 100)}%`), gauge('AFT TANK', fill, `${Math.round(fill * 100)}%`), field('TRIM', e.blowing ? 'EMERGENCY BLOW' : trim, e.blowing ? 'bad' : ''), field('AIR', `${Math.round(e.air)}% · BLOW NEEDS ${BLOW_AIR}%`, e.air < BLOW_AIR ? 'warn' : ''));
      ctl.push(act('Emergency blow', blow, { off: e.air < BLOW_AIR || s.depth < 1, cls: 'warn', why: (w) => (w === 'air' ? 'Not enough air charge' : w === 'offline' ? 'Ballast is offline' : 'We are on the surface') }));
    } else if (id === 'air') {
      rows.push(gauge('AIR BANK', e.air / 100, `${Math.round(e.air * 2.5)} BAR`, e.air < BLOW_AIR ? 'warn' : ''), field('COMPRESSOR', !e.on.compressor ? 'OFF' : s.depth < 20 && working('air') ? 'CHARGING' : 'WAITING (ABOVE 20 M)', s.depth < 20 && e.on.compressor ? 'ok' : 'idle'));
      ctl.push(toggle('Compressor', e.on.compressor, () => setOn('compressor', !e.on.compressor)));
    }
    if (!powered(id) && x.relay) rows.push(field('POWER', `RELAY ${x.relay} OPEN`, 'bad'));
    const fix = team ? act('Stand down', () => standDown(id)) : act('Repair', () => repair(id), { off: h >= 100 || busyTeams() >= TEAMS, why: (w) => (w === 'teams' ? 'Both teams are busy' : '') });
    return [head, el('div', { class: 'rem-g' }, ...rows), el('div', { class: 'row craft-btns' }, ...ctl, fix, team ? lamp('TEAM WORKING', 'warn') : null)];
  }

  function update() {
    const e = eng(), s = sim.s;
    const next = JSON.stringify([sel, e, Math.round(s.battery), Math.round(s.power), Math.round(s.speed * 2), s.cruise, Math.round(s.oxygen), s.co2.toFixed(2), Math.round(s.scrubbers ?? 100), Math.round(s.depth / 5), s.targetDepth, s.temp.toFixed(1)].map((v) => (typeof v === 'object' ? JSON.stringify(v, (k, x) => (typeof x === 'number' ? Math.round(x) : x)) : v)));
    if (next === sig) return; sig = next;
    const flood = e.flood.fwd > 0 || e.flood.aft > 0 || e.leak.fwd || e.leak.aft;
    top.replaceChildren(
      el('div', { class: 'eng-row' }, el('b', { class: 'eng-title', text: 'QUANTUM FUSION DRIVE' }), fusionOk() ? lamp('ONLINE', 'ok') : e.on.fusion ? lamp('FAULT', 'bad') : lamp('STANDBY', 'warn'),
        e.fire ? lamp('FIRE', 'bad') : null, flood ? lamp('FLOODING', 'bad') : null, lamp(`TEAMS ${TEAMS - busyTeams()}/${TEAMS} FREE`, busyTeams() >= TEAMS ? 'warn' : 'ok')),
      el('div', { class: 'eng-2' }, gauge('BATTERY', s.battery / 100, `${Math.round(s.battery)}%`, lvl(s.battery)), gauge('POWER DRAW', s.power / 100, `${Math.round(s.power)} kW`)));
    list.replaceChildren(...SYSTEMS.map((x) => {
      const st = status(x.id), h = e.health[x.id];
      return el('button', { class: 'eng-sys' + (x.id === sel ? ' sel' : ''), onclick: () => { sel = x.id; sig = ''; update(); } },
        el('div', { class: 'craft-hd' }, el('b', { text: x.name.toUpperCase() }), lamp(...LAMP[st])), el('span', { class: 'gz-bar' }, el('i', { style: `width:${Math.round(h)}%`, class: lvl(h) })));
    }));
    detail.replaceChildren(...detailFor(sel));
  }
  update();
  return { update, destroy() {} };
}
