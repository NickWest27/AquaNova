// The engineering computer (docs/ENGINEERING.md): the ship's systems, their power, damage, fire, flooding and repairs.
// Top: fusion drive, battery, power, damage-control teams, alarms. Left: the ten systems (tap one). Right: its instruments and controls.
import { sim, MAX_KT, SUPER_KT } from '../sim.js';
import { el } from '../util.js';
import { tell } from '../notify.js';
import { gauge, field, lamp } from '../instruments.js';
import { drawSchematic } from '../schematic.js';
import { DIAGRAMS } from '../engDiagrams.js';
import { SYSTEMS, COMPS, TEAMS, FIRE_AGENT, eng, status, powered, alarmOn, soundAlarm, secureAlarm, fusionOk, jetFactor, airCharging, busyTeams, setCabin, repair, standDown } from '../engineering.js';

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
    const pic = el('div', { class: 'eng-sch' }, drawSchematic(DIAGRAMS[id]()));
    pic.addEventListener('click', () => { sig = ''; update(); });   // a tap on a part changed the model: redraw at once
    const sum = {   // one line of the numbers that matter
      relays: `BATTERY ${Math.round(s.battery)}% · DRAW ${Math.round(s.power)} kW`,
      propulsion: `TOP SPEED ${Math.round(MAX_KT * jetFactor())} KT · SUPER CRUISE ${fusionOk() ? 'AVAILABLE' : 'OUT'}`,
      scrubbers: `MODE ${e.scrubMode.toUpperCase()} · CANISTERS ${Math.round(s.scrubbers ?? 100)}% · CO2 ${s.co2.toFixed(2)}%`,
      o2: `OXYGEN ${Math.round(s.oxygen)}% · TANK ${Math.round(e.o2tank)}%`,
      water: `FRESH WATER ${Math.round(e.water)}%`,
      hvac: `CABIN ${e.cabin.toFixed(1)}°C · SET ${e.set}°C · SEA ${s.temp.toFixed(1)}°C`,
      fire: `${e.fire ? 'FIRE ' + COMPS[e.fire.comp].toUpperCase() : 'NO FIRE'} · AGENT ${Math.round(e.agent)}% (${Math.floor(e.agent / FIRE_AGENT)} SHOTS) · ${e.armed ? 'AUTO' : 'MANUAL'}`,
      bulkheads: `FLOOD FWD ${Math.round(e.flood.fwd)}% · AFT ${Math.round(e.flood.aft)}%`,
      ballast: `AIR ${Math.round(e.air)}% · ${e.blowing ? 'EMERGENCY BLOW' : 'TRIMMED'}`,
      air: `AIR BANK ${Math.round(e.air * 2.5)} BAR · ${airCharging() ? 'CHARGING' : 'NOT CHARGING'}`,
    }[id];
    const ctl = id === 'hvac' ? [act('Cooler', () => setCabin(e.set - 1)), act('Warmer', () => setCabin(e.set + 1))] : [];
    if (!powered(id) && x.relay) ctl.push(lamp(`RELAY ${x.relay} OPEN`, 'bad'));
    const fix = team ? act('Stand down', () => standDown(id)) : act('Repair', () => repair(id), { off: h >= 100 || busyTeams() >= TEAMS, why: (w) => (w === 'teams' ? 'Both teams are busy' : '') });
    return [head, gauge('HEALTH', h / 100, `${Math.round(h)}%`, lvl(h)), pic, field('READING', sum), el('div', { class: 'row craft-btns' }, ...ctl, fix, team ? lamp('TEAM WORKING', 'warn') : null)];
  }

  function update() {
    const e = eng(), s = sim.s;
    const next = JSON.stringify([sel, e, Math.round(s.battery), Math.round(s.power), Math.round(s.speed * 2), s.cruise, Math.round(s.oxygen), s.co2.toFixed(2), Math.round(s.scrubbers ?? 100), Math.round(s.depth / 5), s.targetDepth, s.temp.toFixed(1), Math.round(s.speed)].map((v) => (typeof v === 'object' ? JSON.stringify(v, (k, x) => (typeof x === 'number' ? Math.round(x) : x)) : v)));
    if (next === sig) return; sig = next;
    const flood = e.flood.fwd > 0 || e.flood.aft > 0 || e.leak.fwd || e.leak.aft;
    top.replaceChildren(
      el('div', { class: 'eng-row' }, el('b', { class: 'eng-title', text: 'QUANTUM FUSION DRIVE' }), fusionOk() ? lamp('ONLINE', 'ok') : e.on.fusion ? lamp('FAULT', 'bad') : lamp('STANDBY', 'warn'),
        e.fire ? lamp('FIRE', 'bad') : null, flood ? lamp('FLOODING', 'bad') : null, lamp(`TEAMS ${TEAMS - busyTeams()}/${TEAMS} FREE`, busyTeams() >= TEAMS ? 'warn' : 'ok'),
        alarmOn() ? act('Secure alarm', secureAlarm, { cls: 'gen-alarm-btn lit', why: (w) => (w === 'casualty' ? 'Not while there is fire or flooding' : '') }) : act('General alarm', () => soundAlarm('captain'), { cls: 'gen-alarm-btn' })),
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
