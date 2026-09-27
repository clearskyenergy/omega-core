#!/usr/bin/env node
/* scripts/test-plant-work.js — steps at a bench, parts issued per unit, and
   the gate that keeps a half-built unit off the next bench
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Three layers, offline:
     1 · api/_lib/plant-work.js — steps come off the product's bill, a step
         completes when its parts are issued, a unit cannot leave with a step
         open.
     2 · api/_lib/plant.js — judgeScan refuses the NEXT bench while work is
         open at the current one.
     3 · api/mes-scan.js — issue / step-done move stock off the shelf, onto
         the unit and onto the works order; idempotent by scanId; the
         materials plan then stops demanding what was issued.

   node scripts/test-plant-work.js */
'use strict';
var assert = require('node:assert/strict');
var W = require('../api/_lib/plant-work'), P = require('../api/_lib/plant'), M = require('../api/_lib/materials');
/* api/_lib/admin.js needs firebase-admin; nothing here does. The mock goes
   in before anything that requires it (logic-catalog, the endpoint). */
var db = null;
var A = { /* the same shape rule as api/_lib/admin.js safeOrg (the plant door reads the org record by it) */ safeOrg: function (v) { var x = String(v == null ? '' : v).trim().toLowerCase(); return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(x) ? x : ''; }, db: function () { return db; }, httpError: function (s, m) { var e = new Error(m); e.status = s; return e; }, handler: function (f) { return f; },
  FieldValue: function () { return { serverTimestamp: function () { return 'ts'; } }; } };
function mock(p, e) { require.cache[require.resolve(p)] = { id: require.resolve(p), filename: require.resolve(p), loaded: true, exports: e }; }
mock('../api/_lib/admin', A);
var pass = 0, fail = 0;
function ok(label, yes, detail) {
  console.log('  ' + (yes ? 'PASS' : 'FAIL') + '  ' + label + (detail !== undefined && !yes ? '  got: ' + JSON.stringify(detail) : ''));
  if (yes) pass++; else fail++;
}

var CATALOG = [
  { sku: 'CAB', name: 'Cabinet', kind: 'product', bom: [
      { sku: 'MOD', qty: 2, unit: 'ea', station: 'rack', step: '1 · Fit modules' },
      { sku: 'BMS', qty: 1, unit: 'ea', station: 'bms', step: 'Fit BMS' },
      { sku: 'ENC', qty: 1, unit: 'ea', station: 'encl' },
      { sku: 'HARN', qty: 2.5, unit: 'm', station: 'rack', step: '2 · Harness' },
      { sku: 'LABEL', qty: 1, unit: 'ea' } ] },
  { sku: 'MOD', name: 'Module', kind: 'component', unit: 'ea', bom: [{ sku: 'CELL', qty: 16, unit: 'ea', station: 'module', step: 'Fit cells' }] },
  { sku: 'CELL', name: 'LFP cell', kind: 'component', unit: 'ea', supplierSku: 'LF280K' },
  { sku: 'BMS', name: 'Master BMS', kind: 'component', unit: 'ea' },
  { sku: 'ENC', name: 'Enclosure', kind: 'component', unit: 'ea' },
  { sku: 'HARN', name: 'Harness', kind: 'component', unit: 'm' },
  { sku: 'LABEL', name: 'Rating label', kind: 'component', unit: 'ea' }
];
var by = {}; CATALOG.forEach(function (p) { by[p.sku] = p; });
var R = P.DEFAULT_ROUTING;
function unit(at, extra) { var u = { serial: 'CC-1', sku: 'CAB', at: at || '', done: {}, hold: null, work: {} }; Object.keys(extra || {}).forEach(function (k) { u[k] = extra[k]; }); return u; }

console.log('\nsteps come off the bill of materials');
(function () {
  var steps = W.stepsFor(by.CAB, 'rack', by);
  ok('two steps at Rack assembly, in bill order', steps.length === 2 && steps[0].name === '1 · Fit modules' && steps[1].name === '2 · Harness', steps);
  ok('  each with its parts and the catalog name', steps[0].parts[0].sku === 'MOD' && steps[0].parts[0].name === 'Module' && steps[0].parts[0].qty === 2 && steps[1].parts[0].unit === 'm');
  ok('a line with no step name lands in the default step', W.stepsFor(by.CAB, 'encl', by)[0].name === W.DEFAULT_STEP);
  ok('a line with no station is on no bench', !W.stepsFor(by.CAB, 'kit', by).length && !W.stepsFor(by.CAB, 'pack', by).length);
  ok('a part is matched by its SKU or the supplier part number', W.stepsFor(by.MOD, 'module', by)[0].parts[0].codes.join(',') === 'cell,lf280k');
  ok('the stations that have work for a product', W.stationsWithWork(by.CAB, R, by).join(',') === 'rack,encl,bms');
  ok('no product, no steps', W.stepsFor(null, 'rack', by).length === 0);
})();

