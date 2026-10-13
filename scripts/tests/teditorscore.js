#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Site Map's screening scorers run on the server (api/_lib/editor-score.js
 * behind POST /api/editor-score; 2026-10-13, editor IP audit items 3–4).
 * Holds the engine against the page's former arithmetic, the gate, the page
 * carrying no tier, weight or curve, and the page's own wrappers cut out and
 * run under a fake sign-in and fetch. */
'use strict';
var assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.join(__dirname, '../..'), count = 0;
function read(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }
var ES = require(path.join(ROOT, 'api/_lib/editor-score'));

/* pre-qualification */
var p = ES.prequal({ propertyAreaSf: 50000, buildingFootprintSf: 20000, parkingSpaces: 0, pins: 1, zoningOk: true, floodOk: true, hostingCapacityKw: 1200 });
assert.equal(p.availableSf, 30000); assert.equal(p.fullScore, 100); assert.equal(p.tier, 'Priority Go'); assert.equal(p.capacity.level, 'good'); assert.equal(p.recommend.size, 'full'); count += 5;
assert.equal(p.system.full.label, 'Benchmark: 1 MW / 3.5 MWh'); assert.ok(!('areaTiers' in p.system.full), 'the tiers never leave the server'); count += 2;
var q = ES.prequal({ propertyAreaSf: 3000, parkingSpaces: 5, pins: 2, system: { kw: 380, kwh: 760, footprintFt2: 900 } });
assert.equal(q.fullScore, 71); assert.equal(q.halfScore, 71); assert.equal(q.tier, 'Conditional — Capacity Pending'); assert.equal(q.system.full.label, 'Configured System'); assert.equal(q.system.half.kw, 190); count += 5;
var h = ES.prequal({ propertyAreaSf: 2500, parkingSpaces: 0, pins: 1, zoningOk: true, floodOk: true, hostingCapacityKw: 600 });
assert.equal(h.fullScore, 65); assert.equal(h.halfScore, 100, 'the half system fits the pad'); assert.equal(h.recommend.size, 'half'); assert.equal(h.capacity.level, 'ok'); assert.equal(h.tier, 'Priority Go'); count += 5;
assert.equal(ES.prequal({ propertyAreaSf: 50000, hostingCapacityKw: 100 }).tier, 'Hold — Grid Constraint'); assert.equal(ES.prequal({}).tier, 'Incomplete — property area required'); count += 2;
assert.equal(ES.prequal({ propertyAreaSf: 1400, parkingSpaces: 9, pins: 3 }).tier, 'Hold / Needs Review'); count++;

/* interconnection */
var i = ES.interconnect({ zip: '60601', state: 'IL', sysKW: 760, footprintFt2: 900, facts: { gridAtlas: { nearestSubstationKm: 1.4, nearestSubstationKv: 138 } } });
assert.equal(i.score, 3.4); assert.equal(i.pct, 69); assert.equal(i.iso, 'PJM'); assert.equal(i.utility, 'ComEd (Northern Illinois)'); assert.equal(i.evidencePct, 39); count += 5;
assert.deepEqual(i.factors.map(function (f) { return f.key + ':' + f.score + '/' + f.source; }), ['utility:70/data', 'capacity:80/proxy', 'permit:60/estimate', 'queue:62/estimate', 'land:65/estimate']); count++;
assert.ok(!('weight' in i.factors[0]), 'the weights never leave the server'); count++;
var j = ES.interconnect({ zip: '', state: 'TX', sysKW: 3000, facts: { hostingCapacityKW: 7000, ahjPermitDays: 20, iqQueueMonths: 4, parcelAcres: 5 }, footprintFt2: 5000 });
assert.equal(j.iso, 'ERCOT'); assert.equal(j.utilityEstimated, true, 'a state alone is an estimate'); assert.equal(j.factors[1].score, 95); assert.equal(j.factors[2].score, 92); assert.equal(j.factors[3].score, 90); assert.equal(j.factors[4].score, 92); count += 6;
assert.equal(j.evidencePct, 72, 'every fact but the utility is data'); count++;
var k = ES.interconnect({});
assert.equal(k.iso, 'OTHER'); assert.equal(k.utility, ''); assert.match(k.factors[0].detail, /add the site ZIP/); assert.equal(k.factors[1].score, 55); count += 4;
assert.equal(ES.isoForState('CA'), 'CAISO'); assert.equal(ES.isoForState('ZZ'), 'OTHER'); count += 2;

