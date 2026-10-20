/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   Reference projects for the preview price book. The acceptance bands are
   the published figures, written here as literals. A library edit that
   moves a total outside the band fails this check. The live engines are
   read for the before column and are not modified. */
'use strict';

var P = require('./pricing');
var Lib = require('./pricing-library');

/* Cited figures. These are the contract, not a copy of whatever the book
   currently charges. */
var CITED = {
  bessEnergy: 241,
  bessPower: 372,
  bessPoint: 334,
  bessLow: 295,
  bessHigh: 350,
  pvCommercial: 1.98,
  pvCommercialLow: 1.435,
  pvCommercialHigh: 2.093,
  rmi150Low: 75600,
  rmi150High: 100000,
  read: '2026-10-18'
};

function bessUsd(kw, kwh) { return kwh * CITED.bessEnergy + kw * CITED.bessPower; }

function projects() {
  return [
    {
      id: 'bess-1mw-4h',
      label: '1 MW / 4 h battery, ComEd territory, Illinois',
      state: 'IL',
      input: {
        surface: 'site-map', state: 'IL', zip: '60601', trenchFt: 250,
        fleetRating: { kw: 1000, kwh: 4000 }, compareLive: true
      },
      kwh: 4000, kw: 1000,
      pointUsd: bessUsd(1000, 4000),
      lowUsd: 4000 * CITED.bessLow,
      highUsd: 4000 * CITED.bessHigh,
      expect: { applies: true, voltage: 480, sets: 4, conductor: '500 kcmil', ocpdA: 1600, ground: '4/0 AWG', designA: 1504 }
    },
    {
      id: 'pv-commercial-500',
      label: '500 kW-DC commercial rooftop, California',
      state: 'CA',
      input: {
        surface: 'site-map', state: 'CA', zip: '94107', trenchFt: 120, mount: 'roof',
        solarKwDc: 500, solar: { byMount: { roof: 500 } }, compareLive: true
      },
      kwDc: 500,
      pointUsd: Math.round(500 * 1000 * CITED.pvCommercial),
      lowUsd: Math.round(500 * 1000 * CITED.pvCommercialLow),
      highUsd: Math.round(500 * 1000 * CITED.pvCommercialHigh),
      expect: { applies: true, voltage: 480, sets: 2, conductor: '500 kcmil', ocpdA: 700, ground: '1/0 AWG', designA: 626 }
    },
    {
      id: 'bess-10mw-4h',
      label: '10 MW / 4 h front-of-meter battery, Texas',
      state: 'TX',
      input: {
        surface: 'site-map', state: 'TX', zip: '77002', trenchFt: 800,
        fleetRating: { kw: 10000, kwh: 40000 }, compareLive: true
      },
      kwh: 40000, kw: 10000,
      pointUsd: bessUsd(10000, 40000),
      lowUsd: 40000 * CITED.bessLow,
      highUsd: 40000 * CITED.bessHigh,
      expect: { applies: false, voltage: 34500, sets: 0 }
    },
    {
      id: 'dcfc-150',
      label: 'Four 150 kW DC fast chargers',
      state: 'IL',
      input: {
        surface: 'site-map', state: 'IL', zip: '60601', trenchFt: 80, voltage: 480,
        ev: { items: [{ kind: 'dcfc', kw: 150, qty: 4 }] }, compareLive: true
      },
      unpriced: true,
      expect: { applies: true, voltage: 480, sets: 3, conductor: '500 kcmil', ocpdA: 1000, ground: '2/0 AWG', designA: 902 }
    }
  ];
}

function inside(usd, low, high) { return usd != null && usd >= low && usd <= high; }

function takeoffOk(got, exp) {
  if (!exp) return true;
  var k;
  for (k in exp) if (Object.prototype.hasOwnProperty.call(exp, k) && got[k] !== exp[k]) return false;
  return true;
}

