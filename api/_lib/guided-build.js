/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * Guided builds. One planner for the eight Site Map builds: DER, auto-layout,
 * BESS (behind the meter, front of the meter, solar + storage), full
 * topology, Level 2, DCFC, compute, and the engineering chain.
 *
 * The browser sends the answers and the parcel. This file returns the
 * equipment, the conduit, and a one-line summary. It does not price.
 *
 * DER block size and the pixel-minimum equipment follow placeDerBuildAt.
 * BESS conduit names follow BGB_PRESETS. Compute node order follows the
 * CGB topology list. The engineering order follows OmegaEngBuild's SEQ.
 * Auto-layout is omega-editor-v2-geom fillTables, the same packer the
 * drawing uses, so the count on the plan and the count on the map match.
 */
'use strict';
var Form = require('../../omega-guided-build-form.js');
var G = require('../../omega-editor-v2-geom.js');

var DER = {
  pv: { label: 'Solar PV', blockKw: 500, wPerSqft: 15 },
  wind: { label: 'Wind', blockKw: 100 },
  gas: { label: 'Gas / Genset', blockKw: 750 }
};

var BESS_CHAIN = {
  btm: {
    label: 'Behind the meter',
    seq: ['bess', 'xfmr', 'disco', 'panel', 'meter', 'service'],
    legs: { bess: 'EV-MAIN', xfmr: 'EV-MAIN', disco: 'MV-UG', panel: 'MV-UG', meter: 'EMT-BMS', service: 'EV-FEEDER' }
  },
  fom: {
    label: 'Front of the meter',
    seq: ['bess', 'xfmr', 'disco', 'panel', 'meter', 'service'],
    legs: { bess: 'EV-MAIN', xfmr: 'EV-MAIN', disco: 'MV-UG', panel: 'MV-UG', meter: 'EMT-BMS', service: 'MV-UG' }
  }
};

var SOLAR_LINKS = [
  ['service', 'utilxfmr', 'MV-UG'],
  ['utilxfmr', 'mainswgr', 'MV-UG'],
  ['mainswgr', 'acblock', 'EV-FEEDER'],
  ['mainswgr', 'pvinv', 'EV-FEEDER'],
  ['pvinv', 'pv', 'RMC-DC'],
  ['mainswgr', 'loads', 'EV-FEEDER']
];

var COMPUTE_SEQ = {
  RADIAL: ['substation', 'stepdown', 'mvswgr', 'powergen', 'genset', 'ups', 'bess', 'pdu', 'cooling', 'compute'],
  N1: ['substation', 'stepdown', 'mvswgr', 'powergen', 'genset', 'ups', 'upsB', 'bess', 'pdu', 'cooling', 'compute'],
  ISO: ['substation', 'stepdown', 'mvswgr', 'powergen', 'genset', 'ups', 'upsC', 'sts', 'bess', 'pdu', 'cooling', 'compute'],
  DIST: ['substation', 'stepdown', 'mvswgr', 'powergen', 'genset', 'ups', 'upsB', 'upsC', 'pdu', 'pduB', 'cooling', 'compute'],
  TWON: ['substation', 'stepdown', 'mvswgr', 'powergen', 'genset', 'ups', 'upsB', 'bess', 'pdu', 'pduB', 'cooling', 'compute'],
  DC800: ['substation', 'sst', 'dcbus', 'powergen', 'bess', 'cooling', 'compute']
};
var COMPUTE_LABEL = {
  RADIAL: 'Radial', N1: 'N+1', ISO: 'Isolated redundant', DIST: 'Distributed redundant', TWON: '2N', DC800: '800 VDC'
};
var COMPUTE_NODE = {
  substation: { key: 'substation', label: 'Grid substation', w: 24, h: 16, opt: 'incSub' },
  stepdown: { key: 'transformer', label: 'Step-down transformer', w: 8, h: 6 },
  mvswgr: { key: 'panel', label: 'MV switchgear', w: 10, h: 4 },
  powergen: { key: 'fuelcell', label: 'On-site generation', w: 10, h: 6, opt: 'incGen' },
  genset: { key: 'genset', label: 'Standby generator', w: 14, h: 6, opt: 'incGenset' },
  ups: { key: 'ups', label: 'UPS', w: 6, h: 4 },
  upsB: { key: 'ups', label: 'UPS B', w: 6, h: 4 },
  upsC: { key: 'ups', label: 'UPS C', w: 6, h: 4 },
  sts: { key: 'panel', label: 'Static transfer switch', w: 6, h: 4 },
  bess: { key: 'bess', label: 'Battery', w: 20, h: 8, opt: 'incBess' },
  pdu: { key: 'panel', label: 'PDU', w: 6, h: 3 },
  pduB: { key: 'panel', label: 'PDU B', w: 6, h: 3 },
  cooling: { key: 'cooling', label: 'Cooling plant', w: 12, h: 8, opt: 'incCool' },
  compute: { key: 'racks', label: 'Compute racks', w: 16, h: 8 },
  sst: { key: 'transformer', label: 'Solid-state transformer', w: 8, h: 6 },
  dcbus: { key: 'panel', label: '800 VDC backbone', w: 10, h: 3 }
};