/* the endpoint */
var ep = read('api/editor-score.js');
assert.match(ep, /req\.method !== 'POST'/); assert.match(ep, /A\.authenticate\(req\)/); assert.match(ep, /caller\.orgId \|\| caller\.staff/); assert.match(ep, /ES\.prequal\(b\)/); assert.match(ep, /ES\.interconnect\(b\)/); count += 5;

/* the page */
var ed = read('editor.html');
['areaTiers', '_pqAreaScore', '_pqTier(', 'PJM:62', 'ratio>=2 ? 95', 'weight:0.28', "score>=85 ? 'Priority Go'", '_km<=0.8 ? 92', 'PQ_SYSTEMS'].forEach(function (t) { assert.ok(ed.indexOf(t) < 0, 'a scoring table or rule is still in the page: ' + t); count++; });
assert.match(ed, /fetch\('\/api\/editor-score', \{ method:'POST'/); count++;
assert.match(ed, /if\(r\.pending\) r\.promise\.then\(function\(\)\{ renderScorePanel\(\); \}/); count++;
assert.match(ed, /if\(r\.pending\)\{\n    window\._PQ_LATEST=null;/); count++;
assert.match(ed, /'<strong>Recommended: '\+r\.system\[r\.recommend\.size\]\.label/); count++;

/* the page's wrappers under a fake sign-in and fetch, into the real engine */
function cut(name) { var s = ed.indexOf('function ' + name + '('), e2 = ed.indexOf('\n}\n', s); assert.ok(s > 0 && e2 > s, name); return ed.slice(s, e2 + 3); }
var calls = [];
var ctx = { S: { bessList: [{ kw: 380, kwh: 760, qty: 1 }] }, window: { _SITE_DATA: { gridAtlas: { nearestSubstationKm: 1.4, nearestSubstationKv: 138 } } },
  document: { getElementById: function (id) { return id === 'addr-in' ? { value: '123 Main St, Chicago, IL 60601' } : null; } },
  _estBessFootprintFt2: function () { return 900; }, _ixSiteLocation: function () { return { zip: '60601', state: 'IL' }; },
  JSON: JSON, Object: Object, Math: Math, Promise: Promise, String: String, Number: Number,
  fetch: function (url, opts) { var b = JSON.parse(opts.body); calls.push(b); assert.equal(opts.headers.Authorization, 'Bearer tok'); return Promise.resolve({ ok: true, json: function () { return Promise.resolve(b.action === 'prequal' ? ES.prequal(b) : ES.interconnect(b)); } }); } };
ctx.window.firebase = { auth: function () { return { currentUser: { getIdToken: function () { return Promise.resolve('tok'); } } }; } };
ctx.firebase = ctx.window.firebase;
vm.createContext(ctx);
vm.runInContext('var _SCORE_CACHE = {};\n' + cut('_scoreRequest') + cut('_pqSystemFacts') + cut('computeSitePreQual') + cut('computeInterconnectScore') + '\nthis.a = computeInterconnectScore(); this.b = computeSitePreQual({ propertyAreaSf: 3000, parkingSpaces: 5, pins: 2 });', ctx);
assert.equal(ctx.a.pending, true); assert.equal(ctx.b.pending, true); count += 2;
Promise.all([ctx.a.promise, ctx.b.promise]).then(function (rs) {
  assert.equal(calls.length, 2); assert.equal(calls[0].action, 'interconnect'); assert.equal(calls[0].zip, '60601'); assert.equal(calls[0].facts.gridAtlas.nearestSubstationKm, 1.4); count += 4;
  assert.equal(calls[1].action, 'prequal'); assert.deepEqual(calls[1].system, { kw: 380, kwh: 760, footprintFt2: 900 }); count += 2;
  assert.ok(!/weight|areaTiers/.test(JSON.stringify(calls)), 'facts go up, never a rule'); count++;
  assert.equal(rs[0].pct, 69); assert.equal(rs[1].fullScore, 71); count += 2;
  vm.runInContext('this.a2 = computeInterconnectScore(); this.b2 = computeSitePreQual({ propertyAreaSf: 3000, parkingSpaces: 5, pins: 2 });', ctx);
  assert.equal(ctx.a2.pending, undefined); assert.equal(ctx.a2.pct, 69); assert.equal(ctx.b2.tier, 'Conditional — Capacity Pending'); assert.equal(calls.length, 2, 'cached: no second request'); count += 4;
  console.log('teditorscore: ' + count + ' assertions passed');
}).catch(function (e) { console.error(e); process.exit(1); });

/* ── the Viability Workflow's judgment ───────────────────────────────── */
var V = ES.viability({ data: { p0_avail_area: '600', p0_peak_kw: '250', p0_avg_bill: '12000', p0_bldg_clearance: '20', p0_site_control: 'owned', p0_utility: 'comed',
  ck_address: '1', ck_utility: '1', ck_site_control: '1', ck_zoning_cert: '1', ck_title: '1', ck_bills: '1', ck_clearance: '1', ck_fire_access: 'na', ck_comed_moratorium: '1',
  p2_offset_load: 'Yes', p2_rebate: 'Yes', p6_demand: '40000', p6_vpp: '15000', p7_bess: '84740', p7_pcs: '45000', p7_eng: '18000', p7_om: '4500', p7_itc_pct: '30' },
  ftm: false, txTsps: ['oncor'], scores: { p1: 'pass' } });
assert.equal(V.p1.finalScore, 100); assert.equal(V.p1.verdict, 'PASS'); assert.equal(V.p1.mustPct, 100); assert.equal(V.p1.factors.length, 5); count += 4;
assert.equal(V.btm, 65); assert.equal(V.ftm, 0); assert.equal(V.rev, 55000); count += 3;
assert.equal(Math.round(V.fin.gross), 162514); assert.equal(Math.round(V.fin.net), 113760); assert.equal(+V.fin.pb.toFixed(2), 2.25); assert.equal(V.fin.decision, 'invest'); assert.ok(V.fin.irr > 0.44 && V.fin.irr < 0.45); count += 5;
assert.equal(V.decision.dec, 'invest'); count++;
var V2 = ES.viability({ data: { p0_avail_area: '80', p0_utility: 'duke', p0_flood: '1', ord_aldermanic: '1', ord_gas_meter: '1' }, scores: { p1: 'fail', p2: 'fail' } });
assert.deepEqual(V2.p1.dq, ['Utility territory not in target market', 'FEMA floodplain risk flagged', 'Available area <100 sq ft (too small)']); count++;
assert.equal(V2.p1.ordPenalty, 40); assert.equal(V2.p1.verdict, 'FAIL'); assert.equal(V2.decision.dec, 'reject'); assert.equal(V2.fin.decision, 'pending'); assert.equal(V2.fin.irr, null, 'no root reads undefined, never 0%'); count += 5;
var V3 = ES.viability({ data: { p4_export_mw: '150', p4_gentie_mi: '0.5', p0_avail_area: '5000', p0_bldg_clearance: '30', p0_site_control: 'long_lease', p0_utility: 'oncor', p4_tsp: 'oncor', p4_poi: 'x' }, ftm: true, txTsps: ['oncor'], scores: {} });
assert.equal(V3.p1.factors[1].l, 'POI export capacity'); assert.equal(V3.p1.rawScore, 100); assert.deepEqual(V3.p1.dq, []); assert.equal(V3.p1.verdict, 'FAIL', 'the checklist is empty, so no PASS'); assert.equal(V3.ftm, 15); count += 5;
assert.equal(ES.viability({ data: {}, scores: { p1: 'pass', p2: 'pending' } }).decision.dec, 'hold'); count++;
['finalScore>=75', 'pb<=7&&npv>0', "s+=30;", 'fails>=2', 'ordKills*30', "PEAK>=200?25"].forEach(function (t) { assert.ok(ed.indexOf(t) < 0, 'a workflow rule is still in the page: ' + t); count++; });
assert.match(ed, /function _vwJudge\(\)\{\n  var body = \{ data: VW\.data \|\| \{\}, ftm:/); assert.match(ed, /return _scoreRequest\('viability', body\);/); count += 2;
assert.match(ed, /if\(_vwPending\(J, el, calcP1\)\) return;/); assert.match(ed, /if\(_vwPending\(J, el, calcFin\)\) return;/); assert.match(ed, /function calcBTM\(\)\{ return _vwPathScores\(\)\.btm; \}/); count += 3;
console.log('teditorscore (viability): assertions added');
