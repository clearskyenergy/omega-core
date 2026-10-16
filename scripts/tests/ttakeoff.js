#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   The Cost tab's takeoff by trade, held without a browser.

   The library (api/_lib/takeoff.js) on the REAL roll-up
   (api/_lib/editor-cost.js): every line the Run can put in its total has a
   trade; the trades, their lines and each line's rows add up to the Run
   total to the cent on a sample site and on 400 random drawings; a line's
   rows split it by the roll-up's own figures; the Run's contingency rides
   on exactly the lines it applies to; a contracted total is spread by the
   estimate's shares, or carried whole; a line with no trade throws instead
   of leaving money out; the quantities are what the drawing and the roll-up
   counted (never cubic yards or tons worked up from nothing); what the Run
   keeps out of its total (the conduit on the BOM, a trench, a fence, the
   utility's charges) is shown and never added; a charger or a generator
   row points at exactly the items the roll-up grouped into it; what the
   page sends is cleaned and never priced; every line and row says where
   its price comes from (a quote for this job, a book on file, a
   benchmark), read off the roll-up's own flags, naming a kind of source
   and never a rate, and the money by kind adds up to the Run total.

   The door (api/takeoff.js) on the Firestore double: the money is the
   roll-up's on the body's quantities with the CALLER's workspace (a body
   naming a vendor changes nothing); Omega Estimate in a package, Site Map
   on a legacy plan, an active workspace and an active member each refuse
   on their own; staff pass; a body past the cap and a read that fails
   refuse.
   node scripts/tests/ttakeoff.js */
'use strict';
var assert = require('node:assert/strict'), path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var EC = require(path.join(ROOT, 'api', '_lib', 'editor-cost.js'));
var BS = require(path.join(ROOT, 'api', '_lib', 'build-sequence.js'));
var TK = require(path.join(ROOT, 'api', '_lib', 'takeoff.js'));
var FD = require(path.join(ROOT, 'scripts', '_lib', 'firestore-double.js'));
var pass = 0;
function ok(v, label) { assert.ok(v, label); pass++; }
function eq(a, b, label) { assert.deepEqual(a, b, label); pass++; }
function sum(list, k) { return list.reduce(function (s, x) { return s + x[k]; }, 0); }
function trade(t, k) { return t.trades.filter(function (x) { return x.key === k; })[0]; }
function line(t, k) { var out = null; t.trades.forEach(function (x) { x.lines.forEach(function (l) { if (l.key === k) out = l; }); }); return out; }
function info(t, k) { var out = null; t.trades.forEach(function (x) { (x.info || []).forEach(function (l) { if (l.key === k) out = l; }); }); return out; }
function exact(t, out, label) {
  var cents = Math.round(out.totals.total * 100);
  ok(t.cents === cents && sum(t.trades, 'cents') === cents, label + ': the trades add up to the Run total to the cent');
  ok(t.trades.every(function (x) { return sum(x.lines, 'cents') === x.cents; }), label + ': each trade is the sum of its lines');
  ok(t.trades.every(function (x) { return x.lines.every(function (l) { return !l.rows.length || sum(l.rows, 'cents') === l.cents; }); }), label + ': each line is the sum of its rows');
}

/* ── 1. every line the Run can carry has a trade ── */
var every = { fleet: { units: 3, byModel: { 'GOTION-EDGE-760': { qty: 2, kwh: 261, kw: 125, catalogKey: 'GOTION-EDGE-760' }, 'NextNRG Saft': { qty: 1, kwh: 1000, kw: 500, nextnrg: true } } },
  counts: { pad: 1, disco: 1, meter: 1, bollard: 1, jbox: 1, panel: 1, hasXfmr: true, mgc: 1 }, sheet: { eng: 1, perm: 1, comm: 1, xfmr: 1, misc: 1 }, emsOn: true, configuredKwh: 100,
  ev: { items: [{ kind: 'evl2', kw: 11.5, qty: 1 }] }, solarKwDc: 200, solar: { byMount: { ground: 100, roof: 0, canopy: 0 }, nextnrgKwDc: 100 },
  compute: { podsN: 1, podKw: 1000 }, omegaCore: { skids: 1 }, gen: [{ kind: 'deralt', altId: 'gen_ng', kw: 100 }], dc: { element: { itKw: 1000, pue: 1.3 } }, bnzCapex: 1000 };
var lineKeys = BS.lines(EC.rollup(every)).map(function (l) { return l.key; });
ok(lineKeys.length === 23, 'a drawing with everything priced carries every line the Run has (' + lineKeys.length + ')');
eq(lineKeys.filter(function (k) { return !TK.LINE[k]; }), [], 'every line the Run can carry has a trade');
ok(Object.keys(TK.LINE).every(function (k) { return TK.TRADE_KEYS.indexOf(TK.LINE[k][0]) >= 0 && TK.LINE[k][1]; }), 'and every trade named is a real trade, with a name for the line');
eq(Object.keys(TK.LINE).filter(function (k) { return k !== 'contracted' && lineKeys.indexOf(k) < 0; }), [], 'and no trade claims a line the Run does not have');
eq(TK.TRADE_KEYS, ['civil', 'concrete', 'electrical', 'storage', 'solar', 'ev', 'generation', 'compute', 'envelope', 'utility', 'soft', 'contracted'], 'the trades, in the order an estimate runs');