var ENG_SEQ = [
  { id: 'mpoi', key: 'poi', label: 'Utility point of interconnection', w: 4, h: 4, spec: null },
  { id: 'xfmr', key: 'transformer', label: 'Utility transformer', w: 8, h: 6, spec: 'MV-UG' },
  { id: 'mdp', key: 'panel', label: 'Main switchgear', w: 10, h: 4, spec: 'AC-FEED' },
  { id: 'pcs', key: 'pcs', label: 'PCS / inverter skid', w: 8, h: 4, spec: 'AC-FEED' },
  { id: 'bessctr', key: 'bess', label: 'BESS container', w: 20, h: 8, spec: 'BAT-DC' },
  { id: 'ems', key: 'ems', label: 'EMS cabinet', w: 3, h: 2, spec: 'COMMS' }
];

function clamp(n, lo, hi, d) {
  n = +n;
  if (!isFinite(n)) n = d;
  if (n < lo) n = lo;
  if (n > hi) n = hi;
  return n;
}
function flag(v, d) {
  if (v === true || v === 'true' || v === 1 || v === '1') return true;
  if (v === false || v === 'false' || v === 0 || v === '0') return false;
  return d;
}
function optNum(v) {
  if (v == null || v === '') return null;
  var n = +v;
  return isFinite(n) ? n : null;
}
function round1(n) { return Math.round(n * 10) / 10; }
function merge(id, input) {
  var base = Form.defaults(id), k;
  input = input && typeof input === 'object' ? input : {};
  for (k in input) if (Object.prototype.hasOwnProperty.call(input, k) && input[k] != null && input[k] !== '') base[k] = input[k];
  return base;
}
function originOf(input) {
  var o = input.origin;
  if (o && isFinite(+o.x) && isFinite(+o.y)) return { x: +o.x, y: +o.y };
  return { x: 0, y: 0 };
}
function fail(id, reason) {
  return { ok: false, builder: id, reason: reason };
}
function finish(id, summary, equipment, conduits, choices) {
  return {
    ok: true,
    builder: id,
    summary: summary,
    equipment: equipment || [],
    conduits: conduits || [],
    notes: [],
    choices: choices || []
  };
}
function choice(label, value) { return { label: label, value: String(value) }; }

function equip(spec, x, y) {
  var e = {
    type: 'equip', layer: 'equipment', key: spec.key, label: spec.label,
    x: round1(x), y: round1(y), w: spec.w, h: spec.h, rot: 0
  };
  if (spec.kw != null && spec.kw !== '') e.kw = spec.kw;
  if (spec.kwh != null && spec.kwh !== '') e.kwh = spec.kwh;
  if (spec.ports != null) e.ports = spec.ports;
  if (spec.level) e.level = spec.level;
  if (spec.derKw) e.derKw = spec.derKw;
  return e;
}
function conduit(a, b, spec) {
  return {
    type: 'conduit', layer: 'conduit', spec: spec || 'RMC',
    pts: [
      { x: round1(a.x + a.w), y: round1(a.y + a.h / 2) },
      { x: round1(b.x), y: round1(b.y + b.h / 2) }
    ]
  };
}
function row(origin, items, gap) {
  var x = origin.x, equipment = [], conduits = [], i, spec, ent, prev = null;
  for (i = 0; i < items.length; i++) {
    spec = items[i];
    ent = equip(spec, x, origin.y);
    equipment.push(ent);
    if (prev && spec.spec) conduits.push(conduit(prev, ent, spec.spec));
    prev = ent;
    x += spec.w + gap;
  }
  return { equipment: equipment, conduits: conduits };
}

