/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   ONE preview pricing interface. Site Map, Omega Prime, Quote Desk, and
   editor-v2 call quote(). Each line carries its price, unit, source,
   region factor, date, and confidence. Dollars stay here. The live engines
   (editor-cost.js, cost-model.js) are not replaced unless
   PRICING_LIBRARY is this version. */
'use strict';

var Lib = require('./pricing-library');
var El = require('./pricing-electrical');

var VERSION = Lib.VERSION;

function num(v) { var x = Number(v); return isFinite(x) ? x : 0; }
function money(x) { return Math.round(x); }

function previewRequested(body) {
  body = body || {};
  if (body.preview === true) return true;
  if (body.version === VERSION || body.pricingVersion === VERSION) return true;
  if (process.env.PRICING_LIBRARY === VERSION) return true;
  return false;
}

function replacesLive() {
  return process.env.PRICING_LIBRARY === VERSION;
}

/* What POST /api/project-pricing returns. No library dollars unless the
   caller asked for this version. */
function answer(body) {
  body = body && typeof body === 'object' ? body : {};
  if (!previewRequested(body)) {
    return {
      ok: true,
      version: 'live',
      preview: false,
      replacesLive: false,
      libraryVersion: VERSION,
      message: 'Pricing library ' + VERSION + ' is a preview for review. The live Site Map and Prime engines are unchanged. Send preview true, or version "' + VERSION + '", to see the library. It replaces those engines only when PRICING_LIBRARY is ' + VERSION + '.'
    };
  }
  return quote(body);
}

function lineFrom(it, extra) {
  extra = extra || {};
  var regionFactor = it.region === 'labor' ? null : 1;
  var price = it.price;
  var qty = extra.qty == null ? null : extra.qty;
  var amount = null;
  if (it.inTotal && it.status === 'sourced' && price != null && qty != null) {
    amount = money(qty * price * (regionFactor == null ? 1 : regionFactor));
  }
  return {
    id: extra.id || it.id,
    label: extra.label || it.label,
    qty: qty,
    qtyUnit: extra.qtyUnit || null,
    price: price,
    unit: it.unit,
    amount: amount,
    low: it.low,
    high: it.high,
    source: it.source,
    url: it.url,
    published: it.published,
    dollarYear: it.dollarYear,
    read: it.read,
    regionFactor: regionFactor,
    region: it.region,
    confidence: it.confidence,
    status: it.status,
    method: it.method || '',
    fill: it.fill || '',
    index: it.index || null,
    table: it.table || null,
    inTotal: it.inTotal && amount != null,
    note: extra.note || it.note
  };
}

function blankLine(id, label, qty, qtyUnit, note, lineId) {
  var it = Lib.byId(id);
  var row = lineFrom(it || {
    id: id, label: label, price: null, unit: '', source: '', url: '', published: '',
    dollarYear: null, read: Lib.READ, region: 'national', confidence: 'none',
    status: 'needs source', inTotal: false, note: note || ''
  }, { qty: qty, qtyUnit: qtyUnit, label: label, note: note });
  if (lineId) row.id = lineId;
  if (note && it && it.note) row.note = note + ' ' + it.note;
  row.inTotal = false;
  row.amount = null;
  return row;
}

function sectorOf(pv) {
  if (pv.sector) return pv.sector;
  if (pv.mount === 'canopy') return 'canopy';
  return Lib.pvSector(pv.kwDc, pv.mount);
}

function pvLines(pv) {
  var rows = [], mounts, i, m, kw;
  if (pv.byMount) {
    mounts = Object.keys(pv.byMount);
    for (i = 0; i < mounts.length; i++) {
      m = mounts[i];
      kw = num(pv.byMount[m]);
      if (!(kw > 0)) continue;
      rows = rows.concat(onePv({ kwDc: kw, mount: m, sector: m === 'canopy' ? 'canopy' : sectorOf({ kwDc: pv.kwDc || kw, mount: m }) }));
    }
    return rows;
  }
  return onePv(pv);
}