/* ── 2. a battery-and-chargers site ── */
function site() {
  return { fleet: { units: 2, byModel: { 'GOTION-EDGE-760': { qty: 2, kwh: 261, kw: 125, catalogKey: 'GOTION-EDGE-760' } } }, fleetRating: { kwh: 522, kw: 250 },
    counts: { pad: 2, disco: 1, meter: 1, bollard: 8, jbox: 1, panel: 1, hasXfmr: true, mgc: 0 }, sheet: { eng: 12000, perm: 4000, comm: 6000, xfmr: 45000 },
    ev: { items: [{ kind: 'evl2', kw: 11.5, qty: 1 }, { kind: 'evunit', evId: 'autel_dc_compact', kw: 40, qty: 1 }, { kind: 'evl2', kw: 11.5, qty: 1 }] },
    solarKwDc: 350, solar: { byMount: { ground: 0, roof: 350, canopy: 0 } }, conduitFt: { 'RMC-AC': 420, 'EMT-BMS': 200, 'PVC-UG': 300 }, conduitRuns: { 'RMC-AC': 3, 'EMT-BMS': 2, 'PVC-UG': 2 },
    emsOn: true, configuredKwh: 522, configuredKw: 250 };
}
var q1 = site(), o1 = EC.rollup(q1), t1 = TK.takeoff(o1, q1, { trenchFt: 640, padSf: 240 });
exact(t1, o1, 'the sample site');
eq(t1.trades.map(function (x) { return x.key; }), ['civil', 'concrete', 'electrical', 'storage', 'solar', 'ev', 'utility', 'soft'], 'its trades: what is on the drawing, the utility, the soft costs');
var cont = o1.totals.contPct;
ok(Math.abs(line(t1, 'bess').amount - o1.lines.bess.total * (1 + cont)) < 0.011 && line(t1, 'bess').contingency, 'a line carries the Run’s contingency at the Run’s rate');
eq(trade(t1, 'storage').qty.text, '522 kWh', 'storage is sized in kWh');
eq([line(t1, 'bess').rows.length, line(t1, 'bess').rows[0].qty.text, line(t1, 'bess').rows[0].parts], [1, '2 EA', ['bess:GOTION-EDGE-760']], 'a battery row per model, with the units it counts');
eq(trade(t1, 'solar').qty.text, '350 kW-DC', 'solar is sized in kW-DC');
eq(line(t1, 'solar').rows.map(function (r) { return [r.label, r.qty.text, r.parts[0]]; }), [['Solar PV, rooftop', '350 kW-DC', 'solar:roof']], 'a solar row per mount, as the Run priced it');
eq([line(t1, 'site.pad').qty.text, trade(t1, 'concrete').qty.text], ['2 EA · 240 SF', '2 EA pads'], 'the pads as counted, with the area the drawing measures, never a volume');
ok(!JSON.stringify(t1).match(/\bCY\b|\bTN\b|cubic|tons/i), 'no cubic yards or tons are worked up from nothing');
eq(trade(t1, 'electrical').qty.text, '920 LF of conduit', 'electrical is sized by its conduit, and says so');
eq(trade(t1, 'electrical').info.map(function (i) { return [i.key, i.qty.text, i.bom]; }),
  [['conduit:RMC-AC', '420 LF', 18060], ['conduit:EMT-BMS', '200 LF', 4300], ['conduit:PVC-UG', '300 LF', 11100]], 'each conduit type with its feet and its BOM figure, as the Cost tab’s schedule');
ok(trade(t1, 'electrical').info.every(function (i) { return /not added to the Run total/.test(i.note); }), 'and each says it is not added to the Run total');
ok(info(t1, 'trench').qty.text === '640 LF' && /prices the conduit, not the trench/.test(info(t1, 'trench').note) && trade(t1, 'civil').qty.text === '640 LF of trench', 'the trench the drawing measures, unpriced, and said so');
ok(trade(t1, 'utility').cents === 0 && /not in the Run/.test(info(t1, 'utility').note), 'the utility’s charges are not in the Run, and the takeoff says so');
eq(line(t1, 'ev').rows.map(function (r) { return [r.label, r.qty.text, r.parts]; }),
  [['Level 2 charger, 11.5 kW', '2 EA', ['ev#0', 'ev#2']], ['Autel DC Compact 40 kW (UW040A2501)', '1 EA', ['ev#1']]], 'a charger row per model, pointing at exactly the items it counts');