/* ── DER ───────────────────────────────────────────────────────────── */
function der(input) {
  var src = DER[input.source] ? input.source : 'pv';
  var spec = DER[src];
  var mw = clamp(input.mw, 0.5, 20, 5);
  var cols = Math.round(clamp(input.cols, 1, 12, 4));
  var xfmr = flag(input.xfmr, true);
  var blocks = Math.max(1, Math.ceil((mw * 1000) / spec.blockKw));
  var ppf = clamp(input.pxPerFt, 0.5, 40, 6);
  if (blocks > 48) return fail('der', 'That nameplate needs ' + blocks + ' blocks. 48 is the most this build places at once.');
  var blkW, blkH;
  if (src === 'pv') {
    var side = Math.sqrt(spec.blockKw * 1000 / spec.wPerSqft);
    blkW = side;
    blkH = side * 0.6;
  } else if (src === 'wind') {
    blkW = 70; blkH = 70;
  } else {
    blkW = 14; blkH = 6;
  }
  var cellW = blkW + (src === 'pv' ? 20 : 30);
  var cellH = blkH + 18;
  var gapFt = 6 / ppf;
  var pcsFt = Math.max(14, Math.round(4 * ppf)) / ppf;
  var xfmrFt = Math.max(16, Math.round(6 * ppf)) / ppf;
  var poiFt = 36 / ppf;
  var o = originOf(input);
  var rows = Math.ceil(blocks / cols);
  var equipment = [], conduits = [], xfmrPts = [], n = 0, r, c;
  for (r = 0; r < rows; r++) {
    for (c = 0; c < cols && n < blocks; c++) {
      var cx = o.x + c * cellW, cy = o.y + r * cellH;
      var block = {
        type: src === 'pv' ? 'rect' : 'equip',
        layer: src === 'pv' ? 'array' : 'equipment',
        key: src === 'pv' ? 'pv' : (src === 'wind' ? 'wind' : 'genset'),
        label: spec.label + ' ' + (n + 1),
        x: round1(cx), y: round1(cy), w: round1(blkW), h: round1(blkH), rot: 0,
        kw: spec.blockKw, derKw: spec.blockKw
      };
      equipment.push(block);
      var inv = null;
      if (src === 'pv') {
        var invCx = cx + blkW / 2, invCy = cy + blkH + gapFt + pcsFt / 2;
        inv = equip({ key: 'pcs', label: 'PV inverter ' + (n + 1), w: pcsFt, h: pcsFt, kw: spec.blockKw }, invCx - pcsFt / 2, invCy - pcsFt / 2);
        equipment.push(inv);
      }
      if (xfmr) {
        var xfmrY = src === 'pv' ? (inv.y + inv.h + gapFt) : (cy + blkH + gapFt);
        var xf = equip({ key: 'transformer', label: 'Transformer ' + (n + 1), w: xfmrFt, h: xfmrFt }, cx + blkW / 2 - xfmrFt / 2, xfmrY);
        equipment.push(xf);
        xfmrPts.push(xf);
        if (src === 'pv' && inv) {
          conduits.push(conduit(block, inv, 'RMC-DC'));
          conduits.push(conduit(inv, xf, 'RMC-AC'));
        }
      }
      n++;
    }
  }
  var poiX = o.x + cols * cellW + 8;
  var poiY = o.y + (rows * cellH) / 2;
  var poi = equip({ key: 'poi', label: 'DER collector', w: poiFt, h: poiFt }, poiX - poiFt / 2, poiY - poiFt / 2);
  equipment.push(poi);
  if (xfmr) {
    for (n = 0; n < xfmrPts.length; n++) conduits.push(conduit(xfmrPts[n], poi, 'RMC-AC'));
  }
  var nameplateMw = round1((blocks * spec.blockKw) / 1000);
  return finish('der', {
    line: blocks + ' × ' + spec.label + ' = ' + nameplateMw + ' MW, with a collector.',
    blocks: blocks, blockKw: spec.blockKw, nameplateMw: nameplateMw, source: src, rows: rows, cols: cols
  }, equipment, conduits, [
    choice('Source', spec.label),
    choice('Blocks', blocks + ' × ' + spec.blockKw + ' kW'),
    choice('Nameplate', nameplateMw + ' MW'),
    choice('Transformers', xfmr ? 'on each block' : 'none')
  ]);
}