function onePv(pv) {
  var sector = sectorOf(pv);
  var kw = num(pv.kwDc);
  var rows = [];
  if (sector === 'canopy') {
    rows.push(blankLine('pv.canopy', 'Solar canopy, installed', kw * 1000, 'Wdc', Lib.byId('pv.canopy').note));
    return rows;
  }
  var key = sector === 'utility' ? 'pv.utility.mmp' : (sector === 'residential' ? 'pv.residential.mmp' : 'pv.commercial.mmp');
  var it = Lib.byId(key);
  var outside = false;
  if (sector === 'commercial' && (kw < 125 || kw > 500)) outside = true;
  if (sector === 'utility' && (kw < 50000 || kw > 200000)) outside = true;
  if (sector === 'residential' && (kw < 4 || kw > 16)) outside = true;
  var note = it.note;
  if (outside) note += ' This system is outside the benchmark system\'s stated size window. The same national price is shown, not a made-up size curve.';
  var row = lineFrom(it, { qty: kw * 1000, qtyUnit: 'Wdc', note: note });
  rows.push(row);
  var om = Lib.byId(key.replace('.mmp', '.om'));
  if (om) rows.push(lineFrom(om, { qty: kw, qtyUnit: 'kWdc-yr' }));
  return rows;
}

function bessLines(bess) {
  var kw = num(bess.kw);
  var kwh = num(bess.kwh);
  if (!(kwh > 0) && kw > 0) kwh = kw * (num(bess.hours) || Lib.BESS.hours);
  if (!(kw > 0) && kwh > 0) kw = kwh / (num(bess.hours) || Lib.BESS.hours);
  var hours = kw > 0 ? kwh / kw : 0;
  var energy = Lib.byId('bess.utility.energy');
  var power = Lib.byId('bess.utility.power');
  var point = Lib.byId('bess.utility.4h');
  var rows = [
    lineFrom(energy, { qty: kwh, qtyUnit: 'kWh' }),
    lineFrom(power, { qty: kw, qtyUnit: 'kW' })
  ];
  var check = lineFrom(point, { qty: kwh, qtyUnit: 'kWh' });
  check.inTotal = false;
  check.amount = null;
  check.note = point.note + (Math.abs(hours - 4) > 0.05
    ? ' Duration here is ' + (Math.round(hours * 100) / 100) + ' h, so the total is the energy plus power split, not 4 × $334.'
    : ' At 4 hours the split equals $334/kWh.');
  rows.push(check);
  if (kw > 0 && kw < 60000) rows.push(blankLine('bess.small.adder', 'Balance-of-plant adder below the 60 MW benchmark', kwh, 'kWh'));
  rows.push(blankLine('bess.utility.fom', 'Utility-scale battery fixed O&M', kw, 'kW-yr'));
  return rows;
}

function evLines(ev) {
  var items = (ev && ev.items) || [];
  var rows = [], i, it, qty, kw;
  if (!items.length && ev && ev.ports) {
    items = [{ kind: 'dcfc', kw: ev.kw || 150, qty: ev.ports }];
  }
  for (i = 0; i < items.length; i++) {
    it = items[i];
    qty = num(it.qty) || 1;
    kw = num(it.kw);
    var kind = String(it.kind || it.evId || '');
    var dc = /dc|fast/i.test(kind) || kw >= 50;
    if (dc) {
      rows.push(blankLine('ev.dcfc.150.point', (kw || 150) + ' kW DC fast charger, installed', qty, 'port'));
      var band = Lib.byId('ev.rmi.dcfc.150');
      var range = lineFrom(band, { qty: qty, qtyUnit: 'charger', label: band.label });
      range.inTotal = false;
      range.amount = null;
      rows.push(range);
      var inst = lineFrom(Lib.byId('ev.install.dcfc'), { qty: qty, qtyUnit: 'port' });
      inst.inTotal = false;
      inst.amount = null;
      rows.push(inst);
    } else {
      rows.push(blankLine('ev.l2.equipment', 'Level 2 charger equipment', qty, 'port'));
      var l2 = lineFrom(Lib.byId('ev.install.l2'), { qty: qty, qtyUnit: 'port' });
      l2.inTotal = false;
      l2.amount = null;
      rows.push(l2);
    }
  }
  return rows;
}