eq(line(t1, 'ev').parts, ['ev#0', 'ev#2', 'ev#1'], 'and the line points at all of them');
ok(trade(t1, 'soft').lines.every(function (l) { return l.qty.unit === 'LS'; }) && trade(t1, 'soft').qty === null, 'soft costs are lump sums');
ok(Math.abs(sum(t1.trades, 'pct') - 100) < 0.5, 'the shares come to 100%');

/* a model name and a book key: the roll-up groups by the name the drawing
   gives, so two models on one book entry are two rows */
var q2 = { ev: { items: [{ key: 'Autel MaxiCharger 240 (lot A)', evId: 'autel_fast_disp', kind: 'evunit', kw: 240, qty: 1 }, { key: 'Autel MaxiCharger 240 (lot B)', evId: 'autel_fast_disp', kind: 'evunit', kw: 240, qty: 2 }] } };
var t2 = TK.takeoff(EC.rollup(q2), q2, {});
eq(line(t2, 'ev').rows.map(function (r) { return [r.label, r.qty.text, r.parts]; }),
  [['Autel MaxiCharger 240 (lot A), 240 kW', '1 EA', ['ev#0']], ['Autel MaxiCharger 240 (lot B), 240 kW', '2 EA', ['ev#1']]], 'chargers are grouped by the name on the drawing, as the roll-up groups them');
/* a NextNRG battery beside a plain one: each line counts its own */
var q3 = site(); q3.fleet.byModel['NextNRG Saft 1000'] = { qty: 1, kwh: 1000, kw: 500, nextnrg: true }; q3.fleet.units = 3;
var o3 = EC.rollup(q3), t3 = TK.takeoff(o3, q3, {});
exact(t3, o3, 'a NextNRG battery beside a plain one');
eq([line(t3, 'bess').qty.text, line(t3, 'bess').parts], ['522 kWh · 2 EA', ['bess:GOTION-EDGE-760']], 'the plain battery line counts only the plain batteries');
eq([line(t3, 'nextnrg.storage').qty.text, line(t3, 'nextnrg.storage').parts, line(t3, 'nextnrg.storage').contingency], ['1,000 kWh · 500 kW', ['bess:NextNRG Saft 1000'], false], 'NextNRG’s storage counts its own, at its installed price');
eq(trade(t3, 'storage').qty.text, '1,522 kWh', 'and the storage trade is both');
/* conduit that is not underground is no trench */
var q3b = { counts: { panel: 1 }, conduitFt: { 'RMC-AC': 300 }, conduitRuns: { 'RMC-AC': 1 } }, t3b = TK.takeoff(EC.rollup(q3b), q3b, {});
ok(!info(t3b, 'trench') && !trade(t3b, 'civil'), 'above-ground conduit is not a trench');