/* ── auto-layout ───────────────────────────────────────────────────── */
function ring(list) {
  if (!Array.isArray(list) || list.length < 3 || list.length > 8000) return null;
  var out = [], i, p;
  for (i = 0; i < list.length; i++) {
    p = list[i];
    if (!p || !isFinite(+p.x) || !isFinite(+p.y)) return null;
    out.push({ x: +p.x, y: +p.y });
  }
  return out;
}
function autolayout(input) {
  var boundary = ring(input.boundary);
  if (!boundary) return fail('autolayout', 'Auto-layout needs a closed parcel.');
  var exclusions = [], i, one;
  var raw = Array.isArray(input.exclusions) ? input.exclusions : [];
  for (i = 0; i < raw.length && i < 200; i++) {
    one = ring(raw[i]);
    if (one) exclusions.push(one);
  }
  var mount = input.mount || 'fixed-ground';
  var opts = { mount: mount };
  var setback = optNum(input.setbackFt);
  var maxKw = optNum(input.maxKwDc);
  if (setback != null) opts.setbackFt = clamp(setback, 0, 100, 0);
  if (maxKw != null && maxKw > 0) opts.maxKwDc = clamp(maxKw, 1, 100000, 1);
  var lay = G.fillTables(boundary, exclusions, opts);
  if (!lay.ok) return fail('autolayout', lay.reason || 'The parcel did not take an array.');
  var equipment = [];
  if (input.boundaryId) {
    var arr = { type: 'array', layer: 'array', boundaryId: String(input.boundaryId), mount: lay.presetKey };
    if (setback != null) arr.setbackFt = opts.setbackFt;
    if (maxKw != null && maxKw > 0) arr.maxKwDc = opts.maxKwDc;
    equipment.push(arr);
  }
  return finish('autolayout', {
    line: lay.tableCount + ' tables, ' + lay.kw + ' kW-DC, on the parcel.',
    tableCount: lay.tableCount, moduleCount: lay.moduleCount, kw: lay.kw, kwAc: lay.kwAc,
    mount: lay.presetKey, setbackFt: lay.setbackFt, gcr: lay.gcr
  }, equipment, [], [
    choice('Mount', lay.presetKey),
    choice('Tables', lay.tableCount),
    choice('kW-DC', lay.kw)
  ]);
}