console.log('\nissuing parts');
(function () {
  var u = unit('rack'), steps = W.stepsFor(by.CAB, 'rack', by);
  var v = W.judgeIssue(u, 'rack', R, steps, 'mod');
  ok('scanning a part code issues the line quantity for this unit', v.ok && v.action === 'issue' && v.sku === 'MOD' && v.qty === 2 && v.stepDone === true, v);
  u.work.rack = W.applyIssue(u, 'rack', v, '2026-09-22T10:00:00Z', 'LOT-A');
  var st = W.statusOf(u, 'rack', steps);
  ok('  the step is done, the lot is on the unit, the other step is open', st.steps[0].done && st.steps[0].parts[0].lot === 'LOT-A' && !st.steps[1].done && st.open.join() === '2 · Harness' && !st.complete, st);
  v = W.judgeIssue(u, 'rack', R, steps, 'MOD');
  ok('issuing it again is a duplicate, not a second issue', v.ok && v.action === 'duplicate', v);
  v = W.judgeIssue(u, 'rack', R, steps, 'HARN', 1);
  ok('a partial quantity is allowed', v.ok && v.qty === 1 && v.stepDone === false, v);
  u.work.rack = W.applyIssue(u, 'rack', v, '2026-09-22T10:01:00Z', '');
  v = W.judgeIssue(u, 'rack', R, steps, 'HARN', 2);
  ok('  but not more than the line still needs', !v.ok && v.reason === 'over_issue' && /1\.5 m/.test(v.say), v);
  v = W.judgeIssue(u, 'rack', R, steps, 'HARN');
  ok('  and the default is exactly the remainder', v.ok && v.qty === 1.5 && v.stepDone, v);
  u.work.rack = W.applyIssue(u, 'rack', v, '2026-09-22T10:02:00Z', 'LOT-B');
  ok('now the bench is complete', W.statusOf(u, 'rack', steps).complete);
  v = W.judgeIssue(u, 'rack', R, steps, 'CELL');
  ok('a part that is not on this bench for this product is refused', !v.ok && v.reason === 'not_a_part', v);
  v = W.judgeIssue(unit('encl'), 'rack', R, steps, 'MOD');
  ok('a unit at another bench cannot be issued to here', !v.ok && v.reason === 'not_here' && /Enclosure/.test(v.say), v);
  v = W.judgeIssue(unit('rack', { hold: 'NCR-1' }), 'rack', R, steps, 'MOD');
  ok('a unit on hold takes nothing', !v.ok && v.reason === 'on_hold', v);
  v = W.judgeIssue(unit('rack'), 'rack', R, [], 'MOD');
  ok('a bench with no work for the product says so', !v.ok && v.reason === 'no_work', v);
  ok('the material trace sums every station', JSON.stringify(W.issuedTotals(u)) === '{"MOD":2,"HARN":2.5}', W.issuedTotals(u));
})();

console.log('\na check-only step');
(function () {
  var prod = { sku: 'X', bom: [{ sku: 'BMS', qty: 1, station: 'bms', step: 'Fit BMS' }] };
  var steps = W.stepsFor(prod, 'bms', by), u = unit('bms', { sku: 'X' });
  var v = W.judgeStepDone(u, 'bms', R, steps, 'fit-bms');
  ok('a step with parts cannot be confirmed around them', !v.ok && v.reason === 'parts_open' && /1 ea Master BMS/.test(v.say), v);
  u.work.bms = W.applyIssue(u, 'bms', W.judgeIssue(u, 'bms', R, steps, 'bms'), 'now', '');
  v = W.judgeStepDone(u, 'bms', R, steps, 'fit-bms');
  ok('  once issued it is already done', v.ok && v.action === 'duplicate', v);
  /* A step that is pure work — no parts — comes from a zero-part line? No:
     it is any step name the operator confirms. Model one via statusOf on a
     hand-built step list, as the endpoint would for a routing check. */
  var checks = [{ id: 'torque', name: 'Torque busbars', parts: [] }];
  v = W.judgeStepDone(unit('bms'), 'bms', R, checks, 'torque');
  ok('a step with no parts is confirmed with one tap', v.ok && v.action === 'step-done', v);
  var done = W.applyStepDone(unit('bms'), 'bms', v, 'now');
  ok('  and recorded with a time', done.done.torque === 'now');
})();

