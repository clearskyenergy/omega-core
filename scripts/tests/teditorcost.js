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
assert.equal(r.totals.solar, 990000, '500 kW commercial at $1.98/Wdc (DOE/NREL Q1 2025)'); assert.equal(r.totals.compute, 60000000, '2 MW of pods at the operator band'); count += 2;
assert.equal(r.totals.siteEq, 2 * 4800 + 3200 + 3850); assert.equal(r.totals.indirect, 4500, 'EMS setup only; the annual fee is O&M'); assert.equal(r.lines.ems.annual, 1520 * 12); count += 3;
assert.equal(r.totals.sub, 98504785); assert.equal(r.totals.total, 108355263.5); assert.equal(r.totals.contPctRound, 10); count += 3;
assert.equal(r.totals.low, 86355263.5); assert.ok(Math.abs(r.totals.high - 130355263.5) < 1e-6, 'the pod band is the only range'); count += 2;
assert.ok(Math.abs(r.totals.itcBasis - 1654301) < 1e-6, 'ITC on energy property only: never pods, gas turbines, the DC package'); count++;
assert.equal(r.totals.costPerKW, 4761); assert.equal(r.totals.totalKW, 22760); count += 2;
assert.deepEqual(r.flags, { bessBenchmark: false, solarBenchmark: true, computeBenchmark: true, genBenchmark: true, benchmarked: true, nextnrg: false }); count++;

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
assert.equal(k.totals.total, 123456); assert.equal(k.totals.contracted, true); assert.equal(k.totals.low, 123456); assert.ok(Math.abs(k.totals.benchmark - 100 * 1000 * 1.98 * 1.1) < 1e-6); count += 4;
/* generation classes */
assert.equal(EC.genClass({ kind: 'derwind' }), 'wind'); assert.equal(EC.genClass({ model: 'Bloom fuel cell' }), 'sofc'); assert.equal(EC.genClass({ kw: 50000 }), 'turbine_l'); assert.equal(EC.genClass({ altId: 'recip' }), 'recip'); count += 4;
assert.equal(EC.pvRate(8), 2.95, 'residential under 25 kW'); assert.equal(EC.pvRate(50), 1.98, 'a 50 kW commercial roof is commercial, never residential'); assert.equal(EC.pvRate(5000), 1.98); assert.equal(EC.pvRate(50000), 1.12); count += 4;
assert.match(String(EC._tables.BENCH.pvSource), /Q1 2025/, 'the book names its source and quarter'); count++;

/* ── the endpoint ──────────────────────────────────────────────────── */
var ep = read('api/cost-rollup.js');
assert.match(ep, /req\.method !== 'POST'/); assert.match(ep, /A\.authenticate\(req\)/); assert.match(ep, /caller\.orgId \|\| caller\.staff/); assert.match(ep, /EC\.rollup\(q\)/); count += 4;
assert.match(ep, /q\.vendorOrg = caller\.orgId \|\| null;/, 'the caller\'s workspace is stamped on the request (a vendor prices its own products), never read off the body'); count++;
/* NextNRG's solar + storage system at $6.00/W-DC installed (api/_lib/nextnrg.js SYSTEM_RATE; scripts/tests/tnextnrg.js holds the cases): the Run total and the ITC basis carry it, the record's lines name it */
var nn = EC.rollup({ vendorOrg: 'nextnrg.com', solarKwDc: 368, solar: { byMount: { roof: 368 } }, fleet: { units: 1, byModel: { 'X': { qty: 1, kwh: 1000, kw: 250, cost: null } } }, counts: { pad: 1 }, sheet: {} });
assert.equal(nn.totals.nextnrg, 2208000); assert.equal(nn.totals.bess, 0); assert.equal(nn.totals.solar, 0); assert.equal(nn.totals.noContingency, 2208000); count += 4;
assert.equal(nn.totals.sub, 2208000 + 4800); assert.equal(nn.totals.cont, 480); assert.equal(nn.totals.total, 2208000 + 4800 + 480); assert.equal(nn.totals.itcBasis, 2208000 + 4800 * 1.1); assert.equal(nn.flags.nextnrg, true); count += 5;
assert.equal(nn.totals.low, nn.totals.total); assert.equal(nn.totals.high, nn.totals.total); count += 2;
var nnActual = EC.rollup({ vendorOrg: 'nextnrg.com', solarKwDc: 368, solar: { byMount: { roof: 368 } }, sheet: { actualTotal: 2500000 } });
assert.equal(nnActual.totals.total, 2500000, 'a contracted number still wins'); count++;

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
assert.match(ed, /catalogKey:ck,\s*\/\*[^*]*\*\/\s*nextnrg: !!\(\(ce && \(ce\.nextnrg===true/); assert.match(ed, /catalogKey:b\.catalogKey\|\|'' \}; \}\);/); count += 2;
console.log('teditorcost (catalog prices): assertions added');