/* ── 3. 400 random drawings through the real roll-up ── */
var seed = 11;
function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
function pick(a) { return a[Math.floor(rnd() * a.length)]; }
function maybe(p, v) { return rnd() < p ? v : undefined; }
var models = ['GOTION-EDGE-760', 'GOTION-GRID-3421', 'PYTES-30-60', 'CUSTOM-A', 'NextNRG Saft 1000', 'CC-R60'];
var fuzzed = 0, contracted = 0, nn = 0, rows = 0;
for (var f = 0; f < 400; f++) {
  var byModel = {}, nm = Math.floor(rnd() * 3), units = 0;
  for (var i = 0; i < nm; i++) { var k = pick(models), qty = 1 + Math.floor(rnd() * 6); units += qty;
    byModel[k] = { qty: qty, kwh: Math.round(50 + rnd() * 4000), kw: Math.round(30 + rnd() * 2000), catalogKey: k, nextnrg: /NextNRG/.test(k), cost: maybe(0.2, Math.round(rnd() * 900000)), mixed: false }; }
  var solar = rnd() < 0.6 ? Math.round(rnd() * 8000) : 0, g = rnd() * solar, r = rnd() * (solar - g);
  var evItems = [];
  for (var e = 0, ne = Math.floor(rnd() * 5); e < ne; e++) evItems.push(pick([{ kind: 'evl2', kw: 11.5, qty: 1 }, { kind: 'evunit', evId: pick(['autel_dc_compact', 'autel_fast_disp', 'tesla_v4_post', null]), kw: pick([40, 150, 240]), qty: 1 + Math.floor(rnd() * 3) },
    { kind: 'evunit', key: 'Brand X 180', kw: 180, qty: 1, eqOverride: maybe(0.5, 50000) }, { kind: 'evunit', key: pick(['Lot A 240', 'Lot B 240']), evId: 'autel_fast_disp', kw: 240, qty: 1 + Math.floor(rnd() * 2) }]));
  var q = { fleet: { units: units, byModel: byModel }, fleetRating: { kwh: maybe(0.3, Math.round(rnd() * 5000)) || 0, kw: maybe(0.3, Math.round(rnd() * 2000)) || 0 },
    counts: { pad: Math.floor(rnd() * 5), disco: Math.floor(rnd() * 3), meter: Math.floor(rnd() * 3), bollard: Math.floor(rnd() * 20), jbox: Math.floor(rnd() * 4), panel: Math.floor(rnd() * 3), hasXfmr: rnd() < 0.5, mgc: rnd() < 0.15 ? 1 : 0 },
    sheet: { eng: maybe(0.5, Math.round(rnd() * 90000)), perm: maybe(0.5, Math.round(rnd() * 30000)), comm: maybe(0.4, Math.round(rnd() * 40000)), xfmr: maybe(0.4, Math.round(rnd() * 200000)),
      misc: maybe(0.3, Math.round(rnd() * 20000)), contPct: maybe(0.4, pick([0, 5, 7.5, 12, 15])), actualTotal: maybe(0.08, Math.round(rnd() * 5e6)), pvWdc: maybe(0.15, +(1 + rnd() * 2).toFixed(2)) },
    ev: { items: evItems, futureUnits: rnd() < 0.2 ? 2 : 0, futureMakeReady: 12000 },
    solarKwDc: solar, solar: { byMount: { ground: g, roof: r, canopy: Math.max(0, (solar - g - r) * rnd()) }, nextnrgKwDc: rnd() < 0.2 ? solar * rnd() : 0 },
    conduitFt: { 'PVC-UG': Math.round(rnd() * 2000), 'RMC-DC': Math.round(rnd() * 500) }, conduitRuns: { 'PVC-UG': 2, 'RMC-DC': 1 },
    emsOn: rnd() < 0.5, configuredKwh: Math.round(rnd() * 3000), configuredKw: Math.round(rnd() * 1500),
    compute: { podsN: rnd() < 0.15 ? 1 + Math.floor(rnd() * 3) : 0, podKw: 1000 * (1 + Math.floor(rnd() * 3)), shellPerPod: 0, itPerPod: 0, excludeIt: false },
    omegaCore: { skids: rnd() < 0.2 ? 1 + Math.floor(rnd() * 2) : 0 },
    gen: rnd() < 0.2 ? [{ kind: 'deralt', altId: 'gen_ng', kw: 500 }, { kind: 'deralt', altId: pick(['sofc', 'gen_ng', 'recip']), kw: 300, model: maybe(0.5, 'Unit Y') }, { kind: 'derwind', kw: 100 }] : [],
    dc: rnd() < 0.1 ? { element: { itKw: 2000, pue: 1.3 } } : {},
    bnzCapex: rnd() < 0.1 ? Math.round(rnd() * 400000) : 0, vendorOrg: rnd() < 0.1 ? 'nextnrg.com' : 'sunrise.example' };
  Object.keys(q.sheet).forEach(function (k2) { if (q.sheet[k2] === undefined) delete q.sheet[k2]; });
  var out = EC.rollup(q), t = TK.takeoff(out, q, { trenchFt: maybe(0.5, Math.round(rnd() * 3000)), fenceFt: maybe(0.3, Math.round(rnd() * 800)), padSf: maybe(0.5, Math.round(rnd() * 2000)) });
  var cents = Math.round(out.totals.total * 100);
  assert.equal(sum(t.trades, 'cents'), cents, 'drawing ' + f + ': the trades add up to the Run total');
  t.trades.forEach(function (x) {
    assert.equal(sum(x.lines, 'cents'), x.cents, 'drawing ' + f + ': ' + x.key + ' is its lines');
    x.lines.forEach(function (l) {
      if (l.rows.length) { rows++; assert.equal(sum(l.rows, 'cents'), l.cents, 'drawing ' + f + ': ' + l.key + ' is its rows'); }
      assert.ok(l.cents >= 0, 'drawing ' + f + ': ' + l.key + ' is not negative');
      assert.ok(!l.qty || (l.qty.qty > 0 && typeof l.qty.unit === 'string'), 'drawing ' + f + ': ' + l.key + ' has a real quantity or none');
    });
    (x.info || []).forEach(function (i) { assert.ok(!i.cents, 'drawing ' + f + ': ' + i.key + ' carries no money of the Run’s'); });
  });
  /* every line and row says where its price comes from, and the kinds add up */
  t.trades.forEach(function (x) { x.lines.forEach(function (l) {
    assert.ok(l.source && (TK.KINDS.indexOf(l.source.kind) >= 0 || l.source.kind === 'mixed') && typeof l.source.basis === 'string' && !/\$\s*\d|\d\s*\/\s*(W|kW|kWh)\b/.test(l.source.basis), 'drawing ' + f + ': ' + l.key + ' says where its price comes from, never a rate');
    l.rows.forEach(function (r2) { assert.ok(r2.source && TK.KINDS.indexOf(r2.source.kind) >= 0, 'drawing ' + f + ': a row of ' + l.key + ' has a kind'); });
    if (l.source.kind === 'mixed') assert.ok(l.rows.length > 1, 'drawing ' + f + ': only a line of rows is mixed');
  }); });
  assert.equal(sum(t.sources, 'cents'), cents, 'drawing ' + f + ': the money by kind adds up to the Run total');
  assert.ok(!t.contracted || (t.sources.length === 1 && t.sources[0].kind === 'quote') || !cents, 'drawing ' + f + ': a contracted total is all quote');
  /* the line keys are the build sequence's, one for one */
  var seq = BS.money(out).lines.map(function (l) { return l.key + ':' + l.cents; }).sort();
  var tk = []; t.trades.forEach(function (x) { x.lines.forEach(function (l) { tk.push(l.key + ':' + l.cents); }); });
  assert.deepEqual(tk.sort(), seq, 'drawing ' + f + ': the takeoff and the build sequence split the Run the same way');
  /* the charger and generator rows point at every item, once */
  var evl = line(t, 'ev'), genl = line(t, 'gen');
  if (evl && !t.contracted) {
    var evParts = []; evl.rows.forEach(function (r2) { r2.parts.forEach(function (p) { if (/^ev#/.test(p)) evParts.push(+p.slice(3)); }); });
    assert.deepEqual(evParts.sort(function (a, b) { return a - b; }), q.ev.items.map(function (_, ix) { return ix; }), 'drawing ' + f + ': every charger item is in exactly one row');
    evl.rows.forEach(function (r2) { var n2 = 0; r2.parts.forEach(function (p) { if (/^ev#/.test(p)) n2 += q.ev.items[+p.slice(3)].qty; }); if (r2.parts[0] !== 'ev:future') assert.equal(n2, r2.qty.qty, 'drawing ' + f + ': a charger row counts its items'); });
  }
  if (genl && !t.contracted) {
    var gParts = []; genl.rows.forEach(function (r2) { r2.parts.forEach(function (p) { gParts.push(+p.slice(4)); }); });
    assert.deepEqual(gParts.sort(function (a, b) { return a - b; }), q.gen.map(function (_, ix) { return ix; }), 'drawing ' + f + ': every generator is in exactly one row');
  }
  if (out.totals.contracted) contracted++;
  if (out.totals.nextnrg > 0 || out.totals.nextnrgStorageAlone > 0) nn++;
  fuzzed++;
}
pass += fuzzed;
ok(contracted >= 10 && nn >= 10 && rows >= 200, 'the random drawings covered contracted totals (' + contracted + '), NextNRG’s prices (' + nn + ') and split lines (' + rows + ')');

/* ── 4. what carries no contingency ── */
var q4 = site(); q4.solar.nextnrgKwDc = 100; q4.solarKwDc = 450; q4.omegaCore = { skids: 1 };
var o4 = EC.rollup(q4), t4 = TK.takeoff(o4, q4, {});
exact(t4, o4, 'NextNRG solar and a skid');
ok(line(t4, 'nextnrg.solar').cents === Math.round(o4.totals.nextnrg * 100) && !line(t4, 'nextnrg.solar').contingency && line(t4, 'nextnrg.solar').qty.text === '100 kW-DC', 'NextNRG’s installed solar is its price, no contingency, its own kW-DC');
eq(trade(t4, 'solar').qty.text, '450 kW-DC', 'and the solar trade is both arrays');
var oc = line(t4, 'omegaCore');
ok(oc.cents === Math.round(o4.totals.omegaCore * 100) && !oc.contingency && trade(t4, 'compute').lines[0] === oc, 'the Omega-Core skid is its recorded price, in compute');
eq(oc.rows.map(function (r2) { return r2.cents; }), o4.lines.omegaCore.breakdown.map(function (b) { return b.total * 100; }), 'its rows are the skid and the controller built into it');

/* ── 5. a contracted total ── */
var q5 = site(); q5.sheet.actualTotal = 1000000;
var o5 = EC.rollup(q5), t5 = TK.takeoff(o5, q5, {});
ok(t5.total === 1000000 && t5.contracted && t5.spread === 'contracted' && /spread over the trades/.test(t5.notes.join(' ')), 'a contracted total replaces the estimate, spread by its shares, and says so');
exact(t5, o5, 'contracted');
ok(Math.abs(trade(t5, 'storage').cents / t5.cents - trade(t1, 'storage').cents / t1.cents) < 0.00001, 'each trade keeps the estimate’s share');
var o5b = EC.rollup({ sheet: { actualTotal: 250000 } }), t5b = TK.takeoff(o5b, {}, {});
ok(t5b.spread === 'contracted-whole' && trade(t5b, 'contracted').cents === 25000000 && /not split/.test(t5b.notes.join(' ')), 'nothing priced to split it by: the contracted total is its own trade, and said so');

/* ── 6. nothing placed ── */
var o6 = EC.rollup({}), t6 = TK.takeoff(o6, {}, {});
ok(t6.cents === 0 && /Nothing priceable/.test(t6.notes.join(' ')) && t6.trades.length === 0, 'nothing placed: no trades, and said so');
var q6b = { conduitFt: { 'PVC-UG': 120 }, conduitRuns: { 'PVC-UG': 1 } }, t6b = TK.takeoff(EC.rollup(q6b), q6b, { fenceFt: 200 });
ok(t6b.cents === 0 && trade(t6b, 'electrical').qty.text === '120 LF of conduit' && info(t6b, 'fence').qty.text === '200 LF' && !trade(t6b, 'utility'), 'conduit and a fence with nothing priced: their quantities, no money, no utility to carve out');
ok(/not priced in the Run/.test(trade(t6b, 'civil').notes[0]), 'and a trade with nothing priced says so');

/* ── 6b. where each price comes from ── */
function srcOf(t, k, row) { var l = line(t, k); return row == null ? l.source : l.rows[row].source; }
var qs = { fleet: { units: 3, byModel: { 'GOTION-EDGE-760': { qty: 2, kwh: 261, kw: 125, catalogKey: 'GOTION-EDGE-760' }, 'CUSTOM-X': { qty: 1, kwh: 500, kw: 250 }, 'Brand Y': { qty: 1, kwh: 400, kw: 200, cost: 150000 } } },
  overrides: { 'Brand Y': 170000 }, counts: { pad: 2, disco: 1, meter: 1, mgc: 1 }, sheet: { pad: 4800, disco: 9999, eng: 12000 },
  ev: { items: [{ kind: 'evl2', kw: 11.5, qty: 1 }, { kind: 'evunit', evId: 'autel_dc_compact', key: 'autel_dc_compact', kw: 40, qty: 1 }, { kind: 'evunit', evId: 'autel_fast_disp', key: 'Lot A', kw: 240, qty: 1, eqOverride: 50000 }, { kind: 'evunit', evId: 'tesla_v4_post', key: 'tesla_v4_post', kw: 250, qty: 1 }] },
  solarKwDc: 350, solar: { byMount: { ground: 200, roof: 0, canopy: 150 } }, gen: [{ kind: 'deralt', altId: 'gen_ng', kw: 500 }], genOverrides: {}, omegaCore: { skids: 1 }, compute: { podsN: 1, podKw: 1000 } };
var os = EC.rollup(qs), ts = TK.takeoff(os, qs, {});
eq(line(ts, 'bess').rows.map(function (r) { return [r.label.split(',')[0], r.source.kind]; }), [['GOTION-EDGE-760', 'book'], ['CUSTOM-X', 'benchmark'], ['Brand Y', 'quote']], 'batteries: the catalog is book, the container rate a benchmark, a vendor’s price entered a quote');
ok(/catalog/.test(srcOf(ts, 'bess', 0).basis) && /container rate/.test(srcOf(ts, 'bess', 1).basis) && /enter the vendor/.test(srcOf(ts, 'bess', 1).basis) && srcOf(ts, 'bess').kind === 'mixed', 'each says which, the benchmark says what to do, and the line is mixed');
var qs2 = JSON.parse(JSON.stringify(qs)); delete qs2.overrides['Brand Y'];
eq(srcOf(TK.takeoff(EC.rollup(qs2), qs2, {}), 'bess', 2).kind, 'book', 'a product carrying its own price on the drawing is book');
eq(line(ts, 'ev').rows.map(function (r) { return r.source.kind; }), ['benchmark', 'book', 'quote', 'benchmark'], 'chargers: the kW estimator, the Autel book, a price entered, a prior estimate');
ok(/prior estimate/.test(srcOf(ts, 'ev', 3).basis) && /kW/.test(srcOf(ts, 'ev', 0).basis), 'and they say which estimate');
eq([srcOf(ts, 'site.pad').kind, srcOf(ts, 'site.disco').kind, srcOf(ts, 'site.meter').kind, srcOf(ts, 'indirect.eng').kind], ['book', 'quote', 'book', 'quote'], 'the cost sheet: its own price is book, a figure changed from it a quote');
eq([srcOf(ts, 'controller').kind, srcOf(ts, 'omegaCore').kind, srcOf(ts, 'gen').kind, srcOf(ts, 'compute').kind], ['book', 'book', 'benchmark', 'benchmark'], 'the controller and the skid are book; EIA and the operator band are benchmarks');
eq([srcOf(ts, 'solar', 0).basis, srcOf(ts, 'solar', 1).basis, srcOf(ts, 'solar').kind, srcOf(ts, 'solar').basis], ['The DOE/NREL Q1 2025 PV benchmark', 'The canopy structure rate', 'benchmark', 'See each row'], 'solar: the benchmark by mount, one kind, the rows say which');
var qs3 = JSON.parse(JSON.stringify(qs)); qs3.sheet.pvWdc = 2.1; qs3.genOverrides = { gen_ng: 1500 }; qs3.compute.shellPerPod = 5000000;
var ts3 = TK.takeoff(EC.rollup(qs3), qs3, {});
eq([srcOf(ts3, 'solar').kind, srcOf(ts3, 'gen').kind, srcOf(ts3, 'compute').kind], ['quote', 'quote', 'quote'], 'a $/W typed, a $/kW entered for a class, a pod price entered: quotes');
var qn = site(); qn.solar.nextnrgKwDc = 100; qn.solarKwDc = 450; qn.fleet.byModel['NextNRG Saft'] = { qty: 1, kwh: 1000, kw: 500, nextnrg: true }; qn.fleet.units = 3;
var tn = TK.takeoff(EC.rollup(qn), qn, {});
ok(srcOf(tn, 'nextnrg.solar').kind === 'book' && srcOf(tn, 'nextnrg.storage').kind === 'book' && /NextNRG/.test(srcOf(tn, 'nextnrg.storage').basis), 'NextNRG’s installed prices are book');
eq(sum(ts.sources, 'cents'), ts.cents, 'the money by kind adds up to the Run total');
eq(ts.sources.map(function (k) { return k.kind; }), ['quote', 'book', 'benchmark'], 'quote, book, benchmark, in the order a reviewer trusts them');
var t5s = TK.takeoff(o5, q5, {});
ok(t5s.sources.length === 1 && t5s.sources[0].kind === 'quote' && t5s.trades.every(function (x) { return x.lines.every(function (l) { return l.source.kind === 'quote' && /contracted/.test(l.source.basis); }); }), 'a contracted total is a quote, every line of it');
ok(!JSON.stringify(ts.sources).match(/basis/) && JSON.stringify(ts).indexOf('241') < 0 && JSON.stringify(ts).indexOf('"85"') < 0, 'no rate behind a benchmark reaches the page');

/* ── 7. drift: never quietly leave money out ── */
var bad = JSON.parse(JSON.stringify(o1)); bad.lines.newThing = { total: 9999 }; bad.totals.sub += 9999; bad.totals.total += 9999 * (1 + cont);
assert.throws(function () { TK.takeoff(bad, q1, {}); }, /subtotal/); pass++;
var keep = TK.LINE['site.jbox']; delete TK.LINE['site.jbox'];
assert.throws(function () { TK.takeoff(o1, q1, {}); }, /site\.jbox has no trade/); pass++;
TK.LINE['site.jbox'] = keep;
ok(true, 'a line with no trade throws instead of leaving money out');

/* ── 8. what the page sends is cleaned, and never priced ── */
eq(TK.clean({ trenchFt: -5, fenceFt: 'x', padSf: 300, total: 9 }), { trenchFt: 0, fenceFt: 0, padSf: 300 }, 'negatives, words and anything else are dropped');
eq(TK.clean({ trenchFt: 9e9, fenceFt: 9e9, padSf: 9e9 }), { trenchFt: 1000000, fenceFt: 1000000, padSf: 10000000 }, 'and the rest capped');
eq(TK.clean(null), { trenchFt: 0, fenceFt: 0, padSf: 0 }, 'nothing is nothing');
eq(TK.takeoff(o1, q1, { trenchFt: 640, padSf: 240, total: 1, cents: 5, price: 99, trades: [] }), t1, 'a total, a price or trades in the body change nothing');

/* ── 9. the door ── */
(async function () {
  var DB, AUTH;
  var ME = { uid: 'u1', email: 'dana@sunrise.example', orgId: 'sunrise.example', staff: false, claims: { email_verified: true } };
  function as(c) { AUTH = function () { return Promise.resolve(JSON.parse(JSON.stringify(c))); }; }
  function reset(billing, member, org) {
    DB = new FD.DB(); as(ME);
    if (org !== null) DB.seed('omega_orgs/sunrise.example', org || { name: 'Sunrise', status: 'active' });
    DB.seed('omega_orgs/sunrise.example/billing/current', billing || { tier: 'deluxe' });
    if (member !== null) DB.seed('omega_orgs/sunrise.example/members/u1', member || { role: 'member', status: 'active' });
  }
  function httpError(s, msg) { var e = new Error(msg); e.status = s; return e; }
  FD.mock('../api/_lib/admin.js', { handler: function (fn) { return fn; }, httpError: httpError, db: function () { return DB; },
    authenticate: function (req) { return AUTH(req); },
    safeOrg: function (v) { v = String(v || '').toLowerCase(); return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v) ? v : ''; } });
  var api = require(path.join(ROOT, 'api', 'takeoff.js')), headers = {};
  var res = { setHeader: function (k, v) { headers[k] = v; } };
  function call(body, method) { return api({ method: method || 'POST', headers: {}, body: body }, res); }
  async function refused(body, status, why, method) { try { await call(body, method); assert.fail('expected ' + status + ': ' + why); } catch (e) { assert.equal(e.status, status, why + ' → ' + e.message); pass++; return e; } }
  var EXTRA = { trenchFt: 640, padSf: 240 };

  reset();
  var r = await call({ q: site(), extra: EXTRA });
  var mine = site(); mine.vendorOrg = 'sunrise.example';
  eq(r, TK.takeoff(EC.rollup(mine), mine, EXTRA), 'a legacy member gets the takeoff of the roll-up on the body’s quantities');
  eq(headers['Cache-Control'], 'no-store', 'never cached');
  var spoof = site(); spoof.vendorOrg = 'nextnrg.com'; spoof.fleet.byModel['NextNRG Saft'] = { qty: 1, kwh: 1000, kw: 500, catalogKey: 'X' }; spoof.fleet.units = 3;
  var asked = await call({ q: JSON.parse(JSON.stringify(spoof)) });
  var fair = JSON.parse(JSON.stringify(spoof)); fair.vendorOrg = 'sunrise.example';
  ok(asked.cents === Math.round(EC.rollup(fair).totals.total * 100) && asked.cents !== Math.round(EC.rollup(spoof).totals.total * 100), 'a body naming NextNRG’s workspace is priced as the caller’s own');
  as(Object.assign({}, ME, { orgId: 'nextnrg.com' })); DB.seed('omega_orgs/nextnrg.com/billing/current', { tier: 'deluxe' });
  var theirs = await call({ q: site() }), nnq = site(); nnq.vendorOrg = 'nextnrg.com';
  eq(theirs.cents, Math.round(EC.rollup(nnq).totals.total * 100), 'NextNRG’s own workspace is priced at its own rate, as the Run is');

  reset({ packaged: true, packagingState: 'paid', modules: ['lite', 'estimate'], accessUntil: Date.now() + 30 * 86400000 });
  ok((await call({ q: site() })).ok, 'a package with Omega Estimate gets the takeoff');
  reset({ packaged: true, packagingState: 'paid', modules: ['lite', 'plansets'], accessUntil: Date.now() + 30 * 86400000 });
  var np = await refused({ q: site() }, 403, 'a package without Omega Estimate');
  ok(/Omega Estimate/.test(np.message) && /Cost tab/.test(np.message), 'and says which module carries it: ' + np.message);
  reset({ packaged: true, packagingState: 'paid', modules: ['lite', 'estimate'], accessUntil: Date.now() - 86400000 });
  await refused({ q: site() }, 403, 'a lapsed package is read-only');
  reset(null, null, { status: 'suspended' }); await refused({ q: site() }, 403, 'a suspended workspace');
  reset(null, null, { status: 'pending' }); await refused({ q: site() }, 403, 'a pending workspace');
  reset(null, null, { status: 'cancelled' }); await refused({ q: site() }, 403, 'a cancelled workspace');
  reset(null, null, null); ok((await call({ q: site() })).ok, 'no workspace record yet: open, as the editor gate is');
  reset(null, { role: 'member', status: 'disabled' }); await refused({ q: site() }, 403, 'a disabled member');
  reset(null, { role: 'member', status: 'active', toolAccess: ['gridatlas'] }); await refused({ q: site() }, 403, 'a member without Site Map');
  reset({ tier: 'deluxe', toolAccess: ['gridatlas'] }); await refused({ q: site() }, 403, 'a product without Site Map');
  reset(null, { role: 'viewer', status: 'active' }); ok((await call({ q: site() })).ok, 'a viewer may read the takeoff: it writes nothing');
  reset(); as(Object.assign({}, ME, { orgId: 'not a domain' })); await refused({ q: site() }, 403, 'no workspace on the token');
  reset(); as({ uid: 's1', email: 'ops@clearsky-usa.com', orgId: null, staff: true, claims: { email_verified: true } });
  ok((await call({ q: site() })).ok, 'staff');
  reset(); await refused({ q: site() }, 405, 'GET is not the door', 'GET');
  var big = {}; for (var b = 0; b <= EC.MAX_ITEMS; b++) big['m' + b] = { qty: 1, kwh: 1 };
  await refused({ q: { fleet: { units: 1, byModel: big } } }, 413, 'a body past the cap');
  reset(); DB = { collection: function () { return { doc: function () { var d = { get: function () { return Promise.reject(new Error('unavailable')); } }; d.collection = function () { return { doc: function () { return d; } }; }; return d; } }; } };
  await refused({ q: site() }, 503, 'a plan read that fails is try-again, never a guess');

  console.log('ttakeoff: ' + pass + ' passed');
})().catch(function (e) { console.error(e); process.exit(1); });
