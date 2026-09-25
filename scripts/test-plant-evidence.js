#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/test-plant-evidence.js — test evidence, the open-step gate, parts
   no bench issues, finished stock and a serial typed wrong
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The endpoints against the in-memory Firestore double (scripts/_lib/
   firestore-double.js). No network.
     1 · api/mes-test-result.js — a rig's pass never skips a step still open
         at the bench it leaves (PLANT-03); a supervisor (owner|admin) may
         record PASS or FAIL by hand with a note, stored where the rig's
         result is, marked manual, audited, through the SAME gate (D3); a
         member may not.
     2 · api/mes-scan.js — a shipping unit reaching Ready takes the bill
         lines no bench issues off the shelf and onto the works order
         (PLANT-07); the bench is told the order number, not wo_… (PLANT-15).
     3 · api/logic-plant.js — page=stock counts every finished unit by state,
         not the first 100 documents, shipping units only (PLANT-08, F2);
         correct-serial voids or corrects a serial typed wrong, frees its
         slot, audited (PLANT-12), and a corrected COMPONENT leaves its
         assembly so the cabinet still ships (F1);
         canControl says who may use the hold and test controls (PLANT-16).

   node scripts/test-plant-evidence.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var assert = require('node:assert/strict');
var FD = require('./_lib/firestore-double'), DB = FD.DB, mock = FD.mock;
var db;
var A = { db: function () { return db; }, safeOrg: function (v) { return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v || '') ? v : ''; },
  httpError: function (s, m) { var e = new Error(m); e.status = s; return e; }, handler: function (f) { return f; },
  authenticate: async function (r) { if (!r.caller) throw A.httpError(401, 'Sign in'); return r.caller; },
  canActInOrg: async function (c, o) { return c.staff || c.orgId === o; }, isTenantAdmin: async function (c, o) { return c.staff || c.orgId === o; },
  FieldValue: function () { return { serverTimestamp: function () { return 'TS'; }, arrayUnion: function () { return Array.prototype.slice.call(arguments); } }; } };
mock('../api/_lib/admin', A);
var P = require('../api/_lib/plant'), S = require('../api/_lib/plant-station'), W = require('../api/_lib/plant-work'), M = require('../api/_lib/materials');
var testResult = require('../api/mes-test-result'), scan = require('../api/mes-scan'), plant = require('../api/logic-plant');

var ORG = 'cleancell.us', R = P.DEFAULT_ROUTING.map(function (s) { return s.key === 'bms' ? { key: s.key, label: s.label, checks: ['Load firmware'] } : { key: s.key, label: s.label }; });
var ADMIN = { uid: 'adm', email: 'lead@cleancell.us', orgId: ORG, staff: false, claims: { email_verified: true } };
var MEMBER = { uid: 'mem', email: 'builder@cleancell.us', orgId: ORG, staff: false, claims: { email_verified: true } };
var OWNER = { uid: 'tom', email: 'tom@clearsky-usa.com', orgId: 'clearsky-usa.com', staff: true, claims: { email_verified: true } };
var CATALOG = [
  { sku: 'CAB', name: 'Cabinet', kind: 'product', bom: [{ sku: 'BMS', qty: 1, unit: 'ea', station: 'bms', step: 'Fit BMS' }, { sku: 'LABEL', qty: 2, unit: 'ea' }, { sku: 'BOLT', qty: 8, unit: 'ea', station: 'weld' }] },
  { sku: 'BMS', name: 'Master BMS', kind: 'component', unit: 'ea' }, { sku: 'LABEL', name: 'Rating label', kind: 'component', unit: 'ea' }, { sku: 'BOLT', name: 'Bolt', kind: 'component', unit: 'ea' }
];
var res = { setHeader: function () {} };
var pass = 0;
async function test(name, fn) { await fn(); pass++; console.log('  PASS  ' + name); }
async function rejects(p, status, re) { try { await p; } catch (e) { assert.equal(e.status, status, e.message); if (re) assert.match(e.message, re); return e; } throw new Error('expected a ' + status); }
function unit(serial, extra) { return Object.assign({ orgId: ORG, serial: serial, sku: 'CAB', unitType: 'cabinet', shipUnit: true, rootSerial: serial, parentSerial: null, woId: 'wo_1', orderId: null, inventoryStatus: 'building', at: 'bms', done: {}, hold: null, ncr: null, test: null, work: {} }, extra); }
function seed() {
  db = new DB();
  db.seed('omega_orgs/' + ORG, { name: 'Clean Cell', status: 'active' });
  db.seed('omega_orgs/' + ORG + '/billing/current', { addons: ['omega-logic'] });
  db.seed('omega_orgs/' + ORG + '/fulfillment/config', { enabled: true, accounting: 'tenant' });
  db.seed('omega_orgs/' + ORG + '/members/adm', { role: 'admin', status: 'active' });
  db.seed('omega_orgs/' + ORG + '/members/mem', { role: 'member', status: 'active' });
  db.seed('omega_orgs/' + ORG + '/storefront/config', { products: CATALOG });
  db.seed('omega_orgs/' + ORG + '/fulfillment/materials', { stock: { LABEL: { onHand: 10 }, BMS: { onHand: 5 } }, revision: 2 });
  db.seed('plant_works_orders/wo_1', { orgId: ORG, orderNo: 'CC-26-9001', status: 'released', routing: R, requirements: [{ sku: 'CAB', qty: 3 }], registeredCounts: { CAB: 2 }, releasedUnits: 2, shippingUnitCount: 2, createdAt: 1 });
  db.seed('plant_stations/rig', { orgId: ORG, station: 'eol', machine: true, tokenHash: S.sha('rig-token'), active: true, label: 'EOL rig' });
  db.seed('plant_stations/pack', { orgId: ORG, station: 'ready', tokenHash: S.sha('ready-token'), active: true, label: 'Dispatch' });
}
/* the handlers throw a validation error before they return a promise */
function later(fn) { return Promise.resolve().then(fn); }
function rig(body) { return later(function () { return testResult({ method: 'POST', body: Object.assign({ stationId: 'rig', token: 'rig-token' }, body) }, res); }); }
function byHand(body, caller) { return later(function () { return testResult({ method: 'POST', body: Object.assign({ manual: true, org: ORG, station: 'eol' }, body), caller: caller === undefined ? ADMIN : caller }, res); }); }
function office(req) { return later(function () { return plant(req, res); }); }
function u(serial) { return db.data.get('plant_units/' + ORG + '__' + serial); }
function audits(action) { return Array.from(db.data.entries()).filter(function (e) { return e[0].indexOf('omega_audit/') === 0 && e[1].action === action; }).map(function (e) { return e[1]; }); }