/* ── BESS ──────────────────────────────────────────────────────────── */
function bessPad(kw, kwh) {
  return { key: 'bess', label: 'BESS', w: 20, h: 8, kw: kw, kwh: kwh, spec: null };
}
function bess(input) {
  var mode = input.mode === 'fom' || input.mode === 'solar' ? input.mode : 'btm';
  var kw = Math.round(clamp(input.kw, 50, 20000, 1000));
  var hours = clamp(input.hours, 0.5, 8, 2);
  var kwh = Math.round(kw * hours);
  var o = originOf(input);
  if (mode === 'solar') return bessSolar(input, o, kw, kwh, hours);
  var chain = BESS_CHAIN[mode];
  var nodes = {
    bess: bessPad(kw, kwh),
    xfmr: { key: 'transformer', label: 'Step-up transformer', w: 8, h: 6, spec: chain.legs.xfmr },
    disco: { key: 'disco', label: 'AC disconnect', w: 3, h: 2, spec: chain.legs.disco },
    panel: { key: 'panel', label: 'Switchgear', w: 10, h: 4, spec: chain.legs.panel },
    meter: { key: 'meter', label: 'Revenue meter', w: 2, h: 1.5, spec: chain.legs.meter },
    service: { key: 'poi', label: 'Utility point of interconnection', w: 4, h: 4, spec: chain.legs.service }
  };
  var items = [], i;
  for (i = 0; i < chain.seq.length; i++) items.push(nodes[chain.seq[i]]);
  var laid = row(o, items, 6);
  return finish('bess', {
    line: chain.label + ', ' + kw + ' kW / ' + kwh + ' kWh.',
    mode: mode, kw: kw, kwh: kwh, hours: hours
  }, laid.equipment, laid.conduits, [
    choice('Arrangement', chain.label),
    choice('Battery', kw + ' kW / ' + kwh + ' kWh')
  ]);
}
function bessSolar(input, o, kw, kwh, hours) {
  var solarKw = optNum(input.solarKw);
  var nodes = {
    service: equip({ key: 'poi', label: 'Utility point of interconnection', w: 4, h: 4 }, o.x, o.y),
    utilxfmr: equip({ key: 'transformer', label: 'Utility service transformer', w: 8, h: 6 }, o.x + 12, o.y),
    mainswgr: equip({ key: 'panel', label: 'Main switchgear', w: 10, h: 4 }, o.x + 28, o.y),
    acblock: equip({ key: 'bess', label: 'BESS AC block', w: 20, h: 8, kw: kw, kwh: kwh }, o.x + 28, o.y - 16),
    pvinv: equip({ key: 'pcs', label: 'Solar inverter', w: 8, h: 4, kw: solarKw || 0 }, o.x + 46, o.y),
    loads: equip({ key: 'panel', label: 'Building loads', w: 8, h: 4 }, o.x + 46, o.y + 12)
  };
  var equipment = [nodes.service, nodes.utilxfmr, nodes.mainswgr, nodes.acblock, nodes.pvinv, nodes.loads];
  if (input.boundaryId) {
    equipment.push({ type: 'array', layer: 'array', boundaryId: String(input.boundaryId), mount: 'fixed-ground' });
  } else {
    nodes.pv = equip({ key: 'pv', label: 'PV array', w: 20, h: 12 }, o.x + 62, o.y);
    equipment.push(nodes.pv);
  }
  var conduits = [], i, link, a, b;
  for (i = 0; i < SOLAR_LINKS.length; i++) {
    link = SOLAR_LINKS[i];
    a = nodes[link[0]]; b = nodes[link[1]];
    if (a && b) conduits.push(conduit(a, b, link[2]));
  }
  return finish('bess', {
    line: 'Solar + storage, ' + kw + ' kW / ' + kwh + ' kWh battery.',
    mode: 'solar', kw: kw, kwh: kwh, hours: hours, solarKw: solarKw
  }, equipment, conduits, [
    choice('Arrangement', 'Solar + storage'),
    choice('Battery', kw + ' kW / ' + kwh + ' kWh')
  ]);
}

/* ── full topology ─────────────────────────────────────────────────── */
function topology(input) {
  var kw = Math.round(clamp(input.kw, 50, 20000, 1000));
  var hours = clamp(input.hours, 0.5, 8, 2);
  var kwh = Math.round(kw * hours);
  var items = [
    { key: 'poi', label: 'Point of connection', w: 4, h: 4, spec: null },
    { key: 'bess', label: 'BESS', w: 20, h: 8, kw: kw, kwh: kwh, spec: 'BAT-DC' },
    { key: 'transformer', label: 'Transformer', w: 8, h: 6, spec: 'AC-FEED' },
    { key: 'meter', label: 'Meter', w: 2, h: 1.5, spec: 'EMT-BMS' },
    { key: 'panel', label: 'Panelboard', w: 8, h: 3, spec: 'AC-FEED' },
    { key: 'ems', label: 'EMS', w: 3, h: 2, spec: 'COMMS' },
    { key: 'poi', label: 'Utility point of interconnection', w: 4, h: 4, spec: 'MV-UG' }
  ];
  var laid = row(originOf(input), items, 6);
  return finish('topology', {
    line: 'Full topology, ' + kw + ' kW / ' + kwh + ' kWh.',
    kw: kw, kwh: kwh, nodes: items.length
  }, laid.equipment, laid.conduits, [
    choice('Chain', 'Point of connection, battery, transformer, meter, panel, EMS, utility'),
    choice('Battery', kw + ' kW / ' + kwh + ' kWh')
  ]);
}