function electricalLines(spec, state) {
  var t = El.takeoff(spec || {});
  var rows = [];
  var ft = t.trenchFt || 0;
  var conduitRow = null;
  if (t.applies && t.sets > 0) {
    var conductorFt = ft > 0 ? ft * t.sets * 3 : null;
    rows.push(blankLine('el.conductor.ft', 'Feeder conductors, ' + t.sets + ' set' + (t.sets === 1 ? '' : 's') + ' of 3× ' + t.conductor + ' Cu, 75°C', conductorFt, 'conductor-ft',
      'Sized for ' + t.designA + ' A design (' + t.currentA + ' A × 1.25) on a ' + t.ocpdA + ' A overcurrent device. ' + t.notes.join(' ')));
    conduitRow = blankLine('el.conduit.ft', 'Conduit for the feeder', ft > 0 ? ft * t.sets : null, 'ft',
      'Trade size is not selected. NEC Chapter 9 fill areas were not loaded, so a conduit size would be a guess.');
    if (state !== 'TX') {
      conduitRow.price = null;
      conduitRow.status = 'partial';
      conduitRow.note = 'The cited unit is the Texas statewide Item 618 average and is not this state\'s price. ' + conduitRow.note;
    }
    rows.push(conduitRow);
    if (t.ground) {
      rows.push(blankLine('el.conductor.ft', 'Equipment grounding conductor, ' + t.ground + ' Cu', ft > 0 ? ft : null, 'ft',
        'NEC 250.122 for a ' + t.ocpdA + ' A device. Same missing $/ft as the phase conductors.', 'el.ground.ft'));
    }
  } else if (t.voltage > 600) {
    rows.push(blankLine('el.conductor.ft', 'Medium-voltage cable', ft || null, 'ft', t.notes.join(' ')));
  }
  rows.push(blankLine('el.trench.ft', 'Trench, duct bank, and restoration', ft || null, 'ft'));
  rows.push(blankLine('el.transformer.kva', 'Transformer', t.transformerKva, 'kVA',
    t.transformerKva ? ('Screening nameplate ' + t.transformerKva + ' kVA at ' + t.pf + ' pf. The book stores utility package prices and does not charge a bare $/kVA.') : 'No power to size a transformer.'));
  rows.push(blankLine('el.switchgear', 'Switchgear', t.kw > 0 ? 1 : null, 'lineup'));
  rows.push(blankLine('el.interconnection', 'Interconnection, ISO-queue study range, not added', t.kw > 0 ? t.kw : null, 'kW'));
  rows.push(blankLine('el.protection', 'Protective relaying and metering', t.kw > 0 ? 1 : null, 'project'));
  return { takeoff: t, lines: rows };
}

function sum(lines) {
  var t = 0, i;
  for (i = 0; i < lines.length; i++) if (lines[i].inTotal && lines[i].amount != null) t += lines[i].amount;
  return t;
}

function normalize(input) {
  input = input || {};
  var surface = input.surface || 'library';
  var bess = input.bess || null;
  var pv = input.pv || null;
  var ev = input.ev || null;
  if (!bess && (input.tech === 'bess' || (num(input.kwh) > 0 && !(num(input.kwDc) > 0) && !(num(input.solarKwDc) > 0)))) {
    bess = { kw: num(input.kw), kwh: num(input.kwh), hours: num(input.hours) || null };
  }
  if (!pv && (input.tech === 'pv' || num(input.kwDc) > 0 || num(input.solarKwDc) > 0)) {
    pv = { kwDc: num(input.kwDc) || num(input.solarKwDc), mount: input.mount || 'roof', sector: input.sector || null, byMount: input.byMount || null };
  }
  if (!ev && input.tech === 'ev') ev = { items: input.items || null, ports: input.ports, kw: input.kw };
  var elec = input.electrical || {};
  var kwElec = num(elec.kw);
  if (!(kwElec > 0) && bess) kwElec = num(bess.kw);
  if (!(kwElec > 0) && pv) {
    var sector = sectorOf(pv);
    var ilr = (Lib.PV[sector] && Lib.PV[sector].ilr) || 1.2;
    kwElec = num(pv.kwDc) / ilr;
  }
  if (!(kwElec > 0) && ev && ev.items && ev.items.length) {
    kwElec = ev.items.reduce(function (s, it) { return s + (num(it.kw) * (num(it.qty) || 1)); }, 0);
  }
  var voltage = elec.voltage || input.voltage;
  if (!voltage) voltage = kwElec >= 10000 ? 34500 : 480;
  return {
    surface: surface,
    state: input.state || null,
    zip: input.zip || null,
    bess: bess,
    pv: pv,
    ev: ev,
    electrical: {
      kw: kwElec,
      voltage: voltage,
      phases: elec.phases || 3,
      pf: elec.pf || input.pf || null,
      trenchFt: elec.trenchFt != null ? elec.trenchFt : input.trenchFt
    }
  };
}

