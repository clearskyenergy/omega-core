#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Site Map's cost engine runs on the server (api/_lib/editor-cost.js behind
 * POST /api/cost-rollup) and the page sends quantities and draws lines
 * (2026-10-13; editor IP audit, item 3). Holds: the engine's numbers against
 * what the page used to produce, the endpoint's gate, the page carrying no
 * table, and the page's own quantities collector (cut from editor.html) fed
 * into the real engine end to end. */
'use strict';
var assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.join(__dirname, '../..'), count = 0;
function read(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }
var EC = require(path.join(ROOT, 'api/_lib/editor-cost'));

/* ── the engine, pinned to the page's former arithmetic ─────────────── */
var r = EC.rollup({
  fleet: { units: 2, byModel: { 'CUSTOM-760': { qty: 2, kwh: 760, kw: 380, cost: null, mixed: false, groupCost: 0 } } },
  counts: { pad: 2, disco: 1, meter: 1 }, sheet: {}, configuredKwh: 1520, configuredKw: 760, emsOn: true,
  ev: { items: [{ key: 'autel_dh480', evId: 'autel_dh480', kind: 'evunit', kw: 480, qty: 2 }] },
  gen: [{ kind: 'deralt', model: 'Gas turbine', kw: 20000 }], dc: { pods: 2, podKw: 2000 }, compute: { podsN: 2, podKw: 2000 }, solarKwDc: 500
});
assert.equal(r.lines.bess.total, 200260, '2 × 760 kWh at $85 plus 55% install'); assert.equal(r.lines.bess.autoByKwh['760'], 64600); count += 2;
assert.equal(r.lines.ev.total, 292500, 'DH480 dealer cost × 2 plus install'); assert.equal(r.lines.ev.book.autel_dh480.pn, 'UH480'); count += 2;
assert.equal(r.lines.dc.total, 7000875, 'the Eaton ROM: N+1 UPS and transformers, 5% design'); assert.equal(r.lines.dc.ups, 4); assert.equal(r.lines.dc.xfmr, 4); count += 3;
assert.equal(r.lines.gen.total, 30000000); assert.equal(r.lines.gen.lines[0].cls, 'turbine'); assert.equal(r.lines.gen.gasTotal, 30000000); count += 3;
assert.equal(r.totals.solar, 775000, '500 kW commercial at $1.55/Wdc'); assert.equal(r.totals.compute, 60000000, '2 MW of pods at the operator band'); count += 2;
assert.equal(r.totals.siteEq, 2 * 4800 + 3200 + 3850); assert.equal(r.totals.indirect, 4500, 'EMS setup only; the annual fee is O&M'); assert.equal(r.lines.ems.annual, 1520 * 12); count += 3;
assert.equal(r.totals.sub, 98289785); assert.equal(r.totals.total, 108118763.5); assert.equal(r.totals.contPctRound, 10); count += 3;
assert.equal(r.totals.low, 86118763.5); assert.ok(Math.abs(r.totals.high - 130118763.5) < 1e-6, 'the pod band is the only range'); count += 2;
assert.equal(r.totals.itcBasis, 1417801, 'ITC on energy property only: never pods, gas turbines, the DC package'); count++;
assert.equal(r.totals.costPerKW, 4750); assert.equal(r.totals.totalKW, 22760); count += 2;
assert.deepEqual(r.flags, { bessBenchmark: false, solarBenchmark: true, computeBenchmark: true, genBenchmark: true, benchmarked: true }); count++;