/* ── Level 2 and DCFC ─────────────────────────────────────────────── */
function chargers(input, kind) {
  var o = originOf(input);
  var items = [], i, n, kwEach, total;
  if (kind === 'l2') {
    n = Math.round(clamp(input.stalls, 1, 40, 8));
    var amps = clamp(input.amps, 16, 80, 32);
    var volts = String(input.volts) === '208' ? 208 : 240;
    kwEach = round1(amps * volts / 1000);
    var service = input.service === 'new' ? 'new' : 'existing';
    if (service === 'new') {
      items.push({ key: 'poi', label: 'Utility point of interconnection', w: 4, h: 4, spec: null });
      items.push({ key: 'transformer', label: 'Service transformer', w: 8, h: 6, spec: 'MV-UG' });
    }
    items.push({ key: 'panel', label: service === 'new' ? 'Pedestal' : 'Panel', w: 6, h: 3, spec: service === 'new' ? 'AC-FEED' : null });
    for (i = 0; i < n; i++) {
      items.push({ key: 'charger', label: 'Level 2 ' + (i + 1), w: 3, h: 2, kw: kwEach, level: 'l2', spec: 'EV-BRANCH' });
    }
    total = round1(n * kwEach);
    var laid = row(o, items, 6);
    return finish('l2', {
      line: n + ' Level 2 stalls, ' + kwEach + ' kW each, ' + total + ' kW.',
      stalls: n, kwEach: kwEach, totalKw: total, amps: amps, volts: volts, service: service
    }, laid.equipment, laid.conduits, [
      choice('Stalls', n),
      choice('Each', amps + ' A at ' + volts + ' V (' + kwEach + ' kW)'),
      choice('Service', service === 'new' ? 'New service' : 'Existing panel')
    ]);
  }
  n = Math.round(clamp(input.count, 1, 40, 4));
  kwEach = Math.round(clamp(input.kw, 50, 400, 150));
  var ports = Math.round(clamp(input.ports, 1, 4, 2));
  items.push({ key: 'poi', label: 'Utility point of interconnection', w: 4, h: 4, spec: null });
  items.push({ key: 'transformer', label: 'Service transformer', w: 8, h: 6, spec: 'MV-UG' });
  items.push({ key: 'panel', label: 'Switchgear', w: 10, h: 4, spec: 'AC-FEED' });
  for (i = 0; i < n; i++) {
    items.push({ key: 'charger', label: 'DCFC ' + (i + 1), w: 4, h: 3, kw: kwEach, ports: ports, level: 'dcfc', spec: 'EV-FEEDER' });
  }
  total = n * kwEach;
  var laidDc = row(o, items, 8);
  return finish('dcfc', {
    line: n + ' fast chargers, ' + kwEach + ' kW each, ' + total + ' kW, ' + ports + ' ports each.',
    count: n, kwEach: kwEach, totalKw: total, ports: ports
  }, laidDc.equipment, laidDc.conduits, [
    choice('Chargers', n + ' × ' + kwEach + ' kW'),
    choice('Ports', ports + ' each'),
    choice('Service', 'Utility, transformer, switchgear')
  ]);
}

/* ── compute ───────────────────────────────────────────────────────── */
function compute(input) {
  var topo = COMPUTE_SEQ[input.topo] ? input.topo : 'RADIAL';
  var seq = COMPUTE_SEQ[topo];
  var computeMw = clamp(input.computeMw, 0.5, 100, 5);
  var bessKw = optNum(input.bessKw);
  var bessHours = optNum(input.bessHours);
  var on = {
    incSub: flag(input.incSub, true),
    incGen: flag(input.incGen, true),
    incGenset: flag(input.incGenset, true),
    incBess: flag(input.incBess, true),
    incCool: flag(input.incCool, true)
  };
  var items = [], i, node, spec;
  for (i = 0; i < seq.length; i++) {
    node = COMPUTE_NODE[seq[i]];
    if (node.opt && !on[node.opt]) continue;
    spec = { key: node.key, label: node.label, w: node.w, h: node.h, spec: items.length ? 'MV-UG' : null };
    if (seq[i] === 'compute') spec.kw = Math.round(computeMw * 1000);
    if (seq[i] === 'bess' && bessKw != null && bessHours != null && bessKw > 0 && bessHours > 0) {
      spec.kw = Math.round(bessKw);
      spec.kwh = Math.round(bessKw * bessHours);
    }
    items.push(spec);
  }
  var laid = row(originOf(input), items, 6);
  return finish('compute', {
    line: COMPUTE_LABEL[topo] + ', ' + computeMw + ' MW of compute, ' + items.length + ' nodes.',
    topo: topo, computeMw: computeMw, nodes: items.length, computeKw: Math.round(computeMw * 1000)
  }, laid.equipment, laid.conduits, [
    choice('Topology', COMPUTE_LABEL[topo]),
    choice('Compute', computeMw + ' MW'),
    choice('Nodes', items.length)
  ]);
}