function fromSiteMap(q) {
  q = q || {};
  var rating = q.fleetRating || {};
  var solarKw = num(q.solarKwDc);
  var ft = q.trenchFt;
  if (ft == null && q.conduitFt) ft = num(q.conduitFt['PVC-UG']) || num(q.conduitFt.trench) || 0;
  return {
    surface: 'site-map',
    state: q.state || null,
    zip: q.zip || null,
    voltage: q.voltage || null,
    trenchFt: ft,
    bess: (num(rating.kwh) > 0 || num(rating.kw) > 0) ? { kw: num(rating.kw), kwh: num(rating.kwh) } : null,
    pv: solarKw > 0 ? { kwDc: solarKw, byMount: (q.solar && q.solar.byMount) || null, mount: 'roof' } : null,
    ev: q.ev && q.ev.items && q.ev.items.length ? { items: q.ev.items } : null,
    compareLive: q.compareLive !== false
  };
}

function fromPrime(body) {
  body = body || {};
  return {
    surface: 'prime',
    state: body.state || null,
    zip: body.zip || null,
    voltage: body.voltage || body.volt || null,
    trenchFt: body.poiFt != null ? body.poiFt : body.trenchFt,
    bess: { kw: num(body.kw), kwh: num(body.kwh) || num(body.kw) * (num(body.hours) || 4), hours: num(body.hours) || 4 },
    compareLive: true
  };
}

function fromQuoteDesk(body) {
  body = body || {};
  var lines = body.lines || [];
  var bessKwh = 0, bessKw = 0, solar = 0, evItems = [], i, ln;
  for (i = 0; i < lines.length; i++) {
    ln = lines[i];
    var kind = String(ln.kind || ln.category || '');
    if (/bess|storage|battery/i.test(kind)) { bessKwh += num(ln.kwh) * (num(ln.qty) || 1); bessKw += num(ln.kw) * (num(ln.qty) || 1); }
    else if (/solar|pv/i.test(kind)) solar += num(ln.kwDc || ln.kw) * (num(ln.qty) || 1);
    else if (/ev|charg/i.test(kind)) evItems.push({ kind: kind, kw: num(ln.kw), qty: num(ln.qty) || 1 });
  }
  return {
    surface: 'quote-desk',
    state: body.state || null,
    zip: body.zip || null,
    trenchFt: body.trenchFt,
    bess: bessKwh > 0 || bessKw > 0 ? { kw: bessKw, kwh: bessKwh } : null,
    pv: solar > 0 ? { kwDc: solar, mount: body.mount || 'roof' } : null,
    ev: evItems.length ? { items: evItems } : null
  };
}

/* editor-v2 (PR #339, branch cursor/editor-v2-cad-c186) does not price a
   drawing yet. It posts the same quantities Site Map posts. */
function fromEditorV2(q) {
  var spec = fromSiteMap(q || {});
  spec.surface = 'editor-v2';
  return spec;
}

