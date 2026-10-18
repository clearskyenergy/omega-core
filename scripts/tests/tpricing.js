#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   The preview price book against the cited bands, and the live engines
   left where they were. */
'use strict';
var assert = require('node:assert/strict');
var path = require('path');
var ROOT = path.join(__dirname, '../..');
var P = require(path.join(ROOT, 'api/_lib/pricing'));
var Lib = require(path.join(ROOT, 'api/_lib/pricing-library'));
var B = require(path.join(ROOT, 'api/_lib/pricing-benchmarks'));
var El = require(path.join(ROOT, 'api/_lib/pricing-electrical'));
var EC = require(path.join(ROOT, 'api/_lib/editor-cost'));
var C = require(path.join(ROOT, 'api/_lib/analysis-checks'));
var count = 0;

function line(q, id) {
  var i;
  for (i = 0; i < q.lines.length; i++) if (q.lines[i].id === id) return q.lines[i];
  return null;
}

var saved = process.env.PRICING_LIBRARY;
delete process.env.PRICING_LIBRARY;
assert.equal(P.replacesLive(), false);
assert.equal(P.previewRequested({}), false);
assert.equal(P.previewRequested({ preview: true }), true);
assert.equal(P.previewRequested({ version: '2026.10' }), true);
assert.equal(P.previewRequested({ pricingVersion: '2026.10' }), true);
assert.equal(P.VERSION, '2026.10');
count += 6;

var quiet = P.answer({});
assert.equal(quiet.preview, false);
assert.equal(quiet.version, 'live');
assert.equal(quiet.libraryVersion, '2026.10');
assert.equal(quiet.lines, undefined);
assert.equal(quiet.totals, undefined);
var shown = P.answer({ preview: true, tech: 'bess', kw: 1000, kwh: 4000, state: 'IL', zip: '60601', trenchFt: 250 });
assert.equal(shown.preview, true);
assert.equal(shown.replacesLive, false);
assert.equal(shown.totals.usd, 1336000);
count += 7;

process.env.PRICING_LIBRARY = '2026.10';
assert.equal(P.replacesLive(), true);
assert.equal(P.previewRequested({}), true);
if (saved == null) delete process.env.PRICING_LIBRARY; else process.env.PRICING_LIBRARY = saved;
assert.equal(P.replacesLive(), false);
count += 3;

var tables = EC._tables;
assert.equal(tables.BENCH.bessKwh, 241);
assert.equal(tables.BENCH.bessKw, 379);
assert.equal(tables.BENCH.pvCommercial, 1.98);
assert.equal(tables.BENCH.pvUtility, 1.12);
assert.equal(tables.BENCH.pvResidential, 2.95);
assert.equal(tables.BENCH.pvCanopy, 2.75);
assert.equal(tables.SHEET.contPct, 10);
assert.equal(tables.BESS_EQ_PER_KWH, 85);
assert.equal(tables.BESS_INSTALL_RATIO, 0.55);
count += 9;

var held = B.bookHoldsCited();
assert.deepEqual(held, []);
count++;

var list = B.rows();
var byId = {};
list.forEach(function (r) { byId[r.id] = r; assert.equal(r.drift, false, r.id + ' ' + r.why.join('; ')); });
count += list.length;

var mw = byId['bess-1mw-4h'];
assert.equal(mw.usd, 1336000);
assert.equal(mw.perKwh, 334);
assert.ok(mw.usd >= 1180000 && mw.usd <= 1400000);
assert.equal(mw.liveSiteMap, 1477300);
assert.ok(mw.liveSiteMap > 1400000, 'the live Site Map total sits outside the 2025 band');
assert.equal(mw.quote.electrical.sets, 4);
assert.equal(mw.quote.electrical.designA, 1504);
assert.equal(mw.quote.electrical.currentA, 1203);
assert.equal(mw.quote.electrical.ocpdA, 1600);
assert.equal(mw.quote.electrical.conductor, '500 kcmil');
assert.equal(mw.quote.electrical.ground, '4/0 AWG');
assert.equal(mw.quote.electrical.transformerKva, 1250);
assert.equal(mw.quote.region.factor, 1.3358);
assert.equal(mw.quote.region.geography, 'metro');
assert.equal(mw.quote.region.state, 'IL');
assert.equal(mw.quote.region.equipmentFactor, 1);
assert.equal(mw.quote.region.electricianHourly, 45.41);
assert.notEqual(mw.quote.region.electricianFactor, mw.quote.region.factor);
assert.equal(Lib.laborFactor('IL', null).factor, 1.298);
assert.equal(Lib.laborFactor('CA', null).factor, 1.2724);
assert.equal(Lib.laborFactor('TX', null).factor, 0.8189);
assert.equal(Lib.laborFactor('ZZ', '99999').factor, null);
var energy = line(mw.quote, 'bess.utility.energy');
var power = line(mw.quote, 'bess.utility.power');
assert.equal(energy.price, 241);
assert.equal(energy.amount, 964000);
assert.equal(energy.source.length > 0, true);
assert.equal(energy.read, '2026-10-18');
assert.equal(power.price, 372);
assert.equal(power.amount, 372000);
var check = line(mw.quote, 'bess.utility.4h');
assert.equal(check.inTotal, false);
assert.equal(check.amount, null);
assert.equal(check.low, 295);
assert.equal(check.high, 350);
var adder = line(mw.quote, 'bess.small.adder');
assert.equal(adder.status, 'partial');
assert.equal(adder.price, null);
assert.equal(adder.amount, null);
assert.equal(adder.inTotal, false);
var fom = line(mw.quote, 'bess.utility.fom');
assert.equal(fom.price, 53.44);
assert.equal(fom.inTotal, false);
assert.equal(fom.amount, null);
assert.equal(fom.method, 'derived');
var ix = line(mw.quote, 'el.interconnection');
assert.equal(ix.price, null);
assert.equal(ix.low, 57);
assert.equal(ix.high, 102);
assert.equal(ix.inTotal, false);
assert.equal(ix.qty, 1000);
var feeder = line(mw.quote, 'el.conductor.ft');
assert.equal(feeder.amount, null);
assert.equal(feeder.price, null);
assert.equal(feeder.status, 'partial');
assert.equal(feeder.index.series, 'WPU10260314');
assert.equal(feeder.index.value, 607.705);
assert.equal(feeder.qty, 3000);
var trench = line(mw.quote, 'el.trench.ft');
assert.equal(trench.price, null);
assert.equal(trench.regionFactor, 1.3358);
assert.equal(line(mw.quote, 'bess.utility.energy').regionFactor, 1);
count += 44;