console.log('\ncheck-only steps come off the routing');
(function () {
  var Flow = require('../api/_lib/plant-flow');
  var flow = Flow.normalize({ routing: R.map(function (s) { return s.key === 'bms' ? { key: s.key, label: s.label, checks: 'Load firmware\n Torque busbars \n\n' } : s; }) });
  var bms = flow.routing.filter(function (s) { return s.key === 'bms'; })[0];
  ok('the flow keeps them, one per line, trimmed', bms.checks.join('|') === 'Load firmware|Torque busbars', bms.checks);
  ok('  and an operation without any has an empty list', flow.routing[0].checks.length === 0);
  var steps = W.stepsFor(by.CAB, 'bms', by, bms.checks);
  ok('at the bench they follow the parts steps and apply to every product', steps.length === 3 && steps[0].name === 'Fit BMS' && steps[1].check === true && steps[2].id === 'check-torque-busbars', steps);
  var u = unit('bms');
  var st = W.statusOf(u, 'bms', steps);
  ok('all three are open on a fresh unit', st.open.length === 3);
  u.work.bms = W.applyIssue(u, 'bms', W.judgeIssue(u, 'bms', R, steps, 'BMS'), 'now', '');
  u.work.bms = W.applyStepDone(u, 'bms', W.judgeStepDone(u, 'bms', R, steps, 'check-load-firmware'), 'now');
  st = W.statusOf(u, 'bms', steps);
  ok('one part issued and one check confirmed leaves one open', st.open.join() === 'Torque busbars' && !st.complete, st.open);
  ok('a product with no parts at a bench still gets the checks', W.stepsFor(by.MOD, 'bms', by, bms.checks).length === 2);
})();

console.log('\nthe gate: a unit cannot leave a bench with a step open');
(function () {
  var u = unit('rack'), steps = W.stepsFor(by.CAB, 'rack', by), st = W.statusOf(u, 'rack', steps);
  var v = P.judgeScan(u, 'encl', R, { open: st.open });
  ok('the next bench refuses and names what is open', !v.ok && v.reason === 'work_open' && /Rack assembly/.test(v.say) && /Fit modules/.test(v.say) && v.open.length === 2, v);
  ok('the strip still says where it is', v.at === 'rack');
  u.work.rack = W.applyIssue(u, 'rack', W.judgeIssue(u, 'rack', R, steps, 'MOD'), 'now', '');
  u.work.rack = W.applyIssue(u, 'rack', W.judgeIssue(u, 'rack', R, steps, 'HARN'), 'now', '');
  v = P.judgeScan(u, 'encl', R, { open: W.statusOf(u, 'rack', steps).open });
  ok('with both steps done it advances', v.ok && v.action === 'advance' && v.to === 'encl', v);
  v = P.judgeScan(unit('kit'), 'module', R, { open: [] });
  ok('a bench with no steps never gates', v.ok && v.action === 'advance');
  v = P.judgeScan(unit('rack'), 'rack', R, { open: ['x'] });
  ok('a re-scan at the same bench is still a duplicate, never a refusal', v.ok && v.action === 'duplicate');
  v = P.judgeScan(unit('rack'), 'pack', R, { open: ['x'] });
  ok('out of sequence is still the first answer when the bench is wrong', !v.ok && v.reason === 'work_open' || v.reason === 'out_of_sequence');
})();