(async function () {
  console.log('\ntest evidence at EOL: the rig, and a supervisor by hand');
  await test('PLANT-03: a rig pass is refused while a step is open at the bench the unit leaves, and the refusal is on the ledger', async function () {
    seed(); db.seed('plant_units/' + ORG + '__UNIT-01', unit('UNIT-01'));
    var r = await rig({ scanId: 'e1', serial: 'UNIT-01', result: 'pass' });
    assert.equal(r.ok, false); assert.equal(r.reason, 'work_open'); assert.match(r.say, /Fit BMS/); assert.match(r.say, /Load firmware/);
    assert.equal(u('UNIT-01').at, 'bms', 'the unit did not move'); assert.equal(u('UNIT-01').test, null, 'no pass on the traveler');
    var ev = db.data.get('plant_scans/' + ORG + '__e1'); assert.equal(ev.ok, false); assert.equal(ev.test.result, 'pass'); assert.equal(ev.test.source, 'machine');
  });
  await test('  with every step at BMS done the same rig pass advances to EOL', async function () {
    var done = u('UNIT-01'); done.work = { bms: { issued: { BMS: 1 }, lots: {}, done: { 'fit-bms': 'T', 'check-load-firmware': 'T' } } }; db.seed('plant_units/' + ORG + '__UNIT-01', done);
    var r = await rig({ scanId: 'e2', serial: 'UNIT-01', result: 'pass', measurements: { insulationMohm: 500 } });
    assert.equal(r.ok, true); assert.equal(r.action, 'advance'); assert.equal(u('UNIT-01').at, 'eol'); assert.equal(u('UNIT-01').test.source, 'machine'); assert.equal(u('UNIT-01').test.measurements.insulationMohm, 500);
  });
  await test('  a bench token cannot use the hand-recorded prefix', async function () {
    await rejects(rig({ scanId: 'manual_abcdefgh', serial: 'UNIT-01', result: 'pass' }), 400, /reserved/);
  });
  await test('D3: a member cannot record a result by hand; nor can someone signed out', async function () {
    seed(); db.seed('plant_units/' + ORG + '__UNIT-02', unit('UNIT-02', { work: { bms: { issued: { BMS: 1 }, done: { 'fit-bms': 'T', 'check-load-firmware': 'T' } } } }));
    await rejects(byHand({ serial: 'UNIT-02', result: 'pass', note: 'Hipot 1.5 kV OK, bench meter 7', actionId: 'act-0001' }, MEMBER), 403, /administrator/);
    await rejects(byHand({ serial: 'UNIT-02', result: 'pass', note: 'Hipot 1.5 kV OK', actionId: 'act-0002' }, null), 401);
    assert.equal(u('UNIT-02').at, 'bms'); assert.equal(u('UNIT-02').test, null);
  });
  await test('  the note is the evidence: under five characters is refused, and only a test station takes it', async function () {
    await rejects(byHand({ serial: 'UNIT-02', result: 'pass', note: 'ok', actionId: 'act-0003' }), 400, /at least 5/);
    await rejects(byHand({ serial: 'UNIT-02', result: 'pass', note: 'Torque checked', actionId: 'act-0004', station: 'qa' }), 400, /test station/);
    await rejects(byHand({ serial: 'UNIT-02', result: 'maybe', note: 'Torque checked', actionId: 'act-0005' }), 400, /pass or fail/);
  });
  await test('  an admin records a PASS: stored as test evidence, source manual, by, at, note; the unit moves exactly one station; audited', async function () {
    var r = await byHand({ serial: 'UNIT-02', result: 'pass', note: 'EOL tester offline; insulation 520 MΩ on the bench meter', actionId: 'act-0006', measurements: { insulationMohm: 520 } });
    assert.equal(r.ok, true); assert.equal(r.action, 'advance'); assert.equal(u('UNIT-02').at, 'eol'); assert.equal(u('UNIT-02').done.bms !== undefined, true);
    var t = u('UNIT-02').test; assert.equal(t.source, 'manual'); assert.equal(t.result, 'pass'); assert.equal(t.by, 'lead@cleancell.us'); assert.match(t.note, /bench meter/); assert.ok(t.at); assert.equal(t.station, 'eol');
    var ev = db.data.get('plant_scans/' + ORG + '__manual_act-0006'); assert.equal(ev.manual, true); assert.equal(ev.machine, false); assert.equal(ev.by, 'lead@cleancell.us'); assert.equal(ev.stationId, null);
    var a = audits('plant-manual-test'); assert.equal(a.length, 1); assert.equal(a[0].by, 'lead@cleancell.us'); assert.equal(a[0].result, 'pass'); assert.equal(a[0].before.at, 'bms');
    assert.ok(!JSON.stringify(ev).includes('undefined'));
  });
  await test('  the same actionId again is a replay, not a second advance; a different result under it is refused', async function () {
    var r = await byHand({ serial: 'UNIT-02', result: 'pass', note: 'EOL tester offline; insulation 520 MΩ on the bench meter', actionId: 'act-0006', measurements: { insulationMohm: 520 } });
    assert.equal(r.replayed, true); assert.equal(u('UNIT-02').at, 'eol'); assert.equal(audits('plant-manual-test').length, 1);
    await rejects(byHand({ serial: 'UNIT-02', result: 'fail', note: 'changed my mind', actionId: 'act-0006' }), 409);
  });
  await test('  a hand-recorded pass meets the SAME open-step gate as the rig', async function () {
    db.seed('plant_units/' + ORG + '__UNIT-03', unit('UNIT-03'));
    var r = await byHand({ serial: 'UNIT-03', result: 'pass', note: 'Firmware loaded from the laptop', actionId: 'act-0007' });
    assert.equal(r.ok, false); assert.equal(r.reason, 'work_open'); assert.equal(u('UNIT-03').at, 'bms'); assert.equal(u('UNIT-03').test, null);
    assert.equal(audits('plant-manual-test').length, 2, 'the refused attempt is audited too');
  });
  await test('  an admin records a FAIL: the unit holds at its bench, and a later pass (rig or by hand) is the retest', async function () {
    db.seed('plant_units/' + ORG + '__UNIT-04', unit('UNIT-04', { work: { bms: { issued: { BMS: 1 }, done: { 'fit-bms': 'T', 'check-load-firmware': 'T' } } } }));
    var r = await byHand({ serial: 'UNIT-04', result: 'fail', note: 'Cell 14 reads 3.1 V, rest 3.3 V', actionId: 'act-0008', failureCode: 'cell_low' });
    assert.equal(r.ok, false); assert.equal(r.action, 'hold'); assert.equal(u('UNIT-04').at, 'bms'); assert.equal(u('UNIT-04').hold, 'CELL_LOW'); assert.equal(u('UNIT-04').test.source, 'manual');
    var scanAt = P.judgeScan(u('UNIT-04'), 'qa', R); assert.equal(scanAt.ok, false, 'no scan moves a failed unit');
  });
  await test('UX-10: a failure code typed with spaces is stored with underscores; one a code cannot hold is refused in words, before anything is written', async function () {
    db.seed('plant_units/' + ORG + '__UNIT-06', unit('UNIT-06', { work: { bms: { issued: { BMS: 1 }, done: { 'fit-bms': 'T', 'check-load-firmware': 'T' } } } }));
    var r = await byHand({ serial: 'UNIT-06', result: 'fail', note: 'Insulation below limit on the bench meter', actionId: 'act-0010', failureCode: 'low insulation' });
    assert.equal(r.action, 'hold'); assert.equal(u('UNIT-06').test.failureCode, 'LOW_INSULATION'); assert.equal(u('UNIT-06').hold, 'LOW_INSULATION');
    db.seed('plant_units/' + ORG + '__UNIT-07', unit('UNIT-07'));
    var e = await rejects(byHand({ serial: 'UNIT-07', result: 'fail', note: 'Insulation below limit on the bench meter', actionId: 'act-0011', failureCode: 'low/insulation' }), 400, /^The failure code may use letters, digits, dot, dash and underscore only/);
    assert.ok(!/failureCode/.test(e.message), 'never the field\'s key'); assert.equal(u('UNIT-07').test, null);
  });
  await test('UX-11: the bench that refuses a failed unit says where a supervisor records the retest by hand', function () {
    var failed = unit('UNIT-X', { at: 'bms', test: { result: 'fail', source: 'machine' } });
    ['eol', 'qa'].forEach(function (st) { var v = P.judgeScan(failed, st, R); assert.equal(v.reason, 'retest_required'); assert.match(v.say, /supervisor recording it by hand in the Plant app/); assert.ok(!/passing machine retest/.test(v.say)); });
    assert.match(P.judgeScan(unit('UNIT-Y', { at: 'bms' }), 'eol', R).say, /records the result by hand in the Plant app/);
    var bench = require('fs').readFileSync(require('path').join(__dirname, '..', 'plant', 'station.html'), 'utf8');
    assert.ok(!/test results must come from the paired rig/.test(bench)); assert.match(bench, /Machine station: test results come from the paired rig\. With the rig down, a supervisor records the result by hand in the Plant app/);
  });
  await test('  the ClearSky owner may record by hand in any workspace', async function () {
    db.seed('plant_units/' + ORG + '__UNIT-05', unit('UNIT-05', { work: { bms: { issued: { BMS: 1 }, done: { 'fit-bms': 'T', 'check-load-firmware': 'T' } } } }));
    var r = await byHand({ serial: 'UNIT-05', result: 'pass', note: 'Witnessed the tester run on site', actionId: 'act-0009' }, OWNER);
    assert.equal(r.ok, true); assert.equal(u('UNIT-05').test.by, 'tom@clearsky-usa.com');
  });
  await test('  the work-order feed says a result was recorded by hand, and by whom', async function () {
    var B = require('../api/_lib/plant-board'), feed = B.activity([u('UNIT-02')], { routing: R }, 10), t = feed.filter(function (e) { return e.kind === 'test'; })[0];
    assert.match(t.say, /recorded by hand/); assert.equal(t.by, 'lead@cleancell.us');
  });

  console.log('\nparts no bench issues come off the shelf at Ready');
  await test('PLANT-07: a shipping unit reaching Ready takes its bench-less lines off the shelf and onto the works order', async function () {
    seed();
    db.seed('plant_units/' + ORG + '__UNIT-09', unit('UNIT-09', { at: 'pack', done: { kit: 'T' }, work: { bms: { issued: { BMS: 1 }, lots: {}, done: {} } } }));
    var r = await scan({ method: 'POST', body: { stationId: 'pack', token: 'ready-token', scanId: 'r1', serial: 'UNIT-09' } }, res);
    assert.equal(r.ok, true); assert.equal(r.action, 'advance'); assert.equal(u('UNIT-09').at, 'ready');
    var st = db.data.get('omega_orgs/' + ORG + '/fulfillment/materials');
    assert.equal(st.stock.LABEL.onHand, 8, 'two labels (no station) taken');
    assert.equal(st.stock.BMS.onHand, 5, 'the BMS was issued at its bench, not again');
    assert.equal(st.stock.BOLT.onHand, 0, 'a line whose station is not on the routing is taken too; the shelf was short');
    assert.equal(st.revision, 3);
    var wo = db.data.get('plant_works_orders/wo_1'); assert.equal(wo.readyCounts.CAB, 1); assert.equal(wo.issued.LABEL, 2); assert.equal(wo.issued.BOLT, 8);
    assert.deepEqual(u('UNIT-09').backflushed, { LABEL: 2, BOLT: 8 }); assert.deepEqual(r.backflushed.short, ['BOLT']);
    assert.equal(r.workOrderNo, 'CC-26-9001', 'the bench names the order, never wo_…');
    var ev = db.data.get('plant_scans/' + ORG + '__r1'); assert.equal(ev.backflush.length, 2); assert.equal(ev.workOrderNo, 'CC-26-9001');
  });
  await test('  the plan agrees: nothing is demanded twice, and the shelf is no longer high by what was built', async function () {
    var st = db.data.get('omega_orgs/' + ORG + '/fulfillment/materials'), wo = Object.assign({ id: 'wo_1' }, db.data.get('plant_works_orders/wo_1'));
    var pl = M.plan({ now: '2026-09-24', products: CATALOG, stock: st.stock, works: [wo] });
    var label = pl.rows.filter(function (x) { return x.sku === 'LABEL'; })[0];
    /* one not started (2) + one started, unfinished (2) = 4 labels; the finished unit's two are gone from the shelf */
    assert.equal(label.gross.committed, 4); assert.equal(label.onHand, 8);
  });
  await test('  a replayed Ready scan takes nothing twice; a component reaching Ready takes nothing', async function () {
    await scan({ method: 'POST', body: { stationId: 'pack', token: 'ready-token', scanId: 'r1', serial: 'UNIT-09' } }, res);
    assert.equal(db.data.get('omega_orgs/' + ORG + '/fulfillment/materials').stock.LABEL.onHand, 8);
    db.seed('plant_units/' + ORG + '__MOD-0001', unit('MOD-0001', { shipUnit: false, sku: 'CAB', at: 'pack', parentSerial: 'UNIT-09', rootSerial: 'UNIT-09' }));
    await scan({ method: 'POST', body: { stationId: 'pack', token: 'ready-token', scanId: 'r2', serial: 'MOD-0001' } }, res);
    assert.equal(db.data.get('omega_orgs/' + ORG + '/fulfillment/materials').stock.LABEL.onHand, 8);
  });
  await test('  the warning lists every line no bench issues, per assembly', function () {
    var list = W.unstationed(CATALOG, R);
    assert.equal(list.length, 1); assert.equal(list[0].sku, 'CAB'); assert.deepEqual(list[0].lines.map(function (l) { return l.sku + ':' + (l.station || '-'); }), ['LABEL:-', 'BOLT:weld']);
    assert.equal(W.unstationed([{ sku: 'X', bom: [{ sku: 'Y', qty: 1, station: 'rack' }] }], R).length, 0);
  });

  console.log('\nfinished stock, counted by state');
  await test('PLANT-08: page=stock counts every finished unit, not the first 100 documents by id', async function () {
    seed();
    for (var i = 0; i < 120; i++) db.seed('plant_units/' + ORG + '__A' + String(i).padStart(4, '0'), unit('A' + String(i).padStart(4, '0'), { at: 'kit', woId: 'wo_1' }));
    for (var j = 0; j < 7; j++) db.seed('plant_units/' + ORG + '__Z' + j, unit('Z' + j, { at: 'ready', inventoryStatus: 'available', woId: 'stock_1' }));
    db.seed('plant_units/' + ORG + '__Z9', unit('Z9', { at: 'ready', inventoryStatus: 'available', hold: 'dent' }));
    for (var k = 0; k < 3; k++) db.seed('plant_units/' + ORG + '__Y' + k, unit('Y' + k, { at: 'ready', inventoryStatus: 'allocated', orderId: 'o1' }));
    db.seed('plant_units/' + ORG + '__V1', unit('V1', { inventoryStatus: 'void', woId: null }));
    var first100 = await office({ method: 'GET', query: { org: ORG, page: 'units' }, caller: MEMBER });
    assert.equal(first100.rows.filter(function (x) { return x.inventoryStatus === 'available'; }).length, 0, 'the old read never saw the shelf');
    var d = await office({ method: 'GET', query: { org: ORG, page: 'stock' }, caller: MEMBER });
    assert.deepEqual(d.totals, { available: 7, held: 1, assigned: 3, building: 120 });
    assert.equal(d.skus[0].sku, 'CAB'); assert.equal(d.available.length, 7); assert.equal(d.limited.available, false);
  });
  await test('F2: page=stock counts shipping units only — a workspace\'s modules never use up a state\'s cap and undercount the cabinets', async function () {
    seed();
    /* 60 cabinets on orders with 17 modules each: 1,080 'allocated' components, stored first (Firestore returns an equality query in id order) */
    for (var c = 0; c < 60; c++) for (var m = 0; m < 17; m++) db.seed('plant_units/' + ORG + '__A-MOD-' + c + '-' + m, unit('A-MOD-' + c + '-' + m, { shipUnit: false, unitType: 'module', sku: 'MOD', parentSerial: 'Z-CAB-' + c, rootSerial: 'Z-CAB-' + c, inventoryStatus: 'allocated', orderId: 'o1' }));
    for (var z = 0; z < 60; z++) db.seed('plant_units/' + ORG + '__Z-CAB-' + z, unit('Z-CAB-' + z, { inventoryStatus: 'allocated', orderId: 'o1' }));
    var d = await office({ method: 'GET', query: { org: ORG, page: 'stock' }, caller: MEMBER });
    assert.equal(d.totals.assigned, 60, 'every cabinet on an order is counted'); assert.equal(d.limited.allocated, false, 'and the count is not truncated');
    assert.equal(d.skus.filter(function (g) { return g.sku === 'CAB'; })[0].assigned, 60);
  });
  await test('  the Plant app says "at least" for every count in a state that was read to the cap, not only a product that reached it', function () {
    var app = require('fs').readFileSync(require('path').join(__dirname, '..', 'plant', 'app.html'), 'utf8');
    var src = /function n\(k, v\) \{[^}]*\}/.exec(app); assert.ok(src, 'the count wording');
    var n = new Function('lim', 'cap', src[0] + '; return n;')({ allocated: true, available: false }, 1000);
    assert.equal(n('allocated', 59), 'at least 59'); assert.equal(n('available', 3), '3');
  });

  console.log('\na serial typed wrong');
  await test('PLANT-12: an admin voids a mistyped serial; its slot is free, the record stays, marked void, audited', async function () {
    seed();
    db.seed('plant_units/' + ORG + '__BAD1BAD2', unit('BAD1BAD2', { at: '', woId: 'wo_1' }));
    await rejects(office({ method: 'POST', body: { org: ORG, action: 'correct-serial', serial: 'BAD1BAD2', reason: 'two labels in one', requestId: 'c1' }, caller: MEMBER }), 403);
    await rejects(office({ method: 'POST', body: { org: ORG, action: 'correct-serial', serial: 'BAD1BAD2', reason: 'x', requestId: 'c1' }, caller: ADMIN }), 400, /Say why/);
    var r = await office({ method: 'POST', body: { org: ORG, action: 'correct-serial', serial: 'BAD1BAD2', reason: 'two labels in one', requestId: 'c1' }, caller: ADMIN });
    assert.equal(r.ok, true); assert.equal(u('BAD1BAD2').inventoryStatus, 'void'); assert.equal(u('BAD1BAD2').woId, null); assert.equal(u('BAD1BAD2').voided.by, 'lead@cleancell.us');
    var wo = db.data.get('plant_works_orders/wo_1'); assert.equal(wo.registeredCounts.CAB, 1); assert.equal(wo.releasedUnits, 1); assert.equal(wo.shippingUnitCount, 1);
    assert.equal(audits('plant-serial-void').length, 1); assert.equal(audits('plant-serial-void')[0].before.registeredCounts.CAB, 2);
    assert.equal((await office({ method: 'POST', body: { org: ORG, action: 'correct-serial', serial: 'BAD1BAD2', reason: 'two labels in one', requestId: 'c1' }, caller: ADMIN })).duplicate, true);
    await rejects(office({ method: 'POST', body: { org: ORG, action: 'correct-serial', serial: 'BAD1BAD2', reason: 'again please', requestId: 'c2' }, caller: ADMIN }), 409, /already voided/);
  });
  await test('  a voided serial scanned at a bench is refused, never started', async function () {
    db.seed('plant_stations/kit', { orgId: ORG, station: 'kit', tokenHash: S.sha('kit-token'), active: true, label: 'Kitting' });
    var r = await scan({ method: 'POST', body: { stationId: 'kit', token: 'kit-token', scanId: 'k1', serial: 'BAD1BAD2' } }, res);
    assert.equal(r.ok, false); assert.equal(r.reason, 'voided'); assert.equal(u('BAD1BAD2').at, '');
  });
  await test('  corrected: the right serial takes the slot with its components; counts do not move', async function () {
    db.seed('plant_units/' + ORG + '__CC4180001X', unit('CC4180001X', { at: '', woId: 'wo_1' }));
    db.seed('plant_units/' + ORG + '__MOD-A', unit('MOD-A', { at: '', shipUnit: false, unitType: 'module', parentSerial: 'CC4180001X', rootSerial: 'CC4180001X' }));
    db.seed('plant_units/' + ORG + '__CELL-A', unit('CELL-A', { at: '', shipUnit: false, unitType: 'cell', parentSerial: 'MOD-A', rootSerial: 'CC4180001X' }));
    await rejects(office({ method: 'POST', body: { org: ORG, action: 'correct-serial', serial: 'CC4180001X', reason: 'typo in the label', requestId: 'c3' }, caller: ADMIN }), 409, /component/);
    var before = db.data.get('plant_works_orders/wo_1').registeredCounts.CAB;
    var r = await office({ method: 'POST', body: { org: ORG, action: 'correct-serial', serial: 'CC4180001X', replacement: 'CC418-0001', reason: 'typo in the label', requestId: 'c4' }, caller: ADMIN });
    assert.equal(r.replacement, 'CC418-0001'); assert.equal(r.components, 1);
    assert.equal(u('CC418-0001').woId, 'wo_1'); assert.equal(u('CC418-0001').correctedFrom, 'CC4180001X'); assert.equal(u('CC418-0001').rootSerial, 'CC418-0001'); assert.equal(u('CC418-0001').at, '');
    assert.equal(u('MOD-A').parentSerial, 'CC418-0001'); assert.equal(u('MOD-A').rootSerial, 'CC418-0001'); assert.equal(u('CELL-A').rootSerial, 'CC418-0001'); assert.equal(u('CELL-A').parentSerial, 'MOD-A');
    assert.equal(db.data.get('plant_works_orders/wo_1').registeredCounts.CAB, before);
    assert.equal(u('CC4180001X').voided.replacedBy, 'CC418-0001'); assert.equal(audits('plant-serial-correct').length, 1);
  });
  await test('  a unit the floor has seen is evidence: it cannot be voided', async function () {
    db.seed('plant_units/' + ORG + '__SEEN-1', unit('SEEN-1', { at: 'kit', done: {} }));
    await rejects(office({ method: 'POST', body: { org: ORG, action: 'correct-serial', serial: 'SEEN-1', reason: 'typo in the label', requestId: 'c5' }, caller: ADMIN }), 409, /evidence/);
    db.seed('plant_units/' + ORG + '__TAKEN-1', unit('TAKEN-1', { at: '' }));
    await rejects(office({ method: 'POST', body: { org: ORG, action: 'correct-serial', serial: 'TAKEN-1', replacement: 'SEEN-1', reason: 'typo in the label', requestId: 'c6' }, caller: ADMIN }), 409, /already registered/);
  });

  console.log('\nwho may use the controls');
  await test('PLANT-16: the serial record and the lists say whether this person may hold, test by hand or correct', async function () {
    var a = await office({ method: 'GET', query: { org: ORG, serial: 'TAKEN-1' }, caller: ADMIN });
    var m = await office({ method: 'GET', query: { org: ORG, serial: 'TAKEN-1' }, caller: MEMBER });
    assert.equal(a.canControl, true); assert.equal(m.canControl, false); assert.equal(a.correctable, true);
    assert.equal(a.routing.filter(function (s) { return s.machine; }).map(function (s) { return s.key; }).join(), 'eol');
    assert.equal((await office({ method: 'GET', query: { org: ORG }, caller: MEMBER })).canControl, false);
    assert.equal((await office({ method: 'GET', query: { org: ORG, page: 'board' }, caller: OWNER })).canControl, true);
  });


  console.log('\na serial typed wrong on a component (F1)');
  /* F1: the typo is usually a COMPONENT's label (it cannot be scanned), and
     the voided record must leave the assembly — otherwise every reader of
     the family (the pickup check, the office's allocate, the automatic
     allocation of finished stock) still counts it */
  await test('F1: correcting a component takes the typo out of its assembly: the genealogy, and the cabinet\'s pickup', async function () {
    seed();
    db.seed('orders/ord1', { orgId: ORG, orderNo: 'CC-1', status: 'in_fulfilment', worksOrderId: 'wo_o1', items: [{ sku: 'CAB', qty: 1 }],
      logic: { releasedAt: 't', acceptedAt: 't', invoices: { deposit: { amountCents: 10, satisfied: true }, balance: { amountCents: 90, satisfied: true } } },
      delivery: { revision: 0, destinations: [{ id: 'a', items: [{ sku: 'CAB', qty: 1 }] }], legs: [] } });
    db.seed('plant_works_orders/wo_o1', { orgId: ORG, orderId: 'ord1', orderNo: 'CC-1', status: 'awaiting_serials', requirements: [{ sku: 'CAB', qty: 1 }], registeredCounts: {}, releasedUnits: 0, shippingUnitCount: 0, createdAt: 1 });
    await office({ method: 'POST', body: { org: ORG, action: 'register', workOrderId: 'wo_o1', requestId: 'reg1', units: [{ serial: 'ROOT-1', sku: 'CAB', unitType: 'cabinet', shipUnit: true }, { serial: 'MODX-TYPO', sku: 'MOD', unitType: 'module', parentSerial: 'ROOT-1' }] }, caller: ADMIN });
    assert.equal(u('MODX-TYPO').rootSerial, 'ROOT-1');
    await office({ method: 'POST', body: { org: ORG, action: 'correct-serial', serial: 'MODX-TYPO', replacement: 'MODX-0001', reason: 'typo on the module label', requestId: 'cm1' }, caller: ADMIN });
    var gone = u('MODX-TYPO');
    assert.equal(gone.inventoryStatus, 'void'); assert.equal(gone.rootSerial, 'MODX-TYPO', 'its own root: out of the family'); assert.equal(gone.parentSerial, null);
    assert.equal(gone.voided.rootSerial, 'ROOT-1'); assert.equal(gone.voided.parentSerial, 'ROOT-1', 'where it sat is kept for the audit');
    var fam = (await db.collection('plant_units').where('orgId', '==', ORG).where('rootSerial', '==', 'ROOT-1').get()).docs.map(function (d) { return d.id.split('__')[1]; }).sort();
    assert.deepEqual(fam, ['MODX-0001', 'ROOT-1']);
    var g = await office({ method: 'GET', query: { org: ORG, serial: 'ROOT-1' }, caller: ADMIN }); assert.deepEqual(g.genealogy.map(function (x) { return x.serial; }).sort(), ['MODX-0001', 'ROOT-1']);
    ['ROOT-1', 'MODX-0001'].forEach(function (sn) { var x = u(sn); x.at = 'ready'; x.test = { result: 'pass' }; db.seed('plant_units/' + ORG + '__' + sn, x); });
    /* and a void record written before this fix, still filed under the cabinet: the pickup check skips it too */
    db.seed('plant_units/' + ORG + '__MODX-OLD', unit('MODX-OLD', { shipUnit: false, unitType: 'module', sku: 'MOD', parentSerial: 'ROOT-1', rootSerial: 'ROOT-1', inventoryStatus: 'void', woId: null, orderId: null, at: '' }));
    var WF = require('../api/_lib/logic-workflow'), real = WF.processOrder, logistics = require('../api/logic-logistics');
    WF.processOrder = async function () { return { ok: true }; };   /* the QuickBooks reconcile before a pickup: not what is under test */
    try {
      await later(function () { return logistics({ method: 'POST', body: { org: ORG, action: 'plan', orderId: 'ord1', revision: 0, legId: 'load1', destinationId: 'a', serials: ['ROOT-1'], carrier: 'Example broker', tracking: 'TEST', evidence: 'Test booking reference' }, caller: ADMIN }, res); });
      var picked = await later(function () { return logistics({ method: 'POST', body: { org: ORG, action: 'pickup', orderId: 'ord1', revision: 1, legId: 'load1', evidence: 'Pickup signed TEST', location: 'Factory' }, caller: ADMIN }, res); });
      assert.equal(picked.ok, true, 'the cabinet is picked up');
    } finally { WF.processOrder = real; }
    assert.equal(u('MODX-TYPO').orderId, null); assert.equal(u('MODX-TYPO').inventoryStatus, 'void');
  });
  await test('  voided, not replaced: assigning the finished stock cabinet moves only its live components; the void stays void', async function () {
    seed();
    await office({ method: 'POST', body: { org: ORG, action: 'stock', requestId: 'st1', units: [{ serial: 'STK-1', sku: 'CAB', unitType: 'cabinet', shipUnit: true }, { serial: 'MODY-TYPO', sku: 'MOD', unitType: 'module', parentSerial: 'STK-1' }] }, caller: ADMIN });
    await office({ method: 'POST', body: { org: ORG, action: 'correct-serial', serial: 'MODY-TYPO', reason: 'label was a duplicate', requestId: 'v1' }, caller: ADMIN });
    assert.equal(u('MODY-TYPO').rootSerial, 'MODY-TYPO'); assert.equal(u('MODY-TYPO').parentSerial, null);
    var x = u('STK-1'); x.at = 'ready'; x.test = { result: 'pass' }; x.inventoryStatus = 'available'; db.seed('plant_units/' + ORG + '__STK-1', x);
    db.seed('orders/ord2', { orgId: ORG, orderNo: 'CC-2', status: 'in_fulfilment', worksOrderId: 'wo_2', items: [{ sku: 'CAB', qty: 1 }], logic: {} });
    db.seed('plant_works_orders/wo_2', { orgId: ORG, orderId: 'ord2', orderNo: 'CC-2', status: 'awaiting_serials', requirements: [{ sku: 'CAB', qty: 1 }], registeredCounts: {}, releasedUnits: 0, shippingUnitCount: 0 });
    var r = await office({ method: 'POST', body: { org: ORG, action: 'allocate', serial: 'STK-1', orderId: 'ord2' }, caller: ADMIN });
    assert.equal(r.ok, true); assert.equal(u('STK-1').orderId, 'ord2');
    var v = u('MODY-TYPO'); assert.equal(v.inventoryStatus, 'void', 'not un-voided'); assert.equal(v.orderId, null, 'not assigned to the order'); assert.equal(v.woId, null);
    /* a void record written before this fix still carries the cabinet as its root: the reader skips it too */
    db.seed('plant_units/' + ORG + '__OLD-VOID', unit('OLD-VOID', { shipUnit: false, unitType: 'module', parentSerial: 'STK-2', rootSerial: 'STK-2', inventoryStatus: 'void', woId: null, at: '' }));
    db.seed('plant_units/' + ORG + '__STK-2', unit('STK-2', { at: 'ready', test: { result: 'pass' }, inventoryStatus: 'available', woId: 'stock_x' }));
    db.seed('plant_works_orders/wo_2', Object.assign(db.data.get('plant_works_orders/wo_2'), { requirements: [{ sku: 'CAB', qty: 1 }], registeredCounts: {} }));
    assert.equal((await office({ method: 'POST', body: { org: ORG, action: 'allocate', serial: 'STK-2', orderId: 'ord2' }, caller: ADMIN })).ok, true);
    assert.equal(u('OLD-VOID').orderId, null); assert.equal(u('OLD-VOID').inventoryStatus, 'void');
  });
  console.log('\n  ' + pass + ' passed, 0 failed\n');
})().catch(function (e) { console.error('  FAIL ', e && e.stack || e); process.exit(1); });