var pv = byId['pv-commercial-500'];
assert.equal(pv.usd, 990000);
assert.equal(pv.perWdc, 1.98);
assert.ok(pv.usd >= 717500 && pv.usd <= 1046500);
assert.equal(pv.liveSiteMap, 1089000);
assert.ok(pv.liveSiteMap > 1046500, 'live contingency pushes the rooftop outside the PVSCM band');
assert.equal(pv.quote.electrical.sets, 2);
assert.equal(pv.quote.electrical.designA, 626);
assert.equal(pv.quote.electrical.kw, 500 / 1.2);
var pvLine = line(pv.quote, 'pv.commercial.mmp');
assert.equal(pvLine.price, 1.98);
assert.equal(pvLine.qty, 500000);
assert.equal(pvLine.regionFactor, 1);
assert.equal(pvLine.dollarYear, 2024);
var om = line(pv.quote, 'pv.commercial.om');
assert.equal(om.inTotal, false);
assert.equal(om.price, 40);
count += 13;

var big = byId['bess-10mw-4h'];
assert.equal(big.usd, 13360000);
assert.equal(big.perKwh, 334);
assert.ok(big.usd >= 11800000 && big.usd <= 14000000);
assert.equal(big.liveSiteMap, 14773000);
assert.equal(big.quote.electrical.applies, false);
assert.equal(big.quote.electrical.voltage, 34500);
assert.equal(big.quote.electrical.sets, 0);
assert.ok(big.quote.electrical.notes.join(' ').indexOf('600 V') >= 0);
count += 8;

var dc = byId['dcfc-150'];
assert.equal(dc.usd, null);
assert.equal(dc.quote.totals.usd, null);
assert.equal(line(dc.quote, 'ev.dcfc.150.point').status, 'partial');
assert.equal(line(dc.quote, 'ev.dcfc.150.point').price, null);
var rmi = line(dc.quote, 'ev.rmi.dcfc.150');
assert.equal(rmi.low, 75600);
assert.equal(rmi.high, 100000);
assert.equal(rmi.inTotal, false);
assert.equal(rmi.amount, null);
assert.equal(dc.quote.electrical.sets, 3);
assert.equal(dc.quote.electrical.designA, 902);
assert.equal(dc.quote.electrical.ocpdA, 1000);
assert.equal(dc.quote.electrical.ground, '2/0 AWG');
assert.equal(dc.liveSiteMap, 306900);
count += 12;