function evaluate(p) {
  var q = P.quote(p.input);
  var usd = q.totals.usd;
  var drift = false;
  var why = [];
  if (p.unpriced) {
    if (usd != null) { drift = true; why.push('a point price was charged and none was cited'); }
    var point = null, i;
    for (i = 0; i < q.lines.length; i++) if (q.lines[i].id === 'ev.dcfc.150.point') point = q.lines[i];
    if (!point || (point.status !== 'partial' && point.status !== 'needs source') || point.price != null || point.amount != null) {
      drift = true; why.push('the 150 kW charger point is charged or unmarked');
    }
  } else {
    if (usd !== p.pointUsd) { drift = true; why.push('total ' + usd + ' is not the cited point ' + p.pointUsd); }
    if (!inside(usd, p.lowUsd, p.highUsd)) { drift = true; why.push('total is outside ' + p.lowUsd + '–' + p.highUsd); }
  }
  if (!takeoffOk(q.electrical, p.expect)) { drift = true; why.push('electrical takeoff does not match the screening expectation'); }
  var expectFactor = { 'bess-1mw-4h': 1.3358, 'pv-commercial-500': 1.4797, 'bess-10mw-4h': 0.8382, 'dcfc-150': 1.3358 };
  if (q.region.factor !== expectFactor[p.id]) { drift = true; why.push('labor factor ' + q.region.factor + ' is not the May 2025 OEWS factor ' + expectFactor[p.id]); }
  if (q.region.equipmentFactor !== 1) { drift = true; why.push('equipment was regionalized'); }
  if (q.region.geography !== 'metro') { drift = true; why.push('ZIP3 did not select the metro wage'); }
  var fom = null, adder = null, ix = null, trench = null, capital = null, i2;
  for (i2 = 0; i2 < q.lines.length; i2++) {
    if (q.lines[i2].id === 'bess.utility.fom') fom = q.lines[i2];
    if (q.lines[i2].id === 'bess.small.adder') adder = q.lines[i2];
    if (q.lines[i2].id === 'el.interconnection') ix = q.lines[i2];
    if (q.lines[i2].id === 'el.trench.ft') trench = q.lines[i2];
    if (q.lines[i2].inTotal && q.lines[i2].regionFactor !== 1) capital = q.lines[i2];
  }
  if (p.kwh && (!fom || fom.price !== 53.44 || fom.inTotal || fom.amount != null)) { drift = true; why.push('fixed O&M is not the uncharged $53.44/kW-yr'); }
  if (p.kwh && p.kw < 60000 && (!adder || adder.price != null || adder.status !== 'partial' || adder.inTotal)) { drift = true; why.push('the small-project adder was charged'); }
  if (!ix || ix.price != null || ix.inTotal || ix.low !== 57 || ix.high !== 102) { drift = true; why.push('interconnection range was charged or dropped'); }
  if (!trench || trench.price != null || trench.regionFactor !== q.region.factor) { drift = true; why.push('trench labor factor does not match the wage index'); }
  if (capital) { drift = true; why.push('a capital line was scaled by the labor factor'); }
  return {
    id: p.id,
    label: p.label,
    state: p.state,
    quote: q,
    usd: usd,
    lowUsd: p.lowUsd == null ? null : p.lowUsd,
    highUsd: p.highUsd == null ? null : p.highUsd,
    pointUsd: p.pointUsd == null ? null : p.pointUsd,
    liveSiteMap: q.live && q.live.siteMap ? q.live.siteMap.usd : null,
    livePrime: q.live && q.live.prime ? q.live.prime.usd : null,
    perKwh: q.totals.perKwh,
    perWdc: q.totals.perWdc,
    drift: drift,
    why: why
  };
}

function rows() {
  return projects().map(evaluate);
}

function bookHoldsCited() {
  var b = Lib.BESS, pv = Lib.PV.commercial, rmi = Lib.byId('ev.rmi.dcfc.150');
  var bad = [];
  if (b.energyPerKwh !== CITED.bessEnergy) bad.push('energy');
  if (b.powerPerKw !== CITED.bessPower) bad.push('power');
  if (b.pointPerKwh !== CITED.bessPoint) bad.push('point');
  if (b.lowPerKwh !== CITED.bessLow || b.highPerKwh !== CITED.bessHigh) bad.push('band');
  if (pv.usdPerWdc !== CITED.pvCommercial) bad.push('commercial pv');
  if (pv.low !== CITED.pvCommercialLow || pv.high !== CITED.pvCommercialHigh) bad.push('commercial band');
  if (!rmi || rmi.low !== CITED.rmi150Low || rmi.high !== CITED.rmi150High || rmi.price != null) bad.push('rmi');
  if (Lib.READ !== CITED.read) bad.push('read date');
  return bad;
}