/* scope gate: an empty drawing totals nothing, whatever the sheet says */
var e = EC.rollup({ sheet: { eng: 15000, perm: 3500, comm: 8500 }, counts: { pad: 3 } });
assert.equal(e.totals.total, 0); assert.equal(e.totals.inScope, false); assert.equal(e.totals.siteEq, 0); assert.equal(e.totals.siteEqRaw, 3 * 4800); count += 4;
/* configured, not placed: shown, never counted; the benchmark prices the rating instead */
var c = EC.rollup({ configured: [{ id: 'b1', name: 'EDGE', kwh: 760, kw: 380, qty: 1 }], configuredKwh: 760, configuredKw: 380, fleetRating: { kwh: 760, kw: 380 } });
assert.equal(c.lines.bess.configured[0].eq, 64600); assert.equal(c.lines.bess.configured[0].install, 35530); count += 2;
assert.equal(c.lines.bess.benchmark, 760 * 241 + 380 * 379, 'NREL energy + power split'); assert.equal(c.totals.bess, c.lines.bess.benchmark); assert.equal(c.flags.bessBenchmark, true); count += 3;
/* a vendor override is per unit; a mixed group uses its summed cost */
var m = EC.rollup({ fleet: { units: 3, byModel: { A: { qty: 2, kwh: 500, cost: 10000, mixed: true, groupCost: 25000 }, B: { qty: 1, kwh: 500, cost: null } } }, overrides: { B: 7000 } });
assert.equal(m.lines.bess.rows[0].eq, 25000); assert.equal(m.lines.bess.rows[1].eq, 7000); assert.equal(m.lines.bess.rows[1].missing, false); count += 3;
/* EV: msrp basis, L2 and DC estimators, overrides, future make-ready */
var ev = EC.rollup({ priceBasis: 'msrp', ev: { items: [{ key: 'autel_ac_elite', evId: 'autel_ac_elite', kind: 'evl2', kw: 12, qty: 1 }, { key: 'L2', kind: 'evl2', kw: 19.2, qty: 1 }, { key: 'DC', kind: 'evunit', kw: 150, qty: 2, eqOverride: 40000 }], futureUnits: 2, futureMakeReady: 9000 } });
assert.equal(ev.lines.ev.byModel.autel_ac_elite.eq, 1190, 'list price on the msrp basis'); count++;
assert.equal(ev.lines.ev.byModel.L2.eq, 1728); assert.equal(ev.lines.ev.byModel.L2.install, 2419); count += 2;
assert.equal(ev.lines.ev.byModel.DC.eq, 80000); assert.equal(ev.lines.ev.byModel.DC.install, 2 * 24750, 'install off the estimate, equipment off the override'); count += 2;
assert.equal(ev.lines.ev.futureMakeReady, 9000); assert.equal(ev.lines.ev.units, 4); count += 2;
/* the contracted number is the truth */
var k = EC.rollup({ solarKwDc: 100, sheet: { actualTotal: 123456 } });
assert.equal(k.totals.total, 123456); assert.equal(k.totals.contracted, true); assert.equal(k.totals.low, 123456); assert.equal(k.totals.benchmark, 100 * 1000 * 1.55 * 1.1); count += 4;
/* generation classes */
assert.equal(EC.genClass({ kind: 'derwind' }), 'wind'); assert.equal(EC.genClass({ model: 'Bloom fuel cell' }), 'sofc'); assert.equal(EC.genClass({ kw: 50000 }), 'turbine_l'); assert.equal(EC.genClass({ altId: 'recip' }), 'recip'); count += 4;
assert.equal(EC.pvRate(50), 3.25); assert.equal(EC.pvRate(5000), 1.55); assert.equal(EC.pvRate(50000), 1.15); count += 3;

/* ── the endpoint ──────────────────────────────────────────────────── */
var ep = read('api/cost-rollup.js');
assert.match(ep, /req\.method !== 'POST'/); assert.match(ep, /A\.authenticate\(req\)/); assert.match(ep, /caller\.orgId \|\| caller\.staff/); assert.match(ep, /EC\.rollup\(q\)/); count += 4;