console.log('\none gate for every caller, and the lines no bench issues');
(function () {
  var wo = { routing: R.map(function (s) { return s.key === 'bms' ? { key: 'bms', label: s.label, checks: ['Load firmware'] } : s; }) };
  var u = unit('bms');
  ok('openAt: what is open where the unit IS, parts and the routing\'s checks', W.openAt(u, wo, by).join('|') === 'Fit BMS|Load firmware', W.openAt(u, wo, by));
  ok('  nothing for a unit that has not started, or has no product on file', W.openAt(unit(''), wo, by).length === 0 && W.openAt(unit('bms', { sku: 'NOPE' }), wo, by).join() === 'Load firmware');
  ok('catalogIndex drops prototype keys and non-rows', Object.keys(W.catalogIndex([{ sku: '__proto__' }, null, { sku: 'A' }])).join() === 'A');
  var flushed = W.backflush(by.CAB, unit('ready', { work: { rack: { issued: { MOD: 2, HARN: 2.5 } }, bms: { issued: { BMS: 1 } } } }), R);
  ok('backflush: only the lines no bench issues — the unstationed label, the unissued enclosure is at a bench so it is not', flushed.map(function (l) { return l.sku + ':' + l.qty; }).join() === 'LABEL:1', flushed);
  ok('  a station that is not on the routing counts as no bench', W.backflush({ bom: [{ sku: 'X', qty: 3, station: 'weld' }] }, unit('ready'), R).map(function (l) { return l.sku + ':' + l.qty; }).join() === 'X:3');
  ok('  and what a bench already issued is not taken twice', W.backflush({ bom: [{ sku: 'X', qty: 3 }] }, unit('ready', { work: { kit: { issued: { X: 1 } } } }), R)[0].qty === 2);
  ok('unstationed: per assembly, the lines no bench on the routing issues', JSON.stringify(W.unstationed(CATALOG, R).map(function (p) { return p.sku + ':' + p.lines.map(function (l) { return l.sku; }).join('+'); })) === '["CAB:LABEL"]', W.unstationed(CATALOG, R));
})();

console.log('\nthe materials plan stops demanding what was issued');
(function () {
  var plain = [{ sku: 'CAB', name: 'Cabinet', kind: 'product', bom: [{ sku: 'BMS', qty: 1, unit: 'ea', station: 'bms' }, { sku: 'ENC', qty: 1, unit: 'ea' }] },
    { sku: 'BMS', name: 'BMS', kind: 'component', unit: 'ea' }, { sku: 'ENC', name: 'Enclosure', kind: 'component', unit: 'ea' }];
  function row(p, s) { return p.rows.filter(function (r) { return r.sku === s; })[0]; }
  var p = M.plan({ now: '2026-09-22', products: plain, works: [{ id: 'w', orderNo: 'W', status: 'released', requirements: [{ sku: 'CAB', qty: 3 }], registeredCounts: { CAB: 2 } }] });
  ok('three ordered, two started: one whole cabinet plus the parts of two', row(p, 'CAB').gross.committed === 1 && row(p, 'BMS').gross.committed === 3 && row(p, 'ENC').gross.committed === 3, [row(p, 'CAB').gross, row(p, 'BMS').gross]);
  p = M.plan({ now: '2026-09-22', products: plain, works: [{ id: 'w', orderNo: 'W', status: 'released', requirements: [{ sku: 'CAB', qty: 3 }], registeredCounts: { CAB: 2 }, issued: { BMS: 1 } }] });
  ok('one BMS issued at the bench: two still demanded', row(p, 'BMS').gross.committed === 2 && row(p, 'ENC').gross.committed === 3, row(p, 'BMS').gross);
  p = M.plan({ now: '2026-09-22', products: plain, works: [{ id: 'w', orderNo: 'W', status: 'released', requirements: [{ sku: 'CAB', qty: 3 }], registeredCounts: { CAB: 2 }, readyCounts: { CAB: 1 }, issued: { BMS: 2, ENC: 1 } }] });
  ok('a finished unit took its whole bill; the open one is netted against the rest', row(p, 'BMS').gross.committed === 1 && row(p, 'ENC').gross.committed === 2, [row(p, 'BMS').gross, row(p, 'ENC').gross]);
  var d = M.demandsFrom({ products: plain, works: [{ id: 'w', orderNo: 'W', status: 'released', requirements: [{ sku: 'CAB', qty: 1 }], registeredCounts: { CAB: 1 }, issued: { BMS: 5 } }] });
  ok('over-issue never produces negative demand', d.filter(function (x) { return x.sku === 'BMS'; }).length === 0 && d.filter(function (x) { return x.sku === 'ENC'; })[0].qty === 1, d);
})();