function checks(opts) {
  opts = opts || {};
  var now = opts.now instanceof Date ? opts.now : new Date();
  var staleDays = opts.staleDays != null ? opts.staleDays : 45;
  var errorDays = opts.errorDays != null ? opts.errorDays : 180;
  var out = [];
  var held = bookHoldsCited();
  out.push({
    id: 'pricing.cited',
    severity: 'error',
    ok: held.length === 0,
    message: held.length ? 'The preview book no longer matches the cited figures: ' + held.join(', ') : 'Preview book matches the cited NREL and RMI figures',
    detail: CITED
  });
  rows().forEach(function (r) {
    out.push({
      id: 'pricing.ref.' + r.id,
      severity: 'error',
      ok: !r.drift,
      message: r.drift
        ? r.label + ': ' + r.why.join('; ')
        : r.label + (r.usd == null ? ' has no point price (needs source)' : ' is $' + r.usd + ' inside $' + r.lowUsd + '–$' + r.highUsd),
      detail: {
        usd: r.usd, lowUsd: r.lowUsd, highUsd: r.highUsd,
        liveSiteMap: r.liveSiteMap, livePrime: r.livePrime,
        perKwh: r.perKwh, perWdc: r.perWdc,
        electrical: { voltage: r.quote.electrical.voltage, sets: r.quote.electrical.sets, designA: r.quote.electrical.designA, ocpdA: r.quote.electrical.ocpdA, applies: r.quote.electrical.applies }
      }
    });
  });
  var fresh = Lib.freshness(now, staleDays, errorDays);
  out.push({
    id: 'pricing.freshness',
    severity: fresh.expired.length ? 'error' : (fresh.stale.length ? 'warn' : 'info'),
    ok: fresh.stale.length === 0,
    message: fresh.stale.length
      ? fresh.stale.map(function (d) { return d.id + ' last read ' + d.read + ' (' + d.age + ' days)'; }).join('; ')
      : 'Every preview price was read within ' + staleDays + ' days (' + Lib.READ + ')',
    detail: { staleDays: staleDays, errorDays: errorDays, read: Lib.READ, stale: fresh.stale.length, expired: fresh.expired.length }
  });
  var needs = Lib.needsSource();
  var pricedAnyway = needs.filter(function (it) { return it.price != null; });
  out.push({
    id: 'pricing.needs-source',
    severity: 'info',
    ok: pricedAnyway.length === 0,
    message: needs.length + ' preview lines have no public unit price and are not charged'
      + (pricedAnyway.length ? '. These still carry a price: ' + pricedAnyway.map(function (it) { return it.id; }).join(', ') : ''),
    detail: { ids: needs.map(function (it) { return it.id; }) }
  });
  var bare = Lib.items().filter(function (it) {
    if (it.status === 'needs source') return it.price != null;
    if (it.status === 'partial') return it.price != null || !(it.source && it.url && it.published && it.read);
    if (it.status === 'range') return it.price != null || it.low == null || it.high == null;
    return it.status === 'sourced' && !(it.source && it.url && it.published && it.read && (it.price != null || it.inTotal === false));
  });
  out.push({
    id: 'pricing.citations',
    severity: 'error',
    ok: bare.length === 0,
    message: bare.length ? 'A preview line is missing its citation or is charging an unsourced price: ' + bare.map(function (it) { return it.id; }).join(', ') : 'Every sourced line names its source, URL, publication, and read date',
    detail: { ids: bare.map(function (it) { return it.id; }) }
  });
  var fillExpect = {
    'labor.index': 'free',
    'bess.utility.fom': 'free',
    'gen.eia': 'free',
    'bess.small.adder': 'partial',
    'el.interconnection': 'partial',
    'el.conductor.ft': 'partial',
    'el.conduit.ft': 'free',
    'el.transformer.kva': 'partial',
    'el.switchgear': 'partial',
    'ev.dcfc.150.point': 'partial',
    'pv.canopy': 'paid',
    'ev.l2.equipment': 'partial',
    'el.trench.ft': 'partial',
    'el.protection': 'partial',
    'lazard.capex': 'free'
  };
  var fillBad = [];
  Object.keys(fillExpect).forEach(function (id) {
    var it = Lib.byId(id);
    if (!it || it.fill !== fillExpect[id]) fillBad.push(id);
    if (it && it.fill !== 'free' && it.price != null && it.inTotal) fillBad.push(id + ' charged');
  });
  var gen = Lib.byId('gen.eia');
  var frame = null, gi;
  if (gen && gen.table) {
    for (gi = 0; gi < gen.table.length; gi++) if (gen.table[gi].id === 'ct.frame') frame = gen.table[gi];
  }
  if (!frame || frame.basePerKw !== 791) fillBad.push('gen.eia ct.frame');
  var batt = null;
  if (gen && gen.table) {
    for (gi = 0; gi < gen.table.length; gi++) if (gen.table[gi].id === 'battery.4h') batt = gen.table[gi];
  }
  if (!batt || batt.fomPerKwYr !== 40.62 || batt.basePerKw !== 1580) fillBad.push('gen.eia battery');
  out.push({
    id: 'pricing.public-fill',
    severity: 'error',
    ok: fillBad.length === 0,
    message: fillBad.length
      ? 'A needs-source line changed fill without a cited figure: ' + fillBad.join(', ')
      : 'The fifteen open lines are classified free, partial, or still unpaid',
    detail: fillExpect
  });
  return out;
}

module.exports = { CITED: CITED, projects: projects, rows: rows, checks: checks, bookHoldsCited: bookHoldsCited };