/* ── solar is priced per kW-DC by MOUNT, on its own line, whatever else is
   on the drawing (Tommy, 2026-10-13: "make sure the solar is priced
   correctly per kw and that is generated independant on what the compute
   skid is"). A canopy is a canopy; the sheet's $/Wdc wins for every mount;
   kW the page cannot place by mount (a previewed layout) is plain PV at
   the size band. ───────────────────────────────────────────────────── */
var can = EC.rollup({ solarKwDc: 176, solar: { byMount: { canopy: 176 } } });
assert.equal(can.lines.solar.rows.length, 1); assert.equal(can.lines.solar.rows[0].mount, 'canopy'); assert.equal(can.lines.solar.rows[0].rate, 2.75); count += 3;
assert.equal(can.totals.solar, 176 * 1000 * 2.75, 'a canopy at the canopy rate, never the ground band'); assert.equal(can.lines.solar.isBenchmark, true); count += 2;
var mix = EC.rollup({ solarKwDc: 400, solar: { byMount: { ground: 300, canopy: 100 } } });
assert.equal(mix.totals.solar, 300e3 * 1.98 + 100e3 * 2.75); assert.equal(mix.lines.solar.rows.map(function (r) { return r.mount; }).join(','), 'ground,canopy'); count += 2;
assert.ok(Math.abs(mix.lines.solar.rate - mix.totals.solar / 400e3) < 1e-9, 'the blended rate is the line over its watts'); count++;
var ovr = EC.rollup({ solarKwDc: 200, solar: { byMount: { ground: 100, canopy: 100 } }, sheet: { pvWdc: 2 } });
assert.equal(ovr.totals.solar, 400000, 'the sheet wins for every mount'); assert.equal(ovr.lines.solar.isBenchmark, false); assert.equal(ovr.lines.solar.rows[1].rate, 2); count += 3;
var prev = EC.rollup({ solarKwDc: 500, solar: { byMount: { ground: 200 } } });
assert.equal(prev.lines.solar.rows.length, 2); assert.equal(prev.lines.solar.rows[1].mount, 'unspecified'); assert.equal(prev.lines.solar.rows[1].kwDc, 300); count += 3;
assert.equal(prev.totals.solar, 500e3 * 1.98, 'a previewed layout the page cannot place by mount is plain PV at the band'); count++;
assert.equal(EC.pvRate(176, 'canopy'), 2.75); assert.equal(EC.pvRate(176, 'roof'), 1.98); assert.equal(EC.pvRate(25000, 'canopy'), 2.75, 'a canopy never takes the utility band'); count += 3;
assert.equal(EC._tables.BENCH.pvCanopy, 2.75); assert.match(can.sources.pvCanopy, /2\.50-3\.50/); count += 2;
/* nothing else on the drawing moves it: pods, the DC package and generation beside it */
var alone = EC.rollup({ solarKwDc: 176, solar: { byMount: { canopy: 176 } } });
var crowd = EC.rollup({ solarKwDc: 176, solar: { byMount: { canopy: 176 } }, compute: { podsN: 2, podKw: 2000 }, dc: { pods: 2, podKw: 2000 }, gen: [{ kind: 'deralt', model: 'Gas turbine', kw: 20000 }] });
assert.deepEqual(crowd.lines.solar, alone.lines.solar, 'the solar line is its own'); count++;