assert.equal(Lib.byId('pv.canopy').status, 'needs source');
assert.equal(Lib.byId('pv.canopy').fill, 'paid');
assert.equal(Lib.byId('el.trench.ft').price, null);
assert.equal(Lib.byId('el.trench.ft').fill, 'partial');
assert.equal(Lib.byId('el.transformer.kva').price, null);
assert.equal(Lib.byId('el.transformer.kva').index.value, 434.493);
assert.equal(Lib.byId('el.transformer.kva').table.filter(function (r) { return r.id === 'pge.xfmr.150'; })[0].usd, 53985);
assert.equal(Lib.byId('el.protection').fill, 'partial');
assert.equal(Lib.byId('el.protection').price, null);
assert.equal(Lib.byId('labor.index').status, 'sourced');
assert.equal(Lib.byId('labor.index').fill, 'free');
assert.equal(Lib.byId('lazard.capex').status, 'sourced');
assert.equal(Lib.byId('lazard.capex').fill, 'free');
assert.equal(Lib.byId('lazard.capex').price, null);
assert.equal(Lib.byId('lazard.capex').table.filter(function (r) { return r.edition === '18.0' && r.technology === 'pv.utility'; })[0].low, 1150);
assert.equal(Lib.byId('gen.eia').price, null);
assert.equal(Lib.byId('gen.eia').fill, 'free');
assert.equal(Lib.byId('gen.eia').table.filter(function (r) { return r.id === 'ct.frame'; })[0].basePerKw, 791);
assert.equal(Lib.byId('ev.l2.equipment').fill, 'partial');
assert.equal(Lib.byId('ev.l2.equipment').low, 2200);
assert.equal(Lib.byId('ev.l2.equipment').high, 4600);
assert.equal(Lib.byId('ev.l2.equipment').price, null);
assert.equal(Lib.byId('ev.dcfc.150.point').table.hardwareLow, 66400);
assert.equal(Lib.byId('ev.dcfc.150.point').table.installHigh, 94000);
assert.equal(Lib.byId('el.conduit.ft').price, 13.3);
assert.equal(Lib.byId('el.conduit.ft').inTotal, false);
assert.equal(line(mw.quote, 'el.conduit.ft').price, null);
assert.equal(line(mw.quote, 'el.conduit.ft').amount, null);
var txConduit = P.quote({ tech: 'bess', kw: 500, kwh: 2000, state: 'TX', voltage: 480, trenchFt: 100 });
assert.equal(txConduit.totals.usd, 668000);
assert.equal(line(txConduit, 'el.conduit.ft').price, 13.3);
assert.equal(line(txConduit, 'el.conduit.ft').amount, null);
assert.equal(line(txConduit, 'el.conduit.ft').inTotal, false);
var canopy = P.quote({ tech: 'pv', kwDc: 100, mount: 'canopy', state: 'CA' });
assert.equal(canopy.totals.usd, null);
assert.equal(line(canopy, 'pv.canopy').status, 'needs source');
count += 30;

var desk = P.quote({
  surface: 'quote-desk', state: 'IL',
  lines: [{ kind: 'battery', kw: 1000, kwh: 4000, qty: 1 }]
});
assert.equal(desk.surface, 'quote-desk');
assert.equal(desk.totals.usd, 1336000);
var v2 = P.quote({ surface: 'editor-v2', fleetRating: { kw: 1000, kwh: 4000 }, state: 'TX' });
assert.equal(v2.surface, 'editor-v2');
assert.equal(v2.totals.usd, 1336000);
var prime = P.quote({ surface: 'prime', kw: 1000, hours: 4, state: 'IL', zip: '60601', poiFt: 250 });
assert.equal(prime.surface, 'prime');
assert.equal(prime.totals.usd, 1336000);
assert.equal(prime.electrical.voltage, 480);
assert.ok(prime.live && prime.live.prime && prime.live.prime.usd > 0);
count += 8;

var one = El.takeoff({ kw: 1000, voltage: 480, trenchFt: 250 });
assert.equal(one.sets, 4);
assert.equal(one.pfAssumed, true);
assert.equal(one.pf, 0.8);
var mv = El.takeoff({ kw: 10000, voltage: 34500 });
assert.equal(mv.applies, false);
assert.equal(mv.transformerKva, 12500);
count += 5;

var report = C.run({ now: new Date('2026-10-17T15:00:00Z') });
assert.equal(report.ok, true, JSON.stringify(report.checks.filter(function (c) { return !c.ok && c.severity === 'error'; }), null, 2));
['pricing.cited', 'pricing.ref.bess-1mw-4h', 'pricing.ref.pv-commercial-500', 'pricing.ref.bess-10mw-4h', 'pricing.ref.dcfc-150', 'pricing.freshness', 'pricing.needs-source', 'pricing.citations', 'pricing.public-fill'].forEach(function (id) {
  assert.ok(report.checks.some(function (c) { return c.id === id && c.ok; }), id);
  count++;
});
count++;
var later = C.run({ now: new Date('2027-06-01T00:00:00Z'), staleDays: 45, errorDays: 400 });
var fresh = later.checks.filter(function (c) { return c.id === 'pricing.freshness'; })[0];
assert.equal(fresh.ok, false);
assert.equal(fresh.severity, 'warn');
assert.equal(later.checks.filter(function (c) { return !c.ok && c.severity === 'error' && c.id.indexOf('pricing.') === 0; }).length, 0);
var dead = C.run({ now: new Date('2027-06-01T00:00:00Z'), staleDays: 45, errorDays: 180 });
var expired = dead.checks.filter(function (c) { return c.id === 'pricing.freshness'; })[0];
assert.equal(expired.severity, 'error');
assert.equal(dead.ok, false);
count += 5;

Lib.needsSource().forEach(function (it) {
  assert.equal(it.price, null, it.id);
  assert.equal(it.inTotal, false, it.id);
  count++;
});

console.log('tpricing: ' + count + ' assertions passed');
console.log(JSON.stringify(list.map(function (r) {
  return { id: r.id, newUsd: r.usd, low: r.lowUsd, high: r.highUsd, liveSiteMap: r.liveSiteMap, livePrime: r.livePrime, perKwh: r.perKwh, perWdc: r.perWdc };
}), null, 2));