/* ── engineering ───────────────────────────────────────────────────── */
function engineering(input) {
  var kw = Math.round(clamp(input.kw, 50, 20000, 1000));
  var hours = clamp(input.hours, 0.5, 8, 2);
  var kwh = Math.round(kw * hours);
  var unit = optNum(input.unitKwh);
  var each = unit && unit > 0 ? unit : kwh;
  var qty = Math.max(1, Math.min(24, Math.ceil(kwh / each)));
  var per = Math.round(kwh / qty);
  var items = [], i, step;
  for (i = 0; i < ENG_SEQ.length; i++) {
    step = ENG_SEQ[i];
    if (step.id === 'bessctr') {
      for (var q = 0; q < qty; q++) {
        items.push({
          key: 'bess', label: qty > 1 ? ('BESS container ' + (q + 1)) : 'BESS container',
          w: step.w, h: step.h, kw: Math.round(kw / qty), kwh: per,
          spec: 'BAT-DC'
        });
      }
    } else {
      items.push({ key: step.key, label: step.label, w: step.w, h: step.h, spec: step.spec });
    }
  }
  var laid = row(originOf(input), items, 6);
  /* EMS also reads the battery and takes control power from the switchgear. */
  var pcs = null, mdp = null, ems = null, batteries = [], e;
  for (i = 0; i < laid.equipment.length; i++) {
    e = laid.equipment[i];
    if (e.key === 'pcs') pcs = e;
    else if (e.label === 'Main switchgear') mdp = e;
    else if (e.key === 'ems') ems = e;
    else if (e.key === 'bess') batteries.push(e);
  }
  if (ems) {
    for (i = 0; i < batteries.length; i++) laid.conduits.push(conduit(ems, batteries[i], 'EMT-BMS'));
    if (mdp) laid.conduits.push(conduit(mdp, ems, 'CTRL-PWR'));
  }
  return finish('engineering', {
    line: 'Engineering chain, ' + qty + ' container' + (qty === 1 ? '' : 's') + ', ' + kw + ' kW / ' + kwh + ' kWh.',
    kw: kw, kwh: kwh, containers: qty
  }, laid.equipment, laid.conduits, [
    choice('Battery', kw + ' kW / ' + kwh + ' kWh'),
    choice('Containers', qty)
  ]);
}

var PLANNERS = {
  der: der, autolayout: autolayout, bess: bess, topology: topology,
  l2: function (input) { return chargers(input, 'l2'); },
  dcfc: function (input) { return chargers(input, 'dcfc'); },
  compute: compute, engineering: engineering
};

function plan(id, input) {
  if (!PLANNERS[id]) return fail(id || '', 'That build is not one of the eight.');
  return PLANNERS[id](merge(id, input));
}
function signature(result) {
  if (!result || !result.ok) return '';
  var keys = [], legs = [], i, e;
  for (i = 0; i < result.equipment.length; i++) {
    e = result.equipment[i];
    keys.push(e.key || e.type);
  }
  for (i = 0; i < result.conduits.length; i++) legs.push(result.conduits[i].spec || '');
  return keys.join('>') + '|' + legs.join(',');
}

module.exports = {
  plan: plan,
  signature: signature,
  list: Form.builders,
  form: Form.fields,
  VERSION: 'guided-build/1'
};