/* the page: the arrays by mount off the drawing, through the real collector
   and the real engine, with and without an Omega-Core skid on the drawing */
function collect(shapes) {
  var S2 = { bessList: [], elements: [], shapes: shapes, conduits: [], pxPerFt: 10, costOverrides: {}, omegaSizing: {} };
  var c2 = { S: S2, window: {}, document: { getElementById: function () { return null; }, activeElement: null },
    $v: function () { return undefined; }, JSON: JSON, Object: Object, Math: Math, Promise: Promise, String: String, Number: Number,
    _ppCollectFleet: function () { return { units: 0, byModel: {} }; }, _vendorOverrides: function () { return {}; }, omegaBessFleet: function () { return { kwh: 0, kw: 0 }; },
    omegaSolarKwDc: function () { return 500; }, omegaDer: function () { return { solarKwDc: 500, windKw: 0, altKw: 0 }; }, bnzAll: function () { return { capex: 0 }; }, OMEGA_PRICE_BASIS: 'cost' };
  vm.createContext(c2);
  vm.runInContext(cut('_costSheetValues') + cut('_evQuantities') + cut('omegaSolarByMount') + cut('omegaCostQuantities') + '\nthis.q = omegaCostQuantities();', c2);
  return c2.q;
}
var arrays = [{ kind: 'dersolar', kw: 176, mount: 'adjacent', canopy: true, autoLayout: true }, { kind: 'dersolar', kw: 324, mount: 'ground' }];
var qa = collect(arrays), qs = collect(arrays.concat([{ kind: 'derdc', kw: 75, omegaCore: true, bessKw: 60, bessKwh: 61 }]));
assert.deepEqual(Object.assign({}, qa.solar.byMount), { ground: 324, roof: 0, canopy: 176 }, 'the page sends kW by mount, never a price');   /* copied out of the vm realm */ count++;
var ra = EC.rollup(qa), rs = EC.rollup(qs);
assert.equal(ra.lines.solar.rows[0].mount, 'ground'); assert.equal(ra.lines.solar.rows[1].mount, 'canopy'); assert.equal(ra.lines.solar.rows[1].rate, 2.75); count += 3;
assert.equal(ra.totals.solar, 324e3 * 1.98 + 176e3 * 2.75, 'the traced canopy priced as a canopy beside a ground array'); count++;
assert.deepEqual(rs.lines.solar, ra.lines.solar, 'the Omega-Core skid changes nothing about the solar'); assert.equal(qs.dc.pods, 0); count += 2;
/* the skid IS in the Run total (2026-10-14): each at the recorded system price (the skid + the controller built in), no contingency, never ITC energy property; the collector counts it */
var OC = require(path.join(ROOT, 'api/_lib/omega-core')).PRODUCT;
assert.equal(qs.omegaCore.skids, 1, 'the page counts the skids'); assert.equal(qa.omegaCore.skids, 0); count += 2;
assert.equal(rs.lines.omegaCore.total, OC.systemCostUsd); assert.equal(rs.lines.omegaCore.total, 764000, '$639,000 as recorded + the $125,000 NextNRG Microgrid Controller'); assert.equal(rs.lines.omegaCore.breakdown.length, 2); count += 3;
assert.equal(rs.totals.total, ra.totals.total + 764000, 'the Run total carries the skid at its recorded price, with no contingency on it'); assert.equal(rs.totals.noContingency, 764000); count += 2;
assert.equal(rs.totals.itcBasis, ra.totals.itcBasis, 'the skid is never the host\'s energy property'); assert.equal(rs.totals.itcExcluded, ra.totals.itcExcluded + 764000); count += 2;
var two = EC.rollup({ omegaCore: { skids: 2 } }); assert.equal(two.totals.total, 2 * 764000, 'two skids alone are in scope at twice the price'); assert.equal(two.totals.inScope, true); count += 2;
assert.match(ed, /q\.solar=\{ byMount:\(typeof omegaSolarByMount==='function'\)\?omegaSolarByMount\(\):null,/); assert.match(ed, /LN\.solar\.rows\|\|\[\]/); assert.match(ed, /_omRow\('Solar \$\/W'/); count += 3;
/* a kW-DC set by hand on an array (2026-10-14): one rule, run at every recompute; blank = the layout's own figure */
var ko = cut('_derApplyKwOverride'), kc = vm.createContext({});
vm.runInContext(ko, kc);
var shA = vm.runInContext('var a={kw:100}; _derApplyKwOverride(a, 123.44); a', kc);
assert.equal(shA.kw, 123.4); assert.equal(shA.kwAuto, 123.4); assert.equal('kwOverride' in shA, false, 'no hand figure: the layout\'s own, to a tenth'); count += 3;
var shB = vm.runInContext('var b={kw:100, kwOverride:490}; _derApplyKwOverride(b, 123.4); b', kc);
assert.equal(shB.kw, 490, 'the hand figure holds through a refill'); assert.equal(shB.kwAuto, 123.4, 'and the layout\'s own is kept beside it'); count += 2;
var shC = vm.runInContext('var c={kw:490, kwOverride:0}; _derApplyKwOverride(c, 77); c', kc);
assert.equal(shC.kw, 77); assert.equal('kwOverride' in shC, false, 'cleared goes back to the layout\'s own'); count += 2;
assert.match(cut('_solarRecalcAll'), /_derApplyKwOverride\(sh, L\.kw\)/, 'the rectangle recalc runs it'); count++;
assert.match(ed.slice(ed.indexOf('  function relayout(sh, opts) {')), /_derApplyKwOverride\(sh, L\.kw\)/, 'the traced relayout runs it'); count++;
assert.match(ed, /field\('kW-DC \\u2014 set by hand \(blank = the layout/, 'the array editor offers it'); assert.match(ed, /if \(kwSet > 0\) sh\.kwOverride = kwSet; else delete sh\.kwOverride;/, 'and Apply writes or clears it'); count += 2;
/* the Results rail prints the drawing's own products at their prices (2026-10-14): NextNRG's system at its $/W, the Omega-Core skids, the controller — the server's lines as published */
var rail = ed.slice(ed.indexOf("fi += _omRow('Total install'"), ed.indexOf("_omSet('rr-b-fin', fi);"));
assert.match(rail, /_omRow\('NextNRG solar \+ storage \('\+Math\.round\(\+_nnL\.solarKwDc\|\|0\)/, 'the NextNRG system row'); assert.match(rail, /window\._OMEGACORE_DETAIL/, 'the skid row reads the published line'); assert.match(rail, /_omRow\('Omega-Core skid'/, 'and prints it'); assert.match(rail, /_omRow\('NextNRG Microgrid Controller'/, 'the controller row'); count += 4;
assert.match(ed, /window\._OMEGACORE_TOTAL = T\.omegaCore \|\| 0; window\._OMEGACORE_DETAIL = LN\.omegaCore \|\| null;/, 'the cost render publishes the skid line'); count++;
/* NextNRG's storage is told by the catalog key behind the display name, the make, or a model named NextNRG's (2026-10-14: a NextNRG 1,000 kWh pad keyed by its model name ran at the container rate, $144k with contingency, against the $1.5M its 250 kW is at NextNRG's $6.00/W) */
function collectFleet(byModel, catalog) {
  var S3 = { bessList: [], elements: [], shapes: [], conduits: [], pxPerFt: 10, costOverrides: {}, omegaSizing: {} };
  var c3 = { S: S3, window: {}, document: { getElementById: function () { return null; }, activeElement: null }, BESS_CATALOG: catalog,
    $v: function () { return undefined; }, JSON: JSON, Object: Object, Math: Math, Promise: Promise, String: String, Number: Number, RegExp: RegExp,
    _ppCollectFleet: function () { return { units: Object.keys(byModel).length, byModel: byModel }; }, _vendorOverrides: function () { return {}; }, omegaBessFleet: function () { return { kwh: 1000, kw: 250 }; },
    omegaSolarKwDc: function () { return 0; }, omegaDer: function () { return { solarKwDc: 0, windKw: 0, altKw: 0 }; }, bnzAll: function () { return { capex: 0 }; }, OMEGA_PRICE_BASIS: 'cost' };
  vm.createContext(c3);
  vm.runInContext(cut('_costSheetValues') + cut('_evQuantities') + cut('omegaSolarByMount') + cut('omegaCostQuantities') + '\nthis.q = omegaCostQuantities();', c3);
  return c3.q;
}
var CAT = { 'NEXTNRG-SAFT-IFLEX-3400': { mfr: 'NextNRG', nextnrg: true, kwh: 3400 }, 'GOTION-EDGE-760': { mfr: 'Gotion', kwh: 760 } };
var qf = collectFleet({ 'NextNRG Microgrid Storage \u2014 Saft Intensium Flex 3.4 MWh block (LFP)': { qty: 1, kwh: 3400, kw: 850, cost: null, catalogKey: 'NEXTNRG-SAFT-IFLEX-3400', mfr: 'NextNRG' },
  'NextNRG Model 1': { qty: 1, kwh: 1000, kw: 250, cost: null, catalogKey: null, mfr: '' }, 'Gotion EDGE 760 kWh C&I': { qty: 1, kwh: 760, kw: 380, cost: null, catalogKey: 'GOTION-EDGE-760', mfr: 'Gotion' } }, CAT);
var fm = JSON.parse(JSON.stringify(qf.fleet.byModel));
assert.equal(fm['NextNRG Microgrid Storage \u2014 Saft Intensium Flex 3.4 MWh block (LFP)'].nextnrg, true, 'the catalog block placed under its display name is NextNRG\'s by the key behind it'); count++;
assert.equal(fm['NextNRG Model 1'].nextnrg, true, 'a product named NextNRG\'s (a library product, a guided build) is NextNRG\'s'); assert.equal(fm['Gotion EDGE 760 kWh C&I'].nextnrg, false, 'a Gotion is not'); count += 2;
assert.equal(fm['Gotion EDGE 760 kWh C&I'].catalogKey, 'GOTION-EDGE-760', 'the catalog key rides to the server behind the display name'); count++;
var rf = EC.rollup(qf);
var nnRow = rf.lines.bess.rows.filter(function (r) { return r.key === 'NextNRG Model 1'; })[0], gRow = rf.lines.bess.rows.filter(function (r) { return /Gotion/.test(r.key); })[0];
assert.equal(nnRow.total, 250 * 1000 * 6, 'the 1,000 kWh / 250 kW NextNRG unit alone is $1,500,000 at $6.00 a watt'); assert.equal(nnRow.nextnrgRate, true); assert.equal(nnRow.install, 0, 'labor inside'); count += 3;
assert.equal(gRow.total, Math.round(84740 * 1.55), 'the Gotion beside it is priced off its catalog key, not its display name'); count++;
assert.match(ed, /var cKey=s\.catalogKey\|\|null;/, 'the fleet collector carries the catalog key of each group'); assert.match(ed, /\/\^nextnrg\\b\/i\.test\(String\(k\)\)/, 'and the quantities read the name'); count += 2;
console.log('teditorcost (solar by mount): ' + count + ' assertions passed');