/* ── the page: no table, a collector, a cached request, a renderer ─── */
var ed = read('editor.html');
['BESS_EQ_PER_KWH', 'PROP_PRICING', 'podAllInPerKw', 'xfmrEach', 'AUTEL_PRICES', 'EVC_COST', '_evEstCost', 'genPerKw:', 'bessKwh:        241', 'msrp:1190', "'UH480'", 'switchgear:      800500', 'kw*300', 'Math.round(eq * 0.55)', 'Math.round(_eq * 0.55)'].forEach(function (t) {
  assert.ok(ed.indexOf(t) < 0, 'a cost table or rule is still in the page: ' + t); count++;
});
assert.match(ed, /fetch\('\/api\/cost-rollup',\{method:'POST'/); count++;
assert.match(ed, /function omegaCostQuantities\(\)\{/); assert.match(ed, /function _renderCostEst\(ans, stale\)/); count += 2;
assert.match(ed, /if\(window\._COST_PENDING && window\._COST_PROMISE && typeof window\._COST_PROMISE\.then==='function'\) window\._COST_PROMISE\.then\(finish, finish\);/, 'Run waits for the answer'); count++;
assert.match(ed, /function getBessCostAuto\(kwh, override\) \{\n  if\(override > 0\) return override;\n  if\(!kwh \|\| kwh<=0\) return 0;\n  var a = window\._COST_SERVER/); count++;
assert.match(ed, /var _src  = _evBook\(_mk\[_e\]\);/); assert.match(ed, /var bk = _evBook\(k\);/); count += 2;

/* ── the page's collector, cut out and run on a drawing, into the real engine ── */
function cut(name) { var s = ed.indexOf('function ' + name + '('), e2 = ed.indexOf('\n}\n', s); assert.ok(s > 0 && e2 > s, name); return ed.slice(s, e2 + 3); }
var S = {
  bessList: [{ id: 'b1', name: 'EDGE 760', kwh: 760, kw: 380, qty: 1, mfr: 'Gotion', xfmr: '1000KVA' }],
  elements: [{ eqId: 'pad' }, { eqId: 'pad' }, { eqId: 'disco' }, { eqId: 'meter' }, { type: 'evgear', evKind: 'charger', evId: 'autel_dh480', kw: 480, units: 2, evModel: 'DH480', mfr: 'Autel' }],
  shapes: [{ kind: 'deralt', model: 'Gas turbine', kw: 20000 }, { kind: 'derdc', kw: 1000 }, { kind: 'derdc', kw: 1000 }, { kind: 'derdc', kw: 75, omegaCore: true }, { kind: 'evl2', evId: 'autel_ac_elite', kw: 12 }],
  conduits: [{ condType: 'RMC-DC', ftLen: 100 }, { condType: 'PVC-UG', ftLen: 40 }], pxPerFt: 10, costOverrides: {}, omegaSizing: { pue: 1.3 }
};
var ctx = { S: S, window: {}, document: { getElementById: function (id) { return id === 'ems-toggle' ? { checked: true } : null; }, activeElement: null },
  $v: function () { return undefined; }, JSON: JSON, Object: Object, Math: Math, Promise: Promise, String: String, Number: Number,
  _ppCollectFleet: function () { return { units: 2, byModel: { 'CUSTOM-760': { qty: 2, kwh: 760, kw: 380, cost: null, groupCost: 0, mixed: false } } }; },
  _vendorOverrides: function () { return {}; }, omegaBessFleet: function () { return { kwh: 1520, kw: 760 }; },
  omegaSolarKwDc: function () { return 500; }, omegaDer: function () { return { solarKwDc: 500, windKw: 0, altKw: 20000 }; }, bnzAll: function () { return { capex: 0 }; },
  OMEGA_PRICE_BASIS: 'cost' };
ctx.window.OmegaComputeCost = { pods: function () { return { n: 2, kw: 2000 }; }, config: function () { return { shellPerPod: null, itPerPod: null, excludeIt: false }; } };
ctx.window.OmegaEVFuture = { isFuture: function () { return false; }, cost: function () { return { total: 0 }; } };
vm.createContext(ctx);
vm.runInContext(cut('_costSheetValues') + cut('_evQuantities') + cut('omegaCostQuantities') + '\nthis.q = omegaCostQuantities();', ctx);
var q = ctx.q;
assert.equal(q.counts.pad, 2); assert.equal(q.counts.hasXfmr, true); assert.equal(q.conduitFt['RMC-DC'], 100); assert.equal(q.conduitRuns['PVC-UG'], 1); count += 4;
assert.equal(q.ev.items.length, 2); assert.equal(q.ev.items[1].qty, 2, 'a dual pedestal element is two chargers'); count += 2;
assert.equal(q.gen.length, 1); assert.equal(q.dc.pods, 2, 'the Omega-Core skid is never the host\'s'); assert.equal(q.compute.podsN, 2); assert.equal(q.emsOn, true); count += 4;
assert.equal(q.configuredKwh, 760); assert.equal(q.configured[0].qty, 1); assert.equal(q.priceBasis, 'cost'); count += 3;
assert.ok(!/eq:|install:|msrp|rate/.test(JSON.stringify(q.ev)), 'the request carries quantities, never a price'); count++;
var full = EC.rollup(q);
assert.equal(full.lines.bess.total, 200260); assert.equal(full.lines.ev.byModel.DH480.qty, 2); assert.equal(full.lines.ev.byModel.autel_ac_elite.eq, 714); count += 3;
assert.equal(full.lines.dc.pods, 2); assert.equal(full.lines.conduit.schedule.length, 2); assert.equal(full.lines.conduit.schedule[1].type, 'PVC-UG'); count += 3;
assert.ok(full.totals.total > 100e6 && full.totals.inScope, 'a priced site'); count++;
console.log('teditorcost: ' + count + ' assertions passed');

/* ── the catalog's unit prices are the server's ─────────────────────── */
assert.equal(EC.catalogPrice('GOTION-EDGE-760'), 84740); assert.equal(EC.catalogPrice('PYTES-60-120'), 56354); assert.equal(EC.catalogPrice('nope'), null); count += 3;
var cp = EC.rollup({ fleet: { units: 1, byModel: { 'GOTION-EDGE-760': { qty: 1, kwh: 760, cost: null, catalogKey: 'GOTION-EDGE-760' } } }, configured: [{ id: 'c1', kwh: 371, catalogKey: 'PYTES-60-120' }, { id: 'c2', kwh: 371, catalogKey: 'PYTES-60-120', eqcost: 50000 }] });
assert.equal(cp.lines.bess.rows[0].perUnit, 84740, 'a catalog unit is priced at its catalog price'); assert.equal(cp.lines.bess.rows[0].catalog, true); assert.equal(cp.lines.bess.rows[0].missing, false); count += 3;
assert.equal(cp.lines.bess.autoByKwh['760'], 84740); assert.equal(cp.lines.bess.configured[0].eq, 56354); assert.equal(cp.lines.bess.configured[1].eq, 50000, 'a typed cost wins'); count += 3;
assert.ok(!/eqcost:\d/.test(ed), 'no unit price on the page\'s catalog'); count++;
assert.match(ed, /catalogKey:k \}; \}\);/); assert.match(ed, /catalogKey:b\.catalogKey\|\|'' \}; \}\);/); count += 2;
console.log('teditorcost (catalog prices): assertions added');