function liveSiteMap(spec) {
  var EC = require('./editor-cost');
  var q = { sheet: {} };
  if (spec.bess && (spec.bess.kwh > 0 || spec.bess.kw > 0)) {
    q.fleetRating = { kwh: spec.bess.kwh, kw: spec.bess.kw };
    q.configuredKw = spec.bess.kw;
  }
  if (spec.pv && spec.pv.kwDc > 0) {
    q.solarKwDc = spec.pv.kwDc;
    q.solar = { byMount: spec.pv.byMount || {} };
    if (!spec.pv.byMount) {
      var mount = spec.pv.mount || 'roof';
      q.solar.byMount[mount] = spec.pv.kwDc;
    }
  }
  if (spec.ev && spec.ev.items) q.ev = { items: spec.ev.items };
  var rolled = EC.rollup(q);
  return { engine: 'editor-cost', version: 'live', usd: rolled.totals.total, totals: rolled.totals };
}

function livePrime(spec) {
  if (!spec.bess || !(spec.bess.kw > 0)) return null;
  var CM = require('./cost-model');
  var priced = CM.price({
    kw: spec.bess.kw,
    hours: spec.bess.hours || (spec.bess.kw > 0 ? spec.bess.kwh / spec.bess.kw : 4),
    poiFt: spec.electrical.trenchFt != null ? spec.electrical.trenchFt : undefined
  });
  if (!priced || !priced.total) return null;
  return { engine: 'cost-model', version: 'live', usd: priced.total.base, low: priced.total.lo, high: priced.total.hi };
}

function quote(input) {
  input = input || {};
  var shaped = input;
  var siteQty = input.fleetRating || input.solarKwDc || (input.ev && input.ev.items);
  if (input.surface === 'site-map' && siteQty) shaped = fromSiteMap(input);
  else if (input.surface === 'editor-v2' && siteQty) shaped = fromEditorV2(input);
  else if (input.surface === 'prime' && input.kw && !input.bess) shaped = fromPrime(input);
  else if (input.surface === 'quote-desk' && input.lines) shaped = fromQuoteDesk(input);
  var spec = normalize(shaped);

  var lines = [];
  if (spec.bess) lines = lines.concat(bessLines(spec.bess));
  if (spec.pv) lines = lines.concat(pvLines(spec.pv));
  if (spec.ev) lines = lines.concat(evLines(spec.ev));
  var elec = electricalLines(spec.electrical, spec.state);
  lines = lines.concat(elec.lines);

  var region = Lib.laborFactor(spec.state, spec.zip);
  var i;
  for (i = 0; i < lines.length; i++) {
    if (lines[i].region === 'labor') lines[i].regionFactor = region.factor;
  }

  var wantLive = !!(input.compareLive || shaped.compareLive);
  var total = sum(lines);
  var needs = [];
  for (i = 0; i < lines.length; i++) if (lines[i].status === 'needs source') needs.push({ id: lines[i].id, label: lines[i].label, unit: lines[i].unit, note: lines[i].note });

  var perKwh = spec.bess && spec.bess.kwh > 0 && total > 0 ? Math.round((total / spec.bess.kwh) * 100) / 100 : null;
  var perW = spec.pv && spec.pv.kwDc > 0 && total > 0 ? Math.round((total / (spec.pv.kwDc * 1000)) * 1000) / 1000 : null;

  return {
    ok: true,
    version: VERSION,
    preview: true,
    replacesLive: replacesLive(),
    surface: spec.surface,
    read: Lib.READ,
    region: region,
    lines: lines,
    electrical: elec.takeoff,
    totals: { usd: total > 0 ? total : null, perKwh: perKwh, perWdc: perW },
    needsSource: needs,
    live: wantLive ? { siteMap: liveSiteMap(spec), prime: spec.surface === 'prime' || spec.bess ? livePrime(spec) : null } : null
  };
}

module.exports = {
  VERSION: VERSION,
  READ: Lib.READ,
  quote: quote,
  previewRequested: previewRequested,
  replacesLive: replacesLive,
  answer: answer,
  fromSiteMap: fromSiteMap,
  fromPrime: fromPrime,
  fromQuoteDesk: fromQuoteDesk,
  fromEditorV2: fromEditorV2,
  normalize: normalize,
  library: Lib
};
