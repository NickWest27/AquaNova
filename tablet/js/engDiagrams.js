// The ten flow diagrams of the engineering computer. Each is built from the live state: what runs, what is open, what flows.
// Tap a pump, fan, valve, breaker or door to switch it; the model (engineering.js) decides what that does to the ship.
import { sim } from './sim.js';
import { eng, part, togglePart, setRelay, setOn, setArmed, setBulkhead, discharge, blow, fusionOk, jetFactor, o2Making, desalMaking, hvacRunning, airCharging, powered, working, RELAYS, COMPS, BLOW_AIR } from './engineering.js';

const P = (k, x, y, label, kind = 'pump', extra = {}) => ({ id: k, kind, x, y, label, on: part(k), tap: () => togglePart(k), state: part(k) ? (kind === 'valve' ? 'OPEN' : 'ON') : (kind === 'valve' ? 'SHUT' : 'OFF'), ...extra });
const L = (pts, medium, live) => ({ pts, medium, live: !!live });

export const DIAGRAMS = {
  relays: () => {
    const e = eng(), s = sim.s, bus = s.battery > 0 && e.health.relays > 0;
    const ys = { A: 45, B: 115, C: 185, D: 255 };
    return {
      nodes: [
        { id: 'fusion', kind: 'unit', x: 80, y: 80, w: 120, inner: 'FUSION DRIVE', on: fusionOk(), state: fusionOk() ? 'ONLINE' : e.on.fusion ? 'FAULT' : 'STANDBY', tap: () => setOn('fusion', !e.on.fusion) },
        { id: 'battery', kind: 'tank', x: 80, y: 215, w: 90, h: 50, level: s.battery / 100, color: '#ffd666', label: 'BATTERY' },
        { id: 'bus', kind: 'src', x: 200, y: 290, label: 'MAIN BUS' },
        ...Object.keys(RELAYS).map((r) => ({ id: 'relay' + r, kind: 'breaker', x: 320, y: ys[r], on: e.relays[r], label: `RELAY ${r} · ${e.relays[r] ? 'CLOSED' : 'OPEN'}`, ly: 24, tap: () => setRelay(r, !e.relays[r]) })),
        ...Object.keys(RELAYS).map((r) => ({ id: 'load' + r, kind: 'unit', x: 500, y: ys[r], w: 160, h: 34, inner: RELAYS[r].toUpperCase(), on: bus && e.relays[r] })),
      ],
      links: [
        L([[140, 80], [200, 80]], 'power', fusionOk()), L([[125, 215], [200, 215]], 'power', bus), L([[200, 30], [200, 280]], 'power', bus),
        ...Object.keys(RELAYS).flatMap((r) => [L([[200, ys[r]], [306, ys[r]]], 'power', bus), L([[334, ys[r]], [420, ys[r]]], 'power', bus && e.relays[r])]),
      ],
    };
  },
  propulsion: () => {
    const e = eng(), on = working('propulsion'), sea = on && part('prop.intake');
    return {
      nodes: [
        { id: 'fusion', kind: 'unit', x: 110, y: 70, w: 130, inner: 'FUSION DRIVE', on: fusionOk(), state: fusionOk() ? 'ONLINE' : e.on.fusion ? 'FAULT' : 'STANDBY', tap: () => setOn('fusion', !e.on.fusion) },
        P('prop.coolant', 300, 70, 'COOLANT PUMP'),
        { id: 'sea', kind: 'src', x: 40, y: 215, label: 'SEA', anchor: 'start' },
        P('prop.intake', 130, 215, 'INTAKE', 'valve'),
        P('prop.port', 320, 170, 'PORT JET PUMP'), P('prop.stbd', 320, 260, 'STBD JET PUMP'),
        { id: 'pn', kind: 'sink', x: 560, y: 170, label: 'PORT NOZZLE ▶', anchor: 'end' }, { id: 'sn', kind: 'sink', x: 560, y: 260, label: 'STBD NOZZLE ▶', anchor: 'end' },
        { id: 'thrust', kind: 'src', x: 450, y: 40, label: `THRUST ${Math.round(jetFactor() * 100)}%` },
      ],
      links: [
        L([[175, 60], [283, 60]], 'coolant', part('prop.coolant') && e.on.fusion), L([[317, 80], [360, 80], [360, 110], [110, 110], [110, 90]], 'coolant', part('prop.coolant') && e.on.fusion),
        L([[75, 215], [115, 215]], 'sea', sea), L([[145, 215], [230, 215], [230, 170], [303, 170]], 'sea', sea && part('prop.port')), L([[230, 215], [230, 260], [303, 260]], 'sea', sea && part('prop.stbd')),
        L([[337, 170], [430, 170]], 'sea', sea && part('prop.port')), L([[337, 260], [430, 260]], 'sea', sea && part('prop.stbd')),
      ],
    };
  },
  scrubbers: () => {
    const s = sim.s, on = working('scrubbers'), fan = on && part('scrub.fan'), lv = (s.scrubbers ?? 100) / 100;
    return {
      nodes: [
        { id: 'cab', kind: 'src', x: 30, y: 150, label: 'CABIN AIR', anchor: 'start' }, P('scrub.fan', 150, 150, 'FAN', 'fan'),
        P('scrub.a', 270, 80, 'BANK A', 'valve'), P('scrub.b', 270, 220, 'BANK B', 'valve'),
        { id: 'ca', kind: 'tank', x: 400, y: 80, w: 70, h: 50, level: lv, color: '#9aa6b5', label: 'CANISTERS A' }, { id: 'cb', kind: 'tank', x: 400, y: 220, w: 70, h: 50, level: lv, color: '#9aa6b5', label: 'CANISTERS B' },
        { id: 'ret', kind: 'sink', x: 585, y: 150, label: 'TO CABIN', anchor: 'end' },
      ],
      links: [
        L([[118, 150], [133, 150]], 'co2', fan), L([[167, 150], [200, 150], [200, 80], [255, 80]], 'co2', fan), L([[200, 150], [200, 220], [255, 220]], 'co2', fan),
        L([[285, 80], [365, 80]], 'co2', fan && part('scrub.a')), L([[285, 220], [365, 220]], 'co2', fan && part('scrub.b')),
        L([[435, 80], [480, 80], [480, 150], [500, 150]], 'air', fan && part('scrub.a')), L([[435, 220], [480, 220], [480, 150]], 'air', fan && part('scrub.b')),
      ],
    };
  },
  o2: () => {
    const e = eng(), s = sim.s, mk = o2Making(), feed = working('o2') && part('o2.feed'), backup = !mk && part('o2.tank') && e.o2tank > 0 && s.depth >= 3;
    return {
      nodes: [
        { id: 'fw', kind: 'src', x: 30, y: 90, label: 'FRESH WATER', anchor: 'start' }, P('o2.feed', 170, 90, 'FEED PUMP'),
        { ...P('o2.cell', 320, 90, 'ELECTROLYSER', 'unit'), w: 130, inner: mk ? 'MAKING O2' : 'IDLE' },
        { id: 'cab', kind: 'sink', x: 575, y: 40, label: `CABIN · O2 ${Math.round(s.oxygen)}%`, anchor: 'end' },
        P('o2.tank', 430, 190, 'TANK VALVE', 'valve'), { id: 'tank', kind: 'tank', x: 540, y: 220, w: 60, h: 70, level: e.o2tank / 100, color: '#64ffda', label: 'O2 TANK' },
        { id: 'h2', kind: 'sink', x: 320, y: 230, label: 'H2 VENT OVERBOARD' },
      ],
      links: [
        L([[140, 90], [153, 90]], 'water', feed), L([[187, 90], [255, 90]], 'water', feed),
        L([[385, 90], [430, 90], [430, 40], [480, 40]], 'o2', mk), L([[430, 90], [430, 175]], 'o2', mk && part('o2.tank')), L([[445, 190], [510, 190]], 'o2', (mk || backup) && part('o2.tank')),
        L([[540, 185], [540, 140], [470, 140], [470, 40]], 'o2', backup), L([[320, 110], [320, 210]], 'gas', mk),
      ],
    };
  },
  water: () => {
    const e = eng(), mk = desalMaking(), sea = working('water') && part('water.intake');
    return {
      nodes: [
        { id: 'sea', kind: 'src', x: 30, y: 220, label: 'SEA', anchor: 'start' }, P('water.intake', 110, 220, 'INTAKE', 'valve'), P('water.hp', 215, 220, 'HP PUMP'),
        { id: 'ro', kind: 'unit', x: 340, y: 220, w: 110, inner: 'RO MEMBRANE', on: mk }, { id: 'brine', kind: 'sink', x: 340, y: 285, label: 'BRINE OVERBOARD' },
        { id: 'tank', kind: 'tank', x: 470, y: 200, w: 70, h: 80, level: e.water / 100, label: 'FRESH WATER' },
        P('water.dist', 470, 75, 'DISTRIBUTION'), { id: 'crew', kind: 'sink', x: 590, y: 50, label: 'GALLEY · SHOWERS', anchor: 'end' },
      ],
      links: [
        L([[60, 220], [95, 220]], 'sea', sea), L([[125, 220], [198, 220]], 'sea', sea), L([[232, 220], [285, 220]], 'sea', mk),
        L([[340, 240], [340, 270]], 'sea', mk), L([[395, 220], [435, 220]], 'water', mk),
        L([[470, 160], [470, 92]], 'water', part('water.dist') && e.water > 0), L([[487, 75], [580, 75]], 'water', part('water.dist') && e.water > 0),
      ],
    };
  },
  hvac: () => {
    const e = eng(), s = sim.s, run = hvacRunning(), sea = working('hvac') && part('hvac.sea');
    return {
      nodes: [
        { id: 'sea', kind: 'src', x: 30, y: 240, label: `SEA ${s.temp.toFixed(1)}°C`, anchor: 'start' }, P('hvac.sea', 170, 240, 'SEA PUMP'),
        { id: 'hx', kind: 'unit', x: 310, y: 240, w: 120, inner: 'HEAT EXCHANGER', on: sea }, { id: 'ob', kind: 'sink', x: 470, y: 280, label: 'OVERBOARD' },
        P('hvac.comp', 310, 120, 'HEAT PUMP'), P('hvac.fan', 450, 120, 'CABIN FAN', 'fan'),
        { id: 'cab', kind: 'sink', x: 585, y: 60, label: `CABIN ${e.cabin.toFixed(1)}°C · SET ${e.set}°C`, anchor: 'end' },
      ],
      links: [
        L([[118, 240], [153, 240]], 'sea', sea), L([[187, 240], [250, 240]], 'sea', sea), L([[370, 240], [470, 240], [470, 265]], 'sea', sea),
        L([[300, 220], [300, 137]], 'coolant', run), L([[327, 120], [433, 120]], 'air', run), L([[467, 120], [540, 120], [540, 70]], 'air', run),
      ],
    };
  },
  fire: () => {
    const e = eng(), main = working('fire') && part('fire.main'), ys = { fwd: 60, mid: 150, aft: 240 };
    return {
      nodes: [
        { id: 'agent', kind: 'tank', x: 70, y: 150, w: 60, h: 90, level: e.agent / 100, color: '#ff6b6b', label: 'AGENT' },
        P('fire.main', 190, 150, 'MASTER VALVE', 'valve'),
        { id: 'auto', kind: 'breaker', x: 190, y: 260, on: e.armed, label: 'AUTO', state: e.armed ? 'ARMED' : 'MANUAL', tap: () => setArmed(!e.armed) },
        ...Object.keys(ys).map((c) => ({ id: 'nz' + c, kind: 'nozzle', x: 420, y: ys[c], on: main, alarm: e.fire && e.fire.comp === c, label: `${COMPS[c].toUpperCase()}${e.fire && e.fire.comp === c ? ' · FIRE: TAP' : ''}`, lx: 26, ly: 5, anchor: 'start', tap: e.fire && e.fire.comp === c ? () => discharge() : null })),
      ],
      links: [L([[100, 150], [175, 150]], 'agent', main), L([[205, 150], [300, 150], [300, 60], [408, 60]], 'agent', main), L([[300, 150], [408, 150]], 'agent', main), L([[300, 150], [300, 240], [408, 240]], 'agent', main)],
    };
  },
  bulkheads: () => {
    const e = eng(), comp = (x, w, c, label) => ({ id: 'c' + c, kind: 'tank', x, y: 130, w, h: 120, level: c === 'mid' ? 0 : e.flood[c] / 100, color: '#2f8fd8', label: label + (e.leak[c] ? ' · LEAK' : '') });
    return {
      nodes: [
        comp(110, 160, 'fwd', 'FORWARD'), comp(300, 180, 'mid', 'MIDSHIPS'), comp(490, 160, 'aft', 'AFT'),
        { id: 'df', kind: 'door', x: 200, y: 130, on: e.bulk.fwd, alarm: e.leak.fwd, state: e.bulk.fwd ? 'OPEN' : 'SHUT', tap: () => setBulkhead('fwd', !e.bulk.fwd) },
        { id: 'da', kind: 'door', x: 400, y: 130, on: e.bulk.aft, alarm: e.leak.aft, state: e.bulk.aft ? 'OPEN' : 'SHUT', tap: () => setBulkhead('aft', !e.bulk.aft) },
        P('bulk.pump.fwd', 110, 245, 'BILGE PUMP'), P('bulk.pump.aft', 490, 245, 'BILGE PUMP'),
        { id: 'ob1', kind: 'sink', x: 20, y: 228, label: 'OVERBOARD', anchor: 'start' }, { id: 'ob2', kind: 'sink', x: 580, y: 228, label: 'OVERBOARD', anchor: 'end' },
      ],
      links: [L([[110, 190], [110, 228]], 'sea', part('bulk.pump.fwd') && e.flood.fwd > 0), L([[93, 245], [20, 245]], 'sea', part('bulk.pump.fwd') && e.flood.fwd > 0),
        L([[490, 190], [490, 228]], 'sea', part('bulk.pump.aft') && e.flood.aft > 0), L([[507, 245], [580, 245]], 'sea', part('bulk.pump.aft') && e.flood.aft > 0)],
    };
  },
  ballast: () => {
    const e = eng(), s = sim.s, fill = Math.min(1, s.depth / 600), hp = working('ballast') && part('air.bank') && e.air > 0, blowing = !!e.blowing;
    return {
      nodes: [
        { id: 'bank', kind: 'tank', x: 70, y: 80, w: 70, h: 60, level: e.air / 100, color: '#dfe9f5', label: 'AIR BANK' }, P('air.bank', 180, 80, 'BANK VALVE', 'valve'),
        { id: 'bf', kind: 'valve', x: 230, y: 160, on: blowing, label: 'BLOW FWD' }, { id: 'ba', kind: 'valve', x: 430, y: 160, on: blowing, label: 'BLOW AFT' },
        { id: 'tf', kind: 'tank', x: 230, y: 250, w: 110, h: 60, level: blowing ? fill * 0.3 : fill, color: '#2f8fd8', label: 'FORE TANK' }, { id: 'ta', kind: 'tank', x: 430, y: 250, w: 110, h: 60, level: blowing ? fill * 0.3 : fill, color: '#2f8fd8', label: 'AFT TANK' },
        { id: 'lev', kind: 'lever', x: 515, y: 60, w: 130, inner: blowing ? 'BLOWING' : 'EMERGENCY BLOW', alarm: blowing, label: `NEEDS ${BLOW_AIR}% AIR`, tap: e.air >= BLOW_AIR && s.depth >= 1 ? () => blow() : null },
      ],
      links: [L([[105, 80], [165, 80]], 'air', hp), L([[195, 80], [330, 80], [330, 130], [230, 130], [230, 145]], 'air', hp && blowing), L([[330, 130], [430, 130], [430, 145]], 'air', hp && blowing),
        L([[230, 175], [230, 220]], 'air', blowing), L([[430, 175], [430, 220]], 'air', blowing)],
    };
  },
  air: () => {
    const e = eng(), s = sim.s, ch = airCharging(), intake = working('air') && part('air.intake') && s.depth < 20;
    return {
      nodes: [
        { id: 'sn', kind: 'src', x: 30, y: 70, label: s.depth < 20 ? 'SNORKEL' : 'SNORKEL (BELOW 20 M)', anchor: 'start' }, P('air.intake', 170, 70, 'INTAKE', 'valve'),
        P('air.comp', 280, 70, 'COMPRESSOR'), { id: 'dry', kind: 'unit', x: 410, y: 70, w: 100, inner: 'DRYER', on: ch },
        P('air.bank', 410, 170, 'BANK VALVE', 'valve'), { id: 'bank', kind: 'tank', x: 410, y: 250, w: 100, h: 56, level: e.air / 100, color: '#dfe9f5', label: `AIR BANK ${Math.round(e.air * 2.5)} BAR` },
        { id: 'tb', kind: 'sink', x: 585, y: 250, label: 'TO BALLAST ▶', anchor: 'end' },
      ],
      links: [L([[110, 70], [155, 70]], 'air', intake), L([[185, 70], [263, 70]], 'air', intake), L([[297, 70], [360, 70]], 'air', ch), L([[410, 90], [410, 155]], 'air', ch && part('air.bank')),
        L([[410, 185], [410, 222]], 'air', ch && part('air.bank')), L([[460, 250], [500, 250]], 'air', part('air.bank') && e.air > 0)],
    };
  },
};