console.log('\nthe bill of materials carries the station and the step');
(function () {
  var lines = M.bomLines([{ sku: 'BMS', qty: 1, station: 'bms', step: 'Fit BMS' }, { sku: 'ENC', qty: 1 }]);
  ok('kept when given, absent when not', lines[0].station === 'bms' && lines[0].step === 'Fit BMS' && !('station' in lines[1]) && !('step' in lines[1]), lines);
  var threw = null; try { M.bomLines([{ sku: 'BMS', qty: 1, station: 'Bad Key' }]); } catch (e) { threw = e; }
  ok('a station must be a routing key', threw && /routing station key/.test(threw.message), threw && threw.message);
  threw = null; try { M.bomLines([{ sku: 'BMS', qty: 1, step: 'Fit' }]); } catch (e) { threw = e; }
  ok('a step needs its station', threw && /needs the station/.test(threw.message), threw && threw.message);
  var C = require('../api/_lib/logic-catalog');
  ok('the catalog view carries both to the editor', C.view({ sku: 'CAB', kind: 'product', bom: [{ sku: 'BMS', qty: 1, station: 'bms', step: 'Fit BMS' }] }).bom[0].step === 'Fit BMS');
})();

/* ── the endpoint ──────────────────────────────────────────────────────── */
console.log('\nthe endpoint — issue and step-done');
(async function () {
  function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  function merge(a, b) { Object.keys(b).forEach(function (k) { a[k] = (a[k] && typeof a[k] === 'object' && !Array.isArray(a[k]) && b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) ? merge(a[k], b[k]) : clone(b[k]); }); return a; }
  var rows = new Map();
  function Ref(p) { this.path = p; this.id = p.split('/').pop(); }
  Ref.prototype.collection = function (n) { return new Col(this.path + '/' + n); };
  Ref.prototype.get = async function () { var d = rows.get(this.path); return { exists: d !== undefined, id: this.id, data: function () { return clone(d); } }; };
  function Col(p) { this.path = p; }
  Col.prototype.doc = function (id) { return new Ref(this.path + '/' + id); };
  db = { collection: function (n) { return new Col(n); }, runTransaction: function (fn) { var writes = []; return Promise.resolve(fn({
    get: function (r) { return r.get(); },
    set: function (r, v, o) { writes.push(function () { rows.set(r.path, o && o.merge ? merge(clone(rows.get(r.path) || {}), v) : clone(v)); }); },
    update: function (r, v) { writes.push(function () { assert(rows.has(r.path), 'update of missing ' + r.path); rows.set(r.path, merge(clone(rows.get(r.path)), v)); }); },
    create: function (r, v) { writes.push(function () { assert(!rows.has(r.path)); rows.set(r.path, clone(v)); }); }
  })).then(function (out) { writes.forEach(function (w) { w(); }); return out; }); } };
  var S = require('../api/_lib/plant-station');
  var api = require('../api/mes-scan');
  var res = { setHeader: function () {} };
  var TOKEN = 'tok-rack', ORG = 'cleancell.us';
  rows.set('plant_stations/st-rack', { orgId: ORG, station: 'rack', label: 'Bay 2 · Rack', tokenHash: S.sha(TOKEN), active: true });
  rows.set('plant_stations/st-encl', { orgId: ORG, station: 'encl', label: 'Enclosure', tokenHash: S.sha('tok-encl'), active: true });
  rows.set('omega_orgs/' + ORG + '/storefront/config', { products: CATALOG });
  rows.set('omega_orgs/' + ORG + '/fulfillment/materials', { stock: { MOD: { onHand: 10 }, HARN: { onHand: 1 } }, revision: 4 });
  rows.set('plant_works_orders/wo1', { orgId: ORG, orderNo: 'CC-9', status: 'released', requirements: [{ sku: 'CAB', qty: 1 }], registeredCounts: { CAB: 1 }, routing: R });
  rows.set('plant_units/' + ORG + '__CC-1', { orgId: ORG, serial: 'CC-1', sku: 'CAB', shipUnit: true, woId: 'wo1', at: 'encl', done: {}, hold: null });
  function call(body) { return api({ method: 'POST', body: Object.assign({ stationId: 'st-rack', token: TOKEN }, body) }, res); }

  var r = await call({ scanId: 's1', serial: 'CC-1' });
  ok('a unit at Enclosure re-scanned at Rack is already past', !r.ok && r.reason === 'already_past', r);
  rows.set('plant_units/' + ORG + '__CC-1', { orgId: ORG, serial: 'CC-1', sku: 'CAB', shipUnit: true, woId: 'wo1', at: 'module', done: {}, hold: null });
  r = await call({ scanId: 's2', serial: 'CC-1' });
  ok('arriving at Rack returns this bench\'s steps for the unit', r.ok && r.action === 'advance' && r.work && r.work.steps.length === 2 && r.work.open.length === 2 && r.work.steps[0].parts[0].remaining === 2, r.work);
  r = await api({ method: 'POST', body: { stationId: 'st-encl', token: 'tok-encl', scanId: 's3', serial: 'CC-1' } }, res);
  ok('the next bench refuses it while the steps are open', !r.ok && r.reason === 'work_open' && r.work && r.work.station === 'rack', r);
  r = await call({ scanId: 'i1', serial: 'CC-1', action: 'issue', code: 'MOD', lot: 'LOT-7' });
  ok('scanning the module code issues two modules', r.ok && r.action === 'issue' && r.work.steps[0].done && r.work.steps[0].parts[0].lot === 'LOT-7', r);
  ok('  the shelf lost two', rows.get('omega_orgs/' + ORG + '/fulfillment/materials').stock.MOD.onHand === 8 && rows.get('omega_orgs/' + ORG + '/fulfillment/materials').revision === 5, rows.get('omega_orgs/' + ORG + '/fulfillment/materials'));
  ok('  the works order knows', rows.get('plant_works_orders/wo1').issued.MOD === 2, rows.get('plant_works_orders/wo1').issued);
  ok('  the unit carries the record', rows.get('plant_units/' + ORG + '__CC-1').work.rack.issued.MOD === 2 && rows.get('plant_units/' + ORG + '__CC-1').work.rack.lots.MOD === 'LOT-7');
  ok('  and the event is in the log with its kind', rows.get('plant_scans/' + ORG + '__i1').kind === 'issue' && rows.get('plant_scans/' + ORG + '__i1').sku === 'MOD');
  var again = await call({ scanId: 'i1', serial: 'CC-1', action: 'issue', code: 'MOD' });
  ok('replaying the same scanId changes nothing', again.replayed === true && rows.get('omega_orgs/' + ORG + '/fulfillment/materials').stock.MOD.onHand === 8, again);
  r = await call({ scanId: 'i2', serial: 'CC-1', action: 'issue', code: 'harn' });
  ok('a harness the shelf does not have is still issued, and the bench is told', r.ok && r.stockShort === true && /shelf count/.test(r.say) && rows.get('omega_orgs/' + ORG + '/fulfillment/materials').stock.HARN.onHand === 0, r);
  r = await call({ scanId: 'i3', serial: 'CC-1', action: 'issue', code: 'CELL' });
  ok('a cell is not a part of this bench', !r.ok && r.reason === 'not_a_part', r);
  r = await call({ scanId: 'i4', serial: 'CC-1', action: 'step-done', stepId: '2-harness' });
  ok('the harness step is already done by its issue', r.ok && r.action === 'duplicate', r);
  r = await api({ method: 'POST', body: { stationId: 'st-encl', token: 'tok-encl', scanId: 's4', serial: 'CC-1' } }, res);
  ok('with both steps done the next bench accepts it', r.ok && r.action === 'advance' && r.work && r.work.steps[0].name === W.DEFAULT_STEP, r);
  r = await call({ scanId: 'i5', serial: 'CC-1', action: 'issue', code: 'MOD' });
  ok('and Rack can no longer issue to it', !r.ok && r.reason === 'not_here', r);
  var pl = M.plan({ now: '2026-09-22', products: CATALOG, stock: rows.get('omega_orgs/' + ORG + '/fulfillment/materials').stock, works: [rows.get('plant_works_orders/wo1')] });
  var mod = pl.rows.filter(function (x) { return x.sku === 'MOD'; })[0];
  ok('the plan no longer demands the issued modules', mod.gross.committed === 0, mod.gross);
  ok('  but still the BMS and enclosure', pl.rows.filter(function (x) { return x.sku === 'BMS'; })[0].gross.committed === 1);

  console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
